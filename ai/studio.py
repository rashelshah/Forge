"""Product Studio: an autonomous product team (LangGraph) that turns a startup idea into a reviewed, refined prototype.

    strategist -> ux_architect -> design_researcher -> product_designer -> mvp_architect -> frontend_architect -> ui_engineer
      -> screenshots -> vision_reviewer -> design_critic -> failure_agent -> scoring --(all >= 9 or out of iterations)--> finish
                                ^                                                   |
                                +------------------------- refinement <-------------+

Every step is written to Supabase as it happens (studio_events / studio_artifacts), so the UI can follow along.
"""
import json
import os
import re
import time
import uuid
from contextlib import contextmanager
from typing import Literal, TypedDict

import httpx
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

import core
import design_intel
import studio_kit as kit

SHOT_BUCKET = "studio-screenshots"
MEMORY = "studio_memory"
DIMS = ["modernity", "professionalism", "accessibility", "visual_hierarchy", "mobile_ux", "trustworthiness", "conversion_readiness"]
TARGET = 9
MAX_REPAIRS = 2  # extra versions allowed when a version doesn't render at all (they don't use up review rounds)


class StudioError(Exception):
    """A failure with a message that is safe to show the user."""


# ---------------------------------------------------------------- schemas (every agent explains its reasoning first)

def _why():
    return Field(description="Your thinking, shown to the founder: the key decisions you made, what you rejected and why "
                             "(4-7 specific sentences about THIS product, no filler)")


class Persona(BaseModel):
    name: str
    description: str
    goals: list[str]
    frustrations: list[str]


class Job(BaseModel):
    job: str = Field(description="'When <situation>, I want to <motivation>, so I can <outcome>'")
    frequency: str


class Feature(BaseModel):
    name: str
    description: str
    priority: Literal["must", "should", "could"]


class ProductSpec(BaseModel):
    reasoning: str = _why()
    product_name: str
    tagline: str
    product_category: str = Field(description="Specific category, e.g. 'CRM for solo consultants', not 'SaaS platform'")
    target_audience: str
    personas: list[Persona] = Field(description="1-3 personas")
    core_pain_point: str
    value_proposition: str
    jobs_to_be_done: list[Job]
    alternatives: list[str] = Field(description="How the audience solves this today and why that falls short")
    differentiators: list[str]
    core_loop: str = Field(description="The repeated action that delivers value, and the 'aha' moment")
    features: list[Feature] = Field(description="At most 10; at most 5 'must'")
    success_metrics: list[str]
    non_goals: list[str]
    tone_of_voice: str


class NavItem(BaseModel):
    label: str
    route: str
    icon: str = Field(description="A lucide icon name in PascalCase, e.g. 'Users', 'Inbox', 'BarChart3'")


class Navigation(BaseModel):
    pattern: str = Field(description="e.g. 'Collapsible left sidebar with workspace switcher'")
    items: list[NavItem]
    mobile_behavior: str


class Flow(BaseModel):
    name: str
    goal: str
    steps: list[str]


class ScreenDef(BaseModel):
    route: str = Field(description="Hash route such as '/pipeline'. The FIRST screen uses '/'")
    name: str
    purpose: str
    layout: str
    sections: list[str] = Field(description="Sections top to bottom, named in the product's own language")
    key_components: list[str]
    primary_cta: str
    empty_state: str
    loading_state: str
    error_state: str


class UXBlueprint(BaseModel):
    reasoning: str = _why()
    information_architecture: list[str] = Field(description="Outline lines such as 'Workspace > Pipeline > Deal detail'")
    navigation: Navigation
    user_flows: list[Flow]
    screens: list[ScreenDef] = Field(description="5-7 screens. Screen 1 is what a user sees first.")
    first_run_experience: str
    empty_states_principle: str
    loading_states_principle: str
    error_states_principle: str


class RefUse(BaseModel):
    name: str
    url: str = ""
    why_relevant: str
    borrow: list[str] = Field(description="Specific patterns to borrow, e.g. 'three-column feature grid with one outcome headline per card'")


class DesignResearch(BaseModel):
    reasoning: str = _why()
    references: list[RefUse]
    landing_patterns: list[str]
    dashboard_patterns: list[str]
    onboarding_patterns: list[str]
    component_patterns: list[str]
    patterns_to_avoid: list[str]
    recommendations: list[str]
    learned_from_past_projects: list[str] = []


class Palette(BaseModel):
    background: str
    foreground: str
    card: str
    primary: str
    primary_foreground: str
    secondary: str
    muted: str
    muted_foreground: str
    accent: str
    border: str
    destructive: str
    success: str
    warning: str


class DesignSpec(BaseModel):
    reasoning: str = _why()
    personality: list[str] = Field(description="3-5 adjectives")
    inspiration: str = Field(description="Which reference products inform the look and exactly what is borrowed")
    mode: Literal["light", "dark"]
    heading_font: str = Field(description="A real Google Fonts family")
    body_font: str = Field(description="A real Google Fonts family")
    mono_font: str = "JetBrains Mono"
    type_scale: list[str]
    typography_rules: list[str]
    palette: Palette = Field(description="6-digit hex colours WITH a leading '#', e.g. #1a2b3c")
    color_rules: list[str]
    radius: str = Field(description="CSS length such as '8px'")
    density: str
    component_strategy: list[str]
    motion_strategy: list[str]
    layout_strategy: list[str]
    signature_details: list[str] = Field(description="2-4 distinctive touches that make this product not look like a template")


class Column(BaseModel):
    name: str
    type: str
    notes: str = ""


class Table(BaseModel):
    name: str
    purpose: str
    columns: list[Column]


class Endpoint(BaseModel):
    method: str
    path: str
    purpose: str
    auth: str


class Permission(BaseModel):
    role: str
    can: list[str]
    cannot: list[str]


class Sample(BaseModel):
    entity: str
    rows: list[str] = Field(description="6-10 realistic records, each one line of 'field: value; field: value'")


class TechnicalSpec(BaseModel):
    reasoning: str = _why()
    features: list[Feature]
    database_tables: list[Table]
    api_endpoints: list[Endpoint]
    permissions: list[Permission]
    authentication: str
    authentication_flows: list[str]
    sample_data: list[Sample] = Field(description="Domain-specific seed records for the prototype")
    technical_risks: list[str]


class RouteDef(BaseModel):
    route: str
    screen: str
    component: str
    layout: str


class CompNode(BaseModel):
    name: str
    purpose: str
    children: list[str]


class Store(BaseModel):
    name: str
    holds: str
    persistence: str


class FrontendArchitecture(BaseModel):
    reasoning: str = _why()
    routes: list[RouteDef]
    layout_hierarchy: list[str] = Field(description="Indented outline of the app shell, e.g. 'AppShell > Sidebar > NavItem'")
    component_tree: list[CompNode]
    state_management: str
    stores: list[Store]
    data_flow: str
    responsive_strategy: str
    accessibility_plan: list[str]
    file_structure: list[str]


class Scores(BaseModel):
    modernity: int = Field(ge=0, le=10)
    professionalism: int = Field(ge=0, le=10)
    accessibility: int = Field(ge=0, le=10)
    visual_hierarchy: int = Field(ge=0, le=10)
    mobile_ux: int = Field(ge=0, le=10)
    trustworthiness: int = Field(ge=0, le=10)
    conversion_readiness: int = Field(ge=0, le=10)


class Issue(BaseModel):
    severity: Literal["high", "medium", "low"]
    where: str = Field(description="The screen and element, e.g. '/pipeline: deal card header'")
    problem: str
    fix: str = Field(description="A concrete change to the code or design")


class Evaluation(BaseModel):
    aspect: str
    rating: int = Field(ge=0, le=10)
    notes: str


class ReviewReport(BaseModel):
    reasoning: str = _why()
    scores: Scores
    evaluations: list[Evaluation] = Field(description="One per aspect: visual hierarchy, information density, readability, mobile experience, CTA visibility, trustworthiness, professional appearance")
    issues: list[Issue]
    summary: str


class DesignFeedback(BaseModel):
    reasoning: str = _why()
    scores: Scores
    strengths: list[str]
    critique: list[Issue] = Field(description="Across layout quality, component quality, typography, colour usage, SaaS quality and modernity")
    verdict: str


class Objection(BaseModel):
    question: str
    why_it_fails: str
    likelihood: Literal["high", "medium", "low"]
    fix: str


class FailureReport(BaseModel):
    reasoning: str = _why()
    objections: list[Objection] = Field(description="Exactly five: users won't use it, onboarding fails, retention fails, conversion fails, trust is low")
    biggest_risk: str


class Patch(BaseModel):
    find: str = Field(description="Exact snippet copied character-for-character from the current code; must occur exactly once")
    replace: str


class TokenChange(BaseModel):
    name: str = Field(description="A palette token (e.g. 'primary', 'muted_foreground'), or 'heading_font', 'body_font', 'radius'")
    value: str


class Refinement(BaseModel):
    reasoning: str = _why()
    focus: list[str] = Field(description="The weak sections being improved")
    patches: list[Patch] = Field(description="Edits to the existing code. Replace whole JSX elements or functions, never fragments.")
    token_changes: list[TokenChange] = []
    summary: str = Field(description="One plain sentence describing what changed")


# ---------------------------------------------------------------- Supabase + run context

def _db(method: str, path: str, **kw):
    for attempt in range(3):  # transient Supabase 5xx / network blips must not kill a 10-minute run
        try:
            return core._rest(method, path, **kw)
        except (RuntimeError, httpx.TransportError) as e:
            if attempt == 2 or (isinstance(e, RuntimeError) and not re.search(r" 5\d\d ", str(e))):
                raise
            time.sleep(2 ** attempt)


class Run:
    """Persists everything a run does: its status row, the agent activity timeline and the artifacts each agent produces."""

    def __init__(self, project: dict, tables: tuple[str, str, str, str] = ("studio_projects", "studio_events", "studio_artifacts", "project_id")):
        self.project, self.id, self.iteration = project, project["id"], 0
        self.t_run, self.t_events, self.t_artifacts, self.fk = tables

    def patch(self, **fields):
        _db("PATCH", f"{self.t_run}?id=eq.{self.id}", json={**fields, "updated_at": _now()})

    def save(self, kind: str, content: dict, iteration: int | None = None):
        _db("POST", self.t_artifacts, json={self.fk: self.id, "kind": kind, "iteration": self.iteration if iteration is None else iteration, "content": content})

    def load(self, kind: str) -> dict | None:
        """The latest saved artifact of this kind (lets a failed run resume instead of redoing finished agents)."""
        rows = _db("GET", f"{self.t_artifacts}?{self.fk}=eq.{self.id}&kind=eq.{kind}&select=content&order=created_at.desc&limit=1")
        return rows[0]["content"] if rows else None

    @contextmanager
    def step(self, agent: str):
        ev = _db("POST", self.t_events, prefer="return=representation", json={self.fk: self.id, "agent": agent, "iteration": self.iteration})[0]
        self.patch(stage=agent)
        box: dict = {}
        try:
            yield box
        except Exception as e:
            _db("PATCH", f"{self.t_events}?id=eq.{ev['id']}", json={"status": "failed", "detail": str(e)[:600], "updated_at": _now()})
            raise
        _db("PATCH", f"{self.t_events}?id=eq.{ev['id']}", json={"status": "done", "summary": (box.get("summary") or "")[:400],
                                                                "detail": box.get("detail"), "updated_at": _now()})


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ---------------------------------------------------------------- LLM helpers

def _compact(d) -> str:
    """JSON for prompts, without the agents' own reasoning (saves tokens)."""
    def strip(x):
        if isinstance(x, dict):
            return {k: strip(v) for k, v in x.items() if k != "reasoning"}
        return [strip(i) for i in x] if isinstance(x, list) else x
    return json.dumps(strip(d), separators=(",", ":"), ensure_ascii=False)


def _retry(fn):
    """Free-tier models hit per-minute limits mid-run; wait and retry instead of losing the whole project."""
    for attempt in range(4):
        try:
            return fn()
        except core.LLMError as e:
            if attempt == 3 or not re.search(r"429|rate|quota|exhausted|overloaded|503", str(e), re.I):
                raise
            time.sleep(20 * (attempt + 1))


def ask(schema, system: str, user: str, images: list[dict] | None = None, max_tokens: int = 7000, temperature: float = 0.5):
    if not core.OPENAI:
        raise StudioError("Product Studio needs an LLM: set GEMINI_API_KEY (recommended) or GROQ_API_KEY")
    images = images if core.VISION else None  # text-only chain when no vision model is configured
    content = [{"type": "text", "text": user}, *images] if images else user
    models = core.VISION if images else list(dict.fromkeys(core.VISION + core.HEAVY + core.FAST))
    return _retry(lambda: core.structured(schema, system, content, temperature=temperature, max_tokens=max_tokens, models=models))


def _jpeg(data: bytes) -> dict:
    return design_intel._image(data)


# ---------------------------------------------------------------- long-term memory (Qdrant)

def _memory():
    from qdrant_client import models

    client = design_intel.qdrant()
    if not client.collection_exists(MEMORY):
        client.create_collection(MEMORY, vectors_config=models.VectorParams(size=len(core.embed(["x"])[0]), distance=models.Distance.COSINE))
        if os.getenv("QDRANT_URL"):
            client.create_payload_index(MEMORY, "user_id", models.PayloadSchemaType.KEYWORD)
    return client, models


def recall_past(user_id: str, query: str, k: int = 3) -> list[str]:
    """What worked in this user's earlier, well-scoring projects."""
    try:
        client, m = _memory()
        hits = client.query_points(MEMORY, query=core.embed_query(query), limit=k, with_payload=True, query_filter=m.Filter(must=[
            m.FieldCondition(key="user_id", match=m.MatchValue(value=user_id)), m.FieldCondition(key="average", range=m.Range(gte=7))])).points
        return [h.payload["text"] for h in hits]
    except Exception as e:  # memory is an aid, never a blocker
        print("studio memory recall failed:", e)
        return []


def remember_project(run: Run, s: dict, best: dict):
    p, ps, ds = run.project, s["product_spec"], s["design_spec"]
    praised = "; ".join(s.get("strengths", [])[:3])
    fixes = "; ".join(r["summary"] for r in s.get("refinements", [])[-3:])
    text = (f"{ps['product_name']} — {ps['product_category']} for {ps['target_audience']}. Value: {ps['value_proposition']}. "
            f"Design: {', '.join(ds['personality'])} ({ds['mode']} mode, {ds['heading_font']}/{ds['body_font']}), inspired by {ds['inspiration']}. "
            f"Signature details: {'; '.join(ds['signature_details'])}. Scored {best['average']}/10 on average. "
            f"Reviewers praised: {praised or 'n/a'}. Refinements that helped: {fixes or 'none needed'}.")
    try:
        client, m = _memory()
        client.upsert(MEMORY, points=[m.PointStruct(id=str(uuid.uuid5(uuid.NAMESPACE_URL, run.id)), vector=core.embed([text])[0], payload={
            "project_id": run.id, "user_id": p["user_id"], "name": ps["product_name"], "average": best["average"], "text": text})])
    except Exception as e:
        print("studio memory write failed:", e)


def forget(project_id: str):
    try:
        client, m = _memory()
        client.delete(MEMORY, points_selector=[str(uuid.uuid5(uuid.NAMESPACE_URL, project_id))])
    except Exception as e:
        print("studio memory delete failed:", e)
    if core.PGVECTOR:
        design_intel._clean_storage(project_id, bucket=SHOT_BUCKET)


# ---------------------------------------------------------------- agent prompts

STUDIO = ("You are part of Foundry's autonomous product team building a startup-quality SaaS prototype — the bar is products like Linear, "
          "Stripe, Notion, Ramp, Mercury, Vercel, Perplexity and Lovable. Everything you produce is specific to THIS product and its "
          "audience: no generic SaaS filler, no template thinking. Be concrete enough that the next specialist can act on your output without asking questions.")

STRATEGIST = (STUDIO + "\n\nROLE: Product Strategist. Turn the raw idea into a sharp product definition (a PRD): who exactly the primary user is, the painful "
              "moment they are in, the job they hire the product for, why today's alternatives fail them, and the smallest product that delivers a "
              "clear 'aha'. Honour the founder's requirements. Learn from the startup knowledge and past projects provided when relevant.")
UX_ARCHITECT = (STUDIO + "\n\nROLE: UX Architect. From the product spec design the information architecture, navigation, user flows and 5-7 screens. "
                "Screen 1 is what a user sees first and MUST be the core experience or a focused first-run/landing screen with one clear CTA into it — "
                "never a dashboard of generic stat cards (Users/Revenue/Growth) unless the product is analytics. Every screen defines its sections, key "
                "components, primary CTA and its empty, loading and error states in the product's own language. Routes are lowercase kebab-case like '/pipeline'. "
                "Navigation items must point at real screen routes and use valid lucide icon names.")
RESEARCHER = (STUDIO + "\n\nROLE: Design Researcher. You are given the product spec and real analyses of best-in-class SaaS products from the Foundry Design "
              "Intelligence knowledge base. Synthesize what to borrow — landing, dashboard, onboarding and component patterns — cite the reference products "
              "by name, say exactly what to take from each, and what to avoid. Only reference products that appear in the provided data.")
DESIGNER = (STUDIO + "\n\nROLE: Product Designer. Create a distinctive visual identity for this product from the UX blueprint and design research. Avoid the "
            "default 'indigo on white SaaS' look: choose light or dark mode for the audience, a palette with one purposeful accent, and type that has character. "
            "Fonts must be real Google Fonts families. Palette values are 6-digit hex; foreground must have strong contrast on background, muted_foreground "
            "at least 4.5:1, primary_foreground at least 4.5:1 on primary. Define the component, motion (subtle, purposeful), layout and density strategy and "
            "2-4 signature details that make it un-template-like.")
MVP = (STUDIO + "\n\nROLE: MVP Architect. Define the technical spec for the smallest shippable version: prioritized features, a relational database schema, the API, "
       "role permissions, authentication, and realistic domain-specific sample data for the prototype (real-sounding names, companies, amounts, dates, statuses).")
FE_ARCH = (STUDIO + "\n\nROLE: Frontend Architect. Define the React architecture that will implement the UX blueprint and design spec: hash routes (one per screen, same "
           "routes as the blueprint), the layout hierarchy, component tree, state management strategy, data flow, responsive and accessibility plan, and file structure. "
           "The prototype runtime is React 18 with hooks and context only, hash routing, Tailwind and a shadcn-style kit, with state persisted to localStorage: "
           "design the state strategy so it can be built exactly that way (no Redux/Zustand/React Query), and mention the production-grade equivalent only as a note.")

UI_SYSTEM = """You are a Senior Frontend Engineer at a top product studio (think Linear, Stripe, Vercel, Ramp, Mercury). You write the React application for ONE specific product from its UX blueprint and design spec. You are NOT filling in a dashboard template.

RUNTIME (already set up — do not write any of it): React 18 + Babel standalone in one HTML page, Tailwind CSS with the product's design tokens, Google fonts, lucide icons, and a shadcn-style component kit defined as globals. Use the kit; never redefine it.

Tailwind tokens (use these, never raw hex): bg-background text-foreground bg-card border-border bg-primary text-primary-foreground bg-secondary bg-muted text-muted-foreground bg-accent text-accent-foreground bg-destructive text-destructive bg-success text-success bg-warning text-warning. All accept opacity (bg-primary/10). Fonts: font-heading, font-sans, font-mono. Radius: rounded-md / rounded-lg.

KIT GLOBALS: React hooks (useState useEffect useRef useMemo useCallback useContext createContext Fragment), cn(...classes), Icon({name:'Plus', className}) (lucide icon by PascalCase name), Spinner, Button({variant: default|secondary|outline|ghost|destructive|link, size: default|sm|lg|icon, loading}), Card CardHeader CardTitle CardDescription CardContent, Badge({tone: default|muted|success|warning|destructive|outline}), Label, Input, Textarea, Select, Separator, Skeleton, Progress({value}), Avatar({name}), Switch({checked,onChange,label}), Tabs({value,onValueChange}) TabsList TabsTrigger({value}) TabsContent({value}), Dialog({open,onClose,title,description}), useToast() -> {toast('msg' | {title,description})}, EmptyState({icon,title,description,action}), ErrorState({title,description,onRetry}), useRoute() -> [route, navigate], Link({to}), useLocalState(key, initial) (persisted state), useLoading(ms) (true, then false — use it to show Skeletons on the first load of a screen).

WRITE plain JSX/JS (no imports, no exports, no TypeScript, no markdown fences) that defines `function App()` and everything it uses. Do NOT mount it — the page renders <App/> for you.

NON-NEGOTIABLE
1. Implement EVERY screen in the UX blueprint at its exact route using hash routing (useRoute). The route '/' is the FIRST screen. Each screen is built from its listed sections and key components and handles loading (Skeleton via useLoading), empty and error states as described.
2. Navigation exactly as the blueprint. On mobile the navigation collapses (bottom tab bar or drawer): the app must be fully usable at 390px wide. No horizontal page scroll.
3. The product feels real: use the technical spec's sample data, expanded to 8-15 realistic records per list in the product's own vocabulary. NEVER 'Item 1', 'Lorem ipsum', 'John Doe', or generic stat cards.
4. Everything rendered works: forms add records, filters filter, tabs switch, toggles toggle, dialogs open and close, actions give feedback through toasts. Persist state with useLocalState.
5. Apply the design spec precisely: personality, density, layout strategy, signature details, motion strategy (subtle — the `anim-in` class for entrances, transitions on hover/focus).
6. Accessibility: semantic landmarks (header/nav/main), one h1 per screen, labels for every input, aria-label on icon-only buttons, visible focus, touch targets of at least 40px on mobile.
7. Conversion and trust: every screen has one obvious primary action; new users get a clear next step; include trust cues that fit the product (privacy/security notes, credible social proof, transparent pricing, sync status).
8. Charts: hand-built inline SVG or div bars. No external libraries or images (use initials avatars, gradients, icons, SVG).
9. Compact but complete: small reusable components, roughly 600-1000 lines. Output ONLY the code."""

REFINE_SYSTEM = """You are a Senior Frontend Engineer refining an existing React prototype after design review. The code runs in a page that already provides Tailwind (with design tokens), a component kit (Button, Card, Dialog, Tabs, Skeleton, EmptyState, ErrorState, useRoute, useLocalState, Icon, ...) and mounts <App/>.
Fix the reported problems with the SMALLEST set of edits — never rewrite the app. Return find/replace patches: each `find` is copied character-for-character from the current code and occurs exactly once; replace WHOLE JSX elements or functions, never fragments of a statement, so the code stays syntactically valid. To add something, find a whole existing function or element and replace it with itself plus the addition. Everything you reference must exist. Use Tailwind token classes (bg-background, text-foreground, bg-primary, border-border, text-muted-foreground ...), never raw hex.
Priorities: (1) runtime errors first, (2) high-severity issues, (3) the lowest-scoring dimensions, (4) mobile UX, navigation, typography, CTA placement and trust. You may adjust the design tokens via token_changes (palette names, heading_font, body_font, radius) when colour or type is the problem."""

VISION_REVIEWER = ("You are an expert design reviewer evaluating screenshots of a generated SaaS prototype. Judge what you SEE, not what was intended. "
                   "Score each dimension 0-10 as a tough, honest evaluator: 9-10 means indistinguishable from Linear, Stripe or Ramp; typical good "
                   "AI-generated prototypes deserve 6-8; any score of 9+ must be justified by specific visible evidence. Evaluate visual hierarchy, information "
                   "density, readability, mobile experience, CTA visibility, trustworthiness and professional appearance. Issues must be specific (screen + "
                   "element) and each fix concrete enough to implement as a code change.")
CRITIC = ("You are a Staff Product Designer at a top-tier SaaS company giving a design critique of screenshots of a generated prototype. Review layout quality, "
          "component quality, typography, colour usage, SaaS quality and modernity. Be demanding and specific: 9-10 means you would ship it beside Linear "
          "or Stripe; generic template-looking output is 5-7. Score all seven dimensions 0-10. List what works, then concrete critiques with fixes.")
FAILURE = ("You are a skeptical founder reviewing a generated SaaS prototype and its product spec, hunting for why it will fail. Answer exactly five questions: "
           "Why would users not use this? Why would onboarding fail? Why would retention fail? Why would conversions fail? Why would trust be low? "
           "Ground each answer in what is visible or missing in the screenshots and spec, rate the likelihood, and give a fix that can be implemented in the UI.")


# ---------------------------------------------------------------- the graph

class State(TypedDict, total=False):
    user_id: str
    idea: str
    max_iterations: int
    product_spec: dict
    ux_blueprint: dict
    design_research_report: dict
    design_spec: dict
    technical_spec: dict
    frontend_architecture: dict
    app_code: str
    html: str
    iteration: int
    repairs: int
    shots: list
    errors: list
    rendered: bool
    review_report: dict
    design_feedback: dict
    failure_report: dict
    history: list
    refinements: list
    strengths: list
    stalled: bool


def intake(p: dict) -> str:
    return "\n".join(f"{k}: {v}" for k, v in [("STARTUP NAME", p["name"]), ("IDEA", p["idea"]), ("TARGET AUDIENCE", p.get("audience") or "(not given — infer it)"),
                                              ("INDUSTRY", p.get("industry") or "(not given — infer it)"), ("FOUNDER REQUIREMENTS", p.get("requirements") or "(none)")])


def _past_block(s: State, query: str) -> str:
    past = recall_past(s["user_id"], query)
    return "PAST PROJECTS THAT SCORED WELL (learn what worked, don't copy):\n" + "\n".join(f"- {t}" for t in past) if past else ""


def research_data(s: State) -> tuple[str, list[str]]:
    """Query the Design Intelligence RAG and assemble the evidence the researcher synthesizes."""
    ps = s["product_spec"]
    cat = ps["product_category"]
    queries = [f"{cat} landing page hero conversion for {ps['target_audience']}", f"{cat} dashboard layout information hierarchy",
               f"{cat} onboarding first run activation", f"{cat} component patterns navigation tables forms cards",
               f"{ps['product_name']} {ps['value_proposition']}"]
    found: dict[str, dict] = {}
    for q in queries:
        for h in design_intel.search(q, 4):
            e = found.setdefault(h["reference_id"], {"name": h["name"], "url": h["url"], "score": 0.0, "hits": 0})
            e["score"], e["hits"] = max(e["score"], h["score"]), e["hits"] + 1
    top = sorted(found.items(), key=lambda kv: (-kv[1]["hits"], -kv[1]["score"]))[:6]
    if not top:
        return "(The Design Intelligence knowledge base has no references yet — rely on general best practice and say so.)", []
    ids = ",".join(i for i, _ in top)
    rows = _db("GET", f"design_references?id=in.({ids})&select=id,name,url,industry,style,metadata_json&status=eq.done")
    blocks = []
    for r in rows:
        m = r["metadata_json"] or {}
        blocks.append({"name": r["name"], "url": r["url"], "industry": r["industry"], "style": r["style"],
                       "homepage_layout": (m.get("layout_patterns") or {}).get("homepage"), "navigation": (m.get("layout_patterns") or {}).get("navigation"),
                       "design_system": m.get("design_system"), "components": (m.get("components_used") or [])[:10],
                       "conversion": m.get("conversion_patterns"), "dashboard": m.get("dashboard_patterns"), "ux": m.get("ux_patterns"),
                       "reusable_patterns": (m.get("reusable_patterns") or [])[:5], "takeaways": (m.get("design_takeaways") or [])[:5],
                       "weaknesses": (m.get("weaknesses") or [])[:3]})
    return json.dumps(blocks, ensure_ascii=False, separators=(",", ":"))[:24000], [b["name"] for b in blocks]


def _strip_code(code: str) -> str:
    code = re.sub(r"^```[a-z]*\s*|\s*```\s*$", "", code.strip())
    code = re.sub(r"^\s*(import .*?;?|export default .*?;)\s*$", "", code, flags=re.M)
    code = re.sub(r"^\s*export\s+(default\s+)?", "", code, flags=re.M)
    code = re.sub(r"^\s*(const|let|var)\s*\{[^}]*\}\s*=\s*(React|window\.React);?\s*$", "", code, flags=re.M)  # hooks are kit globals; redeclaring them crashes
    return re.sub(r"^\s*ReactDOM\.(createRoot|render)\(.*$", "", code, flags=re.M).strip()


def _severity(i: dict) -> int:
    return {"high": 0, "medium": 1, "low": 2}[i["severity"]]


def _apply_patches(code: str, patches) -> tuple[str, int, list[str]]:
    """Apply find/replace patches. Models often copy `find` text with different indentation or line breaks, so when the exact text isn't
    found exactly once, fall back to a whitespace-insensitive match that must also be unique."""
    applied, missed = 0, []
    for p in patches:
        if not p.find.strip():
            continue
        if code.count(p.find) == 1:
            code, applied = code.replace(p.find, p.replace), applied + 1
            continue
        hits = list(re.finditer(r"\s+".join(re.escape(t) for t in p.find.split()), code))
        if len(hits) == 1:
            code, applied = code[:hits[0].start()] + p.replace + code[hits[0].end():], applied + 1
        else:
            missed.append(p.find[:80])
    return code, applied, missed


def build(run: Run):
    def agent(name, key, schema, system, user, summary, max_tokens=7000):
        def fn(s: State):
            with run.step(name) as box:
                out = ask(schema, system, user(s), max_tokens=max_tokens)
                d = out.model_dump()
                if key == "ux_blueprint" and d["screens"]:
                    d["screens"][0]["route"] = "/"  # the default route is always the first screen
                    for sc in d["screens"][1:]:
                        sc["route"] = "/" + sc["route"].strip("/ ") if sc["route"].strip("/ ") else "/screen"
                run.save(key, d, 0)
                box["summary"], box["detail"] = summary(out, d), out.reasoning
            return {key: d}
        return fn

    def ctx(s, *keys):
        return "\n\n".join(f"{k.upper()}:\n{_compact(s[k])}" for k in keys)

    def strategist_user(s):
        lib = core.search_knowledge(f"{s['idea']} customers problem positioning", s["user_id"], 4)
        return "\n\n".join(filter(None, [intake(run.project), "STARTUP KNOWLEDGE (Foundry library):\n" + core.context_block(lib, "Library"),
                                         _past_block(s, run.project["idea"])]))

    def researcher_user(s):
        data, _ = research_data(s)
        return "\n\n".join(filter(None, [ctx(s, "product_spec"), "DESIGN INTELLIGENCE REFERENCES (real analyses):\n" + data,
                                         _past_block(s, f"{s['product_spec']['product_category']} design")]))

    def ui_engineer(s: State):
        with run.step("UI Engineer") as box:
            ux, ds = s["ux_blueprint"], s["design_spec"]
            user = "\n\n".join([intake(run.project), ctx(s, "product_spec", "ux_blueprint", "design_spec", "frontend_architecture"),
                                "SAMPLE DATA:\n" + _compact(s["technical_spec"]["sample_data"]),
                                f"SCREEN ROUTES (build all, '/' is first): {', '.join(sc['route'] + ' ' + sc['name'] for sc in ux['screens'])}"])
            models = list(dict.fromkeys([m for m in core.CODE if m.startswith("gemini")] + core.VISION + core.HEAVY))
            code = ""
            for attempt in range(2):
                code = _strip_code(_retry(lambda: core.complete(UI_SYSTEM, user, temperature=0.5 - 0.2 * attempt, max_tokens=16000, models=models)))
                if re.search(r"(function|const)\s+App\b", code) and len(code) > 2500:
                    break
            else:
                raise StudioError("The UI Engineer returned an incomplete app. Please retry.")
            run.iteration = 1
            html = kit.assemble(ds, code, s["product_spec"]["product_name"])
            run.save("code", {"app_code": code, "html": html, "bytes": len(html), "summary": "First build from the UX blueprint and design spec"}, 1)
            run.patch(iteration=1)
            box["summary"] = f"Built {len(ux['screens'])} screens, {len(code.splitlines())} lines of React"
            box["detail"] = ("Composed every screen from the UX blueprint on top of the design tokens and the shadcn-style component kit; sample data from the "
                             "technical spec fills every list so the prototype reads as a real product.")
        return {"app_code": code, "html": html, "iteration": 1, "repairs": 0, "history": [], "refinements": [], "strengths": []}

    def screenshots(s: State):
        with run.step("Screenshot Agent") as box:
            run.iteration = s["iteration"]
            routes = [sc["route"] for sc in s["ux_blueprint"]["screens"]][:3]
            plan = [("desktop", r) for r in routes] + [("tablet", routes[0]), ("mobile", routes[0])] + ([("mobile", routes[1])] if len(routes) > 1 else [])
            ROLES = [f"desktop-{i + 1}" for i in range(len(routes))] + ["tablet-1", "mobile-1"] + (["mobile-2"] if len(routes) > 1 else [])
            res = kit.screenshot(s["html"], plan)
            urls = []
            for n, sh in enumerate(res["shots"]):
                sh["role"] = ROLES[n]
                urls.append({"device": sh["device"], "route": sh["route"], "role": sh["role"],
                             "url": design_intel._upload(run.id, f"v{s['iteration']}-{sh['role']}", sh["jpeg"], SHOT_BUCKET)})
            run.save("screenshots", {"shots": urls, "errors": res["errors"], "rendered": res["rendered"]})
            box["summary"] = f"Captured {len(urls)} screenshots (desktop, tablet, mobile)" + ("" if res["rendered"] else " — the app did not render")
            box["detail"] = ("Ran the app in Chromium. " + (f"Runtime errors: {'; '.join(res['errors'][:4])}" if res["errors"] else "No runtime errors."))
        return {"shots": res["shots"], "errors": res["errors"], "rendered": res["rendered"]}

    def images(s, which):
        pick = [sh for sh in s["shots"] if which is None or sh["role"] in which]
        caption = "\n".join(f"Image {n + 1}: {sh['device']} {sh['route']}" for n, sh in enumerate(pick))
        return caption, [_jpeg(sh["jpeg"]) for sh in pick]

    def reviewer(name, key, schema, system, which, summary, extra=None):
        def fn(s: State):
            with run.step(name) as box:
                caption, imgs = images(s, which)
                user = f"{intake(run.project)}\n\nUX blueprint screens:\n{_compact([{k: sc[k] for k in ('route', 'name', 'purpose', 'primary_cta')} for sc in s['ux_blueprint']['screens']])}\n\n" \
                       f"Design spec personality: {_compact(s['design_spec']['personality'])}\n\nScreenshots (version {s['iteration']}):\n{caption}" + (extra(s) if extra else "")
                out = ask(schema, system, user, images=imgs, max_tokens=5000, temperature=0.3)
                d = out.model_dump()
                run.save(key, d)
                box["summary"], box["detail"] = summary(out), out.reasoning
            return {key: d}
        return fn

    def scoring(s: State):
        with run.step("Quality Scorer") as box:
            rv, cr = s["review_report"]["scores"], s["design_feedback"]["scores"]
            final = {d: min(rv[d], cr[d]) for d in DIMS}  # conservative: the harsher reviewer wins
            avg = round(sum(final.values()) / len(DIMS), 1)
            entry = {"iteration": s["iteration"], "scores": final, "average": avg}
            run.save("scores", {"review": rv, "critic": cr, "final": final, "average": avg})
            run.patch(scores=final)
            weak = [d.replace("_", " ") for d, v in final.items() if v < TARGET]
            box["summary"] = f"Average {avg}/10" + (f" — below {TARGET}: {', '.join(weak)}" if weak else f" — every dimension ≥ {TARGET}")
            box["detail"] = "Final score per dimension = the lower of the Vision Reviewer's and Design Critic's scores. " + ", ".join(f"{d} {v}" for d, v in final.items())
        strengths = s["design_feedback"]["strengths"]
        return {"history": s["history"] + [entry], "strengths": strengths}

    def refinement(s: State):
        with run.step("Refinement Agent") as box:
            issues = []
            if s.get("rendered") and s.get("review_report"):
                issues = [{**i, "from": "vision reviewer"} for i in s["review_report"]["issues"]] + \
                         [{**i, "from": "design critic"} for i in s["design_feedback"]["critique"]] + \
                         [{"severity": o["likelihood"], "where": "product", "problem": o["why_it_fails"], "fix": o["fix"], "from": "failure agent"}
                          for o in s["failure_report"]["objections"]]
            issues = sorted(issues, key=_severity)[:16]
            last = s["history"][-1]["scores"] if s["history"] else {}
            low = {d: v for d, v in last.items() if v < TARGET}
            user = (f"PRODUCT: {run.project['name']}\nRUNTIME ERRORS (fix first):\n{chr(10).join(s.get('errors') or []) or 'none'}\n\n"
                    f"SCORES BELOW {TARGET}: {json.dumps(low)}\n\nISSUES (most severe first):\n{json.dumps(issues, ensure_ascii=False)}\n\n"
                    f"DESIGN TOKENS: {json.dumps(s['design_spec']['palette'])} heading_font={s['design_spec']['heading_font']} body_font={s['design_spec']['body_font']} radius={s['design_spec']['radius']}\n\n"
                    f"CURRENT CODE:\n{s['app_code']}")
            code, applied, out, missed = s["app_code"], 0, None, []
            for attempt in range(3):
                out = ask(Refinement, REFINE_SYSTEM, user + (f"\n\nYour previous patches did not apply (the `find` text was not found exactly once): {missed}. Copy the find text exactly." if missed else ""),
                          max_tokens=9000, temperature=0.2)
                code, applied, missed = _apply_patches(s["app_code"], out.patches)
                if applied:
                    break
            rebuilt = False
            if not applied and not s.get("rendered"):
                # A crashing app that can't be patched is worth a rewrite: better than losing the whole run.
                errors = "\n".join(s.get("errors") or [])
                models = list(dict.fromkeys([m for m in core.CODE if m.startswith("gemini")] + core.VISION + core.HEAVY))
                fixed = _strip_code(_retry(lambda: core.complete(
                    UI_SYSTEM, f"This app crashes in the browser with these runtime errors:\n{errors}\n\nReturn the COMPLETE corrected code, same screens and design, "
                               f"fixing these errors and any similar undefined-variable or missing-import mistakes.\n\nCODE:\n{s['app_code']}", temperature=0.2, max_tokens=16000, models=models)))
                if re.search(r"(function|const)\s+App\b", fixed) and len(fixed) > 2500:
                    code, applied, rebuilt = fixed, 1, True
                    out.summary, out.focus = "Rewrote the app to fix the runtime crash: " + out.summary, out.focus or ["Runtime error"]
            ds = json.loads(json.dumps(s["design_spec"]))
            for tc in out.token_changes:
                if tc.name in ds["palette"] and kit.norm_hex(tc.value):
                    ds["palette"][tc.name] = kit.norm_hex(tc.value)
                elif tc.name in ("heading_font", "body_font", "radius"):
                    ds[tc.name] = tc.value
            if not applied and not out.token_changes:
                box["summary"], box["detail"] = "Could not apply any edit cleanly — keeping the best version so far", out.reasoning
                return {"stalled": True}
            it = s["iteration"] + 1
            run.iteration = it
            html = kit.assemble(ds, code, s["product_spec"]["product_name"])
            rec = {"iteration": it, "summary": out.summary, "focus": out.focus, "patches_applied": applied, "patches_total": len(out.patches), "rebuilt": rebuilt,
                   "token_changes": [t.model_dump() for t in out.token_changes], "errors_fixed": s.get("errors") or []}
            run.save("refinement", rec, it)
            run.save("code", {"app_code": code, "html": html, "bytes": len(html), "summary": out.summary}, it)
            run.patch(iteration=it)
            box["summary"] = f"v{it}: {out.summary}" + (" (full rewrite)" if rebuilt else f" ({applied}/{len(out.patches)} edits applied)")
            box["detail"] = out.reasoning + "\n\nFocus: " + "; ".join(out.focus)
        return {"app_code": code, "html": html, "design_spec": ds, "iteration": it, "repairs": s["repairs"] + (0 if s.get("rendered") else 1),
                "refinements": s["refinements"] + [rec]}

    def finish(s: State):
        with run.step("Studio") as box:
            if not s["history"]:
                raise StudioError("The prototype never rendered in the browser. Errors: " + "; ".join((s.get("errors") or ["unknown"])[:3]))
            best = max(s["history"], key=lambda h: (h["average"], -h["iteration"]))
            all_ok = all(v >= TARGET for v in best["scores"].values())
            run.patch(status="done", stage="Done", best_iteration=best["iteration"], scores=best["scores"], error=None)
            remember_project(run, s, best)
            box["summary"] = f"Final prototype: version {best['iteration']} · average {best['average']}/10" + ("" if all_ok else f" (iteration limit reached before every score hit {TARGET})")
            box["detail"] = "Versions scored: " + ", ".join(f"v{h['iteration']} {h['average']}" for h in s["history"]) + ". Saved the project to long-term memory so future projects can learn from it."
        return {}

    g = StateGraph(State)
    nodes = {
        "strategist": agent("Product Strategist", "product_spec", ProductSpec, STRATEGIST, strategist_user,
                            lambda o, d: f"{o.product_name}: {o.value_proposition}"),
        "ux": agent("UX Architect", "ux_blueprint", UXBlueprint, UX_ARCHITECT, lambda s: f"{intake(run.project)}\n\n{ctx(s, 'product_spec')}",
                    lambda o, d: f"{len(d['screens'])} screens, {len(d['user_flows'])} flows — {o.navigation.pattern}", 9000),
        "researcher": agent("Design Researcher", "design_research_report", DesignResearch, RESEARCHER, researcher_user,
                            lambda o, d: "Referenced " + (", ".join(r["name"] for r in d["references"]) or "no references (knowledge base is empty)")),
        "designer": agent("Product Designer", "design_spec", DesignSpec, DESIGNER, lambda s: ctx(s, "product_spec", "ux_blueprint", "design_research_report"),
                          lambda o, d: f"{', '.join(d['personality'])} · {d['mode']} mode · {d['heading_font']} / {d['body_font']}"),
        "mvp": agent("MVP Architect", "technical_spec", TechnicalSpec, MVP, lambda s: ctx(s, "product_spec", "ux_blueprint"),
                     lambda o, d: f"{len(d['features'])} features, {len(d['database_tables'])} tables, {len(d['api_endpoints'])} endpoints", 9000),
        "frontend": agent("Frontend Architect", "frontend_architecture", FrontendArchitecture, FE_ARCH, lambda s: ctx(s, "ux_blueprint", "design_spec", "technical_spec"),
                          lambda o, d: f"{len(d['routes'])} routes, {len(d['component_tree'])} components — {d['state_management'][:90]}", 9000),
        "ui": ui_engineer,
        "screenshots": screenshots,
        "vision": reviewer("Vision Reviewer", "review_report", ReviewReport, VISION_REVIEWER, None,
                           lambda o: o.summary),
        "critic": reviewer("Design Critic", "design_feedback", DesignFeedback, CRITIC, {"desktop-1", "mobile-1", "desktop-2"},
                           lambda o: o.verdict),
        "failure": reviewer("Failure Agent", "failure_report", FailureReport, FAILURE, {"desktop-1", "mobile-1"},
                            lambda o: f"Biggest risk: {o.biggest_risk}", extra=lambda s: "\n\nProduct spec:\n" + _compact(s["product_spec"])),
        "scoring": scoring, "refine": refinement, "finish": finish,
    }
    for name, fn in nodes.items():
        g.add_node(name, fn)
    chain = ["strategist", "ux", "researcher", "designer", "mvp", "frontend", "ui", "screenshots"]
    g.add_edge(START, chain[0])
    for a, b in zip(chain, chain[1:]):
        g.add_edge(a, b)
    g.add_conditional_edges("screenshots", lambda s: "vision" if s["rendered"] else (
        "refine" if s["repairs"] < MAX_REPAIRS else "finish"))
    g.add_edge("vision", "critic")
    g.add_edge("critic", "failure")
    g.add_edge("failure", "scoring")
    g.add_conditional_edges("scoring", lambda s: "finish" if all(v >= TARGET for v in s["history"][-1]["scores"].values()) or len(s["history"]) >= s["max_iterations"] else "refine")
    g.add_conditional_edges("refine", lambda s: "finish" if s.get("stalled") else "screenshots")
    g.add_edge("finish", END)
    return g.compile()


def run_project(project_id: str) -> dict:
    rows = _db("GET", f"studio_projects?id=eq.{project_id}&select=*")
    if not rows:
        raise StudioError("Project not found")
    project = rows[0]
    run = Run(project)
    run.patch(status="running", stage="Starting", error=None, iteration=0, best_iteration=None)
    try:
        graph = build(run)
        s = graph.invoke({"user_id": project["user_id"], "idea": project["idea"], "max_iterations": project["max_iterations"], "history": [], "refinements": []},
                         config={"recursion_limit": 150})
    except Exception as e:
        run.patch(status="failed", error=str(e)[:500])
        raise
    best = max(s["history"], key=lambda h: (h["average"], -h["iteration"]))
    return {"best_iteration": best["iteration"], "average": best["average"]}


EDIT_SYSTEM = """You edit a single-file React prototype (Babel standalone + Tailwind with design tokens + a shadcn-style component kit, then the app code after the '/* ---------- generated app ---------- */' marker). Apply the requested change with the SMALLEST set of edits. Return find/replace patches: each `find` is copied character-for-character from the current file and occurs exactly once; replace WHOLE JSX elements or functions, never fragments of a statement, so the code stays valid. To add something, find a whole existing function or element and replace it with itself plus the addition. Everything you reference must exist (kit components: Button, Card, Badge, Input, Textarea, Select, Tabs, Dialog, Skeleton, EmptyState, ErrorState, useToast, useRoute, useLocalState, Icon ...). New data fields must also be added to the seed data. Use Tailwind token classes (bg-background, text-foreground, bg-primary, border-border ...), never raw hex. Colour tokens live in the :root block as space-separated RGB channels (e.g. --primary:236 138 68); change them there to re-theme. If the request is a runtime error, fix exactly that error. Leave token_changes empty."""


def edit_html(html: str, instruction: str, name: str) -> dict:
    """Apply a change request to a finished prototype as find/replace patches, then prove the edited app still renders."""
    if "type=\"text/babel\"" not in html:
        raise StudioError("This prototype wasn't built by the Product Studio, so it can't be edited this way.")
    user = f"Product: {name}\nRequest: {instruction}\n\nCURRENT FILE:\n{html}"
    out, new, missed = None, html, []
    for _ in range(3):
        out = ask(Refinement, EDIT_SYSTEM, user + (f"\n\nYour previous patches did not apply (find text not found exactly once): {missed}. Copy the find text exactly." if missed else ""),
                  max_tokens=9000, temperature=0.2)
        new, applied, missed = _apply_patches(html, out.patches)
        if applied:
            break
    else:
        raise StudioError("Couldn't apply that change cleanly. Try describing it more specifically.")
    check = kit.screenshot(new, [("desktop", "/")])
    if not check["rendered"]:
        raise StudioError("That change broke the prototype, so it was not applied: " + (check["errors"][0][:160] if check["errors"] else "the page rendered blank") + ". Try rephrasing it.")
    return {"html": new, "summary": out.summary, "applied": applied, "mode": "live"}

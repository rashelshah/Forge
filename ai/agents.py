"""Single-shot agents: discovery, validation, MVP architect, prototype builder, competitor intel, experiments, monitoring."""
import hashlib
import re
from typing import Literal

from pydantic import BaseModel, Field

import core
import demo

PLATFORMS = {
    "Reddit": ["reddit.com"],
    "Product Hunt": ["producthunt.com"],
    "Hacker News": ["news.ycombinator.com"],
    "G2": ["g2.com"],
    "App Store": ["apps.apple.com"],
}


def _platform(url: str) -> str:
    return next((p for p, ds in PLATFORMS.items() if any(d in url for d in ds)), "Web")


def _resolve(ids: list[str], web: list[dict], lib: list[dict]):
    out = []
    for sid in ids:
        m = re.fullmatch(r"\[?([SK])(\d+)\]?", sid.strip())
        if not m:
            continue
        pool, i = (web if m[1] == "S" else lib), int(m[2]) - 1
        if 0 <= i < len(pool):
            src = pool[i]
            out.append({"title": src["title"], "url": src.get("url"), "type": "web" if m[1] == "S" else "library"})
    return out


def venture_text(v: dict) -> str:
    return f"Venture: {v.get('name')}\nIdea: {v.get('idea')}\nStage: {v.get('stage', 'idea')}"


def lib_block(lib: list[dict]) -> str:
    return core.sources_block([{"title": d["title"], "url": d.get("url") or "Foundry library", "content": d["text"][:700]} for d in lib], "K")


def _norm(t: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", re.sub(r"\s+", " ", t.lower())).strip()


def _verbatim(quote: str, pool: list[dict]) -> bool:
    q = _norm(quote)
    return len(q) >= 12 and any(q in _norm(r["content"]) for r in pool)


GROUNDING = (
    "Rules: use only facts present in the provided sources or library; cite them by id. Never invent statistics, "
    "company names, quotes or URLs. If the evidence is thin, say so explicitly and lower your confidence."
)


# ---------------------------------------------------------------- Opportunity discovery

class Opportunity(BaseModel):
    title: str = Field(description="Short, specific opportunity name (max 8 words)")
    problem: str = Field(description="The underlying user problem in one or two sentences, grounded in the sources")
    frequency: str = Field(description="How often the problem occurs for the user, e.g. 'Weekly, every payroll run'")
    pain_level: int = Field(ge=1, le=10, description="1-10. 8+ only if sources show people paying, hacking workarounds or expressing strong frustration")
    potential_customers: str = Field(description="A specific segment, e.g. 'independent dental clinics in the US'")
    market_size: str = Field(description="Bottom-up estimate, e.g. '~$240M SAM'")
    market_size_reasoning: str = Field(description="Customers x price arithmetic with stated assumptions")
    source_ids: list[str] = Field(description="Ids like S1, S4 of sources that show this problem. Only provided ids.")
    quotes: list[str] = Field(description="Up to 3 short snippets copied character-for-character from the sources")


class DiscoveryOut(BaseModel):
    opportunities: list[Opportunity]


# Tavily is semantic search: natural-language queries beat boolean operators (which return off-topic threads).
PLATFORM_QUERIES = {
    "Reddit": "{t} biggest frustrations and problems",
    "Hacker News": "{t} software problems",
    "Product Hunt": "{t} tools",
    "G2": "{t} software reviews what users dislike",
    "App Store": "{t} app reviews problems",
}


def discover(seed: str | None, founder: dict):
    topic = seed or " ".join(founder.get("industries", [])) or "software for small businesses"
    web = []
    for platform, q in PLATFORM_QUERIES.items():
        web += core.web_search(q.format(t=topic), PLATFORMS[platform], k=4)
    web = core.dedupe(web)
    if not core.OPENAI:
        return {"opportunities": demo.discover(topic, web), "sources_scanned": len(web), "mode": "demo"}
    out = core.structured(
        DiscoveryOut,
        "You are Foundry's Opportunity Discovery Agent. Mine real user complaints for startup opportunities. "
        "Each opportunity must be a recurring, specific pain supported by at least one source; merge duplicates. "
        "Return 3-5 distinct opportunities ranked by pain x frequency x reachable customers. Use one consistent set of "
        "base assumptions (e.g. the same customer count) across opportunities and label estimates as assumptions. " + GROUNDING
        + " Describe problems and customers in plain words.",
        f"Theme: {topic}\nFounder profile: {founder or 'not provided'}\n\nSources:\n{core.sources_block(web)}",
    )
    opps = []
    for o in out.opportunities:
        d = o.model_dump()
        d["sources"] = [{**s, "platform": _platform(s["url"] or "")} for s in _resolve(d.pop("source_ids"), web, [])]
        d["quotes"] = [q for q in d["quotes"] if _verbatim(q, web)][:3]
        d["mentions"] = len(d["sources"])
        if web and not d["sources"]:
            continue  # ungrounded
        opps.append(d)
    return {"opportunities": opps, "sources_scanned": len(web), "mode": "live"}


# ---------------------------------------------------------------- Validation engine

class Evidence(BaseModel):
    claim: str = Field(description="A specific fact stated in the cited source (paraphrased), never text from these instructions")
    source_id: str = Field(description="S# for a web source or K# for a library document")


class Score(BaseModel):
    score: int = Field(ge=0, le=100)
    summary: str = Field(description="One or two sentences explaining the score")
    evidence: list[Evidence] = Field(description="2-4 pieces of evidence; each must cite a provided id")


class CompetitorFound(BaseModel):
    name: str
    url: str | None = Field(None, description="Homepage URL only if it appears in the sources")
    description: str


class ValidationOut(BaseModel):
    demand: Score
    competition: Score = Field(description="Higher = more whitespace / weaker incumbents")
    defensibility: Score
    revenue_potential: Score
    founder_fit: Score
    summary: str
    verdict: Literal["Promising", "Needs evidence", "Weak"]
    key_risks: list[str] = Field(description="3-5 specific risks")
    competitors: list[CompetitorFound] = Field(description="Real companies named in the sources that solve a similar problem")


WEIGHTS = {"demand": 0.3, "revenue_potential": 0.2, "defensibility": 0.2, "competition": 0.15, "founder_fit": 0.15}
RUBRIC = """Scoring rubric (higher is always better for the founder):
- demand: 80+ = sources show many people actively paying for or hacking around this; 60-79 = clear recurring complaints; 40-59 = plausible but thin evidence; <40 = little sign anyone cares.
- competition: 80+ = no credible incumbent; 60-79 = incumbents with clear gaps; 40-59 = crowded but differentiable; <40 = dominated by strong players.
- defensibility: moats available (network effects, proprietary data, switching costs, brand). AI-wrapper-only ideas score <45.
- revenue_potential: willingness to pay x market size x pricing evidence.
- founder_fit: overlap of founder skills/industries/experience with what this venture needs. If no founder profile is given, score 50 and say the profile is missing."""


def _url_ok(url: str | None) -> str | None:
    if not url or not re.match(r"https?://", url):
        return None
    try:
        r = core.httpx.head(url, timeout=6, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code >= 400:
            r = core.httpx.get(url, timeout=8, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
        return url if r.status_code < 400 else None
    except Exception:
        return None


def validate(venture: dict, founder: dict):
    idea = venture["idea"]
    web = core.dedupe(
        core.web_search(f"{idea} market size", k=3)
        + core.web_search(f"problems people have that {idea} would solve", ["reddit.com", "news.ycombinator.com"], k=3)
        + core.web_search(f"companies and startups offering {idea}", k=4)
        + core.web_search(f"how much do customers pay for {idea}", k=2)
    )
    lib = core.search_knowledge(f"how to evaluate demand, competition, moats and business model for: {idea}", k=4)
    mem = core.recall(venture["id"], idea, k=4)
    if not core.OPENAI:
        out = demo.validate(venture, founder, lib)
    else:
        res = core.structured(
            ValidationOut,
            "You are Foundry's Validation Engine, a rigorous startup analyst. Score the venture on five dimensions. "
            + RUBRIC + "\n" + GROUNDING + "\nSummaries and risks: " + core.PLAIN,
            f"{venture_text(venture)}\nFounder profile: {founder or 'not provided'}\n\nVenture memory:\n"
            f"{core.context_block(mem, 'Memory')}\n\nWeb sources:\n{core.sources_block(web)}\n\nLibrary:\n{lib_block(lib)}",
            temperature=0.2,
        )
        out = res.model_dump()
        for key in WEIGHTS:
            out[key]["evidence"] = [
                {"claim": e["claim"], **src}
                for e in out[key]["evidence"]
                for src in _resolve([e["source_id"]], web, lib)
            ]
            # A score the model couldn't back with any real source is capped: it's a hypothesis, not a finding.
            if not out[key]["evidence"] and key != "founder_fit" and out[key]["score"] > 55:
                out[key]["score"] = 55
                out[key]["summary"] += " (Capped at 55: no citable evidence.)"
        web_domains = {re.sub(r"^www\.", "", core.httpx.URL(w["url"]).host) for w in web}
        for c in out["competitors"]:
            host = re.sub(r"^www\.", "", core.httpx.URL(c["url"]).host) if c.get("url") and re.match(r"https?://", c["url"]) else None
            c["url"] = c["url"] if host and (host in web_domains or _url_ok(c["url"])) else None
            if not c["url"]:  # e.g. "BookScouter" -> bookscouter.com seen in the sources
                slug = re.sub(r"[^a-z0-9]", "", c["name"].lower().split("/")[0])
                c["url"] = next((f"https://{d}" for d in web_domains if slug and d.split(".")[0] == slug), None)
    out["overall"] = round(sum(out[k]["score"] * w for k, w in WEIGHTS.items()))
    out["mode"] = core.MODE
    out["web_sources"] = len(web)
    return out


# ---------------------------------------------------------------- MVP architect

class Feature(BaseModel):
    name: str
    description: str
    priority: Literal["must", "should", "could"]


class Story(BaseModel):
    as_a: str
    i_want: str
    so_that: str
    acceptance: list[str]


class Column(BaseModel):
    name: str
    type: str
    note: str = ""


class Table(BaseModel):
    table: str
    columns: list[Column]


class Api(BaseModel):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    path: str
    description: str


class Node(BaseModel):
    id: str
    label: str
    layer: Literal["client", "api", "service", "data", "external"]


class Edge(BaseModel):
    source: str
    target: str
    label: str = ""


class Architecture(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


class Sprint(BaseModel):
    sprint: int
    goal: str
    tasks: list[str]


class Role(BaseModel):
    role: str
    count: int
    why: str


class MvpProduct(BaseModel):
    summary: str = Field(description="What the MVP is and which riskiest assumption it tests")
    features: list[Feature] = Field(description="6-10 features, MoSCoW")
    user_stories: list[Story] = Field(description="5-7 stories, 2-3 acceptance criteria each")
    sprint_plan: list[Sprint] = Field(description="3-4 two-week sprints")
    team: list[Role]
    stack: list[str]
    monthly_cost_estimate: str


class MvpEngineering(BaseModel):
    database_schema: list[Table] = Field(description="4-8 snake_case tables with key columns")
    apis: list[Api] = Field(description="8-14 REST endpoints that operate on those tables")
    architecture: Architecture = Field(description="7-12 nodes across client/api/service/data/external; edges only between existing node ids")


def mvp(venture: dict, founder: dict):
    mem = core.recall(venture["id"], "boardroom decision assumptions features scope roadmap risks", k=6)
    if not core.OPENAI:
        return {**demo.mvp(venture), "mode": "demo"}
    ctx = f"{venture_text(venture)}\nFounder profile: {founder or 'not provided'}\n\nVenture memory:\n{core.context_block(mem, 'Memory')}"
    product = core.structured(
        MvpProduct,
        "You are Foundry's MVP Architect. Design the smallest product that tests the riskiest assumption, scoped for a "
        "6-8 week build by a lean team. Respect boardroom decisions, key risks and experiment results in memory; prefer a "
        "stack that matches the founder's skills. Keep descriptions short.",
        ctx, max_tokens=5000,
    )
    eng = core.structured(
        MvpEngineering,
        "You are Foundry's MVP Architect designing the engineering blueprint for this MVP. Table and column names are "
        "snake_case; API paths must operate on those tables; architecture edges reference existing node ids only.",
        f"{ctx}\n\nMVP scope:\n{product.summary}\nFeatures: " + "; ".join(f"{f.name} ({f.priority})" for f in product.features)
        + f"\nStack: {', '.join(product.stack)}",
        tier="fast", max_tokens=5000,
    )
    arch = eng.architecture.model_dump()
    ids = {n["id"] for n in arch["nodes"]}
    arch["edges"] = [e for e in arch["edges"] if e["source"] in ids and e["target"] in ids]
    return {**product.model_dump(), **eng.model_dump(), "architecture": arch, "mode": "live"}


# ---------------------------------------------------------------- Prototype builder (Lovable-style)

PROTO_SYSTEM = """You are Foundry's Prototype Builder, an expert product engineer and designer (like Lovable or v0).
Build a WORKING first prototype of the product described — the actual app its users would use, not a marketing page.

Output ONLY one complete HTML document, starting with <!doctype html> and ending with </html>. No explanations.

Stack: Tailwind via <script src="https://cdn.tailwindcss.com"></script> and vanilla JavaScript in a single <script>
at the end of <body>. No other external resources. No images from the internet: use emoji, initials, inline SVG icons
or CSS gradients for thumbnails and avatars.

Design: polished, modern product UI (Lovable / Linear quality). Follow this structure and style, adapting the accent
colour and content to the product:
- Use exactly this shell (fill in the ... parts):
  <body class="bg-slate-50 text-slate-800 antialiased">
    <div class="flex min-h-screen">
      <aside class="hidden md:flex w-64 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-4">logo row + nav links</aside>
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="md:hidden sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">product name +
          a horizontally scrollable row of the same nav links</header>
        <main id="view" class="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8"></main>
      </div>
    </div>
  </body>
- Logo row: a coloured rounded-lg square with initials + product name in font-semibold. Nav links:
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" (active: accent-50 bg,
  accent-700 text, font-medium), each with an inline SVG or emoji icon.
- Each screen starts with a page header (text-2xl font-semibold + text-slate-500 subtitle + primary action button on
  the right). The home screen shows stats plus a useful list of recent items — never leave a screen mostly empty.
- Stat cards: "rounded-xl border border-slate-200 bg-white p-5" with a small label and a text-3xl value.
- Record cards/grids: rounded-xl white cards with hover:shadow-md, badges "rounded-full px-2 py-0.5 text-xs font-medium".
- Buttons: primary "rounded-lg bg-<accent>-600 px-4 py-2 text-sm font-medium text-white hover:bg-<accent>-700";
  secondary "rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50".
- Inputs: "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-<accent>-500".
- Modal: fixed inset-0 bg-slate-900/40 overlay with a centred rounded-2xl white panel; toast bottom-right.

Functionality:
- 3-5 screens with hash routing (#/home, #/..) and working navigation that highlights the current screen.
- Realistic, domain-specific seed data (8-12 records). No lorem ipsum.
- The main user flow works end to end: create (modal form with validation), view details, edit, delete, search and
  filter. Show a summary/stats area on the home screen. Toast messages for feedback. Friendly empty states.
- Persist data in localStorage under one key, with try/catch around every storage call; seed on first load. When
  loading stored data, merge it over the defaults (e.g. db = { ...defaults, ...stored }) so newer fields and lists exist.
- Use a signed-in demo user; no login screens, no backend, no network calls.
- Never use alert/confirm/prompt. Every function and element you reference must exist. No console errors.
- Every field you display must exist on every seed record — the UI must never show "undefined", "NaN" or "null".
- Keep it compact: under 400 lines."""


class Patch(BaseModel):
    find: str = Field(description="An exact snippet copied character-for-character from the current file; must be unique in it")
    replace: str = Field(description="The replacement snippet")


class PatchSet(BaseModel):
    patches: list[Patch] = Field(description="The smallest set of edits that fully implements the request")
    summary: str = Field(description="One plain sentence describing what changed")


def _valid_html(html: str) -> bool:
    low = html.lower()
    return low.lstrip().startswith("<!doctype html") and "</html>" in low and "<script" in low


def _product_brief(venture: dict) -> str:
    mem = core.recall(venture["id"], "MVP features user stories core workflow target users", k=5)
    return f"{venture_text(venture)}\n\nWhat we know (research, boardroom, MVP plan):\n{core.context_block(mem, 'Memory')}"


def prototype(venture: dict):
    if not core.OPENAI:
        return {**demo.prototype(venture), "mode": "demo"}
    brief = _product_brief(venture)
    # Only gpt-oss models reliably finish a full file inside the free-tier token budget.
    models = [m for m in core.HEAVY + core.FAST if "gpt-oss" in m or not core.GROQ]
    html = ""
    for _ in range(2):
        html = core.complete(PROTO_SYSTEM, f"Build the first prototype of this product.\n\n{brief}", temperature=0.5, models=models)
        if _valid_html(html):
            break
    if not _valid_html(html):
        raise core.LLMError("The model returned an incomplete app. Please try again.")
    title = (re.search(r"<title>(.*?)</title>", html, re.I | re.S) or [None, venture.get("name")])[1].strip()
    return {"title": title, "html": html, "summary": f"First working prototype of {venture.get('name')}.", "mode": "live"}


def prototype_edit(venture: dict, html: str, instruction: str):
    """Apply a change request (or a runtime error to fix) as small find/replace patches — cheap on tokens."""
    if not core.OPENAI:
        return {"html": html, "summary": "Editing prototypes needs a live model (add GROQ_API_KEY).", "applied": 0, "mode": "demo"}
    res = core.structured(
        PatchSet,
        "You edit a single-file HTML prototype (Tailwind + vanilla JS). Return find/replace patches. Each `find` must be "
        "copied exactly from the current file and be unique. Always replace WHOLE units — an entire function, an entire "
        "object/array literal, or an entire HTML element — never a fragment of a statement, so the JavaScript stays "
        "syntactically valid. To add new code, find a whole existing function and replace it with itself plus the new "
        "code. Keep the app working: every function and element you reference must exist. If you add a new field or list to "
        "the data, also add it to the seed data and default it when loading stored data. No external resources.",
        f"Product: {venture.get('name')} — {venture.get('idea')}\n\nRequest: {instruction}\n\nCurrent file:\n{html}",
        temperature=0.2, max_tokens=4000,
    )
    out, applied = html, 0
    for p in res.patches:
        if p.find and out.count(p.find) == 1:
            out = out.replace(p.find, p.replace)
            applied += 1
    if not applied or not _valid_html(out):
        raise core.LLMError("Couldn't apply that change cleanly. Try rephrasing it more specifically.")
    return {"html": out, "summary": res.summary, "applied": applied, "mode": "live"}


# ---------------------------------------------------------------- Competitor intelligence

PRICE_RE = re.compile(r"(?:[$€£₹]\d[\d,]*(?:\.\d+)?)(?:\s?(?:/|per)\s?(?:mo|month|yr|year|user|seat))?", re.I)


class Signal(BaseModel):
    type: Literal["pricing", "feature", "funding", "acquisition", "product", "market", "sentiment", "opportunity"]
    relevance: int = Field(ge=1, le=5, description="5 = directly affects our customers, competitors or business model; 1 = tangential")
    actionable: bool = Field(description="True only if it should change the venture's product, pricing, positioning or go-to-market")
    title: str
    detail: str
    recommended_response: str
    severity: Literal["info", "low", "medium", "high"]
    source_url: str | None = None


class SignalsOut(BaseModel):
    signals: list[Signal]
    threat_level: Literal["low", "medium", "high"]
    description: str


def _grounded(out: dict, sources: list[dict], own_url: str | None = None) -> dict:
    """Drop source URLs the model didn't actually receive."""
    allowed = {r["url"] for r in sources} | ({own_url} if own_url else set())
    for sig in out["signals"]:
        if sig.get("source_url") not in allowed:
            sig["source_url"] = own_url if sig["type"] in ("pricing", "feature", "product") else None
    return out


def snapshot(url: str) -> dict:
    text = core.scrape(url)
    headings = [h.strip("# ").strip() for h in re.findall(r"^#+ .+$", text, re.M)][:40]
    return {
        "hash": hashlib.sha256(text.encode()).hexdigest(),
        "prices": sorted(set(PRICE_RE.findall(text)))[:20],
        "headings": headings,
        "excerpt": text[:3000],
    }


def scan_competitor(venture: dict, comp: dict):
    prev = comp.get("snapshot") or None
    snap, error = None, None
    if comp.get("url"):
        try:
            snap = snapshot(comp["url"])
        except Exception as e:
            error = str(e)[:200]
    news = core.web_search(f"{comp['name']} news: funding, product launches, acquisitions and pricing changes", k=4, topic="news", days=30)
    if core.OPENAI and not snap and not news:
        return {"snapshot": prev, "signals": demo.competitor_signals(comp, prev, None, error or "No website or news found"),
                "threat_level": comp.get("threat_level") or "medium", "description": comp.get("description"), "mode": "live"}
    if not core.OPENAI:
        signals = demo.competitor_signals(comp, prev, snap, error)
        return {"snapshot": snap or prev, "signals": signals, "threat_level": comp.get("threat_level") or "medium",
                "description": comp.get("description"), "mode": "demo"}
    out = core.structured(
        SignalsOut,
        "You are Foundry's Competitor Intelligence Agent. Compare the previous and current snapshot of a competitor "
        "and recent news. Report only meaningful changes (pricing, feature launches, funding, acquisitions, product "
        "updates). For each, recommend a concrete response for our venture. If this is the first snapshot, return one "
        "'product' signal summarising their positioning (severity info). Return an empty list if nothing changed. "
        "Threat level reflects how directly they compete with our venture. " + GROUNDING + " " + core.PLAIN,
        f"Our venture:\n{venture_text(venture)}\n\nCompetitor: {comp['name']} ({comp.get('url')})\n"
        f"Previous snapshot: {prev and {k: prev.get(k) for k in ('prices', 'headings')}}\n"
        f"Current snapshot: {snap and {k: snap[k] for k in ('prices', 'headings', 'excerpt')}}\n"
        f"Scrape error: {error}\n\nNews:\n{core.sources_block(news)}",
    )
    return {"snapshot": snap or prev, **_grounded(out.model_dump(), news, comp.get("url")), "mode": "live"}


# ---------------------------------------------------------------- Continuous monitoring (market-level)

def monitor_market(venture: dict):
    news = core.web_search(venture["idea"], k=5, topic="news", days=7)
    chatter = core.web_search(f"what people complain about with {venture['idea']}", ["reddit.com", "news.ycombinator.com"], k=4)
    if not core.OPENAI or not (news or chatter):
        return {"signals": [], "mode": core.MODE, "note": "Connect an LLM + Tavily for market, sentiment and opportunity monitoring."}
    out = core.structured(
        SignalsOut,
        "You are Foundry's Monitoring Agent. From this week's news and community chatter, extract at most 4 signals "
        "that matter to the venture: market shifts, user sentiment, new opportunities. Cite source_url from the sources. "
        "Only include items that directly affect the venture's target customers, competitors or business model; "
        "rate relevance honestly. Generic industry news, crime or policy stories are not signals. An empty list is a "
        "valid answer. " + GROUNDING + " " + core.PLAIN,
        f"{venture_text(venture)}\n\nNews:\n{core.sources_block(news)}\n\nCommunity:\n{core.sources_block(chatter, 'C')}",
    )
    signals = [s for s in _grounded(out.model_dump(), news + chatter)["signals"] if s["relevance"] >= 4 and s["actionable"]]
    return {"signals": signals, "mode": "live"}


# ---------------------------------------------------------------- Experiment analysis

class ExperimentOut(BaseModel):
    outcome: Literal["validated", "invalidated", "inconclusive"]
    summary: str
    insights: list[str]
    recommended_next: list[str]


def analyze_experiment(venture: dict, exp: dict, feedback: list[str]):
    m = exp.get("metrics") or {}
    conv = round(100 * m.get("signups", 0) / m["visitors"], 1) if m.get("visitors") else 0.0
    if not core.OPENAI:
        return {**demo.experiment(exp, conv, feedback), "conversion": conv, "mode": "demo"}
    out = core.structured(
        ExperimentOut,
        "You are Foundry's Experiment Analyst. Judge whether the hypothesis is supported. Under 100 visitors is "
        "inconclusive unless the effect is extreme. Pull themes only from the feedback given — never invent quotes. "
        "Recommend the next 2-3 experiments. " + core.PLAIN,
        f"{venture_text(venture)}\nExperiment: {exp['name']} ({exp.get('type')})\nHypothesis: {exp.get('hypothesis')}\n"
        f"Target conversion: {exp.get('target_conversion')}%\nMetrics: {m}, conversion {conv}%\n"
        + (f"IMPORTANT: only {m.get('visitors', 0)} visitors — the outcome MUST be 'inconclusive'; explain what sample is needed.\n"
           if m.get("visitors", 0) < 30 else "")
        +
        f"Feedback:\n" + "\n".join(f"- {f}" for f in feedback[:60]),
    )
    res = out.model_dump()
    if m.get("visitors", 0) < 30 and res["outcome"] != "inconclusive":
        # Statistical guard: tiny samples can't validate or invalidate anything.
        res["outcome"] = "inconclusive"
        res["summary"] = (f"Only {m.get('visitors', 0)} visitors so far — too few to conclude anything. Early conversion is "
                          f"{conv}% against a {exp.get('target_conversion')}% target; keep the page running until at least 100 visitors.")
    return {**res, "conversion": conv, "mode": "live"}


# ---------------------------------------------------------------- Knowledge Q&A

class Answer(BaseModel):
    answer: str
    cited: list[str] = Field(description="K# ids used")


def ask_library(question: str, owner: str | None):
    hits = core.search_knowledge(question, owner, k=6)
    if not core.OPENAI:
        return {"answer": None, "chunks": hits, "mode": "demo"}
    out = core.structured(
        Answer,
        "Answer the founder's question using only the library excerpts. Be concise and practical (under 180 words), "
        "cite K# ids inline after each claim (e.g. [K2]), quote numbers exactly as the excerpts state them, and say "
        "plainly if the library doesn't cover something. " + core.PLAIN,
        f"Question: {question}\n\nLibrary:\n{core.sources_block([{'title': h['title'], 'url': h.get('url') or 'library', 'content': h['text']} for h in hits], 'K')}",
    )
    return {"answer": out.answer, "chunks": hits, "cited": out.cited, "mode": "live"}

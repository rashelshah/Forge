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

PROTO_SYSTEM = r"""You are Foundry's Prototype Builder — the world's best UI engineer.
Generate a STUNNING, FULLY FUNCTIONAL prototype of the exact product described.
This runs in a browser iframe with React 18 + Babel standalone. Make it look like a real, shipped product.

═══════════════════════════════════════════════════════════════
OUTPUT: one complete HTML file starting with <!doctype html> ending with </html>. NOTHING ELSE.
═══════════════════════════════════════════════════════════════

━━━ REQUIRED BOILERPLATE (copy exactly, fill in the app) ━━━
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>APP_NAME</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=FONT_NAME:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>/* FULL CSS DESIGN SYSTEM GOES HERE */</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useRef, useCallback, useMemo } = React;
    /* ALL REACT COMPONENTS HERE */
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>

━━━ CSS DESIGN SYSTEM — write a complete <style> block ━━━
Create a full design system with CSS custom properties:

:root {
  --accent: #PICK_A_BEAUTIFUL_HEX;       /* brand accent: indigo/violet/emerald/orange/rose/sky */
  --accent-light: #LIGHTER_VARIANT;
  --accent-dark: #DARKER_VARIANT;
  --bg: #f8fafc;                         /* page background */
  --surface: #ffffff;                    /* card / panel background */
  --surface-2: #f1f5f9;                  /* secondary surface */
  --border: rgba(0,0,0,0.08);
  --text: #0f172a;
  --text-2: #64748b;
  --text-3: #94a3b8;
  --radius: 12px;
  --radius-lg: 20px;
  --shadow: 0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
  --font: 'FONT_NAME', system-ui, sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font); background: var(--bg); color: var(--text); min-height: 100vh; }

/* ANIMATIONS */
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes slideIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { to { background-position: 200% 0; } }

.fade-in { animation: fadeIn 0.25s ease both; }
.slide-in { animation: slideIn 0.2s ease both; }

/* GLASSMORPHISM HERO */
.glass {
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.5);
}

/* CARDS */
.card {
  background: var(--surface);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  transition: box-shadow 0.2s, transform 0.2s;
}
.card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); }

/* BUTTONS */
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 18px; border-radius: 8px; font-size: 14px; font-weight: 600;
  cursor: pointer; border: none; transition: all 0.15s; text-decoration: none;
}
.btn-primary {
  background: var(--accent); color: #fff;
}
.btn-primary:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 40%, transparent); }
.btn-ghost { background: transparent; color: var(--text-2); }
.btn-ghost:hover { background: var(--surface-2); color: var(--text); }
.btn-outline { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.btn-outline:hover { border-color: var(--accent); color: var(--accent); }

/* INPUTS */
input, select, textarea {
  font-family: var(--font); font-size: 14px; color: var(--text);
  background: var(--surface); border: 1.5px solid var(--border);
  border-radius: 8px; padding: 10px 14px; width: 100%;
  transition: border-color 0.15s, box-shadow 0.15s; outline: none;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

/* BADGES */
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;
}
.badge-green { background: #dcfce7; color: #16a34a; }
.badge-blue { background: #dbeafe; color: #2563eb; }
.badge-amber { background: #fef3c7; color: #d97706; }
.badge-red { background: #fee2e2; color: #dc2626; }
.badge-purple { background: #f3e8ff; color: #7c3aed; }
.badge-gray { background: var(--surface-2); color: var(--text-2); }

/* AVATAR */
.avatar {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-dark));
  flex-shrink: 0;
}

/* STAR RATING */
.stars { display: inline-flex; gap: 2px; }
.star { font-size: 14px; }
.star-filled { color: #f59e0b; }
.star-empty { color: #e2e8f0; }

/* SIDEBAR LAYOUT */
.layout-sidebar { display: flex; min-height: 100vh; }
.sidebar {
  width: 240px; flex-shrink: 0; background: var(--surface);
  border-right: 1px solid var(--border); display: flex; flex-direction: column;
  padding: 20px 12px; position: fixed; top: 0; left: 0; height: 100vh;
}
.main-content { margin-left: 240px; flex: 1; min-height: 100vh; }

/* TOP-NAV LAYOUT */
.topnav {
  position: sticky; top: 0; z-index: 50; height: 64px;
  background: rgba(255,255,255,0.9); backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; gap: 16px;
}

/* NAV ITEMS */
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  border-radius: 8px; font-size: 14px; font-weight: 500; color: var(--text-2);
  cursor: pointer; text-decoration: none; transition: all 0.15s; border: none;
  background: transparent; width: 100%; text-align: left;
}
.nav-item:hover { background: var(--surface-2); color: var(--text); }
.nav-item.active { background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--accent); font-weight: 600; }

/* MODAL */
.modal-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(15,23,42,0.5); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
  animation: fadeIn 0.15s ease;
}
.modal {
  background: var(--surface); border-radius: var(--radius-lg);
  box-shadow: 0 24px 80px rgba(0,0,0,0.2); padding: 28px;
  width: 100%; max-width: 520px; animation: scaleIn 0.2s ease;
}

/* DRAWER */
.drawer-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(15,23,42,0.5); backdrop-filter: blur(4px);
}
.drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 101;
  width: 440px; background: var(--surface);
  box-shadow: -8px 0 48px rgba(0,0,0,0.15); padding: 28px;
  overflow-y: auto; animation: slideIn 0.2s ease;
}

/* TOAST */
.toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 200; display: flex; flex-direction: column; gap: 8px; }
.toast {
  background: #1e293b; color: #fff; padding: 12px 18px; border-radius: 10px;
  font-size: 14px; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  animation: scaleIn 0.2s ease; display: flex; align-items: center; gap: 10px; min-width: 240px;
}
.toast-success { background: #16a34a; }
.toast-error { background: #dc2626; }

/* HERO SEARCH */
.hero-search {
  display: flex; align-items: center;
  background: var(--surface); border: 2px solid var(--border);
  border-radius: 999px; padding: 12px 20px; gap: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.hero-search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent), 0 4px 24px rgba(0,0,0,0.08);
}
.hero-search input { border: none; background: transparent; outline: none; font-size: 16px; flex: 1; padding: 0; width: 100%; }

/* PROGRESS */
.progress-bar { height: 6px; background: var(--surface-2); border-radius: 999px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-light)); border-radius: 999px; transition: width 0.4s ease; }

/* TABS */
.tabs { display: flex; gap: 4px; background: var(--surface-2); border-radius: 10px; padding: 4px; }
.tab { padding: 7px 16px; border-radius: 7px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; background: transparent; color: var(--text-2); transition: all 0.15s; }
.tab.active { background: var(--surface); color: var(--text); box-shadow: 0 1px 4px rgba(0,0,0,0.1); }

/* GRADIENT THUMBNAILS */
.thumbnail { border-radius: 10px; height: 140px; display: flex; align-items: center; justify-content: center; font-size: 40px; }
.grad-1 { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
.grad-2 { background: linear-gradient(135deg, #f59e0b, #ef4444); }
.grad-3 { background: linear-gradient(135deg, #10b981, #3b82f6); }
.grad-4 { background: linear-gradient(135deg, #f43f5e, #ec4899); }
.grad-5 { background: linear-gradient(135deg, #14b8a6, #6366f1); }
.grad-6 { background: linear-gradient(135deg, #f97316, #eab308); }

/* EMPTY STATE */
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 32px; text-align: center; color: var(--text-2);
}

/* GRID */
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
@media (max-width: 768px) {
  .grid-2,.grid-3,.grid-4 { grid-template-columns: 1fr; }
  .sidebar { display: none; }
  .main-content { margin-left: 0; }
  .drawer { width: 100%; }
}

/* STEP INDICATOR */
.steps { display: flex; align-items: center; gap: 0; margin-bottom: 28px; }
.step-item { flex: 1; display: flex; align-items: center; }
.step-circle { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.step-circle.done { background: var(--accent); color: #fff; }
.step-circle.active { background: var(--surface); color: var(--accent); border: 2px solid var(--accent); }
.step-circle.pending { background: var(--surface-2); color: var(--text-3); }
.step-line { flex: 1; height: 2px; background: var(--border); margin: 0 4px; }
.step-line.done { background: var(--accent); }

/* Add more specific styles as needed for the product */

━━━ REACT COMPONENTS — write inside <script type="text/babel"> ━━━

Structure your React app like this:

const COLORS = { accent: 'VAR_ACCENT', ... }; // mirror CSS vars for inline use

// ── Data Layer ─────────────────────────────────────────────────────
const SEED = { VERSION: 1, entities: [ ...12-16 realistic records... ] };
function useDB() {
  const [db, setDb] = React.useState(() => {
    try { const s = JSON.parse(localStorage.getItem('app_db') || '{}');
      return s.VERSION === SEED.VERSION ? { ...SEED, ...s } : SEED; }
    catch { return SEED; }
  });
  const save = React.useCallback(next => {
    setDb(next); try { localStorage.setItem('app_db', JSON.stringify(next)); } catch {}
  }, []);
  return [db, save];
}

// ── Toast System ───────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = React.useState([]);
  const show = React.useCallback((msg, type='success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);
  return { toasts, show };
}

// ── Shared Components ──────────────────────────────────────────────
function Avatar({ name, size=36 }) { ... }
function Badge({ children, color='gray' }) { ... }
function Stars({ value }) { ... }
function ProgressBar({ value, max=100 }) { ... }
function Tabs({ tabs, active, onChange }) { ... }
function SearchBar({ value, onChange, placeholder }) { ... }
function Modal({ open, onClose, title, children }) { if (!open) return null; return <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}><div className="modal">...</div></div>; }
function Drawer({ open, onClose, title, children }) { ... }
function ToastContainer({ toasts }) { ... }
function Steps({ steps, current }) { ... }

// ── Screen Components (one per route) ──────────────────────────────
function ScreenName({ db, save, showToast }) { ... }

// ── App Shell ──────────────────────────────────────────────────────
function App() {
  const [route, setRoute] = React.useState(window.location.hash || '#/screen1');
  const [db, save] = useDB();
  const { toasts, show: showToast } = useToast();

  React.useEffect(() => {
    const on = () => setRoute(window.location.hash || '#/screen1');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const navigate = r => { window.location.hash = r; setRoute(r); };

  // Render sidebar or topnav based on layout type
  // Render the correct screen based on route
  return (<div>...</div>);
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

━━━ ABSOLUTE RULES ━━━
1. EVERY COMPONENT MUST HAVE REAL INLINE CSS via className="" + the <style> block. NO bare HTML.
2. NEVER generic dashboard (stat cards for Active Users/Revenue) unless product IS analytics.
3. Screen 1 = the CORE USER FLOW (search+browse, live feed, booking calendar, kanban board, voice recorder, etc.)
4. All data is DOMAIN-SPECIFIC. "Item 1", "User A", "Lorem ipsum" = instant fail.
5. Toast instead of alert/confirm/prompt. All interactions work and update UI instantly.
6. Rich animations: fade-in class on page loads, card hover effects, button press states.
7. Minimum 4 screens, all fully implemented, realistic content filling every screen.
8. NO external images. Use gradient thumbnails (class="thumbnail grad-1"), emoji, initials avatars."""


class Screen(BaseModel):
    route: str = Field(description="Hash route like #/discover")
    name: str
    category: str = Field(description="One of: hero-search, feed, kanban, calendar, form-wizard, list-detail, player, map, inbox, settings")
    purpose: str = Field(description="What the primary user accomplishes on this screen in one sentence")
    components: list[str] = Field(description="5-8 specific UI elements on this screen named in the product's own language, not generic names")


class Entity(BaseModel):
    name: str
    fields: list[str] = Field(description="Field names with type hints, e.g. 'provider: string (Coursera/edX)', 'price: number (USD)', 'status: enum (pending/confirmed/cancelled)'")


class Brand(BaseModel):
    accent_hex: str = Field(description="A specific hex color that fits the product personality, e.g. #6366f1 for productivity, #f59e0b for marketplace, #10b981 for health")
    accent_name: str = Field(description="Tailwind color name, e.g. indigo, amber, emerald, violet, rose, sky, orange")
    font: str = Field(description="Google Font name that fits the brand, e.g. 'Inter', 'Plus Jakarta Sans', 'DM Sans', 'Outfit', 'Nunito'")
    vibe: str = Field(description="3-5 words: e.g. 'clean minimal professional', 'warm playful energetic', 'bold dark premium'")
    logo: str = Field(description="A single emoji that represents the product, e.g. home for real estate, books for e-learning, stethoscope for health")
    layout: str = Field(description="Either 'top-nav' (consumer/marketplace/social/booking) or 'sidebar' (B2B SaaS/productivity/CRM/workspace)")


class SeedRecord(BaseModel):
    entity: str = Field(description="Which entity this record belongs to")
    data: str = Field(description="All fields as key: value pairs in one line, with realistic domain-specific values")


class ProtoSpec(BaseModel):
    app_name: str
    tagline: str
    primary_user: str = Field(description="The end user who opens the app every day, e.g. 'field sales rep', 'independent yoga teacher', 'student'")
    core_job: str = Field(description="The #1 job-to-be-done: what the primary user needs to DO on screen 1, e.g. 'search and book a parking spot', 'record a voice note about a client visit'")
    brand: Brand
    screens: list[Screen] = Field(description="4-6 screens in user-journey order, starting with the core job. Screen 1 MUST be the primary user flow, not a dashboard.")
    entities: list[Entity] = Field(description="3-5 main data objects with typed fields")
    seed_records: list[SeedRecord] = Field(description="12-16 realistic records covering all entities, with domain-specific values (real-sounding names, places, prices, dates)")
    interactions: list[str] = Field(description="6-10 specific interactions that must work end-to-end, described as user actions, e.g. 'user searches by location -> cards filter live'")


def _spec_text(spec: ProtoSpec) -> str:
    screens = "\n".join(
        f"  [{i+1}] {sc.route} -- {sc.name} ({sc.category})\n"
        f"      Purpose: {sc.purpose}\n"
        f"      UI elements: {', '.join(sc.components)}"
        for i, sc in enumerate(spec.screens)
    )
    entities = "\n".join(
        f"  * {e.name}: {', '.join(e.fields)}" for e in spec.entities
    )
    seeds = "\n".join(f"  * [{r.entity}] {r.data}" for r in spec.seed_records)
    interactions = "\n".join(f"  - {x}" for x in spec.interactions)
    return (
        f"APP: {spec.app_name} -- {spec.tagline}\n"
        f"PRIMARY USER: {spec.primary_user}\n"
        f"CORE JOB (Screen 1): {spec.core_job}\n"
        f"LAYOUT: {spec.brand.layout}\n"
        f"BRAND: accent {spec.brand.accent_name} ({spec.brand.accent_hex}), font '{spec.brand.font}', "
        f"logo {spec.brand.logo}, feel: {spec.brand.vibe}\n\n"
        f"SCREENS (build them ALL -- Screen 1 is the core user flow):\n{screens}\n\n"
        f"DATA MODEL:\n{entities}\n\n"
        f"SEED DATA (use all of these -- expand with similar records to reach 12-16 per entity):\n{seeds}\n\n"
        f"INTERACTIONS (every one of these must work):\n{interactions}"
    )


class Patch(BaseModel):
    find: str = Field(description="An exact snippet copied character-for-character from the current file; must be unique in it")
    replace: str = Field(description="The replacement snippet")


class PatchSet(BaseModel):
    patches: list[Patch] = Field(description="The smallest set of edits that fully implements the request")
    summary: str = Field(description="One plain sentence describing what changed")


def _clean_html(html: str) -> str:
    h = html.strip()
    if h.startswith("```html"): h = h[7:]
    elif h.startswith("```"): h = h[3:]
    if h.endswith("```"): h = h[:-3]
    return h.strip()


def _valid_html(html: str) -> bool:
    low = html.lower()
    # Accept both vanilla JS and React/Babel prototypes
    has_script = "<script" in low and ("text/babel" in low or "</script>" in low)
    return low.startswith("<!doctype html") and "</html>" in low and has_script


def _product_brief(venture: dict) -> str:
    """Build a rich brief from venture context, including MVP plan if available."""
    mem = core.recall(venture["id"], "MVP features user stories core workflow target users validation demand", k=8)
    mem_block = core.context_block(mem, "Memory")

    # Pull structured MVP plan if passed in the venture dict
    mvp = venture.get("mvp_plan") or {}
    validation = venture.get("validation") or {}

    sections = [venture_text(venture)]

    if validation:
        demand = (validation.get("demand") or {})
        comp = (validation.get("competition") or {})
        sections.append(
            f"VALIDATION SCORES: demand {demand.get('score', '?')}/100, competition {comp.get('score', '?')}/100\n"
            f"Verdict: {validation.get('verdict', '')} -- {validation.get('summary', '')}\n"
            f"Key risks: {', '.join(validation.get('key_risks', []))}"
        )

    if mvp:
        must_features = [f["name"] + ": " + f["description"] for f in mvp.get("features", []) if f.get("priority") == "must"]
        should_features = [f["name"] for f in mvp.get("features", []) if f.get("priority") == "should"]
        stories = [f"As a {s['as_a']}, I want to {s['i_want']} so that {s['so_that']}" for s in (mvp.get("user_stories") or [])[:5]]
        stack = mvp.get("stack") or []
        sections.append(
            f"MVP PLAN SUMMARY: {mvp.get('summary', '')}\n"
            f"MUST-HAVE FEATURES:\n" + "\n".join(f"  * {f}" for f in must_features) + "\n"
            f"SHOULD-HAVE FEATURES: {', '.join(should_features)}\n"
            f"USER STORIES:\n" + "\n".join(f"  * {s}" for s in stories) + "\n"
            f"TECH STACK: {', '.join(stack)}"
        )

    sections.append(f"VENTURE MEMORY (research, decisions, experiments):\n{mem_block}")
    return "\n\n".join(sections)


def prototype_steps(venture: dict):
    """Build a prototype, yielding progress events: spec -> code -> done."""
    if not core.OPENAI:
        yield {"type": "done", "result": {**demo.prototype(venture), "mode": "demo"}}
        return

    brief = _product_brief(venture)
    yield {"type": "stage", "stage": "spec"}

    # Step 1: Design a product-specific spec -- who uses it, what they DO first, exact screens & data.
    spec = core.structured(
        ProtoSpec,
        "You are a senior product designer at a top-tier startup studio.\n"
        "Design the FIRST VERSION of this specific product.\n\n"
        "CRITICAL RULES:\n"
        "1. Screen 1 MUST be the core user experience (search, feed, booking flow, workspace, player) -- "
        "NEVER a dashboard with stat cards.\n"
        "2. Every screen must map to a specific user journey step, not a management view.\n"
        "3. Seed data must use real-sounding names, places, prices, and dates specific to the product's domain.\n"
        "4. Layout: use 'top-nav' for consumer/marketplace/social/booking apps; "
        "'sidebar' for B2B SaaS/CRM/productivity/workspace tools.\n"
        "5. core_job is what the primary user does in the first 30 seconds after opening the app.\n"
        "Base your design on the MVP features and user stories in the brief -- match the product's actual scope.",
        brief, temperature=0.7, tier="code", max_tokens=8000,
    )
    yield {"type": "stage", "stage": "code", "app_name": spec.app_name, "screens": [sc.name for sc in spec.screens]}

    # Step 2: Build the React app.
    def prompt(model: str) -> str:
        return (
            f"""Build this product as a single self-contained HTML file using React 18 + Babel standalone.

FOLLOW THE EXACT TECH STACK AND STRUCTURE IN THE SYSTEM PROMPT.
Do NOT use Tailwind CDN. Use the custom CSS design system described in the system prompt.

{_spec_text(spec)}

VENTURE CONTEXT (use to make copy, labels, and all data authentic):
{brief}

BUILD INSTRUCTIONS:
- Write a COMPLETE but COMPACT app (aim for 400-500 lines). Every screen must be implemented, but keep the code concise.
- The CSS <style> block must contain ALL the classes from the system prompt design system, adapted with the brand's accent color ({spec.brand.accent_hex}) and font ({spec.brand.font}).
- Screen 1 opens to: '{spec.screens[0].name}' — {spec.core_job}
  It is NOT a dashboard, NOT a login screen. It is the primary user flow.
- Include 6-8 realistic seed records (use the provided seed data, expand it).
- Every button, form, filter, and card click must work and update the UI.
- Use useDB() hook for data persistence. Use useToast() for feedback.
- Import nothing. React, ReactDOM are global. Babel compiles JSX in the browser.
"""
        )

    html = ""
    for attempt in range(2):
        raw = core.complete(PROTO_SYSTEM, prompt, temperature=0.4 if attempt > 0 else 0.5, models=core.CODE)
        html = _clean_html(raw)
        if _valid_html(html):
            break
    if not _valid_html(html):
        raise core.LLMError("The model returned an incomplete app. Please try again.")
    yield {"type": "done", "result": {
        "title": spec.app_name, "html": html,
        "summary": f"{spec.app_name} -- {spec.tagline}",
        "spec": spec.model_dump(), "mode": "live",
    }}


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

"""Deterministic offline generators used when no OpenAI key is configured.

They are templates, not intelligence: they keep every screen of the studio usable
for demos and development, and are clearly labelled mode="demo" end to end.
Evidence only ever cites real library documents or real search results.
"""
import hashlib
import random
import re


def _rng(*parts) -> random.Random:
    return random.Random(int(hashlib.md5("|".join(map(str, parts)).encode()).hexdigest()[:12], 16))


def split(idea: str):
    idea = idea.strip().rstrip(".")
    m = re.search(r"\b(?:for|to help)\s+(.+)$", idea, re.I)
    product = (idea[: m.start()] if m else idea).strip() or idea
    audience = m.group(1).strip() if m else "early adopters"
    if product[1:2].islower():
        product = product[0].lower() + product[1:]
    return product, audience


def _an(word: str) -> str:
    return ("an " if word[:1].lower() in "aeiou" else "a ") + word


def _is_marketplace(idea: str) -> bool:
    return bool(re.search(r"marketplace|platform connecting|two-sided|buy and sell|rent", idea, re.I))


# ---------------------------------------------------------------- discovery

def discover(topic: str, web: list[dict]):
    has_for = re.search(r"\b(?:for|to help)\s", topic, re.I)
    product, audience = split(topic) if has_for else ("the services they rely on", topic.strip())
    work = product if has_for else "their day-to-day work"
    r = _rng(topic)
    audience_cap = audience[0].upper() + audience[1:]
    templates = [
        (f"Fragmented workflows for {audience}",
         f"{audience_cap} stitch together spreadsheets, group chats and several tools to run {work}, losing hours each week and dropping details.",
         "Weekly"),
        ("Trust gap before committing",
         f"{audience_cap} can't verify quality or reliability before paying for {product}, so they default to word of mouth or avoid switching entirely.",
         "Every purchase"),
        ("Opaque, inconsistent pricing",
         f"Prices for {product} vary widely and are hard to compare; {audience} report overpaying and switching providers frequently.",
         "Monthly"),
        ("Discovery depends on luck",
         f"Good options for {product} exist but are scattered across forums and social feeds; {audience} rely on luck and outdated recommendations.",
         "Several times a month"),
    ]
    out = []
    for i, (title, problem, freq) in enumerate(templates):
        pain = r.randint(5, 9)
        customers = r.choice([40_000, 120_000, 350_000, 900_000, 2_400_000])
        acv = r.choice([60, 120, 240, 600])
        srcs = [{"title": w["title"], "url": w["url"], "type": "web", "platform": "Web"} for w in web[i::4]][:3]
        out.append({
            "title": title,
            "problem": problem,
            "frequency": freq,
            "mentions": len(srcs),
            "pain_level": pain,
            "potential_customers": audience_cap,
            "market_size": f"${customers * acv / 1e6:,.0f}M SAM",
            "market_size_reasoning": f"Illustrative bottom-up: ~{customers:,} reachable {audience} x ${acv}/yr. Replace with sourced counts once live research is connected.",
            "sources": srcs,
            "quotes": [],
        })
    return sorted(out, key=lambda o: -o["pain_level"])


# ---------------------------------------------------------------- validation

def _first_sentence(text: str) -> str:
    s = re.split(r"(?<=[.!?])\s", text.strip(), maxsplit=1)[0]
    return s[:220]


def validate(venture: dict, founder: dict, lib: list[dict]):
    idea = venture["idea"]
    product, audience = split(idea)
    r = _rng(idea)
    words = set(re.findall(r"[a-z]{4,}", idea.lower()))
    fit_terms = {t.lower() for t in (founder.get("skills", []) + founder.get("industries", []))}
    overlap = sum(any(w in t or t in w for t in fit_terms) for w in words)
    years = int(founder.get("years_experience") or 0)

    def ev(i):
        if not lib:
            return []
        d = lib[i % len(lib)]
        return [{"claim": _first_sentence(d["text"]), "title": d["title"], "url": d.get("url"), "type": "library"}]

    market = _is_marketplace(idea)
    scores = {
        "demand": {"score": r.randint(48, 74),
                   "summary": f"Pain for {audience} is plausible but unproven — no live demand data was gathered in demo mode."},
        "competition": {"score": r.randint(35, 65),
                        "summary": f"Incumbent tools partially solve this; whitespace depends on a sharp wedge for {audience}."},
        "defensibility": {"score": r.randint(30, 60) + (10 if market else 0),
                          "summary": "Local network effects could form a moat." if market else "Moat must come from proprietary data and workflow depth."},
        "revenue_potential": {"score": r.randint(40, 70),
                              "summary": "Take-rate model; liquidity drives revenue." if market else "Subscription pricing; willingness to pay untested."},
        "founder_fit": {"score": min(92, 40 + overlap * 12 + min(years, 10) * 2),
                        "summary": "Fill in your founder profile in Settings to sharpen this score." if not fit_terms else f"{overlap} of the venture's key areas overlap your stated skills and industries."},
    }
    for i, k in enumerate(scores):
        scores[k]["evidence"] = ev(i)
    risks = [
        f"{audience.capitalize()} may not feel the pain often enough to change habits",
        "Customer acquisition cost could exceed early lifetime value",
        "Chicken-and-egg liquidity in the first market" if market else "Incumbents can copy the headline feature quickly",
    ]
    avg = sum(s["score"] for s in scores.values()) / 5
    return {
        **scores,
        "summary": f"{_an(product)[0].upper() + _an(product)[1:]} for {audience} is a reasonable hypothesis. Scores are illustrative until "
                   f"live research is connected; treat them as a checklist of what to prove next.",
        "verdict": "Promising" if avg >= 65 else "Needs evidence" if avg >= 45 else "Weak",
        "key_risks": risks,
        "competitors": [],
    }


# ---------------------------------------------------------------- boardroom

LINES = {
    "ceo": [
        "The timing is right: {audience} already live inside digital tools, and nobody owns {product} for them. If we win one tight community first, this expands naturally into adjacent segments.",
        "Investor and Failure are both describing execution risk, not a missing opportunity. The upside case is a category-defining product for {audience}; I'd rather narrow the wedge than walk away.",
        "My vote stands: start narrow, prove pull in one segment in 30 days, and let the data decide how fast we expand.",
    ],
    "investor": [
        "Market looks real but I need a credible path to a large outcome. My worry is CAC: reaching {audience} one by one is expensive unless there's a built-in loop.",
        "Growth's channel thesis helps, but I haven't heard unit economics. Until real users try a prototype, this is a seed-stage bet on the team, not the market.",
        "I'd back a small experiment, not a full build. Show me 10% waitlist conversion and interviews with past behaviour, then we talk.",
    ],
    "product": [
        "The core job is clear, but I want to know how often {audience} hit this pain. Weekly pain builds habits; once-a-semester pain builds churn.",
        "CEO is right about the wedge, but the MVP must nail one workflow end to end. I'd cut everything that isn't in the first-session aha moment.",
        "Ship the single workflow, instrument activation and week-4 retention, and only then add features.",
    ],
    "growth": [
        "Distribution is the good news: {audience} cluster in communities we can reach cheaply. A referral loop plus community seeding beats paid ads here.",
        "Investor's CAC worry is fair for paid channels, which is why I'd lead with community and SEO pages targeting high-intent searches around {product}.",
        "Launch to one community with a waitlist and referral queue; if we can't get 500 signups organically, that's our answer.",
    ],
    "technical": [
        "Buildable in 6-8 weeks with a small team on managed infrastructure. The hard parts are trust and data quality, not the stack.",
        "Failure's point about copying is valid at the feature level. Our edge has to be proprietary data from usage, so we must design the data model for it from day one.",
        "Infra cost is manageable at MVP scale; I'd keep AI inference behind usage limits so margins don't collapse as we grow.",
    ],
    "failure": [
        "This fails because {audience} already have a free, good-enough workaround, and 'slightly better' never beats habit. Why would anyone switch? What's the proof they'd pay, not just sign up?",
        "Everyone is assuming demand. CEO's 'timing is right' is a feeling, and Growth's community plan dies when the novelty fades. Similar products usually die of low retention and weak willingness to pay, and a funded incumbent can ship this feature in a sprint.",
        "Unless we see real commitments — deposits, pilots, or repeat usage — I vote to kill or pivot. Monetization is the least-tested assumption on the table.",
    ],
}
STANCE = {"ceo": "support", "investor": "concern", "product": "concern", "growth": "support", "technical": "support", "failure": "oppose"}
KEYPOINT = {
    "ceo": "Own a narrow wedge, then expand",
    "investor": "CAC and unit economics are unproven",
    "product": "Pain frequency decides retention",
    "growth": "Community-led distribution is cheapest",
    "technical": "Buildable; moat must be data",
    "failure": "No proof users will switch or pay",
}


def board_turn(key: str, venture: dict, rnd: int, rounds: int):
    product, audience = split(venture["idea"])
    idx = 0 if rnd == 1 else (2 if rnd == rounds else 1)
    score = venture.get("overall_score") or 55
    vote = {
        "ceo": "GO",
        "investor": "GO" if score >= 72 else "PIVOT",
        "product": "GO" if score >= 68 else "PIVOT",
        "growth": "GO" if score >= 55 else "PIVOT",
        "technical": "GO",
        "failure": "PIVOT" if score >= 65 else "KILL",
    }[key]
    return {
        "content": LINES[key][idx].format(product=product, audience=audience),
        "key_point": KEYPOINT[key],
        "stance": STANCE[key],
        "vote": vote,
    }


def board_verdict(venture: dict, votes: dict):
    product, audience = split(venture["idea"])
    decision = max(votes, key=lambda v: (votes[v], v == "PIVOT"))
    return {
        "decision": decision,
        "confidence": 45 + 5 * votes[decision],
        "headline": f"Test demand with {audience} before building {product} in full.",
        "reasons": ["The problem sounds real but nobody has proven people will pay yet",
                    "Getting the first users looks cheap through student communities",
                    "Big existing apps could copy the idea, so speed and focus matter"],
        "summary": f"The board sees a real opportunity in {product} for {audience}, but demand and willingness to pay are "
                   f"unproven. Proceed only through cheap experiments that test the Failure Agent's objections.",
        "consensus": ["Start with one narrow segment", "Community-led distribution before paid", "MVP limited to one core workflow"],
        "disagreements": ["Whether current evidence justifies building at all", "How defensible the product is against incumbents"],
        "critical_assumptions": [
            {"assumption": f"{audience.capitalize()} feel this pain at least weekly", "risk": "high",
             "test": "10 Mom-Test interviews asking about the last time it happened"},
            {"assumption": "Users will pay or commit before the full product exists", "risk": "high",
             "test": "Landing page with pricing tiers; target 10% waitlist conversion"},
            {"assumption": "One community channel can deliver 500 signups", "risk": "medium",
             "test": "Seed the waitlist in 3 communities and track referral rate"},
        ],
        "next_steps": ["Share the generated prototype with 10 target users", "Run 10 customer interviews this week",
                       "Re-convene the board with experiment results"],
    }


# ---------------------------------------------------------------- MVP architect

def mvp(venture: dict):
    product, audience = split(venture["idea"])
    market = _is_marketplace(venture["idea"])
    entity, entities = ("listing", "listings") if market else ("project", "projects")
    tables = [
        {"table": "users", "columns": [
            {"name": "id", "type": "uuid", "note": "pk"}, {"name": "email", "type": "text", "note": "unique"},
            {"name": "role", "type": "text", "note": "buyer | seller | admin" if market else "member | admin"},
            {"name": "created_at", "type": "timestamptz"}]},
        {"table": entities, "columns": [
            {"name": "id", "type": "uuid", "note": "pk"}, {"name": "owner_id", "type": "uuid", "note": "fk users"},
            {"name": "title", "type": "text"}, {"name": "status", "type": "text"},
            {"name": "price_cents" if market else "settings", "type": "int" if market else "jsonb"}]},
        {"table": "orders" if market else "tasks", "columns": [
            {"name": "id", "type": "uuid", "note": "pk"}, {"name": f"{entity}_id", "type": "uuid", "note": f"fk {entities}"},
            {"name": "user_id", "type": "uuid", "note": "fk users"}, {"name": "status", "type": "text"},
            {"name": "created_at", "type": "timestamptz"}]},
        {"table": "reviews" if market else "activity", "columns": [
            {"name": "id", "type": "uuid", "note": "pk"}, {"name": "user_id", "type": "uuid", "note": "fk users"},
            {"name": "rating" if market else "type", "type": "int" if market else "text"},
            {"name": "body" if market else "payload", "type": "text" if market else "jsonb"}]},
        {"table": "events", "columns": [
            {"name": "id", "type": "bigint", "note": "pk"}, {"name": "user_id", "type": "uuid"},
            {"name": "name", "type": "text", "note": "activation analytics"}, {"name": "props", "type": "jsonb"}]},
    ]
    return {
        "summary": f"A 6-week MVP of {_an(product)} for {audience} focused on one core loop: "
                   f"{'list, discover, transact' if market else 'onboard, create, get value'} — instrumented for activation and retention.",
        "features": [
            {"name": "Onboarding & auth", "description": f"Sign up in under a minute with profile tailored to {audience}", "priority": "must"},
            {"name": f"Create {entities}" , "description": f"Core creation flow for {entities}", "priority": "must"},
            {"name": "Search & discovery" if market else "Smart workspace", "description": "Find the right match fast" if market else "Organise and act on work in one place", "priority": "must"},
            {"name": "Payments & payouts" if market else "AI assistant", "description": "Escrowed checkout with fees" if market else "Automate the most repetitive step", "priority": "must"},
            {"name": "Reviews & trust" if market else "Collaboration", "description": "Ratings and verification" if market else "Invite teammates and share", "priority": "should"},
            {"name": "Notifications", "description": "Email and in-app nudges for key events", "priority": "should"},
            {"name": "Analytics dashboard", "description": "Usage insights for power users", "priority": "could"},
            {"name": "Mobile app", "description": "Native app after web retention is proven", "priority": "could"},
        ],
        "user_stories": [
            {"as_a": audience.rstrip("s") if audience.endswith("s") else audience, "i_want": f"to get started with {product} in minutes",
             "so_that": "I see value in my first session", "acceptance": ["Signup < 60s", "First value moment in session one"]},
            {"as_a": "seller" if market else "user", "i_want": f"to create and manage {entities}", "so_that": "I can " + ("reach buyers" if market else "track my work"),
             "acceptance": [f"CRUD for {entities}", "Draft and publish states"]},
            {"as_a": "buyer" if market else "team lead", "i_want": "to find the best option quickly" if market else "to see progress at a glance",
             "so_that": "I don't waste time", "acceptance": ["Search returns in < 300ms", "Filters for key attributes"]},
            {"as_a": "founder", "i_want": "activation and retention analytics", "so_that": "we know if the MVP works",
             "acceptance": ["Events tracked for each funnel step", "Weekly cohort report"]},
        ],
        "database_schema": tables,
        "apis": [
            {"method": "POST", "path": "/auth/signup", "description": "Create account"},
            {"method": "GET", "path": "/me", "description": "Current user profile"},
            {"method": "GET", "path": f"/{entities}", "description": f"List/search {entities}"},
            {"method": "POST", "path": f"/{entities}", "description": f"Create {entity}"},
            {"method": "PATCH", "path": f"/{entities}/:id", "description": f"Update {entity}"},
            {"method": "DELETE", "path": f"/{entities}/:id", "description": f"Archive {entity}"},
            {"method": "POST", "path": "/orders" if market else "/tasks", "description": "Start a transaction" if market else "Create task"},
            {"method": "POST", "path": "/reviews" if market else "/assistant", "description": "Leave a review" if market else "Run AI assistant"},
            {"method": "POST", "path": "/events", "description": "Track analytics event"},
        ],
        "architecture": {
            "nodes": [
                {"id": "web", "label": "React web app", "layer": "client"},
                {"id": "api", "label": "REST API (Node)", "layer": "api"},
                {"id": "auth", "label": "Auth", "layer": "service"},
                {"id": "core", "label": f"{entity.capitalize()} service", "layer": "service"},
                {"id": "pay" if market else "ai", "label": "Payments" if market else "AI worker", "layer": "service"},
                {"id": "db", "label": "Postgres", "layer": "data"},
                {"id": "store", "label": "Object storage", "layer": "data"},
                {"id": "ext", "label": "Stripe Connect" if market else "LLM API", "layer": "external"},
                {"id": "mail", "label": "Email provider", "layer": "external"},
            ],
            "edges": [
                {"source": "web", "target": "api", "label": "HTTPS"}, {"source": "api", "target": "auth"},
                {"source": "api", "target": "core"}, {"source": "api", "target": "pay" if market else "ai"},
                {"source": "core", "target": "db"}, {"source": "core", "target": "store"},
                {"source": "pay" if market else "ai", "target": "ext"}, {"source": "auth", "target": "db"},
                {"source": "core", "target": "mail", "label": "notify"},
            ],
        },
        "sprint_plan": [
            {"sprint": 1, "goal": "Foundations", "tasks": ["Auth & onboarding", "Data model + migrations", "Design system", "Analytics events"]},
            {"sprint": 2, "goal": "Core loop", "tasks": [f"{entity.capitalize()} creation flow", "Search & discovery" if market else "Workspace views", "First-session aha moment"]},
            {"sprint": 3, "goal": "Money & trust", "tasks": ["Payments" if market else "AI assistant", "Reviews" if market else "Collaboration", "Notifications"]},
            {"sprint": 4, "goal": "Launch", "tasks": ["Private beta with 30 users", "Fix top 10 issues", "Public waitlist launch"]},
        ],
        "team": [
            {"role": "Full-stack engineer", "count": 2, "why": "Ship web app and API end to end"},
            {"role": "Product designer", "count": 1, "why": "Own onboarding and the core workflow"},
            {"role": "Founder / PM", "count": 1, "why": "Customer interviews, prioritisation, growth"},
        ],
        "stack": ["React", "Node.js", "PostgreSQL", "Stripe" if market else "OpenAI", "Vercel", "PostHog"],
        "monthly_cost_estimate": "$150–$400 at MVP scale",
    }


# ---------------------------------------------------------------- prototype

PROTO_TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__NAME__</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-50 text-slate-800">
<header class="bg-white border-b"><div class="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
<span class="font-semibold text-indigo-600">__NAME__</span>
<nav class="flex gap-4 text-sm"><a href="#/home" data-nav>Home</a><a href="#/items" data-nav>__ITEMS__</a></nav>
<button id="add" class="ml-auto bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg">+ New</button></div></header>
<main class="max-w-5xl mx-auto p-4" id="app"></main>
<div id="modal" class="hidden fixed inset-0 bg-black/30 grid place-items-center p-4"><form id="form" class="bg-white rounded-xl p-5 w-full max-w-sm space-y-3">
<h2 class="font-semibold">New __ITEM__</h2><input name="title" required placeholder="Title" class="w-full border rounded-lg px-3 py-2">
<input name="note" placeholder="Details" class="w-full border rounded-lg px-3 py-2">
<div class="flex justify-end gap-2"><button type="button" id="cancel" class="px-3 py-1.5">Cancel</button><button class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg">Save</button></div></form></div>
<script>
const KEY='proto-items';let items;try{items=JSON.parse(localStorage.getItem(KEY))}catch(e){}
items=items||__SEED__;const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(items))}catch(e){}};
const app=document.getElementById('app'),modal=document.getElementById('modal');
function render(){const r=location.hash||'#/home';document.querySelectorAll('[data-nav]').forEach(a=>a.className=a.getAttribute('href')===r?'text-indigo-600 font-medium':'text-slate-500');
if(r==='#/home'){app.innerHTML=`<h1 class="text-2xl font-semibold mb-4">Welcome back</h1><div class="grid grid-cols-2 gap-3"><div class="bg-white rounded-xl border p-4"><p class="text-sm text-slate-500">__ITEMS__</p><p class="text-3xl font-semibold">${items.length}</p></div><div class="bg-white rounded-xl border p-4"><p class="text-sm text-slate-500">Demo mode</p><p class="text-sm mt-2">Add a free GROQ_API_KEY to generate a tailored prototype.</p></div></div>`;return}
app.innerHTML=`<input id="q" placeholder="Search" class="w-full border rounded-lg px-3 py-2 mb-3 bg-white"><div id="list" class="space-y-2"></div>`;
const draw=()=>{const q=document.getElementById('q').value.toLowerCase();document.getElementById('list').innerHTML=items.filter(i=>i.title.toLowerCase().includes(q)).map((i,n)=>`<div class="bg-white border rounded-xl p-3 flex justify-between"><div><p class="font-medium">${i.title}</p><p class="text-sm text-slate-500">${i.note||''}</p></div><button data-del="${n}" class="text-sm text-rose-500">Delete</button></div>`).join('')||'<p class="text-slate-500">Nothing here yet.</p>'};
document.getElementById('q').oninput=draw;draw();}
app.onclick=e=>{const d=e.target.dataset.del;if(d!==undefined){items.splice(+d,1);save();render()}};
document.getElementById('add').onclick=()=>modal.classList.remove('hidden');document.getElementById('cancel').onclick=()=>modal.classList.add('hidden');
document.getElementById('form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);items.unshift({title:f.get('title'),note:f.get('note')});save();e.target.reset();modal.classList.add('hidden');location.hash='#/items';render()};
window.onhashchange=render;render();
</script></body></html>"""


def prototype(venture: dict):
    import json as _json
    name = venture.get("name") or "Prototype"
    market = _is_marketplace(venture["idea"])
    item, items = ("Listing", "Listings") if market else ("Project", "Projects")
    seed = [{"title": f"Sample {item.lower()} {i}", "note": "Seed data — edit or delete me"} for i in range(1, 6)]
    html = (PROTO_TEMPLATE.replace("__NAME__", name).replace("__ITEMS__", items).replace("__ITEM__", item.lower())
            .replace("__SEED__", _json.dumps(seed)))
    return {"title": name, "html": html, "summary": "Template prototype (demo mode)."}


# ---------------------------------------------------------------- competitor intel

def competitor_signals(comp: dict, prev: dict | None, snap: dict | None, error: str | None):
    name = comp["name"]
    if error:
        return [{"type": "product", "title": f"Couldn't reach {name}", "detail": error, "severity": "info",
                 "recommended_response": "Check the URL; tracking resumes on the next scan.", "source_url": comp.get("url")}]
    if not snap:
        return []
    if not prev:
        return [{"type": "product", "title": f"Now tracking {name}",
                 "detail": f"Baseline captured: {len(snap['headings'])} page sections and {len(snap['prices'])} price points.",
                 "recommended_response": "Review their headline positioning and make sure your landing page states a sharper wedge.",
                 "severity": "info", "source_url": comp.get("url")}]
    out = []
    added, removed = set(snap["prices"]) - set(prev.get("prices", [])), set(prev.get("prices", [])) - set(snap["prices"])
    if added or removed:
        out.append({"type": "pricing", "title": f"{name} changed pricing",
                    "detail": f"New: {', '.join(sorted(added)) or '—'} · Removed: {', '.join(sorted(removed)) or '—'}",
                    "recommended_response": "Re-check your pricing tiers against theirs and test a comparison page.",
                    "severity": "medium", "source_url": comp.get("url")})
    new_sections = [h for h in snap["headings"] if h not in prev.get("headings", [])]
    if new_sections:
        out.append({"type": "feature", "title": f"{name} updated their site",
                    "detail": "New sections: " + ", ".join(new_sections[:5]),
                    "recommended_response": "Assess whether this closes a gap you were counting on and adjust your roadmap priority.",
                    "severity": "low", "source_url": comp.get("url")})
    return out


# ---------------------------------------------------------------- experiments

def experiment(exp: dict, conv: float, feedback: list[str]):
    visitors = (exp.get("metrics") or {}).get("visitors", 0)
    target = float(exp.get("target_conversion") or 10)
    if visitors < 100:
        outcome = "inconclusive"
        summary = f"Only {visitors} visitors so far — too few to judge. Conversion is {conv}% against a {target}% target."
    elif conv >= target:
        outcome, summary = "validated", f"{conv}% conversion beats the {target}% target — the value proposition resonates."
    else:
        outcome, summary = "invalidated", f"{conv}% conversion is below the {target}% target — the message or audience is off."
    return {
        "outcome": outcome,
        "summary": summary,
        "insights": [f"{len(feedback)} feedback responses collected"] + [f"“{f[:120]}”" for f in feedback[:3]],
        "recommended_next": ["Drive 200+ targeted visitors from one community", "Interview 5 signups about past behaviour",
                             "A/B test the headline using the generated CTA variants"],
    }

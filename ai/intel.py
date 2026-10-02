"""Competitive Intelligence Officer: turns raw competitor evidence (websites, news, our own history of snapshots) into decisions.

For each tracked competitor it gathers evidence and writes a grounded profile; then it synthesizes across all of them into one
report: weekly brief, strategic insight, recommended actions, feature gap matrix, white space, feature radar, positioning map.
Counts, radar buckets and white space are computed in code from the evidence, not guessed by the model.
"""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel, Field

import agents
import core

KINDS = ["feature_launch", "pricing_change", "funding", "partnership", "product_update", "positioning_change"]
SIGNAL_TYPE = {"feature_launch": "feature", "pricing_change": "pricing", "funding": "funding", "partnership": "partnership",
               "product_update": "product", "positioning_change": "product"}
PRICE_WORDS = re.compile(r"fee|price|pricing|cost|plan|commission|rate|subscription|payout", re.I)
RULES = agents.GROUNDING + " Use only the provided sources, site snapshot and history for claims about what a competitor does or changed."


# ---------------------------------------------------------------- schemas

class Activity(BaseModel):
    kind: Literal["feature_launch", "pricing_change", "funding", "partnership", "product_update", "positioning_change"]
    title: str = Field(description="One specific line, e.g. 'Reduced seller fees from 12% to 8%'")
    detail: str
    date: str = Field("", description="YYYY-MM-DD the source states it happened. If no source dates it, do not report it as activity.")
    source_url: str = Field(description="A URL copied from the provided sources (or the competitor's own site)")
    response: str = Field("", description="How our venture should respond to this specific change")


class Metric(BaseModel):
    name: str = Field(description="A measurable attribute, e.g. 'Seller fee', 'Starter plan price', 'Payout speed'. Reuse earlier names for the same thing.")
    value: str


class Profile(BaseModel):
    category: str = Field(description="What kind of player they are, e.g. 'Textbook buy-back marketplace'")
    summary: str = Field(description="One sentence: what they are and who they serve")
    why_it_matters: str = Field(description="Why this competitor matters to OUR venture specifically")
    strategic_threat: int = Field(ge=0, le=100, description="How severely they threaten our venture: customer overlap, strength, momentum")
    threat_reason: str
    strengths: list[str] = Field(description="Why they are winning (evidence-based, 2-4)")
    weaknesses: list[str] = Field(description="Why they are vulnerable (evidence-based, 2-4)")
    features: list[str] = Field(description="Concrete capabilities they offer, as short noun phrases, max 12")
    metrics: list[Metric] = Field(description="Numbers visible in the evidence (fees, prices, plans). Empty if none.")
    recent_activity: list[Activity] = Field(description="ONLY changes that a source explicitly dates within the last ~60 days (launches, fee changes, funding, partnerships). Never restate standing features or marketing copy as activity; put those in strengths/features. Empty if nothing is dated.")
    potential_impact: str = Field(description="What their latest moves could do to us")
    suggested_response: str
    positioning_trend: str = Field(description="How their positioning is moving, e.g. 'Competing aggressively on price'")


class Evidence(BaseModel):
    competitor: str
    fact: str
    source_url: str = ""
    basis: Literal["website", "news", "history", "analysis"]


class Action(BaseModel):
    title: str = Field(description="An imperative decision, e.g. 'Build verified student profiles'")
    kind: Literal["build", "pricing", "positioning", "marketing", "trust", "defend"]
    reason: str
    impact: str = Field(description="The expected effect on our venture")
    confidence: int = Field(ge=0, le=100, description="Lower it when evidence is thin")
    evidence: list[Evidence] = Field(description="At least one item; must come from the provided profiles")


class Axes(BaseModel):
    x_left: str
    x_right: str
    y_low: str
    y_high: str


class Point(BaseModel):
    name: str = Field(description="'us' for our venture, otherwise the exact competitor name")
    x: int = Field(ge=0, le=100)
    y: int = Field(ge=0, le=100)
    reason: str


class Row(BaseModel):
    feature: str
    us: bool = Field(description="True only if it is in our MVP plan or idea")
    competitors: list[str] = Field(description="Exact names of tracked competitors whose profile lists this capability")


class Synthesis(BaseModel):
    market_trend: str
    recommendation: str = Field(description="The single most important thing to do this week")
    strategic_insight: str = Field(description="What competitors are collectively doing, e.g. 'Competitors are competing primarily on price'")
    strategic_recommendation: str
    actions: list[Action] = Field(description="3-6 actions, most valuable first")
    axes: Axes = Field(description="Two axes that best separate us from competitors in this market; 0 = left/low, 100 = right/high")
    points: list[Point]
    feature_matrix: list[Row] = Field(description="10-16 features: what competitors offer, plus 3-5 differentiating capabilities that "
                                                   "NO tracked competitor shows evidence of offering but customers need")


# ---------------------------------------------------------------- helpers

def _retry(fn):
    for attempt in range(4):
        try:
            return fn()
        except core.LLMError as e:
            if attempt == 3 or not re.search(r"429|rate|quota|exhausted|overloaded|503", str(e), re.I):
                raise
            time.sleep(20 * (attempt + 1))


def _date(s: str) -> str | None:
    try:
        d = date.fromisoformat((s or "").strip()[:10])
        return d.isoformat() if date.today() - timedelta(days=400) <= d <= date.today() else None
    except ValueError:
        return None


def threat_level(score: int) -> str:
    return "high" if score >= 67 else "medium" if score >= 34 else "low"


def weekly_counts(events: list[dict]) -> list[dict]:
    """Past-7-days activity by type, from dated events [{competitor, type, date}]."""
    cutoff = (date.today() - timedelta(days=7)).isoformat()
    groups = [("feature", "launched new features"), ("pricing", "changed pricing"), ("funding", "announced funding or acquisitions"),
              ("acquisition", "announced funding or acquisitions"), ("partnership", "announced partnerships"), ("product", "shipped product updates")]
    merged: dict[str, set] = {}
    for e in events:
        if (e["date"] or "") >= cutoff:
            label = next((l for t, l in groups if t == e["type"]), None)
            if label:
                merged.setdefault(label, set()).add(e["competitor"])
    return [{"label": label, "count": len(names), "competitors": sorted(names)} for label, names in merged.items()]


def radar(rows: list[dict], n_competitors: int) -> dict:
    """Feature radar by how many tracked competitors offer each feature: emerging <20%, growing 20-60%, saturated >60%, white space 0."""
    out = {"emerging": [], "growing": [], "saturated": [], "white_space": []}
    for r in rows:
        n = len(r["competitors"])
        pct = round(100 * n / n_competitors) if n_competitors else 0
        bucket = "white_space" if n == 0 else "emerging" if pct < 20 else "growing" if pct <= 60 else "saturated"
        out[bucket].append({"feature": r["feature"], "count": n, "percent": pct, "us": r["us"]})
    return out


def _sources(comp: dict) -> list[dict]:
    name = comp["name"]
    found = sum(core.parallel(
        lambda: core.web_search(f"{name} news: product launches, pricing or fee changes, funding, partnerships, expansion", k=4, topic="news", days=60),
        lambda: core.web_search(f"{name} pricing fees features how it works", k=3),
    ), [])
    return core.dedupe(found)[:6]


def _evidence(comp: dict, venture: dict) -> tuple[dict | None, list[dict], str | None]:
    def site():
        if not comp.get("url"):
            return None, None
        try:
            return agents.snapshot(comp["url"]), None
        except Exception as e:
            return None, str(e)[:160]
    (snap, error), sources = core.parallel(site, lambda: _sources(comp))  # the site and the news search don't depend on each other
    return snap, sources, error


def profile_for(comp: dict, venture: dict, mvp: list[str]) -> dict:
    snap, sources, error = _evidence(comp, venture)
    history = comp.get("history") or []
    allowed = {s["url"] for s in sources} | ({comp["url"]} if comp.get("url") else set())
    if not snap and not sources:
        raise core.LLMError(f"No evidence found for {comp['name']} (no website or news)")
    prev_metrics = "; ".join(f"{m['name']}={m['value']}" for m in (history[-1]["metrics"] if history else []))
    p: Profile = _retry(lambda: core.structured(
        Profile,
        "You are Forge's Competitive Intelligence Officer analysing ONE competitor for a founder. Decide what matters for OUR venture: "
        "be specific, evidence-based and strategic, never generic. " + RULES + " " + core.PLAIN,
        f"{agents.venture_text(venture)}\nOur MVP features: {', '.join(mvp) or 'not defined yet'}\n\n"
        f"Competitor: {comp['name']} ({comp.get('url') or 'no website known'})\nFounder notes: {comp.get('description') or 'none'}\n"
        f"Earlier metrics we recorded: {prev_metrics or 'none'}\n"
        f"Website snapshot: {snap and {k: snap[k] for k in ('prices', 'headings', 'excerpt')}}\nSite error: {error}\n\n"
        f"Sources (cite source_url from these):\n{core.sources_block(sources)}",
        tier="heavy", max_tokens=4500, temperature=0.3))
    d = p.model_dump()
    # Evidence-based: keep only activity that points at a source we actually gave the model.
    # Undated items are standing facts, not changes, so they are dropped.
    d["recent_activity"] = [{**a, "date": _date(a["date"])} for a in d["recent_activity"] if a["source_url"] in allowed and _date(a["date"])]
    return {"profile": d, "snapshot": snap, "sources": len(sources), "error": error}


NUM = re.compile(r"[$€£₹]?\d[\d,]*(?:\.\d+)?\s?%?")


def _same(a: str, b: str) -> bool:
    """Whether two recorded values mean the same thing. The model words values differently between runs ('50% of sale price' vs
    '50% of sale price (seller receives 50% payout)'), so compare the headline number when there is one, else the words."""
    na, nb = NUM.findall(a), NUM.findall(b)
    if na and nb:
        return re.sub(r"[\s,]", "", na[0]) == re.sub(r"[\s,]", "", nb[0])
    wa, wb = set(re.findall(r"[a-z]+", a.lower())), set(re.findall(r"[a-z]+", b.lower()))
    return bool(wa | wb) and len(wa & wb) / len(wa | wb) >= 0.5 and (bool(na) == bool(nb))


def memory_changes(comp: dict, metrics: list[dict]) -> list[dict]:
    """Real differences between what we recorded earlier and now; these are first-hand observations, so they count as evidence."""
    history = comp.get("history") or []
    if not history:
        return []
    old = {m["name"].lower(): m for m in history[0]["metrics"]}
    return [{"metric": m["name"], "from": old[m["name"].lower()]["value"], "to": m["value"], "since": history[0]["at"]}
            for m in metrics if m["name"].lower() in old and not _same(old[m["name"].lower()]["value"], m["value"])]


# ---------------------------------------------------------------- entry point

def run(venture: dict, competitors: list[dict], mvp_features: list[str], recent_events: list[dict]) -> dict:
    """competitors: [{id, name, url, description, history:[{at, metrics}]}]; recent_events: [{competitor, type, date}]."""
    if not core.OPENAI:
        raise core.LLMError("The Competitive Intelligence Officer needs an LLM: set GEMINI_API_KEY, GROQ_API_KEY or OPENAI_API_KEY")
    results, skipped = [], []

    def one(c):
        try:
            return c, profile_for(c, venture, mvp_features), None
        except core.LLMError as e:
            return c, None, str(e)[:200]

    # Each competitor is read and profiled independently, so do them together (a few at a time to stay inside the models' rate limits).
    with ThreadPoolExecutor(max_workers=4) as ex:
        for c, r, err in ex.map(one, competitors):
            if err:
                skipped.append({"name": c["name"], "reason": err})
                continue
            r["comp"], r["changes"] = c, memory_changes(c, r["profile"]["metrics"])
            results.append(r)
    if not results:
        raise core.LLMError("Couldn't gather evidence for any competitor: " + "; ".join(s["reason"] for s in skipped))

    names = [r["comp"]["name"] for r in results]
    compact = [{"name": r["comp"]["name"], "url": r["comp"].get("url"), **{k: r["profile"][k] for k in (
        "category", "summary", "strategic_threat", "strengths", "weaknesses", "features", "metrics", "positioning_trend", "potential_impact")},
        "recent_activity": [{k: a[k] for k in ("kind", "title", "date", "source_url")} for a in r["profile"]["recent_activity"]],
        "changes_since_we_started_tracking": r["changes"]} for r in results]
    s: Synthesis = _retry(lambda: core.structured(
        Synthesis,
        "You are Forge's Competitive Intelligence Officer advising a founder. You answer: what should we do next based on competitor "
        "activity? Every action needs a reason, expected impact, honest confidence and evidence copied from the profiles below (competitor "
        "name, the fact, and its source_url when it has one). Prefer decisions over observations. Choose map axes that separate us "
        "from the pack and place every competitor and 'us' on them. " + RULES + " " + core.PLAIN,
        f"{agents.venture_text(venture)}\nOur MVP features: {', '.join(mvp_features) or 'not defined yet'}\n"
        f"Tracked competitors: {', '.join(names)}\n\nProfiles:\n{json.dumps(compact, ensure_ascii=False)}",
        tier="heavy", max_tokens=6500, temperature=0.4)).model_dump()

    # Ground the model's claims in what we actually collected.
    urls = {a["source_url"] for r in results for a in r["profile"]["recent_activity"]} | {r["comp"].get("url") for r in results if r["comp"].get("url")}
    lower = {n.lower(): n for n in names}
    for a in s["actions"]:
        for e in a["evidence"]:
            e["competitor"] = lower.get(e["competitor"].lower(), e["competitor"])
            if e["source_url"] not in urls:
                e["source_url"] = ""
                e["basis"] = "analysis" if e["basis"] in ("website", "news") else e["basis"]
    rows = [{"feature": r["feature"], "us": r["us"], "competitors": sorted({lower[c.lower()] for c in r["competitors"] if c.lower() in lower})} for r in s["feature_matrix"]]
    points = {p["name"].lower(): p for p in s["points"]}
    positions = [{"name": venture.get("name") or "Us", "us": True, **{k: points.get("us", points.get(str(venture.get("name", "")).lower(), {"x": 50, "y": 50, "reason": ""}))[k] for k in ("x", "y", "reason")}}]
    positions += [{"name": n, "us": False, **{k: points.get(n.lower(), {"x": 50, "y": 50, "reason": "Not enough evidence to place precisely"})[k] for k in ("x", "y", "reason")}} for n in names]

    # Timeline events: model-found activity (grounded) plus first-hand changes we measured between snapshots.
    signals, events = [], list(recent_events)
    for r in results:
        c, p = r["comp"], r["profile"]
        sev = "high" if p["strategic_threat"] >= 70 else "medium"
        for a in p["recent_activity"]:
            typ = SIGNAL_TYPE[a["kind"]]
            signals.append({"competitor_id": c["id"], "type": typ, "title": a["title"], "detail": a["detail"], "recommended_response": a["response"] or p["suggested_response"],
                            "severity": sev if typ in ("pricing", "feature") else "low", "source_url": a["source_url"], "occurred_on": a["date"]})
            events.append({"competitor": c["name"], "type": typ, "date": a["date"]})
        for ch in r["changes"]:
            typ = "pricing" if PRICE_WORDS.search(ch["metric"]) else "product"
            signals.append({"competitor_id": c["id"], "type": typ, "title": f"{ch['metric']} changed from {ch['from']} to {ch['to']}",
                            "detail": f"{c['name']}'s {ch['metric'].lower()} was {ch['from']} when we first recorded it and is now {ch['to']}.",
                            "recommended_response": p["suggested_response"], "severity": sev if typ == "pricing" else "low",
                            "source_url": c.get("url"), "occurred_on": date.today().isoformat()})
            events.append({"competitor": c["name"], "type": typ, "date": date.today().isoformat()})

    report = {
        "brief": {"period": "Past 7 days", "counts": weekly_counts(events), "market_trend": s["market_trend"], "recommendation": s["recommendation"],
                  "baseline": [r["comp"]["name"] for r in results if not r["comp"].get("history")]},
        "insight": {"insight": s["strategic_insight"], "recommendation": s["strategic_recommendation"]},
        "actions": sorted(s["actions"], key=lambda a: -a["confidence"]),
        "matrix": {"competitors": names, "rows": rows}, "radar": radar(rows, len(names)),
        "positioning": {"axes": s["axes"], "points": positions},
        "skipped": skipped,
    }
    return {
        "report": report, "signals": signals,
        "competitors": [{"id": r["comp"]["id"], "category": r["profile"]["category"], "strategic_threat": r["profile"]["strategic_threat"],
                         "threat_level": threat_level(r["profile"]["strategic_threat"]), "profile": r["profile"], "snapshot": r["snapshot"],
                         "metrics": r["profile"]["metrics"], "features": r["profile"]["features"], "changes": r["changes"]} for r in results],
    }

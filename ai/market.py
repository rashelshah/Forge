"""Market Signals radar: one run reads fresh news and market chatter and answers what is changing, what is opening up, what is
threatening us and which trends matter. Signals must cite a source we actually fetched; everything else is analysis and says so."""
from datetime import date
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field

import agents
import core
import intel
import yc

Level = Literal["low", "medium", "high"]


class Overview(BaseModel):
    health: Literal["positive", "neutral", "negative"] = Field(description="How favourable the market is for this venture right now")
    confidence: int = Field(ge=0, le=100, description="Lower it when evidence is thin")
    drivers: list[str] = Field(description="3-5 short phrases: what is helping the venture")
    risks: list[str] = Field(description="2-4 short phrases: what could hurt it")


class Signal(BaseModel):
    title: str = Field(description="What happened, one specific line, e.g. 'OpenAI launches shopping agents'")
    summary: str
    impact: str = Field(description="What this changes for the venture's customers or market")
    opportunity: str = Field(description="The opening it creates for the venture, in a few words")
    strength: Level
    confidence: int = Field(ge=0, le=100)
    source_id: str = Field(description="The S# id of the source that reports it, e.g. 'S3'. Required.")
    date: str = Field("", description="YYYY-MM-DD the source says it happened, or empty if undated")


class Opportunity(BaseModel):
    title: str
    description: str
    score: int = Field(ge=0, le=100, description="Overall attractiveness for this venture")
    market_size: Level = Field(description="Market size potential")
    difficulty: Level
    time_horizon: Literal["0-6 months", "6-18 months", "18+ months"]


class Threat(BaseModel):
    title: str
    description: str
    severity: Level
    likelihood: Level
    suggested_action: str


class Trend(BaseModel):
    title: str
    category: Literal["Technology", "Consumer Behavior", "Funding", "Regulation", "Commerce", "AI"]
    momentum: Literal["growing", "stable", "declining"]
    confidence: int = Field(ge=0, le=100)
    impact: Level
    summary: str


class Outlook(BaseModel):
    summary: str = Field(description="Two or three sentences on where the industry is heading and why")
    best_area: str = Field(description="The single most promising area for this venture")


class Radar(BaseModel):
    overview: Overview
    signals: list[Signal] = Field(description="Up to 6 recent developments, newest first. Only things a provided source reports. Empty if the sources hold nothing relevant.")
    opportunities: list[Opportunity] = Field(description="3-5 underserved areas")
    threats: list[Threat] = Field(description="2-4 threats")
    trends: list[Trend] = Field(description="4-6 trends, spread across categories where the evidence supports it")
    outlook: Outlook


def _sources(idea: str) -> list[dict]:
    found = core.web_search(f"{idea} market news product launches funding", k=5, topic="news", days=30)
    found += core.web_search(f"{idea} industry trends growth consumer adoption", k=5)
    found += core.web_search(f"{idea} regulation funding startups investors", k=4, topic="news", days=60)
    return core.dedupe(found)[:12]


def run(venture: dict, context: dict) -> dict:
    """context: {competitors:[name], intel:{market_trend, recommendation}|None, memories:[{kind,title,content}], known_signals:[title]}."""
    if not core.OPENAI:
        raise core.LLMError("Market Signals needs an LLM: set GEMINI_API_KEY, GROQ_API_KEY or OPENAI_API_KEY")
    sources = _sources(venture["idea"])
    live = bool(sources)
    ycx = yc.context(venture["idea"], k=6)
    mem = "\n".join(f"- ({m['kind']}) {m['title']}: {m['content'][:240]}" for m in context.get("memories", [])[:20]) or "(none yet)"
    out: Radar = intel._retry(lambda: core.structured(
        Radar,
        "You are Forge's Market Intelligence Analyst: an AI market radar for one startup, like a Bloomberg terminal, CB Insights and "
        "Exploding Topics rolled into one analyst. Tell the founder what is changing, what is opening up, what is threatening them and "
        "which trends matter now. Be specific to THIS venture, never generic. " + agents.GROUNDING + " Every signal needs a source_id; "
        "if no source supports it, leave it out. Opportunities, threats and trends are your analysis from the sources and the venture's "
        "own history; keep them concrete and say so in your confidence. Do not repeat signals already known. " + core.PLAIN,
        f"{agents.venture_text(venture)}\nTracked competitors: {', '.join(context.get('competitors', [])) or 'none'}\n"
        f"Latest competitive brief: {(context.get('intel') or {}).get('market_trend') or 'none'}\n"
        f"What the venture has learned so far:\n{mem}\nSignals already known (skip them): {'; '.join(context.get('known_signals', [])[:30]) or 'none'}\n"
        f"Today: {date.today().isoformat()}\n\n{ycx['text']}\n(Use the Y Combinator block for competition, funding and trend claims; it is not a news source, so do not make it a signal.)\n\nSources:\n{core.sources_block(sources)}",
        tier="heavy", max_tokens=6500, temperature=0.4)).model_dump()

    signals = []
    for s in out["signals"]:
        sid = s["source_id"].strip().strip("[]").upper()
        if not (sid.startswith("S") and sid[1:].isdigit() and 0 < int(sid[1:]) <= len(sources)):
            continue  # ungrounded: a signal without a real source is dropped
        src = sources[int(sid[1:]) - 1]
        signals.append({**{k: s[k] for k in ("title", "summary", "impact", "opportunity", "strength", "confidence")}, "source_url": src["url"],
                        "source": urlparse(src["url"]).netloc.removeprefix("www.") or src["title"], "occurred_on": intel._date(s["date"]) or date.today().isoformat()})
    signals.sort(key=lambda s: s["occurred_on"], reverse=True)

    # Without fresh sources the overview is analysis only: cap how sure it may sound.
    cap = 100 if live else 55
    ov = out["overview"]
    ov["confidence"] = min(ov["confidence"], cap)
    for t in out["trends"]:
        t["confidence"] = min(t["confidence"], cap)
    return {
        "overview": ov, "signals": signals, "live": live,
        "opportunities": sorted(out["opportunities"], key=lambda o: -o["score"]),
        "threats": out["threats"], "trends": out["trends"], "outlook": out["outlook"],
        "sources": [{"title": s["title"], "url": s["url"], "domain": urlparse(s["url"]).netloc.removeprefix("www.")} for s in sources],
    }

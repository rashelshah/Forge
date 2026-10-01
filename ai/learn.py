"""Venture Memory synthesis: reads everything the venture's agents have stored and distils what the venture has learned —
what we know, validated and failed assumptions, decisions with their reasons, and the top learnings. Every item must cite memories;
dates, evidence and the confidence ceiling come from those memories in code, not from the model."""
import re
from datetime import date

from pydantic import BaseModel, Field

import agents
import core
import intel


class Validated(BaseModel):
    statement: str = Field(description="An assumption the evidence supports, e.g. 'Users want safer transactions'")
    confidence: int = Field(ge=0, le=100)
    refs: list[int] = Field(description="Numbers of the memories [M#] that support it")


class Failed(BaseModel):
    statement: str = Field(description="An assumption the evidence contradicts, e.g. 'Users will pay monthly subscriptions'")
    confidence: int = Field(ge=0, le=100, description="How sure we are that it failed")
    reason: str = Field(description="Why it failed, from the memories")
    refs: list[int]


class Decision(BaseModel):
    decision: str
    why: str = Field(description="The reason the decision was made, from the memories")
    refs: list[int]


class Synthesis(BaseModel):
    known: list[str] = Field(description="Up to 6 plain statements of what the venture knows to be true so far")
    top_learnings: list[str] = Field(description="Up to 6 executive-summary learnings, most important first")
    validated: list[Validated] = Field(description="Up to 8")
    failed: list[Failed] = Field(description="Up to 8. Only assumptions the memories show were tested and did not hold.")
    decisions: list[Decision] = Field(description="Up to 8 real decisions the venture made, not suggestions")


def run(venture: dict, memories: list[dict]) -> dict:
    """memories: [{id, kind, title, content, at}] oldest first."""
    if not core.OPENAI:
        raise core.LLMError("Venture Memory synthesis needs an LLM: set GEMINI_API_KEY, GROQ_API_KEY or OPENAI_API_KEY")
    if not memories:
        raise core.LLMError("Nothing in memory yet — run research, validation or the boardroom first")
    mems = memories[-80:]
    block = "\n".join(f"[M{i + 1}] {m['at'][:10]} · {m['kind']} · {m['title']}\n{m['content'][:500]}" for i, m in enumerate(mems))
    s = intel._retry(lambda: core.structured(
        Synthesis,
        "You are Forge's Venture Historian. Turn the venture's stored memories into durable knowledge for the founder: what has been "
        "learned, which assumptions held, which failed and why, and which decisions were made and why. A statement belongs only if "
        "memories support it; cite them with refs (numbers only: never write [M#] or (M#) inside a statement). Be strict about evidence: "
        "VALIDATED means research, a test or market data supported a belief about customers or the market (desk research alone earns "
        "modest confidence), not that something was built, planned, written or agreed. FAILED means evidence showed the belief did NOT hold; an inconclusive or too-small test "
        "(a handful of visitors) is neither validated nor failed, so leave it out. A board vote or a stage change is a decision, not "
        "validation. DECISIONS are choices actually committed to (verdicts, stage changes, pricing, positioning, scope), not plans an "
        "agent suggested. If memories contradict each other, prefer the newer one. Fewer, well-supported items beat many weak ones; "
        "empty lists are fine. " + agents.GROUNDING + " " + core.PLAIN,
        f"{agents.venture_text(venture)}\n\nMemories (oldest first):\n{block}",
        tier="heavy", max_tokens=5000, temperature=0.3)).model_dump()

    mark = re.compile(r"\s*[(\[]\s*M\d[^)\]]*[)\]]?")

    def clean(t: str) -> str:
        return mark.sub("", t).strip()

    def cite(refs: list[int]):
        valid = sorted({r for r in refs if 1 <= r <= len(mems)})
        if not valid:
            return None
        seen, evidence = set(), []
        for r in valid:
            m = mems[r - 1]
            if m["title"] not in seen:
                seen.add(m["title"])
                evidence.append({"kind": m["kind"], "title": m["title"]})
        # Confidence can't outrun the evidence: one memory caps at 70, two at 85, three or more is uncapped.
        return {"evidence": evidence[:6], "occurred_on": mems[valid[-1] - 1]["at"][:10], "cap": 55 + 15 * len(valid)}

    def grounded(items: list[dict], fields: list[str]):
        out = []
        for it in items:
            c = cite(it["refs"])
            if c:
                out.append({**{f: clean(it[f]) for f in fields}, **({"confidence": min(it["confidence"], c["cap"])} if "confidence" in it else {}),
                            "evidence": c["evidence"], "occurred_on": c["occurred_on"]})
        return out

    return {
        "known": [clean(t) for t in s["known"][:6]], "top": [clean(t) for t in s["top_learnings"][:6]],
        "validated": grounded(s["validated"][:8], ["statement"]),
        "failed": grounded(s["failed"][:8], ["statement", "reason"]),
        "decisions": grounded(s["decisions"][:8], ["decision", "why"]),
        "memories_used": len(mems), "generated_on": date.today().isoformat(),
    }

"""Multi-agent boardroom: six board members debate over N rounds, then the Chair issues a verdict (LangGraph)."""
import operator
import re
import time
from typing import Annotated, Literal, TypedDict

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

import core
import demo
from agents import venture_text

AGENTS = {
    "ceo": ("CEO Agent", "vision, growth and the size of the opportunity",
            "You are an ambitious, visionary founder-CEO. Argue for the upside, the 10-year picture and why now, "
            "but stay honest about what must be true."),
    "investor": ("Investor Agent", "risk, return and scalability",
                 "You are a seasoned early-stage VC. Think in power laws, market size, unit economics, CAC vs LTV, "
                 "capital efficiency and exit potential."),
    "product": ("Product Agent", "user pain, retention and product-market fit",
                "You are a veteran product leader. Obsess over whether the pain is real, frequent and urgent, the core "
                "workflow, activation and retention."),
    "growth": ("Growth Agent", "acquisition, marketing and distribution",
               "You are a growth lead. Identify the one channel most likely to work, the wedge audience, virality, "
               "SEO/community/paid economics and launch tactics."),
    "technical": ("Technical Agent", "engineering, complexity, costs and execution",
                  "You are a pragmatic CTO. Assess build complexity, what the MVP needs, infrastructure and AI inference "
                  "costs, technical risk and time to ship."),
    "failure": ("Failure Agent", "why this will fail",
                "You are the Failure Agent: a relentless professional sceptic whose job is to kill bad ideas before they "
                "waste years. Aggressively attack every claim made by the other board members. Always address: why will "
                "this fail, which assumptions are wrong, why would users ignore it, why would investors reject it, why "
                "would competitors crush it, and why might monetization fail. Cite failure patterns. Never be polite for "
                "politeness' sake, but be specific and evidence-driven."),
}
ORDER = list(AGENTS)


class Turn(BaseModel):
    content: str = Field(description="What you say to the board: 2-4 short, plain-English sentences, under 70 words")
    key_point: str = Field(description="Your point in under 12 plain words a non-expert understands")
    stance: Literal["support", "concern", "oppose"]
    vote: Literal["GO", "PIVOT", "KILL"]


class Assumption(BaseModel):
    assumption: str = Field(description="Something that must be true for this to work, in plain words")
    risk: Literal["low", "medium", "high"]
    test: str = Field(description="The cheapest way to check it within 2 weeks, as a simple instruction anyone could follow")


class Verdict(BaseModel):
    decision: Literal["GO", "PIVOT", "KILL"] = Field(description="GO = build it now; PIVOT = keep the goal but change the approach; KILL = stop and move on")
    confidence: int = Field(ge=0, le=100)
    headline: str = Field(description="One plain-English sentence telling the founder what to do and why (max 25 words)")
    reasons: list[str] = Field(description="The 3 main reasons for the decision, each one short plain sentence")
    summary: str = Field(description="2-3 plain sentences explaining the decision")
    consensus: list[str] = Field(description="2-4 points the board agreed on, as short sentences (NOT names of board members)")
    disagreements: list[str] = Field(description="1-3 points the board disagreed on, as short sentences (NOT names of board members)")
    critical_assumptions: list[Assumption] = Field(description="3-4 riskiest things to check before spending money")
    next_steps: list[str] = Field(description="3 concrete actions for this week, in plain words")


class Board(TypedDict):
    venture: dict
    question: str
    context: str
    failure_context: str
    rounds: int
    round: int
    transcript: Annotated[list, operator.add]
    verdict: dict | None


def _transcript_text(transcript: list) -> str:
    return "\n".join(f"[Round {t['round']}] {t['name']}: {t['content']}" for t in transcript) or "(no one has spoken yet)"


def _clip(text: str, words: int = 110) -> str:
    """Hard cap on turn length, cut at a sentence boundary (models sometimes ramble or get cut off)."""
    text = re.sub(r"\s+", " ", text).strip()
    parts = re.split(r"(?<=[.!?])\s+", text)
    out = ""
    for p in parts:
        if len((out + " " + p).split()) > words and out:
            break
        out = (out + " " + p).strip()
    if not re.search(r"[.!?]$", out):  # truncated mid-sentence: drop the fragment
        full = re.split(r"(?<=[.!?])\s+", out)
        out = " ".join(full[:-1]) if len(full) > 1 else out.rstrip(",;:—- ") + "."
    return out


def member(key: str):
    name, focus, persona = AGENTS[key]

    def speak(s: Board):
        if not core.OPENAI:
            time.sleep(0.45)  # pace the offline stream so the debate reads like one
            turn = demo.board_turn(key, s["venture"], s["round"], s["rounds"])
        else:
            last = s["round"] == s["rounds"]
            task = (
                "Give your opening assessment from your lens." if s["round"] == 1
                else "Rebut specific points other members made this debate (name them). Update or defend your position."
            ) + (" This is the final round: make your final vote clear." if last else "")
            extra = f"\n\nFailure patterns from the library:\n{s['failure_context']}" if key == "failure" else ""
            turn = core.structured(
                Turn,
                f"You are the {name} on the Foundry AI boardroom. {persona}\nYour lens: {focus}.\nRules: speak in the "
                f"first person as the {name} — never refer to yourself in the third person; address other members by "
                f"role (e.g. 'Investor, ...'). Keep it under 70 words. {core.PLAIN} Be concrete and specific to this venture. Only "
                f"use numbers that appear in the context; if you need another number, frame it as an assumption to test. "
                f"Never invent statistics, costs or companies. Do not repeat points already made. Your stance and vote "
                f"must match what you argue.",
                f"Board question: {s['question']}\n\n{s['context']}{extra}\n\nDebate so far:\n"
                f"{_transcript_text(s['transcript'])}\n\nRound {s['round']} of {s['rounds']}. {task}",
                temperature=0.7,
                tier="heavy" if key == "failure" else "fast",
            ).model_dump()
            self_names = {"technical": "Technical|CTO", "failure": "Failure"}.get(key, name.replace(" Agent", ""))
            text = re.sub(rf"^(?:{self_names})(?: Agent)?(?: here)?[,:]\s*", "", turn["content"].strip())
            turn["content"] = _clip(text[:1].upper() + text[1:], 90)
        return {"transcript": [{"agent": key, "name": name, "round": s["round"], **turn}]}

    return speak


def next_round(s: Board):
    return {"round": s["round"] + 1}


def chair(s: Board):
    votes = {v: sum(t["vote"] == v for t in s["transcript"] if t["round"] == s["rounds"]) for v in ("GO", "PIVOT", "KILL")}
    if not core.OPENAI:
        verdict = demo.board_verdict(s["venture"], votes)
    else:
        verdict = core.structured(
            Verdict,
            "You are the Chair of the Foundry AI boardroom. Turn the debate into a clear decision a non-technical "
            "founder can act on. Follow the final-round majority unless it ignores a fatal, evidence-backed flaw. If "
            "the main risks are simply untested, do not KILL — choose GO or PIVOT and make testing them the next "
            "steps. Weigh the Failure Agent's objections seriously. Confidence reflects evidence quality, not "
            "enthusiasm. " + core.PLAIN,
            f"Board question: {s['question']}\n\n{s['context']}\n\nFinal-round votes: {votes}\n\nTranscript:\n"
            f"{_transcript_text(s['transcript'])}",
            temperature=0.3,
        ).model_dump()
    majority = max(votes, key=lambda v: (votes[v], v == "PIVOT"))
    if verdict["decision"] != majority and verdict["confidence"] < 60:
        # Overruling the board needs strong conviction; otherwise the majority stands.
        verdict["summary"] += f" (The Chair's objections were noted, but without strong evidence the board's majority vote — {majority} — stands.)"
        verdict["decision"] = majority
    return {"verdict": {**verdict, "votes": votes}}


def _build():
    g = StateGraph(Board)
    for key in ORDER:
        g.add_node(key, member(key))
    g.add_node("next_round", next_round)
    g.add_node("chair", chair)
    g.add_edge(START, ORDER[0])
    for a, b in zip(ORDER, ORDER[1:]):
        g.add_edge(a, b)
    g.add_conditional_edges(ORDER[-1], lambda s: "next_round" if s["round"] < s["rounds"] else "chair")
    g.add_edge("next_round", ORDER[0])
    g.add_edge("chair", END)
    return g.compile()


graph = _build()


def run(venture: dict, question: str, rounds: int, validation: dict | None, owner: str | None):
    mem = core.recall(venture["id"], question, k=6)
    lib = core.search_knowledge(f"{question} {venture['idea']}", owner, k=3)
    fails = core.search_knowledge(f"why startups fail {venture['idea']}", owner, k=3)
    scores = "Validation: not run yet — evidence is limited."
    if validation:
        scores = f"Validation ({validation.get('overall')}/100, {validation.get('verdict')}): " + "; ".join(
            f"{k.replace('_', ' ')} {validation[k]['score']} — {validation[k]['summary']}"
            for k in ("demand", "competition", "defensibility", "revenue_potential", "founder_fit") if k in validation
        )
        if validation.get("key_risks"):
            scores += "\nKey risks: " + "; ".join(validation["key_risks"])
        if validation.get("competitors"):
            scores += "\nKnown competitors: " + "; ".join(f"{c['name']} — {c['description']}" for c in validation["competitors"][:6])
    context = (
        f"{venture_text(venture)}\n{scores}\n\nVenture memory:\n{core.context_block(mem, 'Memory')}\n\n"
        f"Startup library:\n{core.context_block(lib, 'Library')}"
    )
    state = {"venture": venture, "question": question, "context": context,
             "failure_context": core.context_block(fails, "Library"),
             "rounds": rounds, "round": 1, "transcript": [], "verdict": None}
    yield {"type": "start", "members": [{"agent": k, "name": AGENTS[k][0], "focus": AGENTS[k][1]} for k in ORDER],
           "mode": core.MODE, "citations": list(dict.fromkeys(d["title"] for d in lib + fails))}
    for update in graph.stream(state, stream_mode="updates", config={"recursion_limit": 100}):
        for node, patch in update.items():
            if node in AGENTS:
                yield {"type": "message", "message": patch["transcript"][0]}
            elif node == "next_round":
                yield {"type": "round", "round": patch["round"]}
            elif node == "chair":
                yield {"type": "verdict", "verdict": patch["verdict"]}

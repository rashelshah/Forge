"""Chief of Staff: one synthesis of every module's output (validation, research, competitors, boardroom, experiments, prototype)
into the Founder Brief and the next recommended actions for the venture's current stage."""
import json
import re
import time
from typing import Literal

from pydantic import BaseModel, Field

import core

SOURCES = Literal["Validation Agent", "Research Agent", "Competitor Agent", "Boardroom Agent", "Experiment Agent", "MVP Architect", "Product Studio"]


class Brief(BaseModel):
    status: Literal["Promising", "Needs evidence", "At risk", "Not validated yet", "Ready to launch"]
    opportunity: str = Field(description="The biggest opportunity, one or two specific sentences grounded in the evidence")
    risk: str = Field(description="The single biggest risk, one or two specific sentences")
    recommendation: str = Field(description="The recommended direction: what to do next and why, one or two sentences")
    confidence: int = Field(ge=0, le=100, description="How confident you are in this recommendation given how much evidence exists")


class Action(BaseModel):
    title: str = Field(description="Imperative, at most 8 words, e.g. 'Interview 10 target students'")
    description: str = Field(description="What exactly to do, why now, and how the founder knows it is done (1-2 sentences)")
    priority: Literal["High", "Medium", "Low"]
    source: SOURCES = Field(description="The module whose evidence motivates this action")


class Out(BaseModel):
    brief: Brief
    actions: list[Action] = Field(description="4-6 actions in the order the founder should do them")


SYSTEM = (
    "You are the founder's AI Chief of Staff and venture partner. You read the outputs of every Foundry module for ONE venture and tell the "
    "founder, like a trusted advisor: is this worth pursuing, what to do next, how close it is to launch. Be specific to this venture and "
    "decisive. Rules: use only facts in the context (never invent numbers, customers or quotes); if evidence is thin say so and lower your "
    "confidence; do not repeat generic startup advice. Actions must fit the venture's stage and close the gaps listed under "
    "'readiness_missing' — e.g. during validation: talk to target users, test willingness to pay, find acquisition channels; while building: "
    "finalize MVP scope, finish onboarding, run a closed beta, track activation. Mark at most two actions High priority. "
    "Status meaning: Not validated yet = no validation run; At risk = validation or board is negative; Needs evidence = mixed or thin; "
    "Promising = evidence supports continuing; Ready to launch = validation, prototype and experiments are all supportive. " + core.PLAIN
)


def run(context: dict) -> dict:
    if not core.OPENAI:
        raise core.LLMError("The Chief of Staff needs an LLM: set GEMINI_API_KEY, GROQ_API_KEY or OPENAI_API_KEY")
    for attempt in range(3):
        try:
            out = core.structured(Out, SYSTEM, "Venture context:\n" + json.dumps(context, ensure_ascii=False)[:24000], tier="heavy", max_tokens=3000, temperature=0.4)
            return out.model_dump()
        except core.LLMError as e:  # free-tier rate limits: wait and retry instead of failing the page
            if attempt == 2 or not re.search(r"429|rate|quota|exhausted|overloaded|503", str(e), re.I):
                raise
            time.sleep(20 * (attempt + 1))

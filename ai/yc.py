"""Y Combinator directory (shared/YC-all-batches.csv): cleaned once, embedded once, searched in memory.

The file is a scrape of the most recent ~1,000 YC companies (mostly 2025-26 batches), not YC's whole history, and its batch/status columns are
polluted with job-posting text for about a third of the rows, so every field is parsed defensively. It is strong evidence for "who is building
something like this right now" and weak evidence about older or failed companies: context() says so, so agents don't overclaim.
~1,000 vectors fit in memory, so this does not touch Supabase and cannot crowd the Forge library out of its pgvector index.
# ponytail: brute-force cosine over a numpy matrix; move to its own pgvector table if the directory grows past ~50k rows.
"""
import collections
import csv
import hashlib
import json
import math
import re
import threading
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field

import core

CSV = core.ROOT / "shared" / "YC-all-batches.csv"
CACHE = Path(__file__).parent / ".yc_cache.json"
CANDIDATES = 30  # hybrid-ranked companies a model reviews for relevance; raw cosine alone can't separate relevant from "AI-native platform" boilerplate
SEASON = r"(?:Winter|Spring|Summer|Fall|Autumn)\s+20\d\d"

_state: dict = {"records": [], "vecs": None, "docs": [], "idf": {}, "error": None}
_judged: dict = {}
_ready = threading.Event()
_started = threading.Lock()
_begun = False


def _clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("\r", " ")).strip()


def _batch(r: dict) -> str | None:
    m = re.match(r"Batch:\s*(.+)$", r.get("batch", "") or "")
    if m and re.fullmatch(SEASON + r"|[WSFX]\d\d", m[1].strip()):
        return m[1].strip()
    m = re.search(r"Batch:\s*(" + SEASON + ")", r.get("batch", "") or "")
    return m[1] if m else None


def _load_records() -> list[dict]:
    out, seen = [], set()
    with open(CSV, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            name, link = _clean(r.get("name")), _clean(r.get("link"))
            if not name or link in seen:
                continue
            seen.add(link)
            year = re.search(r"(20\d\d|19\d\d)", r.get("founded", "") or "")
            status = re.search(r"Status:\s*(Active|Acquired|Public|Inactive)", r.get("status", "") or "")
            team = re.search(r"Team Size:\s*(\d+)", r.get("team-size", "") or "")
            loc = _clean(r.get("location"))
            out.append({
                "id": hashlib.sha1(link.encode()).hexdigest()[:16], "name": name, "one_liner": _clean(r.get("description")),
                "description": _clean(r.get("long-description")), "website": _clean(r.get("website-link")) or None, "yc_url": link or None,
                "location": loc or None, "country": _clean((r.get("country") or "").replace("Location:", "")) or None,
                "founded": int(year[1]) if year else None, "batch": _batch(r), "team": int(team[1]) if team else None,
                "status": status[1] if status else None,
            })
    return out


def _text(r: dict) -> str:
    return f"{r['name']}: {r['one_liner']}. {r['description'][:700]}"


STOP = set("the and for with that this from your you are our into their can all more every built build building platform software app apps tool tools ai powered native based help helps make makes using use new way world teams team companies company business businesses customers users people any who what how why when where over than also via per its has have will just not but they them out one two get got run runs end real time first best top modern next smart".split())


def _stem(w: str) -> str:
    for suf in ("ing", "ies", "es", "s", "ed"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[:-len(suf)] + ("y" if suf == "ies" else "")
    return w


def _toks(t: str) -> list[str]:
    return [_stem(w) for w in re.findall(r"[a-z]{3,}", t.lower()) if w not in STOP]


def _lexical(query: str) -> np.ndarray:
    """IDF-weighted keyword overlap with each company's name, one-liner (counted twice) and description."""
    qt, idf = set(_toks(query)), _state["idf"]
    return np.array([sum(idf.get(w, 0) * (1 + math.log(tf[w])) for w in qt if tf.get(w)) / (1 + 0.3 * math.log(1 + n)) for tf, n in _state["docs"]])


def _build():
    try:
        if not CSV.exists():
            _state["error"] = "shared/YC-all-batches.csv not found"
            return
        records = _load_records()
        digest = hashlib.sha1(CSV.read_bytes()).hexdigest()
        vecs = None
        if CACHE.exists():
            try:
                c = json.loads(CACHE.read_text())
                if c.get("hash") == digest and c.get("model") == core.EMBED_MODEL and len(c["vecs"]) == len(records):
                    vecs = np.array(c["vecs"], dtype=np.float32)
            except Exception:
                vecs = None
        if vecs is None:
            texts = [_text(r) for r in records]
            vecs = np.array([v for i in range(0, len(texts), 128) for v in core.embed(texts[i:i + 128])], dtype=np.float32)
            CACHE.write_text(json.dumps({"hash": digest, "model": core.EMBED_MODEL, "vecs": np.round(vecs, 5).tolist()}))
        toks = [_toks(f"{r['name']} {r['one_liner']} {r['one_liner']} {r['description'][:400]}") for r in records]
        df = collections.Counter(w for d in toks for w in set(d))
        _state.update(records=records, vecs=vecs, docs=[(collections.Counter(d), len(d)) for d in toks],
                      idf={w: math.log(1 + len(toks) / (1 + c)) for w, c in df.items()})
        print(f"YC directory ready: {len(records)} companies")
    except Exception as e:  # never take the AI service down over optional evidence
        _state["error"] = str(e)[:200]
        print("YC directory unavailable:", e)
    finally:
        _ready.set()


def start():
    """Index in a background thread at service start (a cached run takes ~1s, a first run ~30-90s on CPU)."""
    global _begun
    with _started:
        if _begun:
            return
        _begun = True
    threading.Thread(target=_build, daemon=True).start()


def _label(r: dict) -> str:
    bits = [f"YC {r['batch']}" if r["batch"] else (f"founded {r['founded']}" if r["founded"] else "YC"), r["status"], f"team {r['team']}" if r["team"] else None, r["location"]]
    return ", ".join(b for b in bits if b)


def candidates(query: str, n: int = CANDIDATES) -> list[dict]:
    """Hybrid retrieval: embedding rank and keyword rank fused (reciprocal rank), so both meaning and the idea's own domain words count."""
    start()
    if not _ready.wait(timeout=120) or _state["vecs"] is None or not query.strip():
        return []
    emb = _state["vecs"] @ np.array(core.embed_query(query), dtype=np.float32)
    lex = _lexical(query)
    fused = 1 / (60 + np.argsort(np.argsort(-emb))) + (1 / (60 + np.argsort(np.argsort(-lex)))) * (lex > 0)
    return [{**_state["records"][i], "score": round(float(emb[i]), 3)} for i in np.argsort(-fused)[:n]]


class Verdict(BaseModel):
    n: int = Field(description="The candidate number")
    relevance: Literal["direct", "adjacent", "unrelated"]
    reason: str = Field(description="At most 12 words, from the candidate's own text")


class Verdicts(BaseModel):
    verdicts: list[Verdict]


def _judge(query: str, cands: list[dict]) -> list[dict]:
    """A model decides which candidates are real competitors or prior art. Falls back to unverified keyword+meaning matches without an LLM."""
    if not core.OPENAI or not cands:
        return [{**c, "relevance": "unverified", "reason": ""} for c in cands if c["score"] >= 0.62][:8]
    block = "\n".join(f"{i + 1}. {c['name']} — {c['one_liner']} {c['description'][:180]}" for i, c in enumerate(cands))
    try:
        out = core.structured(Verdicts, (
            "You judge whether Y Combinator companies compete with, or are close prior art for, a startup idea. direct = does the same core job for an overlapping customer, so a buyer could plausibly choose it instead of this idea (a broader or narrower customer segment still counts); "
            "adjacent = same customer with a different job, or the same job done for a clearly different customer or in a different way; unrelated = anything else. Judge ONLY from the text given, be strict, and mark "
            "'AI-powered' companies in unrelated industries unrelated. Return a verdict for every candidate."),
            f"Idea: {query}\n\nCandidates:\n{block}", temperature=0, tier="heavy", max_tokens=3500)
    except Exception as e:  # relevance filtering is an upgrade, not a dependency
        print("YC judge failed:", str(e)[:160])
        return [{**c, "relevance": "unverified", "reason": ""} for c in cands if c["score"] >= 0.62][:8]
    by = {v.n: v for v in out.verdicts}
    kept = [{**c, "relevance": by[i + 1].relevance, "reason": by[i + 1].reason} for i, c in enumerate(cands) if i + 1 in by and by[i + 1].relevance != "unrelated"]
    return sorted(kept, key=lambda c: (c["relevance"] != "direct", -c["score"]))


def context(query: str, k: int = 8) -> dict:
    """Evidence for an idea: the YC companies that really overlap, with honest counts. {available, items, stats, text}; `text` drops straight into a prompt."""
    start()
    if not _ready.wait(timeout=120) or _state["vecs"] is None:
        return {"available": False, "items": [], "stats": {}, "text": "", "reason": _state["error"] or "still indexing"}
    key = hashlib.sha1(query.encode()).hexdigest()
    if key not in _judged:
        cands = candidates(query)
        _judged[key] = (len(cands), _judge(query, cands))
        if len(_judged) > 200:
            _judged.pop(next(iter(_judged)))
    reviewed, kept = _judged[key]
    items = kept[:k]
    stats = {"total": len(_state["records"]), "reviewed": reviewed, "direct": sum(c["relevance"] == "direct" for c in kept), "adjacent": sum(c["relevance"] == "adjacent" for c in kept),
             "recent": sum((c["founded"] or 0) >= 2025 for c in kept), "verified": all(c["relevance"] != "unverified" for c in kept)}
    lines = [f"[Y{n + 1}] {r['name']} ({_label(r)}) — {r['one_liner']} [{r['relevance']}{': ' + r['reason'] if r['reason'] else ''}] {r['website'] or r['yc_url'] or ''}".strip() for n, r in enumerate(items)]
    text = ("Y COMBINATOR DIRECTORY — real YC companies that overlap with this idea (cite by id, e.g. Y2, and only these):\n" + ("\n".join(lines) if lines else "(none of the closest YC companies overlap)")
            + f"\nCoverage: reviewed the {reviewed} closest of {stats['total']} indexed YC companies; {stats['direct']} direct and {stats['adjacent']} adjacent, {stats['recent']} founded 2025 or later."
            + "\nCaveat: the directory is mostly recent YC companies, so it shows who is building this now but little about older or failed startups; absence from it does not mean no competitor exists.")
    return {"available": True, "items": items, "stats": stats, "text": text}

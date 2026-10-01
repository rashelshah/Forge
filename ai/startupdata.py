"""Real startup data for every agent: named peer companies plus statistics computed in code, never guessed.

Loads the CSVs in shared/ (YC directory, early-YC outcomes, Crunchbase outcomes, India funding deals, unicorn lists, India startups, SaaS leaders), cleans them,
and answers one question per idea: who really overlaps with it (hybrid search + a relevance judge) and what do the datasets say about that market
(outcomes, funding, unicorns, deals), each fact carrying its sample size, period and caveat. Agents may quote only these peers and facts.

Deliberately NOT used: global_tech_startups_2026.csv (synthetic: no company names, zero impossible rows in 25,000, funding/headcount correlation 0.95),
Founders.csv (not needed; gender data), Startups.csv (an older subset of the unicorn list). Money fields of the SaaS and India-startups files are
ignored because they are unreliable (e.g. Oracle "$2K" funding, Paytm "$32M").
# ponytail: brute-force cosine over one numpy matrix (~6k rows); move to a pgvector table past ~50k rows.
"""
import collections
import concurrent.futures
import csv
import datetime
import hashlib
import io
import json
import math
import re
import statistics
import threading
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field

import core

SHARED = core.ROOT / "shared"
CACHE = Path(__file__).parent / ".startupdata_cache"
CANDIDATES = 40  # entities a model reviews for relevance
SMALL = 8  # below this many companies a rate is flagged as too small to generalise
MIN_N = 5  # below this a statistic is not reported at all

_state: dict = {"data": {}, "recs": [], "vecs": None, "digest": "", "docs": [], "idf": {}, "error": None}
_ready, _lock, _begun = threading.Event(), threading.Lock(), [False]
_cache: dict = {}
JUDGED = Path(__file__).parent / ".startupdata_judged.json"


# ---------------------------------------------------------------- parsing helpers

def _rows(name: str) -> list[dict]:
    raw = (SHARED / name).read_bytes()
    try:
        txt = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        txt = raw.decode("latin-1")
    csv.field_size_limit(10**9)
    return [{(k or "").replace("\xa0", " ").strip(): (v or "").replace("\xa0", " ").strip() for k, v in r.items()} for r in csv.DictReader(io.StringIO(txt))]


def _clean(s) -> str:
    s = re.sub(r"\\+x[0-9a-fA-F]{2}", " ", str(s or ""))  # the CSVs contain literal "\\xc2\\xa0" text
    return re.sub(r"\s+", " ", s.replace("\r", " ").replace("\\n", " ")).strip()


def _num(s) -> float | None:
    """'20,00,00,000' (Indian grouping), '$1200000', '1.5' -> float; 'N/A', 'undisclosed', '' -> None."""
    d = re.sub(r"[^\d.]", "", str(s or ""))
    return float(d) if re.fullmatch(r"\d+(\.\d+)?", d) and not re.search(r"n/?a|undisclosed|unknown", str(s), re.I) else None


def _year(s) -> int | None:
    m = re.search(r"\b(19[89]\d|20[0-3]\d)\b", str(s or ""))
    return int(m[1]) if m else None


def _day(s, order: str) -> datetime.date | None:
    m = re.search(r"(\d{1,2})\D+(\d{1,2})\D+(\d{4})", str(s or "")) or re.search(r"(\d{2})/(\d{2})(\d{4})", str(s or ""))
    if not m:
        return None
    a, b, y = int(m[1]), int(m[2]), int(m[3])
    try:
        return datetime.date(y, b, a) if order == "dmy" else datetime.date(y, a, b)
    except ValueError:
        return None


def _key(name: str) -> str:
    n = re.sub(r"[\^*#]", "", name.lower())
    n = re.sub(r"\b(inc|ltd|llc|pvt|private|limited|technologies|technology|labs|co)\b\.?", "", n)
    return re.sub(r"[^a-z0-9]", "", n)


def _usd(x: float | None) -> str:
    if x is None:
        return "n/a"
    return f"${x / 1e9:.1f}B" if x >= 1e9 else f"${x / 1e6:.1f}M" if x >= 1e6 else f"${x / 1e3:.0f}K"


def _pct(a: int, n: int) -> str:
    return f"{round(100 * a / n)}%" if n else "n/a"


def _med(xs: list[float]) -> float | None:
    return statistics.median(xs) if xs else None


# ---------------------------------------------------------------- loaders: each returns records with common keys

def _rec(source: str, name: str, text: str, **kw) -> dict:
    return {"source": source, "name": name, "text": _clean(text), "outcome": None, "year": None, "batch": None, "location": None, "website": None, "valuation_b": None,
            "valuation_date": None, "investors": [], "funding_usd": None, "n_deals": None, "employees": None, "category": [], "industry": None, **kw}


def _load_yc_recent() -> list[dict]:
    out, seen = [], set()
    for r in _rows("YC-all-batches.csv"):
        name, link = _clean(r.get("name")), _clean(r.get("link"))
        if not name or link in seen:
            continue
        seen.add(link)
        b = re.match(r"Batch:\s*((?:Winter|Spring|Summer|Fall|Autumn)\s+20\d\d|[WSFX]\d\d)$", r.get("batch", ""))
        st = re.search(r"Status:\s*(Active|Acquired|Public|Inactive)", r.get("status", ""))
        status = st[1] if st else None
        out.append(_rec("yc_recent", name, f"{_clean(r.get('description'))}. {_clean(r.get('long-description'))[:600]}", year=_year(r.get("founded")), batch=b[1] if b else None,
                        outcome={"Active": "operating", "Acquired": "exited", "Public": "exited", "Inactive": "dead"}.get(status), status_raw=status,
                        location=_clean(r.get("location")) or None, website=_clean(r.get("website-link")) or None, yc_url=link or None,
                        employees=int(m[1]) if (m := re.search(r"Team Size:\s*(\d+)", r.get("team-size", ""))) else None, one_liner=_clean(r.get("description"))))
    return out


def _load_yc_historic() -> list[dict]:
    out = []
    for r in _rows("Startupsss.csv"):
        name = _clean(r.get("Company"))
        if not name:
            continue
        amounts = [float(x) for x in re.findall(r"\$\s*(\d+)", (r.get("Amounts raised in different funding rounds") or "").replace(",", ""))]
        tags = [t.strip().lower() for t in (r.get("Categories") or "").split(",") if t.strip()]
        out.append(_rec("yc_historic", name, f"{_clean(r.get('Description'))}. {', '.join(tags)}", year=_year(r.get("Year Founded")), batch=f"YC {r.get('Y Combinator Session', '')} {r.get('Y Combinator Year', '')}".strip(),
                        yc_year=_year(r.get("Y Combinator Year")), outcome={"operating": "operating", "dead": "dead", "exited": "exited"}.get((r.get("Satus") or "").lower()), category=tags,
                        location=_clean(r.get("Mapping Location")) or None, website=_clean(r.get("Website")) or None, funding_usd=sum(amounts) or None,
                        investors=[i.strip() for i in (r.get("Investors") or "").split(",") if i.strip()][:6], one_liner=_clean(r.get("Description"))[:160]))
    return out


def _load_india_startups() -> list[dict]:
    # Funding, rounds and investor counts in this file are incomplete (Paytm: $32M), so only descriptive fields are kept.
    return [_rec("india_startups", _clean(r["Company"]), f"{_clean(r.get('Description'))}. {_clean(r.get('Industries'))}", year=_year(r.get("Starting Year")), location=_clean(r.get("City")) or None,
                 employees=r.get("No. of Employees") or None, category=[t.strip().lower() for t in (r.get("Industries") or "").split(",") if t.strip()], one_liner=_clean(r.get("Description"))[:160])
            for r in _rows("Startups1.csv") if _clean(r.get("Company"))]


def _load_saas() -> list[dict]:
    # Money fields (funding/ARR/valuation) are inconsistent in this file and are deliberately dropped.
    return [_rec("saas_leaders", _clean(r["Company Name"]), f"{_clean(r.get('Product'))}. {_clean(r.get('Industry'))}", year=_year(r.get("Founded Year")), location=_clean(r.get("HQ")) or None,
                 industry=_clean(r.get("Industry")), g2=r.get("G2 Rating") or None, one_liner=_clean(r.get("Product"))[:160]) for r in _rows("top_100_saas_companies_2025.csv") if _clean(r.get("Company Name"))]


def _vertical(s: str) -> str | None:
    v = _clean(s).lower().replace("e-commerce", "ecommerce").replace("ed-tech", "edtech")
    return None if v in ("", "nan", "n/a") else v


def _load_deals() -> tuple[list[dict], list[dict]]:
    """Deal rows (for market statistics) and one aggregated record per startup (for peer search)."""
    deals = []
    for r in _rows("startup_funding.csv"):
        name = _clean(r.get("Startup Name"))
        if not name:
            continue
        deals.append({"name": name, "date": _day(r.get("Date dd/mm/yyyy"), "dmy"), "vertical": _vertical(r.get("Industry Vertical")), "sub": _clean(r.get("SubVertical")),
                      "city": _clean(r.get("City  Location") or r.get("City Location")), "investors": [i.strip() for i in re.split(r",|;", r.get("Investors Name") or "") if i.strip()],
                      "type": re.sub(r"\s*/\s*", "/", _clean(r.get("InvestmentnType"))).lower() or None, "usd": _num(r.get("Amount in USD"))})
    by = collections.defaultdict(list)
    for d in deals:
        by[_key(d["name"])].append(d)
    recs = []
    for ds in by.values():
        verts = collections.Counter(d["vertical"] for d in ds if d["vertical"])
        subs = collections.Counter(d["sub"] for d in ds if d["sub"])
        disclosed = [d["usd"] for d in ds if d["usd"]]
        inv = collections.Counter(i for d in ds for i in d["investors"])
        recs.append(_rec("india_deals", ds[0]["name"], f"{' / '.join(x for x in (verts.most_common(1)[0][0] if verts else '', subs.most_common(1)[0][0] if subs else '') if x)}",
                         year=min((d["date"].year for d in ds if d["date"]), default=None), location=next((d["city"] for d in ds if d["city"]), None) or None, investors=[i for i, _ in inv.most_common(5)],
                         funding_usd=sum(disclosed) or None, n_deals=len(ds), industry=verts.most_common(1)[0][0] if verts else None, one_liner=""))
    return deals, recs


def _load_crunchbase() -> list[dict]:
    out = []
    for r in _rows("startup data.csv"):
        st = (r.get("status") or "").lower()
        if st not in ("acquired", "closed") or not r.get("name"):
            continue
        out.append(_rec("crunchbase_us", _clean(r["name"]), r.get("category_code", ""), year=_day(r.get("founded_at"), "mdy").year if _day(r.get("founded_at"), "mdy") else None,
                        closed_year=_day(r.get("closed_at"), "mdy").year if _day(r.get("closed_at"), "mdy") else None, outcome="exited" if st == "acquired" else "dead",
                        funding_usd=_num(r.get("funding_total_usd")), n_rounds=int(float(r["funding_rounds"])) if r.get("funding_rounds") else None, category=[r.get("category_code", "")],
                        location=", ".join(x for x in (r.get("city"), r.get("state_code")) if x) or None))
    return out


def _load_unicorns() -> list[dict]:
    out = []
    for r in _rows("unicorns till sep 2022.csv"):
        v, d = _num(r.get("Valuation ($B)")), _day(r.get("Date Joined"), "mdy")
        out.append(_rec("unicorns", _clean(r["Company"]), r.get("Industry", ""), valuation_b=v, valuation_date=d.isoformat() if d else None, year=None, industry=r.get("Industry"),
                        location=", ".join(x for x in (r.get("City"), r.get("Country")) if x), country=r.get("Country"), joined_year=d.year if d else None,
                        investors=[i.strip() for i in (r.get("Investors") or "").split(",") if i.strip()][:5], one_liner=r.get("Industry", "")))
    return out


def _load_india_unicorns() -> list[dict]:
    out = []
    for r in _rows("Indian Unicorn startups 2023 updated.csv"):
        name = re.sub(r"[\^*#]+$", "", _clean(r.get("Company")))
        out.append(_rec("india_unicorns", name, r.get("Sector", ""), valuation_b=_num(r.get("Valuation ($B)")), valuation_date="2023", industry=r.get("Sector"), location=r.get("Location"),
                        country="India", investors=[i.strip() for i in (r.get("Select Investors") or "").split(",") if i.strip()][:5], one_liner=r.get("Sector", "")))
    return out


LABELS = {
    "yc_recent": "YC directory (recent batches)", "yc_historic": "Early YC companies, 2005-2014 (with outcomes)", "india_startups": "Indian startups list", "saas_leaders": "Top SaaS companies 2025",
    "india_deals": "Indian startup funding deals 2015-2020", "crunchbase_us": "Crunchbase US startups (outcomes, to 2013)", "unicorns": "Global unicorns to Sep 2022", "india_unicorns": "Indian unicorns 2023",
}
PEER_SOURCES = ["yc_recent", "yc_historic", "india_startups", "saas_leaders", "india_deals", "unicorns", "india_unicorns"]
OUTCOME_NOTE = {"yc_historic": "as of the dataset snapshot (about 2015), not today", "yc_recent": "as listed in the YC directory", "crunchbase_us": "final outcome up to 2013"}


def _coverage(data: dict) -> list[dict]:
    cov = []
    for sid, recs in data.items():
        if sid == "_deals":
            continue
        yrs = [r["year"] for r in recs if r.get("year")] or [r.get("joined_year") for r in recs if r.get("joined_year")]
        cov.append({"id": sid, "label": LABELS[sid], "n": len(recs), "years": f"{min(yrs)}-{max(yrs)}" if yrs else None})
    return cov


# ---------------------------------------------------------------- lexical + embedding index

STOP = set("the and for with that this from your you are our into their can all more every built build building platform software app apps tool tools ai powered native based help helps make makes using use new way world teams team companies company business businesses customers users people any who what how why when where over than also via per its has have will just not but they them out one two get got run runs end real time first best top modern next smart".split())


def _stem(w: str) -> str:
    for suf in ("ing", "ies", "es", "s", "ed"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[:-len(suf)] + ("y" if suf == "ies" else "")
    return w


def _toks(t: str) -> list[str]:
    return [_stem(w) for w in re.findall(r"[a-z]{3,}", t.lower()) if w not in STOP]


def _lexical(query: str) -> np.ndarray:
    qt, idf = set(_toks(query)), _state["idf"]
    return np.array([sum(idf.get(w, 0) * (1 + math.log(tf[w])) for w in qt if tf.get(w)) / (1 + 0.3 * math.log(1 + n)) for tf, n in _state["docs"]])


def _build():
    try:
        files = sorted(p for p in SHARED.glob("*.csv") if p.name != "global_tech_startups_2026.csv")
        loaders = {"yc_recent": _load_yc_recent, "yc_historic": _load_yc_historic, "india_startups": _load_india_startups, "saas_leaders": _load_saas, "crunchbase_us": _load_crunchbase,
                   "unicorns": _load_unicorns, "india_unicorns": _load_india_unicorns}
        data = {}
        for sid, fn in loaders.items():
            try:
                data[sid] = fn()
            except Exception as e:  # a missing or malformed file removes that source, nothing else
                print(f"startup data: {sid} unavailable ({str(e)[:100]})")
        try:
            deals, deal_recs = _load_deals()
            data["_deals"], data["india_deals"] = deals, deal_recs
        except Exception as e:
            print(f"startup data: india_deals unavailable ({str(e)[:100]})")
        recs = [r for sid in PEER_SOURCES for r in data.get(sid, []) if r["text"] or r["industry"]]
        texts = [f"{r['name']}: {r['text']}" for r in recs]
        digest = hashlib.sha1(("".join(p.name + str(p.stat().st_size) for p in files) + core.EMBED_MODEL + str(len(texts))).encode()).hexdigest()
        meta, npy = Path(str(CACHE) + ".json"), Path(str(CACHE) + ".npy")
        vecs = None
        if meta.exists() and npy.exists() and json.loads(meta.read_text()).get("hash") == digest:
            vecs = np.load(npy).astype(np.float32)
        if vecs is None or len(vecs) != len(recs):
            vecs = np.array([v for i in range(0, len(texts), 128) for v in core.embed(texts[i:i + 128])], dtype=np.float32)
            np.save(npy, vecs.astype(np.float16))
            meta.write_text(json.dumps({"hash": digest}))
        _state["digest"] = digest
        toks = [_toks(t + " " + (r["name"])) for t, r in zip(texts, recs)]
        df = collections.Counter(w for d in toks for w in set(d))
        _state.update(data=data, recs=recs, vecs=vecs, docs=[(collections.Counter(d), len(d)) for d in toks], idf={w: math.log(1 + len(toks) / (1 + c)) for w, c in df.items()})
        print(f"startup data ready: {sum(len(v) for k, v in data.items() if k != '_deals')} records, {len(recs)} searchable, sources: {', '.join(k for k in data if k != '_deals')}")
    except Exception as e:  # optional evidence must never take the AI service down
        _state["error"] = str(e)[:200]
        print("startup data unavailable:", e)
    finally:
        _ready.set()


def start():
    """Index in a background thread at service start (cached: about a second; first build: a few minutes on CPU)."""
    with _lock:
        if _begun[0]:
            return
        _begun[0] = True
    threading.Thread(target=_build, daemon=True).start()


# ---------------------------------------------------------------- peers: hybrid retrieval, cross-source merge, relevance judge

def _entities(query: str, n_records: int = 70) -> list[dict]:
    emb = _state["vecs"] @ np.array(core.embed_query(query), dtype=np.float32)
    lex = _lexical(query)
    fused = 1 / (60 + np.argsort(np.argsort(-emb))) + (1 / (60 + np.argsort(np.argsort(-lex)))) * (lex > 0)
    merged: dict[str, dict] = {}
    for i in np.argsort(-fused)[:n_records]:
        r = _state["recs"][i]
        k = _key(r["name"])
        e = merged.get(k)
        if e and r["source"] in e["srcs"]:  # same name twice within one source = two different companies
            k = f"{k}#{r.get('location') or i}"
            e = merged.get(k)
        if not e:
            e = merged[k] = {"name": r["name"], "srcs": {}, "score": 0.0}
        e["srcs"][r["source"]] = r
        e["score"] = max(e["score"], float(emb[i]))
    out = []
    for e in merged.values():
        rs = list(e["srcs"].values())
        best = max(rs, key=lambda r: len(r["text"]))
        pick = lambda f: next((r[f] for r in rs if r.get(f) not in (None, [], "")), None)
        outcome_rec = next((r for r in rs if r["outcome"]), None)
        out.append({"name": e["name"], "text": best["text"], "one_liner": best.get("one_liner") or best["text"][:140], "sources": [LABELS[s] for s in e["srcs"]], "source_ids": list(e["srcs"]),
                    "outcome": outcome_rec["outcome"] if outcome_rec else None, "outcome_note": OUTCOME_NOTE.get(outcome_rec["source"]) if outcome_rec else None,
                    "year": pick("year"), "batch": pick("batch"), "location": pick("location"), "website": pick("website"), "yc_url": pick("yc_url"), "valuation_b": pick("valuation_b"),
                    "valuation_date": pick("valuation_date"), "investors": next((r["investors"] for r in rs if r["investors"]), []), "funding_usd": next((r["funding_usd"] for r in rs if r["source"] in ("yc_historic", "india_deals", "crunchbase_us") and r["funding_usd"]), None),
                    "funding_note": next(({"yc_historic": "disclosed rounds in the dataset", "india_deals": f"disclosed deals 2015-2020 ({r['n_deals']} deals)", "crunchbase_us": "total funding"}[r["source"]] for r in rs if r["source"] in ("yc_historic", "india_deals", "crunchbase_us") and r["funding_usd"]), None),
                    "employees": pick("employees"), "score": round(e["score"], 3),
                    "labels": {"unicorns": [r["industry"] for r in rs if r["source"] == "unicorns" and r["industry"]], "deals": [r["industry"] for r in rs if r["source"] == "india_deals" and r["industry"]],
                               "yc_tags": [t for r in rs if r["source"] == "yc_historic" for t in r["category"]]}})
    return sorted(out, key=lambda x: -x["score"])[:CANDIDATES]


Model = Literal["marketplace", "retailer", "b2b_supplier", "software", "service", "other"]
# Which business models can really compete: a platform connecting people (marketplace, or a service delivered through one) vs a retailer selling its own stock vs B2B suppliers vs software tools.
FAMILY = {"marketplace": "platform", "service": "platform", "retailer": "retail", "b2b_supplier": "b2b", "software": "software", "other": "other"}


class Verdict(BaseModel):
    n: int = Field(description="The candidate number")
    relevance: Literal["direct", "adjacent", "unrelated"]
    model: Model = Field(description="The candidate's business model: marketplace (connects buyers and sellers/providers), retailer (sells its own stock), b2b_supplier, software (a tool or SaaS), service (provides the service itself), other")
    reason: str = Field(description="At most 12 words, from the candidate's own text")


class Verdicts(BaseModel):
    idea_model: Model = Field(description="The business model of the IDEA itself, by the same definitions")
    verdicts: list[Verdict]


RANK = {"unrelated": 0, "adjacent": 1, "direct": 2}


def _pass(query: str, cands: list[dict], models: list[str]) -> dict[int, tuple[str, str]] | None:
    """One judging pass: {candidate index: (relevance, reason)} for every candidate, or None when the model failed."""
    block = "\n".join(f"{i + 1}. {c['name']} — {c['text'][:200]}" for i, c in enumerate(cands))
    try:
        out = core.structured(Verdicts, (
            "You judge whether companies compete with, or are close prior art for, a startup idea. direct = does the same core job for an overlapping customer, so a buyer could plausibly choose it instead of "
            "this idea (a broader or narrower customer segment still counts); adjacent = same customer with a different job, or the same job done for a clearly different customer or in a different way; "
            "unrelated = anything else. Compare the BUSINESS MODEL as well as the product: who sells to whom, and who the customer is. A retailer, grocer or delivery service is NOT direct for a "
            "peer-to-peer swap marketplace; a B2B supplier is NOT direct for a consumer product; a tutoring marketplace is NOT direct for a school-management tool. When the product is similar but the "
            "BUSINESS MODEL differs (retailer vs peer-to-peer, B2B vs consumer, marketplace vs software), the answer is adjacent; the same kind of product aimed at a broader or narrower customer segment stays direct "
            "(a CRM for startups is direct for a CRM for consultants). Reserve direct for companies a founder would genuinely lose customers to. Judge ONLY from the text given, be strict, and mark companies in "
            "unrelated industries unrelated even if they say 'AI'. Return a verdict for every candidate."),
            f"Idea: {query}\n\nCandidates:\n{block}", temperature=0, models=models, max_tokens=4500)
    except Exception as e:
        print("peer judge pass failed:", str(e)[:160])
        return None
    res = {}
    for v in out.verdicts:
        rel, reason = v.relevance, v.reason
        # The model extracts the business model; this rule decides: a direct competitor must share the idea's model family.
        if rel == "direct" and "other" not in (v.model, out.idea_model) and FAMILY[v.model] != FAMILY[out.idea_model]:
            rel, reason = "adjacent", f"{v.model.replace('_', ' ')}, while this idea is a {out.idea_model.replace('_', ' ')}"
        res[v.n - 1] = (rel, reason)
    return res


def _judge(query: str, cands: list[dict]) -> list[dict]:
    """Two independent passes; the more cautious verdict wins, so 'direct' needs both to agree. Falls back to unverified matches without an LLM."""
    unverified = lambda: [{**c, "relevance": "unverified", "reason": ""} for c in cands if c["score"] >= 0.62][:8]
    if not core.OPENAI or not cands:
        return unverified()
    # Two different model chains: separate free-tier quotas (so validation's own call is not starved) and genuinely independent judges.
    chains = [core.HEAVY + core.GEMINI_FALLBACK, (core.GEMINI_FALLBACK + core.FAST + core.HEAVY) if core.GEMINI_FALLBACK else core.FAST + core.HEAVY]
    with concurrent.futures.ThreadPoolExecutor(2) as ex:
        runs = [r for r in ex.map(lambda m: _pass(query, cands, m), chains) if r]
    if not runs:
        return unverified()
    kept = []
    for i, c in enumerate(cands):
        vs = [r[i] for r in runs if i in r]
        if len(vs) < len(runs):
            continue  # a pass skipped it
        rel, reason = min(vs, key=lambda v: RANK[v[0]])
        if rel != "unrelated":
            kept.append({**c, "relevance": rel, "reason": reason})
    return sorted(kept, key=lambda c: (c["relevance"] != "direct", -c["score"]))


# ---------------------------------------------------------------- market statistics: a model only picks labels, code does every count

class Segments(BaseModel):
    crunchbase: list[str] = Field(default=[], description="Labels from the crunchbase list that clearly describe the idea's market (max 3)")
    unicorns: list[str] = Field(default=[], description="Labels from the unicorn industry list (max 3)")
    deals: list[str] = Field(default=[], description="Labels from the India funding-deal verticals list (max 3)")
    yc_tags: list[str] = Field(default=[], description="Labels from the early-YC category tags list (max 3)")


# Technology and catch-all labels describe HOW something is built, not WHO it serves; counting them would say nothing about a specific idea.
GENERIC = {"software", "web", "mobile", "enterprise", "network_hosting", "semiconductor", "hardware", "other", "others", "technology", "consumer internet", "internet software & services",
           "artificial intelligence", "enterprise software", "saas", "internet", "analytics", "data management & analytics", "cybersecurity", "apps", "b2b", "technology & software", "software development",
           "information technology", "mobile apps", "web development", "cloud computing", "consumer", "consumer & retail", "business", "services"}


def _vocab() -> dict:
    d = _state["data"]
    top = lambda c, n, m: [k for k, v in c.most_common(n) if v >= m]
    cb = collections.Counter(r["category"][0] for r in d.get("crunchbase_us", []) if r["category"] and r["category"][0] != "other")
    uni = collections.Counter(r["industry"] for r in d.get("unicorns", []) if r["industry"])
    dl = collections.Counter(x["vertical"] for x in d.get("_deals", []) if x["vertical"])
    tags = collections.Counter(t for r in d.get("yc_historic", []) for t in r["category"])
    keep = lambda labels: [x for x in labels if x.lower() not in GENERIC]
    return {"crunchbase": keep(top(cb, 40, 3)), "unicorns": keep(top(uni, 40, 1)), "deals": keep(top(dl, 60, 5)), "yc_tags": keep(top(tags, 100, 4))}


def _segments(query: str) -> dict:
    if not core.OPENAI:
        return {}
    v = _vocab()
    try:
        out = core.structured(Segments, "Map a startup idea onto the category labels of several datasets. The market is the customer's problem domain (education, health, logistics, food, travel, finance, real estate...), "
                              "NOT the technology (AI, software, SaaS, apps, platform). Choose ONLY labels copied exactly from each list that name the market the idea competes in; max 2 per list, and an empty list "
                              "whenever no label names this market. Choosing nothing is better than choosing something loose. Never invent a label.",
                              f"Idea: {query}\n\n" + "\n".join(f"{k} labels: {', '.join(vals)}" for k, vals in v.items()), temperature=0, tier="fast", max_tokens=600)
    except Exception as e:
        print("segment mapping failed:", str(e)[:120])
        return {}
    return {"crunchbase": [x for x in out.crunchbase if x in v["crunchbase"]][:2], "unicorns": [x for x in out.unicorns if x in v["unicorns"]][:2],
            "deals": [x for x in out.deals if x in v["deals"]][:2], "yc_tags": [x for x in out.yc_tags if x in v["yc_tags"]][:2]}


def _confirm(peers: list[dict], seg: dict) -> dict:
    """Keep a market label only if at least two overlapping companies actually carry it in that dataset (a loose model pick must not become a 'fact').
    Crunchbase has no searchable peers, so its label must be corroborated by a confirmed label from another dataset."""
    near = [p for p in peers if p["relevance"] in ("direct", "adjacent")]
    out = {}
    for key in ("unicorns", "deals", "yc_tags"):
        have = collections.Counter(l for p in near for l in set(p.get("labels", {}).get(key, [])))
        out[key] = [l for l in seg.get(key, []) if have[l] >= 2]
    norm = lambda x: re.sub(r"[^a-z]", "", x.lower().replace("medical", "health").replace("healthcare", "health").replace("care", ""))
    confirmed = {norm(l) for k in out.values() for l in k}
    out["crunchbase"] = [l for l in seg.get("crunchbase", []) if any(norm(l) in c or c in norm(l) for c in confirmed if len(c) > 2)]
    return out


def _facts(peers: list[dict], seg: dict) -> list[dict]:
    d, facts = _state["data"], []
    add = lambda source, title, text, n, caveat="", sid="": facts.append({"id": f"F{len(facts) + 1}", "sid": sid, "source": source, "title": title, "text": text, "n": n, "caveat": caveat})

    labels = seg.get("yc_tags") or []
    rows = [r for r in d.get("yc_historic", []) if set(r["category"]) & set(labels) and r["outcome"]]
    if len(rows) >= MIN_N:
        c = collections.Counter(r["outcome"] for r in rows)
        dead = [r for r in rows if r["outcome"] == "dead"]
        ex = "; ".join(f"{r['name']} (YC {r['yc_year']})" for r in sorted(dead, key=lambda r: -(r["funding_usd"] or 0))[:4])
        add(LABELS["yc_historic"], f"Early YC companies tagged {', '.join(labels)}", f"{len(rows)} early YC companies (2005-2014) carry these tags: {c['dead']} dead ({_pct(c['dead'], len(rows))}), {c['exited']} exited ({_pct(c['exited'], len(rows))}), "
            f"{c['operating']} operating ({_pct(c['operating'], len(rows))})." + (f" Dead examples: {ex}." if ex else ""), len(rows),
            "Status is as of the dataset snapshot (about 2015), not today; covers only YC companies; describes the whole segment, not this specific niche" + ("; too few companies to generalise" if len(rows) < SMALL else ""))

    labels = seg.get("crunchbase") or []
    rows = [r for r in d.get("crunchbase_us", []) if r["category"][0] in labels]
    if len(rows) >= MIN_N:
        acq, clo = [r for r in rows if r["outcome"] == "exited"], [r for r in rows if r["outcome"] == "dead"]
        f = lambda rs: _usd(_med([r["funding_usd"] for r in rs if r["funding_usd"]]))
        top_closed = "; ".join(f"{r['name']} ({_usd(r['funding_usd'])})" for r in sorted(clo, key=lambda r: -(r["funding_usd"] or 0))[:3])
        add(LABELS["crunchbase_us"], f"US funded startups in {', '.join(labels)}", f"Of {len(rows)} funded US startups in these categories that reached an outcome by 2013, {len(acq)} were acquired ({_pct(len(acq), len(rows))}) and {len(clo)} closed "
            f"({_pct(len(clo), len(rows))}). Median funding raised: {f(acq)} for acquired, {f(clo)} for closed." + (f" Biggest closures: {top_closed}." if top_closed else ""), len(rows),
            "Only startups that were acquired or closed are in this file (still-operating ones are absent), US only, outcomes up to 2013; describes the whole segment, not this specific niche" + ("; too few companies to generalise" if len(rows) < SMALL else ""))

    labels = seg.get("unicorns") or []
    rows = [r for r in d.get("unicorns", []) if r["industry"] in labels]
    if len(rows) >= MIN_N:
        top = sorted(rows, key=lambda r: -(r["valuation_b"] or 0))[:5]
        cc = collections.Counter(r.get("country") for r in rows).most_common(3)
        byy = collections.Counter(r["joined_year"] for r in rows if r["joined_year"])
        add(LABELS["unicorns"], f"Unicorns in {', '.join(labels)}", f"{len(rows)} companies in these industries became unicorns (valued over $1B) by Sep 2022; median valuation ${_med([r['valuation_b'] for r in rows if r['valuation_b']]):.1f}B. "
            f"Largest: {'; '.join(f'{r['name']} (${r['valuation_b']:g}B)' for r in top)}. Top countries: {', '.join(f'{c} {n}' for c, n in cc)}. Joined per year: "
            f"{', '.join(f'{y}: {byy[y]}' for y in sorted(byy)[-4:])} (2022 is a partial year).", len(rows), "Valuations as of the date each company joined the list; list ends Sep 2022; describes the whole segment, not this specific niche")

    labels = seg.get("deals") or []
    rows = [x for x in d.get("_deals", []) if x["vertical"] in labels]
    if len(rows) >= MIN_N:
        disclosed = [x["usd"] for x in rows if x["usd"]]
        yrs = collections.Counter(x["date"].year for x in rows if x["date"])
        allyrs = collections.Counter(x["date"].year for x in d.get("_deals", []) if x["date"])
        inv = collections.Counter(i for s in {x["name"]: x for x in rows}.values() for i in s["investors"][:3] if not re.search(r"undisclosed|unknown|n/a", i, re.I))
        add(LABELS["india_deals"], f"Indian funding deals in {', '.join(labels)}", f"{len(rows)} funding deals across {len({_key(x['name']) for x in rows})} Indian startups in these verticals; {len(disclosed)} disclosed amounts totalling {_usd(sum(disclosed))}, "
            f"median disclosed deal {_usd(_med(disclosed))}. Deals per year: {', '.join(f'{y}: {yrs[y]}' for y in sorted(yrs))}. Most active investors: {', '.join(f'{i} ({n})' for i, n in inv.most_common(4))}.", len(rows),
            f"Describes the whole vertical, not this specific niche. {round(100 * (len(rows) - len(disclosed)) / len(rows))}% of deal amounts are undisclosed. The file records 2015-2020 but coverage collapses after 2017 (all deals per year: "
            f"{', '.join(f'{y}: {allyrs[y]}' for y in sorted(allyrs))}), so do not read trends past 2017")

    near = [p for p in peers if p["relevance"] in ("direct", "adjacent")]
    rec = [p for p in near if "yc_recent" in p["source_ids"] and (p["year"] or 0) >= 2025]
    if near:
        direct = sum(p["relevance"] == "direct" for p in near)
        text = f"{direct} direct and {len(near) - direct} adjacent companies found across the datasets"
        if rec:
            text += f"; {len(rec)} {'is a YC company' if len(rec) == 1 else 'are YC companies'} founded in 2025 or later"
        known = [p for p in near if p["outcome"]]
        if known:
            text += f"; of the {len(known)} with a known outcome, {sum(p['outcome'] == 'dead' for p in known)} dead, {sum(p['outcome'] == 'exited' for p in known)} exited, {sum(p['outcome'] == 'operating' for p in known)} operating"
        add("Peers above", "Overlapping companies found", text + ".", len(near), "Counts cover the closest candidates reviewed, not every company that exists")
    ids = {v: k for k, v in LABELS.items()} | {"Peers above": "peers"}
    for f in facts:
        f["sid"] = ids.get(f["source"], "")
    return facts


# ---------------------------------------------------------------- public: what agents and the UI consume

def _label(p: dict) -> str:
    out = None
    if p["outcome"]:
        out = f"{p['outcome']}" + (f" ({p['outcome_note']})" if p["outcome_note"] else "")
    bits = [p["batch"] if p["batch"] and p["batch"].startswith("YC") else (f"YC {p['batch']}" if p["batch"] else None), f"founded {p['year']}" if p["year"] else None, out,
            f"valued ${p['valuation_b']:g}B ({p['valuation_date']})" if p["valuation_b"] else None, f"raised {_usd(p['funding_usd'])} ({p['funding_note']})" if p["funding_usd"] else None, p["location"]]
    return ", ".join(b for b in bits if b)


def context(query: str, k: int = 8) -> dict:
    """{available, peers, facts, coverage, stats, text}: real companies that overlap with the idea and statistics computed from the datasets; `text` drops straight into a prompt."""
    start()
    if not _ready.wait(timeout=600) or _state["vecs"] is None:
        return {"available": False, "peers": [], "facts": [], "coverage": [], "stats": {}, "text": "", "reason": _state["error"] or "still indexing"}
    key = hashlib.sha1(f"v3|{_state['digest']}|{query.strip()}".encode()).hexdigest()
    if key not in _cache:
        saved = json.loads(JUDGED.read_text()) if JUDGED.exists() else {}
        if key in saved:  # the same idea always gets the same verdicts, across restarts and across agents
            n, peers, seg = saved[key]["reviewed"], saved[key]["peers"], saved[key]["segments"]
        else:
            cands = _entities(query)
            peers, seg = _judge(query, cands), _segments(query)
            n = len(cands)
            if not any(p["relevance"] == "unverified" for p in peers) and core.OPENAI:  # never freeze a degraded (no-LLM / failed) result
                saved[key] = {"reviewed": n, "peers": peers, "segments": seg}
                JUDGED.write_text(json.dumps(dict(list(saved.items())[-300:])))
        seg = _confirm(peers, seg)
        _cache[key] = (n, peers, seg, _facts(peers, seg))
    reviewed, peers, seg, facts = _cache[key]
    items = peers[:max(k, 1)]
    cov = _coverage(_state["data"])
    stats = {"reviewed": reviewed, "direct": sum(p["relevance"] == "direct" for p in peers), "adjacent": sum(p["relevance"] == "adjacent" for p in peers), "verified": all(p["relevance"] != "unverified" for p in peers)}
    lines = [f"[P{n + 1}] {p['name']} — {p['one_liner']} [{p['relevance']}{': ' + p['reason'] if p['reason'] else ''}] | {_label(p) or 'no further data'} | sources: {', '.join(p['sources'])}" for n, p in enumerate(items)]
    flines = [f"[{f['id']}] {f['text']} (source: {f['source']}, n={f['n']}. Caveat: {f['caveat']})" if f["caveat"] else f"[{f['id']}] {f['text']} (source: {f['source']}, n={f['n']})" for f in facts]
    text = ("STARTUP DATA — real companies from Forge's datasets that overlap with this idea (cite by id, e.g. P2, and only these):\n" + ("\n".join(lines) if lines else "(none of the closest companies overlap)")
            + "\n\nFACTS — computed in code from the datasets; the ONLY statistics you may quote (cite F#; if a number is not here or in a cited source, say it is not in our data):\n" + ("\n".join(flines) if flines else "(no segment statistics matched this idea)")
            + "\n\nCOVERAGE: " + "; ".join(f"{c['label']} ({c['n']} companies{', ' + c['years'] if c['years'] else ''})" for c in cov)
            + ". These datasets are snapshots and samples, not the whole startup world: absence from them is not proof that a competitor, market or outcome does not exist.")
    return {"available": True, "peers": items, "facts": facts, "coverage": cov, "segments": seg, "stats": stats, "text": text}

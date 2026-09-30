"""Shared plumbing: LLM routing (Groq), web search/scrape (Tavily/Firecrawl), and pgvector-backed RAG + venture memory.

Every external dependency is optional. Missing keys switch that capability to a
local fallback so the whole studio still runs offline.
"""
import hashlib
import json
import math
import os
import re
import threading
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

GROQ = bool(os.getenv("GROQ_API_KEY"))
OPENAI = GROQ or bool(os.getenv("OPENAI_API_KEY"))  # "an LLM is configured"
TAVILY = bool(os.getenv("TAVILY_API_KEY"))
FIRECRAWL = bool(os.getenv("FIRECRAWL_API_KEY"))
SB_URL, SB_KEY = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
PGVECTOR = bool(SB_URL and SB_KEY)

# Groq's free tier allows ~8K tokens/minute *per model*, so work is spread across models
# and fails over to the next one on rate limits or unparseable output.
HEAVY = [os.getenv("LLM_MODEL") or ("openai/gpt-oss-120b" if GROQ else "gpt-4o-mini")]
FAST = [m.strip() for m in (os.getenv("LLM_FAST_MODELS") or ("openai/gpt-oss-20b,qwen/qwen3.8-27b" if GROQ else "gpt-4o-mini")).split(",") if m.strip()]
MODEL = HEAVY[0]
MODE = "live" if OPENAI else "demo"


# ---------------------------------------------------------------- LLM

class LLMError(RuntimeError):
    pass


_rr = {"i": 0}
_rr_lock = threading.Lock()


def _client(model: str, temperature: float, max_tokens: int):
    from langchain_openai import ChatOpenAI

    kw = {"model": model, "temperature": temperature, "max_retries": 2, "timeout": 120, "max_tokens": max_tokens}
    if GROQ:
        kw |= {"base_url": "https://api.groq.com/openai/v1", "api_key": os.getenv("GROQ_API_KEY")}
        if "gpt-oss" in model:
            kw["reasoning_effort"] = "low"  # reasoning tokens count against the per-minute budget
        elif "qwen3" in model:
            kw["reasoning_effort"] = "none"
    return ChatOpenAI(**kw)


def structured(schema, system: str, user: str, temperature: float = 0.4, tier: str = "heavy", max_tokens: int = 3500):
    """Call the chat model and parse into a Pydantic schema, failing over across models."""
    if tier == "fast":
        with _rr_lock:
            _rr["i"] += 1
            start = _rr["i"] % len(FAST)
        models = FAST[start:] + FAST[:start] + HEAVY
    else:
        models = HEAVY + FAST
    errors = []
    for model in dict.fromkeys(models):
        method = "json_schema" if ("gpt-oss" in model or not GROQ) else "function_calling"
        try:
            out = _client(model, temperature, max_tokens).with_structured_output(schema, method=method, include_raw=True).invoke(
                [("system", system), ("human", user)])
        except Exception as e:  # rate limit, provider error, invalid JSON generation
            errors.append(f"{model}: {str(e)[:160]}")
            continue
        if out["parsed"] is not None:
            return out["parsed"]
        errors.append(f"{model}: unparseable output ({str(out['parsing_error'])[:120]})")
    raise LLMError("All models failed — " + " | ".join(errors))


def complete(system: str, user: str, temperature: float = 0.4, max_tokens: int = 6000, models: list[str] | None = None) -> str:
    """Plain-text completion (used for code generation), failing over across models; rejects truncated output."""
    errors = []
    for model in dict.fromkeys(models or HEAVY + FAST):
        try:
            msg = _client(model, temperature, max_tokens).invoke([("system", system), ("human", user)])
        except Exception as e:
            errors.append(f"{model}: {str(e)[:160]}")
            continue
        if (msg.response_metadata or {}).get("finish_reason") == "length":
            errors.append(f"{model}: output too long")
            continue
        return re.sub(r"^```[a-z]*\s*|\s*```\s*$", "", msg.content.strip())
    raise LLMError("All models failed — " + " | ".join(errors))


# Plain-language rule shared by every user-facing agent.
PLAIN = (
    "Write for a first-time, non-technical founder: plain everyday words and short sentences. Avoid jargon and "
    "acronyms — say 'cost to win a customer' not 'CAC', 'how long customers stay' not 'retention cohort', "
    "'how much money a customer brings in' not 'LTV', 'a simple first version' not 'MVP', 'enough buyers and sellers' "
    "not 'liquidity', 'profit per sale' not 'margins', 'AI running costs' not 'inference', 'a way in' not 'wedge', "
    "'hard for others to copy' not 'moat/defensibility', 'gets better as more people use it' not 'network effects', "
    "'data only you have' not 'proprietary data', 'getting enough buyers and sellers at the same time' not "
    "'chicken-and-egg problem'. Numbers are welcome when you say what they mean."
)


# ---------------------------------------------------------------- Web

def web_search(query: str, domains: list[str] | None = None, k: int = 5, topic: str = "general", days: int | None = None):
    """Tavily search -> [{title,url,content}]. Empty list when Tavily isn't configured."""
    if not TAVILY:
        return []
    from tavily import TavilyClient

    kwargs = {"max_results": k, "topic": topic}
    if domains:
        kwargs["include_domains"] = domains
    if days and topic == "news":
        kwargs["days"] = days
    try:
        res = TavilyClient(api_key=os.getenv("TAVILY_API_KEY")).search(query, **kwargs)
    except Exception as e:  # search is best-effort evidence, never fatal
        print("tavily error:", e)
        return []
    return [{"title": r.get("title", ""), "url": r["url"], "content": re.sub(r"\s+", " ", r.get("content") or "")[:700]}
            for r in res.get("results", []) if r.get("content")]


def dedupe(results: list[dict]) -> list[dict]:
    seen, out = set(), []
    for r in results:
        if r["url"] not in seen:
            seen.add(r["url"])
            out.append(r)
    return out


def _fetch(url: str) -> str:
    r = httpx.get(url, timeout=20, follow_redirects=True, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"})
    r.raise_for_status()
    html = re.sub(r"(?is)<(script|style|noscript|svg|nav|footer).*?</\1>", " ", r.text)
    html = re.sub(r"(?i)<h[1-3][^>]*>", "\n# ", html)
    html = re.sub(r"(?i)</(p|div|li|h[1-6]|tr|section)>|<br\s*/?>", "\n", html)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;|&#160;", " ", text).replace("&amp;", "&")
    return "\n".join(line for line in (re.sub(r"[ \t]+", " ", l).strip() for l in text.splitlines()) if line)


def _tavily_extract(url: str) -> str:
    from tavily import TavilyClient

    res = TavilyClient(api_key=os.getenv("TAVILY_API_KEY")).extract([url])
    text = next((r.get("raw_content") or "" for r in res.get("results", [])), "")
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)          # images
    return re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)       # links -> text


def scrape(url: str) -> str:
    """Page text. Firecrawl if configured; else direct fetch, falling back to Tavily Extract for bot-protected sites."""
    if FIRECRAWL:
        r = httpx.post(
            "https://api.firecrawl.dev/v1/scrape",
            headers={"Authorization": f"Bearer {os.getenv('FIRECRAWL_API_KEY')}"},
            json={"url": url, "formats": ["markdown"], "onlyMainContent": True},
            timeout=60,
        )
        r.raise_for_status()
        return (r.json().get("data") or {}).get("markdown", "")
    try:
        text = _fetch(url)
        if len(text) >= 400 or not TAVILY:
            return text
    except Exception:
        if not TAVILY:
            raise
    text = _tavily_extract(url)
    if not text:
        raise RuntimeError(f"Could not read {url} (blocked or empty)")
    return text


def sources_block(results: list[dict], prefix: str = "S") -> str:
    return "\n\n".join(f"[{prefix}{i + 1}] {r['title']} ({r['url']})\n{r['content']}" for i, r in enumerate(results)) or "(no sources)"


# ---------------------------------------------------------------- Embeddings (free, local)

HASH_DIM = 384


def _hash_embed(text: str) -> list[float]:
    # ponytail: hashing bag-of-words fallback when the local model can't load; same 384 dims as bge-small.
    v = [0.0] * HASH_DIM
    for tok in re.findall(r"[a-z0-9]+", text.lower()):
        if len(tok) < 3:
            continue
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        v[h % HASH_DIM] += 1.0 if (h >> 9) & 1 else -1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


# Groq has no embedding models, so embeddings run locally on CPU (model downloads once, ~70MB).
try:
    from fastembed import TextEmbedding

    _embedder = TextEmbedding("BAAI/bge-small-en-v1.5")
    EMBED_MODEL = "bge-small-en-v1.5"
except Exception as e:  # offline first run / unsupported platform
    print("fastembed unavailable, using hashing embeddings:", e)
    _embedder, EMBED_MODEL = None, "hashing"


def embed(texts: list[str]) -> list[list[float]]:
    if _embedder:
        return [v.tolist() for v in _embedder.passage_embed(texts)]
    return [_hash_embed(t) for t in texts]


def embed_query(text: str) -> list[float]:
    # bge models retrieve better when queries carry their instruction prefix (query_embed adds it).
    if _embedder:
        return next(iter(_embedder.query_embed(text))).tolist()
    return _hash_embed(text)


# ---------------------------------------------------------------- Vector store: Supabase pgvector (local JSON fallback)

def _rest(method: str, path: str, prefer: str = "return=minimal", **kw):
    r = httpx.request(method, f"{SB_URL}/rest/v1/{path}", timeout=30, headers={
        "apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json", "Prefer": prefer}, **kw)
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase {method} {path.split('?')[0]} failed: {r.status_code} {r.text[:200]}")
    return r.json() if r.content else None


# ponytail: brute-force cosine over a JSON file when Supabase isn't configured; pgvector (HNSW) otherwise.
_LOCAL = Path(__file__).parent / ".vectors.json"
_local = json.loads(_LOCAL.read_text()) if _LOCAL.exists() and not PGVECTOR else {"knowledge_chunks": [], "memory_embeddings": []}
_local_lock = threading.Lock()


def _local_save():
    _LOCAL.write_text(json.dumps(_local))


def _cos(a, b):
    return sum(x * y for x, y in zip(a, b))  # vectors are L2-normalised


def chunk(text: str) -> list[str]:
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    return RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120).split_text(text)


def index_document(doc_id: str, title: str, text: str, owner: str = "system", category: str = "custom", url: str | None = None) -> int:
    delete_document(doc_id)
    parts = chunk(text) or [text]
    rows = [{"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{doc_id}:{i}")), "doc_id": doc_id, "owner": owner, "title": title,
             "category": category, "url": url, "content": p, "embedding": vec}
            for i, (p, vec) in enumerate(zip(parts, embed([f"{title}\n{p}" for p in parts])))]
    if PGVECTOR:
        for i in range(0, len(rows), 50):
            _rest("POST", "knowledge_chunks", json=rows[i:i + 50])
    else:
        with _local_lock:
            _local["knowledge_chunks"] += rows
            _local_save()
    return len(parts)


def delete_document(doc_id: str):
    if PGVECTOR:
        _rest("DELETE", f"knowledge_chunks?doc_id=eq.{doc_id}")
    else:
        with _local_lock:
            _local["knowledge_chunks"] = [r for r in _local["knowledge_chunks"] if r["doc_id"] != doc_id]
            _local_save()


def search_knowledge(query: str, owner: str | None = None, k: int = 5) -> list[dict]:
    owners = ["system"] + ([owner] if owner else [])
    q = embed_query(query)
    if PGVECTOR:
        hits = _rest("POST", "rpc/match_knowledge", json={"query_embedding": q, "owners": owners, "match_count": k})
    else:
        hits = sorted(({**r, "similarity": _cos(q, r["embedding"])} for r in _local["knowledge_chunks"] if r["owner"] in owners),
                      key=lambda r: -r["similarity"])[:k]
    return [{"doc_id": str(h["doc_id"]), "title": h["title"], "text": h["content"], "category": h.get("category"),
             "url": h.get("url"), "score": round(h["similarity"], 3)} for h in hits]


def remember(venture_id: str, memory_id: str, kind: str, title: str, content: str):
    row = {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, memory_id)), "venture_id": venture_id, "memory_id": memory_id,
           "kind": kind, "title": title, "content": content[:4000], "embedding": embed([f"{title}\n{content}"])[0]}
    if PGVECTOR:
        _rest("POST", "memory_embeddings?on_conflict=id", prefer="return=minimal,resolution=merge-duplicates", json=row)
    else:
        with _local_lock:
            _local["memory_embeddings"] = [r for r in _local["memory_embeddings"] if r["id"] != row["id"]] + [row]
            _local_save()


def recall(venture_id: str, query: str, k: int = 6) -> list[dict]:
    q = embed_query(query)
    if PGVECTOR:
        hits = _rest("POST", "rpc/match_memory", json={"query_embedding": q, "venture": venture_id, "match_count": k})
    else:
        hits = sorted(({**r, "similarity": _cos(q, r["embedding"])} for r in _local["memory_embeddings"] if r["venture_id"] == venture_id),
                      key=lambda r: -r["similarity"])[:k]
    return [{"memory_id": str(h["memory_id"]), "kind": h["kind"], "title": h["title"], "text": h["content"],
             "score": round(h["similarity"], 3)} for h in hits]


def forget_venture(venture_id: str):
    if PGVECTOR:
        _rest("DELETE", f"memory_embeddings?venture_id=eq.{venture_id}")
    else:
        with _local_lock:
            _local["memory_embeddings"] = [r for r in _local["memory_embeddings"] if r["venture_id"] != venture_id]
            _local_save()


def seed_library():
    """Index the shared Foundry library once."""
    if PGVECTOR:
        if _rest("GET", "knowledge_chunks?owner=eq.system&select=id&limit=1"):
            return
    elif any(r["owner"] == "system" for r in _local["knowledge_chunks"]):
        return
    for d in json.loads((ROOT / "shared" / "knowledge-seed.json").read_text()):
        index_document(d["id"], d["title"], d["content"], "system", d["category"], d.get("url"))


def context_block(items: list[dict], label: str) -> str:
    return "\n".join(f"- ({label}: {i['title']}) {i['text'][:600]}" for i in items) or f"(no {label.lower()} yet)"


def status():
    return {
        "mode": MODE,
        "openai": OPENAI,
        "llm": "groq" if GROQ else "openai" if OPENAI else None,
        "tavily": TAVILY,
        "firecrawl": FIRECRAWL,
        "vector": "pgvector" if PGVECTOR else "local",
        "embeddings": EMBED_MODEL,
        "model": MODEL if OPENAI else None,
        "fast_models": FAST if OPENAI else None,
    }

"""Design Intelligence Knowledge Base: crawl a SaaS site, analyse its design with a vision LLM, and store the
result in Supabase (screenshots in Storage) and Qdrant (embeddings). The pipeline is a LangGraph graph:

    capture -> analyze -> report -> store -> index
"""
import base64
import ipaddress
import re
import socket
import threading
import time
import uuid
from pathlib import Path
from typing import TypedDict
from urllib.parse import urlparse

import httpx
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

import core

BUCKET = "design-references"
COLLECTION = "design_intelligence"


class DesignError(Exception):
    """A failure with a message that is safe and useful to show the admin."""


# ---------------------------------------------------------------- crawler (Playwright)

# ponytail: resolves the host once before navigating; DNS rebinding and in-page subrequests to private hosts
# aren't blocked. Fine for an admin-only tool; add a Playwright route() filter if this is ever user-facing.
def assert_public(url: str):
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise DesignError(f"Not a valid http(s) URL: {url}")
    try:
        addrs = {i[4][0] for i in socket.getaddrinfo(p.hostname, None)}
    except socket.gaierror:
        raise DesignError(f"Could not resolve {p.hostname}")
    if not all(ipaddress.ip_address(a).is_global for a in addrs):
        raise DesignError(f"{p.hostname} is not a public website")


EXTRACT_JS = """() => {
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const txt = (e) => (e.innerText || '').replace(/\\s+/g, ' ').trim()
  const uniq = (a) => [...new Set(a)]
  const meta = (sel) => document.querySelector(sel)?.content || ''
  return {
    title: document.title,
    description: meta('meta[name=description]') || meta('meta[property="og:description"]'),
    site_name: meta('meta[property="og:site_name"]'),
    headings: uniq([...document.querySelectorAll('h1,h2,h3')].filter(vis).map(txt).filter(Boolean)).slice(0, 60),
    nav: uniq([...document.querySelectorAll('header a, nav a')].filter(vis).map(txt).filter((t) => t && t.length < 40)).slice(0, 40),
    ctas: uniq([...document.querySelectorAll('a,button')].filter(vis)
      .filter((e) => e.tagName === 'BUTTON' || /btn|button|cta/i.test(String(e.className))).map(txt).filter((t) => t && t.length < 40)).slice(0, 30),
    text: document.body.innerText,
  }
}"""
BANNER = re.compile(r"^(accept( all)?( cookies)?|allow all|reject all|got it|i agree|agree|ok)$", re.I)
MAX_SHOT_HEIGHT = {"desktop": 4500, "mobile": 3600}


def _prepare(page, url: str):
    from playwright.sync_api import Error as PWError, TimeoutError as PWTimeout

    try:
        resp = page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    except (PWTimeout, PWError) as e:
        raise DesignError(f"Could not load {url}: {str(e).splitlines()[0][:160]}")
    if resp and resp.status >= 400:
        raise DesignError(f"{url} responded with HTTP {resp.status} (blocked or missing)")
    try:
        page.wait_for_load_state("networkidle", timeout=8_000)
    except PWTimeout:
        pass  # pages with polling/analytics never go idle; what has rendered is enough
    assert_public(page.url)
    try:
        page.get_by_role("button", name=BANNER).first.click(timeout=1_500)
    except Exception:
        pass  # no consent banner
    height = page.evaluate("document.documentElement.scrollHeight")
    for y in range(0, min(height, 6000), 700):  # scroll through so lazy images and reveal animations render
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(150)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(500)


def _shot(page, kind: str) -> bytes:
    width = page.viewport_size["width"]
    height = min(page.evaluate("document.documentElement.scrollHeight"), MAX_SHOT_HEIGHT[kind])
    return page.screenshot(full_page=True, type="jpeg", quality=72, clip={"x": 0, "y": 0, "width": width, "height": height})


def capture(url: str) -> dict:
    """Homepage + mobile screenshots (JPEG bytes), plus title, meta description and visible content."""
    from playwright.sync_api import sync_playwright

    if core.LOW_MEMORY:
        raise DesignError("Capturing a site needs a browser, which this low-memory host cannot run. Run Design Intelligence on a host with 1 GB+ RAM.")
    assert_public(url)
    core.free_embedder()  # Playwright's driver process needs the memory the embedding model holds
    with sync_playwright() as pw:
        try:
            browser = core.launch_browser(pw)
        except Exception as e:
            raise DesignError(f"No browser for Playwright — run `ai/.venv/bin/playwright install chromium` ({str(e)[:80]})")
        try:
            desktop = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-US")
            page = desktop.new_page()
            _prepare(page, url)
            info = page.evaluate(EXTRACT_JS)
            final_url, home = page.url, _shot(page, "desktop")
            phone = browser.new_context(**{**pw.devices["iPhone 13"], "device_scale_factor": 1})
            mpage = phone.new_page()
            _prepare(mpage, url)
            mobile = _shot(mpage, "mobile")
        finally:
            browser.close()
    text = re.sub(r"\n{2,}", "\n", re.sub(r"[ \t]+", " ", info.pop("text"))).strip()
    if len(text) < 200:
        raise DesignError("The page rendered almost no content (bot protection or a login wall?)")
    return {**info, "text": text[:9000], "final_url": final_url, "homepage": home, "mobile": mobile}


# ---------------------------------------------------------------- analysis (vision LLM)

class Layout(BaseModel):
    homepage: str = Field("", description="Section order of the homepage and why it converts")
    dashboard: str = Field("", description="Dashboard/app UI layout if product visuals show it, else 'not visible'")
    navigation: str = ""
    sidebar_style: str = ""
    content_density: str = ""
    section_structure: list[str] = []


class DesignSystem(BaseModel):
    design_style: str = ""
    spacing_strategy: str = ""
    typography_style: str = ""
    color_strategy: str = ""
    animation_style: str = ""
    component_style: str = ""


class Conversion(BaseModel):
    cta_strategy: str = ""
    social_proof: list[str] = []
    trust_building_elements: list[str] = []
    pricing_strategy: str = ""
    onboarding_strategy: str = ""


class DashboardPatterns(BaseModel):
    dashboard_type: str = ""
    information_hierarchy: list[str] = []
    metrics_display: str = ""
    quick_actions: list[str] = []
    activity_patterns: list[str] = []


class UxPatterns(BaseModel):
    empty_state_strategy: str = ""
    loading_state_strategy: str = ""
    error_handling_strategy: str = ""
    navigation_pattern: str = ""
    user_guidance_pattern: str = ""


class Analysis(BaseModel):
    product_name: str
    industry: str
    subcategory: str = ""
    target_audience: str
    business_model: str = ""
    product_maturity: str = ""
    overall_style: str = Field(description="Short visual style label, e.g. 'Dark, dense, engineering-led minimalism'")
    visual_personality: list[str] = []
    primary_use_case: str = ""
    key_user_jobs: list[str] = []
    layout_patterns: Layout = Layout()
    design_system: DesignSystem = DesignSystem()
    components_used: list[str] = []
    conversion_patterns: Conversion = Conversion()
    dashboard_patterns: DashboardPatterns = DashboardPatterns()
    ux_patterns: UxPatterns = UxPatterns()
    strengths: list[str]
    weaknesses: list[str]
    best_for_products: list[str] = []
    design_takeaways: list[str]
    reusable_patterns: list[str]
    recommended_industries: list[str] = []
    ai_summary: str = ""


ANALYST = (
    "You are a Senior Product Designer, UX Researcher, SaaS Consultant and Design Systems expert. You analyse a SaaS "
    "website from its screenshots and extracted content. You do NOT describe the website — you extract reusable "
    "product, UX, UI, conversion, onboarding, dashboard and design intelligence that AI agents will later retrieve to "
    "build new SaaS products. Think like a product designer, conversion specialist and startup founder.\n"
    "Rules: explain WHY each decision works; every insight must be specific, actionable and transferable to other "
    "products (name the concrete pattern, e.g. 'three-column feature grid with one outcome headline per card', not "
    "'nice layout'); prefer precise design vocabulary; state spacing, type and colour choices concretely. Base claims on "
    "what you can see or read. Where the marketing site does not reveal something (for example the in-app dashboard, "
    "empty or error states), say 'not visible on the marketing site' plus what the product visuals imply — never invent."
)


def _page_text(c: dict) -> str:
    return (f"URL: {c['final_url']}\nTitle: {c['title']}\nMeta description: {c['description']}\nSite name: {c['site_name']}\n"
            f"Navigation: {' | '.join(c['nav'])}\nButtons/CTAs: {' | '.join(c['ctas'])}\n"
            f"Headings in page order:\n" + "\n".join(f"- {h}" for h in c["headings"]) + f"\n\nVisible content:\n{c['text']}")


def _image(data: bytes) -> dict:
    return {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(data).decode()}}


def analyze(state: dict) -> dict:
    c = state["cap"]
    page = _page_text(c)
    try:
        if not core.VISION:
            raise core.LLMError("no vision model configured")
        blocks = [{"type": "text", "text": "Image 1 is the full desktop homepage (1440px wide); image 2 is the mobile homepage.\n\n" + page},
                  _image(c["homepage"]), _image(c["mobile"])]
        out, mode = core.structured(Analysis, ANALYST, blocks, tier="vision", max_tokens=6000, temperature=0.3), "vision"
    except core.LLMError as e:
        print("vision analysis unavailable, falling back to text:", str(e)[:200])
        note = "You cannot see screenshots for this run: infer layout and visual style from the content and mark visual claims as inferred.\n\n"
        out, mode = core.structured(Analysis, ANALYST, note + page, max_tokens=6000, temperature=0.3), "text"
    return {"meta": out.model_dump(), "mode": mode}


REPORTER = (
    "You are a principal product designer writing a Design Intelligence report for a knowledge base that AI agents "
    "search when designing new SaaS products. Be concrete and transferable; explain the reasoning behind each decision, "
    "not just what exists. Use markdown with exactly these sections and nothing else:\n"
    "## Why the design works\n## Visual hierarchy\n## Layout decisions\n## UX decisions\n## Conversion decisions\n## Reusable patterns\n"
    "Each section: 3-6 tight bullets or short paragraphs. In 'Reusable patterns' write each pattern as "
    "'**Pattern name** — when to use it and how to apply it'."
)


def report(state: dict) -> dict:
    import json

    c, meta = state["cap"], state["meta"]
    user = (f"Product: {meta['product_name']} ({c['final_url']})\n\nStructured analysis:\n{json.dumps(meta, indent=1)}\n\n"
            f"Page headings:\n" + "\n".join(f"- {h}" for h in c["headings"][:30]))
    return {"report": core.complete(REPORTER, user, temperature=0.4, max_tokens=3500)}


# ---------------------------------------------------------------- storage: Supabase Storage + Qdrant

def _sb(method: str, path: str, headers: dict | None = None, **kw):
    for attempt in range(3):  # Supabase/Cloudflare return the odd 5xx; don't lose a long run to one of them
        try:
            r = httpx.request(method, f"{core.SB_URL}/storage/v1/{path}", timeout=60, **kw, headers={
                "apikey": core.SB_KEY, "Authorization": f"Bearer {core.SB_KEY}", **(headers or {})})
        except httpx.TransportError as e:
            if attempt == 2:
                raise DesignError(f"Supabase Storage unreachable: {e}")
        else:
            if r.status_code < 500 or attempt == 2:
                break
        time.sleep(2 ** attempt)
    if r.status_code >= 400:
        raise DesignError(f"Supabase Storage {method} failed ({r.status_code}): {r.text[:160]} — is the storage bucket created (migrations 004/005)?")
    return r


def _upload(ref_id: str, name: str, data: bytes, bucket: str = BUCKET) -> str:
    key = f"{ref_id}/{name}-{int(time.time())}.jpg"  # new key per run so re-runs bypass the CDN cache
    _sb("POST", f"object/{bucket}/{key}", {"Content-Type": "image/jpeg", "x-upsert": "true"}, content=data)
    return f"{core.SB_URL}/storage/v1/object/public/{bucket}/{key}"


def _clean_storage(ref_id: str, keep: set[str] = frozenset(), bucket: str = BUCKET):
    files = _sb("POST", f"object/list/{bucket}", json={"prefix": ref_id, "limit": 100}).json()
    stale = [f"{ref_id}/{f['name']}" for f in files if f["name"] not in keep]
    if stale:
        _sb("DELETE", f"object/{bucket}", json={"prefixes": stale})


def store(state: dict) -> dict:
    if not core.PGVECTOR:
        raise DesignError("Design Intelligence needs Supabase: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    c, meta, rid = state["cap"], state["meta"], state["id"]
    home, mobile = _upload(rid, "homepage", c["homepage"]), _upload(rid, "mobile", c["mobile"])
    _clean_storage(rid, keep={home.rsplit("/", 1)[1], mobile.rsplit("/", 1)[1]})
    meta["capture"] = {"final_url": c["final_url"], "title": c["title"], "description": c["description"], "analysis_mode": state["mode"]}
    return {"result": {
        "name": meta["product_name"] or c["site_name"] or urlparse(c["final_url"]).hostname,
        "industry": meta["industry"], "subcategory": meta["subcategory"], "target_audience": meta["target_audience"],
        "style": meta["overall_style"], "analysis": state["report"], "metadata_json": meta,
        "homepage_screenshot": home, "mobile_screenshot": mobile,
        "dashboard_screenshot": None,  # marketing pages don't expose the in-app dashboard; reserved for manual upload
    }}


_qc, _qc_lock = None, threading.Lock()


def ensure_indexes(client, collection: str, fields: dict) -> None:
    """Qdrant Cloud rejects filters on unindexed payload fields. Creating an index is idempotent, and doing it on every
    start also repairs collections that were created before an index was added."""
    for field, schema in fields.items():
        try:
            client.create_payload_index(collection, field, schema)
        except Exception as e:
            print(f"qdrant index {collection}.{field} failed:", str(e)[:120], flush=True)


def qdrant():
    global _qc
    with _qc_lock:
        if _qc is None:
            import os
            from qdrant_client import QdrantClient, models

            url = os.getenv("QDRANT_URL")
            # ponytail: embedded on-disk Qdrant when QDRANT_URL is unset (single process only); set QDRANT_URL for a server/cloud.
            client = QdrantClient(url=url, api_key=os.getenv("QDRANT_API_KEY")) if url else QdrantClient(path=str(Path(__file__).parent / ".qdrant"))
            if not client.collection_exists(COLLECTION):
                client.create_collection(COLLECTION, vectors_config=models.VectorParams(size=len(core.embed(["x"])[0]), distance=models.Distance.COSINE))
            if url:
                ensure_indexes(client, COLLECTION, {"reference_id": models.PayloadSchemaType.KEYWORD})
            _qc = client
        return _qc


def _drop_vectors(ref_id: str):
    from qdrant_client import models

    qdrant().delete(COLLECTION, points_selector=models.FilterSelector(filter=models.Filter(
        must=[models.FieldCondition(key="reference_id", match=models.MatchValue(value=ref_id))])))


def index(state: dict) -> dict:
    from qdrant_client import models

    ref_id, r, meta = state["id"], state["result"], state["meta"]
    sources = [("report", state["report"]), ("reusable_patterns", "\n".join(meta["reusable_patterns"])),
               ("strengths", "\n".join(meta["strengths"])), ("design_takeaways", "\n".join(meta["design_takeaways"]))]
    parts = [(kind, i, c) for kind, text in sources for i, c in enumerate(core.chunk(text))]
    head = f"{r['name']} — {r['industry']}"
    vectors = core.embed([f"{head}\n{c}" for _, _, c in parts])
    points = [models.PointStruct(id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{ref_id}:{kind}:{i}")), vector=v, payload={
        "reference_id": ref_id, "kind": kind, "name": r["name"], "url": state["url"], "industry": r["industry"], "text": c})
        for (kind, i, c), v in zip(parts, vectors)]
    _drop_vectors(ref_id)  # re-runs replace the previous analysis
    qdrant().upsert(COLLECTION, points=points)
    return {}


class State(TypedDict, total=False):
    id: str
    url: str
    cap: dict
    meta: dict
    mode: str
    report: str
    result: dict


def _build():
    g = StateGraph(State)
    for name, fn in {"capture": lambda s: {"cap": capture(s["url"])}, "analyze": analyze, "report": report, "store": store, "index": index}.items():
        g.add_node(name, fn)
    g.add_edge(START, "capture")
    g.add_edge("capture", "analyze")
    g.add_edge("analyze", "report")
    g.add_edge("report", "store")
    g.add_edge("store", "index")
    g.add_edge("index", END)
    return g.compile()


graph = _build()


def run(ref_id: str, url: str) -> dict:
    if not core.OPENAI:
        raise DesignError("Design Intelligence needs an LLM: set GROQ_API_KEY, GEMINI_API_KEY or OPENAI_API_KEY")
    return graph.invoke({"id": ref_id, "url": url})["result"]


def search(query: str, k: int = 8) -> list[dict]:
    """Best-matching references for a query, one hit per reference: [{reference_id, name, url, score, kind, text}]."""
    hits = qdrant().query_points(COLLECTION, query=core.embed_query(query), limit=k * 4, with_payload=True).points
    best = {}
    for h in hits:
        best.setdefault(h.payload["reference_id"], {**h.payload, "score": round(h.score, 3)})
    return list(best.values())[:k]


def purge(ref_id: str):
    _drop_vectors(ref_id)
    if core.PGVECTOR:
        _clean_storage(ref_id)

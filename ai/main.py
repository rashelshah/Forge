"""Foundry AI — agent service (FastAPI). Internal: only the Node API should call it."""
import json
import os
import threading

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse

import agents
import boardroom
import core
import design_intel
import intel
import studio

app = FastAPI(title="Foundry AI agents")
VECTOR_ERROR = None
try:
    core.seed_library()
except Exception as e:  # e.g. supabase/migrations/002_pgvector.sql not applied yet
    VECTOR_ERROR = str(e)[:300]
    print("vector store unavailable:", VECTOR_ERROR)
KEY = os.getenv("AI_INTERNAL_KEY")


@app.middleware("http")
async def internal_only(request: Request, call_next):
    if KEY and request.url.path != "/health" and request.headers.get("x-internal-key") != KEY:
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "forbidden"}, status_code=403)
    return await call_next(request)


@app.exception_handler(core.LLMError)
async def llm_error(request: Request, exc: core.LLMError):
    from fastapi.responses import JSONResponse
    print("LLM failure:", exc)
    busy = "429" in str(exc) or "rate" in str(exc).lower()
    return JSONResponse(status_code=503, content={"detail": (
        "The free AI models are at their per-minute limit — wait about a minute and try again." if busy
        else "The AI models couldn't produce a valid answer. Please try again.")})


def long_job(fn, *args):
    """Run a minutes-long job without tripping the Node client's 5-minute response-header limit: headers go out at once, a space is
    sent every 15s (JSON ignores leading whitespace), and the result — or an {"__error"} — is the final JSON body."""
    def stream():
        box: dict = {}

        def work():
            try:
                box["out"] = fn(*args)
            except (studio.StudioError, design_intel.DesignError) as e:
                box["err"] = (422, str(e))
            except core.LLMError as e:
                busy = "429" in str(e) or "rate" in str(e).lower()
                box["err"] = (503, "The free AI models are at their per-minute limit — wait about a minute and try again." if busy else "The AI models couldn't produce a valid answer. Please try again.")
            except Exception as e:
                print("long job failed:", e)
                box["err"] = (500, str(e)[:300])

        t = threading.Thread(target=work, daemon=True)
        t.start()
        yield b" "
        while t.is_alive():
            t.join(15)
            if t.is_alive():
                yield b" "
        yield json.dumps(box["out"] if "out" in box else {"__error": box["err"][1], "__status": box["err"][0]}).encode()

    return StreamingResponse(stream(), media_type="application/json")


@app.get("/health")
def health():
    return {**core.status(), "vector_error": VECTOR_ERROR}


@app.post("/discover")
def discover(seed: str | None = Body(None), founder: dict = Body({})):
    return agents.discover(seed, founder)


@app.post("/validate")
def validate(venture: dict = Body(...), founder: dict = Body({})):
    return agents.validate(venture, founder)


@app.post("/boardroom")
def board(venture: dict = Body(...), question: str = Body(...), rounds: int = Body(2),
          validation: dict | None = Body(None), owner: str | None = Body(None)):
    if not 1 <= rounds <= 3:
        raise HTTPException(400, "rounds must be 1-3")

    def events():
        try:
            for e in boardroom.run(venture, question, rounds, validation, owner):
                yield f"data: {json.dumps(e)}\n\n"
        except Exception as e:  # surface failures to the client instead of a dropped stream
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)[:300]})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@app.post("/mvp")
def mvp(venture: dict = Body(...), founder: dict = Body({})):
    return agents.mvp(venture, founder)


@app.post("/prototype")
def prototype(venture: dict = Body(..., embed=True)):
    def events():
        try:
            for e in agents.prototype_steps(venture):
                yield f"data: {json.dumps(e)}\n\n"
        except Exception as e:
            print("prototype build failed:", e)
            busy = "429" in str(e) or "503" in str(e) or "rate" in str(e).lower()
            msg = ("The free AI models are busy right now — please try again in a minute." if busy
                   else str(e)[:300] if isinstance(e, core.LLMError) else "Something went wrong while building. Please try again.")
            yield f"data: {json.dumps({'type': 'error', 'error': msg})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@app.post("/prototype/edit")
def prototype_edit(venture: dict = Body(...), html: str = Body(...), instruction: str = Body(...)):
    return agents.prototype_edit(venture, html, instruction)


@app.post("/competitors/scan")
def scan(venture: dict = Body(...), competitor: dict = Body(...)):
    return agents.scan_competitor(venture, competitor)


@app.post("/monitor")
def monitor(venture: dict = Body(..., embed=True)):
    return agents.monitor_market(venture)


@app.post("/experiments/analyze")
def analyze(venture: dict = Body(...), experiment: dict = Body(...), feedback: list[str] = Body([])):
    return agents.analyze_experiment(venture, experiment, feedback)


@app.post("/knowledge/ingest")
def ingest(id: str = Body(...), title: str = Body(...), text: str | None = Body(None), url: str | None = Body(None),
           owner: str = Body(...), category: str = Body("custom")):
    if not text and url:
        try:
            text = core.scrape(url)
        except Exception as e:
            raise HTTPException(422, f"Could not fetch {url}: {e}")
    if not text or not text.strip():
        raise HTTPException(422, "Document is empty")
    return {"chunks": core.index_document(id, title, text, owner, category, url), "content": text[:20000]}


@app.delete("/knowledge/{doc_id}")
def delete_doc(doc_id: str):
    core.delete_document(doc_id)
    return {"ok": True}


@app.post("/knowledge/search")
def search(query: str = Body(...), owner: str | None = Body(None), k: int = Body(6)):
    return {"results": core.search_knowledge(query, owner, k)}


@app.post("/knowledge/ask")
def ask(question: str = Body(...), owner: str | None = Body(None)):
    return agents.ask_library(question, owner)


@app.post("/memory/add")
def memory_add(venture_id: str = Body(...), id: str = Body(...), kind: str = Body(...), title: str = Body(...), content: str = Body(...)):
    core.remember(venture_id, id, kind, title, content)
    return {"ok": True}


@app.post("/memory/search")
def memory_search(venture_id: str = Body(...), query: str = Body(...), k: int = Body(8)):
    return {"results": core.recall(venture_id, query, k)}


@app.delete("/memory/{venture_id}")
def memory_forget(venture_id: str):
    core.forget_venture(venture_id)
    return {"ok": True}


@app.post("/design/analyze")
def design_analyze(id: str = Body(...), url: str = Body(...)):
    try:
        return design_intel.run(id, url)
    except design_intel.DesignError as e:
        raise HTTPException(422, str(e))


@app.post("/design/search")
def design_search(query: str = Body(...), k: int = Body(8)):
    return {"results": design_intel.search(query, k)}


@app.delete("/design/{ref_id}")
def design_purge(ref_id: str):
    design_intel.purge(ref_id)
    return {"ok": True}


@app.post("/studio/run")
def studio_run(project_id: str = Body(..., embed=True)):
    return long_job(studio.run_project, project_id)


@app.delete("/studio/{project_id}")
def studio_forget(project_id: str):
    studio.forget(project_id)
    return {"ok": True}


@app.post("/intel/run")
def intel_run(venture: dict = Body(...), competitors: list[dict] = Body(...), mvp_features: list[str] = Body([]), recent_events: list[dict] = Body([])):
    return long_job(intel.run, venture, competitors, mvp_features, recent_events)


@app.post("/studio/edit")
def studio_edit(html: str = Body(...), instruction: str = Body(...), name: str = Body("")):
    try:
        return studio.edit_html(html, instruction, name)
    except (studio.StudioError, design_intel.DesignError) as e:
        raise HTTPException(422, str(e))

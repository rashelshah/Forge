# Forge AI

**AI Venture Studio for Startup Discovery, Validation, and Execution**

Forge AI is an autonomous venture creation platform that discovers startup opportunities, validates market demand, conducts multi-agent boardroom debates, generates MVP architectures, creates launch strategies, and continuously monitors competitors using Agentic AI, RAG, and long-term memory.

---

## Quick start

```bash
npm run setup          # installs frontend, backend and the Python agent service
cp .env.example .env   # optional — every key is optional
npm run dev            # AI :8000 · API :4000 · web :5173
```

Open http://localhost:5173.

With no keys, Forge runs fully offline in **demo mode**: local JSON database, no login, a local vector file, and template-driven agents (clearly labelled "Demo data" in the UI). Add keys to switch each capability to live:

| Capability | Key(s) | Without it |
| --- | --- | --- |
| Database + auth | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `backend/.data/db.json`, single demo founder |
| Agent reasoning (free) | `GROQ_API_KEY` from console.groq.com — `openai/gpt-oss-120b` for heavy tasks, `gpt-oss-20b` + `qwen3` for boardroom turns | Deterministic templates |
| Embeddings (free, local) | none — `bge-small-en-v1.5` runs on CPU (Groq has no embedding models) | — |
| Web evidence & news | `TAVILY_API_KEY` | No web sources; library evidence only |
| Reading competitor sites / URLs | none — direct fetch, falling back to Tavily Extract (Firecrawl optional) | Direct fetch only |
| Vector DB | Supabase pgvector (same Supabase keys) | Local vector file `ai/.vectors.json` |

For Supabase, run `supabase/migrations/001_init.sql`, `002_pgvector.sql` and `003_prototypes.sql` in the SQL editor. They create every table, indexes, the signup trigger, row-level security policies, and the pgvector tables + `match_knowledge` / `match_memory` search functions.

---

## Architecture

```
React + TS + Tailwind + shadcn/ui + TanStack Query + Framer Motion   (frontend/, :5173)
        │  REST + SSE (boardroom streaming)
Node.js + Express                                                    (backend/, :4000)
  auth (Supabase JWT) · ventures/workspaces · plans & quotas · agent-run logging
  venture memory writes · activity + notifications · daily monitoring scheduler
  hosted experiment pages (/p/:slug) with visit/signup/survey tracking
        │  internal HTTP (x-internal-key)            │
Python FastAPI agent service (ai/, :8000)          Supabase Postgres
  LangGraph boardroom · LangChain + Groq (Llama 3.3)
  pgvector via Supabase (knowledge + venture memory) · Tavily search/extract
```

The Node API owns the relational tables; the Python service owns the vector tables (`knowledge_chunks`, `memory_embeddings`) in the same Supabase database. Every agent output is written to `venture_memory` **and** embedded into pgvector, so future agents recall past research, debates, experiments and feedback.

**Free-tier notes.** Groq's free tier allows ~8K tokens/minute per model, so work is spread across models and fails over on rate limits; a 2-round boardroom takes ~40–60s. Tavily's free tier is 1,000 credits/month (a validation uses ~4, discovery ~5).

## The workflow

1. **Create venture** — describe an idea, or run **Discover Opportunities**.
2. **Opportunity Discovery Agent** — searches Reddit, Product Hunt, Hacker News, G2 and App Store reviews; outputs problem, frequency, pain level, potential customers and market size with cited sources.
3. **Validation Engine** — Demand, Competition, Defensibility, Revenue Potential and Founder Fit scores. Each score cites evidence from web sources (`S#`) or the library (`K#`); ids are resolved server-side so URLs can't be hallucinated. Competitors it finds are auto-tracked.
4. **Startup Intelligence RAG** — a seeded library (YC, Startup School, Lean Startup, The Mom Test, Zero to One, Startup Playbook, Paul Graham essays, failure postmortems, SaaS case studies, business models, open startups, market sizing) plus your own documents (paste text or ingest a URL).
5. **Multi-Agent Boardroom** (LangGraph) — ask a question; CEO, Investor, Product, Growth, Technical and the **Failure Agent** discuss it in plain language, and you get one result-first answer: *Build it / Change direction / Don't build this*, why, what to do this week, and what to test before spending money. The full debate is one click away. Debates keep running when you switch tabs and are saved turn-by-turn, so a reload picks them up.
6. **MVP Architect** — features (MoSCoW), user stories, database schema, APIs, architecture diagram, sprint plan, team requirements.
7. **Prototype Builder** (Lovable-style) — turns the research and MVP plan into a working, clickable single-file app (Tailwind + JS, multiple screens, sample data, create/edit/search). Refine it by describing changes; edits are applied as small patches, every version is syntax-checked on the server and auto-repaired, runtime errors and blank values are detected in the preview with one-click **Fix it for me**, and there's undo and code download. Previews run in a sandboxed iframe with an opaque origin.
8. **Experiment Center** — share the prototype at `/p/:slug` (served with a CSP sandbox) with a feedback + waitlist widget; tracks visitors, signups, feedback and conversion vs target; the Experiment Analyst judges validated / invalidated / inconclusive and writes the result to memory.
9. **Competitor Intelligence + Continuous Monitoring** — snapshots competitor sites and news, diffs pricing and features, and recommends a response per signal. A daily sweep covers competitors, market news, sentiment and new opportunities, and creates notifications.

## Dashboard pages

Dashboard · Ventures (+ venture workspace with Overview, Boardroom, MVP, Prototype, Competitors, Experiments, Memory tabs) · Research · Boardroom · Competitors · Experiments · Knowledge Base · Activity Feed (+ agent runs) · Settings (founder profile, plan & usage, integrations, monitoring).

## Billing-ready

`backend/src/core.js` defines `PLANS` (Free / Pro / Studio) and enforces venture and monthly agent-run quotas server-side (HTTP 402). `users.plan` and `users.stripe_customer_id` exist; wiring Stripe means a checkout session plus a webhook that updates `users.plan`.

## API (all under `/api`, authenticated)

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/ventures` | List / create |
| GET/PATCH/DELETE | `/ventures/:id` | Read / update stage / delete (cascades memory) |
| POST | `/discover` | Opportunity discovery |
| POST | `/ventures/:id/validate` | Validation engine |
| POST | `/ventures/:id/boardroom` | Boardroom debate (Server-Sent Events) |
| POST | `/ventures/:id/mvp` · `/ventures/:id/prototype` | MVP plan · build prototype |
| POST | `/research/:id/prototype/edit` · `/research/:id/prototype/undo` | Refine or revert a prototype |
| GET/POST | `/ventures/:id/memory` · `POST …/memory/search` | Venture memory |
| GET | `/research` · `/research/:id` | Reports |
| GET | `/boardroom` · `/boardroom/:id` | Sessions |
| GET/POST/PATCH/DELETE | `/competitors` · `POST /competitors/:id/scan` | Competitor tracking |
| GET | `/signals` · `POST /monitor/run` | Signals · manual monitoring sweep |
| GET/POST/PATCH/DELETE | `/experiments` · `POST /experiments/:id/events` · `/analyze` | Experiment center |
| GET/POST/DELETE | `/knowledge` · `POST /knowledge/search` · `/knowledge/ask` | Knowledge base (RAG) |
| GET | `/activity` · `/agent-runs` · `/notifications` · `/dashboard` · `/me` · `/config` | Workspace |

Public: `GET /p/:slug` (hosted prototype, sandboxed), `POST /p/:slug/signup`.

## Project structure

```
frontend/   React app — pages/, components/ (ui/ = shadcn primitives), lib/
backend/    Express API — src/index.js, core.js, db.js, routes/
ai/         FastAPI agents — main.py, core.py, agents.py, boardroom.py, demo.py
shared/     knowledge-seed.json (the Forge library)
supabase/   migrations/001_init.sql
```

## Design

The UI follows Sarvam AI's visual language: an off-white canvas, a saffron → periwinkle aurora behind heroes, hairline-framed eyebrows, pill buttons with a lit top edge, 16px hairline cards, dot-grid panels and gradient feature tiles. Fonts are free substitutes for Sarvam's licensed faces: Instrument Sans (display) and Geist (text).

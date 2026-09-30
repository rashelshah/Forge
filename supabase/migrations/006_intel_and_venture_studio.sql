-- Foundry AI — Competitive Intelligence Officer + Product Studio as the venture Prototype builder.

-- Product Studio projects can belong to a venture: the result becomes the venture's prototype.
alter table public.studio_projects add column if not exists venture_id uuid references public.ventures(id) on delete cascade;
create index if not exists studio_projects_venture_idx on public.studio_projects (venture_id);

-- AI competitor profile (threat score, strengths/weaknesses, recent activity, suggested response).
alter table public.competitors add column if not exists category text;
alter table public.competitors add column if not exists strategic_threat int check (strategic_threat between 0 and 100);
alter table public.competitors add column if not exists profile jsonb;

-- Timeline events carry the date the change happened, not just when we noticed it.
alter table public.market_signals add column if not exists occurred_on date;

-- Competitor memory: every intelligence run stores the competitor's observable numbers and features, so changes over time
-- (e.g. seller fee 12% -> 8%) can be shown.
create table if not exists public.competitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  metrics jsonb not null default '[]'::jsonb,   -- [{ name, value }]
  features jsonb not null default '[]'::jsonb,  -- [string]
  created_at timestamptz not null default now()
);
create index if not exists competitor_snapshots_idx on public.competitor_snapshots (venture_id, competitor_id, created_at);
alter table public.competitor_snapshots enable row level security;

-- The weekly intelligence brief is stored as a research report.
alter table public.research_reports drop constraint if exists research_reports_kind_check;
alter table public.research_reports add constraint research_reports_kind_check
  check (kind in ('discovery', 'validation', 'mvp', 'landing', 'prototype', 'experiment_analysis', 'intel'));

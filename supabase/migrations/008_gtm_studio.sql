-- Foundry AI — Go-To-Market Studio: brand, positioning, messaging, launch assets, growth plan and investor deck for a venture.
create table if not exists public.gtm_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null unique references public.ventures(id) on delete cascade,  -- one current GTM package per venture
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  stage text,
  launch_score numeric,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gtm_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.gtm_runs(id) on delete cascade,
  agent text not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  summary text,
  detail text,
  iteration int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gtm_events_run_idx on public.gtm_events (run_id, created_at);

-- brand, positioning, messaging, visual, landing, growth, content, calendar, marketing, ads, deck, readiness, assets, checklist_state
create table if not exists public.gtm_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.gtm_runs(id) on delete cascade,
  kind text not null,
  iteration int not null default 0,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists gtm_artifacts_run_idx on public.gtm_artifacts (run_id, created_at);

alter table public.gtm_runs enable row level security;
alter table public.gtm_events enable row level security;
alter table public.gtm_artifacts enable row level security;

-- Generated files (logo packs, graphics, decks, PDFs). Public bucket; paths contain the run's random id.
insert into storage.buckets (id, name, public) values ('gtm-assets', 'gtm-assets', true)
on conflict (id) do nothing;

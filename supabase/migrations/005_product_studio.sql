-- Foundry AI — Product Studio: an autonomous AI product team that turns an idea into a reviewed, refined prototype.
create table if not exists public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  idea text not null,
  audience text,
  industry text,
  requirements text,
  max_iterations int not null default 3 check (max_iterations between 1 and 5),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  stage text,                                        -- agent currently working
  iteration int not null default 0,                  -- versions built and reviewed so far
  best_iteration int,                                -- the version that scored highest (the final prototype)
  scores jsonb not null default '{}'::jsonb,         -- latest 0-10 scores per dimension
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_projects_user_idx on public.studio_projects (user_id, created_at desc);

-- Agent activity timeline: every agent's step, with its reasoning.
create table if not exists public.studio_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  agent text not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  summary text,
  detail text,                                       -- the agent's reasoning
  iteration int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_events_project_idx on public.studio_events (project_id, created_at);

-- Everything the agents produce: product_spec, ux_blueprint, design_research_report, design_spec, technical_spec,
-- frontend_architecture (iteration 0) and per iteration: code, screenshots, review_report, design_feedback,
-- failure_report, scores, refinement.
create table if not exists public.studio_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects(id) on delete cascade,
  kind text not null,
  iteration int not null default 0,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists studio_artifacts_project_idx on public.studio_artifacts (project_id, created_at);

alter table public.studio_projects enable row level security;
alter table public.studio_events enable row level security;
alter table public.studio_artifacts enable row level security;

insert into storage.buckets (id, name, public) values ('studio-screenshots', 'studio-screenshots', true)
on conflict (id) do nothing;

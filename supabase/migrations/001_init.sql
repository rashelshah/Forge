-- Forge AI — core schema
create extension if not exists pgcrypto;

-- Profiles mirror auth.users (created by trigger below)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  founder_profile jsonb not null default '{}'::jsonb, -- skills, industries, years_experience, weekly_hours, capital
  plan text not null default 'free' check (plan in ('free', 'pro', 'studio')),
  stripe_customer_id text,
  settings jsonb not null default '{"daily_monitoring": true}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ventures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  idea text not null,
  stage text not null default 'idea' check (stage in ('idea', 'validating', 'building', 'launched', 'paused', 'killed')),
  opportunity jsonb,              -- discovery output the venture was created from
  scores jsonb not null default '{}'::jsonb,
  overall_score int,
  verdict text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid references public.ventures(id) on delete cascade,
  kind text not null check (kind in ('discovery', 'validation', 'mvp', 'landing', 'experiment_analysis')),
  title text not null,
  summary text,
  content jsonb not null default '{}'::jsonb,
  mode text not null default 'live',
  created_at timestamptz not null default now()
);

create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  name text not null,
  url text,
  description text,
  threat_level text default 'medium' check (threat_level in ('low', 'medium', 'high')),
  snapshot jsonb,                 -- last scrape: hash, prices, headings, excerpt
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.market_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid references public.ventures(id) on delete cascade,
  competitor_id uuid references public.competitors(id) on delete set null,
  type text not null,             -- pricing | feature | funding | acquisition | product | market | sentiment | opportunity | baseline
  title text not null,
  detail text,
  recommended_response text,
  severity text not null default 'info' check (severity in ('info', 'low', 'medium', 'high')),
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid references public.ventures(id) on delete cascade,
  agent text not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  mode text,
  output_summary text,
  error text,
  duration_ms int,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade, -- null = Forge library (shared)
  title text not null,
  category text not null default 'custom',
  source text,
  url text,
  content text,
  chunk_count int not null default 0,
  status text not null default 'indexed',
  created_at timestamptz not null default now()
);

create table if not exists public.boardroom_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  question text not null,
  rounds int not null default 2,
  transcript jsonb not null default '[]'::jsonb,
  verdict jsonb,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  mode text,
  created_at timestamptz not null default now()
);

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  name text not null,
  hypothesis text,
  type text not null default 'landing_page' check (type in ('landing_page', 'survey', 'interviews', 'ads', 'other')),
  slug text unique,
  landing jsonb,                  -- generated landing page served at /p/:slug
  target_conversion numeric not null default 10,
  metrics jsonb not null default '{"visitors": 0, "signups": 0, "feedback": 0}'::jsonb,
  status text not null default 'running' check (status in ('draft', 'running', 'completed')),
  result text,
  created_at timestamptz not null default now()
);

create table if not exists public.experiment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  type text not null check (type in ('visit', 'signup', 'feedback', 'survey')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.venture_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  kind text not null,             -- research | competitor | experiment | roadmap | decision | boardroom | feedback
  title text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid references public.ventures(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid references public.ventures(id) on delete cascade,
  actor text not null,            -- 'you' or an agent name
  action text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ventures_user_idx on public.ventures (user_id, created_at desc);
create index if not exists reports_venture_idx on public.research_reports (venture_id, created_at desc);
create index if not exists signals_user_idx on public.market_signals (user_id, created_at desc);
create index if not exists runs_user_idx on public.agent_runs (user_id, created_at desc);
create index if not exists memory_venture_idx on public.venture_memory (venture_id, created_at desc);
create index if not exists notifications_user_idx on public.notifications (user_id, read, created_at desc);
create index if not exists activity_user_idx on public.activity_logs (user_id, created_at desc);
create index if not exists events_experiment_idx on public.experiment_events (experiment_id, created_at);

-- Profile row on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row level security: the API uses the service role, but direct client access stays scoped to the owner.
alter table public.users enable row level security;
create policy "own profile" on public.users for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['ventures','research_reports','competitors','market_signals','agent_runs',
    'boardroom_sessions','experiments','experiment_events','venture_memory','notifications','activity_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.knowledge_documents enable row level security;
create policy "library or own" on public.knowledge_documents for select using (user_id is null or user_id = auth.uid());
create policy "own docs" on public.knowledge_documents for all using (user_id = auth.uid()) with check (user_id = auth.uid());

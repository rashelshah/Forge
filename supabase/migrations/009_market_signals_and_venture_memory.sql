-- Forge AI — Intelligence layer: Market Signals radar + Venture Memory knowledge layer.
--
-- Reuses what already exists instead of duplicating it:
--   market_signals    gains the radar fields (type = 'radar'; detail = summary, severity = signal strength, source_url = link)
--   venture_memory    is the permanent memory stream every agent writes to (via remember())
--   memory_embeddings is its pgvector index (002_pgvector.sql)

-- ---------------------------------------------------------------- market signals

alter table public.market_signals add column if not exists impact text;
alter table public.market_signals add column if not exists opportunity text;
alter table public.market_signals add column if not exists source text;                                   -- publisher name
alter table public.market_signals add column if not exists confidence int check (confidence between 0 and 100);

create table if not exists public.market_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  title text not null,
  description text,
  score int not null check (score between 0 and 100),
  market_size text not null check (market_size in ('low', 'medium', 'high')),
  difficulty text not null check (difficulty in ('low', 'medium', 'high')),
  time_horizon text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.market_threats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  title text not null,
  description text,
  severity text not null check (severity in ('low', 'medium', 'high')),
  likelihood text not null check (likelihood in ('low', 'medium', 'high')),
  suggested_action text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.market_trends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  title text not null,
  category text not null check (category in ('Technology', 'Consumer Behavior', 'Funding', 'Regulation', 'Commerce', 'AI')),
  momentum text not null check (momentum in ('growing', 'stable', 'declining')),
  confidence int not null check (confidence between 0 and 100),
  impact text not null check (impact in ('low', 'medium', 'high')),
  summary text,
  created_at timestamptz not null default now()
);

-- One row per radar run: the market overview and the industry outlook.
create table if not exists public.industry_outlooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  health text not null check (health in ('positive', 'neutral', 'negative')),
  confidence int not null check (confidence between 0 and 100),
  drivers jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  summary text,
  best_area text,
  live boolean not null default false,          -- true when backed by fresh web sources, false when it is analysis only
  created_at timestamptz not null default now()
);

-- The web sources a radar run was built from.
create table if not exists public.signal_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  title text not null,
  url text not null,
  domain text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- venture memory (derived knowledge, rebuilt by synthesis)

-- "What we know" (kind = 'known') and "Top venture learnings" (kind = 'top').
create table if not exists public.venture_learnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  kind text not null check (kind in ('known', 'top')),
  statement text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.validated_assumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  statement text not null,
  confidence int not null check (confidence between 0 and 100),
  evidence jsonb not null default '[]'::jsonb,   -- [{ kind, title }] resolved from venture_memory rows
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.failed_assumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  statement text not null,
  confidence int not null check (confidence between 0 and 100),
  reason text not null,
  evidence jsonb not null default '[]'::jsonb,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.decision_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  decision text not null,
  why text not null,
  evidence jsonb not null default '[]'::jsonb,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexes + RLS (API uses the service role; direct access stays owner-scoped)

do $$
declare t text;
begin
  foreach t in array array['market_opportunities', 'market_threats', 'market_trends', 'industry_outlooks', 'signal_sources',
    'venture_learnings', 'validated_assumptions', 'failed_assumptions', 'decision_journal']
  loop
    execute format('create index if not exists %I on public.%I (venture_id, created_at desc)', t || '_venture_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Forge AI — Founder Copilot: unified knowledge base for cross-venture semantic search.
--
-- All modules (Research, Boardroom, MVP, Prototype, GTM, Intel, Market Signals,
-- Validation Lab, Venture Memory) write embeddings here as they run.
-- The Copilot retrieves from ALL ventures owned by the user in one shot.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------- unified knowledge store

create table if not exists public.venture_knowledge_base (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  venture_id  uuid not null references public.ventures(id) on delete cascade,
  source_type text not null,
  source_module text not null,
  title       text not null,
  content     text not null,
  metadata    jsonb not null default '{}',
  embedding   extensions.vector(384),
  created_at  timestamptz not null default now()
);

create index if not exists vkb_user_idx      on public.venture_knowledge_base (user_id, created_at desc);
create index if not exists vkb_venture_idx   on public.venture_knowledge_base (venture_id, created_at desc);
create index if not exists vkb_type_idx      on public.venture_knowledge_base (source_type);
create index if not exists vkb_embedding_idx on public.venture_knowledge_base
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

alter table public.venture_knowledge_base enable row level security;
create policy "own rows" on public.venture_knowledge_base
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- copilot chat history

create table if not exists public.copilot_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists copilot_messages_user_idx on public.copilot_messages (user_id, created_at desc);

alter table public.copilot_messages enable row level security;
create policy "own rows" on public.copilot_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- semantic retrieval

create or replace function public.match_copilot(
  query_embedding extensions.vector(384),
  p_user_id       uuid,
  match_count     int     default 12,
  type_filter     text[]  default null,
  venture_filter  uuid[]  default null
)
returns table (
  id            uuid,
  venture_id    uuid,
  source_type   text,
  source_module text,
  title         text,
  content       text,
  metadata      jsonb,
  similarity    float
)
language sql stable set search_path = public, extensions as $$
  select
    k.id, k.venture_id, k.source_type, k.source_module,
    k.title, k.content, k.metadata,
    1 - (k.embedding <=> query_embedding) as similarity
  from public.venture_knowledge_base k
  where k.user_id = p_user_id
    and k.embedding is not null
    and (type_filter    is null or k.source_type = any(type_filter))
    and (venture_filter is null or k.venture_id  = any(venture_filter))
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_copilot from anon, authenticated;

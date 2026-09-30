-- Foundry AI — vector store on pgvector (replaces Qdrant).
-- Embeddings: BAAI/bge-small-en-v1.5 (384 dims), computed by the AI service.
create extension if not exists vector with schema extensions;

-- RAG chunks for the Foundry library (owner = 'system') and each user's documents (owner = user id).
create table if not exists public.knowledge_chunks (
  id uuid primary key,
  doc_id uuid not null,
  owner text not null,
  title text not null,
  category text,
  url text,
  content text not null,
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_chunks_doc_idx on public.knowledge_chunks (doc_id);
create index if not exists knowledge_chunks_owner_idx on public.knowledge_chunks (owner);
create index if not exists knowledge_chunks_embedding_idx on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- Long-term venture memory, recalled by every agent.
create table if not exists public.memory_embeddings (
  id uuid primary key,
  venture_id uuid not null references public.ventures(id) on delete cascade,
  memory_id uuid not null references public.venture_memory(id) on delete cascade,
  kind text not null,
  title text not null,
  content text not null,
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now()
);
create index if not exists memory_embeddings_venture_idx on public.memory_embeddings (venture_id);
create index if not exists memory_embeddings_embedding_idx on public.memory_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- Only the service role (the AI service) touches these tables.
alter table public.knowledge_chunks enable row level security;
alter table public.memory_embeddings enable row level security;

create or replace function public.match_knowledge(query_embedding extensions.vector(384), owners text[], match_count int default 6)
returns table (doc_id uuid, title text, content text, category text, url text, owner text, similarity float)
language sql stable set search_path = public, extensions as $$
  select c.doc_id, c.title, c.content, c.category, c.url, c.owner, 1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c
  where c.owner = any(owners)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_memory(query_embedding extensions.vector(384), venture uuid, match_count int default 6)
returns table (memory_id uuid, kind text, title text, content text, similarity float)
language sql stable set search_path = public, extensions as $$
  select m.memory_id, m.kind, m.title, m.content, 1 - (m.embedding <=> query_embedding) as similarity
  from public.memory_embeddings m
  where m.venture_id = venture
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_knowledge from anon, authenticated;
revoke execute on function public.match_memory from anon, authenticated;

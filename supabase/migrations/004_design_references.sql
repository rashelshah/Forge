-- Forge AI — Design Intelligence Knowledge Base.
-- Analysed SaaS products (screenshots + structured design analysis). Embeddings live in Qdrant.
create table if not exists public.design_references (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  industry text,
  subcategory text,
  target_audience text,
  style text,
  analysis text,                                   -- generated design intelligence report (markdown)
  metadata_json jsonb not null default '{}'::jsonb, -- structured LLM analysis
  homepage_screenshot text,
  dashboard_screenshot text,
  mobile_screenshot text,
  status text not null default 'queued' check (status in ('queued', 'analyzing', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists design_references_status_idx on public.design_references (status);

-- Only the service role (the Node API) touches this table.
alter table public.design_references enable row level security;

-- Public bucket: screenshots are served straight to the admin dashboard.
insert into storage.buckets (id, name, public) values ('design-references', 'design-references', true)
on conflict (id) do nothing;

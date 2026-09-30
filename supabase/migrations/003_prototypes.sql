-- Forge AI — Prototype Builder replaces the landing page generator.
alter table public.research_reports drop constraint if exists research_reports_kind_check;
alter table public.research_reports add constraint research_reports_kind_check
  check (kind in ('discovery', 'validation', 'mvp', 'landing', 'prototype', 'experiment_analysis'));

alter table public.experiments drop constraint if exists experiments_type_check;
alter table public.experiments add constraint experiments_type_check
  check (type in ('prototype', 'landing_page', 'survey', 'interviews', 'ads', 'other'));

-- Hosted prototype for user testing at /p/:slug ({ title, html }).
alter table public.experiments add column if not exists prototype jsonb;

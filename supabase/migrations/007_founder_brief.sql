-- Foundry AI — Founder Brief (Chief of Staff synthesis) is stored as a research report.
alter table public.research_reports drop constraint if exists research_reports_kind_check;
alter table public.research_reports add constraint research_reports_kind_check
  check (kind in ('discovery', 'validation', 'mvp', 'landing', 'prototype', 'experiment_analysis', 'intel', 'brief'));

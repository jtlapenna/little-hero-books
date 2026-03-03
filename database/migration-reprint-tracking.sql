-- Purpose: track reprints separately from revision_count (pre-print revisions).
-- Reprint definition: incremented only when printing again after delivery/archive.

alter table public.orders
  add column if not exists reprint_count integer not null default 0;

alter table public.orders
  add column if not exists reprint_reason text null;

alter table public.orders
  add column if not exists reprint_note text null;


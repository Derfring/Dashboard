-- Dashboard sync storage. Run this once in your Supabase project:
-- SQL Editor > New query > paste all of this > Run.
--
-- One table holds every synced item (a to-do, a habit tick, a run, ...).
-- Row-level security means each signed-in user can only ever see and change
-- their own rows, even though the app's key is public.

create table if not exists public.rows (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null,
  data jsonb not null,
  synced_at timestamptz not null default now()
);

create index if not exists rows_user_synced on public.rows (user_id, synced_at);

alter table public.rows enable row level security;

-- Signed-in users may use the table (the policies below limit them to their
-- own rows); visitors who are not signed in get nothing.
grant select, insert, update, delete on public.rows to authenticated;
revoke all on public.rows from anon;

drop policy if exists "own rows: read" on public.rows;
drop policy if exists "own rows: insert" on public.rows;
drop policy if exists "own rows: update" on public.rows;
drop policy if exists "own rows: delete" on public.rows;

create policy "own rows: read" on public.rows for select to authenticated
  using (user_id = auth.uid());
create policy "own rows: insert" on public.rows for insert to authenticated
  with check (user_id = auth.uid());
create policy "own rows: update" on public.rows for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows: delete" on public.rows for delete to authenticated
  using (user_id = auth.uid());

-- Stamp every write with the server's clock, so devices can ask
-- "what changed since I last synced?" without trusting their own clocks.
create or replace function public.rows_touch() returns trigger
language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  new.user_id := auth.uid();
  return new;
end $$;

drop trigger if exists rows_touch on public.rows;
create trigger rows_touch before insert or update on public.rows
  for each row execute function public.rows_touch();

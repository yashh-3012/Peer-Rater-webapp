create table if not exists public.peer_rater_state (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.peer_rater_state enable row level security;

create policy "Allow all users to read project state"
on public.peer_rater_state
for select
using (true);

create policy "Allow all users to write project state"
on public.peer_rater_state
for all
using (true)
with check (true);

-- Cloud game progress in the main project (replaces edge function in paused project twvagexajheoapzskvjw)
create table if not exists public.game_progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  game_id    text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id),
  constraint game_progress_size check (pg_column_size(data) <= 65536)
);
alter table public.game_progress enable row level security;
drop policy if exists gp_select on public.game_progress;
drop policy if exists gp_insert on public.game_progress;
drop policy if exists gp_update on public.game_progress;
create policy gp_select on public.game_progress for select to authenticated using (user_id = auth.uid());
create policy gp_insert on public.game_progress for insert to authenticated with check (user_id = auth.uid());
create policy gp_update on public.game_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.game_progress from anon;
grant select, insert, update on public.game_progress to authenticated;

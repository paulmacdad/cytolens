-- Row-Level Security policies

alter table experiments enable row level security;
alter table samples enable row level security;
alter table gates enable row level security;
alter table shared_workspaces enable row level security;

create policy "users own experiments" on experiments for all using (auth.uid() = user_id);
create policy "users own samples" on samples for all using (auth.uid() = user_id);
create policy "users own gates" on gates for all using (auth.uid() = user_id);
create policy "owners manage shared workspaces" on shared_workspaces for all using (auth.uid() = owner_id);
create policy "public workspaces readable" on shared_workspaces for select using (is_public = true or auth.uid() = owner_id);

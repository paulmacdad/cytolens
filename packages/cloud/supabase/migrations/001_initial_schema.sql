-- CytoLens initial schema
-- GDPR: FCS binary event data NEVER stored in cloud.
-- Only metadata, gate coordinates, and workspace structure sync.

create extension if not exists "uuid-ossp";

create table if not exists experiments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  created_at timestamptz default now() not null,
  modified_at timestamptz default now() not null,
  settings jsonb default '{}'::jsonb not null,
  metadata jsonb default '{}'::jsonb not null
);

create table if not exists samples (
  id uuid primary key default uuid_generate_v4(),
  experiment_id uuid references experiments(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  filename text not null,
  label text not null,
  event_count integer default 0,
  channel_count integer default 0,
  fcs_keywords jsonb default '{}'::jsonb not null,
  file_size_bytes bigint,
  acquired_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists gates (
  id uuid primary key default uuid_generate_v4(),
  experiment_id uuid references experiments(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  gate_type text not null check (gate_type in ('polygon','rectangle','ellipse','interval','quadrant','boolean')),
  x_channel text not null,
  y_channel text,
  parent_gate_id uuid references gates(id),
  coordinates jsonb not null,
  color text,
  created_at timestamptz default now() not null,
  modified_at timestamptz default now() not null
);

create table if not exists shared_workspaces (
  id uuid primary key default uuid_generate_v4(),
  experiment_id uuid references experiments(id) on delete cascade not null,
  owner_id uuid references auth.users(id) on delete cascade not null,
  share_token text unique not null default encode(gen_random_bytes(24), 'base64url'),
  is_public boolean default false,
  expires_at timestamptz,
  created_at timestamptz default now() not null
);

create index if not exists experiments_user_id_idx on experiments(user_id);
create index if not exists samples_experiment_id_idx on samples(experiment_id);
create index if not exists gates_experiment_id_idx on gates(experiment_id);

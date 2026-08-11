create extension if not exists pgcrypto;
create table if not exists monitors(id uuid primary key default gen_random_uuid(),name text not null,url text not null,notes text check (notes is null or char_length(notes) <= 2000),created_at timestamptz not null default now(),last_checked_at timestamptz,last_status text not null default 'new');
create table if not exists snapshots(id uuid primary key default gen_random_uuid(),monitor_id uuid not null references monitors(id) on delete cascade,page_title text,content_hash text not null,pricing_text text not null,created_at timestamptz not null default now());
create index if not exists snapshots_monitor_created_idx on snapshots(monitor_id,created_at desc);
create table if not exists changes(id uuid primary key default gen_random_uuid(),monitor_id uuid not null references monitors(id) on delete cascade,previous_snapshot_id uuid references snapshots(id) on delete set null,added_lines jsonb not null default '[]'::jsonb,removed_lines jsonb not null default '[]'::jsonb,created_at timestamptz not null default now());
create index if not exists changes_monitor_created_idx on changes(monitor_id,created_at desc);

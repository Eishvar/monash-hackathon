-- SDOC Verifier schema. Run once in: Supabase dashboard -> SQL Editor -> New query -> Run. Safe to re-run.
-- RLS is enabled with no policies: only the backend (service-role key) can read/write; the anon key gets nothing.

create table if not exists emails (
  email_id    text primary key,
  sender      text,
  subject     text,
  body        text,
  attachments jsonb not null default '[]'
);

create table if not exists results (
  email_id          text primary key references emails(email_id) on delete cascade,
  category          text not null,
  status            text not null,             -- OK | MISMATCH | NEEDS_REVIEW | ERROR (processing failed, retryable)
  review_reason     text,
  has_defect        boolean not null default false,
  defect_fields     jsonb not null default '[]',
  decided_by        text not null default 'rule',   -- rule | llm
  fields            jsonb not null default '[]',    -- [{field, si, bl, match, missing}] side-by-side values
  provisional_fields jsonb not null default '[]',   -- values suggested by the vision model for scanned docs
  explanation       text,
  notes             jsonb not null default '[]',
  processing_error  text,
  reviewed          boolean not null default false,
  run_id            text,
  updated_at        timestamptz not null default now()
);
create index if not exists results_status_idx   on results (status);
create index if not exists results_category_idx on results (category);

create table if not exists reviews (              -- audit trail of human confirmations / corrections
  id         bigint generated always as identity primary key,
  email_id   text not null references emails(email_id) on delete cascade,
  action     text not null check (action in ('confirm', 'correct')),
  before     jsonb,
  after      jsonb,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists reviews_email_idx on reviews (email_id);

create table if not exists runs (                 -- one row per batch-processing run
  id          text primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  models      jsonb,
  stats       jsonb,
  score       jsonb
);

create table if not exists llm_cache (            -- durable LLM response cache (Vercel's disk is ephemeral)
  key        text primary key,
  response   jsonb not null,
  created_at timestamptz not null default now()
);

alter table emails    enable row level security;
alter table results   enable row level security;
alter table reviews   enable row level security;
alter table runs      enable row level security;
alter table llm_cache enable row level security;

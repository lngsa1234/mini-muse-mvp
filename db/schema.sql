-- Mini Muse database schema (Neon Postgres)
-- ---------------------------------------------------------------------------
-- Scoped to the Library feature for now. The schema is multi-user ready via a
-- user_id column, but the app ships with a single hardcoded dev user until
-- real authentication is added (see server/auth.js). Run with: npm run db:init

create table if not exists users (
  id         text primary key,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id            text primary key,
  user_id       text not null references users(id) on delete cascade,
  title         text not null,
  text          text not null default '',   -- extracted/pasted text, used for search
  content_type  text,                        -- mime type of the uploaded file (null for pasted docs)
  size_bytes    integer,                     -- original file size (null for pasted docs)
  is_example    boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists documents_user_created
  on documents (user_id, created_at desc);

-- Ideas: suggestions the user keeps or Muse makes. based_on is a JSONB array of
-- source labels. goal_id links an idea to the goal it became (set on promote).
create table if not exists ideas (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  title      text not null,
  why        text not null default '',
  kind       text not null default 'Get ahead',
  based_on   jsonb not null default '[]'::jsonb,
  action     text not null default '',
  status     text not null default 'saved',   -- new | saved | done | dismissed
  by         text not null default 'muse',     -- muse | rule | you
  goal_id    text,                             -- set once the idea becomes a goal
  rule_key   text,                             -- starter-rule key, so it isn't re-shown
  created_at timestamptz not null default now()
);

create index if not exists ideas_user_created
  on ideas (user_id, created_at desc);

-- Goals: a plan with an ordered list of steps stored as JSONB ([{text,status}]).
create table if not exists goals (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  goal       text not null,
  steps      jsonb not null default '[]'::jsonb,  -- [{ text, status }]
  created_at timestamptz not null default now()
);

create index if not exists goals_user_created
  on goals (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Observability: OpenTelemetry-style traces, spans and logs.
-- Written by both the browser (shipped to /api/trace) and the backend. A trace
-- is one agent turn (or a one-shot generation, or a standalone API request);
-- spans are the steps within it (LLM calls, tool runs, DB queries, HTTP). See
-- server/trace-core.js for the data model and public/js/core/trace.js for the
-- client tracer. Rows are purged after OBS_RETENTION_DAYS (scripts/obs-purge.mjs).

-- One row per trace, used for the observability list view.
create table if not exists traces (
  trace_id    text primary key,
  user_id     text,
  name        text not null,
  root_kind   text,                               -- agent_turn | generate | api
  started_at  timestamptz not null,
  ended_at    timestamptz,
  duration_ms integer,
  status      text,                               -- ok | error
  attributes  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists traces_user_started
  on traces (user_id, started_at desc);

-- Spans: the steps within a trace. parent_span_id builds the tree and kind
-- groups them (client | server | llm | tool | db | http). attributes carries
-- gen_ai.* fields for LLM spans, events an append-only list of {name,t,attrs}.
create table if not exists spans (
  span_id        text primary key,
  trace_id       text not null,
  parent_span_id text,
  name           text not null,
  kind           text,
  started_at     timestamptz not null,
  ended_at       timestamptz,
  duration_ms    integer,
  status         text,                            -- ok | error
  status_message text,
  attributes     jsonb not null default '{}'::jsonb,
  events         jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists spans_trace
  on spans (trace_id);

create index if not exists spans_created
  on spans (created_at);

-- Structured logs, optionally correlated to a trace/span.
create table if not exists logs (
  id          text primary key,
  trace_id    text,
  span_id     text,
  user_id     text,
  ts          timestamptz not null,
  severity    text not null,                      -- debug | info | warn | error
  body        text not null,
  attributes  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists logs_trace
  on logs (trace_id);

create index if not exists logs_created
  on logs (created_at);

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
  blob_url      text,                        -- Vercel Blob URL (null for pasted docs)
  blob_pathname text,                        -- pathname used to delete from Blob
  content_type  text,
  size_bytes    integer,
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

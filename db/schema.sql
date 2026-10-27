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

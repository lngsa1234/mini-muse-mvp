/*
 * Neon Postgres access for the Library.
 * ---------------------------------------------------------------------------
 * Uses the HTTP-based @neondatabase/serverless driver, which works the same in
 * the local Express server, in Vercel Node functions, and in scripts. The
 * connection is created lazily so importing this module never throws when
 * DATABASE_URL is missing (e.g. during `npm test`).
 */
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

let _sql = null;
export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Add your Neon connection string to .env");
    _sql = neon(url);
  }
  return _sql;
}

export const newId = (prefix = "d") => prefix + randomBytes(9).toString("hex");

// Shape sent to the browser; mirrors the old localStorage doc shape plus file info.
const toDoc = r => ({
  id: r.id,
  title: r.title,
  text: r.text || "",
  t: new Date(r.created_at).getTime(),
  url: r.blob_url || null,
  contentType: r.content_type || null,
  size: r.size_bytes || null,
  example: !!r.is_example
});

export async function listDocs(userId) {
  const s = sql();
  const rows = await s`
    select * from documents
    where user_id = ${userId}
    order by created_at desc`;
  return rows.map(toDoc);
}

export async function createDoc(userId, d) {
  const s = sql();
  const id = newId("d");
  const rows = await s`
    insert into documents
      (id, user_id, title, text, blob_url, blob_pathname, content_type, size_bytes, is_example)
    values
      (${id}, ${userId}, ${d.title}, ${d.text || ""}, ${d.blobUrl || null},
       ${d.blobPathname || null}, ${d.contentType || null}, ${d.size || null}, ${d.isExample || false})
    returning *`;
  return toDoc(rows[0]);
}

export async function deleteDoc(userId, id) {
  const s = sql();
  const rows = await s`
    delete from documents
    where user_id = ${userId} and id = ${id}
    returning title, blob_url, blob_pathname`;
  if (!rows[0]) return null;
  return { title: rows[0].title, blobUrl: rows[0].blob_url, blobPathname: rows[0].blob_pathname };
}

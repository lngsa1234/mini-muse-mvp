/*
 * Document request handlers, shared by the local Express server
 * (server/index.js) and the Vercel Node functions (api/docs/*). Each handler
 * is framework-agnostic: it takes a userId plus already-parsed input and
 * returns { status, json }.
 *
 * A document is either pasted text ({ title, text }) or an uploaded file
 * ({ title?, filename, contentType, dataBase64 }). Uploaded files are stored
 * in Vercel Blob; their extracted text is stored in Postgres for search.
 */
import { put, del } from "@vercel/blob";
import { listDocs, createDoc, deleteDoc, newId } from "./db.js";
import { extractText } from "./extract.js";

// Base64 inflates ~33%; keep files well under Vercel's ~4.5MB request limit.
const MAX_BYTES = 3 * 1024 * 1024;
const TEXT_CAP = 60000;

const err = (status, message) => ({ status, json: { error: message } });
const safeName = s => String(s).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80) || "file";

export async function handleList(userId) {
  return { status: 200, json: { docs: await listDocs(userId) } };
}

export async function handleCreate(userId, body) {
  body = body || {};
  const title = String(body.title || "").trim();

  // Pasted text document (no file attached).
  if (body.dataBase64 == null) {
    const text = String(body.text || "").trim();
    if (!title) return err(400, "title is required");
    if (!text) return err(400, "text is required");
    const doc = await createDoc(userId, { title, text: text.slice(0, TEXT_CAP) });
    return { status: 201, json: { doc } };
  }

  // Uploaded file.
  let buffer;
  try { buffer = Buffer.from(String(body.dataBase64), "base64"); }
  catch { return err(400, "file could not be decoded"); }
  if (!buffer.length) return err(400, "file is empty");
  if (buffer.length > MAX_BYTES) return err(413, "file is too large (max 3MB)");

  const filename = String(body.filename || "upload");
  const contentType = String(body.contentType || "application/octet-stream");
  const fileTitle = title || filename.replace(/\.[^.]+$/, "") || filename;

  const pathname = `docs/${userId}/${newId("f")}-${safeName(filename)}`;
  const blob = await put(pathname, buffer, { access: "public", contentType, addRandomSuffix: false });
  const text = await extractText(buffer, contentType, filename);

  const doc = await createDoc(userId, {
    title: fileTitle,
    text,
    blobUrl: blob.url,
    blobPathname: blob.pathname,
    contentType,
    size: buffer.length
  });
  return { status: 201, json: { doc } };
}

export async function handleDelete(userId, id) {
  const removed = await deleteDoc(userId, String(id));
  if (!removed) return err(404, "no such document");
  if (removed.blobUrl) { try { await del(removed.blobUrl); } catch { /* row is gone; ignore orphaned blob */ } }
  return { status: 200, json: { removed: removed.title } };
}

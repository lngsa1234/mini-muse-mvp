/*
 * Vercel Node function: delete a document by id. DELETE /api/docs/:id
 */
import { currentUserId } from "../../server/auth.js";
import { handleDelete } from "../../server/docs.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    if (req.method !== "DELETE") return res.status(405).json({ error: "method not allowed" });
    const id = req.query?.id || req.url.split("?")[0].split("/").pop();
    const { status, json } = await handleDelete(currentUserId(req), id);
    return res.status(status).json(json);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "server error" });
  }
}

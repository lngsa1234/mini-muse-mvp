/*
 * Mini Muse — Vercel Edge Function
 * Reports whether an API key is configured (mirrors GET /healthz in
 * server/index.js). Only used when deployed to Vercel.
 */
import { health } from "../server/proxy.js";

export const config = { runtime: "edge" };

export default function handler() {
  return new Response(JSON.stringify(health(process.env)), { headers: { "content-type": "application/json" } });
}

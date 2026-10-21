/*
 * Mini Muse — Vercel Edge Function
 * Reports whether an API key is configured (mirrors GET /healthz in
 * server/index.js). Only used when deployed to Vercel.
 */

export const config = { runtime: "edge" };

export default function handler() {
  return new Response(
    JSON.stringify({ ok: true, hasKey: !!process.env.ANTHROPIC_API_KEY }),
    { headers: { "content-type": "application/json" } }
  );
}

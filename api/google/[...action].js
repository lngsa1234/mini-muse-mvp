/* Catch-all fallback; explicit sibling files handle deployed Vercel endpoints. */
import { handleGoogleRoute } from "../../server/google-route.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  // Vercel normally supplies catch-all path segments through req.query.action,
  // but some deployments truncate a nested path such as `mail/send` to `mail`.
  // The request pathname is the complete, canonical source for this route.
  const routedAction = (Array.isArray(req.query?.action) ? req.query.action : [req.query?.action]).filter(Boolean).join("/");
  const pathAction = new URL(req.url, "http://localhost").pathname
    .replace(/^\/api\/google\/?/, "")
    .replace(/\/$/, "");
  const action = pathAction || routedAction;
  return handleGoogleRoute(action, req, res);
}

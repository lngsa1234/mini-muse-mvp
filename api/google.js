/* One Vercel function for every Google OAuth, Gmail, and Calendar route. */
import { handleGoogleRoute } from "../server/google-route.js";

export const config = { runtime: "nodejs" };

export default function handler(req, res) {
  const action = Array.isArray(req.query?.action) ? req.query.action.join("/") : String(req.query?.action || "");
  return handleGoogleRoute(action, req, res);
}

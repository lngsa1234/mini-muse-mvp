/* Shared Vercel adapter for the Google OAuth, Gmail, and Calendar endpoints. */
import * as google from "./google.js";

const handlers = {
  status: (req, body, env) => google.handleGoogleStatus(req, env),
  authorize: (req, body, env) => google.handleGoogleAuthorize(req, env),
  callback: (req, body, env) => google.handleGoogleCallback(req, env),
  disconnect: (req, body, env) => google.handleGoogleDisconnect(req, env),
  "mail/search": (req, body, env) => google.googleMailSearch(req, body, env),
  "mail/read": (req, body, env) => google.googleMailRead(req, body, env),
  "mail/send": (req, body, env) => google.googleMailSend(req, body, env),
  "calendar/list": (req, body, env) => google.googleCalendarList(req, body, env),
  "calendar/add": (req, body, env) => google.googleCalendarAdd(req, body, env),
  "calendar/remove": (req, body, env) => google.googleCalendarRemove(req, body, env)
};

export async function handleGoogleRoute(action, req, res) {
  try {
    const body = await readJson(req);
    const out = handlers[action] ? await handlers[action](req, body, process.env) : { status: 404, json: { error: "not found" } };
    if (out.cookie) res.setHeader("Set-Cookie", out.cookie);
    if (out.cookies) res.setHeader("Set-Cookie", out.cookies);
    if (out.redirect) return res.redirect(302, out.redirect);
    return res.status(out.status).json(out.json);
  } catch (e) {
    if (e.cookie) res.setHeader("Set-Cookie", e.cookie);
    return res.status(e.status || 500).json({ error: e.message || "Google request failed." });
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = ""; for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

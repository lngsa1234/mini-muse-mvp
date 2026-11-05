/* Vercel Node function for Google OAuth and the Gmail/Calendar connector API. */
import * as google from "../../server/google.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const action = (Array.isArray(req.query?.action) ? req.query.action : [req.query?.action]).filter(Boolean).join("/");
  const body = await readJson(req);
  const handlers = {
    status: () => google.handleGoogleStatus(req, process.env),
    authorize: () => google.handleGoogleAuthorize(req, process.env),
    callback: () => google.handleGoogleCallback(req, process.env),
    disconnect: () => google.handleGoogleDisconnect(req, process.env),
    "mail/search": () => google.googleMailSearch(req, body, process.env),
    "mail/read": () => google.googleMailRead(req, body, process.env),
    "mail/send": () => google.googleMailSend(req, body, process.env),
    "calendar/list": () => google.googleCalendarList(req, body, process.env),
    "calendar/add": () => google.googleCalendarAdd(req, body, process.env),
    "calendar/remove": () => google.googleCalendarRemove(req, body, process.env)
  };
  try {
    const out = handlers[action] ? await handlers[action]() : { status: 404, json: { error: "not found" } };
    if (out.cookie) res.setHeader("Set-Cookie", out.cookie);
    if (out.cookies) res.setHeader("Set-Cookie", out.cookies);
    if (out.redirect) return res.redirect(302, out.redirect);
    return res.status(out.status).json(out.json);
  } catch (e) { if (e.cookie) res.setHeader("Set-Cookie", e.cookie); return res.status(e.status || 500).json({ error: e.message || "Google request failed." }); }
}
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = ""; for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

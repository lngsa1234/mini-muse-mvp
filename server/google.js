/*
 * Google OAuth + Gmail/Calendar API adapter.
 * Tokens are encrypted into an HttpOnly cookie, so the browser agent never
 * receives a Google access or refresh token. This is deliberately independent
 * of the app's temporary DEV_USER_ID authentication seam.
 */
import crypto from "node:crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events"
].join(" ");
const STATE_COOKIE = "muse_google_state";
const TOKEN_COOKIE = "muse_google_tokens";
const DAY = 60 * 60 * 24;

const json = (status, body, cookie) => ({ status, json: body, cookie });
const configured = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_TOKEN_ENCRYPTION_KEY);
const redirectUri = env => env.GOOGLE_REDIRECT_URI || `${env.APP_URL || "http://localhost:3000"}/api/google/callback`;
const cookieOpts = (env, maxAge) => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${String(env.APP_URL || "").startsWith("https://") ? "; Secure" : ""}`;
const clearCookie = (env, name) => `${name}=; ${cookieOpts(env, 0)}`;

function cookies(req) {
  return Object.fromEntries(String(req.headers?.cookie || "").split(/;\s*/).filter(Boolean).map(p => {
    const i = p.indexOf("="); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
  }));
}
function key(env) {
  const raw = Buffer.from(env.GOOGLE_TOKEN_ENCRYPTION_KEY || "", "base64");
  if (raw.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return raw;
}
function seal(value, env) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(env), iv);
  const body = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]), tag = c.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString("base64url");
}
function open(value, env) {
  try {
    const raw = Buffer.from(value, "base64url"), iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), body = raw.subarray(28);
    const d = crypto.createDecipheriv("aes-256-gcm", key(env), iv); d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(body), d.final()]).toString("utf8"));
  } catch { return null; }
}
function tokenCookie(tokens, env) { return `${TOKEN_COOKIE}=${encodeURIComponent(seal(tokens, env))}; ${cookieOpts(env, DAY * 30)}`; }
async function exchange(params) {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Google token exchange failed.");
  return data;
}
function normalizeToken(data, prior = {}) {
  return { access_token: data.access_token, refresh_token: data.refresh_token || prior.refresh_token, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 };
}

export function handleGoogleStatus(req, env) {
  if (!configured(env)) return json(200, { configured: false, connected: false });
  const token = open(cookies(req)[TOKEN_COOKIE], env);
  return json(200, { configured: true, connected: !!token?.refresh_token });
}
export function handleGoogleAuthorize(_req, env) {
  if (!configured(env)) return json(503, { error: "Google OAuth is not configured on the server." });
  const state = crypto.randomBytes(32).toString("base64url");
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(env), response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", state }).toString();
  return { redirect: url.toString(), cookie: `${STATE_COOKIE}=${state}; ${cookieOpts(env, 600)}` };
}
export async function handleGoogleCallback(req, env) {
  const q = req.query || Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  if (!configured(env)) return { redirect: "/?google=error", cookie: clearCookie(env, STATE_COOKIE) };
  if (!q.code || !q.state || q.state !== cookies(req)[STATE_COOKIE]) return { redirect: "/?google=error", cookie: clearCookie(env, STATE_COOKIE) };
  try {
    const data = await exchange({ code: q.code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(env), grant_type: "authorization_code" });
    return { redirect: "/?google=connected", cookies: [clearCookie(env, STATE_COOKIE), tokenCookie(normalizeToken(data), env)] };
  } catch { return { redirect: "/?google=error", cookie: clearCookie(env, STATE_COOKIE) }; }
}
export function handleGoogleDisconnect(_req, env) { return json(200, { connected: false }, clearCookie(env, TOKEN_COOKIE)); }

async function accessToken(req, env) {
  if (!configured(env)) throw Object.assign(new Error("Google OAuth is not configured on the server."), { status: 503 });
  const prior = open(cookies(req)[TOKEN_COOKIE], env);
  if (!prior?.refresh_token) throw Object.assign(new Error("Connect Google first."), { status: 401 });
  if (prior.access_token && prior.expires_at > Date.now() + 60_000) return { token: prior.access_token };
  const data = await exchange({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: prior.refresh_token, grant_type: "refresh_token" });
  const fresh = normalizeToken(data, prior);
  return { token: fresh.access_token, cookie: tokenCookie(fresh, env) };
}
async function google(req, env, url, init = {}) {
  const auth = await accessToken(req, env);
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${auth.token}`, ...(init.headers || {}) } });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || "Google request failed."), { status: res.status, cookie: auth.cookie });
  return { data, cookie: auth.cookie };
}
const msgBody = p => p?.body?.data ? Buffer.from(p.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : (p?.parts || []).map(msgBody).find(Boolean) || "";
const header = (m, n) => (m.payload?.headers || []).find(h => h.name.toLowerCase() === n)?.value || "";

export async function googleMailSearch(req, body, env) {
  const q = String(body?.query || "").trim();
  const list = await google(req, env, `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ maxResults: "8", ...(q ? { q } : {}) })}`);
  const messages = await Promise.all((list.data.messages || []).map(async x => (await google(req, env, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(x.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)).data));
  return json(200, { messages: messages.map(m => ({ id: m.id, from: header(m, "from"), subject: header(m, "subject"), date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : "", unread: (m.labelIds || []).includes("UNREAD"), preview: m.snippet || "" })) }, list.cookie);
}
export async function googleMailRead(req, body, env) {
  const out = await google(req, env, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(body?.id || ""))}?format=full`);
  const m = out.data; return json(200, { from: header(m, "from"), subject: header(m, "subject"), date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : "", body: msgBody(m.payload) || m.snippet || "" }, out.cookie);
}
export async function googleMailSend(req, body, env) {
  const to = String(body?.to || ""), subject = String(body?.subject || ""), text = String(body?.body || "");
  if (!to || !subject) return json(400, { error: "to and subject are required" });
  const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}`).toString("base64url");
  const out = await google(req, env, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw }) });
  return json(200, { id: out.data.id, sent: true }, out.cookie);
}
export async function googleCalendarList(req, body, env) {
  const p = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: "100" }); if (body?.from_date) p.set("timeMin", new Date(`${body.from_date}T00:00:00`).toISOString());
  const out = await google(req, env, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`);
  return json(200, { events: (out.data.items || []).map(e => ({ id: e.id, title: e.summary || "(Untitled)", start: e.start?.dateTime || e.start?.date || "", end: e.end?.dateTime || e.end?.date || "", notes: e.description || "" })) }, out.cookie);
}
export async function googleCalendarAdd(req, body, env) {
  if (!body?.title || !body?.start) return json(400, { error: "title and start are required" });
  const timeZone = body.timeZone ? String(body.timeZone) : undefined;
  const plusHour = value => {
    const d = new Date(value); if (Number.isNaN(d.getTime())) return String(value);
    d.setHours(d.getHours() + 1);
    // Preserve a timezone-less ISO value so Google's explicit timeZone keeps
    // the user's wall-clock time instead of the server's timezone.
    return /(?:Z|[+-]\d\d:\d\d)$/i.test(String(value)) ? d.toISOString() : d.toISOString().slice(0, 19);
  };
  const event = { summary: String(body.title), description: String(body.notes || ""), start: { dateTime: String(body.start), ...(timeZone ? { timeZone } : {}) }, end: { dateTime: String(body.end || plusHour(body.start)), ...(timeZone ? { timeZone } : {}) } };
  const out = await google(req, env, "https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
  return json(200, { event_id: out.data.id }, out.cookie);
}
export async function googleCalendarRemove(req, body, env) { const out = await google(req, env, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(String(body?.event_id || ""))}`, { method: "DELETE" }); return json(200, { removed: true }, out.cookie); }

// Google Calendar connector. OAuth tokens are held only by the server in an HttpOnly cookie.
import { defineConnector } from "../../core/registry.js";
import { fmtWhen } from "../../core/format.js";
import { S } from "../../core/schema.js";
import * as api from "../../core/api.js";

defineConnector({
  key: "calendar", name: "Google Calendar", glyph: "Ca", like: "Google account", desc: "See, add, and remove events on your real primary Google Calendar.",
  scopes: ["See events on your primary Google Calendar", "Add and remove events"],
  manageHtml: () => `<p class="sub">Connected to your Google account. Events are fetched from your primary Google Calendar when Muse uses a calendar tool.</p>`,
  tools: [
    { name: "calendar_list", writes: false, description: "Google Calendar connector. List primary-calendar events, optionally on or after from_date (YYYY-MM-DD).", inputSchema: { type: "object", properties: { from_date: S } }, run: async ({ from_date }, _ctx, h) => { const out = await api.googleCalendarList(from_date || ""); h.act(`${out.events.length} calendar events`); return out.events; } },
    { name: "calendar_add", writes: true, description: "Google Calendar connector. Add an event to the user's primary calendar. start and end are ISO times.", inputSchema: { type: "object", properties: { title: S, start: S, end: S, notes: S }, required: ["title", "start"] }, run: async (input, context, h) => { if (h.needsAsk("calendar")) { const ok = await h.ask("calendar_add", { heading: "Muse wants to add this to Google Calendar. Allow it?", rows: [["Event", String(input.title)], ["When", fmtWhen(input.start)]], body: input.notes ? String(input.notes) : "", yes: "Add event", summary: `${input.title} · ${fmtWhen(input.start)}` }, context); if (ok !== true) return h.refusal(ok); } const out = await api.googleCalendarAdd({ ...input, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }); h.act(`${input.title} · ${fmtWhen(input.start)}`); return out; } },
    { name: "calendar_remove", writes: true, description: "Google Calendar connector. Remove an event from the user's primary calendar by event_id.", inputSchema: { type: "object", properties: { event_id: S }, required: ["event_id"] }, run: async ({ event_id }, context, h) => { if (h.needsAsk("calendar")) { const ok = await h.ask("calendar_remove", { heading: "Muse wants to remove this Google Calendar event. Allow it?", rows: [["Event ID", String(event_id)]], yes: "Remove event", summary: `remove event ${event_id}` }, context); if (ok !== true) return h.refusal(ok); } const out = await api.googleCalendarRemove(event_id); h.act(`removed calendar event ${event_id}`); return out; } }
  ]
});

// Tiny DOM + id helpers shared by every module.
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const rid = () => Math.random().toString(36).slice(2, 8);
export const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";

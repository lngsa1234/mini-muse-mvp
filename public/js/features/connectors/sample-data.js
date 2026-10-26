// Helpers for connector sample data.
// ago(2, 18) = two days ago at 18:15 local time, as an ISO string.
export function ago(days, h, m = 15) { const x = new Date(); x.setDate(x.getDate() - days); x.setHours(h, m, 0, 0); return x.toISOString(); }

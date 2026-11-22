// A fake Vercel response that records what a handler sent.
export function fakeRes() {
  const r = { statusCode: 0, body: undefined, headers: {} };
  r.status = c => { r.statusCode = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.redirect = (a, b) => { r.statusCode = typeof a === "number" ? a : 302; r.location = b || a; return r; };
  return r;
}

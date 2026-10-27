/*
 * Current-user resolution.
 * ---------------------------------------------------------------------------
 * The app is multi-user ready (every document row has a user_id), but auth is
 * not built yet, so every request maps to one hardcoded development user. This
 * is the single seam to replace when real authentication is added: read the
 * session/JWT from `req` and return the authenticated user's id instead.
 */
export const DEV_USER_ID = process.env.DEV_USER_ID || "dev";

export function currentUserId(_req) {
  return DEV_USER_ID;
}

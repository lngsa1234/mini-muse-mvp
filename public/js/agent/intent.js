// Pure intent checks on the user's message (no DOM or state), so they can be
// unit-tested in Node. run.js uses these to decide which deterministic
// pre-steps (forced web research, document checks, browser apply) may run.

// "email", "e-mail", "emails", "gmail", "mail", "send a message to … by email".
const EMAIL_REQUEST = /\b(?:e-?mails?|gmail|mail)\b/i;

export const isEmailRequest = text => EMAIL_REQUEST.test(String(text || ""));

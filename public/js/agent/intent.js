// Pure intent checks on the user's message (no DOM or state), so they can be
// unit-tested in Node. run.js uses these to decide which deterministic
// pre-steps (forced web research, document checks, browser apply) may run.

// "email", "e-mail", "emails", "gmail", "mail", "send a message to … by email".
const EMAIL_REQUEST = /\b(?:e-?mails?|gmail|mail)\b/i;

export const isEmailRequest = text => EMAIL_REQUEST.test(String(text || ""));

// A short go-ahead like "yes", "yes please", "ok", "sure", "go ahead".
const AFFIRM = /^\s*(?:y|yes|yeah|yep|sure|ok(?:ay)?|please|go ahead|do it|sounds good)(?:[\s,!.]+(?:please|thanks|thank you|go ahead|do it))*[\s!.]*$/i;
export const isAffirmation = text => AFFIRM.test(String(text || ""));

// Did this assistant message offer to apply or submit an application?
export const offersToApply = text => /\b(?:apply|application|submit)\b/i.test(String(text || ""));

// Links that are search or listing pages, or general job sites, never count as an application.
const NOT_A_POSTING = /(?:indeed|linkedin|glassdoor|zippia|jooble|ziprecruiter|monster|builtin\w*|simplyhired|dice)\.com|\/search\b|[?&](?:q|query|keywords?)=/i;
const JOB_LINK = /apply|application|careers?|posting|greenhouse|lever\.co|myworkdayjobs|smartrecruiters|workable|icims|ashbyhq|\/jobs?\//i;

// The single job-posting link in this text, or null if there are none or several.
export function applicationLink(text) {
  const links = [...new Set([...String(text || "").matchAll(/https?:\/\/[^\s)\]<>"']+/gi)].map(m => m[0].replace(/[.,;:!?]+$/, "")))]
    .filter(url => JOB_LINK.test(url) && !NOT_A_POSTING.test(url));
  return links.length === 1 ? links[0] : null;
}

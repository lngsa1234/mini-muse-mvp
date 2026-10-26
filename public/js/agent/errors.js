// User-facing messages for agent error codes (set in agent/transport.js).
export const ERR = {
  not_granted: "This page isn't allowed to use the assistant, so Muse can't reply. Reload the page and try again.",
  sampling_disabled: "The assistant isn't available on this account, so Muse can't reply.",
  rate_limited: "Muse hit a usage limit. Wait a minute, then send again.",
  session_expired: "The assistant session expired. Reload the page, then resend.",
  tools_unavailable: "The assistant can't run Muse's tools right now. Reload the page and try again.",
  refused: "Muse couldn't help with that. Try asking another way.",
  empty_completion: "Muse didn't produce a reply. Try a shorter request.",
  prompt_too_large: "The conversation got too long. Go to Settings and choose Start over to begin fresh."
};

/*
 * Model routing: decides which model serves a request.
 * ---------------------------------------------------------------------------
 * The browser never names a model. It sends a `tier` ("quick" for the Fast
 * response style, "default" for Thorough) and we map it to a configured model
 * here, so the proxy can't be used to call arbitrary models.
 *
 * Shared by the local Express server (server/index.js) and the Vercel Edge
 * Function (api/llm.js). This is the place to add smarter routing, e.g.
 * choosing by task (chat turn vs. one-shot JSON), by tools present, or by
 * prompt size.
 */

export const DEFAULT_MODELS = {
  quick: "gpt-4o-mini",
  default: "gpt-4o"
};

export const TIERS = Object.keys(DEFAULT_MODELS);

// env: process.env (or any object with OPENAI_MODEL_QUICK / OPENAI_MODEL_DEFAULT)
export function modelsFrom(env = {}) {
  return {
    quick: env.OPENAI_MODEL_QUICK || DEFAULT_MODELS.quick,
    default: env.OPENAI_MODEL_DEFAULT || DEFAULT_MODELS.default
  };
}

// body: the JSON the browser sent ({ tier, messages, tools, stream, ... })
export function routeModel(body, env) {
  const tier = body && body.tier === "default" ? "default" : "quick";
  return modelsFrom(env)[tier];
}

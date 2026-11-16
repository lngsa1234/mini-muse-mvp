// Jobs: jobs_search (public Greenhouse / Lever / Ashby boards) and score_fit
// (rubric score + résumé keyword check). No page UI: results flow into the
// Goals page through track_application.
import { defineFeature } from "../../core/registry.js";
import { S } from "../../core/schema.js";
import { state, rt } from "../../core/state.js";
import { jobsSearch, webOpen } from "../../core/api.js";
import { searchDocs } from "../library/search.js";
import { fitPrompt, buildFit } from "./fit.js";

const RESUME_TITLE = /\b(?:résumé|resume|cv)\b/i;

// The user's résumé from the Library: a document titled like one, else the best search match.
function findResume() {
  const titled = state.docs.find(d => RESUME_TITLE.test(d.title));
  if (titled) return titled;
  const hit = searchDocs("résumé resume experience education skills", 1)[0];
  return hit ? state.docs.find(d => d.id === hit.doc_id) || null : null;
}

defineFeature({
  id: "jobs",
  guidance: "Jobs: to find openings, call jobs_search with the job boards of companies the user wants (ask which companies if you don't know; a company's careers link usually points to boards.greenhouse.io, jobs.lever.co or jobs.ashbyhq.com, and web_search can find it), plus keywords like \"product manager, product lead\" and an optional location or \"remote\". Never scrape LinkedIn. Before suggesting the user apply, call score_fit for the posting; present the overall score, the verdict, any dealbreakers and the missing keywords honestly, and recommend applying only for strong or possible fits without dealbreakers. Save good matches on the job-search goal with track_application (status saved). When tailoring a résumé or cover letter, work the missing keywords in only where the résumé truthfully supports them.",
  tools: [
    { name: "jobs_search", description: "Search companies' public job boards (Greenhouse, Lever, Ashby) for open roles. boards: up to 15 entries like \"greenhouse:stripe\", \"lever:palantir\", \"ashby:openai\", or the board URL. keywords: comma-separated title phrases (a title matches if it has every word of any phrase). location: a place, or \"remote\". days: only postings from the last N days. Returns up to 25 newest matches with url and a short snippet.",
      inputSchema: { type: "object", properties: { boards: { type: "array", items: S }, keywords: S, location: S, days: { type: "integer" } }, required: ["boards"] },
      run: async ({ boards, keywords, location, days }, _ctx, h) => {
        const list = (Array.isArray(boards) ? boards : [boards]).map(String).filter(Boolean);
        if (!list.length) throw new Error("name at least one job board, e.g. greenhouse:stripe");
        const out = await jobsSearch({ boards: list, keywords: keywords || "", location: location || "", days: days || 0 });
        h.act(`${out.total} match${out.total === 1 ? "" : "es"} in ${list.length} board${list.length === 1 ? "" : "s"}${keywords ? ` for “${keywords}”` : ""}`);
        if (!out.jobs.length) return { searched: out.searched, matches: 0, note: "No matching openings. Try broader keywords or more boards.", errors: out.errors };
        return { searched: out.searched, matches: out.total, jobs: out.jobs, errors: out.errors };
      } },
    { name: "score_fit", description: "Score how well the user's Library résumé fits one job posting, on a fixed rubric (role, seniority, skills, domain, logistics). Pass the posting url (read with web_open) or posting_text, plus company and role, and any preferences the user stated (location, level, remote). Returns overall 0-100, a verdict (strong / possible / weak), per-criterion reasons, dealbreakers, and which posting keywords the résumé covers or misses.",
      inputSchema: { type: "object", properties: { company: S, role: S, url: S, posting_text: S, preferences: S }, required: ["company", "role"] },
      run: async ({ company, role, url, posting_text, preferences }, _ctx, h) => {
        const resume = findResume();
        if (!resume) throw new Error("No résumé in the Library. Ask the user to add their résumé on the Library page first.");
        let posting = String(posting_text || "").trim();
        if (posting.length < 200) {
          if (!/^https?:\/\//i.test(String(url || ""))) throw new Error("Pass the posting url or its full text.");
          posting = (await webOpen(String(url))).text || "";
        }
        if (posting.length < 200) throw new Error("Couldn't read enough of the posting. Pass its text in posting_text.");
        if (!rt.sample) throw new Error("Muse isn't connected yet.");
        const out = await rt.sample.json(fitPrompt({ company, role, preferences, resume: resume.text, posting }), { modelTier: "default", cache: false });
        const fit = buildFit(out, resume.text);
        h.act(`${company} · ${role}: ${fit.overall}/100, ${fit.verdict}${fit.dealbreakers.length ? `, ${fit.dealbreakers.length} dealbreaker${fit.dealbreakers.length === 1 ? "" : "s"}` : ""}`);
        return { company, role, resume: resume.title, ...fit };
      } }
  ]
});

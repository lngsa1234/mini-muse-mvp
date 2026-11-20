// Jobs: jobs_search (public Greenhouse / Lever / Ashby boards, server/jobs.js)
// and score_fit (rubric score + résumé keyword check, public/js/features/jobs/fit.js).
import { S } from "./schema.js";
import { rankDocs } from "../../../public/js/features/library/rank.js";
import { fitPrompt, buildFit } from "../../../public/js/features/jobs/fit.js";

const RESUME_TITLE = /\b(?:résumé|resume|cv)\b/i;
const call = async p => { const r = await p; if (r.status >= 400) throw new Error(r.json?.message || r.json?.error || `request failed (${r.status})`); return r.json; };

// The user's résumé from the Library: a document titled like one, else the best search match.
export function findResume(docs) {
  const titled = docs.find(d => RESUME_TITLE.test(d.title));
  if (titled) return titled;
  const hit = rankDocs(docs, "résumé resume experience education skills", 1)[0];
  return hit ? docs.find(d => d.id === hit.doc_id) || null : null;
}

export default {
  id: "jobs",
  guidance: "Jobs: for job-search steps like identifying job boards or researching openings, use these tools (no browser extension needed). Muse cannot search general job sites (LinkedIn, Indeed, Glassdoor, Monster, Dice and the like): their terms forbid automated searching and there's no tool for them. Don't answer a job-search step with a list of such sites; you may mention one in a sentence for the user to browse themselves. Discovery mode needs no company list; if the user names target companies, also search their boards (use web_search to find a company's Greenhouse, Lever or Ashby board link). To find openings, call jobs_search with the job title as keywords and a location (discovery mode searches employers' hiring sites at any company, including Workday employers); add boards to look at specific companies the user wants (ask which companies if you don't know; a company's careers link usually points to boards.greenhouse.io, jobs.lever.co or jobs.ashbyhq.com, and web_search can find it), plus keywords like \"product manager, product lead\" and an optional location or \"remote\". Never scrape LinkedIn. Before suggesting the user apply, call score_fit for the posting; present the overall score, the verdict, any dealbreakers and the missing keywords honestly, and recommend applying only for strong or possible fits without dealbreakers. Save good matches on the job-search goal with track_application (status saved). When tailoring a résumé or cover letter, work the missing keywords in only where the résumé truthfully supports them.",
  tools: [
    { name: "jobs_search", description: "Find open roles on employers' own hiring sites. Two modes. Without boards (discovery): searches a fixed list of hiring sites (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Workday) by keywords (the job title) and location, and returns only single job postings, at any company. With boards: lists the openings on specific companies' boards, up to 15 entries like \"greenhouse:stripe\", \"lever:palantir\", \"ashby:openai\", or the board URL; keywords are comma-separated title phrases (a title matches if it has every word of any phrase). location: a place, or \"remote\". days: only recent postings. Returns up to 25 matches with url and a short snippet.",
      inputSchema: { type: "object", properties: { boards: { type: "array", items: S }, keywords: S, location: S, days: { type: "integer" } } },
      run: async ({ boards, keywords, location, days }, ctx, h) => {
        const list = (Array.isArray(boards) ? boards : boards ? [boards] : []).map(String).filter(Boolean);
        if (!list.length && !String(keywords || "").trim()) throw new Error("give keywords (the job title) to search the hiring sites, or name company boards");
        const out = await call(ctx.services.jobsSearch({ boards: list, keywords: keywords || "", location: location || "", days: days || 0 }));
        const where = out.mode === "discover" ? "on employers' hiring sites" : `in ${list.length} board${list.length === 1 ? "" : "s"}`;
        h.act(`${out.total} posting${out.total === 1 ? "" : "s"} ${where}${keywords ? ` for “${keywords}”` : ""}${location ? `, ${location}` : ""}`);
        if (!out.jobs.length) return { searched: out.searched, matches: 0, note: "No matching postings. Try broader keywords, a wider location, or name company boards.", errors: out.errors };
        return { searched: out.searched, matches: out.total, jobs: out.jobs, errors: out.errors };
      } },
    { name: "score_fit", description: "Score how well the user's Library résumé fits one job posting, on a fixed rubric (role, seniority, skills, domain, logistics). Pass the posting url (read with web_open) or posting_text, plus company and role, and any preferences the user stated (location, level, remote). Returns overall 0-100, a verdict (strong / possible / weak), per-criterion reasons, dealbreakers, and which posting keywords the résumé covers or misses.",
      inputSchema: { type: "object", properties: { company: S, role: S, url: S, posting_text: S, preferences: S }, required: ["company", "role"] },
      run: async ({ company, role, url, posting_text, preferences }, ctx, h) => {
        const resume = findResume(await ctx.docs());
        if (!resume) throw new Error("No résumé in the Library. Ask the user to add their résumé on the Library page first.");
        let posting = String(posting_text || "").trim();
        if (posting.length < 200) {
          if (!/^https?:\/\//i.test(String(url || ""))) throw new Error("Pass the posting url or its full text.");
          posting = (await call(ctx.services.webOpen({ url: String(url) }))).text || "";
        }
        if (posting.length < 200) throw new Error("Couldn't read enough of the posting. Pass its text in posting_text.");
        const out = await ctx.llm.json(fitPrompt({ company, role, preferences, resume: resume.text, posting }), { tier: "default", signal: ctx.signal });
        const fit = buildFit(out, resume.text);
        h.act(`${company} · ${role}: ${fit.overall}/100, ${fit.verdict}${fit.dealbreakers.length ? `, ${fit.dealbreakers.length} dealbreaker${fit.dealbreakers.length === 1 ? "" : "s"}` : ""}`);
        return { company, role, resume: resume.title, ...fit };
      } }
  ]
};

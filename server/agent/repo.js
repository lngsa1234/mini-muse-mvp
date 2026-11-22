/*
 * Data access for agent tools: documents, ideas and goals.
 * ---------------------------------------------------------------------------
 * makeDbRepo(userId) goes through the same request handlers as the REST API
 * (server/docs.js, ideas.js, goals.js), so a tool gets the same validation as
 * the page. makeMemoryRepo() is the in-memory version used by the tests.
 */
import * as docs from "../docs.js";
import * as ideas from "../ideas.js";
import * as goals from "../goals.js";
import { normApplication, upsertApplication } from "../../public/js/features/goals/model.js";

// Unwrap a { status, json } handler result, turning an error status into a throw.
const ok = r => { if (r.status >= 400) throw new Error(r.json?.error || `request failed (${r.status})`); return r.json; };

export function makeDbRepo(userId) {
  return {
    listDocs: async () => ok(await docs.handleList(userId)).docs,
    createDoc: async (title, text) => ok(await docs.handleCreate(userId, { title, text })).doc,
    removeDoc: async id => ok(await docs.handleDelete(userId, id)),
    listIdeas: async () => ok(await ideas.handleList(userId)).ideas,
    createIdea: async idea => ok(await ideas.handleCreate(userId, idea)).idea,
    updateIdea: async (id, patch) => ok(await ideas.handleUpdate(userId, id, patch)).idea,
    listGoals: async () => ok(await goals.handleList(userId)).goals,
    createGoal: async body => ok(await goals.handleCreate(userId, body)).goal,
    // body: { step, status } | { application } | { steps }
    updateGoal: async (id, body) => ok(await goals.handleUpdate(userId, id, body)).goal
  };
}

export function makeMemoryRepo(seed = {}) {
  const d = { docs: [...(seed.docs || [])], ideas: [...(seed.ideas || [])], goals: [...(seed.goals || [])] };
  let n = 0;
  const id = p => p + (++n);
  const clone = v => JSON.parse(JSON.stringify(v));
  return {
    data: d,
    listDocs: async () => clone(d.docs),
    createDoc: async (title, text) => { const doc = { id: id("d"), title, text, t: Date.now() }; d.docs.unshift(doc); return clone(doc); },
    removeDoc: async docId => { const x = d.docs.find(v => v.id === docId); if (!x) throw new Error("no such document"); d.docs = d.docs.filter(v => v !== x); return { removed: x.title }; },
    listIdeas: async () => clone(d.ideas),
    createIdea: async idea => { const i = { id: id("i"), ...idea, t: Date.now() }; d.ideas.push(i); return clone(i); },
    updateIdea: async (ideaId, patch) => { const i = d.ideas.find(v => v.id === ideaId); if (!i) throw new Error("no such idea"); Object.assign(i, patch); return clone(i); },
    listGoals: async () => clone(d.goals),
    createGoal: async body => {
      const g = { id: id("g"), goal: body.goal, steps: body.steps.map(s => ({ text: String(s), status: "todo" })), target: body.target || null, deadline: body.deadline || null, applications: [], t: Date.now() };
      d.goals.push(g); return clone(g);
    },
    updateGoal: async (goalId, body) => {
      const g = d.goals.find(v => v.id === goalId); if (!g) throw new Error("no such goal");
      if (body.step != null) g.steps[body.step - 1].status = body.status;
      else if (body.application) g.applications = upsertApplication(g.applications, normApplication(body.application));
      else if (body.steps) g.steps = body.steps;
      return clone(g);
    }
  };
}

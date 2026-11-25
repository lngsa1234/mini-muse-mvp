// End-to-end journey tests: one test per test case in the product baseline
// (docs/product/baseline.md, .agentforge/product-baseline.json). Each walks the
// journey through the real front-end and agent runtime (testkit/browser-server.mjs):
// the model is scripted, so these check what the product's own tools, approvals
// and pages do with the model's choices, not the model's wording.
import { test, expect } from "@playwright/test";
import { open, goTo, seen, serverState, call } from "./helpers.mjs";

// ---- Test data ------------------------------------------------------------

const resume = { id: "r1", title: "Résumé", text: "Senior product manager, 6 years at Ford leading connected vehicle platforms, telematics and camera streaming. Product roadmap, SQL, A/B testing, stakeholder management, Detroit." };
const posting = "Acme is hiring a Senior Product Manager in Detroit to own our connected-car platform. You will set the roadmap, work with engineering and design, run A/B tests and analyze data with SQL. 5+ years of product management experience required. Experience with telematics or IoT is a strong plus. Hybrid, Detroit office.";
const jobs = [
  { company: "Acme", title: "Senior Product Manager", location: "Detroit, MI", url: "https://boards.greenhouse.io/acme/jobs/1", snippet: "Own the connected-car platform." },
  { company: "Globex", title: "Product Manager, Payments", location: "Detroit, MI", url: "https://jobs.lever.co/globex/2", snippet: "Payments roadmap." }
];
const fit = { scores: { role: 5, seniority: 4, skills: 4, domain: 5, logistics: 4 }, reasons: { role: "PM", seniority: "Senior", skills: "Most", domain: "Auto", logistics: "Detroit" }, keywords: ["roadmap", "SQL", "A/B testing", "telematics", "Kubernetes"], dealbreakers: [], summary: "Strong fit." };
const goalWith = (apps = []) => ({ id: "g1", goal: "Land 3 interviews in 30 days", steps: ["Confirm target roles", "Find openings", "Tailor résumé", "Apply"].map(text => ({ text, status: "todo" })), target: { metric: "interviews", count: 3 }, deadline: "2099-01-01", applications: apps, t: 1 });
const acme = status => ({ company: "Acme", role: "Senior Product Manager", status, url: jobs[0].url, t: 1 });
const contactsOn = { connectors: { mail: { on: false, writes: "ask" }, calendar: { on: false, writes: "ask" }, contacts: { on: true, writes: "ask" } }, contacts: [{ id: "c1", name: "Priya Shah", email: "priya@example.com", note: "" }], seeded: { contacts: true } };

// ---- Helpers --------------------------------------------------------------

const lastReply = page => page.locator(".msg.assistant .bubble").last();
const ask = async (page, text) => { await page.locator("#box").fill(text); await page.locator("#box").press("Enter"); };
const goals = async page => (await (await page.request.get("/api/goals")).json()).goals;
const ideas = async page => (await (await page.request.get("/api/ideas")).json()).ideas;
const toolReplies = async page => (await seen(page)).turns.flatMap(t => t.messages.filter(m => m.role === "tool").map(m => String(m.content)));
const offered = async page => [...new Set((await seen(page)).turns.flatMap(t => (t.tools || []).map(x => x.function?.name || x.name)))];
const approvals = async page => ((await serverState(page)).state.audit || []).filter(a => a.tool === "approval");
const checkins = async page => (await seen(page)).turns.filter(t => /scheduled background check-in/.test(t.messages.at(-1)?.content || "")).length;

// A stand-in for the Mini Muse Browser Bridge extension: answers the page's bridge
// requests with an application form and records every request it gets.
async function fakeExtension(page) {
  await page.addInitScript(() => {
    window.__ext = [];
    const fields = [
      { selector: "#name", label: "Full name", type: "text", required: true, value: "" },
      { selector: "#email", label: "Email", type: "email", required: true, value: "" },
      { selector: "#ssn", label: "SSN", type: "text", required: false, sensitive: true, value: "" }
    ];
    window.addEventListener("message", e => {
      if (e.source !== window || e.data?.source !== "mini-muse") return;
      const { id, request } = e.data;
      window.__ext.push(request);
      const result = request.type === "fields" ? { url: "https://boards.greenhouse.io/acme/jobs/1", fields }
        : request.type === "fill" ? { filled: request.fields.map(f => f.selector), skipped: [] }
        : request.type === "click" ? { clicked: request.selector } : { ok: true };
      window.postMessage({ source: "mini-muse-extension", id, result }, window.location.origin);
    });
  });
}
const extRequests = page => page.evaluate(() => window.__ext.map(r => r.type));

// ---- J1 Land interviews within a deadline ---------------------------------

test.describe("J1 Land interviews within a deadline", () => {
  test("J1-T1 goal to submitted application", async ({ page }) => {
    await fakeExtension(page);
    await open(page, {
      docs: [resume], jobs, fit, google: true,
      script: [
        { tools: [call("create_goal", { goal: "Land 3 interviews in 30 days", steps: ["Confirm target roles", "Find openings", "Tailor résumé", "Apply"], target_metric: "interviews", target_count: 3, days: 30 })] },
        { tools: [call("jobs_search", { keywords: "product manager", location: "Detroit" })] },
        { tools: [call("score_fit", { company: "Acme", role: "Senior Product Manager", posting_text: posting })] },
        { tools: [call("track_application", { goal_id: "g1", company: "Acme", role: "Senior Product Manager", status: "saved", url: jobs[0].url })] },
        { text: "Acme is a strong fit. Want me to tailor your résumé and apply?" },
        { tools: [call("docs_add", { title: "Résumé — Acme Senior PM", text: resume.text + " Telematics platform roadmap." })] },
        { tools: [call("track_application", { goal_id: "g1", company: "Acme", role: "Senior Product Manager", status: "drafted" })] },
        { tools: [call("browser_fields", {})] },
        { tools: [call("browser_fill", { fields: [{ selector: "#name", value: "Ling" }, { selector: "#email", value: "ling@example.com" }] })] },
        { tools: [call("browser_click", { selector: "#submit", description: "Submit the Acme application" })] },
        { tools: [call("track_application", { goal_id: "g1", company: "Acme", role: "Senior Product Manager", status: "applied" })] },
        { text: "Submitted." }
      ]
    });
    // The script refers to the new goal as g1: the memory repo numbers the first goal g1.
    await goTo(page, "goals");
    await page.locator("#goalBox").fill("Land 3 interviews in 30 days for product manager roles in Detroit");
    await page.locator("#goalBox").press("Enter");
    await expect(lastReply(page)).toHaveText("Acme is a strong fit. Want me to tailor your résumé and apply?");

    const goal = page.locator("article.goal").first();
    await expect(goal.locator(".steps li")).toHaveCount(4);
    await expect(goal.locator(".target")).toHaveText("0/3 interviews · 30 days left");
    await expect(page.locator(".act", { hasText: "Acme · Senior Product Manager:" })).toContainText(/\d+\/100, strong/);
    const fitReply = JSON.parse((await toolReplies(page)).find(r => r.includes('"verdict"')));
    expect(fitReply).toMatchObject({ verdict: "strong", keywords: { missing: ["Kubernetes"] } });
    expect(fitReply.overall).toBeGreaterThanOrEqual(70);

    await goTo(page, "chat");
    await ask(page, "Tailor my résumé for Acme and fill in the application");
    const card = page.locator(".approve");
    await expect(card.locator("h4")).toHaveText("This will submit the form in your Chrome tab. Did you review every field?");
    // An apply request reads the tab first (snapshot, fields), then Muse fills it; nothing is clicked yet.
    expect(await extRequests(page)).toEqual(["snapshot", "fields", "fields", "fill"]);
    expect((await goals(page))[0].applications[0].status).toBe("drafted");

    await card.getByRole("button", { name: "Submit it" }).click();
    await expect(lastReply(page)).toHaveText("Submitted.");
    expect((await extRequests(page)).at(-1)).toBe("click");
    await goTo(page, "library");
    await expect(page.locator("#libList")).toContainText("Résumé — Acme Senior PM");
    await goTo(page, "goals");
    await expect(goal.locator(".apps summary")).toHaveText("1 application");
    await expect(goal.locator(".app-st")).toHaveText("applied");
  });

  test("J1-T2 gmail not connected", async ({ page }) => {
    await open(page, {
      docs: [resume], goals: [goalWith([acme("drafted")])],
      script: [
        { tools: [call("track_application", { goal_id: "g1", company: "Acme", role: "Senior Product Manager", status: "applied" })] },
        { text: "I can't confirm it: click the job's status if you applied, or connect Gmail." }
      ]
    });
    await ask(page, "Check whether my application went through");
    await expect(lastReply(page)).toContainText("connect Gmail", { timeout: 20_000 });
    expect(await offered(page)).not.toContain("mail_search");
    expect((await toolReplies(page)).some(r => /no proof it was submitted/.test(r))).toBe(true);
    await goTo(page, "goals");
    await expect(page.locator(".app-st")).toHaveText("drafted");
  });

  test("J1-T3 no résumé in the library", async ({ page }) => {
    await open(page, {
      jobs, fit,
      script: [
        { tools: [call("create_goal", { goal: "Land 3 interviews in 30 days", steps: ["Confirm target roles", "Find and score openings", "Apply"], target_metric: "interviews", target_count: 3, days: 30 })] },
        { tools: [call("score_fit", { company: "Acme", role: "Senior Product Manager", posting_text: posting })] },
        { tools: [call("update_step", { goal_id: "g1", step: 2, status: "done", evidence: "score_fit" })] },
        { text: "Please add your résumé on the Library page first." }
      ]
    });
    await goTo(page, "goals");
    await page.locator("#goalBox").fill("Land 3 interviews in 30 days for product manager roles");
    await page.locator("#goalBox").press("Enter");
    await expect(lastReply(page)).toHaveText("Please add your résumé on the Library page first.");
    expect((await toolReplies(page)).some(r => r.includes("No résumé in the Library"))).toBe(true);
    await expect(page.locator(".act", { hasText: "/100" })).toHaveCount(0);
    expect((await goals(page))[0].steps[1].status).toBe("todo");
  });

  test("J1-T4 declining the submit click", async ({ page }) => {
    await fakeExtension(page);
    await open(page, {
      docs: [resume], goals: [goalWith([acme("drafted")])],
      script: [
        { tools: [call("browser_click", { selector: "#submit", description: "Submit the Acme application" })] },
        { text: "OK, I didn't submit it." }
      ]
    });
    await ask(page, "Submit my Acme application");
    await page.locator(".approve").getByRole("button", { name: "Don't allow" }).click();
    await expect(lastReply(page)).toHaveText("OK, I didn't submit it.");
    expect(await extRequests(page)).not.toContain("click");
    expect((await goals(page))[0].applications[0].status).toBe("drafted");
    expect((await approvals(page)).map(a => [a.result, a.by])).toEqual([["declined", "you"]]);
  });
});

// ---- J2 Find and judge jobs from chat -------------------------------------

test.describe("J2 Find and judge jobs from chat", () => {
  test("J2-T1 search and score from chat", async ({ page }) => {
    await open(page, {
      docs: [resume], jobs, fit,
      script: [
        { tools: [call("jobs_search", { keywords: "product manager", location: "Detroit" })] },
        { tools: [call("score_fit", { company: "Acme", role: "Senior Product Manager", posting_text: posting })] },
        { text: "Acme · Senior Product Manager is a strong fit." }
      ]
    });
    await ask(page, "Find product manager jobs in Detroit");
    await expect(lastReply(page)).toHaveText("Acme · Senior Product Manager is a strong fit.");
    await expect(page.locator(".act", { hasText: "postings on employers' hiring sites" })).toContainText("2 postings on employers' hiring sites for “product manager”, Detroit");
    const replies = await toolReplies(page);
    expect(replies.some(r => r.includes(jobs[0].url) && r.includes(jobs[1].url))).toBe(true);
    const fitReply = JSON.parse(replies.find(r => r.includes('"verdict"')));
    expect(fitReply).toMatchObject({ verdict: "strong", keywords: { missing: ["Kubernetes"] } });
    expect(await goals(page)).toEqual([]);
  });

  test("J2-T2 asking for linkedin or indeed", async ({ page }) => {
    await open(page, {
      docs: [resume], jobs,
      script: [
        { tools: [call("jobs_search", { keywords: "product manager" })] },
        { text: "I can't search LinkedIn or Indeed, so I looked on employers' own hiring sites." }
      ]
    });
    await ask(page, "Search LinkedIn and Indeed for product manager jobs");
    await expect(lastReply(page)).toContainText("can't search LinkedIn or Indeed");
    const system = (await seen(page)).turns[0].messages[0].content;
    expect(system).toContain("cannot search general job sites (LinkedIn, Indeed");
    expect((await offered(page)).filter(n => /linkedin|indeed/i.test(n))).toEqual([]);
    await expect(page.locator(".act", { hasText: "postings" })).toContainText("on employers' hiring sites");
  });

  test("J2-T3 fit for one posting", async ({ page }) => {
    await open(page, {
      docs: [resume], fit, page: { title: "Acme · Senior Product Manager", url: jobs[0].url, text: posting },
      script: [
        { tools: [call("score_fit", { company: "Acme", role: "Senior Product Manager", url: jobs[0].url })] },
        { text: "Strong fit; you're missing Kubernetes." }
      ]
    });
    await ask(page, `How well do I fit this? ${jobs[0].url}`);
    await expect(lastReply(page)).toHaveText("Strong fit; you're missing Kubernetes.");
    const fitReply = JSON.parse((await toolReplies(page)).find(r => r.includes('"verdict"')));
    expect(fitReply).toMatchObject({ company: "Acme", verdict: "strong", dealbreakers: [], keywords: { missing: ["Kubernetes"] } });
    expect(typeof fitReply.overall).toBe("number");
  });
});

// ---- J3 Let Muse work on my goals while I'm away ----------------------------

test.describe("J3 Let Muse work on my goals while I'm away", () => {
  const day = (d, h) => new Date(2026, 10, d, h, 0, 0);
  const ymd = d => d.toLocaleDateString("en-CA");
  const daily = last => ({ prefs: { dailyCheckin: true, lastCheckin: ymd(last) } });

  test("J3-T1 daily check-in updates goals", async ({ page }) => {
    await page.clock.install({ time: day(23, 10) });
    await open(page, {
      google: true, goals: [goalWith([acme("drafted")])], state: daily(day(22, 10)),
      mail: [{ id: "m1", from: "no-reply@acme.com", subject: "Thank you for applying to Acme", snippet: "We received your application for Senior Product Manager." }],
      script: [
        { tools: [call("mail_search", { query: "Acme application" })] },
        { tools: [call("track_application", { goal_id: "g1", company: "Acme", role: "Senior Product Manager", status: "applied", note: "Thank you for applying to Acme" })] },
        { text: "Acme application confirmed.\n1 of 3 interviews to go after replies.\nNeeds you: pick the next roles to search." }
      ]
    });
    await goTo(page, "goals");
    await page.clock.runFor(6 * 60_000);
    await expect(page.locator(".checkin")).toContainText("Muse worked on your goals");
    await expect(lastReply(page)).toContainText("Needs you: pick the next roles to search.");
    expect((await serverState(page)).state.prefs.lastCheckin).toBe(ymd(day(23, 10)));
    await expect(page.locator(".app-st")).toHaveText("applied");
    expect((await seen(page)).turns[0].messages.at(-1).content).toContain("Do not send emails.");
    expect((await seen(page)).google).not.toContain("mail/send");

    await page.reload();                                         // opening the page again the same day
    await page.clock.runFor(6 * 60_000);
    await page.waitForTimeout(500);
    expect(await checkins(page)).toBe(1);
  });

  test("J3-T2 app closed", async ({ page }) => {
    // The app stays closed all day: nothing on the server starts a check-in.
    await page.request.post("/__test/reset", { data: { goals: [goalWith()], script: [{ text: "Brief." }], state: daily(day(22, 10)) } });
    await page.waitForTimeout(1000);
    expect(await checkins(page)).toBe(0);
    // Next morning before 9am: still nothing ran, and no brief from that day is in the chat.
    await page.clock.install({ time: day(24, 8) });
    await page.goto("/");
    await expect(page.locator("#box")).toBeEnabled();
    await page.clock.runFor(6 * 60_000);
    await page.waitForTimeout(500);
    expect(await checkins(page)).toBe(0);
    await expect(page.locator(".checkin")).toHaveCount(0);
  });

  test("J3-T3 before 9am", async ({ page }) => {
    await page.clock.install({ time: day(23, 8) });
    await open(page, { goals: [goalWith()], script: [{ text: "Brief." }, { text: "Brief again." }], state: daily(day(22, 10)) });
    await page.clock.runFor(30 * 60_000);
    await page.waitForTimeout(500);
    expect(await checkins(page)).toBe(0);
    await page.clock.runFor(60 * 60_000);                        // well past 9:00, several timer ticks
    await expect.poll(() => checkins(page)).toBe(1);
    await page.waitForTimeout(500);
    expect(await checkins(page)).toBe(1);
  });
});

// ---- J4 Get answers from my own documents ---------------------------------

test.describe("J4 Get answers from my own documents", () => {
  test("J4-T1 answer cites the document", async ({ page }) => {
    await open(page, {
      script: [
        { tools: [call("docs_search", { query: "launch date" })] },
        { tools: [call("docs_read", { doc_id: "d1" })] },
        { text: "The launch is on March 3, from meeting-notes." }
      ]
    });
    await goTo(page, "library");
    await page.locator("#docFile").setInputFiles({ name: "meeting-notes.txt", mimeType: "text/plain", buffer: Buffer.from("Team sync. The launch date is March 3. Owners: Maya and Ling.") });
    await page.locator("#docForm").getByRole("button", { name: "Add document" }).click();
    await expect(page.locator("#libList")).toContainText("meeting-notes");

    await goTo(page, "chat");
    await ask(page, "When is the launch date in my notes?");
    await expect(lastReply(page)).toHaveText("The launch is on March 3, from meeting-notes.");
    await expect(page.locator(".act", { hasText: "“launch date” →" })).toContainText("meeting-notes");
    expect((await toolReplies(page)).some(r => r.includes('"title":"meeting-notes"') && r.includes("The launch date is March 3"))).toBe(true);
  });

  test("J4-T2 file too large or unreadable", async ({ page }) => {
    await open(page);
    await goTo(page, "library");
    const upload = async file => { await page.locator("#docFile").setInputFiles(file); await page.locator("#docForm").getByRole("button", { name: "Add document" }).click(); };
    await upload({ name: "huge.txt", mimeType: "text/plain", buffer: Buffer.alloc(3 * 1024 * 1024 + 1, "a") });
    await expect(page.locator("#libSummary")).toHaveText(/Could not add document: file is too large \(max 3MB\)/i);
    await upload({ name: "blank.txt", mimeType: "text/plain", buffer: Buffer.from("   \n\n  ") });
    await expect(page.locator("#libSummary")).toHaveText("Could not add document: no readable text could be extracted from this file");
    await expect(page.locator("#libList")).not.toContainText("huge");
    await expect(page.locator("#libList")).not.toContainText("blank");
  });
});

// ---- J5 Email someone without leaving the chat ------------------------------

test.describe("J5 Email someone without leaving the chat", () => {
  const email = { to: "priya@example.com", subject: "Rescheduling Friday's meeting", body: "Hi Priya, could we move Friday's meeting to Monday?" };
  const script = after => [{ tools: [call("contacts_lookup", { name: "Priya" })] }, { tools: [call("mail_send", email)] }, { text: after }];

  test("J5-T1 approved email is sent", async ({ page }) => {
    await open(page, { google: true, state: contactsOn, script: script("Sent.") });
    await ask(page, "Email Priya about rescheduling Friday's meeting");
    const card = page.locator(".approve");
    await expect(card.locator("dd")).toHaveText(["priya@example.com", "Rescheduling Friday's meeting"]);
    await expect(card.locator("pre")).toHaveText(email.body);
    expect((await seen(page)).google).not.toContain("mail/send");
    await card.getByRole("button", { name: "Send email" }).click();
    await expect(lastReply(page)).toHaveText("Sent.");
    expect((await seen(page)).google).toContain("mail/send");
    expect((await approvals(page)).map(a => [a.result, a.by])).toEqual([["approved", "you"]]);
  });

  test("J5-T2 declined or unanswered", async ({ page }) => {
    await open(page, { google: true, state: contactsOn, script: script("I didn't send it.") });
    await ask(page, "Email Priya about rescheduling Friday's meeting");
    await page.locator(".approve").getByRole("button", { name: "Don't allow" }).click();
    await expect(lastReply(page)).toHaveText("I didn't send it.");
    expect((await seen(page)).google).not.toContain("mail/send");
    expect((await approvals(page)).map(a => a.result)).toEqual(["declined"]);

    // Unanswered: the card's time runs out (shortened from 4 minutes for the test).
    await open(page, { google: true, state: contactsOn, timeouts: { approval: 1500 }, script: script("I didn't send it.") });
    await ask(page, "Email Priya about rescheduling Friday's meeting");
    await expect(page.locator(".approve")).toBeVisible();
    await expect(lastReply(page)).toHaveText("I didn't send it.", { timeout: 10_000 });
    expect((await seen(page)).google).not.toContain("mail/send");
    expect((await approvals(page)).map(a => a.result)).toEqual(["expired"]);
  });

  test("J5-T3 unknown contact", async ({ page }) => {
    await open(page, { google: true, state: contactsOn, script: [{ tools: [call("contacts_lookup", { name: "Zed Novak" })] }, { text: "I couldn't find Zed Novak in your contacts. What's their email?" }] });
    await ask(page, "Email Zed Novak about the offsite");
    await expect(lastReply(page)).toContainText("couldn't find Zed Novak");
    await expect(page.locator(".act", { hasText: "Zed Novak" })).toContainText("not found");
    expect(await toolReplies(page)).toContain("No contact found.");
    await expect(page.locator(".approve")).toHaveCount(0);
    expect((await seen(page)).google).not.toContain("mail/send");
  });
});

// ---- J6 Turn an idea into a goal -------------------------------------------

test.describe("J6 Turn an idea into a goal", () => {
  const title = "Reach out to three former colleagues about PM openings";

  test("J6-T1 idea becomes a goal with a plan", async ({ page }) => {
    await open(page, {
      script: [
        { tools: [call("save_idea", { title, why: "Warm intros lead to interviews." })] },
        { text: "Saved that idea." },
        // The memory repo numbers the first idea i1.
        { tools: [call("create_goal", { goal: title, steps: ["List former colleagues", "Draft a short note", "Send three notes"], idea_id: "i1" })] },
        { text: "Here's a plan." }
      ]
    });
    await ask(page, "I should reach out to three former colleagues about PM openings");
    await expect(lastReply(page)).toHaveText("Saved that idea.");
    await goTo(page, "ideas");
    const card = page.locator("#ideaList article", { hasText: title });
    await expect(card).toBeVisible();
    await card.locator("[data-promote]").click();
    await expect(lastReply(page)).toHaveText("Here's a plan.");

    const [goal] = await goals(page);
    expect(goal.goal).toBe(title);
    expect(goal.steps.length).toBeGreaterThanOrEqual(3);
    expect((await ideas(page))[0].goalId).toBe(goal.id);
    await goTo(page, "goals");
    await expect(page.locator("article.goal h3")).toHaveText([title]);
    await goTo(page, "ideas");
    await expect(page.locator("#ideaList section", { hasText: "Acted on" }).locator("article", { hasText: title })).toContainText("became a goal");
  });

  test("J6-T2 same idea twice", async ({ page }) => {
    await open(page, {
      ideas: [{ id: "i9", title, why: "", kind: "Get ahead", basedOn: ["chat"], action: title, status: "saved", by: "muse", t: Date.now() }],
      script: [{ tools: [call("save_idea", { title })] }, { text: "That's already on your Ideas page." }]
    });
    await ask(page, "Idea: reach out to three former colleagues about PM openings");
    await expect(lastReply(page)).toHaveText("That's already on your Ideas page.");
    expect(await toolReplies(page)).toContain("Already on the Ideas page.");
    await goTo(page, "ideas");
    await expect(page.locator("#ideaList article", { hasText: title })).toHaveCount(1);
    expect(await ideas(page)).toHaveLength(1);
  });
});

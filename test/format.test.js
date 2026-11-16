import { test } from "node:test";
import assert from "node:assert/strict";
import { toks } from "../public/js/core/format.js";

test("Library tokenizer matches camel-cased and accented résumé titles", () => {
  assert.deepEqual(toks("SampleConsultingResume"), ["sample", "consulting", "resume"]);
  assert.deepEqual(toks("résumé"), ["resume"]);
});

test("chat text: markdown and bare https links become safe new-tab links", async () => {
  const { rich } = await import("../public/js/core/format.js");
  assert.equal(rich("[View Job](https://jobs.example.com/a?b=1&c=2)"),
    '<a href="https://jobs.example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">View Job</a>');
  assert.equal(rich("See https://example.com/jobs."),
    'See <a href="https://example.com/jobs" target="_blank" rel="noopener noreferrer">https://example.com/jobs</a>.');
  assert.equal(rich("**EY** [x](javascript:alert(1))"), "<strong>EY</strong> [x](javascript:alert(1))");
  assert.ok(!rich('[x](https://e.com/"onmouseover=alert(1))').includes('"onmouseover'));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { toks } from "../public/js/core/format.js";

test("Library tokenizer matches camel-cased and accented résumé titles", () => {
  assert.deepEqual(toks("SampleConsultingResume"), ["sample", "consulting", "resume"]);
  assert.deepEqual(toks("résumé"), ["resume"]);
});

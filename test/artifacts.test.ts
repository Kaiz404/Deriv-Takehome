import assert from "node:assert/strict";
import { test } from "node:test";
import { checkArtifacts } from "../src/check.ts";

test("artifacts satisfy the output invariants (run npm start first)", async () => {
  assert.deepEqual(await checkArtifacts(), []);
});

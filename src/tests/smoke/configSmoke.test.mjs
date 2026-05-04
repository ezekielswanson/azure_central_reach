import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../../lib/config.mjs";

test("validateConfig returns shape", () => {
  const result = validateConfig();
  assert.equal(typeof result.isValid, "boolean");
  assert.ok(Array.isArray(result.missing));
});

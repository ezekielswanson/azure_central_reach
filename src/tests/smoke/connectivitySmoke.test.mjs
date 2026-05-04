import test from "node:test";
import assert from "node:assert/strict";
import { connectivityTest } from "../../functions/connectivityTest.mjs";

test("connectivityTest returns a response object", async () => {
  const request = {
    query: new URLSearchParams(),
    async json() {
      return {};
    }
  };

  const result = await connectivityTest(request, {});
  assert.equal(typeof result.status, "number");
  assert.equal(typeof result.jsonBody, "object");
});

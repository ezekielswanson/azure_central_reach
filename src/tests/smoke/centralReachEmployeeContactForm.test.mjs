import test from "node:test";
import assert from "node:assert/strict";
import { HUBSPOT_EMPLOYEE_TYPES } from "../../constants/hubspot.mjs";
import { getEmployeeContactForm } from "../../lib/centralReachClient.mjs";

test("AWS contact forms are matched exactly by employee type", () => {
  assert.equal(getEmployeeContactForm(HUBSPOT_EMPLOYEE_TYPES.BT_RBT), "Behavior Technician NY");
  assert.equal(getEmployeeContactForm(HUBSPOT_EMPLOYEE_TYPES.BCBA), "Admin");
});

test("unsupported employee type has no contact form", () => {
  assert.equal(getEmployeeContactForm("unknown"), null);
});

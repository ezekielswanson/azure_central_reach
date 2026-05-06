import test from "node:test";
import assert from "node:assert/strict";
import { buildEmployeePayload } from "../../mappings/employees/buildEmployeePayload.mjs";
import { validateEmployeePayload } from "../../mappings/employees/validateEmployeePayload.mjs";

const config = {
  hubspot: {
    hubspotPortalId: "12345",
    btRbtObjectTypeId: "2-aaa",
    bcbaObjectTypeId: "2-bbb"
  }
};

test("BT/RBT mapping builds expected safe payload", () => {
  const mapped = buildEmployeePayload({
    employeeType: "bt_rbt",
    config,
    record: {
      id: "r1",
      properties: {
        hs_object_id: "r1",
        bt_name: "Alex Rivera",
        date_of_birth: "2000-01-02",
        gender: "male",
        email: "Alex@example.com",
        street_home: "1 Main",
        home_apt: "Apt 2",
        location_city: "Denver",
        location_home: "Colorado",
        postal_code_home: "80014",
        employee_phone: "(555) 111-2222",
        bt_rbt_type: "BT"
      }
    }
  });

  assert.equal(mapped.employeePayload.externalSystemId, "r1");
  assert.equal(mapped.employeePayload.firstName, "Alex");
  assert.equal(mapped.employeePayload.lastName, "Rivera");
  assert.equal(mapped.employeePayload.primaryEmail, "alex@example.com");
  assert.equal(mapped.employeeFamily, "bt_rbt");
  assert.equal(validateEmployeePayload(mapped.employeePayload).isValid, true);
});

test("BCBA mapping builds expected payload and metadata", () => {
  const mapped = buildEmployeePayload({
    employeeType: "bcba",
    config,
    record: {
      id: "r2",
      properties: {
        hs_object_id: "r2",
        bcba_name: "Pat Morgan",
        date_of_birth: "1990-10-20",
        work_email: "pat@work.test",
        email: "pat@home.test",
        address: "22 Oak",
        city_work: "Aurora",
        home_state: "CO",
        employee_phone: "5552223333",
        medicaid_id__ny: "ny1"
      }
    }
  });

  assert.equal(mapped.employeePayload.externalSystemId, "r2");
  assert.equal(mapped.employeePayload.primaryEmail, "pat@work.test");
  assert.equal(mapped.employeeFamily, "bcba");
  assert.equal(Object.keys(mapped.metadataValues).length > 0, true);
  assert.equal(validateEmployeePayload(mapped.employeePayload).isValid, true);
});

test("employee payload validation fails for missing identifiers", () => {
  const result = validateEmployeePayload({ firstName: "", lastName: "", externalSystemId: "" });
  assert.equal(result.isValid, false);
  assert.equal(result.errors.length > 0, true);
});

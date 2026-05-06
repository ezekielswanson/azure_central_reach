import test from "node:test";
import assert from "node:assert/strict";
import { buildEmployeePayload } from "../../mappings/employees/buildEmployeePayload.mjs";
import { validateEmployeePayload } from "../../mappings/employees/validateEmployeePayload.mjs";
import { CENTRAL_REACH_EMPLOYEE_LABELS } from "../../constants/centralReach.mjs";

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
  assert.equal(Boolean(mapped.metadataValues["138703"]), true);
  assert.equal(mapped.warnings.length, 0);
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
  assert.equal(Boolean(mapped.metadataValues["138703"]), true);
  assert.equal(mapped.warnings.length, 0);
  assert.equal(validateEmployeePayload(mapped.employeePayload).isValid, true);
});

test("BT in CO includes CO employee label", () => {
  const mapped = buildEmployeePayload({
    employeeType: "bt_rbt",
    config,
    record: {
      id: "co-bt",
      properties: {
        hs_object_id: "co-bt",
        bt_name: "Casey Quinn",
        location_home: "Colorado",
        bt_rbt_type: "BT"
      }
    }
  });

  assert.equal(
    mapped.requiredLabelIds.includes(CENTRAL_REACH_EMPLOYEE_LABELS.CO_EMPLOYEE),
    true
  );
});

test("RBT in CO includes CO employee label", () => {
  const mapped = buildEmployeePayload({
    employeeType: "bt_rbt",
    config,
    record: {
      id: "co-rbt",
      properties: {
        hs_object_id: "co-rbt",
        bt_name: "Jamie North",
        location_home: "CO",
        bt_rbt_type: "RBT"
      }
    }
  });

  assert.equal(
    mapped.requiredLabelIds.includes(CENTRAL_REACH_EMPLOYEE_LABELS.CO_EMPLOYEE),
    true
  );
});

test("BT/RBT in NY include NY employee label", () => {
  const btMapped = buildEmployeePayload({
    employeeType: "bt_rbt",
    config,
    record: {
      id: "ny-bt",
      properties: {
        hs_object_id: "ny-bt",
        bt_name: "Taylor West",
        location_home: "NY",
        bt_rbt_type: "BT"
      }
    }
  });

  const rbtMapped = buildEmployeePayload({
    employeeType: "bt_rbt",
    config,
    record: {
      id: "ny-rbt",
      properties: {
        hs_object_id: "ny-rbt",
        bt_name: "Avery East",
        location_home: "New York",
        bt_rbt_type: "RBT"
      }
    }
  });

  assert.equal(
    btMapped.requiredLabelIds.includes(CENTRAL_REACH_EMPLOYEE_LABELS.NY_EMPLOYEE),
    true
  );
  assert.equal(
    rbtMapped.requiredLabelIds.includes(CENTRAL_REACH_EMPLOYEE_LABELS.NY_EMPLOYEE),
    true
  );
});

test("BCBA in NY/CO include the correct state employee labels", () => {
  const nyMapped = buildEmployeePayload({
    employeeType: "bcba",
    config,
    record: {
      id: "ny-bcba",
      properties: {
        hs_object_id: "ny-bcba",
        bcba_name: "Morgan Hale",
        home_state: "NY"
      }
    }
  });

  const coMapped = buildEmployeePayload({
    employeeType: "bcba",
    config,
    record: {
      id: "co-bcba",
      properties: {
        hs_object_id: "co-bcba",
        bcba_name: "Jordan Vale",
        home_state: "Colorado"
      }
    }
  });

  assert.equal(
    nyMapped.requiredLabelIds.includes(CENTRAL_REACH_EMPLOYEE_LABELS.NY_EMPLOYEE),
    true
  );
  assert.equal(
    coMapped.requiredLabelIds.includes(CENTRAL_REACH_EMPLOYEE_LABELS.CO_EMPLOYEE),
    true
  );
});

test("mapping returns warning when HUBSPOT_PORTAL_ID is missing", () => {
  const mapped = buildEmployeePayload({
    employeeType: "bcba",
    config: {
      hubspot: {
        hubspotPortalId: "",
        bcbaObjectTypeId: "2-bbb"
      }
    },
    record: {
      id: "r3",
      properties: {
        hs_object_id: "r3",
        bcba_name: "Jordan Lee"
      }
    }
  });

  assert.equal(mapped.warnings.length, 1);
  assert.equal(mapped.warnings[0].code, "missing_hubspot_portal_id");
});

test("employee payload validation fails for missing identifiers", () => {
  const result = validateEmployeePayload({ firstName: "", lastName: "", externalSystemId: "" });
  assert.equal(result.isValid, false);
  assert.equal(result.errors.length > 0, true);
});

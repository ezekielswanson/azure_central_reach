import test from "node:test";
import assert from "node:assert/strict";
import { buildClientPayload } from "../../mappings/client/buildClientPayload.mjs";
import { validateClientPayload } from "../../mappings/client/validateClientPayload.mjs";

test("buildClientPayload maps and normalizes AWS canonical fields", () => {
  const payload = buildClientPayload({
    deal: {
      id: "deal-1",
      properties: {
        hs_object_id: "deal-1",
        phi_first_name__cloned_: "Alex",
        phi_last_name: "Rivera",
        phi_date_of_birth: "2017-01-14",
        phi_gender: "male",
        email: "  TeSt@Example.com ",
        phone: "+1 (212) 555-0101",
        street_address: "123 Main St",
        home_apt: "Apt 2",
        location_city: "Albany",
        location_central_reach: "New York",
        postal_code: "12207",
        guardian_first_name: "Jordan",
        guardian_last_name: "Rivera"
      }
    }
  });

  assert.equal(payload.ExternalSystemId, "deal-1");
  assert.equal(payload.PrimaryEmail, "test@example.com");
  assert.equal(payload.PhoneCell, "2125550101");
  assert.equal(payload.StateProvince, "NY");
  assert.equal(payload.Gender, "Male");
  assert.equal(payload.DateOfBirth, "2017-01-14T00:00:00.000Z");
});

test("validateClientPayload enforces required names", () => {
  const valid = validateClientPayload({
    FirstName: "Alex",
    LastName: "Rivera"
  });
  assert.equal(valid.isValid, true);

  const invalid = validateClientPayload({
    FirstName: "",
    LastName: null
  });
  assert.equal(invalid.isValid, false);
  assert.deepEqual(invalid.errors, ["FirstName is required", "LastName is required"]);
});

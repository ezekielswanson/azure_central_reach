import test from "node:test";
import assert from "node:assert/strict";
import { buildClientMetadata } from "../../mappings/client/buildClientMetadata.mjs";
import {
  CENTRAL_REACH_CLIENT_LABELS,
  CENTRAL_REACH_CLIENT_METADATA_FIELDS
} from "../../constants/centralReach.mjs";

test("buildClientMetadata maps metadata values and required labels", () => {
  const mapped = buildClientMetadata({
    deal: {
      properties: {
        hs_object_id: "777",
        location_central_reach: "NY",
        allergies: "Peanuts",
        physician_name: "Dr Smith",
        npi_number: "1112223334",
        n1_what_type_of_insurance: "medicaid ffs",
        auth_start_date: "2026-01-01",
        auth_end_date: "2026-03-31",
        insurance_primary: "Other",
        insurance_1__other__summary: "Regional Plan",
        insurance_id_1: "ABC-123"
      }
    }
  });

  assert.deepEqual(mapped.labelIds, [
    CENTRAL_REACH_CLIENT_LABELS.ALL_CLIENTS,
    CENTRAL_REACH_CLIENT_LABELS.NY_CLIENT
  ]);

  assert.equal(
    mapped.metadataValues[CENTRAL_REACH_CLIENT_METADATA_FIELDS.ALLERGIES],
    "Peanuts"
  );
  assert.equal(
    mapped.metadataValues[CENTRAL_REACH_CLIENT_METADATA_FIELDS.PHYSICIAN_CREDENTIALS],
    "Dr Smith, 1112223334"
  );
  assert.equal(
    mapped.metadataValues[CENTRAL_REACH_CLIENT_METADATA_FIELDS.AUTH_PERIOD],
    "01/01/2026 - 03/31/2026"
  );
  assert.equal(
    mapped.metadataValues[CENTRAL_REACH_CLIENT_METADATA_FIELDS.CURRENT_INSURANCE],
    "Regional Plan"
  );
});

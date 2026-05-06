import {
  CENTRAL_REACH_EMPLOYEE_LABELS,
  CENTRAL_REACH_EMPLOYEE_METADATA_FIELDS
} from "../../constants/centralReach.mjs";
import { HUBSPOT_EMPLOYEE_TYPES } from "../../constants/hubspot.mjs";

const US_STATE_NAME_TO_CODE = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
  "DISTRICT OF COLUMBIA": "DC"
};

function trimOrNull(value) {
  const stringValue = String(value ?? "").trim();
  return stringValue || null;
}

function cleanEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return email || null;
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(-10);
  }
  if (digits.length === 10) {
    return digits;
  }
  return digits || null;
}

function normalizeDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function normalizeStateCode(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  if (/^[A-Za-z]{2}$/.test(raw)) {
    return raw.toUpperCase();
  }
  const normalizedName = raw.replace(/\./g, "").replace(/\s+/g, " ").toUpperCase();
  return US_STATE_NAME_TO_CODE[normalizedName] || null;
}

function splitFullName(value) {
  const full = String(value ?? "").trim();
  if (!full) {
    return { firstName: null, lastName: null };
  }
  const parts = full.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: null, lastName: null };
  }
  return {
    firstName: parts[0] || null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null
  };
}

function mapGender(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "male" || normalized === "m") {
    return "Male";
  }
  if (normalized === "female" || normalized === "f") {
    return "Female";
  }
  return null;
}

function buildHubspotRecordUrl({ portalId, objectTypeId, recordId }) {
  const portal = String(portalId || "").trim();
  const type = String(objectTypeId || "").trim();
  const id = String(recordId || "").trim();
  if (!portal || !type || !id) {
    return null;
  }
  return `https://app.hubspot.com/contacts/${portal}/record/${type}/${id}`;
}

function requiredBtRbtLabels({ btRbtType, stateCode }) {
  const labels = [CENTRAL_REACH_EMPLOYEE_LABELS.ALL_EMPLOYEES];
  if (stateCode === "NY") {
    labels.push(
      CENTRAL_REACH_EMPLOYEE_LABELS.BT_NY,
      CENTRAL_REACH_EMPLOYEE_LABELS.CLINICAL,
      CENTRAL_REACH_EMPLOYEE_LABELS.NY_EMPLOYEE
    );
    if (btRbtType === "RBT") {
      labels.push(CENTRAL_REACH_EMPLOYEE_LABELS.RBT_NY);
    }
  }
  if (stateCode === "CO" && btRbtType === "BT") {
    labels.push(
      CENTRAL_REACH_EMPLOYEE_LABELS.CLINICAL,
      CENTRAL_REACH_EMPLOYEE_LABELS.CO_EMPLOYEE,
      CENTRAL_REACH_EMPLOYEE_LABELS.RBT_CO
    );
  }
  return labels;
}

function requiredBcbaLabels({ stateCode }) {
  const labels = [
    CENTRAL_REACH_EMPLOYEE_LABELS.ALL_EMPLOYEES,
    CENTRAL_REACH_EMPLOYEE_LABELS.BCBA,
    CENTRAL_REACH_EMPLOYEE_LABELS.CLINICAL
  ];
  if (stateCode === "NY") {
    labels.push(CENTRAL_REACH_EMPLOYEE_LABELS.NY_EMPLOYEE);
  }
  if (stateCode === "CO") {
    labels.push(CENTRAL_REACH_EMPLOYEE_LABELS.CO_EMPLOYEE);
  }
  return labels;
}

function buildBtRbtPayload({ record, config }) {
  const properties = record?.properties || {};
  const { firstName, lastName } = splitFullName(properties.bt_name);
  const stateCode = normalizeStateCode(properties.location_home);
  const btRbtType = String(properties.bt_rbt_type || "").trim().toUpperCase() || null;

  const employeePayload = {
    externalSystemId: String(properties.hs_object_id || record?.id || ""),
    firstName,
    lastName,
    gender: mapGender(properties.gender),
    dateOfBirth: normalizeDate(properties.date_of_birth),
    primaryEmail: cleanEmail(properties.email),
    addressLine1: trimOrNull(properties.street_home),
    addressLine2: trimOrNull(properties.home_apt),
    city: trimOrNull(properties.location_city),
    stateProvince: stateCode,
    zipPostalCode: trimOrNull(properties.postal_code_home) || trimOrNull(properties.postal_code),
    phoneCell: normalizePhone(properties.employee_phone)
  };

  const workAddress = [
    [trimOrNull(properties.street_address__work_), trimOrNull(properties.city__work_)]
      .filter(Boolean)
      .join(", "),
    [trimOrNull(properties.state__work_), trimOrNull(properties.postal_code__work_)]
      .filter(Boolean)
      .join(" ")
  ]
    .filter(Boolean)
    .join(", ");

  const hubspotRecordUrl = buildHubspotRecordUrl({
    portalId: config?.hubspot?.hubspotPortalId,
    objectTypeId: config?.hubspot?.btRbtObjectTypeId,
    recordId: properties.hs_object_id || record?.id
  });

  const metadataValues = {};
  if (workAddress) {
    metadataValues[CENTRAL_REACH_EMPLOYEE_METADATA_FIELDS.WORK_ADDRESS] = workAddress;
  }
  if (hubspotRecordUrl) {
    metadataValues[CENTRAL_REACH_EMPLOYEE_METADATA_FIELDS.HUBSPOT_LINK_TO_BT_RBT_RECORD] =
      hubspotRecordUrl;
  }

  return {
    employeePayload,
    metadataValues,
    requiredLabelIds: requiredBtRbtLabels({ btRbtType, stateCode }),
    stateCode,
    employeeFamily: HUBSPOT_EMPLOYEE_TYPES.BT_RBT
  };
}

function buildBcbaPayload({ record, config }) {
  const properties = record?.properties || {};
  const { firstName, lastName } = splitFullName(properties.bcba_name);
  const stateCode = normalizeStateCode(properties.home_state);

  const employeePayload = {
    externalSystemId: String(properties.hs_object_id || record?.id || ""),
    firstName,
    lastName,
    dateOfBirth: normalizeDate(properties.date_of_birth),
    primaryEmail: cleanEmail(properties.work_email),
    addressLine1: trimOrNull(properties.address),
    addressLine2: trimOrNull(properties.home_apt),
    city: trimOrNull(properties.city_work),
    stateProvince: stateCode,
    phoneCell: normalizePhone(properties.employee_phone)
  };

  const hubspotRecordUrl = buildHubspotRecordUrl({
    portalId: config?.hubspot?.hubspotPortalId,
    objectTypeId: config?.hubspot?.bcbaObjectTypeId,
    recordId: properties.hs_object_id || record?.id
  });

  const metadataValues = {
    [CENTRAL_REACH_EMPLOYEE_METADATA_FIELDS.BCBA_EMAIL]: cleanEmail(properties.email),
    [CENTRAL_REACH_EMPLOYEE_METADATA_FIELDS.BCBA_MEDICAID_ID_NY]: trimOrNull(
      properties.medicaid_id__ny
    ),
    [CENTRAL_REACH_EMPLOYEE_METADATA_FIELDS.BCBA_MEDICAID_ID_NJ]: trimOrNull(
      properties.medicaid_id__nj
    ),
    [CENTRAL_REACH_EMPLOYEE_METADATA_FIELDS.BCBA_MEDICAID_ID_CO]: trimOrNull(
      properties.medicaid_id__co
    ),
    [CENTRAL_REACH_EMPLOYEE_METADATA_FIELDS.BCBA_CREDENTIALED_WITH_MEDICAID_NY]: trimOrNull(
      properties.credentialed_insurances__ny
    )
  };

  if (hubspotRecordUrl) {
    metadataValues[CENTRAL_REACH_EMPLOYEE_METADATA_FIELDS.HUBSPOT_LINK_TO_BCBA_RECORD] =
      hubspotRecordUrl;
  }

  return {
    employeePayload,
    metadataValues,
    requiredLabelIds: requiredBcbaLabels({ stateCode }),
    stateCode,
    employeeFamily: HUBSPOT_EMPLOYEE_TYPES.BCBA
  };
}

export function buildEmployeePayload({ record, employeeType, config }) {
  if (employeeType === HUBSPOT_EMPLOYEE_TYPES.BT_RBT) {
    return buildBtRbtPayload({ record, config });
  }
  if (employeeType === HUBSPOT_EMPLOYEE_TYPES.BCBA) {
    return buildBcbaPayload({ record, config });
  }
  throw new Error("Unsupported employeeType");
}

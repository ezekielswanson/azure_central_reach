import {
  CENTRAL_REACH_CLIENT_LABELS,
  CENTRAL_REACH_CLIENT_METADATA_FIELDS
} from "../../constants/centralReach.mjs";

function toTrimmedOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const stringValue = String(value).trim();
  return stringValue || null;
}

function joinMetadataParts(parts) {
  const clean = parts.map((part) => toTrimmedOrNull(part)).filter(Boolean);
  return clean.length ? clean.join(", ") : null;
}

function hsDateToIsoOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    const fromEpoch = new Date(asNumber);
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch.toISOString();
  }

  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString();
}

function toMetadataDate(value) {
  const iso = hsDateToIsoOrNull(value);
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function getCurrentInsuranceMetaValue(dealProps) {
  const primary = toTrimmedOrNull(dealProps.insurance_primary);
  const otherSummary = toTrimmedOrNull(dealProps.insurance_1__other__summary);

  if (primary && primary.toLowerCase() === "other") {
    return otherSummary || "Other";
  }

  return primary || otherSummary || null;
}

function getInsuranceIdForMetaField(dealProps, slotIndex) {
  return toTrimmedOrNull(dealProps[`insurance_id_${slotIndex}`]);
}

function getPhysicianCredentialsByInsuranceType(dealProps) {
  const insuranceType = toTrimmedOrNull(dealProps.n1_what_type_of_insurance)?.toLowerCase();
  if (insuranceType === "medicaid ffs") {
    return joinMetadataParts([dealProps.physician_name, dealProps.npi_number]);
  }

  if (insuranceType === "commercial enrolled" || insuranceType === "commercial oon") {
    return joinMetadataParts([dealProps.physician_name__commercial, dealProps.npi_number__commercial]);
  }

  return null;
}

function getAsdDiagnosisDateByInsuranceType(dealProps) {
  const insuranceType = toTrimmedOrNull(dealProps.n1_what_type_of_insurance)?.toLowerCase();
  if (insuranceType === "medicaid ffs") {
    return toMetadataDate(dealProps.most_recent_asd_diagnosis_date_medicaid);
  }

  if (insuranceType === "commercial enrolled" || insuranceType === "commercial oon") {
    return toMetadataDate(dealProps.most_recent_asd_diagnosis_date_1);
  }

  return null;
}

function getSecondaryAsdDiagnosisDateByInsuranceType(dealProps) {
  const insuranceType = toTrimmedOrNull(dealProps.n2_what_type_of_insurance)?.toLowerCase();
  if (insuranceType === "medicaid ffs") {
    return toMetadataDate(dealProps.most_recent_asd_diagnosis_date_medicaid);
  }

  if (insuranceType === "commercial enrolled" || insuranceType === "commercial oon") {
    return toMetadataDate(dealProps.most_recent_asd_diagnosis_date_2);
  }

  return null;
}

function getAuthPeriodValue(dealProps) {
  const start = toMetadataDate(dealProps.auth_start_date);
  const end = toMetadataDate(dealProps.auth_end_date);
  if (start && end) {
    return `${start} - ${end}`;
  }
  return start || end || null;
}

function normalizeClientStateForLabel(stateValue) {
  const normalized = String(stateValue || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "ny" || normalized === "new york") {
    return "NY";
  }
  if (normalized === "co" || normalized === "colorado") {
    return "CO";
  }
  return null;
}

function requiredClientLabelIdsForState(stateValue) {
  const normalizedState = normalizeClientStateForLabel(stateValue);
  const labelIds = [CENTRAL_REACH_CLIENT_LABELS.ALL_CLIENTS];
  if (normalizedState === "NY") {
    labelIds.push(CENTRAL_REACH_CLIENT_LABELS.NY_CLIENT);
  }
  if (normalizedState === "CO") {
    labelIds.push(CENTRAL_REACH_CLIENT_LABELS.CO_CLIENT);
  }
  return labelIds;
}

function buildHubspotDealUrl(hsObjectId) {
  const dealId = String(hsObjectId || "").trim();
  if (!dealId) {
    return null;
  }
  const portalId = process.env.HUBSPOT_PORTAL_ID_TEST || "50850427";
  const dealObjectTypeId = process.env.HUBSPOT_DEAL_OBJECT_TYPE_ID || "0-3";
  return `https://app.hubspot.com/contacts/${portalId}/record/${dealObjectTypeId}/${dealId}`;
}

export function buildClientMetadata({ deal }) {
  const dealProps = deal?.properties || {};

  const metadataValues = {
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.ALLERGIES]: toTrimmedOrNull(dealProps.allergies),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.MALADAPTIVE_BEHAVIORS]: toTrimmedOrNull(
      dealProps.maladaptive_behaviors__clinical
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.COMORBID_DIAGNOSIS]: toTrimmedOrNull(
      dealProps.comorbid_diagnosis__clinical
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.BT_1_NAME]: toTrimmedOrNull(dealProps.current_primary_bt),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.BT_2_NAME]: toTrimmedOrNull(dealProps.current_primary_bt_2),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.WORK_SCHEDULE_1]: toTrimmedOrNull(
      dealProps.bt_work_schedule_confirmed
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.WORK_SCHEDULE_2]: toTrimmedOrNull(
      dealProps.bt_work_schedule_2_confirmed
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.CLIENT_AVAILABILITY]: toTrimmedOrNull(
      dealProps.client_availability_completed
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.TOTAL_ASSIGNED_HOURS]: toTrimmedOrNull(
      dealProps.assigned_hours
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.APPROVED_AUTH_HOURS]: toTrimmedOrNull(
      dealProps.authorized_hours
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.AUTH_PERIOD]: getAuthPeriodValue(dealProps),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.PHYSICIAN_CREDENTIALS]:
      getPhysicianCredentialsByInsuranceType(dealProps),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.ASD_DIAGNOSIS_DATE]:
      getAsdDiagnosisDateByInsuranceType(dealProps),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.ASD_DIAGNOSIS_DATE_SECONDARY]:
      getSecondaryAsdDiagnosisDateByInsuranceType(dealProps),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.SUPERVISING_BCBA]: toTrimmedOrNull(
      dealProps.supervising_bcba
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.INITIAL_ASSESSMENT_BCBA]: toTrimmedOrNull(
      dealProps.initial_assessment_bcba
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.SEVERITY_LEVEL]: toTrimmedOrNull(
      dealProps.severity_level_clinical
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.POLICY_HOLDER_NAME]: toTrimmedOrNull(
      dealProps.policy_holder_name
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.POLICY_HOLDER_DOB]: toMetadataDate(
      dealProps.phi__policy_holder_dob
    ),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.CURRENT_INSURANCE]:
      getCurrentInsuranceMetaValue(dealProps),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.INSURANCE_ID]: getInsuranceIdForMetaField(dealProps, 1),
    [CENTRAL_REACH_CLIENT_METADATA_FIELDS.HUBSPOT_LINK_TO_CASE_RECORD]: buildHubspotDealUrl(
      dealProps.hs_object_id
    )
  };

  return {
    labelIds: requiredClientLabelIdsForState(
      dealProps.location_central_reach || dealProps.location
    ),
    metadataValues
  };
}

export const HUBSPOT_OBJECTS = {
  DEAL: "deal",
  CONTACT: "contact",
  BT_RBT: "bt_rbt",
  BCBA: "bcba"
};

export const HUBSPOT_DEAL_PROPERTIES = {
  STAGE: "dealstage",
  PIPELINE: "pipeline"
};

export const HUBSPOT_EMPLOYEE_TYPES = {
  BT_RBT: "bt_rbt",
  BCBA: "bcba"
};

export const HUBSPOT_EMPLOYEE_TYPE_SET = new Set(Object.values(HUBSPOT_EMPLOYEE_TYPES));

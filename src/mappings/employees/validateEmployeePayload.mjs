export function validateEmployeePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { isValid: false, errors: ["Payload must be an object"] };
  }

  // TODO: add employee payload validation rules in phase 3.
  return { isValid: true, errors: [] };
}

export function validateClientPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { isValid: false, errors: ["Payload must be an object"] };
  }

  // TODO: add client payload validation rules in phase 2.
  return { isValid: true, errors: [] };
}

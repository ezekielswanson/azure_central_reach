export function validateClientPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { isValid: false, errors: ["Payload must be an object"] };
  }

  const errors = [];

  if (!payload.FirstName) {
    errors.push("FirstName is required");
  }

  if (!payload.LastName) {
    errors.push("LastName is required");
  }

  return { isValid: errors.length === 0, errors };
}

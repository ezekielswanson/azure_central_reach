export function validateEmployeePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { isValid: false, errors: ["Payload must be an object"] };
  }

  const errors = [];
  if (!payload.externalSystemId || String(payload.externalSystemId).trim() === "") {
    errors.push("externalSystemId is required");
  }

  const hasAnyName =
    (payload.firstName && String(payload.firstName).trim() !== "") ||
    (payload.lastName && String(payload.lastName).trim() !== "");
  if (!hasAnyName) {
    errors.push("At least one of firstName or lastName is required");
  }

  return { isValid: errors.length === 0, errors };
}

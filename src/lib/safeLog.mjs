const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_REGEX = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;

export function safeString(value, max = 200) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = typeof value === "string" ? value : JSON.stringify(value);
  return stringValue.length > max ? `${stringValue.slice(0, max)}...` : stringValue;
}

export function redactPotentialPhi(value) {
  const text = safeString(value, 2000);
  return text
    .replace(EMAIL_REGEX, "[REDACTED_EMAIL]")
    .replace(PHONE_REGEX, "[REDACTED_PHONE]");
}

export function safeLog(level = "info", message = "", meta = {}) {
  const logLevel = typeof console[level] === "function" ? level : "log";
  const redactedMeta = {};

  for (const [key, value] of Object.entries(meta)) {
    redactedMeta[key] = redactPotentialPhi(value);
  }

  console[logLevel](redactPotentialPhi(message), redactedMeta);
}

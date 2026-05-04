export function nowIso() {
  return new Date().toISOString();
}

export function addSeconds(date, seconds) {
  const base = date instanceof Date ? date : new Date(date);
  return new Date(base.getTime() + seconds * 1000);
}

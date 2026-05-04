function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetriableStatus(status) {
  if (!status) {
    return false;
  }
  return status === 429 || (status >= 500 && status <= 599);
}

export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 400,
    maxDelayMs = 5000
  } = options;

  let attempt = 0;
  let lastError;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      if (!isRetriableStatus(status) || attempt >= maxAttempts) {
        throw error;
      }

      const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

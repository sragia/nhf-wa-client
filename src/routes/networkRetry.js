/**
 * Fetch with retries and backoff for transient DNS / TLS / wake-from-sleep failures.
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {number} [maxAttempts]
 */
export async function fetchWithRetry(url, init = {}, maxAttempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {number} [maxAttempts]
 */
export async function fetchJsonWithRetry(url, init, maxAttempts) {
  const response = await fetchWithRetry(url, init, maxAttempts);
  return response.json();
}

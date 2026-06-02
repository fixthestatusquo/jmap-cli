// ---------------------------------------------------------------------------
// Authentication helpers (legacy)
// ---------------------------------------------------------------------------
// The OAuth2 TokenManager in lib/oauth.js is now the primary auth path.
// This module is kept for backward compatibility only.
// ---------------------------------------------------------------------------

/**
 * @deprecated Use JmapClient with OAuth2 (JMAP_TOKEN env var) instead.
 */
export async function getBearerToken() {
  const res = await fetch(`${process.env.JMAP_BASE_URL}/jmap/authentication`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.JMAP_USERNAME,
      password: process.env.JMAP_PASSWORD,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Authentication failed: ${res.status} ${err.detail || res.statusText}`,
    );
  }

  const data = await res.json();
  return data.accessToken;
}

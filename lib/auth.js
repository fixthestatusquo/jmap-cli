// ---------------------------------------------------------------------------
// Authentication helpers for jmap-cli
// ---------------------------------------------------------------------------
// Provides getBearerToken() for backward compatibility with the old
// /jmap/authentication endpoint, plus an OAuth2 TokenManager import.
// ---------------------------------------------------------------------------

import dotenv from "dotenv";

dotenv.config();

let cachedToken = null;

/**
 * Authenticate via the JMAP /jmap/authentication endpoint (legacy).
 *
 * @deprecated Use OAuth2 (authType: "oauth2") instead.
 * @returns {Promise<string>} Bearer access token
 */
export async function getBearerToken() {
  if (cachedToken) return cachedToken;

  const res = await fetch(`${process.env.JMAP_BASE_URL}/jmap/authentication`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.JMAP_USERNAME,
      password: process.env.JMAP_PASSWORD,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch((e) => {
      console.log(
        "invalid url",
        `${process.env.JMAP_BASE_URL}/jmap/authentication`,
        e,
      );
      throw e;
    });
    throw new Error(
      `Authentication failed: ${res.status} ${err.detail || res.statusText} ${process.env.JMAP_BASE_URL}/jmap/authentication`,
    );
  }

  const data = await res.json().catch((e) =>
    console.log("not json", `${process.env.JMAP_BASE_URL}/authentication`, e),
  );
  cachedToken = data.accessToken;

  return cachedToken;
}

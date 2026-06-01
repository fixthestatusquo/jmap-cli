// ---------------------------------------------------------------------------
// Authentication type declarations
// ---------------------------------------------------------------------------

/**
 * Authenticate with the JMAP server using Basic-auth credentials from
 * environment variables (JMAP_USERNAME, JMAP_PASSWORD, JMAP_BASE_URL).
 *
 * Makes a POST to `${JMAP_BASE_URL}/jmap/authentication` and returns
 * a bearer access token from the response.
 *
 * The token is cached in-memory after the first successful call.
 */
export function getBearerToken(): Promise<string>;

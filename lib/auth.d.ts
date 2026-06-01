// ---------------------------------------------------------------------------
// Authentication type declarations
// ---------------------------------------------------------------------------

/**
 * Authenticate with the JMAP server using the legacy /jmap/authentication
 * endpoint with Basic-auth credentials from environment variables.
 *
 * @deprecated Use OAuth2 (authType: "oauth2" in JmapClient) instead.
 *
 * Makes a POST to `${JMAP_BASE_URL}/jmap/authentication` and returns
 * a bearer access token from the response.
 *
 * The token is cached in-memory after the first successful call.
 */
export function getBearerToken(): Promise<string>;

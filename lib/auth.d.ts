// ---------------------------------------------------------------------------
// Authentication type declarations (legacy)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use OAuth2 (JMAP_TOKEN env var / JmapClient constructor) instead.
 *
 * Authenticate via the legacy JMAP /jmap/authentication endpoint.
 */
export function getBearerToken(): Promise<string>;

// ---------------------------------------------------------------------------
// Error type declarations
// ---------------------------------------------------------------------------

/** Base class for all OAuth2-related errors in jmap-cli. */
export class OAuthError extends Error {
  name: string;
  constructor(message?: string);
}

/** Access token expired and refresh failed. */
export class OAuthTokenExpired extends OAuthError {
  name: string;
  constructor(message?: string);
}

/** Refresh token revoked by the server (invalid_grant). Re-authentication required. */
export class OAuthTokenRevoked extends OAuthError {
  name: string;
  constructor(message?: string);
}

/** Cannot discover or construct the OAuth2 token endpoint. */
export class OAuthDiscoveryFailed extends OAuthError {
  name: string;
  constructor(message?: string);
}

/** Missing or invalid OAuth2 configuration. */
export class OAuthConfigurationError extends OAuthError {
  name: string;
  constructor(message?: string);
}

// ---------------------------------------------------------------------------
// OAuth2-specific error types for jmap-cli
// ---------------------------------------------------------------------------

/**
 * Base class for all OAuth2-related errors in jmap-cli.
 */
export class OAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "OAuthError";
  }
}

/**
 * Access token has expired and the refresh attempt also failed.
 */
export class OAuthTokenExpired extends OAuthError {
  constructor(message = "Access token expired and could not be refreshed") {
    super(message);
    this.name = "OAuthTokenExpired";
  }
}

/**
 * Refresh token has been revoked by the server (invalid_grant).
 * The user must re-authenticate.
 */
export class OAuthTokenRevoked extends OAuthError {
  constructor(
    message = "Refresh token has been revoked. Re-authentication is required.",
  ) {
    super(message);
    this.name = "OAuthTokenRevoked";
  }
}

/**
 * Cannot discover or construct the OAuth2 token endpoint.
 */
export class OAuthDiscoveryFailed extends OAuthError {
  constructor(message = "Failed to discover OAuth2 token endpoint") {
    super(message);
    this.name = "OAuthDiscoveryFailed";
  }
}

/**
 * Missing or invalid OAuth2 configuration parameters.
 */
export class OAuthConfigurationError extends OAuthError {
  constructor(message = "Invalid OAuth2 configuration") {
    super(message);
    this.name = "OAuthConfigurationError";
  }
}

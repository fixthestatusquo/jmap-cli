// ---------------------------------------------------------------------------
// OAuth2 TokenManager type declarations
// ---------------------------------------------------------------------------

export interface TokenManagerOptions {
  /** JMAP base URL (for discovery) */
  baseUrl?: string;
  /** Explicit token endpoint URL (skips auto-discovery) */
  tokenEndpoint?: string;
  /** Explicit device authorization endpoint (skips auto-discovery) */
  deviceEndpoint?: string;
  /** OAuth2 client ID (default: "jmap-client") */
  clientId?: string;
  /** JMAP username (for Basic Auth) */
  username?: string;
  /** JMAP password (for Basic Auth) */
  password?: string;
  /** Pre-existing access token — JMAP_TOKEN */
  token?: string;
  /** Pre-existing refresh token — JMAP_REFRESH_TOKEN */
  refreshToken?: string;
}

export interface OAuthTokenState {
  token: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

/**
 * Manages authentication for jmap-cli.
 *
 * Supports three strategies:
 *   - Basic Auth (username + password → "Basic base64" header)
 *   - OAuth2 Bearer token with refresh_token grant
 *   - Device Authorization Grant (RFC 8628) for interactive CLI login
 *
 * All values fall back to environment variables.
 */
export class TokenManager {
  baseUrl: string;
  tokenEndpoint: string;
  deviceEndpoint: string;
  clientId: string;
  username: string;
  password: string;

  constructor(options?: TokenManagerOptions);

  /**
   * Ensure a valid access token is available.
   * Order: Basic Auth → cached Bearer → refresh token → error.
   */
  getValidToken(): Promise<string>;

  /** Return the current refresh token (for serialization). */
  getRefreshToken(): string | null;

  /** Return the current access token without triggering refresh. */
  getAccessToken(): string | null;

  /** Return token expiry timestamp (ms) or null. */
  getExpiresAt(): number | null;

  /** Serialize current token state to a plain object. */
  serialize(): OAuthTokenState;

  /** Restore token state from a previously serialized object. */
  deserialize(state: OAuthTokenState): void;

  /** Clear all stored tokens (logout / revocation). */
  clearTokens(): void;

  /** Set a Basic Auth token from username:password. */
  setBasicAuth(username: string, password: string): void;

  /**
   * Initiate Device Authorization Grant (RFC 8628) flow.
   * Displays a URL + code, polls until user authorizes, returns token.
   */
  deviceLogin(options?: {
    onInstruction?: (info: {
      userCode: string;
      verificationUri: string;
    }) => void;
  }): Promise<string>;

  /** @internal Discover the token endpoint */
  _discoverTokenEndpoint(sessionUrl?: string): Promise<string>;

  /** @internal Discover the device authorization endpoint */
  _discoverDeviceEndpoint(sessionUrl?: string): Promise<string>;

  /** @internal Refresh tokens via refresh_token grant */
  _refresh(): Promise<void>;

  /** @internal Handle token response from server */
  _handleTokenResponse(data: Record<string, unknown>): void;
}

export default TokenManager;

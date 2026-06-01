// ---------------------------------------------------------------------------
// OAuth2 TokenManager type declarations
// ---------------------------------------------------------------------------

export interface TokenManagerOptions {
  /** JMAP base URL (for discovery) */
  baseUrl?: string;
  /** Explicit token endpoint URL (skips auto-discovery) */
  tokenEndpoint?: string;
  /** OAuth2 client ID (default: "jmap-client") */
  clientId?: string;
  /** JMAP username (for password grant) */
  username?: string;
  /** JMAP password (for password grant) */
  password?: string;
  /** Pre-existing access token (JWT) — JMAP_TOKEN */
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
 * Manages the OAuth2 token lifecycle for JMAP:
 *   - Auto-discovery of the token endpoint
 *   - Initial token acquisition via password grant
 *   - Token refresh via refresh_token grant
 *   - Token expiry validation with configurable buffer
 *   - Single retry on 401 responses
 *
 * All values fall back to environment variables:
 *   JMAP_TOKEN, JMAP_REFRESH_TOKEN, JMAP_USERNAME, JMAP_PASSWORD,
 *   JMAP_BASE_URL, JMAP_CLIENT_ID, JMAP_AUTH_TOKEN_ENDPOINT
 */
export class TokenManager {
  baseUrl: string;
  tokenEndpoint: string;
  clientId: string;
  username: string;
  password: string;

  constructor(options?: TokenManagerOptions);

  /**
   * Ensure a valid access token is available.
   * Order: cached token → refresh token → password grant.
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

  /** @internal Discover the token endpoint from JMAP session or construct */
  _discoverTokenEndpoint(sessionUrl?: string): Promise<string>;

  /** @internal Acquire tokens via password grant */
  _acquireToken(): Promise<void>;

  /** @internal Refresh tokens via refresh_token grant */
  _refresh(): Promise<void>;

  /** @internal Handle token response from server */
  _handleTokenResponse(data: Record<string, unknown>): void;
}

export default TokenManager;

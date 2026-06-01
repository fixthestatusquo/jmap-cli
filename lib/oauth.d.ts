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
  /** Pre-existing access token (JWT) */
  accessToken?: string;
  /** Pre-existing refresh token */
  refreshToken?: string;
  /** Auto-refresh on expiry (default: true) */
  autoRefresh?: boolean;
  /** Persist tokens to disk (default: false) */
  persistTokens?: boolean;
}

export interface OAuthTokenState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

/**
 * Manages the OAuth2 token lifecycle for JMAP:
 *   - Auto-discovery of the token endpoint
 *   - Initial token acquisition via password grant
 *   - Token refresh via refresh_token grant
 *   - Token expiry validation with configurable buffer
 *   - In-memory caching + optional file persistence
 *   - Single retry on 401 responses
 */
export class TokenManager {
  /** JMAP base URL */
  baseUrl: string;
  /** OAuth2 token endpoint */
  tokenEndpoint: string;
  /** OAuth2 client ID */
  clientId: string;
  /** JMAP username */
  username: string;
  /** JMAP password */
  password: string;
  /** Whether auto-refresh is enabled */
  autoRefresh: boolean;
  /** Whether tokens are persisted to disk */
  persistTokens: boolean;

  constructor(options?: TokenManagerOptions);

  /**
   * Ensure a valid access token is available.
   * Triggers discovery, password grant, or refresh as needed.
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
  clearTokens(): Promise<void>;

  /** @internal Discover the token endpoint from JMAP session */
  _discoverTokenEndpoint(sessionUrl?: string): Promise<string>;

  /** @internal Acquire tokens via password grant */
  _acquireToken(): Promise<void>;

  /** @internal Refresh tokens via refresh_token grant */
  _refresh(): Promise<void>;

  /** @internal Handle token response from server */
  _handleTokenResponse(data: Record<string, unknown>): void;
}

export default TokenManager;

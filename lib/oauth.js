// ---------------------------------------------------------------------------
// TokenManager — OAuth2 token lifecycle for jmap-cli
// ---------------------------------------------------------------------------
//
// Handles:
//   - Auto-discovery of the token endpoint from the JMAP session
//   - Initial token acquisition via password grant
//   - Token refresh via refresh_token grant
//   - Token expiry validation with configurable buffer
//   - In-memory caching + optional file persistence
//   - Single retry on 401 responses
//
// Stalwart defaults:
//   - token endpoint:  https://server/auth/token
//   - client_id:       "jmap-client"
//   - access token:    1 hour
//   - refresh token:   30 days
//   - renewal window:  4 days (new refresh_token issued below this)
// ---------------------------------------------------------------------------

import {
  OAuthTokenExpired,
  OAuthTokenRevoked,
  OAuthDiscoveryFailed,
  OAuthConfigurationError,
} from "./errors.js";

const DEFAULT_CLIENT_ID = "jmap-client";
const DEFAULT_EXPIRY_SECONDS = 3600; // 1 hour
const REFRESH_BUFFER_SECONDS = 60; // refresh if expiring within 60s
const TOKEN_PERSIST_PATH = ".jmap-token.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExpired(expiresAt, bufferSeconds = REFRESH_BUFFER_SECONDS) {
  return Date.now() + bufferSeconds * 1000 >= expiresAt;
}

// ---------------------------------------------------------------------------
// TokenManager
// ---------------------------------------------------------------------------

export class TokenManager {
  /**
   * Create a TokenManager.
   *
   * @param {object} options
   * @param {string} [options.baseUrl]          JMAP base URL (for discovery)
   * @param {string} [options.tokenEndpoint]    Explicit token endpoint (skips discovery)
   * @param {string} [options.clientId]         OAuth client ID (default: "jmap-client")
   * @param {string} [options.username]         JMAP username (for password grant)
   * @param {string} [options.password]         JMAP password (for password grant)
   * @param {string} [options.accessToken]      Pre-existing access token
   * @param {string} [options.refreshToken]     Pre-existing refresh token
   * @param {boolean} [options.autoRefresh]     Auto-refresh on expiry (default: true)
   * @param {boolean} [options.persistTokens]   Persist tokens to disk (default: false)
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.JMAP_BASE_URL || "";
    this.tokenEndpoint = options.tokenEndpoint || process.env.JMAP_AUTH_TOKEN_ENDPOINT || "";
    this.clientId = options.clientId || process.env.JMAP_CLIENT_ID || DEFAULT_CLIENT_ID;
    this.username = options.username || process.env.JMAP_USERNAME || "";
    this.password = options.password || process.env.JMAP_PASSWORD || "";
    this.autoRefresh =
      options.autoRefresh !== undefined
        ? options.autoRefresh
        : process.env.JMAP_AUTO_REFRESH !== "false";
    this.persistTokens =
      options.persistTokens !== undefined
        ? options.persistTokens
        : process.env.JMAP_PERSIST_TOKENS === "true";

    // In-memory token store
    this._accessToken = options.accessToken || process.env.JMAP_ACCESS_TOKEN || null;
    this._refreshToken = options.refreshToken || process.env.JMAP_REFRESH_TOKEN || null;
    this._expiresAt = null; // timestamp ms

    // Discovery flag
    this._discoveryDone = false;

    // Load persisted tokens will happen lazily on first getValidToken()
    this._loadPromise = null;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Ensure a valid access token is available.  Returns the token string.
   * Triggers discovery, password grant, or refresh as needed.
   *
   * @returns {Promise<string>}
   */
  async getValidToken() {
    // Lazy-load persisted tokens on first call
    if (this._loadPromise === null) {
      this._loadPromise = this._loadPersistedTokens();
    }
    await this._loadPromise;

    // 1. If we have an access token that is not expired, return it.
    if (this._accessToken && this._expiresAt && !isExpired(this._expiresAt)) {
      return this._accessToken;
    }

    // 2. If we have a refresh token, try to refresh.
    if (this._refreshToken && this.autoRefresh) {
      try {
        await this._refresh();
        return this._accessToken;
      } catch (err) {
        if (err instanceof OAuthTokenRevoked) {
          throw err;
        }
        // Other refresh errors → fall through
      }
    }

    // 3. If we have username/password, try password grant.
    if (this.username && this.password) {
      await this._acquireToken();
      return this._accessToken;
    }

    // 4. If we have an access token that is expired but no way to refresh,
    //    give the caller a clear error.
    if (this._accessToken) {
      throw new OAuthTokenExpired(
        "Access token has expired and no refresh mechanism is available.",
      );
    }

    // 5. Nothing at all.
    throw new OAuthConfigurationError(
      "No OAuth2 credentials available. Provide username/password, access_token, or refresh_token.",
    );
  }

  /**
   * Return the current refresh token (for serialization).
   */
  getRefreshToken() {
    return this._refreshToken;
  }

  /**
   * Return the current access token without triggering refresh.
   */
  getAccessToken() {
    return this._accessToken;
  }

  /**
   * Return token expiry timestamp (ms) or null.
   */
  getExpiresAt() {
    return this._expiresAt;
  }

  /**
   * Serialize current token state to a plain object.
   */
  serialize() {
    return {
      accessToken: this._accessToken,
      refreshToken: this._refreshToken,
      expiresAt: this._expiresAt,
    };
  }

  /**
   * Restore token state from a previously serialized object.
   */
  deserialize(state) {
    if (state.accessToken) this._accessToken = state.accessToken;
    if (state.refreshToken) this._refreshToken = state.refreshToken;
    if (state.expiresAt) this._expiresAt = state.expiresAt;
  }

  /**
   * Clear all stored tokens (logout / revocation).
   */
  async clearTokens() {
    this._accessToken = null;
    this._refreshToken = null;
    this._expiresAt = null;
    await this._removePersistedTokens();
  }

  // -----------------------------------------------------------------------
  // Token endpoint discovery
  // -----------------------------------------------------------------------

  async _discoverTokenEndpoint(sessionUrl) {
    if (this.tokenEndpoint) {
      return this.tokenEndpoint;
    }

    // Try from session URL
    if (sessionUrl) {
      try {
        const res = await fetch(sessionUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (res.ok) {
          const session = await res.json();

          // Stalwart may include OAuth endpoints in the session response
          if (session.oAuthTokenEndpoint || session.authTokenEndpoint) {
            const ep =
              session.oAuthTokenEndpoint || session.authTokenEndpoint;
            this.tokenEndpoint = ep;
            return ep;
          }
        }
      } catch {
        // Discovery failure is non-fatal; fall back to construction
      }
    }

    // Construct from baseUrl
    if (this.baseUrl) {
      const constructed = `${this.baseUrl.replace(/\/+$/, "")}/auth/token`;
      this.tokenEndpoint = constructed;
      return constructed;
    }

    throw new OAuthDiscoveryFailed(
      "Could not discover or construct the OAuth2 token endpoint.",
    );
  }

  // -----------------------------------------------------------------------
  // Token acquisition (password grant)
  // -----------------------------------------------------------------------

  async _acquireToken() {
    const endpoint = await this._discoverTokenEndpoint(
      this.baseUrl ? `${this.baseUrl}/.well-known/jmap` : undefined,
    );

    if (!this.username || !this.password) {
      throw new OAuthConfigurationError(
        "Username and password are required for OAuth2 password grant.",
      );
    }

    const body = new URLSearchParams();
    body.set("grant_type", "password");
    body.set("username", this.username);
    body.set("password", this.password);
    body.set("client_id", this.clientId);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new OAuthConfigurationError(
        `Token acquisition failed: ${res.status} ${errBody.error_description || errBody.error || res.statusText}`,
      );
    }

    const data = await res.json();
    this._handleTokenResponse(data);
  }

  // -----------------------------------------------------------------------
  // Token refresh (refresh_token grant)
  // -----------------------------------------------------------------------

  async _refresh() {
    const endpoint = await this._discoverTokenEndpoint(
      this.baseUrl ? `${this.baseUrl}/.well-known/jmap` : undefined,
    );

    if (!this._refreshToken) {
      throw new OAuthTokenExpired("No refresh token available to refresh.");
    }

    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", this._refreshToken);
    body.set("client_id", this.clientId);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      let errBody;
      try {
        errBody = await res.json();
      } catch {
        errBody = {};
      }

      const errorCode = errBody.error || "";

      // invalid_grant → token revoked (password changed, account archived)
      if (errorCode === "invalid_grant") {
        this.clearTokens();
        throw new OAuthTokenRevoked(
          `Refresh token has been revoked (${errBody.error_description || "invalid_grant"}). Please re-authenticate.`,
        );
      }

      throw new OAuthTokenExpired(
        `Token refresh failed: ${res.status} ${errBody.error_description || errBody.error || res.statusText}`,
      );
    }

    const data = await res.json();
    this._handleTokenResponse(data);
  }

  // -----------------------------------------------------------------------
  // Response handler
  // -----------------------------------------------------------------------

  _handleTokenResponse(data) {
    this._accessToken = data.access_token || this._accessToken;

    // Refresh token rotation: server may issue a new refresh token
    if (data.refresh_token) {
      this._refreshToken = data.refresh_token;
    }

    // Expiry
    const expiresIn = data.expires_in || DEFAULT_EXPIRY_SECONDS;
    this._expiresAt = Date.now() + expiresIn * 1000;

    // Persist to disk if enabled
    if (this.persistTokens) {
      this._persistTokens();
    }
  }

  // -----------------------------------------------------------------------
  // Token persistence (optional)
  // -----------------------------------------------------------------------

  async _persistTokens() {
    try {
      const { writeFile } = await import("fs/promises");
      const data = JSON.stringify(this.serialize(), null, 2);
      await writeFile(TOKEN_PERSIST_PATH, data, { mode: 0o600 });
    } catch {
      // Non-critical; fail silently
    }
  }

  async _loadPersistedTokens() {
    try {
      const { readFile } = await import("fs/promises");
      const data = await readFile(TOKEN_PERSIST_PATH, "utf-8");
      const state = JSON.parse(data);
      this.deserialize(state);
    } catch {
      // No persisted tokens → fine
    }
  }

  async _removePersistedTokens() {
    try {
      const { unlink } = await import("fs/promises");
      await unlink(TOKEN_PERSIST_PATH);
    } catch {
      // File may not exist
    }
  }
}

export default TokenManager;

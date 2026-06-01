// ---------------------------------------------------------------------------
// TokenManager — OAuth2 token lifecycle for jmap-cli
// ---------------------------------------------------------------------------
//
// Handles:
//   - Auto-discovery of the token endpoint from the JMAP session
//   - Initial token acquisition via password grant
//   - Token refresh via refresh_token grant
//   - Token expiry validation with configurable buffer
//   - Single 401 retry
//
// Stalwart defaults:
//   - token endpoint:  https://server/auth/token
//   - client_id:       "jmap-client"
//   - access token:    1 hour
//   - refresh token:   30 days
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
   * All values fall back to environment variables:
   *   JMAP_TOKEN, JMAP_REFRESH_TOKEN, JMAP_USERNAME, JMAP_PASSWORD,
   *   JMAP_BASE_URL, JMAP_CLIENT_ID, JMAP_AUTH_TOKEN_ENDPOINT
   *
   * @param {object} [options]
   * @param {string} [options.baseUrl]          JMAP base URL
   * @param {string} [options.tokenEndpoint]    Explicit token endpoint (skips discovery)
   * @param {string} [options.clientId]         OAuth client ID (default: "jmap-client")
   * @param {string} [options.username]         JMAP username (for password grant)
   * @param {string} [options.password]         JMAP password (for password grant)
   * @param {string} [options.token]            Pre-existing access token (JMAP_TOKEN)
   * @param {string} [options.refreshToken]     Pre-existing refresh token (JMAP_REFRESH_TOKEN)
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.JMAP_BASE_URL || "";
    this.tokenEndpoint =
      options.tokenEndpoint || process.env.JMAP_AUTH_TOKEN_ENDPOINT || "";
    this.clientId = options.clientId || process.env.JMAP_CLIENT_ID || DEFAULT_CLIENT_ID;
    this.username = options.username || process.env.JMAP_USERNAME || "";
    this.password = options.password || process.env.JMAP_PASSWORD || "";

    // Token storage (in-memory only)
    this._accessToken = options.token || process.env.JMAP_TOKEN || null;
    this._refreshToken =
      options.refreshToken || process.env.JMAP_REFRESH_TOKEN || null;
    this._expiresAt = null; // timestamp ms

    // Detect Basic Auth mode (token starts with "Basic ")
    this._isBasicAuth = !!(this._accessToken && this._accessToken.startsWith("Basic "));
    if (this._isBasicAuth) {
      this._expiresAt = Infinity; // Basic Auth never expires
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Ensure a valid access token is available.  Returns the token string.
   *
   * Order of attempts:
   *   1. Return cached access token if not expired
   *   2. Try refresh_token grant
   *   3. Try password grant with username/password
   *
   * @returns {Promise<string>}
   */
  async getValidToken() {
    // Basic Auth mode — always return the token as-is
    if (this._isBasicAuth) {
      return this._accessToken;
    }

    // 1. Cached access token still fresh (or no expiry known — assume valid)
    if (this._accessToken && (!this._expiresAt || !isExpired(this._expiresAt))) {
      return this._accessToken;
    }

    // 2. Try refresh token
    if (this._refreshToken) {
      try {
        await this._refresh();
        return this._accessToken;
      } catch (err) {
        if (err instanceof OAuthTokenRevoked) {
          throw err;
        }
        // Other refresh errors → fall through to password grant
      }
    }

    // 3. Try password grant
    if (this.username && this.password) {
      await this._acquireToken();
      return this._accessToken;
    }

    // 4. Access token exists but expired with no way to refresh
    if (this._accessToken) {
      throw new OAuthTokenExpired(
        "Access token has expired and no refresh mechanism is available.",
      );
    }

    // 5. Nothing at all
    throw new OAuthConfigurationError(
      "No credentials available. Provide JMAP_TOKEN, or JMAP_USERNAME + JMAP_PASSWORD.",
    );
  }

  /** Return the current refresh token (for serialization). */
  getRefreshToken() {
    return this._refreshToken;
  }

  /** Return the current access token without triggering refresh. */
  getAccessToken() {
    return this._accessToken;
  }

  /** Return token expiry timestamp (ms) or null. */
  getExpiresAt() {
    return this._expiresAt;
  }

  /** Serialize current token state to a plain object. */
  serialize() {
    return {
      token: this._accessToken,
      refreshToken: this._refreshToken,
      expiresAt: this._expiresAt,
    };
  }

  /** Restore token state from a previously serialized object. */
  deserialize(state) {
    if (state.token) this._accessToken = state.token;
    if (state.refreshToken) this._refreshToken = state.refreshToken;
    if (state.expiresAt) this._expiresAt = state.expiresAt;
  }

  /** Clear all stored tokens (logout / revocation). */
  clearTokens() {
    this._accessToken = null;
    this._refreshToken = null;
    this._expiresAt = null;
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
            this.tokenEndpoint =
              session.oAuthTokenEndpoint || session.authTokenEndpoint;
            return this.tokenEndpoint;
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
      this.baseUrl
        ? `${this.baseUrl}/.well-known/jmap`
        : undefined,
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

    let res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    // Some servers (e.g. Stalwart) also accept JSON — try it if form fails with 400
    if (!res.ok && res.status === 400) {
      const jsonBody = JSON.stringify({
        grant_type: "password",
        username: this.username,
        password: this.password,
        client_id: this.clientId,
      });
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: jsonBody,
      });
    }

    if (!res.ok) {
      // OAuth2 failed — fall back to Basic Auth if we have credentials
      if (this.username && this.password) {
        const basic = Buffer.from(`${this.username}:${this.password}`).toString("base64");
        this._accessToken = `Basic ${basic}`;
        this._refreshToken = null;
        this._expiresAt = Infinity;
        this._isBasicAuth = true;
        process.env.JMAP_TOKEN = this._accessToken;
        return;
      }
      const errBody = await res.json().catch(() => ({}));
      throw new OAuthConfigurationError(
        `Token acquisition failed: ${res.status} "${
          errBody.error_description || errBody.error || res.statusText
        }" — endpoint: ${endpoint}`,
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
      this.baseUrl
        ? `${this.baseUrl}/.well-known/jmap`
        : undefined,
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
          `Refresh token has been revoked (${
            errBody.error_description || "invalid_grant"
          }). Please re-authenticate.`,
        );
      }

      throw new OAuthTokenExpired(
        `Token refresh failed: ${res.status} ${
          errBody.error_description || errBody.error || res.statusText
        }`,
      );
    }

    const data = await res.json();
    this._handleTokenResponse(data);
  }

  // -----------------------------------------------------------------------
  // Response handler — also syncs back to process.env
  // -----------------------------------------------------------------------

  _handleTokenResponse(data) {
    this._accessToken = data.access_token || this._accessToken;
    if (this._accessToken) {
      process.env.JMAP_TOKEN = this._accessToken;
    }

    // Refresh token rotation: server may issue a new refresh token
    if (data.refresh_token) {
      this._refreshToken = data.refresh_token;
      process.env.JMAP_REFRESH_TOKEN = this._refreshToken;
    }

    // Expiry
    const expiresIn = data.expires_in || DEFAULT_EXPIRY_SECONDS;
    this._expiresAt = Date.now() + expiresIn * 1000;
    this._isBasicAuth = false;
  }
}

export default TokenManager;

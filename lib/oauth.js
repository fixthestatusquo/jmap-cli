// ---------------------------------------------------------------------------
// TokenManager — OAuth2 token lifecycle for jmap-cli
// ---------------------------------------------------------------------------
//
// Authentication strategies (in order of precedence):
//   1. JMAP_TOKEN env var — can be a Bearer token or Basic Auth header
//   2. JMAP_REFRESH_TOKEN — refresh an existing OAuth2 token
//   3. JMAP_USERNAME + JMAP_PASSWORD — Basic Auth (immediate, no OAuth2)
//   4. Device Authorization Grant (RFC 8628) — interactive CLI login
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
   * All values fall back to environment variables.
   *
   * @param {object} [options]
   * @param {string} [options.baseUrl]          JMAP base URL
   * @param {string} [options.tokenEndpoint]    Explicit token endpoint (skips discovery)
   * @param {string} [options.deviceEndpoint]   Explicit device auth endpoint (skips discovery)
   * @param {string} [options.clientId]         OAuth client ID (default: "jmap-client")
   * @param {string} [options.username]         JMAP username (for Basic Auth fallback)
   * @param {string} [options.password]         JMAP password (for Basic Auth fallback)
   * @param {string} [options.token]            Pre-existing access token (JMAP_TOKEN)
   * @param {string} [options.refreshToken]     Pre-existing refresh token (JMAP_REFRESH_TOKEN)
   */
  constructor(options = {}) {
    // Safer environment variable access (works in browsers where process.env may not exist)
    const env =
      typeof process !== "undefined" && process.env ? process.env : {};

    this.baseUrl = options.baseUrl || env.JMAP_BASE_URL || "";
    this.tokenEndpoint =
      options.tokenEndpoint || env.JMAP_AUTH_TOKEN_ENDPOINT || "";
    this.deviceEndpoint =
      options.deviceEndpoint || env.JMAP_AUTH_DEVICE_ENDPOINT || "";
    this.clientId =
      options.clientId || env.JMAP_CLIENT_ID || DEFAULT_CLIENT_ID;
    this.username = options.username || env.JMAP_USERNAME || "";
    this.password = options.password || env.JMAP_PASSWORD || "";

    // Token storage (in-memory only — syncs to process.env on changes)
    this._accessToken = options.token || env.JMAP_TOKEN || null;
    this._refreshToken =
      options.refreshToken || env.JMAP_REFRESH_TOKEN || null;
    this._expiresAt = null; // timestamp ms

    // Detect Basic Auth mode (token starts with "Basic ")
    this._isBasicAuth = !!(
      this._accessToken && this._accessToken.startsWith("Basic ")
    );
    if (this._isBasicAuth) {
      this._expiresAt = Infinity;
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Ensure a valid access token is available.  Returns the token string.
   *
   * Order of attempts:
   *   1. Basic Auth — return as-is (never expires)
   *   2. Cached Bearer token — return if not expired
   *   3. Refresh token — attempt OAuth2 refresh
   *   4. Nothing available — throw
   *
   * @returns {Promise<string>}
   */
  async getValidToken() {
    // 1. Basic Auth — always valid
    if (this._isBasicAuth) {
      return this._accessToken;
    }

    // 2. Cached Bearer token still fresh (or no expiry known — assume valid)
    if (
      this._accessToken &&
      (!this._expiresAt || !isExpired(this._expiresAt))
    ) {
      return this._accessToken;
    }

    // 3. Try refresh token
    if (this._refreshToken) {
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

    // 4. Access token exists but expired with no way to refresh
    if (this._accessToken) {
      throw new OAuthTokenExpired(
        "Access token has expired and no refresh mechanism is available.",
      );
    }

    // 5. Nothing at all
    throw new OAuthConfigurationError(
      "No credentials available. Set JMAP_TOKEN, run `jmap login`, or use JMAP_USERNAME + JMAP_PASSWORD for Basic Auth.",
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
    this._isBasicAuth = false;
  }

  /** Set a Basic Auth token from username:password. */
  setBasicAuth(username, password) {
    const basic = Buffer.from(`${username}:${password}`).toString("base64");
    this._accessToken = `Basic ${basic}`;
    this._refreshToken = null;
    this._expiresAt = Infinity;
    this._isBasicAuth = true;
    if (typeof process !== "undefined" && process.env) {
      process.env.JMAP_TOKEN = this._accessToken;
    }
  }

  // -----------------------------------------------------------------------
  // Token endpoint discovery
  // -----------------------------------------------------------------------

  async _discoverTokenEndpoint(sessionUrl) {
    if (this.tokenEndpoint) {
      return this.tokenEndpoint;
    }

    if (sessionUrl) {
      try {
        const res = await fetch(sessionUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (res.ok) {
          const session = await res.json();

          if (session.oAuthTokenEndpoint || session.authTokenEndpoint) {
            this.tokenEndpoint =
              session.oAuthTokenEndpoint || session.authTokenEndpoint;
            return this.tokenEndpoint;
          }
        }
      } catch {
        // non-fatal
      }
    }

    if (this.baseUrl) {
      const constructed = `${this.baseUrl.replace(/\/+$/, "")}/auth/token`;
      this.tokenEndpoint = constructed;
      return constructed;
    }

    throw new OAuthDiscoveryFailed(
      "Could not discover or construct the OAuth2 token endpoint.",
    );
  }

  async _discoverDeviceEndpoint(sessionUrl) {
    if (this.deviceEndpoint) {
      return this.deviceEndpoint;
    }

    if (sessionUrl) {
      try {
        const res = await fetch(sessionUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (res.ok) {
          const session = await res.json();

          if (session.oAuthDeviceEndpoint || session.authDeviceEndpoint) {
            this.deviceEndpoint =
              session.oAuthDeviceEndpoint || session.authDeviceEndpoint;
            return this.deviceEndpoint;
          }
        }
      } catch {
        // non-fatal
      }
    }

    if (this.baseUrl) {
      const constructed = `${this.baseUrl.replace(/\/+$/, "")}/auth/device`;
      this.deviceEndpoint = constructed;
      return constructed;
    }

    throw new OAuthDiscoveryFailed(
      "Could not discover or construct the OAuth2 device authorization endpoint.",
    );
  }

  // -----------------------------------------------------------------------
  // Device Authorization Grant (RFC 8628) — interactive CLI login
  // -----------------------------------------------------------------------

  /**
   * Initiate Device Authorization Grant flow.
   *
   * 1. POST to device authorization endpoint to get device_code + user_code
   * 2. Print instructions for the user to visit a URL and enter the code
   * 3. Poll the token endpoint until the user completes auth
   * 4. Store the resulting tokens
   *
   * @param {object} [options]
   * @param {function} [options.onInstruction]  Called with {user_code, verification_uri}
   *        instead of printing to console. Useful for custom UIs.
   * @returns {Promise<string>} The access token
   */
  async deviceLogin(options = {}) {
    const sessionUrl = this.baseUrl
      ? `${this.baseUrl}/.well-known/jmap`
      : undefined;

    const deviceEndpoint = await this._discoverDeviceEndpoint(sessionUrl);
    const tokenEndpoint = await this._discoverTokenEndpoint(sessionUrl);

    // Step 1: Request device code
    const deviceBody = new URLSearchParams();
    deviceBody.set("client_id", this.clientId);
    deviceBody.set("scope", "urn:ietf:params:jmap:mail");

    let res = await fetch(deviceEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: deviceBody.toString(),
    });

    // JSON fallback
    if (!res.ok && res.status === 400) {
      const jsonBody = JSON.stringify({
        client_id: this.clientId,
        scope: "urn:ietf:params:jmap:mail",
      });
      res = await fetch(deviceEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: jsonBody,
      });
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new OAuthConfigurationError(
        `Device authorization request failed: ${res.status} "${
          errBody.error_description || errBody.error || res.statusText
        }" — endpoint: ${deviceEndpoint}`,
      );
    }

    const deviceData = await res.json();
    const {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: verificationUriComplete,
      interval = 5,
    } = deviceData;

    if (!deviceCode || !userCode || !verificationUri) {
      throw new OAuthConfigurationError(
        `Device authorization response missing required fields: ${JSON.stringify(deviceData)}`,
      );
    }

    // Step 2: Display instructions
    const uri = verificationUriComplete || verificationUri;
    if (options.onInstruction) {
      await options.onInstruction({ userCode, verificationUri: uri });
    } else {
      console.log("");
      console.log("╔══════════════════════════════════════════════════╗");
      console.log("║         Device Authorization Required           ║");
      console.log("╠══════════════════════════════════════════════════╣");
      console.log("║                                                  ");
      console.log(`║  1. Open this URL in your browser:`);
      console.log(`║     ${uri}`);
      console.log("║                                                  ");
      console.log(`║  2. Enter this code:`);
      console.log(`║     ${userCode}`);
      console.log("║                                                  ");
      console.log("║  The CLI will wait until you complete the        ");
      console.log("║  authorization in your browser.                  ");
      console.log("╚══════════════════════════════════════════════════╝");
      console.log("");
    }

    // Step 3: Poll token endpoint
    const pollBody = new URLSearchParams();
    pollBody.set("grant_type", "urn:ietf:params:oauth:grant-type:device_code");
    pollBody.set("device_code", deviceCode);
    pollBody.set("client_id", this.clientId);

    const maxAttempts = 120; // ~10 min at 5s intervals
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, interval * 1000));

      const pollRes = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: pollBody.toString(),
      });

      if (pollRes.ok) {
        const data = await pollRes.json();
        this._handleTokenResponse(data);
        return this._accessToken;
      }

      // Handle expected polling errors
      if (pollRes.status === 400) {
        const errBody = await pollRes.json().catch(() => ({}));
        const errorCode = errBody.error;

        if (errorCode === "authorization_pending") {
          continue; // user hasn't responded yet
        }
        if (errorCode === "slow_down") {
          // increase interval as requested
          await new Promise((r) => setTimeout(r, interval * 1000));
          continue;
        }
        if (errorCode === "access_denied") {
          throw new OAuthConfigurationError(
            "Device authorization was denied by the user.",
          );
        }
        if (errorCode === "expired_token") {
          throw new OAuthConfigurationError(
            "Device authorization code expired. Please run `jmap login` again.",
          );
        }
      }

      // Unexpected error
      const errBody = await pollRes.json().catch(() => ({}));
      throw new OAuthConfigurationError(
        `Token polling failed: ${pollRes.status} "${
          errBody.error_description || errBody.error || pollRes.statusText
        }"`,
      );
    }

    throw new OAuthConfigurationError(
      "Device authorization timed out after " +
        (maxAttempts * interval) +
        " seconds.",
    );
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

      if (errorCode === "invalid_grant") {
        this.clearTokens();
        throw new OAuthTokenRevoked(
          `Refresh token has been revoked (${
            errBody.error_description || "invalid_grant"
          }). Please re-authenticate with \`jmap login\`.`,
        );
      }

      throw new OAuthTokenExpired(
        `Token refresh failed: ${res.status} "${
          errBody.error_description || errBody.error || res.statusText
        }"`,
      );
    }

    const data = await res.json();
    this._handleTokenResponse(data);
  }

  // -----------------------------------------------------------------------
  // Response handler — syncs back to process.env
  // -----------------------------------------------------------------------

  _handleTokenResponse(data) {
    this._accessToken = data.access_token || this._accessToken;
    if (this._accessToken) {
      if (typeof process !== "undefined" && process.env) {
        process.env.JMAP_TOKEN = this._accessToken;
      }
    }

    if (data.refresh_token) {
      this._refreshToken = data.refresh_token;
      if (typeof process !== "undefined" && process.env) {
        process.env.JMAP_REFRESH_TOKEN = this._refreshToken;
      }
    }

    const expiresIn = data.expires_in || DEFAULT_EXPIRY_SECONDS;
    this._expiresAt = Date.now() + expiresIn * 1000;
    this._isBasicAuth = false;
  }
}

export default TokenManager;

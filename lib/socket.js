// ---------------------------------------------------------------------------
// JMAP WebSocket (RFC 8887) — subprotocol-based authentication
// ---------------------------------------------------------------------------
//
// RFC 8887 defines a WebSocket subprotocol for JMAP. The client sends two
// protocol identifiers in the Sec-WebSocket-Protocol header:
//
//   1. "jmap"
//   2. "base64url.bearer.authorization.jmap.<base64url-encoded-token>"
//
// The token value (without the "Bearer " prefix) is base64url-encoded per
// Section 2 of the RFC.
//
// As a pragmatic supplement, an HTTP Authorization header is also sent when
// the underlying WebSocket implementation supports custom headers (Node.js
// 'ws' library).  This accommodates servers that do not yet support the
// subprotocol-based scheme, or that require both for compatibility.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Base64url encoding (Node.js / browser compatible)
// ---------------------------------------------------------------------------

/**
 * Base64url-encode a UTF-8 string.
 * Uses native Buffer in Node.js (15+), falls back to btoa() elsewhere.
 *
 * @param {string} str
 * @returns {string}
 */
function base64url(str) {
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return Buffer.from(str, "utf8").toString("base64url");
  }
  // Browser fallback
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// RFC 8887 subprotocol helpers
// ---------------------------------------------------------------------------

/**
 * Build RFC 8887 WebSocket subprotocol identifiers from an OAuth2 bearer
 * access token.
 *
 * @param {string} token - OAuth2 bearer access token (with or without
 *                         "Bearer " prefix)
 * @returns {string[]} Two-element array:
 *   ["jmap", "base64url.bearer.authorization.jmap.<encoded>"]
 */
export function buildSubprotocols(token) {
  // Strip "Bearer " prefix if present
  const raw =
    typeof token === "string" && token.startsWith("Bearer ")
      ? token.slice(7)
      : token || "";

  const encoded = base64url(raw);
  return ["jmap", `base64url.bearer.authorization.jmap.${encoded}`];
}

// ---------------------------------------------------------------------------
// WebSocket lifecycle
// ---------------------------------------------------------------------------

/**
 * Connect to a JMAP WebSocket endpoint using RFC 8887 subprotocol
 * authentication (with an HTTP Authorization header as a pragmatic
 * supplement for servers that don't yet support the subprotocol scheme).
 * Automatically subscribes to `Email/changes` on open and reconnects on
 * close.
 *
 * @param {object}   [options]
 * @param {string}   options.url            WebSocket endpoint URL
 * @param {string}   [options.token]        Bearer access token (used if
 *                                          `getToken` is not provided)
 * @param {Function} [options.onMessage]    Called with the array of changed
 *                                          message IDs on each update
 * @param {Function} [options.onEmailState] Called with the new email state
 *                                          string when it changes
 * @param {Function} [options.onError]      Called with error events
 * @param {Function} [options.getToken]     Async function returning a fresh
 *                                          bearer token.  Called before
 *                                          initial connect and before each
 *                                          reconnect.  Overrides `token`.
 * @param {number}   [options.reconnectDelay=5000]  Milliseconds before
 *                                          reconnect attempt
 * @returns {Promise<{close: () => void, connected: boolean}>}
 */
export async function connectJmapSocket({
  url,
  token,
  onMessage,
  onEmailState,
  onError,
  getToken,
  reconnectDelay = 5000,
} = {}) {
  if (!url) {
    throw new Error("connectJmapSocket: 'url' is required");
  }

  /** @type {import("ws").WebSocket | null} */
  let ws = null;
  let closed = false;
  let currentToken = token;

  /**
   * Resolve the token to use for the connection attempt.
   * Prefers `getToken()` when provided, falls back to the static `token`.
   */
  async function resolveToken() {
    if (getToken) {
      return await getToken();
    }
    return currentToken;
  }

  async function connect() {
    if (closed) return;

    // Resolve a (possibly refreshed) token before each connection attempt
    try {
      currentToken = await resolveToken();
    } catch (err) {
      onError?.(err);
      // Cannot connect without a token; schedule a retry
      if (!closed) {
        setTimeout(connect, reconnectDelay);
      }
      return;
    }

    if (!currentToken) {
      onError?.(new Error("No authentication token available for WebSocket"));
      if (!closed) {
        setTimeout(connect, reconnectDelay);
      }
      return;
    }

    // Dynamically import ws (Node) or fall back to globalThis.WebSocket
    /** @type {typeof WebSocket} */
    let WebSocket;
    try {
      WebSocket = (await import("ws")).default;
    } catch {
      WebSocket = globalThis.WebSocket;
    }

    if (!WebSocket) {
      throw new Error(
        "No WebSocket implementation available. " +
          "Install the 'ws' package for Node.js.",
      );
    }

    const protocols = buildSubprotocols(currentToken);
    // Build the Bearer token for the HTTP Authorization header
    const bearerHeader =
      currentToken && currentToken.startsWith("Basic ")
        ? currentToken
        : `Bearer ${t}`;

    // ws (Node) accepts a third options argument for custom headers.
    // Browser WebSocket does not, so we fall back gracefully.
    try {
      ws = new WebSocket(url, protocols, {
        headers: { Authorization: bearerHeader },
      });
    } catch {
      ws = new WebSocket(url, protocols);
    }

    ws.addEventListener("open", () => {
      // Subscribe to Email/changes for real-time email updates
      ws.send(
        JSON.stringify({
          using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          methodCalls: [
            ["Email/changes", { accountId: null, sinceState: null }, "c1"],
          ],
        }),
      );
    });

    ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        const methodResponses = data.methodResponses || [];

        for (const [methodName, response] of methodResponses) {
          if (methodName === "Email/changes") {
            const { changed } = response;
            if (changed && onMessage) {
              onMessage(changed);
            }
            if (response.newState && onEmailState) {
              onEmailState(response.newState);
            }
          }
        }
      } catch {
        // Ignore parse errors for non-JSON messages
      }
    });

    ws.addEventListener("error", (error) => {
      onError?.(error);
    });

    ws.addEventListener("close", () => {
      ws = null;
      if (!closed) {
        setTimeout(connect, reconnectDelay);
      }
    });
  }

  await connect();

  return {
    /** Gracefully close the WebSocket.  No reconnect will be scheduled. */
    close() {
      closed = true;
      if (ws) {
        ws.close();
        ws = null;
      }
    },

    /** Whether the socket is currently open (`true`) or not (`false`). */
    get connected() {
      return ws !== null && ws.readyState === WebSocket.OPEN;
    },
  };
}

export default connectJmapSocket;

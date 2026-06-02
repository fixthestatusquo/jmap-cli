// ---------------------------------------------------------------------------
// JMAP WebSocket (RFC 8887) TypeScript Declarations
// ---------------------------------------------------------------------------

export interface JmapSocketOptions {
  /** WebSocket endpoint URL */
  url: string;
  /** Bearer access token (used if `getToken` is not provided) */
  token?: string;
  /** Called with the array of changed message IDs on each update */
  onMessage?: (changed: string[]) => void;
  /** Called with the new email state string when it changes */
  onEmailState?: (state: string) => void;
  /** Called with error events */
  onError?: (error: unknown) => void;
  /** Async function returning a fresh bearer token. Overrides `token`. */
  getToken?: () => Promise<string>;
  /** Milliseconds before reconnect attempt (default: 5000) */
  reconnectDelay?: number;
}

export interface JmapSocketHandle {
  /** Gracefully close the WebSocket. No reconnect will be scheduled. */
  close(): void;
  /** Whether the socket is currently open */
  readonly connected: boolean;
}

/**
 * Build RFC 8887 WebSocket subprotocol identifiers from an OAuth2 bearer
 * access token.
 */
export function buildSubprotocols(token: string): string[];

/**
 * Connect to a JMAP WebSocket endpoint using RFC 8887 subprotocol
 * authentication. Automatically subscribes to `Email/changes` on open
 * and reconnects on close.
 */
export function connectJmapSocket(options?: JmapSocketOptions): Promise<JmapSocketHandle>;

export default connectJmapSocket;

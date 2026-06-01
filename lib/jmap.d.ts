// ---------------------------------------------------------------------------
// JMAP TypeScript Declarations for jmap-cli
// ---------------------------------------------------------------------------

// ----- JMAP primitive types used throughout the client -----

export interface JmapEmailAddress {
  email: string;
  name?: string;
}

export interface JmapMessageBodyPart {
  partId: string;
  type: string;
  blobId?: string;
  size?: number;
}

export interface JmapAttachment {
  blobId: string;
  name: string;
  type: string;
  size: number;
}

export interface JmapKeywordOverrides {
  /** Whether the message is seen / read */
  $seen?: boolean;
  /** Whether the message has been answered / replied to */
  $answered?: boolean;
  /** Whether the message is flagged / starred */
  $flagged?: boolean;
  /** Whether the message is junk / spam */
  $junk?: boolean;
  /** Whether the message is a draft */
  $draft?: boolean;
  /** Whether the message has been forwarded */
  $forwarded?: boolean;
  /** Custom keyword (string, any truthy value marks it active) */
  [keyword: string]: boolean | undefined;
}

export interface JmapMailbox {
  id: string;
  name: string;
  role: string | null;
  parentId: string | null;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
  myRights: Record<string, boolean>;
  sortOrder: number;
  isSubscribed: boolean;
  [key: string]: unknown;
}

export interface JmapMessage {
  id: string;
  blobId: string;
  subject: string;
  from: JmapEmailAddress[];
  to: JmapEmailAddress[];
  cc?: JmapEmailAddress[];
  bcc?: JmapEmailAddress[];
  replyTo?: JmapEmailAddress[];
  keywords: JmapKeywordOverrides;
  size: number;
  receivedAt: string;
  sentAt?: string;
  textBody?: JmapMessageBodyPart[] | string;
  htmlBody?: JmapMessageBodyPart[] | string;
  hasAttachment: boolean;
  preview?: string;
  /** Raw email body text (resolved from blob) */
  body?: string;
  /** Header: X-Priority */
  "header:X-Priority:asText"?: string;
  /** Header: Importance */
  "header:Importance:asText"?: string;
  /** Header: Priority */
  "header:Priority:asText"?: string;
  /** Header: Auto-Submitted */
  "header:Auto-Submitted:asText"?: string;
  [key: string]: unknown;
}

export interface JmapSession {
  apiUrl: string;
  primaryAccounts: Record<string, string>;
  uploadUrl?: string;
  eventSourceUrl?: string;
  downloadUrl?: string;
  capabilities?: Record<string, unknown>;
  state?: string;
  /** Stalwart may include OAuth endpoints */
  oAuthTokenEndpoint?: string;
  authTokenEndpoint?: string;
  [key: string]: unknown;
}

export interface SendPrerequisites {
  outboxId: string;
  identityId: string;
  identityEmail: string;
}

export interface JmapIdentity {
  id: string;
  name: string;
  email: string;
  replyTo?: JmapEmailAddress;
  bcc?: JmapEmailAddress[];
  textSignature?: string;
  htmlSignature?: string;
  mayDelete?: boolean;
  [key: string]: unknown;
}

// ----- OAuth2 types -----

export type AuthType = "basic" | "oauth2";

export interface OAuthTokenState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

// ----- Method-specific argument types -----

export interface JmapClientOptions {
  /** JMAP username / account name */
  username?: string;
  /** JMAP password */
  password?: string;
  /** JMAP base URL (e.g. https://api.fastmail.com) */
  baseUrl?: string;
  /** Path to a dotenv config file (loaded automatically) */
  path?: string;

  // --- OAuth2 options ---
  /** Authentication type: "basic" (default) or "oauth2" */
  authType?: AuthType;
  /** Pre-existing OAuth2 access token (JWT) */
  accessToken?: string;
  /** Pre-existing OAuth2 refresh token */
  refreshToken?: string;
  /** OAuth2 client ID (default: "jmap-client" for Stalwart) */
  clientId?: string;
  /** Explicit OAuth2 token endpoint (skips auto-discovery) */
  tokenEndpoint?: string;
  /** Automatically refresh tokens when expired (default: true) */
  autoRefresh?: boolean;
}

export interface SendEmailOptions {
  /** From email address */
  from: string;
  /** From display name */
  fromName: string;
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Plain-text email body */
  text: string;
  /** Optional attachment */
  attachment?: {
    /** Raw content (Buffer or base64 string) */
    content: Buffer | string;
    /** File name */
    name: string;
  };
}

export interface ListMessagesOptions {
  /** Maximum number of messages to return */
  limit?: number;
  /** Mailbox name to list messages from */
  mailboxName: string;
  /** Sort property (default: "receivedAt") */
  sort?: string;
  /** Sort order (default: "desc") */
  order?: "asc" | "desc";
  /** Keyword filters (e.g. { $seen: true, $flagged: false }) */
  keywords?: JmapKeywordOverrides;
}

export interface GetMessagesOptions {
  /** Array of message IDs to fetch */
  messageIds: string[];
}

export interface JmapFilterCondition {
  inMailbox?: string;
  inMailboxOtherThan?: string;
  before?: string;
  after?: string;
  minSize?: number;
  maxSize?: number;
  allInThreadHaveKeyword?: string;
  someInThreadHaveKeyword?: string;
  noneInThreadHaveKeyword?: string;
  hasKeyword?: string;
  notHasKeyword?: string;
  hasAttachment?: boolean;
  text?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  header?: { [name: string]: string };
  [operator: string]: unknown;
}

export interface SearchMessagesOptions {
  /** JMAP filter condition (or array of conditions for AND/OR/NOT) */
  filter: JmapFilterCondition | JmapFilterCondition[];
  /** Sort property */
  sort?: string;
  /** Sort order */
  order?: "asc" | "desc";
}

export interface UpdateMessageOptions {
  /** Message ID to update */
  messageId: string;
  /** Properties to update */
  update: {
    /** Keyword overrides */
    keywords?: JmapKeywordOverrides;
    /** Mailbox membership changes { mailboxId: true } */
    mailboxIds?: Record<string, boolean>;
    /** Any other properties to update */
    [key: string]: unknown;
  };
}

export interface ListenOptions {
  /** Callback fired for each new/changed message */
  onMessage?: (message: JmapMessage) => void;
  /** Callback fired when Email state changes */
  onEmailState?: (state: string) => void;
}

export interface MoveMessageOptions {
  /** ID of the message to move */
  messageId: string;
  /** Name or role of the destination mailbox */
  toMailbox: string;
}

export interface CreateMailboxOptions {
  /** Name for the new mailbox / folder */
  name: string;
  /** Optional parent mailbox ID for nesting */
  parentId?: string;
}

// ----- Main JmapClient class -----

export class JmapClient {
  /** JMAP username */
  username: string;
  /** JMAP password */
  password: string;
  /** JMAP base URL */
  baseUrl: string;
  /** Full JMAP API URL (baseUrl + "/jmap") */
  apiUrl: string;
  /** Authentication type: "basic" or "oauth2" */
  authType: AuthType;
  /** HTTP Basic auth header value (null in OAuth2 mode) */
  authHeader: string | null;

  /**
   * Create a new JMAP client.
   *
   * Options are optional; missing values are populated from environment
   * variables or a dotenv file pointed to by the `path` option.
   *
   * **Basic Auth (default):** Uses JMAP_USERNAME, JMAP_PASSWORD, JMAP_BASE_URL.
   *
   * **OAuth2:** Set `authType: "oauth2"` and provide one of:
   *   - `username` + `password` → password grant (auto-discovers token endpoint)
   *   - `accessToken` → pre-existing JWT
   *   - `refreshToken` → will be used to refresh
   *
   * Environment variable equivalents: JMAP_AUTH_TYPE, JMAP_ACCESS_TOKEN,
   * JMAP_REFRESH_TOKEN, JMAP_CLIENT_ID, JMAP_AUTH_TOKEN_ENDPOINT,
   * JMAP_AUTO_REFRESH.
   */
  constructor(options?: JmapClientOptions);

  /**
   * Internal request wrapper.
   * - Basic Auth: adds Authorization header automatically.
   * - OAuth2: gets a valid token (refreshing if needed), adds Bearer header.
   *   On 401, refreshes once and retries once.
   * @internal
   */
  _request(url: string, options?: RequestInit): Promise<Response>;

  /**
   * Convenience wrapper that calls _request and parses JSON.
   * @internal
   */
  _requestJson(url: string, options?: RequestInit): Promise<Record<string, unknown>>;

  /**
   * Fetch prerequisites for sending an email: the "Sent" mailbox ID,
   * the first Identity's ID, and its email address.
   */
  getSendPrerequisites(accountId: string): Promise<SendPrerequisites>;

  /**
   * Discover the JMAP session resource (/.well-known/jmap).
   * @internal
   */
  _discoverSession(): Promise<JmapSession>;

  /**
   * Extract the primary account ID for the "urn:ietf:params:jmap:mail"
   * capability from a JMAP session object.
   */
  getAccountId(session: JmapSession): string;

  /**
   * Send an email via JMAP (Email/set + EmailSubmission/set).
   * Optionally includes an attachment (uploaded first via session uploadUrl).
   */
  sendEmail(options: SendEmailOptions): Promise<Record<string, unknown>>;

  /**
   * List messages in a mailbox with optional sorting, ordering, keyword
   * filters, and result limit.
   */
  listMessages(options: ListMessagesOptions): Promise<JmapMessage[]>;

  /**
   * Fetch one or more messages by their IDs.
   * Returns an array of messages with resolved body content.
   */
  getMessages(options: GetMessagesOptions): Promise<JmapMessage[]>;

  /**
   * Fetch a single message by ID with resolved body content.
   */
  getMessage(options: { messageId: string }): Promise<JmapMessage | null>;

  /**
   * Fetch all mailboxes for the account.
   * @internal
   */
  _getMailboxes(accountId: string): Promise<JmapMailbox[]>;

  /**
   * Update a message's properties (keywords, mailbox membership, etc.).
   */
  updateMessage(options: UpdateMessageOptions): Promise<Record<string, unknown>>;

  /**
   * Search messages using arbitrary JMAP filter conditions.
   */
  searchMessages(options: SearchMessagesOptions): Promise<JmapMessage[]>;

  /**
   * Listen for real-time message changes via WebSocket / EventSource.
   */
  listen(options?: ListenOptions): Promise<void>;

  /**
   * Build the WebSocket URL for real-time updates from a JMAP session.
   * @internal
   */
  _getWebSocketUrl(session: JmapSession): string;

  /**
   * Find a mailbox by name or role. Optionally create it if it does not
   * exist (when `createIfNotExist` is true).
   */
  getMailbox(nameOrRole: string, createIfNotExist?: boolean): Promise<JmapMailbox | null>;

  /**
   * Move a message to a different mailbox by name/role.
   */
  moveMessage(options: MoveMessageOptions): Promise<Record<string, unknown>>;

  /**
   * Create a new mailbox.
   */
  createMailbox(options: CreateMailboxOptions): Promise<JmapMailbox | Record<string, unknown>>;

  /**
   * Verify that stored credentials are valid by discovering the JMAP
   * session and checking that primaryAccounts is returned.
   */
  verifyCredentials(): Promise<boolean>;

  /**
   * List all mailboxes (public alias for _getMailboxes).
   */
  listMailboxes(): Promise<JmapMailbox[]>;
}

export default JmapClient;

// Re-export error types for convenience
export {
  OAuthError,
  OAuthTokenExpired,
  OAuthTokenRevoked,
  OAuthDiscoveryFailed,
  OAuthConfigurationError,
} from "./errors.js";

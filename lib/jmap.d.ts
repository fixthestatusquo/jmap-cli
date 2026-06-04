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
  role?: string;
  parentId?: string;
  sortOrder?: number;
  isSubscribed?: boolean;
  totalEmails?: number;
  unreadEmails?: number;
  totalThreads?: number;
  unreadThreads?: number;
  myRights?: Record<string, boolean>;
}

export interface JmapMessage {
  id: string;
  blobId: string;
  subject?: string;
  from?: JmapEmailAddress[];
  to?: JmapEmailAddress[];
  cc?: JmapEmailAddress[];
  bcc?: JmapEmailAddress[];
  keywords?: Record<string, boolean>;
  size?: number;
  receivedAt?: string;
  sentAt?: string;
  preview?: string;
  textBody?: string;
  htmlBody?: string;
  hasAttachment?: boolean;
  replyTo?: JmapEmailAddress[];
  messageID?: string;
  [key: string]: unknown;
}

export interface JmapSession {
  apiUrl: string;
  downloadUrl: string;
  uploadUrl: string;
  primaryAccounts: Record<string, string>;
  accounts: Record<string, unknown>;
  capabilities: Record<string, unknown>;
}

export interface SendPrerequisites {
  outboxId: string;
  identityId: string;
  identityEmail: string;
}

// ----- Method-specific argument types -----

export interface JmapClientOptions {
  /** JMAP base URL (e.g. https://api.fastmail.com) */
  baseUrl?: string;
  /** JMAP login / username (for password grant or Basic Auth) */
  login?: string;
  /** JMAP password */
  password?: string;
  /** Email address to impersonate (Stalwart Master User) */
  impersonate?: string;
  /** Pre-existing OAuth2 access token */
  token?: string;
  /** Pre-existing OAuth2 refresh token */
  refreshToken?: string;
  /** OAuth2 client ID (default: "jmap-client") */
  clientId?: string;
  /** Explicit OAuth2 token endpoint */
  tokenEndpoint?: string;
  /** Path to a .env config file (loads into process.env) */
  path?: string;
}

export interface SendEmailOptions {
  /** From email address */
  from: string;
  /** From display name */
  fromName: string;
  /** Recipient email address(es) */
  to: string | string[];
  /** Email subject line */
  subject: string;
  /** Plain-text email body */
  text: string;
  /** CC recipient(s) */
  cc?: string | string[];
  /** BCC recipient(s) */
  bcc?: string | string[];
  /** HTML email body (for multipart/alternative when text is also provided) */
  htmlBody?: string;
  /** Reply-To address */
  replyTo?: string;
  /** In-Reply-To header value */
  inReplyTo?: string;
  /** References header values */
  references?: string[];
  /** Shorthand: sets inReplyTo + references + In-Reply-To header */
  replyMessageId?: string;
  /** Optional attachment */
  attachment?: {
    /** Raw content (Buffer or string) */
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
  /** ISO 8601 date — filter messages received after this time */
  after?: string;
}

export interface GetMessagesOptions {
  /** Array of message IDs to fetch */
  messageIds: string[];
}

export interface GetMessageOptions {
  /** JMAP message ID */
  messageId?: string;
  /** Look up by Message-ID header value (e.g. "<abc@example.com>") */
  headerMessageId?: string;
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
  /** Callback fired with the array of changed message IDs on each update */
  onMessage?: (changed: string[]) => void;
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
  /** Optional parent mailbox ID or name for nesting */
  parentId?: string;
}

// ----- Main JmapClient class -----

export class JmapClient {
  /** JMAP login / username */
  login: string;
  /** JMAP password */
  password: string;
  /** Email address being impersonated (Stalwart) */
  impersonate: string;
  /** JMAP base URL */
  baseUrl: string;
  /** Full JMAP API URL (baseUrl + "/jmap") */
  apiUrl: string;

  /**
   * Create a new JMAP client.
   *
   * All options must be passed explicitly. For CLI use, call
   * `getClientOptions()` from config.js.
   *
   * When `impersonate` is provided alongside `login` and `password`,
   * the constructor composes a Stalwart-style composite username
   * (`target%admin`) and uses Basic Auth directly, skipping OAuth2.
   */
  constructor(options?: JmapClientOptions);

  /**
   * Internal request wrapper.
   * Gets a valid OAuth2 Bearer token (auto-refreshing if needed),
   * makes the request, and on 401 refreshes once and retries once.
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
   * Supports multipart/alternative when both text and htmlBody are provided.
   */
  sendEmail(options: SendEmailOptions): Promise<Record<string, unknown>>;

  /**
   * List messages in a mailbox with optional sorting, ordering, keyword
   * filters, after date filter, and result limit.
   * Includes textBody, htmlBody, and bodyValues in the response.
   */
  listMessages(options: ListMessagesOptions): Promise<JmapMessage[]>;

  /**
   * Fetch one or more messages by their IDs.
   * Returns an array of messages with resolved body content.
   */
  getMessages(options: GetMessagesOptions): Promise<JmapMessage[]>;

  /**
   * Fetch a single message by JMAP ID or Message-ID header value.
   * When headerMessageId is provided, resolves it via Email/query first.
   */
  getMessage(options: GetMessageOptions): Promise<JmapMessage | null>;

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
   * Search for messages using JMAP filter conditions.
   */
  searchMessages(options: SearchMessagesOptions): Promise<JmapMessage[]>;

  /**
   * Listen for real-time state changes and message updates via WebSocket.
   * Returns the WebSocket instance.
   */
  listen(options?: ListenOptions): Promise<WebSocket>;

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

/**
 * Build a JmapClient constructor options object from environment variables.
 *
 * Call this from CLI commands to translate process.env (already populated
 * by config.js's side-effect config-file load) into the explicit options
 * that the JmapClient constructor expects.
 */
export function getClientOptions(): JmapClientOptions;

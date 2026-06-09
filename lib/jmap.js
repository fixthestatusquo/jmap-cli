// ---------------------------------------------------------------------------
// jmap-cli — JMAP client library
// ---------------------------------------------------------------------------
// JMAP client with OAuth2 and Basic Auth (including Stalwart impersonation).
// ---------------------------------------------------------------------------

import {
  OAuthTokenExpired,
  OAuthTokenRevoked,
  OAuthConfigurationError,
} from "./errors.js";
import { TokenManager } from "./oauth.js";

// Simple .env file parser (replaces dotenv dependency).
// Loaded lazily so browser bundlers don't fail on the fs import.
let _loadEnvFile;
try {
  const _fs = await import("fs");
  _loadEnvFile = (filePath) => {
    try {
      const text = _fs.readFileSync(filePath, "utf-8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trimEnd();
        let value = trimmed.slice(eqIdx + 1).trimStart();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    } catch {
      // file not found or not readable
    }
  };
} catch {
  // fs not available (e.g. browser) — .env file loading skipped
}

export class JmapClient {
  /**
   * Create a new JMAP client.
   *
   * All options must be passed explicitly.  For CLI use, call
   * `getClientOptions()` from config.js to build the options object
   * from environment variables and the config file.
   *
   * @param {object}  [options]
   * @param {string}  [options.login]          JMAP username (for password grant or Basic Auth)
   * @param {string}  [options.password]       JMAP password
   * @param {string}  [options.impersonate]    Email to impersonate (Stalwart Master User)
   * @param {string}  [options.baseUrl]       JMAP base URL
   * @param {string}  [options.token]         Pre-existing access token
   * @param {string}  [options.refreshToken]  Pre-existing refresh token
   * @param {string}  [options.clientId]      OAuth client ID
   * @param {string}  [options.tokenEndpoint] Explicit token endpoint
   * @param {string}  [options.path]          Path to .env config file (loads into process.env)
   */
  constructor(options = {}) {
    let {
      login,
      password,
      impersonate,
      baseUrl,
      path,
      token,
      refreshToken,
      clientId,
      tokenEndpoint,
    } = options;

    // .env file loading (for CLI convenience, loaded into process.env)
    if (path) {
      if (_loadEnvFile) {
        _loadEnvFile(path);
      }
    }

    if (!baseUrl) {
      throw "missing configuration. Please run `jmap-cli init` or provide baseUrl to the constructor.";
    }

    this.login = login;
    this.password = password;
    this.impersonate = impersonate;
    this.baseUrl = baseUrl;
    this.apiUrl = `${this.baseUrl}/jmap`;

    // Build TokenManager options (username is the login identity)
    const tmOptions = {
      baseUrl,
      tokenEndpoint,
      clientId,
      username: login,
      password,
      token,
      refreshToken,
    };

    this._tokenManager = new TokenManager(tmOptions);

    // When login + password are provided without OAuth2 tokens, use Basic Auth
    // directly (no OAuth2 discovery).  This covers both plain login/password
    // and Stalwart impersonation (target%admin composite username).
    if (login && password && !token && !refreshToken) {
      const effectiveUsername = impersonate ? `${impersonate}%${login}` : login;
      this._tokenManager.setBasicAuth(effectiveUsername, password);
    }
  }

  // -----------------------------------------------------------------------
  // Internal request wrapper
  // -----------------------------------------------------------------------

  /**
   * Make a JMAP API request with OAuth2 Bearer token.
   * Automatically refreshes token on 401 and retries exactly once.
   *
   * @param {string} url     Request URL
   * @param {object} options fetch options (method, headers, body, etc.)
   * @returns {Promise<Response>}
   */
  async _request(url, options = {}) {
    // 1. Get a valid token (triggers discovery, password grant, or refresh)
    let token;
    try {
      token = await this._tokenManager.getValidToken();
    } catch (err) {
      if (
        err instanceof OAuthTokenExpired ||
        err instanceof OAuthTokenRevoked ||
        err instanceof OAuthConfigurationError
      ) {
        throw err;
      }
      throw err;
    }

    // 2. Make the request.
    //    If the token is already a full Basic auth header, use it directly.
    //    Otherwise, use Bearer prefix.
    const doRequest = (t) =>
      fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: t && t.startsWith("Basic ") ? t : `Bearer ${t}`,
        },
      });

    let res = await doRequest(token);

    // 3. On 401, refresh the token once and retry once (only for Bearer tokens)
    if (res.status === 401 && token && !token.startsWith("Basic ")) {
      try {
        await this._tokenManager._refresh();
        const newToken = this._tokenManager.getAccessToken();
        if (newToken) {
          res = await doRequest(newToken);
        }
      } catch (refreshErr) {
        if (refreshErr instanceof OAuthTokenRevoked) {
          throw refreshErr;
        }
        // Otherwise let the original 401 response pass through
      }
    }

    return res;
  }

  /**
   * Convenience: make a JMAP API request and parse the JSON body.
   *
   * @param {string} url
   * @param {object} options
   * @returns {Promise<object>}
   */
  async _requestJson(url, options = {}) {
    const res = await this._request(url, options);
    return res.json();
  }

  // -----------------------------------------------------------------------
  // Session discovery
  // -----------------------------------------------------------------------

  async _discoverSession() {
    if (this._sessionPromise) return this._sessionPromise;
    const discoveryRes = `${this.baseUrl}/.well-known/jmap`;
    this._sessionPromise = this._request(discoveryRes, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }).then((res) => res.json());
    return this._sessionPromise;
  }

  getAccountId(session) {
    return session.primaryAccounts["urn:ietf:params:jmap:mail"];
  }

  // -----------------------------------------------------------------------
  // Prerequisites for sending
  // -----------------------------------------------------------------------

  async getSendPrerequisites(accountId) {
    const json = await this._requestJson(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: [
          "urn:ietf:params:jmap:core",
          "urn:ietf:params:jmap:mail",
          "urn:ietf:params:jmap:submission",
        ],
        methodCalls: [
          ["Mailbox/query", { accountId }, "q1"],
          [
            "Mailbox/get",
            {
              accountId,
              "#ids": {
                resultOf: "q1",
                name: "Mailbox/query",
                path: "/ids/*",
              },
              properties: ["id", "name", "role"],
            },
            "q2",
          ],
          [
            "Identity/get",
            {
              accountId,
            },
            "i1",
          ],
        ],
      }),
    });

    const { methodResponses } = json;

    const mailboxGetResponse = methodResponses.find(
      (r) => r[0] === "Mailbox/get",
    );
    if (!mailboxGetResponse) {
      throw new Error("No 'Mailbox/get' response found");
    }

    const sentMailbox = mailboxGetResponse[1].list.find(
      (mb) => mb.role === "sent",
    );
    if (!sentMailbox) {
      throw new Error("No sent mailbox found");
    }
    const outboxId = sentMailbox.id;

    const identityGetResponse = methodResponses.find(
      (r) => r[0] === "Identity/get",
    );
    if (!identityGetResponse) {
      throw new Error("No 'Identity/get' response found");
    }
    const identity = identityGetResponse[1].list[0];
    if (!identity) {
      throw new Error("No identities found");
    }
    const identityId = identity.id;
    const identityEmail = identity.email;

    return { outboxId, identityId, identityEmail };
  }

  // -----------------------------------------------------------------------
  // Send email
  // -----------------------------------------------------------------------

  async sendEmail({
    from,
    fromName,
    to,
    subject,
    text,
    cc,
    bcc,
    html,
    attachment,
    replyTo,
    replyMessageId,
    inReplyTo,
    references,
  }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);
    const env =
      typeof process !== "undefined" && process.env ? process.env : {};
    const { outboxId, identityId, identityEmail } =
      env.JMAP_SENT_MAILBOX_ID &&
      env.JMAP_IDENTITY_ID &&
      env.JMAP_IDENTITY_EMAIL
        ? {
            outboxId: env.JMAP_SENT_MAILBOX_ID,
            identityId: env.JMAP_IDENTITY_ID,
            identityEmail: env.JMAP_IDENTITY_EMAIL,
          }
        : await this.getSendPrerequisites(accountId);

    // Normalise to/cc/bcc to arrays
    const toList = Array.isArray(to) ? to : [to];
    const ccList = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
    const bccList = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [];

    const email = {
      from: [{ email: from, name: fromName }],
      to: toList.map((addr) => ({ email: addr })),
      subject,
    };

    if (ccList.length > 0) {
      email.cc = ccList.map((addr) => ({ email: addr }));
    }
    if (bccList.length > 0) {
      email.bcc = bccList.map((addr) => ({ email: addr }));
    }

    // Body construction — multipart/alternative when both text and html
    if (html && text) {
      email.bodyStructure = {
        type: "multipart/alternative",
        subParts: [
          { type: "text/plain", partId: "text" },
          { type: "text/html", partId: "html" },
        ],
      };
      email.bodyValues = { text: { value: text }, html: { value: html } };
    } else if (html) {
      email.bodyStructure = { type: "text/html", partId: "html" };
      email.bodyValues = { html: { value: html } };
    } else {
      // Plain text only (existing behaviour)
      const partId = "part1";
      email.textBody = [{ partId, type: "text/plain" }];
      email.bodyValues = { [partId]: { value: text } };
    }

    if (replyTo) {
      email.replyTo = [{ email: replyTo }];
    }

    // References and In-Reply-To headers
    if (references && references.length > 0) {
      email.references = references;
    }
    if (inReplyTo) {
      email.inReplyTo = [inReplyTo];
    }

    // replyMessageId is a shorthand that sets inReplyTo + references + headers
    if (replyMessageId) {
      if (!email.references) {
        email.references = [replyMessageId];
      }
      if (!email.inReplyTo) {
        email.inReplyTo = [replyMessageId];
      }
      email.headers = [{ name: "In-Reply-To", value: replyMessageId }];
    }

    if (attachment) {
      const uploadUrl = session.uploadUrl.replace("{accountId}", accountId);
      const uploadRes = await this._request(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: attachment.content,
      });
      const uploadData = await uploadRes.json();
      const blobId = uploadData.blobId;
      email.attachments = [
        {
          blobId: blobId,
          name: attachment.name,
          type: uploadData.type,
          size: uploadData.size,
        },
      ];
    }

    // Build envelope rcptTo: all recipients
    const rcptToList = [...toList, ...ccList, ...bccList].map((addr) => ({
      email: addr,
    }));

    const json = await this._requestJson(session.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: [
          "urn:ietf:params:jmap:core",
          "urn:ietf:params:jmap:mail",
          "urn:ietf:params:jmap:submission",
        ],
        methodCalls: [
          [
            "Email/set",
            {
              accountId,
              create: {
                msg1: {
                  ...email,
                  mailboxIds: { [outboxId]: true },
                  keywords: { $draft: false },
                },
              },
            },
            "c1",
          ],
          [
            "EmailSubmission/set",
            {
              accountId,
              create: {
                sub1: {
                  emailId: "#msg1",
                  identityId: identityId,
                  envelope: {
                    mailFrom: { email: identityEmail },
                    rcptTo: rcptToList,
                  },
                },
              },
            },
            "c2",
          ],
        ],
      }),
    });

    return json;
  }

  // -----------------------------------------------------------------------
  // List messages
  // -----------------------------------------------------------------------

  async listMessages({
    limit,
    mailboxName,
    sort = "receivedAt",
    order = "desc",
    keywords,
    after,
  }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);

    const mailboxes = await this._getMailboxes(accountId);
    const targetMailbox = mailboxes.find(
      (mb) =>
        mb.name?.toLowerCase() === mailboxName.toLowerCase() ||
        mb.role === mailboxName.toLowerCase,
    );

    if (!targetMailbox) {
      throw new Error(`Mailbox "${mailboxName}" not found.`);
    }
    const targetMailboxId = targetMailbox.id;

    const filterConditions = [{ inMailbox: targetMailboxId }];
    if (after) {
      filterConditions.push({ after });
    }
    if (keywords) {
      for (const keyword in keywords) {
        if (keywords[keyword]) {
          filterConditions.push({ hasKeyword: keyword });
        } else {
          filterConditions.push({ notHasKeyword: keyword });
        }
      }
    }

    const filter =
      filterConditions.length > 1
        ? { operator: "AND", conditions: filterConditions }
        : filterConditions[0];

    const json = await this._requestJson(session.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        methodCalls: [
          [
            "Email/query",
            {
              accountId,
              filter: filter,
              sort: [{ property: sort, isAscending: order === "asc" }],
              limit,
            },
            "q1",
          ],
          [
            "Email/get",
            {
              accountId,
              "#ids": {
                resultOf: "q1",
                name: "Email/query",
                path: "ids/*",
              },
              properties: [
                "id",
                "blobId",
                "subject",
                "from",
                "to",
                "cc",
                "bcc",
                "keywords",
                "size",
                "receivedAt",
                "sentAt",
                "preview",
                "hasAttachment",
                "textBody",
                "htmlBody",
                "bodyValues",
                "header:X-Priority:asText",
                "header:Importance:asText",
                "header:Priority:asText",
                "header:Auto-Submitted:asText",
                "header:Message-ID:asString",
              ],
              fetchTextBodyValues: true,
              fetchHTMLBodyValues: true,
            },
            "q2",
          ],
        ],
      }),
    });

    const { methodResponses } = json;
    const emailGetResponse = methodResponses?.find((r) => r[0] === "Email/get");
    if (!emailGetResponse) {
      throw new Error("No 'Email/get' response found");
    }

    for (const message of emailGetResponse[1].list) {
      if (message["header:Message-ID:asString"] !== undefined) {
        message.messageID = message["header:Message-ID:asString"];
        delete message["header:Message-ID:asString"];
      }
    }

    return emailGetResponse[1].list;
  }

  // -----------------------------------------------------------------------
  // Get messages (by IDs)
  // -----------------------------------------------------------------------

  async getMessages({ messageIds }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);

    const json = await this._requestJson(session.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        methodCalls: [
          [
            "Email/get",
            {
              accountId,
              ids: messageIds,
              properties: [
                "id",
                "blobId",
                "subject",
                "from",
                "to",
                "cc",
                "bcc",
                "keywords",
                "size",
                "receivedAt",
                "sentAt",
                "textBody",
                "htmlBody",
                "hasAttachment",
                "replyTo",
                "header:X-Priority:asText",
                "header:Importance:asText",
                "header:Priority:asText",
                "header:Auto-Submitted:asText",
                "header:Message-ID:asString",
              ],
            },
            "q1",
          ],
        ],
      }),
    });

    const { methodResponses } = json;
    const emailGetResponse = methodResponses?.find((r) => r[0] === "Email/get");
    if (!emailGetResponse) {
      throw new Error("No 'Email/get' response found");
    }

    const messages = emailGetResponse[1].list;
    if (!messages) return [];

    // Resolve textBody / htmlBody blobs
    for (const message of messages) {
      const cleanedMessage = {};
      for (const key in message) {
        const value = message[key];
        if (
          value !== null &&
          value !== undefined &&
          value !== "" &&
          !(Array.isArray(value) && value.length === 0)
        ) {
          if (key === "textBody" && value[0]) {
            const blobContent = await this._downloadBlob(
              value[0].blobId,
              accountId,
              value[0].type,
            );
            cleanedMessage[key] = blobContent;
          } else if (key === "htmlBody" && value[0]) {
            const blobContent = await this._downloadBlob(
              value[0].blobId,
              accountId,
              value[0].type,
            );
            cleanedMessage[key] = blobContent;
          } else {
            cleanedMessage[key] = value;
          }
        }
      }
      Object.assign(message, cleanedMessage);
      if (message["header:Message-ID:asString"] !== undefined) {
        message.messageID = message["header:Message-ID:asString"];
        delete message["header:Message-ID:asString"];
      }
    }

    return messages;
  }

  // -----------------------------------------------------------------------
  // Get single message
  // -----------------------------------------------------------------------

  async getMessage({ messageId, headerMessageId }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);

    // If headerMessageId is provided, resolve it to a JMAP messageId first
    if (headerMessageId && !messageId) {
      const queryJson = await this._requestJson(session.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          methodCalls: [
            [
              "Email/query",
              {
                accountId,
                filter: { header: ["Message-ID", headerMessageId] },
              },
              "q1",
            ],
          ],
        }),
      });

      const queryResponse = queryJson.methodResponses?.find(
        (r) => r[0] === "Email/query",
      );
      if (queryResponse && queryResponse[1].ids?.length > 0) {
        messageId = queryResponse[1].ids[0];
      } else {
        return null;
      }
    }

    if (!messageId) {
      throw new Error("Missing messageId or headerMessageId param");
    }

    const json = await this._requestJson(session.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        methodCalls: [
          [
            "Email/get",
            {
              accountId,
              ids: [messageId],
              properties: [
                "id",
                "blobId",
                "subject",
                "from",
                "to",
                "cc",
                "bcc",
                "keywords",
                "size",
                "receivedAt",
                "sentAt",
                "textBody",
                "htmlBody",
                "hasAttachment",
                "replyTo",
                "header:X-Priority:asText",
                "header:Importance:asText",
                "header:Priority:asText",
                "header:Message-ID:asString",
                "header:Auto-Submitted:asText",
              ],
            },
            "q1",
          ],
        ],
      }),
    });

    const { methodResponses } = json;
    const emailGetResponse = methodResponses?.find((r) => r[0] === "Email/get");
    if (!emailGetResponse) {
      throw new Error("No 'Email/get' response found");
    }

    const message = emailGetResponse[1].list[0];

    if (!message) {
      return null;
    }

    const cleanedMessage = {};
    for (const key in message) {
      const value = message[key];
      if (
        value !== null &&
        value !== undefined &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0)
      ) {
        if (key === "textBody" && value[0]) {
          const blobContent = await this._downloadBlob(
            value[0].blobId,
            accountId,
            value[0].type,
          );
          cleanedMessage[key] = blobContent;
        } else if (key === "htmlBody" && value[0]) {
          const blobContent = await this._downloadBlob(
            value[0].blobId,
            accountId,
            value[0].type,
          );
          cleanedMessage[key] = blobContent;
        } else {
          cleanedMessage[key] = value;
        }
      }
    }

    if (cleanedMessage["header:Message-ID:asString"] !== undefined) {
      cleanedMessage.messageID = cleanedMessage["header:Message-ID:asString"];
      delete cleanedMessage["header:Message-ID:asString"];
    }

    return cleanedMessage;
  }

  // -----------------------------------------------------------------------
  // Download blob
  // -----------------------------------------------------------------------

  async _downloadBlob(blobId, accountId, type) {
    const session = await this._discoverSession();
    const downloadUrl = session.downloadUrl
      .replace("{accountId}", accountId)
      .replace("{blobId}", blobId)
      .replace("{type}", type);

    const res = await this._request(downloadUrl, {
      method: "GET",
    });

    let blob;
    if (type === "text/plain") {
      blob = await res.text();
    } else {
      blob = await res.text();
    }
    return blob;
  }

  // -----------------------------------------------------------------------
  // Get all mailboxes
  // -----------------------------------------------------------------------

  async _getMailboxes(accountId, filter = {}) {
    const json = await this._requestJson(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        methodCalls: [
          [
            "Mailbox/query",
            {
              accountId,
              filter: filter,
            },
            "q1",
          ],
          [
            "Mailbox/get",
            {
              accountId,
              "#ids": {
                resultOf: "q1",
                name: "Mailbox/query",
                path: "/ids/*",
              },
            },
            "q2",
          ],
        ],
      }),
    });

    const { methodResponses } = json;
    const mailboxGetResponse = methodResponses.find(
      (r) => r[0] === "Mailbox/get",
    );
    if (!mailboxGetResponse) {
      throw new Error("No 'Mailbox/get' response found");
    }

    return mailboxGetResponse[1].list;
  }

  // -----------------------------------------------------------------------
  // List mailboxes (public alias)
  // -----------------------------------------------------------------------

  async listMailboxes() {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);
    return this._getMailboxes(accountId);
  }

  // -----------------------------------------------------------------------
  // Update message (keywords, mailboxIds, etc.)
  // -----------------------------------------------------------------------

  async updateMessage({ messageId, update }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);

    const json = await this._requestJson(session.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        methodCalls: [
          [
            "Email/set",
            {
              accountId,
              update: {
                [messageId]: update,
              },
            },
            "c1",
          ],
        ],
      }),
    });

    const updated = json.methodResponses[0][1].updated;
    if (updated && updated[messageId]) {
      return updated[messageId];
    }

    return json;
  }

  // -----------------------------------------------------------------------
  // Search messages
  // -----------------------------------------------------------------------

  async searchMessages({ filter, sort = "receivedAt", order = "desc" }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);

    const json = await this._requestJson(session.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        methodCalls: [
          [
            "Email/query",
            {
              accountId,
              filter: filter,
              sort: [{ property: sort, isAscending: order === "asc" }],
            },
            "q1",
          ],
          [
            "Email/get",
            {
              accountId,
              "#ids": {
                resultOf: "q1",
                name: "Email/query",
                path: "ids/*",
              },
              properties: [
                "id",
                "blobId",
                "subject",
                "from",
                "to",
                "cc",
                "bcc",
                "keywords",
                "size",
                "receivedAt",
                "sentAt",
                "preview",
                "hasAttachment",
                "header:X-Priority:asText",
                "header:Importance:asText",
                "header:Priority:asText",
                "header:Auto-Submitted:asText",
                "header:Message-ID:asString",
              ],
            },
            "q2",
          ],
        ],
      }),
    });

    const { methodResponses } = json;
    const emailGetResponse = methodResponses?.find((r) => r[0] === "Email/get");
    if (!emailGetResponse) {
      throw new Error("No 'Email/get' response found");
    }

    for (const message of emailGetResponse[1].list) {
      if (message["header:Message-ID:asString"] !== undefined) {
        message.messageID = message["header:Message-ID:asString"];
        delete message["header:Message-ID:asString"];
      }
    }

    return emailGetResponse[1].list;
  }

  // -----------------------------------------------------------------------
  // Listen for changes (WebSocket)
  // -----------------------------------------------------------------------

  /**
   * Build the WebSocket URL for JMAP push events.
   * @param {object} session
   * @returns {string}
   */
  _getWebSocketUrl(session) {
    return session.apiUrl.replace("/jmap", "/ws");
  }

  async listen({ onMessage, onEmailState } = {}) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);
    const wsUrl = this._getWebSocketUrl(session);

    const WebSocketImpl = globalThis.WebSocket;
    if (!WebSocketImpl) {
      throw new Error("WebSocket is not available in this environment.");
    }

    const ws = new WebSocketImpl(wsUrl);

    ws.onopen = () => {
      // Subscribe to Email state changes
      ws.send(
        JSON.stringify({
          type: "Email/set",
          accountId,
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "EmailState" && onEmailState) {
          onEmailState(data.state);
        }
        if (data.changed && onMessage) {
          onMessage(data.changed);
        }
      } catch {
        // Ignore unparseable messages
      }
    };

    ws.onerror = (err) => {
      // Quietly log; caller can handle via close event
    };

    ws.onclose = () => {
      // Connection closed
    };

    return ws;
  }

  // -----------------------------------------------------------------------
  // Get mailbox by name / role
  // -----------------------------------------------------------------------

  async getMailbox(nameOrRole, createIfNotExist) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);
    const mailboxes = await this._getMailboxes(accountId);
    let mailbox = mailboxes.find(
      (mb) =>
        mb.name?.toLowerCase() === nameOrRole.toLowerCase() ||
        mb.role === nameOrRole.toLowerCase(),
    );

    if (!mailbox && createIfNotExist) {
      mailbox = await this.createMailbox({ name: nameOrRole });
    }

    return mailbox;
  }

  // -----------------------------------------------------------------------
  // Move message
  // -----------------------------------------------------------------------

  async moveMessage({ messageId, toMailbox }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);

    const mailboxes = await this._getMailboxes(accountId);
    const targetMailbox = mailboxes.find(
      (mb) =>
        mb.name?.toLowerCase() === toMailbox.toLowerCase() ||
        mb.role === toMailbox.toLowerCase(),
    );

    if (!targetMailbox) {
      throw new Error(`Mailbox "${toMailbox}" not found.`);
    }
    const targetMailboxId = targetMailbox.id;

    return this.updateMessage({
      messageId,
      update: { mailboxIds: { [targetMailboxId]: true } },
    });
  }

  // -----------------------------------------------------------------------
  // Create mailbox
  // -----------------------------------------------------------------------

  async createMailbox({ name, parentId }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);

    // If a parentId was passed as a mailbox name, look up its ID
    if (parentId && !parentId.startsWith("-")) {
      const mailboxes = await this._getMailboxes(accountId);
      const effectiveParentName = parentId;
      const parentMailbox = mailboxes.find(
        (mb) => mb.name.toLowerCase() === effectiveParentName.toLowerCase(),
      );

      if (!parentMailbox) {
        throw new Error(`Parent mailbox "${effectiveParentName}" not found.`);
      }
      parentId = parentMailbox.id;
    }

    const json = await this._requestJson(session.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        methodCalls: [
          [
            "Mailbox/set",
            {
              accountId,
              create: {
                "new-mailbox": {
                  name,
                  parentId,
                },
              },
            },
            "c1",
          ],
        ],
      }),
    });

    const created = json.methodResponses[0][1].created;
    if (created && created["new-mailbox"]) {
      return created["new-mailbox"];
    }

    const notCreated = json.methodResponses[0][1].notCreated;
    if (
      notCreated &&
      notCreated["new-mailbox"] &&
      notCreated["new-mailbox"].type === "mailboxAlreadyExists"
    ) {
      return await this.getMailbox(name);
    }

    return json;
  }

  // -----------------------------------------------------------------------
  // Verify credentials
  // -----------------------------------------------------------------------

  async verifyCredentials() {
    try {
      const session = await this._discoverSession();
      return !!(session && session.primaryAccounts);
    } catch (error) {
      return false;
    }
  }
}

export default JmapClient;

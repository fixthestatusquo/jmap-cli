// ---------------------------------------------------------------------------
// jmap-cli — JMAP client library
// ---------------------------------------------------------------------------
// OAuth2-only authentication. Token lifecycle handled by TokenManager.
// ---------------------------------------------------------------------------

import dotenv from "dotenv";
import { TokenManager } from "./oauth.js";
import {
  OAuthTokenExpired,
  OAuthTokenRevoked,
  OAuthConfigurationError,
} from "./errors.js";

export class JmapClient {
  /**
   * Create a new JMAP client.
   *
   * All values fall back to environment variables:
   *   JMAP_TOKEN, JMAP_REFRESH_TOKEN, JMAP_USERNAME, JMAP_PASSWORD,
   *   JMAP_BASE_URL, JMAP_CLIENT_ID, JMAP_AUTH_TOKEN_ENDPOINT
   *
   * Token acquisition priority (in TokenManager):
   *   1. Return cached access token if not expired
   *   2. Refresh via JMAP_REFRESH_TOKEN
   *   3. Password grant via JMAP_USERNAME + JMAP_PASSWORD
   *
   * @param {object}  [options]
   * @param {string}  [options.baseUrl]       JMAP base URL
   * @param {string}  [options.token]         Pre-existing access token (JMAP_TOKEN)
   * @param {string}  [options.refreshToken]  Pre-existing refresh token (JMAP_REFRESH_TOKEN)
   * @param {string}  [options.username]      JMAP username (for password grant)
   * @param {string}  [options.password]      JMAP password (for password grant)
   * @param {string}  [options.clientId]      OAuth client ID (default: "jmap-client")
   * @param {string}  [options.tokenEndpoint] Explicit token endpoint (skips discovery)
   * @param {string}  [options.path]          Path to dotenv config file
   */
  constructor(options = {}) {
    let {
      username,
      password,
      baseUrl,
      path,
      token,
      refreshToken,
      clientId,
      tokenEndpoint,
    } = options;

    if (path) {
      dotenv.config({ path });
    }

    if (!username) username = process.env.JMAP_USERNAME;
    if (!password) password = process.env.JMAP_PASSWORD;
    if (!baseUrl) baseUrl = process.env.JMAP_BASE_URL;
    if (!token) token = process.env.JMAP_TOKEN;
    if (!refreshToken) refreshToken = process.env.JMAP_REFRESH_TOKEN;
    if (!clientId) clientId = process.env.JMAP_CLIENT_ID;
    if (!tokenEndpoint) tokenEndpoint = process.env.JMAP_AUTH_TOKEN_ENDPOINT;

    this.username = username;
    this.password = password;
    this.baseUrl = baseUrl;

    if (!this.baseUrl) {
      throw "missing configuration. Please run `jmap-cli init` or provide configuration to the constructor.";
    }

    this.apiUrl = `${this.baseUrl}/jmap`;
    this._tokenManager = new TokenManager({
      baseUrl,
      tokenEndpoint,
      clientId,
      username,
      password,
      token,
      refreshToken,
    });
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

    // 2. Make the request
    const doRequest = (t) =>
      fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${t}`,
        },
      });

    let res = await doRequest(token);

    // 3. On 401, refresh the token once and retry once
    if (res.status === 401) {
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
    const discoveryRes = `${this.baseUrl}/.well-known/jmap`;
    const res = await this._request(discoveryRes, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    return await res.json();
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

  async sendEmail({ from, fromName, to, subject, text, attachment }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);
    const { outboxId, identityId, identityEmail } =
      process.env.JMAP_SENT_MAILBOX_ID &&
      process.env.JMAP_IDENTITY_ID &&
      process.env.JMAP_IDENTITY_EMAIL
        ? {
            outboxId: process.env.JMAP_SENT_MAILBOX_ID,
            identityId: process.env.JMAP_IDENTITY_ID,
            identityEmail: process.env.JMAP_IDENTITY_EMAIL,
          }
        : await this.getSendPrerequisites(accountId);

    const partId = "part1";
    const email = {
      from: [{ email: from, name: fromName }],
      to: [{ email: to }],
      subject,
      textBody: [{ partId, type: "text/plain" }],
      bodyValues: {
        [partId]: {
          value: text,
        },
      },
    };

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
                    rcptTo: [{ email: to }],
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
                "header:X-Priority:asText",
                "header:Importance:asText",
                "header:Priority:asText",
                "header:Auto-Submitted:asText",
              ],
            },
            "q2",
          ],
        ],
      }),
    });

    const { methodResponses } = json;
    const emailGetResponse = methodResponses?.find(
      (r) => r[0] === "Email/get",
    );
    if (!emailGetResponse) {
      throw new Error("No 'Email/get' response found");
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
              ],
            },
            "q1",
          ],
        ],
      }),
    });

    const { methodResponses } = json;
    const emailGetResponse = methodResponses?.find(
      (r) => r[0] === "Email/get",
    );
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
    }

    return messages;
  }

  // -----------------------------------------------------------------------
  // Get single message
  // -----------------------------------------------------------------------

  async getMessage({ messageId }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);
    if (!messageId) {
      throw new Error("Missing messageId param");
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
                "header:Auto-Submitted:asText",
              ],
            },
            "q1",
          ],
        ],
      }),
    });

    const { methodResponses } = json;
    const emailGetResponse = methodResponses?.find(
      (r) => r[0] === "Email/get",
    );
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

  async _getMailboxes(accountId) {
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
              filter: { isSubscribed: true },
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
              ],
            },
            "q2",
          ],
        ],
      }),
    });

    const { methodResponses } = json;
    const emailGetResponse = methodResponses?.find(
      (r) => r[0] === "Email/get",
    );
    if (!emailGetResponse) {
      throw new Error("No 'Email/get' response found");
    }

    return emailGetResponse[1].list;
  }

  // -----------------------------------------------------------------------
  // Real-time listen (WebSocket)
  // -----------------------------------------------------------------------

  async listen({ onMessage, onEmailState } = {}) {
    const session = await this._discoverSession();

    const wsUrl = this._getWebSocketUrl(session);
    let WebSocket;
    try {
      WebSocket = (await import("ws")).default;
    } catch {
      WebSocket = globalThis.WebSocket;
    }

    const socket = new WebSocket(wsUrl);

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          methodCalls: [
            ["Email/changes", { accountId: null, sinceState: null }, "c1"],
          ],
        }),
      );
    });

    socket.addEventListener("message", (event) => {
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

    socket.addEventListener("error", (error) => {
      console.error("WebSocket error:", error);
    });

    socket.addEventListener("close", () => {
      // Reconnect after 5 seconds
      setTimeout(() => this.listen({ onMessage, onEmailState }), 5000);
    });
  }

  // -----------------------------------------------------------------------
  // WebSocket URL helper
  // -----------------------------------------------------------------------

  _getWebSocketUrl(session) {
    const eventSourceUrl = session.eventSourceUrl;
    if (eventSourceUrl) {
      return eventSourceUrl
        .replace(/^https:/, "wss:")
        .replace(/^http:/, "ws:");
    }
    return `${this.baseUrl
      .replace(/^http:/, "ws:")
      .replace(/^https:/, "wss:")}/jmap/ws`;
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

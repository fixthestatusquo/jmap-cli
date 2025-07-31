import WebSocket from 'ws';
import { getBearerToken } from "./auth.js";

export class JmapClient {
  constructor(username = process.env.JMAP_USERNAME, password = process.env.JMAP_PASSWORD, baseUrl = process.env.JMAP_BASE_URL) {
    this.username = username;
    this.password = password;
    this.baseUrl = baseUrl;
    this.apiUrl = `${baseUrl}/jmap`;
    this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    if (!username || !password || !baseUrl) {
      throw ("missing configuration .env file, run npx jmap-cli init");
    }
  }

  async _getSendPrerequisites(accountId) {
    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
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

    const { methodResponses } = await res.json();

    const mailboxGetResponse = methodResponses.find(r => r[0] === 'Mailbox/get');
    if (!mailboxGetResponse) {
        throw new Error("No 'Mailbox/get' response found");
    }

    const outbox = mailboxGetResponse[1].list.find(
      (mb) => mb.name?.toLowerCase() === "outbox",
    );
    if (!outbox) {
      throw new Error("No outbox mailbox found");
    }
    const outboxId = outbox.id;

    const identityGetResponse = methodResponses.find(r => r[0] === 'Identity/get');
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

  async _discoverSession() {
    const discoveryRes = `${this.baseUrl}/.well-known/jmap`;
    const sessionObj = await fetch(discoveryRes, {
      method: "GET",
      headers: {
        Authorization: this.authHeader,
      },
    });
    return await sessionObj.json();
  }

  getAccountId(session) {
    return session.primaryAccounts["urn:ietf:params:jmap:mail"];
  }

  async sendEmail({ from, name, to, subject, text }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);
    const { outboxId, identityId, identityEmail } = await this._getSendPrerequisites(accountId);

    const partId = "part1";
    const email = {
      from: [{ email: from, name: name }],
      to: [{ email: to }],
      subject,
      htmlBody: [{ partId, type: "text/html" }],
      bodyValues: {
        [partId]: {
          value: text,
        },
      },
    };

    const res = await fetch(session.apiUrl, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission"],
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

    return await res.json();
  }

  async listMessages({ limit, mailboxName }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);

    const mailboxes = await this._getMailboxes(accountId);
    const targetMailbox = mailboxes.find(mb => mb.name?.toLowerCase() === mailboxName.toLowerCase());

    if (!targetMailbox) {
      throw new Error(`Mailbox "${mailboxName}" not found.`);
    }
    const targetMailboxId = targetMailbox.id;

    // Now, query for emails in the found mailbox
    const emailRes = await fetch(session.apiUrl, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        methodCalls: [
          [
            "Email/query",
            {
              accountId,
              filter: { inMailbox: targetMailboxId },
              sort: [{ property: "receivedAt", isAscending: false }],
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
                path: "/ids/*",
              },
              properties: ["id", "blobId", "subject", "from", "to", "cc", "bcc", "keywords", "size", "receivedAt", "sentAt", "preview", "hasAttachment", "replyTo", "mailboxIds", "header:X-Priority:asText", "header:Importance:asText", "header:Priority:asText", "header:Auto-Submitted:asText"],
            },
            "q2",
          ],
        ],
      }),
    });

    const { methodResponses } = await emailRes.json();
    const emailGetResponse = methodResponses.find(r => r[0] === 'Email/get');
    if (!emailGetResponse) {
      throw new Error("No 'Email/get' response found");
    }

    return emailGetResponse[1].list;
  }

  async _getMailboxes(accountId) {
    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
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
        ],
      }),
    });

    const { methodResponses } = await res.json();
    const mailboxGetResponse = methodResponses.find(r => r[0] === 'Mailbox/get');
    if (!mailboxGetResponse) {
      throw new Error("No 'Mailbox/get' response found");
    }
    return mailboxGetResponse[1].list;
  }

  async listMailboxes() {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);
    return await this._getMailboxes(accountId);
  }

  async getMessage({ messageId }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);

    const res = await fetch(session.apiUrl, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
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
              properties: ["id", "blobId", "subject", "from", "to", "cc", "bcc", "keywords", "size", "receivedAt", "sentAt", "textBody", "htmlBody", "hasAttachment", "replyTo", "header:X-Priority:asText", "header:Importance:asText", "header:Priority:asText", "header:Auto-Submitted:asText"],
            },
            "q1",
          ],
        ],
      }),
    });

    const { methodResponses } = await res.json();
    const emailGetResponse = methodResponses.find(r => r[0] === 'Email/get');
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
      if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
        if (key === 'textBody' && value[0]) {
          const blobContent = await this._downloadBlob(value[0].blobId, accountId, value[0].type);
          cleanedMessage[key] = blobContent;
        } else if (key === 'htmlBody' && value[0]) {
          const blobContent = await this._downloadBlob(value[0].blobId, accountId, value[0].type);
          cleanedMessage[key] = blobContent;
        } else if (key.startsWith('header:')) {
          if (key === 'header:X-Priority:asText') cleanedMessage['X-Priority'] = value;
          else if (key === 'header:Importance:asText') cleanedMessage['Importance'] = value;
          else if (key === 'header:Priority:asText') cleanedMessage['Priority'] = value;
          else if (key === 'header:Auto-Submitted:asText') cleanedMessage['Auto-Submitted'] = value;
        } else {
          cleanedMessage[key] = value;
        }
      }
    }
    return cleanedMessage;
  }

  async _downloadBlob(blobId, accountId, type) {
    const session = await this._discoverSession();
    const downloadUrl = session.downloadUrl.replace('{accountId}', accountId).replace('{blobId}', blobId).replace('{type}', type);
    const res = await fetch(downloadUrl, {
      method: "GET",
      headers: {
        Authorization: this.authHeader,
      },
    });
    return await res.text();
  }

  async _getWebSocketUrl() {
    const session = await this._discoverSession();
    return session.capabilities['urn:ietf:params:jmap:websocket'].url;
  }

  async listen() {
    const webSocketUrl = await this._getWebSocketUrl();
    const ws = new WebSocket(webSocketUrl, {
      headers: {
        Authorization: this.authHeader,
      },
    });

    ws.on('open', () => {
      console.log('Connected to JMAP WebSocket');
      ws.send(JSON.stringify({
        "@type": "WebSocketPushEnable",
        dataTypes: ["Email"]
      }));
    });

    ws.on('message', (data) => {
      console.log('Received:', JSON.parse(data));
    });

    ws.on('close', () => {
      console.log('Disconnected from JMAP WebSocket');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  async verifyCredentials() {
    try {
      const session = await this._discoverSession();
      return !!(session && session.primaryAccounts);
    } catch (error) {
      return false;
    }
  }
}

import dotenv from "dotenv";
import { getBasicAuthHeader } from "./auth.js";

dotenv.config();

export class JmapClient {
  constructor() {
    this.apiUrl = `${process.env.JMAP_BASE_URL}/jmap/`;
    this.authHeader = getBasicAuthHeader();
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
    const discoveryRes = `${process.env.JMAP_BASE_URL}/.well-known/jmap`;
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

    const result = await res.json();
    console.log(JSON.stringify(result, null, 2));
  }

  async listMessages({ limit, mailboxName, jsonOutput }) {
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
              properties: ["id", "blobId", "subject", "from", "to", "cc", "bcc", "keywords", "size", "receivedAt", "sentAt", "textBody", "htmlBody", "hasAttachment", "replyTo", "header:X-Priority:asText", "header:Importance:asText", "header:Priority:asText", "header:Auto-Submitted:asText"],
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

    const messages = emailGetResponse[1].list;

    const cleanedMessages = messages.map(message => {
      const cleanedMessage = {};
      for (const key in message) {
        const value = message[key];
        if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
          if (key === 'textBody' && value[0]) {
            cleanedMessage[key] = value[0].value;
          } else if (key === 'htmlBody' && value[0]) {
            cleanedMessage[key] = value[0].value;
          } else if (key.startsWith('header:')) {
            // Handle specific headers for JSON output
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
    });

    if (jsonOutput) {
      console.log(JSON.stringify(cleanedMessages, null, 2));
    } else {
      messages.forEach(message => {
        const display = (label, value) => {
          if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
            console.log(`${label}: ${value}`);
          }
        };

        display('ID', message.id);
        display('Subject', message.subject);
        display('From', message.from ? message.from.map(f => f.name ? `${f.name} <${f.email}>` : f.email).join(', ') : null);
        display('To', message.to ? message.to.map(t => t.name ? `${t.name} <${t.email}>` : t.email).join(', ') : null);
        display('Cc', message.cc ? message.cc.map(c => c.name ? `${c.name} <${c.email}>` : c.email).join(', ') : null);
        display('Bcc', message.bcc ? message.bcc.map(b => b.name ? `${b.name} <${b.email}>` : b.email).join(', ') : null);
        display('Received', message.receivedAt);
        display('Size', message.size);
        if (message.hasAttachment) display('Has Attachment', message.hasAttachment);
        if (Object.keys(message.keywords).length > 0) display('Keywords', JSON.stringify(message.keywords));
        display('Text Body', message.textBody && message.textBody[0] ? message.textBody[0].value : null);
        display('HTML Body', message.htmlBody && message.htmlBody[0] ? message.htmlBody[0].value : null);
        display('X-Priority', message['header:X-Priority:asText']);
        display('Importance', message['header:Importance:asText']);
        display('Priority', message['header:Priority:asText']);
        display('Auto-Submitted', message['header:Auto-Submitted:asText']);
        console.log('---');
      });
    }
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
    const mailboxes = await this._getMailboxes(accountId);
    mailboxes.forEach(mailbox => {
      console.log(mailbox.name);
    });
  }
}

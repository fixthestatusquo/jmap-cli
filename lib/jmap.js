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

  async listMessages({ limit, mailboxName }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);
console.log("In "+ mailboxName);
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
            "Mailbox/query",
            {
              accountId,
              filter: { name: mailboxName },
            },
            "q1",
          ],
          [
            "Email/query",
            {
              accountId,
              "#inMailbox": "#q1.ids[0]",
              sort: [{ property: "receivedAt", isAscending: false }],
              limit,
            },
            "q2",
          ],
          [
            "Email/get",
            {
              accountId,
              "#ids": {
                resultOf: "q2",
                name: "Email/query",
                path: "/ids/*",
              },
              properties: ["from", "subject", "receivedAt"],
            },
            "q3",
          ],
        ],
      }),
    });

    const { methodResponses } = await res.json();
    const emailGetResponse = methodResponses.find(r => r[0] === 'Email/get');
    if (!emailGetResponse) {
      throw new Error("No 'Email/get' response found");
    }

    const messages = emailGetResponse[1].list;
    messages.forEach(message => {
      console.log(`From: ${message.from[0].email}`);
      console.log(`Subject: ${message.subject}`);
      console.log(`Received: ${message.receivedAt}`);
      console.log('---');
    });
  }

  async listMailboxes() {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);

    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        methodCalls: [
          [
            "Mailbox/query",
            {
              accountId,
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
              properties: ["name"],
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

    const mailboxes = mailboxGetResponse[1].list;
    mailboxes.forEach(mailbox => {
      console.log(mailbox.name);
    });
  }
}

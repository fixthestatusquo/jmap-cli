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
    const identityId = identityGetResponse[1].list[0]?.id;
    if (!identityId) {
      throw new Error("No identities found");
    }

    return { outboxId, identityId };
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

  async _uploadBlob(content, session, accountId) {
    const uploadUrl = session.uploadUrl.replace('{accountId}', accountId);
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "text/plain",
      },
      body: content,
    });
    const blobData = await res.json();
    return blobData.blobId;
  }

  async sendEmail({ from, to, subject, text }) {
    const session = await this._discoverSession();
    const accountId = this.getAccountId(session);
    const { outboxId, identityId } = await this._getSendPrerequisites(accountId);

    const textBlobId = await this._uploadBlob(text, session, accountId);
    const htmlBlobId = await this._uploadBlob(`<p>${text}</p>`, session, accountId);

    const email = {
      from: [{ email: from }],
      to: [{ email: to }],
      subject,
      textBody: { partId: "textpart", blobId: textBlobId, type: "text/plain" },
      htmlBody: { partId: "htmlpart", blobId: htmlBlobId, type: "text/html" },
    };

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
}

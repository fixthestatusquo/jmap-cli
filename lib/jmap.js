import dotenv from "dotenv";
import { getBearerToken, getBasicAuthHeader } from "./auth.js";
dotenv.config();
const apiUrl = `${process.env.JMAP_BASE_URL}/jmap/`;

export async function getOutboxId(accountId) {
  const authHeader = getBasicAuthHeader();
  const mailboxQueryRes = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
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
          "c1",
        ],
      ],
    }),
  });

  const { methodResponses } = await mailboxQueryRes.json();

  const [, result] = methodResponses[0];
  const ids = result?.ids;
  // 2. Get mailbox details
  const getRes = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: [
        [
          "Mailbox/get",
          {
            accountId,
            ids,
            properties: ["id", "name", "role"],
          },
          "c2",
        ],
      ],
    }),
  });

  const getJson = await getRes.json();
  const [, mailboxList] = getJson.methodResponses[0];

  // Step 3: try to find mailbox with role 'outbox'
  const outbox = mailboxList.list.find(
    (mb) => mb.name?.toLowerCase() === "outbox",
  );
  if (!outbox) {
    throw new Error("No outbox mailbox found");
  }

  return outbox.id;
}

export async function sendEmail({ from, to, subject, text }) {
  const authHeader = getBasicAuthHeader();
  // Step 1: Discover API endpoint
  const discoveryRes = `${process.env.JMAP_BASE_URL}/.well-known/jmap`;
  //const discovery = await discoveryRes.json();
  //const apiUrl = discovery.apiUrl;

  const sessionObj = await fetch(discoveryRes, {
    method: "GET",
    headers: {
      Authorization: authHeader,
    },
  });

  const session = await sessionObj.json();

  const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];
  const res1 = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:submission"],
      methodCalls: [["Identity/get", { accountId }, "c1"]],
    }),
  });

  const json = await res1.json();
  const identities = json.methodResponses[0][1].list;
  const identityId = identities[0]?.id;
  if (!identityId) throw new Error("No identities found");

  const outboxId = await getOutboxId(accountId);
  const email = {
    from: [{ email: from }],
    to: [{ email: to }],
    subject,
    textBody: text,
  };

  const res = await fetch(session.apiUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
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
        // Step 2: Submit the created email
        [
          "EmailSubmission/set",
          {
            accountId,
            create: {
              sub1: {
                emailId: "#msg1",
                identityId: identityId, // optional: your identity id from session.accounts[accountId].identities
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

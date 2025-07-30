import dotenv from 'dotenv';

dotenv.config();

export async function sendEmail(accessToken, { from, to, subject, text }) {
  const sessionRes = await fetch(`${process.env.JMAP_BASE_URL}/.well-known/jmap`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const session = await sessionRes.json();
  const accountId = session.accounts[from].accountId;

  const email = {
    from: [{ email: from }],
    to: [{ email: to }],
    subject,
    textBody: text,
  };

  const res = await fetch(session.apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
      methodCalls: [[
        'Email/set',
        {
          accountId,
          create: {
            msg1: {
              ...email,
              mailboxIds: { outbox: true },
              keywords: { '$draft': false }
            }
          }
        },
        'c1'
      ]]
    })
  });

  const result = await res.json();
  console.log(JSON.stringify(result, null, 2));
}


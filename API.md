# API Reference

`jmap-cli` can be used **programmatically as a Node package** with full TypeScript type definitions.

```typescript
import JmapClient from "jmap-cli";

// Pre-existing Bearer token
const client = new JmapClient({
  baseUrl: "https://api.fastmail.com",
  token: "eyJhbGciOi...",
});

// Username/password (Basic Auth)
const client = new JmapClient({
  baseUrl: "https://api.fastmail.com",
  username: "user@example.com",
  password: "supersecret",
});

// Rely on environment variables
const client = new JmapClient();
```

### Available methods

All methods return Promises and are fully typed:

| Method | Description |
|---|---|
| `verifyCredentials()` | Check that stored credentials are valid |
| `listMessages({ mailboxName, limit?, sort?, order?, keywords? })` | List messages in a mailbox |
| `getMessage({ messageId })` | Fetch a single message by ID |
| `getMessages({ messageIds })` | Fetch multiple messages by IDs |
| `sendEmail({ from, fromName, to, subject, text, attachment?, replyTo?, replyMessageId? })` | Send an email |
| `searchMessages({ filter, sort?, order? })` | Search messages with JMAP filter conditions |
| `updateMessage({ messageId, update })` | Update keywords, mailbox membership, etc. |
| `moveMessage({ messageId, toMailbox })` | Move a message to another mailbox by name |
| `getMailbox(nameOrRole, createIfNotExist?)` | Look up a mailbox by name or role |
| `listMailboxes()` | Get all mailboxes |
| `createMailbox({ name, parentId? })` | Create a new mailbox |
| `listen({ onMessage?, onEmailState? })` | Listen for real-time changes via WebSocket |

### Example: list inbox messages

```typescript
import JmapClient from "jmap-cli";

const client = new JmapClient();
const messages = await client.listMessages({
  mailboxName: "Inbox",
  limit: 5,
  sort: "receivedAt",
  order: "desc",
});

for (const msg of messages) {
  console.log(`${msg.subject} — ${msg.from.map(f => f.name).join(", ")}`);
}
```

### Subpath imports

```typescript
import { getBearerToken } from "jmap-cli/auth";
import { formatAndDisplayMessages } from "jmap-cli/display";
import { TokenManager } from "jmap-cli/oauth";
import { OAuthTokenRevoked, OAuthConfigurationError } from "jmap-cli/errors";
```

### Environment variables

| Variable | Description |
|---|---|
| `JMAP_BASE_URL` | JMAP server base URL **(required)** |
| `JMAP_TOKEN` | Access token (Bearer JWT or `Basic base64...`) |
| `JMAP_USERNAME` | Username for Basic Auth |
| `JMAP_PASSWORD` | Password for Basic Auth |
| `JMAP_REFRESH_TOKEN` | OAuth2 refresh token (auto-refreshed on expiry) |
| `JMAP_ADMIN` | Admin email for Stalwart master user impersonation |
| `JMAP_CLIENT_ID` | OAuth2 client ID (default: `jmap-client`) |
| `JMAP_AUTH_TOKEN_ENDPOINT` | Explicit OAuth2 token endpoint |
| `JMAP_AUTH_DEVICE_ENDPOINT` | Explicit device authorization endpoint |
| `MAIL_FROM` | Default sender address |
| `MAIL_FROM_NAME` | Default sender display name |

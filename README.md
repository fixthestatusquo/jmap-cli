# jmap-cli

A command-line interface for interacting with a JMAP server.

`jmap-cli` can also be used **programmatically as a Node package** with full TypeScript type definitions.

## Installation

For detailed installation and configuration instructions, please see [INSTALL.md](INSTALL.md).

## Programmatic Usage (as a package)

`jmap-cli` exports a `JmapClient` class for use in your own Node.js projects. Full TypeScript declarations (`.d.ts`) are bundled with the package.

### Install as a dependency

```bash
npm install jmap-cli
```

### TypeScript / ESM example

```typescript
import JmapClient from "jmap-cli";

// Option 1: pass credentials directly
const client = new JmapClient({
  username: "user@example.com",
  password: "supersecret",
  baseUrl: "https://api.fastmail.com",
});

// Option 2: rely on env vars (JMAP_USERNAME, JMAP_PASSWORD, JMAP_BASE_URL)
// or a config file init'd with `jmap-cli init`
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
| `sendEmail({ from, fromName, to, subject, text, attachment? })` | Send an email |
| `searchMessages({ filter, sort?, order? })` | Search messages with JMAP filter conditions |
| `updateMessage({ messageId, update })` | Update keywords, mailbox membership, etc. |
| `moveMessage({ messageId, toMailbox })` | Move a message to another mailbox by name |
| `getMailbox(nameOrRole, createIfNotExist?)` | Look up a mailbox by name or role |
| `listMailboxes()` | Get all mailboxes |
| `createMailbox({ name, parentId? })` | Create a new mailbox |
| `listen({ onMessage?, onEmailState? })` | Listen for real-time changes via EventSource |

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

## OAuth2 Authentication

jmap-cli supports **OAuth2** in addition to the default **Basic Auth**.

### Quick Start — OAuth2 with username/password

The client auto-discovers the token endpoint, performs a password grant, and
handles token refresh automatically:

```typescript
import JmapClient from "jmap-cli";

const client = new JmapClient({
  baseUrl: "https://jmap.example.com",
  authType: "oauth2",          // enable OAuth2 mode
  username: "user@example.com",
  password: "s3cret!",
  // clientId: "custom-app",   // optional, default: "jmap-client"
});

const valid = await client.verifyCredentials();
console.log(valid); // true
```

### Using a pre-existing access token

```typescript
const client = new JmapClient({
  baseUrl: "https://jmap.example.com",
  authType: "oauth2",
  accessToken: "eyJhbGciOi...",   // JWT obtained out-of-band
});
```

### Using a refresh token (auto-refresh enabled by default)

```typescript
const client = new JmapClient({
  baseUrl: "https://jmap.example.com",
  authType: "oauth2",
  refreshToken: "rt_abc123...",
});
```

When the access token expires, the client automatically refreshes it using
the refresh token. If the server responds with `invalid_grant`, the refresh
token is considered revoked and an `OAuthTokenRevoked` error is thrown.

### Configuration via environment variables

```
JMAP_AUTH_TYPE=oauth2
JMAP_ACCESS_TOKEN=eyJhbGciOi...
JMAP_REFRESH_TOKEN=rt_abc123...
JMAP_CLIENT_ID=jmap-client
JMAP_AUTH_TOKEN_ENDPOINT=https://jmap.example.com/auth/token
JMAP_AUTO_REFRESH=true
```

### Migration from Basic Auth to OAuth2

1. Generate OAuth2 credentials (or obtain an access token) for your JMAP
   server.
2. Update your config file at `~/.config/jmap-cli/config`:
   ```
   JMAP_BASE_URL="https://jmap.example.com"
   JMAP_AUTH_TYPE="oauth2"
   JMAP_USERNAME="user@example.com"
   JMAP_PASSWORD="s3cret!"
   ```
3. Remove `JMAP_PASSWORD` after initial token acquisition if you prefer
   refresh-token-only mode.
4. Run `jmap-cli mailboxes` to verify everything works.

### Security warning

**Store refresh tokens securely.** A refresh token grants persistent access
to the mail account. Treat it like a password:

- Do not commit tokens to version control.
- Set `JMAP_PERSIST_TOKENS=true` only in trusted environments.
- Use file permissions (`chmod 600`) on any token files.

### Stalwart-specific notes

| Setting | Default |
|---|---|
| Token endpoint | `https://your-server.com/auth/token` |
| Client ID for trusted apps | `jmap-client` |
| Access token expiry | 1 hour |
| Refresh token expiry | 30 days |
| Refresh token renewal threshold | 4 days (new token issued below this) |

### How token refresh works

1. Before every API request, the client checks if the access token is expired
   (or will expire within 60 seconds).
2. If expired, it calls the token endpoint with `grant_type=refresh_token`.
3. If the refresh succeeds, the new tokens are cached and the original request
   proceeds with the new access token.
4. If the API responds with **401 Unauthorized**, the client refreshes the
   token **once** and retries the request **exactly once**.
5. If the retry also fails with 401, the error is propagated to the caller.
6. If the refresh itself fails with `invalid_grant`, the tokens are cleared
   and an `OAuthTokenRevoked` error is raised — **no automatic retry with
   username/password** (security measure).

### Error handling

```typescript
import JmapClient from "jmap-cli";
import {
  OAuthTokenRevoked,
  OAuthTokenExpired,
  OAuthConfigurationError,
  OAuthDiscoveryFailed,
} from "jmap-cli/errors";

try {
  const client = new JmapClient({ baseUrl: "...", authType: "oauth2" });
  await client.verifyCredentials();
} catch (err) {
  if (err instanceof OAuthTokenRevoked) {
    console.error("Session expired — please re-authenticate.");
  } else if (err instanceof OAuthConfigurationError) {
    console.error("Bad config:", err.message);
  }
}
```

## Configuration

Configuration is stored in `~/.config/jmap-cli/config`. To create or update the configuration, run:

```bash
jmap-cli init
```

## Usage

```bash
jmap-cli <command> [options]
```

### Commands

#### `mailboxes`

Lists the mailboxes in your account.

**Usage:**

```bash
jmap-cli mailboxes [options]
```

**Options:**

*   `-j, --json`: Output mailboxes as JSON
*   `-h, --help`: Show this help message

#### `messages`

Lists the messages in a mailbox.

**Usage:**

```bash
jmap-cli messages [mailbox] [options]
```

**Arguments:**

*   `mailbox`: Mailbox to list messages from (defaults to "Inbox")

**Options:**

*   `-l, --limit <number>`: Number of messages to list (defaults to 10)
*   `-j, --json`: Output messages as JSON
*   `-h, --help`: Show this help message

#### `message`

Fetches a message.

**Usage:**

```bash
jmap-cli message <message-id> [options]
```

**Arguments:**

*   `message-id`: The ID of the message to fetch

**Options:**

*   `-j, --json`: Output message as JSON
*   `-h, --help`: Show this help message

#### `send`

Sends an email.

**Usage:**

```bash
jmap-cli send <to> [options]
```

**Arguments:**

*   `to`: Recipient's email address

**Options:**

*   `--from <email>`: Sender's email address (defaults to MAIL_FROM env var)
*   `--from-name <name>`: Sender's name (defaults to MAIL_FROM_NAME env var)
*   `--subject <subject>`: Email subject
*   `--text <text>`: Email body (reads from stdin if not provided)
*   `--attach <file>`: Attach a file to the email.
*   `-h, --help`: Show this help message

#### `search`

Searches for messages with various criteria.

**Usage:**

```bash
jmap-cli search [options] [freeform_query]
```

**Options:**

*   `--from <string>`: Search by sender email address or name
*   `--to <string>`: Search by recipient email address or name
*   `--subject <string>`: Search by subject
*   `--body <string>`: Search by body content
*   `--before <date>`: Search for messages received before a specific date (YYYY-MM-DD)
*   `--after <date>`: Search for messages received after a specific date (YYYY-MM-DD)
*   `-l, --limit <number>`: Number of messages to list (defaults to 10)
*   `--sort <string>`: Sort by property (e.g., receivedAt, from, to, subject, size)
*   `--order <string>`: Sort order (asc or desc, defaults to desc)
*   `-j, --json`: Output messages as JSON
*   `-h, --help`: Show this help message

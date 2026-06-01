# jmap-cli

A command-line interface for interacting with a JMAP server.

`jmap-cli` can also be used **programmatically as a Node package** with full TypeScript type definitions.

## Installation

For detailed installation and configuration instructions, please see [INSTALL.md](INSTALL.md).

## Quick Start

```bash
# Set your JMAP server and credentials
export JMAP_BASE_URL="https://mail.example.com"
export JMAP_USERNAME="user@example.com"
export JMAP_PASSWORD="s3cret!"

# List your mailboxes
jmap-cli mailboxes
```

If your server supports OAuth2, you can use the interactive device flow instead:

```bash
jmap-cli login
```

## Authentication

jmap-cli supports several authentication strategies, tried in this order:

### 1. Basic Auth (username/password)

Set `JMAP_USERNAME` and `JMAP_PASSWORD` — the credentials are encoded as a
Basic Auth header immediately. No OAuth2 involved, works with any JMAP server.

```bash
export JMAP_BASE_URL="https://mail.example.com"
export JMAP_USERNAME="user@example.com"
export JMAP_PASSWORD="s3cret!"
jmap-cli mailboxes
```

### 2. Impersonation (Stalwart master user)

Access another user's mailbox using the Stalwart master user feature.
The login string is `<target>%<admin>` with the admin's password.

```bash
export JMAP_ADMIN="admin@example.org"
export JMAP_PASSWORD="admin-secret"
jmap impersonate --for john@example.org
```

Or interactively:

```bash
jmap impersonate --for john@example.org
Impersonator email (admin account): admin@example.org
Impersonator password:
```
After impersonation, all subsequent `jmap` commands run as the target user.

### 3. Bearer Token (pre-existing JWT)

Set `JMAP_TOKEN` to any access token you already have:

```bash
export JMAP_TOKEN="eyJhbGciOi..."
jmap-cli mailboxes
```

### 3. Refresh Token

If you have a refresh token, set `JMAP_REFRESH_TOKEN`. The client will
automatically refresh the access token when it expires:

```bash
export JMAP_REFRESH_TOKEN="rt_abc123..."
jmap-cli mailboxes
```

### 4. Device Authorization Grant (interactive login)

Run `jmap login` for an interactive OAuth2 Device Authorization Grant
(RFC 8628) flow:

```bash
jmap-cli login
```

This will:
1. Contact the server's device authorization endpoint
2. Show a URL and code to enter in your browser
3. Wait until you complete the authorization
4. Save the access and refresh tokens to `~/.config/jmap-cli/config`

### Configuration file

The config file is stored at `~/.config/jmap-cli/config` and uses a simple
`KEY="value"` format. You can edit it directly or regenerate it with
`jmap init`.

```
JMAP_BASE_URL="https://mail.example.com"
JMAP_TOKEN="eyJhbGciOi..."
JMAP_REFRESH_TOKEN="rt_abc123..."
```

## Programmatic Usage (as a package)

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
| `sendEmail({ from, fromName, to, subject, text, attachment? })` | Send an email |
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

## CLI Usage

```bash
jmap-cli <command> [options]
```

### Commands

| Command | Description |
|---|---|
| `init` | Initializes the CLI and creates a config file |
| `login` | Interactive OAuth2 Device Authorization Grant login |
| `impersonate` | Access another user's mailbox (Stalwart master user) |
| `mailboxes` | List mailboxes |
| `mailbox` | Create a new mailbox |
| `messages` | List messages in a mailbox |
| `message` | Fetch a single message |
| `send` | Send an email |
| `search` | Search messages |
| `keyword` | Set keywords (seen, answered, flagged…) on a message |
| `move` | Move a message to a different mailbox |
| `listen` | Listen for real-time updates (experimental) |

### `init`

```bash
jmap-cli init [url]
```

Walks through server URL, credentials, and sending prerequisites interactively.
Writes everything to `~/.config/jmap-cli/config`.

### `login`

```bash
jmap-cli login [options]
```

Interactive OAuth2 Device Authorization Grant (RFC 8628) flow.
Displays a URL and code — open the URL in your browser, enter the code,
and the CLI saves the resulting tokens to your config file.

### `impersonate`

```bash
jmap-cli impersonate --for <target-email> [options]
```

Access another user's mailbox using Stalwart's master user feature.
The login string is `<target>%<admin>` — the admin password is used for
authentication.

**Options:**
- `--for <email>`: Target mailbox to access **(required)**

**Environment variables:**
- `JMAP_ADMIN`: Admin email (prompted if not set)
- `JMAP_PASSWORD`: Admin password (prompted if not set)

**Examples:**

```bash
# Interactive
jmap impersonate --for john@example.org

# Non-interactive
export JMAP_ADMIN="admin@example.org"
export JMAP_PASSWORD="admin-secret"
jmap impersonate --for john@example.org
```

After running, all subsequent `jmap` commands operate on the target
user's mailbox.

### `mailboxes`

```bash
jmap-cli mailboxes [options]
```

**Options:**
- `-j, --json`: Output as JSON

### `messages`

```bash
jmap-cli messages [mailbox] [options]
```

**Options:**
- `-l, --limit <n>`: Number of messages (default: 10)
- `--sort <prop>`: Sort property (receivedAt, from, to, subject, size)
- `--order <asc|desc>`: Sort order (default: desc)
- `--read[=true|false]`, `--answered[=true|false]`, `--starred[=true|false]`,
  `--junk[=true|false]`, `--draft[=true|false]`: Filter by keyword
- `-j, --json`: Output as JSON

### `message`

```bash
jmap-cli message <message-id> [options]
```

**Options:**
- `-j, --json`: Output as JSON

### `send`

```bash
jmap-cli send <to> [options]
```

**Options:**
- `--from <email>`: Sender address
- `--from-name <name>`: Sender display name
- `--subject <text>`: Email subject
- `--text <text>`: Email body (reads from stdin if not provided)
- `--attach <file>`: Attach a file

### `search`

```bash
jmap-cli search [options] [freeform_query]
```

**Options:**
- `--from <string>`, `--to <string>`, `--subject <string>`, `--body <string>`:
  Filter by field
- `--before <date>`, `--after <date>`: Filter by date (YYYY-MM-DD)
- `-l, --limit <n>`: Number of messages (default: 10)
- `--sort <prop>`, `--order <asc|desc>`: Sort control
- `-j, --json`: Output as JSON

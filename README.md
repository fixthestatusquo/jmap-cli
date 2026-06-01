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

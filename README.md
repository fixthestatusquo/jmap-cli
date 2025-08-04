# jmap-cli

A command-line interface for interacting with a JMAP server.

## Installation

For detailed installation and configuration instructions, please see [INSTALL.md](INSTALL.md).

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

*   `--from <email>`: Sender's email address (defaults to EMAIL_FROM env var)
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

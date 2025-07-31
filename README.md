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
jmap-cli send [options]
```

**Options:**

*   `--from <email>`: Sender's email address (defaults to EMAIL_FROM env var)
*   `--from-name <name>`: Sender's name
*   `--to <email>`: Recipient's email address
*   `--subject <subject>`: Email subject
*   `--text <text>`: Email body (reads from stdin if not provided)
*   `-h, --help`: Show this help message

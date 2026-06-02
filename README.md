# jmap-cli

A command-line interface for interacting with a JMAP server.

`jmap-cli` can also be used **programmatically from the browser or as a Node o package** — see [API.md](API.md) for the full API reference.


## Installation

For detailed installation and configuration instructions, please see [INSTALL.md](INSTALL.md).

## Quick Start

If your server supports oAuth2:

```bash
# Set your JMAP server and credentials
jmap-cli init [url of your mail server]
jmap-cli login
# List your mailboxes
jmap-cli mailboxes
```

## Authentication

jmap-cli supports several authentication strategies

### 1. Basic Auth (username/password)

Set `JMAP_USERNAME` and `JMAP_PASSWORD` — the credentials are encoded as a
Basic Auth header immediately. No OAuth2 involved, works with any JMAP server.

```bash
export JMAP_BASE_URL="https://mail.example.com"
export JMAP_USERNAME="user@example.com"
export JMAP_PASSWORD="s3cret!"
jmap-cli mailboxes
```

### 2. Impersonation (Stalwart admin user)

Access another user's mailbox using the [Stalwart impersonation permission](https://stalw.art/docs/auth/authorization/administrator/#impersonation) feature.

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

This tokens are short lived, you should also set the refresh token to automatically refresh the access token when it expires:

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

## CLI Usage

```bash
jmap-cli <command> [options]
```

### Commands

| Command | Description |
|---|---|
| `init` | Set up server URL and optionally log in via OAuth2 device flow |
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

Prompts for a JMAP server URL and offers to start the OAuth2 device login flow.
Saves configuration to `~/.config/jmap-cli/config`.

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

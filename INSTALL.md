# Installation

Follow these steps to install and configure jmap-cli.

## Prerequisites

### 1. Create an App Password in Stalwart

Before you can use `jmap-cli`, you need to create an app password in your Stalwart Mail account. This is more secure than using your main password.

1.  **Log in to the Stalwart self-service portal.**
2.  Navigate to the **App Passwords** section in the menu.
3.  Generate a new app password for `jmap-cli`.
4.  Copy the generated password to a safe place. You will need it to configure `jmap-cli`.

## 2. Install jmap-cli

You can install `jmap-cli` globally using npm:

```bash
npm install -g .
```

## 3. Configure jmap-cli

After installation, you need to configure `jmap-cli` with your JMAP server URL.

Run the following command and follow the prompts:

```bash
jmap-cli init
```

This will ask for your JMAP server URL. After saving it, `init` will offer to
start the interactive OAuth2 Device Authorization Grant (RFC 8628) login flow,
which opens your browser to authorize `jmap-cli` and saves the resulting tokens
to `~/.config/jmap-cli/config`.

You can also run the login step separately at any time:

```bash
jmap-cli login
```

Once configured, the config file is used transparently for all future commands.

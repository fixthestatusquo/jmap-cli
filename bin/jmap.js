#!/usr/bin/env node

import "../lib/config.js";

// ---------------------------------------------------------------------------
// Token bootstrap
//
// Checks that credentials are available.  The actual authentication
// (Basic Auth encoding, OAuth2, etc.) is handled by the JmapClient
// constructor and TokenManager — this just validates that *something*
// is configured so we can give a helpful error early.
//
// Recognised credential patterns (via env / config file):
//   1. JMAP_TOKEN — Bearer or Basic token, used as-is
//   2. JMAP_REFRESH_TOKEN — OAuth2 refresh, handled lazily by TokenManager
//   3. JMAP_LOGIN + JMAP_PASSWORD [ + JMAP_IMPERSONATE ] — Basic Auth
//   4. JMAP_USERNAME + JMAP_PASSWORD — legacy Basic Auth (pre-encodes for compat)
//   5. Nothing → error
// ---------------------------------------------------------------------------

async function bootstrapToken() {
  if (process.env.JMAP_TOKEN) return;
  if (process.env.JMAP_REFRESH_TOKEN) return;

  // New-style Basic Auth with optional impersonation
  const login = process.env.JMAP_LOGIN;
  const password = process.env.JMAP_PASSWORD;
  if (login && password) return;

  // Legacy JMAP_USERNAME + JMAP_PASSWORD — pre-encode into JMAP_TOKEN
  // so that getClientOptions() sees a token.  (The constructor also
  // handles login+password directly, but this keeps the legacy env
  // pattern working through the JMAP_TOKEN code path.)
  const username = process.env.JMAP_USERNAME;
  if (username && password) {
    const basic = Buffer.from(`${username}:${password}`).toString("base64");
    process.env.JMAP_TOKEN = `Basic ${basic}`;
    return;
  }

  console.error(
    "Missing configuration. Options:\n" +
      "  - Set JMAP_TOKEN (Bearer or Basic token)\n" +
      "  - Set JMAP_LOGIN + JMAP_PASSWORD (Basic Auth)\n" +
      "  - Set JMAP_USERNAME + JMAP_PASSWORD (legacy Basic Auth)\n" +
      "  - Run `jmap login` (interactive OAuth2 device flow)",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------

const commands = {
  init: {
    file: "./init.js",
    description: "Initializes the CLI and creates a .env file",
  },
  login: {
    file: "./login.js",
    description: "Interactive OAuth2 Device Authorization Grant login",
  },
  impersonate: {
    file: "./impersonate.js",
    description: "Access another user's mailbox (Stalwart master user)",
  },
  mailboxes: {
    file: "./mailboxes.js",
    description: "Lists the mailboxes in your account",
  },
  mailbox: {
    file: "./mailbox.js",
    description: "Creates a new mailbox",
  },
  messages: {
    file: "./messages.js",
    description: "Lists the messages in a mailbox",
  },
  message: {
    file: "./message.js",
    description: "Fetches a message",
  },
  send: {
    file: "./send.js",
    description: "Sends an email",
  },
  listen: {
    file: "./listen.js",
    description: "WIP Listen for real-time updates",
  },
  keyword: {
    file: "./keyword.js",
    description: "Set keywords (seen, answered…) on a message",
  },
  move: {
    file: "./move.js",
    description: "Move a message to a different mailbox",
  },
  search: {
    file: "./search.js",
    description: "Search for messages with various criteria",
  },
  help: { file: null, description: "Show this help message" },
};

const help = `
Usage: jmap <command> [options]

Commands:
${Object.entries(commands)
  .map(([cmd, { description }]) => `  ${cmd.padEnd(22)}${description}`)
  .join("\n")}
`;

(async () => {
  try {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!commands[command] || command === "help") {
      console.log(help);
      process.exit(command && command !== "help" ? 1 : 0);
    }

    // Bootstrap token before running commands (except auth-related commands)
    if (command !== "init" && command !== "login" && command !== "impersonate") {
      await bootstrapToken();
    }

    const commandModule = await import(commands[command].file);
    await commandModule.main(args.slice(1));
  } catch (e) {
    console.error(e.toString?.() || e);
    process.exit(1);
  }
})();

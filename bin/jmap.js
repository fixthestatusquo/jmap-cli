#!/usr/bin/env node

import minimist from "minimist";
import "../lib/config.js";

// ---------------------------------------------------------------------------
// Token bootstrap
//
// Priority:
//   1. JMAP_TOKEN is set → use as-is (Bearer JWT or Basic base64)
//   2. JMAP_REFRESH_TOKEN is set → will be used by TokenManager on demand
//   3. JMAP_USERNAME + JMAP_PASSWORD → Basic Auth (no OAuth2 attempt)
//   4. Nothing → error (run `jmap login` or configure credentials)
// ---------------------------------------------------------------------------

async function bootstrapToken() {
  if (process.env.JMAP_TOKEN) return;

  // If we have a refresh token, let TokenManager handle it lazily
  if (process.env.JMAP_REFRESH_TOKEN) return;

  const username = process.env.JMAP_USERNAME;
  const password = process.env.JMAP_PASSWORD;

  if (username && password) {
    // Basic Auth — encode immediately, no OAuth2 attempt
    const basic = Buffer.from(`${username}:${password}`).toString("base64");
    process.env.JMAP_TOKEN = `Basic ${basic}`;
    return;
  }

  console.error(
    "Missing configuration. Options:\n" +
      "  - Set JMAP_TOKEN (Bearer or Basic token)\n" +
      "  - Set JMAP_USERNAME + JMAP_PASSWORD (Basic Auth)\n" +
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

    // Bootstrap token before running commands (except init and login)
    if (command !== "init" && command !== "login") {
      await bootstrapToken();
    }

    const commandModule = await import(commands[command].file);
    await commandModule.main(args.slice(1));
  } catch (e) {
    console.error(e.toString?.() || e);
    process.exit(1);
  }
})();

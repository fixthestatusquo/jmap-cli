#!/usr/bin/env node

import minimist from "minimist";
import "../lib/config.js";

// ---------------------------------------------------------------------------
// Token bootstrap: if JMAP_TOKEN is not set but username/password are,
// perform an OAuth2 password grant to obtain tokens and populate env vars.
// This way all sub-commands just see JMAP_TOKEN / JMAP_REFRESH_TOKEN.
// ---------------------------------------------------------------------------

async function bootstrapToken() {
  // Already have a token? Nothing to do.
  if (process.env.JMAP_TOKEN) return;

  const baseUrl = process.env.JMAP_BASE_URL;
  const username = process.env.JMAP_USERNAME;
  const password = process.env.JMAP_PASSWORD;

  if (!baseUrl || !username || !password) {
    console.error(
      "Missing configuration. Set JMAP_BASE_URL and JMAP_TOKEN, or JMAP_USERNAME + JMAP_PASSWORD.",
    );
    process.exit(1);
  }

  // Discover the token endpoint
  let tokenEndpoint = process.env.JMAP_AUTH_TOKEN_ENDPOINT;
  if (!tokenEndpoint) {
    try {
      const sessionRes = await fetch(
        `${baseUrl.replace(/\/+$/, "")}/.well-known/jmap`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
      );
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        tokenEndpoint =
          session.oAuthTokenEndpoint || session.authTokenEndpoint;
      }
    } catch {
      // fall through
    }
    if (!tokenEndpoint) {
      tokenEndpoint = `${baseUrl.replace(/\/+$/, "")}/auth/token`;
    }
  }

  const clientId = process.env.JMAP_CLIENT_ID || "jmap-client";

  console.error("Authenticating…");

  // Build form-urlencoded body
  const formBody = new URLSearchParams();
  formBody.set("grant_type", "password");
  formBody.set("username", username);
  formBody.set("password", password);
  formBody.set("client_id", clientId);

  // Try form-urlencoded first (OAuth2 standard), fall back to JSON
  let res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: formBody.toString(),
  });

  // Some servers (e.g. Stalwart) also accept JSON
  if (!res.ok && res.status === 400) {
    const jsonBody = JSON.stringify({
      grant_type: "password",
      username,
      password,
      client_id: clientId,
    });
    res = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: jsonBody,
    });
  }

  if (!res.ok) {
    // OAuth2 failed — fall back to Basic Auth with username/password
    const basic = Buffer.from(`${username}:${password}`).toString("base64");
    process.env.JMAP_TOKEN = `Basic ${basic}`;
    console.error("Using Basic Auth.");
    return;
  }

  const data = await res.json();
  process.env.JMAP_TOKEN = data.access_token;
  if (data.refresh_token) {
    process.env.JMAP_REFRESH_TOKEN = data.refresh_token;
  }
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------

const commands = {
  init: {
    file: "./init.js",
    description: "Initializes the CLI and creates a .env file",
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

    // Bootstrap token before running any command (except init)
    if (command !== "init") {
      await bootstrapToken();
    }

    const commandModule = await import(commands[command].file);
    await commandModule.main(args.slice(1));
  } catch (e) {
    console.error(e.toString?.() || e);
    process.exit(1);
  }
})();

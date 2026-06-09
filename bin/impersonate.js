#!/usr/bin/env node

// ---------------------------------------------------------------------------
// jmap impersonate — Stalwart Master User (impersonation) login
//
// Accesses another user's mailbox using the composite login format:
//   <target>%<impersonator>
//
// The impersonator account must have the "impersonate" permission.
// Password used is the impersonator's password.
//
// Sets JMAP_LOGIN, JMAP_PASSWORD, and JMAP_IMPERSONATE environment variables.
// The JmapClient constructor composes the Stalwart login and uses Basic Auth.
// ---------------------------------------------------------------------------

import minimist from "minimist";
import "../lib/config.js";
import path from "path";
import fs from "fs/promises";
import os from "os";
import readline from "readline";
import { fileURLToPath } from "url";

const minimistOptions = {
  string: ["for"],
  boolean: ["help"],
  alias: { h: "help" },
};

const help = `
Usage: jmap impersonate --for <target-email> [options]

Logs in as an administrator to access another user's mailbox using
Stalwart's Master User (impersonation) feature.

The login string is constructed as: <target>%<impersonator>
The password used is the impersonator's password.

Required:
  --for <email>       The target mailbox to access (e.g., john@example.org)

Options:
  -h, --help          Show this help message

Environment variables:
  JMAP_ADMIN         The administrator email with impersonate permission
  JMAP_PASSWORD       The administrator's password
  JMAP_BASE_URL       JMAP server base URL

Examples:
  jmap impersonate --for john@example.org
  jmap impersonate --for john@example.org  (prompts for impersonator creds)

  # With env vars set:
  export JMAP_ADMIN="admin@example.org"
  export JMAP_PASSWORD="admin-secret"
  jmap impersonate --for john@example.org

On success, JMAP_LOGIN, JMAP_PASSWORD, and JMAP_IMPERSONATE are set in the
session and optionally written to the config file at ~/.config/jmap-cli/config.
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function questionSilent(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(argv) {
  const args = minimist(argv, minimistOptions);

  if (args.help) {
    console.log(help);
    return;
  }

  const targetEmail = args["for"];
  if (!targetEmail) {
    console.error("Error: --for <target-email> is required.");
    console.error("Usage: jmap impersonate --for user@example.org");
    process.exit(1);
  }

  if (!process.env.JMAP_BASE_URL) {
    console.error(
      "Error: JMAP_BASE_URL is not set. Configure it first with `jmap init` or export it.",
    );
    process.exit(1);
  }

  // Get impersonator credentials
  // Prefer JMAP_LOGIN (saved by a previous impersonate run), then JMAP_USERNAME, then JMAP_ADMIN
  let impersonator = process.env.JMAP_LOGIN || process.env.JMAP_USERNAME || process.env.JMAP_ADMIN;
  // Password only comes from JMAP_PASSWORD (the config file)
  let password = process.env.JMAP_PASSWORD;

  if (!impersonator) {
    impersonator = await question("Impersonator email (admin account): ");
  }
  if (!password) {
    password = await questionSilent("Impersonator password: ");
    console.log("");
  }

  if (!impersonator || !password) {
    console.error("Error: Impersonator email and password are required.");
    process.exit(1);
  }

  // Set env vars that getClientOptions() will pick up.
  // The JmapClient constructor handles composing the Stalwart login
  // and setting up Basic Auth when impersonate is provided.
  process.env.JMAP_LOGIN = impersonator;
  process.env.JMAP_PASSWORD = password;
  process.env.JMAP_IMPERSONATE = targetEmail;

  console.log(`\n✓ Impersonating ${targetEmail} (as ${impersonator})`);

  // Write to config file if user wants
  const configDir = path.join(os.homedir(), ".config", "jmap-cli");
  const configPath = path.join(configDir, "config");

  const answer = await question(`Save this session to ${configPath}? [Y/n] `);
  const save = answer.toLowerCase() !== "n" && answer !== "no";

  if (save) {
    // Read existing config to preserve other settings
    let existing = {};
    try {
      const content = await fs.readFile(configPath, "utf-8");
      content.split("\n").forEach((line) => {
        const idx = line.indexOf("=");
        if (idx > 0) {
          const key = line.slice(0, idx).trim();
          const val = line
            .slice(idx + 1)
            .replace(/^"|"$/g, "")
            .trim();
          if (key) existing[key] = val;
        }
      });
    } catch {
      // File doesn't exist yet
    }

    // Update with impersonation settings (preserve existing baseUrl)
    existing.JMAP_BASE_URL =
      existing.JMAP_BASE_URL || process.env.JMAP_BASE_URL;
    existing.JMAP_LOGIN = impersonator;
    existing.JMAP_PASSWORD = password;
    existing.JMAP_IMPERSONATE = targetEmail;
    // Remove any stale OAuth2 / Basic Auth token
    delete existing.JMAP_TOKEN;
    delete existing.JMAP_REFRESH_TOKEN;

    const lines = Object.entries(existing).map(
      ([key, val]) => `${key}="${val}"`,
    );

    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, lines.join("\n") + "\n");

    console.log(`Session saved to ${configPath}`);
  } else {
    console.log("Session active for this command only.");
  }

  console.log(`\nYou can now run jmap-cli commands for ${targetEmail}.`);
}

if (
  import.meta.url.startsWith("file:") &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2));
}

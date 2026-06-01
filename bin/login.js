#!/usr/bin/env node

// ---------------------------------------------------------------------------
// jmap login — Device Authorization Grant (RFC 8628)
//
// Interactive OAuth2 login flow for CLI users.
// Shows a URL, prompts to press Enter to open it in the browser,
// polls until authorized, then saves tokens to the config file.
// ---------------------------------------------------------------------------

import minimist from "minimist";
import "../lib/config.js";
import { TokenManager } from "../lib/oauth.js";
import path from "path";
import fs from "fs/promises";
import os from "os";
import readline from "readline";
import { exec } from "child_process";
import { fileURLToPath } from "url";

const minimistOptions = {
  boolean: ["help"],
  alias: { h: "help" },
};

const help = `
Usage: jmap login [options]

Initiates the OAuth2 Device Authorization Grant (RFC 8628) flow.

You will be shown a URL. Press Enter to open it in your browser,
authorize the application, and the CLI will save the resulting tokens.

Options:
  --client-id <id>   OAuth2 client ID (default: "jmap-client")
  -h, --help         Show this help message

Environment variables:
  JMAP_BASE_URL               Required — the JMAP server URL
  JMAP_CLIENT_ID              OAuth2 client ID (default: "jmap-client")
  JMAP_AUTH_TOKEN_ENDPOINT    Explicit token endpoint
  JMAP_AUTH_DEVICE_ENDPOINT   Explicit device authorization endpoint

On success, tokens are written to the config file at
~/.config/jmap-cli/config and set in the current session.
`;

// ---------------------------------------------------------------------------
// Open URL in the default browser (cross-platform)
// ---------------------------------------------------------------------------

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  return new Promise((resolve, reject) => {
    exec(cmd, (error) => {
      if (error) {
        // Non-fatal — user can still open the URL manually
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Prompt for Enter key
// ---------------------------------------------------------------------------

function pressEnterToContinue(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(promptText, () => {
      rl.close();
      resolve();
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

  if (!process.env.JMAP_BASE_URL) {
    console.error(
      "Error: JMAP_BASE_URL is not set. Configure it first with `jmap init` or export it.",
    );
    process.exit(1);
  }

  const tm = new TokenManager({
    baseUrl: process.env.JMAP_BASE_URL,
    clientId: args["client-id"] || process.env.JMAP_CLIENT_ID,
    tokenEndpoint: process.env.JMAP_AUTH_TOKEN_ENDPOINT,
    deviceEndpoint: process.env.JMAP_AUTH_DEVICE_ENDPOINT,
  });

  try {
    // deviceLogin will call onInstruction with the URL + code, then poll.
    // We pass an async callback that prompts + opens the browser.
    const token = await tm.deviceLogin({
      onInstruction: async ({ userCode, verificationUri }) => {
        console.log("");
        console.log("╔══════════════════════════════════════════════════╗");
        console.log("║         Device Authorization Required           ║");
        console.log("╠══════════════════════════════════════════════════╣");
        console.log("║                                                  ");
        console.log(`║  Code:  ${userCode}`);
        console.log("║                                                  ");
        console.log("║  The CLI will open your browser so you can       ");
        console.log("║  authorize this application.                     ");
        console.log("╚══════════════════════════════════════════════════╝");
        console.log("");

        await pressEnterToContinue("Press Enter to open in your browser… ");

        const opened = await openBrowser(verificationUri);
        if (!opened) {
          console.log(`\nPlease open this URL manually:\n  ${verificationUri}\n`);
        }
        console.log("Waiting for authorization…");
      },
    });

    console.log("\n✓ Authorization successful!");

    // Build env output
    const lines = [
      `JMAP_BASE_URL="${process.env.JMAP_BASE_URL}"`,
      `JMAP_TOKEN="${token}"`,
    ];
    if (tm.getRefreshToken()) {
      lines.push(`JMAP_REFRESH_TOKEN="${tm.getRefreshToken()}"`);
    }

    // Write to config file
    const configDir = path.join(os.homedir(), ".config", "jmap-cli");
    const configPath = path.join(configDir, "config");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, lines.join("\n") + "\n");

    console.log(`\nTokens saved to ${configPath}`);
    console.log("You can now use jmap-cli commands.");
  } catch (err) {
    console.error(`\nLogin failed: ${err.message}`);
    process.exit(1);
  }
}

if (
  import.meta.url.startsWith("file:") &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2));
}

#!/usr/bin/env node
import minimist from "minimist";
import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";
import { JmapClient } from "../lib/jmap.js";
import { getClientOptions } from "../lib/config.js";

const minimistOptions = {
  boolean: ["help", "session"],
  alias: { h: "help", s: "session" },
};

const help = `
Usage: jmap whoami [options]

Shows the current authenticated identity and configuration.

Options:
  -s, --session   Connect to the server and show JMAP session details as well
  -h, --help      Show this help message
`;

export async function main(argv) {
  const args = minimist(argv, minimistOptions);

  if (args.help) {
    console.log(help);
    process.exit(0);
  }

  const env = process.env || {};
  const configPath = path.join(os.homedir(), ".config", "jmap-cli", "config");

  // ── Config file ──────────────────────────────────────────────────
  console.log("Config file:");
  console.log(`  Path:   ${configPath}`);
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (lines.length > 0) {
      const sensitiveKeys = ["JMAP_PASSWORD", "JMAP_PASSORD", "JMAP_TOKEN", "JMAP_REFRESH_TOKEN"];
      console.log("  Contents:");
      for (const line of lines) {
        const eqIdx = line.indexOf("=");
        if (eqIdx !== -1) {
          const key = line.slice(0, eqIdx).trim();
          if (sensitiveKeys.includes(key)) {
            console.log(`    ${key}=●●●●●● (set)`);
            continue;
          }
        }
        console.log(`    ${line}`);
      }
    } else {
      console.log("  (file exists but no active entries)");
    }
  } catch {
    console.log("  (file not found)");
  }

  // ── Effective environment ────────────────────────────────────────
  console.log("\nEffective environment:\n");

  const identityVars = [
    "JMAP_BASE_URL",
    "JMAP_LOGIN",
    "JMAP_USERNAME",
    "JMAP_ADMIN",
    "JMAP_PASSWORD",
    "JMAP_IMPERSONATE",
    "JMAP_TOKEN",
    "JMAP_REFRESH_TOKEN",
    "JMAP_CLIENT_ID",
    "JMAP_PASSORD",
    "MAIL_FROM",
    "MAIL_FROM_NAME",
    "JMAP_IDENTITY_EMAIL",
  ];

  for (const key of identityVars) {
    const val = env[key];
    // Mask passwords and tokens for safety
    if (key === "JMAP_PASSWORD" || key === "JMAP_TOKEN") {
      console.log(`  ${key.padEnd(22)} ${val ? "●●●●●● (set)" : "(not set)"}`);
    } else if (val) {
      console.log(`  ${key.padEnd(22)} ${val}`);
    } else {
      console.log(`  ${key.padEnd(22)} (not set)`);
    }
  }

  console.log("");

  // ── Derived info ─────────────────────────────────────────────────
  const hasToken = env.JMAP_TOKEN;
  const hasRefresh = env.JMAP_REFRESH_TOKEN;
  const hasLogin = env.JMAP_LOGIN && env.JMAP_PASSWORD;
  const hasLegacy = env.JMAP_USERNAME && env.JMAP_PASSWORD;

  let authMethod = "(none)";
  if (hasToken) {
    authMethod = env.JMAP_TOKEN.startsWith("Basic ") ? "Basic Auth (JMAP_TOKEN)" : "Bearer Token (JMAP_TOKEN)";
  } else if (hasRefresh) {
    authMethod = "OAuth2 (JMAP_REFRESH_TOKEN)";
  } else if (hasLogin) {
    authMethod = "Basic Auth (JMAP_LOGIN + JMAP_PASSWORD)";
  } else if (hasLegacy) {
    authMethod = "Basic Auth (JMAP_USERNAME + JMAP_PASSWORD)";
  }
  console.log(`  Auth method:     ${authMethod}`);

  if (env.JMAP_LOGIN || env.JMAP_USERNAME || env.JMAP_ADMIN) {
    const login = env.JMAP_LOGIN || env.JMAP_USERNAME || env.JMAP_ADMIN;
    console.log(`  Auth identity:   ${login}`);
  }

  if (env.JMAP_IMPERSONATE) {
    const composite = `${env.JMAP_IMPERSONATE}%${env.JMAP_LOGIN || env.JMAP_USERNAME || env.JMAP_ADMIN || "?"}`;
    console.log(`  Impersonating:   ${env.JMAP_IMPERSONATE}`);
    console.log(`  Composite login: ${composite}`);
  }

  // ── Server session ────────────────────────────────────────────────
  if (args.session) {
    if (!env.JMAP_BASE_URL) {
      console.log("\n✗ Cannot connect — no server URL configured.");
      return;
    }

    try {
      const client = new JmapClient(getClientOptions());
      const session = await client._discoverSession();

      console.log("\n── JMAP Session ──\n");

      if (session.username) {
        console.log(`  Session username: ${session.username}`);
      }

      const mailAccountId = session.primaryAccounts?.["urn:ietf:params:jmap:mail"];
      if (mailAccountId && session.accounts?.[mailAccountId]) {
        const acct = session.accounts[mailAccountId];
        console.log(`  Account name:    ${acct.name || "(unnamed)"}`);
        if (acct.email) console.log(`  Account email:   ${acct.email}`);
        console.log(`  Read-only:       ${acct.isReadOnly ? "yes" : "no"}`);
      }

      if (session.accounts) {
        const entries = Object.entries(session.accounts);
        if (entries.length > 1) {
          console.log(`\n  All accounts (${entries.length}):`);
          for (const [id, acct] of entries) {
            const primary = id === mailAccountId ? " (primary)" : "";
            console.log(`    - ${acct.name || id}${primary}`);
          }
        }
      }

      console.log(`\n  API URL:  ${session.apiUrl}`);
      console.log(`  State:    ${session.state}`);
    } catch (err) {
      console.error(`\n✗ Failed to fetch session: ${err.message || err}`);
    }
  }
}

if (
  import.meta.url.startsWith("file:") &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2));
}

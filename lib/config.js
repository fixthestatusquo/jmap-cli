import { readFileSync } from "fs";
import path from "path";
import os from "os";

const homeDir = os.homedir();
const configPath = path.join(homeDir, ".config", "jmap-cli", "config");

try {
  const text = readFileSync(configPath, "utf-8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trimEnd();
    let value = trimmed.slice(eqIdx + 1).trimStart();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
} catch {
  console.warn("missing config, run `jmap-cli init` first");
}

// Supported environment variables:
//
// Required:
//   JMAP_BASE_URL            – JMAP server base URL
//
// Authentication (pick one):
//   JMAP_TOKEN               – OAuth2 Bearer token or "Basic base64..."
//   JMAP_USERNAME + JMAP_PASSWORD – Basic Auth (used directly, no OAuth2)
//   (run `jmap login` for interactive OAuth2 Device Authorization Grant)
//
// Optional OAuth2:
//   JMAP_REFRESH_TOKEN       – OAuth2 refresh token (auto-used on expiry)
//   JMAP_CLIENT_ID           – OAuth2 client ID (default: "jmap-client")
//   JMAP_AUTH_TOKEN_ENDPOINT – Explicit token endpoint
//   JMAP_AUTH_DEVICE_ENDPOINT – Explicit device authorization endpoint
//
// Impersonation (Stalwart Master User):
//   JMAP_LOGIN               – Admin / impersonator username
//   JMAP_PASSWORD            – Admin / impersonator password
//   JMAP_IMPERSONATE         – Target mailbox email to impersonate
//
// Sending:
//   MAIL_FROM                – Default From address
//   MAIL_FROM_NAME           – Default From display name
//   JMAP_SENT_MAILBOX_ID     – Cached outbox mailbox ID
//   JMAP_IDENTITY_ID         – Cached identity ID
//   JMAP_IDENTITY_EMAIL      – Cached identity email

/**
 * Build a JmapClient constructor options object from environment variables.
 *
 * Call this from CLI commands to translate process.env (already populated
 * by this module's side-effect config-file load) into the explicit options
 * that the JmapClient constructor expects.
 *
 * @returns {object}  Options suitable for `new JmapClient(...)`
 */
export function getClientOptions() {
  const env =
    typeof process !== "undefined" && process.env ? process.env : {};

  return {
    login:        env.JMAP_LOGIN || env.JMAP_USERNAME || env.JMAP_ADMIN,
    password:     env.JMAP_PASSWORD,
    impersonate:  env.JMAP_IMPERSONATE,
    baseUrl:      env.JMAP_BASE_URL,
    token:        env.JMAP_TOKEN,
    refreshToken: env.JMAP_REFRESH_TOKEN,
    clientId:     env.JMAP_CLIENT_ID,
    tokenEndpoint: env.JMAP_AUTH_TOKEN_ENDPOINT,
  };
}

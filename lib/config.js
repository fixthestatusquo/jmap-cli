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
// Sending:
//   MAIL_FROM                – Default From address
//   MAIL_FROM_NAME           – Default From display name
//   JMAP_SENT_MAILBOX_ID     – Cached outbox mailbox ID
//   JMAP_IDENTITY_ID         – Cached identity ID
//   JMAP_IDENTITY_EMAIL      – Cached identity email

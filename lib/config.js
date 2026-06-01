import dotenv from "dotenv";
import path from "path";
import os from "os";

const homeDir = os.homedir();
const configPath = path.join(homeDir, ".config", "jmap-cli", "config");

const config = dotenv.config({ path: configPath });

if (config.error) {
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

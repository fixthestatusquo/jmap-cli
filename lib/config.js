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
//   JMAP_BASE_URL           – JMAP server base URL
//
// Authentication (pick one strategy):
//   JMAP_TOKEN              – OAuth2 access token (JWT)
//   JMAP_USERNAME           – JMAP username   \
//   JMAP_PASSWORD           – JMAP password    / → auto-login on first use
//
// Optional:
//   JMAP_REFRESH_TOKEN      – OAuth2 refresh token (auto-populated on login)
//   JMAP_CLIENT_ID          – OAuth2 client ID (default: "jmap-client")
//   JMAP_AUTH_TOKEN_ENDPOINT – Explicit OAuth2 token endpoint
//
// Sending:
//   MAIL_FROM               – Default From address
//   MAIL_FROM_NAME          – Default From display name
//   JMAP_SENT_MAILBOX_ID    – Cached outbox mailbox ID
//   JMAP_IDENTITY_ID        – Cached identity ID
//   JMAP_IDENTITY_EMAIL     – Cached identity email

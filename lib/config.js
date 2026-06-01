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
//   JMAP_BASE_URL           – JMAP server base URL (required)
//   JMAP_USERNAME           – JMAP username / email (required for Basic Auth)
//   JMAP_PASSWORD           – JMAP password (required for Basic Auth)
//
//   JMAP_AUTH_TYPE          – "basic" (default) or "oauth2"
//   JMAP_ACCESS_TOKEN       – Pre-existing OAuth2 access token (JWT)
//   JMAP_REFRESH_TOKEN      – Pre-existing OAuth2 refresh token
//   JMAP_CLIENT_ID          – OAuth2 client ID (default: "jmap-client")
//   JMAP_AUTH_TOKEN_ENDPOINT – Explicit OAuth2 token endpoint
//   JMAP_AUTO_REFRESH       – Auto-refresh tokens (default: true)
//   JMAP_PERSIST_TOKENS     – Persist tokens to .jmap-token.json (default: false)
//
//   MAIL_FROM               – Default From address for sending
//   MAIL_FROM_NAME          – Default From display name
//   JMAP_SENT_MAILBOX_ID    – Cached outbox mailbox ID
//   JMAP_IDENTITY_ID        – Cached identity ID
//   JMAP_IDENTITY_EMAIL     – Cached identity email

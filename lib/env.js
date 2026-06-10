// ---------------------------------------------------------------------------
// jmap-cli — Simple .env file parser (replaces dotenv dependency)
// ---------------------------------------------------------------------------
// Loaded lazily so browser bundlers don't fail on the fs import.
// ---------------------------------------------------------------------------

/** @type {((filePath: string) => void) | undefined} */
let _loadEnvFile;
try {
  const _fs = await import("fs");
  _loadEnvFile = (filePath) => {
    try {
      const text = _fs.readFileSync(filePath, "utf-8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trimEnd();
        let value = trimmed.slice(eqIdx + 1).trimStart();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    } catch {
      // file not found or not readable
    }
  };
} catch {
  // fs not available (e.g. browser) — .env file loading skipped
}

/**
 * Load a .env-style file into process.env.
 *
 * Parses `KEY=VALUE` lines (supports single/double-quoted values,
 * comments with `#`, and blank lines).  Silently ignores missing
 * or unreadable files.
 *
 * @param {string} filePath  Path to the .env file to load
 */
export function loadEnvFile(filePath) {
  if (_loadEnvFile) {
    _loadEnvFile(filePath);
  }
}

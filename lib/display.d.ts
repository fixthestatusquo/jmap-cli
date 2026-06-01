// ---------------------------------------------------------------------------
// Display / formatting type declarations
// ---------------------------------------------------------------------------

import { JmapMessage } from "./jmap.js";

/**
 * Format a list of JMAP messages and print them to stdout.
 *
 * When `jsonOutput` is `true`, messages are printed as a JSON array.
 * Otherwise, each message is printed as human-readable key-value pairs
 * separated by "---".
 */
export function formatAndDisplayMessages(
  messages: JmapMessage[],
  jsonOutput: boolean,
): void;

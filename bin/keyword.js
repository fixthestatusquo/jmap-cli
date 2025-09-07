#!/usr/bin/env node
import minimist from 'minimist';
import { JmapClient } from '../lib/jmap.js';
import '../lib/config.js';

const minimistOptions = {
  boolean: ['help', 'read', 'answered', 'starred', 'junk', 'draft'],
  string: ['set'],
  alias: { h: 'help' },
  unknown: (arg) => {
    if (arg.startsWith('-')) {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
    return true;
  },
};

export async function main(argv) {
  const args = minimist(argv, minimistOptions);

  const help = `
Usage: jmap keyword <message-id> [options]

Arguments:
  message-id             The ID of the message to update

Options:
  --read[=true|false]    Set/unset the $seen keyword
  --answered[=true|false]  Set/unset the $answered keyword
  --starred[=true|false]   Set/unset the $flagged keyword
  --junk[=true|false]      Set/unset the $junk keyword
  --draft[=true|false]     Set/unset the $draft keyword
  --set <keyword>        Set a custom keyword
  -h, --help             Show this help message
`;

  const messageId = args._[0];

  if (args.help || !messageId) {
    console.log(help);
    process.exit(0);
  }

  const jmapClient = new JmapClient();
  const keywords = {};

  if (args.read !== undefined) keywords['$seen'] = args.read;
  if (args.answered !== undefined) keywords['$answered'] = args.answered;
  if (args.starred !== undefined) keywords['$flagged'] = args.starred;
  if (args.junk !== undefined) keywords['$junk'] = args.junk;
  if (args.draft !== undefined) keywords['$draft'] = args.draft;
  if (args.set) keywords[args.set] = true;

  const update = { keywords };

  const result = await jmapClient.updateMessage({ messageId, update });

  if (result.methodResponses[0][1].notUpdated) {
    console.log(`Message with ID ${messageId} not found or no keywords were changed.`);
  } else {
    console.log(`Keywords for message with ID ${messageId} have been updated.`);
  }
}

if (import.meta.url.startsWith('file:') && process.argv[1].endsWith('keyword.js')) {
  main(process.argv.slice(2));
}

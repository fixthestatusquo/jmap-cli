#!/usr/bin/env node
import minimist from 'minimist';
import { JmapClient } from '../lib/jmap.js';
import '../lib/config.js';

const minimistOptions = {
  boolean: ['help', 'draft', 'seen', 'flagged', 'answered'],
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
  --draft                Set the $draft keyword
  --seen                 Set the $seen keyword
  --flagged              Set the $flagged keyword
  --answered             Set the $answered keyword
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

  if (args.draft) keywords['$draft'] = true;
  if (args.seen) keywords['$seen'] = true;
  if (args.flagged) keywords['$flagged'] = true;
  if (args.answered) keywords['$answered'] = true;
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

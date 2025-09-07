#!/usr/bin/env node
import minimist from 'minimist';
import { JmapClient } from '../lib/jmap.js';
import '../lib/config.js';
import { formatAndDisplayMessages } from '../lib/display.js';
import path from 'path';
import { fileURLToPath } from 'url';

const minimistOptions = {
  string: ['limit', 'sort', 'order'],
  boolean: ['help', 'json', 'read', 'answered', 'starred', 'junk', 'draft'],
  alias: { h: 'help', l: 'limit', j: 'json' },
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
  const isSet = (flagName) => (args.flagName || args._.includes(`--no-${flagName}`) );

  const help = `
Usage: jmap messages [mailbox] [options]

Arguments:
  mailbox                Mailbox to list messages from (defaults to "Inbox")

Options:
  -l, --limit <number>   Number of messages to list (defaults to 10)
  --sort <string>        Sort by property (e.g., receivedAt, from, to, subject, size)
  --order <string>       Sort order (asc or desc, defaults to desc)
  --read[=true|false]    Filter by messages that are read/unread
  --answered[=true|false]  Filter by messages that are answered/unanswered
  --starred[=true|false]   Filter by messages that are starred/unstarred
  --junk[=true|false]      Filter by messages that are junk/not junk
  --draft[=true|false]     Filter by messages that are draft/not draft
  -j, --json             Output messages as JSON
  -h, --help             Show this help message
`;

  if (args.help) {
    console.log(help);
    process.exit(0);
  }

  const limit = args.limit ? parseInt(args.limit, 10) : 10;
  const mailboxName = args._[0] || "Inbox";
  const jsonOutput = args.json;
  const sort = args.sort || 'receivedAt';
  const order = args.order || 'desc';

  const keywords = {};
  if (isSet('read')) keywords['$seen'] = args.read;
  if (isSet('answered')) keywords['$answered'] = args.answered;
  if (isSet('starred')) keywords['$flagged'] = args.starred;
  if (isSet('junk')) keywords['$junk'] = args.junk;
  if (isSet('draft')) keywords['$draft'] = args.draft;



  const jmapClient = new JmapClient();
  const messages = await jmapClient.listMessages({ limit, mailboxName, sort, order, ...(Object.keys(keywords).length > 0 && { keywords }) });

  formatAndDisplayMessages(messages, jsonOutput);
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

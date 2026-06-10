#!/usr/bin/env node
import minimist from 'minimist';
import { JmapClient } from '../lib/jmap.js';
import { getClientOptions } from '../lib/config.js';
import { formatAndDisplayMessages } from '../lib/display.js';
import path from 'path';
import { fileURLToPath } from 'url';

const minimistOptions = {
  string: ['limit', 'sort', 'order', 'page'],
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
  -l, --limit <number>   Messages per page (defaults to 10)
  --page <number>        Specific page to fetch (e.g., --page 2). By default all pages are fetched.
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
  const page = args.page ? parseInt(args.page, 10) : undefined;
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



  const jmapClient = new JmapClient(getClientOptions());

  if (page !== undefined) {
    // Single-page mode
    const position = (page - 1) * limit;
    const result = await jmapClient.listMessages({
      limit,
      mailboxName,
      sort,
      order,
      position: position > 0 ? position : undefined,
      ...(Object.keys(keywords).length > 0 && { keywords }),
    });

    if (jsonOutput) {
      formatAndDisplayMessages(result.messages, true);
    } else {
      formatAndDisplayMessages(result.messages, false);
      if (!result.hasMore) {
        console.log(`\n(end of results)`);
      }
    }
  } else {
    // Batch mode — fetch all pages
    let allMessages = [];
    let currentPosition = 0;
    let pageNum = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await jmapClient.listMessages({
        limit,
        mailboxName,
        sort,
        order,
        position: currentPosition > 0 ? currentPosition : undefined,
        ...(Object.keys(keywords).length > 0 && { keywords }),
      });

      if (jsonOutput) {
        allMessages.push(...result.messages);
      } else {
        if (pageNum > 0) {
          console.log(`\n--- Page ${pageNum + 1} ---\n`);
        }
        formatAndDisplayMessages(result.messages, false);
      }

      hasMore = result.hasMore;
      currentPosition = result.position + limit;
      pageNum++;
    }

    if (jsonOutput) {
      formatAndDisplayMessages(allMessages, true);
    }
  }
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

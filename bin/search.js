#!/usr/bin/env node
import minimist from 'minimist';
import { JmapClient } from '../lib/jmap.js';
import { getClientOptions } from '../lib/config.js';
import { formatAndDisplayMessages } from '../lib/display.js';
import path from 'path';
import { fileURLToPath } from 'url';

const minimistOptions = {
  string: ['from', 'to', 'replyTo', 'cc', 'bcc', 'subject', 'body', 'before', 'after', 'limit', 'sort', 'order', 'page'],
  boolean: ['help', 'json'],
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

  const help = `
Usage: jmap search [options] [freeform_query]

Options:
  --from <string>        Search by sender email address or name
  --to <string>          Search by recipient email address or name
  --replyTo <string>     Search by Reply-To address or name
  --cc <string>          Search by CC address or name
  --bcc <string>         Search by BCC address or name
  --subject <string>     Search by subject
  --body <string>        Search by body content
  --before <date>        Search for messages received before a specific date (YYYY-MM-DD)
  --after <date>         Search for messages received after a specific date (YYYY-MM-DD)
  -l, --limit <number>   Messages per page (defaults to 10)
  --page <number>        Specific page to fetch (e.g., --page 2). By default all pages are fetched.
  --sort <string>        Sort by property (e.g., receivedAt, from, to, subject, size)
  --order <string>       Sort order (asc or desc, defaults to desc)
  -j, --json             Output messages as JSON
  -h, --help             Show this help message
`;

  const freeformQuery = args._.join(' ');

  if (args.help || (!args.from && !args.to && !args.replyTo && !args.cc && !args.bcc && !args.subject && !args.body && !args.before && !args.after && !freeformQuery)) {
    console.log(help);
    process.exit(0);
  }

  const limit = args.limit ? parseInt(args.limit, 10) : 10;
  const page = args.page ? parseInt(args.page, 10) : undefined;
  const jsonOutput = args.json;
  const sort = args.sort || 'receivedAt';
  const order = args.order || 'desc';

  const buildSearchParams = (position) => ({
    from: args.from,
    to: args.to,
    replyTo: args.replyTo,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    body: args.body,
    before: args.before,
    after: args.after,
    query: freeformQuery || undefined,
    limit,
    sort,
    order,
    ...(position !== undefined ? { position } : {}),
  });

  const jmapClient = new JmapClient(getClientOptions());

  // Shared display helper
  const displayMessage = (message) => {
    const display = (label, value) => {
      if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
        console.log(`${label}: ${value}`);
      }
    };
    display('ID', message.id);
    display('Subject', message.subject);
    display('From', message.from ? message.from.map(f => f.name ? `${f.name} <${f.email}>` : f.email).join(', ') : null);
    display('To', message.to ? message.to.map(t => t.name ? `${t.name} <${t.email}>` : t.email).join(', ') : null);
    display('Reply-To', message.replyTo ? message.replyTo.map(r => r.name ? `${r.name} <${r.email}>` : r.email).join(', ') : null);
    display('Cc', message.cc ? message.cc.map(c => c.name ? `${c.name} <${c.email}>` : c.email).join(', ') : null);
    display('Bcc', message.bcc ? message.bcc.map(b => b.name ? `${b.name} <${b.email}>` : b.email).join(', ') : null);
    display('Received', message.receivedAt);
    display('Size', message.size);
    if (message.hasAttachment) display('Has Attachment', message.hasAttachment);
    if (message.keywords && Object.keys(message.keywords).length > 0) display('Keywords', JSON.stringify(message.keywords));
    display('Preview', message.preview);
    display('X-Priority', message['header:X-Priority:asText']);
    display('Importance', message['header:Importance:asText']);
    display('Priority', message['header:Priority:asText']);
    display('Auto-Submitted', message['header:Auto-Submitted:asText']);
    console.log('---');
  };

  const cleanMessage = (message) => {
    const cleaned = {};
    for (const key in message) {
      const value = message[key];
      if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
        if (key.startsWith('header:')) {
          if (key === 'header:X-Priority:asText') cleaned['X-Priority'] = value;
          else if (key === 'header:Importance:asText') cleaned['Importance'] = value;
          else if (key === 'header:Priority:asText') cleaned['Priority'] = value;
          else if (key === 'header:Auto-Submitted:asText') cleaned['Auto-Submitted'] = value;
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  };

  if (page !== undefined) {
    // Single-page mode
    const position = (page - 1) * limit;
    const result = await jmapClient.searchMessages(buildSearchParams(position > 0 ? position : undefined));

    if (jsonOutput) {
      console.log(JSON.stringify(result.messages.map(cleanMessage), null, 2));
    } else {
      result.messages.forEach(displayMessage);
      if (!result.hasMore) {
        console.log('(end of results)');
      }
    }
  } else {
    // Batch mode — fetch all pages
    let allMessages = [];
    let currentPosition = 0;
    let pageNum = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await jmapClient.searchMessages(buildSearchParams(currentPosition > 0 ? currentPosition : undefined));

      if (jsonOutput) {
        allMessages.push(...result.messages);
      } else {
        if (pageNum > 0) {
          console.log(`\n--- Page ${pageNum + 1} ---\n`);
        }
        result.messages.forEach(displayMessage);
      }

      hasMore = result.hasMore;
      currentPosition = result.position + limit;
      pageNum++;
    }

    if (jsonOutput) {
      console.log(JSON.stringify(allMessages.map(cleanMessage), null, 2));
    }
  }
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

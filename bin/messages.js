#!/usr/bin/env node
import minimist from 'minimist';
import { JmapClient } from '../lib/jmap.js';
import '../lib/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const minimistOptions = {
  string: ['limit', 'sort', 'order'],
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
Usage: jmap messages [mailbox] [options]

Arguments:
  mailbox                Mailbox to list messages from (defaults to "Inbox")

Options:
  -l, --limit <number>   Number of messages to list (defaults to 10)
  --sort <string>        Sort by property (e.g., receivedAt, from, to, subject, size)
  --order <string>       Sort order (asc or desc, defaults to desc)
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
  const jmapClient = new JmapClient();
  const messages = await jmapClient.listMessages({ limit, mailboxName, sort, order });

  if (jsonOutput) {
    const cleanedMessages = messages.map(message => {
      const cleanedMessage = {};
      for (const key in message) {
        const value = message[key];
        if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
          if (key.startsWith('header:')) {
            // Handle specific headers for JSON output
            if (key === 'header:X-Priority:asText') cleanedMessage['X-Priority'] = value;
            else if (key === 'header:Importance:asText') cleanedMessage['Importance'] = value;
            else if (key === 'header:Priority:asText') cleanedMessage['Priority'] = value;
            else if (key === 'header:Auto-Submitted:asText') cleanedMessage['Auto-Submitted'] = value;
          } else {
            cleanedMessage[key] = value;
          }
        }
      }
      return cleanedMessage;
    });
    console.log(JSON.stringify(cleanedMessages, null, 2));
  } else {
    messages.forEach(message => {
      const display = (label, value) => {
        if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
          console.log(`${label}: ${value}`);
        }
      };

      display('ID', message.id);
      display('Subject', message.subject);
      display('From', message.from ? message.from.map(f => f.name ? `${f.name} <${f.email}>` : f.email).join(', ') : null);
      display('To', message.to ? message.to.map(t => t.name ? `${t.name} <${t.email}>` : t.email).join(', ') : null);
      display('Cc', message.cc ? message.cc.map(c => c.name ? `${c.name} <${c.email}>` : c.email).join(', ') : null);
      display('Bcc', message.bcc ? message.bcc.map(b => b.name ? `${b.name} <${b.email}>` : b.email).join(', ') : null);
      display('Received', message.receivedAt);
      display('Size', message.size);
      if (message.hasAttachment) display('Has Attachment', message.hasAttachment);
      if (Object.keys(message.keywords).length > 0) display('Keywords', JSON.stringify(message.keywords));
      display('Preview', message.preview);
      display('X-Priority', message['header:X-Priority:asText']);
      display('Importance', message['header:Importance:asText']);
      display('Priority', message['header:Priority:asText']);
      display('Auto-Submitted', message['header:Auto-Submitted:asText']);
      console.log('---');
    });
  }
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

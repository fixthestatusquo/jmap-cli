#!/usr/bin/env node
import minimist from 'minimist';
import { JmapClient } from '../lib/jmap.js';
import '../lib/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const minimistOptions = {
  boolean: ['help', 'json'],
  alias: { h: 'help', j: 'json' },
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
Usage: jmap message <message-id> [options]

Arguments:
  message-id             The ID of the message to fetch

Options:
  -j, --json             Output message as JSON
  -h, --help             Show this help message
`;

  const messageId = args._[0];
  const jsonOutput = args.json;

  if (args.help || !messageId) {
    console.log(help);
    process.exit(0);
  }

  const jmapClient = new JmapClient();
  const message = await jmapClient.getMessage({ messageId });

  if (!message) {
    console.log(`Message with ID ${messageId} not found.`);
    return;
  }

  if (jsonOutput) {
    console.log(JSON.stringify(message, null, 2));
  } else {
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
    display('Text Body', message.textBody);
    display('HTML Body', message.htmlBody);
    display('X-Priority', message['X-Priority']);
    display('Importance', message['Importance']);
    display('Priority', message['Priority']);
    display('Auto-Submitted', message['Auto-Submitted']);
  }
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

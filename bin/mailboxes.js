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
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  },
};

export async function main(argv) {
  const args = minimist(argv, minimistOptions);

  const help = `
Usage: jmap mailboxes [options]

Options:
  -j, --json             Output mailboxes as JSON
  -h, --help             Show this help message
`;

  if (args.help) {
    console.log(help);
    process.exit(0);
  }

  const jmapClient = new JmapClient();
  const mailboxes = await jmapClient.listMailboxes();
  if (args.json) {
    console.log(JSON.stringify(mailboxes, null, 2));
  } else {
    mailboxes.forEach(mailbox => {
      console.log(mailbox.name, mailbox.role ? "("+mailbox.role+")" : "");
    });
  }
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

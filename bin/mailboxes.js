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
    const mailboxesByParentId = new Map();
    mailboxes.forEach(mailbox => {
      const parentId = mailbox.parentId || null;
      if (!mailboxesByParentId.has(parentId)) {
        mailboxesByParentId.set(parentId, []);
      }
      mailboxesByParentId.get(parentId).push(mailbox);
    });

    function printMailboxes(parentId, prefix) {
      const children = mailboxesByParentId.get(parentId);
      if (!children) {
        return;
      }

      children.forEach((mailbox, index) => {
        const isLast = index === children.length - 1;
        const newPrefix = prefix + (isLast ? "└── " : "├── ");
        console.log(newPrefix + mailbox.name + (mailbox.role ? ` (${mailbox.role})` : ''));
        printMailboxes(mailbox.id, prefix + (isLast ? "    " : "│   "));
      });
    }

    printMailboxes(null, "");
  }
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

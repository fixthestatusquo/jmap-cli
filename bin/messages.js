#!/usr/bin/env node

import minimist from 'minimist';
import dotenv from 'dotenv';
import { JmapClient } from '../lib/jmap.js';

dotenv.config();

const minimistOptions = {
  string: ['limit', 'mailbox'],
  boolean: ['help'],
  alias: { h: 'help', l: 'limit', m: 'mailbox' },
  unknown: (arg) => {
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  },
};

const args = minimist(process.argv.slice(2), minimistOptions);

const help = `
Usage: list [options]

Options:
  -l, --limit <number>   Number of messages to list (defaults to 10)
  -m, --mailbox <name>   Mailbox to list messages from (defaults to "Inbox")
  -h, --help             Show this help message
`;

if (args.help) {
  console.log(help);
  process.exit(0);
}

async function main() {
  const limit = args.limit ? parseInt(args.limit, 10) : 10;
  const mailboxName = args.mailbox || "Inbox";
  const jmapClient = new JmapClient();
  await jmapClient.listMessages({ limit, mailboxName });
}

main();

#!/usr/bin/env node

import minimist from 'minimist';
import dotenv from 'dotenv';
import { JmapClient } from '../lib/jmap.js';

dotenv.config();

const minimistOptions = {
  string: ['limit'],
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

const args = minimist(process.argv.slice(2), minimistOptions);

const help = `
Usage: messages [mailbox] [options]

Arguments:
  mailbox                Mailbox to list messages from (defaults to "Inbox")

Options:
  -l, --limit <number>   Number of messages to list (defaults to 10)
  -j, --json             Output messages as JSON
  -h, --help             Show this help message
`;

if (args.help) {
  console.log(help);
  process.exit(0);
}

async function main() {
  const limit = args.limit ? parseInt(args.limit, 10) : 10;
  const mailboxName = args._[0] || "Inbox";
  const jsonOutput = args.json;
  const jmapClient = new JmapClient();
  await jmapClient.listMessages({ limit, mailboxName, jsonOutput });
}

main();

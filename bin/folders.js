#!/usr/bin/env node

import minimist from 'minimist';
import dotenv from 'dotenv';
import { JmapClient } from '../lib/jmap.js';

dotenv.config();

const minimistOptions = {
  boolean: ['help'],
  alias: { h: 'help' },
  unknown: (arg) => {
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  },
};

const args = minimist(process.argv.slice(2), minimistOptions);

const help = `
Usage: folders [options]

Options:
  -h, --help            Show this help message
`;

if (args.help) {
  console.log(help);
  process.exit(0);
}

async function main() {
  const jmapClient = new JmapClient();
  await jmapClient.listMailboxes();
}

main();

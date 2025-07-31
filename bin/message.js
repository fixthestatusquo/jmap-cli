#!/usr/bin/env node

import minimist from 'minimist';
import dotenv from 'dotenv';
import { JmapClient } from '../lib/jmap.js';

dotenv.config();

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

const args = minimist(process.argv.slice(2), minimistOptions);

const help = `
Usage: message <message-id> [options]

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

async function main() {
  const jmapClient = new JmapClient();
  await jmapClient.getMessage({ messageId, jsonOutput });
}

main();

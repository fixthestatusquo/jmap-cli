#!/usr/bin/env node
import minimist from 'minimist';
import { JmapClient } from '../lib/jmap.js';
import '../lib/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const minimistOptions = {
  string: ['name', 'parent'],
  boolean: ['help'],
  alias: { h: 'help' },
  unknown: (arg) => {
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  },
};

export async function main(argv) {
  const args = minimist(argv, minimistOptions);

  const help = `
Usage: jmap mailbox --name <name> [--parent <parent>]

Options:
  --name      The name of the mailbox to create
  --parent    The name of the parent mailbox (defaults to Inbox)
  -h, --help  Show this help message
`;

  if (args.help || !args.name) {
    console.log(help);
    process.exit(0);
  }

  const jmapClient = new JmapClient();
  const result = await jmapClient.createMailbox({
    name: args.name,
    parentName: args.parent,
  });

  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

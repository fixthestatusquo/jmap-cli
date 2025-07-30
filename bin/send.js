#!/usr/bin/env node

import minimist from 'minimist';
import dotenv from 'dotenv';
import { JmapClient } from '../lib/jmap.js';

dotenv.config();

const help = `
Usage: send-email [options]

Options:
  --from <email>       Sender's email address (defaults to EMAIL_FROM env var)
  --from-name <name>   Sender's name
  --to <email>         Recipient's email address
  --subject <subject>  Email subject
  --text <text>        Email body (reads from stdin if not provided)
  -h, --help           Show this help message
`;
const minimistOptions = {
  string: ['from', 'from-name', 'to', 'subject', 'text'],
  boolean: ['help'],
  alias: { h: 'help' },
  unknown: (arg) => {
    console.error(`Unknown argument: ${arg}`);
    console.log(help);
    process.exit(1);
  },
};

const args = minimist(process.argv.slice(2), minimistOptions);

const { from = process.env.EMAIL_FROM, 'from-name': fromName, to, subject } = args;
let { text } = args;


if (args.help || !from || !to || !subject) {
  console.log(help);
  process.exit(0);
}

async function main() {
  if (!text) {
    if (process.stdin.isTTY) {
      console.log('Type your message followed by ctrl-d');
    }
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    text = Buffer.concat(chunks).toString('utf8');
  }

  const jmapClient = new JmapClient();
  await jmapClient.sendEmail({ from, fromName, to, subject, text });
}

main();


#!/usr/bin/env node
import minimist from 'minimist';
import { JmapClient } from '../lib/jmap.js';
import '../lib/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const help = `
Usage: jmap send-email [options]

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
  alias: { h: 'help', s: 'subject' },
  unknown: (arg) => {
    console.error(`Unknown argument: ${arg}`);
    console.log(help);
    process.exit(1);
  },
};

export async function main(argv) {
  const args = minimist(argv, minimistOptions);

  const { from = process.env.MAIL_FROM, 'from-name': fromName, to, subject } = args;
  let { text } = args;

  if (args.help || !from || !to || !subject) {
    console.log(help);
    process.exit(0);
  }

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
  const result = await jmapClient.sendEmail({ from, fromName, to, subject, text });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}


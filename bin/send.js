#!/usr/bin/env node
import minimist from 'minimist';
import { JmapClient } from '../lib/jmap.js';
import '../lib/config.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const help = `
Usage: jmap send <to> [options]

Arguments:
  to                   Recipient's email address

Options:
  --from <email>       Sender's email address (defaults to EMAIL_FROM env var)
  --from-name <name>   Sender's name (defaults to MAIL_FROM_NAME env var)
  --subject <subject>  Email subject
  --text <text>        Email body (reads from stdin if not provided)
  --attach <path>      Path to a file to attach
  -h, --help           Show this help message
`;
const minimistOptions = {
  string: ['from', 'from-name', 'subject', 'text', 'attach'],
  boolean: ['help'],
  alias: { h: 'help', s: 'subject' },
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
  const to = args._[0];

  if (args._.length !== 1) {
    console.error('Error: Please provide exactly one recipient email address.');
    console.log(help);
    process.exit(1);
  }

  const { from = process.env.MAIL_FROM, 'from-name': fromName = process.env.MAIL_FROM_NAME, subject, attach } = args;
  let { text } = args;

  if (args.help || !from || !to || !subject) {
console.log(from,to,subject);
    console.log(help);
    process.exit(0);
  }

  let attachment;
  if (attach) {
    if (!fs.existsSync(attach)) {
      console.error(`Attachment file not found: ${attach}`);
      process.exit(1);
    }
    const stats = fs.statSync(attach);
    attachment = {
      path: attach,
      name: path.basename(attach),
      content: fs.readFileSync(attach),
      size: stats.size,
    };
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
  const result = await jmapClient.sendEmail({ from, fromName, to, subject, text, attachment });
  const emailSet = result.methodResponses.find(r => r[0] === 'Email/set');
  if (emailSet && emailSet[1].created) {
    for (const key in emailSet[1].created) {
      const id = emailSet[1].created[key].id;
      console.log(`message ${id} created`);
    }
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

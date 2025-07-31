#!/usr/bin/env node

import minimist from 'minimist';

const args = process.argv.slice(2);
const command = args[0];

const help = `
Usage: jmap <command> [options]

Commands:
  init                   Initializes the CLI and creates a .env file
  mailboxes              Lists the mailboxes in your account
  messages               Lists the messages in a mailbox
  message                Fetches a message
  send                   Sends an email
  listen                 Listen for real-time updates
  help                   Show this help message
`;

switch (command) {
    case 'init':
        (await import('./init.js')).main(args.slice(1));
        break;
    case 'mailboxes':
        (await import('./mailboxes.js')).main(args.slice(1));
        break;
    case 'messages':
        (await import('./messages.js')).main(args.slice(1));
        break;
    case 'message':
        (await import('./message.js')).main(args.slice(1));
        break;
    case 'send':
        (await import('./send.js')).main(args.slice(1));
        break;
    case 'listen':
        (await import('./listen.js')).main(args.slice(1));
        break;
    case 'help':
    default:
        console.log(help);
        break;
}

#!/usr/bin/env node

import minimist from 'minimist';

const args = process.argv.slice(2);
const command = args[0];

const commands = {
  init: { file: './init.js', description: 'Initializes the CLI and creates a .env file' },
  mailboxes: { file: './mailboxes.js', description: 'Lists the mailboxes in your account' },
  messages: { file: './messages.js', description: 'Lists the messages in a mailbox' },
  message: { file: './message.js', description: 'Fetches a message' },
  send: { file: './send.js', description: 'Sends an email' },
  listen: { file: './listen.js', description: 'WIP Listen for real-time updates' },
  keyword: { file: './keyword.js', description: 'Set keywords (seen, answered...) on a message' },
  move: { file: './move.js', description: 'Move a message to a different mailbox' },
  help: { file: null, description: 'Show this help message' }
};

const help = `
Usage: jmap <command> [options]

Commands:
${Object.entries(commands).map(([cmd, { description }]) => `  ${cmd.padEnd(22)}${description}`).join('\n')}
`;

(async () => {
  try {
    if (commands[command]) {
      if (command === 'help') {
        console.log(help);
      } else {
        const commandModule = await import(commands[command].file);
        await commandModule.main(args.slice(1));
      }
    } else {
      console.log(help);
    }
  } catch (e) {
    console.error(e.toString());
    process.exit(1);
  }
})();

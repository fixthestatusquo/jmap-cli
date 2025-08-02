#!/usr/bin/env node
import minimist from 'minimist';
import { JmapClient } from '../lib/jmap.js';
import '../lib/config.js';

const minimistOptions = {
  boolean: ['help'],
  alias: { h: 'help' },
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

  const help = `
Usage: jmap move <message-id> <mailbox-name>

Arguments:
  message-id             The ID of the message to move
  mailbox-name           The name of the mailbox to move the message to

Options:
  -h, --help             Show this help message
`;

  const messageId = args._[0];
  const mailboxName = args._[1];

  if (args.help || !messageId || !mailboxName) {
    console.log(help);
    process.exit(0);
  }

  const jmapClient = new JmapClient();

  const mailboxes = await jmapClient.listMailboxes();
  const targetMailbox = mailboxes.find(mb => mb.name.toLowerCase() === mailboxName.toLowerCase());

  if (!targetMailbox) {
    console.error(`Mailbox "${mailboxName}" not found.`);
    process.exit(1);
  }

  const update = {
    mailboxIds: { [targetMailbox.id]: true },
  };

  const result = await jmapClient.updateMessage({ messageId, update });

  if (result.methodResponses[0][1].notUpdated) {
    console.log(`Message with ID ${messageId} not found or already in the target mailbox.`);
  } else {
    console.log(`Message with ID ${messageId} has been moved to "${mailboxName}".`);
  }
}

if (import.meta.url.startsWith('file:') && process.argv[1].endsWith('move.js')) {
  main(process.argv.slice(2));
}

#!/usr/bin/env node
import minimist from 'minimist';
import '../lib/config.js'; // Ensure dotenv is loaded
import { JmapClient } from '../lib/jmap.js';
import fs from 'fs/promises';
import readline from 'readline';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import "../lib/config.js";

const homeDir = os.homedir();
const configDir = path.join(homeDir, '.config', 'jmap-cli');
const configFilePath = path.join(configDir, 'config');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query, currentValue) {
  const prompt = currentValue ? `${query} [${currentValue}] ` : `${query} `;
  return new Promise((resolve) => rl.question(prompt, (answer) => {
    resolve(answer || currentValue);
  }));
}

const minimistOptions = {
  string: ['url'],
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
Usage: init [url] [options]

Arguments:
  url                    The base URL of the Stalwart JMAP server (e.g., https://jmap.example.com)

Options:
  -h, --help             Show this help message
`;

  if (args.help) {
    console.log(help);
    process.exit(0);
  }

  let existingConfig = {};
  try {
    const configContent = await fs.readFile(configFilePath, 'utf-8');
    configContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        existingConfig[key] = value.replace(/"/g, '');
      }
    });
  } catch (error) {
    // If the file doesn't exist, do nothing.
    if (error.code !== 'ENOENT') {
      console.error(`Error reading config file at ${configFilePath}:`, error.message);
      rl.close();
      return;
    }
  }

  let jmapBaseUrl = args._[0] || args.url || existingConfig.JMAP_BASE_URL;

  if (!jmapBaseUrl) {
    jmapBaseUrl = await question('Enter the JMAP base URL (e.g., https://jmap.example.com):');
  }

  const jmapUsername = await question('Enter your email address (login):', existingConfig.JMAP_USERNAME);
  const jmapPassword = await question('Enter your JMAP password:', existingConfig.JMAP_PASSWORD);
  const mailFrom = await question(`Enter the MAIL_FROM address:`, existingConfig.MAIL_FROM || jmapUsername) || jmapUsername;
  const mailFromName = await question('Enter your sender name:', existingConfig.MAIL_FROM_NAME);

  const client = new JmapClient(jmapUsername, jmapPassword, jmapBaseUrl);
  const isValid = await client.verifyCredentials();

  if (!isValid) {
    console.error('Error: Invalid credentials or JMAP URL.');
    rl.close();
    return;
  }

  const session = await client._discoverSession();
  const accountId = client.getAccountId(session);
  const { outboxId, identityId, identityEmail } = await client.getSendPrerequisites(accountId);

  const envContent = `JMAP_BASE_URL="${jmapBaseUrl}"\nJMAP_USERNAME="${jmapUsername}"\nJMAP_PASSWORD="${jmapPassword}"\nMAIL_FROM="${mailFrom}"\nJMAP_SENT_MAILBOX_ID="${outboxId}"\nJMAP_IDENTITY_ID="${identityId}"\nJMAP_IDENTITY_EMAIL="${identityEmail}"
MAIL_FROM_NAME="${mailFromName}"

`;

  try {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configFilePath, envContent);
    console.log(`\nConfig file generated successfully at ${configFilePath}!`);
  } catch (error) {
    console.error(`\nError writing config file at ${configFilePath}:`, error.message);
  }

  rl.close();
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

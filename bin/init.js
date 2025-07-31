#!/usr/bin/env node
import minimist from 'minimist';
import '../lib/config.js'; // Ensure dotenv is loaded
import { JmapClient } from '../lib/jmap.js';
import fs from 'fs/promises';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import "../lib/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envFilePath = path.resolve(__dirname, '..', '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
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

  // Check if .env exists
  try {
    await fs.access(envFilePath);
    const client = new JmapClient();
    const isValid = await client.verifyCredentials();
    let answer;
    if (isValid) {
      answer = await question('An existing .env file was found with a valid configuration. Overwrite? (y/N): ');
    } else {
      answer = await question('An existing .env file was found, but the configuration seems invalid. Overwrite? (y/N): ');
    }
    if (answer.toLowerCase() !== 'y') {
      console.log('\nOperation cancelled. .env file not modified.');
      rl.close();
      return;
    }
  } catch (error) {
    // If the file doesn't exist, do nothing.
    if (error.code !== 'ENOENT') {
      console.error('Error checking for .env file:', error.message);
      rl.close();
      return;
    }
  }

  let jmapBaseUrl = args._[0] || args.url;

  if (!jmapBaseUrl) {
    jmapBaseUrl = await question('Enter the JMAP base URL (e.g., https://jmap.example.com): ');
  }

  const jmapUsername = await question('Enter your email address (login): ');
  const jmapPassword = await question('Enter your JMAP password: ');
  const mailFrom = await question(`Enter the MAIL_FROM address (press Enter to use ${jmapUsername}): `) || jmapUsername;

  const client = new JmapClient(jmapUsername, jmapPassword, jmapBaseUrl);
  const isValid = await client.verifyCredentials();

  if (!isValid) {
    console.error('Error: Invalid credentials or JMAP URL.');
    rl.close();
    return;
  }

  const envContent = `JMAP_BASE_URL="${jmapBaseUrl}"\nJMAP_USERNAME="${jmapUsername}"\nJMAP_PASSWORD="${jmapPassword}"\nMAIL_FROM="${mailFrom}"\n`;
  await fs.writeFile(envFilePath, envContent);
  console.log('\n.env file generated successfully!');

  rl.close();
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

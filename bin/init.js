#!/usr/bin/env node
import minimist from 'minimist';
import '../lib/config.js'; // Ensure dotenv is loaded
import fs from 'fs/promises';
import readline from 'readline';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const homeDir = os.homedir();
const configDir = path.join(homeDir, '.config', 'jmap-cli');
const configFilePath = path.join(configDir, 'config');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query, defaultValue) {
  const prompt = defaultValue ? `${query} [${defaultValue}] ` : `${query} `;
  return new Promise((resolve) => rl.question(prompt, (answer) => {
    resolve(answer || defaultValue || '');
  }));
}

function closeRl() {
  try { rl.close(); } catch { /* ignore */ }
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
  url                    The base URL of the JMAP server (e.g., https://jmap.example.com)

Options:
  -h, --help             Show this help message

Description:
  Walks through server URL setup and offers to initiate the OAuth2
  Device Authorization Grant (RFC 8628) login flow.

  After init completes, you can use other jmap-cli commands.
`;

  if (args.help) {
    console.log(help);
    process.exit(0);
  }

  // Load existing config for defaults
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
    if (error.code !== 'ENOENT') {
      console.error(`Error reading config file at ${configFilePath}:`, error.message);
      closeRl();
      return;
    }
  }

  let jmapBaseUrl = args._[0] || args.url || existingConfig.JMAP_BASE_URL;

  if (!jmapBaseUrl) {
    jmapBaseUrl = await question('Enter the JMAP base URL (e.g., https://jmap.example.com):');
  }

  if (!jmapBaseUrl) {
    console.error('Error: A JMAP base URL is required.');
    closeRl();
    process.exit(1);
  }

  // Save the URL immediately
  const envContent = `JMAP_BASE_URL="${jmapBaseUrl}"\n`;
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configFilePath, envContent);
  console.log(`\n✓ JMAP base URL saved to ${configFilePath}\n`);

  // Offer device login
  const shouldLogin = await question('Would you like to log in via OAuth2 device flow? (Y/n)', 'y');

  if (shouldLogin.toLowerCase() === 'y' || shouldLogin.toLowerCase() === 'yes' || shouldLogin === '') {
    closeRl();

    // Set the URL so login.js picks it up from the environment
    process.env.JMAP_BASE_URL = jmapBaseUrl;

    const { main: loginMain } = await import('./login.js');
    await loginMain([]);
  } else {
    console.log(`\nSkipping login. You can run \`jmap-cli login\` later or manually edit ${configFilePath}\n`);
    closeRl();
  }
}

if (import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

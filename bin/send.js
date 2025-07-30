#!/usr/bin/env node

import minimist from 'minimist';
import dotenv from 'dotenv';
import { getAccessToken } from '../lib/auth.js';
import { JmapClient } from '../lib/jmap.js';

dotenv.config();

const args = minimist(process.argv.slice(2));
const { from = process.env.EMAIL_FROM, to, subject, text } = args;

if (!from || !to || !subject || !text) {
  console.error('Usage: send-email --from me@example.com --to someone@example.com --subject "Hello" --text "Body"');
  process.exit(1);
}

//const token = await getAccessToken();
const jmapClient = new JmapClient();
console.log("text", text);
await jmapClient.sendEmail({ from, to, subject, text });


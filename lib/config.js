import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

const homeDir = os.homedir();
const configPath = path.join(homeDir, '.config', 'jmap-cli', 'config');

const config = dotenv.config({ path: configPath });

if (config.error) {
  console.warn ("missing config, run proca-cli init first");
}

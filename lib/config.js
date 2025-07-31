import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

const homeDir = os.homedir();
const configPath = path.join(homeDir, '.config', 'jmap-cli', 'config');

dotenv.config({ path: configPath });

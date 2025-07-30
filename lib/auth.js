import { Issuer, generators } from 'openid-client';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const TOKEN_PATH = path.resolve('.token.json');

export async function getAccessToken() {
  const issuer = await Issuer.discover(`${process.env.JMAP_BASE_URL}/.well-known/openid-configuration`);
  const client = new issuer.Client({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    redirect_uris: [process.env.REDIRECT_URI],
    response_types: ['code'],
  });

  let token;
  try {
    token = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf-8'));
    if (Date.now() >= token.expires_at * 1000) throw new Error('Token expired');
  } catch {
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    const authUrl = client.authorizationUrl({
      scope: 'openid profile email https://www.googleapis.com/auth/jmap',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    console.log('Visit this URL and authorise:\n', authUrl);
    const prompt = await import('node:readline/promises');
    const rl = prompt.createInterface({ input: process.stdin, output: process.stdout });
    const code = await rl.question('Enter the code: ');
    rl.close();

    const params = client.callbackParams(`${process.env.REDIRECT_URI}?code=${code}`);
    token = await client.callback(process.env.REDIRECT_URI, params, { code_verifier: codeVerifier });
    await fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  }

  return token.access_token;
}


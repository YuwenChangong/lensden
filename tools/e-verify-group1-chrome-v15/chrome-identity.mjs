import fs from 'node:fs';
import crypto from 'node:crypto';
export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const CHROME_SHA256 = 'fdd156b74dd997d3b15f0cdbb59ce0051f1e8b19d10822f31743abac09ec4c89';
export function verifyExecutable(file = CHROME, expected = CHROME_SHA256) {
  if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) throw Error('CHROME_IDENTITY_DRIFT');
}
export async function pinnedOpen(open, file = CHROME, expected = CHROME_SHA256) {
  verifyExecutable(file, expected);
  const browser = await open();
  try { verifyExecutable(file, expected); } catch (error) { await browser.close(); throw error; }
  return browser;
}

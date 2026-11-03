import {createHash} from 'node:crypto';

// Hash pathname only. No host, query, credentials, headers or body enters evidence.
export function scriptPathFingerprint(pathname) {
  if(typeof pathname!=='string'||!pathname.startsWith('/')||/[?#\x00-\x20]/.test(pathname)||pathname.length>4096)
    throw new Error('SCRIPT_PATH_EVIDENCE_INVALID');
  return createHash('sha256').update('group1-script-path-v1\0').update(pathname).digest('hex');
}

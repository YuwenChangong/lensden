import {gunzipSync, inflateSync, brotliDecompressSync} from 'node:zlib';

const account = 'dcb374166b39234a499985145c075f50';
const root = `/client/v4/accounts/${account}/workers`;

// Used only around the official SDK's initialization calls, never object traffic.
export function createR2RemoteRequestPolicy(workerName, {extraAccessReads = 0} = {}) {
  if (![0, 2].includes(extraAccessReads)) throw Error('REMOTE_ACCESS_READ_ALLOWANCE_INVALID');
  if (!/^ogh-exact-head-[a-f0-9]{8}$/.test(workerName)) {
    throw Error('REMOTE_PREVIEW_NAME_NOT_ADMITTED');
  }
  const used = new Set();
  let exchangeUrl;
  let exchangeRoot;
  let responseBound = false;
  const api = new Map([
    [`GET ${root}/subdomain/edge-preview`, 'PREVIEW_INIT'],
    [`GET ${root}/subdomain`, 'SUBDOMAIN_READ'],
    [`POST ${root}/scripts/${workerName}/edge-preview`, 'PREVIEW_UPLOAD'],
  ]);
  return Object.freeze({
    observePreviewResponse({operation, status, body, contentEncoding = 'identity'}) {
      if (responseBound) throw Error('REMOTE_PREVIEW_RESPONSE_ALREADY_CONSUMED');
      responseBound = true;
      if (operation !== 'PREVIEW_INIT' || !used.has(operation) || status !== 200
        || !Buffer.isBuffer(body) || !body.length || body.length > 65536) {
        throw Error('REMOTE_PREVIEW_RESPONSE_NOT_BOUND');
      }
      let decoded;
      try {
        const decoders = {gzip: gunzipSync, deflate: inflateSync, br: brotliDecompressSync};
        if (contentEncoding === 'identity') decoded = Buffer.from(body);
        else {
          const decode = decoders[contentEncoding];
          if (!decode) throw Error('REMOTE_PREVIEW_ENCODING_NOT_SUPPORTED');
          decoded = decode(body, {maxOutputLength: 65536});
        }
        if (decoded.length > 65536) throw Error('REMOTE_PREVIEW_RESPONSE_TOO_LARGE');
        const response = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(decoded));
        if (response.success !== true || typeof response.result?.exchange_url !== 'string') {
          throw Error('REMOTE_PREVIEW_RESPONSE_INVALID');
        }
        const url = new URL(response.result.exchange_url);
        if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
          || !/^[a-f0-9]{32}\.ogh\.workers\.dev$/.test(url.hostname)) {
          throw Error('REMOTE_PREVIEW_EXCHANGE_SCOPE_INVALID');
        }
        exchangeUrl = url.href;
        exchangeRoot = url.origin + '/';
      } catch {
        exchangeUrl = undefined;
        throw Error('REMOTE_PREVIEW_RESPONSE_INVALID');
      } finally { decoded?.fill(0); }
    },
    admit({origin, path, method}) {
      let base, url;
      try {
        base = new URL(String(origin));
        url = new URL(path, base);
      } catch { throw Error('REMOTE_TRANSPORT_URL_INVALID'); }
      if (base.username || base.password || base.pathname !== '/' || base.search || base.hash
        || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
        throw Error('REMOTE_TRANSPORT_ORIGIN_MISMATCH');
      }
      if (url.pathname + url.search !== path) throw Error('REMOTE_TRANSPORT_PATH_MISMATCH');
      if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        return {local: true, operation: 'LOCAL_SDK_COORDINATION'};
      }
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) {
        throw Error('REMOTE_TRANSPORT_NOT_ADMITTED');
      }
      let operation;
      if (url.hostname === 'api.cloudflare.com' && !url.search) {
        operation = api.get(`${method} ${url.pathname}`);
      } else if (extraAccessReads === 2 && method === 'GET' && exchangeRoot !== undefined
        && url.href === exchangeRoot && !used.has('EXCHANGE_HOST_ROOT_GET_1')) {
        // Access discovery and token exchange can share the same root URL.
        operation = 'EXCHANGE_HOST_ROOT_GET_1';
      } else if (extraAccessReads === 2 && method === 'GET' && exchangeRoot === exchangeUrl
        && url.href === exchangeRoot && used.has('EXCHANGE_HOST_ROOT_GET_1')
        && !used.has('EXCHANGE_HOST_ROOT_GET_2')) {
        operation = 'EXCHANGE_HOST_ROOT_GET_2';
      } else if (method === 'GET' && exchangeUrl !== undefined && url.href === exchangeUrl
        && !(extraAccessReads === 2 && exchangeRoot === exchangeUrl)) {
        // The transport binds the exact URL from its actual preview-init response.
        operation = 'OFFICIAL_PREVIEW_EXCHANGE';
      } else if (extraAccessReads === 2 && method === 'GET' && used.has('PREVIEW_UPLOAD')
        && url.href === `https://${workerName}.ogh.workers.dev/`) {
        operation = 'ACCESS_PREVIEW_PROBE';
      }
      if (!operation || used.has(operation)) throw Error('REMOTE_REQUEST_NOT_ADMITTED_OR_ALREADY_USED');
      used.add(operation);
      return {local: false, operation};
    },
    consumed() { return [...used]; },
  });
}

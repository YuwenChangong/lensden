// Private receipt fields only: never retain URL paths, query, fragments or userinfo.
export function browserOriginDiagnostic(rawUrl, resourceType) {
  let url;
  try { url = new URL(rawUrl); } catch {
    return { reason: 'BROWSER_ORIGIN_OUT_OF_SCOPE', origin: 'UNPARSEABLE', resourceType: 'unknown' };
  }
  const types = ['document', 'stylesheet', 'image', 'media', 'font', 'script',
    'texttrack', 'xhr', 'fetch', 'eventsource', 'websocket', 'manifest', 'other'];
  return {
    reason: 'BROWSER_ORIGIN_OUT_OF_SCOPE',
    origin: url.origin === 'null' ? 'OPAQUE_ORIGIN' : url.origin,
    protocol: url.protocol,
    resourceType: types.includes(resourceType) ? resourceType : 'unknown',
    credentialsInUrl: Boolean(url.username || url.password),
    fullUrlRetained: false,
    authorityToAllowOrigin: false,
  };
}

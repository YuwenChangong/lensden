export const classifyObserved = ({ url, method, type, appOrigin, supabaseOrigin, staticPaths }) => {
  const u = new URL(url), route = u.pathname + u.search;
  if (u.protocol !== 'https:' || u.username || u.password || u.hash) throw Error('OBSERVED_URL_INVALID');
  const charges = ['allBrowserHttpDispatchesMax'];
  if (u.origin === supabaseOrigin) {
    if (method === 'OPTIONS' && ['/auth/v1/token?grant_type=password', '/auth/v1/token?grant_type=refresh_token', '/auth/v1/logout', '/auth/v1/logout?scope=global', '/auth/v1/user'].includes(route))
      return { kind: 'native-cors-preflight', charges: [...charges, 'supabaseAuthDispatchesMax'] };
    if (method === 'POST' && ['/auth/v1/token?grant_type=password', '/auth/v1/token?grant_type=refresh_token', '/auth/v1/logout', '/auth/v1/logout?scope=global'].includes(route)) {
      charges.push('supabaseAuthDispatchesMax', 'applicationMutationDispatchesMax');
      if (route.endsWith('grant_type=refresh_token')) charges.push('ownerSessionRefreshRequestsMax');
      return { kind: route.includes('grant_type=password') ? 'login' : route.includes('refresh_token') ? 'refresh' : 'logout', charges };
    }
    if (method === 'GET' && route === '/auth/v1/user') return { kind: 'identity', charges: [...charges, 'supabaseAuthDispatchesMax'] };
    throw Error('OBSERVED_UNAPPROVED_DATABASE_REQUEST');
  }
  if (u.origin === appOrigin && method === 'GET') {
    if (['/login/', '/login/?next=%2Fproducts%2F', '/products/', '/products/xreal/xreal-air/', '/admin/devices/'].includes(route)) return { kind: 'page', charges };
    if (staticPaths.includes(route)) return { kind: 'static', charges };
    if (['/api/admin/forum/me', '/api/admin/devices', '/api/users/me/summary', '/api/users/me/preferences', '/api/users/me/notifications?limit=8&unread_only=1'].includes(route)) return { kind: 'app-read', charges };
  }
  if (u.origin === 'https://challenges.cloudflare.com' && ['GET', 'POST'].includes(method)) {
    // Host-scoped observation only. This is deliberately NOT an authorization to mediate or hard-allow every path.
    return { kind: 'vendor-observed', charges: [...charges, 'turnstileHttpDispatchesMax'] };
  }
  throw Error('OBSERVED_UNAPPROVED_REQUEST');
};
export function negativeBody(kind, bytes) {
  if (!['invalid-captcha', 'missing-captcha'].includes(kind)) return bytes;
  const body = JSON.parse(bytes);
  if (typeof body.gotrue_meta_security?.captcha_token !== 'string' || !body.gotrue_meta_security.captcha_token) throw Error('NEGATIVE_NATIVE_CAPTCHA_NOT_READY');
  body.gotrue_meta_security = kind === 'missing-captcha' ? {} : { captcha_token: 'QA_EXPLICITLY_INVALID_CAPTCHA_PROOF' };
  return Buffer.from(JSON.stringify(body));
}

/**
 * Vercel Edge proxy for MathALL builtin CORS proxy.
 *
 * Client contract (same as vite.config.ts /api-proxy middleware):
 *   POST /api-proxy/<slug>/<real-api-path>
 *   Header X-Proxy-Target: <upstream base URL>
 *
 * vercel.json rewrites /api-proxy/:path* → /api/proxy/:path*
 * so this function sees /api/proxy/<slug>/<real-api-path>.
 *
 * Example:
 *   /api-proxy/openai/v1/chat/completions
 *   X-Proxy-Target: https://api.openai.com
 *   → https://api.openai.com/v1/chat/completions
 *
 * Self-contained: Vercel compiles this file; no project imports.
 */

export const config = {
  runtime: 'edge',
  maxDuration: 300,
};

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const STRIP_REQUEST = new Set([
  ...HOP_BY_HOP,
  'cookie',
  'x-proxy-target',
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'x-vercel-forwarded-for',
  'x-vercel-id',
  'x-vercel-ip-country',
  'x-vercel-deployment-url',
  'x-vercel-proxied-for',
  'true-client-ip',
  'cf-connecting-ip',
  'cf-ray',
  'cf-ipcountry',
  'cdn-loop',
]);

const STRIP_RESPONSE = new Set([
  ...HOP_BY_HOP,
  'set-cookie',
  'content-encoding',
  'content-length',
  'alt-svc',
]);

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.internal',
  'instance-data',
  'host.docker.internal',
  'kubernetes',
  'kubernetes.default',
  'kubernetes.default.svc',
  'kubernetes.default.svc.cluster.local',
]);

const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.cluster.local'];

function corsHeaders(request?: Request): Headers {
  const headers = new Headers();
  const origin = request?.headers.get('origin');
  headers.set('Access-Control-Allow-Origin', origin || '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
  const requested = request?.headers.get('access-control-request-headers');
  headers.set(
    'Access-Control-Allow-Headers',
    requested || 'Authorization, Content-Type, Accept, X-Proxy-Target, x-api-key, anthropic-version, anthropic-beta, OpenAI-Beta, OpenAI-Organization',
  );
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Access-Control-Expose-Headers', '*');
  headers.set('Vary', 'Origin');
  return headers;
}

function jsonError(status: number, message: string, request?: Request): Response {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, '');
}

function isIPv4Octet(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 255;
}

/** Parse dotted / dword / hex IPv4 literals used in SSRF bypasses. */
function parseIPv4Literal(host: string): [number, number, number, number] | null {
  const h = host.trim().toLowerCase();
  if (!h) return null;

  const parsePart = (part: string): number | null => {
    if (!part) return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(part)) n = Number.parseInt(part.slice(2), 16);
    else if (/^0[0-7]+$/.test(part)) n = Number.parseInt(part, 8);
    else if (/^\d+$/.test(part)) n = Number.parseInt(part, 10);
    else return null;
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  if (!h.includes('.')) {
    const n = parsePart(h);
    if (n === null || n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }

  const parts = h.split('.');
  if (parts.length < 2 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    const n = parsePart(p);
    if (n === null) return null;
    nums.push(n);
  }

  if (nums.length === 4) {
    if (nums.some((n) => !isIPv4Octet(n))) return null;
    return [nums[0], nums[1], nums[2], nums[3]];
  }
  if (nums.length === 3) {
    if (!isIPv4Octet(nums[0]) || !isIPv4Octet(nums[1]) || nums[2] > 0xffff) return null;
    return [nums[0], nums[1], (nums[2] >> 8) & 255, nums[2] & 255];
  }
  if (nums.length === 2) {
    if (!isIPv4Octet(nums[0]) || nums[1] > 0xffffff) return null;
    return [nums[0], (nums[1] >> 16) & 255, (nums[1] >> 8) & 255, nums[1] & 255];
  }
  return null;
}

function isPrivateIPv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function splitIPv6(ip: string): number[] | null {
  let raw = ip.trim().toLowerCase();
  if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1, -1);
  if (raw.startsWith('::ffff:')) {
    const v4 = raw.slice(7);
    if (v4.includes('.')) {
      const oct = parseIPv4Literal(v4);
      if (!oct) return null;
      return [0, 0, 0, 0, 0, 0xffff, (oct[0] << 8) | oct[1], (oct[2] << 8) | oct[3]];
    }
  }

  const zone = raw.indexOf('%');
  if (zone !== -1) raw = raw.slice(0, zone);

  const sides = raw.split('::');
  if (sides.length > 2) return null;

  const parseGroup = (g: string): number | null => {
    if (!g || !/^[0-9a-f]{1,4}$/.test(g)) return null;
    return Number.parseInt(g, 16);
  };

  const left = sides[0] ? sides[0].split(':') : [];
  const right = sides.length === 2 ? (sides[1] ? sides[1].split(':') : []) : [];

  // dotted IPv4 tail (e.g. ::ffff:127.0.0.1 already handled; 2001:db8::192.168.0.1)
  const convertTail = (groups: string[]): number[] | null => {
    if (groups.length === 0) return [];
    const last = groups[groups.length - 1];
    if (last.includes('.')) {
      const oct = parseIPv4Literal(last);
      if (!oct) return null;
      groups = groups.slice(0, -1);
      const nums: number[] = [];
      for (const g of groups) {
        const n = parseGroup(g);
        if (n === null) return null;
        nums.push(n);
      }
      nums.push((oct[0] << 8) | oct[1], (oct[2] << 8) | oct[3]);
      return nums;
    }
    const nums: number[] = [];
    for (const g of groups) {
      const n = parseGroup(g);
      if (n === null) return null;
      nums.push(n);
    }
    return nums;
  };

  const leftN = convertTail(left);
  const rightN = convertTail(right);
  if (!leftN || !rightN) return null;

  if (sides.length === 1) {
    if (leftN.length !== 8) return null;
    return leftN;
  }

  const missing = 8 - leftN.length - rightN.length;
  if (missing < 0) return null;
  return [...leftN, ...Array(missing).fill(0), ...rightN];
}

function isPrivateIPv6(groups: number[]): boolean {
  if (groups.length !== 8) return true;
  const allZero = groups.every((g) => g === 0);
  if (allZero) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  // IPv4-mapped ::ffff:x.x.x.x
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    const a = (groups[6] >> 8) & 255;
    const b = groups[6] & 255;
    const c = (groups[7] >> 8) & 255;
    const d = groups[7] & 255;
    return isPrivateIPv4([a, b, c, d]);
  }
  const g0 = groups[0];
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return true;

  const v4 = parseIPv4Literal(host);
  if (v4 && isPrivateIPv4(v4)) return true;

  if (host.includes(':')) {
    const v6 = splitIPv6(host);
    if (v6 && isPrivateIPv6(v6)) return true;
    if (!v6) return true;
  }

  return false;
}

function isPrivateIpString(addr: string): boolean {
  const a = addr.trim().toLowerCase();
  const v4 = parseIPv4Literal(a);
  if (v4) return isPrivateIPv4(v4);
  const v6 = splitIPv6(a);
  if (v6) return isPrivateIPv6(v6);
  return isBlockedHostname(a);
}

type UrlReject = { status: 400 | 403; message: string };

function rejectUnsafeUrl(raw: string): UrlReject | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { status: 400, message: 'Invalid X-Proxy-Target URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { status: 403, message: 'Proxy target must use https' };
  }
  if (parsed.username || parsed.password) {
    return { status: 403, message: 'Proxy target must not include credentials' };
  }
  if (isBlockedHostname(parsed.hostname)) {
    return { status: 403, message: 'Proxy target host is not allowed' };
  }
  return null;
}

interface DohAnswer {
  type?: number;
  data?: string;
}

async function resolvedAddressesArePrivate(hostname: string): Promise<boolean | null> {
  // Literal IPs: already checked in rejectUnsafeUrl.
  if (parseIPv4Literal(hostname) || hostname.includes(':')) return false;

  const lookup = async (type: 'A' | 'AAAA'): Promise<DohAnswer[]> => {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2500);
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/dns-json' },
        signal: ac.signal,
        redirect: 'manual',
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { Answer?: DohAnswer[] };
      return Array.isArray(body.Answer) ? body.Answer : [];
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const [a, aaaa] = await Promise.all([lookup('A'), lookup('AAAA')]);
    const answers = [...a, ...aaaa];
    if (answers.length === 0) return false;
    for (const ans of answers) {
      const data = (ans.data || '').trim();
      if (!data) continue;
      if (ans.type === 5) {
        // CNAME
        if (isBlockedHostname(data.replace(/\.$/, ''))) return true;
        continue;
      }
      if (ans.type === 1 || ans.type === 28) {
        if (isPrivateIpString(data)) return true;
      }
    }
    return false;
  } catch {
    // DoH unavailable on this runtime/network — hostname checks already ran.
    return null;
  }
}

function stripMountAndSlug(pathname: string): string {
  let rest = pathname;
  const prefixes = ['/api/proxy/', '/api-proxy/', '/api/proxy', '/api-proxy'];
  for (const p of prefixes) {
    if (rest === p || rest.startsWith(p.endsWith('/') ? p : p + '/')) {
      rest = rest.slice(p.length);
      break;
    }
  }
  rest = rest.replace(/^\/+/, '');
  // Strip the first segment (provider slug), keep the real API path.
  // openai/v1/chat/completions → /v1/chat/completions
  const slash = rest.indexOf('/');
  if (slash === -1) return '/';
  const kept = rest.slice(slash);
  return kept || '/';
}

function filterRequestHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (STRIP_REQUEST.has(lower)) return;
    if (lower.startsWith('x-vercel-') || lower.startsWith('x-forwarded-') || lower.startsWith('cf-')) return;
    out.append(key, value);
  });
  return out;
}

function filterResponseHeaders(src: Headers, request?: Request): Headers {
  const out = corsHeaders(request);
  src.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (STRIP_RESPONSE.has(lower)) return;
    if (lower.startsWith('access-control-')) return;
    out.set(key, value);
  });
  const ct = (out.get('content-type') || '').toLowerCase();
  if (ct.includes('text/event-stream') || ct.includes('application/stream')) {
    out.set('Cache-Control', 'no-cache, no-transform');
    out.set('X-Accel-Buffering', 'no');
  }
  return out;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const targetHeader = request.headers.get('x-proxy-target')?.trim();
  if (!targetHeader) {
    return jsonError(400, 'Missing X-Proxy-Target header', request);
  }

  const targetReject = rejectUnsafeUrl(targetHeader);
  if (targetReject) {
    return jsonError(targetReject.status, targetReject.message, request);
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(targetHeader);
  } catch {
    return jsonError(400, 'Invalid X-Proxy-Target URL', request);
  }

  const incoming = new URL(request.url);
  const apiPath = stripMountAndSlug(incoming.pathname);
  const base = targetUrl.href.replace(/\/+$/, '');
  let dest: URL;
  try {
    dest = new URL(base + apiPath + incoming.search);
  } catch {
    return jsonError(400, 'Failed to build upstream URL', request);
  }

  const destReject = rejectUnsafeUrl(dest.toString());
  if (destReject) {
    return jsonError(destReject.status, destReject.message, request);
  }

  const privateDns = await resolvedAddressesArePrivate(dest.hostname);
  if (privateDns === true) {
    return jsonError(403, 'Proxy target resolved to a private address', request);
  }

  const method = request.method.toUpperCase();
  const outgoing = filterRequestHeaders(request.headers);

  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: outgoing,
    redirect: 'manual',
  };

  if (method !== 'GET' && method !== 'HEAD' && request.body) {
    init.body = request.body;
    init.duplex = 'half';
  }

  let upstream: Response;
  try {
    upstream = await fetch(dest.toString(), init);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream request failed';
    return jsonError(502, message, request);
  }

  // Do not follow redirects. If a Location is present, refuse private destinations
  // so a 3xx cannot be used as an SSRF gadget if something client-side follows it.
  const location = upstream.headers.get('location');
  if (location && upstream.status >= 300 && upstream.status < 400) {
    try {
      const loc = new URL(location, dest);
      const locReject = rejectUnsafeUrl(loc.toString());
      if (locReject || isBlockedHostname(loc.hostname)) {
        return jsonError(403, 'Upstream redirect target is not allowed', request);
      }
    } catch {
      return jsonError(502, 'Upstream returned an invalid redirect', request);
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: filterResponseHeaders(upstream.headers, request),
  });
}

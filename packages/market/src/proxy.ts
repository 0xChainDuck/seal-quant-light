import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type FetchImplementation = (url: string, init?: Record<string, unknown>) => Promise<Response>;
type ProxyAgentConstructor = new (proxy: string | URL) => unknown;

const require = createRequire(import.meta.url);
const proxyAgents = new Map<string, unknown>();
let ccxtRootCache: string | null = null;
let ccxtNodeFetchCache: Promise<FetchImplementation> | null = null;
let ccxtHttpProxyAgentCache: Promise<ProxyAgentConstructor> | null = null;
let ccxtHttpsProxyAgentCache: Promise<ProxyAgentConstructor> | null = null;

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function envFlag(value: string | undefined, fallback = true): boolean {
  if (value === undefined) {
    return fallback;
  }

  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

function proxyEnabled(): boolean {
  return envFlag(envValue('SEAL_PROXY_ENABLED', 'PROXY_ENABLED'), true);
}

function ccxtRoot(): string {
  if (!ccxtRootCache) {
    ccxtRootCache = resolve(dirname(require.resolve('ccxt')), '..');
  }

  return ccxtRootCache;
}

async function importCcxtFile(path: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(resolve(ccxtRoot(), path)).href) as Promise<Record<string, unknown>>;
}

async function loadCcxtNodeFetch(): Promise<FetchImplementation> {
  ccxtNodeFetchCache ??= importCcxtFile('js/src/static_dependencies/node-fetch/index.js').then(
    (mod) => mod.default as FetchImplementation
  );

  return ccxtNodeFetchCache;
}

async function loadHttpProxyAgent(): Promise<ProxyAgentConstructor> {
  ccxtHttpProxyAgentCache ??= importCcxtFile(
    'js/src/static_dependencies/proxies/http-proxy-agent/index.js'
  ).then((mod) => mod.HttpProxyAgent as ProxyAgentConstructor);

  return ccxtHttpProxyAgentCache;
}

async function loadHttpsProxyAgent(): Promise<ProxyAgentConstructor> {
  ccxtHttpsProxyAgentCache ??= importCcxtFile(
    'js/src/static_dependencies/proxies/https-proxy-agent/index.js'
  ).then((mod) => mod.HttpsProxyAgent as ProxyAgentConstructor);

  return ccxtHttpsProxyAgentCache;
}

function normalizeProxyUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol.startsWith('socks')
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function isSocksProxy(value: string | undefined): boolean {
  return value?.startsWith('socks') ?? false;
}

function isHttpProxy(value: string | undefined): boolean {
  return value?.startsWith('http:') || value?.startsWith('https:') || false;
}

function noProxyPatterns(): string[] {
  return (envValue('SEAL_NO_PROXY', 'NO_PROXY', 'no_proxy') ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function matchesNoProxy(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[(.*)]$/, '$1');
  const cleanPattern = pattern.includes(':') && pattern.split(':').length === 2
    ? (pattern.split(':')[0] ?? pattern)
    : pattern.replace(/^\[(.*)]$/, '$1');
  if (cleanPattern === '*') {
    return true;
  }

  if (cleanPattern.startsWith('.')) {
    return host.endsWith(cleanPattern);
  }

  return host === cleanPattern || host.endsWith(`.${cleanPattern}`);
}

function shouldSkipProxy(url: URL): boolean {
  return noProxyPatterns().some((pattern) => matchesNoProxy(url.hostname, pattern));
}

export function resolveHttpProxyForUrl(url: URL): string | undefined {
  if (!proxyEnabled() || shouldSkipProxy(url)) {
    return undefined;
  }

  const proxy =
    url.protocol === 'http:'
      ? envValue('SEAL_HTTP_PROXY', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy')
      : envValue(
          'SEAL_HTTPS_PROXY',
          'SEAL_HTTP_PROXY',
          'HTTPS_PROXY',
          'https_proxy',
          'HTTP_PROXY',
          'http_proxy',
          'ALL_PROXY',
          'all_proxy'
        );

  const normalized = normalizeProxyUrl(proxy);
  return isHttpProxy(normalized) ? normalized : undefined;
}

export function resolveCcxtProxyConfig(): Record<string, string> {
  if (!proxyEnabled()) {
    return {};
  }

  const restProxy = normalizeProxyUrl(
    envValue(
      'SEAL_HTTPS_PROXY',
      'SEAL_HTTP_PROXY',
      'HTTPS_PROXY',
      'https_proxy',
      'HTTP_PROXY',
      'http_proxy',
      'ALL_PROXY',
      'all_proxy'
    )
  );
  const wsProxy = normalizeProxyUrl(
    envValue(
      'SEAL_WSS_PROXY',
      'SEAL_WS_PROXY',
      'SEAL_HTTPS_PROXY',
      'SEAL_HTTP_PROXY',
      'WSS_PROXY',
      'wss_proxy',
      'WS_PROXY',
      'ws_proxy',
      'HTTPS_PROXY',
      'https_proxy',
      'HTTP_PROXY',
      'http_proxy',
      'ALL_PROXY',
      'all_proxy'
    )
  );
  const config: Record<string, string> = {};

  if (isSocksProxy(restProxy)) {
    config.socksProxy = restProxy!;
  } else if (isHttpProxy(restProxy)) {
    config.httpsProxy = restProxy!;
  }

  if (isSocksProxy(wsProxy)) {
    config.wsSocksProxy = wsProxy!;
  } else if (isHttpProxy(wsProxy)) {
    config.wssProxy = wsProxy!;
  }

  return config;
}

async function proxyAgentFor(url: URL, proxyUrl: string): Promise<unknown> {
  const key = `${url.protocol}:${proxyUrl}`;
  const cached = proxyAgents.get(key);
  if (cached) {
    return cached;
  }

  const Agent = url.protocol === 'http:' ? await loadHttpProxyAgent() : await loadHttpsProxyAgent();
  const agent = new Agent(proxyUrl);
  proxyAgents.set(key, agent);

  return agent;
}

export async function fetchWithProxy(url: URL, init: RequestInit = {}): Promise<Response> {
  const proxyUrl = resolveHttpProxyForUrl(url);
  if (!proxyUrl) {
    return fetch(url, init);
  }

  const fetchImplementation = await loadCcxtNodeFetch();
  const agent = await proxyAgentFor(url, proxyUrl);

  return fetchImplementation(url.toString(), {
    ...init,
    agent
  });
}

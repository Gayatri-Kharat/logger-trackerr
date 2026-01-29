// src/setupProxy.js
/* eslint-disable @typescript-eslint/no-var-requires */
const { createProxyMiddleware } = require('http-proxy-middleware');

const ALLOWED_HOSTS = [
  'https://amd-apigw-vfde-il08-env24-runtime.apps.ildelocpvfd408.ocpd.corp.amdocs.com/lightTracer/v1/managementLoggers',
  'https://keycloak-vfde-il08-env24-runtime.apps.ildelocpvfd408.ocpd.corp.amdocs.com/auth/realms/apigw/protocol/openid-connect/token',
];

function isAllowedOrigin(origin) {
  try {
    const u = new URL(origin);
    return ['https:', 'http:'].includes(u.protocol) && ALLOWED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

function pickForwardHeaders(req) {
  const h = {};
  const allow = [
    'accept',
    'accept-encoding',
    'accept-language',
    'authorization',
    'cache-control',
    'content-type',
    'pragma',
    'user-agent',
    'x-api-logger',
  ];
  for (const name of allow) {
    if (typeof req.headers[name] === 'string') h[name] = req.headers[name];
  }
  return h;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
}

module.exports = function (app) {
  // Header-based routing for /lightTracer
  app.use('/lightTracer', async (req, res) => {
    try {
      const origin = req.headers['x-target-origin'];
      if (!isAllowedOrigin(origin)) {
        res.status(400).json({ error: 'Bad Request', message: 'Missing or disallowed x-target-origin' });
        return;
      }
      const upstreamUrl = new URL(req.url, origin); // keep path + query
      const method = req.method || 'GET';
      const headers = pickForwardHeaders(req);
      const body = method === 'GET' || method === 'HEAD' ? undefined : await readRawBody(req);

      const upstream = await fetch(upstreamUrl.toString(), { method, headers, body, redirect: 'manual' });

      for (const [k, v] of upstream.headers.entries()) {
        const lk = k.toLowerCase();
        if (['content-encoding', 'transfer-encoding', 'connection'].includes(lk)) continue;
        res.setHeader(k, v);
      }
      res.status(upstream.status);
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch (err) {
      console.error('lightTracer proxy error:', err);
      res.status(502).json({ error: 'Bad Gateway', message: String(err?.message || err) });
    }
  });

  // Fallback /cors-proxy
  app.use('/cors-proxy', async (req, res) => {
    try {
      const origin = req.headers['x-target-origin'];
      const urlObj = new URL(req.url, 'http://localhost');
      const qpTarget = urlObj.searchParams.get('__target');

      let upstreamUrl = null;
      if (origin && isAllowedOrigin(origin)) {
        upstreamUrl = new URL(req.url.replace(/^\/cors-proxy/, ''), origin);
      } else if (qpTarget) {
        const u = new URL(qpTarget);
        if (!isAllowedOrigin(u.origin)) {
          return res.status(400).json({ error: 'Bad Request', message: 'Disallowed __target origin' });
        }
        upstreamUrl = u;
      }

      if (!upstreamUrl) {
        return res.status(400).json({ error: 'Bad Request', message: 'Missing x-target-origin or __target' });
      }

      const method = req.method || 'GET';
      const headers = pickForwardHeaders(req);
      const body = method === 'GET' || method === 'HEAD' ? undefined : await readRawBody(req);

      const upstream = await fetch(upstreamUrl.toString(), { method, headers, body, redirect: 'manual' });

      for (const [k, v] of upstream.headers.entries()) {
        const lk = k.toLowerCase();
        if (['content-encoding', 'transfer-encoding', 'connection'].includes(lk)) continue;
        res.setHeader(k, v);
      }
      res.status(upstream.status);
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch (err) {
      console.error('cors-proxy error:', err);
      res.status(502).json({ error: 'Bad Gateway', message: String(err?.message || err) });
    }
  });
};
/**
 * Web geliştirme: tarayıcıdan doğrudan *.supabase.co Edge çağrısı CORS/preflight ile düşer.
 * `/_supabase-fn/*` istekleri Metro sunucusundan Supabase `functions/v1/*` adresine iletilir (aynı origin).
 */
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabaseOrigin = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');

/** @param {import('http').IncomingMessage} req */
function isSupabaseFnProxyPath(req) {
  const u = req.url || '';
  return u.startsWith('/_supabase-fn');
}

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

if (supabaseOrigin) {
  const upstreamEnhance = config.server?.enhanceMiddleware;
  const { createProxyMiddleware } = require('http-proxy-middleware');

  const fnProxy = createProxyMiddleware({
    target: supabaseOrigin,
    changeOrigin: true,
    pathRewrite: { '^/_supabase-fn': '/functions/v1' },
    secure: true,
    logLevel: 'warn',
  });

  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware, server) => {
      const inner = upstreamEnhance ? upstreamEnhance(middleware, server) : middleware;
      return (req, res, next) => {
        if (!isSupabaseFnProxyPath(req)) {
          return inner(req, res, next);
        }
        // Bozuk Edge sürümleri OPTIONS’ta 500 dönebiliyor; tarayıcı preflight’ı burada bitir.
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader(
            'Access-Control-Allow-Headers',
            'authorization, x-client-info, apikey, content-type, prefer, accept, accept-profile, content-profile, range'
          );
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
          res.setHeader('Access-Control-Max-Age', '86400');
          res.statusCode = 204;
          res.end();
          return;
        }
        return fnProxy(req, res, next);
      };
    },
  };
}

module.exports = config;

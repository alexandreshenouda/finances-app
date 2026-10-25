const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const ALLOWED_HOSTS = new Set([
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
]);

const prevEnhanceMiddleware = config.server?.enhanceMiddleware;

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware, metroServer) => {
    const baseMiddleware = prevEnhanceMiddleware
      ? prevEnhanceMiddleware(metroMiddleware, metroServer)
      : metroMiddleware;

    return async (req, res, next) => {
      try {
        const reqUrl = req.url || '';
        if (reqUrl.startsWith('/__yahoo')) {
          const parsed = new URL(reqUrl, 'http://localhost');
          const target = parsed.searchParams.get('url') || '';
          let targetUrl;
          try {
            targetUrl = new URL(target);
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Invalid target URL' }));
            return;
          }

          if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Host not allowed' }));
            return;
          }

          const upstream = await fetch(targetUrl.toString(), {
            headers: {
              'User-Agent': USER_AGENT,
              Accept: 'application/json',
            },
          });

          const body = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(body);
          return;
        }
      } catch (err) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
        return;
      }

      return baseMiddleware(req, res, next);
    };
  },
};

module.exports = config;

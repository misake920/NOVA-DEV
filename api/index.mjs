import { createApp } from '../server/index.mjs';

const app = createApp();
export default function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const forwarded = url.searchParams.get('__ghost_path') || req.query?.__ghost_path;
  if (typeof forwarded === 'string' && /^\/api\/[A-Za-z0-9/_-]*$/.test(forwarded)) {
    url.pathname = forwarded;
    url.searchParams.delete('__ghost_path');
    req.url = url.pathname + url.search;
  }
  return app(req, res);
}

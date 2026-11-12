// Servidor local per provar sense Netlify:  ADMIN_KEY=prova node dev-server.mjs
// Fa servir la mateixa lògica (lib/core.mjs) amb un emmagatzematge en un fitxer JSON local.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './lib/core.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8888);
const FILE = process.env.DATA_FILE || path.join(dir, '.local-data.json');
let data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const persist = () => fs.writeFileSync(FILE, JSON.stringify(data));
const store = {
  async get(k) { return k in data ? structuredClone(data[k]) : null; },
  async setJSON(k, v) { data[k] = v; persist(); },
  async delete(k) { delete data[k]; persist(); },
  async list({ prefix = '' } = {}) { return { blobs: Object.keys(data).filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
};
const PAGES = { '/': 'index.html', '/pantalla': 'pantalla.html', '/admin': 'admin.html', '/cartell': 'cartell.html' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  let file = PAGES[u.pathname] || (u.pathname.startsWith('/c/') ? 'connect.html' : null);
  if (!file && /^\/(static|vendor)\//.test(u.pathname)) file = u.pathname.slice(1);
  if (file) {
    const f = path.join(dir, 'public', path.normalize(file));
    if (!f.startsWith(path.join(dir, 'public')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    return fs.createReadStream(f).pipe(res);
  }
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await handle(new Request(u, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), store, { ADMIN_KEY: process.env.ADMIN_KEY || 'prova' });
  const headers = Object.fromEntries(r.headers);
  const sc = r.headers.getSetCookie?.(); if (sc?.length) headers['set-cookie'] = sc;
  res.writeHead(r.status, headers);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`Local: http://localhost:${PORT}  ·  /pantalla  ·  /admin (clau: ${process.env.ADMIN_KEY || 'prova'})`));

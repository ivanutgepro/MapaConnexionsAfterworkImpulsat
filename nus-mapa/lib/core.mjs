// NUS · Mapa de connexions — lògica de l'API (independent de l'emmagatzematge)
// store: { get(key,{type:'json'}), setJSON(key,val), delete(key), list({prefix}) → {blobs:[{key}]} }
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import CONFIG from './config.mjs';

const XARXA_IDS = new Set(CONFIG.xarxes.map(x => x.id));
const SECTORS = new Set(CONFIG.sectors);
const XNOM = Object.fromEntries(CONFIG.xarxes.map(x => [x.id, x.nom]));
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_STATE = { reveal: false, registreObert: true };

// Les persones no canvien un cop creades: es guarden en memòria mentre la funció està activa.
const cache = new Map();

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const pub = p => ({ id: p.id, code: p.code, nom: p.nom, empresa: p.empresa, sector: p.sector, xarxa: p.xarxa });
const pairKey = (a, b) => [a, b].sort().join('__');

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}
function cookies(req) {
  return Object.fromEntries((req.headers.get('cookie') || '').split(';').map(s => s.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function tokenCookie(origin, token) {
  return `nus_t=${token}; Path=/; Max-Age=${60 * 60 * 24 * 60}; HttpOnly; SameSite=Lax${origin.startsWith('https') ? '; Secure' : ''}`;
}
async function body(req) {
  const t = await req.text();
  if (t.length > 10000) throw new Error('Massa dades');
  try { return t ? JSON.parse(t) : {}; } catch { throw new Error('JSON invàlid'); }
}
function csv(rows) {
  const esc = v => { const s = String(v == null ? '' : v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + rows.map(r => r.map(esc).join(';')).join('\n');
}
function safeEq(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// ---------- Accés a dades ----------
async function getPerson(store, id) {
  if (cache.has(id)) return cache.get(id);
  const p = await store.get('p/' + id, { type: 'json' });
  if (p) cache.set(id, p);
  return p;
}
async function personByToken(store, token) {
  if (!token || !/^[\w-]{10,64}$/.test(token)) return null;
  const r = await store.get('t/' + token, { type: 'json' });
  return r ? getPerson(store, r.id) : null;
}
async function personByCode(store, code) {
  code = String(code || '').toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) return null;
  const r = await store.get('c/' + code, { type: 'json' });
  return r ? getPerson(store, r.id) : null;
}
async function getState(store) { return { ...DEFAULT_STATE, ...((await store.get('state', { type: 'json' })) || {}) }; }
const keys = async (store, prefix) => (await store.list({ prefix })).blobs.map(b => b.key.slice(prefix.length));

async function loadAll(store) {
  const [pIds, cafe, collab] = await Promise.all([keys(store, 'p/'), keys(store, 'x/'), keys(store, 'k/')]);
  const people = (await Promise.all(pIds.map(id => getPerson(store, id)))).filter(Boolean);
  const ids = new Set(people.map(p => p.id));
  for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
  const collabSet = new Set(collab);
  const connections = cafe.concat(collab.filter(k => !cafe.includes(k))).map(k => {
    const [a, b] = k.split('__');
    return { id: k, a, b, type: collabSet.has(k) ? 'collab' : 'cafe' };
  }).filter(c => ids.has(c.a) && ids.has(c.b));
  return { people, connections };
}

async function createPerson(store, input, origen) {
  const nom = clean(input.nom, 60), empresa = clean(input.empresa, 80);
  const sector = clean(input.sector, 60), xarxa = clean(input.xarxa, 40), contacte = clean(input.contacte, 120);
  if (!nom) throw new Error('Cal el nom.');
  if (!SECTORS.has(sector)) throw new Error('Tria un sector del llistat.');
  if (!XARXA_IDS.has(xarxa)) throw new Error('Tria una xarxa del llistat.');
  if (input.consent !== true) throw new Error('Cal acceptar el consentiment.');
  let code;
  for (let i = 0; i < 50; i++) {
    code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    if (!(await store.get('c/' + code, { type: 'json' }))) break;
  }
  const p = {
    id: crypto.randomUUID(), code, token: crypto.randomBytes(18).toString('base64url'),
    nom, empresa, sector, xarxa, contacte, origen, consent: new Date().toISOString(), createdAt: Date.now()
  };
  await store.setJSON('c/' + code, { id: p.id });
  await store.setJSON('t/' + p.token, { id: p.id });
  await store.setJSON('p/' + p.id, p);
  cache.set(p.id, p);
  return p;
}

// ---------- Estadístiques ----------
export function stats(people, connections) {
  const P = new Map(people.map(p => [p.id, p]));
  let entreXarxes = 0, collab = 0, entreSectors = 0;
  const parellsX = {}, parellsS = {}, xarxesDe = {}, grau = {};
  for (const c of connections) {
    const a = P.get(c.a), b = P.get(c.b); if (!a || !b) continue;
    if (c.type === 'collab') collab++;
    grau[a.id] = (grau[a.id] || 0) + 1; grau[b.id] = (grau[b.id] || 0) + 1;
    (xarxesDe[a.id] ||= new Set()).add(b.xarxa);
    (xarxesDe[b.id] ||= new Set()).add(a.xarxa);
    if (a.xarxa !== b.xarxa) { entreXarxes++; const k = [XNOM[a.xarxa], XNOM[b.xarxa]].sort().join(' ↔ '); parellsX[k] = (parellsX[k] || 0) + 1; }
    if (a.sector !== b.sector) { entreSectors++; const k = [a.sector, b.sector].sort().join(' ↔ '); parellsS[k] = (parellsS[k] || 0) + 1; }
  }
  const top = (o, n) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => ({ k, v }));
  const ponts = Object.entries(xarxesDe)
    .map(([id, s]) => ({ nom: P.get(id).nom, xarxes: [...s].filter(x => x !== P.get(id).xarxa).length, connexions: grau[id] }))
    .filter(x => x.xarxes > 0).sort((x, y) => y.xarxes - x.xarxes || y.connexions - x.connexions).slice(0, 3);
  const perXarxa = {};
  for (const p of people) perXarxa[p.xarxa] = (perXarxa[p.xarxa] || 0) + 1;
  const total = connections.length;
  return {
    persones: people.length, connexions: total, collab, cafe: total - collab, entreXarxes, entreSectors,
    pctEntreXarxes: total ? Math.round(100 * entreXarxes / total) : 0,
    topParellsXarxes: top(parellsX, 3), topParellsSectors: top(parellsS, 3), ponts, perXarxa, grau
  };
}

// ---------- Rutes ----------
export async function handle(req, store, env = {}) {
  const url = new URL(req.url);
  const origin = env.BASE_URL || url.origin;
  const p = url.pathname, m = req.method;
  const ADMIN_KEY = env.ADMIN_KEY || '';
  try {
    const me = await personByToken(store, cookies(req).nus_t);

    if (m === 'GET' && p.startsWith('/jo/')) {
      const person = await personByToken(store, p.slice(4));
      return new Response(null, { status: 302, headers: person ? { Location: '/', 'Set-Cookie': tokenCookie(origin, person.token) } : { Location: '/' } });
    }
    if (m === 'GET' && p.startsWith('/qr/')) {
      let text;
      if (p === '/qr/registre.svg') text = origin + '/';
      else {
        const person = await personByCode(store, p.slice(4, 8));
        if (!person || !p.endsWith('.svg')) return new Response('No trobat', { status: 404 });
        text = `${origin}/c/${person.code}`;
      }
      const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B1B3A', light: '#FFFFFF' } });
      return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' } });
    }

    if (m === 'GET' && p === '/api/config') return json({ ...CONFIG, registreObert: (await getState(store)).registreObert });

    if (m === 'GET' && p === '/api/me') {
      if (!me) return json({ me: null });
      const { people, connections } = await loadAll(store);
      const P = new Map(people.map(x => [x.id, x]));
      const connexions = connections.filter(c => c.a === me.id || c.b === me.id).map(c => {
        const o = P.get(c.a === me.id ? c.b : c.a);
        return { ...pub(o), contacte: o.contacte, type: c.type };
      });
      return json({ me: { ...pub(me), contacte: me.contacte, link: `${origin}/jo/${me.token}` }, connexions });
    }

    if (m === 'POST' && p === '/api/register') {
      if (!(await getState(store)).registreObert) return json({ error: 'El registre està tancat.' }, 403);
      if (me) return json({ ok: true, code: me.code });
      const person = await createPerson(store, await body(req), 'mòbil');
      return json({ ok: true, code: person.code }, 200, { 'Set-Cookie': tokenCookie(origin, person.token) });
    }

    if (m === 'GET' && p.startsWith('/api/person/')) {
      const o = await personByCode(store, p.slice(12));
      if (!o) return json({ error: 'Aquest codi no existeix.' }, 404);
      let connexio = null;
      if (me && me.id !== o.id) {
        const k = pairKey(me.id, o.id);
        if (await store.get('k/' + k, { type: 'json' })) connexio = 'collab';
        else if (await store.get('x/' + k, { type: 'json' })) connexio = 'cafe';
      }
      return json({ person: pub(o), self: !!me && me.id === o.id, connexio });
    }

    if (m === 'POST' && p === '/api/connect') {
      if (!me) return json({ error: 'Primer registra\'t.' }, 401);
      const b = await body(req);
      const o = await personByCode(store, b.code);
      if (!o) return json({ error: 'Aquest codi no existeix.' }, 404);
      if (o.id === me.id) return json({ error: 'Aquest és el teu propi QR 🙂' }, 400);
      const k = pairKey(me.id, o.id);
      const rec = { by: me.id, at: Date.now() };
      if (!(await store.get('x/' + k, { type: 'json' }))) await store.setJSON('x/' + k, rec);
      if (b.type === 'collab') await store.setJSON('k/' + k, rec);
      const type = b.type === 'collab' || (await store.get('k/' + k, { type: 'json' })) ? 'collab' : 'cafe';
      return json({ ok: true, type, person: { ...pub(o), contacte: o.contacte } });
    }

    if (m === 'GET' && p === '/api/graph') {
      const [{ people, connections }, state] = await Promise.all([loadAll(store), getState(store)]);
      const s = stats(people, connections); delete s.grau;
      return json({
        nodes: people.map(x => ({ id: x.id, nom: x.nom, xarxa: x.xarxa, sector: x.sector })),
        links: connections.map(c => ({ id: c.id, source: c.a, target: c.b, type: c.type })),
        stats: s, state
      });
    }

    // ----- Administració -----
    if (p.startsWith('/api/admin/')) {
      if (!ADMIN_KEY) return json({ error: 'Falta definir ADMIN_KEY a Netlify (Site configuration → Environment variables).' }, 500);
      if (!safeEq(req.headers.get('x-admin-key') || url.searchParams.get('key'), ADMIN_KEY)) return json({ error: 'Clau d\'administració incorrecta.' }, 401);
      const a = p.slice(11);

      if (m === 'GET' && a === 'people') {
        const [{ people, connections }, state] = await Promise.all([loadAll(store), getState(store)]);
        const s = stats(people, connections);
        const grau = s.grau; delete s.grau;
        return json({ people: people.map(x => ({ ...pub(x), contacte: x.contacte, origen: x.origen, createdAt: x.createdAt, link: `${origin}/jo/${x.token}`, grau: grau[x.id] || 0 })), stats: s, state });
      }
      if (m === 'POST' && a === 'register') {
        const x = await createPerson(store, await body(req), 'acollida');
        return json({ ok: true, code: x.code, link: `${origin}/jo/${x.token}` });
      }
      if (m === 'POST' && a === 'state') {
        const b = await body(req), st = await getState(store);
        if (typeof b.reveal === 'boolean') st.reveal = b.reveal;
        if (typeof b.registreObert === 'boolean') st.registreObert = b.registreObert;
        await store.setJSON('state', st);
        return json({ ok: true, state: st });
      }
      if (m === 'POST' && a === 'delete-person') {
        const { id } = await body(req);
        const x = await getPerson(store, id);
        if (x) {
          const pairs = (await Promise.all(['x/', 'k/'].map(pre => keys(store, pre).then(ks => ks.filter(k => k.split('__').includes(id)).map(k => pre + k))))).flat();
          await Promise.all([...pairs, 'p/' + x.id, 't/' + x.token, 'c/' + x.code].map(k => store.delete(k)));
          cache.delete(id);
        }
        return json({ ok: true });
      }
      if (m === 'POST' && a === 'wipe') {
        if ((await body(req)).confirm !== 'ESBORRAR') return json({ error: 'Escriu ESBORRAR per confirmar.' }, 400);
        const all = (await store.list()).blobs.map(b => b.key);
        for (let i = 0; i < all.length; i += 20) await Promise.all(all.slice(i, i + 20).map(k => store.delete(k)));
        cache.clear();
        return json({ ok: true });
      }

      const { people, connections } = await loadAll(store);
      const P = new Map(people.map(x => [x.id, x]));
      const stamp = new Date().toISOString().slice(0, 10);
      const dl = (name, text, type = 'text/csv; charset=utf-8') => new Response(text, { headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
      const grau = stats(people, connections).grau;
      if (m === 'GET' && a === 'export/persones.csv') return dl(`nus-persones-${stamp}.csv`, csv([['codi', 'nom', 'empresa', 'sector', 'xarxa', 'contacte', 'registre', 'connexions'],
        ...people.map(x => [x.code, x.nom, x.empresa, x.sector, XNOM[x.xarxa], x.contacte, x.origen, grau[x.id] || 0])]));
      if (m === 'GET' && a === 'export/connexions.csv') return dl(`nus-connexions-${stamp}.csv`, csv([['tipus', 'persona A', 'xarxa A', 'sector A', 'persona B', 'xarxa B', 'sector B'],
        ...connections.map(c => { const A = P.get(c.a), B = P.get(c.b); return [c.type === 'collab' ? 'col·laboració' : 'contacte/cafè', A.nom, XNOM[A.xarxa], A.sector, B.nom, XNOM[B.xarxa], B.sector]; })]));
      if (m === 'GET' && a === 'export/seguiment.csv') return dl(`nus-seguiment-30dies-${stamp}.csv`, csv([['persona A', 'empresa A', 'contacte A', 'persona B', 'empresa B', 'contacte B'],
        ...connections.filter(c => c.type === 'collab').map(c => { const A = P.get(c.a), B = P.get(c.b); return [A.nom, A.empresa, A.contacte, B.nom, B.empresa, B.contacte]; })]));
      if (m === 'GET' && a === 'export/graf.json') {
        const s = stats(people, connections); delete s.grau;
        return dl(`nus-graf-${stamp}.json`, JSON.stringify({ xarxes: CONFIG.xarxes, nodes: people.map(x => ({ id: x.id, nom: x.nom, xarxa: x.xarxa, sector: x.sector })), links: connections.map(c => ({ source: c.a, target: c.b, type: c.type })), stats: s }, null, 2), 'application/json');
      }
      return json({ error: 'No trobat' }, 404);
    }
    return json({ error: 'No trobat' }, 404);
  } catch (e) {
    return json({ error: e.message || 'Error' }, 400);
  }
}

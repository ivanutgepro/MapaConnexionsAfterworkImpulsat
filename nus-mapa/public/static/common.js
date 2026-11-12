const $ = s => document.querySelector(s);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
async function api(url, body, headers = {}) {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) } : { headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Hi ha hagut un error. Torna-ho a provar.');
  return j;
}
function show(id) { ['reg', 'app', 'closed', 'need', 'conn', 'done'].forEach(s => { const e = document.getElementById(s); if (e) e.classList.toggle('hidden', s !== id); }); }
function xarxa(cfg, id) { return cfg.xarxes.find(x => x.id === id) || { nom: '', color: '#94A3B8' }; }
function fillSelects(cfg) {
  const s = $('#sector'), x = $('#xarxa');
  if (s) cfg.sectors.forEach(v => { const o = el('option', null, v); o.value = v; s.append(o); });
  if (x) {
    const groups = { institucional: 'Comunitats institucionals', privada: 'Comunitats privades', altra: 'Altres' };
    Object.entries(groups).forEach(([k, label]) => {
      const g = document.createElement('optgroup'); g.label = label;
      cfg.xarxes.filter(v => v.tipus === k).forEach(v => { const o = el('option', null, v.nom); o.value = v.id; g.append(o); });
      x.append(g);
    });
  }
}

/* VOIDBREAKERS – PWA-Prototyp: Menüs (DOM), Kampf + Beschwörung (Canvas 2D)
   Logische Auflösung 360x640 (9:16), wird auf jedes Display skaliert. */
(() => {
'use strict';

/* ====================== Utils ====================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = a => a[Math.floor(Math.random() * a.length)];
const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const EL = { red: '#ff3b4e', blue: '#3b8bff', green: '#34e07f', yellow: '#ffd23b', purple: '#b455ff' };
const ELN = { red: 'Rot', blue: 'Blau', green: 'Grün', yellow: 'Gelb', purple: 'Violett' };
const RARC = { N: '#9fb4d0', R: '#ffcf4a', U: '#c36bff' };
const RARN = { N: 'Gewöhnlich', R: 'Selten', U: 'Ultra-Selten' };
const ENERGY_MAX = 30, ENERGY_SEC = 120;
const KEY = 'voidbreakers.save.v1';
const STAT_N = { hp: 'LP', atk: 'Angriff', def: 'Verteidigung' };

let D = null;   // Spieldaten (data.json)
let S = null;   // Spielstand
const R = { w: 360, h: 640, dpr: 1, k: 1 };
const app = $('#app'), bgc = $('#bg'), bc = $('#bc'), gc = $('#gc');
const bgx = bgc.getContext('2d'), bcx = bc.getContext('2d'), gcx = gc.getContext('2d');
const b3 = $('#b3');
let S3 = null;   // Three.js-Schicht (scene3d.js); null = 2D-Fallback
function fail3d(e) {
  console.warn('3D deaktiviert, 2D-Fallback:', e);
  try { if (S3) S3.setVisible(false); } catch (_) { /* egal */ }
  S3 = null; if (typeof B !== 'undefined' && B) B.use3d = false;
}
let scr = 'start', tab = 'home', teamSel = null, bannerIdx = 0;

/* ====================== Speicherstand (LocalStorage) ====================== */
function newSave() {
  const owned = {};
  D.chars.filter(c => c.rar === 'N').forEach(c => owned[c.id] = { lv: 1, soul: [4] });
  return {
    v: 1, lvl: 1, xp: 0, energy: ENERGY_MAX, eTs: Date.now(), crystals: 1500, gold: 6000,
    owned, team: D.chars.filter(c => c.rar === 'N').map(c => c.id), main: 'kael',
    equip: {}, items: {}, pity: 0, cleared: {}, daily: 0, guildDaily: 0, muted: false, arena: { pts: 0, wins: 0, losses: 0 }
  };
}
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
  if (!S || !S.v) S = newSave();
  if (!S.arena) S.arena = { pts: 0, wins: 0, losses: 0 };
  tickEnergy();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* privat/voll */ } }
function tickEnergy() {
  const now = Date.now();
  if (S.energy >= ENERGY_MAX) { S.eTs = now; return; }
  const n = Math.floor((now - S.eTs) / 1000 / ENERGY_SEC);
  if (n > 0) {
    S.energy = Math.min(ENERGY_MAX, S.energy + n);
    S.eTs += n * ENERGY_SEC * 1000;
    if (S.energy >= ENERGY_MAX) S.eTs = now;
  }
}
function spendEnergy(n) {
  tickEnergy();
  if (S.energy < n) return false;
  if (S.energy >= ENERGY_MAX) S.eTs = Date.now();
  S.energy -= n;
  return true;
}

/* ====================== Charakter-Werte ====================== */
const CH = id => D.chars.find(c => c.id === id);
const SOUL = ['hp', 'atk', 'def', 'hp', 'all', 'def', 'atk', 'cap', 'hp']; // 3x3-Gitter, Mitte (4) ist gratis
const SOUL_LBL = { hp: '+10% LP', atk: '+10% ATK', def: '+10% DEF', all: '+6% Alle', cap: '+10 Level-Cap' };
const nb = i => { const r = [], x = i % 3, y = Math.floor(i / 3); if (x > 0) r.push(i - 1); if (x < 2) r.push(i + 1); if (y > 0) r.push(i - 3); if (y < 2) r.push(i + 3); return r; };
function capOf(id) {
  const o = S.owned[id], c = CH(id);
  return 20 + o.soul.filter(i => SOUL[i] === 'cap').length * 10 + (c.rar === 'U' ? 20 : c.rar === 'R' ? 10 : 0);
}
function statsOf(id) {
  const c = CH(id), o = S.owned[id] || { lv: 1, soul: [4] };
  const m = 1 + (o.lv - 1) * 0.06, b = { hp: 0, atk: 0, def: 0 };
  o.soul.forEach(i => {
    const t = SOUL[i];
    if (t === 'all') { b.hp += .06; b.atk += .06; b.def += .06; } else if (b[t] !== undefined) b[t] += .1;
  });
  (S.equip[id] || []).forEach(it => {
    if (!it) return;
    const I = D.items.find(x => x.id === it);
    if (I) b[I.stat] += I.v;
  });
  return { hp: Math.round(c.hp * m * (1 + b.hp)), atk: Math.round(c.atk * m * (1 + b.atk)), def: Math.round(c.def * m * (1 + b.def)) };
}
const adv = (a, b) => D.elements[a].beats === b ? 1.3 : D.elements[b].beats === a ? 0.8 : 1;
const calc = (att, def, e1, e2, mul, scale) => Math.max(1, Math.round(att * mul * adv(e1, e2) * rnd(.9, 1.1) * scale * (1000 / (1000 + def * .5))));
const usedItems = () => { const u = {}; Object.values(S.equip).forEach(a => a.forEach(i => { if (i) u[i] = (u[i] || 0) + 1; })); return u; };

/* ====================== Sound (WebAudio, prozedural) ====================== */
let AC = null;
function beep(f = 440, d = .08, type = 'sine', v = .05, slide = 0) {
  if (S && S.muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain(), t0 = AC.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
    g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(t0 + d);
  } catch (e) { /* kein Audio */ }
}
let toastT = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1600);
}

/* ====================== Skalierung ====================== */
function fit() {
  const vw = innerWidth, vh = innerHeight;
  const w = Math.min(vw, vh * 9 / 16), h = w * 16 / 9;
  app.style.width = w + 'px'; app.style.height = h + 'px';
  document.documentElement.style.fontSize = (w / 36) + 'px';
  R.w = w; R.h = h; R.dpr = Math.min(window.devicePixelRatio || 1, 2); R.k = w * R.dpr / 360;
  [bgc, bc, gc].forEach(c => {
    c.width = Math.round(w * R.dpr); c.height = Math.round(h * R.dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
  });
  b3.style.width = w + 'px'; b3.style.height = h + 'px';
  if (S3) { try { S3.resize(w, h, R.dpr); } catch (e) { fail3d(e); } }
}
const setT = c => c.setTransform(R.k, 0, 0, R.k, 0, 0);

/* ====================== Grafik-Helfer ====================== */
const stars = Array.from({ length: 100 }, () => ({ x: Math.random() * 360, y: Math.random() * 640, z: rnd(.2, 1), p: Math.random() * 6 }));
function drawSpace(c, t, c1 = '#0a0720', c2 = '#1d0c40') {
  const g = c.createLinearGradient(0, 0, 0, 640); g.addColorStop(0, c1); g.addColorStop(1, c2);
  c.fillStyle = g; c.fillRect(0, 0, 360, 640);
  stars.forEach(s => {
    c.globalAlpha = (.4 + .6 * Math.abs(Math.sin(t * s.z + s.p))) * s.z;
    c.fillStyle = '#fff'; c.fillRect(s.x, (s.y + t * 6 * s.z) % 640, s.z * 1.8, s.z * 1.8);
  });
  c.globalAlpha = 1;
}
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
// Stilisierter 3D-Kämpfer (Schattierung, Rim-Light, Aura) – rein prozedural
function fighter(c, x, y, s, col, o) {
  o = o || {};
  const t = o.t || 0, back = !!o.back, atk = o.atk || 0, lean = o.lean || 0, baseA = o.alpha == null ? 1 : o.alpha;
  c.save(); c.translate(x, y + Math.sin(t * 3 + (o.ph || 0)) * 2 * s); c.scale(s, s);
  c.globalAlpha = baseA;
  c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(0, 0, 40, 9, 0, 0, 6.3); c.fill();
  const ag = c.createRadialGradient(0, -85, 8, 0, -85, 125); ag.addColorStop(0, col + 'aa'); ag.addColorStop(1, col + '00');
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = baseA * (.5 + .25 * Math.sin(t * 5)) * (o.charge ? 1.7 : 1);
  c.fillStyle = ag; c.beginPath(); c.arc(0, -85, 125, 0, 6.3); c.fill(); c.restore();
  c.rotate(lean * .1);
  const dark = o.hit ? '#ffffff' : '#151a30', mid = o.hit ? '#ffffff' : '#252d52';
  let g = c.createLinearGradient(-24, 0, 24, 0); g.addColorStop(0, dark); g.addColorStop(1, mid); c.fillStyle = g;
  rr(c, -25, -68, 20, 68, 7); c.fill(); rr(c, 5, -68, 20, 68, 7); c.fill();
  c.fillStyle = col; c.fillRect(-25, -8, 20, 4); c.fillRect(5, -8, 20, 4);
  g = c.createLinearGradient(-32, -140, 32, -60); g.addColorStop(0, mid); g.addColorStop(1, dark); c.fillStyle = g;
  c.beginPath(); c.moveTo(-34, -138); c.lineTo(34, -138); c.lineTo(24, -62); c.lineTo(-24, -62); c.closePath(); c.fill();
  c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); c.moveTo(34, -138); c.lineTo(24, -62); c.stroke();
  c.fillStyle = col; c.fillRect(-24, -70, 48, 6);
  if (!back) { c.save(); c.shadowColor = col; c.shadowBlur = 14; c.fillStyle = col; c.beginPath(); c.arc(0, -112, 7, 0, 6.3); c.fill(); c.restore(); }
  const sw = Math.sin(t * 3) * .08;
  c.save(); c.translate(-38, -132); c.rotate(.18 + sw - atk * .9); c.fillStyle = mid; rr(c, -9, 0, 18, 60, 8); c.fill(); c.fillStyle = col; c.fillRect(-9, 44, 18, 4); c.restore();
  c.save(); c.translate(38, -132); c.rotate(-.18 - sw + atk * 1.4); c.fillStyle = mid; rr(c, -9, 0, 18, 60, 8); c.fill(); c.fillStyle = col; c.fillRect(-9, 44, 18, 4); c.restore();
  c.fillStyle = o.hit ? '#fff' : '#d9b9a2'; c.beginPath(); c.arc(0, -158, 19, 0, 6.3); c.fill();
  c.fillStyle = o.hit ? '#fff' : col; c.beginPath();
  const sp = [[-22, -150], [-26, -176], [-12, -170], [-8, -196], [2, -174], [12, -200], [16, -172], [28, -178], [22, -150]];
  c.moveTo(sp[0][0], sp[0][1]); sp.forEach(p => c.lineTo(p[0], p[1])); c.closePath(); c.fill();
  if (back) { c.fillStyle = o.hit ? '#fff' : col; c.beginPath(); c.arc(0, -158, 19, 0, 6.3); c.fill(); c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(0, -156, 19, 0, 3.14); c.fill(); }
  else { c.save(); c.shadowColor = col; c.shadowBlur = 10; c.fillStyle = '#fff'; c.fillRect(-12, -160, 8, 3); c.fillRect(4, -160, 8, 3); c.restore(); }
  c.restore();
}

/* ====================== Navigation ====================== */
function show(id) {
  scr = id;
  ['start', 'menu', 'battle', 'gacha'].forEach(s => $('#' + s).classList.toggle('hide', s !== id));
}
function setTab(t) {
  tab = t; teamSel = null;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('#view').classList.toggle('home', t === 'home');
  renderView();
}
function renderTop() {
  tickEnergy();
  const rem = S.energy >= ENERGY_MAX ? 'MAX' : fmt(Math.max(0, ENERGY_SEC - Math.floor((Date.now() - S.eTs) / 1000)));
  $('#top').innerHTML = `<div>Lv ${S.lvl}</div><div>⚡ ${S.energy}/${ENERGY_MAX}<small>${rem}</small></div><div>💎 ${S.crystals}</div><div>🪙 ${S.gold}</div>`;
}
function renderView() {
  renderTop();
  const v = $('#view'); v.scrollTop = 0;
  ({ home: vHome, story: vStory, chars: vChars, summon: vSummon, guild: vGuild, shop: vShop }[tab] || vHome)(v);
}

/* ====================== Views ====================== */
function vHome(v) {
  const m = CH(S.main);
  v.innerHTML = `<div class="homeinfo"><div class="nm" style="color:${EL[m.el]}">${m.name}</div><div class="tt">${m.title}</div>
  <div class="el" style="color:${EL[m.el]}">● ${ELN[m.el]} · ${RARN[m.rar]}</div><p class="hint">Tippe auf den Kämpfer</p></div>`;
}
function vStory(v) {
  v.innerHTML = '<h2>Story &amp; Events</h2>' + D.stages.map((s, i) => {
    const locked = i > 0 && !S.cleared[i - 1];
    return `<div class="row"><div><b>${i + 1}. ${s.name}</b><br><small style="color:${EL[s.el]}">${s.enemy} · ${ELN[s.el]}</small> <small>· ${D.aiTypes[s.ai || 'balanced'].label}</small><br>
    <small>${S.cleared[i] ? '✔ geschafft' : '🪙' + s.gold + ' · 💎' + s.crystals}</small></div>
    <button class="go" data-i="${i}" ${locked ? 'disabled' : ''}>${locked ? '🔒' : '⚡' + s.cost + ' Kampf'}</button></div>`;
  }).join('');
  $$('.go', v).forEach(b => b.onclick = () => beginBattle(+b.dataset.i));
}
function vChars(v) {
  const slot = i => {
    const id = S.team[i], c = id && CH(id);
    return `<div class="slot ${i > 2 ? 'bench' : ''} ${teamSel === i ? 'sel' : ''}" data-s="${i}">
      <small>${i < 3 ? 'Kämpfer ' + (i + 1) : 'Bank ' + (i - 2)}</small><br>${c ? `<b style="color:${EL[c.el]}">${c.name}</b>` : '–'}</div>`;
  };
  v.innerHTML = `<h3>Team-Formation</h3><div class="team">${[0, 1, 2].map(slot).join('')}</div>
  <div class="team">${[3, 4, 5].map(slot).join('')}</div>
  <p style="opacity:.6;font-size:1.1rem">Platz antippen, dann Kämpfer wählen. Bank-Kämpfer geben Z-Boni.</p>
  <h3>Kämpfer</h3><div class="grid">${D.chars.map(c => {
    const o = S.owned[c.id];
    return `<div class="cc ${o ? '' : 'lock'}" data-c="${c.id}" style="border-color:${RARC[c.rar]}88">
      <div class="pt" style="color:${EL[c.el]};text-shadow:0 0 1.4rem ${EL[c.el]}">${c.name[0]}</div>
      <b>${c.name}</b><small style="color:${EL[c.el]}">${ELN[c.el]} · ${c.rar}</small><small>${o ? 'Lv ' + o.lv : '🔒'}</small></div>`;
  }).join('')}</div>`;
  $$('.slot', v).forEach(s => s.onclick = () => { teamSel = teamSel === +s.dataset.s ? null : +s.dataset.s; vChars(v); });
  $$('.cc', v).forEach(el => el.onclick = () => {
    const id = el.dataset.c;
    if (!S.owned[id]) { toast('Noch nicht freigeschaltet – beschwöre ihn!'); return; }
    if (teamSel !== null) {
      const ex = S.team.indexOf(id);
      if (ex >= 0) { S.team[ex] = S.team[teamSel]; }
      S.team[teamSel] = id; teamSel = null; save(); vChars(v); beep(660, .08);
    } else openChar(id);
  });
}
function vSummon(v) {
  const b = D.banners[bannerIdx], f = b.featured && CH(b.featured);
  v.innerHTML = `<h2>Beschwörung</h2><div class="tabs">${D.banners.map((x, i) => `<button class="${i === bannerIdx ? 'on' : ''}" data-b="${i}">${x.name}</button>`).join('')}</div>
  <div class="row" style="flex-direction:column;align-items:flex-start"><b>${b.name}</b>
  <small>Gewöhnlich ${Math.round(b.rates.N * 100)}% · Selten ${Math.round(b.rates.R * 100)}% · Ultra ${Math.round(b.rates.U * 100)}%</small>
  ${f ? `<small style="color:${EL[f.el]}">★ Rate-Up: ${f.name} – ${f.title}</small>` : ''}
  <small>Garantie: Mit der 10er-Beschwörung mind. 1× Selten · Pity-Zähler: ${S.pity}/40 (dann Ultra garantiert)</small></div>
  <div style="display:flex;gap:.8rem"><button class="btn" id="p1" style="flex:1">×1<br>💎 50</button><button class="btn alt" id="p10" style="flex:1">×10<br>💎 450</button></div>`;
  $$('.tabs button', v).forEach(x => x.onclick = () => { bannerIdx = +x.dataset.b; vSummon(v); });
  $('#p1', v).onclick = () => pull(1); $('#p10', v).onclick = () => pull(10);
}
function vGuild(v) {
  const today = new Date().toDateString();
  v.innerHTML = `<h2>Gilde &amp; Arena</h2><div class="row"><div><b>Void-Wächter</b><br><small>Lokale Demo-Gilde · 12 Mitglieder</small></div></div>
  <div class="row"><div><b>Tägliche Gildenspende</b><br><small>🪙 1000 + 💎 20</small></div><button class="btn gold" id="gd" ${S.guildDaily === today ? 'disabled' : ''}>${S.guildDaily === today ? '✔' : 'Abholen'}</button></div>
  <h3>Arena · PvP gegen KI-Teams</h3>
  <div class="row"><div><b>Rang: ${[...D.arena.ranks].reverse().find(r => S.arena.pts >= r[0])[1]}</b><br><small>🏆 ${S.arena.pts} Punkte · ${S.arena.wins} Siege / ${S.arena.losses} Niederlagen</small></div></div>
  ${D.arena.tiers.map((t, i) => `<div class="row"><div><b>${t.name}</b><br><small>3 Gegner · 🪙${t.gold} · 🏆+${t.pts}</small></div><button class="go" data-a="${i}">⚡${t.cost} Kampf</button></div>`).join('')}
  <p style="opacity:.55;font-size:1.1rem">Hinweis: Echte Multiplayer-/Gildenfunktionen benötigen ein Backend.</p>`;
  $$('[data-a]', v).forEach(b => b.onclick = () => beginArena(D.arena.tiers[+b.dataset.a]));
  $('#gd', v).onclick = () => { S.guildDaily = today; S.gold += 1000; S.crystals += 20; save(); renderView(); toast('Spende erhalten!'); };
}
function vShop(v) {
  const today = new Date().toDateString(), u = usedItems();
  v.innerHTML = `<h2>Shop</h2>
  <div class="row"><div><b>Tägliche Kristalle</b><br><small>💎 100 gratis</small></div><button class="btn gold" id="sd" ${S.daily === today ? 'disabled' : ''}>${S.daily === today ? '✔' : 'Abholen'}</button></div>
  <div class="row"><div><b>Energie auffüllen</b><br><small>⚡ +30</small></div><button class="btn" id="se">💎 40</button></div>
  <h3>Ausrüstung</h3>${D.items.map(i => `<div class="row"><div><b>${i.name}</b><br><small>+${Math.round(i.v * 100)}% ${STAT_N[i.stat]} · besitzt ${S.items[i.id] || 0} (verbaut ${u[i.id] || 0})</small></div>
  <button class="btn" data-i="${i.id}">🪙 ${i.price}</button></div>`).join('')}`;
  $('#sd', v).onclick = () => { S.daily = today; S.crystals += 100; save(); renderView(); toast('+100 💎'); };
  $('#se', v).onclick = () => {
    if (S.crystals < 40) return toast('Zu wenig Kristalle');
    S.crystals -= 40; S.energy = Math.min(ENERGY_MAX, S.energy + 30); if (S.energy >= ENERGY_MAX) S.eTs = Date.now(); save(); renderView();
  };
  $$('[data-i]', v).forEach(b => b.onclick = () => {
    const it = D.items.find(x => x.id === b.dataset.i);
    if (S.gold < it.price) return toast('Zu wenig Gold');
    S.gold -= it.price; S.items[it.id] = (S.items[it.id] || 0) + 1; save(); renderView(); beep(700, .08);
  });
}

/* ---- Charakter-Detail (Soul-Boost, Ausrüstung, Level) ---- */
function openChar(id) {
  const c = CH(id), o = S.owned[id], st = statsOf(id), u = usedItems(), eq = S.equip[id] || [null, null, null];
  const lvCost = o.lv * 250, cap = capOf(id);
  let m = $('#modal'); if (!m) { m = document.createElement('div'); m.id = 'modal'; m.className = 'modal'; app.appendChild(m); }
  const cost = n => 600 * (o.soul.length);
  m.innerHTML = `<div class="box"><h2 style="color:${EL[c.el]};margin-top:0">${c.name} <small style="font-size:1.2rem;color:${RARC[c.rar]}">${c.rar}</small></h2>
  <p style="opacity:.8">${c.title} · ${ELN[c.el]} · Lv ${o.lv}/${cap}</p>
  ${['hp', 'atk', 'def'].map(k => `<div class="stat"><span>${STAT_N[k]}</span><b>${st[k]}</b></div>`).join('')}
  <p style="font-size:1.1rem;opacity:.75">Arts: ${Object.values(c.arts).join(' · ')}<br>Bank-Bonus (Z): +${Math.round(c.z.v * 100)}% ${STAT_N[c.z.stat]}</p>
  <button class="btn" id="lu" ${o.lv >= cap ? 'disabled' : ''} style="width:100%">Level ↑ (🪙 ${lvCost})</button>
  <h3>Soul-Boost</h3><div class="sg">${SOUL.map((t, i) => {
    const on = o.soul.includes(i), can = !on && nb(i).some(n => o.soul.includes(n));
    return `<button class="sn ${on ? 'on' : can ? 'can' : ''}" data-n="${i}" ${on || !can ? 'disabled' : ''}>${SOUL_LBL[t]}${on ? '' : '<br>🪙' + cost(i)}</button>`;
  }).join('')}</div>
  <h3>Ausrüstung</h3><div class="eq">${[0, 1, 2].map(i => {
    const it = eq[i] && D.items.find(x => x.id === eq[i]);
    return `<button data-e="${i}">${it ? it.name + '<br><small>+' + Math.round(it.v * 100) + '% ' + STAT_N[it.stat] + '</small>' : '＋ leer'}</button>`;
  }).join('')}</div>
  <div style="margin-top:.6rem">${D.items.filter(i => (S.items[i.id] || 0) - (u[i.id] || 0) > 0).map(i => `<button class="btn" data-q="${i.id}" style="margin:.2rem">${i.name}</button>`).join('') || '<small style="opacity:.6">Keine freien Items – kaufe welche im Shop.</small>'}</div>
  <div style="display:flex;gap:.6rem;margin-top:1rem"><button class="btn gold" id="mn" style="flex:1">Hauptkämpfer</button><button class="btn alt" id="cl" style="flex:1">Schließen</button></div></div>`;
  $('#lu', m).onclick = () => { if (S.gold < lvCost) return toast('Zu wenig Gold'); S.gold -= lvCost; o.lv++; save(); renderTop(); openChar(id); beep(800, .1, 'triangle'); };
  $$('.sn', m).forEach(b => b.onclick = () => {
    const i = +b.dataset.n, k = cost(i); if (S.gold < k) return toast('Zu wenig Gold');
    S.gold -= k; o.soul.push(i); save(); renderTop(); openChar(id); beep(900, .12, 'triangle');
  });
  $$('[data-e]', m).forEach(b => b.onclick = () => { const i = +b.dataset.e; if (!S.equip[id]) S.equip[id] = [null, null, null]; S.equip[id][i] = null; save(); openChar(id); });
  $$('[data-q]', m).forEach(b => b.onclick = () => {
    if (!S.equip[id]) S.equip[id] = [null, null, null];
    const f = S.equip[id].indexOf(null); if (f < 0) return toast('Alle 3 Slots belegt');
    S.equip[id][f] = b.dataset.q; save(); openChar(id);
  });
  $('#mn', m).onclick = () => { S.main = id; save(); toast(c.name + ' ist Hauptkämpfer'); };
  $('#cl', m).onclick = () => { m.remove(); renderView(); };
}

/* ====================== Beschwörung (Gacha) ====================== */
function pull(n) {
  const cost = n === 10 ? 450 : 50;
  if (S.crystals < cost) return toast('Zu wenig Kristalle');
  const b = D.banners[bannerIdx], res = [];
  S.crystals -= cost;
  for (let i = 0; i < n; i++) {
    S.pity++;
    const r = Math.random();
    let rar = r < b.rates.U ? 'U' : r < b.rates.U + b.rates.R ? 'R' : 'N';
    if (S.pity >= 40) rar = 'U';
    if (n === 10 && i === 9 && !res.some(x => x.rar !== 'N') && rar === 'N') rar = 'R';
    if (rar === 'U') S.pity = 0;
    let pool = D.chars.filter(c => c.rar === rar), id;
    if (rar === 'U' && b.featured && Math.random() < .5) id = b.featured; else id = pick(pool).id;
    const dup = !!S.owned[id], gold = dup ? (rar === 'U' ? 2000 : rar === 'R' ? 900 : 400) : 0;
    if (dup) S.gold += gold; else S.owned[id] = { lv: 1, soul: [4] };
    res.push({ id, rar, dup, gold });
  }
  save(); startSummon(res);
}
let G = null;
function startSummon(res) {
  G = { t: 0, res, max: res.reduce((a, r) => Math.max(a, 'NRU'.indexOf(r.rar)), 0), done: false };
  show('gacha'); $('#gres').classList.add('hide'); beep(120, 2, 'sawtooth', .04, 300);
}
function drawGacha(c, dt) {
  G.t += dt; const t = G.t, cx = 180, cy = 300, col = ['#6fb7ff', '#ffcf4a', '#d36bff'][G.max];
  drawSpace(c, t * 3, '#05030f', '#150a30');
  if (t < 2.4) {
    const k = t / 2.4, e = k * k, y = cy + Math.sin(t * 7) * 10 * (1 - k), r = 16 + 16 * k;
    c.save(); c.translate(rnd(-1, 1) * k * 4, rnd(-1, 1) * k * 4); c.globalCompositeOperation = 'lighter';
    [[lerp(-40, cx - 12, e), '#ff3b4e'], [lerp(400, cx + 12, e), '#3b8bff']].forEach(([x, cl]) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r * 3); g.addColorStop(0, '#fff'); g.addColorStop(.25, cl); g.addColorStop(1, cl + '00');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 3, 0, 6.3); c.fill();
    });
    c.restore();
  } else if (t < 3.6) {
    const k = (t - 2.4) / 1.2;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) { c.strokeStyle = col; c.globalAlpha = (1 - k) * .8; c.lineWidth = 6 - i * 1.5; c.beginPath(); c.arc(cx, cy, k * (300 - i * 50), 0, 6.3); c.stroke(); }
    c.restore();
    c.fillStyle = '#fff'; c.globalAlpha = Math.max(0, 1 - k * 1.6); c.fillRect(0, 0, 360, 640); c.globalAlpha = 1;
  } else {
    if (!G.done) { G.done = true; renderGres(); beep(520, .5, 'triangle', .07, 500); }
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, 260); g.addColorStop(0, col + 'cc'); g.addColorStop(1, col + '00');
    c.globalAlpha = .6 + .2 * Math.sin(t * 4); c.fillStyle = g; c.fillRect(0, 0, 360, 640); c.restore();
  }
}
function renderGres() {
  const g = $('#gres');
  g.innerHTML = `<h2>Beschwörung</h2><div class="rg ${G.res.length === 1 ? 'one' : ''}">${G.res.map(r => {
    const c = CH(r.id);
    return `<div class="rc2" style="border-color:${RARC[r.rar]}"><b style="color:${RARC[r.rar]}">${r.rar === 'U' ? 'ULTRA' : r.rar === 'R' ? 'RARE' : 'COMMON'}</b>
    <span style="color:${EL[c.el]};font-weight:800">${c.name}</span><small>${r.dup ? '+' + r.gold + '🪙' : '<b>NEU!</b>'}</small></div>`;
  }).join('')}</div><button class="btn" id="gok" style="margin-top:1rem;width:60%">OK</button>`;
  g.classList.remove('hide');
  $('#gok').onclick = () => { show('menu'); setTab('summon'); };
}
gc.addEventListener('pointerdown', () => { if (G && G.t < 3.6) G.t = 3.6; });

/* ====================== KAMPF ====================== */
let B = null, ptr = null;
const newCard = () => {
  const r = Math.random() * 100;
  return { type: r < 35 ? 'melee' : r < 65 ? 'ranged' : r < 85 ? 'special' : 'main', shard: Math.random() < .35, cd: 0 };
};
function beginBattle(si) {
  const st = D.stages[si];
  if (!spendEnergy(st.cost)) return toast('Nicht genug Energie ⚡');
  save();
  const boss = { id: 'boss_' + st.enemy, name: st.enemy, look: st.look, el: st.el };
  launch(st, [{ c: boss, el: st.el, hp: st.hp, max: st.hp, atk: st.atk, def: st.def, name: st.enemy, ai: st.ai || 'balanced' }], { si });
}
// PvP-Arena: Gegner-Team aus 3 zufälligen Kämpfern, skaliert nach Liga und Spieler-Level
function beginArena(tier) {
  if (!spendEnergy(tier.cost)) return toast('Nicht genug Energie ⚡');
  save();
  const m = tier.mul * (1 + .04 * (S.lvl - 1)), pool = D.chars.slice(), team = [], ais = Object.keys(D.aiTypes);
  while (team.length < 3) {
    const c = pool.splice(ri(0, pool.length - 1), 1)[0], r = c.rar === 'U' ? 1.1 : c.rar === 'R' ? 1 : .92, hp = Math.round(c.hp * m * r * D.arena.hpMul);
    team.push({ c, el: c.el, hp, max: hp, atk: Math.round(c.atk * m * r), def: Math.round(c.def * m * r), name: c.name, ai: pick(ais) });
  }
  const th = pick(D.stages);
  const st = { name: 'Arena · ' + tier.name, enemy: 'Gegner-Team', el: team[0].el, hp: 0, atk: 0, def: 0, bg: th.bg, grid: th.grid, cost: tier.cost, gold: tier.gold, xp: tier.xp, crystals: 0, arena: true };
  launch(st, team, { si: -1, arena: tier });
}
function launch(st, eteam, meta) {
  const team = S.team.slice(0, 3).map(id => { const c = CH(id), s = statsOf(id); return { id, c, st: { ...s }, hp: s.hp, max: s.hp }; });
  const buff = { atk: 0, def: 0, hp: 0 };
  S.team.slice(3, 6).forEach(id => { const z = CH(id).z; if (z) buff[z.stat] += z.v; });
  team.forEach(m => { m.max = Math.round(m.max * (1 + buff.hp)); m.hp = m.max; m.st.atk *= 1 + buff.atk; m.st.def *= 1 + buff.def; });
  B = {
    si: meta.si, arena: meta.arena || null, st, team, act: 0, t: 0, over: false, rrActive: false, cine: null, hold: false,
    enemy: { team: eteam, act: 0, hp: eteam[0].hp, max: eteam[0].max, el: eteam[0].el, atk: eteam[0].atk, def: eteam[0].def, name: eteam[0].name, c: eteam[0].c,
      ai: D.aiTypes[eteam[0].ai] || D.aiTypes.balanced, vanish: 0, next: rnd(1.5, 2.4), tele: 0, telet: '', n: 0, flash: 0, swapCd: 0 },
    ki: 3, kiMax: 10, vg: 3, dodge: 0, dist: .7, distT: .7, px: 0, pxT: 0, ex: 0, exT: 0, hand: [newCard(), newCard(), newCard(), newCard()],
    shards: 0, swapCd: 0, blastCd: 0, proj: [], parts: [], texts: [], ev: [], shake: 0, pose: 0, ePose: 0, combo: 0, comboT: 0, flashP: 0, hint: 7
  };
  ptr = null;
  B.use3d = !!S3;
  if (S3) { try { S3.startBattle(B); } catch (e) { fail3d(e); } }
  $('#end').classList.add('hide'); $('#rr').classList.add('hide');
  show('battle'); beep(220, .5, 'sawtooth', .05, 300);
}
const pPos = () => (B.use3d && S3 && S3.sp.p) ? S3.sp.p : { x: 140 + B.px * 60, y: 505, s: 1.6 };
const ePos = () => { if (B.use3d && S3 && S3.sp.e) return S3.sp.e; const k = 1 - B.dist; return { x: 218 + B.ex * 40 - B.px * 15, y: lerp(262, 350, k), s: lerp(.5, .88, k) }; };
const addText = (s, x, y, col, size) => B.texts.push({ s: '' + s, x, y, l: 1, col, size: size || 18 });
function burst(x, y, col, n) {
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.3), v = rnd(40, 190); B.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1, m: rnd(.4, .9), c: col, r: rnd(1.5, 4) }); }
}
const cardInfo = card => { const T = D.cardTypes[card.type]; return { name: B.team[B.act].c.arts[card.type], cost: T.cost, p: T.p }; };
const later = (t, f) => B.ev.push({ t, f });

function shoot(own, mul, col, dur, big) {
  const a = own === 'p' ? pPos() : ePos(), b = own === 'p' ? ePos() : pPos();
  B.proj.push({
    own, mul, col, dur, t: 0, big: !!big,
    x0: a.x + (own === 'p' ? 25 : 0), y0: a.y - 120 * a.s, x1: b.x, y1: b.y - 105 * b.s
  });
  beep(own === 'p' ? 520 : 300, .12, 'square', .03, -200);
}
function useCard(i) {
  if (B.over || B.rrActive || B.cine) return;
  const cd = B.hand[i]; if (!cd || cd.cd > 0) return;
  const inf = cardInfo(cd);
  if (B.ki < inf.cost) { addText('KI ZU NIEDRIG', 180, 470, '#ff8080', 14); beep(120, .1, 'square'); return; }
  B.ki -= inf.cost;
  const type = cd.type;
  if (cd.shard) { B.shards = Math.min(7, B.shards + 1); addText('◆ SCHERBE', 180, 440, '#ffd23b', 14); beep(900, .1, 'triangle', .05, 400); }
  B.hand[i] = newCard(); B.hand[i].cd = .8;
  const m = B.team[B.act], col = EL[m.c.el];
  if (type === 'melee') {
    B.distT = .1; B.pose = 1; beep(200, .1, 'sawtooth', .05, -80);
    later(.25, () => { B.pose = .6; hitEnemy(inf.p); });
  } else if (type === 'ranged') {
    B.pose = .7; shoot('p', inf.p, col, .35);
  } else {
    const main = type === 'main';
    B.cine = { t: 0, dur: main ? 1.5 : 1.0, name: inf.name, col, main, fn: () => { B.pose = 1; hitEnemy(inf.p, true); if (main) B.ki = Math.min(B.kiMax, B.ki + 2); } };
    beep(260, B.cine.dur, 'sawtooth', .06, 700);
  }
  if (B.shards >= 7 && !B.cine) later(.5, startRush);
  else if (B.shards >= 7) { const f = B.cine.fn; B.cine.fn = () => { f(); later(.4, startRush); }; }
}
function swapEnemy(i) {
  const e = B.enemy; e.team[e.act].hp = e.hp; e.act = i;
  const m = e.team[i];
  Object.assign(e, { hp: m.hp, max: m.max, el: m.el, atk: m.atk, def: m.def, name: m.name, c: m.c, ai: D.aiTypes[m.ai] || D.aiTypes.balanced, tele: 0, vanish: 0, next: 1.4, flash: .15, swapCd: 8 });
  addText('GEGNER-WECHSEL', 180, 300, '#ff9d00', 20); B.shake = 10; beep(300, .25, 'sawtooth', .06, 300);
}
function enemyDown() {
  const e = B.enemy; e.team[e.act].hp = 0;
  const nx = e.team.findIndex(m => m.hp > 0);
  if (nx < 0) return endBattle(true);
  const p = ePos(); addText('K.O.!', p.x, p.y - 150 * p.s, '#ffd23b', 28); swapEnemy(nx);
}
function hitEnemy(mul, big) {
  const e = B.enemy, m = B.team[B.act], p = ePos();
  if (B.over) return;
  if (e.vanish > 0) { addText('AUSGEWICHEN', p.x, p.y - 150 * p.s, '#9fc8ff', 14); return; }
  const dmg = calc(m.st.atk, e.def, m.c.el, e.el, mul, 2.4);
  e.hp = Math.max(0, e.hp - dmg); e.flash = .15; e.hit = .15;
  B.combo++; B.comboT = 2.2;
  B.shake = Math.max(B.shake, big ? 16 : 5);
  addText(dmg, p.x + rnd(-20, 20), p.y - 130 * p.s, adv(m.c.el, e.el) > 1 ? '#ffd23b' : '#fff', big ? 30 : 20);
  burst(p.x, p.y - 90 * p.s, EL[m.c.el], big ? 36 : 12);
  beep(big ? 90 : 160, .15, 'square', .06, -60);
  if (mul >= 1.7 && e.tele) { e.tele = 0; e.next = 1.4; addText('UNTERBROCHEN', p.x, p.y - 170 * p.s, '#ff9d00', 13); }
  if (e.hp <= 0) enemyDown();
}
function hitPlayer(mul, big) {
  const m = B.team[B.act], e = B.enemy, p = pPos();
  if (B.over) return;
  if (B.dodge > 0) {
    addText('AUSGEWICHEN!', p.x, p.y - 250, '#9fffd0', 16); B.ki = Math.min(B.kiMax, B.ki + 1); beep(900, .1, 'triangle', .04);
    return;
  }
  const dmg = calc(e.atk, m.st.def, e.el, m.c.el, mul * (e.ai.dmg || 1), .75);
  m.hp = Math.max(0, m.hp - dmg); B.flashP = .2; B.combo = 0;
  B.shake = Math.max(B.shake, big ? 16 : 8);
  addText(dmg, p.x + rnd(-20, 20), p.y - 230, '#ff6a6a', big ? 26 : 18);
  burst(p.x, p.y - 150, '#ff6a6a', 14); beep(110, .15, 'square', .06, -50);
  if (m.hp <= 0) {
    const nx = B.team.findIndex(x => x.hp > 0);
    if (nx < 0) return endBattle(false);
    B.act = nx; addText('WECHSEL!', 180, 300, '#ffd23b', 22);
  }
}
function swapTo(i) {
  if (B.over || B.rrActive || B.cine || i === B.act || B.team[i].hp <= 0) return;
  if (B.swapCd > 0) return toast('Wechsel lädt… ' + Math.ceil(B.swapCd) + 's');
  B.act = i; B.swapCd = 6; B.pose = .8;
  addText('COVER-CHANGE!', 180, 300, '#ffd23b', 20); beep(700, .2, 'triangle', .06, 400);
  shoot('p', 1.2, EL[B.team[i].c.el], .3, true);
}
function dodgeSwipe(dir) {
  if (B.over || B.rrActive || B.cine) return;
  if (B.vg < 1) { addText('AUSWEICH-LEISTE LEER', 180, 470, '#ff8080', 13); return; }
  B.vg -= 1; B.dodge = .45; B.pxT = dir; later(.45, () => { B.pxT = 0; });
  beep(700, .1, 'sine', .04, 500);
}
function enemyAI(d) {
  const e = B.enemy;
  e.vanish = Math.max(0, e.vanish - d); e.flash = Math.max(0, e.flash - d); e.hit = Math.max(0, (e.hit || 0) - d);
  if (e.tele > 0) {
    e.tele -= d;
    if (e.tele <= 0) {
      const t = e.telet; e.next = rnd(1.3, 2.4) * e.ai.int - Math.min(.5, Math.max(0, B.si) * .05);
      if (t === 'ranged') shoot('e', 1, EL[e.el], .35);
      else if (t === 'special') shoot('e', 2.1, EL[e.el], .5, true);
      else { B.dist = .1; B.distT = .1; e.pose = 1; B.ePose = 1; hitPlayer(1.15); }
    }
    return;
  }
  e.next -= d; e.swapCd = Math.max(0, (e.swapCd || 0) - d);
  if (e.next <= 0) {
    const nx = e.team.findIndex((m, i) => i !== e.act && m.hp > 0);
    if (nx >= 0 && e.swapCd <= 0 && e.hp / e.max < .35 && Math.random() < e.ai.swap) { swapEnemy(nx); return; }
    e.n++;
    if (B.dist < .5 && Math.random() < e.ai.melee) { e.telet = 'melee'; e.tele = .6; }
    else if (e.n % e.ai.specialEvery === 0) { e.telet = 'special'; e.tele = 1.0; }
    else { e.telet = 'ranged'; e.tele = .55; }
    if (Math.random() < e.ai.vanish) { e.vanish = .4; e.exT = pick([-1, 1]); later(.6, () => { e.exT = 0; }); }
    beep(160, .25, 'sawtooth', .04, 100);
  }
}
function updateBattle(dt) {
  const b = B; if (!b) return;
  // Effekte laufen immer
  b.parts.forEach(p => { p.l -= dt / p.m; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; });
  b.parts = b.parts.filter(p => p.l > 0);
  b.texts.forEach(t => { t.l -= dt * .8; t.y -= 24 * dt; });
  b.texts = b.texts.filter(t => t.l > 0);
  b.shake = Math.max(0, b.shake - dt * 40); b.flashP = Math.max(0, b.flashP - dt); b.hint = Math.max(0, b.hint - dt);
  b.t += dt;
  if (b.cine) { b.cine.t += dt; if (b.cine.t >= b.cine.dur) { const f = b.cine.fn; b.cine = null; if (f) f(); } }
  if (b.cine || b.rrActive || b.over) return;
  const d = dt;
  const hold = !!ptr && ptr.card < 0 && ptr.port < 0 && !ptr.moved && performance.now() - ptr.t > 220;
  b.hold = hold;
  b.ki = Math.min(b.kiMax, b.ki + (hold ? 4.2 : .55) * d);
  b.vg = Math.min(3, b.vg + .28 * d);
  b.dodge = Math.max(0, b.dodge - d); b.swapCd = Math.max(0, b.swapCd - d); b.blastCd = Math.max(0, b.blastCd - d);
  b.hand.forEach(h => h.cd = Math.max(0, h.cd - d));
  b.pose = Math.max(0, b.pose - d * 2.5); b.ePose = Math.max(0, b.ePose - d * 2.5);
  b.comboT -= d; if (b.comboT <= 0) b.combo = 0;
  b.dist += (b.distT - b.dist) * Math.min(1, d * 5);
  b.px += (b.pxT - b.px) * Math.min(1, d * 10);
  b.ex += (b.exT - b.ex) * Math.min(1, d * 4);
  if (b.distT < .5 && b.dist < .3) b.distT = Math.min(b.distT + d * .15, .5); // sanftes Driften
  for (let i = b.ev.length - 1; i >= 0; i--) { b.ev[i].t -= d; if (b.ev[i].t <= 0) { const f = b.ev[i].f; b.ev.splice(i, 1); f(); } }
  enemyAI(d);
  for (let i = b.proj.length - 1; i >= 0; i--) {
    const p = b.proj[i]; p.t += d;
    if (p.t >= p.dur) { b.proj.splice(i, 1); if (p.own === 'p') hitEnemy(p.mul, p.big); else hitPlayer(p.mul, p.big); }
  }
}

/* ---- Rising Rush ---- */
function startRush() {
  if (!B || B.over || B.rrActive) return;
  B.rrActive = true; B.shards = 0; B.rr = { round: 0, wins: 0, lock: false };
  beep(300, .6, 'sawtooth', .06, 600); renderRR(); $('#rr').classList.remove('hide');
}
function renderRR(msg) {
  const r = B.rr, el = $('#rr');
  el.innerHTML = `<h2>RISING RUSH</h2><p>Runde ${r.round + 1}/3 – wähle eine Karte (höher gewinnt)</p>
  <div class="rcards">${[0, 1, 2].map(i => `<button class="rc" data-i="${i}">?</button>`).join('')}</div>
  <p style="font-size:1.6rem">Siege: <b>${r.wins}</b></p><p style="min-height:2rem">${msg || ''}</p>`;
  $$('.rc', el).forEach(b => b.onclick = () => rushPick(+b.dataset.i));
}
function rushPick(i) {
  const r = B.rr; if (r.lock) return; r.lock = true;
  const m = B.team[B.act], bonus = adv(m.c.el, B.enemy.el) > 1 ? 2 : 0;
  const vals = [ri(1, 9), ri(1, 9), ri(1, 9)], ev = ri(3, 8), mine = vals[i] + bonus, win = mine > ev;
  $$('.rc').forEach((b, k) => { b.textContent = vals[k]; if (k === i) b.classList.add(win ? 'win' : 'lose'); });
  if (win) r.wins++;
  beep(win ? 880 : 150, .2, win ? 'triangle' : 'square', .06);
  setTimeout(() => {
    if (!B || !B.rr) return;
    r.round++; r.lock = false;
    if (r.round >= 3) {
      $('#rr').classList.add('hide'); B.rrActive = false;
      const dmg = Math.round(r.wins * B.enemy.max * .1 + m.st.atk * 4);
      B.cine = { t: 0, dur: 1.3, name: 'RISING RUSH', col: '#ffd23b', main: true, fn: () => {
        const e = B.enemy, p = ePos(); e.hp = Math.max(0, e.hp - dmg); B.shake = 22; B.combo += 7; B.comboT = 2.5;
        addText(dmg, p.x, p.y - 140 * p.s, '#ffd23b', 34); burst(p.x, p.y - 90 * p.s, '#ffd23b', 50); beep(70, .4, 'square', .08, -30);
        if (e.hp <= 0) enemyDown();
      } };
    } else renderRR(win ? 'Treffer!' : 'Gegner stärker…');
  }, 900);
}

/* ---- Ende ---- */
function endBattle(win) {
  if (B.over) return; B.over = true;
  const st = B.st, el = $('#end');
  let html;
  if (win) {
    const first = !B.arena && !S.cleared[B.si]; if (!B.arena) S.cleared[B.si] = true;
    S.gold += st.gold; S.xp += st.xp; if (first) S.crystals += st.crystals;
    if (B.arena) { S.arena.pts += B.arena.pts; S.arena.wins++; }
    while (S.xp >= S.lvl * 100) { S.xp -= S.lvl * 100; S.lvl++; }
    save();
    html = `<h2 style="color:#ffd23b">SIEG!</h2><p>🪙 +${st.gold} · XP +${st.xp}</p>${first ? `<p>💎 +${st.crystals} (Erstabschluss)</p>` : ''}${B.arena ? `<p>🏆 +${B.arena.pts} Arena-Punkte (gesamt ${S.arena.pts})</p>` : ''}`;
  } else {
    if (B.arena) { S.arena.pts = Math.max(0, S.arena.pts - 5); S.arena.losses++; save(); }
    html = '<h2 style="color:#ff4d6a">NIEDERLAGE</h2><p>Dein Team wurde besiegt.</p>' + (B.arena ? '<p>🏆 −5 Arena-Punkte</p>' : '');
  }
  html += `<div style="display:flex;gap:.8rem;margin-top:1rem"><button class="btn" id="e1">Zum Menü</button><button class="btn alt" id="e2">Nochmal ⚡${st.cost}</button></div>`;
  const ar = B.arena, si = B.si;
  setTimeout(() => {
    el.innerHTML = html; el.classList.remove('hide');
    $('#e1').onclick = () => { show('menu'); setTab(ar ? 'guild' : 'story'); };
    $('#e2').onclick = () => { if (S.energy < st.cost) return toast('Nicht genug Energie ⚡'); if (ar) beginArena(ar); else beginBattle(si); };
  }, 900);
  beep(win ? 660 : 140, .6, 'triangle', .07, win ? 500 : -60);
}

/* ---- Rendering ---- */
function drawBattle(c) {
  const b = B; if (!b) return;
  if (b.use3d) { c.clearRect(0, 0, 360, 640); drawFx(c, b); drawOverlay(c, b); return; }  // 3D-Szene liegt auf #b3
  const st = b.st, hor = 232, t = b.t;
  c.save();
  if (b.shake > 0) c.translate(rnd(-b.shake, b.shake) * .4, rnd(-b.shake, b.shake) * .4);
  let z = 1;
  if (b.cine) { const k = Math.sin(clamp(b.cine.t / b.cine.dur, 0, 1) * Math.PI); z = 1 + .22 * k; const p = ePos(); c.translate(p.x, p.y - 100); c.scale(z, z); c.translate(-p.x, -(p.y - 100)); }
  // Himmel & Boden
  let g = c.createLinearGradient(0, 0, 0, hor); g.addColorStop(0, st.bg[0]); g.addColorStop(1, st.bg[1]); c.fillStyle = g; c.fillRect(-20, -20, 400, hor + 20);
  stars.forEach(s => { if (s.y < hor) { c.globalAlpha = .5 * s.z; c.fillStyle = '#fff'; c.fillRect(s.x, s.y * hor / 640 * 2 % hor, s.z * 1.6, s.z * 1.6); } });
  c.globalAlpha = 1;
  g = c.createRadialGradient(70, 90, 4, 70, 90, 70); g.addColorStop(0, st.grid + 'cc'); g.addColorStop(.6, st.bg[1]); g.addColorStop(1, st.bg[1] + '00');
  c.fillStyle = g; c.beginPath(); c.arc(70, 90, 70, 0, 6.3); c.fill();
  g = c.createLinearGradient(0, hor, 0, 660); g.addColorStop(0, st.bg[1]); g.addColorStop(1, '#030208'); c.fillStyle = g; c.fillRect(-20, hor, 400, 440);
  c.save(); c.globalCompositeOperation = 'lighter'; g = c.createLinearGradient(0, hor - 30, 0, hor + 30); g.addColorStop(0, st.grid + '00'); g.addColorStop(.5, st.grid + '88'); g.addColorStop(1, st.grid + '00'); c.fillStyle = g; c.fillRect(-20, hor - 30, 400, 60); c.restore();
  c.strokeStyle = st.grid; c.lineWidth = 1;
  for (let i = -12; i <= 12; i++) { c.globalAlpha = .3; c.beginPath(); c.moveTo(180 + i * 9, hor); c.lineTo(180 + i * 60 - b.px * 20, 660); c.stroke(); }
  for (let k = 0; k < 12; k++) { const f = ((k + t * .4) % 12) / 12, y = hor + (660 - hor) * f * f; c.globalAlpha = .12 + .3 * f; c.beginPath(); c.moveTo(0, y); c.lineTo(360, y); c.stroke(); }
  c.globalAlpha = 1;

  // Gegner
  const ep = ePos(), e = b.enemy;
  if (e.vanish > 0) { c.globalAlpha = .35; }
  if (e.tele > 0) { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = e.telet === 'special' ? '#ff2040' : '#ff9d00'; c.globalAlpha = .3 + .3 * Math.sin(t * 30); c.beginPath(); c.arc(ep.x, ep.y - 95 * ep.s, 70 * ep.s, 0, 6.3); c.fill(); c.restore(); if (e.vanish > 0) c.globalAlpha = .35; }
  fighter(c, ep.x, ep.y, ep.s, EL[e.el], { t, hit: e.flash > 0, atk: b.ePose, lean: Math.sin(t * 2) * .3, ph: 2 });
  c.globalAlpha = 1;

  // Projektile
  c.save(); c.globalCompositeOperation = 'lighter';
  b.proj.forEach(p => {
    const k = p.t / p.dur, x = lerp(p.x0, p.x1, k), y = lerp(p.y0, p.y1, k) - Math.sin(k * 3.14) * 18, r = (p.big ? 22 : 12) * lerp(.6, 1.2, k);
    const gg = c.createRadialGradient(x, y, 0, x, y, r * 2.2); gg.addColorStop(0, '#fff'); gg.addColorStop(.3, p.col); gg.addColorStop(1, p.col + '00');
    c.fillStyle = gg; c.beginPath(); c.arc(x, y, r * 2.2, 0, 6.3); c.fill();
    c.strokeStyle = p.col; c.globalAlpha = .5; c.lineWidth = r * .8; c.beginPath(); c.moveTo(lerp(p.x0, x, .7), lerp(p.y0, y, .7)); c.lineTo(x, y); c.stroke(); c.globalAlpha = 1;
  });
  c.restore();

  // Spieler (Rückansicht, Third-Person)
  const pp = pPos(), m = b.team[b.act], pc = EL[m.c.el];
  if (b.dodge > 0) { fighter(c, pp.x - b.pxT * 40, pp.y, pp.s, pc, { back: true, t, alpha: .25 }); fighter(c, pp.x - b.pxT * 20, pp.y, pp.s, pc, { back: true, t, alpha: .35 }); }
  fighter(c, pp.x, pp.y, pp.s, pc, { back: true, t, hit: b.flashP > 0, atk: b.pose, lean: -b.pxT * 1.5, charge: b.hold, alpha: b.dodge > 0 ? .55 : 1 });

  drawFx(c, b);
  c.restore();
  drawOverlay(c, b);
}
// Partikel + schwebende Texte (2D-Effektschicht, in 2D- und 3D-Modus identisch)
function drawFx(c, b) {
  c.save(); c.globalCompositeOperation = 'lighter';
  b.parts.forEach(p => { c.globalAlpha = clamp(p.l, 0, 1); c.fillStyle = p.c; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.3); c.fill(); });
  c.restore(); c.globalAlpha = 1;
  b.texts.forEach(tx => { c.globalAlpha = clamp(tx.l * 1.5, 0, 1); c.font = `900 ${tx.size}px system-ui,sans-serif`; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = '#000'; c.strokeText(tx.s, tx.x, tx.y); c.fillStyle = tx.col; c.fillText(tx.s, tx.x, tx.y); });
  c.globalAlpha = 1;
}
// Kinematik (Letterbox, Titel, Strahlen), Treffer-Blitz und HUD
function drawOverlay(c, b) {
  if (b.cine) {
    const k = clamp(b.cine.t / b.cine.dur, 0, 1), bar = Math.sin(k * Math.PI) * 70;
    c.fillStyle = '#000'; c.fillRect(0, 0, 360, bar); c.fillRect(0, 640 - bar, 360, bar);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .25 * Math.sin(k * Math.PI); c.strokeStyle = b.cine.col; c.lineWidth = 3;
    for (let i = 0; i < 24; i++) { const a = i / 24 * 6.28 + k * 2; c.beginPath(); c.moveTo(180 + Math.cos(a) * 40, 300 + Math.sin(a) * 40); c.lineTo(180 + Math.cos(a) * 520, 300 + Math.sin(a) * 520); c.stroke(); }
    c.restore();
    c.globalAlpha = Math.sin(k * Math.PI); c.font = '900 26px system-ui,sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.shadowColor = b.cine.col; c.shadowBlur = 18;
    c.fillText(b.cine.name.toUpperCase(), 180, 568 - (70 - bar) * .2); c.shadowBlur = 0; c.globalAlpha = 1;
  }
  if (b.flashP > 0) { c.fillStyle = '#ff2040'; c.globalAlpha = b.flashP * 1.2; c.fillRect(0, 0, 360, 640); c.globalAlpha = 1; }
  drawHUD(c);
}
const CARD = i => ({ x: 10 + i * 88, y: 524, w: 80, h: 106 });
const PORT = i => ({ x: 10 + i * 116, y: 40, w: 108, h: 44 });
function drawHUD(c) {
  const b = B, e = b.enemy, m = b.team[b.act];
  c.textAlign = 'left';
  // Gegner-Leiste
  c.fillStyle = 'rgba(0,0,0,.55)'; rr(c, 10, 8, 340, 24, 8); c.fill();
  c.fillStyle = EL[e.el]; rr(c, 12, 10, Math.max(0, 336 * e.hp / e.max), 20, 7); c.fill();
  c.font = '800 12px system-ui,sans-serif'; c.fillStyle = '#fff'; c.shadowColor = '#000'; c.shadowBlur = 4;
  c.fillText(`${e.name} · ${e.ai.label}`, 18, 25); c.shadowBlur = 0;
  if (e.team.length > 1) e.team.forEach((t, i) => { c.fillStyle = i === e.act ? '#fff' : t.hp > 0 ? EL[t.el] : '#555'; c.beginPath(); c.arc(334 - i * 13, 20, 4, 0, 6.3); c.fill(); });
  // Team-Porträts
  b.team.forEach((t, i) => {
    const p = PORT(i), act = i === b.act, dead = t.hp <= 0;
    c.globalAlpha = dead ? .35 : 1;
    c.fillStyle = act ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.5)'; rr(c, p.x, p.y, p.w, p.h, 8); c.fill();
    c.strokeStyle = act ? '#ffd23b' : EL[t.c.el] + '88'; c.lineWidth = act ? 2 : 1; rr(c, p.x, p.y, p.w, p.h, 8); c.stroke();
    c.fillStyle = EL[t.c.el]; c.font = '900 13px system-ui,sans-serif'; c.fillText(t.c.name, p.x + 8, p.y + 17);
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(p.x + 8, p.y + 26, p.w - 16, 8);
    c.fillStyle = t.hp / t.max > .3 ? '#6fff9f' : '#ff6a6a'; c.fillRect(p.x + 8, p.y + 26, (p.w - 16) * t.hp / t.max, 8);
    if (!act && b.swapCd > 0 && !dead) { c.fillStyle = 'rgba(0,0,0,.6)'; rr(c, p.x, p.y, p.w, p.h, 8); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(Math.ceil(b.swapCd) + 's', p.x + p.w / 2, p.y + 28); c.textAlign = 'left'; }
    c.globalAlpha = 1;
  });
  // Scherben
  for (let i = 0; i < 7; i++) { c.fillStyle = i < b.shards ? '#ffd23b' : 'rgba(255,255,255,.2)'; c.save(); c.translate(132 + i * 16, 98); c.rotate(.785); c.fillRect(-4, -4, 8, 8); c.restore(); }
  c.fillStyle = '#fff'; c.font = '700 10px system-ui,sans-serif'; c.globalAlpha = .7; c.fillText('RISING RUSH', 14, 102); c.globalAlpha = 1;
  // Combo
  if (b.combo > 1) { c.textAlign = 'right'; c.font = '900 24px system-ui,sans-serif'; c.fillStyle = '#ffd23b'; c.strokeStyle = '#000'; c.lineWidth = 4; c.strokeText(b.combo + ' HITS', 350, 140); c.fillText(b.combo + ' HITS', 350, 140); c.textAlign = 'left'; }
  // Hinweis
  if (b.hint > 0) {
    c.globalAlpha = Math.min(1, b.hint); c.fillStyle = 'rgba(0,0,0,.6)'; rr(c, 20, 380, 320, 62, 10); c.fill();
    c.fillStyle = '#fff'; c.font = '600 12px system-ui,sans-serif'; c.textAlign = 'center';
    c.fillText('Tippen: Ki-Schuss · Halten: Ki laden', 180, 403); c.fillText('Wischen ←/→: Ausweichen · ↑/↓: Distanz', 180, 421); c.fillText('Karten unten antippen · Porträt = Wechsel', 180, 437);
    c.textAlign = 'left'; c.globalAlpha = 1;
  }
  if (b.hold) { c.fillStyle = '#9fe8ff'; c.font = '800 13px system-ui,sans-serif'; c.textAlign = 'center'; c.fillText('KI LADEN…', 180, 478); c.textAlign = 'left'; }
  // Ki-Leiste + Ausweich-Leiste
  c.fillStyle = '#9fe8ff'; c.font = '800 11px system-ui,sans-serif'; c.fillText('KI', 10, 508);
  for (let i = 0; i < 10; i++) {
    const f = clamp(b.ki - i, 0, 1); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(28 + i * 22, 498, 20, 10);
    c.fillStyle = f >= 1 ? '#3be0ff' : '#2a8fb0'; c.fillRect(28 + i * 22, 498, 20 * f, 10);
  }
  c.fillStyle = '#c9ffd9'; c.fillText('AUSW.', 256, 508);
  for (let i = 0; i < 3; i++) { const f = clamp(b.vg - i, 0, 1); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(292 + i * 20, 498, 18, 10); c.fillStyle = '#6fff9f'; c.fillRect(292 + i * 20, 498, 18 * f, 10); }
  // Karten
  b.hand.forEach((cd, i) => {
    const p = CARD(i), inf = cardInfo(cd), ok = b.ki >= inf.cost, col = EL[m.c.el];
    c.save();
    c.fillStyle = 'rgba(8,8,24,.9)'; rr(c, p.x, p.y, p.w, p.h, 10); c.fill();
    const gg = c.createLinearGradient(p.x, p.y, p.x, p.y + p.h); gg.addColorStop(0, col + (ok ? '99' : '33')); gg.addColorStop(1, col + '11');
    c.fillStyle = gg; rr(c, p.x, p.y, p.w, p.h, 10); c.fill();
    c.strokeStyle = ok ? col : '#ffffff33'; c.lineWidth = cd.type === 'main' ? 3 : 1.5; rr(c, p.x, p.y, p.w, p.h, 10); c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '800 10px system-ui,sans-serif'; c.fillText(D.cardTypes[cd.type].label.toUpperCase(), p.x + 40, p.y + 16);
    c.font = '900 28px system-ui,sans-serif'; c.fillText(['⚔', '✺', '☄', '★'][['melee', 'ranged', 'special', 'main'].indexOf(cd.type)], p.x + 40, p.y + 58);
    c.font = '700 10px system-ui,sans-serif'; c.fillText(inf.name.length > 14 ? inf.name.slice(0, 13) + '…' : inf.name, p.x + 40, p.y + 80);
    c.fillStyle = ok ? '#3be0ff' : '#ff8080'; c.font = '900 14px system-ui,sans-serif'; c.fillText('KI ' + inf.cost, p.x + 40, p.y + 98);
    if (cd.shard) { c.fillStyle = '#ffd23b'; c.save(); c.translate(p.x + 68, p.y + 12); c.rotate(.785); c.fillRect(-5, -5, 10, 10); c.restore(); }
    if (cd.cd > 0) { c.fillStyle = 'rgba(0,0,0,.7)'; rr(c, p.x, p.y, p.w, p.h, 10); c.fill(); }
    c.restore();
  });
  c.textAlign = 'left';
}
const cardAt = p => { for (let i = 0; i < 4; i++) { const r = CARD(i); if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i; } return -1; };
const portAt = p => { for (let i = 0; i < 3; i++) { const r = PORT(i); if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i; } return -1; };

/* ---- Touch-Steuerung ---- */
const lp = e => { const r = bc.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 360, y: (e.clientY - r.top) / r.height * 640 }; };
bc.addEventListener('pointerdown', e => {
  if (!B || B.over || B.rrActive) return;
  const p = lp(e); ptr = { x: p.x, y: p.y, t: performance.now(), moved: false, card: cardAt(p), port: portAt(p) };
  try { bc.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
});
bc.addEventListener('pointermove', e => {
  if (!ptr) return; const p = lp(e);
  if (Math.hypot(p.x - ptr.x, p.y - ptr.y) > 14) ptr.moved = true;
  ptr.cx = p.x; ptr.cy = p.y;
});
function endPtr(e, cancel) {
  if (!ptr || !B) { ptr = null; return; }
  const p = lp(e), dx = p.x - ptr.x, dy = p.y - ptr.y, dt = performance.now() - ptr.t, q = ptr; ptr = null;
  if (cancel || B.over || B.rrActive || B.cine) return;
  if (q.card >= 0) { if (!q.moved) useCard(q.card); return; }
  if (q.port >= 0) { if (!q.moved) swapTo(q.port); return; }
  if (q.moved) {
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 28) dodgeSwipe(dx > 0 ? 1 : -1);
    else if (Math.abs(dy) > 28) { B.distT = dy < 0 ? .1 : .9; addText(dy < 0 ? 'NÄHER' : 'ABSTAND', 180, 470, '#cfe', 13); beep(400, .1, 'sine', .04); }
  } else if (dt < 220 && B.blastCd <= 0) {
    B.blastCd = .45; B.pose = .5; shoot('p', .45, EL[B.team[B.act].c.el], .3);
  }
}
bc.addEventListener('pointerup', e => endPtr(e, false));
bc.addEventListener('pointercancel', e => endPtr(e, true));

/* ====================== Home-Szene (Hintergrund-Canvas) ====================== */
let homeLean = 0, homeTarget = 0, homePose = 0, homeT = 0;
$('#menu').addEventListener('pointermove', e => {
  if (tab !== 'home') return; const r = app.getBoundingClientRect(); homeTarget = clamp(((e.clientX - r.left) / r.width - .5) * 2, -1, 1);
});
$('#menu').addEventListener('pointerdown', e => {
  if (tab !== 'home' || e.target.closest('#nav') || e.target.closest('#top')) return;
  const r = app.getBoundingClientRect(); homeTarget = clamp(((e.clientX - r.left) / r.width - .5) * 2, -1, 1);
  homePose = 1; beep(pick([330, 392, 440, 523]), .25, 'triangle', .06, 200);
});
function drawHome(c, dt) {
  homeT += dt; homeLean += (homeTarget - homeLean) * Math.min(1, dt * 6); homePose = Math.max(0, homePose - dt * 2);
  const m = S && CH(S.main) || { el: 'red' };
  drawSpace(c, homeT, '#0a0720', '#1d0c40');
  if (!S3 && (scr === 'start' || (scr === 'menu' && tab === 'home'))) {
    const col = EL[m.el];
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(180, 380, 10, 180, 380, 230); g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00'); c.fillStyle = g; c.fillRect(0, 150, 360, 450); c.restore();
    c.fillStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.ellipse(180, 505, 110, 20, 0, 0, 6.3); c.fill();
    fighter(c, 180 + homeLean * 14, 500, 2.5, col, { t: homeT, lean: homeLean * 2, atk: homePose * .8, alpha: scr === 'start' ? .55 : 1, charge: homePose > 0 });
  } else { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, 360, 640); }
}

/* ====================== Start & Loop ====================== */
let last = 0;
function loop(ts) {
  const dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
  try {
    if (scr === 'battle') {
      updateBattle(dt);
      if (B && B.use3d && S3) { try { S3.setVisible(true); S3.renderBattle(B, dt); } catch (e) { fail3d(e); } }
      else if (S3) S3.setVisible(false);
      setT(bcx); drawBattle(bcx);
    } else if (scr === 'gacha') { if (S3) S3.setVisible(false); setT(gcx); if (G) drawGacha(gcx, dt); }
    else {
      setT(bgx); drawHome(bgx, dt);
      if (S3) {
        if (scr === 'start' || (scr === 'menu' && tab === 'home')) {
          try { S3.setVisible(true); S3.renderHome(homeT, CH(S.main), homeLean, homePose, scr === 'start'); } catch (e) { fail3d(e); }
        } else S3.setVisible(false);
      }
    }
  } catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}
$('#start').addEventListener('pointerdown', () => {
  beep(440, .3, 'triangle', .07, 440);
  if (AC && AC.state === 'suspended') AC.resume();
  show('menu'); setTab('home');
});
$$('#nav button').forEach(b => b.onclick = () => { const m = $('#modal'); if (m) m.remove(); setTab(b.dataset.t); beep(500, .05); });
setInterval(() => { if (scr === 'menu' && S) renderTop(); }, 1000);

async function boot() {
  fit(); addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 200));
  try {
    D = await (await fetch('data.json')).json();
  } catch (e) {
    $('#start .tap').textContent = 'data.json konnte nicht geladen werden – bitte über http(s) öffnen (z. B. GitHub Pages).';
    return;
  }
  load();
  show('start');
  requestAnimationFrame(loop);
  // 3D-Schicht asynchron laden; schlägt das fehl (kein WebGL, alter Browser) bleibt es beim 2D-Rendering
  import('./scene3d.js').then(m => {
    try { S3 = new m.Scene3D(b3); S3.resize(R.w, R.h, R.dpr); } catch (e) { fail3d(e); }
  }).catch(fail3d);
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
}
boot();
})();

/* VOIDBREAKERS – 3D-Render-Schicht (Three.js).
   Rein darstellend: liest den Kampfzustand aus game.js und zeichnet Stage, Kämpfer, Projektile und Kamera.
   Fällt WebGL/Three aus, nutzt game.js automatisch das 2D-Rendering. */
import * as THREE from './vendor/three.module.js';

const EL = { red: '#ff3b4e', blue: '#3b8bff', green: '#34e07f', yellow: '#ffd23b', purple: '#b455ff' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hash = s => { let x = 2166136261; for (const c of String(s)) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = () => canvasTex(128, 128, (x, w) => {
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
});
const gridTex = (col) => canvasTex(256, 256, (x, w) => {
  x.fillStyle = '#000'; x.fillRect(0, 0, w, w);
  x.strokeStyle = col; x.lineWidth = 6; x.strokeRect(0, 0, w, w);
  x.globalAlpha = .25; x.lineWidth = 2; x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, w); x.moveTo(0, w / 2); x.lineTo(w, w / 2); x.stroke();
});

/* ---------------- Kämpfer-Modell (prozedural aus Primitiven, PBR-Materialien) ---------------- */
const HAIRS = ['spike', 'long', 'helmet', 'horns', 'mohawk', 'hood'];
const WEAPONS = ['none', 'blade', 'orb', 'hammer'];
function lookFor(char) {
  const h = hash(char.id || char.name || 'x'), l = char.look || {};
  return {
    hair: l.hair || HAIRS[h % 6], weapon: l.weapon || WEAPONS[(h >>> 4) % 4], cape: l.cape != null ? l.cape : (h >>> 8) % 3 === 0,
    build: l.build || .96 + ((h >>> 12) % 10) / 100, skin: l.skin || ['#d9b9a2', '#b98b6c', '#8a5a44', '#e8cdb8', '#a9b4c6'][(h >>> 16) % 5], armor: l.armor || '#1c2240'
  };
}
function buildFighter(char, el, glowT) {
  const look = lookFor(char), col = new THREE.Color(EL[el] || '#ffffff'), root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const mats = [];
  const mk = o => { const m = new THREE.MeshStandardMaterial(o); mats.push({ m, e: m.emissive.clone(), ei: m.emissiveIntensity, c: m.color.clone() }); return m; };
  const armor = mk({ color: look.armor, roughness: .4, metalness: .55 });
  const armor2 = mk({ color: '#2d355c', roughness: .5, metalness: .4 });
  const skin = mk({ color: look.skin, roughness: .65, metalness: 0 });
  const glow = mk({ color: col, emissive: col, emissiveIntensity: 1.7, roughness: .4 });
  const hairM = mk({ color: col, emissive: col, emissiveIntensity: .45, roughness: .5 });
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  // Beine
  const legs = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(s * .17, .98, 0); body.add(p);
    add(p, new THREE.CapsuleGeometry(.12, .5, 4, 10), armor, 0, -.5, 0);
    add(p, new THREE.BoxGeometry(.2, .12, .34), armor2, 0, -.95, .05);
    add(p, new THREE.BoxGeometry(.21, .035, .35), glow, 0, -.9, .05);
    return p;
  });
  // Rumpf
  add(body, new THREE.CylinderGeometry(.3, .22, .64, 10), armor, 0, 1.27, 0);
  add(body, new THREE.BoxGeometry(.64, .34, .34), armor2, 0, 1.4, .02);
  add(body, new THREE.SphereGeometry(.065, 12, 10), glow, 0, 1.38, .2);
  add(body, new THREE.CylinderGeometry(.245, .245, .07, 12), glow, 0, 1.0, 0);
  add(body, new THREE.CylinderGeometry(.07, .08, .1, 8), skin, 0, 1.64, 0);
  // Arme (Pivot an der Schulter)
  const arms = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(s * .42, 1.53, 0); body.add(p);
    add(p, new THREE.SphereGeometry(.17, 12, 10), armor2, 0, .02, 0);
    add(p, new THREE.CapsuleGeometry(.085, .3, 4, 8), armor, 0, -.22, 0);
    add(p, new THREE.CapsuleGeometry(.075, .3, 4, 8), armor2, 0, -.56, 0);
    add(p, new THREE.CylinderGeometry(.085, .085, .05, 10), glow, 0, -.5, 0);
    add(p, new THREE.SphereGeometry(.095, 10, 8), skin, 0, -.78, 0);
    return p;
  });
  // Kopf
  const head = new THREE.Group(); head.position.set(0, 1.8, 0); body.add(head);
  const skull = add(head, new THREE.SphereGeometry(.17, 16, 12), skin); skull.scale.set(1, 1.08, 1);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.BoxGeometry(.07, .022, .02), eyeM); e.position.set(s * .065, .01, .155); head.add(e); });
  const hairs = {
    spike: () => { for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, c = add(head, new THREE.ConeGeometry(.07, .3, 6), hairM, Math.cos(a) * .1, .17, Math.sin(a) * .1 - .04); c.rotation.set(Math.sin(a) * .6 - .35, 0, -Math.cos(a) * .6); } },
    long: () => { add(head, new THREE.SphereGeometry(.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * .55), hairM, 0, .02, -.02); const t = add(head, new THREE.CapsuleGeometry(.12, .5, 4, 8), hairM, 0, -.2, -.14); t.scale.set(1.2, 1, .6); },
    helmet: () => { add(head, new THREE.SphereGeometry(.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * .62), armor, 0, .02, 0); add(head, new THREE.BoxGeometry(.3, .045, .06), glow, 0, .01, .16); },
    horns: () => { [-1, 1].forEach(s => { const c = add(head, new THREE.ConeGeometry(.06, .4, 6), hairM, s * .17, .2, 0); c.rotation.z = -s * .7; }); add(head, new THREE.SphereGeometry(.18, 12, 8, 0, Math.PI * 2, 0, Math.PI * .4), armor, 0, .03, -.01); },
    mohawk: () => { for (let i = 0; i < 6; i++) { const c = add(head, new THREE.ConeGeometry(.045, .24 - i * .015, 5), hairM, 0, .2 - i * .005, .1 - i * .055); c.rotation.x = -.3; } },
    hood: () => { const c = add(head, new THREE.ConeGeometry(.26, .55, 10, 1, true), armor, 0, .12, -.04); c.material.side = THREE.DoubleSide; c.rotation.x = -.15; }
  };
  (hairs[look.hair] || hairs.spike)();
  // Cape
  let cape = null;
  if (look.cape) {
    const pv = new THREE.Group(); pv.position.set(0, 1.58, -.2); body.add(pv);
    const g = new THREE.PlaneGeometry(.78, 1.15, 1, 4); g.translate(0, -.57, 0);
    const cm = mk({ color: '#171a33', roughness: .8, metalness: 0, side: THREE.DoubleSide, emissive: col, emissiveIntensity: .12 });
    cape = add(pv, g, cm); cape = pv;
  }
  // Waffe
  let weapon = null;
  if (look.weapon === 'blade') { weapon = new THREE.Group(); arms[1].add(weapon); weapon.position.set(0, -.78, .05); add(weapon, new THREE.BoxGeometry(.06, 1.05, .03), glow, 0, .55, .12); add(weapon, new THREE.BoxGeometry(.2, .05, .06), armor2, 0, .03, .12); weapon.rotation.x = Math.PI / 2.2; }
  else if (look.weapon === 'hammer') { weapon = new THREE.Group(); arms[1].add(weapon); weapon.position.set(0, -.78, .05); add(weapon, new THREE.CylinderGeometry(.03, .03, .9, 6), armor2, 0, .3, .1); add(weapon, new THREE.BoxGeometry(.42, .26, .26), armor, 0, .8, .1); add(weapon, new THREE.BoxGeometry(.44, .05, .28), glow, 0, .8, .1); weapon.rotation.x = Math.PI / 3; }
  else if (look.weapon === 'orb') { weapon = new THREE.Group(); body.add(weapon); add(weapon, new THREE.IcosahedronGeometry(.13, 1), glow, 0, 0, 0); weapon.position.set(-.7, 1.2, .35); }
  // Aura & Schattenfleck
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: col, transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  aura.position.y = 1.1; aura.scale.set(3.2, 3.2, 1); root.add(aura);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(.8, 20), new THREE.MeshBasicMaterial({ map: glowT, color: 0x000000, transparent: true, opacity: .55, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = .015; root.add(blob);
  root.scale.setScalar(look.build);

  const f = {
    root, body, arms, legs, head, cape, weapon, aura, mats, glow, look, ph: Math.random() * 6, height: 2.05 * look.build, w: { flash: -1, op: -1 },
    setFlash(v) {
      if (v === f.w.flash) return; f.w.flash = v;
      mats.forEach(o => { if (v > 0) { o.m.emissive.setRGB(1, 1, 1); o.m.emissiveIntensity = 1.2; } else { o.m.emissive.copy(o.e); o.m.emissiveIntensity = o.ei; } });
    },
    setOpacity(a) {
      if (a === f.w.op) return; f.w.op = a;
      mats.forEach(o => { o.m.transparent = a < 1; o.m.opacity = a; o.m.depthWrite = a >= 1; });
      aura.material.opacity = Math.min(aura.material.opacity, .4 * a);
    },
    update(t, s) {
      const atk = s.atk || 0, tele = s.tele || 0, sw = Math.sin(t * 3 + f.ph) * .05;
      body.position.y = Math.sin(t * 2 + f.ph) * .02;
      body.position.z = atk * .5;
      body.rotation.z = (s.lean || 0) * .1;
      body.rotation.x = atk * -.12;
      arms[1].rotation.x = -atk * 2.0 - tele * 2.4 + sw; arms[0].rotation.x = -atk * .9 - tele * 2.4 - sw;
      arms[1].rotation.z = -.12 - tele * .4; arms[0].rotation.z = .12 + tele * .4;
      legs[0].rotation.x = Math.sin(t * 3 + f.ph) * .04 + atk * .3; legs[1].rotation.x = -Math.sin(t * 3 + f.ph) * .04 - atk * .15;
      head.rotation.x = atk * .1 + Math.sin(t * 1.7 + f.ph) * .02;
      if (cape) cape.rotation.x = .18 + Math.sin(t * 2.4 + f.ph) * .08 + Math.abs(s.lean || 0) * .25 + atk * .3;
      if (weapon && look.weapon === 'orb') { weapon.position.y = 1.2 + Math.sin(t * 2.2) * .08; weapon.rotation.y = t; }
      const ch = s.charge ? 1 : 0;
      aura.scale.setScalar(3.2 + ch * 1.5 + Math.sin(t * 5 + f.ph) * .2);
      aura.material.opacity = (.28 + ch * .4 + tele * .3) * (f.w.op < 1 ? f.w.op : 1);
      glow.emissiveIntensity = 1.5 + Math.sin(t * 4 + f.ph) * .3 + ch * 1.5 + tele * 1.2;
      f.setFlash(s.hit ? 1 : -1);
    }
  };
  root.traverse(o => { if (o.isMesh && o !== blob) o.castShadow = true; });
  return f;
}

/* ---------------- Szene ---------------- */
export class Scene3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.r = opts.renderer || new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    const r = this.r;
    r.setClearColor(0x000000, 0);
    if (r.shadowMap) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15; this.q = 0;
    this.cam = new THREE.PerspectiveCamera(48, 360 / 640, .1, 220);
    this.glowT = glowTex();
    this.fighters = new Map();
    this.battle = new THREE.Scene(); this.home = new THREE.Scene();
    this.stage = null; this.projs = new Map(); this.sp = {};
    this.cur = { p: null, e: null, h: null };
    this._v = new THREE.Vector3(); this._look = new THREE.Vector3();
    this.setupHome();
  }
  resize(w, h, dpr) {
    this.W = w; this.H = h; this.dpr = dpr;
    this.r.setPixelRatio(Math.min(dpr, [1.5, 1, .75][this.q || 0])); this.r.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  // Grafikstufen: 0 hoch (Schatten 1024, bis 1.5x Auflösung), 1 mittel (Schatten 512, 1x), 2 niedrig (keine Schatten, 0.75x)
  setQuality(q) {
    this.q = q; const on = q < 2, size = q === 0 ? 1024 : 512;
    if (this.r.shadowMap) this.r.shadowMap.enabled = on;
    [this.home, this.battle].forEach(sc => sc.traverse(o => {
      if (o.isLight && o.shadow) {
        o.castShadow = on;
        if (o.shadow.mapSize.x !== size) { o.shadow.mapSize.set(size, size); if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } }
      }
      if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; });
    }));
    if (this.W) this.resize(this.W, this.H, this.dpr);
  }
  setVisible(v) { this.canvas.style.display = v ? 'block' : 'none'; }
  fighter(char, el, tag = '') {   // tag trennt Rollen, damit Spieler und Gegner nie dasselbe Modell teilen
    const k = (char.id || char.name) + '|' + el + '|' + tag;
    let f = this.fighters.get(k);
    if (!f) { f = buildFighter(char, el, this.glowT); this.fighters.set(k, f); }
    return f;
  }

  /* ----- Home ----- */
  setupHome() {
    const s = this.home;
    s.add(new THREE.HemisphereLight(0x8a7bff, 0x0a0818, 1.2));
    const key = new THREE.DirectionalLight(0xfff0e0, 2.4); key.position.set(-3, 5, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -2, near: 1, far: 16 }); key.shadow.bias = -.0005; s.add(key);
    this.homeRim = new THREE.PointLight(0xffffff, 40, 20, 2); this.homeRim.position.set(2.5, 2.5, -2.5); s.add(this.homeRim);
    const fl = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), new THREE.MeshStandardMaterial({ color: 0x0b0a1a, roughness: .3, metalness: .7 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; s.add(fl);
    this.homeRing = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.32, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.homeRing.rotation.x = -Math.PI / 2; this.homeRing.position.y = .02; s.add(this.homeRing);
  }
  renderHome(t, char, lean, pose, dim) {
    const el = char.el, f = this.fighter(char, el, 'h');
    if (this.cur.h !== f) { if (this.cur.h) this.home.remove(this.cur.h.root); this.home.add(f.root); this.cur.h = f; f.root.scale.setScalar(f.look.build * 1.22); }
    f.root.rotation.y = lean * .7 + Math.sin(t * .6) * .12;
    f.setOpacity(1);
    f.update(t, { atk: pose * .8, charge: pose > 0, lean: lean * 2 });
    const c = new THREE.Color(EL[el]); this.homeRim.color.copy(c); this.homeRing.material.color.copy(c);
    this.homeRing.scale.setScalar(1 + Math.sin(t * 2) * .03);
    this.cam.fov = 40; this.cam.position.set(0, 1.35, 5.2); this.cam.lookAt(0, 1.0, 0); this.cam.updateProjectionMatrix();
    this.r.render(this.home, this.cam);
  }

  /* ----- Stage ----- */
  disposeStage() {
    if (!this.stage) return;
    this.battle.remove(this.stage.group);
    this.stage.group.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) [].concat(m).forEach(x => { if (x.map) x.map.dispose(); if (x.emissiveMap) x.emissiveMap.dispose(); x.dispose(); }); });
    this.battle.traverse(o => { if (o.isLight && o.shadow && o.shadow.dispose) o.shadow.dispose(); });
    this.battle.clear(); this.stage = null; this.projs.clear();
    this.cur.p = null; this.cur.e = null;
  }
  startBattle(b) {
    this.disposeStage();
    const st = b.st, sc = this.battle, g = new THREE.Group(), rand = rng(hash(st.name));
    const bg0 = new THREE.Color(st.bg[0]), bg1 = new THREE.Color(st.bg[1]), grid = new THREE.Color(st.grid);
    sc.background = bg0.clone(); sc.fog = new THREE.Fog(bg1.clone().multiplyScalar(1.4), 14, 75);
    // Sterne
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const th = rand() * Math.PI * 2, ph = Math.acos(rand() * .9 + .05), R = 110; pos[i * 3] = Math.sin(ph) * Math.cos(th) * R; pos[i * 3 + 1] = Math.cos(ph) * R * .8 + 8; pos[i * 3 + 2] = -Math.abs(Math.sin(ph) * Math.sin(th)) * R; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: .8 })); g.add(stars);
    // Planet + Ring + Glühen
    const planet = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 24), new THREE.MeshBasicMaterial({ color: grid.clone().multiplyScalar(.55), fog: false })); planet.position.set(-42, 28, -85); g.add(planet);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowT, color: grid, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.scale.set(70, 70, 1); halo.position.copy(planet.position); g.add(halo);
    const ring = new THREE.Mesh(new THREE.RingGeometry(21, 28, 64), new THREE.MeshBasicMaterial({ color: grid, transparent: true, opacity: .3, side: THREE.DoubleSide, fog: false })); ring.position.copy(planet.position); ring.rotation.set(1.2, .2, .3); g.add(ring);
    // Boden mit leuchtendem Raster + Arena-Ring
    const gt = gridTex(st.grid); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(40, 40); gt.anisotropy = 8;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: 0x07060f, roughness: .3, metalness: .65, emissive: grid, emissiveMap: gt, emissiveIntensity: .75 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const arena = new THREE.Mesh(new THREE.RingGeometry(8.6, 9, 72), new THREE.MeshBasicMaterial({ color: grid, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    arena.rotation.x = -Math.PI / 2; arena.position.set(0, .03, -4); g.add(arena);
    // Ruinen-Säulen & schwebende Kristalle
    const pm = new THREE.MeshStandardMaterial({ color: 0x10122a, roughness: .8, metalness: .2 }), cm = new THREE.MeshStandardMaterial({ color: grid, emissive: grid, emissiveIntensity: 1.6, roughness: .3 });
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2, d = 14 + rand() * 24, h = 3 + rand() * 9, w = .8 + rand() * 1.4;
      const col = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), pm); col.position.set(Math.cos(a) * d, h / 2, -4 + Math.sin(a) * d * .8 - 8); col.rotation.y = rand(); col.rotation.z = (rand() - .5) * .12; col.castShadow = true; g.add(col);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, .12, w * 1.05), cm); cap.position.set(col.position.x, h, col.position.z); cap.rotation.y = col.rotation.y; g.add(cap);
    }
    const crystals = [];
    for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(.4 + rand() * .5), cm); c.position.set((rand() - .5) * 40, 3 + rand() * 6, -8 - rand() * 28); c.userData.sp = .3 + rand(); c.userData.y0 = c.position.y; g.add(c); crystals.push(c); }
    // Beam (Haupt-Fähigkeit)
    const bgeo = new THREE.CylinderGeometry(.3, .3, 1, 14, 1, true); bgeo.rotateX(Math.PI / 2);
    const beam = new THREE.Mesh(bgeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); beam.visible = false; g.add(beam);
    // Warn-Ring unter dem Gegner
    const warn = new THREE.Mesh(new THREE.RingGeometry(.9, 1.2, 40), new THREE.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    warn.rotation.x = -Math.PI / 2; warn.position.y = .04; g.add(warn);
    sc.add(g);
    // Licht
    sc.add(new THREE.HemisphereLight(bg1.clone().lerp(new THREE.Color(0xffffff), .35), 0x0a0818, 1.15));
    const key = new THREE.DirectionalLight(0xfff0e0, 2.3); key.position.set(-5, 9, 7); key.castShadow = (this.q || 0) < 2; key.shadow.mapSize.set(this.q ? 512 : 1024, this.q ? 512 : 1024);
    Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 34 }); key.shadow.bias = -.0006; sc.add(key); sc.add(key.target);
    const eRim = new THREE.PointLight(new THREE.Color(EL[st.el]), 60, 28, 2), pRim = new THREE.PointLight(new THREE.Color(EL[b.team[0].c.el]), 25, 20, 2);
    sc.add(eRim); sc.add(pRim);
    this.stage = { group: g, stars, planet, ring, crystals, beam, warn, key, eRim, pRim };
  }

  /* ----- Kampf ----- */
  setActors(b) {
    const pf = this.fighter(b.team[b.act].c, b.team[b.act].c.el, 'p');
    const ec = b.enemy.c || { id: 'boss_' + b.st.enemy, name: b.st.enemy, look: b.st.look || { hair: 'horns', cape: true, build: b.st.scale || 1.15, weapon: 'blade', armor: '#241830' } };
    const ef = this.fighter(ec, b.enemy.el, 'e');
    if (this.cur.p !== pf) { if (this.cur.p) this.battle.remove(this.cur.p.root); this.battle.add(pf.root); this.cur.p = pf; pf.root.rotation.y = Math.PI; }
    if (this.cur.e !== ef) { if (this.cur.e) this.battle.remove(this.cur.e.root); this.battle.add(ef.root); this.cur.e = ef; }
    this.st = this.stage;
    return [pf, ef];
  }
  project(x, y, z) { const v = this._v.set(x, y, z).project(this.cam); return { x: (v.x * .5 + .5) * 360, y: (1 - (v.y * .5 + .5)) * 640 }; }
  renderBattle(b, dt) {
    if (!this.stage) this.startBattle(b);
    const [pf, ef] = this.setActors(b), S = this.stage, t = b.t, e = b.enemy, cam = this.cam;
    const sep = lerp(2.6, 8.6, b.dist), pX = b.px * 2.1, eX = b.ex * 1.7 + b.px * .6, pZ = 0, eZ = -sep;
    pf.root.position.set(pX, 0, pZ); ef.root.position.set(eX, 0, eZ);
    ef.root.rotation.y = Math.atan2(pX - eX, pZ - eZ);       // Modell-Front ist +z: Gegner schaut zum Spieler
    pf.root.rotation.y = Math.atan2(eX - pX, eZ - pZ);       // Spieler schaut zum Gegner
    // Posen
    const cine = b.cine, k = cine ? clamp(cine.t / cine.dur, 0, 1) : 0, ease = Math.sin(k * Math.PI);
    const eTele = e.tele > 0 ? 1 : 0;
    pf.setOpacity(b.dodge > 0 ? .45 : 1); ef.setOpacity(e.vanish > 0 ? .25 : 1);
    pf.update(t, { atk: Math.max(b.pose, cine ? ease * .7 : 0), lean: -b.pxT * 1.5, charge: b.hold || (cine && cine.main), hit: b.flashP > 0 });
    ef.update(t + 1.7, { atk: b.ePose, tele: eTele * (.7 + .3 * Math.sin(t * 30)), lean: Math.sin(t * 2) * .3, hit: e.flash > 0 });
    // Kamera: Third-Person hinter dem Spieler, Blick auf den Gegner
    const tx = lerp(pX, eX, .8), tz = lerp(pZ, eZ, .72);
    let cx = pX * .85 + 1.0, cy = 2.25, cz = pZ + 5.6, fov = 48;
    const lx = tx, ly = .8 + (cine ? ease * .1 : 0), lz = tz;
    if (cine) {
      const a = -.7 + k * 1.5, rad = lerp(7, 3.4, ease), hh = 1.5 + ease * .5;
      cx = lerp(cx, eX + Math.sin(a) * rad, ease); cy = lerp(cy, hh, ease); cz = lerp(cz, eZ + Math.cos(a) * rad, ease); fov = 48 - 12 * ease;
    }
    const sh = b.shake * .012;
    cam.position.set(cx + (Math.random() - .5) * sh, cy + (Math.random() - .5) * sh, cz + (Math.random() - .5) * sh);
    cam.fov = fov; cam.updateProjectionMatrix();
    this._look.set(cine ? lerp(lx, eX, ease) : lx, cine ? lerp(ly, 1.4, ease) : ly, cine ? lerp(lz, eZ, ease) : lz); cam.lookAt(this._look); cam.updateMatrixWorld(true);
    // Stage-Animationen & Licht
    S.stars.rotation.y += dt * .004; S.planet.rotation.y += dt * .02;
    S.crystals.forEach(c => { c.rotation.y += dt * c.userData.sp; c.rotation.x += dt * c.userData.sp * .5; c.position.y = c.userData.y0 + Math.sin(t * c.userData.sp * 2) * .4; });
    S.key.target.position.set((pX + eX) / 2, 0, (pZ + eZ) / 2); S.key.position.set(S.key.target.position.x - 5, 9, S.key.target.position.z + 8);
    S.eRim.position.set(eX + 1.5, 3, eZ - 2.5); S.eRim.intensity = 60 + eTele * 60 + (e.flash > 0 ? 80 : 0);
    S.pRim.color.set(EL[b.team[b.act].c.el]); S.pRim.position.set(pX - 2, 2.5, pZ - 1.5);
    S.warn.position.x = eX; S.warn.position.z = eZ; S.warn.material.opacity = eTele ? .5 + .4 * Math.sin(t * 28) : 0; S.warn.scale.setScalar(1 + (eTele ? .2 * Math.sin(t * 12) : 0));
    // Beam bei Haupt-Fähigkeit / Rising Rush
    if (cine && cine.main) {
      const a = new THREE.Vector3(pX, 1.4, pZ - .5), c = new THREE.Vector3(eX, 1.3, eZ + .4), len = a.distanceTo(c);
      S.beam.visible = true; S.beam.position.copy(a).lerp(c, .5); S.beam.scale.set(1 + ease * 2.2, 1 + ease * 2.2, len); S.beam.lookAt(c);
      S.beam.material.color.set(cine.col); S.beam.material.opacity = clamp((k - .15) * 2.2, 0, 1) * (1 - clamp((k - .8) * 5, 0, 1)) * .75;
    } else S.beam.visible = false;
    // Projektile
    const alive = new Set();
    b.proj.forEach(p => {
      alive.add(p);
      let o = this.projs.get(p);
      if (!o) {
        o = new THREE.Group();
        o.add(new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })));
        o.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowT, color: new THREE.Color(p.col), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
        o.children[1].scale.set(1.6, 1.6, 1); this.stage.group.add(o); this.projs.set(p, o);
      }
      const q = clamp(p.t / p.dur, 0, 1), from = p.own === 'p' ? [pX + .3, 1.4, pZ - .6] : [eX, 1.3, eZ + .6], to = p.own === 'p' ? [eX, 1.3, eZ + .3] : [pX, 1.4, pZ - .3];
      o.position.set(lerp(from[0], to[0], q), lerp(from[1], to[1], q) + Math.sin(q * Math.PI) * .35, lerp(from[2], to[2], q));
      o.scale.setScalar((p.big ? 2.1 : 1) * lerp(.7, 1.2, q));
    });
    this.projs.forEach((o, p) => { if (!alive.has(p)) { this.stage.group.remove(o); o.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); this.projs.delete(p); } });
    // Bildschirmpositionen für Treffertexte / Partikel / HUD (logische 360x640)
    const proj = (x, z, h) => { const f = this.project(x, 0, z), hd = this.project(x, h, z); return { x: f.x, y: f.y, s: Math.max(.1, (f.y - hd.y) / 200) }; };
    this.sp.p = proj(pX, pZ, pf.height); this.sp.e = proj(eX, eZ, ef.height);
    this.r.render(this.battle, cam);
  }
}

"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// ザッピングの1ループ（台本: docs/design/zap/loop1_script.md）。
// 宇宙（100本のカードと KV と同じ放射の破片）→ 1本に寄る → 映像の下に秒ごとの実コマが並ぶ → 涙の1秒で糸が3本 → 糸の先の「その1秒」へ跳ぶ
// → … → 引くと宇宙に戻り、たどった線が残る。カメラは同じ3D空間を飛び続け、映像（DOM の video）はいつもカードの投影位置に貼られる（画面の切り替えをしない）。
// 時刻 T から全部を決める（イベント列＋T）。?demo=1 で台本どおり自動、?capture=1 で window.__zap.render(T) による1コマずつの描き出し、?webm=1 で VP9。

const B = "https://storage.googleapis.com/e-mooments-assets/lab/zap";
type NodeId = "A" | "B" | "C";
type Node = { no: string; file: string; seg: number; play: number; tear: number; caption: string; meta: string };
const NODES: Record<NodeId, Node> = {
  A: { no: "090", file: "m090", seg: 45, play: 49, tear: 55, caption: "40歳・山下の男泣き", meta: "ラグビー｜神戸スティーラーズ初制覇" },
  B: { no: "062", file: "m062", seg: 35, play: 39, tear: 41, caption: "同期入団の二人の涙", meta: "プロ野球｜西武・栗山巧の引退式" },
  C: { no: "010", file: "m010", seg: 15, play: 19, tear: 21, caption: "ゴール裏の少年の涙", meta: "W杯｜日本×ブラジル" },
};
const SEG_END: Record<NodeId, number> = { A: 62, B: 50, C: 32 };
type Thread = { to?: NodeId; prev: string; label: string; sport: string; color: string };
// 糸の先はすべて実フレームで確かめた1秒（プレビューは5秒、2秒目がその1秒）
const THREADS: Record<NodeId, Thread[]> = {
  A: [
    { to: "B", prev: "p062_39", label: "同期入団の二人の涙", sport: "プロ野球", color: "#ff3366" },
    { prev: "p010_52", label: "ピッチに倒れた田中碧", sport: "W杯", color: "#4de6ff" },
    { prev: "p038_47", label: "PKを決め、手を合わせて泣く", sport: "欧州予選", color: "#dff257" },
  ],
  B: [
    { to: "C", prev: "p010_19", label: "ゴール裏の少年の涙", sport: "W杯", color: "#4de6ff" },
    { prev: "p089_116", label: "引退の日、目元をぬぐう", sport: "ラグビー", color: "#ff8866" },
    { prev: "p042_10", label: "芝に突っ伏した優勝の涙", sport: "女子サッカー", color: "#922a88" },
  ],
  C: [
    { prev: "p060_174", label: "初めてのお立ち台で涙", sport: "プロ野球", color: "#ff3366" },
    { prev: "p012_28", label: "目を潤ませる吉田麻也", sport: "W杯", color: "#dff257" },
    { prev: "p071_81", label: "優勝の抱擁", sport: "Bリーグ", color: "#66ccff" },
  ],
};
const SHARD_COLORS = ["#ff3366", "#ff8866", "#922a88", "#ff1a26", "#ff0020", "#ccdd66", "#4de6ff", "#dd8820", "#66ccff", "#dff257", "#ff3355", "#ffee55"];
// 宇宙の中の A/B/C の位置（画面上の割合 nx, ny と奥行き）
const PLACE: Record<NodeId, [number, number, number]> = { A: [-0.42, 0.3, 34], B: [0.42, 0.12, 46], C: [-0.1, -0.44, 30] };
const CW = 6, CH = 3.375; // カードの大きさ（16:9）

type Ev = { T: number; type: "enter"; node: NodeId } | { T: number; type: "hop"; from: NodeId; to: NodeId; slot: number } | { T: number; type: "back" };
const DEMO: Ev[] = [
  { T: 3.8, type: "enter", node: "A" },
  { T: 13.0, type: "hop", from: "A", to: "B", slot: 0 },
  { T: 18.4, type: "hop", from: "B", to: "C", slot: 0 },
  { T: 23.6, type: "back" },
];
const ENTER = 1.6, HOP = 1.6, BACK = 2.4, LEAD = 0.6; // 秒。LEAD: 動き出してから映像が回り始めるまで

const hash = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (k: number) => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

type State = {
  phase: "home" | "enter" | "in" | "hop" | "back";
  k: number; node: NodeId | null; from: NodeId | null; to: NodeId | null; slot: number;
  evT: number; start: Partial<Record<NodeId, number>>; visited: NodeId[]; homeTime: number; backEnd: number;
};
// イベント列と時刻から状態を決める
function stateAt(evs: Ev[], T: number): State {
  const s: State = { phase: "home", k: 0, node: null, from: null, to: null, slot: 0, evT: 0, start: {}, visited: [], homeTime: 0, backEnd: -1 };
  let homeFrom = 0;
  for (const e of evs) {
    if (e.T > T) break;
    if (e.type === "enter") { s.homeTime += e.T - homeFrom; s.phase = "enter"; s.node = e.node; s.evT = e.T; s.start[e.node] = e.T + LEAD; if (!s.visited.includes(e.node)) s.visited.push(e.node); }
    if (e.type === "hop") { s.phase = "hop"; s.from = e.from; s.to = e.to; s.slot = e.slot; s.node = e.to; s.evT = e.T; s.start[e.to] = e.T + LEAD; if (!s.visited.includes(e.to)) s.visited.push(e.to); }
    if (e.type === "back") { s.phase = "back"; s.evT = e.T; s.backEnd = e.T + BACK; homeFrom = e.T + BACK; }
  }
  if (s.phase === "home") s.homeTime += T - homeFrom;
  if (s.phase === "back" && T >= s.backEnd) { s.homeTime += T - s.backEnd; }
  const dur = s.phase === "enter" ? ENTER : s.phase === "hop" ? HOP : s.phase === "back" ? BACK : 1;
  s.k = clamp((T - s.evT) / dur);
  if ((s.phase === "enter" || s.phase === "hop") && s.k >= 1) s.phase = "in";
  return s;
}

type M = { no: string; title: string; thumb: string | null };

export default function ZapLoop({ moments }: { moments: M[] }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current!;
    const q = new URLSearchParams(location.search);
    const demo = q.has("demo") || q.has("capture"), capture = q.has("capture"), ext = q.has("webm") ? "webm" : "mp4";
    const cv = el.querySelector("canvas") as HTMLCanvasElement;
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setClearColor(0x000000, 1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 400);
    const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
    const W = () => el.clientWidth, H = () => el.clientHeight;
    const portrait = () => W() < H();

    // ── 宇宙: 100枚のカード ──
    const ids: (NodeId | null)[] = moments.map((m) => (Object.keys(NODES) as NodeId[]).find((k) => NODES[k].no === m.no) || null);
    const geo = new THREE.PlaneGeometry(CW, CH);
    const numberTex = (no: string) => { const c = document.createElement("canvas"); c.width = 320; c.height = 180; const g = c.getContext("2d")!; g.fillStyle = "#111"; g.fillRect(0, 0, 320, 180); g.fillStyle = "#555"; g.font = "800 64px Archivo, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(no, 160, 92); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const half = (d: number) => { const h = d * Math.tan((55 * Math.PI) / 360); return [h * 1.78, h]; };
    const placed: [number, number, number][] = [];
    const cards = moments.map((m, i) => {
      const id = ids[i];
      let nx: number, ny: number, d: number;
      if (id) [nx, ny, d] = PLACE[id];
      else {
        let tries = 0;
        do { nx = hash(i, 1 + tries) * 2 - 1; ny = (hash(i, 2 + tries) * 2 - 1) * 0.9; d = 26 + hash(i, 3 + tries) * 100; tries++; }
        while (tries < 30 && ([...Object.values(PLACE), ...placed].some(([ax, ay, ad]) => Math.hypot(nx - ax, (ny - ay) * 1.6) < (ad < d ? 0.2 : 0.12)) || Math.abs(nx) < 0.08 && Math.abs(ny) < 0.12));
      }
      placed.push([nx!, ny!, d!]);
      const [hw, hh] = half(d!);
      const base = new THREE.Vector3(nx! * hw * 0.92, ny! * hh * 0.86, -d!);
      const mat = new THREE.MeshBasicMaterial({ map: m.thumb ? null : numberTex(m.no), transparent: true, opacity: 0, depthWrite: false });
      if (m.thumb) loader.load(m.thumb, (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; });
      const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 2;
      scene.add(mesh);
      return { id, base, mesh, mat };
    });
    const card = (id: NodeId) => cards.find((c) => c.id === id)!;
    // 訪れたカードは、その涙の1秒のコマに変わる
    const tearTex: Partial<Record<NodeId, THREE.Texture>> = {};
    (Object.keys(NODES) as NodeId[]).forEach((id) => loader.load(`${B}/f/${NODES[id].no}_${NODES[id].tear}.jpg`, (t) => { t.colorSpace = THREE.SRGBColorSpace; tearTex[id] = t; }));
    // 訪れたカードの黄色の縁（板の後ろに少し大きい板）
    const rims = (Object.keys(NODES) as NodeId[]).map((id) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.36, CH + 0.36), new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0, depthWrite: false })); m.renderOrder = 1; scene.add(m); return { id, m }; });

    // ── KV と同じ放射の破片（奥の一点から生まれて手前へ） ──
    const ZF = 160, SHARDS = portrait() ? 60 : 90;
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.Float32BufferAttribute([0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0], 3)); sgeo.setIndex([0, 1, 2, 0, 2, 3]);
    const shards = Array.from({ length: SHARDS }, (_, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: SHARD_COLORS[i % SHARD_COLORS.length], transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const g = sgeo.clone(); const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 0; scene.add(mesh);
      return { mesh, mat, i, ph: hash(i, 9), cyc: -1, d: { th: 0, r0: 0, tilt: 0, pitch: 0 } };
    });
    const shapeShard = (s: (typeof shards)[number], cyc: number) => {
      const r = (k: number) => hash(s.i * 7 + 3, cyc * 13 + k);
      const wide = r(1) < 0.18, L = 6 + r(2) * 20, wo = (wide ? 2.4 : 0.5) + r(3) * (wide ? 3.4 : 1.5), wi = r(4) < 0.55 ? wo * r(5) * 0.25 : wo, sk = (r(6) - 0.5) * wo * 1.2;
      const p = s.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      p.setXYZ(0, 0, -wi / 2, 0); p.setXYZ(1, L, -wo / 2 + sk, 0); p.setXYZ(2, L, wo / 2 + sk, 0); p.setXYZ(3, 0, wi / 2, 0); p.needsUpdate = true;
      s.d = { th: r(7) * Math.PI * 2, r0: 4 + r(8) * 18, tilt: (r(10) - 0.5) * 1.3, pitch: -(0.15 + r(11) * 0.55) };
      s.mat.color.set(SHARD_COLORS[Math.floor(r(12) * SHARD_COLORS.length)]); s.cyc = cyc;
    };

    // ── DOM ──
    const $ = (s: string) => el.querySelector(s) as HTMLElement;
    const mainV = {} as Record<NodeId, HTMLVideoElement>;
    (Object.keys(NODES) as NodeId[]).forEach((id) => {
      const v = document.createElement("video"); v.className = "zp-main"; v.src = `${B}/v/${NODES[id].file}.${ext}`; v.preload = "auto"; v.playsInline = true; v.muted = demo; v.crossOrigin = "anonymous";
      $(".zp-videos").appendChild(v); mainV[id] = v;
    });
    // 糸の先の映像は糸ごとに1本ずつ先に読み込んでおき、使うときに枠へ移す（切り替えたとたん黒くならないように）
    const hold = document.createElement("div"); hold.style.display = "none"; el.appendChild(hold);
    const prevV: Record<string, HTMLVideoElement> = {};
    Object.values(THREADS).flat().forEach((th) => { const v = document.createElement("video"); v.src = `${B}/v/${th.prev}.${ext}`; v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous"; hold.appendChild(v); prevV[th.prev] = v; });
    const slots = [0, 1, 2].map((i) => {
      const w = document.createElement("div"); w.className = "zp-prev"; w.dataset.slot = String(i);
      w.innerHTML = `<div class="zp-plab"><b></b><span></span></div><div class="zp-pvbox"></div>`;
      $(".zp-over").appendChild(w);
      return { w, box: w.querySelector(".zp-pvbox") as HTMLElement, v: null as HTMLVideoElement | null, b: w.querySelector("b")!, sp: w.querySelector("span")!, src: "" };
    });
    const strip = $(".zp-strip"), cap = $(".zp-cap"), svg = el.querySelector("svg.zp-svg") as SVGSVGElement, back = $(".zp-back"), cursor = $(".zp-cursor"), shade = $(".zp-shade");

    // ── 状態 ──
    const evs: Ev[] = demo ? [...DEMO] : [];
    let lastT = 0, shardDist = 0, t0 = 0, raf = 0;
    const now = () => (performance.now() - t0) / 1000;
    const proj = (p: THREE.Vector3) => { const v = p.clone().project(camera); return [(v.x * 0.5 + 0.5) * W(), (-v.y * 0.5 + 0.5) * H()]; };
    const rectOf = (c: THREE.Vector3) => { const [x0, y0] = proj(new THREE.Vector3(c.x - CW / 2, c.y + CH / 2, c.z)); const [x1, y1] = proj(new THREE.Vector3(c.x + CW / 2, c.y - CH / 2, c.z)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
    const cardPos = (c: (typeof cards)[number], rot: number) => c.base.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), rot);
    const front = (p: THREE.Vector3) => { const t = Math.tan((camera.fov * Math.PI) / 360); const d = Math.min(CH / 2 / t, CW / 2 / (t * camera.aspect)); return new THREE.Vector3(p.x, p.y, p.z + d * 0.995); };
    // 糸の先（プレビュー）の置き場所（画面の割合）
    const slotRect = (i: number) => {
      const w = W(), h = H();
      if (portrait()) { const pw = w * 0.44, ph = pw * 9 / 16; return { x: 16 + (i % 2) * (w / 2), y: h * 0.1 + Math.floor(i / 2) * (ph + 60) + 30, w: pw, h: ph }; }
      const pw = Math.min(420, w * 0.26), ph = pw * 9 / 16, gap = Math.max(46, h * 0.06);
      const total = 3 * ph + 2 * gap, top = Math.max(70, (h * 0.62 - total) / 2 + 30);
      return { x: w - pw - Math.max(28, w * 0.04), y: top + i * (ph + gap) + 26, w: pw, h: ph };
    };
    const stripGeom = () => { const w = W(), h = H(); const fw = Math.min(150, (w - 64) / 12), fh = fw * 9 / 16; return { fw, fh, x0: 32, y: h - fh - 28 }; };
    const want: { v: HTMLVideoElement; t: number; vis: boolean; vol: number }[] = [];
    const setVideo = (v: HTMLVideoElement, t: number, vis: boolean, vol = 0) => want.push({ v, t, vis, vol });
    const place = (node: HTMLElement, r: { x: number; y: number; w: number; h: number }) => { node.style.transform = `translate(${r.x}px,${r.y}px)`; node.style.width = `${r.w}px`; node.style.height = `${r.h}px`; };
    let stripKey = "";

    const render = (T: number) => {
      want.length = 0;
      const dt = Math.max(0, T - lastT); lastT = T;
      const s = stateAt(evs, T);
      const w = W(), h = H(); const dpr = Math.min(1.75, devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); }
      camera.aspect = w / h; camera.fov = portrait() ? 72 : 55; camera.updateProjectionMatrix();
      const rot = s.homeTime * 0.018;
      const posOf = (id: NodeId) => cardPos(card(id), rot);
      // カメラ
      const home = new THREE.Vector3(0, 0, 0);
      let cam = home.clone();
      if (s.phase === "enter") cam = home.clone().lerp(front(posOf(s.node!)), ease(s.k));
      else if (s.phase === "in") cam = front(posOf(s.node!));
      else if (s.phase === "hop") { const e = ease(s.k); cam = front(posOf(s.from!)).lerp(front(posOf(s.to!)), e); cam.z += 16 * Math.sin(Math.PI * e); }
      else if (s.phase === "back") cam = front(posOf(s.node!)).lerp(home, ease(s.k));
      camera.position.copy(cam); camera.rotation.set(0, 0, 0); camera.updateMatrixWorld();

      // 宇宙のカードの明るさ: 着いた後・戻った後は訪れた3枚以外を沈める
      const fadeIn = clamp(T / 1.6);
      const after = s.phase === "back" ? clamp((T - s.evT - BACK * 0.45) / 1.2) : 0;
      cards.forEach((c) => {
        const p = cardPos(c, rot); c.mesh.position.copy(p);
        const depth = clamp((-p.z - 20) / 110);
        let o = fadeIn * (1 - 0.55 * depth);
        if (c.id && s.visited.includes(c.id) && (s.phase === "back")) { if (tearTex[c.id] && c.mat.map !== tearTex[c.id] && after > 0.05) { c.mat.map = tearTex[c.id]!; c.mat.needsUpdate = true; } }
        else if (!c.id || !s.visited.includes(c.id)) o *= 1 - 0.65 * after;
        c.mat.opacity = o; c.mat.color.setScalar(1 - 0.5 * depth);
      });
      rims.forEach((r) => { const p = posOf(r.id); r.m.position.set(p.x, p.y, p.z - 0.02); (r.m.material as THREE.MeshBasicMaterial).opacity = s.visited.includes(r.id) ? 0.95 * after : 0; });

      // 破片: 跳んでいる間は速く流れる
      const speed = 8 * (1 + (s.phase === "hop" ? 3 * Math.sin(Math.PI * s.k) : 0) + (s.phase === "enter" || s.phase === "back" ? 1.5 * Math.sin(Math.PI * s.k) : 0));
      shardDist += dt * speed;
      const sfade = clamp((T - 0.6) / 2) * (s.phase === "in" ? 0.35 : 1);
      shards.forEach((sh) => {
        const wv = sh.ph * ZF + shardDist, cyc = Math.floor(wv / ZF);
        if (cyc !== sh.cyc) shapeShard(sh, cyc);
        const z = -ZF + (wv - cyc * ZF), u = (z + ZF) / ZF, g = Math.min(1, u / 0.6);
        sh.mesh.position.set(Math.cos(sh.d.th) * sh.d.r0 * u, Math.sin(sh.d.th) * sh.d.r0 * u, z + cam.z * 0.0);
        sh.mesh.rotation.set(0, 0, 0); sh.mesh.rotateZ(sh.d.th); sh.mesh.rotateY(sh.d.pitch); sh.mesh.rotateX(sh.d.tilt);
        sh.mesh.scale.setScalar(Math.max(0.001, g * (2 - g)));
        const near = clamp((cam.z - z - 3) / 4);
        sh.mat.opacity = 0.8 * near * sfade;
      });
      renderer.render(scene, camera);

      // ── 映像（いつもカードの投影位置に） ──
      const fileT = (id: NodeId) => NODES[id].play - NODES[id].seg + (T - (s.start[id] ?? T));
      const srcT = (id: NodeId) => NODES[id].seg + fileT(id);
      (Object.keys(NODES) as NodeId[]).forEach((id) => {
        const v = mainV[id];
        let vis = false, op = 0, r = rectOf(posOf(id)), vol = 0;
        if ((s.phase === "enter" || s.phase === "in") && s.node === id) { vis = true; op = s.phase === "enter" ? clamp((s.k - 0.25) / 0.5) : 1; vol = op; }
        if (s.phase === "hop" && s.from === id) { vis = true; op = 1 - clamp((s.k - 0.6) / 0.4); vol = 1 - clamp(s.k / 0.6); }
        if (s.phase === "hop" && s.to === id) { vis = true; op = 1; const e = ease(clamp(s.k / 0.85)); const a = slotRect(s.slot); r = { x: lerp(a.x, r.x, e), y: lerp(a.y, r.y, e), w: lerp(a.w, r.w, e), h: lerp(a.h, r.h, e) }; vol = clamp((s.k - 0.3) / 0.6); }
        if (s.phase === "back" && s.node === id) { vis = true; op = 1 - clamp((s.k - 0.7) / 0.3); vol = 1 - s.k; }
        v.style.opacity = String(op); v.style.visibility = vis ? "visible" : "hidden";
        if (vis) place(v, r);
        setVideo(v, clamp(fileT(id), 0, SEG_END[id] - NODES[id].seg - 0.05), vis, vol);
      });

      // ── 文字・コマ・糸 ──
      const inNode = s.phase === "in" ? s.node : null;
      shade.style.opacity = String(s.phase === "in" ? 1 : s.phase === "hop" ? 1 - clamp(s.k / 0.25) : s.phase === "back" ? 1 - clamp(s.k / 0.2) : s.phase === "enter" ? clamp((s.k - 0.6) / 0.4) : 0);
      const sg = stripGeom();
      // 秒ごとのコマ（再生に合わせて並ぶ。最後の12枚）
      const id = (s.phase === "in" || s.phase === "enter") ? s.node : s.phase === "hop" ? s.from : s.phase === "back" ? s.node : null;
      const fade = s.phase === "in" ? 1 : s.phase === "hop" ? 1 - clamp(s.k / 0.25) : s.phase === "back" ? 1 - clamp(s.k / 0.2) : s.phase === "enter" ? clamp((s.k - 0.8) / 0.2) : 0;
      let tearPos: [number, number] | null = null, tearT = 0;
      if (id) {
        const n = NODES[id], cur = Math.floor(srcT(id));
        const secs: number[] = []; for (let x = n.play; x <= Math.min(cur, SEG_END[id]); x++) secs.push(x);
        const shown = secs.slice(-12), key = `${id}:${shown.join(",")}:${cur}`;
        if (key !== stripKey) {
          stripKey = key;
          strip.innerHTML = shown.map((x) => `<div class="zp-fr${x === n.tear ? " tear" : ""}${x === cur ? " cur" : ""}" style="width:${sg.fw}px;height:${sg.fh}px"><img src="${B}/f/${n.no}_${x}.jpg" alt=""/><i>${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}</i></div>`).join("");
        }
        strip.style.opacity = String(fade);
        const ti = shown.indexOf(n.tear);
        if (ti >= 0) tearPos = [sg.x0 + ti * (sg.fw + 6) + sg.fw / 2, sg.y];
        tearT = (s.start[id] ?? 0) + (n.tear - n.play);
        // 一言（涙の1秒に来たら）
        const ck = clamp((T - tearT) / 0.45);
        cap.innerHTML = `<b>${n.caption}</b><span>${n.meta}　${Math.floor(n.tear / 60)}:${String(n.tear % 60).padStart(2, "0")}</span>`;
        cap.style.opacity = String(ck * fade); cap.style.transform = `translateY(${(1 - ck) * 14}px)`;
      } else { strip.style.opacity = "0"; cap.style.opacity = "0"; }
      // 糸と糸の先
      let paths = "";
      slots.forEach((sl, i) => {
        const th = id ? THREADS[id][i] : null;
        const p = id && th && tearPos ? clamp((T - tearT - 0.15 - i * 0.14) / 0.6) : 0;
        const hopping = s.phase === "hop" && s.slot === i;
        const op = p * fade * (hopping ? 0 : 1);
        sl.w.style.opacity = String(clamp((p - 0.5) / 0.5) * fade * (hopping ? 0 : 1));
        sl.w.style.pointerEvents = op > 0.5 && th?.to ? "auto" : "none";
        sl.w.classList.toggle("go", !!th?.to);
        const r = slotRect(i); place(sl.w, r);
        if (th) {
          if (sl.src !== th.prev) { if (sl.v) { sl.v.pause(); hold.appendChild(sl.v); } sl.src = th.prev; sl.v = prevV[th.prev]; sl.box.appendChild(sl.v); sl.b.textContent = th.label; sl.sp.textContent = th.sport; sl.w.style.setProperty("--c", th.color); }
          setVideo(sl.v!, 1 + ((T - tearT - 0.3) % 4 + 4) % 4, op > 0.01);
        }
        if (th && tearPos && op > 0.001) {
          // 糸: 涙のコマから糸の先へ、細い面（くさび）が伸びる
          const [x0, y0] = tearPos, x1 = r.x, y1 = r.y + r.h / 2, cx = lerp(x0, x1, 0.35), cy = Math.min(y0, y1) - 40;
          const N = 28, pts: [number, number][] = [], qq: [number, number][] = [];
          for (let j = 0; j <= N; j++) {
            const u = (j / N) * p; const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
            const x = a * x0 + b * cx + c * x1, y = a * y0 + b * cy + c * y1;
            const dx = 2 * (1 - u) * (cx - x0) + 2 * u * (x1 - cx), dy = 2 * (1 - u) * (cy - y0) + 2 * u * (y1 - cy), l = Math.hypot(dx, dy) || 1;
            const wd = 1 + 5 * u; pts.push([x - (dy / l) * wd, y + (dx / l) * wd]); qq.push([x + (dy / l) * wd, y - (dx / l) * wd]);
          }
          paths += `<polygon points="${[...pts, ...qq.reverse()].map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ")}" fill="${th.color}" fill-opacity="${(0.85 * op).toFixed(3)}"/>`;
        }
      });
      // 航跡（戻ったとき、たどった順に）
      if (s.phase === "back" || (s.phase === "home" && s.visited.length)) {
        const pk = s.phase === "back" ? clamp((T - s.evT - BACK * 0.55) / 1.6) : 1;
        const vs = s.visited.map((v) => { const p = posOf(v); return proj(p); });
        for (let i = 0; i + 1 < vs.length; i++) {
          const seg = clamp(pk * (vs.length - 1) - i); if (seg <= 0) continue;
          const [x0, y0] = vs[i], [x1, y1] = vs[i + 1], x2 = lerp(x0, x1, seg), y2 = lerp(y0, y1, seg), l = Math.hypot(x2 - x0, y2 - y0) || 1, nx = -(y2 - y0) / l, ny = (x2 - x0) / l;
          paths += `<polygon points="${x0 + nx * 1.5},${y0 + ny * 1.5} ${x2 + nx * 4},${y2 + ny * 4} ${x2 - nx * 4},${y2 - ny * 4} ${x0 - nx * 1.5},${y0 - ny * 1.5}" fill="#ffff00" fill-opacity="0.9"/>`;
        }
        // 訪れた瞬間の一言を小さく
        vs.forEach(([x, y], i) => { const n = NODES[s.visited[i]]; const o = clamp(pk * 1.4 - i * 0.2); if (o > 0) paths += `<text x="${x}" y="${y + Math.abs(rectOf(posOf(s.visited[i])).h) / 2 + 22}" text-anchor="middle" fill="#fff" fill-opacity="${o}" class="zp-tlab">${n.caption}</text>`; });
      }
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.innerHTML = paths;
      back.style.opacity = String(s.phase === "in" ? 1 : 0); back.style.pointerEvents = s.phase === "in" ? "auto" : "none";

      // カーソル（デモのみ）: 前のタップの場所から次のタップの場所へ動き、押す
      if (demo) {
        const tgt = (e: Ev, at: number): [number, number] => {
          if (e.type === "enter") { const p = cardPos(card(e.node), stateAt(evs, at).homeTime * 0.018); return proj(p) as [number, number]; }
          if (e.type === "hop") { const r = slotRect(e.slot); return [r.x + r.w * 0.55, r.y + r.h * 0.55]; }
          return [24 + 52, 22 + 17];
        };
        const ni = evs.findIndex((e) => e.T > T - 0.35);
        let show = clamp((T - 2.2) / 0.4);
        if (ni >= 0) {
          const e = evs[ni], d = e.T - T;
          const from = ni > 0 ? tgt(evs[ni - 1], evs[ni - 1].T) : [w * 0.5, h * 0.66] as [number, number];
          const to = tgt(e, Math.min(T, e.T)), mv = ease(clamp(1 - (d - 0.1) / 0.8));
          const press = d < 0 ? Math.sin(Math.PI * clamp(-d / 0.35)) : 0;
          cursor.style.transform = `translate(${lerp(from[0], to[0], mv)}px,${lerp(from[1], to[1], mv)}px) scale(${1 - 0.28 * press})`;
        } else show *= 1 - clamp((T - (evs[evs.length - 1]?.T ?? 0) - 0.6) / 0.5);
        cursor.style.opacity = String(show);
      }

      // 映像の時刻を合わせる
      const waits: Promise<void>[] = [];
      for (const x of want) {
        if (!x.vis) { if (!x.v.paused) x.v.pause(); continue; }
        if (!capture) { x.v.volume = clamp(x.vol); x.v.muted = demo || x.vol <= 0.01; }
        if (capture) {
          const ready = x.v.readyState >= 2 ? Promise.resolve() : new Promise<void>((res) => { const ok = () => { x.v.removeEventListener("loadeddata", ok); res(); }; x.v.addEventListener("loadeddata", ok); setTimeout(ok, 8000); x.v.load(); });
          waits.push(ready.then(() => new Promise<void>((res) => { if (Math.abs(x.v.currentTime - x.t) <= 0.004) return res(); const done = () => { x.v.removeEventListener("seeked", done); res(); }; x.v.addEventListener("seeked", done); setTimeout(done, 3000); x.v.currentTime = x.t; })));
        } else {
          if (Math.abs(x.v.currentTime - x.t) > 0.3) x.v.currentTime = x.t;
          if (x.v.paused) x.v.play().catch(() => {});
        }
      }
      return Promise.all(waits).then(() => undefined);
    };

    // ── 操作（デモ以外） ──
    const ray = new THREE.Raycaster();
    const onClick = (e: MouseEvent) => {
      if (demo) return;
      const T = now(), s = stateAt(evs, T), rb = el.getBoundingClientRect();
      const t = e.target as HTMLElement;
      if (t.closest(".zp-back")) { if (s.phase === "in") evs.push({ T, type: "back" }); return; }
      const pv = t.closest(".zp-prev") as HTMLElement | null;
      if (pv && s.phase === "in" && s.node) { const i = +pv.dataset.slot!; const th = THREADS[s.node][i]; if (th.to) { Object.values(mainV).forEach((v) => (v.muted = false)); evs.push({ T, type: "hop", from: s.node, to: th.to, slot: i }); } return; }
      if (s.phase === "home" || (s.phase === "back" && s.k >= 1)) {
        ray.setFromCamera(new THREE.Vector2(((e.clientX - rb.left) / rb.width) * 2 - 1, -((e.clientY - rb.top) / rb.height) * 2 + 1), camera);
        const hit = ray.intersectObjects(cards.filter((c) => c.id).map((c) => c.mesh))[0];
        const c = hit && cards.find((x) => x.mesh === hit.object);
        if (c?.id) { mainV[c.id].muted = false; evs.push({ T, type: "enter", node: c.id }); }
      }
    };
    el.addEventListener("click", onClick);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { const T = now(), s = stateAt(evs, T); if (s.phase === "in") evs.push({ T, type: "back" }); } };
    addEventListener("keydown", onKey);

    (window as any).__zap = { render, evs, stateAt: (T: number) => stateAt(evs, T), end: (DEMO[DEMO.length - 1].T + 9.4) };
    if (!capture) {
      t0 = performance.now();
      const loop = () => { raf = requestAnimationFrame(loop); render(now()); };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf); el.removeEventListener("click", onClick); removeEventListener("keydown", onKey);
      [...Object.values(mainV), ...Object.values(prevV)].forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); v.remove(); });
      slots.forEach((sl) => sl.w.remove()); hold.remove(); renderer.dispose();
    };
  }, [moments]);

  return (
    <div ref={root} className="zp">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Noto+Sans+JP:wght@500;700;900&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <canvas />
      <div className="zp-videos" />
      <div className="zp-shade" />
      <div className="zp-over">
        <div className="zp-cap" />
        <div className="zp-strip" />
      </div>
      <svg className="zp-svg" />
      <button className="zp-back" type="button">← 宇宙へ</button>
      <div className="zp-cursor" />
    </div>
  );
}

const CSS = `
.zp{position:fixed;inset:0;background:#000;overflow:hidden;color:#fff;font-family:"Noto Sans JP",sans-serif;-webkit-font-smoothing:antialiased}
.zp canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.zp-videos{position:absolute;inset:0;pointer-events:none}
.zp-main{position:absolute;left:0;top:0;object-fit:cover;background:#000;will-change:transform;transform-origin:0 0}
.zp-shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.35) 0,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 48%,rgba(0,0,0,.82) 100%),linear-gradient(270deg,rgba(0,0,0,.6) 0,rgba(0,0,0,0) 40%)}
.zp-over{position:absolute;inset:0;pointer-events:none}
.zp-cap{position:absolute;left:32px;bottom:calc(28px + min(150px, (100vw - 64px) / 12) * 9 / 16 + 22px);max-width:60vw}
.zp-cap b{display:block;font-weight:900;font-size:clamp(28px,3.4vw,48px);line-height:1.15;color:#ffff00;letter-spacing:.01em;text-shadow:0 2px 18px rgba(0,0,0,.6)}
.zp-cap span{display:block;margin-top:8px;font-weight:700;font-size:14px;letter-spacing:.06em;color:#fff;opacity:.9}
.zp-strip{position:absolute;left:32px;bottom:28px;display:flex;gap:6px}
.zp-fr{position:relative;flex:none;overflow:hidden;outline:1px solid rgba(255,255,255,.18)}
.zp-fr img{width:100%;height:100%;object-fit:cover;display:block;opacity:.72}
.zp-fr i{position:absolute;left:4px;bottom:2px;font:600 10px/1 Archivo,sans-serif;font-style:normal;letter-spacing:.04em;color:#fff;text-shadow:0 1px 3px #000}
.zp-fr.cur img{opacity:1}.zp-fr.cur{outline:2px solid #fff}
.zp-fr.tear img{opacity:1}.zp-fr.tear{outline:3px solid #ffff00}
.zp-prev{position:absolute;left:0;top:0;pointer-events:none;will-change:transform}
.zp-pvbox{width:100%;height:100%;background:#111;border-left:4px solid var(--c)}
.zp-pvbox video{width:100%;height:100%;object-fit:cover;display:block}
.zp-prev.go{cursor:pointer}
.zp-plab{position:absolute;left:0;bottom:100%;padding-bottom:8px;white-space:nowrap}
.zp-plab b{display:block;font-weight:900;font-size:clamp(15px,1.35vw,20px);line-height:1.2;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.8)}
.zp-plab span{display:block;margin-top:4px;font:700 11px/1 "Noto Sans JP",sans-serif;letter-spacing:.12em;color:var(--c)}
.zp-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.zp-tlab{font:900 15px "Noto Sans JP",sans-serif;paint-order:stroke;stroke:#000;stroke-width:4px}
.zp-back{position:absolute;left:24px;top:22px;padding:10px 16px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.4);color:#fff;font:700 14px/1 "Noto Sans JP",sans-serif;letter-spacing:.06em;cursor:pointer;opacity:0}
.zp-cursor{position:absolute;left:-18px;top:-18px;width:36px;height:36px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.5),inset 0 0 0 1px rgba(0,0,0,.4);pointer-events:none;opacity:0}
.zp-cursor::after{content:"";position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#fff}
@media (orientation:portrait){.zp-cap{max-width:90vw}}
`;

"use client";
// 熱狂の脳（2026-10-19 合意: 拡散MRIのトラクトグラフィーの表現で、文脈の多次元分解と意味の接続を全部見せる）
//   表面（皮質）＝77本のハイライト。競技ごとに葉（領域）を作る。位置の意味は「どの競技か」。
//   表面の1本から、その中の熱（402）が根のように分かれる（分解の1段目）。
//   内側を走る8本の線維束＝8つの見方（背負っていたもの・時・関係・感情の出方・落差・到達・受け止める側・体）。分解の2段目。
//   線維1本＝2つの熱が同じ見方で響き合うこと（7,564本すべて実データ）。線維は両側の熱から潜り、その見方の束を通って、別の競技の熱へ出る。
//   見方を選ぶ＝その束だけが脳全体で浮かぶ。瞬間を選ぶ＝その1本の熱がどの束へ入っていくか。熱を選ぶ＝その線維が束を通って届く先の瞬間が動き出す。
//   届いた先へは、カメラが線維の中を通って移る（旅）。響き合った瞬間はつないで観られ、リンクでシェアできる。
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

const BASE = "https://storage.googleapis.com/e-mooments-assets";
type Ctx = { id: number; no: string; title: string; line: string; who: string; t: number; w: number[]; v: string[] };
type Mom = { no: string; title: string; sport: string; ctx: number[] };
type Net = { dims: string[]; moments: Mom[]; ctx: Ctx[]; links: [number, number, number, number][] };
type MediaMap = Record<string, { webm?: string; loop?: string }>;
type Sel = { k: "none" } | { k: "tract"; d: number } | { k: "moment"; m: number } | { k: "heat"; c: number; d: number };
type Shared = { n: string; s?: number; q?: string; i: number[] };

// 8つの見方の色（MRI の線維の色のように彩度の高い8色。束ごとに読み分けられる）
const DIMC = ["#ff5a3c", "#ffd23f", "#ff4fa3", "#3fd8ff", "#8f74ff", "#4bea8a", "#f2eee2", "#ff9f2e"];
// 競技の葉（表面の領域）。中心の向きは脳の前後左右上
const FAM: { name: string; re: RegExp; dir: [number, number, number] }[] = [
  { name: "サッカー", re: /サッカー|FIFA|Jリーグ|ACL/, dir: [0, 0.25, 1] },
  { name: "野球", re: /野球/, dir: [0, 0.3, -1] },
  { name: "バスケットボール", re: /バスケ|Bリーグ/, dir: [1, 0.15, -0.05] },
  { name: "ラグビー", re: /ラグビー|リーグワン/, dir: [-1, 0.2, 0.15] },
  { name: "ボクシング", re: /ボクシング/, dir: [-0.55, 0.9, -0.35] },
  { name: "モータースポーツ", re: /モーター/, dir: [0.55, 0.9, -0.2] },
];
const RX = 92, RY = 78, RZ = 118; // 脳の半径（左右・上下・前後）
// 束の芯（脳の内側を走る8本の輪）: 中心・2軸・半径
const TRACT: { c: [number, number, number]; u: [number, number, number]; v: [number, number, number]; a: number; b: number }[] = [
  { c: [0, 24, 0], u: [0, 0, 1], v: [0, 1, 0], a: 80, b: 32 }, // 背負っていたもの: 上を前後に弧を描く
  { c: [0, -32, 0], u: [1, 0, 0], v: [0, 0, 1], a: 50, b: 74 }, // 時: 下を水平に巡る
  { c: [0, 8, 12], u: [1, 0, 0], v: [0, 1, 0], a: 66, b: 44 }, // 関係: 左右の半球を結ぶ橋
  { c: [0, 2, 0], u: [1, 0, 0], v: [0, 0.22, 1], a: 58, b: 94 }, // 感情の出方: 中ほどを大きく巡る
  { c: [0, 0, -30], u: [1, 0.9, 0], v: [-0.3, 0.3, 1], a: 50, b: 58 }, // 落差: 後ろで斜めに
  { c: [0, 0, 32], u: [1, -0.9, 0], v: [0.3, 0.3, 1], a: 50, b: 58 }, // 到達: 前で斜めに
  { c: [30, -8, 0], u: [0, 0, 1], v: [0, 1, 0], a: 70, b: 36 }, // 受け止める側: 右の縦
  { c: [-30, -8, 0], u: [0, 0, 1], v: [0, 1, 0], a: 70, b: 36 }, // 体: 左の縦
];

export default function BrainWorld({ media, shared }: { media: MediaMap; shared?: Shared }) {
  const host = useRef<HTMLDivElement>(null), txRef = useRef<HTMLDivElement>(null);
  const api = useRef<{ select: (s: Sel) => void; travel: (c: number, d: number) => void; digest: () => void; hoverTract: (d: number) => void } | null>(null);
  const [net, setNet] = useState<Net | null>(null);
  const [sel, setSel] = useState<Sel>({ k: "none" });
  const [busy, setBusy] = useState(false);
  const [dg, setDg] = useState<{ items: { id: number; d: number }[]; i: number; name: string; done: boolean } | null>(null);
  const [toast, setToast] = useState("");
  const [trip, setTrip] = useState<{ from: string; to: string; d: number; sp: string } | null>(null);

  useEffect(() => {
    const el = host.current!, tx = txRef.current!; let alive = true;
    const portrait = () => innerHeight > innerWidth;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent), ext = safari ? "mp4" : "webm";
    const R = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); R.setPixelRatio(Math.min(devicePixelRatio, 2)); R.setClearColor(0x020306, 1);
    el.appendChild(R.domElement); R.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, 1, 0.3, 3000);
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), tmp = V(), tmp2 = V();
    let N: Net;
    // ---- 状態（描画側）----
    let st: Sel = { k: "none" }, now = 0, intro = 0, sweepT = -10, mixT = 1;
    const cam0 = { yaw: 0.55, pitch: 0.22, dist: 330 }, camG = { ...cam0 }, tgtC = V(), tgtG = V();
    let fly: null | { pts: THREE.Vector3[]; t0: number; dur: number; done: () => void } = null;
    let idle = true; const view = { x: -0.1, y: 0 };

    // ===== 形を作る =====
    const surf = (dx: number, dy: number, dz: number) => { const p = V(dx, dy, dz).normalize(); return V(p.x * RX, p.y * RY, p.z * RZ); };
    const normalAt = (p: THREE.Vector3) => V(p.x / (RX * RX), p.y / (RY * RY), p.z / (RZ * RZ)).normalize();
    const loopPt = (d: number, t: number, out = V()) => { const T = TRACT[d], u = V(...T.u).normalize(), v = V(...T.v).normalize();
      return out.set(...T.c).addScaledVector(u, Math.cos(t) * T.a).addScaledVector(v, Math.sin(t) * T.b).addScaledVector(V(0, 1, 0).cross(u).normalize(), Math.sin(2 * t + d) * 6); };
    const LOOPN = 96; const loopS: THREE.Vector3[][] = TRACT.map((_, d) => Array.from({ length: LOOPN }, (_, k) => loopPt(d, (k / LOOPN) * Math.PI * 2)));
    const closestT = (d: number, p: THREE.Vector3) => { let bk = 0, bd = 1e9; loopS[d].forEach((q, k) => { const dd = q.distanceToSquared(p); if (dd < bd) { bd = dd; bk = k; } }); return (bk / LOOPN) * Math.PI * 2; };
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    // 瞬間の位置（表面）と熱の位置（瞬間の下に根のように）
    type MomP = { s: THREE.Vector3; n: THREE.Vector3; tile: THREE.Vector3; fam: number };
    let MP: MomP[] = [], EP: THREE.Vector3[] = [], famOf: number[] = [], famCenter: THREE.Vector3[] = [];
    function placeMoments() {
      const n = N.moments.length, pts: THREE.Vector3[] = [];
      // 表面に一様な候補（下の脳幹のあたりは使わない）
      const M = 150; for (let k = 0; k < M; k++) { const y = 1 - (k + 0.5) / M * 1.62, r = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.39996; pts.push(V(Math.cos(a) * r, y, Math.sin(a) * r)); }
      famOf = N.moments.map((m) => Math.max(0, FAM.findIndex((f) => f.re.test(m.sport))));
      const used = new Set<number>(), at: number[] = new Array(n).fill(-1);
      // 大きい葉から、中心に近い候補を順に取る（葉がまとまった領域になる）
      const order = FAM.map((_, f) => f).sort((a, b) => famOf.filter((x) => x === b).length - famOf.filter((x) => x === a).length);
      for (const f of order) { const c = V(...FAM[f].dir).normalize(), ms = famOf.map((x, k) => (x === f ? k : -1)).filter((k) => k >= 0);
        const cand = pts.map((p, k) => [k, p.dot(c)] as [number, number]).filter(([k]) => !used.has(k)).sort((a, b) => b[1] - a[1]);
        // 葉の中心から外へ渦を巻くように並べる（同じ競技どうしが隣り合う）
        ms.forEach((m, j) => { const k = cand[j][0]; used.add(k); at[m] = k; }); }
      MP = N.moments.map((_, m) => { const d = pts[at[m]]; const s = surf(d.x, d.y, d.z), nn = normalAt(s); return { s, n: nn, tile: s.clone().addScaledVector(nn, 9), fam: famOf[m] }; });
      famCenter = FAM.map((f, i) => { const ms = MP.filter((p) => p.fam === i); if (!ms.length) return surf(...f.dir); const c = V(); ms.forEach((p) => c.add(p.s)); c.multiplyScalar(1 / ms.length); const d = c.clone().normalize(); return surf(d.x, d.y, d.z).addScaledVector(normalAt(surf(d.x, d.y, d.z)), 26); });
      EP = new Array(N.ctx.length);
      N.moments.forEach((mo, m) => { const { s, n: nn } = MP[m]; const down = V(0, -1, 0).addScaledVector(nn, nn.y).normalize(); if (down.lengthSq() < 0.01) down.set(0, 0, 1);
        const side = nn.clone().cross(down).normalize(), k = mo.ctx.length;
        mo.ctx.forEach((id, j) => { const a = (j - (k - 1) / 2) * 0.5; EP[id] = s.clone().addScaledVector(down, Math.cos(a) * 14).addScaledVector(side, Math.sin(a) * 16).addScaledVector(nn, -3); }); });
    }

    // ===== 線維（7,564本）=====
    const FS = 30; // 1本を何区間で描くか
    let fiberGeo: THREE.BufferGeometry, fiberMat: THREE.ShaderMaterial, selA: Float32Array, selB: Float32Array, dirA: Float32Array, paths: THREE.Vector3[][] = [], linksOf: number[][] = [];
    function buildFibers() {
      const L = N.links, nL = L.length, pos = new Float32Array(nL * FS * 6), col = new Float32Array(nL * FS * 6), sv = new Float32Array(nL * FS * 2), al = new Float32Array(nL * FS * 2);
      selA = new Float32Array(nL * FS * 2).fill(1); selB = new Float32Array(nL * FS * 2).fill(1); dirA = new Float32Array(nL * FS * 2);
      const cnt = new Array(8).fill(0); L.forEach((l) => cnt[l[3]]++);
      linksOf = N.ctx.map(() => []); paths = new Array(nL);
      const c3 = DIMC.map((h) => new THREE.Color(h));
      L.forEach((l, n) => { const [a, b, sc, d] = l; linksOf[a].push(n); linksOf[b].push(n);
        const A = EP[a], B = EP[b]; const ta = closestT(d, A); let dt = closestT(d, B) - ta; if (dt > Math.PI) dt -= Math.PI * 2; if (dt < -Math.PI) dt += Math.PI * 2;
        const k = Math.max(2, Math.ceil(Math.abs(dt) / 0.32)), cp: THREE.Vector3[] = [A, A.clone().lerp(loopPt(d, ta), 0.42)];
        for (let i = 0; i <= k; i++) cp.push(loopPt(d, ta + (dt * i) / k)); cp.push(B.clone().lerp(loopPt(d, ta + dt), 0.42), B);
        const beta = 0.9, m = cp.length; cp.forEach((p, i) => p.lerp(A.clone().lerp(B, i / (m - 1)), 1 - beta));
        const pts = new THREE.CatmullRomCurve3(cp, false, "centripetal").getPoints(FS);
        // 束に太さを: 1本ごとに決まった向きへ、端では0・中ほどで最大のずれ（束の断面が丸く満ちる）
        const o = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(1.2 + rnd() * rnd() * 7);
        for (let i = 0; i <= FS; i++) { const s = i / FS, tg = pts[Math.min(FS, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize(); const off = o.clone().addScaledVector(tg, -o.dot(tg)).multiplyScalar(Math.pow(Math.sin(Math.PI * s), 0.6)); pts[i].add(off); }
        paths[n] = pts;
        const base = Math.min(0.55, 0.23 * Math.sqrt(900 / cnt[d])) * (0.6 + (sc - 0.43) * 0.45), cc = c3[d];
        for (let i = 0; i < FS; i++) { const p0 = pts[i], p1 = pts[i + 1], o6 = (n * FS + i) * 6, o2 = (n * FS + i) * 2;
          pos.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], o6);
          // MRI のように、線維の向きで色が少し揺れる（同じ束の中でも曲がるところで色が変わる）
          const tg = p1.clone().sub(p0).normalize(); const r = cc.r * 0.78 + Math.abs(tg.x) * 0.22, g = cc.g * 0.78 + Math.abs(tg.y) * 0.22, bb = cc.b * 0.78 + Math.abs(tg.z) * 0.22;
          col.set([r, g, bb, r, g, bb], o6); sv[o2] = i / FS; sv[o2 + 1] = (i + 1) / FS; al[o2] = al[o2 + 1] = base; } });
      fiberGeo = new THREE.BufferGeometry();
      fiberGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); fiberGeo.setAttribute("col", new THREE.BufferAttribute(col, 3)); fiberGeo.setAttribute("s", new THREE.BufferAttribute(sv, 1));
      fiberGeo.setAttribute("al", new THREE.BufferAttribute(al, 1)); fiberGeo.setAttribute("selA", new THREE.BufferAttribute(selA, 1)); fiberGeo.setAttribute("selB", new THREE.BufferAttribute(selB, 1)); fiberGeo.setAttribute("dir", new THREE.BufferAttribute(dirA, 1));
      fiberMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
        uniforms: { uMix: { value: 1 }, uIntro: { value: 0 }, uSweep: { value: 10 }, uNear: { value: 200 } },
        vertexShader: `attribute vec3 col; attribute float s, al, selA, selB, dir; uniform float uMix, uIntro, uSweep, uNear; varying vec3 vC; varying float vA;
          float lv(float x){ return x < .5 ? .05 : x < 1.5 ? 1. : 4.2; }
          void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); float z = -mv.z;
            float sel = mix(lv(selA), lv(selB), uMix);
            // 選んだ熱の側から、線維に沿って光が満ちていく（届くまで 1.2 秒）
            float along = dir > .5 ? 1. - s : s; float hot = selB > 1.5 ? smoothstep(uSweep - .12, uSweep, along) : 0.; sel = mix(sel, max(lv(selA), .07), hot);
            // 最初: 表面の熱から内側へ線維が伸びていく
            float e = min(s, 1. - s) * 2.; float grow = smoothstep(e - .05, e + .05, uIntro * 1.15);
            vA = al * sel * grow * (.35 + .65 * smoothstep(uNear + 260., uNear - 60., z)) * smoothstep(1., 14., z);
            vC = col; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `precision highp float; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC * vA, vA); }` });
      scene.add(new THREE.LineSegments(fiberGeo, fiberMat));
    }
    const fatMat = new LineMaterial({ linewidth: 2.2, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    let fat: LineSegments2 | null = null, fatN = 0, fatT0 = 0;
    function setFat(list: { n: number; rev: boolean; w?: number }[]) { if (fat) { scene.remove(fat); fat.geometry.dispose(); fat = null; } if (!list.length) return;
      const pos: number[] = [], col: number[] = [], c3 = DIMC.map((h) => new THREE.Color(h));
      for (let i = 0; i < FS; i++) list.forEach(({ n, rev, w = 1 }) => { const P = paths[n], a = rev ? P[FS - i] : P[i], b = rev ? P[FS - i - 1] : P[i + 1], c = c3[N.links[n][3]].clone().lerp(new THREE.Color("#ffffff"), 0.18).multiplyScalar(w);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z); col.push(c.r, c.g, c.b, c.r, c.g, c.b); });
      const g = new LineSegmentsGeometry(); g.setPositions(pos); g.setColors(col); fat = new LineSegments2(g, fatMat); fat.frustumCulled = false; fat.renderOrder = 5; fatN = list.length * FS; g.instanceCount = 0; fatT0 = now; scene.add(fat); }
    // 選んだものに合わせて線維の明るさを替える（前の状態から 0.6 秒でなめらかに）
    function paintFibers(fn: (n: number) => number, from?: (n: number) => boolean) {
      const k = Math.min(1, mixT); for (let i = 0; i < selA.length; i++) selA[i] = selA[i] + (selB[i] - selA[i]) * k; // いまの見えを起点に
      const L = N.links; for (let n = 0; n < L.length; n++) { const v = fn(n), dr = from && from(n) ? 1 : 0; for (let i = 0; i < FS * 2; i++) { selB[n * FS * 2 + i] = v; dirA[n * FS * 2 + i] = dr; } }
      (["selA", "selB", "dir"] as const).forEach((a) => (fiberGeo.attributes[a].needsUpdate = true)); mixT = 0; sweepT = now; }

    // ===== 脳の殻（ガラスのような皮質。縁だけがうっすら見え、MRI の断面の等高線が細く入る）=====
    function buildShell() {
      const g = new THREE.SphereGeometry(1, 128, 96); g.scale(RX * 0.99, RY * 0.99, RZ * 0.99);
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, uniforms: { uOp: { value: 0 } },
        vertexShader: `varying vec3 vN, vV, vP; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `precision highp float; varying vec3 vN, vV, vP; uniform float uOp;
          void main(){ float f = pow(1. - abs(dot(vN, vV)), 2.6); float sl = smoothstep(.85, 1., abs(fract(vP.z / 9.) - .5) * 2.) * .5 + smoothstep(.9, 1., abs(fract(vP.y / 9.) - .5) * 2.) * .25;
            vec3 c = vec3(.55, .66, .8) * (f * .22 + sl * f * .35); gl_FragColor = vec4(c * uOp, 0.); }` });
      const shell = new THREE.Mesh(g, m); scene.add(shell); return m;
    }

    // ===== 表面の瞬間（映像の板。カメラを向く）と、根（瞬間→熱）=====
    type Tile = { m: number; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; scale: number; goal: number; dim: number; dimG: number; vid: number };
    let tiles: Tile[] = [];
    const TILE_V = `uniform float uS; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.,0.,0.,1.); mv.xy += position.xy * uS; gl_Position = projectionMatrix * mv; }`;
    const TILE_F = `precision highp float; varying vec2 vUv; uniform sampler2D uAt, uVid; uniform vec4 uRect; uniform float uUseVid, uDim, uFace, uHi, uOp; uniform vec3 uRim;
      void main(){ vec2 q = abs(vUv - .5) * vec2(16., 9.); vec2 b = vec2(8., 4.5) - .55; float d = length(max(q - b, 0.)) - .55; float a = (1. - smoothstep(-.06, .06, d)) * uOp; if (a < .003) discard;
        vec3 c = mix(texture2D(uAt, uRect.xy + vUv * uRect.zw).rgb, texture2D(uVid, vUv).rgb, uUseVid);
        float rim = smoothstep(.35, 0., abs(d + .2)); c = c * (uDim * (.45 + .55 * uFace)) + uRim * rim * (.25 + uHi * .9);
        gl_FragColor = vec4(c * a, a); }`;
    let rootGeo: THREE.BufferGeometry, rootA: Float32Array, nodeGeo: THREE.BufferGeometry, nodeA: Float32Array, nodeS: Float32Array;
    function buildCortex(atl: THREE.Texture[]) {
      const geo = new THREE.PlaneGeometry(1, 9 / 16), blank = new THREE.Texture();
      tiles = N.moments.map((mo, m) => { const id = mo.ctx[0], s = Math.floor(id / 256), k = id % 256;
        const mat = new THREE.ShaderMaterial({ vertexShader: TILE_V, fragmentShader: TILE_F, transparent: true, depthWrite: false, depthTest: false,
          uniforms: { uAt: { value: atl[s] || blank }, uVid: { value: blank }, uRect: { value: new THREE.Vector4((k % 16) / 16, 1 - (Math.floor(k / 16) + 1) / 16, 1 / 16, 1 / 16) }, uUseVid: { value: 0 }, uDim: { value: 1 }, uFace: { value: 1 }, uHi: { value: 0 }, uOp: { value: 0 }, uS: { value: 15 }, uRim: { value: new THREE.Color("#f4f2ec") } } });
        const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(MP[m].tile); mesh.frustumCulled = false; scene.add(mesh); return { m, mesh, mat, scale: 15, goal: 15, dim: 1, dimG: 1, vid: -1 }; });
      // 根: 瞬間の板の下から、その中の熱へ（分解の1段目）
      const nC = N.ctx.length, rp = new Float32Array(nC * 6), rc = new Float32Array(nC * 6); rootA = new Float32Array(nC * 2).fill(0.35);
      const c3 = DIMC.map((h) => new THREE.Color(h));
      N.ctx.forEach((c, i) => { const m = N.moments.findIndex((mo) => mo.no === c.no), a = MP[m].s.clone().addScaledVector(MP[m].n, 4), b = EP[i], dm = c.w.indexOf(Math.max(...c.w)), cc = c3[dm];
        rp.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); rc.set([0.9, 0.9, 0.9, cc.r, cc.g, cc.b], i * 6); });
      rootGeo = new THREE.BufferGeometry(); rootGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3)); rootGeo.setAttribute("col", new THREE.BufferAttribute(rc, 3)); rootGeo.setAttribute("a", new THREE.BufferAttribute(rootA, 1));
      scene.add(new THREE.LineSegments(rootGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uIntro: { value: 0 } },
        vertexShader: `attribute vec3 col; attribute float a; uniform float uIntro; varying vec3 vC; varying float vA; void main(){ vC = col; vA = a * uIntro; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
        fragmentShader: `precision highp float; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC * vA, vA); }` })));
      // 熱の点（根の先。線維はここから潜る）
      nodeA = new Float32Array(nC).fill(0.7); nodeS = new Float32Array(nC).fill(1); const np = new Float32Array(nC * 3), nc = new Float32Array(nC * 3);
      N.ctx.forEach((c, i) => { np.set([EP[i].x, EP[i].y, EP[i].z], i * 3); const cc = c3[c.w.indexOf(Math.max(...c.w))].clone().lerp(new THREE.Color("#ffffff"), 0.35); nc.set([cc.r, cc.g, cc.b], i * 3); });
      nodeGeo = new THREE.BufferGeometry(); nodeGeo.setAttribute("position", new THREE.BufferAttribute(np, 3)); nodeGeo.setAttribute("col", new THREE.BufferAttribute(nc, 3)); nodeGeo.setAttribute("a", new THREE.BufferAttribute(nodeA, 1)); nodeGeo.setAttribute("sz", new THREE.BufferAttribute(nodeS, 1));
      scene.add(new THREE.Points(nodeGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: R.getPixelRatio() }, uIntro: { value: 0 } },
        vertexShader: `attribute vec3 col; attribute float a, sz; uniform float uPx, uIntro; varying vec3 vC; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = uPx * sz * 300. / -mv.z; vC = col; vA = a * uIntro; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `precision highp float; varying vec3 vC; varying float vA; void main(){ float r = length(gl_PointCoord - .5) * 2.; float k = smoothstep(1., .55, r) * .5 + smoothstep(.42, .3, r); gl_FragColor = vec4(vC * k * vA, k * vA); }` })));
    }

    // ===== 映像（表面の板で動く。同時に動かすのは数本まで）=====
    type Slot = { v: HTMLVideoElement; tex: THREE.VideoTexture; tile: number; src: string };
    const slots: Slot[] = Array.from({ length: portrait() ? 5 : 8 }, () => { const v = document.createElement("video"); v.crossOrigin = "anonymous"; v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", "");
      const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; return { v, tex, tile: -1, src: "" }; });
    const clipOf = (id: number) => `${BASE}/ctx/c/${id}.${ext}`;
    function playOn(tile: number, src: string | undefined) { if (!src) return; const t = tiles[tile]; let s = slots.find((x) => x.tile === tile);
      if (!s) s = slots.find((x) => x.tile < 0) || slots.reduce((a, b) => (a.v.currentTime > b.v.currentTime ? a : b));
      if (s.tile >= 0 && s.tile !== tile) stopOn(s.tile);
      s.tile = tile; t.vid = slots.indexOf(s); if (s.src !== src) { s.src = src; s.v.src = src; s.v.currentTime = 0; } s.v.play().catch(() => {});
      const go = () => { if (s!.tile === tile) { t.mat.uniforms.uVid.value = s!.tex; } }; if (s.v.readyState >= 2) go(); else s.v.onloadeddata = go; }
    function stopOn(tile: number) { const t = tiles[tile]; if (!t || t.vid < 0) return; const s = slots[t.vid]; if (s.tile === tile) { s.v.pause(); s.tile = -1; } t.vid = -1; }
    const playing = new Set<number>();
    function setPlaying(list: { tile: number; src?: string }[]) { const want = new Set(list.map((x) => x.tile)); playing.forEach((t) => { if (!want.has(t)) stopOn(t); }); playing.clear(); list.slice(0, slots.length).forEach((x) => { playing.add(x.tile); playOn(x.tile, x.src); }); }

    // ===== 選ぶ =====
    const momOfCtx = (c: number) => N.moments.findIndex((m) => m.no === N.ctx[c].no);
    const other = (n: number, c: number) => (N.links[n][0] === c ? N.links[n][1] : N.links[n][0]);
    function peers(c: number, d: number) { const seen = new Set<string>([N.ctx[c].no]); return linksOf[c].filter((n) => N.links[n][3] === d).sort((a, b) => N.links[b][2] - N.links[a][2]).map((n) => ({ n, j: other(n, c) })).filter(({ j }) => { if (seen.has(N.ctx[j].no)) return false; seen.add(N.ctx[j].no); return true; }); }
    function select(s: Sel) { st = s; idle = false;
      const L = N.links;
      if (s.k !== "moment" && s.k !== "heat") setFat([]); if (s.k !== "heat") tiles.forEach((t) => (t.mat.uniforms.uRim.value as THREE.Color).set("#f4f2ec"));
      if (s.k === "none") { camG.dist = portrait() ? 560 : 290; tgtG.set(0, 0, 0); paintFibers(() => 1); tiles.forEach((t) => { t.dimG = 1; t.goal = 16; }); setNodes(() => [0.7, 1]); setRoots(() => 0.35); setPlaying([]); }
      if (s.k === "tract") { paintFibers((n) => (L[n][3] === s.d ? 2 : 0)); const ms = new Set<number>(); L.forEach((l) => { if (l[3] === s.d) { ms.add(momOfCtx(l[0])); ms.add(momOfCtx(l[1])); } });
        tiles.forEach((t) => { t.dimG = ms.has(t.m) ? 1 : 0.3; t.goal = 16; }); const inT = new Set<number>(); L.forEach((l) => { if (l[3] === s.d) { inT.add(l[0]); inT.add(l[1]); } });
        setNodes((i) => (inT.has(i) ? [1, 1.3] : [0.15, 0.8])); setRoots((i) => (inT.has(i) ? 0.5 : 0.08)); setPlaying([]); }
      if (s.k === "moment") { const ids = new Set(N.moments[s.m].ctx); paintFibers((n) => (ids.has(L[n][0]) || ids.has(L[n][1]) ? 2 : 0), (n) => ids.has(L[n][1]) && !ids.has(L[n][0]));
        const far = new Set<number>(); L.forEach((l) => { if (ids.has(l[0])) far.add(momOfCtx(l[1])); if (ids.has(l[1])) far.add(momOfCtx(l[0])); });
        tiles.forEach((t) => { t.dimG = t.m === s.m ? 1.15 : far.has(t.m) ? 0.7 : 0.25; t.goal = t.m === s.m ? 28 : 16; });
        setFat([]);
        setNodes((i) => (ids.has(i) ? [1.3, 2.4] : [0.12, 0.8])); setRoots((i) => (ids.has(i) ? 1 : 0.05)); setPlaying([{ tile: s.m, src: clipOf(N.moments[s.m].ctx[0]) }]); void media;
        face(MP[s.m].s, portrait() ? 300 : 250); }
      if (s.k === "heat") { const ps = peers(s.c, s.d), pn = new Set(ps.map((p) => p.n)), pj = new Set(ps.map((p) => p.j)), mine = new Set(linksOf[s.c]);
        paintFibers((n) => (pn.has(n) ? 2 : mine.has(n) ? 1 : 0), (n) => L[n][1] === s.c);
        const m0 = momOfCtx(s.c), pm = new Map<number, number>(); ps.forEach(({ j }) => { const m = momOfCtx(j); if (!pm.has(m)) pm.set(m, j); });
        tiles.forEach((t) => { (t.mat.uniforms.uRim.value as THREE.Color).set(t.m === m0 || pm.has(t.m) ? DIMC[s.d] : "#f4f2ec"); t.dimG = t.m === m0 ? 1.15 : pm.has(t.m) ? 1.05 : 0.2; t.goal = t.m === m0 ? 28 : pm.has(t.m) ? 22 : 15; });
        setFat(ps.map(({ n }) => ({ n, rev: L[n][0] !== s.c, w: 1 })));
        setNodes((i) => (i === s.c ? [1.6, 3.2] : pj.has(i) ? [1.3, 2.4] : [0.1, 0.8])); setRoots((i) => (i === s.c || pj.has(i) ? 1 : 0.04));
        setPlaying([{ tile: m0, src: clipOf(s.c) }, ...Array.from(pm.entries()).slice(0, 6).map(([m, j]) => ({ tile: m, src: clipOf(j) }))]);
        face(MP[m0].s, portrait() ? 330 : 280); }
      setSel(s); }
    function setNodes(f: (i: number) => [number, number]) { N.ctx.forEach((_, i) => { const [a, s] = f(i); nodeA[i] = a; nodeS[i] = s; }); nodeGeo.attributes.a.needsUpdate = true; nodeGeo.attributes.sz.needsUpdate = true; }
    function setRoots(f: (i: number) => number) { N.ctx.forEach((_, i) => { rootA[i * 2] = rootA[i * 2 + 1] = f(i); }); rootGeo.attributes.a.needsUpdate = true; }
    // その場所が手前に来るように回り込む（構造は動かさない。カメラだけがゆっくり回る）
    function face(p: THREE.Vector3, dist: number) { const d = p.clone().normalize(); camG.yaw = Math.atan2(d.x, d.z); camG.pitch = Math.max(-0.9, Math.min(0.9, Math.asin(d.y) * 0.8)); camG.dist = dist; tgtG.copy(p).multiplyScalar(0.25); }

    // 線維の中を通って、響き合った熱へ移る
    function travelTo(fromC: number, toC: number, d: number) { const n = linksOf[fromC].find((x) => N.links[x][3] === d && other(x, fromC) === toC); if (n === undefined) { select({ k: "heat", c: toC, d }); return; }
      const p = paths[n].slice(); if (N.links[n][0] !== fromC) p.reverse();
      // 外から入口へ降り、線維を通って、出口から外へ出る
      const out0 = p[0].clone().addScaledVector(normalAt(p[0]), 60), out1 = p[p.length - 1].clone().addScaledVector(normalAt(p[p.length - 1]), 70);
      const pts = [cam.position.clone(), out0, ...p, out1];
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal").getPoints(240);
      setBusy(true); setTrip({ from: N.ctx[fromC].v[d] || N.ctx[fromC].title, to: N.ctx[toC].v[d] || N.ctx[toC].title, d, sp: N.moments[momOfCtx(toC)].sport }); fly = { pts: curve, t0: now, dur: reduce ? 1.2 : 5.2, done: () => { setBusy(false); setTrip(null); const dd = N.ctx[toC].w[d] ? d : N.ctx[toC].w.indexOf(Math.max(...N.ctx[toC].w)); select({ k: "heat", c: toC, d: dd }); } };
      // 通る線維を先に光らせておく
      paintFibers((x) => (x === n || N.links[x][3] === d ? 2 : 1), (x) => N.links[x][0] !== fromC); setFat([{ n, rev: N.links[n][0] !== fromC, w: 1.3 }]);
    }

    // ===== 文字（空間に付く: 見方の束の名前・競技の葉の名前・選んだものの名前）=====
    const pool: HTMLDivElement[] = []; let used = 0, rects: number[][] = []; const prj = V();
    function txt(cls: string, html: string, p: THREE.Vector3, o: { pri?: number; side?: "r" | "l" | "c"; op?: number; data?: string } = {}) {
      let e = pool[used]; if (!e) { e = document.createElement("div"); tx.appendChild(e); pool[used] = e; } used++;
      const key = cls + html; if (e.dataset.h !== key) { e.dataset.h = key; e.className = `bw-t ${cls}`; e.innerHTML = html; (e as unknown as { _w: number })._w = e.offsetWidth; (e as unknown as { _h: number })._h = e.offsetHeight; }
      e.dataset.v = o.data || "";
      prj.copy(p).project(cam); let vis = prj.z < 1 && Math.abs(prj.x) < 1.05 && Math.abs(prj.y) < 1.05;
      const W = (e as unknown as { _w: number })._w, H = (e as unknown as { _h: number })._h, x = (prj.x * 0.5 + 0.5) * innerWidth, y = (-prj.y * 0.5 + 0.5) * innerHeight;
      let bx = o.side === "l" ? x - W - 10 : o.side === "c" ? x - W / 2 : x + 10, by = y - H / 2; bx = Math.max(10, Math.min(innerWidth - W - 10, bx));
      const hit = () => rects.some(([a, b, c, d]) => bx < a + c && bx + W > a && by < b + d && by + H > b);
      for (let t = 1; t <= 6 && vis && hit(); t++) by = y - H / 2 + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * (H * 0.6 + 4);
      if (vis && hit() && (o.pri ?? 0) < 2) vis = false; if (vis) rects.push([bx, by, W, H]);
      e.style.transform = `translate3d(${bx}px,${by}px,0)`; e.style.opacity = vis ? String(o.op ?? 1) : "0"; e.style.pointerEvents = vis && o.data ? "auto" : "none"; }
    // 束の名前を置く場所: 輪の上で、他の束の名前からいちばん離れた点
    let tractAnchor: THREE.Vector3[] = [];
    function anchors() { const chosen: THREE.Vector3[] = []; tractAnchor = TRACT.map((_, d) => { let best = loopS[d][0], bs = -1; loopS[d].forEach((p) => { const s = Math.min(...chosen.map((q) => q.distanceTo(p)).concat([999])) + p.length() * 0.3; if (s > bs) { bs = s; best = p; } }); chosen.push(best); return best; }); }
    function drawText() { used = 0; rects = [];
      if (fly) { for (let k = 0; k < pool.length; k++) { pool[k].style.opacity = "0"; pool[k].style.pointerEvents = "none"; } return; }
      const camDir = cam.getWorldDirection(tmp2);
      const sel = st;
      // 選んだもの
      if (sel.k === "moment") { const m = N.moments[sel.m]; const up = V(0, 1, 0).applyQuaternion(cam.quaternion); txt("mo big", `<b>${m.sport}</b><span>${m.title}</span>`, MP[sel.m].tile.clone().addScaledVector(up, tiles[sel.m].scale * 0.36 + 4), { pri: 3, side: "c" }); }
      if (sel.k === "heat") { const c = N.ctx[sel.c], m0 = momOfCtx(sel.c); txt("ht big", `<b>${N.moments[m0].sport}</b><span style="--c:${DIMC[sel.d]}">${c.v[sel.d] || c.title}</span>`, EP[sel.c], { pri: 3 });
        peers(sel.c, sel.d).slice(0, portrait() ? 4 : 7).forEach(({ j }) => { const cj = N.ctx[j], mj = momOfCtx(j); txt("ht", `<b>${N.moments[mj].sport}</b><span style="--c:${DIMC[sel.d]}">${cj.v[sel.d]}</span>`, EP[j], { pri: 2, data: `t:${j}` }); }); }
      if (hoverM >= 0 && !(sel.k === "moment" && sel.m === hoverM)) { const m = N.moments[hoverM], up = V(0, 1, 0).applyQuaternion(cam.quaternion); txt("mo", `<b>${m.sport}</b><span>${m.title}</span>`, MP[hoverM].tile.clone().addScaledVector(up, tiles[hoverM].scale * 0.36 + 3), { pri: 3, side: "c" }); }
      // 束の名前（地理）
      tractAnchor.forEach((p, d) => { const on = sel.k === "tract" ? sel.d === d : sel.k === "heat" ? sel.d === d : sel.k === "none";
        txt(`tr ${on ? "on" : ""}`, `<i style="background:${DIMC[d]}"></i>${N.dims[d]}`, p, { pri: on ? 2 : 1, op: on ? 1 : sel.k === "none" ? 0.85 : 0.28, data: `d:${d}` }); });
      // 競技の葉の名前（こちらを向いているときだけ）
      famCenter.forEach((p, f) => { const face = normalAt(p).dot(tmp.copy(cam.position).sub(p).normalize()); if (!MP.some((x) => x.fam === f)) return; txt("lobe", FAM[f].name, p, { side: "c", op: Math.max(0, Math.min(1, (face - 0.05) * 3)) * (sel.k === "none" ? 0.9 : 0.45) }); });
      for (let k = used; k < pool.length; k++) { pool[k].style.opacity = "0"; pool[k].style.pointerEvents = "none"; } void camDir; }
    tx.addEventListener("click", (e) => { const t = (e.target as HTMLElement).closest("[data-v]") as HTMLElement | null; if (!t || !t.dataset.v) return; const [k, a] = t.dataset.v.split(":");
      if (k === "d") select(st.k === "tract" && st.d === +a ? { k: "none" } : { k: "tract", d: +a });
      if (k === "t" && st.k === "heat") travelTo(st.c, +a, st.d); });

    // ===== 操作 =====
    const ptrs = new Map<number, [number, number]>(); let down: null | { x: number; y: number; yaw: number; pitch: number; moved: boolean } = null, pinch0 = 0;
    const cv = R.domElement;
    cv.addEventListener("pointerdown", (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); idle = false; if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, yaw: camG.yaw, pitch: camG.pitch, moved: false }; if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()); pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); down = null; } });
    cv.addEventListener("pointermove", (e) => { if (!ptrs.has(e.pointerId)) { hover(e.clientX, e.clientY); return; } ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()), d = Math.hypot(a[0] - b[0], a[1] - b[1]); camG.dist = Math.max(60, Math.min(560, camG.dist * pinch0 / d)); pinch0 = d; return; }
      if (down && !fly) { const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true; camG.yaw = down.yaw - dx * 0.0055; camG.pitch = Math.max(-1.2, Math.min(1.2, down.pitch + dy * 0.0045)); } });
    const up = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (!down) return; const moved = down.moved; down = null; if (moved || fly) return; const h = pick(e.clientX, e.clientY);
      if (h?.k === "tile") select(st.k === "moment" && st.m === h.i ? { k: "none" } : { k: "moment", m: h.i });
      else if (h?.k === "node") { const c = N.ctx[h.i]; const ds = c.w.map((w, d) => [w, d]).filter(([w, d]) => w > 0 && linksOf[h.i].some((n) => N.links[n][3] === d)).sort((a, b) => b[0] - a[0]); select({ k: "heat", c: h.i, d: ds[0]?.[1] ?? 0 }); } };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", (e) => { ptrs.delete(e.pointerId); down = null; });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); idle = false; camG.dist = Math.max(60, Math.min(560, camG.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
    function pick(x: number, y: number): { k: "tile" | "node"; i: number } | null {
      let best: { k: "tile" | "node"; i: number } | null = null, bd = 1e9;
      tiles.forEach((t) => { prj.copy(t.mesh.position).project(cam); if (prj.z > 1) return; const sx = (prj.x * 0.5 + 0.5) * innerWidth, sy = (-prj.y * 0.5 + 0.5) * innerHeight;
        const dpt = cam.position.distanceTo(t.mesh.position), half = (t.scale / 2) / (dpt * Math.tan((cam.fov * Math.PI) / 360)) * (innerHeight / 2); const dx = Math.abs(x - sx), dy = Math.abs(y - sy);
        if (dx < half && dy < half * 0.5625 + 4) { const dd = dpt; if (dd < bd) { bd = dd; best = { k: "tile", i: t.m }; } } });
      if (best) return best; bd = 26;
      EP.forEach((p, i) => { if (nodeA[i] < 0.2) return; prj.copy(p).project(cam); if (prj.z > 1) return; const d = Math.hypot((prj.x * 0.5 + 0.5) * innerWidth - x, (-prj.y * 0.5 + 0.5) * innerHeight - y); if (d < bd) { bd = d; best = { k: "node", i }; } });
      return best; }
    let hoverM = -1; function hover(x: number, y: number) { const h = pick(x, y); hoverM = h?.k === "tile" ? h.i : -1; cv.style.cursor = h ? "pointer" : "grab"; }

    // ===== 毎フレーム =====
    let shellMat: THREE.ShaderMaterial | null = null, last = 0, raf = 0, ready = false;
    const resize = () => { const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; R.setSize(w, h, false); fatMat.resolution.set(w, h); cam.aspect = w / h; cam.fov = portrait() ? 56 : 42; cam.updateProjectionMatrix(); };
    function update(dt: number, draw = true) { now += dt;
      if (!ready) { if (draw) R.render(scene, cam); return; }
      intro = Math.min(1, intro + dt / (reduce ? 0.5 : 3.2)); const ie = 1 - Math.pow(1 - intro, 3);
      fiberMat.uniforms.uIntro.value = ie;
      mixT = Math.min(1, mixT + dt / 0.6); fiberMat.uniforms.uMix.value = mixT * mixT * (3 - 2 * mixT); fiberMat.uniforms.uSweep.value = (now - sweepT) / 1.2;
      if (shellMat) shellMat.uniforms.uOp.value = ie;
      if (idle && !reduce) camG.yaw += dt * 0.045;
      const k = 1 - Math.exp(-dt / 0.55);
      if (fly) { const t = Math.min(1, (now - fly.t0) / fly.dur), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, i = e * (fly.pts.length - 1), i0 = Math.floor(i), f = i - i0;
        const p = fly.pts[i0].clone().lerp(fly.pts[Math.min(fly.pts.length - 1, i0 + 1)], f), ahead = fly.pts[Math.min(fly.pts.length - 1, i0 + 10)];
        cam.position.lerp(p, Math.min(1, dt * 14)); cam.up.set(0, 1, 0); const lk = tmp.copy(ahead); cam.lookAt(lk); cam.fov += ((portrait() ? 74 : 64) - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix();
        if (t >= 1) { const done = fly.done; fly = null; const d = cam.position.clone().sub(tgtC); camG.dist = d.length(); camG.yaw = Math.atan2(d.x, d.z); camG.pitch = Math.asin(Math.max(-1, Math.min(1, d.y / camG.dist))); cam0.dist = camG.dist; Object.assign(cam0, camG); done(); } }
      else { cam0.yaw += (camG.yaw - cam0.yaw) * k; cam0.pitch += (camG.pitch - cam0.pitch) * k; cam0.dist += (camG.dist - cam0.dist) * k; tgtC.lerp(tgtG, k);
        cam.position.set(Math.sin(cam0.yaw) * Math.cos(cam0.pitch), Math.sin(cam0.pitch), Math.cos(cam0.yaw) * Math.cos(cam0.pitch)).multiplyScalar(cam0.dist).add(tgtC); cam.up.set(0, 1, 0); cam.lookAt(tgtC);
        const fv = portrait() ? 56 : 42; if (Math.abs(cam.fov - fv) > 0.05) { cam.fov += (fv - cam.fov) * k; cam.updateProjectionMatrix(); } }
      { const w = R.domElement.width / R.getPixelRatio(), h = R.domElement.height / R.getPixelRatio(), pr = portrait();
        const ox = pr ? 0 : st.k === "none" ? -0.13 : 0.15, oy = pr && st.k !== "none" && !fly ? 0.22 : pr ? -0.04 : 0;
        view.x += (ox - view.x) * k; view.y += (oy - view.y) * k; cam.setViewOffset(w, h, view.x * w, view.y * h, w, h); }
      fiberMat.uniforms.uNear.value = cam.position.length();
      // 板: カメラを向き、裏側（脳の向こう）は沈む。選んだものは大きく
      const cp = cam.position;
      tiles.forEach((t) => { t.scale += (t.goal - t.scale) * k; t.dim += (t.dimG - t.dim) * k; const u = t.mat.uniforms; u.uS.value = t.scale; u.uDim.value = t.dim;
        const face = MP[t.m].n.dot(tmp.copy(cp).sub(t.mesh.position).normalize()); u.uFace.value = Math.max(0, Math.min(1, face * 1.6 + 0.4)); u.uOp.value = Math.min(1, ie * 1.4) * (face < 0.05 ? 0.22 : 0.4 + 0.6 * Math.min(1, face * 2 + 0.3));
        u.uHi.value = hoverM === t.m || (st.k === "moment" && st.m === t.m) ? 1 : st.k === "heat" && t.goal > 16 ? 0.8 : 0;
        const vOn = t.vid >= 0 && slots[t.vid].tile === t.m && slots[t.vid].v.readyState >= 2 ? 1 : 0; u.uUseVid.value += (vOn - u.uUseVid.value) * Math.min(1, dt * 4);
        t.mesh.renderOrder = face < 0.05 ? -10 : 10 + Math.round(1000 - cp.distanceTo(t.mesh.position)); });
      if (fat) { (fat.geometry as LineSegmentsGeometry).instanceCount = Math.min(fatN, Math.ceil(fatN * Math.min(1, (now - fatT0) / (fly ? 0.6 : 1.3)))); }
      if (rootIntro) rootIntro.value = ie; if (nodeIntro) nodeIntro.value = ie;
      if (st.k === "none" && !fly && now - liveAt > 3 && intro > 0.9) { liveAt = now; const cand = tiles.map((t) => { prj.copy(t.mesh.position).project(cam); const face = MP[t.m].n.dot(tmp.copy(cp).sub(t.mesh.position).normalize()); return { t, s: face - Math.hypot(prj.x, prj.y) * 0.8 }; }).sort((a, b) => b.s - a.s).slice(0, portrait() ? 3 : 5);
        setPlaying(cand.map(({ t }) => ({ tile: t.m, src: clipOf(N.moments[t.m].ctx[0]) }))); }
      drawText();
      if (draw) R.render(scene, cam); }
    let liveAt = 0;
    let rootIntro: { value: number } | null = null, nodeIntro: { value: number } | null = null;
    const loop = (t: number) => { raf = requestAnimationFrame(loop); const dt = Math.min(0.1, Math.max(0, (t - (last || t)) / 1000)); last = t; if (!manual) update(dt); };
    let manual = false;
    resize(); addEventListener("resize", resize); raf = requestAnimationFrame(loop);

    // ===== 読み込み =====
    (async () => {
      N = await (await fetch("/ctx/net.json")).json(); if (!alive) return;
      placeMoments(); buildFibers(); shellMat = buildShell(); anchors();
      const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
      const atl = await Promise.all(Array.from({ length: Math.ceil(N.ctx.length / 256) }, (_, s) => new Promise<THREE.Texture>((res) => loader.load(`${BASE}/ctx/atlas${s}.jpg`, res, undefined, () => res(new THREE.Texture())))));
      atl.forEach((a) => { a.colorSpace = THREE.SRGBColorSpace; a.anisotropy = 4; a.generateMipmaps = true; a.minFilter = THREE.LinearMipmapLinearFilter; });
      if (!alive) return; buildCortex(atl);
      const mats = scene.children.filter((o) => o instanceof THREE.LineSegments || o instanceof THREE.Points).map((o) => (o as unknown as { material: THREE.ShaderMaterial }).material);
      rootIntro = mats.find((m) => m.uniforms?.uIntro && m !== fiberMat && !m.uniforms.uPx)?.uniforms.uIntro ?? null; nodeIntro = mats.find((m) => m.uniforms?.uPx)?.uniforms.uIntro ?? null;
      setNet(N); ready = true; cam0.dist = portrait() ? 760 : 520; camG.dist = portrait() ? 560 : 290;
      if (shared?.i?.length) setTimeout(() => api.current?.digest(), 2600);
    })();

    api.current = {
      select, travel: (c, d) => { if (st.k === "heat") travelTo(st.c, c, d); }, hoverTract: (d) => { if (st.k !== "none" || fly) return; if (d < 0) { paintFibers(() => 1); return; } paintFibers((n) => (N.links[n][3] === d ? 2 : 0)); },
      digest: () => { if (st.k !== "heat" && !shared) return; const items = shared ? shared.i.map((id) => ({ id, d: N.ctx[id].w.indexOf(Math.max(...N.ctx[id].w)) })) : [{ id: (st as { c: number }).c, d: (st as { d: number }).d }, ...peers((st as { c: number }).c, (st as { d: number }).d).slice(0, 6).map(({ j }) => ({ id: j, d: (st as { d: number }).d }))];
        const name = shared ? shared.n : `「${N.ctx[items[0].id].v[items[0].d] || N.ctx[items[0].id].title}」の熱`; setPlaying([]); setDg({ items, i: 0, name, done: false }); },
    };
    (window as unknown as { __bw: object }).__bw = { st: () => st, select, travelTo, manual: (on: boolean) => { manual = on; }, adv: (s: number) => { const n = Math.max(1, Math.round(s * 30)); for (let i = 0; i < n; i++) update(1 / 30, i === n - 1); }, find: (t: string) => N.ctx.findIndex((c) => c.title === t), peers };
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener("resize", resize); slots.forEach((s) => { s.v.pause(); s.v.src = ""; }); R.dispose(); el.removeChild(R.domElement); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 画面の文字と操作（React）=====
  const N = net;
  const famName = (sport: string) => FAM.find((f) => f.re.test(sport))?.name || sport;
  const cnt = N ? N.dims.map((_, d) => N.links.filter((l) => l[3] === d).length) : [];
  const momOf = (c: number) => (N ? N.moments.find((m) => m.no === N.ctx[c].no)! : null);
  const peersOf = (c: number, d: number) => { if (!N) return []; const seen = new Set<string>([N.ctx[c].no]); return N.links.filter((l) => (l[0] === c || l[1] === c) && l[3] === d).sort((a, b) => b[2] - a[2]).map((l) => (l[0] === c ? l[1] : l[0])).filter((j) => { if (seen.has(N.ctx[j].no)) return false; seen.add(N.ctx[j].no); return true; }); };
  const viewsOf = (c: number) => (N ? N.ctx[c].w.map((w, d) => ({ w, d })).filter(({ w, d }) => w > 0 && N.ctx[c].v[d] && N.links.some((l) => (l[0] === c || l[1] === c) && l[3] === d)).sort((a, b) => b.w - a.w) : []);
  const go = (s: Sel) => api.current?.select(s);

  // ダイジェスト: 響き合った熱の4秒を順に、画面いっぱいで
  const dvA = useRef<HTMLVideoElement>(null), dvB = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (!dg || dg.done || !N) return; const it = dg.items[dg.i]; const v = dvA.current; if (!v) return;
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent); v.src = `${BASE}/ctx/c/${it.id}.${safari ? "mp4" : "webm"}`; const bg = dvB.current; if (bg && getComputedStyle(bg).display !== "none") { bg.src = v.src; bg.play().catch(() => {}); } v.muted = false; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    const t = setTimeout(() => setDg((g) => (g ? (g.i + 1 < g.items.length ? { ...g, i: g.i + 1 } : { ...g, done: true }) : g)), 4200); return () => clearTimeout(t); }, [dg, N]);
  const shareUrl = () => { if (!dg || !N) return ""; const code = btoa(unescape(encodeURIComponent(JSON.stringify({ n: dg.name.replace(/[「」]/g, "").slice(0, 20), s: dg.items[0].id, i: dg.items.map((x) => x.id) })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); return `${location.origin}/d/${code}?v=brain`; };

  return (
    <div className="bw">
      <div ref={host} className="bw-gl" />
      <div ref={txRef} className="bw-tx" />
      <div className="bw-vig" />
      <header className="bw-top">
        <div className="bw-mark">DAZN <em>100</em> MOMENTS</div>
        {N && <div className="bw-stat"><span><b>{N.moments.length}</b>本のハイライト</span><i>→</i><span><b>{N.ctx.length}</b>の熱</span><i>→</i><span><b>8</b>つの見方</span><i>→</i><span><b>{N.links.length.toLocaleString()}</b>本の繋がり</span></div>}
      </header>
      {N && sel.k === "none" && !dg && (
        <div className="bw-intro"><h1>熱狂の脳</h1><p>表面に並ぶのは今年のハイライト。その1本1本を、胸が熱くなる理由＝<b>熱</b>に分け、熱を8つの<b>見方</b>で読みました。脳の内側を走る8本の束が、その見方。同じ見方で響き合う熱どうしが、競技をまたいで線維で結ばれています。</p><p className="s">束の名前に触れると、その束だけが浮かびます。表面の映像に触れると、その1本の熱がどの束へ入っていくかが見えます。</p></div>
      )}
      {N && !dg && (
        <nav className="bw-legend">{N.dims.map((name, d) => (
          <button key={d} className={(sel.k === "tract" || sel.k === "heat") && sel.d === d ? "on" : ""} onMouseEnter={() => api.current?.hoverTract(d)} onMouseLeave={() => api.current?.hoverTract(-1)} onClick={() => go(sel.k === "tract" && sel.d === d ? { k: "none" } : { k: "tract", d })}><i style={{ background: DIMC[d] }} />{name}<small>{cnt[d].toLocaleString()}</small></button>))}</nav>
      )}
      {N && sel.k === "tract" && !dg && !trip && (() => { const d = sel.d; const L = N.links.filter((l) => l[3] === d); const deg = new Map<number, number>(); L.forEach((l) => { deg.set(l[0], (deg.get(l[0]) || 0) + 1); deg.set(l[1], (deg.get(l[1]) || 0) + 1); });
        const fams = new Set(Array.from(deg.keys()).map((c) => famName(momOf(c)!.sport))); const top = Array.from(deg.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
        return (<aside className="bw-card"><div className="k"><i style={{ background: DIMC[d] }} />見方の束</div><h2>{N.dims[d]}</h2><p className="m">{L.length.toLocaleString()}本の線維が、{fams.size}つの競技の{deg.size}の熱を結んでいます。この束でいちばん多くと響き合う熱:</p>
          <ul>{top.map(([c]) => (<li key={c}><button onClick={() => go({ k: "heat", c, d })}><b>{momOf(c)!.sport}</b><span style={{ color: DIMC[d] }}>{N.ctx[c].v[d]}</span><small>{N.ctx[c].title}</small></button></li>))}</ul>
          <button className="x" onClick={() => go({ k: "none" })}>全体に戻る</button></aside>); })()}
      {N && sel.k === "moment" && !dg && !trip && (() => { const m = N.moments[sel.m]; return (<aside className="bw-card"><div className="k">{m.sport}</div><h2>{m.title}</h2><p className="m">この1本を、{m.ctx.length}の熱に分けました。それぞれの熱が、色の束へ潜っていきます。</p>
        <ul>{m.ctx.map((c) => { const vs = viewsOf(c); return (<li key={c}><button onClick={() => vs.length && go({ k: "heat", c, d: vs[0].d })}><span className="h">{N.ctx[c].title}</span><span className="dots">{vs.map(({ d }) => <i key={d} style={{ background: DIMC[d] }} />)}</span><small>{N.ctx[c].line}</small></button></li>); })}</ul>
        <button className="x" onClick={() => go({ k: "none" })}>全体に戻る</button></aside>); })()}
      {N && sel.k === "heat" && !dg && !trip && (() => { const c = N.ctx[sel.c], m = momOf(sel.c)!, vs = viewsOf(sel.c), ps = peersOf(sel.c, sel.d); const fams = new Set(ps.map((j) => famName(momOf(j)!.sport)));
        return (<aside className="bw-card heat"><div className="k">{m.sport}・{m.title}</div><h2>{c.title}</h2><p className="m">{c.line}</p>
          <div className="views">{vs.map(({ d }) => (<button key={d} className={d === sel.d ? "on" : ""} style={{ ["--c" as string]: DIMC[d] }} onClick={() => go({ k: "heat", c: sel.c, d })}><small>{N.dims[d]}</small>{c.v[d]}</button>))}</div>
          <p className="m2"><b style={{ color: DIMC[sel.d] }}>{N.dims[sel.d]}</b>の束を通って、{fams.size}つの競技の{ps.length}の熱に届いています</p>
          <ul>{ps.slice(0, 7).map((j) => (<li key={j}><button disabled={busy} onClick={() => api.current?.travel(j, sel.d)}><b>{momOf(j)!.sport}</b><span style={{ color: DIMC[sel.d] }}>{N.ctx[j].v[sel.d]}</span><small>{N.ctx[j].title}</small><em>線維をたどる →</em></button></li>))}</ul>
          <div className="row"><button className="x" onClick={() => go({ k: "moment", m: N.moments.indexOf(m) })}>この1本に戻る</button><button className="pill" onClick={() => api.current?.digest()}>▶ 響き合った瞬間をつないで観る</button></div></aside>); })()}
      {dg && N && (
        <div className="bw-dg">
          {!dg.done && <video ref={dvB} className="bg" playsInline autoPlay muted />}
          {!dg.done && <video ref={dvA} playsInline autoPlay />}
          {!dg.done && (() => { const it = dg.items[dg.i], c = N.ctx[it.id], m = momOf(it.id)!; return (<div className="cap" key={dg.i}><div className="bar">{dg.items.map((_, i) => <i key={i} className={i < dg.i ? "done" : i === dg.i ? "now" : ""} />)}</div><div className="k">{m.sport}</div><h3 style={{ ["--c" as string]: DIMC[it.d] }}>{c.v[it.d] || c.title}</h3><p>{c.title} — {m.title}</p></div>); })()}
          {dg.done && (<div className="end"><div className="k">あなたが辿った熱のダイジェスト</div><h3>{dg.name}</h3><p>{new Set(dg.items.map((x) => famName(momOf(x.id)!.sport))).size}つの競技・{dg.items.length}の瞬間が、同じ見方の束で繋がりました。リンクを送ると、開いた人の画面でこの順に流れます。</p>
            <div className="sh"><a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`熱狂ダイジェスト ${dg.name} #DAZN100MOMENTS`)}&url=${encodeURIComponent(shareUrl())}`} target="_blank" rel="noreferrer">X</a><a href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl())}`} target="_blank" rel="noreferrer">LINE</a><button onClick={() => { navigator.clipboard?.writeText(shareUrl()); setToast("リンクをコピーしました"); setTimeout(() => setToast(""), 1800); }}>リンクをコピー</button></div>
            <div className="row"><button className="x" onClick={() => setDg({ ...dg, i: 0, done: false })}>もう一度</button><button className="pill" onClick={() => { setDg(null); }}>脳に戻る</button></div></div>)}
          {!dg.done && <button className="skip" onClick={() => setDg({ ...dg, done: true })}>×</button>}
        </div>)}
      {trip && N && <div className="bw-trip" style={{ ["--c" as string]: DIMC[trip.d] }}><div className="k">{N.dims[trip.d]}の束をたどって</div><div className="r"><span>{trip.from}</span><i /><span><b>{trip.sp}</b>{trip.to}</span></div></div>}
      {toast && <div className="bw-toast">{toast}</div>}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

const CSS = `
.bw{position:fixed;inset:0;background:#020306;color:#f4f2ec;font-family:"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",system-ui,sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}
.bw-gl{position:absolute;inset:0}
.bw-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(110% 85% at 50% 50%,transparent 58%,rgba(0,0,0,.55))}
.bw-tx{position:absolute;inset:0;pointer-events:none;z-index:3}
.bw-t{position:absolute;left:0;top:0;white-space:nowrap;transition:opacity .35s;will-change:transform}
.bw-t.tr{font-size:12px;font-weight:700;letter-spacing:.12em;display:flex;align-items:center;gap:7px;padding:5px 10px 5px 8px;border-radius:999px;background:rgba(2,3,6,.38);border:1px solid rgba(244,242,236,.1);cursor:pointer;text-shadow:0 1px 8px rgba(0,0,0,.9)}
.bw-t.tr i{width:8px;height:8px;border-radius:50%}
.bw-t.tr.on{background:rgba(244,242,236,.94);color:#0a0a0a;border-color:transparent}
.bw-t.lobe{font-size:11px;font-weight:900;letter-spacing:.42em;color:rgba(244,242,236,.78);text-shadow:0 0 18px rgba(0,0,0,.9)}
.bw-t.mo b,.bw-t.ht b{display:block;font-size:9.5px;font-weight:900;letter-spacing:.18em;color:#f7ff3c}
.bw-t.mo span{display:block;font-size:15px;font-weight:900;text-shadow:0 1px 12px rgba(0,0,0,.95)}
.bw-t.ht{cursor:pointer}
.bw-t.ht span{display:block;font-size:13px;font-weight:700;text-shadow:0 1px 10px rgba(0,0,0,.95);border-left:2px solid var(--c);padding-left:7px;margin-top:3px}
.bw-t.ht.big span{font-size:17px;font-weight:900}
.bw-top{position:absolute;left:0;right:0;top:0;z-index:5;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:calc(env(safe-area-inset-top,0px) + 18px) max(20px,env(safe-area-inset-right,0px)) 0 max(20px,env(safe-area-inset-left,0px));pointer-events:none}
.bw-mark{font-size:11px;font-weight:900;letter-spacing:.32em;white-space:nowrap}.bw-mark em{font-style:normal;color:#f7ff3c}
.bw-stat{display:flex;align-items:baseline;gap:8px;font-size:10px;letter-spacing:.1em;color:rgba(244,242,236,.6);flex-wrap:wrap;justify-content:flex-end}
.bw-stat b{font-size:15px;color:#f4f2ec;font-weight:900;margin-right:2px;font-variant-numeric:tabular-nums}.bw-stat i{font-style:normal;color:rgba(244,242,236,.3)}
.bw-intro{position:absolute;left:max(24px,4vw);top:calc(env(safe-area-inset-top,0px) + 74px);z-index:4;max-width:380px;pointer-events:none;animation:bwf 1.2s .8s ease both}
.bw-intro h1{margin:0;font-size:clamp(30px,3.4vw,48px);font-weight:900;letter-spacing:.06em}
.bw-intro p{margin:12px 0 0;font-size:13px;line-height:1.9;color:rgba(244,242,236,.82)}.bw-intro p b{color:#f4f2ec}.bw-intro p.s{font-size:12px;color:rgba(244,242,236,.55)}
@keyframes bwf{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.bw-legend{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);z-index:5;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:0 16px}
.bw-legend button{display:flex;align-items:center;gap:7px;font-family:inherit;font-size:12.5px;font-weight:700;color:#f4f2ec;background:rgba(2,3,6,.55);border:1px solid rgba(244,242,236,.16);border-radius:999px;padding:8px 13px 8px 10px;cursor:pointer;backdrop-filter:blur(8px);transition:background .25s,color .25s}
.bw-legend button i{width:9px;height:9px;border-radius:50%}.bw-legend button small{font-size:10px;color:rgba(244,242,236,.45);font-variant-numeric:tabular-nums}
.bw-legend button.on{background:#f4f2ec;color:#0a0a0a}.bw-legend button.on small{color:rgba(0,0,0,.5)}
.bw-card{position:absolute;right:max(20px,env(safe-area-inset-right,0px));top:calc(env(safe-area-inset-top,0px) + 70px);bottom:calc(env(safe-area-inset-bottom,0px) + 74px);width:min(380px,34vw);z-index:6;overflow:auto;background:linear-gradient(180deg,rgba(8,10,16,.82),rgba(4,5,9,.9));border:1px solid rgba(244,242,236,.12);border-radius:18px;padding:22px 22px 18px;backdrop-filter:blur(14px);animation:bwf .45s ease both;scrollbar-width:thin}
.bw-card .k{display:flex;align-items:center;gap:8px;font-size:10.5px;font-weight:900;letter-spacing:.2em;color:#f7ff3c}.bw-card .k i{width:9px;height:9px;border-radius:50%}
.bw-card h2{margin:10px 0 0;font-size:24px;font-weight:900;line-height:1.3}
.bw-card .m{margin:10px 0 0;font-size:12.5px;line-height:1.8;color:rgba(244,242,236,.7)}
.bw-card .m2{margin:16px 0 0;font-size:12px;line-height:1.7;color:rgba(244,242,236,.7)}
.bw-card ul{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.bw-card li button{width:100%;text-align:left;font-family:inherit;color:#f4f2ec;background:rgba(244,242,236,.04);border:1px solid rgba(244,242,236,.08);border-radius:12px;padding:10px 12px;cursor:pointer;display:grid;gap:3px;transition:background .2s,border-color .2s}
.bw-card li button:hover{background:rgba(244,242,236,.09);border-color:rgba(244,242,236,.2)}
.bw-card li b{font-size:9.5px;font-weight:900;letter-spacing:.16em;color:#f7ff3c}.bw-card li span{font-size:14px;font-weight:700}.bw-card li span.h{font-size:14.5px;font-weight:900}
.bw-card li small{font-size:11px;color:rgba(244,242,236,.55);line-height:1.6}.bw-card li em{font-style:normal;font-size:10px;color:rgba(244,242,236,.45);letter-spacing:.1em;justify-self:end}
.bw-card .dots{display:flex;gap:4px}.bw-card .dots i{width:7px;height:7px;border-radius:50%}
.bw-card .views{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
.bw-card .views button{font-family:inherit;text-align:left;color:#f4f2ec;background:transparent;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);border-radius:12px;padding:7px 10px;font-size:12.5px;font-weight:700;cursor:pointer;display:grid;gap:1px}
.bw-card .views button small{font-size:9px;letter-spacing:.14em;color:var(--c)}
.bw-card .views button.on{background:var(--c);color:#0a0a0a;border-color:var(--c)}.bw-card .views button.on small{color:rgba(0,0,0,.6)}
.bw-card .row{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.bw-card .x,.bw-dg .x{font-family:inherit;font-size:12px;font-weight:700;color:#f4f2ec;background:transparent;border:1px solid rgba(244,242,236,.25);border-radius:999px;padding:10px 14px;cursor:pointer;margin-top:14px}
.bw-card .row .x{margin-top:0}
.pill{font-family:inherit;font-size:13px;font-weight:900;color:#0a0a0a;background:#f7ff3c;border:0;border-radius:999px;padding:11px 16px;cursor:pointer}
.bw-dg{position:absolute;inset:0;z-index:20;background:#000;animation:bwf .5s ease both}
.bw-dg video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:transparent}
.bw-dg video.bg{display:none;object-fit:cover;filter:blur(28px) brightness(.45);transform:scale(1.15)}
.bw-dg .cap{position:absolute;left:max(24px,5vw);right:24px;bottom:calc(env(safe-area-inset-bottom,0px) + 40px);animation:bwf .6s ease both;text-shadow:0 2px 20px rgba(0,0,0,.8)}
.bw-dg .cap .bar{position:fixed;left:max(20px,4vw);right:max(20px,4vw);top:calc(env(safe-area-inset-top,0px) + 20px);display:flex;gap:4px}
.bw-dg .cap .bar i{flex:1;height:2px;background:rgba(244,242,236,.2);border-radius:2px}.bw-dg .cap .bar i.done{background:#f4f2ec}.bw-dg .cap .bar i.now{background:#f7ff3c}
.bw-dg .k{font-size:11px;font-weight:900;letter-spacing:.22em;color:#f7ff3c}
.bw-dg h3{margin:8px 0 0;font-size:clamp(28px,4.4vw,60px);font-weight:900;line-height:1.15;border-left:4px solid var(--c);padding-left:14px}
.bw-dg .cap p{margin:10px 0 0;font-size:13px;color:rgba(244,242,236,.75)}
.bw-dg .skip{position:absolute;right:max(16px,env(safe-area-inset-right,0px));top:calc(env(safe-area-inset-top,0px) + 34px);width:40px;height:40px;border-radius:50%;border:1px solid rgba(244,242,236,.25);background:rgba(0,0,0,.4);color:#f4f2ec;font-size:16px;cursor:pointer}
.bw-dg .end{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100% - 40px));text-align:left}
.bw-dg .end h3{border:0;padding:0;font-size:clamp(28px,3.6vw,44px)}.bw-dg .end p{font-size:13px;line-height:1.8;color:rgba(244,242,236,.75)}
.bw-dg .sh{display:flex;gap:8px;margin-top:18px}.bw-dg .sh a,.bw-dg .sh button{font-family:inherit;font-size:13px;font-weight:700;color:#f4f2ec;text-decoration:none;background:rgba(244,242,236,.08);border:1px solid rgba(244,242,236,.2);border-radius:999px;padding:10px 16px;cursor:pointer}
.bw-dg .row{display:flex;gap:8px;margin-top:14px}.bw-dg .row .x{margin-top:0}
.bw-trip{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 80px);transform:translateX(-50%);z-index:8;text-align:center;pointer-events:none;animation:bwf .5s ease both;width:min(640px,calc(100% - 32px))}
.bw-trip .k{font-size:10.5px;font-weight:900;letter-spacing:.24em;color:var(--c)}
.bw-trip .r{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:8px;font-size:clamp(15px,1.8vw,22px);font-weight:900;text-shadow:0 2px 18px rgba(0,0,0,.95)}
.bw-trip .r b{display:block;font-size:10px;letter-spacing:.18em;color:#f7ff3c}.bw-trip .r i{flex:none;width:56px;height:2px;background:linear-gradient(90deg,transparent,var(--c),transparent)}
.bw-toast{position:absolute;left:50%;bottom:90px;transform:translateX(-50%);z-index:30;background:#f4f2ec;color:#0a0a0a;font-size:12px;font-weight:700;padding:9px 14px;border-radius:999px}
@media (max-width:700px){
  .bw-stat{display:none}
  .bw-intro{left:20px;right:20px;top:calc(env(safe-area-inset-top,0px) + 54px);max-width:none}.bw-intro h1{font-size:28px}.bw-intro p{font-size:12px;line-height:1.75}.bw-intro p.s{display:none}
  .bw-legend{flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;scrollbar-width:none;padding:0 14px}.bw-legend::-webkit-scrollbar{display:none}.bw-legend button{flex:none;font-size:12px}
  .bw-card{left:10px;right:10px;width:auto;top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 62px);max-height:37vh;padding:14px 14px 12px;border-radius:16px}
  .bw-card h2{font-size:18px;margin-top:6px}.bw-card .m{font-size:11.5px;line-height:1.65;margin-top:6px}.bw-card.heat .m{display:none}.bw-card .views{margin-top:10px}.bw-card .views button{font-size:12px;padding:6px 9px}.bw-card li button{padding:8px 10px}.bw-card li span{font-size:13px}
  .bw-t.ht span{font-size:11.5px}.bw-t.ht.big span{font-size:14px}.bw-t.mo span{font-size:13px}
  .bw-dg video.bg{display:block}
  .bw-t.tr{font-size:10.5px;padding:4px 8px 4px 6px}.bw-t.lobe{font-size:10px}
}
`;

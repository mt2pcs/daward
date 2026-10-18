"use client";
// 競技を越えて、同じ熱が集まる（/lab/brain）。2026-10-19 の設計の議論で決めた流れ:
//   開く: 表面に77本の映像が並び、手前の数本が動き、内側を色の線が走る（拡散MRIのトラクトグラフィーの表現）。一行と「熱狂を探す」の入力欄。
//   映像を観る: 映像に触れると寄って、その1本が音つきで流れる。下の目盛りに熱の時刻の印、通ると熱の言葉が浮かぶ。
//   熱を選ぶ: 本物のコマを通ってその時刻へ走り（コマ飛び→一瞬のジャギーと光）、その場面が流れ出して言葉が打ち込まれる。
//   近しい熱が浮かぶ: 線が光り、見方を合わせた近さで別の競技の熱の映像が表面から浮かび上がって流れる（線の色＝何で響いたか）。
//   「この熱狂グループを見る」: 浮かんだ映像が線を伝って集まり、名前が付き、ダイジェストが流れ、リンクでシェア。
//   「熱狂を探す」: 打った言葉が中心に生まれ、そこから線が伸びて近しい熱が浮かぶ。押せばその映像へ、ボタンでダイジェストへ。
//   画面に出さない言葉: 脳・束・線維・葉（会話のための言葉）。見方の切り替えは無い（2026-10-19 決定）。
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

const BASE = "https://storage.googleapis.com/e-mooments-assets";
type Ctx = { id: number; no: string; title: string; line: string; who: string; t: number; w: number[]; v: string[] };
type Mom = { no: string; title: string; sport: string; ctx: number[] };
type Net = { dims: string[]; moments: Mom[]; ctx: Ctx[]; links: [number, number, number, number][] };
type MediaMap = Record<string, { webm?: string; loop?: string; detail?: string }>;
type Item = { id: number; d: number };
type View =
  | { k: "free" }
  | { k: "watch"; m: number }
  | { k: "scrub"; m: number; c: number }
  | { k: "heat"; m: number; c: number; items: Item[] }
  | { k: "search"; q: string }
  | { k: "word"; q: string; items: Item[] }
  | { k: "gather" };
type Shared = { n: string; s?: number; q?: string; i: number[] };
type Digest = { items: Item[]; name: string; seed: number; q?: string };

// 8つの見方の色（線の色。何で響いたかを表す）
const DIMC = ["#ff5a3c", "#ffd23f", "#ff4fa3", "#3fd8ff", "#8f74ff", "#4bea8a", "#f2eee2", "#ff9f2e"];
// 競技の領域（表面）。中心の向き
const FAM: { name: string; re: RegExp; dir: [number, number, number] }[] = [
  { name: "サッカー", re: /サッカー|FIFA|Jリーグ|ACL/, dir: [0, 0.25, 1] },
  { name: "野球", re: /野球/, dir: [0, 0.3, -1] },
  { name: "バスケットボール", re: /バスケ|Bリーグ/, dir: [1, 0.15, -0.05] },
  { name: "ラグビー", re: /ラグビー|リーグワン/, dir: [-1, 0.2, 0.15] },
  { name: "ボクシング", re: /ボクシング/, dir: [-0.55, 0.9, -0.35] },
  { name: "モータースポーツ", re: /モーター/, dir: [0.55, 0.9, -0.2] },
];
const RX = 92, RY = 78, RZ = 118; // 空間の半径（左右・上下・前後）
// 内側を走る8本の輪（見方ごとの通り道）: 中心・2軸・半径
const TRACT: { c: [number, number, number]; u: [number, number, number]; v: [number, number, number]; a: number; b: number }[] = [
  { c: [0, 24, 0], u: [0, 0, 1], v: [0, 1, 0], a: 80, b: 32 },
  { c: [0, -32, 0], u: [1, 0, 0], v: [0, 0, 1], a: 50, b: 74 },
  { c: [0, 8, 12], u: [1, 0, 0], v: [0, 1, 0], a: 66, b: 44 },
  { c: [0, 2, 0], u: [1, 0, 0], v: [0, 0.22, 1], a: 58, b: 94 },
  { c: [0, 0, -30], u: [1, 0.9, 0], v: [-0.3, 0.3, 1], a: 50, b: 58 },
  { c: [0, 0, 32], u: [1, -0.9, 0], v: [0.3, 0.3, 1], a: 50, b: 58 },
  { c: [30, -8, 0], u: [0, 0, 1], v: [0, 1, 0], a: 70, b: 36 },
  { c: [-30, -8, 0], u: [0, 0, 1], v: [0, 1, 0], a: 70, b: 36 },
];
const LINE = "競技を越えて、同じ熱が集まる。";
const EXAMPLE = "ベテランの意地";
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Api = {
  watch: (m: number) => void; heat: (c: number) => void; search: (q: string) => void; back: () => void;
  gather: () => void; ungather: () => void; seek: (t: number) => void; video: () => HTMLVideoElement | null;
};

export default function BrainWorld({ media, shared }: { media: MediaMap; shared?: Shared }) {
  const host = useRef<HTMLDivElement>(null), txRef = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const hooks = useRef<{ tick?: (t: number, d: number) => void; pop?: (c: number) => void; slam?: (c: number) => void; digest?: (d: Digest) => void; view?: (v: View) => void; name?: (n: string) => void }>({});
  const [net, setNet] = useState<Net | null>(null);
  const [view, setView] = useState<View>({ k: "free" });
  const [q, setQ] = useState("");
  const [pop, setPop] = useState<{ c: number; key: number } | null>(null);
  const [slam, setSlam] = useState<{ c: number; key: number } | null>(null);
  const [gname, setGname] = useState("");
  const [dg, setDg] = useState<(Digest & { i: number; done: boolean }) | null>(null);
  const [toast, setToast] = useState("");
  const fillRef = useRef<HTMLDivElement>(null), timeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = host.current!, tx = txRef.current!; let alive = true;
    const portrait = () => innerHeight > innerWidth;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent), ext = safari ? "mp4" : "webm";
    const R = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); R.setPixelRatio(Math.min(devicePixelRatio, 2)); R.setClearColor(0x020306, 1);
    el.appendChild(R.domElement); R.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, 1, 0.3, 3000);
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), tmp = V();
    let N: Net;
    let st: View = { k: "free" }, now = 0, intro = 0, sweepT = -10, mixT = 1;
    const cam0 = { yaw: 0.55, pitch: 0.22, dist: 330 }, camG = { ...cam0 }, tgtC = V(), tgtG = V();
    let idle = true; const view = { x: -0.1, y: 0 };
    const setV = (v: View) => { st = v; hooks.current.view?.(v); };

    // ===== 形 =====
    const surf = (dx: number, dy: number, dz: number) => { const p = V(dx, dy, dz).normalize(); return V(p.x * RX, p.y * RY, p.z * RZ); };
    const normalAt = (p: THREE.Vector3) => V(p.x / (RX * RX), p.y / (RY * RY), p.z / (RZ * RZ)).normalize();
    const loopPt = (d: number, t: number, out = V()) => { const T = TRACT[d], u = V(...T.u).normalize(), v = V(...T.v).normalize();
      return out.set(...T.c).addScaledVector(u, Math.cos(t) * T.a).addScaledVector(v, Math.sin(t) * T.b).addScaledVector(V(0, 1, 0).cross(u).normalize(), Math.sin(2 * t + d) * 6); };
    const LOOPN = 96; const loopS: THREE.Vector3[][] = TRACT.map((_, d) => Array.from({ length: LOOPN }, (_, k) => loopPt(d, (k / LOOPN) * Math.PI * 2)));
    const closestT = (d: number, p: THREE.Vector3) => { let bk = 0, bd = 1e9; loopS[d].forEach((q, k) => { const dd = q.distanceToSquared(p); if (dd < bd) { bd = dd; bk = k; } }); return (bk / LOOPN) * Math.PI * 2; };
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    type MomP = { s: THREE.Vector3; n: THREE.Vector3; tile: THREE.Vector3; fam: number };
    let MP: MomP[] = [], EP: THREE.Vector3[] = [], famCenter: THREE.Vector3[] = [], momOf: number[] = [];
    function placeMoments() {
      const n = N.moments.length, pts: THREE.Vector3[] = [];
      const M = 150; for (let k = 0; k < M; k++) { const y = 1 - (k + 0.5) / M * 1.62, r = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.39996; pts.push(V(Math.cos(a) * r, y, Math.sin(a) * r)); }
      const famOf = N.moments.map((m) => Math.max(0, FAM.findIndex((f) => f.re.test(m.sport))));
      const used = new Set<number>(), at: number[] = new Array(n).fill(-1);
      const order = FAM.map((_, f) => f).sort((a, b) => famOf.filter((x) => x === b).length - famOf.filter((x) => x === a).length);
      for (const f of order) { const c = V(...FAM[f].dir).normalize(), ms = famOf.map((x, k) => (x === f ? k : -1)).filter((k) => k >= 0);
        const cand = pts.map((p, k) => [k, p.dot(c)] as [number, number]).filter(([k]) => !used.has(k)).sort((a, b) => b[1] - a[1]);
        ms.forEach((m, j) => { const k = cand[j][0]; used.add(k); at[m] = k; }); }
      MP = N.moments.map((_, m) => { const d = pts[at[m]]; const s = surf(d.x, d.y, d.z), nn = normalAt(s); return { s, n: nn, tile: s.clone().addScaledVector(nn, 9), fam: famOf[m] }; });
      famCenter = FAM.map((f, i) => { const ms = MP.filter((p) => p.fam === i); if (!ms.length) return surf(...f.dir); const c = V(); ms.forEach((p) => c.add(p.s)); c.multiplyScalar(1 / ms.length); const d = c.clone().normalize(); return surf(d.x, d.y, d.z).addScaledVector(normalAt(surf(d.x, d.y, d.z)), 26); });
      EP = new Array(N.ctx.length); momOf = new Array(N.ctx.length);
      N.moments.forEach((mo, m) => { const { s, n: nn } = MP[m]; const down = V(0, -1, 0).addScaledVector(nn, nn.y).normalize(); if (down.lengthSq() < 0.01) down.set(0, 0, 1);
        const side = nn.clone().cross(down).normalize(), k = mo.ctx.length;
        mo.ctx.forEach((id, j) => { momOf[id] = m; const a = (j - (k - 1) / 2) * 0.5; EP[id] = s.clone().addScaledVector(down, Math.cos(a) * 14).addScaledVector(side, Math.sin(a) * 16).addScaledVector(nn, -3); }); });
    }

    // ===== 線（7,564本の繋がり。両側の熱から潜り、その見方の通り道を通って相手へ）=====
    const FS = 30;
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
        const o = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(1.2 + rnd() * rnd() * 7);
        for (let i = 0; i <= FS; i++) { const s = i / FS, tg = pts[Math.min(FS, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize(); pts[i].add(o.clone().addScaledVector(tg, -o.dot(tg)).multiplyScalar(Math.pow(Math.sin(Math.PI * s), 0.6))); }
        paths[n] = pts;
        const base = Math.min(0.55, 0.23 * Math.sqrt(900 / cnt[d])) * (0.6 + (sc - 0.43) * 0.45), cc = c3[d];
        for (let i = 0; i < FS; i++) { const p0 = pts[i], p1 = pts[i + 1], o6 = (n * FS + i) * 6, o2 = (n * FS + i) * 2;
          pos.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], o6);
          const tg = p1.clone().sub(p0).normalize(); const r = cc.r * 0.78 + Math.abs(tg.x) * 0.22, g = cc.g * 0.78 + Math.abs(tg.y) * 0.22, bb = cc.b * 0.78 + Math.abs(tg.z) * 0.22;
          col.set([r, g, bb, r, g, bb], o6); sv[o2] = i / FS; sv[o2 + 1] = (i + 1) / FS; al[o2] = al[o2 + 1] = base; } });
      fiberGeo = new THREE.BufferGeometry();
      fiberGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); fiberGeo.setAttribute("col", new THREE.BufferAttribute(col, 3)); fiberGeo.setAttribute("s", new THREE.BufferAttribute(sv, 1));
      fiberGeo.setAttribute("al", new THREE.BufferAttribute(al, 1)); fiberGeo.setAttribute("selA", new THREE.BufferAttribute(selA, 1)); fiberGeo.setAttribute("selB", new THREE.BufferAttribute(selB, 1)); fiberGeo.setAttribute("dir", new THREE.BufferAttribute(dirA, 1));
      fiberMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
        uniforms: { uMix: { value: 1 }, uIntro: { value: 0 }, uSweep: { value: 10 }, uNear: { value: 200 }, uDen: { value: 1 } },
        vertexShader: `attribute vec3 col; attribute float s, al, selA, selB, dir; uniform float uMix, uIntro, uSweep, uNear, uDen; varying vec3 vC; varying float vA;
          float lv(float x){ return x < .5 ? .2 : x < 1.5 ? 1. : 4.2; }
          void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); float z = -mv.z;
            float sel = mix(lv(selA), lv(selB), uMix);
            float along = dir > .5 ? 1. - s : s; float hot = selB > 1.5 ? smoothstep(uSweep - .12, uSweep, along) : 0.; sel = mix(sel, max(lv(selA), .07), hot);
            float e = min(s, 1. - s) * 2.; float grow = smoothstep(e - .05, e + .05, uIntro * 1.15);
            vA = uDen * al * sel * grow * (.35 + .65 * smoothstep(uNear + 260., uNear - 60., z)) * smoothstep(1., 14., z);
            vC = col; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `precision highp float; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC * vA, vA); }` });
      scene.add(new THREE.LineSegments(fiberGeo, fiberMat));
    }
    function paintFibers(fn: (n: number) => number, from?: (n: number) => boolean) {
      const k = Math.min(1, mixT); for (let i = 0; i < selA.length; i++) selA[i] = selA[i] + (selB[i] - selA[i]) * k;
      const L = N.links; for (let n = 0; n < L.length; n++) { const v = fn(n), dr = from && from(n) ? 1 : 0; for (let i = 0; i < FS * 2; i++) { selB[n * FS * 2 + i] = v; dirA[n * FS * 2 + i] = dr; } }
      (["selA", "selB", "dir"] as const).forEach((a) => (fiberGeo.attributes[a].needsUpdate = true)); mixT = 0; sweepT = now; }
    // 選んだ熱からの線だけを太く（根元から先へ伸びる）
    const fatMat = new LineMaterial({ linewidth: 2.3, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    let fat: LineSegments2 | null = null, fatN = 0, fatT0 = 0, fatDur = 1.3;
    function setFat(list: { pts: THREE.Vector3[]; d: number }[], dur = 1.3) { if (fat) { scene.remove(fat); fat.geometry.dispose(); fat = null; } if (!list.length) return;
      const pos: number[] = [], col: number[] = [], c3 = DIMC.map((h) => new THREE.Color(h).lerp(new THREE.Color("#ffffff"), 0.15)), S = list[0].pts.length - 1;
      for (let i = 0; i < S; i++) list.forEach(({ pts, d }) => { const a = pts[i], b = pts[i + 1], c = c3[d]; pos.push(a.x, a.y, a.z, b.x, b.y, b.z); col.push(c.r, c.g, c.b, c.r, c.g, c.b); });
      const g = new LineSegmentsGeometry(); g.setPositions(pos); g.setColors(col); fat = new LineSegments2(g, fatMat); fat.frustumCulled = false; fat.renderOrder = 5; fatN = list.length * S; g.instanceCount = 0; fatT0 = now; fatDur = dur; scene.add(fat); }
    const pathFrom = (n: number, c: number) => (N.links[n][0] === c ? paths[n] : paths[n].slice().reverse());

    // ===== ガラスの殻 =====
    function buildShell() {
      const g = new THREE.SphereGeometry(1, 128, 96); g.scale(RX * 0.99, RY * 0.99, RZ * 0.99);
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, uniforms: { uOp: { value: 0 } },
        vertexShader: `varying vec3 vN, vV, vP; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `precision highp float; varying vec3 vN, vV, vP; uniform float uOp;
          void main(){ float f = pow(1. - abs(dot(vN, vV)), 2.6); float sl = smoothstep(.85, 1., abs(fract(vP.z / 9.) - .5) * 2.) * .5 + smoothstep(.9, 1., abs(fract(vP.y / 9.) - .5) * 2.) * .25;
            vec3 c = vec3(.55, .66, .8) * (f * .22 + sl * f * .35); gl_FragColor = vec4(c * uOp, 0.); }` });
      scene.add(new THREE.Mesh(g, m)); return m;
    }

    // ===== 表面の映像（カメラを向く板）。観ている1本は、コマ飛び・ジャギー・光で時刻を走る =====
    type Tile = { m: number; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; scale: number; goal: number; dim: number; dimG: number; lift: number; liftG: number; vid: number; pos: THREE.Vector3;
      anim: null | { pts: THREE.Vector3[]; t0: number; dur: number; to: number; back: boolean } };
    let tiles: Tile[] = [];
    const TILE_V = `uniform float uS; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.,0.,0.,1.); mv.xy += position.xy * uS; gl_Position = projectionMatrix * mv; }`;
    const TILE_F = `precision highp float; varying vec2 vUv; uniform sampler2D uAt, uVid; uniform vec4 uRect; uniform float uUseVid, uDim, uFace, uHi, uOp, uGl, uFl, uT; uniform vec3 uRim;
      vec3 tex(vec2 p){ p = clamp(p, .001, .999); return mix(texture2D(uAt, uRect.xy + p * uRect.zw).rgb, texture2D(uVid, p).rgb, uUseVid); }
      float h(float x){ return fract(sin(x) * 43758.5453); }
      void main(){ vec2 q = abs(vUv - .5) * vec2(16., 9.); vec2 b = vec2(8., 4.5) - .45; float d = length(max(q - b, 0.)) - .45; float a = (1. - smoothstep(-.05, .05, d)) * uOp; if (a < .003) discard;
        vec2 uv = vUv; vec3 c;
        if (uGl > .001) {
          // 時刻を走るあいだ: 横に裂け、ブロックに崩れ、色がずれる
          float row = floor(uv.y * 34.), tt = floor(uT * 24.); float tear = step(1. - uGl * .55, h(row * 7.13 + tt)); uv.x += (h(row * 3.7 + tt) - .5) * .22 * tear * uGl;
          float bl = mix(160., 18., uGl); vec2 px = vec2(bl * 16. / 9., bl); uv = mix(uv, (floor(uv * px) + .5) / px, step(.35, uGl));
          float sh = .018 * uGl; c = vec3(tex(uv + vec2(sh, 0.)).r, tex(uv).g, tex(uv - vec2(sh, 0.)).b);
          c *= .85 + .3 * h(row + tt); }
        else c = tex(uv);
        c = mix(c, vec3(1.), uFl);
        float rim = smoothstep(.3, 0., abs(d + .18)); c = c * (uDim * (.45 + .55 * uFace)) + uRim * rim * (.22 + uHi * .9);
        gl_FragColor = vec4(c * a, a); }`;
    let rootGeo: THREE.BufferGeometry, rootA: Float32Array, nodeGeo: THREE.BufferGeometry, nodeA: Float32Array, nodeS: Float32Array;
    const intros: { value: number }[] = [];
    function buildCortex(atl: THREE.Texture[]) {
      const geo = new THREE.PlaneGeometry(1, 9 / 16), blank = new THREE.Texture();
      tiles = N.moments.map((mo, m) => { const id = mo.ctx[0], s = Math.floor(id / 256), k = id % 256;
        const mat = new THREE.ShaderMaterial({ vertexShader: TILE_V, fragmentShader: TILE_F, transparent: true, depthWrite: false, depthTest: false,
          uniforms: { uAt: { value: atl[s] || blank }, uVid: { value: blank }, uRect: { value: new THREE.Vector4((k % 16) / 16, 1 - (Math.floor(k / 16) + 1) / 16, 1 / 16, 1 / 16) }, uUseVid: { value: 0 }, uDim: { value: 1 }, uFace: { value: 1 }, uHi: { value: 0 }, uOp: { value: 0 }, uS: { value: 16 }, uRim: { value: new THREE.Color("#f4f2ec") }, uGl: { value: 0 }, uFl: { value: 0 }, uT: { value: 0 } } });
        const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(MP[m].tile); mesh.frustumCulled = false; scene.add(mesh);
        return { m, mesh, mat, scale: 16, goal: 16, dim: 1, dimG: 1, lift: 0, liftG: 0, vid: -1, pos: MP[m].tile.clone(), anim: null }; });
      // 根: 映像の下から、その1本の熱へ
      const nC = N.ctx.length, rp = new Float32Array(nC * 6), rc = new Float32Array(nC * 6); rootA = new Float32Array(nC * 2).fill(0.35);
      const c3 = DIMC.map((h) => new THREE.Color(h));
      N.ctx.forEach((c, i) => { const m = momOf[i], a = MP[m].s.clone().addScaledVector(MP[m].n, 4), b = EP[i], cc = c3[c.w.indexOf(Math.max(...c.w))];
        rp.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); rc.set([0.9, 0.9, 0.9, cc.r, cc.g, cc.b], i * 6); });
      rootGeo = new THREE.BufferGeometry(); rootGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3)); rootGeo.setAttribute("col", new THREE.BufferAttribute(rc, 3)); rootGeo.setAttribute("a", new THREE.BufferAttribute(rootA, 1));
      const rm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uIntro: { value: 0 } },
        vertexShader: `attribute vec3 col; attribute float a; uniform float uIntro; varying vec3 vC; varying float vA; void main(){ vC = col; vA = a * uIntro; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
        fragmentShader: `precision highp float; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC * vA, vA); }` });
      scene.add(new THREE.LineSegments(rootGeo, rm)); intros.push(rm.uniforms.uIntro);
      nodeA = new Float32Array(nC).fill(0.7); nodeS = new Float32Array(nC).fill(1); const np = new Float32Array(nC * 3), nc = new Float32Array(nC * 3);
      N.ctx.forEach((c, i) => { np.set([EP[i].x, EP[i].y, EP[i].z], i * 3); const cc = c3[c.w.indexOf(Math.max(...c.w))].clone().lerp(new THREE.Color("#ffffff"), 0.35); nc.set([cc.r, cc.g, cc.b], i * 3); });
      nodeGeo = new THREE.BufferGeometry(); nodeGeo.setAttribute("position", new THREE.BufferAttribute(np, 3)); nodeGeo.setAttribute("col", new THREE.BufferAttribute(nc, 3)); nodeGeo.setAttribute("a", new THREE.BufferAttribute(nodeA, 1)); nodeGeo.setAttribute("sz", new THREE.BufferAttribute(nodeS, 1));
      const nm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: R.getPixelRatio() }, uIntro: { value: 0 } },
        vertexShader: `attribute vec3 col; attribute float a, sz; uniform float uPx, uIntro; varying vec3 vC; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = uPx * sz * 300. / -mv.z; vC = col; vA = a * uIntro; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `precision highp float; varying vec3 vC; varying float vA; void main(){ float r = length(gl_PointCoord - .5) * 2.; float k = smoothstep(1., .55, r) * .5 + smoothstep(.42, .3, r); gl_FragColor = vec4(vC * k * vA, k * vA); }` });
      scene.add(new THREE.Points(nodeGeo, nm)); intros.push(nm.uniforms.uIntro);
    }
    const setNodes = (f: (i: number) => [number, number]) => { N.ctx.forEach((_, i) => { const [a, s] = f(i); nodeA[i] = a; nodeS[i] = s; }); nodeGeo.attributes.a.needsUpdate = true; nodeGeo.attributes.sz.needsUpdate = true; };
    const setRoots = (f: (i: number) => number) => { N.ctx.forEach((_, i) => { rootA[i * 2] = rootA[i * 2 + 1] = f(i); }); rootGeo.attributes.a.needsUpdate = true; };

    // 茎: 浮かんだ映像と、その熱の点を結ぶ細い線（色＝何で響いたか）
    const stemPos = new Float32Array(10 * 6), stemCol = new Float32Array(10 * 6), stemGeo = new THREE.BufferGeometry();
    stemGeo.setAttribute("position", new THREE.BufferAttribute(stemPos, 3)); stemGeo.setAttribute("color", new THREE.BufferAttribute(stemCol, 3)); stemGeo.setDrawRange(0, 0);
    { const sm = new THREE.LineSegments(stemGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); sm.frustumCulled = false; sm.renderOrder = 6; scene.add(sm); }
    function stems(list: Item[]) { const c3 = DIMC.map((h) => new THREE.Color(h)); list.slice(0, 10).forEach((it, k) => { const E = EP[it.id], T = tiles[momOf[it.id]].mesh.position, c = c3[it.d]; stemPos.set([E.x, E.y, E.z, T.x, T.y, T.z], k * 6); stemCol.set([c.r, c.g, c.b, c.r * 0.6, c.g * 0.6, c.b * 0.6], k * 6); });
      stemGeo.setDrawRange(0, Math.min(10, list.length) * 2); stemGeo.attributes.position.needsUpdate = true; stemGeo.attributes.color.needsUpdate = true; }
    // 言葉の光（「熱狂を探す」で打った言葉が中心に生まれる）
    const wordMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: R.getPixelRatio() }, uOp: { value: 0 }, uT: { value: 0 } },
      vertexShader: `uniform float uPx, uT; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = uPx * (2200. + 260. * sin(uT * 2.4)) / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `precision highp float; uniform float uOp; void main(){ float r = length(gl_PointCoord - .5) * 2.; float k = exp(-r * r * 9.) * 1.2 + smoothstep(.16, .08, r); gl_FragColor = vec4(vec3(1., .97, .82) * k * uOp, k * uOp); }` });
    const WORDP = V(0, 6, 0); { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([WORDP.x, WORDP.y, WORDP.z]), 3)); const p = new THREE.Points(g, wordMat); p.frustumCulled = false; p.renderOrder = 6; scene.add(p); }
    let wordOpG = 0;
    const wordPath = (id: number) => { const E = EP[id], n = normalAt(E); return new THREE.CatmullRomCurve3([WORDP.clone(), WORDP.clone().lerp(E, 0.35).add(V((rnd() - 0.5) * 14, (rnd() - 0.5) * 14, (rnd() - 0.5) * 14)), E.clone().addScaledVector(n, -20).lerp(E, 0.3), E.clone()], false, "centripetal").getPoints(FS); };

    // ===== 映像 =====
    type Slot = { v: HTMLVideoElement; tex: THREE.VideoTexture; tile: number; src: string };
    const mkV = (muted = true) => { const v = document.createElement("video"); v.crossOrigin = "anonymous"; v.muted = muted; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", ""); return v; };
    const slots: Slot[] = Array.from({ length: portrait() ? 5 : 8 }, () => { const v = mkV(); v.loop = true; const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; return { v, tex, tile: -1, src: "" }; });
    const clipOf = (id: number) => `${BASE}/ctx/c/${id}.${ext}`;
    function playOn(tile: number, src: string) { const t = tiles[tile]; let s = slots.find((x) => x.tile === tile);
      if (!s) s = slots.find((x) => x.tile < 0) || slots[0];
      if (s.tile >= 0 && s.tile !== tile) stopOn(s.tile);
      s.tile = tile; t.vid = slots.indexOf(s); if (s.src !== src) { s.src = src; s.v.src = src; } s.v.play().catch(() => {});
      const go = () => { if (s!.tile === tile && mainTile !== tile) t.mat.uniforms.uVid.value = s!.tex; }; if (s.v.readyState >= 2) go(); else s.v.onloadeddata = go; }
    function stopOn(tile: number) { const t = tiles[tile]; if (!t || t.vid < 0) return; const s = slots[t.vid]; if (s.tile === tile) { s.v.pause(); s.tile = -1; } t.vid = -1; }
    const playing = new Set<number>();
    function setPlaying(list: { tile: number; src: string }[]) { const want = new Set(list.map((x) => x.tile)); playing.forEach((t) => { if (!want.has(t)) stopOn(t); }); playing.clear(); list.slice(0, slots.length).forEach((x) => { playing.add(x.tile); playOn(x.tile, x.src); }); }
    // 観ている1本（元の映像。熱の時刻はこの映像の時刻）
    const mainV = mkV(false); const mainTex = new THREE.VideoTexture(mainV); mainTex.colorSpace = THREE.SRGBColorSpace; let mainTile = -1, mainOk = false;
    mainV.addEventListener("loadeddata", () => { mainOk = true; });
    let scrub: null | { from: number; to: number; t0: number; c: number; lastSeek: number } = null, flash = 0, glitch = 0, lastT = 0;

    // ===== 動き =====
    const ids2items = (c: number, js: number[]) => js.map((j) => { let d = -1, best = -1; linksOf[c]?.forEach((n) => { if (other(n, c) === j && N.links[n][2] > best) { best = N.links[n][2]; d = N.links[n][3]; } }); return { id: j, d: d < 0 ? N.ctx[j].w.indexOf(Math.max(...N.ctx[j].w)) : d }; });
    const other = (n: number, c: number) => (N.links[n][0] === c ? N.links[n][1] : N.links[n][0]);
    // 見方を合わせた近さで、別の瞬間から7つ（同じ競技が続かないように少し散らす）
    function nearHeats(c: number) {
      const best = new Map<string, { j: number; n: number; s: number }>();
      linksOf[c].forEach((n) => { const j = other(n, c), no = N.ctx[j].no, sc = N.links[n][2]; if (no === N.ctx[c].no) return; const cur = best.get(no); if (!cur || sc > cur.s) best.set(no, { j, n, s: sc }); });
      const cand = Array.from(best.values()), out: { j: number; n: number; s: number }[] = [], cnt: Record<string, number> = {}, sp0 = N.moments[momOf[c]].sport;
      while (out.length < 7 && cand.length) { let bi = 0, bv = -1e9; cand.forEach((x, i) => { const sp = N.moments[momOf[x.j]].sport, v = x.s - (sp === sp0 ? 0.25 : 0) - 0.15 * (cnt[sp] || 0); if (v > bv) { bv = v; bi = i; } });
        const x = cand.splice(bi, 1)[0]; out.push(x); const sp = N.moments[momOf[x.j]].sport; cnt[sp] = (cnt[sp] || 0) + 1; }
      return out;
    }
    function reset() { setFat([]); wordOpG = 0; tiles.forEach((t) => { t.liftG = 0; t.goal = 16; t.dimG = 1; (t.mat.uniforms.uRim.value as THREE.Color).set("#f4f2ec"); t.mat.uniforms.uHi.value = 0; }); }
    function free() { if (mainTile >= 0) releaseMain(); reset(); paintFibers(() => 1); setNodes(() => [0.7, 1]); setRoots(() => 0.35); setPlaying([]); liveAt = 0;
      camG.dist = portrait() ? 560 : 290; tgtG.set(0, 0, 0); setV({ k: "free" }); }
    function releaseMain() { const t = tiles[mainTile]; if (t) { t.mat.uniforms.uUseVid.value = 0; t.mat.uniforms.uVid.value = new THREE.Texture(); } mainV.pause(); mainTile = -1; mainOk = false; scrub = null; }
    // 観る: その1本に寄り、元の映像を音つきで流す
    function watch(m: number, then?: () => void) {
      if (st.k === "gather") return;
      reset(); setPlaying([]);
      if (mainTile !== m) { if (mainTile >= 0) releaseMain(); mainTile = m; mainOk = false; const md = media[N.moments[m].no];
        mainV.src = md?.detail || md?.[safari ? "loop" : "webm"] || ""; mainV.currentTime = 0; mainV.loop = true; mainV.muted = false; mainV.play().catch(() => { mainV.muted = true; mainV.play().catch(() => {}); });
        tiles[m].mat.uniforms.uVid.value = mainTex; }
      const ids = new Set(N.moments[m].ctx);
      paintFibers((n) => (ids.has(N.links[n][0]) || ids.has(N.links[n][1]) ? 1 : 0)); setNodes((i) => (ids.has(i) ? [1.3, 2] : [0.1, 0.7])); setRoots((i) => (ids.has(i) ? 1 : 0.04));
      tiles.forEach((t) => { t.dimG = t.m === m ? 1 : 0.3; t.goal = t.m === m ? 30 : 16; });
      frameTile(m); setV({ k: "watch", m }); lastT = mainV.currentTime;
      if (then) setTimeout(then, reduce ? 200 : 1000);
    }
    function frameTile(m: number) { const n = MP[m].n, S = 30, f = portrait() ? 0.94 : 0.56, tn = Math.tan((cam.fov * Math.PI) / 360);
      camG.yaw = Math.atan2(n.x, n.z); camG.pitch = Math.max(-1, Math.min(1, Math.asin(n.y))); camG.dist = S / (f * 2 * tn * (portrait() ? innerWidth / innerHeight : Math.min(1.9, innerWidth / innerHeight))); tgtG.copy(MP[m].tile); }
    // 熱を選ぶ: 本物のコマを通ってその時刻へ（約0.8秒）→ 光 → その場面が流れ、言葉が打ち込まれる → 近しい熱が浮かぶ
    function heat(c: number) { const m = momOf[c];
      if (st.k === "gather") return;
      if (mainTile !== m || (st.k !== "watch" && st.k !== "heat" && st.k !== "scrub")) { watch(m, () => heat(c)); return; }
      reset(); setPlaying([]); tiles.forEach((t) => { t.dimG = t.m === m ? 1 : 0.3; t.goal = t.m === m ? 30 : 16; }); frameTile(m);
      mainV.pause(); scrub = { from: mainV.currentTime, to: Math.max(0, N.ctx[c].t - 1.2), t0: now, c, lastSeek: 0 }; setV({ k: "scrub", m, c });
    }
    function reveal(c: number) { const m = momOf[c], near = nearHeats(c), items: Item[] = near.map((x) => ({ id: x.j, d: N.links[x.n][3] }));
      const pn = new Set(near.map((x) => x.n)), pj = new Set(near.map((x) => x.j)), pm = new Set(near.map((x) => momOf[x.j]));
      paintFibers((n) => (pn.has(n) ? 2 : 0), (n) => N.links[n][1] === c); setFat(near.map((x) => ({ pts: pathFrom(x.n, c), d: N.links[x.n][3] })));
      setNodes((i) => (i === c ? [1.6, 3.2] : pj.has(i) ? [1.3, 2.4] : [0.08, 0.7])); setRoots((i) => (i === c || pj.has(i) ? 1 : 0.03));
      tiles.forEach((t) => { const it = items.find((x) => momOf[x.id] === t.m); t.dimG = t.m === m ? 1 : it ? 1.05 : 0.18; t.goal = t.m === m ? 26 : it ? 22 : 15; t.liftG = it ? 1 : t.m === m ? 0.7 : 0;
        (t.mat.uniforms.uRim.value as THREE.Color).set(it ? DIMC[it.d] : "#f4f2ec"); t.mat.uniforms.uHi.value = it ? 0.8 : 0; });
      setTimeout(() => setPlaying(items.map((x) => ({ tile: momOf[x.id], src: clipOf(x.id) }))), 400);
      frameGroup([m, ...Array.from(pm)]); setV({ k: "heat", m, c, items }); hooks.current.name?.("");
      nameGroup({ seed: c, ids: [c, ...items.map((x) => x.id)] }); }
    function frameGroup(ms: number[]) { const ps = ms.map((m) => MP[m].tile.clone()); const c = V(); ps.forEach((p) => c.add(p)); c.multiplyScalar(1 / ps.length);
      let r = 30; ps.forEach((p) => (r = Math.max(r, p.distanceTo(c)))); const dir = c.lengthSq() > 1 ? c.clone().normalize() : V(0, 0, 1);
      camG.yaw = Math.atan2(dir.x, dir.z); camG.pitch = Math.max(-0.9, Math.min(0.9, Math.asin(dir.y))); const tn = Math.tan((cam.fov * Math.PI) / 360); camG.dist = Math.max(130, (r + 12) / Math.sin((cam.fov * Math.PI) / 360) * 0.85, (r + 14) / (tn * cam.aspect) * (portrait() ? 1.02 : 0.8)); tgtG.copy(c); }
    // グループの名前（AI）。届くまでは空
    async function nameGroup(body: object) { try { const r = await fetch("/api/ctx/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (j?.name) hooks.current.name?.(j.name); } catch { /* 名前なしでも進める */ } }
    // 熱狂を探す: 言葉が中心に生まれ、線が伸び、近しい熱が浮かぶ
    async function search(q: string) { if (!q.trim() || st.k === "gather") return; if (mainTile >= 0) releaseMain(); reset(); setPlaying([]);
      paintFibers(() => 1); wordOpG = 1; camG.dist = portrait() ? 560 : 300; tgtG.set(0, 0, 0); setV({ k: "search", q });
      try { const r = await fetch("/api/ctx/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) }); const j = await r.json();
        if (!alive || st.k !== "search" || st.q !== q) return; if (!j?.items?.length) { hooks.current.name?.("（この言葉では見つかりませんでした）"); setV({ k: "word", q, items: [] }); return; }
        showWord(q, j.items.map((x: { id: number; dim: number }) => ({ id: x.id, d: x.dim >= 0 ? x.dim : N.ctx[x.id].w.indexOf(Math.max(...N.ctx[x.id].w)) })), j.name || q);
      } catch { setV({ k: "word", q, items: [] }); } }
    function showWord(q: string, items: Item[], name: string) { const pm = new Set(items.map((x) => momOf[x.id])), pj = new Set(items.map((x) => x.id));
      paintFibers((n) => (pj.has(N.links[n][0]) && pj.has(N.links[n][1]) ? 1 : 0)); wordOpG = 1;
      setFat(items.map((x) => ({ pts: wordPath(x.id), d: x.d })), 1.6);
      setNodes((i) => (pj.has(i) ? [1.3, 2.4] : [0.08, 0.7])); setRoots((i) => (pj.has(i) ? 1 : 0.03));
      tiles.forEach((t) => { const it = items.find((x) => momOf[x.id] === t.m); t.dimG = it ? 1.05 : 0.18; t.goal = it ? 22 : 15; t.liftG = it ? 1 : 0; (t.mat.uniforms.uRim.value as THREE.Color).set(it ? DIMC[it.d] : "#f4f2ec"); t.mat.uniforms.uHi.value = it ? 0.8 : 0; });
      setTimeout(() => setPlaying(items.map((x) => ({ tile: momOf[x.id], src: clipOf(x.id) }))), 500);
      frameGroup(Array.from(pm)); setV({ k: "word", q, items }); hooks.current.name?.(name); }
    // この熱狂グループを見る: 浮かんだ映像が線を伝ってこちらへ集まり、一列に並ぶ → 名前 → ダイジェスト
    let backTo: View = { k: "free" };
    function gather() { if (st.k !== "heat" && st.k !== "word") return; backTo = st; const items = st.items, seedC = st.k === "heat" ? st.c : -1;
      const all: Item[] = seedC >= 0 ? [{ id: seedC, d: items[0]?.d ?? 0 }, ...items] : items; if (!all.length) return;
      cam.updateMatrixWorld(); const fwd = cam.getWorldDirection(V()), right = V(1, 0, 0).applyQuaternion(cam.quaternion), up = V(0, 1, 0).applyQuaternion(cam.quaternion);
      const n = all.length, cols = portrait() ? 2 : Math.min(4, n), rows = Math.ceil(n / cols), D = 90, tn = Math.tan((cam.fov * Math.PI) / 360), visW = 2 * D * tn * cam.aspect, visH = 2 * D * tn;
      const S = Math.min((visW * 0.86) / cols / 1.08, (visH * 0.62) / rows / (9 / 16) / 1.12);
      const center = cam.position.clone().addScaledVector(fwd, D).addScaledVector(up, visH * 0.04);
      all.forEach((it, k) => { const m = momOf[it.id], t = tiles[m], r = Math.floor(k / cols), c = k % cols, inRow = Math.min(cols, n - r * cols);
        const slot = center.clone().addScaledVector(right, (c - (inRow - 1) / 2) * S * 1.08).addScaledVector(up, ((rows - 1) / 2 - r) * S * (9 / 16) * 1.12);
        let via: THREE.Vector3[] = [];
        if (seedC >= 0 && it.id !== seedC) { const ln = linksOf[seedC].find((x) => other(x, seedC) === it.id); if (ln !== undefined) via = pathFrom(ln, it.id).filter((_, i) => i % 6 === 0); }
        else if (seedC < 0) via = wordPath(it.id).reverse().filter((_, i) => i % 6 === 0);
        t.anim = { pts: new THREE.CatmullRomCurve3([t.mesh.position.clone(), ...via, slot], false, "centripetal").getPoints(80), t0: now + k * 0.12, dur: reduce ? 0.6 : 2.2, to: S, back: false };
        t.dimG = 1.1; playOn(m, clipOf(it.id)); });
      tiles.forEach((t) => { if (!all.some((x) => momOf[x.id] === t.m)) t.dimG = 0.08; });
      paintFibers((x) => (all.some((it) => N.links[x][0] === it.id || N.links[x][1] === it.id) ? 2 : 0)); idle = false;
      setV({ k: "gather" });
      setTimeout(() => hooks.current.digest?.({ items: all, name: "", seed: seedC, q: backTo.k === "word" ? backTo.q : undefined }), (reduce ? 1.2 : 3.6) * 1000 + n * 120);
    }
    function ungather() { tiles.forEach((t) => { if (!t.anim) return; const home = MP[t.m].tile.clone(); t.anim = { pts: [t.mesh.position.clone(), home], t0: now, dur: 0.9, to: 16, back: true }; });
      const b = backTo; setTimeout(() => { st = { k: "free" }; if (b.k === "heat") { mainTile = -1; watch(b.m, () => heat(b.c)); } else if (b.k === "word") showWord(b.q, b.items, ""); else free(); }, 950); }

    // ===== 空間の文字（浮かんだ熱の言葉・言葉の光・競技の名前・手前の映像の名前）=====
    const pool: HTMLDivElement[] = []; let used = 0, rects: number[][] = []; const prj = V();
    function txt(cls: string, html: string, p: THREE.Vector3, o: { pri?: number; side?: "r" | "c"; op?: number; data?: string } = {}) {
      let e = pool[used]; if (!e) { e = document.createElement("div"); tx.appendChild(e); pool[used] = e; } used++;
      const key = cls + html; type M = HTMLDivElement & { _w: number; _h: number }; const em = e as M;
      if (e.dataset.h !== key) { e.dataset.h = key; e.className = `bw-t ${cls}`; e.innerHTML = html; em._w = e.offsetWidth; em._h = e.offsetHeight; }
      e.dataset.v = o.data || "";
      prj.copy(p).project(cam); let vis = prj.z < 1 && Math.abs(prj.x) < 1.05 && Math.abs(prj.y) < 1.05;
      const W = em._w, H = em._h, x = (prj.x * 0.5 + 0.5) * innerWidth, y = (-prj.y * 0.5 + 0.5) * innerHeight;
      let bx = o.side === "c" ? x - W / 2 : x + 10, by = y - H / 2; bx = Math.max(10, Math.min(innerWidth - W - 10, bx));
      const hit = () => rects.some(([a, b, c, d]) => bx < a + c && bx + W > a && by < b + d && by + H > b);
      for (let t = 1; t <= 6 && vis && hit(); t++) by = y - H / 2 + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * (H * 0.6 + 4);
      if (vis && hit() && (o.pri ?? 0) < 2) vis = false; if (vis) rects.push([bx, by, W, H]);
      e.style.transform = `translate3d(${bx}px,${by}px,0)`; e.style.opacity = vis ? String(o.op ?? 1) : "0"; e.style.pointerEvents = vis && o.data ? "auto" : "none"; }
    const upV = () => V(0, 1, 0).applyQuaternion(cam.quaternion);
    function drawText() { used = 0; rects = [];
      if (st.k === "gather") { for (let k = 0; k < pool.length; k++) { pool[k].style.opacity = "0"; pool[k].style.pointerEvents = "none"; } return; }
      const up = upV();
      if (st.k === "heat" || st.k === "word") { st.items.forEach((it) => { const c = N.ctx[it.id], m = momOf[it.id], t = tiles[m];
        txt("ht", `<b>${N.moments[m].sport}</b><span style="--c:${DIMC[it.d]}"><small>${N.dims[it.d]}</small>${c.v[it.d] || c.title}</span>`, t.mesh.position.clone().addScaledVector(up, t.scale * 0.2813 + 6), { pri: 2, side: "c", data: `w:${it.id}` }); }); }
      if (st.k === "word" || st.k === "search") txt("wd", st.q, WORDP.clone().addScaledVector(up, 7), { pri: 3, side: "c" });
      if (hoverM >= 0 && st.k !== "watch" && st.k !== "scrub") { const m = N.moments[hoverM], t = tiles[hoverM]; txt("mo", `<b>${m.sport}</b><span>${m.title}</span>`, t.mesh.position.clone().addScaledVector(up, t.scale * 0.3 + 2), { pri: 3, side: "c" }); }
      if (st.k === "free") famCenter.forEach((p, f) => { if (!MP.some((x) => x.fam === f)) return; const face = normalAt(p).dot(tmp.copy(cam.position).sub(p).normalize()); txt("lobe", FAM[f].name, p, { side: "c", op: Math.max(0, Math.min(1, (face - 0.05) * 3)) * 0.85 }); });
      for (let k = used; k < pool.length; k++) { pool[k].style.opacity = "0"; pool[k].style.pointerEvents = "none"; } }
    tx.addEventListener("click", (e) => { const t = (e.target as HTMLElement).closest("[data-v]") as HTMLElement | null; if (!t?.dataset.v) return; const [k, a] = t.dataset.v.split(":"); if (k === "w") heat(+a); });

    // ===== 操作: ドラッグで回す、ピンチ/ホイールで寄る、映像に触れると観る（浮かんだ映像なら、その熱の時刻へ）=====
    const ptrs = new Map<number, [number, number]>(); let down: null | { x: number; y: number; yaw: number; pitch: number; moved: boolean } = null, pinch0 = 0;
    const cv = R.domElement;
    cv.addEventListener("pointerdown", (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); idle = false; if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, yaw: camG.yaw, pitch: camG.pitch, moved: false }; if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()); pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); down = null; } });
    cv.addEventListener("pointermove", (e) => { if (!ptrs.has(e.pointerId)) { hover(e.clientX, e.clientY); return; } ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (st.k === "gather") return;
      if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()), d = Math.hypot(a[0] - b[0], a[1] - b[1]); camG.dist = Math.max(30, Math.min(620, camG.dist * pinch0 / d)); pinch0 = d; return; }
      if (down) { const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true; camG.yaw = down.yaw - dx * 0.0055; camG.pitch = Math.max(-1.2, Math.min(1.2, down.pitch + dy * 0.0045)); } });
    cv.addEventListener("pointerup", (e) => { ptrs.delete(e.pointerId); if (!down) return; const moved = down.moved; down = null; if (moved || st.k === "gather") return; const m = pick(e.clientX, e.clientY); if (m < 0) return;
      if ((st.k === "heat" || st.k === "word") && st.items.some((x) => momOf[x.id] === m)) { const it = st.items.find((x) => momOf[x.id] === m)!; heat(it.id); return; }
      if ((st.k === "watch" || st.k === "heat" || st.k === "scrub") && m === mainTile) return;
      watch(m); });
    cv.addEventListener("pointercancel", (e) => { ptrs.delete(e.pointerId); down = null; });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); idle = false; if (st.k !== "gather") camG.dist = Math.max(30, Math.min(620, camG.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
    function pick(x: number, y: number) { let best = -1, bd = 1e9;
      tiles.forEach((t) => { if (t.mat.uniforms.uOp.value < 0.3) return; prj.copy(t.mesh.position).project(cam); if (prj.z > 1) return; const sx = (prj.x * 0.5 + 0.5) * innerWidth, sy = (-prj.y * 0.5 + 0.5) * innerHeight;
        const dpt = cam.position.distanceTo(t.mesh.position), half = (t.scale / 2) / (dpt * Math.tan((cam.fov * Math.PI) / 360)) * (innerHeight / 2);
        if (Math.abs(x - sx) < half && Math.abs(y - sy) < half * 0.5625 + 4 && dpt < bd) { bd = dpt; best = t.m; } });
      return best; }
    let hoverM = -1; function hover(x: number, y: number) { const m = pick(x, y); hoverM = m; cv.style.cursor = m >= 0 ? "pointer" : "grab"; }

    // ===== 毎フレーム =====
    let shellMat: THREE.ShaderMaterial | null = null, last = 0, raf = 0, ready = false, liveAt = 0, manual = false;
    const resize = () => { const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; R.setSize(w, h, false); fatMat.resolution.set(w, h); cam.aspect = w / h; cam.fov = portrait() ? 56 : 42; cam.updateProjectionMatrix(); };
    function update(dt: number, draw = true) { now += dt;
      if (!ready) { if (draw) R.render(scene, cam); return; }
      intro = Math.min(1, intro + dt / (reduce ? 0.5 : 3.2)); const ie = 1 - Math.pow(1 - intro, 3);
      fiberMat.uniforms.uIntro.value = ie; intros.forEach((u) => (u.value = ie)); if (shellMat) shellMat.uniforms.uOp.value = ie;
      mixT = Math.min(1, mixT + dt / 0.6); fiberMat.uniforms.uMix.value = mixT * mixT * (3 - 2 * mixT); fiberMat.uniforms.uSweep.value = (now - sweepT) / 1.2;
      if (idle && !reduce && st.k === "free") camG.yaw += dt * 0.045;
      const k = 1 - Math.exp(-dt / 0.55);
      cam0.yaw += (camG.yaw - cam0.yaw) * k; cam0.pitch += (camG.pitch - cam0.pitch) * k; cam0.dist += (camG.dist - cam0.dist) * k; tgtC.lerp(tgtG, k);
      cam.position.set(Math.sin(cam0.yaw) * Math.cos(cam0.pitch), Math.sin(cam0.pitch), Math.cos(cam0.yaw) * Math.cos(cam0.pitch)).multiplyScalar(cam0.dist).add(tgtC); cam.up.set(0, 1, 0); cam.lookAt(tgtC);
      { const w = R.domElement.width / R.getPixelRatio(), h = R.domElement.height / R.getPixelRatio(), pr = portrait();
        const ox = pr ? 0 : st.k === "free" || st.k === "search" ? -0.1 : 0, oy = st.k === "free" || st.k === "search" ? (pr ? -0.05 : 0) : st.k === "gather" ? 0 : pr ? 0.2 : 0.11;
        view.x += (ox - view.x) * k; view.y += (oy - view.y) * k; cam.setViewOffset(w, h, view.x * w, view.y * h, w, h); }
      fiberMat.uniforms.uNear.value = cam.position.length(); fiberMat.uniforms.uDen.value = Math.max(0.45, Math.min(1.2, Math.sqrt((Math.min(innerWidth, innerHeight * 1.8) / 1280) * (290 / Math.max(60, cam.position.distanceTo(tgtC))))));
      if (fat) (fat.geometry as LineSegmentsGeometry).instanceCount = Math.min(fatN, Math.ceil(fatN * Math.min(1, (now - fatT0) / fatDur)));
      // 時刻を走る（本物のコマを seek で飛び飛びに見せる）
      if (scrub) { const p = Math.min(1, (now - scrub.t0) / (reduce ? 0.3 : 0.85)), e = p * p * (3 - 2 * p);
        if (mainOk && !mainV.seeking && now - scrub.lastSeek > 0.06) { scrub.lastSeek = now; try { mainV.currentTime = Math.max(0, scrub.from + (scrub.to - scrub.from) * e + (Math.random() - 0.5) * 0.4 * (1 - p)); } catch { /* まだ読めていない */ } }
        glitch = Math.max(glitch, Math.min(1, 0.25 + p * 0.9)); tiles[mainTile].mesh.position.addScaledVector(V(Math.random() - 0.5, Math.random() - 0.5, 0), 0.6 * (1 - p));
        if (p >= 1) { const c = scrub.c; try { mainV.currentTime = scrub.to; } catch { /* */ } mainV.play().catch(() => {}); scrub = null; flash = 1; glitch = 0.6; hooks.current.slam?.(c); setTimeout(() => { if (st.k === "scrub" && st.c === c) reveal(c); }, reduce ? 100 : 650); } }
      glitch = Math.max(0, glitch - dt * (scrub ? 0 : 2.2)); flash = Math.max(0, flash - dt * 2.8);
      // 観ている映像が熱の時刻を通ると、その言葉が浮かぶ
      if (mainTile >= 0 && (st.k === "watch") && !mainV.paused) { const tnow = mainV.currentTime; N.moments[mainTile].ctx.forEach((c) => { const t = N.ctx[c].t; if (lastT < t && tnow >= t && tnow - lastT < 1) hooks.current.pop?.(c); }); lastT = tnow; }
      if (mainTile >= 0) hooks.current.tick?.(mainV.currentTime, mainV.duration || 0);
      wordMat.uniforms.uOp.value += (wordOpG - wordMat.uniforms.uOp.value) * Math.min(1, dt * 3); wordMat.uniforms.uT.value = now;
      // 板
      const cp = cam.position;
      tiles.forEach((t) => { const u = t.mat.uniforms; t.dim += (t.dimG - t.dim) * k; t.lift += (t.liftG - t.lift) * Math.min(1, dt * 2.2);
        if (t.anim) { const a = t.anim, pr = Math.min(1, Math.max(0, (now - a.t0) / a.dur)), e = pr < 0.5 ? 4 * pr * pr * pr : 1 - Math.pow(-2 * pr + 2, 3) / 2, i = e * (a.pts.length - 1), i0 = Math.floor(i);
          t.mesh.position.copy(a.pts[i0]).lerp(a.pts[Math.min(a.pts.length - 1, i0 + 1)], i - i0); t.scale += (a.to - t.scale) * Math.min(1, dt * (pr > 0 ? 3 : 0)); if (a.back && pr >= 1) t.anim = null; }
        else { t.scale += (t.goal - t.scale) * k; const home = MP[t.m].tile; t.mesh.position.copy(home).addScaledVector(MP[t.m].n, t.lift * 8).lerp(cp, t.lift * (portrait() ? 0.32 : 0.42)); }
        u.uS.value = t.scale; u.uDim.value = t.dim;
        const face = t.anim ? 1 : MP[t.m].n.dot(tmp.copy(cp).sub(t.mesh.position).normalize()); u.uFace.value = Math.max(0, Math.min(1, face * 1.6 + 0.4));
        u.uOp.value = Math.min(1, ie * 1.4) * (t.anim || t.lift > 0.5 || t.m === mainTile ? 1 : face < 0.05 ? 0.22 : 0.4 + 0.6 * Math.min(1, face * 2 + 0.3));
        if (t.m !== mainTile && !(st.k === "heat" || st.k === "word")) u.uHi.value = hoverM === t.m ? 1 : 0;
        const isMain = t.m === mainTile, vOn = isMain ? (mainOk ? 1 : 0) : t.vid >= 0 && slots[t.vid].tile === t.m && slots[t.vid].v.readyState >= 2 ? 1 : 0; u.uUseVid.value += (vOn - u.uUseVid.value) * Math.min(1, dt * 4);
        u.uGl.value = isMain ? glitch : 0; u.uFl.value = isMain ? flash : 0; u.uT.value = now;
        t.mesh.renderOrder = t.anim ? 2000 : isMain ? 1500 : face < 0.05 && t.lift < 0.5 ? -10 : 10 + Math.round(1000 - cp.distanceTo(t.mesh.position)); });
      if (st.k === "free" && now - liveAt > 3 && intro > 0.9) { liveAt = now; const cand = tiles.map((t) => { prj.copy(t.mesh.position).project(cam); const face = MP[t.m].n.dot(tmp.copy(cp).sub(t.mesh.position).normalize()); return { t, s: face - Math.hypot(prj.x, prj.y) * 0.8 }; }).sort((a, b) => b.s - a.s).slice(0, portrait() ? 3 : 5);
        setPlaying(cand.map(({ t }) => ({ tile: t.m, src: clipOf(N.moments[t.m].ctx[0]) }))); }
      if ((st.k === "heat" || st.k === "word") && intro > 0.5) stems(st.items); else stemGeo.setDrawRange(0, 0);
      drawText();
      if (draw) R.render(scene, cam); }
    const loop = (t: number) => { raf = requestAnimationFrame(loop); const dt = Math.min(0.1, Math.max(0, (t - (last || t)) / 1000)); last = t; if (!manual) update(dt); };
    resize(); addEventListener("resize", resize); raf = requestAnimationFrame(loop);

    // ===== 読み込み =====
    (async () => {
      N = await (await fetch("/ctx/net.json")).json(); if (!alive) return;
      placeMoments(); buildFibers(); shellMat = buildShell();
      const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
      const atl = await Promise.all(Array.from({ length: Math.ceil(N.ctx.length / 256) }, (_, s) => new Promise<THREE.Texture>((res) => loader.load(`${BASE}/ctx/atlas${s}.jpg`, res, undefined, () => res(new THREE.Texture())))));
      atl.forEach((a) => { a.colorSpace = THREE.SRGBColorSpace; a.anisotropy = 4; a.generateMipmaps = true; a.minFilter = THREE.LinearMipmapLinearFilter; });
      if (!alive) return; buildCortex(atl);
      setNet(N); ready = true; cam0.dist = portrait() ? 760 : 520; camG.dist = portrait() ? 560 : 290;
      // シェアされたリンク: ダイジェストを流し、閉じるとそのグループの前に着地する
      if (shared?.i?.length) { const s = shared.s ?? -1, js = shared.i.filter((x) => x !== s); const items: Item[] = s >= 0 ? ids2items(s, js) : shared.i.map((id) => ({ id, d: N.ctx[id].w.indexOf(Math.max(...N.ctx[id].w)) }));
        backTo = s >= 0 ? { k: "heat", m: momOf[s], c: s, items } : { k: "word", q: shared.q || "", items };
        setTimeout(() => hooks.current.digest?.({ items: s >= 0 ? [{ id: s, d: items[0]?.d ?? 0 }, ...items] : items, name: shared.n, seed: s, q: shared.q }), 1600); }
    })();

    api.current = { watch, heat, search: (q) => { search(q); }, back: () => { if (st.k === "heat" || st.k === "scrub") { reset(); setPlaying([]); watch(st.m); } else free(); }, gather, ungather,
      seek: (t) => { if (mainTile >= 0) { try { mainV.currentTime = t; lastT = t; } catch { /* */ } } }, video: () => mainV };
    (window as unknown as { __bw: object }).__bw = { st: () => st, watch, heat, search, gather, manual: (on: boolean) => { manual = on; }, adv: (s: number) => { const n = Math.max(1, Math.round(s * 30)); for (let i = 0; i < n; i++) update(1 / 30, i === n - 1); }, find: (t: string) => N.ctx.findIndex((c) => c.title === t), momOf: (c: number) => momOf[c] };
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener("resize", resize); slots.forEach((s) => { s.v.pause(); s.v.src = ""; }); mainV.pause(); mainV.src = ""; R.dispose(); el.removeChild(R.domElement); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 画面の文字と操作 =====
  useEffect(() => {
    hooks.current.view = (v) => setView(v);
    hooks.current.pop = (c) => setPop({ c, key: Date.now() });
    hooks.current.slam = (c) => setSlam({ c, key: Date.now() });
    hooks.current.name = (n) => setGname(n);
    hooks.current.digest = (d) => setDg({ ...d, name: d.name || gnameRef.current || "", i: 0, done: false });
    hooks.current.tick = (t, d) => { if (fillRef.current && d > 0) fillRef.current.style.width = `${(t / d) * 100}%`; if (timeRef.current) timeRef.current.textContent = fmt(t); };
  });
  const gnameRef = useRef(""); gnameRef.current = gname;
  const [dur, setDur] = useState(0);
  useEffect(() => { const v = api.current?.video(); if (!v) return; const f = () => setDur(v.duration || 0); v.addEventListener("loadedmetadata", f); return () => v.removeEventListener("loadedmetadata", f); }, [net]);
  useEffect(() => { if (!pop) return; const t = setTimeout(() => setPop(null), 2400); return () => clearTimeout(t); }, [pop]);
  useEffect(() => { if (!slam) return; const t = setTimeout(() => setSlam(null), 2200); return () => clearTimeout(t); }, [slam]);

  const N = net;
  const famName = (sport: string) => FAM.find((f) => f.re.test(sport))?.name || sport;
  const momOfC = (c: number) => (N ? N.moments.find((m) => m.no === N.ctx[c].no)! : null);
  const sports = (items: Item[]) => new Set(items.map((x) => famName(momOfC(x.id)!.sport))).size;

  // ダイジェスト: 集まった熱の4秒を順に画面いっぱいで
  const dvA = useRef<HTMLVideoElement>(null), dvB = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (!dg || dg.done || !N) return; const it = dg.items[dg.i]; const v = dvA.current; if (!v) return;
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent); v.src = `${BASE}/ctx/c/${it.id}.${safari ? "mp4" : "webm"}`; v.muted = false; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    const bg = dvB.current; if (bg && getComputedStyle(bg).display !== "none") { bg.src = v.src; bg.play().catch(() => {}); }
    const t = setTimeout(() => setDg((g) => (g ? (g.i + 1 < g.items.length ? { ...g, i: g.i + 1 } : { ...g, done: true }) : g)), 4200); return () => clearTimeout(t); }, [dg, N]);
  useEffect(() => { if (dg && !dg.name && gname) setDg({ ...dg, name: gname }); }, [gname, dg]);
  const shareUrl = () => { if (!dg) return ""; const code = btoa(unescape(encodeURIComponent(JSON.stringify({ n: (dg.name || "").slice(0, 20), s: dg.seed, q: dg.q, i: dg.items.map((x) => x.id) })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); return `${location.origin}/d/${code}?v=brain`; };
  const closeDg = () => { setDg(null); api.current?.ungather(); };

  const items = view.k === "heat" || view.k === "word" ? view.items : [];
  const watching = view.k === "watch" || view.k === "scrub" || view.k === "heat" ? view.m : -1;
  const curC = view.k === "scrub" || view.k === "heat" ? view.c : -1;

  return (
    <div className="bw">
      <div ref={host} className="bw-gl" />
      <div ref={txRef} className="bw-tx" />
      <div className="bw-vig" />
      <header className="bw-top">
        <div className="bw-mark">DAZN <em>100</em> MOMENTS</div>
        {N && <div className="bw-stat"><span><b>{N.moments.length}</b>本のハイライト</span><span><b>{N.ctx.length}</b>の熱</span><span><b>{N.links.length.toLocaleString()}</b>の繋がり</span></div>}
        {view.k !== "free" && view.k !== "gather" && !dg && <button className="bw-close" aria-label="戻る" onClick={() => api.current?.back()}>←</button>}
      </header>
      {N && (view.k === "free" || view.k === "search" || view.k === "word") && !dg && (
        <div className="bw-intro">
          {view.k === "free" && <p className="l">{LINE}</p>}
          <form className="bw-q" onSubmit={(e) => { e.preventDefault(); if (q.trim()) api.current?.search(q.trim()); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`例: ${EXAMPLE}`} maxLength={40} enterKeyHint="search" />
            <button type="submit" disabled={!q.trim() || view.k === "search"}>熱狂を探す</button>
          </form>
        </div>
      )}
      {N && watching >= 0 && !dg && (() => { const m = N.moments[watching]; return (
        <section className={`bw-watch ${view.k === "heat" ? "h" : ""}`}>
          <div className="who"><b>{m.sport}</b><span>{m.title}</span></div>
          <div className="tl"><span ref={timeRef} className="tm">0:00</span><div className="bar" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (dur) api.current?.seek(((e.clientX - r.left) / r.width) * dur); }}>
            <div ref={fillRef} className="fill" />
            {dur > 0 && m.ctx.map((c) => <i key={c} className={c === curC ? "on" : ""} style={{ left: `${(N.ctx[c].t / dur) * 100}%` }} onClick={(e) => { e.stopPropagation(); api.current?.heat(c); }} />)}
          </div></div>
          <div className="heats">{m.ctx.map((c) => <button key={c} className={c === curC ? "on" : pop?.c === c ? "pass" : ""} onClick={() => api.current?.heat(c)}>{N.ctx[c].title}</button>)}</div>
          {view.k === "heat" && (<div className="grp"><div className="g"><b>{gname || " "}</b><span>{items.length}の熱が、{sports(items)}つの競技から集まりました</span></div>
            <button className="pill" onClick={() => api.current?.gather()}>この熱狂グループを見る</button></div>)}
        </section>); })()}
      {N && view.k === "word" && !dg && (
        <section className="bw-watch h w"><div className="grp"><div className="g"><b>{gname || view.q}</b><span>{items.length ? `「${view.q}」に、${items.length}の熱が${sports(items)}つの競技から集まりました` : "この言葉では見つかりませんでした"}</span></div>
          {items.length > 0 && <button className="pill" onClick={() => api.current?.gather()}>この熱狂グループを見る</button>}</div></section>)}
      {N && view.k === "search" && <div className="bw-scan"><span>{N.ctx.length}の熱と照らし合わせています</span></div>}
      {N && pop && view.k === "watch" && <div className="bw-pop" key={pop.key}>{N.ctx[pop.c].title}</div>}
      {N && slam && <div className="bw-slam" key={slam.key}><span>{N.ctx[slam.c].title}</span></div>}
      {N && view.k === "gather" && <div className="bw-gname">{gname}</div>}
      {dg && N && (
        <div className="bw-dg">
          {!dg.done && <video ref={dvB} className="bg" playsInline autoPlay muted />}
          {!dg.done && <video ref={dvA} playsInline autoPlay />}
          {!dg.done && (() => { const it = dg.items[dg.i], c = N.ctx[it.id], m = momOfC(it.id)!; return (<div className="cap" key={dg.i}><div className="bar">{dg.items.map((_, i) => <i key={i} className={i < dg.i ? "done" : i === dg.i ? "now" : ""} />)}</div><div className="nm">{dg.name}</div><div className="k">{m.sport}</div><h3 style={{ ["--c" as string]: DIMC[it.d] }}>{c.title}</h3><p>{m.title}</p></div>); })()}
          {dg.done && (<div className="end"><div className="k">競技を越えて集まった熱</div><h3>{dg.name || "この熱狂グループ"}</h3><p>{sports(dg.items)}つの競技・{dg.items.length}の瞬間。リンクを送ると、開いた人の画面でこの順に流れます。</p>
            <div className="sh"><a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${dg.name} #DAZN100MOMENTS`)}&url=${encodeURIComponent(shareUrl())}`} target="_blank" rel="noreferrer">X</a><a href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl())}`} target="_blank" rel="noreferrer">LINE</a><button onClick={() => { navigator.clipboard?.writeText(shareUrl()); setToast("リンクをコピーしました"); setTimeout(() => setToast(""), 1800); }}>リンクをコピー</button></div>
            <div className="row"><button className="x" onClick={() => setDg({ ...dg, i: 0, done: false })}>もう一度</button><button className="pill" onClick={closeDg}>戻る</button></div></div>)}
          {!dg.done && <button className="skip" onClick={() => setDg({ ...dg, done: true })}>×</button>}
        </div>)}
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
.bw-t{position:absolute;left:0;top:0;white-space:nowrap;transition:opacity .2s;will-change:transform}
.bw-t.lobe{font-size:11px;font-weight:900;letter-spacing:.42em;color:rgba(244,242,236,.78);text-shadow:0 0 18px rgba(0,0,0,.9)}
.bw-t.mo b,.bw-t.ht b{display:block;font-size:9.5px;font-weight:900;letter-spacing:.18em;color:#f7ff3c;text-align:center}
.bw-t.mo span{display:block;font-size:14px;font-weight:900;text-shadow:0 1px 12px rgba(0,0,0,.95)}
.bw-t.ht{cursor:pointer;text-align:center}
.bw-t.ht span{display:block;font-size:13.5px;font-weight:900;text-shadow:0 1px 10px rgba(0,0,0,.95);margin-top:3px}
.bw-t.ht span small{display:block;font-size:9px;font-weight:700;letter-spacing:.14em;color:var(--c);margin-bottom:1px}
.bw-t.wd{font-size:clamp(18px,2vw,26px);font-weight:900;letter-spacing:.04em;text-shadow:0 0 24px rgba(0,0,0,.9),0 0 2px rgba(0,0,0,.9)}
.bw-top{position:absolute;left:0;right:0;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:calc(env(safe-area-inset-top,0px) + 18px) max(20px,env(safe-area-inset-right,0px)) 0 max(20px,env(safe-area-inset-left,0px));pointer-events:none}
.bw-top>*{pointer-events:auto}
.bw-mark{font-size:11px;font-weight:900;letter-spacing:.32em;white-space:nowrap}.bw-mark em{font-style:normal;color:#f7ff3c}
.bw-stat{display:flex;gap:16px;font-size:10px;letter-spacing:.1em;color:rgba(244,242,236,.55);margin-left:auto}
.bw-stat b{font-size:14px;color:#f4f2ec;font-weight:900;margin-right:3px;font-variant-numeric:tabular-nums}
.bw-close{width:40px;height:40px;flex:none;border-radius:50%;border:1px solid rgba(244,242,236,.22);background:rgba(2,3,6,.5);color:#f4f2ec;font-size:17px;cursor:pointer;backdrop-filter:blur(8px)}
.bw-intro{position:absolute;left:max(24px,4vw);top:calc(env(safe-area-inset-top,0px) + 76px);z-index:6;width:min(460px,calc(100% - 48px));animation:bwf 1s .6s ease both}
.bw-intro .l{margin:0 0 16px;font-size:clamp(22px,2.1vw,29px);white-space:nowrap;font-weight:900;line-height:1.4;letter-spacing:.04em;text-shadow:0 2px 20px rgba(0,0,0,.8)}
.bw-q{display:flex;gap:0;background:rgba(6,8,13,.66);border:1px solid rgba(244,242,236,.2);border-radius:999px;padding:5px;backdrop-filter:blur(10px)}
.bw-q input{flex:1;min-width:0;font-family:inherit;font-size:15px;font-weight:700;color:#f4f2ec;background:transparent;border:0;outline:0;padding:9px 14px}
.bw-q input::placeholder{color:rgba(244,242,236,.38)}
.bw-q button{flex:none;font-family:inherit;font-size:13px;font-weight:900;color:#0a0a0a;background:#f7ff3c;border:0;border-radius:999px;padding:10px 16px;cursor:pointer}
.bw-q button:disabled{opacity:.35;cursor:default}
@keyframes bwf{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.bw-watch{position:absolute;left:0;right:0;margin:0 auto;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);z-index:6;width:min(860px,calc(100% - 32px));background:linear-gradient(180deg,rgba(8,10,16,.72),rgba(4,5,9,.86));border:1px solid rgba(244,242,236,.1);border-radius:18px;padding:14px 18px 14px;backdrop-filter:blur(14px);animation:bwf .45s ease both}
.bw-watch .who{display:flex;align-items:baseline;gap:10px;min-width:0}.bw-watch .who b{font-size:10px;font-weight:900;letter-spacing:.2em;color:#f7ff3c;white-space:nowrap}.bw-watch .who span{font-size:15px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bw-watch .tl{display:flex;align-items:center;gap:10px;margin-top:10px}.bw-watch .tm{font-size:10px;color:rgba(244,242,236,.55);font-variant-numeric:tabular-nums;width:30px}
.bw-watch .bar{position:relative;flex:1;height:3px;border-radius:3px;background:rgba(244,242,236,.15);cursor:pointer}
.bw-watch .bar .fill{position:absolute;left:0;top:0;bottom:0;background:#f4f2ec;border-radius:3px}
.bw-watch .bar i{position:absolute;top:50%;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;background:#020306;border:2px solid #f7ff3c;cursor:pointer;transition:transform .2s}
.bw-watch .bar i.on{background:#f7ff3c;transform:scale(1.25)}
.bw-watch .heats{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.bw-watch .heats button{font-family:inherit;font-size:12.5px;font-weight:700;color:#f4f2ec;background:rgba(244,242,236,.05);border:1px solid rgba(244,242,236,.16);border-radius:999px;padding:7px 12px;cursor:pointer;transition:background .25s,border-color .25s,color .25s}
.bw-watch .heats button:hover{border-color:rgba(247,255,60,.6)}
.bw-watch .heats button.pass{border-color:#f7ff3c;color:#f7ff3c}
.bw-watch .heats button.on{background:#f7ff3c;color:#0a0a0a;border-color:#f7ff3c}
.bw-watch .grp{display:flex;align-items:center;gap:14px;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid rgba(244,242,236,.1);animation:bwf .5s ease both}
.bw-watch.w .grp{margin-top:0;padding-top:0;border-top:0}
.bw-watch .g{min-width:0}.bw-watch .g b{display:block;font-size:17px;font-weight:900;min-height:1.2em}.bw-watch .g span{display:block;font-size:11.5px;color:rgba(244,242,236,.62);margin-top:2px}
.pill{flex:none;font-family:inherit;font-size:13.5px;font-weight:900;color:#0a0a0a;background:#f7ff3c;border:0;border-radius:999px;padding:12px 18px;cursor:pointer;box-shadow:0 8px 30px rgba(247,255,60,.18)}
.bw-pop{position:absolute;left:50%;top:calc(50% - 6vh);transform:translate(-50%,-50%);z-index:5;font-size:clamp(18px,2.2vw,28px);font-weight:900;text-shadow:0 2px 20px rgba(0,0,0,.9);pointer-events:none;animation:bwpop 2.4s ease both;white-space:nowrap}
@keyframes bwpop{0%{opacity:0;transform:translate(-50%,-30%);filter:blur(8px)}12%{opacity:1;transform:translate(-50%,-50%);filter:none}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-70%)}}
.bw-slam{position:absolute;left:0;right:0;top:calc(50% - 9vh);z-index:7;display:flex;justify-content:center;pointer-events:none}
.bw-slam span{font-size:clamp(30px,4.6vw,64px);font-weight:900;letter-spacing:.02em;text-shadow:0 4px 30px rgba(0,0,0,.85);animation:bwslam 2.2s cubic-bezier(.2,.9,.2,1) both;white-space:nowrap}
@keyframes bwslam{0%{opacity:0;transform:scale(1.9);filter:blur(14px)}9%{opacity:1;transform:scale(.97);filter:none}14%{transform:scale(1)}78%{opacity:1}100%{opacity:0;transform:scale(1)}}
.bw-scan{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 34px);transform:translateX(-50%);z-index:6;font-size:12px;letter-spacing:.14em;color:rgba(244,242,236,.75);animation:bwblink 1.2s ease-in-out infinite alternate}
@keyframes bwblink{from{opacity:.4}to{opacity:1}}
.bw-gname{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 12vh);z-index:7;text-align:center;font-size:clamp(26px,3.6vw,48px);font-weight:900;text-shadow:0 4px 30px rgba(0,0,0,.85);pointer-events:none;animation:bwf .8s 1.6s ease both}
.bw-dg{position:absolute;inset:0;z-index:20;background:#000;animation:bwf .5s ease both}
.bw-dg video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:transparent}
.bw-dg video.bg{display:none;object-fit:cover;filter:blur(28px) brightness(.45);transform:scale(1.15)}
.bw-dg .cap{position:absolute;left:max(24px,5vw);right:24px;bottom:calc(env(safe-area-inset-bottom,0px) + 40px);animation:bwf .6s ease both;text-shadow:0 2px 20px rgba(0,0,0,.8)}
.bw-dg .cap .bar{position:fixed;left:max(20px,4vw);right:max(70px,8vw);top:calc(env(safe-area-inset-top,0px) + 22px);display:flex;gap:4px}
.bw-dg .cap .bar i{flex:1;height:2px;background:rgba(244,242,236,.2);border-radius:2px}.bw-dg .cap .bar i.done{background:#f4f2ec}.bw-dg .cap .bar i.now{background:#f7ff3c}
.bw-dg .cap .nm{position:fixed;left:max(20px,4vw);top:calc(env(safe-area-inset-top,0px) + 36px);font-size:12px;font-weight:900;letter-spacing:.1em;color:rgba(244,242,236,.8)}
.bw-dg .k{font-size:11px;font-weight:900;letter-spacing:.22em;color:#f7ff3c}
.bw-dg h3{margin:8px 0 0;font-size:clamp(28px,4.4vw,60px);font-weight:900;line-height:1.15;border-left:4px solid var(--c);padding-left:14px}
.bw-dg .cap p{margin:10px 0 0;font-size:13px;color:rgba(244,242,236,.75)}
.bw-dg .skip{position:absolute;right:max(16px,env(safe-area-inset-right,0px));top:calc(env(safe-area-inset-top,0px) + 12px);width:40px;height:40px;border-radius:50%;border:1px solid rgba(244,242,236,.25);background:rgba(0,0,0,.4);color:#f4f2ec;font-size:16px;cursor:pointer}
.bw-dg .end{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100% - 40px));text-align:left}
.bw-dg .end h3{border:0;padding:0;font-size:clamp(28px,3.6vw,44px)}.bw-dg .end p{font-size:13px;line-height:1.8;color:rgba(244,242,236,.75)}
.bw-dg .sh{display:flex;gap:8px;margin-top:18px}.bw-dg .sh a,.bw-dg .sh button{font-family:inherit;font-size:13px;font-weight:700;color:#f4f2ec;text-decoration:none;background:rgba(244,242,236,.08);border:1px solid rgba(244,242,236,.2);border-radius:999px;padding:10px 16px;cursor:pointer}
.bw-dg .row{display:flex;gap:8px;margin-top:14px}.bw-dg .x{font-family:inherit;font-size:12px;font-weight:700;color:#f4f2ec;background:transparent;border:1px solid rgba(244,242,236,.25);border-radius:999px;padding:10px 14px;cursor:pointer}
.bw-toast{position:absolute;left:50%;bottom:90px;transform:translateX(-50%);z-index:30;background:#f4f2ec;color:#0a0a0a;font-size:12px;font-weight:700;padding:9px 14px;border-radius:999px}
@media (max-width:700px){
  .bw-stat{display:none}
  .bw-intro{left:16px;right:16px;width:auto;top:calc(env(safe-area-inset-top,0px) + 54px)}.bw-intro .l{font-size:20px;margin-bottom:12px;white-space:normal}
  .bw-watch{width:calc(100% - 20px);bottom:calc(env(safe-area-inset-bottom,0px) + 10px);padding:12px 14px;border-radius:16px}
  .bw-watch .heats{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-left:-14px;margin-right:-14px;padding:0 14px}.bw-watch .heats::-webkit-scrollbar{display:none}.bw-watch .heats button{flex:none;font-size:12px}
  .bw-watch .grp{flex-direction:column;align-items:stretch;gap:10px}.bw-watch .g b{font-size:15px}
  .bw-t.ht span{font-size:11.5px}.bw-t.lobe{font-size:10px}
  .bw-slam{top:calc(env(safe-area-inset-top,0px) + 22vh)}.bw-slam span{font-size:26px;white-space:normal;text-align:center;padding:0 20px}
  .bw-pop{top:calc(env(safe-area-inset-top,0px) + 30vh)}
  .bw-dg video.bg{display:block}
}
`;

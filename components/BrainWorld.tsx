"use client";
// 競技を越えて、同じ熱が集まる（/lab/brain）。2026-10-19 のユーザー判定で組み直した流れ:
//   開く: 表面に77本の映像が並び、手前の数本が動き、内側を色の線が走る（拡散MRIのトラクトグラフィーの表現）。一行と「熱狂を探す」の入力欄。
//   映像を観る: 映像に触れると寄って、その1本が音つきで流れる。流れ出してすぐ、光の帯が映像を読み、映像の小片が剥がれて熱の言葉に変わる（時刻の目盛りは出さない）。
//   熱を選ぶ: 本物のコマを通ってその時刻へ走り（コマ飛び→一瞬のジャギーと光）、その場面が流れて言葉が打ち込まれる。
//   熱狂接続中: 場面のあと、カメラが引いて全体が映り、全体が鼓動し、選んだ熱から照合の波が広がる。繋がった熱への線だけが残って光る。
//   旅（＝ダイジェスト）: 線をたどって1本ずつ飛び、着いた映像が音つきで流れ、似た熱の名前がバッと出る。最後に引いた全体図と「この熱狂グループをシェア」。
//   「熱狂を探す」: 打った言葉が中心の光になり、同じく接続→旅→全体図。
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
  | { k: "watch"; m: number; ready: boolean }
  | { k: "scrub"; m: number; c: number }
  | { k: "trip"; seed: number; q?: string; items: Item[]; i: number; mv?: boolean }
  | { k: "search"; q: string }
  | { k: "map"; seed: number; q?: string; items: Item[] };
type Shared = { n: string; s?: number; q?: string; i: number[] };

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

type Api = { watch: (m: number) => void; heat: (c: number) => void; search: (q: string) => void; back: () => void; next: () => void; skip: () => void; replay: () => void };

export default function BrainWorld({ media, shared }: { media: MediaMap; shared?: Shared }) {
  const host = useRef<HTMLDivElement>(null), txRef = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const hooks = useRef<{ slam?: (c: number) => void; view?: (v: View) => void; name?: (n: string) => void }>({});
  const [net, setNet] = useState<Net | null>(null);
  const [view, setView] = useState<View>({ k: "free" });
  const [q, setQ] = useState("");
  const [slam, setSlam] = useState<{ c: number; key: number } | null>(null);
  const [gname, setGname] = useState("");
  const [share, setShare] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const el = host.current!, tx = txRef.current!; let alive = true;
    const portrait = () => innerHeight > innerWidth;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent), vx = safari ? "mp4" : "webm";
    const R = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); let dpr = Math.min(devicePixelRatio, 1.5); R.setPixelRatio(dpr); R.setClearColor(0x020306, 1);
    el.appendChild(R.domElement); R.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.3, 3000);
    // 線（7,564本）は描画の大半を占める（確認環境で約9割）ので、別の場面に置いて低い解像度の板に描き、それを画面に足す
    const fibScene = new THREE.Scene();
    const fibType = R.capabilities.isWebGL2 && (R.extensions.has("EXT_color_buffer_float") || R.extensions.has("EXT_color_buffer_half_float")) ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const fibRT = new THREE.WebGLRenderTarget(4, 4, { type: fibType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    { const cm = new THREE.ShaderMaterial({ uniforms: { tFib: { value: fibRT.texture } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }`,
        fragmentShader: `precision highp float; uniform sampler2D tFib; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tFib, vUv).rgb, 1.); }` });
      const comp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cm); comp.frustumCulled = false; comp.renderOrder = 0; scene.add(comp); }
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), tmp = V();
    let N: Net;
    let st: View = { k: "free" }, now = 0, intro = 0, sweepT = -10, mixT = 1;
    const cam0 = { yaw: 0.55, pitch: 0.22, dist: 330 }, camG = { ...cam0 }, tgtC = V(), tgtG = V(); let roll = 0, rollG = 0;
    let idle = true; const view = { x: -0.1, y: 0 }, par = { x: 0, y: 0 }, parC = { x: 0, y: 0 };
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
    const FS = 16; // 1本を何区間で描くか（30 から下げた: 頂点 45万→24万）
    let fiberGeo: THREE.BufferGeometry, fiberMat: THREE.ShaderMaterial, sel: Uint8Array, paths: THREE.Vector3[][] = [], linksOf: number[][] = [];
    // 読み込みで画面を止めないよう、少しずつ（1回 900 本）作る。作り終えた分から見える
    async function buildFibers() {
      const L = N.links, nL = L.length, pos = new Float32Array(nL * FS * 6), col = new Uint8Array(nL * FS * 6), sv = new Uint8Array(nL * FS * 2), al = new Uint8Array(nL * FS * 2);
      sel = new Uint8Array(nL * FS * 2 * 3); for (let i = 0; i < nL * FS * 2; i++) { sel[i * 3] = 1; sel[i * 3 + 1] = 1; }
      const cnt = new Array(8).fill(0); L.forEach((l) => cnt[l[3]]++);
      linksOf = N.ctx.map(() => []); paths = new Array(nL);
      const c3 = DIMC.map((h) => new THREE.Color(h));
      fiberGeo = new THREE.BufferGeometry();
      fiberGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); fiberGeo.setAttribute("col", new THREE.BufferAttribute(col, 3, true)); fiberGeo.setAttribute("s", new THREE.BufferAttribute(sv, 1, true));
      fiberGeo.setAttribute("al", new THREE.BufferAttribute(al, 1, true)); fiberGeo.setAttribute("sel", new THREE.BufferAttribute(sel, 3)); fiberGeo.setDrawRange(0, 0);
      for (let n0 = 0; n0 < nL; n0 += 900) { if (!alive) return;
      L.slice(n0, n0 + 900).forEach((l, kk) => { const n = n0 + kk; const [a, b, sc, d] = l; linksOf[a].push(n); linksOf[b].push(n);
        const A = EP[a], B = EP[b]; const ta = closestT(d, A); let dt = closestT(d, B) - ta; if (dt > Math.PI) dt -= Math.PI * 2; if (dt < -Math.PI) dt += Math.PI * 2;
        const k = Math.max(2, Math.ceil(Math.abs(dt) / 0.32)), cp: THREE.Vector3[] = [A, A.clone().lerp(loopPt(d, ta), 0.42)];
        for (let i = 0; i <= k; i++) cp.push(loopPt(d, ta + (dt * i) / k)); cp.push(B.clone().lerp(loopPt(d, ta + dt), 0.42), B);
        const beta = 0.9, m = cp.length; cp.forEach((p, i) => p.lerp(A.clone().lerp(B, i / (m - 1)), 1 - beta));
        const pts = new THREE.CatmullRomCurve3(cp, false, "centripetal").getPoints(FS);
        const o = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(1.2 + rnd() * rnd() * 7);
        for (let i = 0; i <= FS; i++) { const s = i / FS, tg = pts[Math.min(FS, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize(); pts[i].add(o.clone().addScaledVector(tg, -o.dot(tg)).multiplyScalar(Math.pow(Math.sin(Math.PI * s), 0.6))); }
        paths[n] = pts;
        const base = Math.min(0.55, 0.23 * Math.sqrt(900 / cnt[d])) * (0.6 + (sc - 0.43) * 0.45), cc = c3[d], q = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
        for (let i = 0; i < FS; i++) { const p0 = pts[i], p1 = pts[i + 1], o6 = (n * FS + i) * 6, o2 = (n * FS + i) * 2;
          pos.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z], o6);
          const tg = p1.clone().sub(p0).normalize(); const r = q(cc.r * 0.78 + Math.abs(tg.x) * 0.22), g = q(cc.g * 0.78 + Math.abs(tg.y) * 0.22), bb = q(cc.b * 0.78 + Math.abs(tg.z) * 0.22);
          col.set([r, g, bb, r, g, bb], o6); sv[o2] = q(i / FS); sv[o2 + 1] = q((i + 1) / FS); al[o2] = al[o2 + 1] = q(base); } });
      fiberGeo.setDrawRange(0, Math.min(nL, n0 + 900) * FS * 2); (["position", "col", "s", "al"] as const).forEach((a) => (fiberGeo.attributes[a].needsUpdate = true));
      if (!fiberMat) { fiberMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
        uniforms: { uMix: { value: 1 }, uIntro: { value: 0 }, uSweep: { value: 10 }, uNear: { value: 200 }, uDen: { value: 1 }, uWave: { value: new THREE.Vector4(0, 0, 0, -999) }, uWaveA: { value: 0 }, uBeat: { value: 0 }, uLift: { value: 0 } },
        vertexShader: `attribute vec3 col, sel; attribute float s, al; uniform float uMix, uIntro, uSweep, uNear, uDen, uWaveA, uBeat, uLift; uniform vec4 uWave; varying vec3 vC; varying float vA;
          float lv(float x){ return x < .5 ? .2 : x < 1.5 ? 1. : 4.2; }
          void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); float z = -mv.z;
            float selA = sel.x, selB = sel.y, dir = sel.z; float lvl = mix(lv(selA), lv(selB), uMix);
            float along = dir > .5 ? 1. - s : s; float hot = selB > 1.5 ? smoothstep(uSweep - .12, uSweep, along) : 0.; lvl = mix(lvl, max(lv(selA), .07), hot);
            // 接続中: 選んだ熱から照合の波が広がり、全体が鼓動する
            float wv = smoothstep(18., 0., abs(length(position - uWave.xyz) - uWave.w)) * uWaveA; lvl = max(lvl, uLift) * (1. + uBeat * .9) + wv * 2.6; // uLift: 旅で飛んでいる間は、沈めた線も見えるところまで上げる（線の中を通っていく）
            float e = min(s, 1. - s) * 2.; float grow = smoothstep(e - .05, e + .05, uIntro * 1.15);
            float near = smoothstep(uNear + 120., uNear - 90., z); vA = uDen * al * lvl * grow * mix(.14, 1.35, near) * smoothstep(1., 14., z);
            vC = mix(vec3(.22, .3, .52) * (col.r + col.g + col.b) * .5, col, .35 + .65 * near); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `precision highp float; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC * vA, vA); }` });
        const ls = new THREE.LineSegments(fiberGeo, fiberMat); ls.frustumCulled = false; fibScene.add(ls); }
      await new Promise((r) => setTimeout(r, 0)); }
      const order = L.map((_, n) => n).sort((a, b) => L[b][2] - L[a][2]).slice(0, Math.round(nL * 0.6)), idx = new Uint32Array(order.length * FS * 2);
      order.forEach((n, k) => { for (let i = 0; i < FS * 2; i++) idx[k * FS * 2 + i] = n * FS * 2 + i; });
      fiberGeo.setIndex(new THREE.BufferAttribute(idx, 1)); fiberGeo.setDrawRange(0, idx.length);
      fibersReady = true;
    }
    let fibersReady = false;
    // 線を作り終える前に押されても壊れないよう、作り終えたら今の状態で塗り直す
    function buildFibersSync() { buildFibers().then(() => { if (!alive) return; if (st.k === "free") paintFibers(() => 1); }); }
    // 線の明るさの状態（前の状態から 0.6 秒でなめらかに）。0=沈む 1=ふつう 2=選んだもの
    function paintFibers(fn: (n: number) => number, from?: (n: number) => boolean) {
      if (!fibersReady) return; const half = mixT >= 0.5, L = N.links;
      for (let n = 0; n < L.length; n++) { const v = fn(n), dr = from && from(n) ? 1 : 0; for (let i = 0; i < FS * 2; i++) { const o = (n * FS * 2 + i) * 3; sel[o] = half ? sel[o + 1] : sel[o]; sel[o + 1] = v; sel[o + 2] = dr; } }
      fiberGeo.attributes.sel.needsUpdate = true; mixT = 0; sweepT = now; }
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
      const g = new THREE.SphereGeometry(1, 72, 54); g.scale(RX * 0.99, RY * 0.99, RZ * 0.99);
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, uniforms: { uOp: { value: 0 } },
        vertexShader: `varying vec3 vN, vV, vP; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `precision highp float; varying vec3 vN, vV, vP; uniform float uOp;
          void main(){ float f = pow(1. - abs(dot(vN, vV)), 2.6); float sl = smoothstep(.85, 1., abs(fract(vP.z / 9.) - .5) * 2.) * .5 + smoothstep(.9, 1., abs(fract(vP.y / 9.) - .5) * 2.) * .25;
            vec3 c = vec3(.55, .66, .8) * (f * .22 + sl * f * .35); gl_FragColor = vec4(c * uOp, 0.); }` });
      fibScene.add(new THREE.Mesh(g, m)); return m;
    }

    // ===== 表面の映像（カメラを向く板）。観ている1本は、コマ飛び・ジャギー・光で時刻を走る =====
    type Tile = { m: number; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; scale: number; goal: number; dim: number; dimG: number; lift: number; liftG: number; vid: number; pos: THREE.Vector3;
      anim: null | { pts: THREE.Vector3[]; t0: number; dur: number; to: number; back: boolean } };
    let tiles: Tile[] = [];
    const TILE_V = `uniform float uS, uBill; varying vec2 vUv; void main(){ vUv = uv; vec4 c = modelViewMatrix * vec4(0.,0.,0.,1.); vec4 bill = c + vec4(position.xy * uS, 0., 0.); vec4 wor = modelViewMatrix * vec4(position * uS, 1.); gl_Position = projectionMatrix * mix(wor, bill, uBill); }`;
    const TILE_F = `precision highp float; varying vec2 vUv; uniform sampler2D uAt, uVid; uniform vec4 uRect; uniform float uUseVid, uDim, uFace, uHi, uOp, uGl, uFl, uT, uScan; uniform vec3 uRim;
      vec3 tex(vec2 p){ p = clamp(p, .001, .999); return mix(texture2D(uAt, uRect.xy + p * uRect.zw).rgb, texture2D(uVid, p).rgb, uUseVid); }
      float h(float x){ return fract(sin(x) * 43758.5453); }
      void main(){ vec2 q = abs(vUv - .5) * vec2(16., 9.); vec2 b = vec2(8., 4.5) - .45; float d = length(max(q - b, 0.)) - .45; float a = (1. - smoothstep(-.05, .05, d)) * uOp; if (a < .003) discard;
        vec2 uv = vUv; if (!gl_FrontFacing) uv.x = 1. - uv.x; vec3 c;
        if (uGl > .001) {
          // 時刻を走るあいだ: 横に裂け、ブロックに崩れ、色がずれる
          float row = floor(uv.y * 34.), tt = floor(uT * 24.); float tear = step(1. - uGl * .55, h(row * 7.13 + tt)); uv.x += (h(row * 3.7 + tt) - .5) * .22 * tear * uGl;
          float bl = mix(160., 18., uGl); vec2 px = vec2(bl * 16. / 9., bl); uv = mix(uv, (floor(uv * px) + .5) / px, step(.35, uGl));
          float sh = .018 * uGl; c = vec3(tex(uv + vec2(sh, 0.)).r, tex(uv).g, tex(uv - vec2(sh, 0.)).b);
          c *= .85 + .3 * h(row + tt); }
        else c = tex(uv);
        c = mix(c, vec3(1.), uFl);
        // 抜き取り: 光の帯が上から下へ映像を読み、読んだところに細かい格子が残る
        if (uScan >= 0.) { float y = 1. - uScan, band = smoothstep(.05, 0., abs(vUv.y - y)), done = step(y, vUv.y) * (1. - uScan * .7);
          float g = max(step(.94, fract(vUv.x * 64.)), step(.9, fract(vUv.y * 36.))); c += vec3(.75, .95, 1.) * band * .9 + vec3(.6, .85, 1.) * g * done * .12; }
        if (!gl_FrontFacing) c *= .3;
        float rim = smoothstep(.3, 0., abs(d + .18)); c = c * (uDim * (.45 + .55 * uFace)) + uRim * rim * (.22 + uHi * .9);
        gl_FragColor = vec4(c * a, a); }`;
    let rootGeo: THREE.BufferGeometry, rootA: Float32Array, nodeGeo: THREE.BufferGeometry, nodeA: Float32Array, nodeS: Float32Array;
    const intros: { value: number }[] = [];
    function buildCortex(atl: THREE.Texture[]) {
      const geo = new THREE.PlaneGeometry(1, 9 / 16), blank = new THREE.Texture();
      tiles = N.moments.map((mo, m) => { const id = mo.ctx[0], s = Math.floor(id / 256), k = id % 256;
        const mat = new THREE.ShaderMaterial({ vertexShader: TILE_V, fragmentShader: TILE_F, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
          uniforms: { uAt: { value: atl[s] || blank }, uVid: { value: blank }, uRect: { value: new THREE.Vector4((k % 16) / 16, 1 - (Math.floor(k / 16) + 1) / 16, 1 / 16, 1 / 16) }, uUseVid: { value: 0 }, uDim: { value: 1 }, uFace: { value: 1 }, uHi: { value: 0 }, uOp: { value: 0 }, uS: { value: 16 }, uBill: { value: 0 }, uRim: { value: new THREE.Color("#f4f2ec") }, uGl: { value: 0 }, uFl: { value: 0 }, uT: { value: 0 }, uScan: { value: -1 } } });
        const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(MP[m].tile); mesh.lookAt(MP[m].tile.clone().add(MP[m].n)); mesh.frustumCulled = false; scene.add(mesh);
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

    // 糸: 観ている映像から、抜き取った熱の言葉へ（分解が目に見える）。色＝その熱の見方
    const stemPos = new Float32Array(16 * 6), stemCol = new Float32Array(16 * 6), stemGeo = new THREE.BufferGeometry();
    stemGeo.setAttribute("position", new THREE.BufferAttribute(stemPos, 3)); stemGeo.setAttribute("color", new THREE.BufferAttribute(stemCol, 3)); stemGeo.setDrawRange(0, 0);
    { const sm = new THREE.LineSegments(stemGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); sm.frustumCulled = false; sm.renderOrder = 6; scene.add(sm); }
    const c3all = DIMC.map((h) => new THREE.Color(h));
    function stems(list: { a: THREE.Vector3; b: THREE.Vector3; d: number; k: number }[]) { list.slice(0, 16).forEach((s, i) => { const c = c3all[s.d]; stemPos.set([s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z], i * 6); stemCol.set([c.r * s.k * 0.5, c.g * s.k * 0.5, c.b * s.k * 0.5, c.r * s.k, c.g * s.k, c.b * s.k], i * 6); });
      stemGeo.setDrawRange(0, Math.min(16, list.length) * 2); stemGeo.attributes.position.needsUpdate = true; stemGeo.attributes.color.needsUpdate = true; }
    // 言葉の光（「熱狂を探す」で打った言葉が中心に生まれる）
    const wordMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: R.getPixelRatio() }, uOp: { value: 0 }, uT: { value: 0 } },
      vertexShader: `uniform float uPx, uT; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = uPx * (2200. + 260. * sin(uT * 2.4)) / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `precision highp float; uniform float uOp; void main(){ float r = length(gl_PointCoord - .5) * 2.; float k = exp(-r * r * 9.) * 1.2 + smoothstep(.16, .08, r); gl_FragColor = vec4(vec3(1., .97, .82) * k * uOp, k * uOp); }` });
    const WORDP = V(0, 6, 0); { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([WORDP.x, WORDP.y, WORDP.z]), 3)); const p = new THREE.Points(g, wordMat); p.frustumCulled = false; p.renderOrder = 6; scene.add(p); }
    let wordOpG = 0;
    const wordPath = (id: number) => { const E = EP[id], n = normalAt(E); return new THREE.CatmullRomCurve3([WORDP.clone(), WORDP.clone().lerp(E, 0.35).add(V(Math.sin(id) * 7, Math.cos(id * 1.3) * 7, Math.sin(id * 0.7) * 7)), E.clone().addScaledVector(n, -20).lerp(E, 0.3), E.clone()], false, "centripetal").getPoints(FS); };

    // ===== 映像 =====
    type Slot = { v: HTMLVideoElement; tex: THREE.VideoTexture; tile: number; src: string };
    const mkV = (muted = true) => { const v = document.createElement("video"); v.crossOrigin = "anonymous"; v.muted = muted; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", ""); return v; };
    const slots: Slot[] = Array.from({ length: portrait() ? 6 : 8 }, () => { const v = mkV(); v.loop = true; const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; return { v, tex, tile: -1, src: "" }; });
    const clipOf = (id: number) => `${BASE}/ctx/c/${id}.${vx}`;
    function playOn(tile: number, src: string, sound = false) { const t = tiles[tile]; let s = slots.find((x) => x.tile === tile);
      if (!s) s = slots.find((x) => x.tile < 0) || slots[0];
      if (s.tile >= 0 && s.tile !== tile) stopOn(s.tile);
      s.tile = tile; t.vid = slots.indexOf(s); if (s.src !== src) { s.src = src; s.v.src = src; } else s.v.currentTime = 0;
      s.v.muted = !sound; s.v.play().catch(() => { s!.v.muted = true; s!.v.play().catch(() => {}); });
      const show = () => { if (s!.tile === tile && mainTile !== tile) t.mat.uniforms.uVid.value = s!.tex; }; if (s.v.readyState >= 2) show(); else s.v.onloadeddata = show; }
    function stopOn(tile: number) { const t = tiles[tile]; if (!t || t.vid < 0) return; const s = slots[t.vid]; if (s.tile === tile) { s.v.pause(); s.v.muted = true; s.tile = -1; } t.vid = -1; }
    const playing = new Set<number>();
    function setPlaying(list: { tile: number; src: string; sound?: boolean }[]) { const want = new Set(list.map((x) => x.tile)); playing.forEach((t) => { if (!want.has(t)) stopOn(t); }); playing.clear(); list.slice(0, slots.length).forEach((x) => { playing.add(x.tile); playOn(x.tile, x.src, x.sound); }); }
    // 観ている1本（元の映像。熱の時刻はこの映像の時刻）
    const mainV = mkV(false); const mainTex = new THREE.VideoTexture(mainV); mainTex.colorSpace = THREE.SRGBColorSpace; let mainTile = -1, mainOk = false;
    mainV.addEventListener("loadeddata", () => { mainOk = true; });
    let scrub: null | { from: number; to: number; t0: number; c: number; lastSeek: number } = null, flash = 0, glitch = 0;

    // ===== 段取り: 状態が変わるたびに番号を進め、古い予定は捨てる（戻った後に前の予定が走って崩れないように）=====
    let tok = 0; const queue: { at: number; fn: () => void; t: number }[] = [];
    const later = (sec: number, fn: () => void) => queue.push({ at: now + sec, fn, t: tok });
    const go = (v: View) => { tok++; queue.length = 0; rollG = 0; if (fly) { fly = null; syncCam(); } setV(v); };
    function runQueue() { for (let i = 0; i < queue.length; i++) { const q = queue[i]; if (q.t !== tok) { queue.splice(i--, 1); continue; } if (now >= q.at) { queue.splice(i--, 1); q.fn(); } } }

    // ===== 映像から熱を抜き取る（観始めてすぐ。映像の小片が剥がれて飛び、熱の言葉に変わる）=====
    const PATCH_F = `precision highp float; varying vec2 vUv; uniform sampler2D uVid, uAt; uniform vec4 uR, uRect; uniform float uUseVid, uOp, uGlow; uniform vec3 uC;
      void main(){ vec2 q = abs(vUv - .5) * 2.; float e = max(q.x, q.y); float a = (1. - smoothstep(.9, 1., e)) * uOp; if (a < .003) discard;
        vec2 p = uR.xy + vUv * uR.zw; vec3 c = mix(texture2D(uAt, uRect.xy + p * uRect.zw).rgb, texture2D(uVid, p).rgb, uUseVid);
        c = c * (1. + uGlow * .6) + uC * smoothstep(.72, .98, e) * (.5 + uGlow * 1.5);
        gl_FragColor = vec4(c * a, a); }`;
    const patches = Array.from({ length: 8 }, () => { const mat = new THREE.ShaderMaterial({ vertexShader: `uniform float uS; varying vec2 vUv; void main(){ vUv = uv; vec4 c = modelViewMatrix * vec4(0.,0.,0.,1.); c.xy += position.xy * uS; gl_Position = projectionMatrix * c; }`, fragmentShader: PATCH_F,
        transparent: true, depthTest: false, depthWrite: false, uniforms: { uVid: { value: mainTex }, uAt: { value: new THREE.Texture() }, uR: { value: new THREE.Vector4() }, uRect: { value: new THREE.Vector4() }, uUseVid: { value: 1 }, uOp: { value: 0 }, uGlow: { value: 0 }, uS: { value: 1 }, uC: { value: new THREE.Color() } } });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.frustumCulled = false; mesh.renderOrder = 1800; mesh.visible = false; scene.add(mesh); return { mesh, mat }; });
    // 位置は毎フレーム、いまのカメラの向きと板の大きさから決め直す（寄っている途中に始まっても、言葉が斜めにずれない）
    type Ext = { m: number; t0: number; ids: number[]; uv: [number, number][]; col: number[]; row: number[]; rows: number; side: ("l" | "r" | "c")[]; shown: boolean[]; from: THREE.Vector3[]; to: THREE.Vector3[] };
    let ext: Ext | null = null;
    function startExtract(m: number) { const ids = N.moments[m].ctx.slice(0, 8), n = ids.length, pr = portrait(), rows = Math.ceil(n / 2), t = tiles[m];
      ext = { m, t0: now, ids, uv: ids.map((_, j) => [0.18 + ((j * 0.37 + 0.11) % 1) * 0.64, 0.22 + ((j * 0.53 + 0.3) % 1) * 0.56]), col: ids.map((_, j) => j % 2), row: ids.map((_, j) => Math.floor(j / 2)), rows,
        side: ids.map((_, j) => (pr ? "c" : j % 2 ? "r" : "l")), shown: ids.map(() => false), from: ids.map(() => V()), to: ids.map(() => V()) };
      patches.forEach((p, j) => { p.mesh.visible = j < n; if (j >= n) return; const id = ids[j], [u, v] = ext!.uv[j];
        p.mat.uniforms.uR.value.set(u - 0.08, v - 0.142, 0.16, 0.284); p.mat.uniforms.uC.value.set(DIMC[N.ctx[id].w.indexOf(Math.max(...N.ctx[id].w))]);
        p.mat.uniforms.uUseVid.value = mainOk ? 1 : 0; p.mat.uniforms.uAt.value = t.mat.uniforms.uAt.value; p.mat.uniforms.uRect.value.copy(t.mat.uniforms.uRect.value as THREE.Vector4); }); }
    function updateExtract() { if (!ext) { patches.forEach((p) => (p.mesh.visible = false)); return; }
      const e = ext, pr = portrait(), S = tiles[e.m].scale, C = MP[e.m].tile, right = V(1, 0, 0).applyQuaternion(cam.quaternion), up = V(0, 1, 0).applyQuaternion(cam.quaternion), toCam = cam.getWorldDirection(V()).negate();
      let lines: { a: THREE.Vector3; b: THREE.Vector3; d: number; k: number }[] = [];
      e.ids.forEach((id, j) => { const [u, v] = e.uv[j], sg = e.col[j] ? 1 : -1;
        e.from[j].copy(C).addScaledVector(right, (u - 0.5) * S).addScaledVector(up, (v - 0.5) * S * 9 / 16);
        if (pr) e.to[j].copy(C).addScaledVector(right, sg * S * 0.25).addScaledVector(up, -(S * 9 / 32 + 4.5 + e.row[j] * 6));
        else e.to[j].copy(C).addScaledVector(right, sg * (S / 2 + 4)).addScaledVector(up, ((e.rows - 1) / 2 - e.row[j]) * (S * 9 / 16) / Math.max(e.rows - 1, 1) * 0.92);
        const p = patches[j], t = (now - e.t0 - 0.35 - j * 0.16) / 1.0, uu = p.mat.uniforms, d = N.ctx[id].w.indexOf(Math.max(...N.ctx[id].w));
        if (t < 0) { uu.uOp.value = 0; return; }
        const k = Math.min(1, t), ek = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, lift = Math.min(1, t / 0.25);
        const a = e.from[j], b = e.to[j], mid = a.clone().lerp(b, 0.5).addScaledVector(up, 6).addScaledVector(toCam, 8), s = 1 - ek;
        const pos = a.clone().multiplyScalar(s * s).add(mid.multiplyScalar(2 * s * ek)).add(b.clone().multiplyScalar(ek * ek));
        p.mesh.position.copy(pos); const fade = t > 1 ? Math.max(0, 1 - (t - 1) * 3) : 1;
        uu.uS.value = S * 0.16 * (t < 0.25 ? 0.4 + lift * 0.9 : 1.3 - ek * 1.1) * fade; uu.uOp.value = t > 1 ? fade : lift; uu.uGlow.value = 1 - ek * 0.6;
        if (t > 0.92) e.shown[j] = true;
        lines.push({ a: e.from[j], b: t > 1 ? b : pos, d, k: Math.min(1, t * 1.5) * (st.k === "watch" ? 0.9 : 0.4) }); });
      if (st.k !== "watch" && st.k !== "scrub") lines = []; stems(lines);
      if (now - e.t0 > 0.35 + e.ids.length * 0.16 + 1.4 && st.k === "watch" && !st.ready) setV({ ...st, ready: true }); }

    // ===== 動き =====
    const other = (n: number, c: number) => (N.links[n][0] === c ? N.links[n][1] : N.links[n][0]);
    const ids2items = (c: number, js: number[]) => js.map((j) => { let d = -1, best = -1; linksOf[c]?.forEach((n) => { if (other(n, c) === j && N.links[n][2] > best) { best = N.links[n][2]; d = N.links[n][3]; } }); return { id: j, d: d < 0 ? N.ctx[j].w.indexOf(Math.max(...N.ctx[j].w)) : d }; });
    // 見方を合わせた近さで、別の瞬間から6つ（同じ競技が続かないように少し散らす）
    function nearHeats(c: number) {
      const best = new Map<string, { j: number; n: number; s: number }>();
      linksOf[c].forEach((n) => { const j = other(n, c), no = N.ctx[j].no, sc = N.links[n][2]; if (no === N.ctx[c].no) return; const cur = best.get(no); if (!cur || sc > cur.s) best.set(no, { j, n, s: sc }); });
      const cand = Array.from(best.values()), out: { j: number; n: number; s: number }[] = [], cnt: Record<string, number> = {}, sp0 = N.moments[momOf[c]].sport;
      while (out.length < 6 && cand.length) { let bi = 0, bv = -1e9; cand.forEach((x, i) => { const sp = N.moments[momOf[x.j]].sport, v = x.s - (sp === sp0 ? 0.25 : 0) - 0.15 * (cnt[sp] || 0); if (v > bv) { bv = v; bi = i; } });
        const x = cand.splice(bi, 1)[0]; out.push(x); const sp = N.moments[momOf[x.j]].sport; cnt[sp] = (cnt[sp] || 0) + 1; }
      return out;
    }
    const linkOf = (c: number, j: number) => { let best = -1, bn = -1; linksOf[c]?.forEach((n) => { if (other(n, c) === j && N.links[n][2] > best) { best = N.links[n][2]; bn = n; } }); return bn; };
    const pathTo = (seed: number, it: Item) => { if (seed < 0) return wordPath(it.id); const n = linkOf(seed, it.id); return n >= 0 ? pathFrom(n, seed) : wordPath(it.id); };
    function reset() { setFat([]); wordOpG = 0; ext = null; beatG = 0; waveA = 0; stems([]); tiles.forEach((t) => { t.liftG = 0; t.goal = 16; t.dimG = 1; (t.mat.uniforms.uRim.value as THREE.Color).set("#f4f2ec"); t.mat.uniforms.uHi.value = 0; }); }
    function releaseMain() { const t = tiles[mainTile]; if (t) { t.mat.uniforms.uUseVid.value = 0; t.mat.uniforms.uVid.value = new THREE.Texture(); } mainV.pause(); mainTile = -1; mainOk = false; scrub = null; }
    function free() { go({ k: "free" }); if (mainTile >= 0) releaseMain(); reset(); paintFibers(() => 1); setNodes(() => [0.7, 1]); setRoots(() => 0.35); setPlaying([]); liveAt = 0;
      camG.dist = portrait() ? 470 : 235; tgtG.set(0, 0, 0); }
    // 観る: その1本に寄り、元の映像を音つきで流す。寄りきったところで熱を抜き取る
    function watch(m: number, then?: () => void) {
      go({ k: "watch", m, ready: false }); reset(); setPlaying([]);
      if (mainTile !== m) { if (mainTile >= 0) releaseMain(); mainTile = m; mainOk = false; const md = media[N.moments[m].no];
        mainV.src = md?.detail || md?.[safari ? "loop" : "webm"] || ""; mainV.currentTime = 0; mainV.loop = true; mainV.muted = false; mainV.play().catch(() => { mainV.muted = true; mainV.play().catch(() => {}); });
        tiles[m].mat.uniforms.uVid.value = mainTex; }
      else { try { mainV.currentTime = 0; } catch { /* */ } mainV.muted = false; mainV.play().catch(() => {}); }
      const ids = new Set(N.moments[m].ctx);
      paintFibers((n) => (ids.has(N.links[n][0]) || ids.has(N.links[n][1]) ? 1 : 0)); setNodes((i) => (ids.has(i) ? [1.3, 2] : [0.1, 0.7])); setRoots((i) => (ids.has(i) ? 1 : 0.04));
      tiles.forEach((t) => { t.dimG = t.m === m ? 1 : 0.3; t.goal = t.m === m ? 30 : 16; });
      frameTile(m);
      const waitReady = () => { if (mainOk || now - t0w > 2.5) { startExtract(m); if (then) later(1.0, then); } else later(0.15, waitReady); }; const t0w = now; later(reduce ? 0.3 : 1.1, waitReady); }
    const fov0 = () => (portrait() ? 60 : 50); // 飛んでいる間は画角が広がるので、距離はいつも基準の画角で決める
    function frameTile(m: number) { const n = MP[m].n, S = 30, f = portrait() ? 0.94 : 0.5, tn = Math.tan((fov0() * Math.PI) / 360);
      camG.yaw = Math.atan2(n.x, n.z); camG.pitch = Math.max(-1, Math.min(1, Math.asin(n.y))); camG.dist = S / (f * 2 * tn * (portrait() ? innerWidth / innerHeight : Math.min(1.9, innerWidth / innerHeight))); tgtG.copy(MP[m].tile); }
    // 熱を選ぶ: 本物のコマを通ってその時刻へ → 光 → その場面を流す → 引いて全体が鼓動し「熱狂接続中」→ 繋がった熱が光る → 旅
    function heat(c: number) { const m = momOf[c];
      if (mainTile !== m || (st.k !== "watch" && st.k !== "scrub")) { watch(m, () => heat(c)); return; }
      if (st.k === "watch" && !st.ready && ext) ext.shown = ext.shown.map(() => true);
      go({ k: "scrub", m, c }); tiles.forEach((t) => { t.dimG = t.m === m ? 1 : 0.3; t.goal = t.m === m ? 30 : 16; }); frameTile(m);
      mainV.pause(); scrub = { from: mainV.currentTime, to: Math.max(0, N.ctx[c].t - 1.2), t0: now, c, lastSeek: 0 }; }
    function afterScrub(c: number) { flash = 1; glitch = 0.6; hooks.current.slam?.(c); later(reduce ? 0.5 : 3.0, () => connect(c)); }
    // 熱狂接続中: カメラが引いて全体が映り、心臓のように鼓動する。選んだ熱から照合の波が全体へ広がる
    let beatAmp = 0, beatG = 0, waveA = 0, waveR = 0, waveC = V();
    function connect(seed: number, q?: string, given?: Item[], nm?: string) {
      if (!fibersReady) { later(0.2, () => connect(seed, q, given, nm)); return; }
      const items: Item[] = given || (seed >= 0 ? nearHeats(seed).map((x) => ({ id: x.j, d: N.links[x.n][3] })) : []);
      go({ k: "trip", seed, q, items, i: -2 }); ext = null; stems([]);
      if (mainTile >= 0) { mainV.muted = true; }
      tiles.forEach((t) => { t.dimG = 1; t.goal = 16; t.liftG = 0; });
      const from = seed >= 0 ? MP[momOf[seed]].tile : WORDP, dir = from.clone().normalize();
      camG.yaw = Math.atan2(dir.x, dir.z) + 0.35; camG.pitch = 0.32; camG.dist = portrait() ? 460 : 270; tgtG.set(0, 0, 0);
      paintFibers(() => 1); beatG = 1; waveC.copy(seed >= 0 ? EP[seed] : WORDP); waveR = 0; waveA = 1;
      grp++; if (nm) setName(nm); else { setName(""); if (seed >= 0) nameGroup({ seed, ids: [seed, ...items.map((x) => x.id)] }); }
      // 繋がる: 照合の波が一周したところで、行き先の線だけが選んだ熱から伸びる
      later(reduce ? 0.6 : 2.6, () => { const pj = new Set(items.map((x) => x.id)), pn = new Set(items.map((x) => (seed >= 0 ? linkOf(seed, x.id) : -1)));
        paintFibers((n) => (pn.has(n) ? 2 : 0), (n) => N.links[n][1] === seed); setFat(items.map((it) => ({ pts: pathTo(seed, it), d: it.d })), 1.2);
        setNodes((i) => (i === seed ? [1.6, 3.2] : pj.has(i) ? [1.4, 2.6] : [0.08, 0.7])); setRoots((i) => (i === seed || pj.has(i) ? 1 : 0.03));
        tiles.forEach((t) => { const it = items.find((x) => momOf[x.id] === t.m); t.dimG = it || (seed >= 0 && t.m === momOf[seed]) ? 1.1 : 0.22; (t.mat.uniforms.uRim.value as THREE.Color).set(it ? DIMC[it.d] : "#f4f2ec"); t.mat.uniforms.uHi.value = it ? 0.9 : 0; });
        if (st.k === "trip") setV({ ...st, i: -1 }); waveA = 0;
        later(reduce ? 0.6 : 1.9, () => hop(0)); }); }
    // 旅: 線をたどって1本ずつ。着くとその映像が大きく流れ、似た熱の名前がバッと出る
    let fly: null | { pts: THREE.Vector3[]; t0: number; dur: number; look: THREE.Vector3; done: () => void } = null;
    function hop(i: number) { if (st.k !== "trip") return; const s = st, it = s.items[i]; if (!it) { toMap(); return; }
      beatG = 0; mainV.pause(); setV({ ...s, mv: true }); const m = momOf[it.id], t = tiles[m], S = 30, f = portrait() ? 0.94 : 0.56, tn = Math.tan((fov0() * Math.PI) / 360), dist = S / (f * 2 * tn * (portrait() ? innerWidth / innerHeight : Math.min(1.9, innerWidth / innerHeight)));
      // 線の中を通って、行き先の手前で表へ抜け、横から回り込んで正面へ（板を突き抜けない・外の暗がりを向かない）
      const P = pathTo(s.seed, it), inner = P.slice(Math.floor(P.length * (i === 0 ? 0.15 : 0.4)), Math.floor(P.length * 0.75) + 1).filter((_, k) => k % 2 === 0);
      const T = MP[m].tile, nn = MP[m].n, side = cam.position.clone().sub(T); side.addScaledVector(nn, -side.dot(nn)); if (side.lengthSq() < 1) side.copy(nn).cross(V(0, 1, 0)); side.normalize();
      const end = T.clone().addScaledVector(nn, dist), exit = T.clone().addScaledVector(nn, dist * 0.45).addScaledVector(side, dist * 0.6);
      const pts = new THREE.CatmullRomCurve3([cam.position.clone(), ...inner, exit, end], false, "centripetal").getPoints(160);
      setPlaying([]); t.goal = S; t.liftG = 0; t.dimG = 1.15;
      fly = { pts, t0: now, dur: reduce ? 0.8 : i === 0 ? 2.1 : 1.7, look: MP[m].tile.clone(), done: () => { setV({ ...s, i, mv: false }); playOn(m, clipOf(it.id), true);
        camG.yaw = Math.atan2(MP[m].n.x, MP[m].n.z); camG.pitch = Math.max(-1, Math.min(1, Math.asin(MP[m].n.y))); camG.dist = dist; tgtG.copy(MP[m].tile); syncCam();
        later(reduce ? 2 : 4.2, () => { t.goal = 16; t.dimG = 1.1; hop(i + 1); }); } }; }
    // 飛んだ後・途中で止めた後に、今のカメラの位置と向きから回る動きへ戻す（跳ばないように）
    function syncCam() { const fwd = cam.getWorldDirection(V()), d = Math.max(40, cam.position.distanceTo(tgtG)); tgtC.copy(cam.position).addScaledVector(fwd, d); const o = cam.position.clone().sub(tgtC);
      cam0.dist = d; cam0.yaw = Math.atan2(o.x, o.z); cam0.pitch = Math.asin(Math.max(-1, Math.min(1, o.y / d))); }
    // 全体図: 引いて、集めた熱の映像が浮かび、線で結ばれた形を見せる → シェア
    function toMap() { if (st.k !== "trip") return; const s = st; go({ k: "map", seed: s.seed, q: s.q, items: s.items }); setPlaying([]);
      const ms = [...(s.seed >= 0 ? [momOf[s.seed]] : []), ...s.items.map((x) => momOf[x.id])];
      tiles.forEach((t) => { const it = s.items.find((x) => momOf[x.id] === t.m); const isSeed = s.seed >= 0 && t.m === momOf[s.seed]; t.goal = it ? 22 : isSeed ? 24 : 15; t.liftG = it || isSeed ? 1 : 0; t.dimG = it || ms.includes(t.m) ? 1.05 : 0.18; });
      setFat(s.items.map((it) => ({ pts: pathTo(s.seed, it), d: it.d })), 0.8); wordOpG = s.seed < 0 ? 1 : 0;
      later(0.5, () => setPlaying(s.items.map((x) => ({ tile: momOf[x.id], src: clipOf(x.id) }))));
      frameGroup(ms); }
    // 全体図の画角: 集まった熱の並びのいちばん長い向きを、画面の長い向きに合わせる（縦の画面では傾けて縦に流す）。板と文字は画面に対して立ったまま
    function frameGroup(ms: number[]) { const ps = ms.map((m) => MP[m].tile.clone().addScaledVector(MP[m].n, 8)); const c = V(); ps.forEach((p) => c.add(p)); c.multiplyScalar(1 / Math.max(1, ps.length));
      const dir = c.lengthSq() > 1 ? c.clone().normalize() : V(0, 0, 1), yaw = Math.atan2(dir.x, dir.z), pitch = Math.max(-0.9, Math.min(0.9, Math.asin(dir.y)));
      const d = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)), right = d.clone().negate().cross(V(0, 1, 0)).normalize(), upv = right.clone().cross(d.clone().negate());
      const xy = ps.map((p) => { const q = p.clone().sub(c); return [q.dot(right), q.dot(upv)]; }); let sxx = 0, syy = 0, sxy = 0; xy.forEach(([x, y]) => { sxx += x * x; syy += y * y; sxy += x * y; });
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), pr = portrait(); let rl = pr ? th - Math.PI / 2 : th; while (rl > Math.PI / 2) rl -= Math.PI; while (rl < -Math.PI / 2) rl += Math.PI; rl = Math.max(pr ? -1.25 : -0.3, Math.min(pr ? 1.25 : 0.3, rl));
      let ex = 0, ey = 0; xy.forEach(([x, y]) => { ex = Math.max(ex, Math.abs(x * Math.cos(rl) + y * Math.sin(rl))); ey = Math.max(ey, Math.abs(-x * Math.sin(rl) + y * Math.cos(rl))); });
      const tn = Math.tan((fov0() * Math.PI) / 360), asp = innerWidth / innerHeight * (pr ? 1 : 0.92);
      camG.yaw = yaw; camG.pitch = pitch; rollG = rl; camG.dist = Math.max(110, Math.max((ey + 16) / (tn * (pr ? 0.7 : 0.86)), (ex + 14) / (tn * asp)) * 1.04 + 20); tgtG.copy(c); }
    let grp = 0, gn = ""; const setName = (n: string) => { gn = n; hooks.current.name?.(n); };
    async function nameGroup(body: object) { const g = grp; try { const r = await fetch("/api/ctx/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (j?.name && g === grp) setName(j.name); } catch { /* 名前なしでも進める */ } }
    // 熱狂を探す: 言葉が中心の光になり、同じく接続 → 旅
    async function search(q: string) { if (!q.trim()) return; go({ k: "search", q }); grp++; setName(""); if (mainTile >= 0) releaseMain(); reset(); setPlaying([]);
      paintFibers(() => 1); wordOpG = 1; camG.dist = portrait() ? 460 : 270; tgtG.set(0, 0, 0); beatG = 1; waveC.copy(WORDP); waveR = 0; waveA = 1; const t = tok;
      try { const r = await fetch("/api/ctx/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) }); const j = await r.json();
        if (!alive || t !== tok) return; if (!j?.items?.length) { beatG = 0; waveA = 0; setName("この言葉では見つかりませんでした"); return; }
        const seen = new Set<number>(), items: Item[] = (j.items as { id: number; dim: number }[]).filter((x) => N.ctx[x.id] && !seen.has(momOf[x.id]) && seen.add(momOf[x.id])).slice(0, 7).map((x) => ({ id: x.id, d: x.dim >= 0 ? x.dim : N.ctx[x.id].w.indexOf(Math.max(...N.ctx[x.id].w)) }));
        connect(-1, q, items, j.name || q);
      } catch { if (t === tok) { beatG = 0; waveA = 0; setName("この言葉では見つかりませんでした"); } } }
    function back() { if (st.k === "scrub" || (st.k === "watch")) { free(); return; } if ((st.k === "map" || st.k === "trip") && st.seed >= 0) { const c = st.seed; watch(momOf[c]); return; } free(); }

    // ===== 空間の文字 =====
    const pool: HTMLDivElement[] = []; let used = 0, rects: number[][] = []; const prj = V();
    function txt(cls: string, html: string, p: THREE.Vector3, o: { pri?: number; side?: "r" | "l" | "c"; op?: number; data?: string } = {}) {
      let e = pool[used]; if (!e) { e = document.createElement("div"); tx.appendChild(e); pool[used] = e; } used++;
      type M = HTMLDivElement & { _w: number; _h: number }; const em = e as M;
      // 文字が同じで種類だけ変わるとき（選んだ・選ばなかった）は中身を作り直さない（滲み出しをやり直さない）
      if (e.dataset.h !== html) { e.dataset.h = html; e.dataset.c = cls; e.className = `bw-t ${cls}`; e.innerHTML = html; em._w = e.offsetWidth; em._h = e.offsetHeight; }
      else if (e.dataset.c !== cls) { e.dataset.c = cls; e.className = `bw-t ${cls}`; em._w = e.offsetWidth; em._h = e.offsetHeight; }
      if (e.dataset.v !== (o.data || "")) e.dataset.v = o.data || "";
      prj.copy(p).project(cam); let vis = prj.z < 1 && Math.abs(prj.x) < 1.05 && Math.abs(prj.y) < 1.05;
      const W = em._w, H = em._h, x = (prj.x * 0.5 + 0.5) * innerWidth, y = (-prj.y * 0.5 + 0.5) * innerHeight;
      let bx = o.side === "c" ? x - W / 2 : o.side === "l" ? x - W - 8 : x + 8, by = y - H / 2; bx = Math.max(10, Math.min(innerWidth - W - 10, bx));
      const hit = () => rects.some(([a, b, c, d]) => bx < a + c && bx + W > a && by < b + d && by + H > b);
      for (let t = 1; t <= 6 && vis && hit(); t++) by = y - H / 2 + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * (H * 0.6 + 4);
      if (vis && hit() && (o.pri ?? 0) < 2) vis = false; if (vis) rects.push([bx, by, W, H]);
      const tf = `translate3d(${Math.round(bx)}px,${Math.round(by)}px,0)`, op = vis ? String(Math.round((o.op ?? 1) * 50) / 50) : "0", pe = vis && o.data ? "auto" : "none";
      if (e.style.transform !== tf) e.style.transform = tf; if (e.style.opacity !== op) e.style.opacity = op; if (e.style.pointerEvents !== pe) e.style.pointerEvents = pe; }
    const upV = () => V(0, 1, 0).applyQuaternion(cam.quaternion);
    function drawText() { used = 0; rects = [];
      const up = upV();
      // 抜き取った熱の言葉（観ているとき）
      if (ext && (st.k === "watch" || st.k === "scrub")) { const sel = st.k === "scrub" ? st.c : -1; ext.ids.forEach((id, j) => { if (!ext!.shown[j]) return; const c = N.ctx[id], d = c.w.indexOf(Math.max(...c.w));
        txt(`hw ${sel === id ? "on" : sel >= 0 ? "off" : ""}`, `<span style="--c:${DIMC[d]}">${c.title}</span>`, ext!.to[j], { pri: 3, side: ext!.side[j], data: st.k === "watch" ? `h:${id}` : "" }); }); }
      // 全体図: 集めた熱の映像の上に、その熱の名前
      if (st.k === "map") st.items.forEach((it) => { const c = N.ctx[it.id], m = momOf[it.id], t = tiles[m];
        txt("ht", `<b>${N.moments[m].sport}</b><span style="--c:${DIMC[it.d]}">${c.title}</span>`, t.mesh.position.clone().addScaledVector(up, t.scale * 0.2813 + 5), { pri: 2, side: "c", data: `w:${it.id}` }); });
      if (st.k === "map" && st.seed >= 0) { const c = N.ctx[st.seed], m = momOf[st.seed], t = tiles[m]; txt("ht from", `<b>${N.moments[m].sport}</b><span>${c.title}</span>`, t.mesh.position.clone().addScaledVector(up, t.scale * 0.2813 + 5), { pri: 3, side: "c", data: `w:${st.seed}` }); }
      if ((st.k === "search" || (st.k === "trip" && st.seed < 0)) && "q" in st && st.q) txt("wd", st.q, WORDP.clone().addScaledVector(up, 8), { pri: 3, side: "c" });
      if (hoverM >= 0 && (st.k === "free" || (st.k === "map" && !st.items.some((x) => momOf[x.id] === hoverM)))) { const m = N.moments[hoverM], t = tiles[hoverM]; txt("mo", `<b>${m.sport}</b><span>${m.title}</span>`, t.mesh.position.clone().addScaledVector(up, t.scale * 0.3 + 2), { pri: 3, side: "c" }); }
      if (st.k === "free") famCenter.forEach((p, f) => { if (!MP.some((x) => x.fam === f)) return; const face = normalAt(p).dot(tmp.copy(cam.position).sub(p).normalize()); txt("lobe", FAM[f].name, p, { side: "c", op: Math.max(0, Math.min(1, (face - 0.05) * 3)) * 0.85 }); });
      for (let k = used; k < pool.length; k++) { const e = pool[k]; if (e.style.opacity !== "0") e.style.opacity = "0"; if (e.style.pointerEvents !== "none") e.style.pointerEvents = "none"; if (e.dataset.h) { e.dataset.h = ""; e.dataset.c = ""; e.className = "bw-t"; } } }
    const onTx = (e: MouseEvent) => { const t = (e.target as HTMLElement).closest("[data-v]") as HTMLElement | null; if (!t?.dataset.v || !ready) return; const [k, a] = t.dataset.v.split(":"); if (k === "h") heat(+a); if (k === "w") watch(momOf[+a]); };
    tx.addEventListener("click", onTx);

    // ===== 操作: ドラッグで回す、ピンチ/ホイールで寄る、映像に触れると観る =====
    const ptrs = new Map<number, [number, number]>(); let down: null | { x: number; y: number; yaw: number; pitch: number; moved: boolean } = null, pinch0 = 0;
    const cv = R.domElement;
    const locked = () => st.k === "trip" || st.k === "scrub";
    cv.addEventListener("pointerdown", (e) => { lastInput = performance.now(); ptrs.set(e.pointerId, [e.clientX, e.clientY]); idle = false; if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, yaw: camG.yaw, pitch: camG.pitch, moved: false }; if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()); pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); down = null; } });
    cv.addEventListener("pointermove", (e) => { lastInput = performance.now(); par.x = (e.clientX / innerWidth - 0.5) * 2; par.y = (e.clientY / innerHeight - 0.5) * 2; if (!ptrs.has(e.pointerId)) { hover(e.clientX, e.clientY); return; } ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (locked()) return;
      if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()), d = Math.hypot(a[0] - b[0], a[1] - b[1]); camG.dist = Math.max(30, Math.min(620, camG.dist * pinch0 / d)); pinch0 = d; return; }
      if (down) { const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true; camG.yaw = down.yaw - dx * 0.0055; camG.pitch = Math.max(-1.2, Math.min(1.2, down.pitch + dy * 0.0045)); } });
    cv.addEventListener("pointerup", (e) => { ptrs.delete(e.pointerId); if (!down) return; const moved = down.moved; down = null; if (moved || locked()) return; const m = pick(e.clientX, e.clientY); if (m < 0) return;
      if (st.k === "watch" && m === mainTile) return;
      watch(m); });
    cv.addEventListener("pointercancel", (e) => { ptrs.delete(e.pointerId); down = null; });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); idle = false; if (!locked()) camG.dist = Math.max(30, Math.min(620, camG.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
    function pick(x: number, y: number) { let best = -1, bd = 1e9;
      tiles.forEach((t) => { if (t.mat.uniforms.uOp.value < 0.3) return; prj.copy(t.mesh.position).project(cam); if (prj.z > 1) return; const sx = (prj.x * 0.5 + 0.5) * innerWidth, sy = (-prj.y * 0.5 + 0.5) * innerHeight;
        const dpt = cam.position.distanceTo(t.mesh.position), half = (t.scale / 2) / (dpt * Math.tan((cam.fov * Math.PI) / 360)) * (innerHeight / 2);
        if (Math.abs(x - sx) < half && Math.abs(y - sy) < half * 0.5625 + 4 && dpt < bd) { bd = dpt; best = t.m; } });
      return best; }
    let hoverM = -1; function hover(x: number, y: number) { if (locked()) { hoverM = -1; return; } const m = pick(x, y); hoverM = m; cv.style.cursor = m >= 0 ? "pointer" : "grab"; }

    // ===== 毎フレーム =====
    let shellMat: THREE.ShaderMaterial | null = null, last = 0, raf = 0, ready = false, liveAt = 0, manual = false;
    const resize = () => { const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; R.setSize(w, h, false); fatMat.resolution.set(w, h); cam.aspect = w / h; cam.fov = portrait() ? 60 : 50; cam.updateProjectionMatrix();
      const fs = dpr >= 1.25 ? 0.5 : 0.7; fibRT.setSize(Math.max(4, Math.round(w * dpr * fs)), Math.max(4, Math.round(h * dpr * fs))); };
    // 鼓動（ドクン、ドクン）: 0〜1
    const heartbeat = (t: number) => { const x = t % 0.92; return Math.exp(-Math.pow(x / 0.055, 2)) + 0.65 * Math.exp(-Math.pow((x - 0.2) / 0.06, 2)); };
    function update(dt: number, draw = true) { now += dt;
      if (!ready) { if (draw) render(); return; }
      runQueue();
      intro = Math.min(1, intro + dt / (reduce ? 0.5 : 3.2)); const ie = 1 - Math.pow(1 - intro, 3);
      beatAmp += (beatG - beatAmp) * Math.min(1, dt * 2.5); const hb = reduce ? 0 : heartbeat(now) * beatAmp;
      fiberMat.uniforms.uIntro.value = ie; intros.forEach((u) => (u.value = ie)); if (shellMat) shellMat.uniforms.uOp.value = ie * (1 + hb * 1.6);
      mixT = Math.min(1, mixT + dt / 0.6); fiberMat.uniforms.uMix.value = mixT * mixT * (3 - 2 * mixT); fiberMat.uniforms.uSweep.value = (now - sweepT) / 1.2;
      waveR = (now % 0.92) * 175; fiberMat.uniforms.uWave.value.set(waveC.x, waveC.y, waveC.z, waveR); fiberMat.uniforms.uWaveA.value += (waveA - fiberMat.uniforms.uWaveA.value) * Math.min(1, dt * 4); fiberMat.uniforms.uBeat.value = hb; fiberMat.uniforms.uLift.value += ((fly ? 0.9 : st.k === "trip" && st.i >= 0 ? 0.28 : 0) - fiberMat.uniforms.uLift.value) * Math.min(1, dt * 3);
      if (idle && !reduce && st.k === "free") { camG.yaw += dt * 0.05; camG.pitch = 0.2 + Math.sin(now * 0.11) * 0.22; }
      if (st.k === "trip" && st.i < 0) camG.yaw += dt * 0.12; // 接続中はゆっくり回り込む
      const k = 1 - Math.exp(-dt / (intro < 1 ? 1.1 : st.k === "trip" && st.i < 0 ? 0.9 : 0.55)), kp = 1 - Math.exp(-dt / 0.9); parC.x += (par.x - parC.x) * kp; parC.y += (par.y - parC.y) * kp;
      if (fly) { const f = fly, t = Math.min(1, (now - f.t0) / f.dur), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, i = e * (f.pts.length - 1), i0 = Math.floor(i);
        cam.position.copy(f.pts[i0]).lerp(f.pts[Math.min(f.pts.length - 1, i0 + 1)], i - i0); const ahead = f.pts[Math.min(f.pts.length - 1, i0 + 12)]; const lw = Math.min(1, Math.max(0, (t - 0.3) / 0.42)); tmp.copy(ahead).lerp(f.look, lw * lw * (3 - 2 * lw)); cam.up.set(0, 1, 0); cam.lookAt(tmp);
        cam.fov += ((portrait() ? 74 : 66) * (1 - Math.max(0, (t - 0.7) / 0.3)) + (portrait() ? 60 : 50) * Math.max(0, (t - 0.7) / 0.3) - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix();
        if (t >= 1) { fly = null; f.done(); } }
      else { const f0 = portrait() ? 60 : 50; if (Math.abs(cam.fov - f0) > 0.02) { cam.fov += (f0 - cam.fov) * Math.min(1, dt * 5); cam.updateProjectionMatrix(); }
        cam0.yaw += (camG.yaw - cam0.yaw) * k; cam0.pitch += (camG.pitch - cam0.pitch) * k; cam0.dist += (camG.dist - cam0.dist) * k; tgtC.lerp(tgtG, k);
        const pw = st.k === "watch" || st.k === "scrub" || st.k === "trip" ? 0.03 : 0.1, yw = cam0.yaw - parC.x * pw, pt = Math.max(-1.3, Math.min(1.3, cam0.pitch + parC.y * pw * 0.6));
        cam.position.set(Math.sin(yw) * Math.cos(pt), Math.sin(pt), Math.cos(yw) * Math.cos(pt)).multiplyScalar(cam0.dist).add(tgtC); roll += (rollG - roll) * k; cam.up.set(0, 1, 0); cam.lookAt(tgtC); if (Math.abs(roll) > 1e-4) cam.rotateZ(roll); }
      { const w = R.domElement.width / R.getPixelRatio(), h = R.domElement.height / R.getPixelRatio(), pr = portrait();
        const ox = pr ? 0 : st.k === "free" || st.k === "search" ? -0.13 : 0, oy = st.k === "free" || st.k === "search" ? (pr ? -0.05 : 0) : st.k === "watch" || st.k === "scrub" ? (pr ? 0.2 : 0.02) : st.k === "map" ? (pr ? 0.12 : 0.09) : st.k === "trip" && st.i >= 0 ? (pr ? 0.05 : 0.08) : 0;
        view.x += (ox - view.x) * k; view.y += (oy - view.y) * k; cam.setViewOffset(w, h, view.x * w, view.y * h, w, h); }
      fiberMat.uniforms.uNear.value = cam.position.length(); fiberMat.uniforms.uDen.value = Math.max(0.45, Math.min(1.2, Math.sqrt((Math.min(innerWidth, innerHeight * 1.8) / 1280) * (290 / Math.max(60, cam.position.distanceTo(tgtC))))));
      if (fat) (fat.geometry as LineSegmentsGeometry).instanceCount = Math.min(fatN, Math.ceil(fatN * Math.min(1, (now - fatT0) / fatDur)));
      // 時刻を走る（本物のコマを seek で飛び飛びに見せる）
      if (scrub && mainTile >= 0) { const p = Math.min(1, (now - scrub.t0) / (reduce ? 0.3 : 0.85)), e = p * p * (3 - 2 * p);
        if (mainOk && !mainV.seeking && now - scrub.lastSeek > 0.06) { scrub.lastSeek = now; try { mainV.currentTime = Math.max(0, scrub.from + (scrub.to - scrub.from) * e + (Math.random() - 0.5) * 0.4 * (1 - p)); } catch { /* まだ読めていない */ } }
        glitch = Math.max(glitch, Math.min(1, 0.25 + p * 0.9));
        if (p >= 1) { const c = scrub.c; try { mainV.currentTime = scrub.to; } catch { /* */ } mainV.muted = false; mainV.play().catch(() => {}); scrub = null; afterScrub(c); } }
      glitch = Math.max(0, glitch - dt * (scrub ? 0 : 2.2)); flash = Math.max(0, flash - dt * 2.8);
      wordMat.uniforms.uOp.value += (wordOpG - wordMat.uniforms.uOp.value) * Math.min(1, dt * 3); wordMat.uniforms.uT.value = now;
      // 板
      const cp = cam.position;
      tiles.forEach((t) => { const u = t.mat.uniforms; t.dim += (t.dimG - t.dim) * k; t.lift += (t.liftG - t.lift) * Math.min(1, dt * 2.2);
        t.scale += (t.goal - t.scale) * k; const home = MP[t.m].tile; t.mesh.position.copy(home).addScaledVector(MP[t.m].n, t.lift * 8).lerp(cp, t.lift * (portrait() ? 0.32 : 0.42));
        const isMain = t.m === mainTile; if (isMain && scrub) t.mesh.position.add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.9 * glitch)); const onTrip = st.k === "trip" && st.i >= 0 && momOf[st.items[st.i]?.id] === t.m;
        u.uS.value = t.scale * (1 + hb * 0.05); u.uDim.value = t.dim * (1 + hb * 0.25); u.uBill.value += ((t.lift > 0.3 || isMain || onTrip ? 1 : 0) - u.uBill.value) * Math.min(1, dt * 3);
        const face = MP[t.m].n.dot(tmp.copy(cp).sub(t.mesh.position).normalize()); u.uFace.value = Math.max(0, Math.min(1, face * 1.6 + 0.4));
        u.uOp.value = Math.min(1, ie * 1.4) * (t.lift > 0.5 || isMain || onTrip ? 1 : face < 0.05 ? 0.35 : 0.45 + 0.55 * Math.min(1, face * 1.6 + 0.2));
        if (!isMain && (st.k === "free" || st.k === "watch")) u.uHi.value = hoverM === t.m ? 1 : 0;
        const vOn = isMain && !(st.k === "trip" && st.i >= 0) ? (mainOk ? 1 : 0) : t.vid >= 0 && slots[t.vid].tile === t.m && slots[t.vid].v.readyState >= 2 ? 1 : 0; u.uUseVid.value += (vOn - u.uUseVid.value) * Math.min(1, dt * 4);
        u.uGl.value = isMain ? glitch : 0; u.uFl.value = isMain ? flash : 0; u.uT.value = now;
        if (isMain && ext && st.k === "watch") { const sc = (now - ext.t0) / 1.3; u.uScan.value = sc > 0 && sc < 1 ? sc : -1; } else u.uScan.value = -1;
        t.mesh.renderOrder = onTrip ? 1600 : isMain ? 1500 : face < 0.05 && t.lift < 0.5 ? -10 : 10 + Math.round(1000 - cp.distanceTo(t.mesh.position)); });
      if (st.k === "free" && now - liveAt > 3 && intro > 0.9) { liveAt = now; const cand = tiles.map((t) => { prj.copy(t.mesh.position).project(cam); const face = MP[t.m].n.dot(tmp.copy(cp).sub(t.mesh.position).normalize()); return { t, s: face - Math.hypot(prj.x, prj.y) * 0.8 }; }).sort((a, b) => b.s - a.s).slice(0, portrait() ? 2 : 3);
        setPlaying(cand.map(({ t }) => ({ tile: t.m, src: clipOf(N.moments[t.m].ctx[0]) }))); }
      updateExtract();
      drawText();
      if (draw) render(); }
    function render() { R.setRenderTarget(fibRT); R.setClearColor(0x000000, 0); R.clear(); R.render(fibScene, cam); R.setRenderTarget(null); R.setClearColor(0x020306, 1); R.render(scene, cam); }
    // 重い端末では解像度を自動で下げる（直近 90 フレームの平均が 40fps を割ったら 0.25 ずつ、0.75 まで）
    let fa = 0, fn = 0, odd = false, lastInput = 0, skip = 0;
    const loop = (t: number) => { raf = requestAnimationFrame(loop); const dt = Math.min(0.1, Math.max(0, (t - (last || t)) / 1000)); last = t; if (manual) return; odd = !odd; const lazy = st.k === "free" && performance.now() - lastInput > 2500 && intro >= 1; if (lazy && odd) { skip += dt; return; } update(dt + skip); skip = 0;
      if (ready && intro >= 1 && !document.hidden) { fa += dt; fn++; if (fn >= 90) { if (fa / fn > 1 / 40 && dpr > 0.75) { dpr = Math.max(0.75, dpr - 0.25); R.setPixelRatio(dpr); resize(); } fa = 0; fn = 0; } } };
    // 見えていないときは映像を止める
    const vis = () => { if (document.hidden) { slots.forEach((x) => x.v.pause()); mainV.pause(); } else { slots.forEach((x) => { if (x.tile >= 0) x.v.play().catch(() => {}); }); if (mainTile >= 0 && !scrub && (st.k === "watch" || st.k === "scrub")) mainV.play().catch(() => {}); } };
    document.addEventListener("visibilitychange", vis);
    resize(); addEventListener("resize", resize); raf = requestAnimationFrame(loop);

    // ===== 読み込み =====
    (async () => {
      N = await (await fetch("/ctx/net.json")).json(); if (!alive) return;
      placeMoments(); shellMat = buildShell();
      const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
      const atl = Array.from({ length: Math.ceil(N.ctx.length / 256) }, (_, s) => { const t = loader.load(`${BASE}/ctx/atlas${s}.jpg`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
      buildCortex(atl); buildFibersSync();
      setNet(N); ready = true; cam0.dist = portrait() ? 1100 : 820; cam0.yaw = camG.yaw - 1.5; cam0.pitch = 0.95; camG.dist = portrait() ? 470 : 235;
      // シェアされたリンク: 接続から旅が始まり、全体図で終わる
      if (shared?.i?.length) { const s = shared.s ?? -1, js = shared.i.filter((x) => x !== s);
        later(2.2, () => { const items: Item[] = s >= 0 ? ids2items(s, js) : shared.i.map((id) => ({ id, d: N.ctx[id].w.indexOf(Math.max(...N.ctx[id].w)) })); connect(s, shared.q, items, shared.n); }); }
    })();

    api.current = { watch: (m) => watch(m), heat, search: (q) => { search(q); }, back, next: () => { if (st.k === "trip" && st.i >= 0 && !fly) { const s = st; go({ ...s }); hop(s.i + 1); } }, skip: () => { if (st.k === "trip") { fly = null; toMap(); } },
      replay: () => { if (st.k === "map") { const s = st; connect(s.seed, s.q, s.items, gn); } } };
    (window as unknown as { __bw: object }).__bw = { st: () => st, watch, heat, search, back, next: () => api.current?.next(), skip: () => api.current?.skip(), replay: () => api.current?.replay(), manual: (on: boolean) => { manual = on; }, adv: (s: number) => { const n = Math.max(1, Math.round(s * 30)); for (let i = 0; i < n; i++) update(1 / 30, i === n - 1); }, find: (t: string) => N.ctx.findIndex((c) => c.title === t), momOf: (c: number) => momOf[c], queue: () => queue.length };
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener("resize", resize); tx.removeEventListener("click", onTx); pool.forEach((e) => e.remove()); document.removeEventListener("visibilitychange", vis); slots.forEach((s) => { s.v.pause(); s.v.src = ""; }); mainV.pause(); mainV.src = ""; R.dispose(); el.removeChild(R.domElement); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 画面の文字と操作 =====
  useEffect(() => { hooks.current.view = (v) => setView(v); hooks.current.slam = (c) => setSlam({ c, key: Date.now() }); hooks.current.name = (n) => setGname(n); });
  useEffect(() => { if (!slam) return; const t = setTimeout(() => setSlam(null), 2600); return () => clearTimeout(t); }, [slam]);
  // 接続中の数（照らし合わせた熱が数え上がる）
  const [scan, setScan] = useState(0);
  const scanning = view.k === "search" || (view.k === "trip" && view.i === -2);
  useEffect(() => { if (!scanning) { if (view.k !== "trip") setScan(0); return; } let n = 0; const id = setInterval(() => { n = Math.min(402, n + 11 + Math.floor(Math.random() * 9)); setScan(n); if (n >= 402) clearInterval(id); }, 55); return () => clearInterval(id); }, [scanning]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view.k !== "map") setShare(false); }, [view.k]);

  const N = net;
  const famName = (sport: string) => FAM.find((f) => f.re.test(sport))?.name || sport;
  const momOfC = (c: number) => (N ? N.moments.find((m) => m.no === N.ctx[c].no)! : null);
  const sports = (items: Item[]) => new Set(items.map((x) => famName(momOfC(x.id)!.sport))).size;
  const shareUrl = () => { if (view.k !== "map") return ""; const code = btoa(unescape(encodeURIComponent(JSON.stringify({ n: (gname || "").slice(0, 20), s: view.seed, q: view.q, i: [...(view.seed >= 0 ? [view.seed] : []), ...view.items.map((x) => x.id)] })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); return `${location.origin}/d/${code}?v=brain`; };
  const watching = view.k === "watch" || view.k === "scrub" ? view.m : -1;
  const stop = view.k === "trip" && view.i >= 0 && N ? view.items[view.i] : null;

  return (
    <div className="bw">
      <div ref={host} className="bw-gl" />
      <div ref={txRef} className="bw-tx" />
      <div className="bw-vig" />
      <header className="bw-top">
        <div className="bw-mark">DAZN <em>100</em> MOMENTS</div>
        {N && view.k === "free" && <div className="bw-stat"><span><b>{N.moments.length}</b>本のハイライト</span><span><b>{N.ctx.length}</b>の熱</span><span><b>{N.links.length.toLocaleString()}</b>の繋がり</span></div>}
        {view.k !== "free" && <button className="bw-close" aria-label="戻る" onClick={() => api.current?.back()}>←</button>}
      </header>
      {N && (view.k === "free" || view.k === "search") && (
        <div className="bw-intro">
          {view.k === "free" && <p className="l">{LINE}</p>}
          <form className="bw-q" onSubmit={(e) => { e.preventDefault(); if (q.trim()) api.current?.search(q.trim()); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`例: ${EXAMPLE}`} maxLength={40} enterKeyHint="search" />
            <button type="submit" disabled={!q.trim() || view.k === "search"}>熱狂を探す</button>
          </form>
          {view.k === "search" && gname && <p className="nf">{gname}</p>}
        </div>
      )}
      {N && watching >= 0 && (() => { const m = N.moments[watching]; return <div className="bw-who" key={watching}><b>{m.sport}</b><span>{m.title}</span></div>; })()}
      {N && slam && <div className="bw-slam" key={slam.key}><span>{N.ctx[slam.c].title}</span></div>}
      {N && ((view.k === "trip" && view.i < 0 && !view.mv) || view.k === "search") && (
        <div className={`bw-conn ${view.k === "trip" && view.i === -1 ? "done" : ""}`}>
          <div className="s">{view.k === "trip" && view.seed >= 0 ? N.ctx[view.seed].title : `「${view.q}」`}</div>
          <div className="pulse"><i /><i /><i /></div>
          <div className="t">{view.k === "trip" && view.i === -1 ? "熱狂、接続" : "熱狂接続中"}<em>{view.k === "trip" && view.i === -1 ? "" : "..."}</em></div>
          <div className="n">{view.k === "trip" && view.i === -1 ? <><b>{view.items.length}</b>つの熱が、<b>{sports(view.items)}</b>つの競技から</> : <><b>{scan}</b> / {N.ctx.length} の熱と照らし合わせています</>}</div>
        </div>)}
      {N && view.k === "trip" && view.i >= 0 && (() => { const c = stop ? N.ctx[stop.id] : null, m = stop ? momOfC(stop.id) : null; return (
        <div className="bw-stop" onClick={() => api.current?.next()}>
          <div className="bar">{view.items.map((_, i) => <i key={i} className={i < view.i ? "done" : i === view.i ? "now" : ""} />)}</div>
          {stop && c && m && !view.mv && <div className="cap" key={view.i}><div className="k">{m.sport}</div><h3 style={{ ["--c" as string]: DIMC[stop.d] }}>{c.title}</h3><p>{c.v[stop.d] || c.line}</p></div>}
          <button className="skip" onClick={(e) => { e.stopPropagation(); api.current?.skip(); }}>全体を見る</button>
        </div>); })()}
      {N && view.k === "map" && !share && (
        <section className="bw-map"><div className="g"><b>{gname || (view.q ? `「${view.q}」` : " ")}</b><span>{view.items.length}の熱が、{sports(view.items)}つの競技から集まりました</span></div>
          <div className="row"><button className="ghost" onClick={() => api.current?.replay()}>もう一度</button><button className="pill" onClick={() => setShare(true)}>この熱狂グループをシェア</button></div></section>)}
      {N && view.k === "map" && share && (
        <div className="bw-share" onClick={() => setShare(false)}><div className="card" onClick={(e) => e.stopPropagation()}><div className="k">競技を越えて集まった熱</div><h3>{gname || "この熱狂グループ"}</h3>
          <p>{sports(view.items)}つの競技・{view.items.length + (view.seed >= 0 ? 1 : 0)}の瞬間。リンクを開いた人の画面で、同じ旅が流れます。</p>
          <div className="sh"><a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${gname} #DAZN100MOMENTS`)}&url=${encodeURIComponent(shareUrl())}`} target="_blank" rel="noreferrer">X</a><a href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl())}`} target="_blank" rel="noreferrer">LINE</a><button onClick={() => { navigator.clipboard?.writeText(shareUrl()); setToast("リンクをコピーしました"); setTimeout(() => setToast(""), 1800); }}>リンクをコピー</button></div>
          <button className="x" onClick={() => setShare(false)}>閉じる</button></div></div>)}
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
.bw-t.ht.from span{border-bottom-color:#f4f2ec;font-size:15px}
.bw-t.ht span{display:block;font-size:13.5px;font-weight:900;text-shadow:0 1px 10px rgba(0,0,0,.95);margin-top:3px;border-bottom:2px solid var(--c);padding-bottom:2px}
.bw-t.wd{font-size:clamp(18px,2vw,26px);font-weight:900;letter-spacing:.04em;text-shadow:0 0 24px rgba(0,0,0,.9),0 0 2px rgba(0,0,0,.9)}
/* 抜き取った熱の言葉: じわっと滲み出て、押せる */
.bw-t.hw{cursor:pointer}
.bw-t.hw span{animation:bwseep 1.1s cubic-bezier(.2,.8,.2,1) both;display:inline-block;font-size:15px;font-weight:900;letter-spacing:.02em;padding:8px 14px;border-radius:999px;background:rgba(6,8,13,.86);border:1px solid color-mix(in srgb,var(--c) 70%,transparent);box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 24px color-mix(in srgb,var(--c) 25%,transparent);transition:background .2s,color .2s,transform .2s}
.bw-t.hw:hover span{background:var(--c);color:#0a0a0a}
.bw-t.hw.on span{background:var(--c);color:#0a0a0a}
.bw-t.hw.off span{opacity:.25!important}
@keyframes bwseep{0%{filter:blur(14px);transform:scale(1.3);opacity:0}40%{opacity:1}100%{filter:none;transform:none;opacity:1}}
.bw-top{position:absolute;left:0;right:0;top:0;z-index:8;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:calc(env(safe-area-inset-top,0px) + 18px) max(20px,env(safe-area-inset-right,0px)) 0 max(20px,env(safe-area-inset-left,0px));pointer-events:none}
.bw-top>*{pointer-events:auto}
.bw-mark{font-size:11px;font-weight:900;letter-spacing:.32em;white-space:nowrap}.bw-mark em{font-style:normal;color:#f7ff3c}
.bw-stat{display:flex;gap:16px;font-size:10px;letter-spacing:.1em;color:rgba(244,242,236,.55);margin-left:auto}
.bw-stat b{font-size:14px;color:#f4f2ec;font-weight:900;margin-right:3px;font-variant-numeric:tabular-nums}
.bw-close{width:40px;height:40px;flex:none;border-radius:50%;border:1px solid rgba(244,242,236,.22);background:rgba(2,3,6,.85);color:#f4f2ec;font-size:17px;cursor:pointer;margin-left:auto}
.bw-intro{position:absolute;left:max(24px,4vw);top:calc(env(safe-area-inset-top,0px) + 76px);z-index:6;width:min(460px,calc(100% - 48px));animation:bwf .7s .15s ease both}
.bw-intro .l{margin:0 0 16px;font-size:clamp(22px,2.1vw,29px);white-space:nowrap;font-weight:900;line-height:1.4;letter-spacing:.04em;text-shadow:0 2px 20px rgba(0,0,0,.8)}
.bw-intro .nf{margin:12px 4px 0;font-size:12px;color:rgba(244,242,236,.7)}
.bw-q{display:flex;gap:0;background:rgba(8,10,16,.92);border:1px solid rgba(244,242,236,.2);border-radius:999px;padding:5px}
.bw-q input{flex:1;min-width:0;font-family:inherit;font-size:15px;font-weight:700;color:#f4f2ec;background:transparent;border:0;outline:0;padding:9px 14px}
.bw-q input::placeholder{color:rgba(244,242,236,.38)}
.bw-q button{flex:none;font-family:inherit;font-size:13px;font-weight:900;color:#0a0a0a;background:#f7ff3c;border:0;border-radius:999px;padding:10px 16px;cursor:pointer}
.bw-q button:disabled{opacity:.6;cursor:default}
@keyframes bwf{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.bw-who{position:absolute;left:max(20px,4vw);top:calc(env(safe-area-inset-top,0px) + 64px);z-index:6;pointer-events:none;animation:bwf .6s .3s ease both}
.bw-who b{display:block;font-size:10px;font-weight:900;letter-spacing:.22em;color:#f7ff3c}.bw-who span{display:block;margin-top:4px;font-size:16px;font-weight:900;text-shadow:0 1px 12px rgba(0,0,0,.9)}
.pill{flex:none;font-family:inherit;font-size:14px;font-weight:900;color:#0a0a0a;background:#f7ff3c;border:0;border-radius:999px;padding:13px 20px;cursor:pointer;box-shadow:0 8px 30px rgba(247,255,60,.18)}
.ghost{flex:none;font-family:inherit;font-size:13px;font-weight:700;color:#f4f2ec;background:rgba(2,3,6,.85);border:1px solid rgba(244,242,236,.25);border-radius:999px;padding:12px 16px;cursor:pointer}
.bw-slam{position:absolute;left:0;right:0;top:calc(50% - 4vh);z-index:7;display:flex;justify-content:center;pointer-events:none}
.bw-slam span{font-size:clamp(30px,4.6vw,64px);font-weight:900;letter-spacing:.02em;text-shadow:0 4px 30px rgba(0,0,0,.85);animation:bwslam 2.6s cubic-bezier(.2,.9,.2,1) both;white-space:nowrap}
@keyframes bwslam{0%{opacity:0;transform:scale(1.9);filter:blur(14px)}9%{opacity:1;transform:scale(.97);filter:none}14%{transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:scale(1)}}
/* 熱狂接続中 */
.bw-conn{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 9vh);z-index:7;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none;animation:bwf .6s ease both;text-shadow:0 2px 20px rgba(0,0,0,.9)}
.bw-conn .s{font-size:13px;font-weight:900;letter-spacing:.06em;color:#f4f2ec;opacity:.85;margin-bottom:2px}
.bw-conn .t{font-size:clamp(22px,2.6vw,34px);font-weight:900;letter-spacing:.2em}.bw-conn .t em{font-style:normal;display:inline-block;width:2.2em;text-align:left;animation:bwdots 1.2s steps(4) infinite;overflow:hidden;vertical-align:bottom}
@keyframes bwdots{from{width:0}to{width:2.2em}}
.bw-conn .n{font-size:12px;letter-spacing:.12em;color:rgba(244,242,236,.75);font-variant-numeric:tabular-nums}.bw-conn .n b{color:#f7ff3c;font-size:15px;margin:0 2px}
.bw-conn .pulse{position:relative;width:46px;height:46px}.bw-conn .pulse i{position:absolute;inset:0;border-radius:50%;border:2px solid #f7ff3c;animation:bwbeat .92s ease-out infinite}.bw-conn .pulse i:nth-child(2){animation-delay:.2s}.bw-conn .pulse i:nth-child(3){inset:17px;background:#f7ff3c;border:0;animation:bwcore .92s ease-out infinite}
@keyframes bwbeat{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.8);opacity:0}}
@keyframes bwcore{0%,40%{transform:scale(1)}10%{transform:scale(1.5)}25%{transform:scale(1.25)}}
.bw-conn.done .pulse i{animation:none;opacity:0}.bw-conn.done .t{color:#f7ff3c}
/* 旅の行き先 */
.bw-stop{position:absolute;inset:0;z-index:7;cursor:pointer}
.bw-stop .bar{position:absolute;left:max(20px,4vw);right:max(20px,4vw);top:calc(env(safe-area-inset-top,0px) + 66px);display:flex;gap:5px}
.bw-stop .bar i{flex:1;height:3px;background:rgba(244,242,236,.2);border-radius:3px}.bw-stop .bar i.done{background:#f4f2ec}.bw-stop .bar i.now{background:#f7ff3c}
.bw-stop .cap{position:absolute;left:max(24px,5vw);right:24px;bottom:calc(env(safe-area-inset-bottom,0px) + 9vh);text-shadow:0 2px 20px rgba(0,0,0,.85);pointer-events:none}
.bw-stop .k{font-size:12px;font-weight:900;letter-spacing:.24em;color:#f7ff3c;animation:bwf .4s .15s ease both}
.bw-stop h3{margin:8px 0 0;font-size:clamp(30px,4.6vw,64px);font-weight:900;line-height:1.12;border-left:5px solid var(--c);padding-left:16px;animation:bwslam2 .7s cubic-bezier(.2,.9,.2,1) both}
@keyframes bwslam2{0%{opacity:0;transform:translateX(-30px) scale(1.15);filter:blur(10px)}100%{opacity:1;transform:none;filter:none}}
.bw-stop p{margin:10px 0 0 21px;font-size:14px;color:rgba(244,242,236,.85);animation:bwf .5s .35s ease both}
.bw-stop .skip{position:absolute;right:max(16px,env(safe-area-inset-right,0px));top:calc(env(safe-area-inset-top,0px) + 82px);font-family:inherit;font-size:12px;font-weight:700;color:#f4f2ec;background:rgba(2,3,6,.85);border:1px solid rgba(244,242,236,.25);border-radius:999px;padding:9px 14px;cursor:pointer}
/* 全体図 */
.bw-map{position:absolute;left:0;right:0;margin:0 auto;bottom:calc(env(safe-area-inset-bottom,0px) + 22px);z-index:7;width:min(760px,calc(100% - 32px));display:flex;align-items:center;justify-content:space-between;gap:16px;background:linear-gradient(180deg,rgba(9,11,17,.94),rgba(5,6,10,.96));border:1px solid rgba(244,242,236,.1);border-radius:18px;padding:16px 18px;animation:bwf .5s ease both}
.bw-map .g b{display:block;font-size:20px;font-weight:900;min-height:1.2em}.bw-map .g span{display:block;font-size:12px;color:rgba(244,242,236,.62);margin-top:3px}
.bw-map .row{display:flex;gap:8px}
.bw-share{position:absolute;inset:0;z-index:20;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;animation:bwf .3s ease both}
.bw-share .card{width:min(420px,calc(100% - 32px));background:#0a0c12;border:1px solid rgba(244,242,236,.15);border-radius:20px;padding:24px}
.bw-share .k{font-size:10.5px;font-weight:900;letter-spacing:.22em;color:#f7ff3c}.bw-share h3{margin:10px 0 8px;font-size:clamp(26px,3vw,36px);font-weight:900;line-height:1.25}.bw-share p{margin:0;font-size:13px;line-height:1.8;color:rgba(244,242,236,.72)}
.bw-share .sh{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}.bw-share .sh a,.bw-share .sh button{font-family:inherit;font-size:13px;font-weight:700;color:#f4f2ec;text-decoration:none;background:rgba(244,242,236,.08);border:1px solid rgba(244,242,236,.2);border-radius:999px;padding:10px 16px;cursor:pointer}
.bw-share .x{margin-top:14px;font-family:inherit;font-size:12px;color:rgba(244,242,236,.6);background:transparent;border:0;cursor:pointer;padding:6px 0}
.bw-toast{position:absolute;left:50%;bottom:90px;transform:translateX(-50%);z-index:30;background:#f4f2ec;color:#0a0a0a;font-size:12px;font-weight:700;padding:9px 14px;border-radius:999px}
@media (max-width:700px){
  .bw-stat{display:none}
  .bw-intro{left:16px;right:16px;width:auto;top:calc(env(safe-area-inset-top,0px) + 54px)}.bw-intro .l{font-size:20px;margin-bottom:12px;white-space:normal}
  .bw-who{left:16px;top:calc(env(safe-area-inset-top,0px) + 52px)}.bw-who span{font-size:14px}
  .bw-t.hw span{font-size:13px;padding:7px 11px}.bw-t.ht span{font-size:11.5px}.bw-t.lobe{font-size:10px}
  .bw-slam{top:calc(env(safe-area-inset-top,0px) + 24vh)}.bw-slam span{font-size:26px;white-space:normal;text-align:center;padding:0 20px}
  .bw-stop .bar{top:calc(env(safe-area-inset-top,0px) + 56px)}.bw-stop .skip{top:calc(env(safe-area-inset-top,0px) + 70px)}.bw-stop h3{font-size:26px}
  .bw-map{flex-direction:column;align-items:stretch;gap:12px;width:calc(100% - 20px);bottom:calc(env(safe-area-inset-bottom,0px) + 10px)}.bw-map .row{justify-content:stretch}.bw-map .row .pill{flex:1}
}
`;

"use client";
// 競技を越えて、同じ熱が集まる（/lab/brain）。2026-10-19 夜のユーザー判定で作り直した流れ:
//   開く: 表面に77本の映像が並び、手前の数本が動き、内側を色の線が走る（拡散MRIのトラクトグラフィーの表現）。一行と「熱狂を探す」の入力欄。
//   観る（熱を採る）: 映像に触れると寄って音つきで流れ、光の帯が映像を読み、読んだところが光の粒にほどける。熱の場所から粒が螺旋で流れ出し、言葉の場所で滴になり、言葉が一字ずつ滲み出る。
//   熱を選ぶ（時を走る）: 滴が映像へ戻る → 通った本物のコマがフィルムの帯になって横へ流れる → 最後のコマが映像いっぱいに広がり、光と衝撃の輪 → 少しゆっくり流れ出し、名前と一文が打ち込まれる。
//   熱狂接続中: カメラが引いて全体が鼓動し、選んだ熱から照合の波が広がる → 繋がった熱への線だけが残る。
//   旅（＝ダイジェスト）: 前の旅（cfca682）を土台に、出発の熱の入口へ降り、線の中を端から端まで通って相手の熱から表へ出る（約5秒。同じ見方の線が光る。飛行中は両端の言い方）
//     → 着いたら両端の熱・言い方・理由の一文を見せてから、その熱の4秒を音つきで流す → 次へ。最後に引いた全体図と「この熱狂グループをシェア」。
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
  | { k: "trip"; seed: number; q?: string; items: Item[]; i: number; ph?: "fly" | "link" | "play" }
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

type Api = { watch: (m: number) => void; heat: (c: number) => void; search: (q: string) => void; back: () => void; next: () => void; skip: () => void; replay: () => void; thumb: (id: number) => string };

export default function BrainWorld({ media, shared }: { media: MediaMap; shared?: Shared }) {
  const host = useRef<HTMLDivElement>(null), txRef = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const hooks = useRef<{ slam?: (c: number) => void; view?: (v: View) => void; name?: (n: string) => void; lines?: (l: Record<number, string>) => void }>({});
  const [net, setNet] = useState<Net | null>(null);
  const [view, setView] = useState<View>({ k: "free" });
  const [q, setQ] = useState("");
  const [slam, setSlam] = useState<{ c: number; key: number } | null>(null);
  const [gname, setGname] = useState("");
  const [share, setShare] = useState(false);
  const [toast, setToast] = useState("");
  const [lines, setLines] = useState<Record<number, string>>({});

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
          float lv(float x){ return x < .5 ? .2 : x < 1.5 ? 1. : x < 2.5 ? 4.2 : 1.7; }
          void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); float z = -mv.z;
            float selA = sel.x, selB = sel.y, dir = sel.z; float lvl = mix(lv(selA), lv(selB), uMix);
            float along = dir > .5 ? 1. - s : s; float hot = selB > 1.5 ? smoothstep(uSweep - .12, uSweep, along) : 0.; lvl = mix(lvl, max(lv(selA), .07), hot);
            // 接続中: 選んだ熱から照合の波が広がり、全体が鼓動する
            float wv = smoothstep(18., 0., abs(length(position - uWave.xyz) - uWave.w)) * uWaveA; lvl = max(lvl, uLift) * (1. + uBeat * .55) + wv * 1.8; // uLift: 旅で飛んでいる間は、沈めた線も見えるところまで上げる（線の中を通っていく）
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
    type Tile = { m: number; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; scale: number; goal: number; dim: number; dimG: number; lift: number; liftG: number; vid: number; pos: THREE.Vector3; off: THREE.Vector3;
      anim: null | { pts: THREE.Vector3[]; t0: number; dur: number; to: number; back: boolean } };
    let tiles: Tile[] = [];
    const TILE_V = `uniform float uS, uBill; varying vec2 vUv; void main(){ vUv = uv; vec4 c = modelViewMatrix * vec4(0.,0.,0.,1.); vec4 bill = c + vec4(position.xy * uS, 0., 0.); vec4 wor = modelViewMatrix * vec4(position * uS, 1.); gl_Position = projectionMatrix * mix(wor, bill, uBill); }`;
    const TILE_F = `precision highp float; varying vec2 vUv; uniform sampler2D uAt, uVid; uniform vec4 uRect; uniform float uUseVid, uDim, uFace, uHi, uOp, uGl, uFl, uT, uScan, uZm; uniform vec3 uRim; uniform vec4 uHole[8];
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
        // 時を走るあいだ: 中心へ向かって流れるぶれ
        if (uZm > .01) { vec3 acc = c; for (int i = 1; i < 7; i++) acc += tex((uv - .5) * (1. - float(i) * .03 * uZm) + .5); c = acc / 7.; }
        // 熱を採った跡: その場所が暗く抜け、ゆっくり戻る
        float hole = 0.; for (int j = 0; j < 8; j++) { vec4 hh = uHole[j]; float ag = uT - hh.z; if (ag > 0. && ag < 2.6) { vec2 dd = (vUv - hh.xy) * vec2(16., 9.) / 1.9; hole = max(hole, exp(-dot(dd, dd) * 1.6) * smoothstep(0., .5, ag) * (1. - smoothstep(1.1, 2.6, ag))); } }
        c *= 1. - hole * .72;
        c = mix(c, vec3(1.), uFl);
        // 抜き取り: 光の帯が上から下へ映像を読み、読んだところに細かい格子が残る
        if (uScan >= 0.) { float y = 1. - uScan, band = smoothstep(.05, 0., abs(vUv.y - y)), done = step(y, vUv.y) * (1. - uScan * .7);
          float g = max(step(.94, fract(vUv.x * 64.)), step(.9, fract(vUv.y * 36.))); c += vec3(.75, .95, 1.) * band * .9 + vec3(.6, .85, 1.) * g * done * .12; }
        if (!gl_FrontFacing) c *= .3;
        float rim = smoothstep(.3, 0., abs(d + .18)); c = c * (uDim * (.45 + .55 * uFace)) + uRim * rim * (.22 + uHi * .9);
        gl_FragColor = vec4(c * a, a); }`;
    let rootGeo: THREE.BufferGeometry, rootA: Float32Array, nodeGeo: THREE.BufferGeometry, nodeA: Float32Array, nodeS: Float32Array;
    const intros: { value: number }[] = [];
    let atls: THREE.Texture[] = [];
    // 熱の1コマを、読み込み済みのアトラスから切り出す（繋がりのカードの止め絵。別に読みに行くと間に合わない）
    const thumbs = new Map<number, string>(), tcv = document.createElement("canvas"); tcv.width = 192; tcv.height = 108; const tcx = tcv.getContext("2d");
    function thumbOf(id: number) { const got = thumbs.get(id); if (got) return got; const im = atls[Math.floor(id / 256)]?.image as HTMLImageElement | undefined;
      if (!im || !im.naturalWidth || !tcx) return ""; const k = id % 256, cw = im.naturalWidth / 16, ch = im.naturalHeight / 16;
      try { tcx.drawImage(im, (k % 16) * cw, Math.floor(k / 16) * ch, cw, ch, 0, 0, 192, 108); const u = tcv.toDataURL("image/jpeg", 0.86); thumbs.set(id, u); return u; } catch { return ""; } }
    const setTileFrame = (m: number, id: number) => { const u = tiles[m].mat.uniforms, k = id % 256; if (atls[Math.floor(id / 256)]) u.uAt.value = atls[Math.floor(id / 256)]; (u.uRect.value as THREE.Vector4).set((k % 16) / 16, 1 - (Math.floor(k / 16) + 1) / 16, 1 / 16, 1 / 16); };
    function buildCortex(atl: THREE.Texture[]) { atls = atl;
      const geo = new THREE.PlaneGeometry(1, 9 / 16), blank = new THREE.Texture();
      tiles = N.moments.map((mo, m) => { const id = mo.ctx[0], s = Math.floor(id / 256), k = id % 256;
        const mat = new THREE.ShaderMaterial({ vertexShader: TILE_V, fragmentShader: TILE_F, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
          uniforms: { uAt: { value: atl[s] || blank }, uVid: { value: blank }, uRect: { value: new THREE.Vector4((k % 16) / 16, 1 - (Math.floor(k / 16) + 1) / 16, 1 / 16, 1 / 16) }, uUseVid: { value: 0 }, uDim: { value: 1 }, uFace: { value: 1 }, uHi: { value: 0 }, uOp: { value: 0 }, uS: { value: 16 }, uBill: { value: 0 }, uRim: { value: new THREE.Color("#f4f2ec") }, uGl: { value: 0 }, uFl: { value: 0 }, uT: { value: 0 }, uScan: { value: -1 }, uZm: { value: 0 }, uHole: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1e6, 0)) } } });
        const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(MP[m].tile); mesh.lookAt(MP[m].tile.clone().add(MP[m].n)); mesh.frustumCulled = false; scene.add(mesh);
        return { m, mesh, mat, scale: 16, goal: 16, dim: 1, dimG: 1, lift: 0, liftG: 0, vid: -1, pos: MP[m].tile.clone(), off: V(), anim: null }; });
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
        vertexShader: `attribute vec3 col; attribute float a, sz; uniform float uPx, uIntro; varying vec3 vC; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = min(uPx * sz * 300. / -mv.z, uPx * 46.); vC = col; vA = a * uIntro; gl_Position = projectionMatrix * mv; }`,
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
      s.v.muted = !sound; const sl = s; sl.v.play().catch((e: Error) => { if (e?.name === "NotAllowedError" && sl.tile === tile) { sl.v.muted = true; sl.v.play().catch(() => {}); } });
      const show = () => { if (s!.tile === tile && mainTile !== tile) t.mat.uniforms.uVid.value = s!.tex; }; if (s.v.readyState >= 2) show(); else s.v.onloadeddata = show; }
    // 流さずに最初のコマで止めて待つ（旅で繋がりを見せている間）
    function holdOn(tile: number, src: string) { setPlaying([]); const t = tiles[tile]; const s = slots.find((x) => x.tile < 0) || slots[0]; if (s.tile >= 0) stopOn(s.tile);
      s.tile = tile; t.vid = slots.indexOf(s); if (s.src !== src) { s.src = src; s.v.src = src; } s.v.muted = true; s.v.pause(); try { s.v.currentTime = 0; } catch { /* */ } playing.add(tile);
      const show = () => { if (s.tile === tile && mainTile !== tile) t.mat.uniforms.uVid.value = s.tex; }; if (s.v.readyState >= 2) show(); else s.v.onloadeddata = show; }
    function stopOn(tile: number) { const t = tiles[tile]; if (!t || t.vid < 0) return; const s = slots[t.vid]; if (s.tile === tile) { s.v.pause(); s.v.muted = true; s.tile = -1; } t.vid = -1; }
    const playing = new Set<number>();
    // 流すものを決める。ここに無いものは、どこで流し始めたものでも必ず止める（旅で音つきで流した映像が止まらずに重なっていた）
    function setPlaying(list: { tile: number; src: string; sound?: boolean }[]) { const want = new Set(list.map((x) => x.tile)); slots.forEach((x) => { if (x.tile >= 0 && !want.has(x.tile)) stopOn(x.tile); else if (x.tile < 0 && !x.v.paused) { x.v.pause(); x.v.muted = true; } }); playing.clear(); list.slice(0, slots.length).forEach((x) => { playing.add(x.tile); playOn(x.tile, x.src, x.sound); }); }
    // 観ている1本（元の映像。熱の時刻はこの映像の時刻）
    const mainV = mkV(false); const mainTex = new THREE.VideoTexture(mainV); mainTex.colorSpace = THREE.SRGBColorSpace; let mainTile = -1, mainOk = false;
    mainV.addEventListener("loadeddata", () => { mainOk = true; });
    let scrub: null | { from: number; to: number; t0: number; c: number; lastSeek: number; dur: number; wait: number } = null, flash = 0, glitch = 0;
    // コマは seek が終わったところで1枚ずつ取る。最後（選んだ熱の時刻）のコマが取れたら着地する
    // seeked の時点ではまだコマが用意できていないことがある（readyState 1）。用意できたのを毎フレーム確かめてから取る
    let seekN = 0, seekedN = 0, spawnFail = "", wantGhost = false; mainV.addEventListener("seeked", () => { seekedN++; if (scrub && now >= scrub.t0) wantGhost = true; });
    function land() { if (!scrub) return; const c = scrub.c; scrub = null; glitch = 0; mainV.muted = false; mainV.playbackRate = reduce ? 1 : 0.6; mainV.play().catch(() => {}); afterScrub(c); }

    // ===== 段取り: 状態が変わるたびに番号を進め、古い予定は捨てる（戻った後に前の予定が走って崩れないように）=====
    let tok = 0; const queue: { at: number; fn: () => void; t: number }[] = [];
    const later = (sec: number, fn: () => void) => queue.push({ at: now + sec, fn, t: tok });
    const go = (v: View) => { tok++; queue.length = 0; rollG = 0; if (fly) { fly = null; syncCam(); }
      slots.forEach((x) => { if (!x.v.muted && x.tile >= 0) stopOn(x.tile); }); if (v.k !== "watch" && v.k !== "scrub") mainV.muted = true; mainV.playbackRate = 1; setV(v); };
    function runQueue() { for (let i = 0; i < queue.length; i++) { const q = queue[i]; if (q.t !== tok) { queue.splice(i--, 1); continue; } if (now >= q.at) { queue.splice(i--, 1); q.fn(); } } }

    // ===== 熱を採る（観始めてすぐ）=====
    //   光の帯が映像を上から読み、読んだところが光の粒にほどける。帯が熱の場所を通ると、そこの粒が螺旋を描いて流れ出し、
    //   言葉の場所でひとかたまりの滴になって、ふつふつと揺れ続ける。滴ができたところで言葉が一字ずつ滲み出る
    const PGX = 128, PGY = 72, PN = PGX * PGY, pK = new Float32Array(PN), pUvA = new Float32Array(PN * 2), pRA = new Float32Array(PN * 3);
    for (let y = 0; y < PGY; y++) for (let x = 0; x < PGX; x++) { const i = y * PGX + x; pUvA[i * 2] = (x + 0.5) / PGX; pUvA[i * 2 + 1] = (y + 0.5) / PGY; pRA[i * 3] = Math.random(); pRA[i * 3 + 1] = Math.random(); pRA[i * 3 + 2] = Math.random(); pK[i] = -1; }
    const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PN * 3), 3)); pGeo.setAttribute("aUv", new THREE.BufferAttribute(pUvA, 2)); pGeo.setAttribute("aR", new THREE.BufferAttribute(pRA, 3)); pGeo.setAttribute("aK", new THREE.BufferAttribute(pK, 1));
    const pMat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uVid: { value: mainTex }, uAt: { value: new THREE.Texture() }, uRect: { value: new THREE.Vector4() }, uUseVid: { value: 1 }, uC: { value: V() }, uRt: { value: V() }, uUp: { value: V() }, uBk: { value: V() }, uS: { value: 30 },
        uScan: { value: -1 }, uRd: { value: 0 }, uT: { value: 0 }, uOp: { value: 0 }, uPx: { value: R.getPixelRatio() }, uSel: { value: -1 }, uSelT: { value: 0 },
        uA: { value: Array.from({ length: 8 }, () => V()) }, uK0: { value: new Array(8).fill(1e6) }, uKC: { value: Array.from({ length: 8 }, () => new THREE.Color()) } },
      vertexShader: `attribute vec2 aUv; attribute vec3 aR; attribute float aK;
        uniform vec3 uC, uRt, uUp, uBk; uniform float uS, uScan, uRd, uT, uOp, uPx, uSel, uSelT; uniform vec3 uA[8]; uniform float uK0[8]; uniform vec3 uKC[8];
        varying vec2 vUv; varying vec3 vCol; varying float vMix, vA;
        void main(){ vUv = aUv;
          vec3 base = uC + uRt * (aUv.x - .5) * uS + uUp * (aUv.y - .5) * uS * .5625;
          float y0 = 1. - uScan, band = uScan < 0. ? 0. : exp(-pow((aUv.y - y0) / .022, 2.)), rd = uScan < 0. ? 0. : smoothstep(y0 - .01, y0 + .04, aUv.y) * uRd;
          float tw = step(.8, fract(aR.y * 17. + uT * (.5 + aR.x)));
          vec3 p = base + uBk * (band * (1.2 + aR.x * 2.6) + rd * (.2 + aR.x * .7));
          float a = band * 1.15 + rd * (.05 + .32 * tw), sz = 1. + band * 1.6; vMix = 0.; vec3 kc = vec3(1.);
          if (aK > -.5) { vec3 A = vec3(0.); float t0 = 1e6;
            for (int j = 0; j < 8; j++) { if (abs(float(j) - aK) < .5) { A = uA[j]; t0 = uK0[j]; kc = uKC[j]; } }
            float tt = (uT - t0 - aR.z * .55) / 1.25;
            if (tt > 0.) { float q = min(tt, 1.), e = q * q * (3. - 2. * q);
              vec3 ax = A - base; float L = length(ax); ax /= max(L, .001); vec3 n1 = normalize(cross(ax, uBk)), n2 = cross(ax, n1);
              vec3 mid = mix(base, A, .5) + uBk * (5. + L * .18) + uUp * 2.5; float s1 = 1. - e; vec3 pf = base * s1 * s1 + mid * 2. * s1 * e + A * e * e;
              float ang = aR.x * 6.2832 + e * 11. + uT * 1.4, rad = sin(3.1416 * e) * (.7 + aR.y * 2.4); pf += (n1 * cos(ang) + n2 * sin(ang)) * rad;
              float ph = uT * (1.5 + aR.y) + aR.x * 40.;
              vec3 drop = A + (n1 * sin(ph) + n2 * cos(ph * .8 + aR.z * 9.)) * (.5 + aR.z * 2.) * (1. + .3 * sin(uT * 3.1 + aR.y * 20.)) + uBk * (aR.y - .5) * 2.4;
              float settle = smoothstep(.8, 1.3, tt); p = mix(pf, drop, settle); a = mix(1., .4, settle); sz = mix(2.1, 1.3, settle); vMix = smoothstep(.05, .6, tt);
              if (uSel > -.5) {
                if (abs(aK - uSel) < .5) { float b = clamp((uT - uSelT - aR.z * .3) / .55, 0., 1.), eb = b * b * b; vec3 bk = uC + uRt * (aUv.x - .5) * uS * .35 + uUp * (aUv.y - .5) * uS * .2 + uBk * 1.5;
                  p = mix(p, bk, eb); a = mix(a, 1.3, b) * (1. - smoothstep(.85, 1., b)); sz *= 1. + b * 1.5; }
                else a *= max(.12, 1. - (uT - uSelT) * 2.5); } } }
          vCol = kc; vec4 mv = modelViewMatrix * vec4(p, 1.); gl_PointSize = uPx * sz * 150. / -mv.z; vA = a * uOp; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `precision highp float; uniform sampler2D uVid, uAt; uniform vec4 uRect; uniform float uUseVid; varying vec2 vUv; varying vec3 vCol; varying float vMix, vA;
        void main(){ float r = length(gl_PointCoord - .5) * 2.; float k = smoothstep(1., .12, r); if (k * vA < .004) discard;
          vec3 v = mix(texture2D(uAt, uRect.xy + vUv * uRect.zw).rgb, texture2D(uVid, vUv).rgb, uUseVid);
          vec3 c = mix(v * 1.35 + .07, vCol * 1.3 + v * .2, vMix); gl_FragColor = vec4(c * k * vA, k * vA); }` });
    { const pp = new THREE.Points(pGeo, pMat); pp.frustumCulled = false; pp.renderOrder = 1700; scene.add(pp); }
    const SCAN = 1.6; // 光の帯が映像を読み終えるまで
    // 位置は毎フレーム、いまのカメラの向きと板の大きさから決め直す（寄っている途中に始まっても、言葉が斜めにずれない）
    type Ext = { m: number; t0: number; ids: number[]; rc: [number, number][]; k0: number[]; col: number[]; row: number[]; rows: number; side: ("l" | "r" | "c")[]; shown: boolean[]; from: THREE.Vector3[]; to: THREE.Vector3[] };
    let ext: Ext | null = null;
    const domDim = (id: number) => N.ctx[id].w.indexOf(Math.max(...N.ctx[id].w));
    function startExtract(m: number) { const ids = N.moments[m].ctx.slice(0, 8), n = ids.length, pr = portrait(), rows = Math.ceil(n / 2), t = tiles[m];
      // 熱ごとに映像のどこから採るか（散らす）。帯がそこを通ったときに流れ出す
      const rc = ids.map((_, j) => [0.16 + ((j * 0.37 + 0.11) % 1) * 0.68, 0.2 + ((j * 0.53 + 0.3) % 1) * 0.6] as [number, number]);
      for (let i = 0; i < PN; i++) { const u = pUvA[i * 2], v = pUvA[i * 2 + 1]; let bk = -1, bd = 1; rc.forEach(([cu, cv], j) => { const d = Math.hypot((u - cu) * 16, (v - cv) * 9) / 1.9; if (d < bd) { bd = d; bk = j; } }); pK[i] = bk; }
      pGeo.attributes.aK.needsUpdate = true;
      const t0 = now + 0.15, k0 = rc.map(([, cv]) => t0 + (1 - cv) * SCAN + 0.1);
      ext = { m, t0, ids, rc, k0, col: ids.map((_, j) => j % 2), row: ids.map((_, j) => Math.floor(j / 2)), rows, side: ids.map((_, j) => (pr ? "c" : j % 2 ? "r" : "l")), shown: ids.map(() => false), from: ids.map(() => V()), to: ids.map(() => V()) };
      const u = pMat.uniforms; u.uSel.value = -1; u.uAt.value = t.mat.uniforms.uAt.value; (u.uRect.value as THREE.Vector4).copy(t.mat.uniforms.uRect.value as THREE.Vector4);
      for (let j = 0; j < 8; j++) { u.uK0.value[j] = j < n ? k0[j] : 1e6; (u.uKC.value[j] as THREE.Color).set(j < n ? DIMC[domDim(ids[j])] : "#ffffff"); (t.mat.uniforms.uHole.value[j] as THREE.Vector4).set(j < n ? rc[j][0] : 0, j < n ? rc[j][1] : 0, j < n ? k0[j] + 0.25 : 1e6, 0); } }
    // すぐ選ばれたときは、まだ流れ出していない熱を今すぐ滴にする
    function finishExtract() { if (!ext) return; const e = ext; e.k0 = e.k0.map((k) => Math.min(k, now - 2)); e.k0.forEach((k, j) => { pMat.uniforms.uK0.value[j] = k; (tiles[e.m].mat.uniforms.uHole.value[j] as THREE.Vector4).z = 1e6; }); e.shown = e.shown.map(() => true); }
    function updateExtract(dt: number) { const u = pMat.uniforms, on = !!ext && (st.k === "watch" || st.k === "scrub");
      u.uOp.value += ((on ? 1 : 0) - u.uOp.value) * Math.min(1, dt * 6); u.uT.value = now; u.uUseVid.value = mainOk ? 1 : 0;
      if (!ext) { stems([]); return; }
      const e = ext, pr = portrait(), S = tiles[e.m].scale, C = MP[e.m].tile, right = V(1, 0, 0).applyQuaternion(cam.quaternion), up = V(0, 1, 0).applyQuaternion(cam.quaternion), toCam = cam.getWorldDirection(V()).negate();
      u.uC.value.copy(C); u.uRt.value.copy(right); u.uUp.value.copy(up); u.uBk.value.copy(toCam); u.uS.value = S;
      const sc = (now - e.t0) / SCAN; u.uScan.value = sc < 0 ? -1 : Math.min(1.3, sc); u.uRd.value = sc < 0 ? 0 : Math.max(0, Math.min(1, 1.6 - sc * 0.8));
      let lines: { a: THREE.Vector3; b: THREE.Vector3; d: number; k: number }[] = [];
      e.ids.forEach((id, j) => { const sg = e.col[j] ? 1 : -1, [cu, cv] = e.rc[j];
        e.from[j].copy(C).addScaledVector(right, (cu - 0.5) * S).addScaledVector(up, (cv - 0.5) * S * 9 / 16);
        if (pr) e.to[j].copy(C).addScaledVector(right, sg * S * 0.25).addScaledVector(up, -(S * 9 / 32 + 4.5 + e.row[j] * 6));
        else e.to[j].copy(C).addScaledVector(right, sg * (S / 2 + 4)).addScaledVector(up, ((e.rows - 1) / 2 - e.row[j]) * (S * 9 / 16) / Math.max(e.rows - 1, 1) * 0.92);
        (u.uA.value[j] as THREE.Vector3).copy(e.to[j]).addScaledVector(right, pr ? 0 : sg * -2.2);
        const t = now - e.k0[j]; if (t > 1.45) e.shown[j] = true;
        if (t > 1.2) lines.push({ a: e.from[j], b: e.to[j], d: domDim(id), k: Math.min(1, (t - 1.2) * 2) * (st.k === "watch" ? 0.55 : 0.2) }); });
      if (!on || st.k === "scrub") lines = []; stems(lines);
      if (e.shown.every(Boolean) && st.k === "watch" && !st.ready) setV({ ...st, ready: true }); }

    // ===== 時を走る（熱を選んだとき）=====
    //   選んだ熱の滴が映像へ戻る → 映像が沈み、その時刻へ走るあいだ、通った本物のコマがフィルムのように一列に並んで横へ激しく流れる
    //   → 最後のコマ（選んだ熱の時刻）で止まり、それが映像いっぱいに広がる → 光と衝撃の輪 → その場面が少しゆっくり流れ出し、熱の名前が打ち込まれる
    const GN = 24, ghostGeo = new THREE.PlaneGeometry(1, 9 / 16);
    const BILL_V = `uniform float uS; varying vec2 vUv; void main(){ vUv = uv; vec4 c = modelViewMatrix * vec4(0.,0.,0.,1.); c.xy += position.xy * uS; gl_Position = projectionMatrix * c; }`;
    const ghosts = Array.from({ length: GN }, () => { const gc = document.createElement("canvas"); gc.width = 320; gc.height = 180; const g2 = gc.getContext("2d"); const tex = new THREE.CanvasTexture(gc); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { uTex: { value: tex }, uS: { value: 30 }, uOp: { value: 0 }, uTint: { value: new THREE.Color() } }, vertexShader: BILL_V,
        fragmentShader: `precision highp float; uniform sampler2D uTex; uniform float uOp; uniform vec3 uTint; varying vec2 vUv;
          void main(){ vec2 q = abs(vUv - .5) * vec2(16., 9.); float d = length(max(q - vec2(7.6, 4.1), 0.)) - .4; float a = (1. - smoothstep(-.05, .05, d)) * uOp; if (a < .003) discard;
            vec3 c = texture2D(uTex, vUv).rgb * 1.08 + vec3(1.) * smoothstep(.3, 0., abs(d + .15)) * .85; gl_FragColor = vec4(c, a); }` });
      const mesh = new THREE.Mesh(ghostGeo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1900; mesh.visible = false; scene.add(mesh);
      return { g2, tex, mat, mesh, t0: -1, k: 0 }; });
    let ghostI = 0, stripN = 0, stripHead = 0, landT = -1;
    function spawnGhost(tint: string) { if (mainTile < 0 || mainV.readyState < 2) { spawnFail = `rs${mainV.readyState} m${mainTile}`; return; } const g = ghosts[ghostI++ % GN]; try { g.g2?.drawImage(mainV, 0, 0, 320, 180); } catch (e) { spawnFail = String(e); return; }
      g.tex.needsUpdate = true; g.t0 = now; g.k = stripN++; g.mesh.visible = true; (g.mat.uniforms.uTint.value as THREE.Color).set(tint); }
    function clearStrip() { ghosts.forEach((g) => { g.t0 = -1; g.mesh.visible = false; }); stripN = 0; stripHead = 0; landT = -1; }
    // 衝撃の輪（2重）
    const rings = [0, 1].map(() => { const mat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uS: { value: 1 }, uOp: { value: 0 }, uC: { value: new THREE.Color() } }, vertexShader: BILL_V,
        fragmentShader: `precision highp float; uniform float uOp; uniform vec3 uC; varying vec2 vUv; void main(){ float d = length(vUv - .5) * 2.; float k = smoothstep(.07, 0., abs(d - .9)) + smoothstep(.5, 0., abs(d - .9)) * .25; if (d > 1.) discard; gl_FragColor = vec4((uC + .35) * k * uOp, k * uOp); }` });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.frustumCulled = false; mesh.renderOrder = 1950; mesh.visible = false; scene.add(mesh); return { mat, mesh }; });
    let ringT = -10, zoom = 0, shake = 0;
    function updateRush(dt: number) { const toCam = cam.getWorldDirection(V()).negate(), right = V(1, 0, 0).applyQuaternion(cam.quaternion), up = V(0, 1, 0).applyQuaternion(cam.quaternion);
      const C = mainTile >= 0 ? MP[mainTile].tile : null, S = mainTile >= 0 ? tiles[mainTile].scale : 30, dc = C ? cam.position.distanceTo(C) : 60;
      // フィルム: 新しいコマが右から入り、列ごと左へ跳ぶ。真ん中が今のコマ。止まったら最後のコマが映像いっぱいに広がる
      stripHead += (Math.max(0, stripN - 1) - stripHead) * Math.min(1, dt * 14); const pr = portrait(), lt = landT > 0 ? (now - landT) / 0.45 : -1, w = S * (pr ? 0.62 : 0.48), sp = pr ? w * 0.5625 * 1.15 : w * 1.08, ax = pr ? up : right, ox = pr ? right : up; // 縦の画面では、映像の下の空いたところへ流れ落ちる
      ghosts.forEach((g) => { if (g.t0 < 0) return; if (!C) { g.t0 = -1; g.mesh.visible = false; return; }
        const rel = g.k - stripHead, last = g.k === stripN - 1, cen = Math.max(0, 1 - Math.abs(rel)), arr = Math.min(1, (now - g.t0) / 0.12);
        let x = rel * sp, z = dc * 0.2 - rel * rel * 3.2, sc = w * (1 + cen * 0.3), op = Math.max(0, 1 - Math.abs(rel) * 0.2) * arr;
        if (lt > 0) { const e = Math.min(1, lt); if (last) { x *= 1 - e; z *= 1 - e; sc = sc + (S - sc) * e; op = 1 - Math.max(0, (lt - 0.7) / 0.5); } else { x *= 1 + e * 1.5; op *= 1 - e; } }
        if (op <= 0.003 || Math.abs(rel) > 6) { g.mesh.visible = false; if (lt > 1.2 || Math.abs(rel) > 6) g.t0 = -1; return; } g.mesh.visible = true;
        g.mesh.position.copy(C).addScaledVector(ax, x).addScaledVector(toCam, z).addScaledVector(ox, Math.sin(rel * 1.3 + g.k) * 0.4 * (1 - Math.min(1, Math.max(0, lt))));
        g.mat.uniforms.uS.value = sc; g.mat.uniforms.uOp.value = op; g.mesh.renderOrder = 1900 - Math.round(Math.abs(rel) * 10); });
      rings.forEach((r, k) => { const age = (now - ringT - k * 0.14) / 0.85; r.mesh.visible = !!C && age > 0 && age < 1; if (!r.mesh.visible || !C) return;
        r.mesh.position.copy(C).addScaledVector(toCam, 2); r.mat.uniforms.uS.value = S * (0.75 + Math.pow(age, 0.6) * (2.6 + k * 0.8)); r.mat.uniforms.uOp.value = Math.pow(1 - age, 2) * 1.2; }); }

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
    function reset() { setFat([]); wordOpG = 0; ext = null; beatG = 0; waveA = 0; stems([]); tiles.forEach((t) => { setTileFrame(t.m, N.moments[t.m].ctx[0]); t.liftG = 0; t.goal = 16; t.dimG = 1; (t.mat.uniforms.uRim.value as THREE.Color).set("#f4f2ec"); t.mat.uniforms.uHi.value = 0; }); }
    function releaseMain() { const t = tiles[mainTile]; if (t) { t.mat.uniforms.uUseVid.value = 0; t.mat.uniforms.uVid.value = new THREE.Texture(); } mainV.pause(); mainTile = -1; mainOk = false; scrub = null; }
    function free() { go({ k: "free" }); if (mainTile >= 0) releaseMain(); reset(); paintFibers(() => 1); setNodes(() => [0.7, 1]); setRoots(() => 0.35); setPlaying([]); liveAt = 0;
      camG.dist = portrait() ? 470 : 235; tgtG.set(0, 0, 0); }
    // 観る: その1本に寄り、元の映像を音つきで流す。寄りきったところで熱を抜き取る
    function watch(m: number, then?: () => void) {
      go({ k: "watch", m, ready: false }); reset(); setPlaying([]);
      if (mainTile !== m) { if (mainTile >= 0) releaseMain(); mainTile = m; mainOk = false; const md = media[N.moments[m].no];
        mainV.src = md?.detail || md?.[safari ? "loop" : "webm"] || ""; mainV.currentTime = 0; mainV.loop = true; mainV.muted = false; mainV.play().catch((e: Error) => { if (e?.name === "NotAllowedError" && mainTile === m) { mainV.muted = true; mainV.play().catch(() => {}); } });
        tiles[m].mat.uniforms.uVid.value = mainTex; }
      else { try { mainV.currentTime = 0; } catch { /* */ } mainV.muted = false; mainV.play().catch(() => {}); }
      const ids = new Set(N.moments[m].ctx);
      paintFibers((n) => (ids.has(N.links[n][0]) || ids.has(N.links[n][1]) ? 1 : 0)); setNodes((i) => (ids.has(i) ? [1.3, 2] : [0.1, 0.7])); setRoots((i) => (ids.has(i) ? 1 : 0.04));
      tiles.forEach((t) => { t.dimG = t.m === m ? 1 : 0.3; t.goal = t.m === m ? 30 : 16; });
      frameTile(m);
      const waitReady = () => { if (mainOk || now - t0w > 2.5) { startExtract(m); if (then) later(1.0, then); } else later(0.15, waitReady); }; const t0w = now; later(reduce ? 0.3 : 1.1, waitReady); }
    const fov0 = () => (portrait() ? 60 : 50); // 飛んでいる間は画角が広がるので、距離はいつも基準の画角で決める
    function frameTile(m: number, fill?: number) { const n = MP[m].n, S = 30, f = fill ?? (portrait() ? 0.94 : 0.5), tn = Math.tan((fov0() * Math.PI) / 360);
      camG.yaw = Math.atan2(n.x, n.z); camG.pitch = Math.max(-1, Math.min(1, Math.asin(n.y))); camG.dist = S / (f * 2 * tn * (portrait() ? innerWidth / innerHeight : Math.min(1.9, innerWidth / innerHeight))); tgtG.copy(MP[m].tile); }
    // 熱を選ぶ: 選んだ熱の滴が映像へ戻り、映像が寄って、本物のコマが剥がれて飛びながらその時刻へ走る（約2.4秒）→ 光と衝撃 → その場面が流れ、熱の名前が打ち込まれる → 熱狂接続中
    function heat(c: number) { const m = momOf[c];
      if (mainTile !== m || (st.k !== "watch" && st.k !== "scrub")) { watch(m, () => heat(c)); return; }
      if (st.k === "scrub") return;
      finishExtract(); go({ k: "scrub", m, c }); pMat.uniforms.uSel.value = ext ? ext.ids.indexOf(c) : -1; pMat.uniforms.uSelT.value = now;
      tiles.forEach((t) => { t.dimG = t.m === m ? 0.35 : 0.12; t.goal = t.m === m ? 30 : 16; }); frameTile(m, portrait() ? 1 : 0.6);
      mainV.pause(); clearStrip(); wantGhost = false; scrub = { from: mainV.currentTime, to: Math.max(0, N.ctx[c].t - 0.7), t0: now + (reduce ? 0.1 : 0.55), c, lastSeek: 0, dur: reduce ? 0.4 : 1.9, wait: -1 }; }
    // 間（実機の秒）。文字は読める時間だけ出す: 選んだ熱の場面 5.5 秒（名前と一文を出したまま最後まで流す）、熱狂接続中 3.2 秒、「熱狂、接続」2.6 秒、
    //   旅の1本ごとに 飛ぶ 5〜6.6 秒 → 繋がり 4.5 秒 → 流れる 4.2 秒（繋がりの組は流れている間も残す）
    const PACE = { scene: 5.5, scan: 3.2, linked: 2.6, link: 4.5, play: 4.2 };
    function afterScrub(c: number) { if (mainTile >= 0) { tiles[mainTile].dimG = 1; tiles[mainTile].dim = 1; } flash = 1.25; shake = 1.5; ringT = now; landT = now; hooks.current.slam?.(c); later(1.0, () => { mainV.playbackRate = 1; }); later(reduce ? 0.6 : PACE.scene, () => connect(c)); }
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
      grp++; if (nm) setName(nm); else { setName(""); setLines({}); } if (seed >= 0 && (!nm || !Object.keys(lines).length)) nameGroup({ seed, ids: [seed, ...items.map((x) => x.id)] }, !!nm);
      // 繋がる: 照合の波が一周したところで、行き先の線だけが選んだ熱から伸びる
      later(reduce ? 0.6 : PACE.scan, () => { const pj = new Set(items.map((x) => x.id)), pn = new Set(items.map((x) => (seed >= 0 ? linkOf(seed, x.id) : -1)));
        paintFibers((n) => (pn.has(n) ? 2 : 0), (n) => N.links[n][1] === seed); setFat(items.map((it) => ({ pts: pathTo(seed, it), d: it.d })), 1.2);
        setNodes((i) => (i === seed ? [1.6, 3.2] : pj.has(i) ? [1.4, 2.6] : [0.08, 0.7])); setRoots((i) => (i === seed || pj.has(i) ? 1 : 0.03));
        tiles.forEach((t) => { const it = items.find((x) => momOf[x.id] === t.m); t.dimG = it || (seed >= 0 && t.m === momOf[seed]) ? 1.1 : 0.22; (t.mat.uniforms.uRim.value as THREE.Color).set(it ? DIMC[it.d] : "#f4f2ec"); t.mat.uniforms.uHi.value = it ? 0.9 : 0; });
        if (st.k === "trip") setV({ ...st, i: -1 }); waveA = 0;
        later(reduce ? 0.6 : PACE.linked, () => hop(0)); }); }
    // 旅（＝ダイジェスト）。前の旅（cfca682: 外から入口へ降り、線を端から端まで通り、出口から出る。5.2秒）を土台に:
    //   出発の熱（選んだ熱、言葉なら中心の光）の入口へ外から降りる → その熱から相手の熱まで線の中を端から端まで通る（通る線と同じ見方の線が光り、出発側から光が走る。飛んでいる間は両端の言い方）
    //   → 相手の熱の出口から表へ抜け、横から回り込んで映像の正面へ → 繋がりを見せる（両端の熱・言い方・理由の一文。映像はまだ止まったまま）→ その熱の4秒が音つきで流れる → 次へ
    let fly: null | { pts: THREE.Vector3[]; t0: number; dur: number; look: THREE.Vector3; from: THREE.Vector3; lf: number; lk0: number; done: () => void } = null;
    function hop(i: number) { if (st.k !== "trip") return; const s = st, it = s.items[i]; if (!it) { toMap(); return; }
      beatG = 0; mainV.pause(); setPlaying([]);
      const m = momOf[it.id], t = tiles[m], S = 30, f = portrait() ? 0.94 : 0.56, tn = Math.tan((fov0() * Math.PI) / 360), dist = S / (f * 2 * tn * (portrait() ? innerWidth / innerHeight : Math.min(1.9, innerWidth / innerHeight)));
      const n = s.seed >= 0 ? linkOf(s.seed, it.id) : -1, P = pathTo(s.seed, it), A = P[0];
      const in0 = s.seed >= 0 ? A.clone().addScaledVector(normalAt(A), 60) : A.clone().add(cam.position.clone().sub(A).normalize().multiplyScalar(40));
      const T = MP[m].tile, nn = MP[m].n;
      // 線の終わり（相手の熱）から、その映像の中から抜け出るように手前へ引いて正面に収まる（表の暗がりを回り込まない）
      const end = T.clone().addScaledVector(nn, dist), exit = T.clone().addScaledVector(nn, dist * 0.22);
      const ctrl = [cam.position.clone(), in0, ...P, exit, end], pts = new THREE.CatmullRomCurve3(ctrl, false, "centripetal").getPoints(360);
      let len = 0; for (let k = 1; k < pts.length; k++) len += pts[k].distanceTo(pts[k - 1]);
      const dur = reduce ? 1.4 : Math.max(5.0, Math.min(6.6, 3.9 + len / 520));
      // 通る線と同じ見方の線を光らせ、出発の熱から光が走る（前の旅と同じ）。通る線は太く、カメラと一緒に伸びる
      if (n >= 0) paintFibers((x) => (x === n ? 2 : N.links[x][3] === it.d ? 3 : 1), (x) => N.links[x][0] !== s.seed); else paintFibers((x) => (N.links[x][3] === it.d ? 3 : 1));
      setFat([{ pts: P, d: it.d }], dur * 0.8); setNodes((x) => (x === it.id || x === s.seed ? [1.6, 3] : [0.4, 0.9])); setRoots((x) => (x === it.id || x === s.seed ? 1 : 0.15));
      tiles.forEach((x) => { x.goal = 16; x.liftG = 0; x.dimG = x.m === m ? 1.15 : 0.6; }); t.goal = S; setTileFrame(m, it.id); (t.mat.uniforms.uRim.value as THREE.Color).set(DIMC[it.d]); t.mat.uniforms.uHi.value = 0.9;
      setV({ ...s, i, ph: "fly" });
      fly = { pts, t0: now, dur, look: T.clone(), from: A.clone(), lf: 2.4 / (ctrl.length - 1), lk0: (ctrl.length - 3.9) / (ctrl.length - 1), done: () => arrive(s, i, n, dist) }; }
    function arrive(s: Extract<View, { k: "trip" }>, i: number, n: number, dist: number) { const it = s.items[i], m = momOf[it.id];
      camG.yaw = Math.atan2(MP[m].n.x, MP[m].n.z); camG.pitch = Math.max(-1, Math.min(1, Math.asin(MP[m].n.y))); camG.dist = dist; tgtG.copy(MP[m].tile); syncCam();
      // 繋がりを見せる間、映像はその熱の最初のコマで止めておく（先に読み込んでおく）
      if (n >= 0) paintFibers((x) => (x === n ? 2 : N.links[x][3] === it.d ? 1 : 0)); else paintFibers((x) => (N.links[x][3] === it.d ? 1 : 0)); holdOn(m, clipOf(it.id));
      setV({ ...s, i, ph: "link" }); later(reduce ? 0.8 : PACE.link, () => play(s, i)); }
    function play(s: Extract<View, { k: "trip" }>, i: number) { const it = s.items[i], m = momOf[it.id];
      setPlaying([{ tile: m, src: clipOf(it.id), sound: true }]); setV({ ...s, i, ph: "play" }); later(reduce ? 2 : PACE.play, () => hop(i + 1)); }
    // 飛んだ後・途中で止めた後に、今のカメラの位置と向きから回る動きへ戻す（跳ばないように）
    function syncCam() { const fwd = cam.getWorldDirection(V()), d = Math.max(40, cam.position.distanceTo(tgtG)); tgtC.copy(cam.position).addScaledVector(fwd, d); const o = cam.position.clone().sub(tgtC);
      cam0.dist = d; cam0.yaw = Math.atan2(o.x, o.z); cam0.pitch = Math.asin(Math.max(-1, Math.min(1, o.y / d))); }
    // 全体図: 引いて、集めた熱の映像が浮かび、線で結ばれた形を見せる → シェア
    function toMap() { if (st.k !== "trip") return; const s = st; go({ k: "map", seed: s.seed, q: s.q, items: s.items }); setPlaying([]);
      const ms = [...(s.seed >= 0 ? [momOf[s.seed]] : []), ...s.items.map((x) => momOf[x.id])];
      tiles.forEach((t) => { const it = s.items.find((x) => momOf[x.id] === t.m); const isSeed = s.seed >= 0 && t.m === momOf[s.seed]; if (it) setTileFrame(t.m, it.id); else if (isSeed) setTileFrame(t.m, s.seed); t.goal = it ? (portrait() ? 30 : 26) : isSeed ? (portrait() ? 32 : 28) : 15; t.liftG = it || isSeed ? 1 : 0; t.dimG = it || ms.includes(t.m) ? 1.05 : 0.18; });
      const pn = new Set(s.items.map((x) => (s.seed >= 0 ? linkOf(s.seed, x.id) : -1))); paintFibers((x) => (pn.has(x) ? 2 : 0));
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
      camG.yaw = yaw; camG.pitch = pitch; rollG = rl; camG.dist = Math.max(110, Math.max((ey + (pr ? 24 : 16)) / (tn * (pr ? 0.66 : 0.86)), (ex + (pr ? 20 : 14)) / (tn * asp)) * 1.04 + 20); tgtG.copy(c); }
    // 名前（AI）と、行き先ごとの理由の一文（選んだ熱の側から見た一文。API が返す）
    let grp = 0, gn = "", lines: Record<number, string> = {}; const setName = (n: string) => { gn = n; hooks.current.name?.(n); };
    const setLines = (l: Record<number, string>) => { lines = l; hooks.current.lines?.(l); };
    const linesOf = (items?: { id: number; line?: string }[]) => Object.fromEntries((items || []).filter((x) => x.line).map((x) => [x.id, x.line as string]));
    async function nameGroup(body: object, keepName = false) { const g = grp; try { const r = await fetch("/api/ctx/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json();
      if (g !== grp) return; if (j?.items) setLines(linesOf(j.items)); if (j?.name && !keepName) setName(j.name); } catch { /* 名前と一文が無くても進める */ } }
    // 熱狂を探す: 言葉が中心の光になり、同じく接続 → 旅
    async function search(q: string) { if (!q.trim()) return; go({ k: "search", q }); grp++; setName(""); setLines({}); if (mainTile >= 0) releaseMain(); reset(); setPlaying([]);
      paintFibers(() => 1); wordOpG = 1; camG.dist = portrait() ? 460 : 270; tgtG.set(0, 0, 0); beatG = 1; waveC.copy(WORDP); waveR = 0; waveA = 1; const t = tok;
      try { const r = await fetch("/api/ctx/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) }); const j = await r.json();
        if (!alive || t !== tok) return; if (!j?.items?.length) { beatG = 0; waveA = 0; setName("この言葉では見つかりませんでした"); return; }
        const seen = new Set<number>(), items: Item[] = (j.items as { id: number; dim: number }[]).filter((x) => N.ctx[x.id] && !seen.has(momOf[x.id]) && seen.add(momOf[x.id])).slice(0, 7).map((x) => ({ id: x.id, d: x.dim >= 0 ? x.dim : N.ctx[x.id].w.indexOf(Math.max(...N.ctx[x.id].w)) }));
        setLines(linesOf(j.items)); connect(-1, q, items, j.name || q);
      } catch { if (t === tok) { beatG = 0; waveA = 0; setName("この言葉では見つかりませんでした"); } } }
    function back() { if (st.k === "scrub" || (st.k === "watch")) { free(); return; } if ((st.k === "map" || st.k === "trip") && st.seed >= 0) { const c = st.seed; watch(momOf[c]); return; } free(); }

    // ===== 空間の文字 =====
    const pool: HTMLDivElement[] = []; let used = 0, rects: number[][] = []; const prj = V();
    function txt(cls: string, html: string, p: THREE.Vector3, o: { pri?: number; side?: "r" | "l" | "c"; va?: "above" | "below"; op?: number; data?: string } = {}) {
      let e = pool[used]; if (!e) { e = document.createElement("div"); tx.appendChild(e); pool[used] = e; } used++;
      type M = HTMLDivElement & { _w: number; _h: number }; const em = e as M;
      // 文字が同じで種類だけ変わるとき（選んだ・選ばなかった）は中身を作り直さない（滲み出しをやり直さない）
      if (e.dataset.h !== html) { e.dataset.h = html; e.dataset.c = cls; e.className = `bw-t ${cls}`; e.innerHTML = html; em._w = e.offsetWidth; em._h = e.offsetHeight; }
      else if (e.dataset.c !== cls) { e.dataset.c = cls; e.className = `bw-t ${cls}`; em._w = e.offsetWidth; em._h = e.offsetHeight; }
      if (e.dataset.v !== (o.data || "")) e.dataset.v = o.data || "";
      prj.copy(p).project(cam); let vis = prj.z < 1 && Math.abs(prj.x) < 1.05 && Math.abs(prj.y) < 1.05;
      const W = em._w, H = em._h, x = (prj.x * 0.5 + 0.5) * innerWidth, y = (-prj.y * 0.5 + 0.5) * innerHeight;
      const cy = (v: number) => Math.max(60, Math.min(innerHeight - H - 6, v));
      // va: 映像の上なら文字の下端を、下なら上端を、その点に合わせる（映像に掛からない）
      const y0 = o.va === "above" ? y - H - 2 : o.va === "below" ? y + 2 : y - H / 2;
      let bx = o.side === "c" ? x - W / 2 : o.side === "l" ? x - W - 8 : x + 8, by = cy(y0); bx = Math.max(10, Math.min(innerWidth - W - 10, bx));
      const hit = () => rects.some(([a, b, c, d]) => bx < a + c && bx + W > a && by < b + d && by + H > b);
      for (let t = 1; t <= 6 && vis && hit(); t++) by = cy(y0 + (o.va === "above" ? -1 : o.va === "below" ? 1 : t % 2 ? 1 : -1) * Math.ceil(o.va ? t : t / 2) * (H * 0.6 + 4));
      if (vis && hit() && (o.pri ?? 0) < 2) vis = false; if (vis) rects.push([bx, by, W, H]);
      const tf = `translate3d(${Math.round(bx)}px,${Math.round(by)}px,0)`, op = vis ? String(Math.round((o.op ?? 1) * 50) / 50) : "0", pe = vis && o.data ? "auto" : "none";
      if (e.style.transform !== tf) e.style.transform = tf; if (e.style.opacity !== op) e.style.opacity = op; if (e.style.pointerEvents !== pe) e.style.pointerEvents = pe; }
    const upV = () => V(0, 1, 0).applyQuaternion(cam.quaternion);
    function drawText() { used = 0; rects = [];
      const up = upV();
      // 抜き取った熱の言葉（観ているとき）
      if (ext && (st.k === "watch" || (st.k === "scrub" && now - pMat.uniforms.uSelT.value < 0.6))) { const sel = st.k === "scrub" ? st.c : -1; ext.ids.forEach((id, j) => { if (!ext!.shown[j] || (sel >= 0 && sel !== id)) return; const c = N.ctx[id], d = c.w.indexOf(Math.max(...c.w));
        txt(`hw ${sel === id ? "on" : sel >= 0 ? "off" : ""}`, `<span style="--c:${DIMC[d]}">${Array.from(c.title).map((ch, q) => `<i style="animation-delay:${q * 38}ms">${ch}</i>`).join("")}</span>`, ext!.to[j], { pri: 3, side: ext!.side[j], data: st.k === "watch" ? `h:${id}` : "" }); }); }
      // 全体図: 集めた熱の映像の上に、その熱の名前
      // 全体図: 名前は、集まりの真ん中から外へ向かう側に置く（重ならないように）。出発した熱は白い線
      if (st.k === "map") { const right = V(1, 0, 0).applyQuaternion(cam.quaternion), list = [...(st.seed >= 0 ? [{ id: st.seed, d: -1 }] : []), ...st.items];
        const sc = list.map((x) => { prj.copy(tiles[momOf[x.id]].mesh.position).project(cam); return [prj.x * innerWidth, prj.y * innerHeight]; }), cx = sc.reduce((a, q) => a + q[0], 0) / sc.length, cy = sc.reduce((a, q) => a + q[1], 0) / sc.length;
        list.forEach((x, k) => { const c = N.ctx[x.id], m = momOf[x.id], t = tiles[m]; let dx = sc[k][0] - cx, dy = sc[k][1] - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; const hz = false; // 名前は映像の上下に（押し合いの計算と揃える。横に置くと画面の端で映像に重なる）
          const a = t.mesh.position.clone().addScaledVector(hz ? right : up, hz ? Math.sign(dx) * (t.scale * 0.5 + 1.5) : (dy >= 0 ? 1 : -1) * (t.scale * 0.2813 + 0.8));
          txt(x.d < 0 ? "ht from" : "ht", `<b>${N.moments[m].sport}</b><span style="--c:${x.d < 0 ? "#f4f2ec" : DIMC[x.d]}">${c.title}</span>`, a, { pri: x.d < 0 ? 3 : 2, side: hz ? (dx > 0 ? "r" : "l") : "c", va: hz ? undefined : dy >= 0 ? "above" : "below", data: `w:${x.id}` }); }); }
      if ((st.k === "search" || (st.k === "trip" && st.seed < 0 && st.i < 0)) && "q" in st && st.q) txt("wd", st.q, WORDP.clone().addScaledVector(up, 8), { pri: 3, side: "c" });
      if (hoverM >= 0 && (st.k === "free" || (st.k === "map" && !st.items.some((x) => momOf[x.id] === hoverM) && !(st.seed >= 0 && momOf[st.seed] === hoverM)))) { const m = N.moments[hoverM], t = tiles[hoverM]; txt("mo", `<b>${m.sport}</b><span>${m.title}</span>`, t.mesh.position.clone().addScaledVector(up, t.scale * 0.2813 + 0.8), { pri: 3, side: "c", va: "above" }); }
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
      waveR = (now % 0.92) * 175; fiberMat.uniforms.uWave.value.set(waveC.x, waveC.y, waveC.z, waveR); fiberMat.uniforms.uWaveA.value += (waveA - fiberMat.uniforms.uWaveA.value) * Math.min(1, dt * 4); fiberMat.uniforms.uBeat.value = hb; fiberMat.uniforms.uLift.value += ((st.k === "trip" && st.i >= 0 ? 0.25 : 0) - fiberMat.uniforms.uLift.value) * Math.min(1, dt * 3);
      if (idle && !reduce && st.k === "free") { camG.yaw += dt * 0.05; camG.pitch = 0.2 + Math.sin(now * 0.11) * 0.22; }
      if (st.k === "trip" && st.i < 0) camG.yaw += dt * 0.12; // 接続中はゆっくり回り込む
      const k = 1 - Math.exp(-dt / (intro < 1 ? 1.1 : st.k === "trip" && st.i < 0 ? 0.9 : 0.55)), kp = 1 - Math.exp(-dt / 0.9); parC.x += (par.x - parC.x) * kp; parC.y += (par.y - parC.y) * kp;
      if (fly) { const f = fly, t = Math.min(1, (now - f.t0) / f.dur), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, L = f.pts.length - 1, fi = e * L, i0 = Math.floor(fi), u = fi / L;
        const p = f.pts[i0].clone().lerp(f.pts[Math.min(L, i0 + 1)], fi - i0); cam.position.lerp(p, t >= 1 ? 1 : Math.min(1, dt * 14));
        const lw = Math.min(1, Math.max(0, (u - f.lk0) / (1 - f.lk0) * 1.25)), lf = Math.min(1, Math.max(0, u / f.lf)); tmp.copy(f.from).lerp(f.pts[Math.min(L, i0 + 10)], lf * lf * (3 - 2 * lf)).lerp(f.look, lw * lw * (3 - 2 * lw)); cam.up.set(0, 1, 0); cam.lookAt(tmp);
        const wide = portrait() ? 74 : 64, fv = wide + ((portrait() ? 60 : 50) - wide) * lw; cam.fov += (fv - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
        if (t >= 1) { fly = null; f.done(); } }
      else { const f0 = portrait() ? 60 : 50; if (Math.abs(cam.fov - f0) > 0.02) { cam.fov += (f0 - cam.fov) * Math.min(1, dt * 5); cam.updateProjectionMatrix(); }
        cam0.yaw += (camG.yaw - cam0.yaw) * k; cam0.pitch += (camG.pitch - cam0.pitch) * k; cam0.dist += (camG.dist - cam0.dist) * k; tgtC.lerp(tgtG, k);
        const pw = st.k === "watch" || st.k === "scrub" || st.k === "trip" ? 0.03 : 0.1, yw = cam0.yaw - parC.x * pw, pt = Math.max(-1.3, Math.min(1.3, cam0.pitch + parC.y * pw * 0.6));
        cam.position.set(Math.sin(yw) * Math.cos(pt), Math.sin(pt), Math.cos(yw) * Math.cos(pt)).multiplyScalar(cam0.dist).add(tgtC); roll += (rollG - roll) * k; cam.up.set(0, 1, 0); cam.lookAt(tgtC); if (Math.abs(roll) > 1e-4) cam.rotateZ(roll); if (shake > 0.01) cam.position.add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake * 0.8)); }
      { const w = R.domElement.width / R.getPixelRatio(), h = R.domElement.height / R.getPixelRatio(), pr = portrait();
        const ox = pr ? 0 : st.k === "free" || st.k === "search" ? -0.13 : 0, oy = st.k === "free" || st.k === "search" ? (pr ? -0.05 : 0) : st.k === "watch" ? (pr ? 0.2 : 0.02) : st.k === "scrub" ? (pr ? 0.2 : 0.08) : st.k === "map" ? (pr ? 0.12 : 0.09) : st.k === "trip" && st.i >= 0 ? (pr ? 0.05 : 0.08) : 0;
        view.x += (ox - view.x) * k; view.y += (oy - view.y) * k; cam.setViewOffset(w, h, view.x * w, view.y * h, w, h); }
      fiberMat.uniforms.uNear.value = cam.position.length(); fiberMat.uniforms.uDen.value = Math.max(0.45, Math.min(1.2, Math.sqrt((Math.min(innerWidth, innerHeight * 1.8) / 1280) * (290 / Math.max(60, cam.position.distanceTo(tgtC))))));
      if (fat) (fat.geometry as LineSegmentsGeometry).instanceCount = Math.min(fatN, Math.ceil(fatN * Math.min(1, (now - fatT0) / fatDur)));
      // 時を走る（本物のコマを seek で飛び飛びに。山なりに激しくなり、着く直前に静まる）
      if (scrub && mainTile >= 0 && wantGhost && !mainV.seeking && mainV.readyState >= 2) { wantGhost = false; spawnGhost(DIMC[domDim(scrub.c)]); if (scrub.wait > 0) land(); }
      if (scrub && mainTile >= 0) { const sc0 = scrub, p = Math.max(0, Math.min(1, (now - sc0.t0) / sc0.dur));
        if (now >= sc0.t0) { const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2, pk = Math.sin(Math.PI * p);
          if (sc0.wait < 0 && mainOk && !mainV.seeking && !wantGhost && now - sc0.lastSeek > 0.045) { sc0.lastSeek = now; seekN++; try { mainV.currentTime = Math.max(0, sc0.from + (sc0.to - sc0.from) * e + (Math.random() - 0.5) * 0.6 * pk); } catch { /* まだ読めていない */ } }
          glitch = 0.1 + 0.9 * pk; zoom = pk; shake = Math.max(shake, 0.25 + pk * 0.8); }
        if (p >= 1 && sc0.wait < 0) { sc0.wait = now; wantGhost = false; try { mainV.currentTime = sc0.to; } catch { land(); } }
        else if (sc0.wait > 0 && now - sc0.wait > 0.9) land(); }
      else { glitch = Math.max(0, glitch - dt * 2.4); zoom = Math.max(0, zoom - dt * 3); }
      flash = Math.max(0, flash - dt * 1.7); shake = Math.max(0, shake - dt * 2.2);
      updateRush(dt);
      wordMat.uniforms.uOp.value += (wordOpG - wordMat.uniforms.uOp.value) * Math.min(1, dt * 3); wordMat.uniforms.uT.value = now;
      // 板
      const cp = cam.position;
      tiles.forEach((t) => { const u = t.mat.uniforms; t.dim += (t.dimG - t.dim) * k; t.lift += (t.liftG - t.lift) * Math.min(1, dt * 2.2);
        t.scale += (t.goal - t.scale) * k; const home = MP[t.m].tile; t.pos.copy(home).addScaledVector(MP[t.m].n, t.lift * 8).lerp(cp, t.lift * (portrait() ? 0.32 : 0.42)); t.mesh.position.copy(t.pos).add(t.off);
        const isMain = t.m === mainTile; const onTrip = st.k === "trip" && st.i >= 0 && momOf[st.items[st.i]?.id] === t.m;
        u.uS.value = t.scale * (1 + hb * 0.05); u.uDim.value = t.dim * (1 + hb * 0.25); u.uBill.value += ((t.lift > 0.3 || isMain || onTrip ? 1 : 0) - u.uBill.value) * Math.min(1, dt * 3);
        const face = MP[t.m].n.dot(tmp.copy(cp).sub(t.mesh.position).normalize()); u.uFace.value = Math.max(0, Math.min(1, face * 1.6 + 0.4));
        u.uOp.value = Math.min(1, ie * 1.4) * (t.lift > 0.5 || isMain || onTrip ? 1 : face < 0.05 ? 0.35 : 0.45 + 0.55 * Math.min(1, face * 1.6 + 0.2));
        if (!isMain && (st.k === "free" || st.k === "watch")) u.uHi.value = hoverM === t.m ? 1 : 0;
        const vOn = isMain && !(st.k === "trip" && st.i >= 0) ? (mainOk ? 1 : 0) : t.vid >= 0 && slots[t.vid].tile === t.m && slots[t.vid].v.readyState >= 2 ? 1 : 0; u.uUseVid.value += (vOn - u.uUseVid.value) * Math.min(1, dt * 4);
        u.uGl.value = isMain ? glitch : 0; u.uFl.value = isMain ? Math.min(1, flash) : 0; u.uZm.value = isMain ? zoom : 0; u.uT.value = now;
        if (isMain && ext && st.k === "watch") { const sc = (now - ext.t0) / SCAN; u.uScan.value = sc > 0 && sc < 1 ? sc : -1; } else u.uScan.value = -1;
        t.mesh.renderOrder = onTrip ? 1600 : isMain ? 1500 : face < 0.05 && t.lift < 0.5 ? -10 : 10 + Math.round(1000 - cp.distanceTo(t.mesh.position)); });
      relax(dt);
      if (st.k === "free" && now - liveAt > 3 && intro > 0.9) { liveAt = now; const cand = tiles.map((t) => { prj.copy(t.mesh.position).project(cam); const face = MP[t.m].n.dot(tmp.copy(cp).sub(t.mesh.position).normalize()); return { t, s: face - Math.hypot(prj.x, prj.y) * 0.8 }; }).sort((a, b) => b.s - a.s).slice(0, portrait() ? 2 : 3);
        setPlaying(cand.map(({ t }) => ({ tile: t.m, src: clipOf(N.moments[t.m].ctx[0]) }))); }
      updateExtract(dt);
      drawText();
      if (draw) render(); }
    // 全体図: 浮かんだ映像どうしが画面で重ならないよう、互いに押し合ってずれる（名前の分の高さも見込む）
    function relax(dt: number) { const on = st.k === "map", L = on ? tiles.filter((t) => t.liftG > 0.5) : [];
      if (L.length > 1) { const R = V(1, 0, 0).applyQuaternion(cam.quaternion), U = V(0, 1, 0).applyQuaternion(cam.quaternion), tn = Math.tan((cam.fov * Math.PI) / 360);
        // 名前の幅も見込む（名前は映像より広い）
        const lab = (m: number) => { const s0 = st as Extract<View, { k: "map" }>, it = s0.items.find((x) => momOf[x.id] === m); return N.ctx[it ? it.id : s0.seed]?.title.length || 8; }, cw = portrait() ? 6.4 : 7.4;
        const P = L.map((t) => { prj.copy(t.pos).project(cam); const kk = innerHeight / (2 * Math.max(1, cam.position.distanceTo(t.pos)) * tn); return { x: (prj.x * 0.5 + 0.5) * innerWidth, y: (-prj.y * 0.5 + 0.5) * innerHeight, hw: Math.max(t.scale * 0.5 * kk, lab(t.m) * cw) + 6, hh: t.scale * 0.2813 * kk + (portrait() ? 42 : 30), kk, ox: 0, oy: 0 }; });
        const bot = innerHeight - (portrait() ? 170 : 120), clamp = () => P.forEach((q) => { q.ox = Math.max(q.hw + 4, Math.min(innerWidth - q.hw - 4, q.x + q.ox)) - q.x; q.oy = Math.max(q.hh + 60, Math.min(bot - q.hh, q.y + q.oy)) - q.y; });
        for (let it = 0; it < 16; it++) { for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const a = P[i], b = P[j], dx = b.x + b.ox - a.x - a.ox, dy = b.y + b.oy - a.y - a.oy, px = a.hw + b.hw - Math.abs(dx), py = a.hh + b.hh - Math.abs(dy);
          if (px > 0 && py > 0) { if (px < py) { const m = (px / 2) * (dx >= 0 ? 1 : -1); a.ox -= m; b.ox += m; } else { const m = (py / 2) * (dy >= 0 ? 1 : -1); a.oy -= m; b.oy += m; } } }
          clamp(); }
        L.forEach((t, i) => { const q = P[i]; tmp.copy(R).multiplyScalar(q.ox / q.kk).addScaledVector(U, -q.oy / q.kk); t.off.lerp(tmp, Math.min(1, dt * 5)); }); }
      tiles.forEach((t) => { if (!on || t.liftG <= 0.5) t.off.multiplyScalar(Math.max(0, 1 - dt * 5)); }); }
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
      buildCortex(atl); buildFibersSync(); atl.forEach((_, s) => { const im = new Image(); im.src = `${BASE}/ctx/atlas${s}.jpg`; });
      setNet(N); ready = true; cam0.dist = portrait() ? 1100 : 820; cam0.yaw = camG.yaw - 1.5; cam0.pitch = 0.95; camG.dist = portrait() ? 470 : 235;
      // シェアされたリンク: 接続から旅が始まり、全体図で終わる
      if (shared?.i?.length) { const s = shared.s ?? -1, js = shared.i.filter((x) => x !== s);
        later(2.2, () => { const items: Item[] = s >= 0 ? ids2items(s, js) : shared.i.map((id) => ({ id, d: N.ctx[id].w.indexOf(Math.max(...N.ctx[id].w)) })); connect(s, shared.q, items, shared.n); }); }
    })();

    api.current = { watch: (m) => watch(m), heat, search: (q) => { search(q); }, back, next: () => { if (st.k !== "trip" || st.i < 0 || fly) return; const s = st; go({ ...s }); if (s.ph === "link") play(s, s.i); else hop(s.i + 1); }, skip: () => { if (st.k === "trip") { fly = null; toMap(); } },
      replay: () => { if (st.k === "map") { const s = st; connect(s.seed, s.q, s.items, gn); } }, thumb: thumbOf };
    (window as unknown as { __bw: object }).__bw = { st: () => st, watch, heat, search, back, next: () => api.current?.next(), skip: () => api.current?.skip(), replay: () => api.current?.replay(), manual: (on: boolean) => { manual = on; }, adv: (s: number) => { const n = Math.max(1, Math.round(s * 30)); for (let i = 0; i < n; i++) update(1 / 30, i === n - 1); }, find: (t: string) => N.ctx.findIndex((c) => c.title === t), momOf: (c: number) => momOf[c], queue: () => queue.length,
      tiles: () => tiles.map((t) => { prj.copy(t.mesh.position).project(cam); const face = MP[t.m].n.dot(tmp.copy(cam.position).sub(t.mesh.position).normalize()); return { m: t.m, x: (prj.x * 0.5 + 0.5) * innerWidth, y: (-prj.y * 0.5 + 0.5) * innerHeight, face, op: t.mat.uniforms.uOp.value }; }), now: () => now, strip: () => ({ seekN, seekedN, spawnFail, n: stripN, head: +stripHead.toFixed(2), vis: ghosts.filter((g) => g.mesh.visible).length, scrub: scrub ? { wait: scrub.wait, p: +((now - scrub.t0) / scrub.dur).toFixed(2) } : null, seeking: mainV.seeking, rs: mainV.readyState, ok: mainOk }),
      media: () => { const vs = [mainV, ...slots.map((x) => x.v)]; return { audible: vs.filter((v) => !v.paused && !v.muted).length, playing: vs.filter((v) => !v.paused).length }; } };
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener("resize", resize); tx.removeEventListener("click", onTx); pool.forEach((e) => e.remove()); document.removeEventListener("visibilitychange", vis); slots.forEach((s) => { s.v.pause(); s.v.src = ""; }); mainV.pause(); mainV.src = ""; R.dispose(); el.removeChild(R.domElement); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 画面の文字と操作 =====
  useEffect(() => { hooks.current.view = (v) => setView(v); hooks.current.slam = (c) => setSlam({ c, key: Date.now() }); hooks.current.name = (n) => setGname(n); hooks.current.lines = (l) => setLines(l); });
  useEffect(() => { if (view.k !== "scrub") setSlam(null); }, [view.k]);
  // 名前の打ち込みは、場面が終わって引くとき（状態が変わるとき）に消す。実時間のタイマーで消すと、重い端末では場面の途中で消える
  // 接続中の数（照らし合わせた熱が数え上がる）
  const [scan, setScan] = useState(0);
  const scanning = view.k === "search" || (view.k === "trip" && view.i === -2);
  useEffect(() => { if (!scanning) { if (view.k !== "trip") setScan(0); return; } let n = 0; const id = setInterval(() => { n = Math.min(402, n + 6 + Math.floor(Math.random() * 5)); /* 約2.8秒かけて数え上がる */ setScan(n); if (n >= 402) clearInterval(id); }, 55); return () => clearInterval(id); }, [scanning]); // eslint-disable-line react-hooks/exhaustive-deps
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
      {N && slam && (() => { const c = N.ctx[slam.c], d = c.w.indexOf(Math.max(...c.w)); return <div className="bw-slam" key={slam.key} style={{ ["--c" as string]: DIMC[d] }}><h2>{Array.from(c.title).map((ch, i) => <i key={i} style={{ animationDelay: `${i * 45}ms` }}>{ch}</i>)}</h2><span className="bar" /><p>{c.line}</p></div>; })()}
      {N && ((view.k === "trip" && view.i < 0) || view.k === "search") && (
        <div className={`bw-conn ${view.k === "trip" && view.i === -1 ? "done" : ""}`}>
          <div className="s">{view.k === "trip" && view.seed >= 0 ? N.ctx[view.seed].title : `「${view.q}」`}</div>
          <div className="pulse"><i /><i /><i /></div>
          <div className="t">{view.k === "trip" && view.i === -1 ? "熱狂、接続" : "熱狂接続中"}<em>{view.k === "trip" && view.i === -1 ? "" : "..."}</em></div>
          <div className="n">{view.k === "trip" && view.i === -1 ? <><b>{view.items.length}</b>つの熱が、<b>{sports(view.items)}</b>つの競技から</> : <><b>{scan}</b> / {N.ctx.length} の熱と照らし合わせています</>}</div>
        </div>)}
      {N && view.k === "trip" && view.i >= 0 && stop && (() => { const c = N.ctx[stop.id], m = momOfC(stop.id)!, d = stop.d, sd = view.seed >= 0 ? N.ctx[view.seed] : null, sm = view.seed >= 0 ? momOfC(view.seed) : null;
        const from = sd ? sd.v[d] || "" : "", to = c.v[d] || "", why = lines[stop.id] && lines[stop.id] !== c.title ? lines[stop.id] : c.line; // AI の一文が名前と同じなら、その熱の一文
        return (
        <div className="bw-stop" style={{ ["--c" as string]: DIMC[d] }} onClick={() => api.current?.next()}>
          <div className="bar">{view.items.map((_, i) => <i key={i} className={i < view.i ? "done" : i === view.i ? "now" : ""} />)}</div>
          <div className={`bw-pair ph-${view.ph || "fly"}`} key={`p${view.i}`}>
            <div className="e a">{sd && <Thumb id={view.seed} src={api.current?.thumb(view.seed)} />}<div>{sd ? <><small>{sm!.sport}</small><b>{sd.title}</b>{from && <em>{from}</em>}</> : <b className="q">{`「${view.q}」`}</b>}</div></div>
            <div className="w"><span /></div>
            <div className="e b"><Thumb id={stop.id} src={api.current?.thumb(stop.id)} /><div><small>{m.sport}</small><b>{c.title}</b>{to && <em>{to}</em>}</div></div>
            <p className="why">{why}</p>
          </div>
          <button className="skip" onClick={(e) => { e.stopPropagation(); api.current?.skip(); }}>全体を見る</button>
        </div>); })()}
      {N && view.k === "map" && !share && (
        <section className="bw-map"><div className="g"><b>{gname || (view.q ? `「${view.q}」` : view.seed >= 0 ? N.ctx[view.seed].title : " ")}</b><span>{view.items.length}の熱が、{sports(view.items)}つの競技から集まりました</span></div>
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

// 熱の1コマ（アトラスから切り出す）
function Thumb({ id, src }: { id: number; src?: string }) { const k = id % 256; return src ? <span className="th" style={{ backgroundImage: `url(${src})`, backgroundSize: "cover" }} /> : <span className="th" style={{ backgroundImage: `url(${BASE}/ctx/atlas${Math.floor(id / 256)}.jpg)`, backgroundPosition: `${((k % 16) / 15) * 100}% ${(Math.floor(k / 16) / 15) * 100}%` }} />; }

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
.bw-t.hw span{animation:bwdrop .9s cubic-bezier(.2,.9,.25,1.15) both;display:inline-block;font-size:15px;font-weight:900;letter-spacing:.02em;padding:8px 14px;border-radius:999px;background:rgba(6,8,13,.86);border:1px solid color-mix(in srgb,var(--c) 70%,transparent);box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 24px color-mix(in srgb,var(--c) 25%,transparent);transition:background .2s,color .2s,transform .2s}
.bw-t.hw:hover span{background:var(--c);color:#0a0a0a}
.bw-t.hw.on span{background:var(--c);color:#0a0a0a}
.bw-t.hw.off span{opacity:.25!important}
.bw-t.hw span i{font-style:normal;display:inline-block;animation:bwch .45s cubic-bezier(.2,.8,.2,1) both}
@keyframes bwdrop{0%{transform:scale(.15);opacity:0;filter:blur(12px)}50%{opacity:1;filter:none}70%{transform:scale(1.07)}100%{transform:none;opacity:1}}
@keyframes bwch{0%{opacity:0;transform:translateY(.55em) scale(1.6);filter:blur(6px)}100%{opacity:1;transform:none;filter:none}}
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
/* 熱の名前が打ち込まれる（衝撃のあと） */
.bw-slam{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 8vh);z-index:7;display:flex;flex-direction:column;align-items:center;pointer-events:none;text-shadow:0 4px 30px rgba(0,0,0,.9),0 0 3px rgba(0,0,0,.9);padding:0 20px}
.bw-slam h2{margin:0;font-size:clamp(34px,5.6vw,80px);font-weight:900;letter-spacing:.02em;line-height:1.1;text-align:center}
.bw-slam h2 i{font-style:normal;display:inline-block;animation:bwslamch .55s cubic-bezier(.2,1.4,.3,1) both}
.bw-slam .bar{display:block;height:4px;width:min(440px,60vw);background:var(--c);margin-top:12px;transform-origin:center;animation:bwbar .7s .35s cubic-bezier(.2,.8,.2,1) both;box-shadow:0 0 24px var(--c)}
.bw-slam p{margin:12px 0 0;max-width:640px;text-align:center;font-size:clamp(13px,1.3vw,17px);font-weight:700;line-height:1.6;color:rgba(244,242,236,.92);animation:bwf .6s .75s ease both}
@keyframes bwslamch{0%{opacity:0;transform:scale(2.8) translateY(-.15em);filter:blur(12px)}55%{opacity:1;filter:none}100%{opacity:1;transform:none}}
@keyframes bwbar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
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
/* 旅の1本ごとの組（飛ぶ→繋がり→流れる で同じ組のまま中身が出揃う） */
.bw-pair{position:absolute;left:0;right:0;margin:0 auto;bottom:calc(env(safe-area-inset-bottom,0px) + 6vh);width:min(940px,calc(100% - 28px));display:grid;grid-template-columns:1fr 110px 1fr;align-items:center;pointer-events:none;text-shadow:0 2px 16px rgba(0,0,0,.95);animation:bwf .7s .3s ease both}
.bw-pair .e{display:flex;align-items:center;gap:12px;min-width:0;transition:gap .6s}.bw-pair .a{flex-direction:row-reverse;text-align:right}
.bw-pair .th{flex:none;width:112px;height:63px;border-radius:7px;background-size:1600% 1600%;box-shadow:0 0 0 2px var(--c),0 8px 24px rgba(0,0,0,.6);transition:width .7s cubic-bezier(.2,.8,.2,1),opacity .7s}
.bw-pair small{display:block;font-size:10.5px;font-weight:900;letter-spacing:.2em;color:#f7ff3c}
.bw-pair b{display:block;font-weight:900;line-height:1.3;margin-top:2px;max-height:3em;overflow:hidden;transition:opacity .7s .3s,max-height .7s}
.bw-pair .a b{font-size:clamp(14px,1.35vw,17px);color:rgba(244,242,236,.88)}.bw-pair .a b.q{font-size:clamp(18px,2vw,24px);color:#f4f2ec;max-height:none;opacity:1}
.bw-pair .b b{font-size:clamp(20px,2.3vw,30px)}
.bw-pair em{display:inline-block;font-style:normal;font-size:clamp(13px,1.3vw,16px);font-weight:800;color:#0a0a0a;background:var(--c);border-radius:4px;padding:3px 9px;margin-top:6px;text-shadow:none}
.bw-pair .w{height:3px;position:relative;margin:0 10px;overflow:hidden;background:color-mix(in srgb,var(--c) 30%,transparent)}
.bw-pair .w span{position:absolute;top:0;bottom:0;left:-35%;width:35%;background:#fff;filter:blur(1px);animation:bwrun 1.4s linear infinite}
.bw-pair:not(.ph-fly) .w{background:var(--c);box-shadow:0 0 16px var(--c)}.bw-pair:not(.ph-fly) .w span{display:none}
.bw-pair .why{grid-column:1/-1;margin:16px auto 0;max-width:680px;text-align:center;font-size:clamp(14px,1.45vw,18px);font-weight:700;line-height:1.6;color:#f4f2ec;opacity:0;transform:translateY(6px);transition:opacity .7s .8s,transform .7s .8s}
.bw-pair:not(.ph-fly) .why{opacity:1;transform:none}
/* 飛んでいる間は両端の言い方だけ（止め絵と名前は着いてから） */
.bw-pair.ph-fly .e{gap:0}.bw-pair.ph-fly .th{width:0;opacity:0}.bw-pair.ph-fly b:not(.q){opacity:0;max-height:0}
@keyframes bwrun{to{left:100%}}
@keyframes bwrunv{to{top:100%}}
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
  .bw-slam{bottom:calc(env(safe-area-inset-bottom,0px) + 14vh)}.bw-slam h2{font-size:30px}.bw-slam p{font-size:13px}
  .bw-stop .bar{top:calc(env(safe-area-inset-top,0px) + 56px)}.bw-stop .skip{top:calc(env(safe-area-inset-top,0px) + 70px)}
  .bw-pair{grid-template-columns:1fr;gap:6px;bottom:calc(env(safe-area-inset-bottom,0px) + 3vh);width:calc(100% - 24px)}.bw-pair .a{flex-direction:row;text-align:left}
  .bw-pair .w{height:22px;width:3px;margin:0 0 0 47px}.bw-pair .w span{top:-35%;left:0;right:0;width:auto;height:35%;animation:bwrunv 1.4s linear infinite}
  .bw-pair .th{width:96px;height:54px}.bw-pair .b b{font-size:19px}.bw-pair .why{font-size:13.5px;margin-top:10px}
  .bw-map{flex-direction:column;align-items:stretch;gap:12px;width:calc(100% - 20px);bottom:calc(env(safe-area-inset-bottom,0px) + 10px)}.bw-map .row{justify-content:stretch}.bw-map .row .pill{flex:1}
}
`;

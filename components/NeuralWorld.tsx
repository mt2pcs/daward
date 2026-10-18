"use client";
// 熱狂の神経系（体験の本体・2026-10-18 合意のロジック）。
// 空間: 100の瞬間 = 細胞体、その瞬間を超分解した熱狂の文脈 = 細胞体から伸びる突起の先の細胞、文脈どうしの響き合い = 線維（全部ある）。
// 旅: 細胞体を押す → カメラが飛び込み、その瞬間が目の前で流れ、映像が楔に割れて文脈の細胞へ飛ぶ（分解）
//   → 文脈を押す → カメラが引き、その文脈から線維が次々と点いて神経系全体へ探索が伝わる（/api/ctx/digest が全文脈と8次元で照らし合わせる）
//   → 響き合った瞬間が金の線維で結ばれ、名前が付き、カメラがその線維を辿って1つずつ飛び、各文脈の4秒が流れる（ダイジェスト）
//   → 最後に全体を引いて見せ、リンクでシェア（/d/<code>）。言葉を投げると、言葉が空間の中心に生まれて同じ探索が走る。
// 位置の意味: 細胞体どうしの近さ = 響き合いの多さ、突起の向き = その文脈が繋がる相手の方向。
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getCrowd } from "@/lib/crowd";
import { sfx } from "@/lib/sfx";

const BASE = "https://storage.googleapis.com/e-mooments-assets";
// 次元ごとの色（ロゴの画素から採った色）: 背負っていたもの/時/関係/感情の出方/落差/到達/受け止める側/体
const DIM_COLOR = ["#ff3366", "#ffee55", "#4de6ff", "#ff8866", "#ff1a26", "#dff257", "#66ccff", "#dd8820"];
const COLD = "#33435e";
const EX = ["最後の花道", "誰かのために", "負けた側の涙", "親父", "老いてなお", "報われた日"];
const SEG = 10;

type Ctx = { id: number; no: string; title: string; line: string; who: string; t: number; w: number[]; v: string[]; p: number[]; dn?: Record<string, [number, number][]>; r?: number };
type Mom = { no: string; title: string; sport: string; ctx: number[]; p: number[] };
type Net = { dims: string[]; moments: Mom[]; ctx: Ctx[]; links: [number, number, number, number][]; regions: { name: string; ids: number[]; at: number[] }[] };
export type Digest = { name: string; seedTitle: string; seedLine?: string; items: { id: number; line: string; dim: number; s: number }[]; scanned: number; resonated: number; seed?: number; q?: string };
export type MediaMap = Record<string, { webm?: string; loop?: string }>;
// ワンタップは必ずロックオン（lock）＝押したものが中心になり、繋がるものが周りに集まって一斉に流れる（瞬間なら分解された文脈、文脈なら一つの見方で響き合う文脈）。
// 下の見方のボタンで周りが入れ替わる（チャンネルを替える）。周りを押すとそこへ飛び、それが中心になる＝ザッピング。音つきで観る（watch）、この熱で探す（explore）
type Stage =
  | { k: "free" }
  | { k: "lock"; kind: "m" | "c"; id: number; dim?: number }
  | { k: "watch"; kind: "m" | "c"; id: number }
  | { k: "explore"; seed?: number; q?: string }
  | { k: "digest"; d: Digest; i: number }
  | { k: "end"; d: Digest };
type Hud = { counter?: { scanned: number; resonated: number; lit: number }; title?: string; sub?: string; line?: string; big?: string };

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// 細胞: 1秒のコマを円い膜に入れる（縁はやわらかく、状態は縁の色で）
const CELL_FRAG = `precision highp float; varying vec2 vUv;
uniform sampler2D uMap; uniform vec4 uRect; uniform float uOp; uniform float uHas; uniform float uRim; uniform vec3 uRimC; uniform float uDim; uniform float uDot; uniform vec3 uDotC;
void main(){ vec2 q = vUv * 2.0 - 1.0; float r = length(q); if (r > 1.0) discard;
  vec2 iu = vec2(0.5 + q.x * 0.5 * 0.5625 * 1.15, 0.5 + q.y * 0.5 * 1.0);
  vec3 c = uHas > 0.5 ? texture2D(uMap, uRect.xy + clamp(iu, 0.0, 1.0) * uRect.zw).rgb : vec3(0.18);
  c *= uDim;
  float rim = smoothstep(0.80, 0.92, r) * (1.0 - smoothstep(0.95, 1.0, r));
  c = mix(c, uRimC, rim * uRim);
  c = mix(c, uDotC, uDot);
  float a = uOp * mix(smoothstep(1.0, 0.9, r), smoothstep(0.5, 0.0, r) * 0.9, uDot);
  gl_FragColor = vec4(c * a, a); }`;
// 目の前の映像（と、それが割れた楔）
const SCREEN_FRAG = `precision highp float; varying vec2 vUv;
uniform sampler2D uMap; uniform float uOp; uniform float uHas; uniform float uA0; uniform float uA1; uniform float uWedge;
void main(){ vec2 q = vUv - 0.5;
  if (uWedge > 0.5) { float a = atan(q.y * 0.5625, q.x); float d = mod(a - uA0 + 12.566370, 6.283185); if (d > uA1 - uA0) discard; }
  float e = smoothstep(0.0, 0.015, vUv.x) * smoothstep(1.0, 0.985, vUv.x) * smoothstep(0.0, 0.026, vUv.y) * smoothstep(1.0, 0.974, vUv.y);
  vec3 c = texture2D(uMap, vUv).rgb;
  float a = uOp * e * uHas; gl_FragColor = vec4(c * a, a); }`;
// 線維: 冷たい灰青の絹。信号が通ると、通ったところから響き合いの次元の色へ変わる（発光ではなく色と不透明度だけ）
const FIBER_VERT = `attribute float aU; attribute float aStart; attribute float aStr; attribute float aDim; attribute float aRev; attribute float aKeep;
uniform float uTime; uniform float uFade; uniform float uBase; uniform vec3 uCol[8]; uniform vec3 uCold; uniform float uSpeed;
varying vec3 vC; varying float vA;
void main(){ float u = aRev > 0.5 ? 1.0 - aU : aU;
  float lit = clamp((uTime - aStart) * uSpeed - u, 0.0, 1.0); lit = lit * lit * (3.0 - 2.0 * lit);
  float k = lit * (aKeep > 0.5 ? 1.0 : 1.0 - uFade);
  vec3 warm = uCol[0]; for (int i = 1; i < 8; i++) { if (abs(aDim - float(i)) < 0.5) warm = uCol[i]; }
  vC = mix(uCold, warm, k);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float fog = clamp(1.0 - (-mv.z - 120.0) / 520.0, 0.18, 1.0);
  vA = mix(uBase * (0.35 + 0.65 * aStr), 0.25 + 0.6 * aStr, k) * fog;
  gl_Position = projectionMatrix * mv; }`;
const FIBER_FRAG = `precision highp float; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC, vA); }`;

const enc = (o: object) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export default function NeuralWorld({ media, startNo, shared }: { media: MediaMap; startNo?: string; shared?: { n: string; s?: number; q?: string; i: number[]; t?: number[] } }) {
  const host = useRef<HTMLDivElement>(null), lblHost = useRef<HTMLDivElement>(null);
  const api = useRef<{ go: (s: Stage) => void; word: (q: string) => void; pick: (id: number) => void; jump: (i: number) => void; pause: (p: boolean) => void; fly: (k: number) => void } | null>(null);
  const [stage, setStage] = useState<Stage>({ k: "free" });
  const [found, setFound] = useState(0);
  const [chips, setChips] = useState<{ k: number; name: string; x: number; y: number; a: number }[]>([]);
  const [here, setHere] = useState<string>("");
  const [toast, setToast] = useState<{ t: string; s?: string; key: number } | null>(null);
  const [trailIds, setTrailIds] = useState<number[]>([]);
  const [intro, setIntro] = useState(true);
  const [coach, setCoach] = useState<"" | "ring" | "dim">("");
  const [hud, setHud] = useState<Hud>({});
  const [stats, setStats] = useState<{ m: number; c: number; l: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; t: string; s?: string } | null>(null);
  const [q, setQ] = useState("");
  const [ph, setPh] = useState(0);
  const [note, setNote] = useState("");
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [net, setNet] = useState<Net | null>(null);
  const stageRef = useRef<Stage>(stage); stageRef.current = stage;

  useEffect(() => { const t = setInterval(() => setPh((p) => (p + 1) % EX.length), 3200); return () => clearInterval(t); }, []);

  useEffect(() => {
    let alive = true; const el = host.current!, lh = lblHost.current!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const portrait = () => innerHeight > innerWidth * 1.05;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, premultipliedAlpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setClearColor(0x000000, 1); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    const resize = () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.fov = portrait() ? 64 : 50; cam.updateProjectionMatrix(); };
    addEventListener("resize", resize); resize();
    const premul = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;
    let N: Net;
    let now = 0; // 秒（線維のシェーダーの時刻）

    // ---- カメラ: 注視点のまわりを回る。目標へ減衰で寄るので、どこへ飛んでも途切れない ----
    const C = { t: new THREE.Vector3(), d: 420, yaw: 0.6, pitch: 0.18 }, G = { t: new THREE.Vector3(), d: 420, yaw: 0.6, pitch: 0.18 };
    let tau = 1.0, auto = 0.03;
    const fly = (target: number[] | THREE.Vector3, d: number, opt: { yaw?: number; pitch?: number; tau?: number } = {}) => {
      G.t.set(...((target instanceof THREE.Vector3 ? target.toArray() : target) as [number, number, number])); G.d = d;
      if (opt.yaw !== undefined) G.yaw = opt.yaw; if (opt.pitch !== undefined) G.pitch = opt.pitch; tau = opt.tau ?? 1.0; };
    const camPos = () => new THREE.Vector3(C.t.x + C.d * Math.cos(C.pitch) * Math.sin(C.yaw), C.t.y + C.d * Math.sin(C.pitch), C.t.z + C.d * Math.cos(C.pitch) * Math.cos(C.yaw));
    // ある点を、いまの向きのまま正面から見る yaw（細胞へ寄るとき大きく回り込まない）
    const facing = (p: number[]) => { const cp = camPos(), v = new THREE.Vector3(p[0] - cp.x, p[1] - cp.y, p[2] - cp.z); return Math.atan2(-v.x, -v.z); };

    // ---- 細胞（細胞体と文脈） ----
    type Cell = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; kind: "m" | "c"; id: number; p: THREE.Vector3; size: number; s: number; gs: number; op: number; gop: number; rim: number; grim: number; dot: number; gdot: number; rimC: THREE.Color; vid: Slot | null; still: THREE.Texture | null; rect: THREE.Vector4 };
    const somas: Cell[] = [], tips: Cell[] = [];
    const cellGeo = new THREE.PlaneGeometry(1, 1);
    const mkCell = (kind: "m" | "c", id: number, p: number[], size: number): Cell => {
      const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: CELL_FRAG, ...premul, uniforms: { uMap: { value: null }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uOp: { value: 0 }, uHas: { value: 0 }, uRim: { value: 0 }, uRimC: { value: new THREE.Color("#fff") }, uDim: { value: 1 }, uDot: { value: kind === "c" ? 1 : 0 }, uDotC: { value: new THREE.Color("#c4cff0") } } });
      const mesh = new THREE.Mesh(cellGeo, mat); mesh.position.set(p[0], p[1], p[2]); mesh.userData = { kind, id }; scene.add(mesh);
      return { mesh, mat, kind, id, p: new THREE.Vector3(p[0], p[1], p[2]), size, s: size, gs: size, op: 0, gop: 1, rim: 0, grim: 0, dot: kind === "c" ? 1 : 0, gdot: kind === "c" ? 1 : 0, rimC: new THREE.Color("#fff"), vid: null, still: null, rect: new THREE.Vector4(0, 0, 1, 1) };
    };
    const showStill = (c: Cell) => { c.mat.uniforms.uMap.value = c.still; c.mat.uniforms.uRect.value = c.rect; c.mat.uniforms.uHas.value = c.still ? 1 : 0; };

    // ---- 線維 ----
    let fiber: THREE.LineSegments | null = null, fiberMat: THREE.ShaderMaterial | null = null, aStart: THREE.BufferAttribute, aRev: THREE.BufferAttribute, aKeep: THREE.BufferAttribute;
    const fiberUniforms = () => ({ uTime: { value: 0 }, uFade: { value: 0 }, uBase: { value: 0.12 }, uSpeed: { value: 1.25 }, uCol: { value: DIM_COLOR.map((c) => new THREE.Color(c)) }, uCold: { value: new THREE.Color(COLD) } });
    const curve = (A: THREE.Vector3, B: THREE.Vector3, pull = 0.45) => { const M = A.clone().add(B).multiplyScalar(0.5 * pull); return (u: number) => new THREE.Vector3().copy(A).multiplyScalar((1 - u) * (1 - u)).addScaledVector(M, 2 * u * (1 - u)).addScaledVector(B, u * u); };
    function buildFibers() {
      const L = N.links.length, nv = L * SEG * 2, pos = new Float32Array(nv * 3), u = new Float32Array(nv), st = new Float32Array(nv).fill(1e6), str = new Float32Array(nv), dim = new Float32Array(nv), rev = new Float32Array(nv), keep = new Float32Array(nv);
      let mx = 0; for (const l of N.links) mx = Math.max(mx, l[2]);
      N.links.forEach(([a, b, s, d], li) => { const f = curve(tips[a].p, tips[b].p); let prev = f(0);
        for (let k = 0; k < SEG; k++) { const nx = f((k + 1) / SEG), o = (li * SEG + k) * 2;
          pos.set([prev.x, prev.y, prev.z, nx.x, nx.y, nx.z], o * 3); u[o] = k / SEG; u[o + 1] = (k + 1) / SEG;
          str[o] = str[o + 1] = Math.min(1, s / mx * 1.4); dim[o] = dim[o + 1] = Math.max(0, d); prev = nx; } });
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aU", new THREE.BufferAttribute(u, 1));
      aStart = new THREE.BufferAttribute(st, 1); aRev = new THREE.BufferAttribute(rev, 1); aKeep = new THREE.BufferAttribute(keep, 1);
      g.setAttribute("aStart", aStart); g.setAttribute("aStr", new THREE.BufferAttribute(str, 1)); g.setAttribute("aDim", new THREE.BufferAttribute(dim, 1)); g.setAttribute("aRev", aRev); g.setAttribute("aKeep", aKeep);
      fiberMat = new THREE.ShaderMaterial({ vertexShader: FIBER_VERT, fragmentShader: FIBER_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: fiberUniforms() });
      fiber = new THREE.LineSegments(g, fiberMat); fiber.frustumCulled = false; fiber.renderOrder = -10; scene.add(fiber);
    }
    const setLink = (li: number, start: number, reverse: boolean, keepIt = 0) => { for (let k = 0; k < SEG * 2; k++) { const o = li * SEG * 2 + k; aStart.array[o] = start; aRev.array[o] = reverse ? 1 : 0; aKeep.array[o] = keepIt; } };
    const resetFibers = () => { (aStart.array as Float32Array).fill(1e6); (aKeep.array as Float32Array).fill(0); aStart.needsUpdate = aRev.needsUpdate = aKeep.needsUpdate = true; if (fiberMat) fiberMat.uniforms.uFade.value = 0; fadeGoal = 0; };
    let fadeGoal = 0;
    // 突起（細胞体 → 文脈）
    let dend: THREE.LineSegments | null = null, dendMat: THREE.ShaderMaterial | null = null, dStart: THREE.BufferAttribute;
    function buildDendrites() {
      const L = N.ctx.length, nv = L * SEG * 2, pos = new Float32Array(nv * 3), u = new Float32Array(nv), st = new Float32Array(nv).fill(1e6), str = new Float32Array(nv).fill(0.5), dim = new Float32Array(nv), z = new Float32Array(nv);
      N.ctx.forEach((c, i) => { const m = somas[N.moments.findIndex((x) => x.no === c.no)], A = m.p, B = tips[i].p, M = A.clone().lerp(B, 0.5).add(new THREE.Vector3(0, 2.5, 0));
        let prev = A.clone(); for (let k = 0; k < SEG; k++) { const t = (k + 1) / SEG, nx = new THREE.Vector3().copy(A).multiplyScalar((1 - t) * (1 - t)).addScaledVector(M, 2 * t * (1 - t)).addScaledVector(B, t * t), o = (i * SEG + k) * 2;
          pos.set([prev.x, prev.y, prev.z, nx.x, nx.y, nx.z], o * 3); u[o] = k / SEG; u[o + 1] = t; dim[o] = dim[o + 1] = Math.max(0, c.w.indexOf(Math.max(...c.w))); prev = nx; } });
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aU", new THREE.BufferAttribute(u, 1));
      dStart = new THREE.BufferAttribute(st, 1); g.setAttribute("aStart", dStart); g.setAttribute("aStr", new THREE.BufferAttribute(str, 1)); g.setAttribute("aDim", new THREE.BufferAttribute(dim, 1)); g.setAttribute("aRev", new THREE.BufferAttribute(z, 1)); g.setAttribute("aKeep", new THREE.BufferAttribute(new Float32Array(nv).fill(1), 1));
      dendMat = new THREE.ShaderMaterial({ vertexShader: FIBER_VERT, fragmentShader: FIBER_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { ...fiberUniforms(), uBase: { value: 0.16 }, uCold: { value: new THREE.Color("#6d7a92") } } });
      dend = new THREE.LineSegments(g, dendMat); dend.frustumCulled = false; dend.renderOrder = -9; scene.add(dend);
    }
    const lightDend = (ids: number[], start: number) => { (dStart.array as Float32Array).fill(1e6); ids.forEach((i, j) => { for (let k = 0; k < SEG * 2; k++) dStart.array[i * SEG * 2 + k] = start + j * 0.06; }); dStart.needsUpdate = true; };
    // ダイジェストの金の線維（種 → 集まった文脈、その間の旅の道）
    let path: THREE.LineSegments | null = null;
    function buildPath(from: THREE.Vector3, ids: number[], dims: number[], t0: number) {
      if (path) { scene.remove(path); path.geometry.dispose(); }
      const segs: { A: THREE.Vector3; B: THREE.Vector3; st: number; d: number }[] = [];
      ids.forEach((id, j) => segs.push({ A: from, B: tips[id].p, st: t0 + j * 0.18, d: dims[j] }));
      ids.forEach((id, j) => { if (j) segs.push({ A: tips[ids[j - 1]].p, B: tips[id].p, st: 1e6, d: dims[j] }); });
      const nv = segs.length * SEG * 2, pos = new Float32Array(nv * 3), u = new Float32Array(nv), st = new Float32Array(nv), str = new Float32Array(nv).fill(1), dim = new Float32Array(nv), z = new Float32Array(nv);
      segs.forEach((s, i) => { const f = curve(s.A, s.B, 0.75); let prev = f(0);
        for (let k = 0; k < SEG; k++) { const nx = f((k + 1) / SEG), o = (i * SEG + k) * 2; pos.set([prev.x, prev.y, prev.z, nx.x, nx.y, nx.z], o * 3); u[o] = k / SEG; u[o + 1] = (k + 1) / SEG; st[o] = st[o + 1] = s.st; dim[o] = dim[o + 1] = Math.max(0, s.d); prev = nx; } });
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aU", new THREE.BufferAttribute(u, 1)); g.setAttribute("aStart", new THREE.BufferAttribute(st, 1));
      g.setAttribute("aStr", new THREE.BufferAttribute(str, 1)); g.setAttribute("aDim", new THREE.BufferAttribute(dim, 1)); g.setAttribute("aRev", new THREE.BufferAttribute(z, 1)); g.setAttribute("aKeep", new THREE.BufferAttribute(new Float32Array(nv).fill(1), 1));
      const mat = new THREE.ShaderMaterial({ vertexShader: FIBER_VERT, fragmentShader: FIBER_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { ...fiberUniforms(), uBase: { value: 0 }, uSpeed: { value: 0.9 } } });
      path = new THREE.LineSegments(g, mat); path.frustumCulled = false; path.renderOrder = -5; scene.add(path); pathFirstChain = ids.length;
    }
    let pathFirstChain = 0;
    const lightChain = (j: number, t: number) => { if (!path || j < 1) return; const a = path.geometry.getAttribute("aStart") as THREE.BufferAttribute, base = (pathFirstChain + j - 1) * SEG * 2; for (let k = 0; k < SEG * 2; k++) a.array[base + k] = t; a.needsUpdate = true; };

    // ---- 目の前の映像と、割れる楔 ----
    const screenGeo = new THREE.PlaneGeometry(1, 0.5625);
    const mkScreen = () => new THREE.Mesh(screenGeo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SCREEN_FRAG, ...premul, uniforms: { uMap: { value: null }, uOp: { value: 0 }, uHas: { value: 0 }, uA0: { value: 0 }, uA1: { value: 0 }, uWedge: { value: 0 } } }));
    const screen = mkScreen(); screen.renderOrder = 100; scene.add(screen);
    const scr = { op: 0, gop: 0, frac: 0.7, from: null as THREE.Vector3 | null, k: 1 }; // from: 生まれる点（細胞の位置）、k: 0→1 で細胞から目の前へ
    type Wedge = { mesh: THREE.Mesh; to: THREE.Vector3; dir: number; t0: number };
    let wedges: Wedge[] = [];
    const screenXf = (frac: number) => { const D = 7, h = 2 * Math.tan((cam.fov * Math.PI) / 360) * D, w = Math.min(h * cam.aspect * frac, h * 0.92 / 0.5625);
      const p = new THREE.Vector3(0, portrait() ? h * 0.06 : h * 0.07, -D).applyQuaternion(cam.quaternion).add(cam.position); return { p, w }; };

    // ---- 映像 ----
    type Slot = { v: HTMLVideoElement; tex: THREE.VideoTexture; owner: Cell | "screen" | null };
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent), ext = safari ? "mp4" : "webm";
    const slots: Slot[] = Array.from({ length: portrait() ? 6 : 9 }, () => { const v = document.createElement("video"); v.crossOrigin = "anonymous"; v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
      const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; return { v, tex, owner: null }; });
    const scrSlot = slots[0];
    const playScreen = (src: string | undefined, loop = true, sound = true) => { const s = scrSlot; s.owner = "screen"; const m = screen.material as THREE.ShaderMaterial;
      m.uniforms.uHas.value = 0; if (!src) return; s.v.loop = loop; s.v.muted = !sound; s.v.src = src; s.v.load();
      s.v.oncanplay = () => { m.uniforms.uMap.value = s.tex; m.uniforms.uHas.value = 1; }; s.v.play().catch(() => { s.v.muted = true; s.v.play().catch(() => {}); }); };
    const stopScreen = () => { scrSlot.v.pause(); };
    // 文脈の細胞で4秒を流す（音なし）
    const playCells = (cells: Cell[]) => { const pool = slots.slice(1), keep = new Set(cells);
      for (const s of pool) if (s.owner && s.owner !== "screen" && !keep.has(s.owner)) { const c = s.owner; c.vid = null; showStill(c); s.owner = null; s.v.pause(); }
      for (const c of cells) { if (c.vid) continue; const s = pool.find((x) => !x.owner); if (!s) break; const src = c.kind === "m" ? (safari ? media[N.moments[c.id].no]?.loop : media[N.moments[c.id].no]?.webm) : `${BASE}/ctx/c/${c.id}.${ext}`; if (!src) continue;
        s.owner = c; c.vid = s; s.v.loop = true; s.v.muted = true; s.v.src = src; s.v.load();
        s.v.oncanplay = () => { if (c.vid === s) { c.mat.uniforms.uMap.value = s.tex; c.mat.uniforms.uRect.value = new THREE.Vector4(0, 0, 1, 1); c.mat.uniforms.uHas.value = 1; } }; s.v.play().catch(() => {}); } };

    // ---- 文字: 空間の中の板（細胞の下に、奥行きのまま置く）----
    type Lbl = { key: string; at: () => THREE.Vector3; t: string; s?: string; h?: number | (() => number); col?: string; cls?: string };
    let lbls: Lbl[] = [];
    type LM = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; op: number; aspect: number; sig: string };
    const lms = new Map<string, LM>();
    const V = new THREE.Vector3();
    const mkLabel = (t: string, sub: string | undefined, col: string) => {
      const cv = document.createElement("canvas"), g = cv.getContext("2d")!, F = '"Hiragino Sans","Noto Sans JP",system-ui,sans-serif';
      g.font = `900 60px ${F}`; const w1 = g.measureText(t).width; g.font = `600 30px ${F}`; const w2 = sub ? g.measureText(sub).width : 0;
      const W = Math.ceil(Math.max(w1, w2) + 48), H = sub ? 128 : 86; cv.width = W; cv.height = H;
      g.textAlign = "center"; g.textBaseline = "top"; g.shadowColor = "rgba(0,0,0,0.95)"; g.shadowBlur = 14;
      g.font = `900 60px ${F}`; g.fillStyle = col; g.fillText(t, W / 2, 10); g.fillText(t, W / 2, 10);
      if (sub) { g.font = `600 30px ${F}`; g.fillStyle = "rgba(255,255,255,0.78)"; g.fillText(sub, W / 2, 84); }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.renderOrder = 300; scene.add(mesh); return { mesh, mat, aspect: W / H, h0: H };
    };
    const syncLabels = (dt: number) => {
      const want = new Map(lbls.map((l) => [l.key, l]));
      for (const [k, m] of Array.from(lms)) if (!want.has(k)) { m.op -= dt * 4; m.mat.opacity = Math.max(0, m.op); if (m.op <= 0) { scene.remove(m.mesh); m.mat.map?.dispose(); m.mat.dispose(); m.mesh.geometry.dispose(); lms.delete(k); } }
      for (const l of lbls) { const sig = `${l.t}|${l.s || ""}|${l.col || ""}`; let m = lms.get(l.key);
        if (m && m.sig !== sig) { scene.remove(m.mesh); m.mat.map?.dispose(); m.mat.dispose(); lms.delete(l.key); m = undefined; }
        if (!m) { const x = mkLabel(l.t, l.s, l.col || "#ffffff"); m = { mesh: x.mesh, mat: x.mat, op: 0, aspect: x.aspect, sig }; lms.set(l.key, m); }
        const p = l.at(), h = typeof l.h === "function" ? l.h() : l.h ?? 1.4, hh = l.s ? h * 1.45 : h;
        m.mesh.position.copy(p).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), -hh / 2); m.mesh.quaternion.copy(cam.quaternion); m.mesh.scale.set(hh * m.aspect, hh, 1);
        m.op = Math.min(1, m.op + dt * 3); const d = cam.position.distanceTo(p); m.mat.opacity = m.op * Math.max(0, Math.min(1, 1 - (d - 140) / 160)); }
    };
    const up = new THREE.Vector3();
    const below = (c: Cell) => () => c.mesh.position.clone().addScaledVector(up.set(0, 1, 0).applyQuaternion(cam.quaternion), -c.s * 0.56);
    const above = (c: Cell) => () => c.mesh.position.clone().addScaledVector(up.set(0, 1, 0).applyQuaternion(cam.quaternion), c.s * 0.56 + 2.6);
    const farH = (c: Cell) => () => Math.max(1.3, Math.min(14, cam.position.distanceTo(c.mesh.position) * 0.05));

    // ---- 段階 ----
    let st: Stage = { k: "free" }, timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, f: () => void) => { timers.push(setTimeout(() => { if (alive) f(); }, ms)); };
    const clearLater = () => { timers.forEach(clearTimeout); timers = []; };
    let digest: Digest | null = null, di = 0, pausedNow = false, wordPoint: THREE.Vector3 | null = null;
    const momIdx = (no: string) => N.moments.findIndex((m) => m.no === no);
    const focusTips = (ids: number[] | null, dimOthers = true, big = 3.4) => { const set = new Set(ids || []);
      for (const t of tips) { const on = set.has(t.id); t.gs = on ? big : t.size; t.gop = !ids ? 1 : on ? 1 : dimOthers ? 0.35 : 1; t.grim = on ? 1 : 0; t.gdot = on ? 0 : 1; }
      for (const s of somas) { s.gop = !ids ? 1 : dimOthers ? 0.45 : 1; s.gs = s.size; s.grim = 0; } };
    let lodOn = true, lodT = 0, regionT = 0;
    // ---- 周りに集まる（ロックオンの中心のまわりに、繋がる文脈が空間のあちこちから飛んできて並ぶ）----
    const RN = 8;
    const ringCells: Cell[] = Array.from({ length: RN }, (_, k) => { const c = mkCell("c", 0, [0, 0, 0], 4); c.mesh.userData = { kind: "r", id: k }; c.gop = 0; c.dot = c.gdot = 0; return c; });
    let ring: { center: Cell; ids: number[]; dim: number; t0: number; from: THREE.Vector3[]; cf: number } | null = null;
    const ringGeo = new THREE.BufferGeometry(); ringGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RN * 2 * 3), 3)); ringGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(RN * 2 * 3), 3));
    const ringLines = new THREE.LineSegments(ringGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    ringLines.frustumCulled = false; ringLines.renderOrder = 5; scene.add(ringLines);
    const ringPos = (k: number, n: number, out: THREE.Vector3) => { if (!ring) return out; const pr = portrait(), a = -Math.PI / 2 + (k / n) * Math.PI * 2 + (pr || n % 2 ? 0 : Math.PI / n);
      const dist = cam.position.distanceTo(ring.center.mesh.position), hh = Math.tan((cam.fov * Math.PI) / 360) * dist;
      const R = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), U = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      // 縦画面: 中心を上に、周りは下に2列（横書きの名前が重ならない）
      if (pr) { const col = k % 2 ? 1 : -1, row = Math.floor(k / 2); return out.copy(ring.center.mesh.position).addScaledVector(R, col * hh * cam.aspect * 0.5).addScaledVector(U, -hh * (0.36 + row * 0.25)); }
      const rx = hh * cam.aspect * 0.6, ry = hh * 0.56;
      return out.copy(ring.center.mesh.position).addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), Math.cos(a) * rx).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), Math.sin(a) * ry + hh * 0.04); };
    function setRing(center: Cell, ids: number[], dim: number, fromCenter = false) {

      ids = ids.slice(0, RN); ring = { center, ids, dim, t0: now, from: ids.map((i) => (fromCenter ? center.p.clone() : tips[i].p.clone())), cf: center.kind === "m" ? (portrait() ? 0.15 : 0.2) : (portrait() ? 0.15 : 0.22) };
      const col = dim >= 0 ? DIM_COLOR[dim] : "#ffffff";
      ringCells.forEach((rc, k) => { const id = ids[k]; if (id === undefined) { rc.gop = 0; return; }
        rc.id = id; rc.p.copy(ring!.from[k]); rc.mesh.position.copy(rc.p); rc.op = 0; rc.gop = 1; rc.s = 0.4; rc.gs = portrait() ? 1 : 1; rc.grim = 1; rc.rimC.set(col); rc.mat.uniforms.uRimC.value.set(col);
        rc.still = tips[id].still; rc.rect = tips[id].rect; if (rc.vid) { rc.vid.owner = null; rc.vid.v.pause(); rc.vid = null; } showStill(rc); });
      playCells([center, ...ringCells.slice(0, ids.length)].slice(0, slots.length - 1));
      lbls = [...lbls.filter((l) => l.key === "center"), ...ids.map((id, k) => ({ key: `r${k}:${id}`, at: below(ringCells[k]), t: N.ctx[id].title, s: dim >= 0 ? N.ctx[id].v[dim] || undefined : undefined, col: "#ffffff", h: () => ringCells[k].s * (portrait() ? 0.2 : 0.3) }))];
    }
    let coached = 0; try { coached = +(localStorage.getItem("nw_coach") || 0); } catch { /* */ }
    const coachNext = (step: number) => { if (coached >= step) return; later(1300, () => setCoach(step === 1 ? "ring" : "dim")); };
    const coachDone = (step: number) => { if (coached >= step) return; coached = step; setCoach(""); try { localStorage.setItem("nw_coach", String(step)); } catch { /* */ } };
    function clearRing() { if (!ring) return; ring = null; ringCells.forEach((rc) => { rc.gop = 0; }); }
    // 中心の大きさ（画面の高さに対する割合で決める＝どの距離でも同じ見え方）
    const sizeAt = (c: Cell, frac: number) => { const d = cam.position.distanceTo(c.mesh.position); return 2 * Math.tan((cam.fov * Math.PI) / 360) * d * frac; };
    const discover = (_id: number) => { /* ザッピングの邪魔になるので数えない */ };
    void discover;
    function go(s: Stage) {
      clearLater(); st = s; stageRef.current = s; setStage(s); setHover(null); wedges.forEach((w) => scene.remove(w.mesh)); wedges = [];
      scrSlot.v.onended = null;
      if (s.k !== "digest" && s.k !== "end") { pausedNow = false; setPaused(false); }
      lodOn = s.k === "free"; lodT = 0; if (s.k !== "lock" && s.k !== "watch") { clearRing(); for (const x of Array.from(bloom.keys())) { x.gdot = x.kind === "c" ? 1 : 0; x.gs = x.size; } bloom.clear(); travel = null; }
      if (s.k === "free") {
        resetFibers(); lightDend([], 0); if (path) path.visible = false; wordPoint = null; scr.gop = 0; stopScreen(); focusTips(null); auto = 0.02; lbls = []; setHud({});
        if (C.d < 60) fly(C.t, 120, { tau: 1.0 });
      } else if (s.k === "lock") lock(s);
      else if (s.k === "watch") {
        const cell = s.kind === "m" ? somas[s.id] : tips[s.id];
        scr.from = cell.p.clone(); scr.k = 0; scr.frac = portrait() ? 0.94 : 0.62; scr.gop = 1;
        playScreen(s.kind === "m" ? (safari ? media[N.moments[s.id].no]?.loop : media[N.moments[s.id].no]?.webm) : `${BASE}/ctx/c/${s.id}.${ext}`, true, true); getCrowd().swell(0.3);
      } else if (s.k === "explore") {
        explore(s.seed, s.q);
      } else if (s.k === "digest") {
        digest = s.d; di = s.i; playItem(s.i);
      } else if (s.k === "end") {
        scr.gop = 0; stopScreen(); const ids = s.d.items.map((x) => x.id); focusTips(ids, true); playCells(ids.map((i) => tips[i]));
        const c = ids.reduce((a, i) => a.add(tips[i].p), new THREE.Vector3()).multiplyScalar(1 / ids.length);
        let r = 0; ids.forEach((i) => (r = Math.max(r, tips[i].p.distanceTo(c)))); fly(c, Math.max(90, r * 2.6), { tau: 1.6 }); auto = 0.02;
        lbls = ids.map((i) => ({ key: `c${i}`, at: below(tips[i]), t: N.ctx[i].title, cls: "on" })); setHud({});
        ids.forEach((_, j) => lightChain(j, now)); getCrowd().swell(0.8);
      }
    }
    // ロックオン: 押したものが中心。繋がるものが周りに集まり、一斉に流れる
    // ロックオン: 押したものが中心。繋がる相手は空間の居場所から動かさない。中心から信号が線維を伝って走り、届いた先がその場で開いて流れる。
    // カメラは中心と届いた先が全部入るところまで引く＝何と何が繋がっているかが空間の線として見える
    const bloom = new Map<Cell, number>(); // 画面の高さに対する大きさ（どの距離でも同じ見え方）
    let travel: { A: THREE.Vector3; B: THREE.Vector3; t0: number; dur: number } | null = null;
    const frameOn = (pts: THREE.Vector3[], minD: number) => { const cen = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length); let r = 0; pts.forEach((p) => (r = Math.max(r, p.distanceTo(cen))));
      return { cen, d: Math.max(minD, r * (portrait() ? 3.0 : 2.4)) }; };
    function lock(s: Extract<Stage, { k: "lock" }>) {
      scr.gop = 0; stopScreen(); resetFibers(); lightDend([], 0); wordPoint = null; auto = 0.004; clearRing();
      const pr = portrait(), prev = Array.from(bloom.keys()); bloom.clear(); for (const x of prev) { x.gdot = x.kind === "c" ? 1 : 0; x.grim = 0; x.gs = x.size; }
      focusTips(null); for (const x of somas) { x.gop = 0.3; x.grim = 0; x.gs = x.size; } for (const x of tips) x.gop = 0.45;
      const wait = travel ? Math.max(0, (travel.t0 + travel.dur - now) * 1000) : 0;
      if (s.kind === "m") {
        if (path) path.visible = false;
        const m = N.moments[s.id], soma = somas[s.id], own = m.ctx.map((i) => tips[i]); soma.gop = 1; soma.grim = 1; bloom.set(soma, pr ? 0.12 : 0.15);
        fly(m.p, pr ? 70 : 54, { yaw: facing(m.p), pitch: 0.1, tau: 0.7 }); sfx.whoosh?.(0.7);
        lbls = [{ key: "center", at: below(soma), t: m.title, s: m.sport, h: () => soma.s * (pr ? 0.17 : 0.22) }];
        // 目の前で流れて、映像が割れて、その瞬間の文脈の居場所へ飛び散る（分解）
        scr.from = soma.p.clone(); scr.k = 0; scr.frac = pr ? 0.94 : 0.6; later(500, () => { scr.gop = 1; playScreen(safari ? media[m.no]?.loop : media[m.no]?.webm, true, true); });
        later(reduce ? 1400 : 1900, () => { decompose(s.id); const f = frameOn([soma.p, ...own.map((x) => x.p)], pr ? 80 : 60); fly(f.cen, f.d, { tau: 1.1 });
          later(900, () => { lightDend(m.ctx, now); own.forEach((x, k) => later(k * 90, () => { x.gdot = 0; x.gop = 1; x.grim = 1; x.rimC.set("#ffffff"); x.mat.uniforms.uRimC.value.set("#ffffff"); bloom.set(x, pr ? 0.075 : 0.09);
            lbls = [...lbls.filter((l) => l.key !== `c${x.id}`), { key: `c${x.id}`, at: below(x), t: N.ctx[x.id].title, h: () => x.s * (pr ? 0.3 : 0.32) }]; sfx.blip?.(); }));
            playCells([soma, ...own].slice(0, slots.length - 1)); coachNext(1); }); });
      } else {
        const c = N.ctx[s.id], t = tips[s.id], dims = Object.keys(c.dn || {}).map(Number).sort((a, b) => c.w[b] - c.w[a]);
        const d = s.dim ?? dims[0] ?? -1, ids = d >= 0 ? (c.dn![d] || []).map((x) => x[0]) : N.links.filter((l) => l[0] === s.id || l[1] === s.id).sort((a, b) => b[2] - a[2]).slice(0, 6).map((l) => (l[0] === s.id ? l[1] : l[0]));
        if (s.dim === undefined && d >= 0) { const s2 = { ...s, dim: d }; st = s2; stageRef.current = s2; setStage(s2); }
        const col = d >= 0 ? DIM_COLOR[d] : "#ffffff";
        t.gop = 1; t.grim = 1; t.gdot = 0; t.rimC.set(col); t.mat.uniforms.uRimC.value.set(col); bloom.set(t, pr ? 0.12 : 0.15);
        const tg = ids.map((i) => tips[i]), f = frameOn([t.p, ...tg.map((x) => x.p)], pr ? 80 : 60);
        lbls = [{ key: "center", at: below(t), t: c.title, s: `${N.moments[momIdx(c.no)].sport}　${N.moments[momIdx(c.no)].title}`, h: () => t.s * (pr ? 0.2 : 0.22) }];
        later(wait, () => {
          fly(f.cen, f.d, { tau: 1.0 }); playCells([t]);
          // 中心から信号が走る（線維が見方の色に変わっていく）。届いた先がその場で開く
          buildPath(t.p, ids, ids.map(() => Math.max(0, d)), now + 0.15); if (path) { path.visible = true; (path.material as THREE.ShaderMaterial).uniforms.uSpeed.value = 1.1; }
          sfx.swish?.(); getCrowd().swell(0.35);
          tg.forEach((x, k) => later(150 + 950 + k * 180, () => { x.gdot = 0; x.gop = 1; x.grim = 1; x.rimC.set(col); x.mat.uniforms.uRimC.value.set(col); bloom.set(x, pr ? 0.075 : 0.09);
            const so = somas[momIdx(N.ctx[x.id].no)]; so.gop = 0.8;
            lbls = [...lbls.filter((l) => l.key !== `c${x.id}`), { key: `c${x.id}`, at: below(x), t: N.ctx[x.id].title, s: d >= 0 ? N.ctx[x.id].v[d] || undefined : undefined, h: () => x.s * (pr ? 0.3 : 0.32) }];
            playCells([t, ...tg.slice(0, k + 1)].slice(0, slots.length - 1)); sfx.blip?.(); if (k === tg.length - 1) coachNext(coached >= 1 ? 2 : 1); }));
        });
      }
    }
    // 近づくと動き出す: 画面の中央に近い細胞がタイトルとともに無音で流れる。さらに寄ると瞬間がほどけて文脈の世界になる
    function updateLOD() {
      const cp = cam.position;
      const vis = (c: Cell, maxD: number) => { V.copy(c.p).project(cam); const d = cp.distanceTo(c.p); return { c, d, x: V.x, y: V.y, ok: V.z < 1 && Math.abs(V.x) < 0.8 && Math.abs(V.y) < 0.8 && d < maxD }; };
      const ms = somas.map((x) => vis(x, 230)).filter((o) => o.ok).sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
      const ts = tips.map((x) => vis(x, 80)).filter((o) => o.ok).sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
      const ctxWorld = ts.length >= 3 && ts[0].d < 60, nm = portrait() ? 2 : 3;
      for (const x of somas) { const d = cp.distanceTo(x.p); x.gop = d < 50 ? 0.2 : 1; x.gs = x.size; x.grim = 0; }
      const near = new Set(ts.slice(0, ctxWorld ? 6 : 0).map((o) => o.c.id));
      for (const x of tips) { const on = near.has(x.id); x.gs = on ? 3.4 : x.size; x.gdot = on ? 0 : 1; x.gop = 1; x.grim = 0; }
      const play = ctxWorld ? ts.slice(0, nm).map((o) => o.c) : ms.slice(0, nm).map((o) => o.c);
      for (const c of play) if (c.kind === "m") c.gs = c.size * 1.3;
      playCells(play);
      lbls = play.map((c) => (c.kind === "m" ? { key: `m${c.id}`, at: above(c), t: N.moments[c.id].title, s: N.moments[c.id].sport, h: farH(c) } : { key: `c${c.id}`, at: below(c), t: N.ctx[c.id].title, h: farH(c) }));
    }
    // 航路: いまの位置から見た領域の方角と名前（画面の縁に）。いま居る領域の名前
    function updateRegions() {
      const pos = C.t; let hereK = -1, hd = 1e9; N.regions.forEach((g, k) => { const d = pos.distanceTo(V.set(g.at[0], g.at[1], g.at[2])); if (d < hd) { hd = d; hereK = k; } });
      setHere(hd < 55 ? N.regions[hereK].name : "");
      const order = N.regions.map((g, k) => ({ k, d: pos.distanceTo(new THREE.Vector3(g.at[0], g.at[1], g.at[2])) })).filter((o) => !(o.k === hereK && hd < 55)).sort((a, b) => a.d - b.d).slice(0, portrait() ? 4 : 5);
      // 画面の縁に羅針盤のように並べる（行き先の方角の順、重ならない間隔）。矢印は行き先の画面上の位置を指す
      const W2 = innerWidth / 2, H2 = innerHeight / 2, pr = portrait();
      const items = order.map(({ k }) => { const g = N.regions[k]; V.set(g.at[0], g.at[1], g.at[2]).project(cam); let x = V.x, y = V.y; if (V.z > 1) { x = -x * 5; y = -y * 5; }
        const r = Math.hypot(x, y); const ang = r < 0.12 ? (k / N.regions.length) * Math.PI * 2 : Math.atan2(y, x); return { k, name: g.name, ang, tx: W2 + x * W2, ty: H2 - y * H2 }; }).sort((a, b) => a.ang - b.ang);
      const gap = (Math.PI * 2) / (items.length * 1.6);
      for (let it = 0; it < 6; it++) for (let i = 0; i < items.length; i++) { const a0 = items[i], a1 = items[(i + 1) % items.length]; let d = a1.ang - a0.ang; if (i === items.length - 1) d += Math.PI * 2; if (d < gap) { const push = (gap - d) / 2; a0.ang -= push; a1.ang += push; } }
      const rx = pr ? 0.62 : 0.84, ry = pr ? 0.52 : 0.6, cy = pr ? 0.02 : -0.02;
      const out = items.map((o) => { const x = W2 + Math.cos(o.ang) * rx * W2, y = H2 - (Math.sin(o.ang) * ry + cy) * H2; return { k: o.k, name: o.name, x, y, a: Math.atan2(-(o.ty - y), o.tx - x) }; });
      setChips((prev) => (prev.length === out.length && prev.every((p, i) => p.k === out[i].k && Math.abs(p.x - out[i].x) < 6 && Math.abs(p.y - out[i].y) < 6) ? prev : out));
    }
    let fovKick = 0, viewOff = 0;
    const jumpRegion = (k: number) => { const g = N.regions[k]; go({ k: "free" }); fly(g.at, portrait() ? 95 : 75, { tau: 0.55 }); fovKick = 1; sfx.whoosh?.(1.2); getCrowd().swell(0.5);
      later(1300, () => { setToast({ t: g.name, s: `${g.ids.length}の熱狂の文脈`, key: Date.now() }); for (const i of g.ids) { if (tips[i].p.distanceTo(V.set(g.at[0], g.at[1], g.at[2])) < 60) tips[i].grim = 1; } }); };
    function decompose(mi: number) {
      const m = N.moments[mi], ids = m.ctx, n = ids.length;
      const { p, w } = screenXf(scr.frac);
      ids.forEach((id, j) => { const mesh = mkScreen(), mt = mesh.material as THREE.ShaderMaterial, sm = screen.material as THREE.ShaderMaterial;
        mt.uniforms.uMap.value = sm.uniforms.uMap.value; mt.uniforms.uHas.value = sm.uniforms.uHas.value; mt.uniforms.uWedge.value = 1;
        const a0 = -Math.PI + (j / n) * Math.PI * 2 + (hashN(mi * 31 + j) - 0.5) * 0.3, a1 = -Math.PI + ((j + 1) / n) * Math.PI * 2 + (hashN(mi * 31 + j + 1) - 0.5) * 0.3;
        mt.uniforms.uA0.value = a0; mt.uniforms.uA1.value = a1; mt.uniforms.uOp.value = 1; mesh.position.copy(p); mesh.quaternion.copy(cam.quaternion); mesh.scale.setScalar(w); mesh.renderOrder = 101; scene.add(mesh);
        wedges.push({ mesh, to: ring ? ringPos(j, Math.min(n, RN), new THREE.Vector3()) : tips[id].p.clone(), dir: (a0 + a1) / 2, t0: now + j * 0.05 }); });
      scr.op = 0; scr.gop = 0; stopScreen(); sfx.boom?.(); getCrowd().swell(0.6);

      later(1600, () => { wedges.forEach((w) => scene.remove(w.mesh)); wedges = []; });
    }
    const hashN = (i: number) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
    // 探索: 種から線維が次々と点き、2段・3段先まで伝わる。同時に API が全文脈と照らし合わせる
    async function explore(seed?: number, word?: string) {
      resetFibers(); if (path) path.visible = false; scr.gop = 0; stopScreen(); playCells([]); lightDend([], 0);
      const from = seed !== undefined ? tips[seed].p.clone() : new THREE.Vector3(0, 0, 0); wordPoint = seed === undefined ? from : null;
      focusTips(seed !== undefined ? [seed] : [], false);
      fly(from, portrait() ? 300 : 230, { tau: 1.3 }); auto = 0.05; sfx.suction?.(); getCrowd().swell(0.4);
      lbls = seed !== undefined ? [{ key: `c${seed}`, at: below(tips[seed]), t: N.ctx[seed].title, cls: "seed" }] : [];
      setHud({ title: seed !== undefined ? N.ctx[seed].title : `「${word}」`, sub: seed !== undefined ? N.ctx[seed].line : "この言葉が求める熱を読んでいます", counter: { scanned: 0, resonated: 0, lit: 0 } });
      // 線維の伝わり（実際の繋がりを幅優先で）
      const adj = new Map<number, [number, number][]>(); N.links.forEach(([a, b], li) => { for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x)!.push([y, li]); } });
      const t0 = now + 0.3, seen = new Set<number>(), lit = new Set<number>(); let frontier: [number, number][] = [];
      if (seed !== undefined) { frontier = [[seed, t0]]; seen.add(seed); }
      else { // 言葉: 空間じゅうの細胞から同時に（読みながら全部を照らし合わせている）
        for (let k = 0; k < 24; k++) { const i = Math.floor(hashN(k * 7 + (word || "").length) * N.ctx.length); frontier.push([i, t0 + k * 0.08]); seen.add(i); } }
      for (let hop = 0; hop < 3 && lit.size < 1400; hop++) { const next: [number, number][] = [];
        for (const [x, tx] of frontier) for (const [y, li] of (adj.get(x) || []).slice(0, hop === 0 ? 24 : 7)) { if (lit.has(li)) continue; lit.add(li);
          const reverse = N.links[li][0] !== x, ts = tx + hashN(li) * 0.35; setLink(li, ts, reverse); if (!seen.has(y)) { seen.add(y); next.push([y, ts + 0.8]); } }
        frontier = next; }
      aStart.needsUpdate = aRev.needsUpdate = aKeep.needsUpdate = true;
      const startedAt = performance.now();
      let d: Digest | null = null;
      try { const r = await fetch("/api/ctx/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(seed !== undefined ? { seed } : { q: word }) }); d = await r.json(); }
      catch { d = null; }
      sfx.stopSuction?.();
      if (!alive || stageRef.current.k !== "explore") return;
      if (!d || !(d as Digest).items?.length) { setNote((d as { unreadable?: boolean } | null)?.unreadable ? "その言葉では探せませんでした。スポーツの熱の言葉で投げてください" : "探索に失敗しました。もう一度試してください"); go({ k: "free" }); return; }
      d = { ...d, seed, q: word };
      // 探索の量を数え上げてから（最低 3.2 秒は伝わりを見せる）、響き合ったものを金の線維で結ぶ
      setHud((h) => ({ ...h, counter: { scanned: d!.scanned, resonated: d!.resonated, lit: lit.size }, sub: seed !== undefined ? N.ctx[seed].line : (d!.seedLine || "") }));
      const wait = Math.max(0, 3200 - (performance.now() - startedAt));
      later(wait, () => { const ids = d!.items.map((x) => x.id);
        // 種から集まった文脈への線維は残し、他は冷たい色へ戻る
        N.links.forEach(([a, b], li) => { if ((seed !== undefined && (a === seed || b === seed) && (ids.includes(a) || ids.includes(b)))) { aKeep.array.fill(1, li * SEG * 2, (li + 1) * SEG * 2); } }); aKeep.needsUpdate = true; fadeGoal = 1;
        buildPath(from, ids, d!.items.map((x) => x.dim), now); focusTips([...(seed !== undefined ? [seed] : []), ...ids], true);
        lbls = [...(seed !== undefined ? [{ key: `c${seed}`, at: below(tips[seed]), t: N.ctx[seed].title, cls: "seed" }] : []), ...ids.map((i) => ({ key: `c${i}`, at: below(tips[i]), t: N.ctx[i].title, s: N.moments[momIdx(N.ctx[i].no)].sport, cls: "on" }))];
        setHud({ big: d!.name, sub: `${d!.items.length}本の瞬間が「${d!.seedTitle}」と響き合った`, counter: { scanned: d!.scanned, resonated: d!.resonated, lit: lit.size } });
        getCrowd().swell(0.7); sfx.swish?.();
        later(2600, () => go({ k: "digest", d: d!, i: 0 })); });
    }
    // ダイジェスト: 金の線維を辿って1つずつ飛び、その文脈の4秒を目の前で流す
    function playItem(i: number) {
      if (!digest) return; const it = digest.items[i]; if (!it) { go({ k: "end", d: digest }); return; }
      const c = N.ctx[it.id], t = tips[it.id], mo = N.moments[momIdx(c.no)];
      lightChain(i, now); focusTips(digest.items.map((x) => x.id), true); t.gs = 4.2;
      fly(t.p, portrait() ? 26 : 20, { yaw: facing(t.p.toArray()), pitch: 0.1, tau: 0.8 }); auto = 0.01; sfx.whoosh?.(0.7);
      scr.from = t.p.clone(); scr.k = 0; scr.frac = portrait() ? 0.94 : 0.5; scr.gop = 0;
      lbls = [];
      setHud({ big: digest.name, title: c.title, line: it.line, sub: `${mo.sport}　${mo.title}` });
      later(700, () => { playScreen(`${BASE}/ctx/c/${it.id}.${ext}`, false, true); scr.gop = 1; getCrowd().swell(0.3); });
      const v = scrSlot.v; v.onended = () => { if (!pausedNow && st.k === "digest" && digest) { scr.gop = 0; later(350, () => go({ k: "digest", d: digest!, i: i + 1 })); } };
    }

    // ---- 読み込み ----
    (async () => {
      N = await (await fetch("/ctx/net.json")).json(); if (!alive) return;
      N.moments.forEach((m, k) => somas.push(mkCell("m", k, m.p, 7.5)));
      N.ctx.forEach((c) => tips.push(mkCell("c", c.id, c.p, 2.4)));
      buildFibers(); buildDendrites();
      const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
      const nA = Math.ceil(N.ctx.length / 256);
      const atl = await Promise.all(Array.from({ length: nA }, (_, s) => new Promise<THREE.Texture>((res) => loader.load(`${BASE}/ctx/atlas${s}.jpg`, res, undefined, () => res(new THREE.Texture())))));
      atl.forEach((a) => { a.colorSpace = THREE.SRGBColorSpace; a.anisotropy = 4; });
      const setStill = (c: Cell, i: number) => { const s = Math.floor(i / 256), k = i % 256; c.still = atl[s]; c.rect = new THREE.Vector4((k % 16) / 16, 1 - (Math.floor(k / 16) + 1) / 16, 1 / 16, 1 / 16); showStill(c); };
      tips.forEach((t) => setStill(t, t.id)); somas.forEach((s, k) => setStill(s, N.moments[k].ctx[0]));
      setNet(N); setStats({ m: N.moments.length, c: N.ctx.length, l: N.links.length });
      C.d = G.d = portrait() ? 560 : 430; go({ k: "free" }); fly([0, 0, 0], portrait() ? 400 : 290, { tau: 1.4 });
      if (shared) later(1800, async () => { // シェアされたダイジェスト: 一文を作り直して、そのまま旅を始める
        try { const r = await fetch("/api/ctx/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: shared.i, ...(shared.s !== undefined && shared.s >= 0 ? { seed: shared.s } : { q: shared.q }) }) });
          const d = (await r.json()) as Digest; if (!d.items?.length) return; const dd = { ...d, name: shared.n || d.name, seed: shared.s, q: shared.q };
          const from = shared.s !== undefined && shared.s >= 0 ? tips[shared.s].p.clone() : new THREE.Vector3(); buildPath(from, dd.items.map((x) => x.id), dd.items.map((x) => x.dim), now);
          setHud({ big: dd.name, sub: `${dd.items.length}本の瞬間が「${dd.seedTitle}」と響き合った` }); later(2400, () => go({ k: "digest", d: dd, i: 0 })); } catch { /* 空間はそのまま触れる */ } });
      else { // 投票サイトから来たらその1本、そうでなければ胸の熱い1本から始める（最初の数秒で「割れて、集まる」を見せる）
        const pick = ["051", "090", "059", "061", "001"].map(momIdx).filter((k) => k >= 0);
        const k = startNo ? momIdx(startNo) : pick[Math.floor(Math.random() * pick.length)];
        if (k >= 0) later(1800, () => go({ k: "lock", kind: "m", id: k })); }
    })();

    // ---- 操作 ----
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const hit = (x: number, y: number): Cell | null => { if (!N) return null; ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
      const objs = [...ringCells, ...somas, ...tips].filter((c) => c.op > 0.3).map((c) => c.mesh);
      // 光っているもの（ロックオン中の行き先）を、手前の暗いものより優先して拾う
      const hs = ray.intersectObjects(objs, false).map((h) => { const u = h.object.userData as { kind: "m" | "c" | "r"; id: number }; return u.kind === "r" ? tips[ringCells[u.id].id] : (u.kind === "m" ? somas : tips)[u.id]; });
      const rr = ray.intersectObjects(ringCells.filter((c) => c.op > 0.3).map((c) => c.mesh), false)[0]; if (rr) return tips[ringCells[(rr.object.userData as { id: number }).id].id];
      // 光の点（遠くの文脈）より、映像の出ている細胞を優先する
      return hs.find((c) => c.op > 0.6 && c.dot < 0.5) || hs.find((c) => c.op > 0.6) || hs[0] || null; };
    const ptrs = new Map<number, [number, number]>(); let pinch = 0, moved = 0, downAt: [number, number] | null = null, hovered: Cell | null = null;
    const onDown = (e: PointerEvent) => { setIntro(false); getCrowd().start(); sfx.start(); ptrs.set(e.pointerId, [e.clientX, e.clientY]); el.setPointerCapture(e.pointerId); moved = 0; downAt = [e.clientX, e.clientY];
      if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()); pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } };
    const onMove = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId);
      if (p) { const dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
        if (ptrs.size === 1 && moved > 6) { G.yaw -= dx * 0.005; G.pitch = Math.max(-1.2, Math.min(1.2, G.pitch + dy * 0.004)); tau = 0.25; }
        else if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()), d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) G.d = Math.max(8, Math.min(1100, G.d * (pinch / d))); pinch = d; tau = 0.25; } }
      if (e.pointerType === "mouse" && !p) { const c = hit(e.clientX, e.clientY); if (c !== hovered) { hovered = c; if (c) sfx.blip?.(); }
        el.style.cursor = c ? "pointer" : "grab";
        if (c) { const ctx = c.kind === "c" ? N.ctx[c.id] : null, mo = c.kind === "m" ? N.moments[c.id] : N.moments[momIdx(ctx!.no)];
          setHover({ x: e.clientX, y: e.clientY, t: ctx ? ctx.title : mo.title, s: ctx ? `${ctx.line}（${mo.sport}　${mo.title}）` : `${mo.sport}　${mo.ctx.length}つの熱狂の文脈` }); }
        else setHover(null); } };
    const onUp = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0;
      if (!downAt || moved > 10) { downAt = null; return; } downAt = null; const c = hit(e.clientX, e.clientY); if (!c) return;
      if (st.k === "lock" && st.kind === c.kind && st.id === c.id) { go({ k: "watch", kind: c.kind, id: c.id }); return; }
      if (st.k === "lock" && c.kind === "c") { coachDone(1); const from = st.kind === "c" ? tips[st.id].p : somas[st.id].p; if (bloom.has(c)) { travel = { A: from.clone(), B: c.p.clone(), t0: now, dur: 0.9 }; sfx.whoosh?.(1); } }
      go({ k: "lock", kind: c.kind, id: c.id }); };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setIntro(false); const f = Math.exp(e.deltaY * 0.0012); G.d = Math.max(8, Math.min(1100, G.d * f)); tau = 0.3;
      if (e.deltaY < 0) { ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam); const pt = ray.ray.at(C.d, new THREE.Vector3()); G.t.lerp(pt, Math.min(0.5, (1 - f) * 2.2)); } };
    el.addEventListener("pointerdown", onDown); el.addEventListener("pointermove", onMove); el.addEventListener("pointerup", onUp); el.addEventListener("pointercancel", onUp); el.addEventListener("wheel", onWheel, { passive: false });
    (window as unknown as { __coachDim: () => void }).__coachDim = () => coachDone(2);
    api.current = {
      go, word: (w: string) => go({ k: "explore", q: w }), pick: (id: number) => go({ k: "explore", seed: id }),
      jump: (i: number) => { if (digest) go({ k: "digest", d: digest, i }); }, fly: (k: number) => jumpRegion(k),
      pause: (p: boolean) => { pausedNow = p; setPaused(p); if (p) scrSlot.v.pause(); else { scrSlot.v.play().catch(() => {}); if (scrSlot.v.ended && digest) go({ k: "digest", d: digest, i: di + 1 }); } },
    };

    // ---- 毎フレーム ----
    let last = 0;
    function frame(t: number) {
      if (!alive) return; requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (t - (last || t)) / 1000)); last = t; now += dt;
      if (!ptrs.size) G.yaw += dt * auto * (reduce ? 0.3 : 1);
      const k = 1 - Math.exp(-dt / tau);
      C.t.lerp(G.t, k); C.d += (G.d - C.d) * k; C.yaw += (G.yaw - C.yaw) * k; C.pitch += (G.pitch - C.pitch) * k;
      cam.position.copy(camPos()); cam.lookAt(C.t);
      const offGoal = st.k === "lock" ? innerHeight * (portrait() ? (ring ? 0.25 : 0.1) : 0.08) : 0; viewOff += (offGoal - viewOff) * (1 - Math.exp(-dt / 0.4));
      if (Math.abs(viewOff) > 0.5) cam.setViewOffset(innerWidth, innerHeight, 0, viewOff, innerWidth, innerHeight); else cam.clearViewOffset();
      fovKick = Math.max(0, fovKick - dt * 1.1); const fb = portrait() ? 64 : 50, fk = Math.sin(Math.min(1, fovKick) * Math.PI) * 26;
      if (Math.abs(cam.fov - (fb + fk)) > 0.01) { cam.fov = fb + fk; cam.updateProjectionMatrix(); }
      if (N) { lodT -= dt; if (lodOn && lodT <= 0) { lodT = 0.45; updateLOD(); } regionT -= dt; if (regionT <= 0 && (st.k === "free" || st.k === "lock")) { regionT = 0.3; updateRegions(); } }
      if (fiberMat) { fiberMat.uniforms.uTime.value = now; fiberMat.uniforms.uFade.value += (fadeGoal - fiberMat.uniforms.uFade.value) * (1 - Math.exp(-dt / 0.8)); }
      if (dendMat) dendMat.uniforms.uTime.value = now;
      if (path) ((path.material as THREE.ShaderMaterial).uniforms.uTime.value = now);
      const ko = 1 - Math.exp(-dt / 0.4);
      for (const c of [...somas, ...tips, ...ringCells]) {
        c.s += (c.gs - c.s) * ko; c.op += (c.gop - c.op) * ko; c.rim += (c.grim - c.rim) * ko; c.dot += (c.gdot - c.dot) * ko; c.mat.uniforms.uDot.value = c.dot;
        const dd = cam.position.distanceTo(c.p), dotK = c.dot > 0.5 ? Math.max(0.22, Math.min(1, dd / 110)) : 1;
        if (!ringCells.includes(c)) c.mesh.position.copy(c.p); c.mesh.scale.setScalar(c.s * dotK); c.mesh.quaternion.copy(cam.quaternion);
        const dist = cam.position.distanceTo(c.p), fog = Math.max(0.12, Math.min(1, 1 - (dist - 160) / 700));
        c.mat.uniforms.uOp.value = c.op * fog; c.mat.uniforms.uRim.value = c.rim; c.mesh.visible = c.op > 0.01;
        c.mesh.renderOrder = Math.round(-dist);
      }
      for (const [c, f] of Array.from(bloom)) c.gs = sizeAt(c, f) * (reduce ? 1 : 1 + Math.sin(now * 1.4 + c.id) * 0.015);
      if (travel) { const u = Math.min(1, (now - travel.t0) / travel.dur), e = u * u * (3 - 2 * u); G.t.copy(curve(travel.A, travel.B, 0.75)(e)); C.t.lerp(G.t, 0.35); G.d = 30 + Math.sin(u * Math.PI) * 25; tau = 0.2; if (u >= 1) travel = null; }
      // 周り: 空間のあちこちから飛んできて、中心のまわりに並ぶ（少し呼吸する）
      if (ring) { const n = ring.ids.length, pa = ringGeo.getAttribute("position") as THREE.BufferAttribute, ca = ringGeo.getAttribute("color") as THREE.BufferAttribute, col = new THREE.Color(ring.dim >= 0 ? DIM_COLOR[ring.dim] : "#ffffff"), T = new THREE.Vector3();
        for (let k = 0; k < RN; k++) { const rc = ringCells[k];
          if (k >= n) { pa.setXYZ(k * 2, 0, 0, 0); pa.setXYZ(k * 2 + 1, 0, 0, 0); continue; }
          const u = Math.max(0, Math.min(1, (now - ring.t0 - k * 0.06) / 1.0)), e = u * u * (3 - 2 * u);
          ringPos(k, n, T); rc.mesh.position.copy(ring.from[k]).lerp(T, e); rc.p.copy(rc.mesh.position);
          rc.gs = sizeAt(rc, portrait() ? 0.085 : 0.13) * (1 + (reduce ? 0 : Math.sin(now * 1.3 + k) * 0.02));
          const cp0 = ring.center.mesh.position; pa.setXYZ(k * 2, cp0.x, cp0.y, cp0.z); pa.setXYZ(k * 2 + 1, rc.mesh.position.x, rc.mesh.position.y, rc.mesh.position.z);
          const a = e * 0.75; ca.setXYZ(k * 2, col.r * a * 0.3, col.g * a * 0.3, col.b * a * 0.3); ca.setXYZ(k * 2 + 1, col.r * a, col.g * a, col.b * a); }
        pa.needsUpdate = ca.needsUpdate = true; ringLines.visible = true; ring.center.gs = sizeAt(ring.center, ring.cf); } else ringLines.visible = false;
      // 目の前の映像: 細胞の位置から育って目の前に来る
      const { p: sp, w: sw } = screenXf(scr.frac); scr.op += (scr.gop - scr.op) * (1 - Math.exp(-dt / 0.25)); scr.k = Math.min(1, scr.k + dt / 0.7);
      const e = 1 - Math.pow(1 - scr.k, 3), from = scr.from || sp;
      screen.position.copy(from).lerp(sp, e); screen.quaternion.copy(cam.quaternion); screen.scale.setScalar(Math.max(0.01, sw * (0.08 + 0.92 * e)));
      (screen.material as THREE.ShaderMaterial).uniforms.uOp.value = scr.op; screen.visible = scr.op > 0.01;
      // 割れた楔: まず外へ弾け、それから文脈の細胞へ飛んで吸い込まれる
      for (const w of wedges) { const u = Math.max(0, now - w.t0), m = w.mesh.material as THREE.ShaderMaterial;
        const out = new THREE.Vector3(Math.cos(w.dir), Math.sin(w.dir) * 0.5625, 0).multiplyScalar(sw * 0.35 * Math.min(1, u / 0.25)).applyQuaternion(cam.quaternion);
        const fk = Math.max(0, Math.min(1, (u - 0.18) / 0.75)), fe = fk * fk * (3 - 2 * fk);
        w.mesh.position.copy(sp).add(out).lerp(w.to, fe); w.mesh.scale.setScalar(Math.max(0.01, sw * (1 - 0.94 * fe))); w.mesh.quaternion.copy(cam.quaternion); m.uniforms.uOp.value = 1 - fk * fk; }
      renderer.render(scene, cam);
      if (N) syncLabels(dt);
      const wp = document.querySelector(".nw-wordpt") as HTMLElement | null;
      if (wp) { if (wordPoint) { V.copy(wordPoint).project(cam); wp.style.left = `${((V.x + 1) / 2) * innerWidth}px`; wp.style.top = `${((1 - V.y) / 2) * innerHeight}px`; wp.style.opacity = V.z < 1 ? "1" : "0"; } else wp.style.opacity = "0"; }
    }
    requestAnimationFrame(frame);
    (window as unknown as { __nw: unknown }).__nw = {
      ready: () => !!N && tips.length > 0, stage: () => stageRef.current, go,
      screenOf: (kind: "m" | "c", id: number) => { const c = (kind === "m" ? somas : tips)[id]; V.copy(c.p).project(cam); return [((V.x + 1) / 2) * innerWidth, ((1 - V.y) / 2) * innerHeight, V.z]; },
      nearSoma: () => somas.map((s, k) => { V.copy(s.p).project(cam); return { k, z: V.z, x: V.x, y: V.y, o: s.op }; }).filter((x) => x.o > 0.6 && x.z < 1 && Math.abs(x.x) < 0.6 && Math.abs(x.y) < 0.6).sort((a, b) => a.z - b.z)[0]?.k,
      ringOf: (k: number) => { const c = ringCells[k]; V.copy(c.mesh.position).project(cam); return [((V.x + 1) / 2) * innerWidth, ((1 - V.y) / 2) * innerHeight, c.op, c.id]; }, ringN: () => (ring ? ring.ids.length : 0),
      targets: () => Array.from(bloom.keys()).filter((c) => c.kind === "c" && !(stageRef.current.k === "lock" && (stageRef.current as { id: number }).id === c.id && (stageRef.current as { kind: string }).kind === "c")).map((c) => { V.copy(c.mesh.position).project(cam); return [((V.x + 1) / 2) * innerWidth, ((1 - V.y) / 2) * innerHeight, c.id, V.z]; }),
      playing: () => slots.filter((s) => s.owner && !s.v.paused && s.v.readyState >= 2).length, screenSound: () => !scrSlot.v.muted && !scrSlot.v.paused, regions: () => N.regions.length,
    };
    return () => { alive = false; clearLater(); removeEventListener("resize", resize); renderer.dispose(); el.innerHTML = ""; lh.innerHTML = ""; slots.forEach((s) => { s.v.pause(); s.v.src = ""; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e?: React.FormEvent) => { e?.preventDefault(); const w = (q.trim() || EX[ph]).slice(0, 40); setNote(""); setQ(""); getCrowd().start(); sfx.start(); api.current?.word(w); };
  const d = stage.k === "digest" || stage.k === "end" ? stage.d : null;
  const shareUrl = d && typeof window !== "undefined" ? `${location.origin}/d/${enc({ n: d.name, s: d.seed ?? -1, q: d.q, i: d.items.map((x) => x.id), t: [] })}` : "";
  const shareText = d ? `熱狂ダイジェスト「${d.name}」— ${d.items.length}本の瞬間が「${d.seedTitle}」で繋がった #DAZNAWARDS2026` : "";
  const share = async () => { if (!d) return; try { if (navigator.share) { await navigator.share({ title: d.name, text: shareText, url: shareUrl }); return; } } catch { /* 下のボタンで */ }
    try { await navigator.clipboard.writeText(`${shareText} ${shareUrl}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* */ } };
  const ctxOf = (id: number) => net?.ctx[id];
  return (
    <div className="nw">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={host} className="nw-gl" />
      <div ref={lblHost} className="nw-lbs" />
      <div className="nw-wordpt">{stage.k === "explore" && stage.q ? stage.q : ""}</div>
      <header className="nw-head">
        <a href="/moments" className="nw-logo">DAZN <em>100</em> MOMENTS</a>
      </header>
      {stage.k === "free" && stats && (intro || here) && (
        <div className="nw-intro">
          {intro && <div className="nw-stat"><b>{stats.m}</b>の瞬間<i>→</i><b>{stats.c}</b>の熱狂の文脈<i>→</i><b>{stats.l.toLocaleString()}</b>の響き合い</div>}

          {here && <div className="nw-here">いま「{here}」の領域</div>}
        </div>
      )}
      {stage.k === "free" && chips.length > 0 && (
        <div className="nw-dest">{chips.slice(0, 3).map((c) => (
          <button key={c.k} onClick={() => { setIntro(false); api.current?.fly(c.k); }}><i style={{ transform: `rotate(${-c.a}rad)` }}>➤</i>{c.name}</button>
        ))}</div>
      )}
      {toast && <div className="nw-toast" key={toast.key}><b>{toast.t}</b>{toast.s && <span>{toast.s}</span>}</div>}
      {stage.k === "lock" && net && <LockBar s={stage} net={net} api={api} />}
      {stage.k === "lock" && coach === "ring" && <div className="nw-coach r">光が届いた先を押すと、そこへ飛ぶ</div>}
      {stage.k === "lock" && coach === "dim" && stage.kind === "c" && <div className="nw-coach d">下の見方を替えると、集まる熱が変わる</div>}
      {stage.k === "watch" && <button className="nw-close" onClick={() => api.current?.go({ k: "lock", kind: stage.kind, id: stage.id })}>← 戻る</button>}
      {stage.k !== "free" && stage.k !== "lock" && stage.k !== "watch" && (hud.big || hud.title) && (
        <div className={`nw-hud${stage.k === "digest" ? " dg" : ""}`} key={(hud.big || "") + (hud.title || "")}>
          {hud.big && stage.k !== "digest" && <div className="nw-big">{hud.big}</div>}
          {hud.title && <div className="nw-title">{hud.title}</div>}
          {hud.line && <div className="nw-line">{hud.line}</div>}
          {hud.sub && <div className="nw-sub">{hud.sub}</div>}
        </div>
      )}
      {stage.k === "digest" && hud.big && <div className="nw-dname">{hud.big}<small>{stage.i + 1} / {stage.d.items.length}</small></div>}
      {stage.k === "explore" && hud.counter && <Counter c={hud.counter} />}
      {hover && <div className="nw-hv" style={{ left: Math.min(hover.x + 16, (typeof window !== "undefined" ? innerWidth : 1280) - 320), top: hover.y + 16 }}><div className="t">{hover.t}</div>{hover.s && <div className="s">{hover.s}</div>}</div>}
      {d && (
        <div className="nw-chain">
          {d.items.map((it, i) => { const c = ctxOf(it.id); return (
            <button key={it.id} className={stage.k === "digest" && stage.i === i ? "cur" : stage.k === "digest" && stage.i > i ? "done" : ""} onClick={() => api.current?.jump(i)} title={c?.title}>
              <img src={`${BASE}/ctx/c/${it.id}.jpg`} alt="" /><span>{c?.title}</span>
            </button>); })}
        </div>
      )}
      {stage.k === "digest" && (
        <div className="nw-ctl">
          <button onClick={() => api.current?.pause(!paused)}>{paused ? "▶ 続ける" : "❚❚ 止める"}</button>
          <button onClick={() => api.current?.pick(stage.d.items[stage.i].id)}>この熱から、さらに探す</button>
          <button className="sh" onClick={share}>シェア</button>
        </div>
      )}
      {stage.k === "end" && (
        <div className="nw-end">
          <div className="k">あなたの熱狂ダイジェスト</div>
          <div className="n">{stage.d.name}</div>
          <div className="m">「{stage.d.seedTitle}」から、{stage.d.items.length}本の瞬間が響き合った</div>
          <div className="b">
            <a className="x" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">X でシェア</a>
            <a href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">LINE</a>
            <button onClick={share}>{copied ? "コピーしました" : "リンクをコピー"}</button>
          </div>
          <div className="b2"><button onClick={() => api.current?.jump(0)}>もう一度観る</button><button onClick={() => api.current?.go({ k: "free" })}>別の熱を探す</button></div>
        </div>
      )}
      {!net && <div className="nw-load">熱狂の神経系を読み込んでいます</div>}
      {(stage.k === "free" || stage.k === "explore") && (
        <form className="nw-in" onSubmit={submit}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`熱狂の言葉を投げる　例「${EX[ph]}」`} maxLength={40} enterKeyHint="send" />
          <button type="submit" disabled={stage.k === "explore"}>{stage.k === "explore" ? "探索中" : "探す"}</button>
        </form>
      )}
      {note && <div className="nw-note" onClick={() => setNote("")}>{note}</div>}
    </div>
  );
}

// ロックオンしたもの（中心）の下の欄: 名前と、見方を替えるボタン（チャンネル）と、音つきで観る・この熱で探す
function LockBar({ s, net, api }: { s: Extract<Stage, { k: "lock" }>; net: Net; api: React.MutableRefObject<{ go: (s: Stage) => void } | null> }) {
  const go = (x: Stage) => api.current?.go(x);
  if (s.kind === "m") {
    const m = net.moments[s.id];
    return (
      <div className="nw-bar">
        <button className="x" onClick={() => go({ k: "free" })} aria-label="外す">×</button>
        <div className="h"><b>{m.title}</b><span>{m.sport}　ほどけた熱を押すと、そこから信号が走る</span></div>
        <div className="a"><button onClick={() => go({ k: "watch", kind: "m", id: s.id })}>▶ 音つきで観る</button></div>
      </div>
    );
  }
  const c = net.ctx[s.id];
  const dims = Object.keys(c.dn || {}).map(Number).sort((a, b) => c.w[b] - c.w[a]).slice(0, 4);
  return (
    <div className="nw-bar">
      <button className="x" onClick={() => go({ k: "free" })} aria-label="外す">×</button>
      <div className="h"><b>{c.title}</b><span>{c.line}</span></div>
      {dims.length > 0 && (
        <div className="v">
          {dims.map((d) => (
            <button key={d} className={s.dim === d ? "on" : ""} style={{ borderColor: DIM_COLOR[d], ...(s.dim === d ? { background: DIM_COLOR[d], color: "#000" } : {}) }} onClick={() => { (window as unknown as { __coachDim?: () => void }).__coachDim?.(); go({ k: "lock", kind: "c", id: s.id, dim: d }); }}>{c.v[d]}</button>
          ))}
        </div>
      )}
      <div className="a">
        <button onClick={() => go({ k: "watch", kind: "c", id: s.id })}>▶ 音つきで観る</button>
        <button className="go" onClick={() => go({ k: "explore", seed: s.id })}>この熱で100本を探す</button>
      </div>
    </div>
  );
}

// 探索の量: 実数まで数え上げる
function Counter({ c }: { c: { scanned: number; resonated: number; lit: number } }) {
  const [v, setV] = useState({ scanned: 0, resonated: 0, lit: 0 });
  useEffect(() => { let raf = 0; const t0 = performance.now(), from = { ...v };
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 2200), e = 1 - Math.pow(1 - k, 3);
      setV({ scanned: Math.round(from.scanned + (c.scanned - from.scanned) * e), resonated: Math.round(from.resonated + (c.resonated - from.resonated) * e), lit: Math.round(from.lit + (c.lit - from.lit) * e) }); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.scanned, c.resonated, c.lit]);
  return (
    <div className="nw-count">
      <div><b>{v.scanned.toLocaleString()}</b><span>の熱狂の文脈と、8つの次元で照らし合わせ</span></div>
      <div><b>{v.lit.toLocaleString()}</b><span>本の線維を信号が通り</span></div>
      <div><b>{v.resonated.toLocaleString()}</b><span>の文脈が響き合った</span></div>
    </div>
  );
}

const CSS = `
.nw{position:fixed;inset:0;background:#000;color:#fff;overflow:hidden;font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;touch-action:none;user-select:none}
.nw-gl,.nw-lbs{position:absolute;inset:0}.nw-gl{cursor:grab}.nw-lbs{pointer-events:none}
.nw-head{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 0;z-index:5;pointer-events:none}
.nw-head>*{pointer-events:auto}
.nw-logo{color:#fff;text-decoration:none;font-weight:900;font-size:13px;letter-spacing:.08em}.nw-logo em{font-style:normal;color:#ffff00}
.nw-back{background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.3);color:#fff;font-size:12px;padding:7px 12px;cursor:pointer;text-decoration:none}
.nw-intro{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 64px);text-align:center;pointer-events:none;padding:0 16px;animation:nwIn 1.2s ease both}
.nw-stat{font-size:clamp(13px,1.6vw,17px);color:rgba(255,255,255,.75);letter-spacing:.04em}.nw-stat b{font-size:clamp(24px,3.6vw,44px);font-weight:900;color:#fff;margin:0 4px;font-variant-numeric:tabular-nums}.nw-stat i{font-style:normal;margin:0 10px;color:rgba(255,255,255,.4)}
.nw-intro p{font-size:12px;color:rgba(255,255,255,.6);margin-top:10px}
.nw-hud{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 52px);text-align:center;pointer-events:none;padding:0 16px;animation:nwIn .8s ease both;z-index:3}
.nw-big{font-size:clamp(28px,4.6vw,58px);font-weight:900;letter-spacing:.03em;line-height:1.15;text-shadow:0 2px 24px #000,0 0 4px #000}
.nw-title{font-size:clamp(18px,2.4vw,28px);font-weight:800;margin-top:6px;text-shadow:0 0 12px #000,0 0 3px #000}
.nw-hud.dg .nw-title{color:#ffee55}
.nw-line{font-size:clamp(13px,1.4vw,16px);margin:6px auto 0;max-width:640px;line-height:1.55;text-shadow:0 0 10px #000,0 0 3px #000}
.nw-sub{font-size:12px;color:rgba(255,255,255,.65);margin:6px auto 0;max-width:640px;line-height:1.5;text-shadow:0 0 8px #000}
.nw-hud.dg{top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 132px)}
.nw-dname{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 46px);text-align:center;font-size:clamp(20px,2.8vw,34px);font-weight:900;pointer-events:none;text-shadow:0 2px 18px #000,0 0 4px #000;z-index:3;padding:0 16px}.nw-dname small{display:block;font-size:11px;font-weight:600;color:rgba(255,255,255,.6);margin-top:2px}
.nw-count{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 90px);display:flex;gap:28px;pointer-events:none;z-index:3;white-space:nowrap}
.nw-count div{display:flex;flex-direction:column;align-items:center}.nw-count b{font-size:clamp(22px,3.2vw,40px);font-weight:900;font-variant-numeric:tabular-nums;line-height:1}.nw-count span{font-size:11px;color:rgba(255,255,255,.65);margin-top:4px}
.nw-lb{position:absolute;left:0;top:0;text-align:center;white-space:nowrap;text-shadow:0 0 8px #000,0 0 3px #000,0 0 14px #000;transition:opacity .5s;will-change:transform}
.nw-lb b{display:block;font-size:13px;font-weight:800;letter-spacing:.02em}.nw-lb span{display:block;font-size:10px;color:rgba(255,255,255,.6);margin-top:1px}
.nw-lb.seed b{font-size:16px;color:#ffee55}
.nw-lb.on b{animation:nwType .6s steps(12) both}
.nw-lb.d1 b{animation-delay:.1s}.nw-lb.d2 b{animation-delay:.2s}.nw-lb.d3 b{animation-delay:.3s}.nw-lb.d4 b{animation-delay:.4s}.nw-lb.d5 b{animation-delay:.5s}.nw-lb.d6 b{animation-delay:.6s}.nw-lb.d7 b{animation-delay:.7s}
@keyframes nwType{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
.nw-wordpt{position:absolute;transform:translate(-50%,-50%);font-size:clamp(26px,4.4vw,56px);font-weight:900;pointer-events:none;text-shadow:0 0 24px #000,0 0 6px #000;z-index:2;white-space:nowrap;transition:opacity .4s}
.nw-hv{position:absolute;max-width:310px;background:rgba(0,0,0,.82);border:1px solid rgba(255,255,255,.18);padding:9px 11px;pointer-events:none;font-size:12px;line-height:1.55;z-index:6}
.nw-hv .t{font-weight:800;font-size:13px}.nw-hv .s{color:rgba(255,255,255,.72);font-size:11px;margin-top:3px}
.nw-chain{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 62px);display:flex;gap:6px;z-index:4;max-width:calc(100% - 24px);overflow-x:auto;scrollbar-width:none}
.nw-chain button{flex:0 0 auto;width:96px;background:none;border:0;padding:0;color:#fff;cursor:pointer;opacity:.5;text-align:left}
.nw-chain button img{width:96px;height:54px;object-fit:cover;display:block;border:2px solid transparent}
.nw-chain button span{display:block;font-size:9px;line-height:1.3;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nw-chain button.cur{opacity:1}.nw-chain button.cur img{border-color:#ffee55}.nw-chain button.done{opacity:.8}
.nw-ctl{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 16px);display:flex;gap:8px;z-index:4;white-space:nowrap}
.nw-ctl button{background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.4);color:#fff;font-size:12px;padding:9px 14px;cursor:pointer}
.nw-ctl .sh{background:#ffff00;color:#000;border-color:#ffff00;font-weight:800}
.nw-end{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 128px);margin:0 auto;text-align:center;z-index:5;background:rgba(0,0,0,.6);padding:22px 26px;border:1px solid rgba(255,255,255,.15);width:min(520px,calc(100% - 32px));box-sizing:border-box;animation:nwFade 1s .6s ease both}
@keyframes nwFade{from{opacity:0}to{opacity:1}}
.nw-end .k{font-size:12px;color:rgba(255,255,255,.7);letter-spacing:.1em}.nw-end .n{font-size:clamp(28px,5vw,46px);font-weight:900;margin:6px 0}.nw-end .m{font-size:13px;color:rgba(255,255,255,.8)}
.nw-end .b{display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap}
.nw-end .b>*{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.4);color:#fff;font-size:13px;padding:10px 16px;cursor:pointer;text-decoration:none;font-weight:700}
.nw-end .b .x{background:#ffff00;color:#000;border-color:#ffff00}
.nw-end .b2{display:flex;gap:16px;justify-content:center;margin-top:12px}.nw-end .b2 button{background:none;border:0;color:rgba(255,255,255,.75);font-size:12px;text-decoration:underline;cursor:pointer}
.nw-in{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 18px);width:min(560px,calc(100% - 32px));display:flex;gap:8px;z-index:4}
.nw-in input{flex:1;min-width:0;background:rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.35);color:#fff;font-size:16px;padding:12px 14px;outline:none;border-radius:0}
.nw-in input:focus{border-color:#ffff00}
.nw-in button{background:#ffff00;color:#000;border:0;font-weight:800;font-size:14px;padding:0 18px;cursor:pointer;white-space:nowrap}.nw-in button:disabled{opacity:.6}
.nw-note{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 76px);text-align:center;font-size:12px;color:rgba(255,255,255,.85);padding:0 16px;text-shadow:0 0 6px #000;z-index:4}
.nw-load{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;color:rgba(255,255,255,.6);pointer-events:none}
.nw-found{font-size:11px;color:rgba(255,255,255,.75);background:rgba(0,0,0,.45);padding:6px 10px;border:1px solid rgba(255,255,255,.18);white-space:nowrap}.nw-found b{color:#ffee55;font-size:14px;margin:0 2px}
.nw-head{gap:8px}.nw-head>.nw-back{margin-left:auto}
.nw-here{display:inline-block;margin-top:10px;font-size:12px;color:#ffee55;letter-spacing:.06em}
.nw-dest{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 74px);display:flex;gap:8px;z-index:4;max-width:calc(100% - 24px);justify-content:center;flex-wrap:wrap}
.nw-dest button{background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.28);color:#fff;font-size:12px;font-weight:700;padding:7px 11px 7px 9px;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px;backdrop-filter:blur(4px)}
.nw-dest button i{font-style:normal;color:#ffee55;display:inline-block;font-size:10px}
.nw-dest button:hover{border-color:#ffee55}
.nw-toast{position:absolute;left:0;right:0;top:38%;text-align:center;pointer-events:none;z-index:4;animation:nwToast 3.2s ease both}.nw-toast b{display:block;font-size:clamp(28px,4.6vw,56px);font-weight:900;text-shadow:0 2px 24px #000,0 0 4px #000}.nw-toast span{font-size:12px;color:rgba(255,255,255,.75)}
@keyframes nwToast{0%{opacity:0;letter-spacing:.3em}15%{opacity:1;letter-spacing:.04em}75%{opacity:1}100%{opacity:0}}
.nw-lb.lock b{font-size:16px;color:#fff}.nw-lb.lock span{font-size:11px}
.nw-lb.lod b{font-size:12px;animation:nwRise .7s ease both}.nw-lb.lod span{animation:nwRise .7s .1s ease both}
@keyframes nwRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.nw-bar{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);width:min(640px,calc(100% - 24px));z-index:5;background:linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.75));border:0;border-top:1px solid rgba(255,255,255,.14);padding:12px 14px 12px;backdrop-filter:blur(6px);box-sizing:border-box;animation:nwBar .35s ease both}
@keyframes nwBar{from{opacity:0}to{opacity:1}}
.nw-bar .x{position:absolute;right:6px;top:4px;background:none;border:0;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;padding:2px 8px}
.nw-bar .h{padding-right:28px}.nw-bar .h b{display:block;font-size:17px;font-weight:900}.nw-bar .h span{display:block;font-size:12px;color:rgba(255,255,255,.75);margin-top:3px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nw-bar .h em{display:block;font-style:normal;font-size:10px;color:rgba(255,255,255,.55);margin-top:2px}
.nw-bar .v{display:flex;gap:6px;margin-top:9px;align-items:center;overflow-x:auto;scrollbar-width:none}
.nw-bar .v button{flex:0 0 auto;background:rgba(0,0,0,.4);border:1px solid;color:#fff;font-size:12px;font-weight:700;padding:7px 12px;cursor:pointer;border-radius:999px;transition:background .2s}
.nw-bar .v button.on{background:rgba(255,255,255,.2)}
.nw-bar .a{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}.nw-bar .a button{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.4);color:#fff;font-size:13px;font-weight:700;padding:9px 14px;cursor:pointer}
.nw-bar .a button.on{background:rgba(255,255,255,.25)}.nw-bar .a .go{background:#ffff00;color:#000;border-color:#ffff00;margin-left:auto}
.nw-coach{position:absolute;left:50%;transform:translateX(-50%);z-index:6;pointer-events:none;background:#ffff00;color:#000;font-weight:900;font-size:14px;padding:9px 14px;white-space:nowrap;animation:nwCoach 1.6s ease-in-out infinite}
.nw-coach.r,.nw-coach.d{top:calc(env(safe-area-inset-top,0px) + 54px)}.nw-coach i{font-style:normal;margin-left:6px}
@keyframes nwCoach{0%,100%{opacity:1}50%{opacity:.72}}
.nw-close{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 24px);z-index:5;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.4);color:#fff;font-size:13px;padding:10px 18px;cursor:pointer}
@media (max-width:600px){.nw-bar .a .go{margin-left:0;width:100%}.nw-bar .h b{font-size:15px}.nw-chip{font-size:11px;padding:6px 9px 6px 7px}.nw-found{font-size:10px;padding:5px 7px}.nw-logo{font-size:11px}}
@media (max-width:600px){.nw-count{gap:14px}.nw-count span{font-size:9px;white-space:normal;max-width:96px;text-align:center}.nw-stat i{margin:0 4px}.nw-chain button{width:72px}.nw-chain button img{width:72px;height:40px}.nw-hud.dg{bottom:calc(env(safe-area-inset-bottom,0px) + 118px)}}
@keyframes nwIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
`;

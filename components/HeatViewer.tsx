"use client";
// 熱狂を観る体験（2026-10-19 作り直し。見せ方を映像が主役の流れに）。データは熱狂の神経系（public/ctx/net.json・/api/ctx/digest）をそのまま使う。
//   1 空間: 100の瞬間が映像の板として奥行きの中に漂う。中央に近い数本は常に動き、名前が出る。指で空間を流せる。
//   2 1本を押す: 板が画面いっぱいに広がって音つきで流れる → 画面が破片に割れ、その瞬間の熱狂の文脈が、映像の流れるカードになって並ぶ（分解）
//   3 カードを押す: カメラが一気に引き、全文脈が星になって広がる中を、選んだ熱から神経が枝分かれして伸び、響き合う瞬間が次々と灯る（探索）
//      → 灯った瞬間が手前のフィルムの帯へ飛んできて名前が付く
//   4 ダイジェスト: 帯の瞬間が画面いっぱいに切り替わりながら流れる（熱の名前と一言）。途中から「この熱から分岐」
//   5 最後: 自分のダイジェストをシェア（/d/<code>）
// 押した結果はいつも同じ: 瞬間＝観る→分解、文脈＝探索→ダイジェスト。
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getCrowd } from "@/lib/crowd";
import { sfx } from "@/lib/sfx";

const BASE = "https://storage.googleapis.com/e-mooments-assets";
const DIM_COLOR = ["#ff3366", "#ffee55", "#4de6ff", "#ff8866", "#ff1a26", "#dff257", "#66ccff", "#dd8820"];
const EX = ["最後の花道", "誰かのために", "負けた側の涙", "親父", "老いてなお", "報われた日"];
const SEG = 10;

type Ctx = { id: number; no: string; title: string; line: string; who: string; t: number; w: number[]; v: string[]; p: number[] };
type Mom = { no: string; title: string; sport: string; ctx: number[]; p: number[] };
type Net = { dims: string[]; moments: Mom[]; ctx: Ctx[]; links: [number, number, number, number][] };
export type Digest = { name: string; seedTitle: string; seedLine?: string; items: { id: number; line: string; dim: number; s: number }[]; scanned: number; resonated: number; seed?: number; q?: string };
export type MediaMap = Record<string, { webm?: string; loop?: string; detail?: string; peak?: number }>;
type Mode =
  | { k: "home" }
  | { k: "watch"; m: number; phase: "play" | "split" | "cards" }
  | { k: "explore"; seed?: number; q?: string; d?: Digest; phase: "scan" | "gather" }
  | { k: "digest"; d: Digest; i: number }
  | { k: "end"; d: Digest };
type Engine = {
  mode: (k: Mode["k"]) => void;
  project: (kind: "m" | "c", id: number) => { x: number; y: number; w: number; vis: boolean };
  explore: (seed?: number) => number;
  gather: (ids: number[]) => void;
  center: () => number | null;
};

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// 映像の板: 角の丸い 16:9、縁はやわらかく
const TILE_FRAG = `precision highp float; varying vec2 vUv;
uniform sampler2D uMap; uniform vec4 uRect; uniform float uOp; uniform float uHas; uniform float uLit;
void main(){ vec2 q = abs(vUv - 0.5) * vec2(1.7778, 1.0); vec2 b = vec2(0.889 - 0.06, 0.5 - 0.06); float d = length(max(q - b, 0.0)) - 0.06;
  float a = uOp * (1.0 - smoothstep(-0.008, 0.006, d)); if (a < 0.003) discard;
  vec3 c = uHas > 0.5 ? texture2D(uMap, uRect.xy + vUv * uRect.zw).rgb : vec3(0.08);
  c *= 0.55 + 0.45 * uLit; gl_FragColor = vec4(c * a, a); }`;
// 星（文脈）: 丸くやわらかい点。灯ると大きく、その熱の色に
const STAR_VERT = `attribute float aB; attribute float aDim; uniform float uSize; uniform float uBase; uniform vec3 uCol[8]; varying vec3 vC; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float b = clamp(aB, 0.0, 1.0);
  vec3 warm = uCol[0]; for (int i = 1; i < 8; i++) { if (abs(aDim - float(i)) < 0.5) warm = uCol[i]; }
  vC = mix(vec3(0.62, 0.7, 0.92), mix(warm, vec3(1.0), 0.25), b); vA = uBase * (0.35 + 0.65 * b) + b * 0.6;
  gl_PointSize = uSize * (1.0 + b * 2.4) * (300.0 / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }`;
const STAR_FRAG = `precision highp float; varying vec3 vC; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = vA * smoothstep(1.0, 0.0, r) * smoothstep(1.0, 0.55, r) ; gl_FragColor = vec4(vC, a); }`;
const FIBER_VERT = `attribute float aU; attribute float aStart; attribute float aStr; attribute float aDim; attribute float aRev;
uniform float uTime; uniform float uBase; uniform vec3 uCol[8]; uniform vec3 uCold; uniform float uSpeed;
varying vec3 vC; varying float vA;
void main(){ float u = aRev > 0.5 ? 1.0 - aU : aU;
  float lit = clamp((uTime - aStart) * uSpeed - u, 0.0, 1.0); lit = lit * lit * (3.0 - 2.0 * lit);
  vec3 warm = uCol[0]; for (int i = 1; i < 8; i++) { if (abs(aDim - float(i)) < 0.5) warm = uCol[i]; }
  vC = mix(uCold, warm, lit); vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vA = mix(uBase * (0.35 + 0.65 * aStr), 0.22 + 0.55 * aStr, lit); gl_Position = projectionMatrix * mv; }`;
const FIBER_FRAG = `precision highp float; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC, vA); }`;
const enc = (o: object) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hashN = (i: number) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };

export default function HeatViewer({ media, startNo, shared }: { media: MediaMap; startNo?: string; shared?: { n: string; s?: number; q?: string; i: number[] } }) {
  const host = useRef<HTMLDivElement>(null), labelRef = useRef<HTMLDivElement>(null);
  const eng = useRef<Engine | null>(null);
  const [net, setNet] = useState<Net | null>(null);
  const [mode, setMode] = useState<Mode>({ k: "home" });
  const modeRef = useRef<Mode>(mode); modeRef.current = mode;
  const [q, setQ] = useState(""); const [ph, setPh] = useState(0);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const safari = typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const ext = safari ? "mp4" : "webm";
  useEffect(() => { const t = setInterval(() => setPh((p) => (p + 1) % EX.length), 3200); return () => clearInterval(t); }, []);

  // ---------------- 空間（WebGL） ----------------
  useEffect(() => {
    let alive = true; const el = host.current!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const portrait = () => innerHeight > innerWidth * 1.05;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, premultipliedAlpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setClearColor(0x000000, 1); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);
    const resize = () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.fov = portrait() ? 66 : 50; cam.updateProjectionMatrix(); };
    addEventListener("resize", resize); resize();
    const premul = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;
    let N: Net; let now = 0; let k: Mode["k"] = "home";
    // カメラ
    const C = { t: new THREE.Vector3(), d: 520, yaw: 0.5, pitch: 0.15 }, G = { t: new THREE.Vector3(), d: 260, yaw: 0.5, pitch: 0.15 }; let tau = 1.2, auto = 0.035;
    const camPos = () => new THREE.Vector3(C.t.x + C.d * Math.cos(C.pitch) * Math.sin(C.yaw), C.t.y + C.d * Math.sin(C.pitch), C.t.z + C.d * Math.cos(C.pitch) * Math.cos(C.yaw));
    // 映像の板（瞬間）
    type Tile = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; i: number; p: THREE.Vector3; op: number; gop: number; lit: number; still: THREE.Texture | null; rect: THREE.Vector4; vid: Slot | null };
    const tiles: Tile[] = []; const tileGeo = new THREE.PlaneGeometry(1.7778, 1);
    type Slot = { v: HTMLVideoElement; tex: THREE.VideoTexture; owner: Tile | null };
    const slots: Slot[] = Array.from({ length: portrait() ? 4 : 6 }, () => { const v = document.createElement("video"); v.crossOrigin = "anonymous"; v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
      const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; return { v, tex, owner: null }; });
    const playTiles = (want: Tile[]) => { const keep = new Set(want);
      for (const s of slots) if (s.owner && !keep.has(s.owner)) { const t = s.owner; t.vid = null; t.mat.uniforms.uMap.value = t.still; t.mat.uniforms.uRect.value = t.rect; s.owner = null; s.v.pause(); }
      for (const t of want) { if (t.vid) continue; const s = slots.find((x) => !x.owner); const md = media[N.moments[t.i].no]; const src = safari ? md?.loop : md?.webm; if (!s || !src) continue;
        s.owner = t; t.vid = s; s.v.src = src; s.v.load(); s.v.oncanplay = () => { if (t.vid === s) { t.mat.uniforms.uMap.value = s.tex; t.mat.uniforms.uRect.value = new THREE.Vector4(0, 0, 1, 1); } }; s.v.play().catch(() => {}); } };
    // 星（文脈）と線維
    let stars: THREE.Points | null = null, starMat: THREE.ShaderMaterial | null = null, aB: THREE.BufferAttribute; const arrive = new Float32Array(1); let arr = arrive; let gathered = new Set<number>();
    let fiber: THREE.LineSegments | null = null, fiberMat: THREE.ShaderMaterial | null = null, aStart: THREE.BufferAttribute, aRev: THREE.BufferAttribute;
    const cols = () => DIM_COLOR.map((c) => new THREE.Color(c));
    function build() {
      const scale = 1.25;
      N.moments.forEach((m, i) => { const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: TILE_FRAG, ...premul, uniforms: { uMap: { value: null }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uOp: { value: 0 }, uHas: { value: 0 }, uLit: { value: 0 } } });
        const mesh = new THREE.Mesh(tileGeo, mat); const p = new THREE.Vector3(m.p[0], m.p[1], m.p[2]).multiplyScalar(scale); mesh.position.copy(p); mesh.scale.setScalar(14); mesh.userData = { i }; scene.add(mesh);
        tiles.push({ mesh, mat, i, p, op: 0, gop: 1, lit: 0, still: null, rect: new THREE.Vector4(0, 0, 1, 1), vid: null }); });
      const n = N.ctx.length, pos = new Float32Array(n * 3), b = new Float32Array(n), dim = new Float32Array(n);
      N.ctx.forEach((c, i) => { pos.set(c.p.map((v) => v * scale), i * 3); dim[i] = Math.max(0, c.w.indexOf(Math.max(...c.w))); });
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); aB = new THREE.BufferAttribute(b, 1); g.setAttribute("aB", aB); g.setAttribute("aDim", new THREE.BufferAttribute(dim, 1));
      starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uSize: { value: 2.2 }, uBase: { value: 0.25 }, uCol: { value: cols() } } });
      stars = new THREE.Points(g, starMat); stars.frustumCulled = false; scene.add(stars); arr = new Float32Array(n).fill(1e6);
      // 線維（全部の響き合い）
      const L = N.links.length, nv = L * SEG * 2, fp = new Float32Array(nv * 3), u = new Float32Array(nv), st = new Float32Array(nv).fill(1e6), str = new Float32Array(nv), fd = new Float32Array(nv), rv = new Float32Array(nv);
      let mx = 0; for (const l of N.links) mx = Math.max(mx, l[2]);
      const P = (i: number) => new THREE.Vector3(N.ctx[i].p[0], N.ctx[i].p[1], N.ctx[i].p[2]).multiplyScalar(scale);
      N.links.forEach(([a, bb, s, d], li) => { const A = P(a), B = P(bb), M = A.clone().add(B).multiplyScalar(0.5 * 0.45); let prev = A;
        for (let j = 0; j < SEG; j++) { const t = (j + 1) / SEG, nx = new THREE.Vector3().copy(A).multiplyScalar((1 - t) * (1 - t)).addScaledVector(M, 2 * t * (1 - t)).addScaledVector(B, t * t), o = (li * SEG + j) * 2;
          fp.set([prev.x, prev.y, prev.z, nx.x, nx.y, nx.z], o * 3); u[o] = j / SEG; u[o + 1] = t; str[o] = str[o + 1] = Math.min(1, (s / mx) * 1.4); fd[o] = fd[o + 1] = Math.max(0, d); prev = nx; } });
      const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(fp, 3)); fg.setAttribute("aU", new THREE.BufferAttribute(u, 1));
      aStart = new THREE.BufferAttribute(st, 1); aRev = new THREE.BufferAttribute(rv, 1); fg.setAttribute("aStart", aStart); fg.setAttribute("aStr", new THREE.BufferAttribute(str, 1)); fg.setAttribute("aDim", new THREE.BufferAttribute(fd, 1)); fg.setAttribute("aRev", aRev);
      fiberMat = new THREE.ShaderMaterial({ vertexShader: FIBER_VERT, fragmentShader: FIBER_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uBase: { value: 0.05 }, uSpeed: { value: 1.3 }, uCol: { value: cols() }, uCold: { value: new THREE.Color("#33435e") } } });
      fiber = new THREE.LineSegments(fg, fiberMat); fiber.frustumCulled = false; fiber.renderOrder = -10; scene.add(fiber);
    }
    const starP = (i: number) => new THREE.Vector3(N.ctx[i].p[0], N.ctx[i].p[1], N.ctx[i].p[2]).multiplyScalar(1.25);
    // 段階ごとの空間の見え方
    const look = { tile: 1, star: 0.25, fiber: 0.05 };
    function setMode(m: Mode["k"]) {
      k = m;
      if (m === "home") { look.tile = 1; look.star = 0.25; look.fiber = 0.05; G.t.set(0, 0, 0); G.d = portrait() ? 250 : 175; tau = 1.3; auto = 0.035; resetSignal(); }
      else if (m === "explore") { look.tile = 0.07; look.star = 0.5; look.fiber = 0.08; G.d = portrait() ? 420 : 330; tau = 1.1; auto = 0.06; }
      else { look.tile = 0.3; look.star = 0.2; look.fiber = 0.04; auto = 0.015; }
    }
    function resetSignal() { if (!aStart) return; (aStart.array as Float32Array).fill(1e6); aStart.needsUpdate = true; arr.fill(1e6); gathered = new Set(); }
    // 探索: 実際の繋がりを幅優先で信号が伝わり、届いた星が灯る
    function explore(seed?: number) {
      resetSignal(); const adj = new Map<number, [number, number][]>(); N.links.forEach(([a, b], li) => { for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x)!.push([y, li]); } });
      const t0 = now + 0.5, seen = new Set<number>(), lit = new Set<number>(); let frontier: [number, number][] = [];
      if (seed !== undefined) { frontier = [[seed, t0]]; seen.add(seed); arr[seed] = t0 - 0.3; G.t.copy(starP(seed)); }
      else { for (let j = 0; j < 20; j++) { const i = Math.floor(hashN(j * 7 + 3) * N.ctx.length); frontier.push([i, t0 + j * 0.07]); seen.add(i); arr[i] = t0 + j * 0.07; } G.t.set(0, 0, 0); }
      for (let hop = 0; hop < 4 && lit.size < 1800; hop++) { const next: [number, number][] = [];
        for (const [x, tx] of frontier) for (const [y, li] of (adj.get(x) || []).slice(0, hop === 0 ? 24 : 8)) { if (lit.has(li)) continue; lit.add(li);
          const ts = tx + hashN(li) * 0.3; for (let j = 0; j < SEG * 2; j++) { const o = li * SEG * 2 + j; aStart.array[o] = ts; aRev.array[o] = N.links[li][0] !== x ? 1 : 0; }
          const ta = ts + 1 / 1.3; if (!seen.has(y)) { seen.add(y); arr[y] = ta; next.push([y, ta]); } }
        frontier = next; }
      aStart.needsUpdate = aRev.needsUpdate = true; return lit.size;
    }
    function gather(ids: number[]) { gathered = new Set(ids); look.fiber = 0.04; }
    // 操作
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const ptrs = new Map<number, [number, number]>(); let pinch = 0, moved = 0;
    const onDown = (e: PointerEvent) => { getCrowd().start(); sfx.start(); ptrs.set(e.pointerId, [e.clientX, e.clientY]); el.setPointerCapture(e.pointerId); moved = 0;
      if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()); pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } };
    const onMove = (e: PointerEvent) => { const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 1 && moved > 6) { G.yaw -= dx * 0.005; G.pitch = Math.max(-1.1, Math.min(1.1, G.pitch + dy * 0.004)); tau = 0.25; }
      else if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()), d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) G.d = Math.max(40, Math.min(900, G.d * (pinch / d))); pinch = d; tau = 0.25; } };
    const onUp = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; if (moved > 10 || k !== "home" || !N) return;
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
      const h = ray.intersectObjects(tiles.filter((t) => t.op > 0.3).map((t) => t.mesh), false)[0]; if (h) pickRef.current?.((h.object.userData as { i: number }).i); };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); G.d = Math.max(40, Math.min(900, G.d * Math.exp(e.deltaY * 0.0012))); tau = 0.3; };
    el.addEventListener("pointerdown", onDown); el.addEventListener("pointermove", onMove); el.addEventListener("pointerup", onUp); el.addEventListener("pointercancel", onUp); el.addEventListener("wheel", onWheel, { passive: false });
    // 読み込み
    (async () => {
      N = await (await fetch("/ctx/net.json")).json(); if (!alive) return; build();
      const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
      const atl = await Promise.all(Array.from({ length: Math.ceil(N.ctx.length / 256) }, (_, s) => new Promise<THREE.Texture>((res) => loader.load(`${BASE}/ctx/atlas${s}.jpg`, res, undefined, () => res(new THREE.Texture())))));
      atl.forEach((a) => { a.colorSpace = THREE.SRGBColorSpace; a.anisotropy = 4; });
      tiles.forEach((t) => { const i = N.moments[t.i].ctx[0], s = Math.floor(i / 256), kk = i % 256; t.still = atl[s]; t.rect = new THREE.Vector4((kk % 16) / 16, 1 - (Math.floor(kk / 16) + 1) / 16, 1 / 16, 1 / 16);
        t.mat.uniforms.uMap.value = t.still; t.mat.uniforms.uRect.value = t.rect; t.mat.uniforms.uHas.value = 1; });
      setNet(N); setMode("home");
    })();
    // 毎フレーム
    let last = 0, pickT = 0, centerI: number | null = null; const V = new THREE.Vector3();
    function frame(tm: number) {
      if (!alive) return; requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (tm - (last || tm)) / 1000)); last = tm; now += dt;
      if (!ptrs.size) G.yaw += dt * auto * (reduce ? 0.3 : 1);
      const kk = 1 - Math.exp(-dt / tau); C.t.lerp(G.t, kk); C.d += (G.d - C.d) * kk; C.yaw += (G.yaw - C.yaw) * kk; C.pitch += (G.pitch - C.pitch) * kk;
      cam.position.copy(camPos()); cam.lookAt(C.t);
      if (!N) { renderer.render(scene, cam); return; }
      const ko = 1 - Math.exp(-dt / 0.5);
      // 板: 中央に近いものほどはっきり（見る場所がひとつに決まる）
      let best = -1, bs = 1e9;
      for (const t of tiles) { V.copy(t.p).project(cam); const c2 = V.x * V.x + V.y * V.y, front = V.z < 1;
        const focus = front ? Math.max(0, 1 - Math.sqrt(c2) / 0.9) : 0; t.lit += ((k === "home" ? focus : 0) - t.lit) * ko;
        t.op += (look.tile * (front ? 1 : 0) - t.op) * ko; const dist = cam.position.distanceTo(t.p), fog = Math.max(0.1, Math.min(1, 1 - (dist - 160) / 520));
        t.mat.uniforms.uOp.value = t.op * fog; t.mat.uniforms.uLit.value = t.lit; t.mesh.quaternion.copy(cam.quaternion); t.mesh.visible = t.op > 0.01; t.mesh.renderOrder = Math.round(-dist);
        t.mesh.scale.setScalar(14 * (1 + 0.3 * t.lit));
        if (front && dist < 360 && c2 < bs) { bs = c2; best = t.i; } }
      centerI = k === "home" && bs < 0.12 ? best : null;
      pickT -= dt; if (k === "home" && pickT <= 0) { pickT = 0.5;
        const near = tiles.map((t) => { V.copy(t.p).project(cam); return { t, c: V.x * V.x + V.y * V.y, z: V.z }; }).filter((o) => o.z < 1).sort((a, b) => a.c - b.c).slice(0, slots.length).map((o) => o.t); playTiles(near); }
      if (k !== "home" && pickT <= 0) { pickT = 1; playTiles([]); }
      // 名前（中央の1本だけ）
      const lb = labelRef.current; if (lb) { if (centerI !== null) { const t = tiles[centerI]; V.copy(t.p).project(cam); const x = ((V.x + 1) / 2) * innerWidth, y = ((1 - V.y) / 2) * innerHeight;
          const half = (14 * 1.3 * 0.5) / (Math.tan((cam.fov * Math.PI) / 360) * cam.position.distanceTo(t.p)) * innerHeight * 0.5; lb.style.transform = `translate(${x}px,${y + half + 10}px) translate(-50%,0)`; lb.style.opacity = "1";
          const m = N.moments[centerI]; if (lb.dataset.i !== String(centerI)) { lb.dataset.i = String(centerI); lb.innerHTML = `<b>${m.title}</b><span>${m.sport}</span>`; } } else lb.style.opacity = "0"; }
      // 星
      if (starMat) { starMat.uniforms.uBase.value += (look.star - starMat.uniforms.uBase.value) * ko;
        const a = aB.array as Float32Array; for (let i = 0; i < a.length; i++) { const lt = Math.max(0, Math.min(1, (now - arr[i]) / 0.5)); a[i] = gathered.size ? (gathered.has(i) ? 1 : lt * 0.25) : lt * 0.8; } aB.needsUpdate = true; }
      if (fiberMat) { fiberMat.uniforms.uTime.value = gathered.size ? -1e6 + 0 * now : now; fiberMat.uniforms.uBase.value += (look.fiber - fiberMat.uniforms.uBase.value) * ko; }
      renderer.render(scene, cam);
    }
    requestAnimationFrame(frame);
    eng.current = {
      mode: setMode, explore, gather, center: () => centerI,
      project: (kind, id) => { const p = kind === "m" ? tiles[id].p : starP(id); V.copy(p).project(cam); const dist = cam.position.distanceTo(p), hh = Math.tan((cam.fov * Math.PI) / 360) * dist;
        return { x: ((V.x + 1) / 2) * innerWidth, y: ((1 - V.y) / 2) * innerHeight, w: kind === "m" ? (14 * 1.7778 / (2 * hh * cam.aspect)) * innerWidth * (1 + 0.3 * (tiles[id]?.lit || 0)) : 24, vis: V.z < 1 }; },
    };
    (window as unknown as { __hv: unknown }).__hv = { ready: () => !!N && tiles.length > 0, mode: () => modeRef.current, center: () => centerI, tileAt: (i: number) => eng.current!.project("m", i) };
    return () => { alive = false; removeEventListener("resize", resize); renderer.dispose(); el.innerHTML = ""; slots.forEach((s) => { s.v.pause(); s.v.src = ""; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- 流れ（DOM の映像と文字） ----------------
  const pickRef = useRef<((i: number) => void) | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  const clearLater = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const go = useCallback((m: Mode) => { setMode(m); modeRef.current = m; eng.current?.mode(m.k === "explore" ? "explore" : m.k === "home" ? "home" : "watch"); }, []);

  // 2 1本を押す: 板の位置から画面いっぱいへ広がり、音つきで流れる
  const [from, setFrom] = useState<{ x: number; y: number; w: number } | null>(null);
  const watchV = useRef<HTMLVideoElement>(null), watchAt = useRef(0);
  const pick = useCallback((i: number) => {
    if (!net) return; clearLater(); watchAt.current = performance.now(); const r = eng.current!.project("m", i); setFrom({ x: r.x, y: r.y, w: r.w });
    sfx.whoosh?.(1); getCrowd().swell(0.4); go({ k: "watch", m: i, phase: "play" });
    later(reduce() ? 4200 : 5600, () => split());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net, go]);
  pickRef.current = pick;
  const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 分解: 画面が破片に割れ、その瞬間の文脈がカードになって並ぶ
  const [shards, setShards] = useState<{ img: string; n: number } | null>(null);
  const split = useCallback(() => {
    const m = modeRef.current; if (m.k !== "watch" || m.phase !== "play") return; clearLater();
    let img = "";
    try { const v = watchV.current!; const cv = document.createElement("canvas"); cv.width = 960; cv.height = 540; cv.getContext("2d")!.drawImage(v, 0, 0, 960, 540); img = cv.toDataURL("image/jpeg", 0.8); } catch { img = ""; }
    setShards({ img, n: net ? net.moments[m.m].ctx.length : 6 }); sfx.boom?.(); getCrowd().swell(0.7);
    go({ ...m, phase: "split" }); later(650, () => go({ ...m, phase: "cards" })); later(1800, () => setShards(null));
  }, [net, go]);

  // 3 文脈を押す: 探索 → 集まる
  const explore = useCallback(async (seed?: number, word?: string) => {
    if (!net) return; clearLater(); setNote("");
    go({ k: "explore", seed, q: word, phase: "scan" }); sfx.suction?.(); getCrowd().swell(0.4);
    const t0 = performance.now(); const lit = eng.current!.explore(seed);
    setScan({ lit, scanned: 0, resonated: 0 });
    let d: Digest | null = null;
    try { const r = await fetch("/api/ctx/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(seed !== undefined ? { seed } : { q: word }) }); d = await r.json(); } catch { d = null; }
    sfx.stopSuction?.();
    if (modeRef.current.k !== "explore") return;
    if (!d || !d.items?.length) { setNote((d as { unreadable?: boolean } | null)?.unreadable ? "その言葉では探せませんでした。スポーツの熱の言葉で投げてください" : "探索に失敗しました。もう一度"); go({ k: "home" }); return; }
    const dd: Digest = { ...d, seed, q: word }; setScan({ lit, scanned: dd.scanned, resonated: dd.resonated });
    later(Math.max(0, 3400 - (performance.now() - t0)), () => {
      eng.current!.gather(dd.items.map((x) => x.id));
      const pos = dd.items.map((x) => eng.current!.project("c", x.id)); setReelFrom(pos.map((p) => ({ x: p.x, y: p.y })));
      go({ k: "explore", seed, q: word, d: dd, phase: "gather" }); sfx.swish?.(); getCrowd().swell(0.8);
      later(3600, () => go({ k: "digest", d: dd, i: 0 }));
    });
  }, [net, go]);
  const [scan, setScan] = useState<{ lit: number; scanned: number; resonated: number }>({ lit: 0, scanned: 0, resonated: 0 });
  const [reelFrom, setReelFrom] = useState<{ x: number; y: number }[]>([]);

  // 4 ダイジェスト
  const dgV = useRef<HTMLVideoElement>(null);
  const next = useCallback(() => { const m = modeRef.current; if (m.k !== "digest") return; if (m.i + 1 >= m.d.items.length) go({ k: "end", d: m.d }); else go({ ...m, i: m.i + 1 }); }, [go]);
  const prev = useCallback(() => { const m = modeRef.current; if (m.k !== "digest") return; go({ ...m, i: Math.max(0, m.i - 1) }); }, [go]);

  // 入口: 投票サイトから来たらその1本／シェアされたダイジェスト
  useEffect(() => {
    if (!net) return;
    if (shared) { (async () => { try { const r = await fetch("/api/ctx/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: shared.i, ...(shared.s !== undefined && shared.s >= 0 ? { seed: shared.s } : { q: shared.q }) }) });
      const d = (await r.json()) as Digest; if (d.items?.length) later(1200, () => go({ k: "digest", d: { ...d, name: shared.n || d.name, seed: shared.s, q: shared.q }, i: 0 })); } catch { /* 空間はそのまま */ } })(); return; }
    if (startNo) { const i = net.moments.findIndex((m) => m.no === startNo); if (i >= 0) later(1500, () => pick(i)); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);
  useEffect(() => () => clearLater(), []);

  const submit = (e?: React.FormEvent) => { e?.preventDefault(); const w = (q.trim() || EX[ph]).slice(0, 40); setQ(""); getCrowd().start(); sfx.start(); explore(undefined, w); };
  const d = mode.k === "digest" || mode.k === "end" ? mode.d : mode.k === "explore" ? mode.d : undefined;
  const shareUrl = d && typeof window !== "undefined" ? `${location.origin}/d/${enc({ n: d.name, s: d.seed ?? -1, q: d.q, i: d.items.map((x) => x.id) })}` : "";
  const shareText = d ? `熱狂ダイジェスト「${d.name}」— ${d.items.length}本の瞬間が「${d.seedTitle}」で繋がった #DAZNAWARDS2026` : "";
  const share = async () => { if (!d) return; try { if (navigator.share) { await navigator.share({ title: d.name, text: shareText, url: shareUrl }); return; } } catch { /* */ }
    try { await navigator.clipboard.writeText(`${shareText} ${shareUrl}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* */ } };
  const M = net && mode.k === "watch" ? net.moments[mode.m] : null;
  const md = M ? media[M.no] : null;
  const it = net && mode.k === "digest" ? mode.d.items[mode.i] : null, itc = it && net ? net.ctx[it.id] : null, itm = itc && net ? net.moments.find((x) => x.no === itc.no) : null;

  return (
    <div className={`hv m-${mode.k}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={host} className="hv-gl" />
      <div ref={labelRef} className="hv-label" />
      <header className="hv-head">
        <a href="/moments" className="hv-logo">DAZN <em>100</em> MOMENTS</a>
        {mode.k !== "home" && <button className="hv-x" onClick={() => { clearLater(); go({ k: "home" }); }} aria-label="空間へ戻る">×</button>}
      </header>

      {mode.k === "home" && net && (
        <>
          <div className="hv-home"><b>100の瞬間</b>に、<b>{net.ctx.length}</b>の熱狂が眠っている。<span>指で空間を流し、気になる1本に触れる</span></div>
          <form className="hv-in" onSubmit={submit}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`熱の言葉からも探せる　例「${EX[ph]}」`} maxLength={40} enterKeyHint="send" />
            <button type="submit">探す</button>
          </form>
        </>
      )}

      {M && (
        <div className={`hv-watch ph-${mode.k === "watch" ? mode.phase : ""}`} onClick={() => mode.k === "watch" && mode.phase === "play" && performance.now() - watchAt.current > 900 && split()}>
          <div className="hv-frame" style={from ? ({ "--fx": `${from.x}px`, "--fy": `${from.y}px`, "--fw": `${from.w}px` } as React.CSSProperties) : undefined}>
            <img className="hv-bg" src={`${BASE}/ctx/c/${M.ctx[0]}.jpg`} alt="" />
            <video ref={watchV} key={M.no} src={safari ? md?.loop : md?.webm} crossOrigin="anonymous" autoPlay loop playsInline onLoadedData={(e) => { const v = e.currentTarget; v.muted = false; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }} />
          </div>
          {mode.k === "watch" && mode.phase === "play" && <div className="hv-cap"><small>{M.sport}</small><h1>{M.title}</h1></div>}
          {mode.k === "watch" && mode.phase === "play" && <div className="hv-tip">タップで、この瞬間を熱にほどく</div>}
        </div>
      )}
      {shards && (
        <div className="hv-shards">{Array.from({ length: Math.max(6, shards.n * 2) }).map((_, j, a) => { const n = a.length, a0 = (j / n) * 360 - 90 + hashN(j) * 8, a1 = ((j + 1) / n) * 360 - 90 + hashN(j + 1) * 8;
          const pt = (deg: number) => `${50 + Math.cos((deg * Math.PI) / 180) * 150}% ${50 + Math.sin((deg * Math.PI) / 180) * 150}%`, mid = ((a0 + a1) / 2) * Math.PI / 180;
          return <i key={j} style={{ backgroundImage: shards.img ? `url(${shards.img})` : undefined, clipPath: `polygon(50% 50%, ${pt(a0)}, ${pt(a1)})`, "--dx": `${Math.cos(mid) * 60}vw`, "--dy": `${Math.sin(mid) * 60}vh`, "--rot": `${(hashN(j * 3) - 0.5) * 40}deg`, animationDelay: `${j * 12}ms` } as React.CSSProperties} />; })}</div>
      )}
      {M && net && mode.k === "watch" && mode.phase !== "play" && (
        <div className="hv-cards">
          <div className="hv-cards-h"><small>{M.sport}　{M.title}</small><b>この瞬間は、{M.ctx.length}つの熱でできている</b></div>
          <div className="hv-cards-row">
            {M.ctx.map((id, j) => { const c = net.ctx[id]; return (
              <button key={id} className="hv-card" style={{ animationDelay: `${120 + j * 90}ms` }} onClick={() => explore(id)}>
                <video src={`${BASE}/ctx/c/${id}.${ext}`} crossOrigin="anonymous" autoPlay muted loop playsInline poster={`${BASE}/ctx/c/${id}.jpg`} />
                <b>{c.title}</b><span>{c.line}</span>
              </button>); })}
          </div>
          <div className="hv-tip2">熱を選ぶと、100本の中から同じ熱を持つ瞬間を探す</div>
        </div>
      )}

      {mode.k === "explore" && net && (
        <div className={`hv-ex ph-${mode.phase}`}>
          <div className="hv-ex-h">{mode.seed !== undefined ? <><small>この熱で探す</small><b>{net.ctx[mode.seed].title}</b></> : <><small>この言葉で探す</small><b>「{mode.q}」</b></>}</div>
          {mode.phase === "scan" && <Counter c={scan} />}
          {mode.phase === "gather" && mode.d && (
            <>
              <div className="hv-dname" key={mode.d.name}><small>{mode.d.items.length}本の瞬間が響き合った</small><b>{mode.d.name}</b></div>
              <div className="hv-reel">{mode.d.items.map((x, j) => { const f = reelFrom[j]; return (
                <div key={x.id} className="hv-reel-i" style={{ "--sx": f ? `${f.x}px` : "50vw", "--sy": f ? `${f.y}px` : "50vh", animationDelay: `${j * 110}ms` } as React.CSSProperties}>
                  <img src={`${BASE}/ctx/c/${x.id}.jpg`} alt="" /><span>{net.ctx[x.id].title}</span></div>); })}</div>
            </>
          )}
        </div>
      )}

      {mode.k === "digest" && it && itc && net && (
        <div className="hv-dg">
          <div className="hv-dg-v" key={`${mode.i}-${it.id}`}>
            <img className="hv-bg" src={`${BASE}/ctx/c/${it.id}.jpg`} alt="" />
            <video ref={dgV} src={`${BASE}/ctx/c/${it.id}.${ext}`} crossOrigin="anonymous" autoPlay playsInline onEnded={next}
              onLoadedData={(e) => { const v = e.currentTarget; v.muted = false; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }} />
          </div>
          <div className="hv-dg-top"><b>{mode.d.name}</b><span>{mode.i + 1} / {mode.d.items.length}</span></div>
          <div className="hv-dg-cap" key={`c${mode.i}`}><small>{itm?.sport}　{itm?.title}</small><h2>{itc.title}</h2><p>{it.line}</p></div>
          <button className="hv-dg-l" onClick={prev} aria-label="前へ" /><button className="hv-dg-r" onClick={next} aria-label="次へ" />
          <div className="hv-dg-bar">
            <div className="hv-dg-strip">{mode.d.items.map((x, j) => <button key={x.id} className={j === mode.i ? "on" : j < mode.i ? "done" : ""} onClick={() => go({ ...mode, i: j })}><img src={`${BASE}/ctx/c/${x.id}.jpg`} alt="" /></button>)}</div>
            <div className="hv-dg-act"><button onClick={() => explore(it.id)}>この熱から分岐</button><button className="sh" onClick={share}>シェア</button></div>
          </div>
        </div>
      )}

      {mode.k === "end" && net && (
        <div className="hv-end">
          <div className="hv-end-strip">{mode.d.items.map((x) => <img key={x.id} src={`${BASE}/ctx/c/${x.id}.jpg`} alt="" />)}</div>
          <small>あなたの熱狂ダイジェスト</small>
          <b>{mode.d.name}</b>
          <p>「{mode.d.seedTitle}」から、{mode.d.items.length}本の瞬間が響き合った</p>
          <div className="b">
            <a className="x" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">X でシェア</a>
            <a href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">LINE</a>
            <button onClick={share}>{copied ? "コピーしました" : "リンクをコピー"}</button>
          </div>
          <div className="b2"><button onClick={() => go({ ...mode, k: "digest", i: 0 })}>もう一度観る</button><button onClick={() => go({ k: "home" })}>別の瞬間から</button></div>
        </div>
      )}
      {!net && <div className="hv-load">100の瞬間を読み込んでいます</div>}
      {note && <div className="hv-note" onClick={() => setNote("")}>{note}</div>}
    </div>
  );
}

function Counter({ c }: { c: { lit: number; scanned: number; resonated: number } }) {
  const [v, setV] = useState({ lit: 0, scanned: 0, resonated: 0 });
  useEffect(() => { let raf = 0; const t0 = performance.now(), f0 = { ...v };
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 1800), e = 1 - Math.pow(1 - k, 3);
      setV({ lit: Math.round(f0.lit + (c.lit - f0.lit) * e), scanned: Math.round(f0.scanned + (c.scanned - f0.scanned) * e), resonated: Math.round(f0.resonated + (c.resonated - f0.resonated) * e) }); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.lit, c.scanned, c.resonated]);
  return <div className="hv-count"><div><b>{v.scanned.toLocaleString()}</b><span>の熱と照らし合わせ</span></div><div><b>{v.lit.toLocaleString()}</b><span>本の神経を信号が通り</span></div><div><b>{v.resonated.toLocaleString()}</b><span>の熱が響き合った</span></div></div>;
}

const CSS = `
.hv{position:fixed;inset:0;background:#000;color:#fff;overflow:hidden;font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none}
.hv-gl{position:absolute;inset:0;cursor:grab}
.hv-head{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 0;z-index:30;pointer-events:none}.hv-head>*{pointer-events:auto}
.hv-logo{color:#fff;text-decoration:none;font-weight:900;font-size:13px;letter-spacing:.08em;text-shadow:0 0 8px #000}.hv-logo em{font-style:normal;color:#ffff00}
.hv-x{width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.35);color:#fff;font-size:20px;cursor:pointer;backdrop-filter:blur(6px)}
.hv-label{position:absolute;left:0;top:0;pointer-events:none;text-align:center;transition:opacity .4s;z-index:5;white-space:nowrap}
.hv-label b{display:block;font-size:clamp(16px,2vw,22px);font-weight:900;letter-spacing:.02em;text-shadow:0 2px 16px #000,0 0 4px #000}.hv-label span{display:block;font-size:11px;color:rgba(255,255,255,.65);margin-top:3px;text-shadow:0 0 6px #000}
.hv-home{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 62px);text-align:center;font-size:clamp(15px,1.8vw,19px);color:rgba(255,255,255,.85);pointer-events:none;animation:hvIn 1.4s ease both;padding:0 16px}
.hv-home b{font-weight:900;color:#fff;font-size:1.25em}.hv-home span{display:block;font-size:12px;color:rgba(255,255,255,.55);margin-top:8px}
.hv-in{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 18px);width:min(520px,calc(100% - 32px));display:flex;gap:8px;z-index:10}
.hv-in input{flex:1;min-width:0;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.3);color:#fff;font-size:16px;padding:12px 14px;outline:none;border-radius:999px;backdrop-filter:blur(6px)}
.hv-in input:focus{border-color:#ffff00}.hv-in button{background:#ffff00;color:#000;border:0;font-weight:800;font-size:14px;padding:0 20px;border-radius:999px;cursor:pointer}
/* 観る: 板の位置から画面いっぱいへ */
.hv-watch{position:absolute;inset:0;z-index:12;cursor:pointer}
.hv-frame{position:absolute;inset:0;background:#000;animation:hvGrow .75s cubic-bezier(.2,.8,.2,1) both;overflow:hidden}
.hv-frame video{width:100%;height:100%;object-fit:cover}
@keyframes hvGrow{from{clip-path:inset(calc(var(--fy,50vh) - var(--fw,200px) * .28) calc(100vw - var(--fx,50vw) - var(--fw,200px) / 2) calc(100vh - var(--fy,50vh) - var(--fw,200px) * .28) calc(var(--fx,50vw) - var(--fw,200px) / 2) round 14px);filter:brightness(.7)}to{clip-path:inset(0 0 0 0 round 0);filter:none}}
.hv-watch::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45),transparent 22%,transparent 58%,rgba(0,0,0,.85));pointer-events:none}
.hv-cap{position:absolute;left:clamp(16px,5vw,64px);right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + clamp(56px,10vh,96px));z-index:2;animation:hvUp .9s .4s ease both}
.hv-cap small{font-size:12px;color:rgba(255,255,255,.75);letter-spacing:.08em}.hv-cap h1{font-size:clamp(30px,5.4vw,72px);font-weight:900;line-height:1.08;margin:6px 0 0;letter-spacing:.01em;text-shadow:0 4px 30px rgba(0,0,0,.6)}
.hv-tip{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 22px);text-align:center;font-size:12px;color:rgba(255,255,255,.75);z-index:2;animation:hvBlink 2.4s 2s ease-in-out infinite both}
.hv-watch.ph-split .hv-frame,.hv-watch.ph-cards .hv-frame{opacity:0;transition:opacity .15s}.hv-watch.ph-split .hv-cap,.hv-watch.ph-cards .hv-cap,.hv-watch.ph-split .hv-tip{opacity:0;transition:opacity .2s}
.hv-watch.ph-cards{pointer-events:none}
/* 割れる */
.hv-shards{position:absolute;inset:0;z-index:13;pointer-events:none}
.hv-shards i{position:absolute;inset:0;background-size:cover;background-position:center;animation:hvShard 1.1s cubic-bezier(.3,.6,.2,1) both}
@keyframes hvShard{0%{transform:none;opacity:1;filter:none}12%{transform:translate(calc(var(--dx) * .04),calc(var(--dy) * .04)) rotate(calc(var(--rot) * .1));opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(var(--rot)) scale(.6);opacity:0;filter:blur(3px)}}
/* 熱のカード */
.hv-cards{position:absolute;inset:0;z-index:14;display:flex;flex-direction:column;justify-content:center;padding:calc(env(safe-area-inset-top,0px) + 60px) 0 calc(env(safe-area-inset-bottom,0px) + 40px);background:radial-gradient(ellipse at center,rgba(0,0,0,.35),rgba(0,0,0,.8))}
.hv-cards-h{text-align:center;padding:0 16px;animation:hvIn .6s .1s ease both}.hv-cards-h small{display:block;font-size:12px;color:rgba(255,255,255,.6)}.hv-cards-h b{display:block;font-size:clamp(20px,2.8vw,32px);font-weight:900;margin-top:6px}
.hv-cards-row{display:flex;gap:16px;overflow-x:auto;padding:22px max(16px,calc(50vw - 560px)) 8px;scroll-snap-type:x mandatory;scrollbar-width:none;touch-action:pan-x}
.hv-card{flex:0 0 clamp(240px,26vw,340px);scroll-snap-align:center;background:none;border:0;color:#fff;text-align:left;padding:0;cursor:pointer;animation:hvCard .7s cubic-bezier(.2,.9,.25,1.2) both}
.hv-card video{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;display:block;box-shadow:0 10px 40px rgba(0,0,0,.6);transition:transform .25s}
.hv-card:hover video{transform:scale(1.03)}
.hv-card b{display:block;font-size:clamp(17px,1.7vw,21px);font-weight:900;margin-top:12px;line-height:1.3}.hv-card span{display:block;font-size:12px;color:rgba(255,255,255,.72);margin-top:6px;line-height:1.6}
@keyframes hvCard{from{opacity:0;transform:translateY(40px) scale(.85) rotate(-3deg)}to{opacity:1;transform:none}}
.hv-tip2{text-align:center;font-size:12px;color:rgba(255,255,255,.6);margin-top:10px;animation:hvIn .6s 1s ease both}
@media (max-width:600px){.hv-cards{justify-content:flex-start;padding-top:calc(env(safe-area-inset-top,0px) + 64px)}.hv-cards-row{flex-direction:column;overflow-x:hidden;overflow-y:auto;scroll-snap-type:y proximity;touch-action:pan-y;padding:16px 16px 40px;gap:20px}.hv-card{flex:0 0 auto;width:100%}}
/* 探索 */
.hv-ex{position:absolute;inset:0;z-index:15;pointer-events:none}
.hv-ex-h{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 62px);text-align:center;animation:hvIn .6s ease both;padding:0 16px}.hv-ex-h small{display:block;font-size:12px;color:rgba(255,255,255,.6)}.hv-ex-h b{display:block;font-size:clamp(20px,2.6vw,30px);font-weight:900;margin-top:4px;text-shadow:0 0 16px #000}
.hv-count{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 40px);display:flex;gap:clamp(14px,4vw,40px);white-space:nowrap}
.hv-count div{display:flex;flex-direction:column;align-items:center}.hv-count b{font-size:clamp(26px,4vw,48px);font-weight:900;font-variant-numeric:tabular-nums;line-height:1}.hv-count span{font-size:11px;color:rgba(255,255,255,.65);margin-top:6px}
.hv-dname{position:absolute;left:0;right:0;top:40%;text-align:center;animation:hvName 1s ease both}.hv-dname small{display:block;font-size:12px;color:rgba(255,255,255,.7)}.hv-dname b{display:block;font-size:clamp(34px,6vw,76px);font-weight:900;margin-top:6px;text-shadow:0 4px 30px #000}
@keyframes hvName{from{opacity:0;letter-spacing:.4em}to{opacity:1;letter-spacing:.02em}}
.hv-reel{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 40px);display:flex;gap:8px}
.hv-reel-i{width:clamp(70px,10vw,130px);animation:hvReel .9s cubic-bezier(.2,.8,.2,1) both}.hv-reel-i img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;display:block}.hv-reel-i span{display:block;font-size:10px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,.8)}
@keyframes hvReel{from{opacity:0;transform:translate(calc(var(--sx) - 50vw),calc(var(--sy) - 100vh + 60px)) scale(.2)}to{opacity:1;transform:none}}
@media (max-width:600px){.hv-reel{flex-wrap:wrap;justify-content:center;width:calc(100% - 24px)}.hv-reel-i{width:22%}.hv-count span{font-size:9px}}
/* ダイジェスト */
.hv-dg{position:absolute;inset:0;z-index:16;background:#000}
.hv-dg-v{position:absolute;inset:0;animation:hvCut .55s cubic-bezier(.2,.8,.2,1) both}.hv-dg-v video{width:100%;height:100%;object-fit:cover}
@keyframes hvCut{from{opacity:0;transform:scale(1.12);filter:blur(6px) brightness(1.6)}to{opacity:1;transform:none;filter:none}}
.hv-dg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55),transparent 22%,transparent 50%,rgba(0,0,0,.9));pointer-events:none}
.hv-dg-top{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 58px);text-align:center;z-index:2}.hv-dg-top b{display:block;font-size:clamp(16px,2vw,22px);font-weight:900;color:#ffee55}.hv-dg-top span{font-size:11px;color:rgba(255,255,255,.65)}
.hv-dg-cap{position:absolute;left:clamp(16px,5vw,64px);right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 150px);z-index:2;animation:hvUp .7s .15s ease both}
.hv-dg-cap small{font-size:12px;color:rgba(255,255,255,.7)}.hv-dg-cap h2{font-size:clamp(28px,5vw,64px);font-weight:900;margin:6px 0 0;line-height:1.1}.hv-dg-cap p{font-size:clamp(14px,1.6vw,18px);margin:10px 0 0;max-width:720px;line-height:1.6;color:rgba(255,255,255,.9)}
.hv-dg-l,.hv-dg-r{position:absolute;top:15%;bottom:30%;width:30%;background:none;border:0;z-index:1;cursor:pointer}.hv-dg-l{left:0}.hv-dg-r{right:0}
.hv-dg-bar{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:3;display:flex;flex-direction:column;align-items:center;gap:12px;padding:0 12px}
.hv-dg-strip{display:flex;gap:6px;max-width:100%;overflow-x:auto;scrollbar-width:none}.hv-dg-strip button{flex:0 0 auto;width:64px;padding:0;border:2px solid transparent;border-radius:6px;overflow:hidden;background:none;opacity:.5;cursor:pointer}.hv-dg-strip img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
.hv-dg-strip .on{opacity:1;border-color:#ffee55}.hv-dg-strip .done{opacity:.8}
.hv-dg-act{display:flex;gap:8px}.hv-dg-act button{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.4);color:#fff;font-size:13px;font-weight:700;padding:9px 16px;border-radius:999px;cursor:pointer;backdrop-filter:blur(6px)}.hv-dg-act .sh{background:#ffff00;color:#000;border-color:#ffff00}
/* 最後 */
.hv-end{position:absolute;inset:0;z-index:17;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 20px;background:radial-gradient(ellipse at center,rgba(0,0,0,.4),rgba(0,0,0,.9));animation:hvIn .8s ease both}
.hv-end-strip{display:flex;gap:6px;margin-bottom:22px;flex-wrap:wrap;justify-content:center}.hv-end-strip img{width:clamp(70px,9vw,110px);aspect-ratio:16/9;object-fit:cover;border-radius:6px}
.hv-end small{font-size:12px;color:rgba(255,255,255,.7);letter-spacing:.1em}.hv-end>b{font-size:clamp(34px,6vw,70px);font-weight:900;margin:8px 0}.hv-end p{font-size:14px;color:rgba(255,255,255,.8);margin:0}
.hv-end .b{display:flex;gap:8px;margin-top:22px;flex-wrap:wrap;justify-content:center}.hv-end .b>*{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.4);color:#fff;font-size:14px;font-weight:700;padding:11px 18px;border-radius:999px;cursor:pointer;text-decoration:none}.hv-end .b .x{background:#ffff00;color:#000;border-color:#ffff00}
.hv-end .b2{display:flex;gap:18px;margin-top:16px}.hv-end .b2 button{background:none;border:0;color:rgba(255,255,255,.75);font-size:13px;text-decoration:underline;cursor:pointer}
.hv-load{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;color:rgba(255,255,255,.6);pointer-events:none}
.hv-note{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 80px);text-align:center;font-size:12px;color:#fff;z-index:20;padding:0 16px;text-shadow:0 0 6px #000}
.hv-bg{display:none}
@media (orientation:portrait){.hv-bg{display:block;position:absolute;inset:-40px;width:calc(100% + 80px);height:calc(100% + 80px);object-fit:cover;filter:blur(28px) brightness(.45);transform:scale(1.1)}
.hv-frame video,.hv-dg-v video{position:relative;object-fit:contain}}
@keyframes hvIn{from{opacity:0}to{opacity:1}}@keyframes hvUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}@keyframes hvBlink{0%,100%{opacity:.4}50%{opacity:1}}
`;

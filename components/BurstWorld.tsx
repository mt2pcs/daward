"use client";
// 熱狂の炸裂 × かけら（体験の本体・2026-10-18）。
// 炸裂の空間（情報サイト KV の SpaceStream と同じ文法: ロゴ色の直線の破片が奥の一点から生まれ、放射しながら手前へ抜ける）の内側を前進し続ける。
//   100の瞬間 = 奥から流れてくる映像の破片。押すとカメラの前に来て、その瞬間が「人×その1秒」のかけらに割れて噴き出す。
//   かけらを押す = そのかけらが新しい消失点（画面の中心）になり、同じものを持つかけらが光線に乗って噴き出す。他は奥へ遠のく。
//   位置の意味: 中心 = 押したもの／投げた言葉、中心からの近さ = 繋がりの強さ、光線の色 = 繋がりの種類、外側 = その先の繋がり、奥 = 残り全部。
//   言葉を投げると、言葉が奥の一点に立ち、その言葉に答えるかけらが噴き出す（/api/lab/net/word）。
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getCrowd } from "@/lib/crowd";
import { sfx } from "@/lib/sfx";

const BASE = "https://storage.googleapis.com/e-mooments-assets";
// ロゴの画素から採った色（SpaceStream と同じ。黒地で濁る暗い2色は除く）
const COLORS = ["#ff3366", "#ff8866", "#922a88", "#ff1a26", "#ff0020", "#ccdd66", "#4de6ff", "#dd8820", "#66ccff", "#dff257", "#ff3355", "#ffee55"];
// 繋がりの種類の色: 体の動き / 表情 / 声 / 関係 / 場所 / 境遇 / 懸かっていたもの
const KIND_COLOR = ["#ff8866", "#ffee55", "#ff3366", "#4de6ff", "#ccdd66", "#dd8820", "#ffffff"];
const ZF = 140; // 消失点の奥行き
const EX = ["最後の一球", "負けた側の顔", "親父", "ベンチの熱", "悔し涙", "老いてなお"];

type Person = { i: number; no: string; name: string; state: string; event: string; t: number; el: [string, number][] };
type Moment = { no: string; title: string; sport: string; people: number[] };
type World = { kinds: string[]; moments: Moment[]; people: Person[]; links: [number, number, number, number, number, number, string][]; names?: Record<string, string> };
export type MediaMap = Record<string, { webm?: string; loop?: string }>;
type Mode =
  | { kind: "stream" }
  | { kind: "open"; m: number }
  | { kind: "focus"; i: number; from?: number }
  | { kind: "reading"; q: string }
  | { kind: "word"; q: string; name: string; picks: { i: number; line: string }[] };
type NB = { y: number; k: number; r: number; why: string };

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// 映像の破片: 平行四辺形に切った映像（縁の斜め＝ロゴの破片の文法）。色は乗算済みで重ねる
const TILE_FRAG = `precision highp float; varying vec2 vUv;
uniform sampler2D uMap; uniform vec4 uRect; uniform float uOp; uniform float uSkew; uniform float uHas;
void main(){ float x = vUv.x + (vUv.y - 0.5) * uSkew; if (x < 0.0 || x > 1.0) discard;
  vec3 c = uHas > 0.5 ? texture2D(uMap, uRect.xy + vUv * uRect.zw).rgb : vec3(0.12);
  gl_FragColor = vec4(c * uOp, uOp); }`;
const FLAT_FRAG = `precision highp float; uniform vec3 uColor; uniform float uAlpha; void main(){ gl_FragColor = vec4(uColor * uAlpha, uAlpha); }`;
const hash = (i: number, n: number, k: number) => { const x = Math.sin(i * 127.1 + n * 311.7 + k * 74.7) * 43758.5453; return x - Math.floor(x); };
const blend = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;

export default function BurstWorld({ media, startNo }: { media: MediaMap; startNo?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const lblHost = useRef<HTMLDivElement>(null);
  const api = useRef<{ go: (m: Mode) => void; watch: (on: boolean) => void } | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "stream" });
  const [cap, setCap] = useState<{ name: string; who?: string; sub?: string; no?: string } | null>(null);
  const [why, setWhy] = useState<{ t: string; k: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; t: string; s?: string } | null>(null);
  const [watching, setWatching] = useState(false);
  const [q, setQ] = useState("");
  const [ph, setPh] = useState(0);
  const [note, setNote] = useState("");
  const [ready, setReady] = useState(false);
  const modeRef = useRef<Mode>(mode); modeRef.current = mode;

  useEffect(() => { const t = setInterval(() => setPh((p) => (p + 1) % EX.length), 3200); return () => clearInterval(t); }, []);

  useEffect(() => {
    let alive = true; const el = host.current!, lh = lblHost.current!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const portrait = () => innerHeight > innerWidth * 1.05;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, premultipliedAlpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setClearColor(0x000000, 1); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(55, 1, 0.3, 400);
    const resize = () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.fov = portrait() ? 70 : 55; cam.updateProjectionMatrix(); if (W) layout(modeRef.current, true); };
    addEventListener("resize", resize);
    // 画面上の位置（-1..1）と奥行き z から空間の位置へ。幅は画面幅に対する割合
    const halfH = (z: number) => Math.tan((cam.fov * Math.PI) / 360) * -z;
    const at = (sx: number, sy: number, z: number) => [sx * halfH(z) * cam.aspect, sy * halfH(z), z];
    const wid = (f: number, z: number) => f * 2 * halfH(z) * cam.aspect;

    // ---- 背景の破片（SpaceStream と同じ文法・常に手前へ流れる）----
    const N = portrait() ? 80 : 130;
    type Shard = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; i: number; ph: number; cyc: number };
    const shards: Shard[] = [];
    for (let i = 0; i < N; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
      const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FLAT_FRAG, side: THREE.DoubleSide, ...blend, uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } } });
      const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = -1000; scene.add(mesh); shards.push({ mesh, mat, i, ph: hash(i, 0, 9), cyc: -1 });
    }
    const shape = (s: Shard, cyc: number) => {
      const r = (k: number) => hash(s.i, cyc, k), wide = r(1) < 0.18, L = 5 + r(2) * 18, wo = (wide ? 2.2 : 0.4) + r(3) * (wide ? 3.2 : 1.4);
      const wi = r(4) < 0.55 ? wo * r(5) * 0.25 : wo, skew = (r(6) - 0.5) * wo * 1.2, p = s.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      p.setXYZ(0, 0, -wi / 2, 0); p.setXYZ(1, L, -wo / 2 + skew, 0); p.setXYZ(2, L, wo / 2 + skew, 0); p.setXYZ(3, 0, wi / 2, 0); p.needsUpdate = true;
      s.mesh.userData = { th: r(7) * Math.PI * 2, r0: 3 + r(8) * 15, tilt: (r(10) - 0.5) * 1.3, pitch: -(0.15 + r(11) * 0.55) };
      s.mat.uniforms.uColor.value.set(COLORS[Math.floor(r(12) * COLORS.length)]); s.cyc = cyc;
    };

    // ---- 光線（中心からかけらへ。ロゴの破片と同じ平らなくさび）----
    type Ray = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; a: Tile | null; b: Tile | null; o: number; go: number; w: number };
    const rays: Ray[] = [];
    const getRay = (k: number) => { while (rays.length <= k) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(new Array(12).fill(0), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
      const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FLAT_FRAG, side: THREE.DoubleSide, ...blend, uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } } });
      const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = -500; scene.add(mesh); rays.push({ mesh, mat, a: null, b: null, o: 0, go: 0, w: 1 }); } return rays[k]; };

    // ---- 映像の破片（瞬間 = m、かけら = p）----
    type Tile = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; kind: "p" | "m"; id: number; c: number[]; g: number[]; still: THREE.Texture | null; rect: THREE.Vector4; vid: Slot | null; label: string; lo: number; lgo: number; el: HTMLDivElement | null; skew: number };
    const geo = new THREE.PlaneGeometry(1, 0.5625);
    const tiles: Tile[] = [], cards: Tile[] = [];
    const mk = (kind: "p" | "m", id: number): Tile => {
      const skew = (hash(id, kind === "p" ? 1 : 2, 3) - 0.5) * 0.36;
      const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: TILE_FRAG, ...blend, side: THREE.DoubleSide,
        uniforms: { uMap: { value: null }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uOp: { value: 0 }, uSkew: { value: skew }, uHas: { value: 0 } } });
      const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; mesh.userData = { kind, id }; scene.add(mesh);
      return { mesh, mat, kind, id, c: [0, 0, -ZF, 0.01, 0], g: [0, 0, -ZF, 0.01, 0], still: null, rect: new THREE.Vector4(0, 0, 1, 1), vid: null, label: "", lo: 0, lgo: 0, el: null, skew };
    };
    const showStill = (t: Tile) => { t.mat.uniforms.uMap.value = t.still; t.mat.uniforms.uRect.value = t.rect; t.mat.uniforms.uHas.value = t.still ? 1 : 0; };

    // 同時に流せる映像の数
    type Slot = { v: HTMLVideoElement; tex: THREE.VideoTexture; owner: Tile | null };
    const MAXV = portrait() ? 8 : 12, slots: Slot[] = [];
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    for (let k = 0; k < MAXV; k++) { const v = document.createElement("video"); v.crossOrigin = "anonymous"; v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
      const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; slots.push({ v, tex, owner: null }); }
    const srcOf = (t: Tile) => t.kind === "p" ? `${BASE}/lab/net/c/${t.id}.${safari ? "mp4" : "webm"}` : (() => { const m = media[W.moments[t.id].no]; return safari ? m?.loop : m?.webm; })();
    let soundTile: Tile | null = null;
    function setPlaying(want: Tile[], fromStart = true) {
      want = want.slice(0, MAXV); const keep = new Set(want);
      for (const s of slots) if (s.owner && !keep.has(s.owner)) { s.owner.vid = null; showStill(s.owner); s.owner = null; s.v.pause(); }
      const fresh: Slot[] = [];
      for (const t of want) { if (t.vid) continue; const s = slots.find((x) => !x.owner), src = srcOf(t); if (!s || !src) continue;
        s.owner = t; t.vid = s; s.v.muted = true; s.v.src = src; s.v.load(); fresh.push(s);
        s.v.oncanplay = () => { if (t.vid === s) { t.mat.uniforms.uMap.value = s.tex; t.mat.uniforms.uRect.value = new THREE.Vector4(0, 0, 1, 1); t.mat.uniforms.uHas.value = 1; } }; }
      // 押した後に現れたものは同時に頭から流す（同じ所作が同じ時に起きる）
      setTimeout(() => { for (const s of fromStart ? slots : fresh) if (s.owner) { try { s.v.currentTime = 0; } catch { /* */ } s.v.play().catch(() => {}); } }, 500);
      applySound();
    }
    // 音は中心の1本だけ（押した後なので鳴らせる）
    const applySound = () => { for (const s of slots) { const on = !!soundTile && s.owner === soundTile; s.v.muted = !on; s.v.volume = on ? 1 : 0; if (on) s.v.play().catch(() => { s.v.muted = true; s.v.play().catch(() => {}); }); } };

    // ---- 配置 ----
    let W: World;
    const nb = new Map<number, NB[]>();
    let EMB: Float32Array | null = null;
    // 繋がりが少ないかけらは、意味の近いかけら（別の瞬間）で6つまで補う
    const nbOf = (i: number, want: number): NB[] => { const own = nb.get(i) || []; if (own.length >= want || !EMB) return own;
      const E = EMB, D = 768, have = new Set(own.map((x) => x.y)), me = W.people[i].no, sc: { y: number; s: number }[] = [];
      for (const o of W.people) { if (o.no === me || have.has(o.i)) continue; let d = 0; for (let k = 0; k < D; k++) d += E[i * D + k] * E[o.i * D + k]; sc.push({ y: o.i, s: d }); }
      return [...own, ...sc.sort((a, b) => b.s - a.s).slice(0, want - own.length).map((x) => ({ y: x.y, k: -1, r: 0, why: "" }))]; };
    const BG: number[][] = []; // 遠のいたときの場所（画面の位置と奥行き）
    let streamT = 0, slow = 1, boost = 0;
    const streamPos = (k: number, out: number[]) => {
      // 瞬間の破片: 奥の一点から生まれて放射しながら手前へ（約 36 秒で抜ける）
      const n = W.moments.length, w = (k / n + hash(k, 5, 3) * 0.6 / n + streamT / 40) % 1, z = -ZF + w * (ZF - 3);
      const u = (z + ZF) / ZF, th = hash(k, 5, 1) * Math.PI * 2, pr = portrait(), r0 = (pr ? 1.6 : 2.6) + hash(k, 5, 2) * (pr ? 3.2 : 5.5);
      out[0] = Math.cos(th) * r0 * u * (pr ? 0.75 : 1.2); out[1] = Math.sin(th) * r0 * u * (pr ? 1.3 : 0.75); out[2] = z; out[3] = pr ? 2.0 : 2.7;
      out[4] = Math.min(1, u * 3) * Math.min(1, (-z - 3) / 4);
    };
    let center: Tile | null = null, rimTiles: Tile[] = [];
    let labelled: Tile[] = [];
    let wordPos: number[] | null = null;
    function layout(m: Mode, keep = false) {
      const pr = portrait(), P = W.people;
      const prev = new Set<Tile>([...tiles, ...cards].filter((t) => t.g[4] > 0.4));
      // まず全部を奥へ（遠のく）
      tiles.forEach((t, j) => { const b = BG[j], p = at(b[0], b[1], b[2]); t.g = [p[0], p[1], b[2], wid(pr ? 0.024 : 0.014, b[2]), m.kind === "stream" ? 0 : 0.32]; t.label = ""; });
      cards.forEach((c) => { if (c.g[4] > 0 && m.kind !== "stream") c.c[4] *= 0.4; c.g[4] = 0; c.label = ""; });
      rays.forEach((r) => { r.go = 0; });
      let ri = 0; const ray = (a: Tile | null, b: Tile, col: string, o: number, w: number) => { const r = getRay(ri++); r.a = a; r.b = b; r.go = o; r.w = w; r.mat.uniforms.uColor.value.set(col); };
      const play: Tile[] = []; let c: typeof cap = null; center = null; soundTile = null; wordPos = null; labelled = [];
      const ZC = -14, ZR = -15, ZO = -19;
      // 縦画面は上下に1つずつ（横並びの名前が重ならないように）
      const ringPos = (j: number, n: number, rad: number, z: number, off = 0) => { const a = -Math.PI / 2 + (j / n) * Math.PI * 2 + (pr ? off - Math.round(off / (Math.PI / n)) * (n % 2 ? 0 : Math.PI / n) : off);
        return at(Math.cos(a) * rad * (pr ? 0.56 : 0.66), (pr ? 0.04 : 0.06) + Math.sin(a) * rad * (pr ? 0.58 : 0.56), z); };
      const put = (t: Tile, p: number[], f: number, o = 1) => { t.g = [p[0], p[1], p[2], wid(f, p[2]), o]; };
      // 新しく現れるものは中心（消失点）から噴き出す
      const burstFrom = (t: Tile, from: number[]) => { if (!prev.has(t) && !keep) { t.c = [from[0], from[1], from[2], 0.01, 0]; } };
      if (m.kind === "stream") {
        // 何もしない（毎フレーム streamPos が決める）
      } else if (m.kind === "open") {
        const M = W.moments[m.m], card = cards[m.m], cp = at(0, pr ? 0.08 : 0.06, ZC);
        put(card, cp, pr ? 0.5 : 0.34); center = card; soundTile = card; play.push(card);
        const ppl = M.people.slice(0, pr ? 8 : 12), n = ppl.length;
        ppl.forEach((pi, j) => { const t = tiles[pi]; put(t, ringPos(j, n, 1, ZR, n % 2 ? 0 : Math.PI / n), pr ? 0.3 : 0.15); burstFrom(t, cp); t.label = P[pi].state; play.push(t); labelled.push(t);
          ray(card, t, COLORS[(j * 5) % COLORS.length], 0.5, 1); });
        c = { name: M.title, sub: M.sport, no: M.no };
      } else if (m.kind === "focus") {
        const t0 = tiles[m.i], cp = at(0, pr ? 0.08 : 0.06, ZC); put(t0, cp, pr ? 0.44 : 0.3); center = t0; soundTile = t0; play.push(t0);
        const firsts = nbOf(m.i, 6).slice().sort((a, b) => b.r - a.r || a.k - b.k).slice(0, pr ? 6 : 10).sort((a, b) => (a.k < 0 ? 9 : a.k) - (b.k < 0 ? 9 : b.k));
        const used = new Set<number>([m.i]); const n = firsts.length;
        firsts.forEach((f, j) => { used.add(f.y); const t = tiles[f.y], rad = f.r >= 3 ? 0.8 : f.r === 2 ? 0.9 : f.r === 1 ? 1 : 1.08;
          put(t, ringPos(j, n, rad, ZR, n % 2 ? 0 : Math.PI / n), pr ? 0.27 : 0.14); burstFrom(t, cp); t.label = P[f.y].state; play.push(t); labelled.push(t);
          ray(t0, t, f.k < 0 ? "#8a8a8a" : KIND_COLOR[f.k] || "#fff", f.k < 0 ? 0.3 : 0.55, 1); });
        // その先（2つ目の繋がり）: 同じ光線の延長に小さく
        firsts.forEach((f, j) => { const sec = (nb.get(f.y) || []).filter((x) => !used.has(x.y)).sort((a, b) => b.r - a.r).slice(0, pr ? 1 : 2);
          sec.forEach((s, k) => { used.add(s.y); const t = tiles[s.y], off = (n % 2 ? 0 : Math.PI / n) + (k - (sec.length - 1) / 2) * (pr ? 0.22 : 0.16);
            put(t, ringPos(j, n, 1.5, ZO, off), pr ? 0.13 : 0.07, 0.8); burstFrom(t, cp); ray(tiles[f.y], t, KIND_COLOR[s.k] || "#fff", 0.3, 0.5); }); });
        const p = P[m.i], mo = W.moments.find((x) => x.no === p.no);
        c = { name: W.names?.[m.i] || p.state, who: `${p.name}｜${p.state}`, sub: `${mo?.sport || ""}　${mo?.title || ""}`, no: p.no };
      } else if (m.kind === "reading") {
        // 言葉を読んでいる間: いま見えていたかけらが奥の一点へ吸い込まれる
        for (const t of [...tiles, ...cards]) if (prev.has(t)) { const p = at((hash(t.id, 7, 1) - 0.5) * 0.1, (hash(t.id, 7, 2) - 0.5) * 0.1, -ZF + 10); t.g = [p[0], p[1], p[2], wid(0.01, p[2]), 0.6]; }
        wordPos = at(0, 0, -ZF + 10);
      } else if (m.kind === "word") {
        const cp = at(0, pr ? 0.08 : 0.06, ZC); wordPos = cp; const n = Math.min(m.picks.length, pr ? 6 : 12);
        m.picks.slice(0, n).forEach((pk, j) => { const t = tiles[pk.i]; put(t, ringPos(j, n, 1, ZR, n % 2 ? 0 : Math.PI / n), pr ? 0.27 : 0.14);
          if (!keep) t.c = [...at(0, 0, -ZF + 10).slice(0, 3), 0.01, 0]; // 言葉の立つ奥の一点から噴き出す
          t.label = pk.line || P[pk.i].state; play.push(t); labelled.push(t); ray(null, t, "#ffffff", 0.4, 1); });
        c = { name: m.name };
      }
      rimTiles = labelled;
      if (!keep) { setPlaying(play); boost = 1; }
      else applySound();
      setCap(c);
    }

    // 文字（かけらの名前）は DOM。毎フレーム位置だけ書き換える
    const V = new THREE.Vector3();
    const syncLabels = () => {
      for (const t of tiles) { t.lgo = labelled.includes(t) && t.g[4] > 0.5 ? 1 : 0; }
      for (const t of [...tiles, ...cards]) {
        t.lo += (t.lgo - t.lo) * 0.12;
        if (t.lo < 0.02) { if (t.el) { t.el.style.opacity = "0"; } continue; }
        if (!t.el) { t.el = document.createElement("div"); t.el.className = "bw-lb"; lh.appendChild(t.el); }
        if (t.el.textContent !== t.label) t.el.textContent = t.label;
        const h = t.c[3] * 0.5625 * 0.5; V.set(t.c[0], t.c[1] - h, t.c[2]).project(cam);
        t.el.style.transform = `translate(${((V.x + 1) / 2) * innerWidth}px,${((1 - V.y) / 2) * innerHeight + 6}px) translate(-50%,0)`; t.el.style.opacity = watchOn ? "0" : String(Math.min(1, t.lo * t.c[4]));
      }
    };

    // ---- 読み込み ----
    (async () => {
      W = await (await fetch("/lab/net/world.json")).json();
      for (const [a, b, k, r, , , w] of W.links) for (const [x, y] of [[a, b], [b, a]]) { if (!nb.has(x)) nb.set(x, []); nb.get(x)!.push({ y, k, r, why: w }); }
      // 繋がりの無いかけら（85）は、意味の近いかけら（埋め込み）を別の瞬間から拾う
      try {
        const buf = await (await fetch("/lab/net/emb.bin")).arrayBuffer(), E = new Float32Array(buf), D = 768;
        for (const p of W.people) { if (nb.has(p.i)) continue;
          const sc: { y: number; s: number }[] = [];
          for (const o of W.people) { if (o.no === p.no) continue; let d = 0; for (let k = 0; k < D; k++) d += E[p.i * D + k] * E[o.i * D + k]; sc.push({ y: o.i, s: d }); }
          nb.set(p.i, sc.sort((a, b) => b.s - a.s).slice(0, 8).map((x) => ({ y: x.y, k: 0, r: 1, why: "" }))); }
        EMB = E;
      } catch { /* 無くても動く */ }
      W.people.forEach((_, j) => { const a = hash(j, 3, 1) * Math.PI * 2, r = 0.15 + 1.05 * Math.sqrt(hash(j, 3, 2)); BG.push([Math.cos(a) * r, Math.sin(a) * r, -70 - hash(j, 3, 3) * 60]); });
      W.people.forEach((p) => tiles.push(mk("p", p.i)));
      W.moments.forEach((_, k) => cards.push(mk("m", k)));
      // その1秒のコマ（2枚のアトラス、16×16）
      const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
      const atl = await Promise.all([0, 1].map((s) => new Promise<THREE.Texture>((res) => loader.load(`${BASE}/lab/net/atlas${s}.jpg`, res, undefined, () => res(new THREE.Texture())))));
      atl.forEach((a) => { a.colorSpace = THREE.SRGBColorSpace; a.anisotropy = 4; });
      const setStill = (t: Tile, i: number) => { const s = Math.floor(i / 256), k = i % 256; t.still = atl[s]; t.rect = new THREE.Vector4((k % 16) / 16, 1 - (Math.floor(k / 16) + 1) / 16, 1 / 16, 1 / 16); showStill(t); };
      tiles.forEach((t) => setStill(t, t.id));
      cards.forEach((c, k) => setStill(c, W.moments[k].people[0]));
      if (!alive) return; setReady(true);
      const sm = startNo ? W.moments.findIndex((m) => m.no === startNo) : -1;
      go(sm >= 0 ? { kind: "open", m: sm } : { kind: "stream" });
    })();

    // ---- 操作 ----
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let px = 0, py = 0;
    const hit = (x: number, y: number): Tile | null => { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
      const objs = [...tiles, ...cards].filter((t) => t.mesh.visible && t.c[4] > 0.6 && t.c[3] > wid(0.04, t.c[2])).map((t) => t.mesh);
      const h = ray.intersectObjects(objs, false).sort((a, b) => b.object.position.z - a.object.position.z)[0]; if (!h) return null;
      return (h.object.userData.kind === "p" ? tiles : cards)[h.object.userData.id as number] || null; };
    const describe = (t: Tile, x: number, y: number) => {
      if (t.kind === "m") { const m = W.moments[t.id]; return { x, y, t: m.title, s: m.sport }; }
      const p = W.people[t.id], mo = W.moments.find((m) => m.no === p.no); const md = modeRef.current;
      const link = md.kind === "focus" ? (nb.get(md.i) || []).find((n) => n.y === t.id)?.why : undefined;
      return { x, y, t: `${p.name}｜${p.state}`, s: link || `${mo?.sport || ""}　${mo?.title || ""}` };
    };
    let hovered: Tile | null = null;
    const onMove = (e: PointerEvent) => { px = (e.clientX / innerWidth) * 2 - 1; py = (e.clientY / innerHeight) * 2 - 1; if (e.pointerType !== "mouse" || !W) return;
      const t = hit(e.clientX, e.clientY); if (t !== hovered) { hovered = t; if (t) sfx.blip?.(); }
      setHover(t && t !== center ? describe(t, e.clientX, e.clientY) : null); el.style.cursor = t ? "pointer" : "default"; };
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; getCrowd().start(); sfx.start(); };
    const onUp = (e: PointerEvent) => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 12 || !W) return; down = null;
      const t = hit(e.clientX, e.clientY); if (!t) return; const md = modeRef.current;
      if (t === center) { api.current?.watch(true); return; }
      if (t.kind === "m") { go({ kind: "open", m: t.id }); return; }
      if (md.kind === "stream" || md.kind === "reading") return;
      const prevI = md.kind === "focus" ? md.i : undefined;
      if (prevI !== undefined) { const l = (nb.get(prevI) || []).find((n) => n.y === t.id); setWhy(l?.why ? { t: l.why, k: Date.now() } : null); } else setWhy(null);
      go({ kind: "focus", i: t.id, from: prevI }); };
    el.addEventListener("pointermove", onMove); el.addEventListener("pointerdown", onDown); el.addEventListener("pointerup", onUp);
    function go(m: Mode) { if (!W) return; setHover(null); hovered = null; setWatching(false); watchOn = false; modeRef.current = m; setMode(m); layout(m); if (m.kind !== "stream") { sfx.whoosh?.(0.8); getCrowd().swell(0.45); } }
    let watchOn = false;
    api.current = { go, watch: (on) => { if (!center) return; watchOn = on; setWatching(on); setHover(null);
      const pr = portrait(), z = -10;
      if (on) { const p = at(0, pr ? 0.02 : 0.04, z); center.g = [p[0], p[1], z, wid(pr ? 0.96 : 0.74, z), 1]; if (center.vid) { try { center.vid.v.currentTime = 0; } catch { /* */ } } soundTile = center; applySound(); }
      else layout(modeRef.current, true); } };

    // ---- 毎フレーム ----
    let last = 0, dist = 0; const tmp = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), look = new THREE.Vector3(0, 0, -100);
    let pickT = 0;
    function frame(now: number) {
      if (!alive) return; requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (now - (last || now)) / 1000)); last = now;
      const md = modeRef.current, k = 1 - Math.exp(-dt / 0.5), ko = 1 - Math.exp(-dt / 0.35);
      // カーソルで視点がわずかに動く（奥行きの手がかり）
      if (!reduce) { cam.position.x += (px * 0.9 - cam.position.x) * (1 - Math.exp(-dt / 0.8)); cam.position.y += (-py * 0.6 - cam.position.y) * (1 - Math.exp(-dt / 0.8)); }
      cam.lookAt(look);
      // 前進: 巡航＋押した直後の加速。言葉を読んでいる間は速く。瞬間の流れはホバー中ゆっくり
      boost = Math.max(0, boost - dt * 1.4);
      const speed = (reduce ? 0.4 : 1) * (9 + 70 * boost * boost + (md.kind === "reading" ? 40 : 0));
      dist += dt * speed;
      slow += ((hovered && md.kind === "stream" ? 0.12 : 1) - slow) * (1 - Math.exp(-dt / 0.25));
      if (md.kind === "stream") streamT += dt * slow * (reduce ? 0.4 : 1);
      for (const s of shards) {
        const w = s.ph * ZF + dist, cyc = Math.floor(w / ZF); if (cyc !== s.cyc) shape(s, cyc);
        const z = -ZF + (w - cyc * ZF); if (z > -1.5) { s.mesh.visible = false; continue; } s.mesh.visible = true;
        const d = s.mesh.userData as { th: number; r0: number; tilt: number; pitch: number }, u = (z + ZF) / ZF, g = Math.min(1, u / 0.6);
        s.mesh.position.set(Math.cos(d.th) * d.r0 * u, Math.sin(d.th) * d.r0 * u, z); s.mesh.scale.setScalar(Math.max(0.001, g * (2 - g)));
        s.mesh.rotation.set(0, 0, 0); s.mesh.rotateZ(d.th); s.mesh.rotateY(d.pitch); s.mesh.rotateX(d.tilt);
        // 中身（映像）があるときは背景として控えめに
        s.mat.uniforms.uAlpha.value = Math.min(1, Math.max(0, (-z - 3) / 4)) * (md.kind === "stream" ? 0.75 : 0.42);
      }
      // 瞬間の破片の流れ
      if (W) {
        if (md.kind === "stream") { cards.forEach((c, j) => { streamPos(j, c.g); if (c.c[2] < c.g[2] - 40 || c.c[2] > c.g[2] + 40) c.c = c.g.slice(); }); }
        // 遠のいたかけらはゆっくり回る（全部がそこにある）
        const rot = dt * 0.02;
        for (const t of tiles) { if (t.g[4] > 0 && t.g[4] <= 0.35 && t.g[2] < -60) { const x = t.g[0], y = t.g[1]; t.g[0] = x * Math.cos(rot) - y * Math.sin(rot); t.g[1] = x * Math.sin(rot) + y * Math.cos(rot); } }
        // 噴き出したかけらは光線に沿ってわずかに呼吸する（止まった図にしない）
        const br = reduce ? 0 : Math.sin(now / 1400) * 0.015;
        for (const t of [...tiles, ...cards]) {
          const kk = md.kind === "stream" && t.kind === "m" ? 1 : k;
          const bx = rimTiles.includes(t) ? 1 + br : 1;
          t.c[0] += (t.g[0] * bx - t.c[0]) * kk; t.c[1] += (t.g[1] * bx - t.c[1]) * kk; t.c[2] += (t.g[2] - t.c[2]) * kk; t.c[3] += (t.g[3] - t.c[3]) * kk; t.c[4] += (t.g[4] - t.c[4]) * (md.kind === "stream" && t.kind === "m" ? 1 : ko);
          const vis = t.c[4] > 0.01 && t.c[2] < -1.2; t.mesh.visible = vis; if (!vis) continue;
          t.mesh.position.set(t.c[0], t.c[1], t.c[2]); const s = Math.max(0.001, t.c[3]); t.mesh.scale.set(s, s, 1);
          t.mesh.quaternion.copy(cam.quaternion);
          const dim = hovered && hovered !== t && md.kind !== "stream" && rimTiles.includes(t) ? 0.75 : 1;
          t.mat.uniforms.uOp.value = t.c[4] * dim * (watchOn && t !== center ? 0.2 : 1);
          t.mesh.renderOrder = Math.round(t.c[2] * 10) + (t === center ? 500 : 0) + (watchOn && t === center ? 2000 : 0);
        }
        // 流れの中で大きく見えている瞬間だけ映像を流す（0.6 秒ごとに選び直す）
        pickT -= dt;
        if (md.kind === "stream" && pickT <= 0) { pickT = 0.6;
          const near = cards.map((c, j) => ({ c, j, s: c.g[3] / -c.g[2] })).filter((x) => x.c.g[4] > 0.5).sort((a, b) => b.s - a.s).slice(0, portrait() ? 5 : 8).map((x) => x.c);
          const cur = slots.filter((s) => s.owner).map((s) => s.owner!); if (near.some((c) => !cur.includes(c)) || cur.some((c) => !near.includes(c))) setPlaying(near, false); }
      }
      // 光線: 中心（または言葉）からかけらへ。内側が細いくさび
      for (const r of rays) { r.o += (r.go - r.o) * ko; r.mesh.visible = r.o > 0.01 && !!r.b && !watchOn; if (!r.mesh.visible || !r.b) continue;
        if (r.a) A.set(r.a.c[0], r.a.c[1], r.a.c[2] - 0.3); else if (wordPos) A.set(wordPos[0], wordPos[1], wordPos[2]); else A.set(0, 0, -14);
        B.set(r.b.c[0], r.b.c[1], r.b.c[2] - 0.3);
        tmp.subVectors(B, A); const len = Math.hypot(tmp.x, tmp.y) || 1, nx = -tmp.y / len, ny = tmp.x / len;
        const wi = 0.03 * r.w, wo = r.b.c[3] * 0.22 * r.w, p = r.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
        p.setXYZ(0, A.x + nx * wi, A.y + ny * wi, A.z); p.setXYZ(1, B.x + nx * wo, B.y + ny * wo, B.z); p.setXYZ(2, B.x - nx * wo, B.y - ny * wo, B.z); p.setXYZ(3, A.x - nx * wi, A.y - ny * wi, A.z); p.needsUpdate = true;
        r.mat.uniforms.uAlpha.value = r.o * Math.min(r.a ? r.a.c[4] : 1, r.b.c[4]); }
      renderer.render(scene, cam);
      if (W) syncLabels();
      // 言葉の位置（奥の一点 → 中心）
      const wd = document.querySelector(".bw-word") as HTMLElement | null;
      if (wd && wordPos) { V.set(wordPos[0], wordPos[1], wordPos[2]).project(cam); wd.style.left = `${((V.x + 1) / 2) * innerWidth}px`; wd.style.top = `${((1 - V.y) / 2) * innerHeight}px`; }
    }
    resize(); requestAnimationFrame(frame);
    // 検証用
    (window as unknown as { __bw: unknown }).__bw = {
      go, ready: () => !!W && tiles.length > 0, mode: () => modeRef.current,
      screenOf: (kind: "p" | "m", id: number) => { const t = (kind === "p" ? tiles : cards)[id]; V.set(t.c[0], t.c[1], t.c[2]).project(cam); return [((V.x + 1) / 2) * innerWidth, ((1 - V.y) / 2) * innerHeight]; },
      ring: () => labelled.map((t) => t.id), near: () => cards.map((c, j) => { V.set(c.c[0], c.c[1], c.c[2]).project(cam); return { j, s: c.c[3] / -c.c[2], o: c.c[4], x: V.x, y: V.y }; })
        .filter((x) => x.o > 0.8 && Math.abs(x.x) < 0.7 && Math.abs(x.y) < 0.6).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.j),
      playing: () => slots.filter((s) => s.owner && !s.v.paused && s.v.readyState >= 2).length,
      sound: () => slots.filter((s) => s.owner && !s.v.muted).map((s) => s.owner!.kind + s.owner!.id),
    };
    return () => { alive = false; removeEventListener("resize", resize); el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerdown", onDown); el.removeEventListener("pointerup", onUp);
      renderer.dispose(); el.innerHTML = ""; lh.innerHTML = ""; slots.forEach((s) => { s.v.pause(); s.v.src = ""; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function throwWord(e?: React.FormEvent) {
    e?.preventDefault(); const w = (q.trim() || EX[ph]).slice(0, 40); setNote(""); setWhy(null);
    getCrowd().start(); sfx.start(); sfx.suction?.();
    api.current?.go({ kind: "reading", q: w });
    try {
      const r = await fetch("/api/lab/net/word", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: w }) });
      const j = await r.json(); sfx.stopSuction?.();
      if (j.unreadable || !j.picks?.length) { setNote("その言葉では組み替えられませんでした。スポーツの見方の言葉で投げてください"); api.current?.go({ kind: "stream" }); return; }
      api.current?.go({ kind: "word", q: w, name: j.name, picks: j.picks }); setQ(""); getCrowd().swell(0.7);
    } catch { sfx.stopSuction?.(); setNote("読み取りに失敗しました。もう一度投げてください"); api.current?.go({ kind: "stream" }); }
  }

  const word = mode.kind === "word" || mode.kind === "reading" ? mode.q : null;
  return (
    <div className="bw">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={host} className="bw-gl" />
      <div ref={lblHost} className="bw-lbs" />
      <header className="bw-head">
        <a href="/moments" className="bw-logo">DAZN <em>100</em> MOMENTS</a>
        {mode.kind !== "stream" ? <button className="bw-back" onClick={() => api.current?.go({ kind: "stream" })}>← 100の瞬間へ</button> : <a href="/moments" className="bw-back">一覧へ</a>}
      </header>
      {mode.kind === "stream" && ready && <div className="bw-hint">流れてくる瞬間を押すと、その瞬間が熱のかけらに割れる</div>}
      {cap && !watching && (
        <div className="bw-cap" key={cap.name + (cap.who || "")}>
          <div className="bw-cap-n">{cap.name}</div>
          {cap.who && <div className="bw-cap-w">{cap.who}</div>}
          {cap.sub && <div className="bw-cap-s">{cap.sub}</div>}
        </div>
      )}
      {word && !watching && <div className={`bw-word${mode.kind === "reading" ? " rd" : ""}`} key={word + mode.kind}>{word}</div>}
      {why && mode.kind === "focus" && !watching && <div className="bw-why" key={why.k}>{why.t}</div>}
      {hover && (
        <div className="bw-hv" style={{ left: Math.min(hover.x + 16, (typeof window !== "undefined" ? innerWidth : 1280) - 300), top: hover.y + 16 }}>
          <div className="bw-hv-t">{hover.t}</div>{hover.s && <div className="bw-hv-s">{hover.s}</div>}
        </div>
      )}
      {(mode.kind === "focus" || mode.kind === "open") && cap?.no && (
        <div className="bw-acts">
          {watching ? <button onClick={() => api.current?.watch(false)}>← かけらに戻る</button> : <button onClick={() => api.current?.watch(true)}>▶ {mode.kind === "open" ? "この瞬間" : "この1秒"}を観る</button>}
          <a href={`/moments/${cap.no}`}>この瞬間に投票する</a>
        </div>
      )}
      {!ready && <div className="bw-load">100の瞬間を読み込んでいます</div>}
      {!watching && (
        <form className="bw-in" onSubmit={throwWord}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`熱狂の言葉を投げる　例「${EX[ph]}」`} maxLength={40} enterKeyHint="send" />
          <button type="submit" disabled={mode.kind === "reading"}>{mode.kind === "reading" ? "読んでいます" : "投げる"}</button>
        </form>
      )}
      {note && <div className="bw-note">{note}</div>}
    </div>
  );
}

const CSS = `
.bw{position:fixed;inset:0;background:#000;color:#fff;overflow:hidden;font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;touch-action:manipulation}
.bw-gl,.bw-lbs{position:absolute;inset:0}.bw-lbs{pointer-events:none}
.bw-head{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 0;z-index:3;pointer-events:none}
.bw-head>*{pointer-events:auto}
.bw-logo{color:#fff;text-decoration:none;font-weight:900;font-size:13px;letter-spacing:.08em}.bw-logo em{font-style:normal;color:#ffff00}
.bw-back{background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.3);color:#fff;font-size:12px;padding:7px 12px;cursor:pointer;text-decoration:none}
.bw-hint{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 58px);text-align:center;font-size:13px;color:rgba(255,255,255,.75);pointer-events:none;padding:0 16px;text-shadow:0 0 8px #000}
.bw-cap{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 50px);text-align:center;pointer-events:none;animation:bwIn .8s ease both;padding:0 16px}
.bw-cap-n{font-size:clamp(22px,3.4vw,40px);font-weight:900;letter-spacing:.02em;line-height:1.2;text-shadow:0 2px 18px #000,0 0 4px #000}
.bw-cap-w{font-size:13px;color:rgba(255,255,255,.85);margin-top:6px;text-shadow:0 0 6px #000}
.bw-cap-s{font-size:11px;color:rgba(255,255,255,.55);margin-top:3px;text-shadow:0 0 6px #000}
.bw-word{position:absolute;transform:translate(-50%,-50%);font-size:clamp(26px,4.6vw,58px);font-weight:900;letter-spacing:.04em;white-space:nowrap;pointer-events:none;text-shadow:0 0 24px #000,0 0 6px #000;z-index:2}
.bw-word.rd{animation:bwPulse 1.1s ease-in-out infinite}
@keyframes bwPulse{0%,100%{opacity:.5}50%{opacity:1}}
.bw-lb{position:absolute;left:0;top:0;font-size:12px;font-weight:700;color:#fff;white-space:nowrap;text-shadow:0 0 6px #000,0 0 2px #000,0 0 10px #000;will-change:transform}
.bw-why{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 128px);max-width:min(640px,calc(100% - 32px));text-align:center;font-size:13px;line-height:1.5;color:#ffee55;text-shadow:0 0 8px #000,0 0 3px #000;pointer-events:none;animation:bwWhy 4.5s ease both}
@keyframes bwWhy{0%{opacity:0}10%{opacity:1}75%{opacity:1}100%{opacity:0}}
.bw-hv{position:absolute;max-width:290px;background:rgba(0,0,0,.8);border:1px solid rgba(255,255,255,.18);padding:8px 10px;pointer-events:none;font-size:12px;line-height:1.55;z-index:4}
.bw-hv-t{font-weight:700}.bw-hv-s{color:rgba(255,255,255,.7);font-size:11px;margin-top:2px}
.bw-acts{position:absolute;right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 22px);display:flex;gap:8px;z-index:3}
.bw-acts>*{background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.4);color:#fff;font-size:12px;padding:8px 14px;cursor:pointer;text-decoration:none;white-space:nowrap}
.bw-acts>a{border-color:#ffff00;color:#ffff00}
.bw-in{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 18px);width:min(560px,calc(100% - 32px));display:flex;gap:8px;z-index:3}
.bw-in input{flex:1;min-width:0;background:rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.35);color:#fff;font-size:16px;padding:12px 14px;outline:none;border-radius:0}
.bw-in input:focus{border-color:#ffff00}
.bw-in button{background:#ffff00;color:#000;border:0;font-weight:800;font-size:14px;padding:0 18px;cursor:pointer;white-space:nowrap}
.bw-in button:disabled{opacity:.6}
.bw-note{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 74px);text-align:center;font-size:12px;color:rgba(255,255,255,.8);padding:0 16px;text-shadow:0 0 6px #000}
.bw-load{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;color:rgba(255,255,255,.6);pointer-events:none}
@media (max-width:1000px){.bw-acts{right:auto;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 74px)}}
@media (max-width:600px){.bw-lb{font-size:11px}.bw-cap{top:calc(env(safe-area-inset-top,0px) + 50px)}.bw-why{bottom:calc(env(safe-area-inset-bottom,0px) + 122px)}}
@keyframes bwIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
`;

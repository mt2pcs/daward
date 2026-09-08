"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer, CSS3DSprite } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { getCrowd } from "@/lib/crowd";
import { embedUrl } from "@/lib/youtube";
import { FluidSim, INK_COLORS } from "@/lib/fluid";
import type { Interpretation } from "@/lib/interpret";
import type { MomentWithStats } from "@/lib/types";

// 熱狂の渦 — 渦そのものがインターフェース（vortex2: 奥行きの作り直し）
//  背景: 画面全体の液体状の渦（シェーダー）。入場時は100本のサムネイルが捻れて渦になり、入場で写真が溶けて色の帯が残る
//  前景: 100の映像カード（CSS3D）が3Dの漏斗状の渦を流れる。
//    - カードは渦の流れの接線に沿って傾く（真正面の板にしない）
//    - 遠いカードは霧で沈み、近いカードは大きく鮮明。大きさの比は6倍以上
//    - 渦は常に手前へ流れ、通り過ぎたカードは渦の目から再び現れる（視差が止まらない）
//    - 腕の光の帯は2枚のWebGL層（カードの奥と手前）に分けて描き、カードの前後を通る
//  言葉: 入力した瞬間に渦が加速し、言葉が渦の目に浮かぶ。LLMの解釈が届いたら新しい腕へ組み替わり、カメラが飛び込む
//  クリック: カメラがそのカードへ飛び込み、寄り切ってから詳細（投票）になる

export type Phase = "entry" | "space";

const CARD_PX = 320;
const R_NEAR = 54;
const R_FAR = 12;
const DEPTH = 130;
const TWIST = 2.6;
const YSQ = 0.8;
const S_MIN = -0.16; // これより手前に来たら奥へ戻す
const S_MAX = 1.08;
const FRONT_S = 0.2; // これより手前のリボンはカードの前に描く

interface Card {
  id: string;
  m: MomentWithStats;
  el: HTMLDivElement;
  media: HTMLDivElement;
  votesEl: HTMLDivElement;
  obj: CSS3DObject;
  // 渦の座標: 腕の基点角 base、進み s（0=手前の入口, 1=渦の目）、半径オフセット ro、角度ジッター aj
  base: number; tbase: number;
  s: number; ts: number;
  ro: number; tro: number;
  aj: number;
  size: number; tsize: number;
  dim: number; tdim: number;
  inArm: boolean;
  iframe: HTMLIFrameElement | null;
  lastFilter: string;
  pos: THREE.Vector3;
}
interface Label {
  el: HTMLDivElement;
  obj: CSS3DSprite;
  base: number; s: number;
}

function hash(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
function damp(cur: number, tgt: number, dt: number, tau: number): number {
  return cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
}
// 漏斗の形: s → 半径, 奥行き
function radiusAt(s: number): number {
  const c = Math.max(0, Math.min(1, s));
  return R_NEAR - (R_NEAR - R_FAR) * Math.pow(c, 0.8) - Math.max(0, -s) * 12;
}
function depthAt(s: number): number {
  return -(2 + s * DEPTH);
}
// 平たいリボン: 曲線に沿って、半径方向に幅を持つ帯（漏斗の面に貼り付く）
function ribbonGeometry(pts: THREE.Vector3[], halfW: number): THREE.BufferGeometry {
  const n = pts.length;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx: number[] = [];
  const side = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    side.set(p.x, p.y, 0).normalize().multiplyScalar(halfW);
    pos.set([p.x - side.x, p.y - side.y, p.z, p.x + side.x, p.y + side.y, p.z], i * 6);
    uv.set([i / (n - 1), 0, i / (n - 1), 1], i * 4);
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export default function VortexSpace({
  moments,
  arms,
  pendingText,
  pulses,
  phase,
  focusId,
  soundOn,
  onSelect,
}: {
  moments: MomentWithStats[];
  arms: Interpretation | null;
  pendingText: string | null; // 解釈中の言葉（渦が加速し、言葉が目に浮かぶ）
  pulses: Record<string, number>;
  phase: Phase;
  focusId: string | null;
  soundOn: boolean;
  onSelect: (m: MomentWithStats) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const S = useRef<{
    cards: Map<string, Card>;
    labels: Label[];
    setArms?: (a: Interpretation | null, dramatic: boolean) => void;
    setPhase?: (p: Phase) => void;
    setFocus?: (id: string | null) => void;
    setPending?: (t: string | null) => void;
    momentsRef: MomentWithStats[];
    onSelect: (m: MomentWithStats) => void;
    soundOn: boolean;
  }>({ cards: new Map(), labels: [], momentsRef: moments, onSelect, soundOn });
  S.current.momentsRef = moments;
  S.current.onSelect = onSelect;
  S.current.soundOn = soundOn;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const st = S.current;
    const W = () => host.clientWidth;
    const H = () => host.clientHeight;
    const portrait = () => H() > W();
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    // ---- WebGL 下層: 背景の渦 + 奥のリボン ----
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.setSize(W(), H());
    renderer.autoClear = false;
    renderer.domElement.className = "vs-gl";
    host.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(portrait() ? 74 : 60, W() / H(), 0.5, 600);
    camera.position.set(0, 2, 26);
    const camLook = new THREE.Vector3(0, -3, -70);

    // 背景シェーダー（サムネイルのアトラス）
    const GRID = [8, 5];
    const atlas = document.createElement("canvas");
    atlas.width = 256 * GRID[0];
    atlas.height = 144 * GRID[1];
    const actx = atlas.getContext("2d")!;
    for (let i = 0; i < GRID[0] * GRID[1]; i++) {
      const x = (i % GRID[0]) * 256;
      const y = Math.floor(i / GRID[0]) * 144;
      const g = actx.createLinearGradient(x, y, x + 256, y + 144);
      g.addColorStop(0, `hsl(${(i * 47) % 360} 40% 18%)`);
      g.addColorStop(1, "#0a0a0c");
      actx.fillStyle = g;
      actx.fillRect(x, y, 256, 144);
    }
    const atlasTex = new THREE.CanvasTexture(atlas);
    atlasTex.colorSpace = THREE.SRGBColorSpace;
    atlasTex.minFilter = THREE.LinearFilter;
    const picks = [...moments].sort((a, b) => b.votes - a.votes).slice(0, GRID[0] * GRID[1]);
    let atlasDirty = false;
    picks.forEach((m, i) => {
      const img = new Image();
      img.onload = () => {
        actx.drawImage(img, (i % GRID[0]) * 256, Math.floor(i / GRID[0]) * 144, 256, 144);
        atlasDirty = true;
      };
      img.src = `/api/thumb/${m.youtubeId}`;
    });
    // 背景 = GPU流体（本物の渦）。写真のモザイクを染料として流し、ロゴ色のインクを落とす
    const fluid = new FluidSim(renderer, W(), H(), coarse ? 128 : 192, coarse ? 512 : 768);
    fluid.params.strength = 0;
    fluid.params.curl = 6;
    fluid.params.pull = 4;
    fluid.params.core = 0.62;
    fluid.params.velDissipation = 0.3;
    fluid.params.dyeDissipation = 0.015;
    fluid.fillMosaic(atlasTex, [GRID[0], GRID[1]], [0.34, 0.19125]);
    const bgScene = new THREE.Scene();
    const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uDye;
        uniform vec2 uCenter;
        uniform float uZoom;
        uniform float uAspect;
        uniform float uBurst;
        uniform float uDim;
        void main() {
          vec2 uv = (vUv - 0.5) / uZoom + uCenter;
          vec3 c = texture2D(uDye, uv).rgb;
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
          float r = length(p);
          c *= 0.08 + 0.92 * smoothstep(1.12, 0.38, r);
          c *= uDim;
          c = c / (1.0 + c * 0.3); // 発光をやわらかく飽和（白飛び・原色化を抑える）
          c += vec3(1.0, 0.98, 0.9) * uBurst * exp(-r * 2.6);
          gl_FragColor = vec4(c, 1.0);
        }`,
      uniforms: {
        uDye: { value: fluid.dyeTexture },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uZoom: { value: 1 },
        uAspect: { value: W() / H() },
        uBurst: { value: 0 },
        uDim: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));
    (window as unknown as { __vs?: unknown }).__vs = { bgMat, atlas, fluid, get photo() { return photo; } };
    // インクの一滴: 渦の流れに沿った向きで落とす
    const dropInk = (strength: number, radius: number, rMin = 0.12, rMax = 0.42) => {
      const ang = Math.random() * Math.PI * 2;
      const rr = rMin + Math.random() * (rMax - rMin);
      const asp = W() / H();
      const x = 0.5 + (Math.cos(ang) * rr) / asp;
      const y = 0.5 + Math.sin(ang) * rr;
      const col = INK_COLORS[Math.floor(Math.random() * INK_COLORS.length)];
      fluid.splat(x, y, -Math.sin(ang) * strength, Math.cos(ang) * strength, col, radius);
    };
    let inkTimer = 0;
    const maxSubsteps = Math.max(1, Math.min(24, Number(new URLSearchParams(location.search).get("simsteps")) || 3));

    const backScene = new THREE.Scene();
    const backGroup = new THREE.Group();
    backGroup.scale.y = YSQ;
    backScene.add(backGroup);

    // ---- CSS3D 中層: カードとラベル ----
    const css = new CSS3DRenderer();
    css.setSize(W(), H());
    css.domElement.className = "vs-css";
    host.appendChild(css.domElement);
    const cssScene = new THREE.Scene();

    // ---- WebGL 上層: 手前のリボン（カードの前を横切る） ----
    const topRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
    topRenderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    topRenderer.setSize(W(), H());
    topRenderer.setClearColor(0x000000, 0);
    topRenderer.domElement.className = "vs-gl-top";
    host.appendChild(topRenderer.domElement);
    const frontScene = new THREE.Scene();
    const frontGroup = new THREE.Group();
    frontGroup.scale.y = YSQ;
    frontScene.add(frontGroup);

    // リボンの流れ（縞のアルファマップをスクロール、断面は柔らかい）
    const stripe = document.createElement("canvas");
    stripe.width = 256; stripe.height = 64;
    const sctx = stripe.getContext("2d")!;
    const sImg = sctx.createImageData(256, 64);
    for (let y = 0; y < 64; y++) {
      const prof = Math.pow(Math.sin((y / 63) * Math.PI), 1.6);
      for (let x = 0; x < 256; x++) {
        const u = x / 256;
        const flow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 3.0)) * (0.6 + 0.4 * Math.sin(u * Math.PI * 2 * 7.0 + 1.3));
        const a = Math.max(0, Math.min(255, prof * flow * 255));
        const k = (y * 256 + x) * 4;
        sImg.data[k] = 255; sImg.data[k + 1] = 255; sImg.data[k + 2] = 255; sImg.data[k + 3] = a;
      }
    }
    sctx.putImageData(sImg, 0, 0);
    const stripeTex = new THREE.CanvasTexture(stripe);
    stripeTex.wrapS = THREE.RepeatWrapping;
    stripeTex.repeat.set(2, 1);
    let ribbons: THREE.Mesh[] = [];

    const cards = st.cards;
    cards.clear();
    for (const m of moments) {
      const el = document.createElement("div");
      el.className = "vcard";
      el.style.width = `${CARD_PX}px`;
      el.style.height = `${CARD_PX * 9 / 16}px`;
      const media = document.createElement("div");
      media.className = "vcard-media";
      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      img.onerror = () => { img.style.display = "none"; };
      img.onload = () => { if (!img.naturalWidth) img.style.display = "none"; };
      img.src = `/api/thumb/${m.youtubeId}`;
      media.appendChild(img);
      el.appendChild(media);
      const shade = document.createElement("div");
      shade.className = "vcard-shade";
      el.appendChild(shade);
      const title = document.createElement("div");
      title.className = "vcard-title";
      title.textContent = m.title;
      el.appendChild(title);
      const votes = document.createElement("div");
      votes.className = "vcard-votes";
      votes.innerHTML = `<span>🔥</span>${m.votes.toLocaleString()}`;
      el.appendChild(votes);
      const obj = new CSS3DObject(el);
      obj.scale.setScalar(0.5 / CARD_PX);
      cssScene.add(obj);
      const c: Card = {
        id: m.id, m, el, media, votesEl: votes, obj,
        base: hash(m.id) * Math.PI * 2, tbase: 0,
        s: 1.0, ts: 1.0, ro: 0, tro: 0, aj: (hash(m.id, 11) - 0.5) * 0.36,
        size: 0.5, tsize: 0.5, dim: 0, tdim: 0,
        inArm: false, iframe: null, lastFilter: "", pos: new THREE.Vector3(),
      };
      c.tbase = c.base;
      el.addEventListener("pointerenter", () => { hoverId = c.id; el.classList.add("hovered"); });
      el.addEventListener("pointerleave", () => { if (hoverId === c.id) hoverId = null; el.classList.remove("hovered"); });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dragMoved > 6 || flyingTo) return;
        // まずカメラがカードへ飛び込み、寄り切ってから詳細へ
        flyTo(c, () => st.onSelect(c.m));
      });
      cards.set(m.id, c);
    }

    // 渦の目に浮かぶ言葉（解釈中）
    const wordEl = document.createElement("div");
    wordEl.className = "vword";
    const wordObj = new CSS3DSprite(wordEl);
    wordObj.scale.setScalar(0.09);
    wordObj.position.set(0, 0, -70);
    cssScene.add(wordObj);
    let wordAlpha = 0;
    let wordTarget = 0;

    // ---- 状態 ----
    let phaseNow: Phase = phase;
    let spin = 0;
    let spinBoost = 0;
    let dragSpin = 0;
    let dragVel = 0;
    let hoverId: string | null = null;
    let dragMoved = 0;
    let dolly = 40;
    let dollyTarget = 40;
    let burst = 0;
    let glow = 1;
    let glowTarget = 0.75;
    let photo = 1;
    let photoTarget = 1;
    let flow = 0; // 渦の流速（s が減る速さ）
    let flowTarget = 0.02;
    let loosen = 0; // 解釈中: カードがほどけて外へ広がる
    let loosenTarget = 0;
    let pendingNow: string | null = null;
    let flyingTo: Card | null = null;
    let t0 = performance.now();
    let last = t0;
    const parallax = new THREE.Vector2();
    const parallaxTarget = new THREE.Vector2();
    let camTween: { from: THREE.Vector3; to: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3; t0: number; dur: number; then?: () => void } | null = null;
    let camFree = true;
    let currentArms: Interpretation | null = null;
    let liveTimer = 0;

    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    const tmp3 = new THREE.Vector3();
    const mat4 = new THREE.Matrix4();
    const posOf = (base: number, s: number, ro: number, aj: number, spinAll: number, out: THREE.Vector3) => {
      const th = base + s * TWIST + aj + spinAll;
      const r = radiusAt(s) + ro;
      return out.set(Math.cos(th) * r, Math.sin(th) * r * YSQ, depthAt(s));
    };

    // 腕の割当 → 各カードの目標
    const applyArms = (a: Interpretation | null, dramatic: boolean) => {
      currentArms = a;
      const maxVotes = Math.max(1, ...st.momentsRef.map((m) => m.votes));
      const votesOf = (id: string) => (st.momentsRef.find((m) => m.id === id)?.votes ?? 0) / maxVotes;
      const inArm = new Set<string>();
      const A = a ? a.arms.length : 1;
      for (const l of st.labels) cssScene.remove(l.obj);
      st.labels = [];
      for (const r of ribbons) { r.parent?.remove(r); r.geometry.dispose(); (r.material as THREE.Material).dispose(); }
      ribbons = [];
      if (a) {
        a.arms.forEach((arm, ai) => {
          const base = (ai / A) * Math.PI * 2;
          const n = arm.ids.length;
          arm.ids.forEach((id, k) => {
            const c = cards.get(id);
            if (!c) return;
            inArm.add(id);
            const s = Math.min(1, (k + 0.5) / Math.max(n, 7));
            c.tbase = base;
            c.ts = s;
            c.tro = (hash(id, 5) - 0.5) * 8;
            const sc = a.text ? 0.55 + 0.9 * (a.scores[id] ?? 0.5) : 0.75 + 0.55 * votesOf(id);
            c.tsize = 12 * sc;
            c.tdim = 1;
            c.el.style.setProperty("--c", arm.color);
            if (dramatic) c.base -= Math.PI * 0.9; // 一周近く渦を巻いて新しい腕へ
          });
          const lel = document.createElement("div");
          lel.className = "vlabel";
          lel.innerHTML = `<span>${arm.name}</span>`;
          lel.style.setProperty("--c", arm.color);
          const lobj = new CSS3DSprite(lel);
          lobj.scale.setScalar(0.05);
          cssScene.add(lobj);
          st.labels.push({ el: lel, obj: lobj, base, s: 0.34 });
          // リボン: 腕に沿う光の帯（7本）。手前側（s<FRONT_S）はカードの前に描く
          for (let b = 0; b < 4; b++) {
            const off = (b - 1.5) * 0.22 + (hash(arm.name, 40 + b) - 0.5) * 0.1;
            const roff = (hash(arm.name, b) - 0.5) * 12;
            const width = 0.3 + hash(arm.name, 20 + b) * 0.7;
            const mk = (s0: number, s1: number, group: THREE.Group) => {
              const pts: THREE.Vector3[] = [];
              const N = 40;
              for (let q = 0; q <= N; q++) {
                const ss = s0 + (q / N) * (s1 - s0);
                const th = base + ss * TWIST + off + Math.sin(ss * 5 + b) * 0.07;
                const rr = radiusAt(ss) + roff + 4;
                pts.push(new THREE.Vector3(Math.cos(th) * rr, Math.sin(th) * rr, depthAt(ss) + 1 + (b - 1.5) * 1.6));
              }
              const mat = new THREE.MeshBasicMaterial({
                color: new THREE.Color(arm.color), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
                depthWrite: false, alphaMap: stripeTex, side: THREE.DoubleSide,
              });
              const mesh = new THREE.Mesh(ribbonGeometry(pts, width), mat);
              mesh.userData.targetOpacity = 0.12 + hash(arm.name, 60 + b) * 0.14;
              group.add(mesh);
              ribbons.push(mesh);
            };
            mk(FRONT_S, 1.25, backGroup);
            mk(S_MIN - 0.02, FRONT_S + 0.02, frontGroup);
          }
        });
      }
      for (const c of Array.from(cards.values())) {
        c.inArm = inArm.has(c.id);
        if (!c.inArm) {
          // 腕に入らなかったものは外周の奥へ
          c.tbase = hash(c.id, 3) * Math.PI * 2;
          c.ts = 0.55 + hash(c.id, 9) * 0.5;
          c.tro = 34 + hash(c.id, 4) * 20;
          c.tsize = 6.5;
          c.tdim = a && a.text ? 0.3 : 0.6;
          if (dramatic) c.base -= Math.PI * 0.5;
          if (c.iframe) { c.iframe.remove(); c.iframe = null; }
        }
      }
      if (dramatic) {
        spinBoost = 1.6;
        glow = 2.2;
        burst = 0.7;
        // 渦の目からインクが弾ける
        for (let k = 0; k < 6; k++) dropInk(150, 0.001, 0.12, 0.4);
        loosenTarget = 0;
        flow = 0.35; // 一気に流れて減速
        camFree = true;
        dollyTarget = 18;
        setTimeout(() => { dollyTarget = 40; }, 1500);
        wordTarget = 0;
      }
    };
    st.setArms = applyArms;

    const setPhase = (p: Phase) => {
      if (p === phaseNow) return;
      phaseNow = p;
      if (p === "space") {
        burst = 1;
        photoTarget = 0;
        spinBoost = 1.2;
        glow = 1.8;
        dolly = 22;
        dollyTarget = 40;
        // カードは渦の目から流れ出てくる
        for (const c of Array.from(cards.values())) { c.s = 1.05; c.size = 1; }
        applyArms(currentArms, false);
      }
    };
    st.setPhase = setPhase;

    // 解釈中: 渦が加速し、言葉が目に浮かび、カードがほどける
    const setPending = (text: string | null) => {
      pendingNow = text;
      if (text) {
        wordEl.textContent = text;
        wordTarget = 1;
        spinBoost = Math.max(spinBoost, 1.2);
        glowTarget = 1.6;
        loosenTarget = 1;
        flowTarget = 0.12;
        for (const r of ribbons) r.userData.targetOpacity = (r.userData.targetOpacity as number) * 0.35;
      } else {
        glowTarget = 0.75;
        loosenTarget = 0;
        flowTarget = 0.02;
      }
    };
    st.setPending = setPending;

    // カメラをカードへ飛び込ませる（寄り切ったら then）
    const flyTo = (c: Card, then?: () => void) => {
      flyingTo = c;
      const p = c.pos.clone();
      const dir = new THREE.Vector3().subVectors(camera.position, p).normalize();
      const dist = c.size * (portrait() ? 1.25 : 1.05);
      const to = p.clone().add(dir.multiplyScalar(dist));
      camFree = false;
      camTween = { from: camera.position.clone(), to, lookFrom: camLook.clone(), lookTo: p, t0: performance.now(), dur: 950, then };
      getCrowd().swell(0.5);
    };
    const setFocus = (id: string | null) => {
      if (id) {
        const c = cards.get(id);
        if (c && flyingTo !== c) flyTo(c);
      } else if (!camFree) {
        flyingTo = null;
        camTween = { from: camera.position.clone(), to: new THREE.Vector3(0, 2, dolly), lookFrom: camLook.clone(), lookTo: new THREE.Vector3(0, -3, -70), t0: performance.now(), dur: 900, then: () => { camFree = true; } };
      }
    };
    st.setFocus = setFocus;

    // ---- 入力 ----
    let dragging = false;
    let lastX = 0;
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; dragMoved = 0; };
    const onMove = (e: PointerEvent) => {
      parallaxTarget.set((e.clientX / W()) * 2 - 1, (e.clientY / H()) * 2 - 1);
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      dragMoved += Math.abs(dx);
      dragVel = dx * 0.004;
      dragSpin += dragVel;
    };
    const onUp = () => { dragging = false; };
    const onWheel = (e: WheelEvent) => {
      dollyTarget = Math.max(14, Math.min(60, dollyTarget + e.deltaY * 0.03));
    };
    host.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    host.addEventListener("wheel", onWheel, { passive: true });

    const onResize = () => {
      camera.aspect = W() / H();
      camera.fov = portrait() ? 74 : 60;
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
      topRenderer.setSize(W(), H());
      css.setSize(W(), H());
      bgMat.uniforms.uAspect.value = W() / H();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    // ---- ループ ----
    let raf = 0;
    const camDir = new THREE.Vector3();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = Math.max(0, (now - t0) / 1000);

      // 渦の回転と流れ
      dragVel *= Math.exp(-dt / 0.6);
      if (!dragging) dragSpin += dragVel;
      spinBoost = damp(spinBoost, 0, dt, 1.3);
      spin += dt * (0.04 + spinBoost * 0.9);
      const spinAll = spin + dragSpin;
      backGroup.rotation.z = spinAll;
      frontGroup.rotation.z = spinAll;
      flow = damp(flow, flowTarget, dt, 1.2);
      loosen = damp(loosen, loosenTarget, dt, 0.7);
      for (const rb of ribbons) {
        const mat = rb.material as THREE.MeshBasicMaterial;
        mat.opacity = damp(mat.opacity, (rb.userData.targetOpacity as number) * (phaseNow === "entry" ? 0 : 1), dt, 0.8);
      }
      stripeTex.offset.x -= dt * (0.25 + flow * 1.5);

      // 背景の流体: 入場中は10秒かけて渦が育つ。入場後は静かに回り続け、解釈中は激しく回る
      let strength: number;
      if (phaseNow === "entry") {
        const e = Math.min(1, t / 9);
        strength = 115 * Math.pow(e, 1.5) + 10 * Math.sin(t * 0.5) * e;
      } else {
        strength = 55 + 110 * loosen + spinBoost * 80;
      }
      fluid.params.strength = strength;
      fluid.params.pull = 3 + loosen * 6;
      fluid.params.dyeDissipation = photoTarget === 0 && photo > 0.05 ? 1.6 : 0.015; // 入場直後に写真を溶かす
      const photoWas = photo;
      photo = damp(photo, photoTarget, dt, 0.5);
      if (photoWas > 0.05 && photo <= 0.05) for (let k = 0; k < 10; k++) dropInk(120, 0.0012, 0.1, 0.5); // 溶けた跡にインクを流す
      // 実時間に合わせて刻む（低fpsでも渦の育ち方が変わらない。検証環境は ?simsteps=16）
      let acc = Math.min(dt, maxSubsteps / 60);
      while (acc > 1e-4) { const h = Math.min(acc, 1 / 60); fluid.step(h); acc -= h; }
      const inkEvery = phaseNow === "entry" ? 0.7 : loosen > 0.5 ? 0.1 : 0.45;
      if (t > 2.5 && now - inkTimer > inkEvery * 1000) {
        inkTimer = now;
        // 入場中は渦が回っている中心域にだけ落とす（周りの写真の上に孤立した渦を作らない）
        if (phaseNow === "entry") dropInk(70, 0.0004, 0.08, 0.3);
        else dropInk(140 + loosen * 120, 0.0008, 0.1, 0.45);
      }
      burst = damp(burst, 0, dt, 0.5);
      glow = damp(glow, phaseNow === "entry" ? 1 : glowTarget, dt, 1.2);
      bgMat.uniforms.uDye.value = fluid.dyeTexture;
      bgMat.uniforms.uBurst.value = burst;
      bgMat.uniforms.uDim.value = phaseNow === "entry" ? 1 : 0.85 + 0.3 * Math.min(1, glow);
      bgMat.uniforms.uCenter.value.set(0.5 - parallax.x * 0.025, 0.5 - parallax.y * 0.02);
      bgMat.uniforms.uZoom.value = 1 + (40 - dolly) * 0.012;
      if (atlasDirty) { atlasTex.needsUpdate = true; atlasDirty = false; if (t < 3) fluid.fillMosaic(atlasTex, [GRID[0], GRID[1]], [0.34, 0.19125]); }

      // カメラ
      parallax.lerp(parallaxTarget, 1 - Math.exp(-dt / 0.5));
      dolly = damp(dolly, dollyTarget, dt, 0.9);
      if (camTween) {
        const k = Math.min(1, (now - camTween.t0) / camTween.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        camera.position.lerpVectors(camTween.from, camTween.to, e);
        camLook.lerpVectors(camTween.lookFrom, camTween.lookTo, e);
        if (flyingTo) {
          // 飛び込み中はカードの現在位置を追い続ける
          camTween.lookTo.copy(flyingTo.pos);
          camDir.subVectors(camTween.from, flyingTo.pos).normalize();
          camTween.to.copy(flyingTo.pos).add(camDir.multiplyScalar(flyingTo.size * (portrait() ? 1.25 : 1.05)));
        }
        if (k >= 1) { const th = camTween.then; camTween = null; th?.(); }
      } else if (camFree) {
        camera.position.set(
          Math.sin(t * 0.11) * 3 + parallax.x * 5,
          2 + Math.sin(t * 0.09) * 1.8 - parallax.y * 3.5,
          dolly
        );
        camLook.set(parallax.x * 7, -3 - parallax.y * 5, -70);
      }
      camera.lookAt(camLook);

      // カード: 流れ・向き・霧
      const cam = camera.position;
      const flying = flyingTo;
      for (const c of Array.from(cards.values())) {
        if (phaseNow === "space" && c.inArm && c !== flying) {
          // 手前へ流れ続け、通り過ぎたら渦の目から出直す
          c.ts -= dt * flow;
          if (c.ts < S_MIN) { c.ts += S_MAX - S_MIN; c.s = c.ts; c.size = 1; }
        }
        c.base = damp(c.base, c.tbase, dt, 0.95);
        c.s = damp(c.s, c.ts, dt, 0.9);
        c.ro = damp(c.ro, c.tro + loosen * 16 * (c.inArm ? 1 : 0), dt, 0.9);
        const hovered = hoverId === c.id;
        // 近いほど大きい（perspectiveに加えて実サイズも）
        const sizeS = c.inArm ? 1.75 - 1.0 * Math.max(0, Math.min(1, c.s)) : 1;
        c.size = damp(c.size, c.tsize * sizeS * (hovered ? 1.22 : 1), dt, 0.25);
        c.dim = damp(c.dim, phaseNow === "entry" ? 0 : c.tdim, dt, 0.6);
        posOf(c.base, c.s, c.ro, c.aj, spinAll, c.pos);
        c.pos.y += Math.sin(t * 0.8 + c.base * 3) * 0.5;
        c.obj.position.copy(c.pos);

        // 向き: 流れの接線に沿い、少しだけカメラへ向く（真正面の板にしない）
        posOf(c.base, c.s - 0.02, c.ro, c.aj, spinAll, tmp2); // 一つ手前の点 → 接線
        const T = tmp2.sub(c.pos).normalize();
        const toCam = tmp.subVectors(cam, c.pos).normalize();
        const th = c.base + c.s * TWIST + c.aj + spinAll;
        const outward = tmp3.set(Math.cos(th) * 0.7, Math.sin(th) * 0.7, 0.75).normalize();
        const faceMix = c === flying ? 1 : c.inArm ? 0.62 : 0.4;
        const normal = outward.multiplyScalar(1 - faceMix).add(toCam.multiplyScalar(faceMix)).normalize();
        const right = T.sub(normal.clone().multiplyScalar(T.dot(normal))).normalize();
        const up = new THREE.Vector3().crossVectors(normal, right);
        if (up.y < 0) { up.negate(); right.negate(); }
        mat4.makeBasis(right, up, normal);
        c.obj.quaternion.setFromRotationMatrix(mat4);
        c.obj.scale.setScalar(c.size / CARD_PX);

        // 霧: 遠いほど暗く、色が抜ける
        const dist = c.pos.distanceTo(cam);
        const fog = Math.max(0.28, Math.min(1, 1 - (dist - 34) / 150));
        const b = (0.35 + 0.65 * fog) * (c.inArm ? 1 : 0.7);
        const sat = 0.45 + 0.55 * fog;
        const filter = `brightness(${b.toFixed(2)}) saturate(${sat.toFixed(2)})`;
        if (filter !== c.lastFilter) { c.el.style.filter = filter; c.lastFilter = filter; }
        c.el.style.opacity = c.dim.toFixed(3);
        c.el.style.pointerEvents = c.dim > 0.3 && c.s > -0.05 ? "auto" : "none";
      }
      // ラベル
      for (const l of st.labels) {
        posOf(l.base, l.s, 11, 0.3, spinAll, l.obj.position);
        l.el.style.opacity = phaseNow === "entry" || pendingNow ? "0" : "1";
      }
      // 言葉（解釈中）
      wordAlpha = damp(wordAlpha, wordTarget, dt, 0.4);
      wordEl.style.opacity = wordAlpha.toFixed(3);
      wordObj.scale.setScalar(0.08 + 0.02 * Math.sin(t * 2.2));

      // ライブ再生: 画面上で一番大きい4枚（PCのみ）
      if (now - liveTimer > 700 && phaseNow === "space" && !coarse) {
        liveTimer = now;
        const ranked = Array.from(cards.values()).filter((c) => c.inArm && c.dim > 0.5 && c.s > 0)
          .map((c) => ({ c, d: c.pos.distanceTo(cam) / c.size }))
          .sort((a, b) => a.d - b.d).slice(0, 4);
        const keep = new Set(ranked.map((x) => x.c.id));
        for (const c of Array.from(cards.values())) {
          if (keep.has(c.id) && !c.iframe) {
            const f = document.createElement("iframe");
            f.src = embedUrl(c.m.youtubeId, { autoplay: true, mute: true, loop: true, controls: false, start: c.m.peakSec });
            f.allow = "autoplay; encrypted-media";
            f.title = c.m.title;
            c.media.appendChild(f);
            c.iframe = f;
          } else if (!keep.has(c.id) && c.iframe) {
            c.iframe.remove();
            c.iframe = null;
          }
        }
      }

      // 歓声
      const crowd = getCrowd();
      if (st.soundOn) {
        const c = hoverId ? cards.get(hoverId) : undefined;
        if (c) {
          tmp.copy(c.pos).project(camera);
          const maxVotes = Math.max(1, ...st.momentsRef.map((m) => m.votes));
          crowd.setFocus({ key: c.id, level: 0.35 + 0.65 * Math.pow(c.m.votes / maxVotes, 0.7), pan: Math.max(-0.85, Math.min(0.85, tmp.x)) });
        } else crowd.setFocus(null);
      }

      renderer.clear();
      renderer.render(bgScene, bgCam);
      renderer.render(backScene, camera);
      css.render(cssScene, camera);
      topRenderer.clear();
      topRenderer.render(frontScene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      host.removeEventListener("wheel", onWheel);
      fluid.dispose();
      renderer.dispose();
      topRenderer.dispose();
      host.removeChild(renderer.domElement);
      host.removeChild(topRenderer.domElement);
      host.removeChild(css.domElement);
      st.setArms = undefined;
      st.setPhase = undefined;
      st.setFocus = undefined;
      st.setPending = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const armsKey = arms ? `${arms.text}|${arms.arms.map((a) => a.name).join(",")}` : "";
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    const dramatic = prevKey.current !== null && prevKey.current !== armsKey && phase === "space";
    prevKey.current = armsKey;
    S.current.setArms?.(arms, dramatic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armsKey]);

  useEffect(() => { S.current.setPhase?.(phase); }, [phase]);
  useEffect(() => { S.current.setFocus?.(focusId); }, [focusId]);
  useEffect(() => { S.current.setPending?.(pendingText); }, [pendingText]);

  useEffect(() => {
    for (const [id] of Object.entries(pulses)) {
      const c = S.current.cards.get(id);
      if (!c) continue;
      c.el.classList.add("pulse");
      setTimeout(() => c.el.classList.remove("pulse"), 1400);
    }
  }, [pulses]);
  useEffect(() => {
    for (const m of moments) {
      const c = S.current.cards.get(m.id);
      if (c && c.m.votes !== m.votes) {
        c.m = m;
        c.votesEl.innerHTML = `<span>🔥</span>${m.votes.toLocaleString()}`;
      }
    }
  }, [moments]);

  return <div className={`vs${phase === "entry" ? " entry" : ""}`} ref={hostRef} />;
}

"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getCrowd } from "@/lib/crowd";
import { FluidSim, INK_COLORS } from "@/lib/fluid";
import type { Interpretation } from "@/lib/interpret";
import type { MomentWithStats } from "@/lib/types";

// 熱狂の渦（vortex3）— ひとつの3D空間。
// サンプル（D-NEW-DAY）から取った文法: 空間は数万の流れる粒子でできていて、コンテンツはその中に浮かぶ物体であり、
// カメラはその空間を飛び、入力すると目的地へ突っ込む（2秒のイーズ、閃光、粒子の爆発）。ここでは:
//   - 渦 = 8万本の光の筋（GPUの頂点シェーダーで漏斗の流れに沿って流れ続ける）。腕ごとにロゴの色
//   - 映像カード = 同じ漏斗の流れに乗る3Dの板（WebGL）。粒子の前後関係・霧・傾きがすべて同じ空間で決まる
//   - 渦の目 = 流体シミュレーション（入口で写真が溶けた墨流し）を、漏斗の一番奥に置いた板。入場はその目へ飛び込む
//   - 言葉 → 粒子が白熱して速くなり、言葉が目に浮かぶ → 解釈が届くと全粒子とカードが新しい腕の色・位置へ流れ直し、爆発と閃光、カメラが飛び込む

export type Phase = "entry" | "space";

const R_NEAR = 56;
const R_FAR = 10;
const DEPTH = 150;
const TWIST = 2.7;
const YSQ = 0.82;
const EYE_Z = -196;
const MAX_ARMS = 8;
const S_MIN = -0.18;
const S_MAX = 1.1;

function radiusAt(s: number): number {
  const c = Math.max(0, Math.min(1, s));
  return R_NEAR - (R_NEAR - R_FAR) * Math.pow(c, 0.8) - Math.max(0, -s) * 14;
}
function depthAt(s: number): number {
  return -(2 + s * DEPTH);
}
function hash(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
function damp(cur: number, tgt: number, dt: number, tau: number): number {
  return cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
}

// ---- 粒子（光の筋）: 位置は毎フレームGPUが計算する ----
const STREAM_VERT = `
attribute float aSeed;
attribute float aS0;
attribute float aR;
attribute float aA;
attribute float aSpeed;
attribute float aSide;
attribute float aBright;
uniform float uTime;
uniform float uFlow;
uniform float uMix;
uniform float uSwirl;
uniform float uHot;
uniform float uAlpha;
uniform float uCount;
uniform float uCountP;
uniform float uBase[8];
uniform float uBaseP[8];
uniform vec3 uColor[8];
uniform vec3 uColorP[8];
uniform float uSpin;
uniform float uLoosen;
varying vec3 vColor;
varying float vAlpha;
const float R_NEAR = ${R_NEAR.toFixed(1)};
const float R_FAR = ${R_FAR.toFixed(1)};
const float DEPTH = ${DEPTH.toFixed(1)};
const float TWIST = ${TWIST.toFixed(2)};
const float YSQ = ${YSQ.toFixed(2)};
float radiusAt(float s) {
  float c = clamp(s, 0.0, 1.0);
  return R_NEAR - (R_NEAR - R_FAR) * pow(c, 0.8) - max(0.0, -s) * 14.0;
}
vec3 posAt(float s, float base, float rOff, float aOff) {
  float th = base + s * TWIST + aOff + uSpin;
  float r = radiusAt(s) + rOff * (5.0 + 9.0 * (1.0 - clamp(s, 0.0, 1.0))) * (1.0 + uLoosen * 0.8);
  return vec3(cos(th) * r, sin(th) * r * YSQ, -(2.0 + s * DEPTH));
}
void main() {
  float s = fract(aS0 - uTime * aSpeed * uFlow) * 1.28 - 0.18;
  s -= aSide * (0.010 + 0.012 * uHot);
  float ai = mod(floor(aSeed * 977.0), uCount);
  float aiP = mod(floor(aSeed * 977.0), uCountP);
  float base = 0.0; float baseP = 0.0; vec3 col = vec3(1.0); vec3 colP = vec3(1.0);
  for (int k = 0; k < 8; k++) {
    if (float(k) == ai) { base = uBase[k]; col = uColor[k]; }
    if (float(k) == aiP) { baseP = uBaseP[k]; colP = uColorP[k]; }
  }
  float m = smoothstep(0.0, 1.0, uMix);
  vec3 p = posAt(s, base, aR, aA);
  vec3 pP = posAt(s, baseP + uSwirl * (1.0 - m), aR, aA);
  vec3 pos = mix(pP, p, m);
  vColor = mix(colP, col, m);
  vColor = mix(vColor, vec3(1.0, 0.98, 0.9), uHot * 0.65);
  float edge = smoothstep(-0.18, 0.02, s) * smoothstep(1.1, 0.9, s);
  vAlpha = edge * (0.25 + 0.75 * aBright) * uAlpha * (1.0 + uHot * 0.8);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;
const STREAM_FRAG = `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main() { gl_FragColor = vec4(vColor * vAlpha, vAlpha); }
`;

interface Card {
  id: string;
  m: MomentWithStats;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  tex: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  img: HTMLImageElement | null;
  base: number; tbase: number;
  s: number; ts: number;
  ro: number; tro: number;
  aj: number;
  size: number; tsize: number;
  dim: number; tdim: number;
  inArm: boolean;
  color: string;
  pos: THREE.Vector3;
}
interface Label {
  mesh: THREE.Mesh;
  base: number; s: number;
  mat: THREE.MeshBasicMaterial;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawCard(c: HTMLCanvasElement, m: MomentWithStats, img: HTMLImageElement | null, color: string) {
  const W = c.width, H = c.height;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  roundRect(ctx, 0, 0, W, H, 16);
  ctx.clip();
  if (img && img.naturalWidth) {
    const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#2a2a33");
    g.addColorStop(1, "#0d0d11");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const shade = ctx.createLinearGradient(0, H * 0.45, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.font = "800 24px 'Helvetica Neue', 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 8;
  let title = m.title;
  while (ctx.measureText(title).width > W - 32 && title.length > 2) title = title.slice(0, -2) + "…";
  ctx.fillText(title, 16, H - 14);
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  roundRect(ctx, 2, 2, W - 4, H - 4, 15);
  ctx.stroke();
}
function makeLabelTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.font = "900 108px 'Helvetica Neue', 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  // 発光する下線と、色の帯
  ctx.shadowColor = color;
  ctx.shadowBlur = 40;
  ctx.fillStyle = color;
  ctx.fillRect(112, 196, 800, 10);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "rgba(0,0,0,0.95)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 512, 112);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeWordTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 2048; c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.font = "900 220px 'Helvetica Neue', 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(235,255,0,0.8)";
  ctx.shadowBlur = 80;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 1024, 256);
  ctx.shadowBlur = 30;
  ctx.fillText(text, 1024, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  onHover,
}: {
  moments: MomentWithStats[];
  arms: Interpretation | null;
  pendingText: string | null;
  pulses: Record<string, number>;
  phase: Phase;
  focusId: string | null;
  soundOn: boolean;
  onSelect: (m: MomentWithStats) => void;
  onHover?: (m: MomentWithStats | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const S = useRef<{
    cards: Map<string, Card>;
    setArms?: (a: Interpretation | null, dramatic: boolean) => void;
    setPhase?: (p: Phase) => void;
    setFocus?: (id: string | null) => void;
    setPending?: (t: string | null) => void;
    pulse?: (id: string) => void;
    momentsRef: MomentWithStats[];
    onSelect: (m: MomentWithStats) => void;
    onHover?: (m: MomentWithStats | null) => void;
    soundOn: boolean;
  }>({ cards: new Map(), momentsRef: moments, onSelect, onHover, soundOn });
  S.current.momentsRef = moments;
  S.current.onSelect = onSelect;
  S.current.onHover = onHover;
  S.current.soundOn = soundOn;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const st = S.current;
    const W = () => host.clientWidth;
    const H = () => host.clientHeight;
    const portrait = () => H() > W();
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const params = new URLSearchParams(location.search);
    const maxSubsteps = Math.max(1, Math.min(24, Number(params.get("simsteps")) || 3));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(coarse ? 2 : 1.5, window.devicePixelRatio || 1));
    renderer.setSize(W(), H());
    renderer.autoClear = false;
    renderer.domElement.className = "vs-gl";
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030304);
    const camera = new THREE.PerspectiveCamera(portrait() ? 76 : 62, W() / H(), 0.5, 900);

    // ---- 渦の目: 流体（入口の墨流し）を漏斗の一番奥に置いた板 ----
    const GRID = [8, 5];
    const atlas = document.createElement("canvas");
    atlas.width = 256 * GRID[0];
    atlas.height = 144 * GRID[1];
    const actx = atlas.getContext("2d")!;
    for (let i = 0; i < GRID[0] * GRID[1]; i++) {
      const x = (i % GRID[0]) * 256, y = Math.floor(i / GRID[0]) * 144;
      const g = actx.createLinearGradient(x, y, x + 256, y + 144);
      g.addColorStop(0, `hsl(${(i * 47) % 360} 35% 16%)`);
      g.addColorStop(1, "#08080a");
      actx.fillStyle = g;
      actx.fillRect(x, y, 256, 144);
    }
    const atlasTex = new THREE.CanvasTexture(atlas);
    atlasTex.colorSpace = THREE.SRGBColorSpace;
    let atlasDirty = false;
    [...moments].sort((a, b) => b.votes - a.votes).slice(0, GRID[0] * GRID[1]).forEach((m, i) => {
      const img = new Image();
      img.onload = () => { actx.drawImage(img, (i % GRID[0]) * 256, Math.floor(i / GRID[0]) * 144, 256, 144); atlasDirty = true; };
      img.src = `/api/thumb/${m.youtubeId}`;
    });
    const eyeAspect = 16 / 10;
    const fluid = new FluidSim(renderer, 1600, 1000, coarse ? 128 : 192, coarse ? 512 : 768);
    fluid.params.strength = 0;
    fluid.params.curl = 6;
    fluid.params.pull = 4;
    fluid.params.core = 0.6;
    fluid.params.velDissipation = 0.3;
    fluid.params.dyeDissipation = 0.015;
    fluid.fillMosaic(atlasTex, [GRID[0], GRID[1]], [0.3, 0.16875]);
    const eyeMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uDye;
        uniform float uDim;
        uniform float uBurst;
        void main() {
          vec3 c = texture2D(uDye, vUv).rgb;
          vec2 p = (vUv - 0.5) * vec2(${eyeAspect.toFixed(3)}, 1.0);
          float r = length(p);
          c *= 0.05 + 0.95 * smoothstep(0.98, 0.3, r);
          c *= uDim;
          c = c / (1.0 + c * 0.3);
          c += vec3(1.0, 0.98, 0.9) * uBurst * exp(-r * 3.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
      uniforms: { uDye: { value: fluid.dyeTexture }, uDim: { value: 1 }, uBurst: { value: 0 } },
      depthWrite: true,
    });
    const EYE_H = 340;
    const eye = new THREE.Mesh(new THREE.PlaneGeometry(EYE_H * eyeAspect, EYE_H), eyeMat);
    eye.position.set(0, 0, EYE_Z);
    scene.add(eye);
    const dropInk = (strength: number, radius: number, rMin = 0.1, rMax = 0.4) => {
      const ang = Math.random() * Math.PI * 2;
      const rr = rMin + Math.random() * (rMax - rMin);
      const x = 0.5 + (Math.cos(ang) * rr) / eyeAspect, y = 0.5 + Math.sin(ang) * rr;
      const col = INK_COLORS[Math.floor(Math.random() * INK_COLORS.length)];
      fluid.splat(x, y, -Math.sin(ang) * strength, Math.cos(ang) * strength, col, radius);
    };

    // ---- 渦の粒子（光の筋）----
    const NP = coarse ? 30000 : 80000;
    const seed = new Float32Array(NP * 2), s0 = new Float32Array(NP * 2), rr = new Float32Array(NP * 2), aa = new Float32Array(NP * 2);
    const sp = new Float32Array(NP * 2), side = new Float32Array(NP * 2), br = new Float32Array(NP * 2);
    for (let i = 0; i < NP; i++) {
      const v = [Math.random(), Math.random(), (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.9, 0.55 + Math.random() * 0.9, Math.random()];
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        seed[j] = v[0]; s0[j] = v[1]; rr[j] = v[2] * Math.abs(v[2]); aa[j] = v[3]; sp[j] = v[4]; side[j] = k; br[j] = v[5];
      }
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NP * 2 * 3), 3));
    sgeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    sgeo.setAttribute("aS0", new THREE.BufferAttribute(s0, 1));
    sgeo.setAttribute("aR", new THREE.BufferAttribute(rr, 1));
    sgeo.setAttribute("aA", new THREE.BufferAttribute(aa, 1));
    sgeo.setAttribute("aSpeed", new THREE.BufferAttribute(sp, 1));
    sgeo.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    sgeo.setAttribute("aBright", new THREE.BufferAttribute(br, 1));
    sgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -80), 400);
    const armBase = new Array(MAX_ARMS).fill(0);
    const armBaseP = new Array(MAX_ARMS).fill(0);
    const armColor = Array.from({ length: MAX_ARMS }, () => new THREE.Color(0.5, 0.5, 0.5));
    const armColorP = Array.from({ length: MAX_ARMS }, () => new THREE.Color(0.5, 0.5, 0.5));
    const smat = new THREE.ShaderMaterial({
      vertexShader: STREAM_VERT,
      fragmentShader: STREAM_FRAG,
      uniforms: {
        uTime: { value: 0 }, uFlow: { value: 0.05 }, uMix: { value: 1 }, uSwirl: { value: 0 }, uHot: { value: 0 }, uAlpha: { value: 0.35 },
        uCount: { value: 1 }, uCountP: { value: 1 }, uBase: { value: armBase }, uBaseP: { value: armBaseP },
        uColor: { value: armColor }, uColorP: { value: armColorP }, uSpin: { value: 0 }, uLoosen: { value: 0 },
      },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.LineSegments(sgeo, smat));

    // ---- 爆発（サンプルの explosion particles）----
    const EXN = 2000;
    const exPos = new Float32Array(EXN * 3), exVel = new Float32Array(EXN * 3);
    const exGeo = new THREE.BufferGeometry();
    exGeo.setAttribute("position", new THREE.BufferAttribute(exPos, 3).setUsage(THREE.DynamicDrawUsage));
    const dotCanvas = document.createElement("canvas");
    dotCanvas.width = 64; dotCanvas.height = 64;
    const dctx = dotCanvas.getContext("2d")!;
    const dg = dctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    dg.addColorStop(0, "rgba(255,255,255,1)");
    dg.addColorStop(0.35, "rgba(255,255,255,0.6)");
    dg.addColorStop(1, "rgba(255,255,255,0)");
    dctx.fillStyle = dg;
    dctx.fillRect(0, 0, 64, 64);
    const exMat = new THREE.PointsMaterial({ color: 0xebff00, size: 2.2, map: new THREE.CanvasTexture(dotCanvas), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const explosion = new THREE.Points(exGeo, exMat);
    explosion.frustumCulled = false;
    scene.add(explosion);
    let exAge = 99;
    const explode = (p: THREE.Vector3, color: THREE.ColorRepresentation) => {
      for (let i = 0; i < EXN; i++) {
        exPos.set([p.x, p.y, p.z], i * 3);
        const sp = 8 + Math.random() * 30, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        exVel.set([sp * Math.sin(ph) * Math.cos(th), sp * Math.sin(ph) * Math.sin(th), sp * Math.cos(ph)], i * 3);
      }
      exMat.color.set(color);
      exAge = 0;
    };
    const flash = (a: number) => {
      const f = flashRef.current;
      if (!f) return;
      f.style.transition = "none";
      f.style.opacity = String(a);
      requestAnimationFrame(() => { f.style.transition = "opacity 0.9s ease"; f.style.opacity = "0"; });
    };

    // ---- カード（WebGLの板）----
    const cards = st.cards;
    cards.clear();
    const cardGeo = new THREE.PlaneGeometry(1, 9 / 16);
    const cardGroup = new THREE.Group();
    scene.add(cardGroup);
    moments.forEach((m, i) => {
      const canvas = document.createElement("canvas");
      canvas.width = 384; canvas.height = 216;
      drawCard(canvas, m, null, "#666");
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(cardGeo, mat);
      mesh.userData.id = m.id;
      cardGroup.add(mesh);
      const c: Card = {
        id: m.id, m, mesh, mat, tex, canvas, img: null,
        base: hash(m.id) * Math.PI * 2, tbase: 0, s: 1.05, ts: 1.05, ro: 0, tro: 0, aj: (hash(m.id, 11) - 0.5) * 0.36,
        size: 1, tsize: 1, dim: 0, tdim: 0, inArm: false, color: "#666", pos: new THREE.Vector3(),
      };
      c.tbase = c.base;
      const img = new Image();
      img.onload = () => { c.img = img; drawCard(canvas, m, img, c.color); tex.needsUpdate = true; };
      img.src = `/api/thumb/${m.youtubeId}`;
      cards.set(m.id, c);
      void i;
    });

    // ---- ラベル（腕の名前。流れに沿って傾く板）----
    let labels: Label[] = [];
    // 言葉（解釈中）
    let wordMesh: THREE.Mesh | null = null;
    let wordAlpha = 0, wordTarget = 0;

    // ---- 状態 ----
    let phaseNow: Phase = phase;
    let spin = 0, spinBoost = 0, dragSpin = 0, dragVel = 0;
    let hoverId: string | null = null;
    let dragMoved = 0;
    let dolly = 44, dollyTarget = 44;
    let burst = 0;
    let flow = 0.05, flowTarget = 0.05;
    let hot = 0, hotTarget = 0;
    let loosen = 0, loosenTarget = 0;
    let mix = 1, swirl = 0;
    let photo = 1, photoTarget = 1;
    let pendingNow: string | null = null;
    let flyingTo: Card | null = null;
    let t0 = performance.now(), last = t0;
    let inkTimer = 0;
    const parallax = new THREE.Vector2(), parallaxTarget = new THREE.Vector2();
    const camLook = new THREE.Vector3(0, 0, EYE_Z);
    let camTween: { from: THREE.Vector3; to: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3; t0: number; dur: number; then?: () => void } | null = null;
    let camFree = true;
    let currentArms: Interpretation | null = null;
    let homeZ = 44;
    camera.position.set(0, 4, 96);

    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
    const mat4 = new THREE.Matrix4();
    const posOf = (base: number, s: number, ro: number, aj: number, spinAll: number, out: THREE.Vector3) => {
      const th = base + s * TWIST + aj + spinAll;
      const r = radiusAt(s) + ro;
      return out.set(Math.cos(th) * r, Math.sin(th) * r * YSQ, depthAt(s));
    };
    const orient = (mesh: THREE.Object3D, pos: THREE.Vector3, base: number, s: number, ro: number, aj: number, spinAll: number, faceMix: number) => {
      posOf(base, s - 0.02, ro, aj, spinAll, tmp2);
      const T = tmp2.sub(pos).normalize();
      const toCam = tmp.subVectors(camera.position, pos).normalize();
      const th = base + s * TWIST + aj + spinAll;
      const outward = tmp3.set(Math.cos(th) * 0.7, Math.sin(th) * 0.7, 0.75).normalize();
      const normal = outward.multiplyScalar(1 - faceMix).add(toCam.multiplyScalar(faceMix)).normalize();
      const right = T.sub(normal.clone().multiplyScalar(T.dot(normal))).normalize();
      const up = new THREE.Vector3().crossVectors(normal, right);
      if (up.y < 0) { up.negate(); right.negate(); }
      mat4.makeBasis(right, up, normal);
      mesh.quaternion.setFromRotationMatrix(mat4);
    };

    // ---- 腕の割当 ----
    const applyArms = (a: Interpretation | null, dramatic: boolean) => {
      currentArms = a;
      const maxVotes = Math.max(1, ...st.momentsRef.map((m) => m.votes));
      const votesOf = (id: string) => (st.momentsRef.find((m) => m.id === id)?.votes ?? 0) / maxVotes;
      for (const l of labels) { scene.remove(l.mesh); l.mat.map?.dispose(); l.mat.dispose(); }
      labels = [];
      // 粒子: 今の腕を「前」に退避し、新しい腕へ mix で流れ直す
      for (let k = 0; k < MAX_ARMS; k++) { armBaseP[k] = armBase[k]; armColorP[k].copy(armColor[k]); }
      smat.uniforms.uCountP.value = smat.uniforms.uCount.value;
      const A = a ? a.arms.length : 1;
      smat.uniforms.uCount.value = A;
      const inArm = new Set<string>();
      if (a) {
        a.arms.forEach((arm, ai) => {
          const base = (ai / A) * Math.PI * 2;
          armBase[ai] = base;
          armColor[ai].set(arm.color);
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
            if (c.color !== arm.color) { c.color = arm.color; drawCard(c.canvas, c.m, c.img, arm.color); c.tex.needsUpdate = true; }
            if (dramatic) c.base -= Math.PI * 0.9;
          });
          const lmat = new THREE.MeshBasicMaterial({ map: makeLabelTexture(arm.name, arm.color), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
          const lmesh = new THREE.Mesh(new THREE.PlaneGeometry(28, 7), lmat);
          scene.add(lmesh);
          labels.push({ mesh: lmesh, base, s: 0.3, mat: lmat });
        });
      }
      for (const c of Array.from(cards.values())) {
        c.inArm = inArm.has(c.id);
        if (!c.inArm) {
          c.tbase = hash(c.id, 3) * Math.PI * 2;
          c.ts = 0.55 + hash(c.id, 9) * 0.5;
          c.tro = 34 + hash(c.id, 4) * 20;
          c.tsize = 6.5;
          c.tdim = a && a.text ? 0.3 : 0.6;
          if (dramatic) c.base -= Math.PI * 0.5;
        }
      }
      if (dramatic) {
        mix = 0;
        swirl = Math.PI * 0.9;
        spinBoost = 1.2;
        burst = 0.9;
        hot = 1.2;
        flow = 0.4;
        loosenTarget = 0;
        wordTarget = 0;
        flash(0.55);
        explode(new THREE.Vector3(0, 0, -60), a ? a.arms[0].color : 0xebff00);
        for (let k = 0; k < 3; k++) dropInk(130, 0.0009, 0.12, 0.4);
        // 一番熱い腕へ飛び込む（サンプルの focusOnStar）
        if (a) {
          const target = posOf(armBase[0], 0.42, 0, 0, spin + dragSpin, new THREE.Vector3());
          const from = posOf(armBase[0], 0.02, -14, 0, spin + dragSpin, new THREE.Vector3());
          from.z += 6;
          camFree = false;
          camTween = { from: camera.position.clone(), to: from, lookFrom: camLook.clone(), lookTo: target, t0: performance.now(), dur: 2000, then: () => {
            // 目へ視線を戻しながら基準位置へ
            camTween = { from: camera.position.clone(), to: new THREE.Vector3(0, 4, homeZ), lookFrom: camLook.clone(), lookTo: new THREE.Vector3(0, 0, EYE_Z), t0: performance.now(), dur: 2600, then: () => { camFree = true; } };
          } };
        }
      } else if (mix >= 1) {
        for (let k = 0; k < MAX_ARMS; k++) { armBaseP[k] = armBase[k]; armColorP[k].copy(armColor[k]); }
        smat.uniforms.uCountP.value = A;
      }
    };
    st.setArms = applyArms;

    const setPhase = (p: Phase) => {
      if (p === phaseNow) return;
      phaseNow = p;
      if (p === "space") {
        // 入場: 渦の目へ飛び込む。写真は溶け、カードが腕の流れに乗って周りに現れる
        flash(0.7);
        photoTarget = 0;
        spinBoost = 0.8;
        hot = 0.6;
        for (const c of Array.from(cards.values())) { c.s = 1.06; c.size = 1; }
        applyArms(currentArms, false);
        camFree = false;
        camTween = { from: camera.position.clone(), to: new THREE.Vector3(0, 4, homeZ), lookFrom: camLook.clone(), lookTo: new THREE.Vector3(0, 0, EYE_Z), t0: performance.now(), dur: 2800, then: () => { camFree = true; } };
        for (let k = 0; k < 10; k++) dropInk(120, 0.0012, 0.1, 0.5);
      }
    };
    st.setPhase = setPhase;

    const setPending = (text: string | null) => {
      pendingNow = text;
      if (text) {
        if (wordMesh) { scene.remove(wordMesh); (wordMesh.material as THREE.MeshBasicMaterial).map?.dispose(); }
        const wm = new THREE.MeshBasicMaterial({ map: makeWordTexture(text), transparent: true, depthWrite: false, opacity: 0 });
        wordMesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 16), wm);
        wordMesh.position.set(0, 0, -95);
        scene.add(wordMesh);
        wordTarget = 1;
        hotTarget = 1;
        flowTarget = 0.22;
        loosenTarget = 1;
      } else {
        hotTarget = 0;
        flowTarget = 0.05;
        loosenTarget = 0;
      }
    };
    st.setPending = setPending;

    const flyTo = (c: Card, then?: () => void) => {
      flyingTo = c;
      const p = c.pos.clone();
      const dir = new THREE.Vector3().subVectors(camera.position, p).normalize();
      const to = p.clone().add(dir.multiplyScalar(c.size * (portrait() ? 1.25 : 1.0)));
      camFree = false;
      flash(0.3);
      explode(p, c.color);
      camTween = { from: camera.position.clone(), to, lookFrom: camLook.clone(), lookTo: p, t0: performance.now(), dur: 1400, then };
      getCrowd().swell(0.5);
    };
    const setFocus = (id: string | null) => {
      if (id) {
        const c = cards.get(id);
        if (c && flyingTo !== c) flyTo(c);
      } else if (!camFree) {
        flyingTo = null;
        camTween = { from: camera.position.clone(), to: new THREE.Vector3(0, 4, dolly), lookFrom: camLook.clone(), lookTo: new THREE.Vector3(0, 0, EYE_Z), t0: performance.now(), dur: 1200, then: () => { camFree = true; } };
      }
    };
    st.setFocus = setFocus;
    st.pulse = (id: string) => {
      const c = cards.get(id);
      if (!c) return;
      c.mat.color.setScalar(1.8);
      setTimeout(() => c.mat.color.setScalar(1), 900);
    };

    // ---- 入力 ----
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false, lastX = 0, lastY = 0;
    let rayTimer = 0;
    const pick = (x: number, y: number): Card | null => {
      pointer.set((x / W()) * 2 - 1, -(y / H()) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(cardGroup.children, false);
      for (const h of hits) {
        const c = cards.get(h.object.userData.id as string);
        if (c && c.dim > 0.35 && c.s > -0.05) return c;
      }
      return null;
    };
    // 検証用: 画面上で最も大きく見えているカードの位置
    (window as unknown as { __vs?: unknown }).__vs = {
      bestCard: () => {
        let best: { x: number; y: number; id: string; a: number } | null = null;
        for (const c of Array.from(cards.values())) {
          if (c.dim < 0.5 || c.s < 0.02) continue;
          const v = c.pos.clone().project(camera);
          if (v.z > 1 || Math.abs(v.x) > 0.8 || Math.abs(v.y) > 0.7) continue;
          const a = c.size / c.pos.distanceTo(camera.position);
          if (!best || a > best.a) best = { x: ((v.x + 1) / 2) * W(), y: ((1 - v.y) / 2) * H(), id: c.id, a };
        }
        return best;
      },
    };
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; dragMoved = 0; };
    const onMove = (e: PointerEvent) => {
      parallaxTarget.set((e.clientX / W()) * 2 - 1, (e.clientY / H()) * 2 - 1);
      if (dragging) {
        const dx = e.clientX - lastX;
        lastX = e.clientX; lastY = e.clientY;
        dragMoved += Math.abs(dx);
        dragVel = dx * 0.004;
        dragSpin += dragVel;
        return;
      }
      if (e.pointerType === "mouse" && performance.now() - rayTimer > 40 && phaseNow === "space") {
        rayTimer = performance.now();
        const c = pick(e.clientX, e.clientY);
        const id = c ? c.id : null;
        if (id !== hoverId) { hoverId = id; st.onHover?.(c ? c.m : null); renderer.domElement.style.cursor = c ? "pointer" : "grab"; }
      }
    };
    const onUp = (e: PointerEvent) => {
      const wasDrag = dragMoved > 6;
      dragging = false;
      if (wasDrag || phaseNow !== "space" || flyingTo) return;
      const c = pick(e.clientX, e.clientY);
      if (c) flyTo(c, () => st.onSelect(c.m));
    };
    const onWheel = (e: WheelEvent) => { dollyTarget = Math.max(6, Math.min(80, dollyTarget + e.deltaY * 0.04)); };
    host.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("wheel", onWheel, { passive: true });
    const onResize = () => {
      camera.aspect = W() / H();
      camera.fov = portrait() ? 76 : 62;
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
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

      dragVel *= Math.exp(-dt / 0.6);
      if (!dragging) dragSpin += dragVel;
      spinBoost = damp(spinBoost, 0, dt, 1.4);
      spin += dt * (0.035 + spinBoost * 0.6);
      const spinAll = spin + dragSpin;
      flow = damp(flow, flowTarget, dt, 1.0);
      hot = damp(hot, hotTarget, dt, 0.8);
      loosen = damp(loosen, loosenTarget, dt, 0.7);
      mix = Math.min(1, mix + dt / 1.7);
      burst = damp(burst, 0, dt, 0.5);

      // 渦の目（流体）
      let strength: number;
      if (phaseNow === "entry") { const e = Math.min(1, t / 9); strength = 115 * Math.pow(e, 1.5) + 10 * Math.sin(t * 0.5) * e; }
      else strength = 55 + 110 * loosen + spinBoost * 80;
      fluid.params.strength = strength;
      fluid.params.pull = 3 + loosen * 6;
      fluid.params.dyeDissipation = photoTarget === 0 && photo > 0.05 ? 1.6 : 0.015;
      photo = damp(photo, photoTarget, dt, 0.5);
      let acc = Math.min(dt, maxSubsteps / 60);
      while (acc > 1e-4) { const h = Math.min(acc, 1 / 60); fluid.step(h); acc -= h; }
      const inkEvery = phaseNow === "entry" ? 0.7 : loosen > 0.5 ? 0.1 : 0.45;
      if (t > 2.5 && now - inkTimer > inkEvery * 1000) {
        inkTimer = now;
        if (phaseNow === "entry") dropInk(70, 0.0004, 0.08, 0.3); else dropInk(140 + loosen * 120, 0.0008, 0.1, 0.45);
      }
      eyeMat.uniforms.uDye.value = fluid.dyeTexture;
      eyeMat.uniforms.uBurst.value = burst;
      eyeMat.uniforms.uDim.value = phaseNow === "entry" ? 1 : 0.9 + 0.5 * hot;
      if (atlasDirty) { atlasTex.needsUpdate = true; atlasDirty = false; if (t < 6 && phaseNow === "entry") fluid.fillMosaic(atlasTex, [GRID[0], GRID[1]], [0.3, 0.16875]); }
      eye.rotation.z = spinAll * 0.15;

      // 粒子
      smat.uniforms.uTime.value = t;
      smat.uniforms.uFlow.value = flow;
      smat.uniforms.uMix.value = mix;
      smat.uniforms.uSwirl.value = swirl;
      smat.uniforms.uHot.value = hot;
      smat.uniforms.uSpin.value = spinAll;
      smat.uniforms.uLoosen.value = loosen;
      smat.uniforms.uAlpha.value = phaseNow === "entry" ? 0.12 : 0.55;

      // 爆発
      if (exAge < 2.5) {
        exAge += dt;
        for (let i = 0; i < EXN; i++) {
          exPos[i * 3] += exVel[i * 3] * dt; exPos[i * 3 + 1] += exVel[i * 3 + 1] * dt; exPos[i * 3 + 2] += exVel[i * 3 + 2] * dt;
          exVel[i * 3] *= 0.985; exVel[i * 3 + 1] *= 0.985; exVel[i * 3 + 2] *= 0.985;
        }
        exGeo.attributes.position.needsUpdate = true;
        exMat.opacity = Math.max(0, 0.9 * (1 - exAge / 2.5));
      }

      // カメラ
      parallax.lerp(parallaxTarget, 1 - Math.exp(-dt / 0.45));
      dolly = damp(dolly, dollyTarget, dt, 0.9);
      if (camTween) {
        const k = Math.min(1, (now - camTween.t0) / camTween.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // Quadratic in-out（サンプルと同じ）
        if (flyingTo) {
          camTween.lookTo.copy(flyingTo.pos);
          camDir.subVectors(camTween.from, flyingTo.pos).normalize();
          camTween.to.copy(flyingTo.pos).add(camDir.multiplyScalar(flyingTo.size * (portrait() ? 1.25 : 1.0)));
        }
        camera.position.lerpVectors(camTween.from, camTween.to, e);
        camLook.lerpVectors(camTween.lookFrom, camTween.lookTo, e);
        if (k >= 1) { const th = camTween.then; camTween = null; th?.(); }
      } else if (camFree) {
        if (phaseNow === "entry") {
          camera.position.set(Math.sin(t * 0.15) * 4 + parallax.x * 10, 4 + Math.sin(t * 0.11) * 2 - parallax.y * 6, 96 - Math.min(14, t * 1.0));
          camLook.set(parallax.x * 30, -parallax.y * 20, EYE_Z);
        } else {
          // 常に前へ進みながら漂う。カーソルで視線が大きく振れる
          camera.position.set(Math.sin(t * 0.12) * 5 + parallax.x * 9, 4 + Math.sin(t * 0.1) * 2.5 - parallax.y * 6, dolly);
          camLook.set(parallax.x * 46, -parallax.y * 30, EYE_Z + 60);
        }
      }
      camera.lookAt(camLook);

      // カード
      const cam = camera.position;
      const flying = flyingTo;
      for (const c of Array.from(cards.values())) {
        if (phaseNow === "space" && c.inArm && c !== flying) {
          c.ts -= dt * flow * 0.4;
          if (c.ts < S_MIN) { c.ts += S_MAX - S_MIN; c.s = c.ts; c.size = 1; }
        }
        c.base = damp(c.base, c.tbase, dt, 1.1);
        c.s = damp(c.s, c.ts, dt, 1.0);
        c.ro = damp(c.ro, c.tro + loosen * 16 * (c.inArm ? 1 : 0), dt, 0.9);
        const hovered = hoverId === c.id;
        const sizeS = c.inArm ? 1.9 - 1.1 * Math.max(0, Math.min(1, c.s)) : 1;
        c.size = damp(c.size, c.tsize * sizeS * (hovered ? 1.2 : 1), dt, 0.25);
        c.dim = damp(c.dim, phaseNow === "entry" ? 0 : c.tdim, dt, 0.6);
        posOf(c.base, c.s, c.ro, c.aj, spinAll, c.pos);
        c.pos.y += Math.sin(t * 0.8 + c.base * 3) * 0.5;
        c.mesh.position.copy(c.pos);
        orient(c.mesh, c.pos, c.base, c.s, c.ro, c.aj, spinAll, c === flying ? 1 : c.inArm ? 0.6 : 0.4);
        c.mesh.scale.setScalar(c.size);
        const dist = c.pos.distanceTo(cam);
        const fog = Math.max(0.2, Math.min(1, 1 - (dist - 30) / 170));
        const b = (0.3 + 0.7 * fog) * (c.inArm ? 1 : 0.7);
        if (c.mat.color.r <= 1.01) c.mat.color.setScalar(b);
        c.mat.opacity = c.dim;
        c.mesh.visible = c.dim > 0.02;
      }
      for (const l of labels) {
        posOf(l.base, l.s, 12, 0.3, spinAll, l.mesh.position);
        orient(l.mesh, l.mesh.position, l.base, l.s, 12, 0.3, spinAll, 0.75);
        l.mat.opacity = damp(l.mat.opacity, phaseNow === "entry" || pendingNow ? 0 : 0.95, dt, 0.6);
      }
      if (wordMesh) {
        wordAlpha = damp(wordAlpha, wordTarget, dt, 0.4);
        (wordMesh.material as THREE.MeshBasicMaterial).opacity = wordAlpha;
        wordMesh.lookAt(cam);
        const sc = 1 + 0.04 * Math.sin(t * 2.2);
        wordMesh.scale.setScalar(sc);
        if (wordAlpha < 0.01 && wordTarget === 0) { scene.remove(wordMesh); wordMesh = null; }
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

      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("wheel", onWheel);
      fluid.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      st.setArms = undefined; st.setPhase = undefined; st.setFocus = undefined; st.setPending = undefined; st.pulse = undefined;
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
  useEffect(() => { for (const id of Object.keys(pulses)) S.current.pulse?.(id); }, [pulses]);
  useEffect(() => {
    for (const m of moments) { const c = S.current.cards.get(m.id); if (c) c.m = m; }
  }, [moments]);

  return (
    <div className={`vs${phase === "entry" ? " entry" : ""}`} ref={hostRef}>
      <div className="vs-flash" ref={flashRef} />
    </div>
  );
}

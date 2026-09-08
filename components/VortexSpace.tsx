"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getCrowd } from "@/lib/crowd";
import { sfx } from "@/lib/sfx";
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
const DIVE_MS = 2600; // 入場の吸い込みの長さ
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
uniform float uFocus; // ツアー中の腕（-1=無し）
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
  float focusK = uFocus < 0.0 ? 1.0 : (abs(ai - uFocus) < 0.5 ? 1.7 : 0.25);
  vAlpha = edge * (0.25 + 0.75 * aBright) * uAlpha * (1.0 + uHot * 0.8) * focusK;
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
  stage: boolean; // ツアー中: 壁からカメラの前の舞台へ出てくる
}
interface Label {
  mesh: THREE.Mesh;
  base: number; s: number;
  mat: THREE.MeshBasicMaterial;
  arm: number;
  pos: THREE.Vector3; // 現在位置（中央での登場→腕の位置へ滑る）
  centerAt: number; // 中央に立てている間の位置（reveal中）
  born: number;
  stamped?: boolean;
}
export interface VortexApi {
  tourNext: () => void;
  tourPrev: () => void;
  endTour: () => void;
  resetView: () => void;
}
export interface TourState {
  armName: string;
  color: string;
  index: number;
  total: number;
  moment: MomentWithStats;
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
// 腕のラベル: 蛍光マーカーで走り書きしたような帯。腕の色そのもの、勢いのある斜めのストローク、上に黒の太字
function makeLabelTexture(text: string, color: string, count: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 320;
  const ctx = c.getContext("2d")!;
  ctx.font = "900 112px 'Helvetica Neue', 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  const tw = Math.min(880, ctx.measureText(text).width + 90);
  const x0 = 512 - tw / 2;
  ctx.save();
  ctx.translate(512, 165);
  ctx.rotate(-0.045);
  ctx.translate(-512, -165);
  // マーカーのストローク（3本重ね、端がガサつく）
  const stroke = (y: number, h: number, alpha: number, wob: number) => {
    ctx.beginPath();
    ctx.moveTo(x0 - 14, y);
    for (let x = x0 - 14; x <= x0 + tw + 14; x += 40) ctx.lineTo(x, y + (Math.sin(x * 0.13) + Math.cos(x * 0.031)) * wob);
    ctx.lineTo(x0 + tw + 14, y + h);
    for (let x = x0 + tw + 14; x >= x0 - 14; x -= 40) ctx.lineTo(x, y + h + (Math.cos(x * 0.11) + Math.sin(x * 0.027)) * wob);
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill();
  };
  stroke(92, 150, 0.55, 5);
  stroke(104, 132, 0.75, 4);
  stroke(112, 118, 0.95, 3);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#08080a";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, 512, 170);
  ctx.restore();
  ctx.font = "800 34px 'Helvetica Neue', 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 10;
  ctx.fillText(`${count} MOMENTS  ▶`, x0 + tw + 8, 268);
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
  onTour,
  onViewDirty,
  api,
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
  onTour?: (t: TourState | null) => void;
  onViewDirty?: (dirty: boolean) => void;
  api?: React.MutableRefObject<VortexApi | null>;
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
    onTour?: (t: TourState | null) => void;
    onViewDirty?: (d: boolean) => void;
    soundOn: boolean;
  }>({ cards: new Map(), momentsRef: moments, onSelect, onHover, onTour, onViewDirty, soundOn });
  S.current.momentsRef = moments;
  S.current.onSelect = onSelect;
  S.current.onHover = onHover;
  S.current.onTour = onTour;
  S.current.onViewDirty = onViewDirty;
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
    const maxSubsteps = Math.max(1, Math.min(24, Number(params.get("simsteps")) || 2));
    const testSim = params.has("simsteps"); // 検証環境: 空間フェーズでも実時間分を substep で回す
    // 画質ティア（0=最高〜3=最軽量）。?quality=N で固定、無指定は実測フレーム時間で自動調整（下げるのは早く、上げるのは慎重に）
    const qualityParam = params.get("quality");
    let tier = qualityParam !== null ? Math.max(0, Math.min(3, Number(qualityParam) || 0)) : 0;
    const autoQuality = qualityParam === null;
    let frameMs = 16, tierAt = 0, frameNo = 0, fluidAcc = 0;
    const diveMs = Number(params.get("dive")) || DIVE_MS; // 検証環境では長くして各段階を撮る
    const dtMax = Math.max(0.02, Math.min(0.6, Number(params.get("dtmax")) || 0.05)); // 検証環境（低fps）では大きくして実時間に追従させる

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(coarse ? 2 : 1.5, window.devicePixelRatio || 1));
    renderer.setSize(W(), H());
    renderer.autoClear = false;
    renderer.domElement.className = "vs-gl";
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030304);
    const camera = new THREE.PerspectiveCamera(portrait() ? 76 : 62, W() / H(), 0.5, 900);
    scene.add(camera);
    // ツアー中: 主役以外の全部に透過黒を被せる（主役カードは renderOrder 10 / depthTest off でこの上に描かれる）
    const dimMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const dimQuad = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), dimMat);
    dimQuad.position.z = -3;
    dimQuad.renderOrder = 5;
    dimQuad.frustumCulled = false;
    dimQuad.visible = false;
    camera.add(dimQuad);

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
        uniform float uZoom;
        uniform float uRot;
        void main() {
          // 回転は板ではなくテクスチャ側で行う（16:10の板を回すと角が見える）。吸い込みでは中心へ拡大
          vec2 q = (vUv - 0.5) * 2.0; // 板は2倍の大きさ（ロール・広角でも角が見えない）。q は元の板の中心座標
          q.x *= ${eyeAspect.toFixed(3)};
          float cs = cos(uRot), sn = sin(uRot);
          q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
          q.x /= ${eyeAspect.toFixed(3)};
          vec2 uv = q / uZoom + 0.5;
          vec3 c = texture2D(uDye, uv).rgb;
          vec2 p = (uv - 0.5) * vec2(${eyeAspect.toFixed(3)}, 1.0);
          float r = length(p);
          c *= 0.05 + 0.95 * smoothstep(0.98, 0.3, r);
          c *= 1.0 - smoothstep(0.98, 1.06, r); // 板の外側（テクスチャの外）は完全な黒
          c *= uDim;
          c = c / (1.0 + c * 0.55);
          c += vec3(1.0, 0.98, 0.9) * uBurst * exp(-r * 3.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
      uniforms: { uDye: { value: fluid.dyeTexture }, uDim: { value: 1 }, uBurst: { value: 0 }, uZoom: { value: 1 }, uRot: { value: 0 } },
      depthWrite: true,
    });
    const EYE_H = 340;
    const eye = new THREE.Mesh(new THREE.PlaneGeometry(EYE_H * eyeAspect * 2, EYE_H * 2), eyeMat);
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
        uColor: { value: armColor }, uColorP: { value: armColorP }, uSpin: { value: 0 }, uLoosen: { value: 0 }, uFocus: { value: -1 },
      },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.LineSegments(sgeo, smat));

    // ---- 太い光の帯（リファレンスの液体状のリボン）: 漏斗の壁に沿って腕ごとに10本 ----
    const stripe = document.createElement("canvas");
    stripe.width = 512; stripe.height = 64;
    const sctx = stripe.getContext("2d")!;
    const sImg = sctx.createImageData(512, 64);
    for (let y = 0; y < 64; y++) {
      const prof = Math.pow(Math.sin((y / 63) * Math.PI), 1.3);
      for (let x = 0; x < 512; x++) {
        const u = x / 512;
        const flowA = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 2.0)) * (0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 5.0 + 1.3));
        const a = Math.max(0, Math.min(255, prof * flowA * 255));
        const k = (y * 512 + x) * 4;
        sImg.data[k] = 255; sImg.data[k + 1] = 255; sImg.data[k + 2] = 255; sImg.data[k + 3] = a;
      }
    }
    sctx.putImageData(sImg, 0, 0);
    const stripeTex = new THREE.CanvasTexture(stripe);
    stripeTex.wrapS = THREE.RepeatWrapping;
    stripeTex.repeat.set(2, 1);
    const ribbonGroup = new THREE.Group();
    ribbonGroup.scale.y = YSQ;
    scene.add(ribbonGroup);
    let ribbons: THREE.Mesh[] = [];
    let oldRibbons: THREE.Mesh[] = [];
    const ribbonGeometry = (pts: THREE.Vector3[], halfW: number): THREE.BufferGeometry => {
      const n = pts.length;
      const pos = new Float32Array(n * 2 * 3);
      const uv = new Float32Array(n * 2 * 2);
      const idx: number[] = [];
      const sideV = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        sideV.set(p.x, p.y, 0).normalize().multiplyScalar(halfW);
        pos.set([p.x - sideV.x, p.y - sideV.y, p.z, p.x + sideV.x, p.y + sideV.y, p.z], i * 6);
        uv.set([i / (n - 1), 0, i / (n - 1), 1], i * 4);
        if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      return g;
    };
    const buildRibbons = (a: Interpretation) => {
      for (const r of oldRibbons) { ribbonGroup.remove(r); r.geometry.dispose(); (r.material as THREE.Material).dispose(); }
      oldRibbons = ribbons;
      for (const r of oldRibbons) r.userData.targetOpacity = 0;
      ribbons = [];
      const A = a.arms.length;
      a.arms.forEach((arm, ai) => {
        const base = (ai / A) * Math.PI * 2;
        for (let b = 0; b < 10; b++) {
          const off = (b - 4.5) * 0.09 + (hash(arm.name, 40 + b) - 0.5) * 0.06;
          const roff = 2 + (hash(arm.name, b) - 0.5) * 10;
          const pts: THREE.Vector3[] = [];
          const N = 70;
          for (let q = 0; q <= N; q++) {
            const ss = -0.2 + (q / N) * 1.45;
            const th = base + ss * TWIST + off + Math.sin(ss * 6 + b) * 0.05;
            const rr = radiusAt(ss) + roff;
            pts.push(new THREE.Vector3(Math.cos(th) * rr, Math.sin(th) * rr, depthAt(ss) + (b - 4.5) * 0.8));
          }
          const width = 0.9 + hash(arm.name, 20 + b) * 2.6;
          const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(arm.color), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
            depthWrite: false, alphaMap: stripeTex, side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(ribbonGeometry(pts, width), mat);
          mesh.userData.targetOpacity = 0.3 + hash(arm.name, 60 + b) * 0.35;
          mesh.userData.arm = ai;
          mesh.userData.b = b;
          mesh.visible = tier < 3 || b % 2 === 0;
          mesh.frustumCulled = false;
          ribbonGroup.add(mesh);
          ribbons.push(mesh);
        }
      });
    };

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
        size: 1, tsize: 1, dim: 0, tdim: 0, inArm: false, color: "#666", pos: new THREE.Vector3(), stage: false,
      };
      c.tbase = c.base;
      const img = new Image();
      img.onload = () => { c.img = img; drawCard(canvas, m, img, c.color); tex.needsUpdate = true; };
      img.src = `/api/thumb/${m.youtubeId}`;
      cards.set(m.id, c);
      void i;
    });
    const cardList = Array.from(cards.values()); // 毎フレーム Array.from で配列を作らない


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
    let dolly = 30, dollyTarget = 30;
    let burst = 0;
    let flow = 0.05, flowTarget = 0.05;
    let hot = 0, hotTarget = 0;
    let loosen = 0, loosenTarget = 0;
    let mix = 1, swirl = 0;
    let photo = 1, photoTarget = 1;
    let diving = false, diveT0 = 0, diveRoll = 0, eyeSpin = 0; // 入場の吸い込み
    let pendingNow: string | null = null;
    let flyingTo: Card | null = null;
    let t0 = performance.now(), last = t0;
    let inkTimer = 0;
    const parallax = new THREE.Vector2(), parallaxTarget = new THREE.Vector2();
    const camLook = new THREE.Vector3(0, 0, EYE_Z);
    let camTween: { from: THREE.Vector3; to: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3; t0: number; dur: number; then?: () => void } | null = null;
    let camFree = true;
    let currentArms: Interpretation | null = null;
    let homeZ = 30;
    const HOME_Y = -24;
    const LOOK_Y = 14;
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
    const REVEAL_MS = 2600;
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;
    const applyArms = (a: Interpretation | null, dramatic: boolean) => {
      currentArms = a;
      if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null; }
      endTour();
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
      if (a && !dramatic) buildRibbons(a);
      const pendingTargets: { c: Card; base: number; s: number; ro: number; size: number }[] = [];
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
            const s = 0.04 + 0.72 * Math.min(1, (k + 0.5) / Math.max(n, 7)); // 目の奥には置かない（山にならない）
            const sc = a.text ? 0.55 + 0.65 * (a.scores[id] ?? 0.5) : 0.75 + 0.45 * votesOf(id);
            const ro = 2 + (hash(id, 5) - 0.5) * 8;
            c.tdim = 1;
            if (c.color !== arm.color) { c.color = arm.color; drawCard(c.canvas, c.m, c.img, arm.color); c.tex.needsUpdate = true; }
            if (dramatic) {
              // 演出中は渦の目に吸い込まれたまま。ラベルの登場後に新しい腕へ放たれる
              pendingTargets.push({ c, base, s, ro, size: 12 * sc });
              c.tbase = c.base; c.ts = 1.16; c.tro = 0; c.tsize = 2.5;
            } else {
              c.tbase = base; c.ts = s; c.tro = ro; c.tsize = 12 * sc;
            }
          });
          const lmat = new THREE.MeshBasicMaterial({ map: makeLabelTexture(arm.name, arm.color, n), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
          const lmesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 10), lmat);
          lmesh.userData.arm = ai;
          scene.add(lmesh);
          const l: Label = { mesh: lmesh, base, s: 0.16 + (ai % 2) * 0.12, mat: lmat, arm: ai, pos: new THREE.Vector3(), centerAt: dramatic ? ai : -1, born: performance.now() + (dramatic ? ai * 320 : 0) };
          posOf(l.base, l.s, -2, 0.3, spin + dragSpin, l.pos);
          if (dramatic) l.pos.set(0, 0, -60); // 中央から登場
          labels.push(l);
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
        // 1) 全部が目に吸い込まれたまま回る 2) ラベルが中央に一枚ずつ立つ 3) 新しい腕へ放たれ、カメラが飛び込む
        wordTarget = 0;
        hotTarget = 0.45; // ラベルが読めるよう、白熱を少し抑える
        flowTarget = 0.3;
        spinBoost = 1.4;
        releaseTimer = setTimeout(() => {
          releaseTimer = null;
          for (const pt of pendingTargets) { pt.c.tbase = pt.base; pt.c.ts = pt.s; pt.c.tro = pt.ro; pt.c.tsize = pt.size; pt.c.s = 1.1; pt.c.base = pt.base - Math.PI * 0.9; }
          for (const l of labels) l.centerAt = -1;
          if (a) buildRibbons(a);
          hotTarget = 0;
          flowTarget = 0.05;
          mix = 0;
          swirl = Math.PI * 0.9;
          spinBoost = 1.2;
          burst = 0.9;
          hot = 1.2;
          flow = 0.45;
          loosenTarget = 0;
          flash(0.55);
          sfx.boom();
        explode(new THREE.Vector3(0, 0, -60), a ? a.arms[0].color : 0xebff00);
        for (let k = 0; k < 3; k++) dropInk(130, 0.0009, 0.12, 0.4);
        // 一番熱い腕へ飛び込む（サンプルの focusOnStar）
        if (a) {
          // 渦の軸に沿って奥へ飛び込む（壁のカードに衝突しない）。視線は第1の腕のラベルへ
          const target = posOf(armBase[0], 0.45, -6, 0.3, spin + dragSpin, new THREE.Vector3());
          const from = new THREE.Vector3(0, -6, -34);
          camFree = false;
          camTween = { from: camera.position.clone(), to: from, lookFrom: camLook.clone(), lookTo: target, t0: performance.now(), dur: 2000, then: () => {
            // 目へ視線を戻しながら基準位置へ
            camTween = { from: camera.position.clone(), to: new THREE.Vector3(0, HOME_Y, homeZ), lookFrom: camLook.clone(), lookTo: new THREE.Vector3(0, LOOK_Y, EYE_Z), t0: performance.now(), dur: 2600, then: () => { camFree = true; } };
          } };
        }
        }, REVEAL_MS);
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
        // 入場: 渦の目に吸い込まれる（DIVE_MS）。カメラが加速しながら軸に沿って突っ込み、目が迫ってきて拡大・高速回転、
        // 視野が広がり視界がロール、粒子が白熱して脇を流れる。通り抜けた瞬間に閃光、気づけば漏斗の内側にいてカードが流れ出す。
        sfx.enter();
        diving = true; diveT0 = performance.now(); diveRoll = 0;
        photoTarget = 0;
        spinBoost = 1.2;
        hot = 0.5; hotTarget = 1; flowTarget = 0.6;
        for (const c of cardList) { c.s = 1.06; c.size = 1; }
        applyArms(currentArms, false);
        camFree = false; camTween = null;
        for (let k = 0; k < 8; k++) dropInk(120, 0.001, 0.08, 0.4);
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
        flowTarget = 0.3;
        sfx.suction();
        loosenTarget = 0;
        spinBoost = 1.0;
        endTour();
        // 全部の映像が渦の目へ吸い込まれる
        for (const c of Array.from(cards.values())) { c.ts = 1.16; c.tro = 0; c.tsize = 2.5; c.tbase = c.base - Math.PI * 1.2; }
        for (const rb of ribbons) rb.userData.targetOpacity = (rb.userData.targetOpacity as number) * 0.25;
      } else {
        hotTarget = 0;
        flowTarget = 0.05;
        loosenTarget = 0;
        sfx.stopSuction();
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
      sfx.whoosh(1);
      explode(p, c.color);
      camTween = { from: camera.position.clone(), to, lookFrom: camLook.clone(), lookTo: p, t0: performance.now(), dur: 1400, then };
      getCrowd().swell(0.5);
    };
    // ---- 腕のツアー（ラベルをタップ → その腕の映像を順に見せる）----
    let tour: { arm: number; ids: string[]; idSet: Set<string>; idx: number; timer: ReturnType<typeof setTimeout> | null } | null = null;
    let tourSpinTarget = 0;
    // 主役の位置 → カメラの置き場所と視線（軸寄りから主役を正面に、奥に渦の目）
    // 主役は画面の右寄り（左下の見出しと重ならず、右端で切れない）に固定。奥に渦の目
    // 主役を画面上の狙いの位置（横長: 右寄り中央、縦長: 上寄り中央）に置く視点。アスペクト比と視野から逆算するので画面サイズに依らない
    const tourPose = (p: THREE.Vector3) => {
      const d = portrait() ? 40 : 32;
      const th = Math.tan((camera.fov * Math.PI) / 360);
      const nx = portrait() ? 0 : 0.42, ny = portrait() ? 0.3 : 0.06;
      const cx = p.x - nx * d * th * camera.aspect, cy = p.y - ny * d * th;
      return { to: new THREE.Vector3(cx, cy, p.z + d), look: new THREE.Vector3(cx, cy, p.z - 60) };
    };
    const tourGo = (i: number) => {
      if (!tour || !currentArms) return;
      if (i >= tour.ids.length) { endTour(); return; }
      tour.idx = Math.max(0, i);
      const c = cards.get(tour.ids[tour.idx]);
      if (!c) return;
      for (const o of Array.from(cards.values())) { if (o.stage) { o.stage = false; o.tro = -18; o.mat.depthTest = true; o.mesh.renderOrder = 0; } }
      c.stage = true; // ツアーの主役: レーンからさらに内側へ出て、大きく明るく、何にも隠れない
      c.tro = -26;
      c.mat.depthTest = false;
      c.mesh.renderOrder = 10;
      // 渦そのものが最短方向に回って、主役を手前下（カメラの側）へ運ぶ。角度は目標値で計算する
      const thNow = c.tbase + c.ts * TWIST + c.aj + spin + dragSpin;
      const want = -Math.PI / 2 - 0.35;
      let d = want - thNow;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      tourSpinTarget = dragSpin + d;
      // カメラは別のトゥイーンで先回りしない。毎フレーム主役の到着地点を追う（tick の follow）
      camFree = false;
      flyingTo = null;
      camTween = null;
      spinBoost = 0;
      getCrowd().swell(0.35);
      sfx.swish();
      const arm = currentArms.arms[tour.arm];
      st.onTour?.({ armName: arm.name, color: arm.color, index: tour.idx, total: tour.ids.length, moment: c.m });
      if (tour.timer) clearTimeout(tour.timer);
      tour.timer = setTimeout(() => {
        if (!tour) return;
        if (tour.idx + 1 < tour.ids.length) tourGo(tour.idx + 1); // 最後まで見せたら終わる（無限ループしない）
        else endTour();
      }, 4500);
    };
    let tourSaved: { c: Card; ts: number; tro: number; tsize: number }[] = [];
    const startTour = (armIdx: number) => {
      if (!currentArms || !currentArms.arms[armIdx]) return;
      if (pendingNow || releaseTimer) return; // 吸い込み・登場の最中はツアーを始めない（目標値が壊れる）
      if (tour?.timer) clearTimeout(tour.timer);
      if (tour) restoreTourCards();
      const ids = currentArms.arms[armIdx].ids.filter((id) => cards.has(id));
      tour = { arm: armIdx, ids, idSet: new Set(ids), idx: -1, timer: null };
      smat.uniforms.uFocus.value = armIdx;
      // その腕の映像だけが壁から内側のレーンへ出てきて、等間隔に並ぶ（他の腕は壁に残って沈む）
      tourSaved = ids.map((id) => { const c = cards.get(id)!; return { c, ts: c.ts, tro: c.tro, tsize: c.tsize }; });
      ids.forEach((id, k) => {
        const c = cards.get(id)!;
        c.ts = 0.05 + k * (0.62 / Math.max(6, ids.length - 1));
        c.tro = -18;
        c.tsize = Math.max(c.tsize, 12) * 1.1;
      });
      tourGo(0);
    };
    const restoreTourCards = () => {
      for (const sv of tourSaved) { sv.c.ts = sv.ts; sv.c.tro = sv.tro; sv.c.tsize = sv.tsize; }
      tourSaved = [];
    };
    const endTour = () => {
      if (!tour) return;
      if (tour.timer) clearTimeout(tour.timer);
      tour = null;
      restoreTourCards();
      smat.uniforms.uFocus.value = -1;
      for (const o of Array.from(cards.values())) { o.stage = false; o.mat.depthTest = true; o.mesh.renderOrder = 0; }
      st.onTour?.(null);
      flyingTo = null;
      camFree = false;
      camTween = { from: camera.position.clone(), to: new THREE.Vector3(0, HOME_Y, dolly), lookFrom: camLook.clone(), lookTo: new THREE.Vector3(0, LOOK_Y, EYE_Z), t0: performance.now(), dur: 1400, then: () => { camFree = true; } };
    };
    const resetView = () => {
      endTour();
      sfx.whoosh(0.6);
      dragSpin = 0; dragVel = 0;
      dollyTarget = 30;
      flyingTo = null;
      camFree = false;
      camTween = { from: camera.position.clone(), to: new THREE.Vector3(0, HOME_Y, 30), lookFrom: camLook.clone(), lookTo: new THREE.Vector3(0, LOOK_Y, EYE_Z), t0: performance.now(), dur: 1200, then: () => { camFree = true; } };
    };
    if (api) api.current = { tourNext: () => { if (tour) tourGo(tour.idx + 1); }, tourPrev: () => { if (tour) tourGo(tour.idx - 1); }, endTour, resetView };
    let viewDirty = false;

    const setFocus = (id: string | null) => {
      if (id) {
        const c = cards.get(id);
        if (c && flyingTo !== c) flyTo(c);
      } else if (!camFree) {
        flyingTo = null;
        camTween = { from: camera.position.clone(), to: new THREE.Vector3(0, HOME_Y, dolly), lookFrom: camLook.clone(), lookTo: new THREE.Vector3(0, LOOK_Y, EYE_Z), t0: performance.now(), dur: 1200, then: () => { camFree = true; } };
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
    let dragging = false, lastX = 0, lastY = 0, downX = 0;
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
      cam: () => {
        const sc = tour && tour.idx >= 0 ? cards.get(tour.ids[tour.idx]) : undefined;
        const th = sc ? sc.tbase + sc.ts * TWIST + sc.aj + spin + dragSpin : null;
        return { t: performance.now(), cx: camera.position.x, cy: camera.position.y, cz: camera.position.z, lz: camLook.z, sx: sc?.pos.x ?? null, sy: sc?.pos.y ?? null, sz: sc?.pos.z ?? null, idx: tour?.idx ?? -1, th, spin, dragSpin, tourSpinTarget, base: sc?.base ?? null, tbase: sc?.tbase ?? null, ts: sc?.ts ?? null, s: sc?.s ?? null, ro: sc?.ro ?? null };
      },
      dbg: () => ({ diving, eyeZ: eye.position.z, zoom: eyeMat.uniforms.uZoom.value, dim: eyeMat.uniforms.uDim.value, diss: fluid.params.dyeDissipation, strength: fluid.params.strength, pull: fluid.params.pull, fov: camera.fov, roll: diveRoll, eyeSpin, tier, frameMs, dimOp: dimMat.opacity, dimVis: dimQuad.visible, hot, phase: phaseNow }),
      labelAt: (i: number) => {
        const l = labels[i];
        if (!l) return null;
        const v = l.pos.clone().project(camera);
        return { x: ((v.x + 1) / 2) * W(), y: ((1 - v.y) / 2) * H(), z: v.z };
      },
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
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; downX = e.clientX; dragMoved = 0; };
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
      if (e.pointerType === "mouse" && performance.now() - rayTimer > 40 && phaseNow === "space" && !diving) {
        rayTimer = performance.now();
        const c = pick(e.clientX, e.clientY);
        const id = c ? c.id : null;
        const overLabel = !c && pickLabel(e.clientX, e.clientY) !== null;
        if (id !== hoverId) { hoverId = id; st.onHover?.(c ? c.m : null); if (c) sfx.blip(); }
        renderer.domElement.style.cursor = c || overLabel ? "pointer" : "grab";
      }
    };
    const pickLabel = (x: number, y: number): number | null => {
      pointer.set((x / W()) * 2 - 1, -(y / H()) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(labels.map((l) => l.mesh), false);
      return hits.length ? (hits[0].object.userData.arm as number) : null;
    };
    const onUp = (e: PointerEvent) => {
      const wasDrag = dragMoved > 6;
      dragging = false;
      if (phaseNow !== "space") return;
      if (wasDrag) {
        // ツアー中のスワイプは前後へ
        if (tour && Math.abs(e.clientX - downX) > 60) { if (e.clientX < downX) tourGo(tour.idx + 1); else tourGo(tour.idx - 1); }
        return;
      }
      if (tour) {
        const c = pick(e.clientX, e.clientY);
        if (c) { if (tour.timer) clearTimeout(tour.timer); flyTo(c, () => st.onSelect(c.m)); return; }
        const la = pickLabel(e.clientX, e.clientY);
        if (la !== null && la !== tour.arm) { startTour(la); return; }
        tourGo(tour.idx + 1);
        return;
      }
      if (flyingTo) return;
      const la = pickLabel(e.clientX, e.clientY);
      if (la !== null) { startTour(la); return; }
      const c = pick(e.clientX, e.clientY);
      if (c) flyTo(c, () => st.onSelect(c.m));
    };
    const onKey = (e: KeyboardEvent) => {
      if (!tour) return;
      if (e.key === "ArrowRight") tourGo(tour.idx + 1);
      else if (e.key === "ArrowLeft") tourGo(tour.idx - 1);
      else if (e.key === "Escape") endTour();
    };
    window.addEventListener("keydown", onKey);
    const onWheel = (e: WheelEvent) => { dollyTarget = Math.max(-40, Math.min(60, dollyTarget + e.deltaY * 0.05)); };
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

    // ---- 画質ティアの適用 ----
    const applyQuality = () => {
      const dpr = window.devicePixelRatio || 1;
      const cap = tier === 0 ? (coarse ? 2 : 1.5) : tier === 1 ? (coarse ? 1.5 : 1.15) : tier === 2 ? 1 : coarse ? 1 : 0.85;
      renderer.setPixelRatio(Math.min(cap, dpr));
      renderer.setSize(W(), H());
      const frac = tier <= 1 ? 1 : tier === 2 ? 0.55 : 0.35;
      sgeo.setDrawRange(0, Math.floor(NP * frac) * 2);
      for (const rb of ribbons) rb.visible = tier < 3 || (rb.userData.b as number) % 2 === 0;
      for (const rb of oldRibbons) rb.visible = tier < 3 || (rb.userData.b as number) % 2 === 0;
    };
    applyQuality();
    (window as unknown as { __vsPerf?: unknown }).__vsPerf = { get frameMs() { return frameMs; }, get tier() { return tier; }, set tier(v: number) { tier = v; applyQuality(); } };

    // ---- ループ ----
    let raf = 0;
    const camDir = new THREE.Vector3();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dtRaw = (now - last) / 1000;
      const dt = Math.min(dtMax, dtRaw);
      last = now;
      const t = Math.max(0, (now - t0) / 1000);
      frameNo++;
      // 画質ガバナー: 実フレーム時間の移動平均で判断（タブ非表示などの巨大な dt は除外）
      if (dtRaw > 0 && dtRaw < 0.5) frameMs += (dtRaw * 1000 - frameMs) * 0.06; // rAF の初回タイムスタンプは負になり得る
      if (autoQuality && t > 3 && now - tierAt > 3000) {
        if (frameMs > 27 && tier < 3) { tier++; tierAt = now; applyQuality(); }
        else if (frameMs < 11.5 && tier > 0 && now - tierAt > 15000) { tier--; tierAt = now; applyQuality(); }
      }

      dragVel *= Math.exp(-dt / 0.6);
      if (!dragging) dragSpin += dragVel;
      if (tour && !dragging) dragSpin = damp(dragSpin, tourSpinTarget, dt, 0.5);
      spinBoost = damp(spinBoost, 0, dt, 1.4);
      if (!tour) spin += dt * (0.035 + spinBoost * 0.6); // ツアー中は渦の自転を止める（主役が流れて行かない）
      const spinAll = spin + dragSpin;
      flow = damp(flow, flowTarget, dt, 1.0);
      hot = damp(hot, hotTarget, dt, 0.8);
      loosen = damp(loosen, loosenTarget, dt, 0.7);
      mix = Math.min(1, mix + dt / 1.7);
      burst = damp(burst, 0, dt, 0.5);

      // 渦の目（流体）
      let strength: number;
      const dk = diving ? Math.max(0, Math.min(1, (now - diveT0) / diveMs)) : 0; // rAF の now は diveT0 より前のことがある（負→pow が NaN）
      const de = Math.pow(dk, 2.4); // 吸い込みの進み（加速）
      if (phaseNow === "entry") { const e = Math.min(1, t / 9); strength = 115 * Math.pow(e, 1.5) + 10 * Math.sin(t * 0.5) * e; }
      else strength = 55 + 110 * loosen + spinBoost * 80 + de * 260;
      fluid.params.strength = strength;
      fluid.params.pull = 3 + loosen * 6 + de * 12;
      // 目は入口では画面いっぱいの主役（圧力反復18）、空間では遠景（12で十分）
      fluid.params.pressureIters = phaseNow === "entry" || diving ? 18 : 12;
      // 入場直後は写真を溶かす。以後はインクが溜まって白飛びしないよう、常に少しずつ薄れる
      // 吸い込み中は進み具合（de）に応じて写真が溶ける（実時間ではなく演出の進行に紐づける）。通過後はインクが溜まらないよう常に薄れる
      fluid.params.dyeDissipation = diving ? 0.02 + de * 3.5 : photoTarget === 0 && photo > 0.05 ? 1.6 : phaseNow === "entry" ? 0.015 : 0.12;
      photo = damp(photo, photoTarget, dt, 0.5);
      if (phaseNow === "entry" || diving || testSim) {
        let acc = Math.min(dt, maxSubsteps / 60);
        while (acc > 1e-4) { const h = Math.min(acc, 1 / 60); fluid.step(h); acc -= h; }
      } else {
        // 空間フェーズ: 流体は毎フレーム最大1ステップ（低fpsで substep が増えて更に遅くなる悪循環を断つ）。軽量ティアでは1フレームおき
        fluidAcc += dt;
        if (frameNo % (tier >= 2 ? 2 : 1) === 0) { fluid.step(Math.min(fluidAcc, 1 / 30)); fluidAcc = 0; }
      }
      const inkEvery = phaseNow === "entry" ? 0.7 : loosen > 0.5 ? 0.1 : 0.45;
      if (t > 2.5 && now - inkTimer > inkEvery * 1000) {
        inkTimer = now;
        if (phaseNow === "entry") dropInk(70, 0.0004, 0.08, 0.3); else dropInk(140 + loosen * 120, 0.0008, 0.1, 0.45);
      }
      eyeMat.uniforms.uDye.value = fluid.dyeTexture;
      eyeMat.uniforms.uBurst.value = burst;
      eyeMat.uniforms.uDim.value = phaseNow === "entry" || diving ? 1 : 0.7 + 0.3 * hot;
      eyeMat.uniforms.uZoom.value = 1 + de * 1.9;
      eyeSpin += dt * (diving ? 0.3 + de * de * 10 : 0);
      eye.position.z = EYE_Z + de * 150; // 目が迫ってくる
      if (atlasDirty) { atlasTex.needsUpdate = true; atlasDirty = false; if (t < 6 && phaseNow === "entry") fluid.fillMosaic(atlasTex, [GRID[0], GRID[1]], [0.3, 0.16875]); }
      eyeMat.uniforms.uRot.value = spinAll * 0.15 + eyeSpin;

      // 粒子
      smat.uniforms.uTime.value = t;
      smat.uniforms.uFlow.value = flow;
      smat.uniforms.uMix.value = mix;
      smat.uniforms.uSwirl.value = swirl;
      smat.uniforms.uHot.value = hot;
      smat.uniforms.uSpin.value = spinAll;
      smat.uniforms.uLoosen.value = loosen;
      smat.uniforms.uAlpha.value = phaseNow === "entry" ? 0.12 : diving ? 0.12 + de * 0.9 : 0.7;

      // 太い帯: 流れ、組み替え時は前の色が消えて新しい色が現れる
      ribbonGroup.rotation.z = spinAll;
      stripeTex.offset.x -= dt * (0.18 + flow * 1.2 + hot * 0.4);
      for (const rb of ribbons) {
        const m = rb.material as THREE.MeshBasicMaterial;
        const fk = tour ? (rb.userData.arm === tour.arm ? 1.8 : 0.3) : 1;
        m.opacity = damp(m.opacity, (rb.userData.targetOpacity as number) * (phaseNow === "entry" || diving ? 0 : 1) * (1 + hot * 0.5) * fk, dt, 0.9);
      }
      for (const rb of oldRibbons) { const m = rb.material as THREE.MeshBasicMaterial; m.opacity = damp(m.opacity, 0, dt, 0.6); }

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
      if (diving) {
        // 軸に沿って加速しながら目へ。視野が開き、視界がロールする
        camera.position.set(Math.sin(t * 0.15) * 4 * (1 - de), 4 - 10 * de, 96 - 66 * de);
        camLook.set(0, 0, EYE_Z);
        diveRoll += dt * (0.15 + de * de * 2.6);
        camera.fov = (portrait() ? 76 : 62) + de * 40;
        camera.updateProjectionMatrix();
        if (dk >= 1) {
          // 通り抜けた: 閃光の裏で目を元の奥へ戻し、漏斗の内側の基準視点へ落ち着く
          diving = false; diveRoll = 0; eyeSpin = 0;
          flash(1.0); sfx.boom(); burst = 1.2;
          eye.position.z = EYE_Z; eyeMat.uniforms.uZoom.value = 1;
          camera.fov = portrait() ? 76 : 62; camera.updateProjectionMatrix();
          camera.position.set(0, -6, 30); camLook.set(0, 0, EYE_Z);
          hotTarget = 0; flowTarget = 0.05;
          camTween = { from: camera.position.clone(), to: new THREE.Vector3(0, HOME_Y, homeZ), lookFrom: camLook.clone(), lookTo: new THREE.Vector3(0, LOOK_Y, EYE_Z), t0: now, dur: 1800, then: () => { camFree = true; } };
        }
      } else if (camTween) {
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
      } else if (tour && !flyingTo) {
        // ツアー中（移動が終わった後）: 主役の現在位置を追い続ける（ドラッグや揺れで外れない）
        const sc = tour.idx >= 0 ? cards.get(tour.ids[tour.idx]) : undefined;
        if (sc) {
          // 主役の「到着地点」を追う（今の位置を追うと、主役が奥から出てくる間カメラも奥へ潜ってしまう＝二段階の動き）
          posOf(sc.tbase, sc.ts, sc.tro, sc.aj, spin + tourSpinTarget, tmp3);
          const pose = tourPose(tmp3);
          camera.position.lerp(pose.to, 1 - Math.exp(-dt / 0.6));
          camLook.lerp(pose.look, 1 - Math.exp(-dt / 0.6));
        }
      } else if (camFree) {
        if (phaseNow === "entry") {
          camera.position.set(Math.sin(t * 0.15) * 4 + parallax.x * 10, 4 + Math.sin(t * 0.11) * 2 - parallax.y * 6, 96 - Math.min(14, t * 1.0));
          camLook.set(parallax.x * 30, -parallax.y * 20, EYE_Z);
        } else {
          // 常に前へ進みながら漂う。カーソルで視線が大きく振れる
          // 渦の内側、下の壁に近い位置から目を見上げる。カーソルで視線が大きく振れる
          camera.position.set(Math.sin(t * 0.12) * 5 + parallax.x * 8, HOME_Y + Math.sin(t * 0.1) * 2.5 - parallax.y * 5, dolly);
          camLook.set(parallax.x * 50, LOOK_Y - parallax.y * 34, EYE_Z + 40);
        }
      }
      camera.lookAt(camLook);
      if (diving) camera.rotateZ(diveRoll);

      // カード
      const cam = camera.position;
      const flying = flyingTo;
      const tourSet = tour ? tour.idSet : null;
      for (const c of cardList) {
        if (phaseNow === "space" && !diving && c.inArm && c !== flying && !tour) {
          c.ts -= dt * flow * 0.4;
          if (c.ts < S_MIN) { c.ts += S_MAX - S_MIN; c.s = c.ts; c.size = 1; }
        }
        const tauT = tourSet && tourSet.has(c.id) ? 0.55 : 1.0; // ツアーの腕はカメラと同じ速さでレーンへ
        c.base = damp(c.base, c.tbase, dt, tour ? 0.6 : 1.1);
        c.s = damp(c.s, c.ts, dt, tauT);
        c.ro = damp(c.ro, c.tro + loosen * 16 * (c.inArm ? 1 : 0), dt, tauT);
        const hovered = hoverId === c.id;
        const sizeS = c.inArm ? 1.55 - 0.8 * Math.max(0, Math.min(1, c.s)) : 1;
        c.size = damp(c.size, c.tsize * sizeS * (hovered ? 1.2 : 1) * (c.stage ? 1.4 : 1), dt, 0.25);
        c.dim = damp(c.dim, phaseNow === "entry" || diving ? 0 : c.tdim, dt, 0.6);
        posOf(c.base, c.s, c.ro, c.aj, spinAll, c.pos);
        c.pos.y += Math.sin(t * 0.8 + c.base * 3) * 0.5;
        c.mesh.position.copy(c.pos);
        if (tourSet && tourSet.has(c.id)) {
          c.mesh.up.set(0, 1, 0);
          c.mesh.lookAt(cam); // ツアー中の腕は正立してカメラを向く（傾き・横倒しで読めなくならない）
        } else {
          orient(c.mesh, c.pos, c.base, c.s, c.ro, c.aj, spinAll, c === flying || c.stage ? 1 : c.inArm ? 0.6 : 0.4);
        }
        c.mesh.scale.setScalar(c.size);
        const dist = c.pos.distanceTo(cam);
        const fog = Math.max(0.2, Math.min(1, 1 - (dist - 30) / 170));
        const inTourArm = tourSet ? tourSet.has(c.id) : true;
        const b = c.stage ? 1.2 : (0.3 + 0.7 * fog) * (c.inArm ? 1 : 0.7) * (tour ? (inTourArm ? 0.9 : 0.22) : 1);
        if (c.mat.color.r <= 1.2) c.mat.color.setScalar(b);
        c.mat.opacity = c.dim;
        c.mesh.visible = c.dim > 0.02;
      }
      for (const l of labels) {
        const born = now >= l.born;
        if (born && !l.stamped) { l.stamped = true; if (l.centerAt >= 0) sfx.stamp(); }
        if (l.centerAt >= 0) {
          // 登場: 画面中央に一枚ずつ、縦に並んで立つ
          const nL = labels.length;
          tmp.set(0, (nL - 1) * 7.5 - l.centerAt * 15, -52).applyQuaternion(camera.quaternion).add(cam);
          l.pos.lerp(tmp, 1 - Math.exp(-dt / 0.25));
          l.mesh.scale.setScalar(1.6);
        } else {
          posOf(l.base, l.s, -2, 0.3, spinAll, tmp);
          l.pos.lerp(tmp, 1 - Math.exp(-dt / 0.7));
          l.mesh.scale.setScalar(1);
        }
        l.mesh.position.copy(l.pos);
        l.mesh.lookAt(cam); // ラベルは常に読める向き
        const hide = phaseNow === "entry" || diving || (pendingNow !== null && l.centerAt < 0) || !born || (tour !== null && l.arm === tour.arm); // ツアー中の腕の名前は見出しに出す（壁の帯は手前に来て巨大化するので消す）
        // ツアー中は他の腕のラベルを薄くする（主役から目が逸れない）
        l.mat.opacity = damp(l.mat.opacity, hide ? 0 : tour !== null ? 0.08 : 0.98, dt, hide ? 0.4 : 0.25);
      }
      dimMat.opacity = damp(dimMat.opacity, tour !== null && tour.idx >= 0 ? 0.66 : 0, dt, tour ? 0.35 : 0.25);
      dimQuad.visible = dimMat.opacity > 0.01;
      const dirtyNow = tour !== null || Math.abs(dragSpin) > 0.12 || Math.abs(dollyTarget - 30) > 3 || (!camFree && !flyingTo && !camTween && !diving);
      if (dirtyNow !== viewDirty) { viewDirty = dirtyNow; st.onViewDirty?.(viewDirty); }
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
      window.removeEventListener("keydown", onKey);
      if (releaseTimer) clearTimeout(releaseTimer);
      if (tour?.timer) clearTimeout(tour.timer);
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
    // 演出は「言葉で組み替えた」ときだけ。初期の腕がAIから遅れて届いたときは静かに差し替える
    const dramatic = prevKey.current !== null && prevKey.current !== armsKey && phase === "space" && !!arms && arms.text !== "";
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

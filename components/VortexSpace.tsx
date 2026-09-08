"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer, CSS3DSprite } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { getCrowd } from "@/lib/crowd";
import { embedUrl } from "@/lib/youtube";
import { VORTEX_FRAG, VORTEX_VERT } from "@/lib/vortexShader";
import type { Interpretation } from "@/lib/interpret";
import type { MomentWithStats } from "@/lib/types";

// 熱狂の渦 — 渦そのものがインターフェース。
//  背景: 画面全体の液体状の渦（シェーダー）。入場時は100本のサムネイルが捻れて渦になり、入場で写真が溶けて色の帯が残る
//  前景: 100の映像カード（CSS3D）が3Dの漏斗状の渦を公転する。手前は大きく、奥は渦の目へ小さく。
//        腕（クラスタ）はLLMが命名し、言葉が来るたびに全カードが新しい腕へ渦を巻いて流れ、カメラが飛び込む
//  操作: ドラッグで渦を回す、ホイールで奥へ、ホバーで歓声、クリックでカメラがそのカードへ寄って詳細へ

export type Phase = "entry" | "space";

const CARD_PX = 320; // カード要素の基準幅(px)。world幅 = size なので scale = size/CARD_PX
const R_NEAR = 52;
const R_FAR = 14;
const DEPTH = 120;
const TWIST = 2.5;
const YSQ = 0.8; // 縦方向の潰し（漏斗を斜めから見ている感じ）

interface Card {
  id: string;
  m: MomentWithStats;
  el: HTMLDivElement;
  media: HTMLDivElement;
  votesEl: HTMLDivElement;
  obj: CSS3DObject;
  th: number; r: number; z: number; size: number; dim: number;
  tth: number; tr: number; tz: number; tsize: number; tdim: number;
  inArm: boolean;
  iframe: HTMLIFrameElement | null;
  color: string;
}
interface Label {
  el: HTMLDivElement;
  obj: CSS3DSprite;
  th: number; r: number; z: number;
}

function hash(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
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
function damp(cur: number, tgt: number, dt: number, tau: number): number {
  return cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
}

export default function VortexSpace({
  moments,
  arms,
  pulses,
  phase,
  focusId,
  soundOn,
  onSelect,
}: {
  moments: MomentWithStats[];
  arms: Interpretation | null;
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

    // ---- WebGL: 背景の渦 + 3Dリボン ----
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.setSize(W(), H());
    renderer.autoClear = false;
    renderer.domElement.className = "vs-gl";
    host.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(portrait() ? 74 : 58, W() / H(), 0.5, 600);
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
    const bgScene = new THREE.Scene();
    const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: VORTEX_VERT,
      fragmentShader: VORTEX_FRAG,
      uniforms: {
        uRes: { value: new THREE.Vector2(W(), H()) },
        uTime: { value: 0 },
        uAtlas: { value: atlasTex },
        uGrid: { value: new THREE.Vector2(GRID[0], GRID[1]) },
        uPhoto: { value: 1 },
        uTwist: { value: 0 },
        uSpin: { value: 0 },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uBurst: { value: 0 },
        uGlow: { value: 1 },
        uZoom: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));
    // デバッグ用（検証スクリプトから uniforms と atlas を覗く）
    (window as unknown as { __vs?: unknown }).__vs = { bgMat, atlas, get photo() { return photo; }, get twist() { return twist; } };

    const scene = new THREE.Scene();
    const ribbonGroup = new THREE.Group();
    ribbonGroup.scale.y = YSQ;
    scene.add(ribbonGroup);
    // リボンの流れ（縞のアルファマップをスクロール）
    const stripe = document.createElement("canvas");
    stripe.width = 256; stripe.height = 64;
    const sctx = stripe.getContext("2d")!;
    const sImg = sctx.createImageData(256, 64);
    for (let y = 0; y < 64; y++) {
      const prof = Math.pow(Math.sin((y / 63) * Math.PI), 1.6); // 断面: 端が柔らかい
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

    // ---- CSS3D: カードとラベル ----
    const css = new CSS3DRenderer();
    css.setSize(W(), H());
    css.domElement.className = "vs-css";
    host.appendChild(css.domElement);
    const cssScene = new THREE.Scene();

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
        th: hash(m.id) * Math.PI * 2, r: 1.5, z: -DEPTH - 10, size: 0.5, dim: 0,
        tth: 0, tr: 1.5, tz: -DEPTH - 10, tsize: 0.5, tdim: 0,
        inArm: false, iframe: null, color: "#fff",
      };
      c.tth = c.th;
      el.addEventListener("pointerenter", () => { hoverId = c.id; el.classList.add("hovered"); });
      el.addEventListener("pointerleave", () => { if (hoverId === c.id) hoverId = null; el.classList.remove("hovered"); });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dragMoved > 6) return;
        st.onSelect(c.m);
      });
      cards.set(m.id, c);
    }

    // ---- 状態 ----
    let phaseNow: Phase = phase;
    let spin = 0;
    let spinBoost = 0;
    let dragSpin = 0;
    let dragVel = 0;
    let hoverId: string | null = null;
    let dragMoved = 0;
    let dolly = 40; // カメラの基準z
    let dollyTarget = 40;
    let burst = 0;
    let glow = 1;
    let twistTarget = 0;
    let twist = 0;
    let photo = 1;
    let photoTarget = 1;
    let t0 = performance.now();
    let last = t0;
    const parallax = new THREE.Vector2();
    const parallaxTarget = new THREE.Vector2();
    let camTween: { from: THREE.Vector3; to: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3; t0: number; dur: number; then?: () => void } | null = null;
    let camFree = true; // trueなら基準位置＋漂い
    let currentArms: Interpretation | null = null;
    let liveTimer = 0;

    const tmp = new THREE.Vector3();
    const posOf = (th: number, r: number, z: number, out: THREE.Vector3) =>
      out.set(Math.cos(th + spin) * r, Math.sin(th + spin) * r * YSQ, z);

    // 腕の割当 → 各カードの目標（円筒座標）
    const applyArms = (a: Interpretation | null, dramatic: boolean) => {
      currentArms = a;
      const maxVotes = Math.max(1, ...st.momentsRef.map((m) => m.votes));
      const votesOf = (id: string) => (st.momentsRef.find((m) => m.id === id)?.votes ?? 0) / maxVotes;
      const inArm = new Set<string>();
      const A = a ? a.arms.length : 1;
      // ラベル
      for (const l of st.labels) cssScene.remove(l.obj);
      st.labels = [];
      for (const r of ribbons) { ribbonGroup.remove(r); r.geometry.dispose(); (r.material as THREE.Material).dispose(); }
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
            const j = hash(id, 11);
            c.tth = base + s * TWIST + (j - 0.5) * 0.35;
            c.tr = R_NEAR - (R_NEAR - R_FAR) * Math.pow(s, 0.85) + (hash(id, 5) - 0.5) * 6;
            c.tz = -(4 + s * DEPTH) + (hash(id, 7) - 0.5) * 6;
            const sc = a.text ? 0.55 + 0.9 * (a.scores[id] ?? 0.5) : 0.75 + 0.55 * votesOf(id);
            c.tsize = 12 * sc;
            c.tdim = 1;
            c.color = arm.color;
            c.el.style.setProperty("--c", arm.color);
            if (dramatic) c.th -= Math.PI * 0.9; // 一周近く渦を巻いて新しい腕へ
          });
          // 腕のラベル（腕の入口付近、少し外側）
          const s = 0.38;
          const lel = document.createElement("div");
          lel.className = "vlabel";
          lel.innerHTML = `<span>${arm.name}</span>`;
          lel.style.setProperty("--c", arm.color);
          const lobj = new CSS3DSprite(lel);
          lobj.scale.setScalar(0.04);
          cssScene.add(lobj);
          st.labels.push({ el: lel, obj: lobj, th: base + s * TWIST + 0.3, r: R_NEAR - (R_NEAR - R_FAR) * Math.pow(s, 0.85) + 9, z: -(4 + s * DEPTH) + 8 });
          // リボン: 腕に沿う光の帯（幅の違う4本、平たく柔らかい）
          for (let b = 0; b < 7; b++) {
            const pts: THREE.Vector3[] = [];
            const off = (b - 3) * 0.16 + (hash(arm.name, 40 + b) - 0.5) * 0.1;
            const roff = (hash(arm.name, b) - 0.5) * 12;
            for (let q = 0; q <= 60; q++) {
              const ss = -0.12 + (q / 60) * 1.32;
              const th = base + ss * TWIST + off + Math.sin(ss * 5 + b) * 0.07;
              const rr = R_NEAR - (R_NEAR - R_FAR) * Math.pow(Math.max(0, Math.min(1, ss)), 0.85) + roff + 4;
              pts.push(new THREE.Vector3(Math.cos(th) * rr, Math.sin(th) * rr, -(4 + ss * DEPTH) + 2 + (b - 1.5) * 1.5));
            }
            const width = 0.5 + hash(arm.name, 20 + b) * 1.8;
            const geo = ribbonGeometry(pts, width);
            const mat = new THREE.MeshBasicMaterial({
              color: new THREE.Color(arm.color), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending,
              depthWrite: false, alphaMap: stripeTex, side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.userData.targetOpacity = 0.28 + hash(arm.name, 60 + b) * 0.3;
            ribbonGroup.add(mesh);
            ribbons.push(mesh);
          }
        });
      }
      // 腕に入らなかったものは外周へ
      for (const c of Array.from(cards.values())) {
        c.inArm = inArm.has(c.id);
        if (!c.inArm) {
          const j = hash(c.id, 3);
          c.tth = j * Math.PI * 2;
          c.tr = 70 + hash(c.id, 4) * 24;
          c.tz = -(70 + hash(c.id, 9) * 110);
          c.tsize = 6.5;
          c.tdim = a && a.text ? 0.32 : 0.7;
          if (dramatic) c.th -= Math.PI * 0.5;
          if (c.iframe) { c.iframe.remove(); c.iframe = null; }
        }
      }
      if (dramatic) {
        spinBoost = 1.4;
        glow = 2.2;
        burst = 0.7;
        // 飛び込む: 一度奥へ寄ってから戻る
        dolly = Math.min(dolly, 40);
        camFree = true;
        dollyTarget = 20;
        setTimeout(() => { dollyTarget = 40; }, 1400);
      }
    };
    st.setArms = applyArms;

    const setPhase = (p: Phase) => {
      if (p === phaseNow) return;
      phaseNow = p;
      if (p === "space") {
        // 入場: 閃光 → 写真が溶ける → カードが目から飛び出す → カメラが引く
        burst = 1;
        photoTarget = 0;
        twistTarget = 4.0;
        spinBoost = 1.0;
        glow = 1.6;
        dolly = 22;
        dollyTarget = 40;
        applyArms(currentArms, false);
      }
    };
    st.setPhase = setPhase;

    // カメラをカードへ寄せる / 戻す
    const setFocus = (id: string | null) => {
      if (id) {
        const c = cards.get(id);
        if (!c) return;
        posOf(c.th, c.r, c.z, tmp);
        const dir = new THREE.Vector3().subVectors(camera.position, tmp).normalize();
        const to = tmp.clone().add(dir.multiplyScalar(c.size * 1.9));
        camFree = false;
        camTween = { from: camera.position.clone(), to, lookFrom: camLook.clone(), lookTo: tmp.clone(), t0: performance.now(), dur: 900 };
      } else if (!camFree) {
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
      camera.fov = portrait() ? 74 : 58;
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
      css.setSize(W(), H());
      bgMat.uniforms.uRes.value.set(W(), H());
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    // ---- ループ ----
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = Math.max(0, (now - t0) / 1000); // rAFのタイムスタンプは初期化時刻より前のことがある（負のtはNaNの元）

      // 渦の回転
      dragVel *= Math.exp(-dt / 0.6);
      if (!dragging) dragSpin += dragVel;
      spinBoost = damp(spinBoost, 0, dt, 1.3);
      spin += dt * (0.045 + spinBoost * 0.9) + (dragging ? 0 : 0);
      const spinAll = spin + dragSpin;
      ribbonGroup.rotation.z = spinAll;
      for (const rb of ribbons) {
        const mat = rb.material as THREE.MeshBasicMaterial;
        mat.opacity = damp(mat.opacity, rb.userData.targetOpacity as number, dt, 0.8);
      }
      stripeTex.offset.x -= dt * 0.25;

      // 背景
      if (phaseNow === "entry") {
        // 10秒かけて「写真の壁 → 中心から捻れ始める → 渦」になる（ゆっくり始まり、加速する）
        const e = Math.min(1, t / 10);
        twistTarget = 9.5 * Math.pow(e, 2.4) + 0.4 * Math.sin(t * 0.6) * e;
      } else {
        twistTarget = 4.0 + 0.4 * Math.sin(t * 0.5);
      }
      twist = damp(twist, twistTarget, dt, 0.5);
      photo = damp(photo, photoTarget, dt, 0.7);
      burst = damp(burst, 0, dt, 0.5);
      glow = damp(glow, phaseNow === "entry" ? 1 : 0.75, dt, 1.2);
      bgMat.uniforms.uTime.value = t;
      bgMat.uniforms.uTwist.value = twist;
      bgMat.uniforms.uSpin.value = spinAll * 0.7;
      bgMat.uniforms.uPhoto.value = photo;
      bgMat.uniforms.uBurst.value = burst;
      bgMat.uniforms.uGlow.value = glow;
      bgMat.uniforms.uCenter.value.set(0.5 - parallax.x * 0.02, 0.52 + parallax.y * 0.02);
      bgMat.uniforms.uZoom.value = 1 + (40 - dolly) * 0.012;
      if (atlasDirty) { atlasTex.needsUpdate = true; atlasDirty = false; }

      // カメラ
      parallax.lerp(parallaxTarget, 1 - Math.exp(-dt / 0.5));
      dolly = damp(dolly, dollyTarget, dt, 0.9);
      if (camTween) {
        const k = Math.min(1, (now - camTween.t0) / camTween.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        camera.position.lerpVectors(camTween.from, camTween.to, e);
        camLook.lerpVectors(camTween.lookFrom, camTween.lookTo, e);
        if (k >= 1) { const th = camTween.then; camTween = null; th?.(); }
      } else if (camFree) {
        camera.position.set(
          Math.sin(t * 0.11) * 2.5 + parallax.x * 4,
          2 + Math.sin(t * 0.09) * 1.5 - parallax.y * 3,
          dolly
        );
        camLook.set(parallax.x * 6, -3 - parallax.y * 4, -70);
      }
      camera.lookAt(camLook);

      // カード
      const cam = camera.position;
      for (const c of Array.from(cards.values())) {
        c.th = damp(c.th, c.tth, dt, 0.95);
        c.r = damp(c.r, c.tr, dt, 0.95);
        c.z = damp(c.z, c.tz, dt, 0.95);
        const hovered = hoverId === c.id;
        c.size = damp(c.size, c.tsize * (hovered ? 1.28 : 1), dt, 0.22);
        c.dim = damp(c.dim, phaseNow === "entry" ? 0 : c.tdim, dt, 0.6);
        posOf(c.th, c.r, c.z, c.obj.position);
        c.obj.position.y += Math.sin(t * 0.8 + c.th * 3) * 0.6;
        c.obj.lookAt(cam);
        c.obj.rotateY(0.32 * Math.cos(c.th + spinAll) * (c.inArm ? 1 : 0.4));
        c.obj.scale.setScalar(c.size / CARD_PX);
        c.el.style.opacity = c.dim.toFixed(3);
        c.el.style.pointerEvents = c.dim > 0.3 ? "auto" : "none";
      }
      // ラベル
      for (const l of st.labels) {
        posOf(l.th, l.r, l.z, l.obj.position);
        l.obj.scale.setScalar(0.05);
        l.el.style.opacity = phaseNow === "entry" ? "0" : "1";
      }

      // ライブ再生: カメラに近い（=大きく見える）カード4枚（PCのみ）
      if (now - liveTimer > 700 && phaseNow === "space" && !window.matchMedia("(pointer: coarse)").matches) {
        liveTimer = now;
        const ranked = Array.from(cards.values()).filter((c) => c.inArm && c.dim > 0.5)
          .map((c) => ({ c, d: c.obj.position.distanceTo(cam) / c.size }))
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
          tmp.copy(c.obj.position).project(camera);
          const maxVotes = Math.max(1, ...st.momentsRef.map((m) => m.votes));
          crowd.setFocus({ key: c.id, level: 0.35 + 0.65 * Math.pow(c.m.votes / maxVotes, 0.7), pan: Math.max(-0.85, Math.min(0.85, tmp.x)) });
        } else crowd.setFocus(null);
      }

      renderer.clear();
      renderer.render(bgScene, bgCam);
      renderer.render(scene, camera);
      css.render(cssScene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      host.removeEventListener("wheel", onWheel);
      renderer.dispose();
      host.removeChild(renderer.domElement);
      host.removeChild(css.domElement);
      st.setArms = undefined;
      st.setPhase = undefined;
      st.setFocus = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 腕（言葉）が変わったら渦を組み替える
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

  // 投票の脈動 と 投票数の更新
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

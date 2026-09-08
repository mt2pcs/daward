"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { getCrowd } from "@/lib/crowd";
import {
  EMOTION_COLORS,
  clusterCenters,
  cosine,
  mapPosition,
  vecOf,
  type Vec3,
} from "@/lib/emotionSpace";
import { EMOTIONS, type MomentWithStats } from "@/lib/types";

// 感情の宇宙（v2）。
// - 8つの感情はそれぞれ「その色の粒子が渦を巻く小さな銀河」。内側ほど速く回る（入場の渦と同じ文法）
// - 100の瞬間はカードとして各銀河の中を公転する。投票数が大きさ、ホバーで歓声、クリックで詳細
// - 言葉（query）が来ると、関係する銀河の粒子が中心へ流れ込んで新しい渦を作り、
//   似ている瞬間が螺旋状に整列する。カメラは正面へ寄る
export interface GalaxyQuery {
  vec: number[];
  label: string;
}

const CARD_ASPECT = 9 / 16;
const PER_CLUSTER = 2300;
const NC = EMOTIONS.length;
const DISC_R = 27; // 銀河円盤の半径
const HOME_Y = 122; // 地図モードの基準カメラ（見下ろし）
const HOME_Z = 195;
// 縦画面は視野を広げ、真上寄りから見下ろす（環が縦画面いっぱいの円になる）
function viewFor(aspect: number): { fov: number; k: number; home: THREE.Vector3; t: number } {
  const t = aspect >= 1 ? 0 : Math.min(1, (1 - aspect) / 0.55); // 1.0→0, 0.45→1
  const k = 1 + 0.5 * t;
  const home = new THREE.Vector3(0, HOME_Y + (300 - HOME_Y) * t, HOME_Z + (175 - HOME_Z) * t);
  return { fov: 52 + 22 * t, k, home, t };
}
const HOME_TARGET = new THREE.Vector3(0, -10, 0);

export default function Galaxy({
  moments,
  pulses,
  query,
  active,
  soundOn,
  onSelect,
}: {
  moments: MomentWithStats[];
  pulses: Record<string, number>;
  query: GalaxyQuery | null;
  active: boolean;
  soundOn: boolean;
  onSelect: (m: MomentWithStats) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [hoverTitle, setHoverTitle] = useState<string | null>(null);

  const momentsRef = useRef(moments);
  momentsRef.current = moments;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const queryRef = useRef(query);
  const activeRef = useRef(active);
  const centers = useMemo(() => clusterCenters(), []);

  const S = useRef<{
    sprites: THREE.Sprite[];
    primary: number[]; // 各カードの主感情クラスタ
    offset: Vec3[]; // クラスタ中心からの相対位置（地図モード）
    target: Vec3[];
    cur: Vec3[];
    alphaTarget: number[];
    simRank: Float32Array; // 言葉モードの順位 0(最上位)..1
    hoverIdx: number | null;
    pulseAt: Map<string, number>;
    // クラスタ状態: 言葉との近さ w（0..1）を滑らかに追従
    w: Float32Array;
    wTarget: Float32Array;
    // 粒子
    pCluster: Uint8Array;
    pR: Float32Array;
    pTheta: Float32Array;
    pOmega: Float32Array;
    pU: Float32Array;
    pV: Float32Array;
    pY: Float32Array;
    pBright: Float32Array;
    pSize: Float32Array;
    positions: Float32Array;
    colors: Float32Array; // 描画用（毎フレーム base×明るさ）
    baseColors: Float32Array; // 基本色
    geom?: THREE.BufferGeometry;
    camera?: THREE.PerspectiveCamera;
    controls?: OrbitControls;
    waves: { sp: THREE.Sprite; t0: number }[];
    camTween?: { fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t0: number; dur: number };
    introStart?: number;
    lastTime: number;
    queryActive: boolean;
    qMix: number;
  }>({
    sprites: [], primary: [], offset: [], target: [], cur: [], alphaTarget: [], simRank: new Float32Array(200),
    hoverIdx: null, pulseAt: new Map(),
    w: new Float32Array(NC), wTarget: new Float32Array(NC),
    pCluster: new Uint8Array(0), pR: new Float32Array(0), pTheta: new Float32Array(0),
    pOmega: new Float32Array(0), pU: new Float32Array(0), pV: new Float32Array(0),
    pY: new Float32Array(0), pBright: new Float32Array(0), pSize: new Float32Array(0),
    positions: new Float32Array(0), colors: new Float32Array(0), baseColors: new Float32Array(0),
    waves: [],
    lastTime: 0, queryActive: false, qMix: 0,
  });

  // 言葉に応じた目標（カードの配置・クラスタの重み・カメラ）
  const retarget = () => {
    const s = S.current;
    const q = queryRef.current;
    const ms = momentsRef.current;
    const n = s.sprites.length;
    if (q) {
      // クラスタごとの近さ（one-hotとの類似度）
      for (let c = 0; c < NC; c++) {
        const oh = new Array(NC).fill(0);
        oh[c] = 1;
        const sim = cosine(oh, q.vec);
        s.wTarget[c] = Math.max(0, Math.min(1, (sim - 0.25) / 0.6));
      }
      // 似ている順に螺旋へ。遠いものは外周へ流し、薄くする
      const ranked = ms
        .map((m, i) => ({ i, sim: cosine(vecOf(m), q.vec) }))
        .sort((a, b) => b.sim - a.sim);
      let k = 0;
      for (const { i, sim } of ranked) {
        if (i >= n) continue;
        if (sim >= 0.42 && k < 36) {
          const a = k * 2.399963; // 黄金角
          const r = 4 + Math.sqrt(k) * 5.6;
          s.target[i] = [Math.cos(a) * r, Math.sin(a) * r * 0.75 + 3, Math.sin(k * 1.7) * 3];
          s.alphaTarget[i] = 1;
          s.simRank[i] = k / 36;
          k++;
        } else {
          const p = s.offset[i];
          const c = centers[s.primary[i]];
          const base: Vec3 = [c[0] + p[0], c[1] + p[1], c[2] + p[2]];
          const len = Math.hypot(base[0], base[1], base[2]) || 1;
          const rr = 120 + (1 - sim) * 40;
          s.target[i] = [(base[0] / len) * rr, (base[1] / len) * rr, (base[2] / len) * rr];
          s.alphaTarget[i] = 0.28;
        }
      }
      s.queryActive = true;
      startTween(new THREE.Vector3(0, 40 * camK(), 118 * camK()), new THREE.Vector3(0, 0, 0), 1700);
    } else {
      s.wTarget.fill(0);
      for (let i = 0; i < n; i++) s.alphaTarget[i] = 1;
      if (s.queryActive) {
        s.queryActive = false;
        startTween(homePos(), HOME_TARGET.clone(), 1700);
      }
    }
  };

  const camK = () => {
    const c = S.current.camera;
    return c ? viewFor(c.aspect).k : 1;
  };
  const homePos = () => {
    const c = S.current.camera;
    return c ? viewFor(c.aspect).home : new THREE.Vector3(0, HOME_Y, HOME_Z);
  };

  const startTween = (toP: THREE.Vector3, toT: THREE.Vector3, dur: number) => {
    const s = S.current;
    if (!s.camera || !s.controls) return;
    s.camTween = {
      fromP: s.camera.position.clone(),
      toP,
      fromT: s.controls.target.clone(),
      toT,
      t0: performance.now(),
      dur,
    };
  };

  useEffect(() => {
    queryRef.current = query;
    retarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const s = S.current;
    for (const [id, t] of Object.entries(pulses)) s.pulseAt.set(id, t);
  }, [pulses]);

  useEffect(() => {
    if (active && !activeRef.current) S.current.introStart = performance.now();
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const s = S.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030305);
    scene.fog = new THREE.FogExp2(0x030305, 0.0026);
    const view0 = viewFor(host.clientWidth / host.clientHeight);
    const camera = new THREE.PerspectiveCamera(view0.fov, host.clientWidth / host.clientHeight, 0.5, 2500);
    camera.position.set(0, 30, 60);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    // ブルーム（粒子とラベルが発光する）
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(host.clientWidth / 2, host.clientHeight / 2),
      1.05, 0.6, 0.55
    );
    composer.addPass(bloom);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 40;
    controls.maxDistance = 420;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;

    // 遠景の星（2層・ゆっくり回る）
    const starLayers: THREE.Points[] = [];
    for (let layer = 0; layer < 2; layer++) {
      const n = layer === 0 ? 2600 : 1400;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = 320 + Math.random() * 500;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.cos(ph) * 0.7;
        pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({
        color: layer === 0 ? 0x9fb4ff : 0xffffff, size: layer === 0 ? 1.2 : 2.0,
        transparent: true, opacity: layer === 0 ? 0.45 : 0.7, sizeAttenuation: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      scene.add(pts);
      starLayers.push(pts);
    }

    // 感情の銀河（粒子の渦）— 密度波モデル: 傾きが半径で回る楕円軌道を全粒子が同じ角速度で回ると
    // 螺旋の腕が「形を保ったまま」回転する（差動回転だと数十秒で腕が巻き込まれて消える）
    const NP = NC * PER_CLUSTER;
    s.pCluster = new Uint8Array(NP);
    s.pR = new Float32Array(NP);
    s.pTheta = new Float32Array(NP);
    s.pOmega = new Float32Array(NP);
    s.pU = new Float32Array(NP * 3);
    s.pV = new Float32Array(NP * 3);
    s.pY = new Float32Array(NP);
    s.pBright = new Float32Array(NP);
    s.pSize = new Float32Array(NP);
    s.positions = new Float32Array(NP * 3);
    s.colors = new Float32Array(NP * 3);
    s.baseColors = new Float32Array(NP * 3);
    const clusterColor = EMOTIONS.map((e) => new THREE.Color(EMOTION_COLORS[e]));
    const up = new THREE.Vector3(0, 1, 0);
    // 各銀河の円盤の向き（少しずつ違う傾き）と回転方向
    const discBasis: { u: THREE.Vector3; v: THREE.Vector3; n: THREE.Vector3; dir: number; twist: number }[] = [];
    for (let c = 0; c < NC; c++) {
      const n = new THREE.Vector3((Math.random() - 0.5) * 0.5, 1, (Math.random() - 0.5) * 0.5).normalize();
      const u = new THREE.Vector3().crossVectors(n, up.dot(n) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize();
      const v = new THREE.Vector3().crossVectors(n, u).normalize();
      discBasis.push({ u, v, n, dir: c % 2 === 0 ? 1 : -1, twist: 0.105 + Math.random() * 0.03 });
    }
    for (let i = 0; i < NP; i++) {
      const c = Math.floor(i / PER_CLUSTER);
      const k = i % PER_CLUSTER;
      s.pCluster[i] = c;
      const halo = k < PER_CLUSTER * 0.12; // 一部は球状ハロー（円盤の外に薄く漂う）
      const r = halo
        ? 4 + DISC_R * 1.15 * Math.pow(Math.random(), 0.6)
        : 1.5 + DISC_R * Math.pow(Math.random(), 1.35);
      s.pR[i] = r;
      s.pTheta[i] = Math.random() * Math.PI * 2;
      // 同じ角速度（±6%）。内側の核だけ速く
      const base = 0.16 + 0.35 * Math.max(0, 1 - r / 9);
      s.pOmega[i] = base * (0.94 + Math.random() * 0.12) * discBasis[c].dir;
      const b = discBasis[c];
      if (halo) {
        // ハロー: ランダムな軌道面
        const nn = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const uu = new THREE.Vector3().crossVectors(nn, up).normalize();
        const vv = new THREE.Vector3().crossVectors(nn, uu).normalize();
        s.pU.set([uu.x, uu.y, uu.z], i * 3);
        s.pV.set([vv.x, vv.y, vv.z], i * 3);
        s.pY[i] = 0;
        s.pBright[i] = 0.12 + Math.random() * 0.2;
        s.pSize[i] = 0.8 + Math.random() * 0.8;
      } else {
        // 楕円軌道: 長軸の向きが半径に比例して回る → 2本腕の螺旋
        const tilt = r * b.twist;
        const ct = Math.cos(tilt);
        const st = Math.sin(tilt);
        // u' = cos·u + sin·v, v' = (-sin·u + cos·v) × 0.72（楕円）
        const ux = b.u.x * ct + b.v.x * st, uy = b.u.y * ct + b.v.y * st, uz = b.u.z * ct + b.v.z * st;
        const e = 0.72;
        const vx = (-b.u.x * st + b.v.x * ct) * e, vy = (-b.u.y * st + b.v.y * ct) * e, vz = (-b.u.z * st + b.v.z * ct) * e;
        s.pU.set([ux, uy, uz], i * 3);
        s.pV.set([vx, vy, vz], i * 3);
        // 円盤の厚み: 中心ほど厚く、外へ行くほど薄い
        s.pY[i] = (Math.random() - 0.5) * (1.2 + 3.5 * Math.max(0, 1 - r / 12)) * 0.5;
        const core = Math.max(0, 1 - r / 10);
        s.pBright[i] = 0.55 + Math.random() * 0.6 + core * 0.9;
        s.pSize[i] = 1.0 + Math.random() * 1.3 + core * 1.8;
      }
      const col = clusterColor[c].clone().offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.25 + (r < 6 ? 0.15 : 0));
      s.baseColors.set([col.r, col.g, col.b], i * 3);
      s.colors.set([col.r, col.g, col.b], i * 3);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(s.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("color", new THREE.BufferAttribute(s.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute("psize", new THREE.BufferAttribute(s.pSize, 1));
    s.geom = geom;
    const pmat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: host.clientHeight * 0.7 }, uMap: { value: makeDotTexture() } },
      vertexShader: `
        attribute float psize;
        varying vec3 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor * t.a, t.a);
        }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Points(geom, pmat));

    // 銀河の核の光: 小さく強い核 + 広く薄いハロー
    const glowTex = makeGlowTexture();
    const cores: THREE.Sprite[] = [];
    const halos: THREE.Sprite[] = [];
    EMOTIONS.forEach((e, i) => {
      const col = new THREE.Color(EMOTION_COLORS[e]);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: col.clone().lerp(new THREE.Color(0xffffff), 0.45), transparent: true,
        opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      core.position.set(...centers[i]);
      core.scale.set(12, 12, 1);
      scene.add(core);
      cores.push(core);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: col, transparent: true,
        opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.position.set(...centers[i]);
      halo.scale.set(44, 44, 1);
      scene.add(halo);
      halos.push(halo);
    });
    // 投票の衝撃波（リング）
    const ringTex = makeRingTexture();
    const waveGroup = new THREE.Group();
    scene.add(waveGroup);

    // カード
    const ms = momentsRef.current;
    const group = new THREE.Group();
    scene.add(group);
    s.primary = ms.map((m) => {
      const v = vecOf(m);
      let pi = 0;
      for (let i = 1; i < v.length; i++) if (v[i] > v[pi]) pi = i;
      return pi;
    });
    // カードは円盤の中に、黄金角で均等に散らす（同じ方向に固まらない）。半径は投票数の多いものほど内側
    const perCluster: number[][] = Array.from({ length: NC }, () => []);
    ms.forEach((_, i) => perCluster[s.primary[i]].push(i));
    s.offset = ms.map(() => [0, 0, 0] as Vec3);
    for (let c = 0; c < NC; c++) {
      const idxs = perCluster[c].sort((a, b) => ms[b].votes - ms[a].votes);
      const b = discBasis[c];
      idxs.forEach((i, k) => {
        const seed = mapPosition(ms[i], centers); // 決定論的なジッター源として使う
        const jitter = ((seed[0] * 7 + seed[2] * 3) % 1 + 1) % 1;
        const a = k * 2.399963 + jitter * 0.8 + c;
        const r = 5 + Math.sqrt((k + 0.5) / Math.max(1, idxs.length)) * DISC_R * 0.82;
        const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
        s.offset[i] = [
          b.u.x * ca + b.v.x * sa,
          b.u.y * ca + b.v.y * sa + 2.5 + jitter * 2,
          b.u.z * ca + b.v.z * sa,
        ];
      });
    }
    s.cur = ms.map((_, i) => {
      const c = centers[s.primary[i]];
      const o = s.offset[i];
      return [c[0] + o[0], c[1] + o[1], c[2] + o[2]] as Vec3;
    });
    s.target = s.cur.map((p) => [p[0], p[1], p[2]] as Vec3);
    s.alphaTarget = ms.map(() => 1);
    s.sprites = ms.map((m, i) => {
      const tex = makeCardTexture(m);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sp.position.set(...s.cur[i]);
      sp.userData.idx = i;
      group.add(sp);
      const img = new Image();
      img.onload = () => {
        drawCard(tex.image as HTMLCanvasElement, m, img);
        tex.needsUpdate = true;
      };
      img.src = `/api/thumb/${m.youtubeId}`;
      return sp;
    });

    s.camera = camera;
    s.controls = controls;

    // ホバー/クリック
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const pick = (clientX: number, clientY: number): number | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(s.sprites, false);
      for (const h of hits) {
        const idx = h.object.userData.idx as number;
        if (s.alphaTarget[idx] > 0.5) return idx; // 薄くしたカードは拾わない
      }
      return null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const idx = pick(e.clientX, e.clientY);
      if (idx !== s.hoverIdx) {
        s.hoverIdx = idx;
        setHoverTitle(idx === null ? null : momentsRef.current[idx]?.title ?? null);
        renderer.domElement.style.cursor = idx === null ? "grab" : "pointer";
      }
    };
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) return;
      const idx = pick(e.clientX, e.clientY);
      if (idx === null) return;
      const m = momentsRef.current[idx];
      if (m) onSelectRef.current(m);
    };
    const onLeave = () => { s.hoverIdx = null; setHoverTitle(null); };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.style.cursor = "grab";

    const onResize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.fov = viewFor(camera.aspect).fov;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
      composer.setSize(host.clientWidth, host.clientHeight);
      pmat.uniforms.uScale.value = host.clientHeight * 0.7;
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    let raf = 0;
    const tmp = new THREE.Vector3();
    const origin: Vec3 = [0, 0, 0];
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - (s.lastTime || now)) / 1000);
      s.lastTime = now;
      const t = now / 1000;
      const msNow = momentsRef.current;
      const maxVotes = Math.max(1, ...msNow.map((m) => m.votes));
      const q = queryRef.current;

      // クラスタ重みの追従
      const kw = 1 - Math.exp(-dt / 0.6);
      for (let c = 0; c < NC; c++) s.w[c] += (s.wTarget[c] - s.w[c]) * kw;
      s.qMix += ((q ? 1 : 0) - s.qMix) * kw;

      // 入場後のリビール（中心から引く）
      if (s.introStart !== undefined) {
        const tt = Math.min(1, (now - s.introStart) / 3000);
        const ease = 1 - Math.pow(1 - tt, 3);
        const home = viewFor(camera.aspect).home;
        const dist = 50 + ease * (home.z - 50);
        camera.position.set(Math.sin((1 - tt) * 0.5) * dist * 0.5, 24 + ease * (home.y - 24), Math.cos((1 - tt) * 0.5) * dist);
        controls.target.copy(HOME_TARGET);
        if (tt >= 1) s.introStart = undefined;
      }
      // カメラのトゥイーン（言葉の適用/解除）
      if (s.camTween) {
        const tw = s.camTween;
        const tt = Math.min(1, (now - tw.t0) / tw.dur);
        const ease = tt < 0.5 ? 4 * tt * tt * tt : 1 - Math.pow(-2 * tt + 2, 3) / 2;
        camera.position.lerpVectors(tw.fromP, tw.toP, ease);
        controls.target.lerpVectors(tw.fromT, tw.toT, ease);
        if (tt >= 1) s.camTween = undefined;
      }
      controls.autoRotate = !s.queryActive && !s.camTween;

      // 粒子の渦
      const P = s.positions;
      const C = s.colors;
      const B = s.baseColors;
      for (let i = 0; i < s.pCluster.length; i++) {
        const c = s.pCluster[i];
        const w = s.w[c];
        const cen = centers[c];
        // 言葉モード: 近い銀河は中心へ、遠い銀河は外へ退く
        const push = q ? 1 + 0.55 * (1 - w) * s.qMix : 1;
        const cx = cen[0] * push + (origin[0] - cen[0] * push) * w;
        const cy = cen[1] * push + (origin[1] - cen[1] * push) * w;
        const cz = cen[2] * push + (origin[2] - cen[2] * push) * w;
        const r = s.pR[i] * (1 - 0.25 * w);
        const th = s.pTheta[i] + t * s.pOmega[i] * (1 + 1.2 * w);
        const cs = Math.cos(th);
        const sn = Math.sin(th);
        const i3 = i * 3;
        P[i3] = cx + r * (s.pU[i3] * cs + s.pV[i3] * sn);
        P[i3 + 1] = cy + r * (s.pU[i3 + 1] * cs + s.pV[i3 + 1] * sn) + s.pY[i];
        P[i3 + 2] = cz + r * (s.pU[i3 + 2] * cs + s.pV[i3 + 2] * sn);
        // 明滅 + 言葉モードでは関係の薄い銀河を沈める
        const twinkle = 0.75 + 0.25 * Math.sin(t * 2.2 + i * 0.37);
        const dim = q ? 0.07 + 0.93 * w : 1;
        const b = s.pBright[i] * twinkle * dim;
        C[i3] = B[i3] * b;
        C[i3 + 1] = B[i3 + 1] * b;
        C[i3 + 2] = B[i3 + 2] * b;
      }
      geom.attributes.position.needsUpdate = true;
      geom.attributes.color.needsUpdate = true;

      // 銀河の核: 言葉モードでは中心へ寄り、関係の薄いものは消える
      for (let c = 0; c < NC; c++) {
        const w = s.w[c];
        const cen = centers[c];
        const push = q ? 1 + 0.55 * (1 - w) * s.qMix : 1;
        const x = cen[0] * push * (1 - w), y = cen[1] * push * (1 - w), z = cen[2] * push * (1 - w);
        cores[c].position.set(x, y, z);
        halos[c].position.set(x, y, z);
        const dim = q ? 0.05 + 0.95 * w : 1;
        const pulse = 1 + 0.08 * Math.sin(t * 1.7 + c);
        (cores[c].material as THREE.SpriteMaterial).opacity = 0.95 * dim;
        (halos[c].material as THREE.SpriteMaterial).opacity = 0.12 * dim;
        const sc = 12 * pulse * (1 + 0.5 * w);
        cores[c].scale.set(sc, sc, 1);
        const hs = 44 * (1 + 0.4 * w);
        halos[c].scale.set(hs, hs, 1);
      }
      // 衝撃波: 広がって消える
      for (let k = s.waves.length - 1; k >= 0; k--) {
        const wv = s.waves[k];
        const age = (now - wv.t0) / 1000;
        if (age > 1.1) { waveGroup.remove(wv.sp); (wv.sp.material as THREE.SpriteMaterial).dispose(); s.waves.splice(k, 1); continue; }
        const f = age / 1.1;
        const sz = 4 + 24 * (1 - Math.pow(1 - f, 2.2));
        wv.sp.scale.set(sz, sz, 1);
        (wv.sp.material as THREE.SpriteMaterial).opacity = 0.9 * (1 - f) * (1 - f);
      }

      // カード
      const kp = 1 - Math.exp(-dt / 0.6);
      for (let i = 0; i < s.sprites.length; i++) {
        const sp = s.sprites[i];
        const m = msNow[i];
        // 地図モードの目標: 銀河の中を公転
        if (!q) {
          const c = centers[s.primary[i]];
          const o = s.offset[i];
          // 円盤と同じ向き・同じ速さで公転する
          const ang = t * 0.16 * discBasis[s.primary[i]].dir + s.primary[i];
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          s.target[i] = [c[0] + o[0] * ca - o[2] * sa, c[1] + o[1], c[2] + o[0] * sa + o[2] * ca];
        }
        const cu = s.cur[i];
        const tg = s.target[i];
        cu[0] += (tg[0] - cu[0]) * kp;
        cu[1] += (tg[1] - cu[1]) * kp;
        cu[2] += (tg[2] - cu[2]) * kp;
        sp.position.set(cu[0], cu[1] + Math.sin(t * 0.9 + i) * 0.4, cu[2]);

        const norm = m ? Math.pow(m.votes / maxVotes, 0.7) : 0.3;
        let size = (q && s.alphaTarget[i] > 0.5 ? 6 + 6 * (1 - s.simRank[i]) : 5.5) + 10 * norm;
        if (s.hoverIdx === i) size *= 1.5;
        const mat = sp.material as THREE.SpriteMaterial;
        mat.opacity += (s.alphaTarget[i] - mat.opacity) * kp;
        // 投票の閃光: 一瞬明るくなり、ブルームが拾う
        const pt = m ? s.pulseAt.get(m.id) : undefined;
        let bright = 1;
        if (pt) {
          const age = (Date.now() - pt) / 1000;
          if (age < 1.2) {
            const f = 1 - age / 1.2;
            size *= 1 + 0.5 * f;
            bright = 1 + 0.8 * f;
          }
          if (!sp.userData.wavedAt || sp.userData.wavedAt !== pt) {
            // 投票の閃光: カードの位置から色のリングが広がる
            sp.userData.wavedAt = pt;
            const ring = new THREE.Sprite(new THREE.SpriteMaterial({
              map: ringTex, color: new THREE.Color(EMOTION_COLORS[m!.emotions[0]]), transparent: true,
              opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
            }));
            ring.position.copy(sp.position);
            ring.scale.set(6, 6, 1);
            waveGroup.add(ring);
            s.waves.push({ sp: ring, t0: now });
          }
        }
        if (s.hoverIdx === i) bright = Math.max(bright, 1.25);
        mat.color.setScalar(bright);
        const cs = sp.scale.x + (size - sp.scale.x) * (1 - Math.exp(-dt / 0.18));
        sp.scale.set(cs, cs * CARD_ASPECT, 1);
      }

      // 遠景の星をゆっくり回す
      starLayers[0].rotation.y = t * 0.004;
      starLayers[1].rotation.y = -t * 0.0025;

      // 歓声（ホバー中のカード）
      const crowd = getCrowd();
      if (soundOnRef.current) {
        const hi = s.hoverIdx;
        const m = hi !== null ? msNow[hi] : undefined;
        if (m && hi !== null) {
          tmp.copy(s.sprites[hi].position).project(camera);
          crowd.setFocus({
            key: m.id,
            level: 0.35 + 0.65 * Math.pow(m.votes / maxVotes, 0.7),
            pan: Math.max(-0.85, Math.min(0.85, tmp.x)),
          });
        } else crowd.setFocus(null);
      }

      // ラベル投影
      const rect = renderer.domElement.getBoundingClientRect();
      const portrait = viewFor(camera.aspect).t; // 縦画面ほど見下ろし → ラベルは奥（-z）へずらすと画面上で上に出る
      for (let i = 0; i < centers.length; i++) {
        const el = labelRefs.current[i];
        if (!el) continue;
        const w = s.w[i];
        const push = q ? 1 + 0.55 * (1 - w) * s.qMix : 1;
        tmp.set(
          centers[i][0] * push * (1 - w),
          centers[i][1] * push * (1 - w) + (DISC_R * 0.9 + 8 * w) * (1 - portrait * 0.7),
          centers[i][2] * push * (1 - w) - DISC_R * 1.15 * portrait
        ).project(camera);
        const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2;
        el.style.opacity = visible ? (q ? String(w < 0.35 ? 0 : 0.2 + 0.75 * w) : "0.92") : "0";
        el.style.transform = `translate(${((tmp.x + 1) / 2) * rect.width}px, ${((1 - tmp.y) / 2) * rect.height}px) translate(-50%, -50%)`;
      }

      controls.update();
      composer.render();
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="galaxy" ref={hostRef}>
      <div className="galaxy-labels">
        {EMOTIONS.map((e, i) => (
          <div
            key={e}
            ref={(el) => { labelRefs.current[i] = el; }}
            className="galaxy-label"
            style={{ color: EMOTION_COLORS[e] }}
          >
            {e}
          </div>
        ))}
      </div>
      {hoverTitle && <div className="galaxy-hover">{hoverTitle}</div>}
    </div>
  );
}

function makeGlowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.25, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeRingTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 48, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.45, "rgba(255,255,255,1)");
  g.addColorStop(0.6, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeDotTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function drawCard(c: HTMLCanvasElement, m: MomentWithStats, img?: HTMLImageElement) {
  const W = c.width;
  const H = c.height;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  const r = 14;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(W, 0, W, H, r);
  ctx.arcTo(W, H, 0, H, r);
  ctx.arcTo(0, H, 0, 0, r);
  ctx.arcTo(0, 0, W, 0, r);
  ctx.closePath();
  ctx.clip();
  if (img) {
    const s = Math.max(W / img.width, H / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#26262e");
    g.addColorStop(1, "#0b0b0e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const shade = ctx.createLinearGradient(0, H * 0.5, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px 'Helvetica Neue', 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "bottom";
  let title = m.title;
  while (ctx.measureText(title).width > W - 28 && title.length > 2) title = title.slice(0, -2) + "…";
  ctx.fillText(title, 14, H - 14);
  ctx.restore();
  ctx.strokeStyle = EMOTION_COLORS[m.emotions[0]];
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(r, 2.5);
  ctx.arcTo(W - 2.5, 2.5, W - 2.5, H - 2.5, r);
  ctx.arcTo(W - 2.5, H - 2.5, 2.5, H - 2.5, r);
  ctx.arcTo(2.5, H - 2.5, 2.5, 2.5, r);
  ctx.arcTo(2.5, 2.5, W - 2.5, 2.5, r);
  ctx.closePath();
  ctx.stroke();
}

function makeCardTexture(m: MomentWithStats): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 216;
  drawCard(c, m);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

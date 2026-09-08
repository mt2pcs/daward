"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getCrowd } from "@/lib/crowd";
import {
  EMOTION_COLORS,
  clusterCenters,
  cosine,
  mapPosition,
  queryPosition,
  vecOf,
  type Vec3,
} from "@/lib/emotionSpace";
import { EMOTIONS, type MomentWithStats } from "@/lib/types";

// 感情の宇宙。
// - 8つの感情の星団に、100の瞬間がカード（スプライト）として浮かぶ
// - 投票数がカードの大きさ。ホバーで歓声が鳴り、クリックで詳細へ
// - 言葉（query）が来ると、似ている瞬間が中心の塊へ集まり、遠いものは外周へ流れる
export interface GalaxyQuery {
  vec: number[];
  label: string;
}

const CARD_ASPECT = 9 / 16;

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
  active: boolean; // 入場後にtrue → カメラのリビール
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
  const pulsesRef = useRef(pulses);
  const activeRef = useRef(active);

  const centers = useMemo(() => clusterCenters(), []);

  // シーンの状態（Reactを介さず毎フレーム更新）
  const state = useRef<{
    sprites: THREE.Sprite[];
    ids: string[];
    mapPos: Vec3[];
    target: Vec3[];
    cur: Vec3[];
    baseScale: number[];
    hoverIdx: number | null;
    pulseAt: Map<string, number>;
    camera?: THREE.PerspectiveCamera;
    controls?: OrbitControls;
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    introStart?: number;
    lastTime: number;
  }>({
    sprites: [],
    ids: [],
    mapPos: [],
    target: [],
    cur: [],
    baseScale: [],
    hoverIdx: null,
    pulseAt: new Map(),
    lastTime: 0,
  });

  // 目標位置の再計算（地図モード / 言葉モード）
  const retarget = () => {
    const s = state.current;
    const q = queryRef.current;
    const ms = momentsRef.current;
    for (let i = 0; i < s.ids.length; i++) {
      const m = ms[i];
      if (!m) continue;
      if (q) {
        const sim = cosine(vecOf(m), q.vec);
        s.target[i] = queryPosition(s.mapPos[i], sim, m.id);
      } else {
        s.target[i] = s.mapPos[i];
      }
    }
  };

  useEffect(() => {
    queryRef.current = query;
    retarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    pulsesRef.current = pulses;
    const s = state.current;
    for (const [id, t] of Object.entries(pulses)) s.pulseAt.set(id, t);
  }, [pulses]);

  useEffect(() => {
    if (active && !activeRef.current) state.current.introStart = performance.now();
    activeRef.current = active;
  }, [active]);

  // 初期化
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const s = state.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.FogExp2(0x050505, 0.0032);
    const camera = new THREE.PerspectiveCamera(
      55,
      host.clientWidth / host.clientHeight,
      0.5,
      2000
    );
    camera.position.set(0, 18, 42);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 28;
    controls.maxDistance = 300;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.target.set(0, 0, 0);

    // 背景の星
    {
      const n = 1800;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = 260 + Math.random() * 420;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.cos(ph);
        pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.4,
        transparent: true,
        opacity: 0.55,
        sizeAttenuation: true,
        depthWrite: false,
      });
      scene.add(new THREE.Points(g, mat));
    }

    // 星団のグロー（感情ごとの色の靄）
    const glowTex = makeGlowTexture();
    EMOTIONS.forEach((e, i) => {
      const mat = new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color(EMOTION_COLORS[e]),
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(...centers[i]);
      sp.scale.set(70, 70, 1);
      scene.add(sp);
    });

    // カード
    const ms = momentsRef.current;
    const group = new THREE.Group();
    scene.add(group);
    s.ids = ms.map((m) => m.id);
    s.mapPos = ms.map((m) => mapPosition(m, centers));
    s.cur = s.mapPos.map((p) => [p[0], p[1], p[2]] as Vec3);
    s.target = s.mapPos.map((p) => [p[0], p[1], p[2]] as Vec3);
    s.sprites = ms.map((m, i) => {
      const tex = makeCardTexture(m);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sp = new THREE.Sprite(mat);
      sp.position.set(...s.cur[i]);
      sp.userData.idx = i;
      group.add(sp);
      // サムネイルは同一オリジン中継から読み込んで描き直す
      const img = new Image();
      img.onload = () => {
        drawCard(tex.image as HTMLCanvasElement, m, img);
        tex.needsUpdate = true;
      };
      img.src = `/api/thumb/${m.youtubeId}`;
      return sp;
    });
    s.baseScale = ms.map(() => 10);

    s.scene = scene;
    s.camera = camera;
    s.renderer = renderer;
    s.controls = controls;

    // ホバー/クリック
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let lastClient = { x: 0, y: 0 };
    const pick = (clientX: number, clientY: number): number | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(s.sprites, false);
      if (hits.length === 0) return null;
      return hits[0].object.userData.idx as number;
    };
    const onMove = (e: PointerEvent) => {
      lastClient = { x: e.clientX, y: e.clientY };
      if (e.pointerType !== "mouse") return;
      const idx = pick(e.clientX, e.clientY);
      if (idx !== s.hoverIdx) {
        s.hoverIdx = idx;
        setHoverTitle(idx === null ? null : momentsRef.current[idx]?.title ?? null);
      }
    };
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) return; // ドラッグは選択しない
      const idx = pick(e.clientX, e.clientY);
      if (idx === null) return;
      const m = momentsRef.current[idx];
      if (m) onSelectRef.current(m);
    };
    const onLeave = () => {
      s.hoverIdx = null;
      setHoverTitle(null);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    const onResize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    // 毎フレーム
    let raf = 0;
    const tmp = new THREE.Vector3();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - (s.lastTime || now)) / 1000);
      s.lastTime = now;
      const msNow = momentsRef.current;
      const maxVotes = Math.max(1, ...msNow.map((m) => m.votes));

      // 入場後のリビール: 中心から引いていく
      if (s.introStart !== undefined) {
        const t = Math.min(1, (now - s.introStart) / 2800);
        const ease = 1 - Math.pow(1 - t, 3);
        const dist = 30 + ease * 140;
        const dir = camera.position.clone().sub(controls.target).normalize();
        camera.position.copy(controls.target).add(dir.multiplyScalar(dist));
        if (t >= 1) s.introStart = undefined;
      }

      // 位置の追従（トゥイーン）
      const k = 1 - Math.exp(-dt / 0.55);
      const q = queryRef.current;
      for (let i = 0; i < s.sprites.length; i++) {
        const c = s.cur[i];
        const tg = s.target[i];
        c[0] += (tg[0] - c[0]) * k;
        c[1] += (tg[1] - c[1]) * k;
        c[2] += (tg[2] - c[2]) * k;
        const sp = s.sprites[i];
        // 静かな浮遊
        const bob = Math.sin(now * 0.0006 + i * 1.7) * 0.6;
        sp.position.set(c[0], c[1] + bob, c[2]);

        const m = msNow[i];
        const norm = m ? Math.pow(m.votes / maxVotes, 0.7) : 0.3;
        let size = 8 + 11 * norm;
        if (q && m) {
          // 言葉モード: 似ているものほど大きく、遠いものは控えめに
          const sim = cosine(vecOf(m), q.vec);
          size *= 0.7 + 0.6 * sim;
        }
        if (s.hoverIdx === i) size *= 1.35;
        const pt = m ? s.pulseAt.get(m.id) : undefined;
        if (pt) {
          const age = (Date.now() - pt) / 1000;
          if (age < 1.2) size *= 1 + 0.45 * (1 - age / 1.2);
        }
        const cs = sp.scale.x + (size - sp.scale.x) * (1 - Math.exp(-dt / 0.18));
        sp.scale.set(cs, cs * CARD_ASPECT, 1);
      }

      // 歓声: ホバー中のカード（音量=投票数、定位=画面上の位置）
      const crowd = getCrowd();
      if (soundOnRef.current) {
        const hi = s.hoverIdx;
        const m = hi !== null ? msNow[hi] : undefined;
        if (m && hi !== null) {
          tmp.copy(s.sprites[hi].position).project(camera);
          const level = 0.35 + 0.65 * Math.pow(m.votes / maxVotes, 0.7);
          crowd.setFocus({
            key: m.id,
            level,
            pan: Math.max(-0.85, Math.min(0.85, tmp.x)),
          });
        } else {
          crowd.setFocus(null);
        }
      }

      // 星団ラベルを投影
      const rect = renderer.domElement.getBoundingClientRect();
      for (let i = 0; i < centers.length; i++) {
        const el = labelRefs.current[i];
        if (!el) continue;
        tmp.set(...centers[i]).project(camera);
        const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2;
        el.style.opacity = visible ? (q ? "0.25" : "0.9") : "0";
        el.style.transform = `translate(${((tmp.x + 1) / 2) * rect.width}px, ${
          ((1 - tmp.y) / 2) * rect.height
        }px) translate(-50%, -50%)`;
      }

      controls.update();
      renderer.render(scene, camera);
      void lastClient;
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
            ref={(el) => {
              labelRefs.current[i] = el;
            }}
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
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function drawCard(c: HTMLCanvasElement, m: MomentWithStats, img?: HTMLImageElement) {
  const W = c.width;
  const H = c.height;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  // 角丸クリップ
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
    // cover
    const s = Math.max(W / img.width, H / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#1c1c22");
    g.addColorStop(1, "#0b0b0e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const shade = ctx.createLinearGradient(0, H * 0.45, 0, H);
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
  // 主感情の色の縁
  ctx.strokeStyle = EMOTION_COLORS[m.emotions[0]];
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(r, 3);
  ctx.arcTo(W - 3, 3, W - 3, H - 3, r);
  ctx.arcTo(W - 3, H - 3, 3, H - 3, r);
  ctx.arcTo(3, H - 3, 3, 3, r);
  ctx.arcTo(3, 3, W - 3, 3, r);
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

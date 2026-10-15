"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LOGO, C, BURST } from "@/components/site/LogoBurst";

// KV の背景: ロゴの放射が奥行きのある空間に伸び、奥から手前へ流れてくる。ロゴ（LogoBurst）は壊さず、その後ろに置く。
// 消失点＝ロゴの DAZN フレームの中心。破片はロゴと同じ文法（直線の面・くさびと平行四辺形・ロゴの色・半透明で重なる）で、
// 3D の板として奥（z −Zf）から手前へ進み、通り過ぎたら奥で別の形に生まれ直す。遠い破片はロゴの炸裂の外縁より内側では見せない
// （ロゴの形と混ざらない）。発光・粒子・残像などの効果は使わない。
// 時刻は決定的（位置を t から計算）なので、検証で window.__lbT を止めればその時刻の画になる。
// ロゴの画素から採った色。暗い2色（#900030 / #3f7a5c）は黒地で半透明にすると濁るので空間では使わない
const COLORS = ["#ff3366", "#ff8866", "#922a88", "#ff1a26", "#ff0020", "#ccdd66", "#4de6ff", "#dd8820", "#66ccff", "#dff257", "#ff3355", "#ffee55"];
const ZF = 140; // 生まれる奥行き
const ZN = 1.5; // カメラの手前で消える位置
const SPEED = 9; // 単位/秒（奥から手前まで約15秒）

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `precision highp float;
uniform vec3 uColor; uniform float uAlpha;
void main(){ gl_FragColor = vec4(uColor * uAlpha, uAlpha); }`;

// 0..1 の決定的な乱数
const hash = (i: number, n: number, k: number) => { const x = Math.sin(i * 127.1 + n * 311.7 + k * 74.7) * 43758.5453; return x - Math.floor(x); };

type Shard = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; i: number; ph: number; cyc: number };

// 消失点 (vx,vy) から向き (dx,dy) へ進んで矩形の外へ出るまでの距離。矩形に当たらなければ 0
const exitDist = (vx: number, vy: number, dx: number, dy: number, r: { left: number; top: number; right: number; bottom: number }) => {
  let t0 = 0, t1 = Infinity;
  for (const [p, d, lo, hi] of [[vx, dx, r.left, r.right], [vy, dy, r.top, r.bottom]] as const) {
    if (Math.abs(d) < 1e-6) { if (p < lo || p > hi) return 0; continue; }
    const a = (lo - p) / d, b = (hi - p) / d;
    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  }
  return t1 > t0 ? t1 : 0;
};

// avoid: ロゴの下の文字とボタンの帯。破片はロゴとこの帯の外に出てから現れる（文字の上を流れない）
export default function SpaceStream({ logo, avoid }: { logo: string; avoid?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, premultipliedAlpha: true }); }
    catch { return; }
    renderer.setClearColor(0x000000, 1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 400);
    const small = cv.clientWidth < 700;
    const N = small ? 90 : 150;
    const geo = new THREE.BufferGeometry();
    // 単位の板（x: 0→1 が内→外、y: −0.5→0.5）。形は頂点を毎回書き換えず、生まれ直すときに scale と skew で変える
    geo.setAttribute("position", new THREE.Float32BufferAttribute([0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0], 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const shards: Shard[] = [];
    for (let i = 0; i < N; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
      });
      const mesh = new THREE.Mesh(geo.clone(), mat);
      scene.add(mesh);
      shards.push({ mesh, mat, i, ph: hash(i, 0, 9), cyc: -1 });
    }
    // 生まれ直すたびに形・向き・色を決める（くさび＝内側が細い／平行四辺形＝同じ幅でずれる）
    const shape = (s: Shard, cyc: number) => {
      const r = (k: number) => hash(s.i, cyc, k);
      const wide = r(1) < 0.18;
      const L = 5 + r(2) * 18;
      const wo = (wide ? 2.2 : 0.4) + r(3) * (wide ? 3.2 : 1.4);
      const wedge = r(4) < 0.55;
      const wi = wedge ? wo * r(5) * 0.25 : wo;
      const skew = (r(6) - 0.5) * wo * 1.2;
      const p = s.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      p.setXYZ(0, 0, -wi / 2, 0); p.setXYZ(1, L, -wo / 2 + skew, 0); p.setXYZ(2, L, wo / 2 + skew, 0); p.setXYZ(3, 0, wi / 2, 0);
      p.needsUpdate = true;
      s.mesh.userData = { th: r(7) * Math.PI * 2, r0: 4 + r(8) * 14, tilt: (r(10) - 0.5) * 1.3, pitch: -(0.15 + r(11) * 0.55) };
      s.mat.uniforms.uColor.value.set(COLORS[Math.floor(r(12) * COLORS.length)]);
      s.cyc = cyc;
    };
    const travel = (t: number) => SPEED * t + SPEED * 6 * 0.7 * (1 - Math.exp(-t / 0.7)); // 読み込み時はロゴの炸裂と一緒に勢いよく流れ、すぐ巡航へ
    let raf = 0, t0 = 0, px = 0, py = 0, tx = 0, ty = 0, last = 0, extra = 0;
    const onMove = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; };
    addEventListener("pointermove", onMove, { passive: true });
    const look = new THREE.Vector3(0, 0, -ZF);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const rc = cv.getBoundingClientRect();
      if (rc.bottom < 0 || rc.top > innerHeight) return;
      const lg = document.querySelector(logo) as HTMLElement | null;
      if (!lg) return;
      if (!t0) t0 = now;
      const fz = (window as any).__lbT;
      const t = typeof fz === "number" ? fz : reduce ? 6 : Math.max(0, (now - t0) / 1000);
      const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000)); last = now;
      const dpr = Math.min(1.75, devicePixelRatio || 1);
      const W = rc.width, H = rc.height;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); }
      // 消失点＝フレームの中心。ロゴの炸裂の外縁（画面上の半径）より内では破片を見せない
      const lr = lg.getBoundingClientRect();
      const vx = lr.left - rc.left + (C[0] / LOGO.w) * lr.width, vy = lr.top - rc.top + (C[1] / LOGO.h) * lr.height;
      const k = lr.height / LOGO.h, m = 14;
      const logoBox = { left: lr.left - rc.left + BURST[0] * k - m, right: lr.left - rc.left + BURST[2] * k + m, top: lr.top - rc.top + BURST[1] * k - m, bottom: lr.bottom - rc.top + m };
      const av = avoid ? (document.querySelector(avoid) as HTMLElement | null)?.getBoundingClientRect() : null;
      const textBox = av ? { left: av.left - rc.left - m, right: av.right - rc.left + m, top: av.top - rc.top - m, bottom: av.bottom - rc.top + m } : null;
      camera.aspect = W / H; camera.fov = W < H ? 72 : 55;
      camera.setViewOffset(W, H, W / 2 - vx, H / 2 - vy, W, H);
      camera.updateProjectionMatrix();
      // カーソルで視点がわずかに動く（奥行きの手がかり）
      if (!reduce && typeof fz !== "number") { px += (tx - px) * (1 - Math.exp(-dt / 0.8)); py += (ty - py) * (1 - Math.exp(-dt / 0.8)); }
      camera.position.set(px * 3.2, -py * 2.4, 0); camera.lookAt(look);
      const scroll = Math.min(1, Math.max(0, -rc.top / Math.max(1, rc.height)));
      if (typeof fz !== "number" && !reduce) extra += dt * SPEED * 2.5 * scroll; // スクロール中は少し速く
      const fade = reduce ? 1 : Math.min(1, Math.max(0, (t - 0.25) / 0.9));
      const fpx = H / 2 / Math.tan((camera.fov * Math.PI) / 360); // 1単位の奥行きあたりの画面の画素
      const dist = travel(t) + extra;
      for (const s of shards) {
        const u = s.ph * ZF + dist;
        const cyc = Math.floor(u / ZF);
        if (cyc !== s.cyc) shape(s, cyc);
        const z = -ZF + (u - cyc * ZF);
        if (z > -ZN) { s.mesh.visible = false; continue; }
        s.mesh.visible = true;
        const d = s.mesh.userData as { th: number; r0: number; tilt: number; pitch: number };
        s.mesh.position.set(Math.cos(d.th) * d.r0, Math.sin(d.th) * d.r0, z);
        // 内端を軸側に、外へ放射。外端は手前へ起こし（pitch）、自分の軸まわりに少し傾ける（tilt）＝立体の板
        s.mesh.rotation.set(0, 0, 0);
        s.mesh.rotateZ(d.th); s.mesh.rotateY(d.pitch); s.mesh.rotateX(d.tilt);
        // 破片ごとに現れる: 内端が画面上でロゴの炸裂の外縁を越えたら（ロゴの形に混ぜない）。手前に来すぎたら消える
                const dx = Math.cos(d.th), dy = -Math.sin(d.th);
        const ex = Math.max(exitDist(vx, vy, dx, dy, logoBox), textBox ? exitDist(vx, vy, dx, dy, textBox) : 0);
        // 外に出た奥行き zOut から 0.4 秒ぶん進むあいだに現れる（画素ではなく時間で。半透明の暗い色を長く見せない）
        const zOut = ex > 0 ? -(fpx * d.r0) / ex : -ZF;
        const out = Math.min(1, Math.max(0, (z - zOut) / (SPEED * 0.4)));
        const near = Math.min(1, Math.max(0, (-z - 3) / 4));
        s.mat.uniforms.uAlpha.value = 0.8 * out * near * fade * (1 - 0.7 * scroll);
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("pointermove", onMove); shards.forEach((s) => { s.mesh.geometry.dispose(); s.mat.dispose(); }); geo.dispose(); renderer.dispose(); };
  }, [logo]);
  return <canvas ref={ref} className="is-space" aria-hidden />;
}

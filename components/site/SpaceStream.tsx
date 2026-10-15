"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LOGO, C } from "@/components/site/LogoBurst";

// KV の背景: ロゴの放射が奥行きのある空間に伸び、奥から手前へ流れてくる。ロゴ（LogoBurst）は壊さず、その後ろに置く。
// 消失点＝ロゴの DAZN フレームの中心。破片はロゴと同じ文法（直線の面・くさびと平行四辺形・ロゴの色・半透明で重なる）で、
// 3D の板として奥の一点（z −Zf の軸上＝フレームの裏）から生まれ、軸から放射状に離れながら育ち、手前へ抜ける。通り過ぎたら奥で別の形に生まれ直す。
// ロゴの後ろも通る（ロゴの隙間から奥の空間が見える＝ロゴと空間が続いている）。フェードで出し入れしない。発光・粒子・残像などの効果は使わない。
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

export default function SpaceStream({ logo }: { logo: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    // 動きを減らす設定のときは止めずにゆっくり流す（速さ 40%、読み込み時の勢いと視差なし）
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, premultipliedAlpha: true }); }
    catch { return; }
    renderer.setClearColor(0x000000, 1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 400);
    const small = cv.clientWidth < 700;
    const N = small ? 70 : 115;
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
      s.mesh.userData = { th: r(7) * Math.PI * 2, r0: 3 + r(8) * 15, tilt: (r(10) - 0.5) * 1.3, pitch: -(0.15 + r(11) * 0.55) };
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
      const t = typeof fz === "number" ? fz : Math.max(0, (now - t0) / 1000);
      const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000)); last = now;
      const dpr = Math.min(1.75, devicePixelRatio || 1);
      const W = rc.width, H = rc.height;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); }
      // 消失点＝フレームの中心
      const lr = lg.getBoundingClientRect();
      const vx = lr.left - rc.left + (C[0] / LOGO.w) * lr.width, vy = lr.top - rc.top + (C[1] / LOGO.h) * lr.height;
      camera.aspect = W / H; camera.fov = W < H ? 72 : 55;
      camera.setViewOffset(W, H, W / 2 - vx, H / 2 - vy, W, H);
      camera.updateProjectionMatrix();
      // カーソルで視点がわずかに動く（奥行きの手がかり）
      if (!reduce && typeof fz !== "number") { px += (tx - px) * (1 - Math.exp(-dt / 0.8)); py += (ty - py) * (1 - Math.exp(-dt / 0.8)); }
      camera.position.set(px * 3.2, -py * 2.4, 0); camera.lookAt(look);
      const scroll = Math.min(1, Math.max(0, -rc.top / Math.max(1, rc.height)));
      if (typeof fz !== "number" && !reduce) extra += dt * SPEED * 2.5 * scroll; // スクロール中は少し速く
      const fade = reduce ? 1 : Math.min(1, Math.max(0, (t - 0.25) / 0.9));
      const dist = reduce && typeof fz !== "number" ? SPEED * 0.4 * t + 40 : travel(t) + extra;
      for (const s of shards) {
        const w = s.ph * ZF + dist;
        const cyc = Math.floor(w / ZF);
        if (cyc !== s.cyc) shape(s, cyc);
        const z = -ZF + (w - cyc * ZF);
        if (z > -ZN) { s.mesh.visible = false; continue; }
        s.mesh.visible = true;
        const d = s.mesh.userData as { th: number; r0: number; tilt: number; pitch: number };
        // 奥の一点（軸上）から生まれ、進むほど軸から離れ（u に比例）、大きさも 0 から育つ
        const u = (z + ZF) / ZF;
        const g = Math.min(1, u / 0.6); // 中心の近くでは細く小さい（ロゴの炸裂を埋めない）
        s.mesh.position.set(Math.cos(d.th) * d.r0 * u, Math.sin(d.th) * d.r0 * u, z);
        s.mesh.scale.setScalar(Math.max(0.001, g * (2 - g)));
        // 内端を軸側に、外へ放射。外端は手前へ起こし（pitch）、自分の軸まわりに少し傾ける（tilt）＝立体の板
        s.mesh.rotation.set(0, 0, 0);
        s.mesh.rotateZ(d.th); s.mesh.rotateY(d.pitch); s.mesh.rotateX(d.tilt);
        // 手前でカメラにぶつかる直前だけ消す（それ以外で出し入れしない）
        const near = Math.min(1, Math.max(0, (-z - 3) / 4));
        s.mat.uniforms.uAlpha.value = 0.82 * near * fade * (1 - 0.7 * scroll);
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("pointermove", onMove); shards.forEach((s) => { s.mesh.geometry.dispose(); s.mat.dispose(); }); geo.dispose(); renderer.dispose(); };
  }, [logo]);
  return <canvas ref={ref} className="is-space" aria-hidden />;
}

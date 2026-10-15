"use client";
import { useEffect, useRef } from "react";

// KV のロゴそのものを動かす。支給ロゴ（awards2026_logo.webp・1214×2000）の炸裂部分を、DAZN フレームの中心から放射方向に伸縮させて描く
// （破片は放射状なので、放射方向の拡大はそれぞれの破片を自分の向きに伸ばすことになる。別の破片を足さない）。フレームとワードマークは動かさない。
// 動き: 読み込みでフレームの裏から破片が伸びて開く（角度ごとに少しずらす）→ 拍動が円周を回る（歓声の波）→ カーソルの方向の破片が伸びる
// → スクロールで外へ広がりながら消える。WebGL が無い・動きを減らす設定のときは <img> のまま（静止ロゴ）。
// 座標はロゴ画像の画素（下の数値は支給画像を計測した値）。
// ロゴの外は透明に描き、後ろの空間（SpaceStream）が見えるようにする。
export const LOGO = { w: 1214, h: 2000 };
export const C = [606, 611]; // DAZN フレームの中心
const FRAME = [411, 416, 801, 806]; // フレーム（白枠）の外接矩形 x0,y0,x1,y1
export const BURST = [194, 113, 1020, 1109]; // 炸裂の範囲
const WORD_Y = 1062; // これより下はワードマーク（DAZN AWARDS 2026）

const VERT = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;      // キャンバスの画素
uniform vec4 uLogo;     // ロゴ画像の位置（キャンバス画素）x, y, 縮尺(画素/ロゴ画素), 0
uniform float uT, uScroll, uPtrA, uPtrK, uStill;
out vec4 o;
const vec2 C = vec2(${C[0]}.0, ${C[1]}.0);
const vec4 FR = vec4(${FRAME.join(".0, ")}.0);
const vec4 BU = vec4(${BURST.join(".0, ")}.0);
const vec2 SZ = vec2(${LOGO.w}.0, ${LOGO.h}.0);
vec4 tx(vec2 p){ return texture(uTex, p / SZ); }
bool inR(vec2 p, vec4 r){ return p.x >= r.x && p.y >= r.y && p.x <= r.z && p.y <= r.w; }
float sat(vec3 c){ return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
float pulse(float x){ x = fract(x); return x < 0.07 ? x / 0.07 : exp(-(x - 0.07) * 6.0); }
void main(){
  vec2 f = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 P = (f - uLogo.xy) / uLogo.z;
  vec2 d = P - C; float th = atan(d.y, d.x);
  // 読み込み: 角度ごとに遅れて、フレームの裏から伸びる
  float dl = 0.05 + 0.12 * (0.5 + 0.5 * sin(th * 2.0 + 1.1)) + 0.06 * (0.5 + 0.5 * sin(th * 5.0 + 0.3));
  float k = clamp((uT - dl) / 1.1, 0.0, 1.0);
  float e = 1.0 - pow(2.0, -10.0 * k);
  float s = mix(0.34, 1.0, e);
  // 拍動が円周を回る（3.4秒ごと）＋ゆっくりした呼吸
  float life = smoothstep(1.2, 2.2, uT) * (1.0 - uStill);
  s += life * (0.07 * pulse((uT - 1.8) / 3.4 - th / 6.2832 * 0.32) + 0.015 * sin(uT * 0.7 + th * 2.0));
  // カーソルの方向の破片が伸びる
  float da = abs(mod(th - uPtrA + 3.14159, 6.28318) - 3.14159);
  s += 0.11 * uPtrK * exp(-pow(da / 0.55, 2.0));
  // スクロールで外へ広がる
  s *= 1.0 + 2.6 * pow(uScroll, 1.3);
  vec3 col = vec3(0.0);
  float a = -1.0;
  vec4 FRx = FR + vec4(-5.0, -5.0, 5.0, 5.0); // 白枠の縁のにじみ
  if (inR(P, FR)) {
    col = tx(P).rgb; a = 1.0; // フレームの中は黒のまま不透明
  } else {
    vec2 Q = C + d / s;
    if (inR(Q, BU) && !inR(Q, FRx)) {
      vec3 b = tx(Q).rgb;
      if (Q.y < float(${WORD_Y}) || sat(b) > 0.15) col = b * smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.45, 1.0, uScroll));
    }
    if (P.y > float(${WORD_Y})) { vec3 w = tx(P).rgb; if (sat(w) < 0.12) col = max(col, w); }
  }
  // ロゴは黒地の上の色なので、そのまま乗算済みの色として扱い、黒い所だけ透かす
  if (a < 0.0) a = max(max(col.r, col.g), col.b);
  o = vec4(col, a);
}`;

export default function LogoBurst({ img, src }: { img: string; src: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    // 「視差効果/アニメーションを減らす」設定のときも止めない（会社の PC では既定で入っていることが多く、止めると壊れて見える）。
    // その場合は開く演出を省いて最初から開いた形にし、拍動を弱め、カーソルとスクロールには反応させない。
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = cv.getContext("webgl2", { antialias: false, premultipliedAlpha: true, alpha: true });
    if (!gl) return;
    const sh = (type: number, s: string) => { const x = gl.createShader(type)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) || "shader"); return x; };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!; gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
    } catch (e) { console.error("LogoBurst", e); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = U("uRes"), uLogo = U("uLogo"), uT = U("uT"), uScroll = U("uScroll"), uPtrA = U("uPtrA"), uPtrK = U("uPtrK"), uStill = U("uStill");

    let raf = 0, t0 = 0, ready = false, dead = false;
    let ptrA = 0, ptrK = 0, ptrTarget = 0, ptrX = 0, ptrY = 0, last = 0;
    const im = new Image();
    im.onload = () => {
      if (dead) return;
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ready = true; raf = requestAnimationFrame(frame);
    };
    im.src = src;
    const onMove = (e: PointerEvent) => { ptrX = e.clientX; ptrY = e.clientY; ptrTarget = e.pointerType === "mouse" ? 1 : 0; };
    const onLeave = () => { ptrTarget = 0; };
    addEventListener("pointermove", onMove, { passive: true }); document.addEventListener("pointerleave", onLeave);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const host = cv.parentElement!, logo = document.querySelector(img) as HTMLElement | null;
      if (!logo) return;
      const rc = cv.getBoundingClientRect();
      if (rc.bottom < 0 || rc.top > innerHeight) return; // 画面外では描かない
      if (!t0) t0 = now;
      const fz = (window as any).__lbT; // 検証用: 時刻を止めて撮る
      const t = typeof fz === "number" ? fz : (reduce ? 10 : 0) + Math.max(0, (now - t0) / 1000);
      const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000)); last = now;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = Math.round(rc.width * dpr), H = Math.round(rc.height * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const lr = logo.getBoundingClientRect();
      const scale = (lr.height * dpr) / LOGO.h;
      const cx = lr.left + (C[0] / LOGO.w) * lr.width, cy = lr.top + (C[1] / LOGO.h) * lr.height;
      const lx = (cx - rc.left) * dpr - C[0] * scale, ly = (cy - rc.top) * dpr - C[1] * scale;
      // カーソル: フレーム中心からの角度。KV の中にあるときだけ効く
      const inside = ptrY >= rc.top && ptrY <= rc.bottom;
      const tgtA = Math.atan2(ptrY - cy, ptrX - cx);
      let dA = tgtA - ptrA; dA = Math.atan2(Math.sin(dA), Math.cos(dA)); ptrA += dA * (1 - Math.exp(-dt / 0.25));
      ptrK += ((reduce ? 0 : ptrTarget * (inside ? 1 : 0)) - ptrK) * (1 - Math.exp(-dt / 0.6));
      const scroll = Math.min(1, Math.max(0, -rc.top / Math.max(1, rc.height * 0.7)));
      gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRes, W, H); gl.uniform4f(uLogo, lx, ly, scale, 0);
      gl.uniform1f(uT, t); gl.uniform1f(uScroll, reduce ? 0 : scroll); gl.uniform1f(uPtrA, ptrA); gl.uniform1f(uPtrK, ptrK); gl.uniform1f(uStill, reduce ? 0.5 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!host.classList.contains("gl-on")) host.classList.add("gl-on");
    };
    (window as any).__logoBurst = { ready: () => ready };
    return () => { dead = true; cancelAnimationFrame(raf); removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave); };
  }, [img, src]);
  return <canvas ref={ref} className="is-logo-gl" aria-hidden />;
}

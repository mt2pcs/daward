import * as THREE from "three";

// GPU流体シミュレーション（Stable Fluids / Navier-Stokes）— 熱狂の渦の本体。
// 100本のサムネイルを「染料」として流体に載せ、中心の渦の力で本物の墨流しにする。
//   1フレーム: 渦の力 → 曲率(curl)→ 渦度強調(vorticity) → 発散 → 圧力(Jacobi) → 勾配除去 → 速度の移流 → 染料の移流
// 構成は PavelDoGreat/WebGL-Fluid-Simulation と同じ古典的なパイプライン（半精度浮動小数のping-pong）。

const VERT = `
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main() {
  vUv = uv;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COPY = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uScale;
void main() { gl_FragColor = texture2D(uTexture, vUv) * uScale; }
`;

// 染料の初期化: サムネイルのモザイク（16:9のセル、セルごとにアトラスの写真を選ぶ）
const MOSAIC = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform float uAspect;
uniform vec2 uCell;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 cell = q / uCell;
  vec2 id = floor(cell);
  vec2 f = fract(cell);
  float k = floor(hash(id + 3.1) * uGrid.x * uGrid.y);
  vec2 t = vec2(mod(k, uGrid.x), floor(k / uGrid.x));
  vec2 uv = (t + f) / uGrid;
  float g = smoothstep(0.0, 0.02, f.x) * smoothstep(0.0, 0.035, f.y) * smoothstep(1.0, 0.98, f.x) * smoothstep(1.0, 0.965, f.y);
  vec3 c = texture2D(uAtlas, uv).rgb * (0.2 + 0.8 * g);
  gl_FragColor = vec4(c, 1.0);
}
`;

const ADVECT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec4 result = texture2D(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}
`;

// 渦の力: 中心まわりの接線方向へ押し、少しだけ内へ引く。中心付近ほど強い
// MacCormack移流（染料用）: 前進→後退で誤差を推定して補正し、近傍でクランプ。単純な半ラグランジュより滲まない
const ADVECT_MC = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 velTexel;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;
  vec2 back = vUv - dt * vel * velTexel;
  vec4 phiHat = texture2D(uSource, back);
  vec2 velBack = texture2D(uVelocity, back).xy;
  vec2 fwd = back + dt * velBack * velTexel;
  vec4 phiHatBack = texture2D(uSource, fwd);
  vec4 result = phiHat + 0.5 * (texture2D(uSource, vUv) - phiHatBack);
  vec4 n0 = texture2D(uSource, back + vec2(texelSize.x, 0.0));
  vec4 n1 = texture2D(uSource, back - vec2(texelSize.x, 0.0));
  vec4 n2 = texture2D(uSource, back + vec2(0.0, texelSize.y));
  vec4 n3 = texture2D(uSource, back - vec2(0.0, texelSize.y));
  vec4 mn = min(min(n0, n1), min(n2, n3));
  vec4 mx = max(max(n0, n1), max(n2, n3));
  result = clamp(result, mn, mx);
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}
`;

const VORTEX = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform float dt;
uniform vec2 uCenter;
uniform float uAspect;
uniform float uStrength;
uniform float uCore;
uniform float uPull;
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
  float r = length(d) + 1e-4;
  vec2 tangent = vec2(-d.y, d.x) / r;
  float f = exp(-(r * r) / (uCore * uCore)) * smoothstep(0.0, 0.05, r);
  // 流れのゆらぎ（同じ所を同じ速さで回ると帯が単調になる）
  float w = 0.75 + 0.5 * noise(vec2(r * 6.0 - uTime * 0.3, atan(d.y, d.x) * 1.5 + uTime * 0.2));
  vec2 force = tangent * uStrength * f * w - (d / r) * uPull * f;
  vec2 v = texture2D(uVelocity, vUv).xy + force * dt;
  gl_FragColor = vec4(v, 0.0, 1.0);
}
`;

const SPLAT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}
`;

const CURL = `
precision highp float;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`;

const VORTICITY = `
precision highp float;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main() {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -1000.0), 1000.0);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;

const DIVERGENCE = `
precision highp float;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

const PRESSURE = `
precision highp float;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

const GRADIENT = `
precision highp float;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;

interface Pair { read: THREE.WebGLRenderTarget; write: THREE.WebGLRenderTarget; swap(): void }

function target(w: number, h: number, linear: boolean): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
    magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}
function pair(w: number, h: number, linear: boolean): Pair {
  const p = { read: target(w, h, linear), write: target(w, h, linear), swap() { const t = p.read; p.read = p.write; p.write = t; } };
  return p;
}

export interface FluidParams {
  strength: number; // 渦の力（texel/s²）
  core: number; // 渦の力が及ぶ半径（画面高さ比）
  pull: number; // 内向きの引き
  curl: number; // 渦度強調
  velDissipation: number;
  dyeDissipation: number;
  pressureIters: number;
}

export class FluidSim {
  readonly renderer: THREE.WebGLRenderer;
  readonly simW: number;
  readonly simH: number;
  readonly dyeW: number;
  readonly dyeH: number;
  readonly aspect: number;
  params: FluidParams = { strength: 900, core: 0.55, pull: 60, curl: 25, velDissipation: 0.25, dyeDissipation: 0.02, pressureIters: 18 };
  center = new THREE.Vector2(0.5, 0.5);
  private velocity: Pair;
  private dye: Pair;
  private pressure: Pair;
  private divergence: THREE.WebGLRenderTarget;
  private curl: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private mats: Record<string, THREE.ShaderMaterial> = {};
  private time = 0;

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number, simRes = 192, dyeRes = 768) {
    this.renderer = renderer;
    this.aspect = width / height;
    const a = this.aspect;
    this.simH = simRes;
    this.simW = Math.round(simRes * a);
    this.dyeH = dyeRes;
    this.dyeW = Math.round(dyeRes * a);
    this.velocity = pair(this.simW, this.simH, true);
    this.dye = pair(this.dyeW, this.dyeH, true);
    this.pressure = pair(this.simW, this.simH, false);
    this.divergence = target(this.simW, this.simH, false);
    this.curl = target(this.simW, this.simH, false);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene.add(this.quad);
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: { texelSize: { value: new THREE.Vector2() }, ...uniforms }, depthTest: false, depthWrite: false });
    this.mats.copy = mk(COPY, { uTexture: { value: null }, uScale: { value: 1 } });
    this.mats.mosaic = mk(MOSAIC, { uAtlas: { value: null }, uGrid: { value: new THREE.Vector2(8, 5) }, uAspect: { value: a }, uCell: { value: new THREE.Vector2(0.34, 0.19125) } });
    this.mats.advect = mk(ADVECT, { uVelocity: { value: null }, uSource: { value: null }, dt: { value: 0 }, dissipation: { value: 0 } });
    this.mats.advectMC = mk(ADVECT_MC, { uVelocity: { value: null }, uSource: { value: null }, velTexel: { value: new THREE.Vector2(1 / this.simW, 1 / this.simH) }, dt: { value: 0 }, dissipation: { value: 0 } });
    this.mats.vortex = mk(VORTEX, { uVelocity: { value: null }, dt: { value: 0 }, uCenter: { value: this.center }, uAspect: { value: a }, uStrength: { value: 0 }, uCore: { value: 0.5 }, uPull: { value: 0 }, uTime: { value: 0 } });
    this.mats.splat = mk(SPLAT, { uTarget: { value: null }, uAspect: { value: a }, uColor: { value: new THREE.Vector3() }, uPoint: { value: new THREE.Vector2() }, uRadius: { value: 0.01 } });
    this.mats.curl = mk(CURL, { uVelocity: { value: null } });
    this.mats.vorticity = mk(VORTICITY, { uVelocity: { value: null }, uCurl: { value: null }, curl: { value: 0 }, dt: { value: 0 } });
    this.mats.divergence = mk(DIVERGENCE, { uVelocity: { value: null } });
    this.mats.pressure = mk(PRESSURE, { uPressure: { value: null }, uDivergence: { value: null } });
    this.mats.gradient = mk(GRADIENT, { uPressure: { value: null }, uVelocity: { value: null } });
  }

  get dyeTexture(): THREE.Texture { return this.dye.read.texture; }
  get velocityTexture(): THREE.Texture { return this.velocity.read.texture; }

  private run(mat: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget, texel: [number, number]) {
    mat.uniforms.texelSize.value.set(texel[0], texel[1]);
    this.quad.material = mat;
    this.renderer.setRenderTarget(to);
    this.renderer.render(this.scene, this.cam);
  }
  private simTexel(): [number, number] { return [1 / this.simW, 1 / this.simH]; }
  private dyeTexel(): [number, number] { return [1 / this.dyeW, 1 / this.dyeH]; }

  // 染料をサムネイルのモザイクで満たす
  fillMosaic(atlas: THREE.Texture, grid: [number, number], cell: [number, number]) {
    const m = this.mats.mosaic;
    m.uniforms.uAtlas.value = atlas;
    m.uniforms.uGrid.value.set(grid[0], grid[1]);
    m.uniforms.uCell.value.set(cell[0], cell[1]);
    this.run(m, this.dye.write, this.dyeTexel());
    this.dye.swap();
    this.renderer.setRenderTarget(null);
  }

  // 染料全体を暗くする（写真を溶かす）
  fade(scale: number) {
    const m = this.mats.copy;
    m.uniforms.uTexture.value = this.dye.read.texture;
    m.uniforms.uScale.value = scale;
    this.run(m, this.dye.write, this.dyeTexel());
    this.dye.swap();
    this.renderer.setRenderTarget(null);
  }

  // 染料と速度を一点に注ぐ（インクの一滴 + 流れ）
  splat(x: number, y: number, dx: number, dy: number, color: [number, number, number], radius: number) {
    const m = this.mats.splat;
    m.uniforms.uPoint.value.set(x, y);
    m.uniforms.uRadius.value = radius;
    m.uniforms.uTarget.value = this.velocity.read.texture;
    m.uniforms.uColor.value.set(dx, dy, 0);
    this.run(m, this.velocity.write, this.simTexel());
    this.velocity.swap();
    m.uniforms.uTarget.value = this.dye.read.texture;
    m.uniforms.uColor.value.set(color[0], color[1], color[2]);
    this.run(m, this.dye.write, this.dyeTexel());
    this.dye.swap();
    this.renderer.setRenderTarget(null);
  }

  step(dtRaw: number, strengthScale = 1) {
    const dt = Math.min(dtRaw, 1 / 30);
    this.time += dt;
    const p = this.params;
    const st = this.simTexel();
    // 渦の力
    let m = this.mats.vortex;
    m.uniforms.uVelocity.value = this.velocity.read.texture;
    m.uniforms.dt.value = dt;
    m.uniforms.uStrength.value = p.strength * strengthScale;
    m.uniforms.uCore.value = p.core;
    m.uniforms.uPull.value = p.pull * strengthScale;
    m.uniforms.uTime.value = this.time;
    this.run(m, this.velocity.write, st);
    this.velocity.swap();
    // curl → vorticity
    m = this.mats.curl;
    m.uniforms.uVelocity.value = this.velocity.read.texture;
    this.run(m, this.curl, st);
    m = this.mats.vorticity;
    m.uniforms.uVelocity.value = this.velocity.read.texture;
    m.uniforms.uCurl.value = this.curl.texture;
    m.uniforms.curl.value = p.curl;
    m.uniforms.dt.value = dt;
    this.run(m, this.velocity.write, st);
    this.velocity.swap();
    // divergence → pressure → gradient
    m = this.mats.divergence;
    m.uniforms.uVelocity.value = this.velocity.read.texture;
    this.run(m, this.divergence, st);
    m = this.mats.pressure;
    m.uniforms.uDivergence.value = this.divergence.texture;
    for (let i = 0; i < p.pressureIters; i++) {
      m.uniforms.uPressure.value = this.pressure.read.texture;
      this.run(m, this.pressure.write, st);
      this.pressure.swap();
    }
    m = this.mats.gradient;
    m.uniforms.uPressure.value = this.pressure.read.texture;
    m.uniforms.uVelocity.value = this.velocity.read.texture;
    this.run(m, this.velocity.write, st);
    this.velocity.swap();
    // advect velocity, then dye
    m = this.mats.advect;
    m.uniforms.uVelocity.value = this.velocity.read.texture;
    m.uniforms.uSource.value = this.velocity.read.texture;
    m.uniforms.dt.value = dt;
    m.uniforms.dissipation.value = p.velDissipation;
    this.run(m, this.velocity.write, st);
    this.velocity.swap();
    m = this.mats.advectMC;
    m.uniforms.uVelocity.value = this.velocity.read.texture;
    m.uniforms.uSource.value = this.dye.read.texture;
    m.uniforms.dt.value = dt;
    m.uniforms.dissipation.value = p.dyeDissipation;
    this.run(m, this.dye.write, this.dyeTexel());
    this.dye.swap();
    this.renderer.setRenderTarget(null);
  }

  dispose() {
    for (const t of [this.velocity.read, this.velocity.write, this.dye.read, this.dye.write, this.pressure.read, this.pressure.write, this.divergence, this.curl]) t.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

// ロゴパレット（染料は明るめに。半精度なので1を超えて発光できる）
export const INK_COLORS: [number, number, number][] = [
  [1.25, 0.3, 0.26], [1.3, 0.5, 0.72], [1.3, 0.72, 0.34], [0.5, 1.15, 0.56], [0.36, 0.88, 1.28], [0.75, 0.5, 1.28], [1.1, 1.3, 0.42],
];

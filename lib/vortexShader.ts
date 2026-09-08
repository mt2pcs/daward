// 熱狂の渦 — 画面全体の液体状の渦（フラグメントシェーダー）。
// 入場時はサムネイルのモザイクそのものが捻れて渦になり（ロゴのコンセプト画像そのまま）、
// 入場後は写真が溶けてロゴパレットの色の帯だけが流れ続け、3Dのカードの背景になる。
//   uPhoto : 写真の見え方 0..1
//   uTwist : 捻りの強さ（rad）。時間で育つ
//   uSpin  : 追加の回転（ドラッグ・組み替え時の加速）
//   uBurst : 中心の閃光 0..1
//   uGlow  : 色の帯の明るさ

export const VORTEX_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const VORTEX_FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform float uPhoto;
uniform float uTwist;
uniform float uSpin;
uniform vec2 uCenter;
uniform float uBurst;
uniform float uGlow;
uniform float uZoom;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
// ロゴパレット
vec3 pal(float i) {
  i = mod(i, 7.0);
  if (i < 1.0) return vec3(0.92, 0.20, 0.18);
  if (i < 2.0) return vec3(1.00, 0.36, 0.54);
  if (i < 3.0) return vec3(1.00, 0.54, 0.24);
  if (i < 4.0) return vec3(0.37, 0.88, 0.42);
  if (i < 5.0) return vec3(0.25, 0.66, 0.96);
  if (i < 6.0) return vec3(0.55, 0.36, 0.96);
  return vec3(0.84, 1.00, 0.29);
}
// 写真のモザイク（16:9のセル。セルごとにアトラスのどの写真かを決める）
vec3 photoAt(vec2 q) {
  vec2 cell = q / vec2(0.34, 0.19125);
  vec2 id = floor(cell);
  vec2 f = fract(cell);
  float k = floor(hash(id + 3.1) * uGrid.x * uGrid.y);
  vec2 t = vec2(mod(k, uGrid.x), floor(k / uGrid.x));
  vec2 uv = (t + f) / uGrid;
  float g = smoothstep(0.0, 0.025, f.x) * smoothstep(0.0, 0.04, f.y) * smoothstep(1.0, 0.975, f.x) * smoothstep(1.0, 0.96, f.y);
  return texture2D(uAtlas, uv).rgb * (0.25 + 0.75 * g);
}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = (vUv - uCenter) * vec2(asp, 1.0) / uZoom;
  float r = length(p);
  float a = atan(p.y, p.x);
  // 捻りは中心に集中（外周の写真は形を保つ）。uPhoto が下がる（入場後）ほど広い範囲が流れる
  float core = mix(0.56, 0.95, 1.0 - uPhoto);
  float rc4 = (r / core) * (r / core);
  float f = exp(-rc4 * rc4); // 中心はほぼ一様に回り、外周へは急に収まる（外の写真は形を保つ）
  // 墨流しのゆらぎ: 流れの向きをノイズで揺らす
  float warp = (fbm(vec2(r * 3.0 + uTime * 0.07, 0.0) + vec2(cos(a), sin(a)) * 1.3) - 0.5) * 1.6 * f;
  float tw = uTwist * f + warp + uSpin * (0.15 + 0.85 * f) + uTime * 0.12 * (0.1 + f);

  // 写真: 角度方向にぼかしながら（流れ）サンプル
  vec3 photo = vec3(0.0);
  if (uPhoto > 0.001) {
    float smear = (0.01 + 0.4 * f) * (0.06 + uTwist * 0.035);
    const int N = 9;
    for (int k = 0; k < N; k++) {
      float ak = a + tw + (float(k) / float(N - 1) - 0.5) * smear;
      float rk = r * (1.0 - 0.12 * f) + 0.02 * fbm(vec2(ak * 2.0, r * 3.0));
      vec2 q = vec2(cos(ak), sin(ak)) * rk;
      photo += photoAt(q);
    }
    photo /= float(N);
  }

  // 色の帯: 捻れた極座標の中で帯を作り、角度方向に長いノイズで筋にする
  float fr = exp(-(r * r) / 1.1); // 帯は写真より広い範囲で流れる
  float twr = uTwist * fr * 0.9 + uSpin * (0.2 + 0.8 * fr) + uTime * 0.12 * (0.1 + fr);
  float band = (a + twr * 1.15) / 6.28318 * 3.0 + r * 5.0 + fbm(vec2(r * 2.5 + uTime * 0.05, 0.0) + vec2(cos(a), sin(a)) * 0.8) * 1.1;
  float bi = floor(band);
  float bf = fract(band);
  float ribbon = smoothstep(0.05, 0.3, bf) * smoothstep(0.62, 0.42, bf);
  float bm = mod(bi, 3.0); // 角度の継ぎ目（±π）で色や筋が切れないよう、3周期で畳む
  float streak = fbm(vec2(cos(a + twr), sin(a + twr)) * 1.2 + vec2(bm * 3.7, r * 16.0 - uTime * 0.35));
  ribbon *= smoothstep(0.35, 0.75, streak);
  float hue = bm + floor(hash(vec2(bm, 7.0)) * 3.0);
  vec3 rc = pal(hue);
  float rib = ribbon * (0.15 + 0.85 * fr) * uGlow;
  // 細く明るい筋（流線）
  float thin = (a + twr * 1.2) / 6.28318 * 6.0 + r * 9.0 + fbm(vec2(r * 3.0, uTime * 0.1) + vec2(cos(a), sin(a)) * 1.2) * 0.9;
  float tf = fract(thin);
  float line = smoothstep(0.0, 0.08, tf) * smoothstep(0.16, 0.08, tf);
  line *= smoothstep(0.3, 0.8, fbm(vec2(mod(floor(thin), 6.0) * 0.7 + tf, r * 9.0 - uTime * 0.5)));
  vec3 lc = pal(mod(floor(thin), 6.0) + 4.0);
  float photoMask = smoothstep(0.015, 0.11, r) * smoothstep(1.15, 0.6, r);
  vec3 col = photo * uPhoto * photoMask * 0.95;
  col += rc * rib * (1.0 - 0.88 * uPhoto);
  col += lc * line * (0.1 + 0.9 * fr) * uGlow * (0.55 + 0.25 * uPhoto);
  // 周辺減光（外は黒） と 中心の目
  col *= 0.12 + 0.88 * smoothstep(1.05, 0.42, r);
  col *= 0.45 + 0.55 * smoothstep(0.0, 0.07, r);
  // 閃光
  col += vec3(1.0, 0.98, 0.9) * uBurst * exp(-r * 2.6);
  gl_FragColor = vec4(col, 1.0);
}
`;

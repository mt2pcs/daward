// 操作の効果音（Web Audio 合成、外部素材なし）。歓声エンジン（crowd.ts）とは独立した軽い音。
//   enter: 渦に入る（風切りの上昇＋低い唸り）  whoosh: カメラ移動  blip: ホバー  swish: ツアー送り
//   suction: 送信中の吸い込み（結果が来るまで持続）  stamp: ラベルが立つ  boom: 再配置の衝撃  hit: 投票
//
// 音量設計（2026-09-08 「音ならない」の真因と対策）:
//   旧実装は exponentialRamp で 0.0001 まで減衰させる包絡で、帯域通過ノイズのゲイン補正も無く、
//   OfflineAudioContext 実測で RMS −45dB（歓声 crowd.ogg は −17.6dB）。歓声の下に完全に埋もれて聞こえなかった。
//   現行: 立ち上がり→保持→setTargetAtTime の自然減衰、フィルタ後のノイズはゲインを大きく取り、
//   master の前に DynamicsCompressor を置いてピークを揃える。目標: ピーク −6dB前後 / 本体 RMS −20dB前後。
//   検証: scratchpad/harness/sfx_off.mjs（各SEをオフラインレンダリングして dB を出す）。
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bus: GainNode | null = null; // 各SE → bus → compressor → master(音量) → destination
let noiseBuf: AudioBuffer | null = null;
let volume = 0.6;
let suctionNodes: { stop: (t: number) => void; gain: GainNode } | null = null;
let lastBlip = 0;
let analyser: AnalyserNode | null = null;
let peak = 0;
export function sfxLevel(): number {
  if (!analyser) return 0;
  const d = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(d);
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
  const rms = Math.sqrt(sum / d.length);
  peak = Math.max(peak, rms);
  return rms;
}
const played: Record<string, number> = {}; // 検証用（window.__sfx で見える）
function mark(k: string) {
  played[k] = (played[k] || 0) + 1;
  if (typeof window !== "undefined")
    (window as unknown as { __sfx?: unknown }).__sfx = {
      played, level: sfxLevel, get state() { return ctx?.state; }, get peak() { return peak; },
      get volume() { return master?.gain.value; }, get ctx() { return ctx; }, get master() { return master; }, get api() { return sfx; },
    };
}

function build(c: AudioContext) {
  master = c.createGain();
  master.gain.value = volume;
  master.connect(c.destination);
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  comp.connect(master);
  bus = c.createGain();
  bus.gain.value = 1;
  bus.connect(comp);
  // 検証用: 実際に音が出ているかを master の出力で測る
  analyser = c.createAnalyser();
  analyser.fftSize = 1024;
  master.connect(analyser);
  const len = c.sampleRate * 2;
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}
// 検証用: OfflineAudioContext を差し込んで各SEの音量を数値で測る（本番では呼ばれない）
export function attachContextForTest(c: AudioContext) {
  ctx = c;
  build(c);
}
function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    build(ctx);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// 包絡: attack で peak へ、hold の間保持、その後 release の時定数で自然減衰。戻り値は終了時刻。
function envelope(g: GainNode, t0: number, peakGain: number, attack: number, hold: number, release: number) {
  const p = g.gain;
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(peakGain, t0 + attack);
  p.setValueAtTime(peakGain, t0 + attack + hold);
  p.setTargetAtTime(0, t0 + attack + hold, release / 3);
  return t0 + attack + hold + release;
}
type NoiseOpt = { from: number; to: number; gain: number; q?: number; attack?: number; hold?: number; release?: number; type?: BiquadFilterType; at?: number };
function noise(o: NoiseOpt) {
  const c = ensure();
  if (!c || !bus || !noiseBuf) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.loopStart = Math.random();
  const f = c.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.Q.value = o.q ?? 1;
  const dur = (o.attack ?? 0.02) + (o.hold ?? 0) + (o.release ?? 0.3);
  f.frequency.setValueAtTime(o.from, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + dur);
  const g = c.createGain();
  const end = envelope(g, t0, o.gain, o.attack ?? 0.02, o.hold ?? 0, o.release ?? 0.3);
  src.connect(f).connect(g).connect(bus);
  src.start(t0);
  src.stop(end + 0.05);
}
type ToneOpt = { freq: number; to?: number; gain: number; type?: OscillatorType; attack?: number; hold?: number; release?: number; lp?: number; lpTo?: number; at?: number };
function tone(o: ToneOpt) {
  const c = ensure();
  if (!c || !bus) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  const dur = (o.attack ?? 0.005) + (o.hold ?? 0) + (o.release ?? 0.3);
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  const g = c.createGain();
  const end = envelope(g, t0, o.gain, o.attack ?? 0.005, o.hold ?? 0, o.release ?? 0.3);
  let head: AudioNode = osc;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(o.lp, t0);
    if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t0 + dur);
    head.connect(f);
    head = f;
  }
  head.connect(g).connect(bus);
  osc.start(t0);
  osc.stop(end + 0.05);
}

export const sfx = {
  start() { ensure(); },
  setVolume(v: number) { volume = v; if (master) master.gain.value = v; },
  // 渦に入る: 風切りが立ち上がって、低い唸りと一筋の高い光
  enter() {
    mark("enter");
    noise({ from: 160, to: 5000, gain: 3.2, q: 0.9, attack: 1.1, hold: 0.5, release: 1.2 });
    tone({ freq: 60, to: 34, gain: 0.55, type: "sawtooth", lp: 260, lpTo: 90, attack: 0.4, hold: 1.0, release: 1.4 });
    tone({ freq: 48, to: 30, gain: 0.5, attack: 0.3, hold: 1.2, release: 1.2 });
    tone({ freq: 1320, to: 3200, gain: 0.08, attack: 0.9, hold: 0.2, release: 1.0 });
  },
  // カメラの移動: 短い風切り
  whoosh(strength = 1) {
    mark("whoosh");
    noise({ from: 2800, to: 260, gain: 2.4 * strength, q: 1.1, attack: 0.06, hold: 0.16, release: 0.5 });
    tone({ freq: 220, to: 70, gain: 0.25 * strength, type: "triangle", attack: 0.03, hold: 0.1, release: 0.4 });
  },
  // ホバー: 短く高いチック
  blip() {
    mark("blip");
    const now = performance.now();
    if (now - lastBlip < 90) return;
    lastBlip = now;
    tone({ freq: 1500, to: 2300, gain: 0.16, attack: 0.004, hold: 0.02, release: 0.09 });
    noise({ from: 5000, to: 3000, gain: 0.7, q: 2, attack: 0.003, hold: 0.01, release: 0.05, type: "highpass" });
  },
  // ツアーの送り: スウィッシュ＋小さな鐘
  swish() {
    mark("swish");
    noise({ from: 3200, to: 500, gain: 2.2, q: 1.4, attack: 0.03, hold: 0.08, release: 0.4 });
    tone({ freq: 880, to: 1320, gain: 0.22, attack: 0.01, hold: 0.05, release: 0.45 });
    tone({ freq: 2640, gain: 0.08, attack: 0.01, hold: 0.02, release: 0.6, at: 0.04 });
  },
  // 送信: 吸い込みが続く（stopSuction まで）
  suction() {
    mark("suction");
    const c = ensure();
    if (!c || !bus || !noiseBuf || suctionNodes) return;
    const t0 = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = c.createBiquadFilter();
    f.type = "bandpass"; f.Q.value = 1.6;
    f.frequency.setValueAtTime(140, t0);
    f.frequency.exponentialRampToValueAtTime(3200, t0 + 7);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(2.6, t0 + 0.9);
    src.connect(f).connect(g).connect(bus);
    src.start(t0);
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(38, t0);
    osc.frequency.exponentialRampToValueAtTime(110, t0 + 7);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 2; lp.frequency.setValueAtTime(180, t0);
    lp.frequency.exponentialRampToValueAtTime(900, t0 + 7);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0, t0);
    g2.gain.linearRampToValueAtTime(0.5, t0 + 0.9);
    osc.connect(lp).connect(g2).connect(bus);
    osc.start(t0);
    const gate = c.createGain();
    suctionNodes = {
      gain: gate,
      stop: (t: number) => {
        for (const p of [g.gain, g2.gain]) { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(0, t, 0.12); }
        src.stop(t + 0.6); osc.stop(t + 0.6);
      },
    };
  },
  stopSuction() {
    mark("stopSuction");
    const c = ctx;
    if (!c || !suctionNodes) return;
    suctionNodes.stop(c.currentTime);
    suctionNodes = null;
  },
  // ラベルが立つ: スタンプの打音（重い低音＋乾いた叩き）
  stamp() {
    mark("stamp");
    noise({ from: 1400, to: 180, gain: 3.5, q: 0.8, attack: 0.004, hold: 0.03, release: 0.16, type: "lowpass" });
    tone({ freq: 170, to: 55, gain: 0.8, type: "square", lp: 700, lpTo: 120, attack: 0.004, hold: 0.04, release: 0.18 });
    tone({ freq: 90, to: 45, gain: 0.7, attack: 0.004, hold: 0.06, release: 0.22 });
  },
  // 再配置: 衝撃＋きらめき
  boom() {
    mark("boom");
    tone({ freq: 62, to: 26, gain: 1.0, attack: 0.01, hold: 0.5, release: 1.6 });
    tone({ freq: 55, to: 30, gain: 0.55, type: "sawtooth", lp: 420, lpTo: 60, attack: 0.01, hold: 0.3, release: 1.2 });
    noise({ from: 260, to: 6000, gain: 3.0, q: 0.7, attack: 0.02, hold: 0.25, release: 1.0 });
    tone({ freq: 1760, to: 3520, gain: 0.16, attack: 0.02, hold: 0.2, release: 1.2 });
    tone({ freq: 2637, gain: 0.1, attack: 0.02, hold: 0.3, release: 1.4, at: 0.06 });
  },
  // 投票: 明るい打音
  hit() {
    mark("hit");
    tone({ freq: 660, to: 990, gain: 0.5, type: "triangle", attack: 0.005, hold: 0.08, release: 0.45 });
    tone({ freq: 1320, gain: 0.32, attack: 0.005, hold: 0.1, release: 0.6 });
    tone({ freq: 1980, gain: 0.14, attack: 0.005, hold: 0.05, release: 0.7, at: 0.05 });
    noise({ from: 3600, to: 900, gain: 2.0, q: 1.2, attack: 0.005, hold: 0.04, release: 0.3 });
  },
};

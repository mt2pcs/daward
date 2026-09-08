// 操作の効果音（Web Audio 合成、外部素材なし）。歓声エンジン（crowd.ts）とは独立した軽い音。
//   enter: 渦に入る（低い唸り＋風切り）  whoosh: カメラ移動  blip: ホバー  swish: ツアー送り
//   suction: 送信中の吸い込み（結果が来るまで持続）  stamp: ラベルが立つ  boom: 再配置の衝撃  hit: 投票
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let volume = 0.6;
let suctionNodes: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
let lastBlip = 0;
const played: Record<string, number> = {}; // 検証用（window.__sfx で見える）
function mark(k: string) { played[k] = (played[k] || 0) + 1; if (typeof window !== "undefined") (window as unknown as { __sfx?: unknown }).__sfx = { played, state: ctx?.state }; }

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function noise(dur: number, from: number, to: number, gainPeak: number, q = 1, attack = 0.02, type: BiquadFilterType = "bandpass") {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gainPeak, c.currentTime + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(f).connect(g).connect(master);
  src.start();
  src.stop(c.currentTime + dur + 0.05);
}
function tone(freq: number, dur: number, gainPeak: number, type: OscillatorType = "sine", slideTo?: number) {
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gainPeak, c.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(c.currentTime + dur + 0.05);
}

export const sfx = {
  start() { ensure(); },
  setVolume(v: number) { volume = v; if (master) master.gain.value = v; },
  // 渦に入る: 風切りが上がって、低い唸り
  enter() { mark("enter"); noise(2.4, 300, 3000, 0.5, 0.8, 0.6); tone(48, 2.6, 0.35, "sine", 30); tone(96, 1.2, 0.12, "triangle"); },
  // カメラの移動
  whoosh(strength = 1) { mark("whoosh"); noise(0.7, 1800, 400, 0.28 * strength, 1.2, 0.08); },
  // ホバー: ごく短い高いクリック
  blip() { mark("blip");
    const now = performance.now();
    if (now - lastBlip < 90) return;
    lastBlip = now;
    tone(1800, 0.05, 0.05, "sine", 2400);
  },
  // ツアーの送り: 短いスウィッシュ＋小さな鐘
  swish() { mark("swish"); noise(0.35, 2500, 700, 0.22, 1.5, 0.03); tone(880, 0.25, 0.06, "sine", 1320); },
  // 送信: 吸い込みが続く（stopSuction まで）
  suction() { mark("suction");
    const c = ensure();
    if (!c || !master || !noiseBuf || suctionNodes) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = c.createBiquadFilter();
    f.type = "bandpass"; f.Q.value = 2;
    f.frequency.setValueAtTime(200, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(2600, c.currentTime + 6);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, c.currentTime + 0.8);
    src.connect(f).connect(g).connect(master);
    src.start();
    suctionNodes = { src, gain: g, filter: f };
    tone(60, 1.5, 0.2, "sine", 90);
  },
  stopSuction() { mark("stopSuction");
    const c = ctx;
    if (!c || !suctionNodes) return;
    const { src, gain } = suctionNodes;
    gain.gain.cancelScheduledValues(c.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.35);
    src.stop(c.currentTime + 0.4);
    suctionNodes = null;
  },
  // ラベルが立つ: スタンプの打音
  stamp() { mark("stamp"); noise(0.12, 900, 200, 0.4, 0.7, 0.005, "lowpass"); tone(140, 0.14, 0.3, "square", 70); },
  // 再配置: 衝撃＋きらめき
  boom() { mark("boom"); tone(55, 1.4, 0.55, "sine", 28); noise(1.0, 200, 4000, 0.4, 0.6, 0.02); tone(1760, 0.9, 0.08, "sine", 3520); tone(2637, 1.2, 0.05, "sine"); },
  // 投票: 明るい打音
  hit() { mark("hit"); tone(660, 0.35, 0.25, "triangle", 990); tone(1320, 0.5, 0.12, "sine"); noise(0.3, 3000, 800, 0.2, 1, 0.01); },
};

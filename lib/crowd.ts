// スタジアムの歓声サウンドスケープ（合成版）。
// 投票の熱量 = 群衆のざわめきとしてUIに表現するためのエンジン。
// 本番では実録の歓声素材（ループ+スウェル）に差し替える想定。
// ブラウザの自動再生制限のため、最初のユーザー操作後に start() を呼ぶこと。

class CrowdEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private brightness: BiquadFilterNode | null = null;
  private baseLevel = 0.05;
  private muted = false;

  start() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    // ノイズループ（4秒バッファ）を帯域整形して「遠くの群衆のざわめき」に
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // ブラウンノイズ寄り（低域が豊か = 人混みの遠鳴り）
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 480;
    band.Q.value = 0.45;

    this.brightness = ctx.createBiquadFilter();
    this.brightness.type = "lowpass";
    this.brightness.frequency.value = 1400;

    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = this.baseLevel;

    // ゆっくりした揺らぎ（観客のうねり）
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = this.baseLevel * 0.35;
    lfo.connect(lfoGain);
    lfoGain.connect(this.bedGain.gain);
    lfo.start();

    src.connect(band);
    band.connect(this.brightness);
    this.brightness.connect(this.bedGain);
    this.bedGain.connect(this.master);
    src.start();
  }

  // 投票の総合的な熱量（0..1）→ ざわめきの基礎音量と明るさ
  setIntensity(x: number) {
    if (!this.ctx || !this.bedGain || !this.brightness) return;
    const clamped = Math.max(0, Math.min(1, x));
    this.baseLevel = 0.035 + clamped * 0.09;
    const t = this.ctx.currentTime;
    this.bedGain.gain.setTargetAtTime(this.baseLevel, t, 0.8);
    this.brightness.frequency.setTargetAtTime(1200 + clamped * 1800, t, 0.8);
  }

  // 投票が入った瞬間の「ワッ」という歓声。strength 0..1
  swell(strength: number) {
    if (!this.ctx || !this.bedGain || !this.brightness) return;
    const t = this.ctx.currentTime;
    const peak = this.baseLevel * (1.8 + 4.5 * strength);
    const g = this.bedGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(peak, t + 0.12 + strength * 0.1);
    g.setTargetAtTime(this.baseLevel, t + 0.25, 0.45 + strength * 0.6);
    const f = this.brightness.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.linearRampToValueAtTime(2600 + strength * 2400, t + 0.15);
    f.setTargetAtTime(1400, t + 0.3, 0.9);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.1);
    }
  }
}

let instance: CrowdEngine | null = null;

export function getCrowd(): CrowdEngine {
  if (!instance) instance = new CrowdEngine();
  return instance;
}

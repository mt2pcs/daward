// スタジアムの歓声サウンドスケープ（合成版）。
// 方針: 鳴りっぱなしのドローンにしない。ベースのざわめきはほぼ聴こえない量に抑え、
// 「投票の瞬間に遠くで湧く」イベント音を主体にする。開始時は必ずフェードイン。
// 本番では実録の歓声素材（ループ+スウェル）に差し替える想定。

class CrowdEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private brightness: BiquadFilterNode | null = null;
  private baseLevel = 0.012;
  private volume = 0.6; // 0..1（調整パネルから）

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
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    // 突然鳴らさない: 2.5秒かけてフェードイン
    this.master.gain.linearRampToValueAtTime(
      this.volume,
      ctx.currentTime + 2.5
    );

    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    // 低域の「換気扇ドローン」を切るハイパス + 群衆帯域の整形
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 220;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 560;
    band.Q.value = 0.5;

    this.brightness = ctx.createBiquadFilter();
    this.brightness.type = "lowpass";
    this.brightness.frequency.value = 1100;

    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = this.baseLevel;

    src.connect(highpass);
    highpass.connect(band);
    band.connect(this.brightness);
    this.brightness.connect(this.bedGain);
    this.bedGain.connect(this.master);
    src.start();
  }

  // 投票の総合的な熱量（0..1）。ベースはごく控えめ（主役はイベントスウェル）
  setIntensity(x: number) {
    if (!this.ctx || !this.bedGain) return;
    const clamped = Math.max(0, Math.min(1, x));
    this.baseLevel = 0.008 + clamped * 0.03;
    this.bedGain.gain.setTargetAtTime(
      this.baseLevel,
      this.ctx.currentTime,
      1.2
    );
  }

  // 投票が入った瞬間、遠くで湧く歓声。strength 0..1
  swell(strength: number) {
    if (!this.ctx || !this.bedGain || !this.brightness) return;
    const t = this.ctx.currentTime;
    const peak = 0.05 + 0.16 * strength; // ベースに依存しない絶対量
    const g = this.bedGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(peak, t + 0.14 + strength * 0.12);
    g.setTargetAtTime(this.baseLevel, t + 0.3, 0.5 + strength * 0.7);
    const f = this.brightness.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.linearRampToValueAtTime(2200 + strength * 2200, t + 0.16);
    f.setTargetAtTime(1100, t + 0.34, 0.9);
  }

  // 0..1。0でミュート。滑らかに反映
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(
        this.volume,
        this.ctx.currentTime,
        0.15
      );
    }
  }
}

let instance: CrowdEngine | null = null;

export function getCrowd(): CrowdEngine {
  if (!instance) instance = new CrowdEngine();
  return instance;
}

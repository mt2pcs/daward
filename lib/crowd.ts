// カーソル連動の立体音響歓声エンジン。
// 体験仕様（確定）:
// - カーソルがタイルに乗ると、そのモーメントの歓声が聞こえてくる
// - 音量は投票数に比例（人気のモーメントほど大観衆）。タイルが育つほど声が近づく
// - 定位はタイルの画面上の位置（左のタイルは左から、右のタイルは右から聞こえる）
// - フォーカスが移ると前の歓声はゆっくり遠ざかり、次の歓声がフェードイン（2ボイス交差）
// - カーソルが何にも乗っていなければ、ごく小さな場内のざわめきだけが残る
// 素材: /crowd.ogg（実録ループ）があればそれを使用。無ければ合成ノイズで代用。

interface Voice {
  gain: GainNode;
  pan: StereoPannerNode;
  key: string | null;
}

class CrowdEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private swellGain: GainNode | null = null;
  private brightness: BiquadFilterNode | null = null;
  private voices: Voice[] = [];
  private active = 0; // 現在フォーカスを担当しているボイス
  private volume = 0.6; // 0..1（調整パネルから）
  private loopBuf: AudioBuffer | null = null;
  private usingSample = false;
  private analyser: AnalyserNode | null = null;

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
    // 起動後すぐ聞こえ始めることが大事（遅いと「鳴っていない」と判断される）
    this.master.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 0.4);
    // 実際に出ている音量を観測するためのアナライザ（検証用）
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(this.analyser);

    // 実録ループの取得を試み、来るまでは合成ノイズで鳴らす
    this.loopBuf = this.makeSynthCrowd(ctx);
    this.buildGraph();
    // 検証用の観測窓（音は聞けない自動テストがゲイン/定位を読むため）
    (window as unknown as { __emooCrowd?: unknown }).__emooCrowd = {
      state: () => ({
        ctx: this.ctx?.state,
        voices: this.voices.map((v) => ({
          key: v.key,
          gain: v.gain.gain.value,
          pan: v.pan.pan.value,
        })),
        usingSample: this.usingSample,
        outputRms: this.measureRms(),
      }),
    };
    fetch("/crowd.ogg")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        this.loopBuf = buf;
        this.usingSample = true;
        this.rebuildSources();
      })
      .catch(() => {
        /* 実録素材なし → 合成のまま */
      });
  }

  // 合成の歓声ループ: ピンクノイズに群衆らしい帯域とうねりを与える
  private makeSynthCrowd(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 6;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      // うねり: 周期の異なる2つのゆらぎ（ループ長で位相が一致するよう整数周期）
      const w1 = (2 * Math.PI * 3) / len;
      const w2 = (2 * Math.PI * 7) / len;
      const ph = ch * 1.7;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + 0.03 * white;
        b1 = 0.985 * b1 + 0.06 * white;
        b2 = 0.94 * b2 + 0.18 * white;
        const pink = b0 * 1.6 + b1 * 0.9 + b2 * 0.5;
        const mod = 0.72 + 0.2 * Math.sin(w1 * i + ph) + 0.08 * Math.sin(w2 * i + ph * 2.3);
        data[i] = pink * mod * 0.55;
      }
    }
    return buf;
  }

  private makeSource(dest: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.loopBuf;
    src.loop = true;
    // ボイス毎に別位置から再生してユニゾン感を消す
    src.start(0, Math.random() * (this.loopBuf?.duration ?? 1));
    src.connect(dest);
    return src;
  }

  private srcNodes: AudioBufferSourceNode[] = [];

  private buildGraph() {
    const ctx = this.ctx!;
    // 群衆帯域の整形（全ボイス共通）
    this.brightness = ctx.createBiquadFilter();
    this.brightness.type = "lowpass";
    this.brightness.frequency.value = 3400;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 240;
    this.brightness.connect(hp);
    hp.connect(this.master!);

    // 場内のざわめき（無フォーカス時もごく小さく生きている）
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.015;
    this.bedGain.connect(this.brightness);

    // 投票イベントの湧き上がり用
    this.swellGain = ctx.createGain();
    this.swellGain.gain.value = 0;
    this.swellGain.connect(this.brightness);

    // フォーカス用の2ボイス（交差フェード）
    this.voices = [0, 1].map(() => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      gain.connect(pan);
      pan.connect(this.brightness!);
      return { gain, pan, key: null };
    });
    this.rebuildSources();
  }

  private rebuildSources() {
    if (!this.ctx) return;
    for (const s of this.srcNodes) {
      try { s.stop(); } catch { /* 既に停止済み */ }
    }
    this.srcNodes = [
      this.makeSource(this.bedGain!),
      this.makeSource(this.swellGain!),
      this.makeSource(this.voices[0].gain),
      this.makeSource(this.voices[1].gain),
    ];
  }

  // 毎フレーム呼ばれる。focus=null でフェードアウト。
  // key: タイルID / level: 0..1（投票数×成長度） / pan: -1..1（画面上の位置）
  setFocus(focus: { key: string; level: number; pan: number } | null) {
    if (!this.ctx || this.voices.length < 2) return;
    const t = this.ctx.currentTime;
    const cur = this.voices[this.active];
    if (!focus) {
      if (cur.key !== null) {
        cur.key = null;
        cur.gain.gain.setTargetAtTime(0, t, 0.6); // 離れるとゆっくり遠ざかる
      }
      return;
    }
    if (cur.key !== focus.key) {
      // フォーカス移動: 現ボイスをゆっくり手放し、もう片方で新しい歓声を立ち上げる
      cur.gain.gain.setTargetAtTime(0, t, 0.5);
      this.active = 1 - this.active;
      const next = this.voices[this.active];
      next.key = focus.key;
      next.gain.gain.cancelScheduledValues(t);
      next.gain.gain.setValueAtTime(next.gain.gain.value, t);
      next.pan.pan.setValueAtTime(focus.pan, t);
    }
    const v = this.voices[this.active];
    // 乗った瞬間から聞こえ、育つほど近づく。音量は投票数×成長度
    v.gain.gain.setTargetAtTime(0.1 + 0.75 * focus.level, t, 0.15);
    v.pan.pan.setTargetAtTime(focus.pan, t, 0.15);
  }

  // 投票の総合的な熱量（0..1）→ ざわめきの量
  setIntensity(x: number) {
    if (!this.ctx || !this.bedGain) return;
    const clamped = Math.max(0, Math.min(1, x));
    this.bedGain.gain.setTargetAtTime(0.012 + clamped * 0.03, this.ctx.currentTime, 1.2);
  }

  // 投票が入った瞬間、遠くで湧く歓声。strength 0..1
  swell(strength: number) {
    if (!this.ctx || !this.swellGain) return;
    const t = this.ctx.currentTime;
    const g = this.swellGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.06 + 0.2 * strength, t + 0.14 + strength * 0.12);
    g.setTargetAtTime(0, t + 0.3, 0.5 + strength * 0.7);
  }

  // 実際にスピーカーへ出ている信号のRMS（0=無音）。検証用
  private measureRms(): number {
    if (!this.analyser) return -1;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  // AudioContextが起動済み（=歓声が鳴れる状態）か
  isActive(): boolean {
    return this.ctx?.state === "running";
  }

  // 0..1。0でミュート。滑らかに反映
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.15);
    }
  }
}

let instance: CrowdEngine | null = null;

export function getCrowd(): CrowdEngine {
  if (!instance) instance = new CrowdEngine();
  return instance;
}

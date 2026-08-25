"use client";

// 演出の匙加減はその場で調整できるようにする（参照映像のコントロールパネルと同じ思想）。
// 値はこの端末のlocalStorageにのみ保存される。

export interface Tuning {
  motion: number; // 0..100 モザイクのゆらぎ（0で完全静止）
  live: number; // 0..14 ミュート自動再生するタイル数
  volume: number; // 0..100 歓声の音量（0でオフ）
}

export const DEFAULT_TUNING: Tuning = { motion: 65, live: 10, volume: 55 };

export function loadTuning(): Tuning {
  try {
    const raw = localStorage.getItem("emoo-tuning");
    if (raw) return { ...DEFAULT_TUNING, ...JSON.parse(raw) };
  } catch {
    /* localStorage不可の環境ではデフォルトで動く */
  }
  return DEFAULT_TUNING;
}

export function saveTuning(t: Tuning) {
  try {
    localStorage.setItem("emoo-tuning", JSON.stringify(t));
  } catch {
    /* noop */
  }
}

export default function Tuner({
  tuning,
  open,
  onToggle,
  onChange,
}: {
  tuning: Tuning;
  open: boolean;
  onToggle: () => void;
  onChange: (t: Tuning) => void;
}) {
  const set = (patch: Partial<Tuning>) => onChange({ ...tuning, ...patch });
  return (
    <div className="tuner">
      {open && (
        <div className="tuner-panel">
          <label>
            <span>
              カーソル反応の強さ <em>{tuning.motion}</em>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={tuning.motion}
              onChange={(e) => set({ motion: Number(e.target.value) })}
            />
          </label>
          <label>
            <span>
              ライブ再生タイル数 <em>{tuning.live}</em>
            </span>
            <input
              type="range"
              min={0}
              max={14}
              value={tuning.live}
              onChange={(e) => set({ live: Number(e.target.value) })}
            />
          </label>
          <label>
            <span>
              歓声の音量 <em>{tuning.volume === 0 ? "OFF" : tuning.volume}</em>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={tuning.volume}
              onChange={(e) => set({ volume: Number(e.target.value) })}
            />
          </label>
          <div className="tuner-note">この端末にのみ保存されます</div>
        </div>
      )}
      <button className="tuner-toggle" onClick={onToggle}>
        ⚙ 演出調整
      </button>
    </div>
  );
}

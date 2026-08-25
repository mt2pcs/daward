import { EMOTIONS, type Emotion, type Moment } from "./types";

// コメント文からの簡易感情推定（プロトタイプ用の辞書ベース）。
// 本番では Claude API 等での推定に差し替える想定。
const KEYWORDS: Record<Emotion, string[]> = {
  歓喜: ["嬉し", "うれし", "最高", "やった", "歓喜", "喜", "笑顔", "ハッピー", "優勝", "サイコー", "たまらん", "幸せ"],
  涙: ["泣", "涙", "感動", "号泣", "うるっ", "じーん", "ジーン", "切な", "ぐっと", "グッと"],
  鳥肌: ["鳥肌", "すご", "凄", "衝撃", "信じられ", "えぐ", "エグ", "やば", "ヤバ", "震え", "regret", "神"],
  緊張: ["緊張", "ドキドキ", "ハラハラ", "手に汗", "祈", "息をのむ", "心臓"],
  一体感: ["みんな", "一体", "会場", "スタジアム", "声援", "応援", "一緒", "仲間", "チーム", "全員", "国民"],
  別れ: ["ありがとう", "引退", "お疲れ", "さよなら", "ラスト", "最後", "惜しま", "旅立"],
  逆転: ["逆転", "諦め", "あきらめ", "不屈", "粘り", "執念", "奇跡", "どんでん", "劇的"],
  気迫: ["気迫", "魂", "本気", "全力", "闘志", "かっこ", "カッコ", "痺れ", "しびれ", "漢", "強"],
};

export function analyzeEmotion(text: string, fallback: Emotion): Emotion {
  const scores = new Map<Emotion, number>();
  for (const emotion of EMOTIONS) {
    let score = 0;
    for (const kw of KEYWORDS[emotion]) {
      let i = text.indexOf(kw);
      while (i !== -1) {
        score += 1;
        i = text.indexOf(kw, i + kw.length);
      }
    }
    if (score > 0) scores.set(emotion, score);
  }
  if (scores.size === 0) return fallback;
  let best: Emotion = fallback;
  let bestScore = 0;
  for (const [emotion, score] of Array.from(scores.entries())) {
    // 投票先モーメントと同じ感情はわずかに優先
    const bonus = emotion === fallback ? 0.5 : 0;
    if (score + bonus > bestScore) {
      bestScore = score + bonus;
      best = emotion;
    }
  }
  return best;
}

// 感情的に近しいモーメントを選ぶ。primary一致 > secondary一致 > その他、
// 同点は投票数の多い順。votedIdは除外。
export function matchMoments(
  moments: Moment[],
  votes: Map<string, number>,
  emotion: Emotion,
  votedId: string,
  count: number
): Moment[] {
  const scored = moments
    .filter((m) => m.id !== votedId)
    .map((m) => {
      let score = 0;
      if (m.emotions[0] === emotion) score = 2;
      else if (m.emotions.includes(emotion)) score = 1;
      return { m, score, votes: votes.get(m.id) ?? 0 };
    })
    .sort((a, b) => b.score - a.score || b.votes - a.votes);

  // 上位候補から少し散らして選ぶ（毎回同じ3本にならないように）
  const pool = scored.slice(0, Math.max(count * 3, 9));
  const picked: Moment[] = [];
  let seed = hash(votedId + emotion + Date.now().toString(36));
  while (picked.length < count && pool.length > 0) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const idx = seed % Math.min(pool.length, 4);
    picked.push(pool.splice(idx, 1)[0].m);
  }
  return picked;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h & 0x7fffffff;
}

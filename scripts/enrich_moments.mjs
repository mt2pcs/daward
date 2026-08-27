// data/moments.json に感情ベクトル(8軸)・強度・山場秒を付与する。
// プロトタイプでは感情ラベルの順位と説明文のキーワードから決定論的に導出。
// 本番では Claude API が実況・コメント・映像メタから直接スコアする想定
// （このスクリプトの出力スキーマがそのまま差し替え先になる）。
import { readFileSync, writeFileSync } from "node:fs";

const PATH = new URL("../data/moments.json", import.meta.url);
const EMOTIONS = ["歓喜", "涙", "鳥肌", "緊張", "一体感", "別れ", "逆転", "気迫"];

// 説明文キーワード → 各感情軸への加点
const DESC_BOOST = {
  歓喜: ["優勝", "金メダル", "歓喜", "初の", "悲願", "頂点", "戴冠", "V"],
  涙: ["涙", "感動", "泣", "亡き", "追悼", "捧げ"],
  鳥肌: ["衝撃", "世界", "史上", "新記録", "圧巻", "神業", "伝説", "完璧"],
  緊張: ["決勝", "延長", "PK", "土壇場", "残り", "ラストパス", "サドンデス", "タイブレーク"],
  一体感: ["日本中", "国民", "スタジアム", "観衆", "声援", "列島", "みんな"],
  別れ: ["引退", "ラストマッチ", "最後の", "別れ", "旅立", "ありがとう"],
  逆転: ["逆転", "劇的", "奇跡", "大逆転", "はね返", "跳ね返", "諦め", "どん底", "不屈"],
  気迫: ["気迫", "魂", "執念", "闘志", "全力", "渾身", "意地", "死闘"],
};
// 強度（爆発的1.0〜静謐0.2）: 主感情の基礎値
const INTENSITY_BASE = {
  歓喜: 0.78, 鳥肌: 0.8, 逆転: 0.82, 気迫: 0.72,
  緊張: 0.62, 一体感: 0.6, 涙: 0.45, 別れ: 0.38,
};
const INTENSITY_UP = ["劇的", "奇跡", "衝撃", "金メダル", "優勝", "世界一", "逆転", "新記録", "サヨナラ", "決勝"];
const INTENSITY_DOWN = ["引退", "ありがとう", "最後の", "追悼", "静か"];

const moments = JSON.parse(readFileSync(PATH, "utf8"));
for (const m of moments) {
  const vec = new Array(EMOTIONS.length).fill(0);
  // ラベル順位: 1位=1.0 / 2位=0.6 / 3位=0.35
  m.emotions.forEach((e, rank) => {
    const i = EMOTIONS.indexOf(e);
    if (i >= 0) vec[i] = Math.max(vec[i], [1.0, 0.6, 0.35][rank] ?? 0.25);
  });
  // 説明文からの補正（ラベルに現れない気配を拾う）
  const text = `${m.title} ${m.description}`;
  EMOTIONS.forEach((e, i) => {
    let hits = 0;
    for (const kw of DESC_BOOST[e]) if (text.includes(kw)) hits++;
    vec[i] = Math.min(1, vec[i] + Math.min(0.3, hits * 0.15));
  });

  let intensity = INTENSITY_BASE[m.emotions[0]] ?? 0.6;
  for (const kw of INTENSITY_UP) if (text.includes(kw)) intensity += 0.05;
  for (const kw of INTENSITY_DOWN) if (text.includes(kw)) intensity -= 0.08;
  intensity = Math.max(0.2, Math.min(1, intensity));

  m.vec = vec.map((v) => Math.round(v * 100) / 100);
  m.intensity = Math.round(intensity * 100) / 100;
  // 山場秒: 実映像を確認して埋める運用（未設定=0は冒頭から）。既存値は保持
  m.peakSec = m.peakSec ?? 0;
}
writeFileSync(PATH, JSON.stringify(moments, null, 1) + "\n");
console.log(`enriched ${moments.length} moments`);

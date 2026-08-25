import rawMoments from "@/data/moments.json";
import type { Emotion, Moment, MomentComment, MomentWithStats } from "./types";

// プロトタイプ用のインメモリストア。
// Cloud Run はステートレスなので、本番では Firestore 等に差し替える想定。
// （インスタンスが再起動すると投票はシード値に戻る）

interface StoreState {
  moments: Moment[];
  votes: Map<string, number>;
  comments: Map<string, MomentComment[]>;
  commentSeq: number;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const SEED_COMMENT_TEMPLATES: Record<Emotion, string[]> = {
  歓喜: ["この瞬間、リビングで飛び上がった！", "何回見ても嬉しさが込み上げる", "最高すぎる。今年一番笑顔になれた瞬間"],
  涙: ["気づいたら泣いてた。ありがとう", "この涙に今シーズンの全部が詰まってる", "感動して言葉が出なかった"],
  鳥肌: ["鳥肌が止まらなかった", "リアルタイムで見てて声出た。えぐい", "何度見ても信じられない"],
  緊張: ["心臓が持たなかった…", "手に汗握るってこのこと", "祈りながら見てた数分間"],
  一体感: ["あの日、日本中がひとつになった", "会場の一体感が画面越しに伝わってきた", "みんなで見たからこそ最高だった"],
  別れ: ["今までありがとう。忘れません", "ラストシーンに涙腺崩壊", "お疲れ様でした。あなたの背中を見て育ちました"],
  逆転: ["諦めなければ奇跡は起きる", "ここからの逆転劇、映画超えてた", "執念が実った瞬間"],
  気迫: ["魂のこもったプレーに痺れた", "この気迫、画面越しでも伝わる", "かっこよすぎる。漢の背中"],
};

const SEED_AUTHORS = ["サッカー小僧", "野球一筋30年", "スポーツ大好きっ子", "アリーナの住人", "週末観戦勢", "DAZNヘビーユーザー", "にわかファン代表", "全競技追いかけ隊"];

function init(): StoreState {
  const moments = rawMoments as Moment[];
  const votes = new Map<string, number>();
  const comments = new Map<string, MomentComment[]>();
  let commentSeq = 0;

  const rand = seededRandom(20260825);
  for (const m of moments) {
    // ロングテール分布：一部のモーメントに投票が集中する
    const r = rand();
    const base = Math.floor(Math.pow(r, 2.6) * 900) + Math.floor(rand() * 40) + 8;
    votes.set(m.id, base);
    comments.set(m.id, []);
  }

  // 人気上位のモーメントにデモ用コメントをシード
  const top = [...moments].sort(
    (a, b) => (votes.get(b.id) ?? 0) - (votes.get(a.id) ?? 0)
  );
  for (let i = 0; i < Math.min(20, top.length); i++) {
    const m = top[i];
    const n = i < 5 ? 3 : i < 12 ? 2 : 1;
    for (let j = 0; j < n; j++) {
      const emotion = m.emotions[j % m.emotions.length];
      const templates = SEED_COMMENT_TEMPLATES[emotion];
      commentSeq++;
      comments.get(m.id)!.push({
        id: `seed-${commentSeq}`,
        momentId: m.id,
        text: templates[Math.floor(rand() * templates.length)],
        author: SEED_AUTHORS[Math.floor(rand() * SEED_AUTHORS.length)],
        emotion,
        createdAt: new Date(Date.now() - Math.floor(rand() * 72) * 3600_000).toISOString(),
      });
    }
  }

  return { moments, votes, comments, commentSeq };
}

const g = globalThis as unknown as { __dawardStore?: StoreState };

export function getStore(): StoreState {
  if (!g.__dawardStore) g.__dawardStore = init();
  return g.__dawardStore;
}

export function withStats(m: Moment): MomentWithStats {
  const store = getStore();
  return {
    ...m,
    votes: store.votes.get(m.id) ?? 0,
    commentCount: store.comments.get(m.id)?.length ?? 0,
  };
}

export function listMoments(): MomentWithStats[] {
  return getStore().moments.map(withStats);
}

export function getMoment(id: string): Moment | undefined {
  return getStore().moments.find((m) => m.id === id);
}

export function getComments(id: string): MomentComment[] {
  const list = getStore().comments.get(id) ?? [];
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addVote(
  momentId: string,
  text: string,
  author: string,
  emotion: Emotion
): MomentComment {
  const store = getStore();
  store.votes.set(momentId, (store.votes.get(momentId) ?? 0) + 1);
  store.commentSeq++;
  const comment: MomentComment = {
    id: `c-${store.commentSeq}`,
    momentId,
    text,
    author: author || "名無しのスポーツファン",
    emotion,
    createdAt: new Date().toISOString(),
  };
  if (text.trim()) {
    const list = store.comments.get(momentId) ?? [];
    list.push(comment);
    store.comments.set(momentId, list);
  }
  return comment;
}

import MeaningMap from "@/components/lab/MeaningMap";
import { MOMENTS, media } from "@/lib/vote/data";
import M from "@/docs/design/zap/meaning_map.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "MAP LAB — DAZN 100 MOMENTS", robots: { index: false } };

// 検証用: 熱狂の文脈の「意味の地図」。?demo=1 で台本どおり自動、?capture=1 で1コマずつ描き出し。
export default function MapLab() {
  const thumb = Object.fromEntries(MOMENTS.map((m) => [m.no, media(m)?.thumb || null]));
  const data = M as any;
  const items = data.items.map((x: any) => ({
    id: x.id, no: x.no, sport: x.sport, t: x.t, context: x.context, region: x.region, pos: x.pos,
    img: x.t ? `https://storage.googleapis.com/e-mooments-assets/ctx/${x.id}.jpg` : thumb[x.no],
  }));
  return <MeaningMap items={items} regions={data.regions.map((r: any) => ({ id: r.id, name: r.name, center: r.center }))} neighbors={data.neighbors} words={data.words || []} />;
}

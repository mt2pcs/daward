export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 重み付きBSPレイアウト：固定順のアイテム列を、重み比で矩形を再帰分割して敷き詰める。
// 順序が固定なので重みが変わっても近傍関係が保たれ、サイズ変化がシームレスに見える。
export function computeLayout(
  weights: number[],
  width: number,
  height: number
): LayoutRect[] {
  const out: LayoutRect[] = new Array(weights.length);
  if (weights.length === 0) return out;

  const recurse = (
    items: number[],
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    if (items.length === 1) {
      out[items[0]] = { x, y, w, h };
      return;
    }
    const total = items.reduce((s, i) => s + weights[i], 0);
    let acc = 0;
    let split = items.length - 1;
    for (let k = 0; k < items.length - 1; k++) {
      acc += weights[items[k]];
      if (acc >= total / 2) {
        split = k + 1;
        break;
      }
    }
    const a = items.slice(0, split);
    const b = items.slice(split);
    const wa = a.reduce((s, i) => s + weights[i], 0);
    const ratio = Math.min(0.92, Math.max(0.08, wa / total));
    if (w >= h) {
      recurse(a, x, y, w * ratio, h);
      recurse(b, x + w * ratio, y, w * (1 - ratio), h);
    } else {
      recurse(a, x, y, w, h * ratio);
      recurse(b, x, y + h * ratio, w, h * (1 - ratio));
    }
  };

  recurse(
    weights.map((_, i) => i),
    0,
    0,
    width,
    height
  );
  return out;
}

// ---- 構造固定レイアウト ----
// computeLayout は重みの変化で分割位置・分割軸が閾値でパタッと切り替わり、
// 配置が不連続にジャンプする（滑らかな動きを壊す元凶）。
// そこで分割構造は初期重みで一度だけ決めて木として固定し、
// 毎フレームは「比率」だけを現在の重みで更新する。
// これでレイアウトは重みの連続関数になり、どんな重み変化もぬるぬる動く。
export type LayoutNode =
  | { leaf: number }
  | { horizontal: boolean; a: LayoutNode; b: LayoutNode; aItems: number[]; bItems: number[] };

export function buildLayoutTree(
  weights: number[],
  width: number,
  height: number
): LayoutNode {
  const build = (items: number[], w: number, h: number): LayoutNode => {
    if (items.length === 1) return { leaf: items[0] };
    const total = items.reduce((s, i) => s + weights[i], 0);
    let acc = 0;
    let split = items.length - 1;
    for (let k = 0; k < items.length - 1; k++) {
      acc += weights[items[k]];
      if (acc >= total / 2) {
        split = k + 1;
        break;
      }
    }
    const aItems = items.slice(0, split);
    const bItems = items.slice(split);
    const wa = aItems.reduce((s, i) => s + weights[i], 0);
    const ratio = Math.min(0.92, Math.max(0.08, wa / total));
    const horizontal = w >= h;
    return horizontal
      ? {
          horizontal,
          aItems,
          bItems,
          a: build(aItems, w * ratio, h),
          b: build(bItems, w * (1 - ratio), h),
        }
      : {
          horizontal,
          aItems,
          bItems,
          a: build(aItems, w, h * ratio),
          b: build(bItems, w, h * (1 - ratio)),
        };
  };
  return build(weights.map((_, i) => i), width, height);
}

export function layoutFromTree(
  root: LayoutNode,
  weights: number[],
  width: number,
  height: number
): LayoutRect[] {
  const out: LayoutRect[] = new Array(weights.length);
  const walk = (node: LayoutNode, x: number, y: number, w: number, h: number) => {
    if ("leaf" in node) {
      out[node.leaf] = { x, y, w, h };
      return;
    }
    const wa = node.aItems.reduce((s, i) => s + weights[i], 0);
    const wb = node.bItems.reduce((s, i) => s + weights[i], 0);
    const ratio = Math.min(0.92, Math.max(0.08, wa / (wa + wb)));
    if (node.horizontal) {
      walk(node.a, x, y, w * ratio, h);
      walk(node.b, x + w * ratio, y, w * (1 - ratio), h);
    } else {
      walk(node.a, x, y, w, h * ratio);
      walk(node.b, x, y + h * ratio, w, h * (1 - ratio));
    }
  };
  walk(root, 0, 0, width, height);
  return out;
}

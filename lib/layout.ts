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

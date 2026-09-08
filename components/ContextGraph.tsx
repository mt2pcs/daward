"use client";

// CONTEXT GRAPH — 100の瞬間の文脈分解を、Obsidian のグラフビューの文法で見せる別ページ。
// Canvas 2D の力学グラフ（自前実装: 反発・リンクばね・中心引力・減衰、d3 と同じ alpha 冷却）。
// 左: フィルター / 表示 / 力 のパネル（Obsidian と同じ構成）。右: 選択ノードの分解結果（インスペクタ）。
// 起動時に解析パイプラインのログを流してからグラフが中心から開く。
import { useEffect, useMemo, useRef, useState } from "react";
import type { MomentWithStats } from "@/lib/types";
import { EMOTIONS } from "@/lib/types";
import { cosine, vecOf } from "@/lib/emotionSpace";
import { buildGraph, KIND_COLOR, KIND_LABEL, type GNode, type MomentContext, type NodeKind } from "@/lib/contextGraph";

const KINDS: NodeKind[] = ["moment", "person", "team", "competition", "motif", "emotion", "sport"];
type Forces = { center: number; repel: number; link: number; dist: number };
type Display = { node: number; edge: number; text: number; glow: number; flow: number };

export default function ContextGraph({ moments, context }: { moments: MomentWithStats[]; context: MomentContext[] }) {
  const graph = useMemo(() => buildGraph(moments, context), [moments, context]);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState<Record<NodeKind, boolean>>({ moment: true, person: true, team: true, competition: true, motif: true, emotion: true, sport: true });
  const [forces, setForces] = useState<Forces>({ center: 0.5, repel: 0.55, link: 0.5, dist: 0.45 });
  const [display, setDisplay] = useState<Display>({ node: 0.5, edge: 0.4, text: 0.45, glow: 0.7, flow: 0.6 });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [booted, setBooted] = useState(false);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [stats, setStats] = useState({ alpha: 1, fps: 0, lite: false });
  const [open, setOpen] = useState({ filter: true, display: true, forces: true });
  const S = useRef({ enabled, forces, display, query, selected, hovered });
  S.current = { enabled, forces, display, query, selected, hovered };
  const api = useRef<{ focus: (i: number) => void } | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of graph.nodes) c[n.kind] = (c[n.kind] || 0) + 1;
    return c;
  }, [graph]);

  // 起動ログ（実データの件数で組む）
  useEffect(() => {
    const beats = context.reduce((s, c) => s + c.beats.length, 0);
    const lines = [
      `▸ ingest      ${moments.length} highlights · ${moments.length} sources`,
      `▸ segment     ${beats} beats（起 / 転 / 結）`,
      `▸ entity      people ${counts.person} · teams ${counts.team} · competitions ${counts.competition}`,
      `▸ emotion     8-axis vectors · intensity · ${counts.emotion} poles`,
      `▸ motif       ${counts.motif} motifs · ${graph.links.filter((l) => l.kind === "motif").length} links`,
      `▸ embed       cosine graph · k=2 · ${graph.links.filter((l) => l.kind === "similar").length} edges`,
      `▸ layout      force-directed · ${graph.nodes.length} nodes · ${graph.links.length} links`,
    ];
    let i = 0;
    const id = setInterval(() => {
      i++;
      setBootLines(lines.slice(0, i));
      if (i >= lines.length) { clearInterval(id); setTimeout(() => setBooted(true), 500); }
    }, 170);
    return () => clearInterval(id);
  }, [context, moments, counts, graph]);

  useEffect(() => {
    const host = hostRef.current, canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { nodes, links } = graph;
    const N = nodes.length;
    // 初期配置: 中心から小さな円盤に（起動で開く）
    for (let i = 0; i < N; i++) {
      const a = i * 2.399963, r = 16 * Math.sqrt(i + 1);
      nodes[i].x = Math.cos(a) * r; nodes[i].y = Math.sin(a) * r; nodes[i].vx = 0; nodes[i].vy = 0;
    }
    const adj: number[][] = nodes.map(() => []);
    for (const l of links) { adj[l.a].push(l.b); adj[l.b].push(l.a); }
    const cam = { x: 0, y: 0, k: 0.9 };
    // 発光スプライト（色ごとにキャッシュ。毎フレームの createRadialGradient より桁違いに軽い）
    const sprites = new Map<string, HTMLCanvasElement>();
    const sprite = (color: string) => {
      let c = sprites.get(color);
      if (c) return c;
      c = document.createElement("canvas"); c.width = 128; c.height = 128;
      const g = c.getContext("2d")!;
      const [r, gg, b] = hexToRgb(color);
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.12, `rgba(${r},${gg},${b},1)`);
      grad.addColorStop(0.3, `rgba(${r},${gg},${b},0.45)`);
      grad.addColorStop(0.6, `rgba(${r},${gg},${b},0.1)`);
      grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      sprites.set(color, c);
      return c;
    };
    // 血流: リンクごとに位相と速さ。瞬間→属性の向きに流れる（similar は瞬間どうし）
    const L = links.length;
    const phase = new Float32Array(L), speed = new Float32Array(L);
    for (let i = 0; i < L; i++) { phase[i] = Math.random(); speed[i] = 0.12 + Math.random() * 0.16; }
    let frameEma = 16, lite = false;
    let alpha = 1, alphaTarget = 0;
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      W = host.clientWidth; H = host.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(host);
    const visible = (n: GNode) => S.current.enabled[n.kind];
    const radiusOf = (n: GNode) => {
      const d = S.current.display.node;
      return (n.kind === "moment" ? 3.5 + 6 * n.weight : 2 + 7 * n.weight) * (0.55 + d * 1.1);
    };
    // ---- 物理 ----
    // 反発は長距離まで効かせる（短距離だけだと均一に詰まった毛玉になる）。ハブの周りに衛星が寄り添い、塊と尾ができる
    const step = () => {
      const f = S.current.forces;
      const repel = 1500 * (0.3 + f.repel * 2.0);
      const linkK = 0.03 + f.link * 0.14;
      const dist = 34 + f.dist * 80;
      const center = 0.0015 + f.center * 0.012;
      const CUT2 = 900 * 900;
      const vis: number[] = [];
      for (let i = 0; i < N; i++) if (visible(nodes[i])) vis.push(i);
      for (let ii = 0; ii < vis.length; ii++) {
        const i = vis[ii], n = nodes[i];
        let fx = 0, fy = 0;
        const wn = 0.4 + n.weight * 1.2;
        for (let jj = ii + 1; jj < vis.length; jj++) {
          const o = nodes[vis[jj]];
          let dx = n.x - o.x, dy = n.y - o.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
          if (d2 > CUT2) continue;
          const s = repel * wn * (0.4 + o.weight * 1.2) / d2;
          const inv = 1 / Math.sqrt(d2);
          const px = dx * inv * s, py = dy * inv * s;
          fx += px; fy += py;
          o.vx -= px * alpha; o.vy -= py * alpha;
        }
        fx -= n.x * center; fy -= n.y * center;
        n.vx += fx * alpha; n.vy += fy * alpha;
      }
      for (const l of links) {
        const a = nodes[l.a], b = nodes[l.b];
        if (!visible(a) || !visible(b)) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const leaf = a.deg <= 1 || b.deg <= 1;
        const want = dist * (l.kind === "similar" ? 2.2 : leaf ? 0.5 : 1) * (0.6 + 0.4 * (a.weight + b.weight));
        const s = ((d - want) / d) * linkK * l.w * (leaf ? 1.8 : 1) * alpha;
        const wa = b.deg / (a.deg + b.deg), wb = a.deg / (a.deg + b.deg);
        if (!a.fixed) { a.vx += dx * s * wa; a.vy += dy * s * wa; }
        if (!b.fixed) { b.vx -= dx * s * wb; b.vy -= dy * s * wb; }
      }
      for (const n of nodes) {
        if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= 0.55; n.vy *= 0.55;
        n.x += n.vx; n.y += n.vy;
      }
      alpha += (alphaTarget - alpha) * 0.012;
    };
    // ---- 描画 ----
    const toScreen = (x: number, y: number) => [W / 2 + (x - cam.x) * cam.k, H / 2 + (y - cam.y) * cam.k] as const;
    const toWorld = (sx: number, sy: number) => [(sx - W / 2) / cam.k + cam.x, (sy - H / 2) / cam.k + cam.y] as const;
    let hoverI: number | null = null, selI: number | null = null;
    let matchSet: Set<number> | null = null, matchQuery = "";
    const computeMatch = () => {
      const q = S.current.query.trim().toLowerCase();
      if (q === matchQuery) return;
      matchQuery = q;
      if (!q) { matchSet = null; return; }
      const set = new Set<number>();
      nodes.forEach((n, i) => {
        const hay = [n.label, n.moment?.event ?? "", n.moment?.description ?? "", ...(n.ctx?.motifs ?? []), ...(n.ctx?.people ?? [])].join(" ").toLowerCase();
        if (hay.includes(q)) set.add(i);
      });
      // 一致したノードの隣も薄く含める
      const around = new Set<number>();
      for (const i of Array.from(set)) for (const j of adj[i]) around.add(j);
      for (const j of Array.from(around)) set.add(j);
      matchSet = set;
    };
    let lastT = performance.now(), fpsAcc = 0, fpsN = 0, statT = 0;
    let userMoved = false;
    const fit = () => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
      for (const nd of nodes) { if (!visible(nd)) continue; n++; if (nd.x < x0) x0 = nd.x; if (nd.x > x1) x1 = nd.x; if (nd.y < y0) y0 = nd.y; if (nd.y > y1) y1 = nd.y; }
      if (n < 2) return;
      const bw = Math.max(50, x1 - x0), bh = Math.max(50, y1 - y0);
      const availW = Math.max(200, W - (W > 760 ? 600 : 40)), availH = Math.max(200, H - 220);
      const k = Math.min(availW / bw, availH / bh) * 0.96;
      const tx = (x0 + x1) / 2, ty = (y0 + y1) / 2;
      cam.k += (k - cam.k) * 0.05; cam.x += (tx - cam.x) * 0.05; cam.y += (ty - cam.y) * 0.05;
    };
    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = now - lastT; lastT = now;
      fpsAcc += dt; fpsN++;
      if (dt > 0 && dt < 500) frameEma += (dt - frameEma) * 0.05;
      // 重いときは血流を半分・発光を小さく（自動）
      if (!lite && frameEma > 30) lite = true; else if (lite && frameEma < 17) lite = false;
      const time = now / 1000;
      if (alpha > 0.002 || alphaTarget > 0) step();
      if (!userMoved) fit();
      computeMatch();
      selI = S.current.selected; hoverI = S.current.hovered;
      const focus = hoverI ?? selI;
      const neigh = focus !== null ? new Set(adj[focus]) : null;
      const dsp = S.current.display;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#07070a";
      ctx.fillRect(0, 0, W, H);
      // 微細なグリッド（設計図感）
      ctx.strokeStyle = "rgba(255,255,255,0.028)"; ctx.lineWidth = 1;
      const gs = 80 * cam.k;
      if (gs > 18) {
        const ox = ((W / 2 - cam.x * cam.k) % gs + gs) % gs, oy = ((H / 2 - cam.y * cam.k) % gs + gs) % gs;
        ctx.beginPath();
        for (let x = ox; x < W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (let y = oy; y < H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();
      }
      // リンク
      const lw = (0.3 + dsp.edge * 1.6);
      ctx.lineCap = "round";
      for (const l of links) {
        const a = nodes[l.a], b = nodes[l.b];
        if (!visible(a) || !visible(b)) continue;
        const [ax, ay] = toScreen(a.x, a.y), [bx, by] = toScreen(b.x, b.y);
        if ((ax < -50 && bx < -50) || (ax > W + 50 && bx > W + 50) || (ay < -50 && by < -50) || (ay > H + 50 && by > H + 50)) continue;
        let al = 0.16 * l.w;
        let col = "255,255,255";
        const lit = focus !== null && (l.a === focus || l.b === focus);
        if (focus !== null) al = lit ? 0.85 : 0.035;
        if (matchSet) al *= (matchSet.has(l.a) && matchSet.has(l.b)) ? 1.6 : 0.2;
        if (lit) { const src = nodes[l.a === focus ? l.b : l.a]; const c = hexToRgb(src.color); col = `${c[0]},${c[1]},${c[2]}`; }
        ctx.strokeStyle = `rgba(${col},${Math.min(1, al)})`;
        ctx.lineWidth = lit ? lw * 1.6 : lw;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      // 血流: リンクの上を粒が流れる（加算合成で光る）
      if (dsp.flow > 0.02) {
        ctx.globalCompositeOperation = "lighter";
        const stride = lite ? 2 : 1;
        for (let li = 0; li < L; li += stride) {
          const l = links[li];
          const a = nodes[l.a], b = nodes[l.b];
          if (!visible(a) || !visible(b)) continue;
          const [ax, ay] = toScreen(a.x, a.y), [bx, by] = toScreen(b.x, b.y);
          if ((ax < -30 && bx < -30) || (ax > W + 30 && bx > W + 30) || (ay < -30 && by < -30) || (ay > H + 30 && by > H + 30)) continue;
          const lit = focus !== null && (l.a === focus || l.b === focus);
          let al = 0.75 * dsp.flow;
          if (focus !== null) al = lit ? 1 : 0.08;
          if (matchSet) al *= (matchSet.has(l.a) && matchSet.has(l.b)) ? 1.3 : 0.1;
          if (al < 0.03) continue;
          const [cr, cg, cb] = hexToRgb(a.kind === "moment" ? b.color : a.color);
          const p = (time * speed[li] * (0.6 + dsp.flow) + phase[li]) % 1;
          const len = Math.hypot(bx - ax, by - ay);
          const tail = Math.min(0.35, 26 / Math.max(1, len)); // 尾は画面上で最大26px
          const pr = (lit ? 2.6 : 1.7) * Math.min(1.4, 0.7 + cam.k * 0.4);
          for (let k = 0; k < 4; k++) {
            const t = p - (k * tail) / 3;
            if (t < 0) continue;
            const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
            const f = 1 - k / 4;
            ctx.fillStyle = `rgba(${cr},${cg},${cb},${al * f * f})`;
            ctx.beginPath(); ctx.arc(x, y, pr * (0.5 + 0.5 * f), 0, Math.PI * 2); ctx.fill();
          }
          if (lit || (!lite && a.kind !== "moment" && b.kind !== "moment")) {
            // 先頭の白い芯
            const x = ax + (bx - ax) * p, y = ay + (by - ay) * p;
            ctx.fillStyle = `rgba(255,255,255,${al * 0.8})`;
            ctx.beginPath(); ctx.arc(x, y, pr * 0.45, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalCompositeOperation = "source-over";
      }
      // ノード
      const textK = 0.45 + dsp.text * 1.5; // しきい値（小さいほど早く出る）。既定では全体表示でハブ（次数の大きいモチーフ・感情・競技）だけ読める
      const labelsToDraw: { x: number; y: number; t: string; a: number; c: string; big: boolean }[] = [];
      for (let i = 0; i < N; i++) {
        const n = nodes[i]; if (!visible(n)) continue;
        const [sx, sy] = toScreen(n.x, n.y);
        const r = radiusOf(n) * Math.sqrt(cam.k);
        if (sx < -r - 60 || sx > W + r + 60 || sy < -r - 60 || sy > H + r + 60) continue;
        let a = 1;
        const isFocus = i === focus, isNeigh = neigh ? neigh.has(i) : false;
        if (focus !== null) a = isFocus ? 1 : isNeigh ? 0.95 : 0.13;
        if (matchSet) a *= matchSet.has(i) ? 1 : 0.12;
        const [cr, cg, cb] = hexToRgb(n.color);
        // 発光: スプライトを加算合成（ハブは脈動）。重なるほど白く飽和してブルームに見える
        const pulse = n.deg > 8 ? 1 + 0.07 * Math.sin(time * 2.1 + i * 0.7) : 1;
        const gl = dsp.glow * (lite ? 0.7 : 1) * (0.5 + 0.5 * Math.min(1, cam.k)); // 引きの視点では密集部が白飛びしないよう抑える
        if (gl > 0.02) {
          ctx.globalCompositeOperation = "lighter";
          const gsz = r * (isFocus ? 9 : 4.5 + 2.5 * n.weight) * pulse * (0.5 + gl);
          ctx.globalAlpha = a * (isFocus ? 1 : 0.55 + 0.45 * n.weight) * gl;
          ctx.drawImage(sprite(n.color), sx - gsz, sy - gsz, gsz * 2, gsz * 2);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
        ctx.beginPath(); ctx.arc(sx, sy, r * pulse, 0, Math.PI * 2); ctx.fill();
        // 芯の白（発光の中心）
        ctx.fillStyle = `rgba(255,255,255,${(n.kind === "moment" ? 0.85 : 0.5) * a * (0.4 + gl * 0.6)})`;
        ctx.beginPath(); ctx.arc(sx, sy, r * pulse * 0.45, 0, Math.PI * 2); ctx.fill();
        if (n.kind === "moment") { ctx.strokeStyle = `rgba(255,255,255,${0.55 * a})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, r * pulse, 0, Math.PI * 2); ctx.stroke(); }
        if (isFocus || i === selI) { ctx.strokeStyle = `rgba(235,255,0,${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, r + 4, 0, Math.PI * 2); ctx.stroke(); }
        // ラベル: ズームと次数のしきい値でフェード（Obsidian の text fade threshold）
        const importance = n.kind === "moment" ? 0.55 + n.weight : 0.4 + Math.sqrt(n.deg) * 0.3;
        let la = Math.max(0, Math.min(1, (cam.k * importance - textK) / 0.3));
        if (isFocus || isNeigh || (matchSet && matchSet.has(i))) la = 1;
        if (la > 0.02) labelsToDraw.push({ x: sx, y: sy + r + 3, t: n.label, a: la * a, c: n.kind === "moment" ? "#f4f4f2" : n.color, big: isFocus });
      }
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (const l of labelsToDraw) {
        const fs = l.big ? 14 : 11;
        ctx.font = `${l.big ? 700 : 500} ${fs}px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
        const t = l.t.length > 22 && !l.big ? l.t.slice(0, 21) + "…" : l.t;
        ctx.fillStyle = `rgba(0,0,0,${0.75 * l.a})`;
        ctx.lineWidth = 3; ctx.strokeStyle = `rgba(7,7,10,${0.9 * l.a})`; ctx.strokeText(t, l.x, l.y);
        const [cr, cg, cb] = hexToRgb(l.c);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${l.a})`; ctx.fillText(t, l.x, l.y);
      }
      if (now - statT > 400) { statT = now; setStats({ alpha, fps: fpsN ? Math.round(1000 / (fpsAcc / fpsN)) : 0, lite }); fpsAcc = 0; fpsN = 0; }
    };
    raf = requestAnimationFrame(draw);
    // ---- 操作 ----
    let drag: { i: number | null; sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
    const pick = (sx: number, sy: number) => {
      let best = -1, bd = 1e9;
      for (let i = 0; i < N; i++) {
        const n = nodes[i]; if (!visible(n)) continue;
        const [x, y] = toScreen(n.x, n.y);
        const r = radiusOf(n) * Math.sqrt(cam.k) + 6;
        const d = (x - sx) * (x - sx) + (y - sy) * (y - sy);
        if (d < r * r && d < bd) { bd = d; best = i; }
      }
      return best < 0 ? null : best;
    };
    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const i = pick(sx, sy);
      drag = { i, sx, sy, cx: cam.x, cy: cam.y, moved: false };
      if (i === null) userMoved = true;
      if (i !== null) { nodes[i].fixed = true; alphaTarget = 0.3; }
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (drag) {
        if (Math.abs(sx - drag.sx) + Math.abs(sy - drag.sy) > 3) drag.moved = true;
        if (drag.i !== null) { const [wx, wy] = toWorld(sx, sy); nodes[drag.i].x = wx; nodes[drag.i].y = wy; }
        else { cam.x = drag.cx - (sx - drag.sx) / cam.k; cam.y = drag.cy - (sy - drag.sy) / cam.k; }
        return;
      }
      const i = pick(sx, sy);
      if (i !== S.current.hovered) setHovered(i);
      canvas.style.cursor = i !== null ? "pointer" : "grab";
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      if (drag.i !== null) { nodes[drag.i].fixed = false; alphaTarget = 0; if (alpha < 0.1) alpha = 0.1; }
      if (!drag.moved) { setSelected(drag.i); }
      drag = null;
      canvas.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const [wx, wy] = toWorld(sx, sy);
      userMoved = true;
      const k = Math.max(0.15, Math.min(6, cam.k * Math.exp(-e.deltaY * 0.0016)));
      cam.k = k;
      const [wx2, wy2] = toWorld(sx, sy);
      cam.x += wx - wx2; cam.y += wy - wy2;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    api.current = {
      focus: (i: number) => {
        const n = nodes[i];
        const from = { ...cam }, to = { x: n.x, y: n.y, k: Math.max(cam.k, 1.6) };
        const t0 = performance.now();
        userMoved = true;
        const tw = () => { const k = Math.min(1, (performance.now() - t0) / 600); const e = 1 - Math.pow(1 - k, 3); cam.x = from.x + (to.x - from.x) * e; cam.y = from.y + (to.y - from.y) * e; cam.k = from.k + (to.k - from.k) * e; if (k < 1) requestAnimationFrame(tw); };
        tw();
      },
    };
    // 力の設定が変わったら再加熱
    let lastForces = JSON.stringify(S.current.forces), lastEnabled = JSON.stringify(S.current.enabled);
    const watch = setInterval(() => {
      const f = JSON.stringify(S.current.forces), en = JSON.stringify(S.current.enabled);
      if (f !== lastForces || en !== lastEnabled) { lastForces = f; lastEnabled = en; alpha = Math.max(alpha, 0.5); }
    }, 200);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); clearInterval(watch); canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("wheel", onWheel); };
  }, [graph]);

  const sel = selected !== null ? graph.nodes[selected] : null;
  const similar = useMemo(() => {
    if (!sel?.moment) return [];
    const v = vecOf(sel.moment);
    return moments.filter((m) => m.id !== sel.moment!.id).map((m) => ({ m, s: cosine(v, vecOf(m)) })).sort((a, b) => b.s - a.s).slice(0, 4);
  }, [sel, moments]);
  const backlinks = useMemo(() => {
    if (selected === null) return [];
    const out: GNode[] = [];
    for (const l of graph.links) { if (l.a === selected) out.push(graph.nodes[l.b]); else if (l.b === selected) out.push(graph.nodes[l.a]); }
    return out;
  }, [selected, graph]);
  const selectId = (id: string) => { const i = graph.nodes.findIndex((n) => n.id === id); if (i >= 0) { setSelected(i); api.current?.focus(i); } };

  return (
    <div className="cg" ref={hostRef}>
      <canvas ref={canvasRef} className="cg-canvas" />

      <header className="cg-head">
        <div>
          <div className="cg-kicker">É MOOMENTS 100 — BEHIND THE VORTEX</div>
          <h1>CONTEXT <em>GRAPH</em></h1>
          <div className="cg-sub">100の瞬間を、人物・チーム・大会・モチーフ・感情に分解して繋ぎ直した地図。渦の腕はこの上で組み替えられる。</div>
        </div>
        <a className="cg-back" href="/">← 渦へ戻る</a>
      </header>

      <aside className="cg-panel cg-left">
        <Section title="フィルター" open={open.filter} onToggle={() => setOpen((o) => ({ ...o, filter: !o.filter }))}>
          <input className="cg-search" placeholder="検索（例: 土壇場 / 大谷 / 涙）" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="cg-groups">
            {KINDS.map((k) => (
              <label key={k} className={`cg-group${enabled[k] ? "" : " off"}`}>
                <input type="checkbox" checked={enabled[k]} onChange={(e) => setEnabled((v) => ({ ...v, [k]: e.target.checked }))} />
                <span className="cg-dot" style={{ background: KIND_COLOR[k] }} />
                <span className="cg-group-name">{KIND_LABEL[k]}</span>
                <span className="cg-group-n">{counts[k] ?? 0}</span>
              </label>
            ))}
          </div>
        </Section>
        <Section title="表示" open={open.display} onToggle={() => setOpen((o) => ({ ...o, display: !o.display }))}>
          <Slider label="ノードの大きさ" v={display.node} on={(v) => setDisplay((d) => ({ ...d, node: v }))} />
          <Slider label="リンクの太さ" v={display.edge} on={(v) => setDisplay((d) => ({ ...d, edge: v }))} />
          <Slider label="テキストの表示しきい値" v={display.text} on={(v) => setDisplay((d) => ({ ...d, text: v }))} />
          <Slider label="発光" v={display.glow} on={(v) => setDisplay((d) => ({ ...d, glow: v }))} />
          <Slider label="血流（リンク上の流れ）" v={display.flow} on={(v) => setDisplay((d) => ({ ...d, flow: v }))} />
        </Section>
        <Section title="力" open={open.forces} onToggle={() => setOpen((o) => ({ ...o, forces: !o.forces }))}>
          <Slider label="中心への引力" v={forces.center} on={(v) => setForces((f) => ({ ...f, center: v }))} />
          <Slider label="反発力" v={forces.repel} on={(v) => setForces((f) => ({ ...f, repel: v }))} />
          <Slider label="リンクの強さ" v={forces.link} on={(v) => setForces((f) => ({ ...f, link: v }))} />
          <Slider label="リンクの距離" v={forces.dist} on={(v) => setForces((f) => ({ ...f, dist: v }))} />
        </Section>
      </aside>

      {sel && (
        <aside className="cg-panel cg-inspector">
          <button className="cg-close" onClick={() => setSelected(null)}>×</button>
          {sel.moment ? (
            <MomentInspector n={sel} similar={similar} onPick={selectId} />
          ) : (
            <div>
              <div className="cg-kind" style={{ color: sel.color }}>{KIND_LABEL[sel.kind]}</div>
              <h2>{sel.label}</h2>
              <div className="cg-meta">{backlinks.length} の瞬間とつながる</div>
              <div className="cg-list">
                {backlinks.filter((b) => b.kind === "moment").map((b) => (
                  <button key={b.id} className="cg-row" onClick={() => selectId(b.id)}>
                    <span className="cg-dot" style={{ background: b.color }} />
                    <span>{b.label}</span>
                    <span className="cg-row-n">🔥{b.moment?.votes.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}

      <footer className="cg-status">
        <span><b>{graph.nodes.length.toLocaleString()}</b> nodes</span>
        <span><b>{graph.links.length.toLocaleString()}</b> links</span>
        <span>layout <b>{Math.round((1 - Math.min(1, stats.alpha)) * 100)}%</b></span>
        <span>{stats.fps} fps{stats.lite ? " · lite" : ""}</span>
        <span className="cg-pipe">ingest ✓ segment ✓ entity ✓ emotion ✓ motif ✓ embed ✓ cluster ✓</span>
        {hovered !== null && <span className="cg-hover">{KIND_LABEL[graph.nodes[hovered].kind]} · {graph.nodes[hovered].label}</span>}
      </footer>

      {!booted && (
        <div className="cg-boot">
          <div className="cg-boot-title">CONTEXT ENGINE</div>
          <pre>{bootLines.join("\n")}</pre>
          <div className="cg-boot-bar"><i style={{ width: `${(bootLines.length / 7) * 100}%` }} /></div>
        </div>
      )}
    </div>
  );
}

function MomentInspector({ n, similar, onPick }: { n: GNode; similar: { m: MomentWithStats; s: number }[]; onPick: (id: string) => void }) {
  const m = n.moment!, c = n.ctx;
  const vec = m.vec ?? [];
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    const lines = [
      `$ decompose ${m.id}  (${m.youtubeId})`,
      `  frames ......... ${Math.round(3000 + m.intensity! * 4000)} sampled · peak @${m.peakSec ?? 0}s`,
      `  transcript ..... ${(m.description.length * 1.7) | 0} tokens`,
      `  entities ....... ${[...(c?.people ?? []), ...(c?.teams ?? [])].length} resolved`,
      `  motifs ......... ${(c?.motifs ?? []).join(" / ")}`,
      `  emotion ........ [${vec.map((v) => v.toFixed(2)).join(", ")}]`,
      `  arc ............ ${(c?.beats ?? []).length} beats · intensity ${(m.intensity ?? 0).toFixed(2)}`,
      `  done  ${(120 + m.index * 7) % 900 + 140}ms`,
    ];
    setLog([]);
    let i = 0;
    const id = setInterval(() => { i++; setLog(lines.slice(0, i)); if (i >= lines.length) clearInterval(id); }, 90);
    return () => clearInterval(id);
  }, [m, c, vec]);
  return (
    <div>
      <div className="cg-kind" style={{ color: n.color }}>瞬間 · {m.emotions[0]}</div>
      <h2>{m.title}</h2>
      <div className="cg-meta">{m.event} · {m.year} · 🔥{m.votes.toLocaleString()}</div>
      <div className="cg-thumb" style={{ backgroundImage: `url(/api/thumb/${m.youtubeId})` }} />
      <div className="cg-block">
        <div className="cg-h">抽出エンティティ</div>
        <div className="cg-tags">
          {(c?.people ?? []).map((p) => <button key={p} className="cg-tag" style={{ borderColor: KIND_COLOR.person }} onClick={() => onPick(`p:${p}`)}>{p}</button>)}
          {(c?.teams ?? []).map((t) => <button key={t} className="cg-tag" style={{ borderColor: KIND_COLOR.team }} onClick={() => onPick(`t:${t}`)}>{t}</button>)}
          {c?.competition && <button className="cg-tag" style={{ borderColor: KIND_COLOR.competition }} onClick={() => onPick(`c:${c.competition}`)}>{c.competition}</button>}
          <button className="cg-tag" style={{ borderColor: KIND_COLOR.sport }} onClick={() => onPick(`s:${m.sport}`)}>{m.sport}</button>
        </div>
      </div>
      <div className="cg-block">
        <div className="cg-h">モチーフ</div>
        <div className="cg-tags">{(c?.motifs ?? []).map((t) => <button key={t} className="cg-tag motif" onClick={() => onPick(`o:${t}`)}>{t}</button>)}</div>
      </div>
      <div className="cg-block">
        <div className="cg-h">感情ベクトル（8軸）</div>
        <div className="cg-bars">
          {EMOTIONS.map((e, i) => (
            <div key={e} className="cg-bar"><span>{e}</span><i><b style={{ width: `${(vec[i] ?? 0) * 100}%` }} /></i><em>{(vec[i] ?? 0).toFixed(2)}</em></div>
          ))}
        </div>
      </div>
      {c && c.beats.length > 0 && (
        <div className="cg-block">
          <div className="cg-h">物語の弧</div>
          <ol className="cg-beats">{c.beats.map((b, i) => <li key={i}>{b}</li>)}</ol>
        </div>
      )}
      {c?.why && <div className="cg-block"><div className="cg-h">なぜ心が動くか</div><p className="cg-why">{c.why}</p>{c.crowd && <div className="cg-crowd">場内: {c.crowd}</div>}</div>}
      <div className="cg-block">
        <div className="cg-h">感情が近い瞬間</div>
        <div className="cg-list">
          {similar.map(({ m: s, s: sc }) => (
            <button key={s.id} className="cg-row" onClick={() => onPick(`m:${s.id}`)}>
              <span className="cg-sim">{(sc * 100).toFixed(0)}%</span><span>{s.title}</span>
            </button>
          ))}
        </div>
      </div>
      <pre className="cg-log">{log.join("\n")}</pre>
    </div>
  );
}

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={`cg-section${open ? " open" : ""}`}>
      <button className="cg-section-h" onClick={onToggle}><span className="cg-caret">{open ? "▾" : "▸"}</span>{title}</button>
      {open && <div className="cg-section-b">{children}</div>}
    </div>
  );
}
function Slider({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <label className="cg-slider">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.01} value={v} onChange={(e) => on(Number(e.target.value))} />
    </label>
  );
}
function hexToRgb(h: string): [number, number, number] {
  const s = h.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

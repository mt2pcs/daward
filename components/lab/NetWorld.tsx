"use client";
// 熱狂の神経系（体験の試作）。
// 構造: 位置の意味は「中心＝いま自分が押したもの（または投げた言葉）」「距離＝そこからの繋がりの近さ」。押すたびに全体が組み替わる。
//   100の瞬間 → 1本を押すと、その瞬間が人×その1秒のかけらにほどける → かけらを押すと、全部の瞬間がかけらにほどけて、
//   押したかけらが中心、同じものを持つかけらが周り（同時に映像が流れる、繋がりの種類は色）、その先が外側、残りは奥に沈む →
//   周りのかけらを押すとそれが中心になって組み替わる。言葉を投げると、その言葉が中心になって組み替わる。
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

const BASE = "https://storage.googleapis.com/e-mooments-assets";
// 繋がりの種類の色（ロゴの画素から採った色）: 体の動き / 表情 / 声 / 関係 / 場所 / 境遇 / 懸かっていたもの
const KIND_COLOR = ["#ff8866", "#ffee55", "#ff3366", "#4de6ff", "#ccdd66", "#dd8820", "#ffffff"];
const WORD_COLOR = "#ffffff";

type Person = { i: number; no: string; name: string; state: string; event: string; t: number; el: [string, number][] };
type Moment = { no: string; title: string; sport: string; people: number[] };
type World = { kinds: string[]; moments: Moment[]; people: Person[]; links: [number, number, number, number, number, number, string][]; names?: Record<string, string> };
type MediaMap = Record<string, { webm?: string; loop?: string }>;
type Hover = { x: number; y: number; title: string; sub: string; why?: string } | null;
type Mode = { kind: "universe" } | { kind: "open"; no: string } | { kind: "focus"; i: number } | { kind: "word"; q: string; name: string; picks: { i: number; line: string }[] } | { kind: "reading"; q: string };

const EX = ["最後の一球", "負けた側の顔", "ベテランの熱量", "親父", "ベンチの熱", "悔し涙"];

export default function NetWorld({ media }: { media: MediaMap }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ go: (m: Mode) => void } | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "universe" });
  const [hover, setHover] = useState<Hover>(null);
  const [caption, setCaption] = useState<{ name: string; title?: string; sub?: string } | null>(null);
  const [labels, setLabels] = useState<{ x: number; y: number; t: string; c?: string }[]>([]);
  const [q, setQ] = useState("");
  const [ph, setPh] = useState(0);
  const [note, setNote] = useState("");
  const [ready, setReady] = useState(false);
  const [word, setWord] = useState<{ text: string; y: number } | null>(null);
  const modeRef = useRef<Mode>(mode); modeRef.current = mode;

  useEffect(() => { const t = setInterval(() => setPh((p) => (p + 1) % EX.length), 3200); return () => clearInterval(t); }, []);

  useEffect(() => {
    let alive = true; const el = host.current!;
    const portrait = () => innerHeight > innerWidth * 1.05;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const resize = () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.fov = portrait() ? 64 : 50; cam.updateProjectionMatrix(); lineMats.forEach((m) => m.resolution.set(innerWidth, innerHeight)); };
    const lineMats: LineMaterial[] = [];
    addEventListener("resize", resize);
    let W: World; const tiles: Tile[] = [], cards: Tile[] = [];
    type Tile = { mesh: THREE.Mesh; frame: THREE.Mesh; mat: THREE.MeshBasicMaterial; fmat: THREE.MeshBasicMaterial; still: THREE.Texture | null; c: number[]; g: number[]; kind: "p" | "m"; id: number; vid?: Slot | null; fc: THREE.Color; fo: number };
    const geo = new THREE.PlaneGeometry(1, 0.5625), fgeo = new THREE.PlaneGeometry(1.06, 0.5625 + 0.06);
    const mk = (kind: "p" | "m", id: number): Tile => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false });
      const fmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat), frame = new THREE.Mesh(fgeo, fmat); frame.position.z = -0.02; mesh.add(frame); scene.add(mesh);
      mesh.userData = { kind, id };
      return { mesh, frame, mat, fmat, still: null, c: [0, 0, -200, 0, 0], g: [0, 0, -200, 0, 0], kind, id, fc: new THREE.Color(0xffffff), fo: 0 };
    };
    // 映像の枠（同時に流せる数）
    type Slot = { v: HTMLVideoElement; tex: THREE.VideoTexture; owner: Tile | null };
    const MAXV = portrait() ? 7 : 11, slots: Slot[] = [];
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    for (let k = 0; k < MAXV; k++) { const v = document.createElement("video"); v.crossOrigin = "anonymous"; v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
      const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; slots.push({ v, tex, owner: null }); }
    const srcOf = (t: Tile) => t.kind === "p" ? `${BASE}/lab/net/c/${t.id}.${safari ? "mp4" : "webm"}` : (() => { const m = media[W.moments[t.id].no]; return safari ? m?.loop : m?.webm; })();
    function setPlaying(list: { t: Tile; sound?: boolean }[]) {
      const want = list.slice(0, MAXV), keep = new Set(want.map((w) => w.t));
      for (const s of slots) if (s.owner && !keep.has(s.owner)) { s.owner.vid = null; s.owner.mat.map = s.owner.still; s.owner.mat.needsUpdate = true; s.owner = null; s.v.pause(); }
      for (const w of want) { if (w.t.vid) { w.t.vid.v.muted = !w.sound; continue; } const s = slots.find((x) => !x.owner); const src = srcOf(w.t); if (!s || !src) continue;
        s.owner = w.t; w.t.vid = s; s.v.muted = !w.sound; s.v.src = src; s.v.load();
        const t = w.t; s.v.oncanplay = () => { if (t.vid === s) { t.mat.map = s.tex; t.mat.needsUpdate = true; } }; }
      // 同時に頭から流す（同じ所作が同じ時に起きる）
      setTimeout(() => { for (const s of slots) if (s.owner) { try { s.v.currentTime = 0; } catch { /* */ } s.v.play().catch(() => { s.v.muted = true; s.v.play().catch(() => {}); }); } }, 700);
    }
    // 線（繋がり）
    type Ln = { line: Line2; geo: LineGeometry; mat: LineMaterial; a: Tile | null; b: Tile | null; ax?: THREE.Vector3; o: number; go: number };
    const lines: Ln[] = [];
    const getLine = (k: number) => { while (lines.length <= k) { const g = new LineGeometry(); g.setPositions(new Array(3 * 24).fill(0)); const m = new LineMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0, depthWrite: false }); m.resolution.set(innerWidth, innerHeight); lineMats.push(m); const l = new Line2(g, m); l.frustumCulled = false; l.renderOrder = -1; scene.add(l); lines.push({ line: l, geo: g, mat: m, a: null, b: null, o: 0, go: 0 }); } return lines[k]; };
    resize();

    // 配置
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const BG: number[][] = [];  // 奥に沈むときの場所（かけらごとに固定）
    const UNI: number[][] = [];  // 100の瞬間の場所
    const UNIK: Record<string, number> = {};  // 瞬間番号 → 何番目
    // 100の瞬間の場所（角度・半径・奥行き）を画面の向きに合わせて広げる。縦画面は縦長に
    const uni = (k: number, ang = 0) => { const [a, r, z] = UNI[k], pr = portrait(); return pr ? [Math.cos(a + ang) * r * 0.42, Math.sin(a + ang) * r * 0.9, z] : [Math.cos(a + ang) * r, Math.sin(a + ang) * r * 0.62, z]; };
    const nb = new Map<number, { y: number; k: number; r: number; why: string }[]>();
    let uniAng = 0;
    const AW = () => (portrait() ? 0.62 : 1);  // 横の広がり
    function layout(m: Mode) {
      const P = W.people, pr = portrait();
      for (const t of tiles) { const b = BG[t.id]; t.g = [b[0] * AW(), b[1], b[2], pr ? 2.2 : 2.6, 0.32]; t.fo = 0; }
      for (const c of cards) { c.g = [...c.g.slice(0, 3), c.g[3], 0]; c.fo = 0; }
      const ring: { t: Tile; c: string }[] = [], lineSpec: { a: Tile | null; ax?: THREE.Vector3; b: Tile; c: string; w: number; o: number }[] = [];
      const play: { t: Tile; sound?: boolean }[] = [];
      let cap: { name: string; title?: string; sub?: string } | null = null; let word: { text: string; y: number } | null = null; const lbl: { t: Tile; text: string; c?: string }[] = [];
      if (m.kind === "universe") {
        for (const t of tiles) { const u = uni(UNIK[W.people[t.id].no], uniAng); t.g = [u[0], u[1], u[2], 0.01, 0]; }
        cards.forEach((c, k) => { const u = uni(k, uniAng); c.g = [u[0], u[1], u[2], pr ? 4.6 : 6.2, 1]; });
      } else if (m.kind === "open") {
        const k = W.moments.findIndex((x) => x.no === m.no), mm = W.moments[k], c = cards[k];
        cards.forEach((x, j) => { const u = uni(j, uniAng); x.g = [u[0] * 1.6, u[1] * 1.6, u[2] - 50, 4, j === k ? 0 : 0.12]; });
        for (const t of tiles) t.g = [t.g[0], t.g[1], t.g[2], t.g[3], 0];   // 他の瞬間のかけらはまだ出さない
        c.g = [0, pr ? 13 : 7.5, 6, pr ? 17 : 19, 1]; play.push({ t: c, sound: true });
        const n = mm.people.length;
        // その瞬間が、人×その1秒のかけらにほどけて下へ広がる（PC は弧、スマホは2列）
        mm.people.forEach((pi, j) => { const t = tiles[pi]; let x: number, y: number;
          if (pr) { const col = j % 2, row = Math.floor(j / 2); x = (col - 0.5) * 11.5; y = -1 - row * 7.2; }
          else { const sp = Math.min(10.5, 60 / Math.max(1, n - 1)), u = j - (n - 1) / 2; x = u * sp; y = -8 + 0.09 * u * u * sp; }
          t.g = [x, y, 2, pr ? 10 : 9, 1]; t.fo = 0.0;
          play.push({ t }); lbl.push({ t, text: P[pi].state });
          lineSpec.push({ a: c, b: t, c: "#ffffff", w: 1.2, o: 0.35 }); });
        cap = { name: mm.title, sub: mm.sport };
      } else if (m.kind === "focus" || m.kind === "word") {
        let center: Tile | null = null, firsts: { y: number; k: number; r: number; why: string; line?: string }[];
        if (m.kind === "focus") { center = tiles[m.i]; firsts = (nb.get(m.i) || []).slice().sort((a, b) => b.r - a.r).slice(0, pr ? 8 : 10); }
        else firsts = m.picks.slice(0, pr ? 8 : 12).map((p) => ({ y: p.i, k: -1, r: 3, why: "", line: p.line }));
        const cy = pr ? 3 : 2;
        if (center) { center.g = [0, cy, 8, pr ? 15 : 17, 1]; center.fo = 0.9; center.fc.set("#ffffff"); play.push({ t: center, sound: true }); }
        const n = firsts.length, rx = pr ? 11.5 : 31, ry = pr ? 20 : 14.5, used = new Set<number>(center ? [m.kind === "focus" ? m.i : -1] : []);
        firsts.forEach((f, j) => { const a = -Math.PI / 2 + (j / n) * Math.PI * 2 + (n % 2 ? 0 : Math.PI / n), t = tiles[f.y]; used.add(f.y);
          const col = f.k >= 0 ? KIND_COLOR[f.k] : WORD_COLOR;
          t.g = [Math.cos(a) * rx, cy + Math.sin(a) * ry, 3, pr ? 7.4 : 9, 1]; t.fo = 0.95; t.fc.set(col); play.push({ t }); ring.push({ t, c: col });
          if (m.kind === "word" && f.line) lbl.push({ t, text: f.line });
          lineSpec.push({ a: center, ax: center ? undefined : new THREE.Vector3(0, cy, 8), b: t, c: col, w: pr ? 3 : 3.5, o: 0.95 });
          (t.mesh.userData as { why?: string; line?: string }).why = f.why; (t.mesh.userData as { line?: string }).line = f.line; });
        // その先（2つ目の繋がり）
        firsts.forEach((f, j) => { const a0 = Math.atan2(tiles[f.y].g[1] - cy, tiles[f.y].g[0]);
          const sec = (nb.get(f.y) || []).filter((x) => !used.has(x.y)).sort((a, b) => b.r - a.r).slice(0, 3);
          sec.forEach((s, k) => { used.add(s.y); const a = a0 + (k - (sec.length - 1) / 2) * (pr ? 0.32 : 0.22), R = pr ? 1.55 : 1.5, t = tiles[s.y];
            t.g = [Math.cos(a) * rx * R, cy + Math.sin(a) * ry * R, -6, pr ? 3.4 : 3.8, 0.85]; t.fo = 0.5; t.fc.set(KIND_COLOR[s.k]);
            lineSpec.push({ a: tiles[f.y], b: t, c: KIND_COLOR[s.k], w: 1.4, o: 0.55 }); }); });
        cards.forEach((c) => { c.g = [c.g[0], c.g[1], c.g[2], c.g[3], 0]; });
        if (m.kind === "focus") { const p = P[m.i]; cap = { name: W.names?.[m.i] || p.state, title: `${p.name}`, sub: `${sportOf(p.no)}　${W.moments.find((x) => x.no === p.no)?.title || ""}` }; }
        else { cap = { name: m.name }; word = { text: m.q, y: cy }; }
      } else if (m.kind === "reading") { word = { text: m.q, y: 0 };
        // 言葉を読んでいる間: 全部のかけらが中心へ吸い寄せられて回る
        for (const t of tiles) { const b = BG[t.id]; const s = 0.35; t.g = [b[0] * s * AW(), b[1] * s, b[2] * 0.5, 1.8, 0.5]; }
        cap = null;
      }
      // 線
      lines.forEach((l) => { l.go = 0; });
      lineSpec.forEach((s, k) => { const l = getLine(k); l.a = s.a; l.ax = s.ax; l.b = s.b; l.go = s.o; l.mat.color.set(s.c); l.mat.linewidth = s.w; });
      setPlaying(play); setCaption(cap); labelSpec = lbl; setWord(word);
    }
    let labelSpec: { t: Tile; text: string; c?: string }[] = [];
    const sportOf = (no: string) => W.moments.find((m) => m.no === no)?.sport || "";

    // 読み込み
    (async () => {
      W = await (await fetch("/lab/net/world.json")).json();
      for (const [a, b, k, r, , , why] of W.links) for (const [x, y] of [[a, b], [b, a]]) { if (!nb.has(x)) nb.set(x, []); nb.get(x)!.push({ y, k, r, why }); }
      W.people.forEach(() => { const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), R = 70 + rnd() * 40; BG.push([Math.cos(th) * Math.sin(ph) * R * 1.3, Math.cos(ph) * R * 0.55, -60 - Math.abs(Math.sin(th) * Math.sin(ph)) * R]); });
      W.moments.forEach((_, k) => { const a = k * 2.399963, r = 9 + 33 * Math.sqrt((k + 0.5) / W.moments.length); UNI.push([a, r, -18 + rnd() * 16]); });
      W.moments.forEach((m, k) => (UNIK[m.no] = k));
      // 人のかけらは自分の瞬間の場所から生まれる
      W.people.forEach((p) => { const t = mk("p", p.i); const k = W.moments.findIndex((m) => m.no === p.no); t.c = [...uni(k), 0.01, 0]; t.g = t.c.slice(); tiles.push(t); });
      W.moments.forEach((_, k) => { const c = mk("m", k); c.c = [uni(k)[0] * 3, uni(k)[1] * 3, -120, 6, 0]; cards.push(c); });
      // 1秒のコマ（2枚のアトラス、16×16）
      const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
      const atl = await Promise.all([0, 1].map((s) => new Promise<THREE.Texture>((res) => loader.load(`${BASE}/lab/net/atlas${s}.jpg`, res, undefined, () => res(new THREE.Texture())))));
      atl.forEach((a) => { a.colorSpace = THREE.SRGBColorSpace; a.anisotropy = 4; });
      const still = (i: number) => { const s = Math.floor(i / 256), k = i % 256, tx = atl[s].clone(); tx.repeat.set(1 / 16, 1 / 16); tx.offset.set((k % 16) / 16, 1 - (Math.floor(k / 16) + 1) / 16); tx.needsUpdate = true; return tx; };
      for (const t of tiles) { t.still = still(t.id); t.mat.map = t.still; t.mat.color.set(0xffffff); t.mat.needsUpdate = true; }
      cards.forEach((c, k) => { c.still = still(W.moments[k].people[0]); c.mat.map = c.still; c.mat.color.set(0xffffff); c.mat.needsUpdate = true; });
      if (!alive) return; setReady(true); layout(modeRef.current);
    })();
    api.current = { go: (m) => { if (W) layout(m); } };

    // 操作
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let px = 0, py = 0;
    const hit = (x: number, y: number): Tile | null => { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
      const objs = [...tiles, ...cards].filter((t) => t.mat.opacity > 0.25 && t.mesh.scale.x > 0.5).map((t) => t.mesh);
      const h = ray.intersectObjects(objs, false)[0]; if (!h) return null; return [...tiles, ...cards].find((t) => t.mesh === h.object) || null; };
    const describe = (t: Tile, x: number, y: number): Hover => {
      if (t.kind === "m") { const m = W.moments[t.id]; return { x, y, title: m.title, sub: m.sport }; }
      const p = W.people[t.id], ud = t.mesh.userData as { why?: string; line?: string }, md = modeRef.current;
      const near = md.kind === "focus" || md.kind === "word" ? (ud.line || ud.why) : undefined;
      return { x, y, title: `${p.name}｜${p.state}`, sub: `${sportOf(p.no)}　${W.moments.find((m) => m.no === p.no)?.title || ""}`, why: near };
    };
    const onMove = (e: PointerEvent) => { px = (e.clientX / innerWidth) * 2 - 1; py = (e.clientY / innerHeight) * 2 - 1; if (e.pointerType !== "mouse" || !W) return;
      const t = hit(e.clientX, e.clientY); setHover(t ? describe(t, e.clientX, e.clientY) : null); el.style.cursor = t ? "pointer" : "default"; };
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10 || !W) return; down = null;
      const t = hit(e.clientX, e.clientY); if (!t) return; const md = modeRef.current;
      if (t.kind === "m") { if (md.kind === "universe" || md.kind === "open") go({ kind: "open", no: W.moments[t.id].no }); return; }
      if (md.kind === "focus" && md.i === t.id) return; go({ kind: "focus", i: t.id }); setHover(null); };
    el.addEventListener("pointermove", onMove); el.addEventListener("pointerdown", onDown); el.addEventListener("pointerup", onUp);
    const go = (m: Mode) => { setMode(m); layout(m); };
    (api.current as { go: (m: Mode) => void }).go = go;

    // 毎フレーム
    let last = performance.now(); const tmp = new THREE.Vector3(), tmpB = new THREE.Vector3();
    const camPos = new THREE.Vector3(0, 0, 62), look = new THREE.Vector3();
    const V = new THREE.Vector3();
    function frame(now: number) {
      if (!alive) return; const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      const md = modeRef.current, k = 1 - Math.exp(-dt / 0.55), ko = 1 - Math.exp(-dt / 0.4);
      if (md.kind === "universe") uniAng += dt * 0.03;
      const pr = portrait();
      camPos.set(px * (pr ? 1.5 : 4), -py * 2.5, pr ? 66 : 62); cam.position.lerp(camPos, 1 - Math.exp(-dt * 2)); look.set(0, 0, 0); cam.lookAt(look);
      if (md.kind === "reading") for (const t of tiles) { const a = dt * 0.9 * (1 + (t.id % 5) * 0.12), x = t.g[0], y = t.g[1]; t.g[0] = x * Math.cos(a) - y * Math.sin(a); t.g[1] = x * Math.sin(a) + y * Math.cos(a); }
      const all = [...tiles, ...cards];
      for (const t of all) {
        let gx = t.g[0], gy = t.g[1];
        if (md.kind === "universe" && t.kind === "m") { const u = uni(t.id, uniAng); gx = u[0]; gy = u[1]; }
        t.c[0] += (gx - t.c[0]) * k; t.c[1] += (gy - t.c[1]) * k; t.c[2] += (t.g[2] - t.c[2]) * k; t.c[3] += (t.g[3] - t.c[3]) * k; t.c[4] += (t.g[4] - t.c[4]) * ko;
        t.mesh.position.set(t.c[0], t.c[1], t.c[2]); const s = Math.max(0.001, t.c[3]); t.mesh.scale.set(s, s, 1); t.mesh.quaternion.copy(cam.quaternion);
        t.mat.opacity = t.c[4]; t.mesh.visible = t.c[4] > 0.01;
        t.fmat.color.lerp(t.fc, ko); t.fmat.opacity += (t.fo * t.c[4] - t.fmat.opacity) * ko;
        t.mesh.renderOrder = Math.round(t.c[2] * 10 + 2000);
      }
      for (const l of lines) { l.o += (l.go - l.o) * ko; l.mat.opacity = l.o; l.line.visible = l.o > 0.01 && !!l.b;
        if (!l.line.visible || !l.b) continue; const A = l.a ? tmp.set(l.a.c[0], l.a.c[1], l.a.c[2] - 0.5) : tmp.copy(l.ax || V.set(0, 0, 0)), B = tmpB.set(l.b.c[0], l.b.c[1], l.b.c[2] - 0.5);
        const pts: number[] = []; const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, mz = Math.min(A.z, B.z) - 6;
        for (let j = 0; j < 24; j++) { const u = j / 23, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; pts.push(A.x * a + mx * b + B.x * c, A.y * a + my * b + B.y * c, A.z * a + mz * b + B.z * c); }
        l.geo.setPositions(pts); }
      renderer.render(scene, cam);
      // 文字の位置
      if (labelSpec.length) { const out = labelSpec.map((s) => { V.set(s.t.c[0], s.t.c[1] - s.t.c[3] * 0.5625 * 0.5, s.t.c[2]).project(cam); return { x: (V.x + 1) / 2 * innerWidth, y: (1 - V.y) / 2 * innerHeight + 12, t: s.text, c: s.c }; });
        setLabels((prev) => (prev.length === out.length && prev.every((p, j) => Math.abs(p.x - out[j].x) < 0.5 && Math.abs(p.y - out[j].y) < 0.5 && p.t === out[j].t) ? prev : out)); }
      else setLabels((prev) => (prev.length ? [] : prev));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    (window as unknown as { __net: unknown }).__net = { go: (m: Mode) => go(m), tiles: () => tiles.length, playing: () => slots.filter((s) => s.owner && !s.v.paused && s.v.readyState >= 2).length, center: () => { V.set(0, 0, 0); return null; },
      screenOf: (kind: "p" | "m", id: number) => { const t = (kind === "p" ? tiles : cards)[id]; V.set(t.c[0], t.c[1], t.c[2]).project(cam); return [(V.x + 1) / 2 * innerWidth, (1 - V.y) / 2 * innerHeight]; },
      ring: () => { const md = modeRef.current; return md.kind === "focus" ? (nb.get(md.i) || []).map((x) => x.y) : md.kind === "word" ? md.picks.map((p) => p.i) : []; } };
    return () => { alive = false; removeEventListener("resize", resize); renderer.dispose(); el.innerHTML = ""; slots.forEach((s) => { s.v.pause(); s.v.src = ""; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function throwWord(e?: React.FormEvent) {
    e?.preventDefault(); const w = (q.trim() || EX[ph]).slice(0, 40); setNote("");
    api.current?.go({ kind: "reading", q: w }); setMode({ kind: "reading", q: w });
    try {
      const r = await fetch("/api/lab/net/word", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: w }) });
      const j = await r.json();
      if (j.unreadable || !j.picks?.length) { setNote("その言葉では組み替えられませんでした。スポーツの見方の言葉で投げてください"); api.current?.go({ kind: "universe" }); setMode({ kind: "universe" }); return; }
      const m: Mode = { kind: "word", q: w, name: j.name, picks: j.picks }; api.current?.go(m); setQ("");
    } catch { setNote("読み取りに失敗しました。もう一度投げてください"); api.current?.go({ kind: "universe" }); }
  }

  const inWorld = mode.kind !== "universe";
  return (
    <div className="nw">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={host} className="nw-gl" />
      {caption && (caption.name || caption.title) && (
        <div className="nw-cap" key={caption.name + (caption.title || "")}>
          {caption.title && <div className="nw-cap-t">{caption.title}</div>}
          {caption.name && <div className="nw-cap-n">{caption.name}</div>}
          {caption.sub && <div className="nw-cap-s">{caption.sub}</div>}
        </div>
      )}
      {word && <div className={`nw-word${mode.kind === "reading" ? " rd" : ""}`} key={word.text + mode.kind}>{word.text}</div>}
      {labels.map((l, k) => <div key={k} className="nw-lb" style={{ transform: `translate(${l.x}px,${l.y}px) translate(-50%,0)` }}>{l.t}</div>)}
      {hover && (
        <div className="nw-hv" style={{ left: Math.min(hover.x + 16, innerWidth - 300), top: hover.y + 16 }}>
          <div className="nw-hv-t">{hover.title}</div><div className="nw-hv-s">{hover.sub}</div>{hover.why && <div className="nw-hv-w">{hover.why}</div>}
        </div>
      )}
      {inWorld && <button className="nw-back" onClick={() => { api.current?.go({ kind: "universe" }); }}>← 100の瞬間</button>}
      {!ready && <div className="nw-load">100の瞬間を読み込んでいます</div>}
      <form className="nw-in" onSubmit={throwWord}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`熱狂の言葉を投げる　例「${EX[ph]}」`} maxLength={40} enterKeyHint="send" />
        <button type="submit" disabled={mode.kind === "reading"}>{mode.kind === "reading" ? "読んでいます" : "投げる"}</button>
      </form>
      {note && <div className="nw-note">{note}</div>}
    </div>
  );
}

const CSS = `
.nw{position:fixed;inset:0;background:#000;color:#fff;overflow:hidden;font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;touch-action:manipulation}
.nw-gl{position:absolute;inset:0}
.nw-cap{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 22px);text-align:center;pointer-events:none;animation:nwIn .9s ease both;padding:0 16px}
.nw-cap-t{font-size:13px;color:rgba(255,255,255,.7);letter-spacing:.04em}
.nw-cap-n{font-size:clamp(26px,4.2vw,46px);font-weight:800;letter-spacing:.02em;line-height:1.2;margin-top:4px;text-shadow:0 2px 18px #000}
.nw-cap-s{font-size:12px;color:rgba(255,255,255,.55);margin-top:6px}
.nw-word{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:clamp(28px,5vw,64px);font-weight:900;letter-spacing:.04em;white-space:nowrap;pointer-events:none;text-shadow:0 0 24px #000,0 0 6px #000;animation:nwIn .7s ease both}
.nw-word.rd{animation:nwPulse 1.2s ease-in-out infinite}
@keyframes nwPulse{0%,100%{opacity:.55}50%{opacity:1}}
.nw-lb{position:absolute;left:0;top:0;font-size:12px;color:rgba(255,255,255,.82);white-space:nowrap;pointer-events:none;text-shadow:0 0 6px #000,0 0 2px #000}
.nw-hv{position:absolute;max-width:290px;background:rgba(0,0,0,.78);border:1px solid rgba(255,255,255,.18);padding:8px 10px;pointer-events:none;font-size:12px;line-height:1.55}
.nw-hv-t{font-weight:700}.nw-hv-s{color:rgba(255,255,255,.6);font-size:11px}.nw-hv-w{margin-top:4px;color:#ffee55}
.nw-back{position:absolute;left:max(16px,env(safe-area-inset-left,0px));top:calc(env(safe-area-inset-top,0px) + 16px);background:none;border:1px solid rgba(255,255,255,.3);color:#fff;font-size:12px;padding:7px 12px;cursor:pointer;z-index:2}
.nw-in{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 18px);width:min(560px,calc(100% - 32px));display:flex;gap:8px}
.nw-in input{flex:1;min-width:0;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.35);color:#fff;font-size:16px;padding:12px 14px;outline:none}
.nw-in input:focus{border-color:#ffff00}
.nw-in button{background:#ffff00;color:#000;border:0;font-weight:800;font-size:14px;padding:0 18px;cursor:pointer;white-space:nowrap}
.nw-in button:disabled{opacity:.6}
.nw-note{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 74px);text-align:center;font-size:12px;color:rgba(255,255,255,.75);padding:0 16px}
.nw-load{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;color:rgba(255,255,255,.6);pointer-events:none}
@media (max-width:600px){.nw-cap{top:calc(env(safe-area-inset-top,0px) + 58px)}.nw-cap-n{font-size:24px}}
@keyframes nwIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
`;

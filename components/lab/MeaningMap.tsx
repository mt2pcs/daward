"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// 熱狂の文脈の「意味の地図」（docs/design/zap/meaning_map.json）。334の文脈（＝その1秒）を、熱くなる理由の意味の近さで3Dに置いた宇宙。
// 体験: 宇宙を眺める → 1本の映像が来る → その映像が文脈ごとの1秒に割れて、意味の地図の違う場所へ飛ぶ → 1つを追うと、
// 同じ熱で近くに置かれた他の競技の1秒が漂う場所に着く → そこから別の映像に飛び込むと、また割れて散る → 言葉も地図のどこかに落ちる。
// つながりは線で描かない。意味が近いもの同士が空間で近くにいることそのものがつながり。時刻 T から全部を決める（?demo=1 / ?capture=1 / ?webm=1）。

type Item = { id: string; no: string; sport: string; t: string | null; context: string; region: number; pos: number[]; img: string | null };
type Region = { id: number; name: string; center: number[] };
type Word = { text: string; reading: string; pos: number[]; neighbors: [number, number][] };
const VB = "https://storage.googleapis.com/e-mooments-assets/lab/zap/v";
const S = 70; // 地図の大きさ
// 領域ごとの色（ロゴの色）。カードの縁と領域名に使い、同じ熱の集まりが星雲のように見えるようにする
const REG_COL = ["#ff3366", "#4de6ff", "#dff257", "#ff8866", "#b46bd6", "#66ccff", "#ffee55", "#ff1a26", "#ccdd66", "#dd8820", "#ff99cc"];
const CW = 4, CH = 2.25;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (k: number) => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const short = (s: string) => { const a = s.split("、")[0]; return (a.length >= 9 ? a : s).slice(0, 28) + ((a.length >= 9 ? a : s).length > 28 ? "…" : ""); };
const fmtT = (t: string | null) => (t ? t.replace(/^0(\d):/, "$1:").replace(/^00:/, "0:") : "");

// 台本（秒）
const TL = { orbitEnd: 7, vIn: 7, split: 13.8, land: 16.7, pick: 19.0, nbr: 21.4, dive: 27.0, vid2: 28.2, split2: 31.0, land2: 33.8, word: 35.2, send: 37.0, wordLand: 39.6, end: 46 };

export default function MeaningMap({ items, regions, neighbors, words }: { items: Item[]; regions: Region[]; neighbors: [number, number][][]; words: Word[] }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current!;
    const q = new URLSearchParams(location.search);
    const capture = q.has("capture"), ext = q.has("webm") ? "webm" : "mp4";
    const cv = el.querySelector("canvas") as HTMLCanvasElement;
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setClearColor(0x000000, 1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
    const W = () => el.clientWidth, H = () => el.clientHeight;
    const geo = new THREE.PlaneGeometry(CW, CH), rimGeo = new THREE.PlaneGeometry(CW + 0.7, CH + 0.7);
    const idx = (id: string) => items.findIndex((x) => x.id === id);
    const P = (i: number) => new THREE.Vector3(items[i].pos[0] * S, items[i].pos[1] * S, items[i].pos[2] * S);

    // ── 334の1秒のカード ──
    // 映像の無い瞬間の文脈は、文字のカード（その文脈の一文）にする
    const textCard = (it: Item) => {
      const c = document.createElement("canvas"); c.width = 512; c.height = 288; const g = c.getContext("2d")!;
      g.fillStyle = "#0d0d0d"; g.fillRect(0, 0, 512, 288); g.fillStyle = REG_COL[it.region % REG_COL.length]; g.fillRect(0, 0, 10, 288);
      g.fillStyle = "#ffff00"; g.font = "700 22px 'Noto Sans JP', sans-serif"; g.fillText(it.sport, 34, 46);
      g.fillStyle = "#fff"; g.font = "900 34px 'Noto Sans JP', sans-serif";
      let line = "", y = 104; for (const ch of it.context) { if (g.measureText(line + ch).width > 444) { g.fillText(line, 34, y); line = ch; y += 46; if (y > 260) break; } else line += ch; } if (y <= 260) g.fillText(line, 34, y);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const frameGeo = new THREE.PlaneGeometry(CW + 0.18, CH + 0.18);
    const cards = items.map((it, i) => {
      const mat = new THREE.MeshBasicMaterial({ map: it.img ? null : textCard(it), transparent: true, opacity: 0, depthWrite: false });
      if (it.img) { mat.color.set(0x111111); loader.load(it.img, (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true; }); }
      const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 3; scene.add(mesh);
      const fr = new THREE.Mesh(frameGeo, new THREE.MeshBasicMaterial({ color: REG_COL[it.region % REG_COL.length], transparent: true, opacity: 0, depthWrite: false })); fr.renderOrder = 2; scene.add(fr);
      const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0, depthWrite: false })); rim.renderOrder = 1; scene.add(rim);
      return { mesh, mat, rim, fr, home: P(i), r: Math.hypot(...it.pos) };
    });
    // 主役の映像（DOM の video をカードの投影位置に貼る）
    const mk = (file: string) => { const v = document.createElement("video"); v.src = `${VB}/${file}.${ext}`; v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous"; v.className = "mm-video"; el.querySelector(".mm-videos")!.appendChild(v); return v; };
    const vA = mk("m090"), vB = mk("m013");
    // 言葉のカード（3D の板に文字）
    const word = words[0];
    const wordTex = (() => { const c = document.createElement("canvas"); c.width = 640; c.height = 160; const g = c.getContext("2d")!; g.fillStyle = "#000"; g.fillRect(0, 0, 640, 160); g.strokeStyle = "#ffff00"; g.lineWidth = 8; g.strokeRect(4, 4, 632, 152); g.fillStyle = "#fff"; g.font = "900 64px 'Noto Sans JP', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(word?.text || "", 320, 84); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { t, c, g }; })();
    const wordMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: wordTex.t, transparent: true, opacity: 0, depthWrite: false, depthTest: false })); wordMesh.renderOrder = 9; scene.add(wordMesh);

    // ── DOM ──
    const $ = (s: string) => el.querySelector(s) as HTMLElement;
    const regEls = regions.map((r) => { const d = document.createElement("div"); d.className = "mm-reg"; d.textContent = r.name; d.style.color = REG_COL[r.id % REG_COL.length]; $(".mm-labels").appendChild(d); return d; });
    const labPool: HTMLDivElement[] = Array.from({ length: 14 }, () => { const d = document.createElement("div"); d.className = "mm-lab"; d.innerHTML = "<b></b><span></span>"; $(".mm-labels").appendChild(d); return d; });
    const chipPool: HTMLDivElement[] = Array.from({ length: 4 }, () => { const d = document.createElement("div"); d.className = "mm-chip"; $(".mm-labels").appendChild(d); return d; });
    const cursor = $(".mm-cursor"), input = $(".mm-input"), inText = $(".mm-input b"), title = $(".mm-title"), reading = $(".mm-reading");

    // ── 台本で使う瞬間 ──
    const A = ["090-0", "090-1", "090-2", "090-3"].map(idx);
    const A0 = A[0];
    const near3 = (p: THREE.Vector3, n: number, skip: (j: number) => boolean) => items.map((_, j) => j).filter((j) => !skip(j)).sort((a, b) => P(a).distanceTo(p) - P(b).distanceTo(p)).slice(0, n);
    // 近所 = 地図の上で近くにいるもの（意味が近いから近くに置かれている）。同じ映像は除く
    const nbA = near3(P(A0), 5, (j) => items[j].no === items[A0].no);
    const B0 = idx("013-0"), Bs = ["013-0", "013-1", "013-2"].map(idx);
    const wordPos = word ? new THREE.Vector3(word.pos[0] * S, word.pos[1] * S, word.pos[2] * S) : new THREE.Vector3();
    const nbW = near3(wordPos, 6, () => false);

    const proj = (p: THREE.Vector3) => { const v = p.clone().project(camera); return { x: (v.x * 0.5 + 0.5) * W(), y: (-v.y * 0.5 + 0.5) * H(), z: v.z }; };
    const fwd = () => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const orbit = (T: number) => { const k = clamp(T / TL.orbitEnd), r = lerp(128, 96, ease(k)), az = lerp(-0.6, 0.15, k) + 0.02 * Math.max(0, T - TL.orbitEnd) * 0, el2 = 0.22; return new THREE.Vector3(r * Math.sin(az) * Math.cos(el2), r * Math.sin(el2), r * Math.cos(az) * Math.cos(el2)); };
    // 見せたい点の集まりがちょうど画面に収まる距離まで、中心から外向きに引く（縦画面は横の視野で決まる）
    let halfFov = (25 * Math.PI) / 180, halfH = halfFov;
    const frame = (pts: THREE.Vector3[], margin: number, side = new THREE.Vector3(0.25, 0.3, 1)) => {
      const c = pts.reduce((a, p) => a.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / pts.length);
      const rad = Math.max(...pts.map((p) => p.distanceTo(c))) + CW;
      const dist = (rad / Math.tan(halfFov)) * margin;
      const dir = c.clone().normalize().add(side).normalize();
      return { pos: c.clone().add(dir.multiplyScalar(dist)), look: c };
    };
    const camPose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    const setCam = (pos: THREE.Vector3, look: THREE.Vector3) => { camera.position.copy(pos); camera.lookAt(look); camera.updateMatrixWorld(); camPose.pos.copy(pos); camPose.look.copy(look); };
    const blend = (a: { pos: THREE.Vector3; look: THREE.Vector3 }, b: { pos: THREE.Vector3; look: THREE.Vector3 }, k: number) => ({ pos: a.pos.clone().lerp(b.pos, k), look: a.look.clone().lerp(b.look, k) });
    // 各場面のカメラ（画面の縦横で視野が変わるので、縦横比ごとに求め直す）
    const O7 = { pos: orbit(TL.orbitEnd), look: new THREE.Vector3() };
    const nbPts = [A0, ...nbA.slice(0, 4)].map((i) => cards[i].home);
    let wideA = O7, nbrA = O7, wideB = O7, nbrW = O7, poseKey = "";
    const updatePoses = () => {
      const key = `${halfFov.toFixed(4)}`; if (key === poseKey) return; poseKey = key;
      wideA = frame(A.map((i) => cards[i].home), 1.25, new THREE.Vector3(0.6, 0.35, 0.8));
      nbrA = frame(nbPts, 1.05, new THREE.Vector3(0.4, 0.2, 1));
      wideB = frame([...Bs, A0].map((i) => cards[i].home), 1.2, new THREE.Vector3(-0.4, 0.4, 0.9));
      nbrW = frame([wordPos, ...nbW.slice(0, 5).map((i) => cards[i].home)], 1.05, new THREE.Vector3(0.2, 0.25, 1));
    };
    // カードが画面の幅の85%になる距離
    const fillDist = (wWorld: number) => wWorld / 0.85 / (2 * Math.tan(halfFov));
    const vidFront = (i: number, look: THREE.Vector3, fromPos: THREE.Vector3) => { const d = fromPos.clone().sub(cards[i].home).normalize(); return { pos: cards[i].home.clone().add(d.multiplyScalar(fillDist(CW))), look: cards[i].home.clone() }; };

    const want: { v: HTMLVideoElement; t: number; vis: boolean }[] = [];
    const placeV = (v: HTMLVideoElement, c: THREE.Vector3, w: number, h: number, op: number) => {
      // 平面をカメラに正対させた矩形を投影
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const a = proj(c.clone().add(right.clone().multiplyScalar(-w / 2)).add(up.clone().multiplyScalar(h / 2))), b = proj(c.clone().add(right.clone().multiplyScalar(w / 2)).add(up.clone().multiplyScalar(-h / 2)));
      v.style.transform = `translate(${a.x}px,${a.y}px)`; v.style.width = `${b.x - a.x}px`; v.style.height = `${b.y - a.y}px`; v.style.opacity = String(op); v.style.visibility = op > 0.01 ? "visible" : "hidden";
    };
    let labN = 0; const placedL: { x: number; y: number }[] = [];
    // 縦画面: 文字をカードの横に浮かべない。カードに番号の印を付け、文字は画面下の決まった場所に一覧で出す（最大4行）
    const portrait = () => W() < H();
    const listItems: { p: THREE.Vector3; head: string; sub: string; op: number; big: boolean }[] = [];
    const badges = Array.from({ length: 4 }, (_, k) => { const d = document.createElement("div"); d.className = "mm-badge"; d.textContent = String(k + 1); $(".mm-labels").appendChild(d); return d; });
    const listRows = Array.from({ length: 4 }, (_, k) => { const d = document.createElement("div"); d.className = "mm-row"; d.innerHTML = `<i>${k + 1}</i><div><b></b><span></span></div>`; $(".mm-list").appendChild(d); return d; });
    const label = (p: THREE.Vector3, head: string, sub: string, op: number, big = false) => {
      if (portrait()) { if (op > 0.01) listItems.push({ p: p.clone(), head, sub, op, big }); return; }
      if (op <= 0.01 || labN >= labPool.length) return; const d = labPool[labN++]; const s = proj(p); if (s.z > 1) { d.style.opacity = "0"; return; }
      // 文字どうしが重ならないように下へずらす
      let y = s.y; for (let k = 0; k < 6 && placedL.some((q) => Math.abs(q.x - s.x) < 280 && Math.abs(q.y - y) < 46); k++) y += 46;
      placedL.push({ x: s.x, y });
      d.style.opacity = String(op); d.style.transform = `translate(${s.x}px,${y}px)`; d.classList.toggle("big", big);
      (d.children[0] as HTMLElement).textContent = head; (d.children[1] as HTMLElement).textContent = sub;
    };

    const render = (T: number) => {
      want.length = 0; labN = 0; placedL.length = 0; listItems.length = 0;
      const w = W(), h = H(), dpr = Math.min(1.75, devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); }
      camera.aspect = w / h; camera.fov = w < h ? 68 : 50; camera.updateProjectionMatrix();
      halfH = (camera.fov * Math.PI) / 360; halfFov = Math.min(halfH, Math.atan(Math.tan(halfH) * camera.aspect)); updatePoses();

      // ── カメラ ──
      let pose = { pos: orbit(T), look: new THREE.Vector3() };
      if (T >= TL.split) pose = blend(O7, wideA, ease((T - TL.split - 0.1) / 3.0));
      if (T >= TL.pick) pose = blend(wideA, nbrA, ease((T - TL.pick) / 2.2));
      if (T >= TL.nbr) { const a = 0.32 * ease((T - TL.nbr) / 5.6); const o = nbrA.pos.clone().sub(nbrA.look).applyAxisAngle(new THREE.Vector3(0, 1, 0), a); pose = { pos: nbrA.look.clone().add(o), look: nbrA.look.clone() }; }
      const nbrEnd = (() => { const o = nbrA.pos.clone().sub(nbrA.look).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.32); return { pos: nbrA.look.clone().add(o), look: nbrA.look.clone() }; })();
      const fB = vidFront(B0, nbrEnd.look, nbrEnd.pos);
      if (T >= TL.dive) pose = blend(nbrEnd, fB, ease((T - TL.dive) / 1.6));
      if (T >= TL.split2) pose = blend(fB, wideB, ease((T - TL.split2 - 0.1) / 3.0));
      if (T >= TL.send + 0.4) pose = blend(wideB, nbrW, ease((T - TL.send - 0.4) / 2.8));
      if (T >= TL.wordLand + 0.8) { const a = -0.22 * ease((T - TL.wordLand - 0.8) / 6); const o = nbrW.pos.clone().sub(nbrW.look).applyAxisAngle(new THREE.Vector3(0, 1, 0), a); pose = { pos: nbrW.look.clone().add(o), look: nbrW.look.clone() }; }
      setCam(pose.pos, pose.look);

      // ── 映像が来て、割れる ──
      const vCenter = O7.pos.clone().add(new THREE.Vector3().subVectors(O7.look, O7.pos).normalize().multiplyScalar(Math.max(13, fillDist(9))));
      const vIn = ease((T - TL.vIn) / 0.8), vOut = 1 - clamp((T - TL.split) / 0.45);
      const showA = T >= TL.vIn && T < TL.split + 0.5;
      // 映像のある間、宇宙は沈む
      const dimU = T >= TL.vIn && T < TL.split + 1.2 ? 0.35 + 0.65 * clamp((T - TL.split) / 1.2) * (T >= TL.split ? 1 : 0) : 1;
      if (showA) placeV(vA, vCenter, 9 * lerp(0.2, 1, vIn), 5.06 * lerp(0.2, 1, vIn), vIn * vOut);
      else placeV(vA, vCenter, 0, 0, 0);
      want.push({ v: vA, t: 4 + Math.max(0, T - TL.vIn - 0.3), vis: showA });
      title.style.opacity = String(showA ? vIn * vOut : 0);
      // 2本目（013）
      const showB = T >= TL.vid2 - 0.4 && T < TL.split2 + 0.5;
      const bIn = ease((T - TL.vid2 + 0.4) / 0.8), bOut = 1 - clamp((T - TL.split2) / 0.45);
      if (showB) placeV(vB, cards[B0].home, CW, CH, bIn * bOut); else placeV(vB, cards[B0].home, 0, 0, 0);
      want.push({ v: vB, t: 4.2 + Math.max(0, T - TL.vid2), vis: showB });

      // ── カード ──
      const look = camPose.look;
      const appear = (i: number) => clamp((T - 0.3 - cards[i].r * 2.2) / 1.2);
      const focusSet = new Set<number>(), dimOthers = { k: 0 };
      if (T >= TL.nbr - 0.6 && T < TL.dive + 1.0) { [A0, ...nbA].forEach((i) => focusSet.add(i)); dimOthers.k = clamp((T - TL.nbr + 0.6) / 0.8) * (1 - clamp((T - TL.dive) / 1.0)); }
      if (T >= TL.wordLand) { nbW.forEach((i) => focusSet.add(i)); dimOthers.k = Math.max(dimOthers.k, clamp((T - TL.wordLand) / 0.8)); }
      const visited = new Set<number>(); if (T >= TL.pick) visited.add(A0); if (T >= TL.dive) visited.add(B0);
      const focusC = focusSet.size ? Array.from(focusSet).reduce((a, i) => a.add(cards[i].home.clone()), new THREE.Vector3()).multiplyScalar(1 / focusSet.size) : new THREE.Vector3();
      cards.forEach((c, i) => {
        let pos = c.home.clone(), sc = 1, op = appear(i) * dimU;
        // 割れて飛ぶ: 映像の位置から自分の場所へ
        const fly = (start: number, from: THREE.Vector3, k0: number) => {
          if (T < start) { op = 0; return; }
          const k = ease((T - start - k0 * 0.12) / 2.7); pos = from.clone().lerp(c.home, k);
          // 弧を描いて飛ぶ
          pos.add(new THREE.Vector3(0, 1, 0).multiplyScalar(Math.sin(Math.PI * k) * 6 * (k0 % 2 ? -1 : 1)));
          sc = lerp(2.4, 1, k); op = 1;
        };
        const ai = A.indexOf(i); if (ai >= 0) fly(TL.split, vCenter.clone().add(new THREE.Vector3((ai - 1.5) * 2.6, 0, 0).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(O7.pos, O7.look, new THREE.Vector3(0, 1, 0))))), ai);
        const bi = Bs.indexOf(i); if (bi > 0) fly(TL.split2, cards[B0].home, bi);
        if (focusSet.has(i)) { sc *= 1 + 0.6 * dimOthers.k; op = Math.max(op, 1); pos.add(c.home.clone().sub(focusC).multiplyScalar(1.3 * dimOthers.k)); }
        else op *= 1 - 0.85 * dimOthers.k;
        // 遠いものは暗く
        const dc = pos.distanceTo(camera.position); op *= clamp(1.3 - dc / 200);
        if (!focusSet.has(i) && !visited.has(i) && A.indexOf(i) < 0 && Bs.indexOf(i) < 0) op *= clamp((dc - 4) / 6); // カメラの目の前を塞ぐものは消す
        c.mesh.position.copy(pos); c.mesh.quaternion.copy(camera.quaternion); c.mesh.scale.setScalar(sc);
        c.mat.opacity = op;
        c.fr.position.copy(pos).add(fwd().multiplyScalar(0.005)); c.fr.quaternion.copy(camera.quaternion); c.fr.scale.setScalar(sc); (c.fr.material as THREE.MeshBasicMaterial).opacity = op * 0.95;
        c.rim.position.copy(pos).add(fwd().multiplyScalar(0.01)); c.rim.quaternion.copy(camera.quaternion); c.rim.scale.setScalar(sc);
        (c.rim.material as THREE.MeshBasicMaterial).opacity = visited.has(i) ? op * clamp((dc - 7) / 8) : 0;
      });

      // ── 言葉 ──
      const typed = word ? word.text.slice(0, Math.max(0, Math.floor((T - TL.word - 0.5) / 0.14))) : "";
      input.style.opacity = String(clamp((T - TL.word) / 0.4) * (1 - clamp((T - TL.send - 0.3) / 0.4)));
      input.style.transform = `translate(-50%, ${(1 - ease((T - TL.word) / 0.5)) * 30}px)`;
      inText.textContent = typed;
      if (T >= TL.send && word) {
        const k = ease((T - TL.send) / (TL.wordLand - TL.send));
        const wf = new THREE.Vector3().subVectors(wideB.look, wideB.pos).normalize();
        const s0 = wideB.pos.clone().add(wf.multiplyScalar(10)).add(new THREE.Vector3(0, -2.5, 0));
        wordMesh.position.copy(s0.clone().lerp(wordPos, k)); wordMesh.quaternion.copy(camera.quaternion); wordMesh.scale.setScalar(lerp(0.6, 1, k));
        (wordMesh.material as THREE.MeshBasicMaterial).opacity = 1;
      } else (wordMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      reading.style.opacity = String(word && T >= TL.wordLand + 0.4 ? clamp((T - TL.wordLand - 0.4) / 0.6) : 0);
      if (word) reading.innerHTML = `<span>「${word.text}」を、こう読みました</span>${word.reading}`;

      renderer.render(scene, camera);

      // ── 文字（地図の上の言葉） ──
      // 領域の名前: 眺めている間は全部、近づいたら手前のものだけ
      const placedR: { x: number; y: number }[] = [];
      regions.map((r, j) => ({ r, j, p: new THREE.Vector3(r.center[0] * S, r.center[1] * S + 6, r.center[2] * S) })).sort((a, b) => a.p.distanceTo(camera.position) - b.p.distanceTo(camera.position)).forEach(({ r, j, p }) => {
        const s = proj(p); const d = regEls[j];
        const clash = placedR.some((q) => Math.abs(q.x - s.x) < (portrait() ? w * 0.9 : 230) && Math.abs(q.y - s.y) < (portrait() ? 70 : 34)) || (portrait() && placedR.length >= 2);
        let o = T < TL.vIn ? clamp((T - 2.4 - j * 0.28) / 0.8) : 0;
        if (T >= TL.land - 0.4 && T < TL.pick + 1.0) { const has = A.some((i) => items[i].region === r.id); o = has ? clamp((T - TL.land + 0.4) / 0.6) : 0.25 * clamp((T - TL.land) / 0.8); }
        if (T >= TL.land2 - 0.4 && T < TL.word) { const has = Bs.some((i) => items[i].region === r.id); o = has ? clamp((T - TL.land2 + 0.4) / 0.6) : 0.2; }
        if (T >= TL.nbr && T < TL.dive) o = r.id === items[A0].region ? 0.9 : 0;
        if (T >= TL.wordLand) o = r.id === (word ? items[nbW[0]].region : -1) ? clamp((T - TL.wordLand) / 0.6) : 0;
        if (clash) o = 0; else if (o > 0.05) placedR.push(s);
        d.style.opacity = s.z > 1 ? "0" : String(o); d.style.transform = `translate(${s.x}px,${s.y}px)`;
      });
      // 割れた1秒の時刻チップ（飛んでいる間）
      chipPool.forEach((d, k) => {
        const i = A[k]; const o = T >= TL.split && T < TL.land + 0.3 ? 1 - clamp((T - TL.land) / 0.3) : 0; const s = proj(cards[i].mesh.position);
        d.style.opacity = String(o); d.style.transform = `translate(${s.x}px,${s.y}px)`; d.textContent = fmtT(items[i].t);
      });
      // 着いた1秒の文脈
      if (T >= TL.land && T < TL.pick + 0.6) A.forEach((i, k) => label(cards[i].home, short(items[i].context), `${items[i].sport}　${fmtT(items[i].t)}`, clamp((T - TL.land - k * 0.25) / 0.5) * (1 - clamp((T - TL.pick) / 0.5))));
      if (T >= TL.nbr && T < TL.dive) [A0, ...nbA].forEach((i, k) => label(cards[i].mesh.position, short(items[i].context), `${items[i].sport}　${fmtT(items[i].t)}`, clamp((T - TL.nbr - 0.2 - k * 0.35) / 0.5) * (1 - clamp((T - TL.dive + 0.3) / 0.3)), i === A0));
      if (T >= TL.land2 && T < TL.word + 0.4) Bs.forEach((i, k) => label(cards[i].home, short(items[i].context), `${items[i].sport}　${fmtT(items[i].t)}`, clamp((T - TL.land2 - k * 0.25) / 0.5) * (1 - clamp((T - TL.word) / 0.4))));
      if (T >= TL.wordLand + 0.6) nbW.forEach((i, k) => label(cards[i].mesh.position, short(items[i].context), `${items[i].sport}　${fmtT(items[i].t)}`, clamp((T - TL.wordLand - 0.6 - k * 0.35) / 0.5)));
      labPool.forEach((d, k) => { if (k >= labN) d.style.opacity = "0"; });
      const li = listItems.sort((a, b) => Number(b.big) - Number(a.big)).slice(0, 4);
      listRows.forEach((d, k) => { const it = li[k]; d.style.opacity = it ? String(it.op) : "0"; d.style.display = it ? "flex" : "none"; if (it) { (d.querySelector("b") as HTMLElement).textContent = it.head; (d.querySelector("span") as HTMLElement).textContent = it.sub; } });
      badges.forEach((d, k) => { const it = li[k]; if (!it) { d.style.opacity = "0"; return; } const s = proj(it.p); d.style.opacity = s.z > 1 ? "0" : String(it.op); d.style.transform = `translate(${s.x}px,${s.y}px)`; });

      // カーソル（タップの見本）
      const taps: [number, () => { x: number; y: number }][] = [[TL.pick, () => proj(cards[A0].home)], [TL.dive, () => proj(cards[B0].mesh.position)], [TL.send - 0.1, () => { const r = input.getBoundingClientRect(), rb = el.getBoundingClientRect(); return { x: r.right - rb.left - 40, y: r.top - rb.top + r.height / 2 }; }]];
      const ni = taps.findIndex(([t]) => t > T - 0.35);
      if (ni >= 0) {
        const [t, f] = taps[ni], from = ni > 0 ? taps[ni - 1][1]() : { x: w * 0.55, y: h * 0.7 }, to = f(), dd = t - T;
        const mv = ease(clamp(1 - (dd - 0.1) / 0.8)), press = dd < 0 ? Math.sin(Math.PI * clamp(-dd / 0.35)) : 0;
        cursor.style.opacity = String(clamp((T - (t - 1.1)) / 0.3) * (dd < -0.3 ? 1 - clamp((-dd - 0.3) / 0.3) : 1));
        cursor.style.transform = `translate(${lerp(from.x, to.x, mv)}px,${lerp(from.y, to.y, mv)}px) scale(${1 - 0.28 * press})`;
      } else cursor.style.opacity = "0";

      // 映像の時刻合わせ
      const waits: Promise<void>[] = [];
      for (const x of want) {
        if (!x.vis) { if (!x.v.paused) x.v.pause(); continue; }
        if (capture) {
          const ready = x.v.readyState >= 2 ? Promise.resolve() : new Promise<void>((res) => { const ok = () => { x.v.removeEventListener("loadeddata", ok); res(); }; x.v.addEventListener("loadeddata", ok); setTimeout(ok, 8000); });
          waits.push(ready.then(() => new Promise<void>((res) => { if (Math.abs(x.v.currentTime - x.t) <= 0.004) return res(); const done = () => { x.v.removeEventListener("seeked", done); res(); }; x.v.addEventListener("seeked", done); setTimeout(done, 3000); x.v.currentTime = x.t; })));
        } else { if (Math.abs(x.v.currentTime - x.t) > 0.3) x.v.currentTime = x.t; if (x.v.paused) x.v.play().catch(() => {}); }
      }
      return Promise.all(waits).then(() => undefined);
    };

    let raf = 0; const t0 = performance.now();
    (window as any).__mm = { render, end: TL.end };
    if (!capture) { const loop = () => { raf = requestAnimationFrame(loop); render((performance.now() - t0) / 1000); }; raf = requestAnimationFrame(loop); }
    return () => { cancelAnimationFrame(raf); [vA, vB].forEach((v) => { v.pause(); v.remove(); }); [...regEls, ...labPool, ...chipPool, ...badges, ...listRows].forEach((d) => d.remove()); renderer.dispose(); };
  }, [items, regions, neighbors, words]);

  return (
    <div ref={root} className="mm">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Noto+Sans+JP:wght@500;700;900&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <canvas />
      <div className="mm-videos" />
      <div className="mm-labels" />
      <div className="mm-list" />
      <div className="mm-title"><b>神戸スティーラーズ初制覇</b><span>リーグワン　0:49〜</span></div>
      <div className="mm-reading" />
      <div className="mm-input"><b /><i>投げる</i></div>
      <div className="mm-cursor" />
    </div>
  );
}

const CSS = `
.mm{position:fixed;inset:0;background:#000;overflow:hidden;color:#fff;font-family:"Noto Sans JP",sans-serif;-webkit-font-smoothing:antialiased}
.mm canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.mm-videos,.mm-labels{position:absolute;inset:0;pointer-events:none}
.mm-video{position:absolute;left:0;top:0;object-fit:cover;background:#000;transform-origin:0 0}
.mm-reg{position:absolute;left:0;top:0;white-space:nowrap;font:900 clamp(16px,1.6vw,24px)/1 "Noto Sans JP",sans-serif;letter-spacing:.06em;color:#fff;opacity:0;translate:-50% -50%;text-shadow:0 2px 14px #000,0 0 2px #000}
.mm-lab{position:absolute;left:0;top:0;opacity:0;translate:14px -50%;max-width:300px;padding-left:10px;border-left:3px solid #ffff00}
.mm-lab b{display:block;font-weight:900;font-size:15px;line-height:1.35;color:#fff;text-shadow:0 1px 8px #000,0 0 2px #000}
.mm-lab span{display:block;margin-top:3px;font:700 11px/1 "Noto Sans JP",sans-serif;letter-spacing:.1em;color:#ffff00;text-shadow:0 1px 6px #000}
.mm-lab.big b{font-size:20px}
.mm-chip{position:absolute;left:0;top:0;opacity:0;translate:-50% -170%;padding:4px 8px;background:#ffff00;color:#000;font:800 13px/1 Archivo,sans-serif;letter-spacing:.04em}
.mm-title{position:absolute;left:50%;top:13%;translate:-50% 0;text-align:center;opacity:0;pointer-events:none}
.mm-title b{display:block;font-weight:900;font-size:clamp(20px,2vw,28px)}
.mm-title span{display:block;margin-top:6px;font:700 12px/1 "Noto Sans JP",sans-serif;letter-spacing:.14em;color:#ffff00}
.mm-reading{position:absolute;left:50%;bottom:6%;translate:-50% 0;max-width:min(760px,90vw);text-align:center;font-weight:700;font-size:16px;line-height:1.6;opacity:0;text-shadow:0 1px 10px #000}
.mm-reading span{display:block;font-size:12px;letter-spacing:.12em;color:#ffff00;margin-bottom:4px}
.mm-input{position:absolute;left:50%;bottom:7%;width:min(560px,86vw);height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 8px 0 20px;background:rgba(0,0,0,.7);border:2px solid #fff;opacity:0}
.mm-input b{font-weight:900;font-size:20px}
.mm-input i{font-style:normal;background:#ffff00;color:#000;font-weight:900;font-size:15px;padding:10px 16px}
.mm-badge{position:absolute;left:0;top:0;opacity:0;translate:-50% -50%;width:26px;height:26px;border-radius:50%;background:#ffff00;color:#000;font:900 14px/26px Archivo,sans-serif;text-align:center;box-shadow:0 0 0 2px #000}
.mm-list{position:absolute;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px;pointer-events:none}
.mm-row{display:none;align-items:flex-start;gap:10px;padding:8px 10px;background:rgba(0,0,0,.72);border-left:3px solid #ffff00}
.mm-row i{flex:none;width:22px;height:22px;border-radius:50%;background:#ffff00;color:#000;font:900 12px/22px Archivo,sans-serif;font-style:normal;text-align:center}
.mm-row b{display:block;font-weight:900;font-size:14px;line-height:1.4}
.mm-row span{display:block;margin-top:2px;font:700 10px/1 "Noto Sans JP",sans-serif;letter-spacing:.1em;color:#ffff00}
@media (orientation:portrait){.mm-title{top:9%}.mm-title b{font-size:20px}.mm-reading{bottom:calc(9% + env(safe-area-inset-bottom,0px));font-size:14px}.mm-input{bottom:calc(5% + env(safe-area-inset-bottom,0px))}.mm-reg{font-size:15px}}
.mm-cursor{position:absolute;left:-18px;top:-18px;width:36px;height:36px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.5);pointer-events:none;opacity:0}
.mm-cursor::after{content:"";position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#fff}
`;

# 熱狂の文脈（334）を意味の近さで3Dに置く（t-SNE）＋ 領域（k-means）。 /usr/bin/python3 scripts/design/meaning_layout.py
import json, numpy as np
R = json.load(open("docs/contextmap/reasons.json"))
R = R if isinstance(R, list) else list(R.values())
items = [dict(no=m["no"], title=m.get("title"), sport=m.get("sport"), k=k, **x) for m in R for k, x in enumerate(m.get("reasons") or [])]
E = np.array(json.load(open("docs/design/zap/context_emb.json")), dtype=np.float64)
E /= np.linalg.norm(E, axis=1, keepdims=True)
n = len(E); S = E @ E.T
D = np.maximum(0, 2 - 2 * S)  # 二乗距離（単位ベクトル）
rng = np.random.default_rng(7)
# t-SNE（厳密版、n=334 なので十分速い）
def pcond(D, perp=14):
  P = np.zeros((n, n)); logU = np.log(perp)
  for i in range(n):
    lo, hi, beta = 1e-6, 1e6, 1.0; d = np.delete(D[i], i)
    for _ in range(60):
      p = np.exp(-d * beta); sp = p.sum(); H = np.log(sp) + beta * (d * p).sum() / sp
      if abs(H - logU) < 1e-5: break
      if H > logU: lo = beta; beta = beta * 2 if hi == 1e6 else (beta + hi) / 2
      else: hi = beta; beta = (beta + lo) / 2
    P[i, np.arange(n) != i] = p / sp
  return (P + P.T) / (2 * n)
P = pcond(D)
Y = rng.normal(0, 1e-4, (n, 3)); V = np.zeros_like(Y); G = np.ones_like(Y)
for it in range(1200):
  Pe = P * (12 if it < 250 else 1)
  sq = (Y ** 2).sum(1); num = 1 / (1 + sq[:, None] + sq[None, :] - 2 * Y @ Y.T); np.fill_diagonal(num, 0)
  Q = np.maximum(num / num.sum(), 1e-12)
  PQ = (Pe - Q) * num
  grad = 4 * ((np.diag(PQ.sum(1)) - PQ) @ Y)
  mom = 0.5 if it < 250 else 0.8
  G = (G + 0.2) * ((grad > 0) != (V > 0)) + G * 0.8 * ((grad > 0) == (V > 0)); G = np.maximum(G, 0.01)
  V = mom * V - 200 * G * grad; Y += V; Y -= Y.mean(0)
Y /= np.abs(Y).max()
# 領域: 埋め込みの k-means（コサイン）
K = 11
C = E[rng.choice(n, K, replace=False)]
for _ in range(60):
  lab = (E @ C.T).argmax(1)
  C = np.array([E[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(K)]); C /= np.linalg.norm(C, axis=1, keepdims=True)
out = dict(items=[dict(id=f"{x['no']}-{x['k']}", no=x["no"], title=x["title"], sport=x["sport"], t=x.get("t") or None, context=x["context"], why=x.get("why"), seen=x.get("seen"), pos=[round(float(v), 4) for v in Y[i]], region=int(lab[i])) for i, x in enumerate(items)], regions=[])
for j in range(K):
  idx = np.where(lab == j)[0]
  sp = {}
  for i in idx: sp[items[i]["sport"]] = sp.get(items[i]["sport"], 0) + 1
  out["regions"].append(dict(id=j, n=int(len(idx)), center=[round(float(v), 4) for v in Y[idx].mean(0)], sports=sp, sample=[items[i]["context"] for i in idx[np.argsort(-(E[idx] @ C[j]))][:8]]))
  print(j, len(idx), "競技数", len(sp), "|", items[idx[np.argmax(E[idx] @ C[j])]]["context"])
# 近傍（違う映像）
nb = []
for i in range(n):
  o = np.argsort(-S[i]); o = [j for j in o if items[j]["no"] != items[i]["no"]][:8]
  nb.append([[int(j), round(float(S[i, j]), 3)] for j in o])
out["neighbors"] = nb
json.dump(out, open("docs/design/zap/meaning_map.json", "w"), ensure_ascii=False)
print("saved", n)

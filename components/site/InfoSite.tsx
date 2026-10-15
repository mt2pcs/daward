import "@/app/site.css";
import ShardBurst from "@/components/site/ShardBurst";
import SiteHeader from "@/components/site/SiteHeader";
import NomineeTabs from "@/components/site/NomineeTabs";
import { byNo, media, VOTE_END, fmtMD } from "@/lib/vote/data";
import { SITE, BRAND, EVENT, KV_VIDEO, NEWS, ABOUT, CATEGORIES, NOMINEES, CAST, CAMPAIGN, LINKS, FAQ, sitePhase } from "@/lib/site/content";



// 情報サイト DAZN AWARDS 2026（ワイヤー I-00〜I-02）。1ページに上から KV / NEWS / ABOUT / AWARDS / 選考方法 / NOMINEES / CAST / EVENT / CAMPAIGN / FAQ。
// 文言・公開フラグは lib/site/content.ts、時期（公開→ノミネート発表→投票締切→受賞発表）は投票サイトと共通の phase で切り替える。
const thumbOf = (no: string | null | undefined) => { if (!no) return null; const m = byNo(no); return m ? media(m)?.thumb || null : null; };
const posterOf = (no: string | null | undefined) => { if (!no) return null; const m = byNo(no); return m ? media(m)?.poster || media(m)?.thumb || null : null; };

export default function InfoSite() {
  const { phase, nominees } = sitePhase();
  const vote = SITE.votePath, end = fmtMD(VOTE_END);
  const winners = phase === "result";
  // KV の主ボタン（I-02）: 受付中→投票、締切後→授賞式、受賞発表後→結果
  const kvMain = phase === "open" ? { href: vote, label: "一般投票に参加する" }
    : phase === "pre" ? { href: vote, label: "100 MOMENTS を見る" }
    : phase === "closed" ? { href: "#event", label: "12/21 授賞式" }
    : { href: "#nominees", label: "受賞結果を見る" };
  const nomList = Object.fromEntries(Object.entries(NOMINEES.list).map(([k, v]) => [k, v.map((n) => ({ ...n, thumb: thumbOf(n.no) }))]));
  const castPublic = CAST.filter((c) => c.public);
  return (
    <div className="is" id="top">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Noto+Sans+JP:wght@400;500;700;900&display=swap" />
      <SiteHeader phase={phase} votePath={vote} />

      {/* I-01 ① KV */}
      <section className="is-kv" aria-label="DAZN AWARDS 2026">
        {KV_VIDEO ? <video className="is-kv-video" src={KV_VIDEO} autoPlay muted loop playsInline /> : <ShardBurst anchor={{ sel: ".is-kv-logo", x: 0.5, y: 0.305, core: 0.34, avoid: { sel: ".is-kv-text" } }} />}
        <div className="is-kv-in">
          <h1 className="is-kv-h1"><img className="is-kv-logo" src={BRAND.awardsLogo} alt="DAZN AWARDS 2026" width={1214} height={2000} /></h1>
          <div className="is-kv-text">
          <p className="is-kv-tag">{SITE.tagline}</p>
          <p className="is-kv-date">{EVENT.dateLabel}<i />{EVENT.venue}</p>
          <div className="is-kv-btns">
            <a className="is-btn is-btn-y" href={kvMain.href}>{kvMain.label}<span aria-hidden>→</span></a>
            {(phase === "pre" || phase === "open") && <a className="is-btn is-btn-o" href="#campaign">ご招待キャンペーン</a>}
          </div>
          {phase === "open" && <p className="is-kv-note">一般投票 受付中　〜{end}</p>}
          {phase === "pre" && <p className="is-kv-note">一般投票は11月上旬スタート</p>}
          </div>
        </div>
      </section>

      <main>
        {/* NEWS */}
        <section className="is-sec is-news" id="news">
          <div className="is-wrap is-news-in">
            <h2 className="is-h2">NEWS</h2>
            <ul>{NEWS.slice(0, 2).map((n) => <li key={n.date + n.title}><time>{n.date}</time>{n.href ? <a href={n.href}>{n.title}</a> : <span>{n.title}</span>}</li>)}</ul>
            {NEWS.length > 2 && <a className="is-more" href="#news">もっと見る<span aria-hidden>→</span></a>}
          </div>
        </section>

        {/* ABOUT */}
        <section className="is-sec" id="about">
          <div className="is-wrap is-about">
            <div>
              <h2 className="is-h2">ABOUT</h2>
              <p className="is-concept">{ABOUT.concept.split(/(?<=、)/).map((ph) => <span key={ph}>{ph}</span>)}</p>
              <p className="is-body">{ABOUT.body}</p>
            </div>
            <figure className="is-trophy">
              {ABOUT.trophyImage ? <img src={ABOUT.trophyImage} alt="DAZN AWARDS トロフィー" /> : <div className="ph" aria-hidden><span>TROPHY</span></div>}
              <figcaption>{ABOUT.trophyCaption}</figcaption>
            </figure>
          </div>
        </section>

        {/* I-01 ② AWARDS */}
        <section className="is-sec" id="awards">
          <div className="is-wrap">
            <h2 className="is-h2 rule">AWARDS</h2>
            <div className="is-cats">
              {CATEGORIES.map((c, i) => {
                const t = posterOf(c.photo);
                return (
                  <article key={c.key} className={`is-cat${t ? "" : " tba"}`} style={t ? { backgroundImage: `url(${t})` } : undefined}>
                    <span className="en">{c.en}</span><span className="num">{String(i + 1).padStart(2, "0")}</span><h3>{c.name}</h3>
                  </article>
                );
              })}
            </div>
            <p className="is-flow-arrow">↓ 各部門グランプリから1つ</p>
            <div className="is-top-awards">
              <div className="is-grand"><span className="lbl">GRAND PRIX OF THE YEAR</span><h3>THE DAZN AWARD</h3><p>最も人の心を震わせたモーメント</p></div>
              <div className="is-fan">
                <span className="lbl">FAN VOTE</span><h3>一般投票部門</h3><p>ファンが選ぶ。100 MOMENTS から、いちばん心を震わせた瞬間へ。</p>
                <p className="st">{phase === "open" ? `投票受付中　〜${end}` : phase === "pre" ? "11月上旬 受付開始" : phase === "closed" ? "投票受付終了" : "結果発表"}</p>
              </div>
            </div>

            <h2 className="is-h2 rule small" id="how">選考方法</h2>
            <div className="is-how">
              <div className="row">
                <div className="step"><span className="lbl">STEP 1</span><h3>DAZN 100 MOMENTS</h3><p>2026年の心が震えた100の瞬間</p></div>
                <span className="arr" aria-hidden />
                <div className="step"><span className="lbl">STEP 2</span><h3>DAZN AWARDS FELLOWS</h3><p>がノミネート・受賞を選出</p></div>
              </div>
              <div className="row fan">
                <div className="step"><span className="lbl">一般投票</span><h3>100 MOMENTS から ファンが投票</h3></div>
                {(phase === "open" || phase === "pre") && <a className="is-btn is-btn-y" href={vote}>100 MOMENTS を見て投票する<span aria-hidden>→</span></a>}
              </div>
            </div>
          </div>
        </section>

        {/* I-01 ③ NOMINEES・CAST */}
        <section className="is-sec" id="nominees">
          <div className="is-wrap">
            <h2 className="is-h2 rule">{winners ? "WINNERS" : "NOMINEES"}</h2>
            {!nominees && <p className="is-lead">ノミネートは<b>{NOMINEES.announce}</b>。</p>}
            <NomineeTabs cats={CATEGORIES} list={nomList} published={nominees} announce={NOMINEES.announce} winners={winners} />
          </div>
        </section>

        <section className="is-sec" id="cast">
          <div className="is-wrap">
            <h2 className="is-h2 rule">CAST</h2>
            <div className="is-cast">
              {CAST.map((c, i) => (
                <article key={i} className={`is-person${c.public ? "" : " soon"}`}>
                  <div className="ph" aria-hidden />
                  <span className="lbl">{c.role}</span><h3>{c.public ? c.name : "COMING SOON"}</h3>
                </article>
              ))}
              <article className="is-person soon wide"><div className="ph" aria-hidden /><span className="lbl">プレゼンター／スペシャルゲスト／スペシャルステージ</span><h3>COMING SOON</h3><p>決定次第お知らせします</p></article>
            </div>
            {castPublic.length === 0 && <p className="is-note">出演者は解禁され次第掲載します。</p>}
          </div>
        </section>

        {/* I-01 ④ EVENT・CAMPAIGN */}
        <section className="is-sec" id="event">
          <div className="is-wrap">
            <h2 className="is-h2 rule">EVENT</h2>
            <div className="is-event">
              <dl>
                <div><dt>日時</dt><dd>{EVENT.dateLong}<span className="sub">開場・開演：{EVENT.openTime || "決まり次第お知らせします"}</span></dd></div>
                <div><dt>会場</dt><dd>{EVENT.venue}<span className="sub">{EVENT.address}</span></dd></div>
                <div><dt>アクセス</dt><dd>{EVENT.access.map((a) => <span key={a} className="line">{a}</span>)}</dd></div>
              </dl>
              <div className="is-map"><iframe title="TOYOTA ARENA TOKYO の地図" src={EVENT.mapEmbed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>
            </div>
            <p className="is-note">{phase === "closed" || phase === "result" ? "授賞式の模様はアーカイブでご覧いただけます（配信方法は決まり次第お知らせします）。" : EVENT.recapNote}</p>
          </div>
        </section>

        {phase !== "result" && (
          <section className="is-sec" id="campaign">
            <div className="is-wrap">
              <h2 className="is-h2 rule">CAMPAIGN</h2>
              <div className="is-camp">
                <span className="lbl">{CAMPAIGN.title}</span>
                <p className="hl">{CAMPAIGN.headline}</p>
                <p>{CAMPAIGN.sub}</p>
                {phase === "closed" ? <p className="st">応募受付は終了しました。当選された方にはご連絡します。</p>
                  : CAMPAIGN.entryUrl ? <a className="is-btn is-btn-y" href={CAMPAIGN.entryUrl}>エントリーへ<span aria-hidden>→</span></a>
                  : <span className="is-btn is-btn-off">エントリー受付は近日開始</span>}
                <p className="is-note">一般投票（100 MOMENTS）のシェアとは応募先が異なります。</p>
              </div>
            </div>
          </section>
        )}

        <section className="is-sec" id="faq">
          <div className="is-wrap">
            <h2 className="is-h2 rule">FAQ</h2>
            <div className="is-faq">{FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
            <p className="is-note" id="terms">応募規約・プライバシーポリシーは <a href={LINKS.terms} target="_blank" rel="noreferrer">DAZN 公式</a> をご確認ください。</p>
          </div>
        </section>
      </main>

      {/* I-00 FOOTER */}
      <footer className="is-foot">
        <div className="is-wrap">
          <a className="is-foot-banner" href={vote}>
            <span className="lbl">一般投票</span><img className="logo100" src={BRAND.momentsH} alt="DAZN 100 MOMENTS" width={2000} height={439} /><span>2026年、心が震えた100の瞬間</span><span className="go" aria-hidden>→</span>
          </a>
          <div className="is-foot-row">
            <a href={LINKS.dazn} target="_blank" rel="noreferrer">DAZN 公式</a>
            {LINKS.sns.map((s) => <a key={s.name} href={s.href} target="_blank" rel="noreferrer">{s.name}</a>)}
            <a href={LINKS.terms} target="_blank" rel="noreferrer">利用規約</a>
            <a href={LINKS.privacy} target="_blank" rel="noreferrer">プライバシーポリシー</a>
          </div>
          <p className="is-copy">© DAZN</p>
        </div>
      </footer>
    </div>
  );
}

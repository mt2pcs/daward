// 機能テスト: 映像が実際に進む / 連鎖が競技を跨ぐ / 言葉チップのタップ / 自由入力 / エラー無し
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const errs=[];
for (const [tag, vp] of [["m", { width: 390, height: 844 }], ["d", { width: 1280, height: 800 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errs.push("PAGE ERR " + String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE " + m.text().slice(0, 200)); });
  await page.goto("http://localhost:3151/" + (process.argv[2] || "burst_motion.html") + "", { waitUntil: "load", timeout: 90000 });
  const g=()=>page.evaluate(()=>window.__p.get());
  await page.waitForTimeout(1800); const a=await g(); await page.waitForTimeout(1000); const b=await g();
  console.log(tag,"video advancing:", a.vt, "→", b.vt, "readyState", b.vr, "| cur", b.no, b.sport, "threads", b.threads.join(" "));
  await page.screenshot({path:`${tag}0.png`});
  // 自動連鎖を6回追う
  const chain=[]; let seen=""; for(let i=0;i<60&&chain.length<7;i++){ await page.waitForTimeout(400); const p=await g(); const k=p.no; if(p.state==="play"&&k!==seen){seen=k;chain.push(`${p.no}${p.sport}`);} if(chain.length===2&&p.state==="play"&&p.nextIdx>=0&&!page._s1){page._s1=1;await page.screenshot({path:`${tag}1.png`});} if(chain.length===3&&p.state==="fly"&&!page._s2){page._s2=1;await page.screenshot({path:`${tag}2.png`});} }
  console.log(tag,"chain:", chain.join(" → "));
  // 手動: 言葉チップをタップ → その糸で飛ぶ
  await page.click("#stop"); await page.waitForTimeout(3500); const before=await g();
  const btns=await page.$$("#threads button"); if(btns[1]){await btns[1].click(); await page.waitForTimeout(300); const mid=await g(); await page.screenshot({path:`${tag}3.png`}); await page.waitForTimeout(1500); const after=await g(); console.log(tag,"tap thread:", mid.reason, "| from", before.no, before.sport, "→", after.no, after.sport, after.state);}
  // 自由入力
  await page.fill("#q","めちゃくちゃ泣ける"); await page.click("form button"); await page.waitForTimeout(500); await page.screenshot({path:`${tag}4.png`}); await page.waitForTimeout(1400); const q=await g(); await page.screenshot({path:`${tag}5.png`}); console.log(tag,"query → ", q.no, q.sport, q.state, "threads", q.threads.join(" "));
  await page.close();
}
console.log("errors:", errs.length, errs.slice(0,3)); await browser.close();

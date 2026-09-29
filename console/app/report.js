const Undo2 = mkIcon("<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11\"/>");
const DEFAULT_LINE = "{stock}  \u2014  Qty {quantity} | Buy {purchasePrice} | LTP {currentPrice} | Value {current} | P/L {pnl} ({pnlPct}%)";
const DEFAULT_TEMPLATE = `Dear {name},

Portfolio update from Vasupradah Investment Advisory Services P Ltd ({date}):

{holdings}

Total Invested : {totalInvested}
Current Value  : {totalCurrent}
Profit / Loss  : {totalPnl} ({totalPnlPct}%)

Regards,
{advisorName}
Vasupradah Investment Advisory Services P Ltd
SEBI RIA Reg. No: {sebiRegNo}

Disclaimer: Investments in securities market are subject to market risks. Read all related documents carefully. This message is for your information only.`;
const OCCASIONS = [
  { id: "onam", label: "Onam", title: "Happy Onam", msg: "Wishing you and your family a joyous Onam filled with prosperity, harmony and happiness.", bg: "linear-gradient(135deg,#0b6b3a,#0f8a4c)", accent: "#F4C430", ink: "#ffffff", motif: "dots", cut: "#0b6b3a" },
  { id: "independence", label: "Independence Day", title: "Happy Independence Day", msg: "Celebrating the spirit of freedom and the journey ahead. Jai Hind!", bg: "#ffffff", accent: "#1E2A78", ink: "#1A1A2E", motif: "tricolor", cut: "#ffffff" },
  { id: "republic", label: "Republic Day", title: "Happy Republic Day", msg: "Honouring the values enshrined in our Constitution. Jai Hind!", bg: "#ffffff", accent: "#1E2A78", ink: "#1A1A2E", motif: "tricolor", cut: "#ffffff" },
  { id: "diwali", label: "Diwali", title: "Happy Diwali", msg: "May the festival of lights bring prosperity, good health and joy to you and your family.", bg: "linear-gradient(135deg,#3b0764,#7c2d12)", accent: "#F4C430", ink: "#ffffff", motif: "diyas", cut: "#3b0764" },
  { id: "vishu", label: "Vishu", title: "Happy Vishu", msg: "Wishing you a Vishu of prosperity, abundance and new beginnings.", bg: "linear-gradient(135deg,#166534,#ca8a04)", accent: "#FFF3B0", ink: "#ffffff", motif: "dots", cut: "#166534" },
  { id: "christmas", label: "Christmas", title: "Merry Christmas", msg: "Wishing you peace, warmth and joy this Christmas season.", bg: "linear-gradient(135deg,#14532d,#7f1d1d)", accent: "#F4C430", ink: "#ffffff", motif: "none", cut: "#14532d" },
  { id: "newyear", label: "New Year", title: "Happy New Year", msg: "Wishing you a healthy, prosperous and rewarding year ahead.", bg: "linear-gradient(135deg,#1E2A78,#0b1440)", accent: "#C9A24B", ink: "#ffffff", motif: "none", cut: "#1E2A78" },
  { id: "eid", label: "Eid", title: "Eid Mubarak", msg: "Wishing you and your family peace, happiness and prosperity this Eid.", bg: "linear-gradient(135deg,#065f46,#064e3b)", accent: "#F4C430", ink: "#ffffff", motif: "crescent", cut: "#064e3b" },
  { id: "custom", label: "Custom", title: "Season's Greetings", msg: "Warm wishes from all of us at Vasupradah Investment Advisory.", bg: "linear-gradient(135deg,#1E2A78,#0b1440)", accent: "#C9A24B", ink: "#ffffff", motif: "none", cut: "#1E2A78" }
];
// First address is the To (the dealer who places the order); the rest go in Cc.
const VP_NAVY = "#2E3192", VP_GOLD = "#FFCA08";
function concLimitFor(db, risk) {
  const L = db && db.concLimits || {};
  const key = String(risk || "").trim();
  const v = num(L[key]);
  if (key && L[key] != null && v > 0) return v;
  const d = num(L.default);
  return d > 0 ? d : 10;
}
function buildMessage(db, client) {
  const hs = Object.values(client.holdings || {}).filter((h) => num(h.quantity) > 0);
  let ti = 0, tc = 0;
  const lines = hs.map((h) => {
    const e = effOf(h, db.prices);
    ti += e.invested;
    tc += e.current;
    return fill(db.lineTemplate || DEFAULT_LINE, {
      stock: h.stock,
      quantity: fmtNum(h.quantity),
      purchasePrice: fmtINR(h.purchasePrice),
      currentPrice: fmtINR(e.currentPrice),
      invested: fmtINR(e.invested),
      current: fmtINR(e.current),
      pnl: fmtINR(e.pnl),
      pnlPct: fmtNum(e.pnlPct)
    });
  }).join("\n");
  const tpnl = tc - ti, tpct = ti ? tpnl / ti * 100 : 0;
  return fill(db.template || DEFAULT_TEMPLATE, {
    name: client.name || client.descriptor || client.code,
    code: client.code,
    date: today(),
    holdings: lines,
    count: hs.length,
    totalInvested: fmtINR(ti),
    totalCurrent: fmtINR(tc),
    totalPnl: fmtINR(tpnl),
    totalPnlPct: fmtNum(tpct),
    advisorName: db.advisorName,
    sebiRegNo: db.sebiRegNo
  });
}
function buildStockNote(db, row, content) {
  const NAVY = "#1E2A78", GOLD = "#C9A24B", YEL = "#F5C518", BG = "#F7F8FB", INK = "#1A1A2E", MUT = "#6B7280", UP = "#0F8A4F", DN = "#C0392B";
  const money = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const name = row.name || row.descriptor || row.code;
  const heading = (content.heading || "").trim() || `Update on ${row.stock}`;
  const bodyTxt = (content.body || "").trim();
  const withPos = content.withPos !== false && num(row.quantity) > 0;
  const bodyHtml = bodyTxt ? bodyTxt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") : "";
  const posHtml = withPos ? `<div style="margin:8px 26px 4px;border:1px solid #e6e6ee;border-radius:6px;overflow:hidden">
      <div style="background:${NAVY};color:#fff;padding:8px 14px;font-size:12px;letter-spacing:.5px">YOUR POSITION IN ${row.stock}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <tr><td style="padding:8px 14px;color:${MUT}">Quantity</td><td style="padding:8px 14px;text-align:right;font-weight:600">${fmtNum(row.quantity)}</td>
            <td style="padding:8px 14px;color:${MUT}">Avg cost</td><td style="padding:8px 14px;text-align:right">${money(row.purchasePrice)}</td></tr>
        <tr style="background:${BG}"><td style="padding:8px 14px;color:${MUT}">Last price</td><td style="padding:8px 14px;text-align:right">${money(row.currentPrice)}</td>
            <td style="padding:8px 14px;color:${MUT}">Value</td><td style="padding:8px 14px;text-align:right;font-weight:600">${money(row.current)}</td></tr>
        <tr><td style="padding:8px 14px;color:${MUT}">Profit / Loss</td>
            <td style="padding:8px 14px;text-align:right;color:${num(row.pnl) >= 0 ? UP : DN};font-weight:600" colspan="3">${money(row.pnl)} (${fmtNum(row.pnlPct)}%)</td></tr>
      </table>
    </div>` : "";
  const inner = `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e6ee;font-family:Georgia,'Times New Roman',serif;color:${INK}">
    <div style="background:${NAVY};border-bottom:4px solid ${YEL};padding:20px 26px">
      <table style="width:100%;border-collapse:collapse"><tr>
        <td style="text-align:left;vertical-align:middle">
          <div style="font-size:21px;font-weight:bold;letter-spacing:2px;color:#ffffff">VASUPRADAH</div>
          <div style="font-size:10px;letter-spacing:3px;color:${GOLD};margin-top:3px">INVESTMENT ADVISORY</div>
        </td>
        <td style="text-align:right;vertical-align:middle">
          <div style="font-size:13px;color:#ffffff;font-style:italic">${row.stock}</div>
          <div style="font-size:11px;color:${GOLD};margin-top:3px">${today()}</div>
        </td>
      </tr></table>
    </div>
    <div style="background:${YEL};height:6px;font-size:0;line-height:0">&nbsp;</div>
    <div style="padding:18px 26px 4px">
      <div style="font-size:12px;color:${MUT}">For ${name} &nbsp;\xB7&nbsp; ${row.code}</div>
      <div style="font-size:18px;font-weight:bold;color:${NAVY};margin-top:4px">${heading}</div>
    </div>
    ${bodyHtml ? `<div style="padding:8px 26px 4px;font-size:13.5px;line-height:1.6;color:${INK}">${bodyHtml}</div>` : ""}
    ${posHtml}
    <div style="background:${BG};border-top:1px solid #e6e6ee;padding:14px 26px;font-size:10.5px;color:${MUT};line-height:1.55;margin-top:12px">
      <div style="color:${NAVY};font-weight:bold;font-size:11px">${db.advisorName || "Vasupradah Investment Advisory Services P Ltd"}</div>
      <div>SEBI Registered Investment Adviser${db.sebiRegNo ? ` \u2022 Reg. No: ${db.sebiRegNo}` : ""}</div>
      <div style="margin-top:6px">This is an advisory communication, not a solicitation. Investments in securities are subject to market risks; please read all related documents carefully. <b>For Private Circulation Only.</b></div>
    </div>
  </div>`;
  const full = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${row.stock} \u2014 ${name} | Vasupradah</title></head><body style="margin:0;padding:20px 0;background:${BG}">${inner}</body></html>`;
  let caption = `Dear ${name},
${heading}`;
  if (bodyTxt) caption += `

${bodyTxt}`;
  if (withPos) caption += `

Your position in ${row.stock}: Qty ${fmtNum(row.quantity)}, Avg ${money(row.purchasePrice)}, LTP ${money(row.currentPrice)}, Value ${money(row.current)}, P/L ${money(row.pnl)} (${fmtNum(row.pnlPct)}%).`;
  caption += `

\u2014 ${db.advisorName || "Vasupradah"}${db.sebiRegNo ? `, SEBI Reg. ${db.sebiRegNo}` : ""}
For Private Circulation Only.`;
  const fileBase = `Vasupradah_${String(row.stock || "")}_${String(name).replace(/[^A-Za-z0-9]+/g, "_")}`;
  return { inner, full, caption, fileBase };
}
function TradeHistoryModal({ db, code, name, symbol, onClose }) {
  const [store, setStore] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const local = await loadTrades();
        if (!dead && local && !local.marker) {
          setStore(local);
          setState("ready");
        }
        const url = (db.sheetUrl || "").trim();
        if (!url) {
          if (!dead && (!local || local.marker)) setState(local && local.marker ? "error" : "empty");
          return;
        }
        const res = await fetch(withToken(url) + "&trades=1&code=" + encodeURIComponent(code) + "&sym=" + encodeURIComponent(sym));
        const data = await res.json();
        let list = Array.isArray(data.trades) ? data.trades : [];
        if (dead) return;
        if (list.length && Array.isArray(list[0])) {
          list = list.map((a) => ({ "Date": a[0], "Client code": a[1], "Client name": a[2], "Symbol": a[3], "Action": a[4], "Quantity": a[5], "Price": a[6], "Amount": a[7] }));
        }
        if (list.length) {
          const built = aggregateTradeRows(list);
          const merged = mergeTradeStore(local && !local.marker ? local : null, built);
          setStore(merged);
          setState("ready");
          saveTrades(merged);
        } else if (!local || local.marker) setState("empty");
      } catch (e) {
        if (!dead) setState((s) => s === "ready" ? "ready" : "error");
      }
    })();
    return () => {
      dead = true;
    };
  }, [db.sheetUrl]);
  const sym = String(symbol || "").toUpperCase();
  const rows = useMemo(() => {
    const out = [];
    for (const t of store && store.trades ? store.trades : []) {
      const [c, s, date, ac, qty, price, amount] = t;
      if (String(c) !== String(code) || String(s).toUpperCase() !== sym) continue;
      out.push({ date, side: ac === "S" ? "SELL" : "BUY", qty: num(qty), price: num(price), amount: num(amount) });
    }
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [store, code, sym]);
  const bought = rows.filter((r) => r.side === "BUY"), sold = rows.filter((r) => r.side === "SELL");
  const bq = bought.reduce((s, r) => s + r.qty, 0), ba = bought.reduce((s, r) => s + r.amount, 0);
  const sq = sold.reduce((s, r) => s + r.qty, 0), sa = sold.reduce((s, r) => s + r.amount, 0);
  const held = bq - sq;
  const realised = sq > 0 && bq > 0 ? sa - ba / bq * sq : 0;
  const dISO = (d) => {
    const s = String(d);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  };
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/40 z-40 flex items-start justify-center p-3 overflow-y-auto", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl w-full max-w-3xl mt-8", style: { maxHeight: "88vh", overflowY: "auto" }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Calendar, { size: 16, style: { color: VP_NAVY } }), /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-slate-800" }, sym, " \u2014 past trades"), /* @__PURE__ */ React.createElement("span", { className: "text-[12px] text-slate-400" }, name || code)), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "text-slate-400 hover:text-slate-600" }, /* @__PURE__ */ React.createElement(X, { size: 18 }))), /* @__PURE__ */ React.createElement("div", { className: "p-4" }, state === "loading" && /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-500 py-6 text-center" }, "Loading trades\u2026"), state === "error" && /* @__PURE__ */ React.createElement("div", { className: "text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3" }, "Couldn't read the trade history. Check the sheet is connected and the Apps Script re-deployed."), state === "empty" && /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-500 py-6 text-center" }, "No trade history has been synced yet. Run ", /* @__PURE__ */ React.createElement("b", null, "Settings \u2192 GridKey auto-sync \u2192 Fetch now"), ", or add trades under ", /* @__PURE__ */ React.createElement("b", null, "Upload Data"), "."), state === "ready" && (rows.length ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }, className: "mb-4" }, [
    ["Bought", `${fmtNum(bq)} sh`, bq ? `avg ${fmtINR(ba / bq)}` : ""],
    ["Sold / booked", `${fmtNum(sq)} sh`, sq ? `avg ${fmtINR(sa / sq)}` : ""],
    ["Net held", `${fmtNum(held)} sh`, ""],
    ["Realised P/L", sq ? fmtINR(realised) : "\u2014", sq ? "against average cost" : ""]
  ].map(([k, v, sub]) => /* @__PURE__ */ React.createElement("div", { key: k, className: "rounded-xl border border-slate-200 px-3 py-2.5" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10px] uppercase tracking-wide text-slate-400" }, k), /* @__PURE__ */ React.createElement("div", { className: `font-semibold tabular-nums ${k === "Realised P/L" && sq ? realised >= 0 ? "text-emerald-600" : "text-rose-600" : "text-slate-800"}` }, v), sub && /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, sub)))), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg overflow-hidden" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "text-[11px] uppercase tracking-wide text-slate-500", style: { background: "#f8fafc" } }, /* @__PURE__ */ React.createElement("th", { className: "text-left font-semibold px-3 py-2" }, "Date"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-semibold px-3 py-2" }, "Action"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2" }, "Qty"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2" }, "Rate"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2" }, "Value"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, rows.map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: i }, /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-slate-700 whitespace-nowrap" }, dISO(r.date)), /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 font-medium ${r.side === "SELL" ? "text-rose-600" : "text-emerald-600"}` }, r.side), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums" }, fmtNum(r.qty)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums" }, fmtINR(r.price)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, fmtINR(r.amount))))))), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mt-2" }, "Realised profit is measured against the average cost of everything bought in this account, which is how the rest of the console values positions.")) : /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-500 py-6 text-center" }, "No trades recorded for ", /* @__PURE__ */ React.createElement("b", null, sym), " in this account. Current holdings may predate the synced trade history.")))));
}
function ClientPage({ db, code, onBack, showToast, onNote, onStatement, commit, isAdmin }) {
  const c = (db.clients || {})[code];
  const money = (n) => fmtINR(n);
  const normNm = (s) => String(s || "").trim().replace(/\s+/g, " ").toUpperCase();
  const cashCodeL = useMemo(() => {
    const m = {};
    for (const [k, v] of Object.entries(db.cashCode || {})) m[String(k).trim()] = num(v);
    return m;
  }, [db.cashCode]);
  const cashL = useMemo(() => {
    const m = {};
    for (const [k, v] of Object.entries(db.cash || {})) m[normNm(k)] = num(v);
    return m;
  }, [db.cash]);
  const statusCodeL = useMemo(() => {
    const m = {};
    for (const [k, v] of Object.entries(db.statusCode || {})) m[String(k).trim()] = String(v);
    return m;
  }, [db.statusCode]);
  const statusL = useMemo(() => {
    const m = {};
    for (const [k, v] of Object.entries(db.status || {})) m[normNm(k)] = String(v);
    return m;
  }, [db.status]);
  const det = (db.clientDetails || {})[code] || {};
  if (!c) return /* @__PURE__ */ React.createElement("div", { className: "p-6 text-slate-500" }, "Client not found. ", /* @__PURE__ */ React.createElement("button", { onClick: onBack, className: "text-indigo-600 hover:underline" }, "Back to report"));
  const cash = String(code).trim() && cashCodeL[String(code).trim()] != null ? cashCodeL[String(code).trim()] : cashL[normNm(c.name)] || 0;
  const acct = String(code).trim() && statusCodeL[String(code).trim()] || statusL[normNm(c.name)] || "\u2014";
  const rows = useMemo(() => {
    const out = [];
    for (const h of Object.values(c.holdings || {})) {
      if (num(h.quantity) <= 0) continue;
      const e = effOf(h, db.prices);
      out.push({
        stock: h.stock,
        quantity: num(h.quantity),
        purchasePrice: num(h.purchasePrice),
        currentPrice: e.currentPrice,
        priced: e.priced,
        invested: e.invested,
        current: e.current,
        pnl: e.current - e.invested,
        pnlPct: e.invested ? (e.current - e.invested) / e.invested * 100 : 0
      });
    }
    return out.sort((a, b) => b.current - a.current);
  }, [c, db.prices]);
  const invested = rows.reduce((s, r) => s + r.invested, 0);
  const value = rows.reduce((s, r) => s + r.current, 0);
  const total = value + cash;
  const pnl = value - invested;
  const pnlPct = invested ? pnl / invested * 100 : 0;
  const eqShare = total ? value / total * 100 : 0;
  const cashShare = total ? cash / total * 100 : 0;
  const limit = concLimitFor(db, c.risk || "");
  const breaches = rows.filter((r) => total > 0 && r.current / total * 100 > limit);
  const Section = ({ title, sub, children }) => /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl border border-slate-200 p-5 mb-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xl font-bold", style: { color: VP_NAVY } }, title), sub && /* @__PURE__ */ React.createElement("p", { className: "text-[13px] text-slate-500 mt-0.5 mb-4" }, sub), !sub && /* @__PURE__ */ React.createElement("div", { className: "mb-4" }), children);
  const Pill = ({ ok, children }) => /* @__PURE__ */ React.createElement("span", { className: "text-[11px] px-2 py-1 rounded-full font-medium", style: ok ? { background: "#dcfce7", color: "#15803d" } : { background: "#fee2e2", color: "#b91c1c" } }, children);
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 mb-3 flex-wrap" }, /* @__PURE__ */ React.createElement("button", { onClick: onBack, className: "text-sm px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Undo2, { size: 14 }), " Back to report"), /* @__PURE__ */ React.createElement("span", { className: "text-[12px] text-slate-400" }, "Client view")), /* @__PURE__ */ React.createElement("div", { className: "rounded-2xl mb-4 overflow-hidden", style: { background: VP_NAVY } }, /* @__PURE__ */ React.createElement("div", { className: "px-5 pt-4 pb-3 flex items-start justify-between gap-4 flex-wrap", style: { borderBottom: "1px solid rgba(255,255,255,0.14)" } }, /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("h2", { className: "font-bold text-white", style: { fontSize: 22, lineHeight: 1.2, overflowWrap: "anywhere" } }, c.name || code), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mt-2 flex-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "px-2.5 py-1 rounded-full text-[12px] font-medium inline-flex items-center gap-1", style: { background: VP_GOLD, color: VP_NAVY } }, /* @__PURE__ */ React.createElement(ShieldCheck, { size: 12 }), " ", c.risk || "No risk category"), /* @__PURE__ */ React.createElement("span", { className: "px-2.5 py-1 rounded-full text-[12px]", style: { background: "rgba(255,255,255,0.14)", color: "#fff" } }, acct), /* @__PURE__ */ React.createElement("span", { className: "px-2.5 py-1 rounded-full text-[12px]", style: { background: "rgba(255,255,255,0.14)", color: "#fff" } }, rows.length, " holding", rows.length === 1 ? "" : "s"))), /* @__PURE__ */ React.createElement("div", { className: "text-right shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "text-[11px] uppercase tracking-wide", style: { color: "rgba(255,255,255,0.6)" } }, "Client code"), /* @__PURE__ */ React.createElement("div", { className: "font-bold text-white", style: { fontSize: 18, letterSpacing: ".02em" } }, code))), /* @__PURE__ */ React.createElement("div", { className: "px-4 py-4", style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 } }, [
    ["Holdings", money(value), "#fff"],
    ["Available cash", money(cash), VP_GOLD],
    ["Total portfolio", money(total), "#fff"],
    ["Profit / loss", money(pnl), pnl >= 0 ? "#86efac" : "#fca5a5", `${fmtNum(pnlPct)}%`]
  ].map(([k, v, col, sub]) => /* @__PURE__ */ React.createElement("div", { key: k, className: "rounded-xl px-3 py-2.5", style: { background: "rgba(255,255,255,0.08)", minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "text-[10px] uppercase tracking-wide", style: { color: "rgba(255,255,255,0.6)" } }, k), /* @__PURE__ */ React.createElement("div", { className: "font-bold tabular-nums", style: { color: col, fontSize: 19, lineHeight: 1.3, overflowWrap: "anywhere" } }, v), sub && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] tabular-nums", style: { color: col } }, sub))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl border border-slate-200 px-4 py-3 mb-4" }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, alignItems: "start" } }, [
    ["PAN", (det.pan || "").toUpperCase()],
    ["Phone / WhatsApp", waDisplay(det.phone || c.whatsapp)],
    ["Email", det.email || c.email],
    ["Address", det.address]
  ].map(([k, v]) => /* @__PURE__ */ React.createElement("div", { key: k, style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "text-[10px] uppercase tracking-wide text-slate-400" }, k), /* @__PURE__ */ React.createElement("div", { className: `text-[13px] ${v ? "text-slate-800" : "text-slate-400 italic"}`, style: { overflowWrap: "anywhere", whiteSpace: "pre-wrap" } }, v || "not on record"))))), /* @__PURE__ */ React.createElement(Section, { title: "Advised Equity Portfolio", sub: "Holdings advised by Vasupradah, valued at current market price" }, /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "text-[11px] uppercase tracking-wide text-slate-500", style: { background: "#f8fafc" } }, /* @__PURE__ */ React.createElement("th", { className: "text-left font-semibold px-3 py-2.5" }, "Stock"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2.5" }, "Qty"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2.5" }, "Cost"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2.5" }, "LTP"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2.5" }, "Invested"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2.5" }, "Value"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2.5" }, "Weight"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2.5" }, "P/L"), /* @__PURE__ */ React.createElement("th", { className: "text-center font-semibold px-3 py-2.5" }, "Status"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, rows.map((r) => {
    const w = total ? r.current / total * 100 : 0;
    return /* @__PURE__ */ React.createElement("tr", { key: r.stock }, /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 font-medium text-slate-800" }, r.stock), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 text-right tabular-nums" }, fmtNum(r.quantity)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 text-right tabular-nums text-slate-500" }, money(r.purchasePrice)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 text-right tabular-nums" }, r.priced ? money(r.currentPrice) : /* @__PURE__ */ React.createElement("span", { className: "text-amber-600 text-[12px]" }, "no price")), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 text-right tabular-nums text-slate-600" }, money(r.invested)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 text-right tabular-nums font-medium" }, r.priced ? money(r.current) : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 text-right tabular-nums" }, fmtNum(w), "%"), /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2.5 text-right tabular-nums font-medium ${r.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}` }, money(r.pnl), /* @__PURE__ */ React.createElement("div", { className: "text-[11px]" }, fmtNum(r.pnlPct), "%")), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 text-center" }, /* @__PURE__ */ React.createElement(Pill, { ok: w <= limit }, w <= limit ? "Within limit" : "Over limit")));
  }), !rows.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 9, className: "px-3 py-8 text-center text-slate-400" }, "No holdings for this client.")))))), /* @__PURE__ */ React.createElement(Section, { title: "Concentration & Rebalancing", sub: `System flags any single stock above ${fmtNum(limit)}% of total assets for this risk category` }, /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "text-[11px] uppercase tracking-wide text-slate-500", style: { background: "#f8fafc" } }, /* @__PURE__ */ React.createElement("th", { className: "text-left font-semibold px-3 py-2.5" }, "Stock"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2.5" }, "Limit %"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2.5" }, "Actual %"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2.5" }, "Deviation"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-semibold px-3 py-2.5" }, "Trim value"), /* @__PURE__ */ React.createElement("th", { className: "text-center font-semibold px-3 py-2.5" }, "Status"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, rows.map((r) => {
    const w = total ? r.current / total * 100 : 0, dev = w - limit, over = dev > 0;
    return /* @__PURE__ */ React.createElement("tr", { key: r.stock }, /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 font-medium text-slate-800" }, r.stock), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 text-right tabular-nums text-slate-500" }, fmtNum(limit), "%"), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 text-right tabular-nums" }, fmtNum(w), "%"), /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2.5 text-right tabular-nums font-medium ${over ? "text-rose-600" : "text-emerald-600"}` }, over ? "+" : "", fmtNum(dev), "%"), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 text-right tabular-nums text-slate-600" }, over ? money(dev / 100 * total) : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2.5 text-center" }, /* @__PURE__ */ React.createElement(Pill, { ok: !over }, over ? "Off Track" : "On Track")));
  }), !rows.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 6, className: "px-3 py-8 text-center text-slate-400" }, "Nothing to check."))))), /* @__PURE__ */ React.createElement("div", { className: "mt-4 rounded-xl px-4 py-3 text-[13px]", style: { background: "#fffbeb", border: "1px solid #f5e2a3", color: "#92610a" } }, /* @__PURE__ */ React.createElement("b", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 14 }), " Rebalance trigger alert policy"), /* @__PURE__ */ React.createElement("div", { className: "mt-1" }, "Any single stock above the category limit is flagged for action to bring the portfolio risk profile back to equilibrium. ", breaches.length ? `${breaches.length} holding(s) currently breach the ${fmtNum(limit)}% limit.` : "No breaches at present.", " Any recommendation must remain suitable for this client's risk category."))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mb-6" }, /* @__PURE__ */ React.createElement("button", { onClick: () => onStatement(c), className: "text-sm px-4 py-2 rounded-lg text-white flex items-center gap-1.5", style: { background: VP_NAVY } }, /* @__PURE__ */ React.createElement(FileText, { size: 15 }), " Portfolio statement"), /* @__PURE__ */ React.createElement("button", { onClick: () => waNumber(c.whatsapp) ? onNote(c) : showToast("No WhatsApp number for this client.", "err"), className: "text-sm px-4 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(MessageCircle, { size: 15 }), " Send an update")));
}
function Report({ db, user, commit, showToast, refreshPrices }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "stock", dir: "asc" });
  const [catFilter, setCatFilter] = useState("All");
  const [stockFilter, setStockFilter] = useState("All");
  const [rebalanceTarget, setRebalanceTarget] = useState("10");
  const [capRebalanceAtCash, setCapRebalanceAtCash] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(null);
  const [statement, setStatement] = useState(null);
  const [clientPage, setClientPage] = useState(null);
  const [tradeHist, setTradeHist] = useState(null);
  const [del, setDel] = useState(null);
  const [manage, setManage] = useState(false);
  const [greet, setGreet] = useState(false);
  const [delStock, setDelStock] = useState(null);
  const [delClient, setDelClient] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState("holdings");
  const [noteRow, setNoteRow] = useState(null);
  const [stockMsg, setStockMsg] = useState({ heading: "", body: "", withPos: true });
  const isClient = viewMode === "clients";
  const isCash = viewMode === "cash";
  const isRebalance = viewMode === "rebalance";
  const isConc = viewMode === "concentration";
  const normName = (s) => String(s || "").trim().replace(/\s+/g, " ").toUpperCase();
  const cashLookup = useMemo(() => {
    const m = {};
    for (const [k, v] of Object.entries(db.cash || {})) m[normName(k)] = num(v);
    return m;
  }, [db.cash]);
  const cashCodeLookup = useMemo(() => {
    const m = {};
    for (const [k, v] of Object.entries(db.cashCode || {})) m[String(k).trim()] = num(v);
    return m;
  }, [db.cashCode]);
  const statusLookup = useMemo(() => {
    const m = {};
    for (const [k, v] of Object.entries(db.status || {})) m[normName(k)] = String(v);
    return m;
  }, [db.status]);
  const statusCodeLookup = useMemo(() => {
    const m = {};
    for (const [k, v] of Object.entries(db.statusCode || {})) m[String(k).trim()] = String(v);
    return m;
  }, [db.statusCode]);
  const cashOf = (code, name) => {
    const ck = String(code ?? "").trim();
    if (ck && cashCodeLookup[ck] != null) return cashCodeLookup[ck];
    return cashLookup[normName(name)] || 0;
  };
  const statusOf = (code, name) => {
    const ck = String(code ?? "").trim();
    if (ck && statusCodeLookup[ck]) return statusCodeLookup[ck];
    return statusLookup[normName(name)] || "";
  };
  const hasStatus = Object.keys(db.status || {}).length > 0 || Object.keys(db.statusCode || {}).length > 0;
  const statusOptions = useMemo(() => {
    const s = /* @__PURE__ */ new Set();
    Object.values(db.status || {}).forEach((v) => v && s.add(String(v)));
    Object.values(db.statusCode || {}).forEach((v) => v && s.add(String(v)));
    return Array.from(s).sort();
  }, [db.status, db.statusCode]);
  const doRefresh = async () => {
    if (!refreshPrices) return;
    setRefreshing(true);
    const r = await refreshPrices();
    setRefreshing(false);
    showToast(r?.ok ? `Live prices updated \u2014 ${r.count} scrip.` : r?.msg || "Couldn't refresh prices.", r?.ok ? "ok" : "err");
  };
  const priceCount = Object.keys(db.prices || {}).length;
  const pricesWhen = db.pricesAt ? new Date(db.pricesAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null;
  const buildStatement = (client) => {
    const NAVY = "#1E2A78", GOLD = "#C9A24B", YEL = "#F5C518", BG = "#F7F8FB", INK = "#1A1A2E", MUT = "#6B7280", UP = "#0F8A4F", DN = "#C0392B";
    const money = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
    const pl = (n) => `<span style="color:${n >= 0 ? UP : DN};font-weight:600">${money(n)}</span>`;
    const hs = Object.values(client.holdings || {}).filter((h) => num(h.quantity) > 0);
    const rws = hs.map((h) => {
      const e = effOf(h, db.prices);
      return { stock: h.stock, qty: num(h.quantity), buy: num(h.purchasePrice), ltp: e.currentPrice, invested: e.invested, value: e.current, pnl: e.pnl, pnlPct: e.pnlPct };
    }).sort((a, b) => b.value - a.value);
    const invested = rws.reduce((s, r) => s + r.invested, 0);
    const holdVal = rws.reduce((s, r) => s + r.value, 0);
    const cash = cashOf(client.code, client.name);
    const total = holdVal + cash;
    const pnl = holdVal - invested;
    const pnlPct = invested ? pnl / invested * 100 : 0;
    const status = statusOf(client.code, client.name);
    const wt = (v) => total > 0 ? v / total * 100 : 0;
    const body = rws.map((r, i) => `<tr style="background:${i % 2 ? "#ffffff" : BG}">
      <td style="padding:8px 10px;font-weight:600;color:${INK}">${r.stock}</td>
      <td style="padding:8px 10px;text-align:right;color:${INK}">${fmtNum(r.qty)}</td>
      <td style="padding:8px 10px;text-align:right;color:${MUT}">${money(r.buy)}</td>
      <td style="padding:8px 10px;text-align:right;color:${INK}">${money(r.ltp)}</td>
      <td style="padding:8px 10px;text-align:right;color:${MUT}">${money(r.invested)}</td>
      <td style="padding:8px 10px;text-align:right;color:${INK};font-weight:600">${money(r.value)}</td>
      <td style="padding:8px 10px;text-align:right;color:${INK}">${fmtNum(wt(r.value))}%</td>
      <td style="padding:8px 10px;text-align:right">${pl(r.pnl)} <span style="color:${r.pnlPct >= 0 ? UP : DN};font-size:11px">(${fmtNum(r.pnlPct)}%)</span></td>
    </tr>`).join("");
    const cashRow = cash > 0 ? `<tr style="background:#FFFBEA">
      <td style="padding:8px 10px;font-weight:600;color:${NAVY}">Cash balance</td>
      <td style="padding:8px 10px"></td><td style="padding:8px 10px"></td><td style="padding:8px 10px"></td><td style="padding:8px 10px"></td>
      <td style="padding:8px 10px;text-align:right;color:${INK};font-weight:600">${money(cash)}</td>
      <td style="padding:8px 10px;text-align:right;color:${INK}">${fmtNum(wt(cash))}%</td>
      <td style="padding:8px 10px"></td></tr>` : "";
    const inner = `<div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e6e6ee;font-family:Georgia,'Times New Roman',serif;color:${INK}">
      <div style="background:${NAVY};border-bottom:4px solid ${YEL};padding:22px 26px">
        <table style="width:100%;border-collapse:collapse"><tr>
          <td style="text-align:left;vertical-align:middle">
            <div style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#ffffff">VASUPRADAH</div>
            <div style="font-size:10px;letter-spacing:3px;color:${GOLD};margin-top:3px">INVESTMENT ADVISORY</div>
          </td>
          <td style="text-align:right;vertical-align:middle">
            <div style="font-size:13px;color:#ffffff;font-style:italic">Portfolio Statement</div>
            <div style="font-size:11px;color:${GOLD};margin-top:3px">${today()}</div>
          </td>
        </tr></table>
      </div>
      <div style="background:${YEL};height:6px;font-size:0;line-height:0">&nbsp;</div>
      <div style="padding:18px 26px 4px">
        <div style="font-size:18px;font-weight:bold;color:${NAVY}">${client.name || client.code}</div>
        <div style="font-size:12px;color:${MUT};margin-top:3px">Code: ${client.code}${status ? ` &nbsp;\u2022&nbsp; Account: <b style="color:${INK}">${status}</b>` : ""}${client.risk ? ` &nbsp;\u2022&nbsp; Category: ${client.risk}` : ""}</div>
      </div>
      <div style="padding:10px 18px 14px">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:${NAVY};color:#ffffff">
            <th style="padding:9px 10px;text-align:left">Stock</th><th style="padding:9px 10px;text-align:right">Qty</th>
            <th style="padding:9px 10px;text-align:right">Avg cost</th><th style="padding:9px 10px;text-align:right">LTP</th>
            <th style="padding:9px 10px;text-align:right">Invested</th><th style="padding:9px 10px;text-align:right">Value</th>
            <th style="padding:9px 10px;text-align:right">Weight</th><th style="padding:9px 10px;text-align:right">P/L</th>
          </tr></thead>
          <tbody>${body}${cashRow}</tbody>
        </table>
      </div>
      <div style="padding:0 18px 16px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:6px 10px;color:${MUT}">Total invested</td><td style="padding:6px 10px;text-align:right">${money(invested)}</td>
              <td style="padding:6px 10px;color:${MUT}">Holdings value</td><td style="padding:6px 10px;text-align:right;font-weight:600">${money(holdVal)}</td></tr>
          <tr><td style="padding:6px 10px;color:${MUT}">Cash balance</td><td style="padding:6px 10px;text-align:right">${money(cash)}</td>
              <td style="padding:6px 10px;color:${MUT}">Overall P/L</td><td style="padding:6px 10px;text-align:right">${pl(pnl)} <span style="color:${pnlPct >= 0 ? UP : DN};font-size:11px">(${fmtNum(pnlPct)}%)</span></td></tr>
        </table>
      </div>
      <div style="margin:0 18px 18px;background:${NAVY};border-left:6px solid ${GOLD};padding:0 18px">
        <table style="width:100%;border-collapse:collapse"><tr>
          <td style="padding:14px 0;text-align:left;font-size:13px;color:${YEL};letter-spacing:1px;vertical-align:middle">TOTAL PORTFOLIO VALUE</td>
          <td style="padding:14px 0;text-align:right;font-size:20px;font-weight:bold;color:#ffffff;vertical-align:middle">${money(total)}</td>
        </tr></table>
      </div>
      <div style="background:${BG};border-top:1px solid #e6e6ee;padding:14px 26px;font-size:10.5px;color:${MUT};line-height:1.55">
        <div style="color:${NAVY};font-weight:bold;font-size:11px">${db.advisorName || "Vasupradah Investment Advisory Services P Ltd"}</div>
        <div>SEBI Registered Investment Adviser${db.sebiRegNo ? ` \u2022 Reg. No: ${db.sebiRegNo}` : ""}</div>
        <div style="margin-top:6px">Values are indicative and reflect the latest available prices. Investments in securities are subject to market risks; please read all related documents carefully. <b>For Private Circulation Only.</b></div>
      </div>
    </div>`;
    const full = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${client.name || client.code} \u2014 Portfolio Statement | Vasupradah</title></head><body style="margin:0;padding:20px 0;background:${BG}">${inner}</body></html>`;
    const caption = `${client.name || client.code} \u2014 portfolio with Vasupradah Investment Advisory (${today()}).
Total portfolio: ${money(total)} | Overall P/L: ${money(pnl)} (${fmtNum(pnlPct)}%).`;
    return { inner, full, caption, fileBase: `Vasupradah_${String(client.name || client.code).replace(/[^A-Za-z0-9]+/g, "_")}` };
  };
  const NUMERIC = useMemo(() => /* @__PURE__ */ new Set(
    ["quantity", "purchasePrice", "currentPrice", "invested", "current", "pnl", "pnlPct", "weight", "cash"]
  ), []);
  const toggleSort = (key) => setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  const stockOptions = useMemo(() => {
    const set = /* @__PURE__ */ new Set();
    for (const c of Object.values(db.clients)) {
      if (catFilter !== "All" && (c.risk || "") !== catFilter) continue;
      for (const h of Object.values(c.holdings || {})) if (num(h.quantity) > 0) set.add(h.stock);
    }
    return Array.from(set).sort();
  }, [db.clients, catFilter]);
  const stockSummary = useMemo(() => {
    const m = {};
    for (const c of Object.values(db.clients)) {
      for (const h of Object.values(c.holdings || {})) {
        if (num(h.quantity) <= 0) continue;
        const k = h.stock;
        if (!m[k]) m[k] = { symbol: k, clients: 0, invested: 0, current: 0 };
        m[k].clients++;
        m[k].invested += num(h.invested);
        m[k].current += num(h.current);
      }
    }
    return Object.values(m).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [db.clients]);
  const clientTotals = useMemo(() => {
    const m = {};
    for (const c of Object.values(db.clients)) {
      let value = 0;
      for (const h of Object.values(c.holdings || {})) {
        if (num(h.quantity) <= 0) continue;
        value += effOf(h, db.prices).current;
      }
      const cash = cashOf(c.code, c.name);
      m[c.code] = { value, cash, total: value + cash };
    }
    return m;
  }, [db.clients, db.prices, db.cash, db.cashCode]);
  const allBreaches = useMemo(() => {
    const out = [];
    for (const c of Object.values(db.clients)) {
      const t = clientTotals[c.code];
      const tot = t ? t.total : 0;
      if (tot <= 0) continue;
      const limit = concLimitFor(db, c.risk);
      const status = statusOf(c.code, c.name);
      for (const h of Object.values(c.holdings || {})) {
        if (num(h.quantity) <= 0) continue;
        const e = effOf(h, db.prices);
        const weight = e.current / tot * 100;
        if (weight <= limit) continue;
        const allowedValue = tot * (limit / 100);
        const excessValue = e.current - allowedValue;
        const ltp = num(e.currentPrice);
        const trimShares = ltp > 0 ? Math.min(num(h.quantity), Math.ceil(excessValue / ltp)) : 0;
        out.push({
          code: c.code,
          name: c.name || c.descriptor || c.code,
          risk: c.risk || "\u2014",
          status: status || "\u2014",
          whatsapp: c.whatsapp || "",
          email: c.email || "",
          stock: h.stock,
          quantity: num(h.quantity),
          purchasePrice: num(h.purchasePrice),
          currentPrice: ltp,
          current: e.current,
          invested: e.invested,
          pnl: e.pnl,
          pnlPct: e.pnlPct,
          total: tot,
          cash: t.cash,
          weight,
          limit,
          excessValue,
          allowedValue,
          trimShares,
          over: weight - limit
        });
      }
    }
    out.sort((a, b) => b.over - a.over);
    return out;
  }, [db.clients, db.prices, db.cash, db.cashCode, db.status, db.statusCode, db.concLimits, clientTotals]);
  const breachSet = useMemo(() => {
    const s = /* @__PURE__ */ new Set();
    for (const b of allBreaches) s.add(b.code + "|" + String(b.stock).toUpperCase());
    return s;
  }, [allBreaches]);
  const breachRows = useMemo(() => {
    if (!isConc) return [];
    const s = q.trim().toLowerCase();
    return allBreaches.filter((r) => {
      if (catFilter !== "All" && r.risk !== catFilter) return false;
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (stockFilter !== "All" && r.stock !== stockFilter) return false;
      if (s && ![r.code, r.name, r.stock, r.risk, r.status].some((x) => String(x || "").toLowerCase().includes(s))) return false;
      return true;
    });
  }, [isConc, allBreaches, catFilter, statusFilter, stockFilter, q]);
  const rows = useMemo(() => {
    let arr = [];
    for (const c of Object.values(db.clients)) {
      const status = statusOf(c.code, c.name);
      const tot = clientTotals[c.code]?.total || 0;
      for (const h of Object.values(c.holdings || {})) {
        if (num(h.quantity) <= 0) continue;
        const e = effOf(h, db.prices);
        arr.push({
          code: c.code,
          name: c.name,
          descriptor: c.descriptor,
          whatsapp: c.whatsapp,
          email: c.email,
          risk: c.risk || "",
          status,
          cash: cashOf(c.code, c.name),
          stock: h.stock,
          quantity: h.quantity,
          purchasePrice: h.purchasePrice,
          currentPrice: e.currentPrice,
          invested: e.invested,
          current: e.current,
          investedManual: h.investedManual,
          pnl: e.pnl,
          pnlPct: e.pnlPct,
          live: e.live,
          priced: e.priced,
          weight: tot > 0 ? e.current / tot * 100 : 0,
          clientTotal: tot
        });
      }
    }
    if (statusFilter !== "All") arr = arr.filter((r) => r.status === statusFilter);
    if (stockFilter !== "All") arr = arr.filter((r) => r.stock === stockFilter);
    if (catFilter !== "All") arr = arr.filter((r) => r.risk === catFilter);
    const s = q.trim().toLowerCase();
    if (s) arr = arr.filter((r) => [r.code, r.name, r.descriptor, r.stock, r.risk, r.status].some((x) => String(x || "").toLowerCase().includes(s)));
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sort.key === "name") return String(a.name || a.descriptor || a.code).localeCompare(String(b.name || b.descriptor || b.code)) * dir;
      if (NUMERIC.has(sort.key)) return (num(a[sort.key]) - num(b[sort.key])) * dir;
      return String(a[sort.key] ?? "").localeCompare(String(b[sort.key] ?? "")) * dir;
    });
    return arr;
  }, [db.clients, db.prices, db.status, db.statusCode, db.cash, db.cashCode, clientTotals, q, sort, NUMERIC, catFilter, stockFilter, statusFilter]);
  const totals = useMemo(() => {
    const codes = /* @__PURE__ */ new Set();
    const t = rows.reduce(
      (t2, r) => {
        t2.invested += num(r.invested);
        t2.current += num(r.current);
        codes.add(r.code);
        return t2;
      },
      { invested: 0, current: 0 }
    );
    t.clients = codes.size;
    t.holdings = rows.length;
    return t;
  }, [rows]);
  const clientRows2 = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = [];
    for (const c of Object.values(db.clients)) {
      if (catFilter !== "All" && (c.risk || "") !== catFilter) continue;
      const status = statusOf(c.code, c.name);
      if (statusFilter !== "All" && status !== statusFilter) continue;
      let invested = 0, value = 0, stocks = 0;
      for (const h of Object.values(c.holdings || {})) {
        if (num(h.quantity) <= 0) continue;
        const e = effOf(h, db.prices);
        invested += e.invested;
        value += e.current;
        stocks++;
      }
      const cash = cashOf(c.code, c.name);
      if (stocks === 0 && cash === 0) continue;
      if (s && ![c.code, c.name, c.descriptor, c.risk, status].some((x) => String(x || "").toLowerCase().includes(s))) continue;
      const pnl = value - invested;
      out.push({
        code: c.code,
        name: c.name,
        descriptor: c.descriptor,
        whatsapp: c.whatsapp,
        email: c.email,
        risk: c.risk || "",
        status,
        stocks,
        invested,
        value,
        cash,
        total: value + cash,
        pnl,
        pnlPct: invested ? pnl / invested * 100 : 0
      });
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      if (sort.key === "risk") return String(a.risk).localeCompare(String(b.risk)) * dir;
      if (sort.key === "pnlPct") return (a.pnlPct - b.pnlPct) * dir;
      return String(a.name || a.descriptor || a.code).localeCompare(String(b.name || b.descriptor || b.code)) * dir;
    });
    return out;
  }, [db.clients, db.prices, db.cash, db.cashCode, db.status, db.statusCode, q, sort, catFilter, statusFilter]);
  const cashRows = useMemo(() => {
    if (!isCash) return [];
    const s = q.trim().toLowerCase();
    const out = [];
    const usedCodes = /* @__PURE__ */ new Set();
    const usedNames = /* @__PURE__ */ new Set();
    for (const c of Object.values(db.clients)) {
      const ck = String(c.code || "").trim();
      const nk = normName(c.name);
      if (ck && cashCodeLookup[ck] != null) usedCodes.add(ck);
      else if (cashLookup[nk] != null) usedNames.add(nk);
      const status = statusOf(c.code, c.name);
      if (catFilter !== "All" && (c.risk || "") !== catFilter) continue;
      if (statusFilter !== "All" && status !== statusFilter) continue;
      const cash = cashOf(c.code, c.name);
      let value = 0;
      for (const h of Object.values(c.holdings || {})) {
        if (num(h.quantity) > 0) value += effOf(h, db.prices).current;
      }
      if (s && ![c.code, c.name, c.descriptor, c.risk, status].some((x) => String(x || "").toLowerCase().includes(s))) continue;
      out.push({
        code: c.code,
        name: c.name || c.descriptor || c.code,
        risk: c.risk || "\u2014",
        status: status || "\u2014",
        value,
        cash,
        total: value + cash,
        cashPct: value + cash ? cash / (value + cash) * 100 : 0,
        matched: true
      });
    }
    if (catFilter === "All") {
      for (const [code, amt] of Object.entries(db.cashCode || {})) {
        const ck = String(code).trim();
        if (!ck || usedCodes.has(ck)) continue;
        const status = (db.statusCode || {})[code] || "\u2014";
        if (statusFilter !== "All" && status !== statusFilter) continue;
        if (s && !ck.toLowerCase().includes(s)) continue;
        out.push({ code: ck, name: "\u2014 in Cash sheet, not in client list \u2014", risk: "\u2014", status, value: 0, cash: num(amt), total: num(amt), cashPct: 100, matched: false });
      }
      for (const [nm, amt] of Object.entries(db.cash || {})) {
        if (usedNames.has(normName(nm))) continue;
        if (Object.values(db.clients).some((c) => normName(c.name) === normName(nm))) continue;
        const status = (db.status || {})[nm] || "\u2014";
        if (statusFilter !== "All" && status !== statusFilter) continue;
        if (s && !String(nm).toLowerCase().includes(s)) continue;
        out.push({ code: "\u2014", name: `${nm} (not in client list)`, risk: "\u2014", status, value: 0, cash: num(amt), total: num(amt), cashPct: 100, matched: false });
      }
    }
    out.sort((a, b) => b.cash - a.cash);
    return out;
  }, [isCash, db.clients, db.prices, db.cash, db.cashCode, db.status, db.statusCode, q, catFilter, statusFilter, cashLookup, cashCodeLookup]);
  const rebalanceRows = useMemo(() => {
    if (!isRebalance || stockFilter === "All") return [];
    const sym = String(stockFilter).toUpperCase();
    const px = (db.prices || {})[sym];
    const ltp = num(px);
    const s = q.trim().toLowerCase();
    const out = [];
    for (const c of Object.values(db.clients)) {
      if (catFilter !== "All" && (c.risk || "") !== catFilter) continue;
      const status = statusOf(c.code, c.name);
      if (statusFilter !== "All" && status !== statusFilter) continue;
      let holdingsValue = 0;
      let hCurrent = 0;
      let hQty = 0;
      let hInvested = 0;
      for (const h of Object.values(c.holdings || {})) {
        if (num(h.quantity) <= 0) continue;
        const e = effOf(h, db.prices);
        holdingsValue += e.current;
        if (String(h.stock || "").toUpperCase() === sym) {
          hCurrent = e.current;
          hQty = num(h.quantity);
          hInvested = num(h.invested);
        }
      }
      const cash = cashOf(c.code, c.name);
      const total = holdingsValue + cash;
      if (total <= 0) continue;
      const tgtPct = Math.max(0, num(rebalanceTarget)) / 100;
      const target = total * tgtPct;
      const gap = target - hCurrent;
      let shares = ltp > 0 ? gap >= 0 ? Math.floor(gap / ltp) : Math.ceil(gap / ltp) : 0;
      let capped = false;
      if (capRebalanceAtCash && shares > 0 && ltp > 0) {
        const maxShares = Math.max(0, Math.floor(cash / ltp));
        if (shares > maxShares) {
          shares = maxShares;
          capped = true;
        }
      }
      const cost = shares > 0 ? shares * ltp : 0;
      const insufficientCash = shares > 0 && cost > cash;
      if (s && ![c.code, c.name, c.risk, status].some((x) => String(x || "").toLowerCase().includes(s))) continue;
      out.push({
        code: c.code,
        name: c.name || c.code,
        risk: c.risk || "\u2014",
        status: status || "\u2014",
        holdingsValue,
        cash,
        total,
        currentQty: hQty,
        currentValue: hCurrent,
        currentPct: total ? hCurrent / total * 100 : 0,
        target,
        gap,
        shares,
        cost,
        insufficientCash,
        capped,
        currentInvested: hInvested
      });
    }
    out.sort((a, b) => b.shares - a.shares);
    return out;
  }, [isRebalance, stockFilter, rebalanceTarget, capRebalanceAtCash, db.clients, db.prices, db.cash, db.cashCode, db.status, db.statusCode, q, catFilter, statusFilter, cashLookup, cashCodeLookup]);
  const openRebalanceMessage = (r) => {
    if (stockFilter === "All") return;
    const sym = String(stockFilter).toUpperCase();
    const client = db.clients[r.code] || {};
    const heldRaw = client.holdings ? client.holdings[sym] : null;
    const e = heldRaw ? effOf(heldRaw, db.prices) : { currentPrice: num(db.prices?.[sym]), current: 0, invested: 0, pnl: 0, pnlPct: 0 };
    const shaped = {
      code: r.code,
      name: r.name,
      whatsapp: client.whatsapp || "",
      email: client.email || "",
      stock: sym,
      quantity: heldRaw ? num(heldRaw.quantity) : 0,
      purchasePrice: heldRaw ? num(heldRaw.purchasePrice) : 0,
      currentPrice: e.currentPrice,
      current: e.current,
      pnl: e.pnl,
      pnlPct: e.pnlPct,
      // Rebalance context, so the modal can offer a prefill without recomputing.
      _rebalance: {
        action: r.shares > 0 ? "buy" : r.shares < 0 ? "trim" : "hold",
        shares: Math.abs(r.shares),
        targetPct: num(rebalanceTarget) || 0,
        cost: r.cost,
        insufficientCash: r.insufficientCash,
        cash: r.cash,
        capped: r.capped
      }
    };
    setNoteRow(shaped);
  };
  const openConcMessage = (r) => {
    setNoteRow({
      code: r.code,
      name: r.name,
      whatsapp: r.whatsapp,
      email: r.email,
      stock: r.stock,
      quantity: r.quantity,
      purchasePrice: r.purchasePrice,
      currentPrice: r.currentPrice,
      current: r.current,
      pnl: r.pnl,
      pnlPct: r.pnlPct,
      _rebalance: {
        action: "trim",
        shares: r.trimShares,
        targetPct: r.limit,
        cost: 0,
        insufficientCash: false,
        cash: r.cash,
        _conc: { weight: r.weight, limit: r.limit, excessValue: r.excessValue }
      }
    });
  };
  const rebalanceTotals = useMemo(() => {
    if (!isRebalance) return null;
    let sharesToBuy = 0, sharesToTrim = 0, totalCost = 0, cashAvail = 0, insufficient = 0, capped = 0;
    let clientsToBuy = 0, clientsToTrim = 0, clientsOnTarget = 0;
    for (const r of rebalanceRows) {
      if (r.shares > 0) {
        sharesToBuy += r.shares;
        totalCost += r.cost;
        clientsToBuy++;
        if (r.insufficientCash) insufficient++;
        if (r.capped) capped++;
      } else if (r.shares < 0) {
        sharesToTrim += -r.shares;
        clientsToTrim++;
      } else clientsOnTarget++;
      cashAvail += r.cash;
    }
    return { sharesToBuy, sharesToTrim, totalCost, cashAvail, insufficient, capped, clientsToBuy, clientsToTrim, clientsOnTarget };
  }, [isRebalance, rebalanceRows]);
  const unpricedList = useMemo(() => {
    const out = [];
    for (const c of Object.values(db.clients)) {
      for (const h of Object.values(c.holdings || {})) {
        if (num(h.quantity) <= 0) continue;
        const e = effOf(h, db.prices);
        if (!e.priced) out.push({ code: c.code, name: c.name || c.code, stock: h.stock, invested: e.invested });
      }
    }
    return out;
  }, [db.clients, db.prices]);
  const unpricedStocks = useMemo(() => Array.from(new Set(unpricedList.map((u) => u.stock))), [unpricedList]);
  const cashGroups = useMemo(() => {
    if (!isCash) return null;
    const by = (key) => {
      const m = {};
      for (const r of cashRows) {
        const k = r[key] || "\u2014";
        if (!m[k]) m[k] = { cash: 0, value: 0, n: 0 };
        m[k].cash += r.cash;
        m[k].value += r.value;
        m[k].n++;
      }
      return Object.entries(m).sort((a, b) => b[1].cash - a[1].cash);
    };
    const totalCash = cashRows.reduce((t, r) => t + r.cash, 0);
    const totalAll = cashRows.reduce((t, r) => t + r.total, 0);
    return {
      byType: by("status"),
      byRisk: by("risk"),
      totalCash,
      totalAll,
      withCash: cashRows.filter((r) => r.cash > 0).length,
      pct: totalAll ? totalCash / totalAll * 100 : 0
    };
  }, [isCash, cashRows]);
  const summary = useMemo(() => {
    if (isClient) {
      const t = clientRows2.reduce((t2, r) => {
        t2.invested += r.invested;
        t2.current += r.value;
        t2.cash += r.cash;
        return t2;
      }, { invested: 0, current: 0, cash: 0 });
      return { ...t, clients: clientRows2.length, holdings: clientRows2.reduce((n, r) => n + r.stocks, 0), total: t.current + t.cash };
    }
    const codes = /* @__PURE__ */ new Set();
    let cash = 0;
    rows.forEach((r) => {
      if (!codes.has(r.code)) {
        codes.add(r.code);
        cash += cashOf(r.code, r.name);
      }
    });
    return { invested: totals.invested, current: totals.current, cash, clients: totals.clients, holdings: totals.holdings, total: totals.current + cash };
  }, [isClient, clientRows2, rows, totals, db.cash]);
  const gain = summary.current - summary.invested;
  const gainPct = summary.invested ? gain / summary.invested * 100 : 0;
  const hasCash = Object.keys(db.cash || {}).length > 0 || Object.keys(db.cashCode || {}).length > 0;
  const openWA = (row) => {
    const c = db.clients[row.code];
    if (!waNumber(c?.whatsapp)) {
      showToast("No WhatsApp number for this client \u2014 upload the client master or set it manually.", "err");
      return;
    }
    openWhatsApp(c.whatsapp, buildMessage(db, c));
  };
  const openEmail = (row) => {
    const c = db.clients[row.code];
    if (!c?.email) {
      showToast("No email for this client \u2014 upload the client master or set it manually.", "err");
      return;
    }
    const subject = `Portfolio update \u2014 Vasupradah Investment Advisory (${today()})`;
    window.location.href = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildMessage(db, c))}`;
  };
  const recipientEmails = useMemo(() => {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const r of rows) {
      if (r.email && !seen.has(r.code)) {
        seen.add(r.code);
        out.push(r.email);
      }
    }
    return out;
  }, [rows]);
  const bccScopeLabel = stockFilter !== "All" ? `holders of ${stockFilter}` : catFilter !== "All" ? catFilter : "all clients in view";
  const copyAllEmails = () => {
    if (!recipientEmails.length) {
      showToast("No email addresses in this view.", "err");
      return;
    }
    copyText(recipientEmails.join(", ")).then(() => showToast(`${recipientEmails.length} email(s) copied \u2014 paste into the BCC field.`)).catch(() => showToast("Copy failed \u2014 try the Email all button instead.", "err"));
  };
  const emailAllBcc = () => {
    if (!recipientEmails.length) {
      showToast("No email addresses in this view.", "err");
      return;
    }
    const subject = stockFilter !== "All" ? `${stockFilter} \u2014 update from Vasupradah Investment Advisory` : `Update from Vasupradah Investment Advisory`;
    const href = `mailto:?bcc=${encodeURIComponent(recipientEmails.join(","))}&subject=${encodeURIComponent(subject)}`;
    if (href.length > 1900) showToast(`Opening your mail app with ${recipientEmails.length} BCC recipients. If your mail app drops some, use \u201CCopy emails (BCC)\u201D and paste them in.`);
    window.location.href = href;
  };
  const saveEdit = async (vals) => {
    await commit((d) => {
      const c = d.clients[edit.code];
      if (!c) return;
      c.name = vals.name;
      c.whatsapp = vals.whatsapp;
      c.email = vals.email;
      c.risk = vals.risk;
      const h = c.holdings[edit.stock];
      if (h) {
        h.investedManual = vals.investedManual;
        h.invested = vals.investedManual ? vals.invested : h.investedSheet ?? h.invested;
        h.purchasePrice = num(h.quantity) ? num(h.invested) / num(h.quantity) : 0;
      }
    }, `edit ${edit.code}/${edit.stock}`);
    setEdit(null);
    showToast("Saved.");
  };
  const doDelete = async () => {
    const { code, stock } = del;
    await commit((d) => {
      const c = d.clients[code];
      if (!c) return;
      delete c.holdings[stock];
      if (!Object.keys(c.holdings || {}).length) delete d.clients[code];
    }, `delete ${code}/${stock}`);
    setDel(null);
    showToast("Holding removed. Use Undo to restore.");
  };
  const deleteClientAll = async () => {
    const { code, name } = delClient;
    const n = Object.keys(db.clients[code] && db.clients[code].holdings || {}).length;
    await commit((d) => {
      delete d.clients[code];
    }, `remove client ${code}`);
    setDelClient(null);
    showToast(`Removed ${name || code}${n ? ` and ${n} holding(s)` : ""} from the report. Use Undo to restore.`);
  };
  const deleteStock = async (symbol) => {
    await commit((d) => {
      for (const code of Object.keys(d.clients)) {
        const c = d.clients[code];
        if (c.holdings && c.holdings[symbol]) delete c.holdings[symbol];
        if (!Object.keys(c.holdings || {}).length && !c.name && !c.whatsapp) delete d.clients[code];
      }
    }, `delete stock ${symbol}`);
    setDelStock(null);
    if (stockFilter === symbol) setStockFilter("All");
    showToast(`${symbol} removed from all portfolios. Use Undo to restore.`);
  };
  const missing = useMemo(() => {
    const codes = new Set(rows.map((r) => r.code));
    let n = 0;
    codes.forEach((code) => {
      const c = db.clients[code];
      if (!c?.name || !c?.whatsapp) n++;
    });
    return n;
  }, [rows, db.clients]);
  const SortTh = ({ k, children, right }) => /* @__PURE__ */ React.createElement(
    "th",
    {
      onClick: () => toggleSort(k),
      className: `px-2 py-2 font-medium cursor-pointer select-none hover:text-slate-700 ${right ? "text-right" : "text-left"}`
    },
    /* @__PURE__ */ React.createElement("span", { className: `inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""}` }, children, /* @__PURE__ */ React.createElement("span", { className: "text-[9px] text-indigo-500 w-2" }, sort.key === k ? sort.dir === "asc" ? "\u25B2" : "\u25BC" : ""))
  );
  if (clientPage) {
    return /* @__PURE__ */ React.createElement(
      ClientPage,
      {
        db,
        code: clientPage,
        onBack: () => setClientPage(null),
        showToast,
        commit,
        isAdmin: user?.role === "admin",
        onStatement: (c) => setStatement(c),
        onNote: (c) => {
          const h = Object.values(c.holdings || {}).filter((x) => num(x.quantity) > 0)[0];
          if (h) setNoteRow({
            ...h,
            code: c.code,
            name: c.name,
            whatsapp: c.whatsapp,
            email: c.email,
            risk: c.risk,
            ...effOf(h, db.prices),
            clientTotal: 0,
            cash: 0,
            weight: 0
          });
          else showToast("This client has no holdings to write about.", "err");
        }
      }
    );
  }
  return /* @__PURE__ */ React.createElement("div", null, !isCash && !isRebalance && !isConc && /* @__PURE__ */ React.createElement("div", { className: `grid grid-cols-2 sm:grid-cols-3 ${hasCash ? "lg:grid-cols-6" : "lg:grid-cols-4"} gap-3 mb-4` }, /* @__PURE__ */ React.createElement(HeroStat, { label: "Clients", value: summary.clients, icon: Users, accent: "indigo" }), /* @__PURE__ */ React.createElement(HeroStat, { label: "Total invested", value: fmtINR(summary.invested), symbol: "\u20B9", accent: "slate" }), /* @__PURE__ */ React.createElement(HeroStat, { label: "Holdings value", value: fmtINR(summary.current), icon: Layers, accent: "slate" }), hasCash && /* @__PURE__ */ React.createElement(HeroStat, { label: "Cash balance", value: fmtINR(summary.cash), icon: Contact, accent: "slate" }), hasCash && /* @__PURE__ */ React.createElement(HeroStat, { label: "Total portfolio", value: fmtINR(summary.total), icon: ShieldCheck, accent: "emerald" }), /* @__PURE__ */ React.createElement(
    HeroStat,
    {
      label: `Profit / loss (as on ${today()})`,
      value: fmtINR(gain),
      sub: `${gain >= 0 ? "\u25B2" : "\u25BC"} ${fmtNum(Math.abs(gainPct))}%`,
      subTone: gain >= 0 ? "pos" : "neg",
      icon: TrendingUp,
      accent: gain >= 0 ? "emerald" : "rose"
    }
  )), missing > 0 && /* @__PURE__ */ React.createElement("div", { className: "mb-3 flex items-center gap-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 14 }), missing, " client(s) have holdings but no name/WhatsApp yet. Upload the client master sheet, or set them manually."), allBreaches.length > 0 && !isConc && /* @__PURE__ */ React.createElement("div", { className: "mb-3 flex items-start gap-2 text-[12px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 14, className: "mt-0.5 shrink-0" }), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("b", null, allBreaches.length, " concentration breach", allBreaches.length === 1 ? "" : "es"), " \u2014 a single stock is above the limit in ", new Set(allBreaches.map((b) => b.code)).size, " client portfolio(s).", " ", "Worst: ", /* @__PURE__ */ React.createElement("b", null, allBreaches[0].stock), " at ", /* @__PURE__ */ React.createElement("b", null, fmtNum(allBreaches[0].weight), "%"), " for ", allBreaches[0].name, " (limit ", fmtNum(allBreaches[0].limit), "%).", " ", /* @__PURE__ */ React.createElement("button", { onClick: () => setViewMode("concentration"), className: "underline font-medium hover:text-rose-950" }, "View all"))), unpricedList.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "mb-3 flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 14, className: "mt-0.5 shrink-0" }), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("b", null, unpricedList.length, " holding(s) have no live price"), " (", unpricedStocks.slice(0, 8).join(", "), unpricedStocks.length > 8 ? `, +${unpricedStocks.length - 8} more` : "", "). These are shown at cost and left out of profit/loss \u2014 they are ", /* @__PURE__ */ React.createElement("b", null, "not"), " a 100% loss. Add these symbols to the ", /* @__PURE__ */ React.createElement("b", null, "Sheet1"), " price feed to value them correctly.")), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-2 mb-3" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: catFilter,
      onChange: (e) => setCatFilter(e.target.value),
      className: "px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
    },
    /* @__PURE__ */ React.createElement("option", { value: "All" }, "All risk categories"),
    RISK_CATEGORIES.map((c) => /* @__PURE__ */ React.createElement("option", { key: c, value: c }, c))
  ), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: stockFilter,
      onChange: (e) => setStockFilter(e.target.value),
      disabled: isClient,
      className: "px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
    },
    /* @__PURE__ */ React.createElement("option", { value: "All" }, catFilter === "All" ? "All stocks" : "All stocks in this category"),
    stockOptions.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }, s))
  ), hasStatus && /* @__PURE__ */ React.createElement(
    "select",
    {
      value: statusFilter,
      onChange: (e) => setStatusFilter(e.target.value),
      className: "px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
    },
    /* @__PURE__ */ React.createElement("option", { value: "All" }, "All account types"),
    statusOptions.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }, s))
  ), (catFilter !== "All" || stockFilter !== "All" || statusFilter !== "All") && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setCatFilter("All");
        setStockFilter("All");
        setStatusFilter("All");
      },
      className: "text-xs text-slate-500 px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
    },
    "Clear"
  ), stockFilter !== "All" && /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-500" }, catFilter !== "All" ? /* @__PURE__ */ React.createElement(React.Fragment, null, "Holders of ", /* @__PURE__ */ React.createElement("b", null, stockFilter), " in ", /* @__PURE__ */ React.createElement("b", null, catFilter), ".") : /* @__PURE__ */ React.createElement(React.Fragment, null, "Everyone holding ", /* @__PURE__ */ React.createElement("b", null, stockFilter), ", across all categories.")), /* @__PURE__ */ React.createElement("div", { className: "ml-auto flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: copyAllEmails,
      title: `Copy the email addresses of ${bccScopeLabel} to paste into BCC`,
      className: "text-xs text-slate-600 px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
    },
    /* @__PURE__ */ React.createElement(Mail, { size: 14 }),
    " Copy emails (BCC)"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: emailAllBcc,
      title: `Open one email with ${bccScopeLabel} in BCC`,
      className: "text-xs text-blue-700 px-2.5 py-1.5 rounded-md border border-blue-200 hover:bg-blue-50 flex items-center gap-1.5"
    },
    /* @__PURE__ */ React.createElement(Send, { size: 14 }),
    " Email all (BCC)",
    recipientEmails.length ? ` \xB7 ${recipientEmails.length}` : ""
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setManage(true),
      className: "text-xs text-slate-600 px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
    },
    /* @__PURE__ */ React.createElement(Layers, { size: 14 }),
    " Manage stocks"
  ), user?.role === "admin" && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setGreet(true),
      title: "Broadcast to clients: festival card, your own image, or a message \u2014 download for WhatsApp or email to all",
      className: "text-xs text-amber-800 px-2.5 py-1.5 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 flex items-center gap-1.5"
    },
    /* @__PURE__ */ React.createElement(Share2, { size: 14 }),
    " Broadcast"
  ))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-2 mb-3" }, /* @__PURE__ */ React.createElement("div", { className: "relative flex-1 min-w-[200px] max-w-sm" }, /* @__PURE__ */ React.createElement(Search, { size: 15, className: "absolute left-3 top-2.5 text-slate-400" }), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: q,
      onChange: (e) => setQ(e.target.value),
      placeholder: "Search code, name or stock\u2026",
      className: "w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 mr-1" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setViewMode("holdings"), className: `text-xs px-2.5 py-1.5 rounded-md border ${!isClient && !isCash ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}` }, "By holding"), /* @__PURE__ */ React.createElement("button", { onClick: () => setViewMode("clients"), className: `text-xs px-2.5 py-1.5 rounded-md border ${isClient ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}` }, "By client"), hasCash && /* @__PURE__ */ React.createElement("button", { onClick: () => setViewMode("cash"), className: `text-xs px-2.5 py-1.5 rounded-md border ${isCash ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}` }, "Cash positions"), /* @__PURE__ */ React.createElement("button", { onClick: () => setViewMode("rebalance"), className: `text-xs px-2.5 py-1.5 rounded-md border ${isRebalance ? "bg-amber-50 border-amber-300 text-amber-800 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}` }, "Rebalance to target"), /* @__PURE__ */ React.createElement("button", { onClick: () => setViewMode("concentration"), className: `text-xs px-2.5 py-1.5 rounded-md border flex items-center gap-1.5 ${isConc ? "bg-rose-50 border-rose-300 text-rose-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}` }, "Concentration alerts", allBreaches.length > 0 && /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold" }, allBreaches.length))), !isCash && !isRebalance && !isConc && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 text-xs" }, /* @__PURE__ */ React.createElement("span", { className: "text-slate-400 mr-1" }, "Sort:"), !isClient && /* @__PURE__ */ React.createElement(SortChip, { active: sort.key === "stock", dir: sort.dir, onClick: () => toggleSort("stock") }, "Stock"), /* @__PURE__ */ React.createElement(SortChip, { active: sort.key === "name", dir: sort.dir, onClick: () => toggleSort("name") }, "Client"), /* @__PURE__ */ React.createElement(SortChip, { active: sort.key === "risk", dir: sort.dir, onClick: () => toggleSort("risk") }, "Category"), /* @__PURE__ */ React.createElement(SortChip, { active: sort.key === "pnlPct", dir: sort.dir, onClick: () => toggleSort("pnlPct") }, "P/L %")), /* @__PURE__ */ React.createElement("div", { className: "ml-auto flex items-center gap-2" }, refreshPrices && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: doRefresh,
      disabled: refreshing,
      title: "Pull current prices from Sheet1 of the linked Google Sheet",
      className: "text-xs px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50"
    },
    /* @__PURE__ */ React.createElement(RefreshCw, { size: 13, className: refreshing ? "animate-spin" : "" }),
    priceCount ? `Live prices${pricesWhen ? " \xB7 " + pricesWhen : ""}` : "Go live"
  ), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400" }, isConc ? `${breachRows.length} breach(es) shown` : isRebalance ? stockFilter === "All" ? "Pick a stock to rebalance" : `${rebalanceRows.length} clients considered` : isCash ? `${cashRows.length} rows \xB7 ${cashGroups ? cashGroups.withCash : 0} with cash` : isClient ? `${summary.clients} clients` : `${summary.holdings} holdings \xB7 ${summary.clients} clients`, " \xB7 as on ", today()))), isCash && cashGroups && /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3" }, /* @__PURE__ */ React.createElement(Stat, { label: "Total available cash", value: fmtINR(cashGroups.totalCash) }), /* @__PURE__ */ React.createElement(Stat, { label: "Clients holding cash", value: String(cashGroups.withCash) }), /* @__PURE__ */ React.createElement(Stat, { label: "Cash as % of total portfolio", value: `${fmtNum(cashGroups.pct)}%` })), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2" }, "Cash by account type"), /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, cashGroups.byType.map(([k, g]) => /* @__PURE__ */ React.createElement("tr", { key: k }, /* @__PURE__ */ React.createElement("td", { className: "py-1.5 pr-2 text-slate-700" }, k), /* @__PURE__ */ React.createElement("td", { className: "py-1.5 pr-2 text-right text-[12px] text-slate-400 tabular-nums" }, g.n, " client(s)"), /* @__PURE__ */ React.createElement("td", { className: "py-1.5 text-right font-medium tabular-nums" }, fmtINR(g.cash)), /* @__PURE__ */ React.createElement("td", { className: "py-1.5 pl-2 text-right text-[12px] text-slate-500 tabular-nums w-14" }, cashGroups.totalCash ? fmtNum(g.cash / cashGroups.totalCash * 100) : 0, "%")))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2" }, "Cash by risk category"), /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, cashGroups.byRisk.map(([k, g]) => /* @__PURE__ */ React.createElement("tr", { key: k }, /* @__PURE__ */ React.createElement("td", { className: "py-1.5 pr-2 text-slate-700" }, k), /* @__PURE__ */ React.createElement("td", { className: "py-1.5 pr-2 text-right text-[12px] text-slate-400 tabular-nums" }, g.n, " client(s)"), /* @__PURE__ */ React.createElement("td", { className: "py-1.5 text-right font-medium tabular-nums" }, fmtINR(g.cash)), /* @__PURE__ */ React.createElement("td", { className: "py-1.5 pl-2 text-right text-[12px] text-slate-500 tabular-nums w-14" }, cashGroups.totalCash ? fmtNum(g.cash / cashGroups.totalCash * 100) : 0, "%")))))))), isRebalance && /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-amber-200 rounded-xl p-4 mb-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-end gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500 block" }, "Stock to rebalance"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: stockFilter,
      onChange: (e) => setStockFilter(e.target.value),
      className: "mt-1 px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white min-w-[180px]"
    },
    /* @__PURE__ */ React.createElement("option", { value: "All" }, "\u2014 pick a stock \u2014"),
    stockOptions.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }, s))
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500 block" }, "Target weight"), /* @__PURE__ */ React.createElement("div", { className: "mt-1 flex items-center gap-1" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      value: rebalanceTarget,
      min: "0",
      max: "100",
      step: "0.5",
      onChange: (e) => setRebalanceTarget(e.target.value),
      className: "px-3 py-2 text-sm border border-slate-300 rounded-lg w-24"
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "text-sm text-slate-600" }, "% of total assets (holdings + cash)"))), /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-2 text-[12px] text-slate-600 self-end pb-2" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: capRebalanceAtCash, onChange: (e) => setCapRebalanceAtCash(e.target.checked) }), "Size each buy to available cash"), stockFilter !== "All" && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-500" }, "LTP for ", /* @__PURE__ */ React.createElement("b", null, stockFilter), ": ", (db.prices || {})[stockFilter] ? /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, "\u20B9", fmtNum((db.prices || {})[stockFilter])) : /* @__PURE__ */ React.createElement("span", { className: "text-rose-600" }, "not in Sheet1 \u2014 shares to buy cannot be computed"))), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-500 mt-3 leading-relaxed" }, "For each client, this shows the number of shares of ", /* @__PURE__ */ React.createElement("b", null, stockFilter !== "All" ? stockFilter : "the selected stock"), " to ", /* @__PURE__ */ React.createElement("b", null, "buy"), " (or trim) to bring the holding to ", /* @__PURE__ */ React.createElement("b", null, num(rebalanceTarget) || 0, "%"), " of that client's total assets. It only counts whole shares (cash market, no fractional). ", capRebalanceAtCash ? /* @__PURE__ */ React.createElement(React.Fragment, null, "Each buy is automatically ", /* @__PURE__ */ React.createElement("b", null, "sized to the client's available cash"), ' \u2014 a buy is never larger than the cash in the account (rows sized this way are tagged "cash").') : /* @__PURE__ */ React.createElement(React.Fragment, null, "A row is flagged in amber when the buy cost exceeds the client's available cash."), " Existing filters (risk category, account type, search) apply.")), stockFilter !== "All" && rebalanceTotals && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3" }, /* @__PURE__ */ React.createElement(Stat, { label: `Clients to buy ${stockFilter}`, value: String(rebalanceTotals.clientsToBuy), tone: "pos" }), /* @__PURE__ */ React.createElement(Stat, { label: "Total shares to buy", value: fmtNum(rebalanceTotals.sharesToBuy) }), /* @__PURE__ */ React.createElement(Stat, { label: "Total buy cost", value: fmtINR(rebalanceTotals.totalCost) }), /* @__PURE__ */ React.createElement(Stat, { label: "Cash available in scope", value: fmtINR(rebalanceTotals.cashAvail) }), /* @__PURE__ */ React.createElement(Stat, { label: "Clients to trim", value: String(rebalanceTotals.clientsToTrim), tone: rebalanceTotals.clientsToTrim ? "neg" : void 0 }), /* @__PURE__ */ React.createElement(Stat, { label: "On target / no action", value: String(rebalanceTotals.clientsOnTarget) })), stockFilter !== "All" && rebalanceTotals && capRebalanceAtCash && rebalanceTotals.capped > 0 && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-1.5" }, /* @__PURE__ */ React.createElement(Check, { size: 13, className: "mt-0.5 shrink-0" }), /* @__PURE__ */ React.createElement("span", null, "For ", /* @__PURE__ */ React.createElement("b", null, rebalanceTotals.capped), " client(s) the buy has been ", /* @__PURE__ */ React.createElement("b", null, "sized down to their available cash"), ` (they couldn't fund the full target). Untick "Size each buy to available cash" to see the full target instead.`)), stockFilter !== "All" && rebalanceTotals && !capRebalanceAtCash && rebalanceTotals.insufficient > 0 && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 flex items-start gap-1.5" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 13, className: "mt-0.5 shrink-0" }), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("b", null, rebalanceTotals.insufficient), ` client(s) don't have enough cash to make the full buy. Those rows are marked in amber below \u2014 tick "Size each buy to available cash" to cap them automatically, or top up the account first.`))), isConc && /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3" }, /* @__PURE__ */ React.createElement(Stat, { label: "Breaches (whole book)", value: String(allBreaches.length), tone: allBreaches.length ? "neg" : "pos" }), /* @__PURE__ */ React.createElement(Stat, { label: "Clients affected", value: String(new Set(allBreaches.map((b) => b.code)).size) }), /* @__PURE__ */ React.createElement(Stat, { label: "Stocks involved", value: String(new Set(allBreaches.map((b) => b.stock)).size) }), /* @__PURE__ */ React.createElement(Stat, { label: "Total excess value", value: fmtINR(allBreaches.reduce((t, b) => t + b.excessValue, 0)) }), /* @__PURE__ */ React.createElement(Stat, { label: "Default limit", value: `${fmtNum(concLimitFor(db, ""))}%` })), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-500" }, "Weight is the stock's market value as a share of the client's ", /* @__PURE__ */ React.createElement("b", null, "total assets (holdings + cash)"), " \u2014 the same basis as the Rebalance view. Limits are per risk category and can be changed in ", /* @__PURE__ */ React.createElement("b", null, "Settings \u2192 Concentration limits"), ". ", /* @__PURE__ */ React.createElement("b", null, "Trim shares"), " is the number to sell to bring the holding back within its limit.")), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, isConc ? /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide" }, /* @__PURE__ */ React.createElement(Th, null, "Code"), /* @__PURE__ */ React.createElement(Th, null, "Client"), /* @__PURE__ */ React.createElement(Th, null, "Risk"), /* @__PURE__ */ React.createElement(Th, null, "Type"), /* @__PURE__ */ React.createElement(Th, null, "Stock"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Qty"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Value"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Total assets"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Weight"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Limit"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Over by"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Excess value"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Trim shares"), /* @__PURE__ */ React.createElement(Th, null, "Action"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, breachRows.map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: r.code + "__" + r.stock + "__" + i, className: "hover:bg-slate-50/70 bg-rose-50/40" }, /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 font-mono text-[12px] text-slate-600" }, r.code), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-slate-800" }, r.name), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-[12px] text-slate-600" }, r.risk), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-[12px] text-slate-600" }, r.status), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 font-medium text-slate-800" }, r.stock), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-600" }, fmtNum(r.quantity)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-700" }, fmtINR(r.current)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-500" }, fmtINR(r.total)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums font-semibold text-rose-700" }, fmtNum(r.weight), "%"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-500" }, fmtNum(r.limit), "%"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums font-medium text-rose-600" }, "+", fmtNum(r.over), "%"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-rose-700" }, fmtINR(r.excessValue)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums font-semibold text-rose-700" }, r.trimShares ? fmtNum(r.trimShares) : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center" }, /* @__PURE__ */ React.createElement(
    IconBtn,
    {
      title: `Message ${r.name} about trimming ${fmtNum(r.trimShares)} share(s) of ${r.stock}`,
      onClick: () => openConcMessage(r)
    },
    /* @__PURE__ */ React.createElement(MessageCircle, { size: 15 })
  ))))), !breachRows.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 14, className: "px-3 py-10 text-center text-slate-500 text-sm" }, allBreaches.length === 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, "No single-stock concentration breaches. Every holding is within its risk-category limit (default ", fmtNum(concLimitFor(db, "")), "% of total assets). Limits are set in ", /* @__PURE__ */ React.createElement("b", null, "Settings \u2192 Concentration limits"), ".") : /* @__PURE__ */ React.createElement(React.Fragment, null, "No breaches match the current filter \u2014 clear the filters to see all ", allBreaches.length, "."))))) : isRebalance ? stockFilter === "All" ? /* @__PURE__ */ React.createElement("div", { className: "px-3 py-10 text-center text-slate-500 text-sm" }, "Pick a stock above to see the rebalance plan. If you don't see the stock you want in the dropdown, at least one client must hold it first (or you can add it via ", /* @__PURE__ */ React.createElement("b", null, "Upload Data"), ").") : /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide" }, /* @__PURE__ */ React.createElement(Th, null, "Code"), /* @__PURE__ */ React.createElement(Th, null, "Client"), /* @__PURE__ */ React.createElement(Th, null, "Risk"), /* @__PURE__ */ React.createElement(Th, null, "Type"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Total assets"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Cash"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Current qty"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Current value"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Current %"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Target value"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Gap"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Shares to buy"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Buy cost"), /* @__PURE__ */ React.createElement(Th, null, "Action"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, rebalanceRows.map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: r.code + "__" + i, className: `hover:bg-slate-50/70 ${r.insufficientCash ? "bg-amber-50/60" : ""}` }, /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 font-mono text-[12px] text-slate-600" }, r.code), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-slate-800" }, r.name), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-[12px] text-slate-600" }, r.risk), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-[12px] text-slate-600" }, r.status), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-700" }, fmtINR(r.total)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-600" }, fmtINR(r.cash)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-600" }, r.currentQty ? fmtNum(r.currentQty) : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-600" }, fmtINR(r.currentValue)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-500" }, fmtNum(r.currentPct), "%"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-700" }, fmtINR(r.target)), /* @__PURE__ */ React.createElement("td", { className: `px-2 py-2 text-right tabular-nums font-medium ${r.gap > 0 ? "text-emerald-700" : r.gap < 0 ? "text-rose-600" : "text-slate-400"}` }, r.gap > 0 ? "+" : "", fmtINR(r.gap)), /* @__PURE__ */ React.createElement("td", { className: `px-2 py-2 text-right tabular-nums font-semibold ${r.shares > 0 ? "text-emerald-700" : r.shares < 0 ? "text-rose-600" : "text-slate-400"}` }, r.shares > 0 ? `+${fmtNum(r.shares)}` : r.shares < 0 ? `${fmtNum(r.shares)}` : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: `px-2 py-2 text-right tabular-nums ${r.insufficientCash ? "text-amber-800 font-medium" : "text-slate-600"}` }, r.shares > 0 ? fmtINR(r.cost) : "\u2014", r.capped && /* @__PURE__ */ React.createElement("span", { className: "ml-1 text-[10px] text-emerald-600", title: "Sized to available cash" }, "cash")), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center" }, /* @__PURE__ */ React.createElement(
    IconBtn,
    {
      title: r.shares === 0 ? `${r.name} is already on target \u2014 nothing to advise` : `Message ${r.name} about ${stockFilter}: ${r.shares > 0 ? "buy" : "trim"} ${fmtNum(Math.abs(r.shares))} share(s)`,
      onClick: () => openRebalanceMessage(r)
    },
    /* @__PURE__ */ React.createElement(MessageCircle, { size: 15 })
  ))))), !rebalanceRows.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 14, className: "px-3 py-10 text-center text-slate-400 text-sm" }, "No clients match the current filter.")))) : isCash ? /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide" }, /* @__PURE__ */ React.createElement(Th, null, "Code"), /* @__PURE__ */ React.createElement(Th, null, "Client"), /* @__PURE__ */ React.createElement(Th, null, "Risk category"), /* @__PURE__ */ React.createElement(Th, null, "Account type"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Holdings value"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Available cash"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Total"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Cash %"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, cashRows.map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: r.code + "__" + i, className: `hover:bg-slate-50/70 ${!r.matched ? "bg-amber-50/50" : ""}` }, /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 font-mono text-[12px] text-slate-600" }, r.code), /* @__PURE__ */ React.createElement("td", { className: `px-2 py-2 ${r.matched ? "text-slate-800" : "text-amber-700 text-[12px]"}` }, r.name), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-[12px] text-slate-600" }, r.risk), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-[12px] text-slate-600" }, r.status), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-500" }, fmtINR(r.value)), /* @__PURE__ */ React.createElement("td", { className: `px-2 py-2 text-right tabular-nums font-semibold ${r.cash > 0 ? "text-emerald-700" : "text-slate-400"}` }, fmtINR(r.cash)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-700" }, fmtINR(r.total)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-600" }, fmtNum(r.cashPct), "%"))), !cashRows.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 8, className: "px-3 py-10 text-center text-slate-400 text-sm" }, "No cash data for this filter. Cash comes from the ", /* @__PURE__ */ React.createElement("b", null, "Cash"), " tab of your linked Google Sheet (name, amount, code, account type).")))) : !isClient ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "vp-only-mobile" }, /* @__PURE__ */ React.createElement("div", { className: "divide-y divide-slate-100" }, rows.map((r) => {
    const breach = breachSet.has(r.code + "|" + String(r.stock).toUpperCase());
    return /* @__PURE__ */ React.createElement("div", { key: r.code + "__m__" + r.stock, className: "px-3 py-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0" }, /* @__PURE__ */ React.createElement("div", { className: "font-semibold text-slate-800" }, r.stock), /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-600 truncate" }, r.name || /* @__PURE__ */ React.createElement("span", { className: "text-rose-500" }, "\u2014 set name \u2014")), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, r.code, " \xB7 ", r.risk || "\u2014", hasStatus && r.status ? ` \xB7 ${r.status}` : "")), /* @__PURE__ */ React.createElement("div", { className: "text-right shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: `text-base font-semibold tabular-nums ${!r.priced ? "text-slate-400" : r.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}` }, r.priced ? fmtINR(r.pnl) : "\u2014"), /* @__PURE__ */ React.createElement("div", { className: `text-[12px] tabular-nums ${!r.priced ? "text-slate-400" : r.pnlPct >= 0 ? "text-emerald-600" : "text-rose-600"}` }, r.priced ? `${fmtNum(r.pnlPct)}%` : ""))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 gap-y-1 mt-2 text-[12px]" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "Qty "), /* @__PURE__ */ React.createElement("span", { className: "tabular-nums text-slate-700" }, fmtNum(r.quantity))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "Buy "), /* @__PURE__ */ React.createElement("span", { className: "tabular-nums text-slate-700" }, fmtINR(r.purchasePrice))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "LTP "), r.priced ? /* @__PURE__ */ React.createElement("span", { className: "tabular-nums text-slate-700" }, fmtINR(r.currentPrice)) : /* @__PURE__ */ React.createElement("span", { className: "text-amber-600" }, "no price")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "Inv "), /* @__PURE__ */ React.createElement("span", { className: "tabular-nums text-slate-700" }, fmtINR(r.invested))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "Val "), /* @__PURE__ */ React.createElement("span", { className: "tabular-nums text-slate-700" }, r.priced ? fmtINR(r.current) : "\u2014")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "Wt "), /* @__PURE__ */ React.createElement("span", { className: `tabular-nums ${breach ? "text-rose-700 font-semibold" : "text-slate-700"}` }, r.priced ? `${fmtNum(r.weight)}%` : "\u2014"), breach && /* @__PURE__ */ React.createElement(AlertTriangle, { size: 11, className: "inline mb-0.5 ml-0.5 text-rose-600" })), /* @__PURE__ */ React.createElement("div", { className: "col-span-3" }, /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "Cash "), /* @__PURE__ */ React.createElement("span", { className: "tabular-nums text-slate-700" }, fmtINR(r.cash)))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 mt-2" }, /* @__PURE__ */ React.createElement(IconBtn, { title: `Past trades in ${r.stock} for ${r.name || r.code}`, onClick: () => setTradeHist({ code: r.code, name: r.name, symbol: r.stock }) }, /* @__PURE__ */ React.createElement(Calendar, { size: 16 })), /* @__PURE__ */ React.createElement(IconBtn, { title: `Open ${r.name || r.code}'s page`, onClick: () => setClientPage(r.code) }, /* @__PURE__ */ React.createElement(Eye, { size: 16 })), /* @__PURE__ */ React.createElement(IconBtn, { title: `Message ${r.name || r.code} about ${r.stock}`, onClick: () => setNoteRow(r) }, /* @__PURE__ */ React.createElement(MessageCircle, { size: 16 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Share portfolio statement", onClick: () => setStatement(db.clients[r.code]) }, /* @__PURE__ */ React.createElement(FileText, { size: 16 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Send portfolio on WhatsApp", tone: "wa", onClick: () => openWA(r) }, /* @__PURE__ */ React.createElement(Send, { size: 16 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Email portfolio", tone: "mail", onClick: () => openEmail(r) }, /* @__PURE__ */ React.createElement(Mail, { size: 16 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Edit client / invested", onClick: () => setEdit(r) }, /* @__PURE__ */ React.createElement(Edit3, { size: 16 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Delete this holding", tone: "danger", onClick: () => setDel(r) }, /* @__PURE__ */ React.createElement(Trash2, { size: 16 }))));
  }), !rows.length && /* @__PURE__ */ React.createElement("div", { className: "px-3 py-10 text-center text-slate-400 text-sm" }, "No holdings match the current filter."))), /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm vp-only-desk" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide" }, /* @__PURE__ */ React.createElement(SortTh, { k: "stock" }, "Stock"), /* @__PURE__ */ React.createElement(SortTh, { k: "code" }, "Code"), /* @__PURE__ */ React.createElement(SortTh, { k: "name" }, "Client"), /* @__PURE__ */ React.createElement(SortTh, { k: "risk" }, "Risk"), hasStatus && /* @__PURE__ */ React.createElement(SortTh, { k: "status" }, "Type"), /* @__PURE__ */ React.createElement(SortTh, { k: "quantity", right: true }, "Qty"), /* @__PURE__ */ React.createElement(SortTh, { k: "purchasePrice", right: true }, "Buy"), /* @__PURE__ */ React.createElement(SortTh, { k: "currentPrice", right: true }, "LTP"), /* @__PURE__ */ React.createElement(SortTh, { k: "invested", right: true }, "Invested"), /* @__PURE__ */ React.createElement(SortTh, { k: "current", right: true }, "Value"), /* @__PURE__ */ React.createElement(SortTh, { k: "cash", right: true }, "Cash"), /* @__PURE__ */ React.createElement(SortTh, { k: "weight", right: true }, "Wt%"), /* @__PURE__ */ React.createElement(SortTh, { k: "pnl", right: true }, "P/L"), /* @__PURE__ */ React.createElement(SortTh, { k: "pnlPct", right: true }, "P/L %"), /* @__PURE__ */ React.createElement(Th, { center: true }, "Actions"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, rows.map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.code + "__" + r.stock, className: "hover:bg-slate-50/70" }, /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 font-medium text-slate-800" }, r.stock), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 font-mono text-[12px] text-slate-600" }, r.code), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2" }, r.name ? /* @__PURE__ */ React.createElement("span", { className: "text-slate-800" }, r.name) : /* @__PURE__ */ React.createElement("span", { className: "text-rose-500 text-xs", title: r.descriptor }, "\u2014 set name \u2014"), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, waDisplay(r.whatsapp) || "no number")), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-[12px] text-slate-600" }, r.risk || "\u2014"), hasStatus && /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-[12px] text-slate-600" }, r.status || "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums" }, fmtNum(r.quantity)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums" }, fmtINR(r.purchasePrice)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums" }, r.priced ? /* @__PURE__ */ React.createElement(React.Fragment, null, fmtINR(r.currentPrice), r.live && /* @__PURE__ */ React.createElement("span", { title: "Live from Sheet1", className: "ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 align-middle" })) : /* @__PURE__ */ React.createElement("span", { className: "text-amber-600 text-xs", title: "No live price for this stock \u2014 add it to Sheet1. Value shown at cost; P/L not computed." }, "no price")), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-500" }, fmtINR(r.invested), r.investedManual && /* @__PURE__ */ React.createElement("span", { title: "Invested set manually", className: "ml-1 text-[10px] text-amber-600" }, "\u270E")), /* @__PURE__ */ React.createElement("td", { className: `px-2 py-2 text-right tabular-nums ${r.priced ? "" : "text-slate-400"}` }, r.priced ? fmtINR(r.current) : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-600" }, fmtINR(r.cash)), /* @__PURE__ */ React.createElement("td", { className: `px-2 py-2 text-right tabular-nums ${breachSet.has(r.code + "|" + String(r.stock).toUpperCase()) ? "text-rose-700 font-semibold" : "text-slate-600"}` }, breachSet.has(r.code + "|" + String(r.stock).toUpperCase()) && /* @__PURE__ */ React.createElement(AlertTriangle, { size: 12, className: "inline mb-0.5 mr-1" }), r.priced ? `${fmtNum(r.weight)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: `px-2 py-2 text-right tabular-nums ${!r.priced ? "text-slate-400" : r.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}` }, r.priced ? fmtINR(r.pnl) : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: `px-2 py-2 text-right tabular-nums ${!r.priced ? "text-slate-400" : r.pnlPct >= 0 ? "text-emerald-600" : "text-rose-600"}` }, r.priced ? `${fmtNum(r.pnlPct)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center gap-1" }, /* @__PURE__ */ React.createElement(IconBtn, { title: `Past trades in ${r.stock} for ${r.name || r.code}`, onClick: () => setTradeHist({ code: r.code, name: r.name, symbol: r.stock }) }, /* @__PURE__ */ React.createElement(Calendar, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: `Open ${r.name || r.code}'s page`, onClick: () => setClientPage(r.code) }, /* @__PURE__ */ React.createElement(Eye, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: `Message ${r.name || r.code} about ${r.stock} (text / image / HTML)`, onClick: () => setNoteRow(r) }, /* @__PURE__ */ React.createElement(MessageCircle, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Share portfolio statement (image / HTML)", onClick: () => setStatement(db.clients[r.code]) }, /* @__PURE__ */ React.createElement(FileText, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Send portfolio on WhatsApp", tone: "wa", onClick: () => openWA(r) }, /* @__PURE__ */ React.createElement(Send, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Email portfolio", tone: "mail", onClick: () => openEmail(r) }, /* @__PURE__ */ React.createElement(Mail, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Edit client / invested", onClick: () => setEdit(r) }, /* @__PURE__ */ React.createElement(Edit3, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Delete this holding", tone: "danger", onClick: () => setDel(r) }, /* @__PURE__ */ React.createElement(Trash2, { size: 15 })))))), !rows.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 15, className: "px-3 py-10 text-center text-slate-400 text-sm" }, (db.sheetUrl || "").trim() ? /* @__PURE__ */ React.createElement(React.Fragment, null, "No holdings on this device yet. Your Google Sheet is the master copy \u2014 it should load automatically within a few seconds of signing in. If it doesn't, go to ", /* @__PURE__ */ React.createElement("b", null, "Settings \u2192 Google Sheet backup \u2192 Pull from sheet now"), ", and tick ", /* @__PURE__ */ React.createElement("b", null, "Team sync"), " so it loads every time.") : /* @__PURE__ */ React.createElement(React.Fragment, null, "No holdings yet. Connect your office Google Sheet in ", /* @__PURE__ */ React.createElement("b", null, "Settings"), ", or go to ", /* @__PURE__ */ React.createElement("b", null, "Upload Data"), " \u2192 ", /* @__PURE__ */ React.createElement("b", null, "Combined holdings (GridKey)"), " to import a file.")))))) : /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide" }, /* @__PURE__ */ React.createElement(SortTh, { k: "code" }, "Code"), /* @__PURE__ */ React.createElement(SortTh, { k: "name" }, "Client"), /* @__PURE__ */ React.createElement(SortTh, { k: "risk" }, "Risk"), hasStatus && /* @__PURE__ */ React.createElement(SortTh, { k: "status" }, "Type"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Stocks"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Invested"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Holdings"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Cash"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Total"), /* @__PURE__ */ React.createElement(Th, { right: true }, "P/L"), /* @__PURE__ */ React.createElement(Th, { right: true }, "P/L %"), /* @__PURE__ */ React.createElement(Th, { center: true }, "Actions"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, clientRows2.map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.code, className: "hover:bg-slate-50/70" }, /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 font-mono text-[12px] text-slate-600" }, r.code), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2" }, r.name ? /* @__PURE__ */ React.createElement("button", { onClick: () => setClientPage(r.code), className: "text-slate-800 hover:underline text-left", title: "Open this client's page" }, r.name) : /* @__PURE__ */ React.createElement("button", { onClick: () => setClientPage(r.code), className: "text-rose-500 text-xs hover:underline", title: r.descriptor }, "\u2014 set name \u2014"), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, waDisplay(r.whatsapp) || "no number")), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-[12px] text-slate-600" }, r.risk || "\u2014"), hasStatus && /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-[12px] text-slate-600" }, r.status || "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-600" }, r.stocks), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-500" }, fmtINR(r.invested)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums" }, fmtINR(r.value)), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums text-slate-700" }, r.cash ? fmtINR(r.cash) : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2 text-right tabular-nums font-semibold text-slate-900" }, fmtINR(r.total)), /* @__PURE__ */ React.createElement("td", { className: `px-2 py-2 text-right tabular-nums ${r.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}` }, fmtINR(r.pnl)), /* @__PURE__ */ React.createElement("td", { className: `px-2 py-2 text-right tabular-nums ${r.pnlPct >= 0 ? "text-emerald-600" : "text-rose-600"}` }, fmtNum(r.pnlPct), "%"), /* @__PURE__ */ React.createElement("td", { className: "px-2 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center gap-1" }, /* @__PURE__ */ React.createElement(IconBtn, { title: "Share portfolio statement (image / HTML)", onClick: () => setStatement(db.clients[r.code]) }, /* @__PURE__ */ React.createElement(FileText, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Send portfolio on WhatsApp", tone: "wa", onClick: () => openWA(r) }, /* @__PURE__ */ React.createElement(Send, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Email portfolio", tone: "mail", onClick: () => openEmail(r) }, /* @__PURE__ */ React.createElement(Mail, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Remove this client and all their holdings", tone: "danger", onClick: () => setDelClient(r) }, /* @__PURE__ */ React.createElement(Trash2, { size: 15 })))))), !clientRows2.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 12, className: "px-3 py-10 text-center text-slate-400 text-sm" }, "No clients to show for this filter.")))))), statement && /* @__PURE__ */ React.createElement(StatementModal, { data: buildStatement(statement), client: statement, onClose: () => setStatement(null), showToast }), tradeHist && /* @__PURE__ */ React.createElement(TradeHistoryModal, { db, code: tradeHist.code, name: tradeHist.name, symbol: tradeHist.symbol, onClose: () => setTradeHist(null) }), greet && /* @__PURE__ */ React.createElement(GreetingModal, { db, onClose: () => setGreet(false), showToast }), noteRow && /* @__PURE__ */ React.createElement(StockNoteModal, { db, row: noteRow, content: stockMsg, setContent: setStockMsg, onClose: () => setNoteRow(null), showToast }), edit && /* @__PURE__ */ React.createElement(EditModal, { row: edit, onClose: () => setEdit(null), onSave: saveEdit }), preview && /* @__PURE__ */ React.createElement(
    PreviewModal,
    {
      db,
      client: preview,
      onClose: () => setPreview(null),
      onSend: () => {
        openWA({ code: preview.code });
        setPreview(null);
      },
      onEmail: () => {
        openEmail({ code: preview.code });
        setPreview(null);
      }
    }
  ), del && /* @__PURE__ */ React.createElement(
    ConfirmModal,
    {
      title: "Delete holding?",
      body: `Remove ${del.stock} for ${del.name || del.code}? You can undo this immediately.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: doDelete,
      onClose: () => setDel(null)
    }
  ), delClient && /* @__PURE__ */ React.createElement(
    ConfirmModal,
    {
      title: "Remove this client?",
      body: `Remove ${delClient.name || delClient.code}${delClient.code ? ` (${delClient.code})` : ""} and all ${Object.keys(db.clients[delClient.code] && db.clients[delClient.code].holdings || {}).length} of their holding(s) from the report? This affects only the portfolio report \u2014 their past trades in the Performance tab are kept. You can undo immediately.`,
      confirmLabel: "Remove client",
      tone: "danger",
      onConfirm: deleteClientAll,
      onClose: () => setDelClient(null)
    }
  ), manage && /* @__PURE__ */ React.createElement(Modal, { onClose: () => setManage(false), title: "Manage stocks" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-3" }, "Delete a stock to remove it from ", /* @__PURE__ */ React.createElement("b", null, "every"), " client's portfolio at once. You can undo immediately afterwards."), /* @__PURE__ */ React.createElement("div", { className: "max-h-80 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100" }, stockSummary.map((s) => /* @__PURE__ */ React.createElement("div", { key: s.symbol, className: "flex items-center gap-3 px-3 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("div", { className: "font-medium text-slate-800 text-sm" }, s.symbol), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, s.clients, " client(s) \xB7 invested ", fmtINR(s.invested))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setDelStock(s),
      className: "text-xs text-rose-600 border border-rose-200 hover:bg-rose-50 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0"
    },
    /* @__PURE__ */ React.createElement(Trash2, { size: 14 }),
    " Delete"
  ))), !stockSummary.length && /* @__PURE__ */ React.createElement("div", { className: "px-3 py-6 text-center text-slate-400 text-sm" }, "No stocks loaded."))), delStock && /* @__PURE__ */ React.createElement(
    ConfirmModal,
    {
      title: `Delete ${delStock.symbol}?`,
      body: `Remove ${delStock.symbol} from all ${delStock.clients} client portfolio(s)? This deletes ${delStock.clients} holding(s). You can undo immediately.`,
      confirmLabel: "Delete stock",
      tone: "danger",
      onConfirm: () => deleteStock(delStock.symbol),
      onClose: () => setDelStock(null)
    }
  ));
}
function EditModal({ row, onClose, onSave }) {
  const [name, setName] = useState(row.name || "");
  const [email, setEmail] = useState(row.email || "");
  const [whatsapp, setWhatsapp] = useState(waDisplay(row.whatsapp) || "");
  const [risk, setRisk] = useState(row.risk || "");
  const [invManual, setInvManual] = useState(!!row.investedManual);
  const [invested, setInvested] = useState(String(row.invested ?? ""));
  const save = () => onSave({
    name: name.trim(),
    email: email.trim(),
    whatsapp: whatsapp.trim(),
    risk,
    investedManual: invManual,
    invested: invManual ? num(invested) : null
  });
  return /* @__PURE__ */ React.createElement(Modal, { onClose, title: `Edit \xB7 ${row.code} \xB7 ${row.stock}` }, /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mb-2" }, "Name, email, number and risk category apply to the whole client. Invested capital applies to this stock."), /* @__PURE__ */ React.createElement("label", { className: "text-xs text-slate-500" }, "Client name"), /* @__PURE__ */ React.createElement("input", { autoFocus: true, value: name, onChange: (e) => setName(e.target.value), className: "w-full mt-1 mb-3 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" }), /* @__PURE__ */ React.createElement("label", { className: "text-xs text-slate-500" }, "Email"), /* @__PURE__ */ React.createElement("input", { value: email, onChange: (e) => setEmail(e.target.value), className: "w-full mt-1 mb-3 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" }), /* @__PURE__ */ React.createElement("label", { className: "text-xs text-slate-500" }, "WhatsApp number"), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: whatsapp,
      onChange: (e) => setWhatsapp(e.target.value),
      placeholder: "+91 9876543210",
      className: "w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    }
  ), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mt-1" }, whatsapp && waNumber(whatsapp) && /* @__PURE__ */ React.createElement(React.Fragment, null, "Will dial: ", /* @__PURE__ */ React.createElement("b", null, "+", waNumber(whatsapp)))), /* @__PURE__ */ React.createElement("label", { className: "text-xs text-slate-500 mt-3 block" }, "Risk category"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: risk,
      onChange: (e) => setRisk(e.target.value),
      className: "w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014"),
    RISK_CATEGORIES.map((c) => /* @__PURE__ */ React.createElement("option", { key: c, value: c }, c))
  ), /* @__PURE__ */ React.createElement("div", { className: "mt-4 pt-3 border-t border-slate-100" }, /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-2 text-sm text-slate-700" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: invManual, onChange: (e) => setInvManual(e.target.checked) }), " Set invested capital manually (for ", row.stock, ")"), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: invested,
      onChange: (e) => setInvested(e.target.value),
      disabled: !invManual,
      inputMode: "decimal",
      placeholder: "Invested capital (\u20B9)",
      className: "w-full mt-2 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
    }
  ), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mt-1" }, invManual ? "A manual figure stays fixed through future uploads, so P/L reflects the real cost." : "Currently following the uploaded sheet. Tick to override.")), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 mt-5" }, /* @__PURE__ */ React.createElement("button", { onClick: save, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex-1" }, "Save"), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "text-slate-500 text-sm px-4 py-2 rounded-lg hover:bg-slate-100" }, "Cancel")));
}
function GreetingModal({ db, onClose, showToast }) {
  const [mode, setMode] = useState("card");
  const [occId, setOccId] = useState("independence");
  const occ = OCCASIONS.find((o) => o.id === occId) || OCCASIONS[0];
  const [title, setTitle] = useState(occ.title);
  const [message, setMessage] = useState(occ.msg);
  const [subject, setSubject] = useState(occ.title + " from Vasupradah Investment Advisory");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const cardRef = useRef();
  const [ownImg, setOwnImg] = useState("");
  const [ownName, setOwnName] = useState("");
  const imgRef = useRef();
  const pickOcc = (o) => {
    setOccId(o.id);
    setTitle(o.title);
    setMessage(o.msg);
    setSubject(o.title + " from Vasupradah Investment Advisory");
  };
  const recipients = useMemo(() => {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const c of Object.values(db.clients || {})) {
      const em = String(c.email || "").trim().toLowerCase();
      if (em && em.includes("@") && !seen.has(em)) {
        seen.add(em);
        out.push({ email: em, name: String(c.name || "").trim() });
      }
    }
    return out;
  }, [db.clients]);
  const personalize = /\{name\}/.test(subject) || /\{name\}/.test(message);
  const insertName = () => {
    setMessage((m) => {
      if (/\{name\}/.test(m)) return m;
      if (/dear\s+client/i.test(m)) return m.replace(/dear\s+client/i, "Dear {name}");
      return "Dear {name},\n\n" + (m || "");
    });
  };
  const onImgFile = (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type || "")) {
      showToast("Please choose an image file (PNG or JPG).", "err");
      return;
    }
    if (file.size > 8 * 1024 * 1024) showToast("That image is over 8 MB \u2014 a smaller one emails and loads faster, but it will still work.", "err");
    const r = new FileReader();
    r.onload = () => {
      setOwnImg(String(r.result || ""));
      setOwnName(file.name);
    };
    r.onerror = () => showToast("Couldn't read that image.", "err");
    r.readAsDataURL(file);
  };
  const makeCardCanvas = async () => {
    const h2c = window.html2canvas;
    if (!h2c) {
      showToast("Image tool not available here.", "err");
      return null;
    }
    const node = cardRef.current;
    if (!node) return null;
    return await h2c(node, { backgroundColor: null, scale: 2.6, useCORS: true, logging: false });
  };
  const dl = (url, name) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const currentImage = async () => {
    if (mode === "own") return ownImg || "";
    const c = await makeCardCanvas();
    return c ? c.toDataURL("image/jpeg", 0.9) : "";
  };
  const download = async () => {
    setBusy(true);
    try {
      if (mode === "own") {
        if (!ownImg) {
          showToast("Upload an image first (or use Copy message for a text broadcast).", "err");
          return;
        }
        dl(ownImg, ownName || "vasupradah-image.jpg");
        showToast("Image saved to downloads \u2014 send it on your WhatsApp broadcast list.");
      } else {
        const c = await makeCardCanvas();
        if (c) {
          dl(c.toDataURL("image/jpeg", 0.92), "vasupradah-" + occ.id + ".jpg");
          showToast("Image saved to downloads \u2014 send it on your WhatsApp broadcast, or attach to email.");
        }
      }
    } catch (e) {
      showToast("Couldn't prepare the image.", "err");
    } finally {
      setBusy(false);
    }
  };
  const copyMsg = () => {
    let t = (message || "").trim();
    if (!t) {
      showToast("Type a message first.", "err");
      return;
    }
    const hadName = /\{name\}/.test(t);
    if (hadName) t = t.split("{name}").join("Investor");
    copyText(t).then(() => showToast(hadName ? "Message copied. WhatsApp broadcasts can't personalise names, so {name} was set to \u201CInvestor\u201D." : "Message copied \u2014 paste it into your WhatsApp broadcast, or use it as the image caption.")).catch(() => showToast("Copy failed \u2014 select the text and copy it manually.", "err"));
  };
  const emailAll = async () => {
    if (!recipients.length) {
      showToast("No client email addresses found. Import client emails first (Upload Data \u2192 Client master).", "err");
      return;
    }
    if (!(db.sheetUrl || "").trim()) {
      showToast("Connect your Google Sheet in Settings first \u2014 the email is sent through your Apps Script.", "err");
      return;
    }
    if (mode === "own" && !ownImg && !(message || "").trim()) {
      showToast("Add an image or a message to send.", "err");
      return;
    }
    setSending(true);
    try {
      const img = await currentImage();
      const startedAt = Date.now();
      await fetch(db.sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: db.sheetToken || "",
          type: "greeting_email",
          image: img,
          subject: subject || "A message from Vasupradah Investment Advisory",
          bodyText: message,
          recipients,
          personalize,
          fromName: db.advisorName || "Vasupradah Investment Advisory"
        })
      });
      let result = null;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 1800));
        try {
          const rs = await fetch(withToken(db.sheetUrl) + "&greeting_status=1");
          const d = await rs.json();
          if (d && d.result && d.at && d.at >= startedAt) {
            result = d.result;
            break;
          }
        } catch (e) {
        }
      }
      if (result && /^error/i.test(result)) showToast(result.replace(/^error:\s*/i, ""), "err");
      else showToast(result || `${personalize ? "Personalising and emailing" : "Emailing"} to ${recipients.length} client(s). On a personal Gmail, only ~100/day go out.`);
    } catch (e) {
      showToast("Couldn't reach the email endpoint. Check the sheet is connected and re-deployed.", "err");
    } finally {
      setSending(false);
    }
  };
  const [waFilter, setWaFilter] = useState("all");
  const [sent, setSent] = useState(() => /* @__PURE__ */ new Set());
  const waClients = useMemo(
    () => Object.values(db.clients || {}).filter((c) => waNumber(c.whatsapp)).filter((c) => waFilter === "all" || String(c.risk || "") === waFilter).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [db.clients, waFilter]
  );
  const waText = (c) => (message || "").split("{name}").join(c.name && c.name.trim() ? c.name.trim() : "Investor");
  const sendOne = (c) => {
    if (!(message || "").trim()) {
      showToast("Type a message first.", "err");
      return;
    }
    if (!waNumber(c.whatsapp)) {
      showToast("No WhatsApp number for this client.", "err");
      return;
    }
    openWhatsApp(c.whatsapp, waText(c));
    setSent((prev) => {
      const s = new Set(prev);
      s.add(c.code);
      return s;
    });
  };
  const nextUnsent = () => {
    const c = waClients.find((x) => !sent.has(x.code));
    if (!c) {
      showToast("All done \u2014 every client in the list has been opened.", "ok");
      return;
    }
    sendOne(c);
  };
  const modeBtn = (m, label) => /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setMode(m),
      className: `text-xs px-3 py-1.5 rounded-md border ${mode === m ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`
    },
    label
  );
  return /* @__PURE__ */ React.createElement(Modal, { onClose, title: "Broadcast to clients", wide: true }, /* @__PURE__ */ React.createElement("div", { className: "flex gap-1.5 mb-3" }, modeBtn("card", "Festival card"), modeBtn("own", "Your own image / message"), modeBtn("whatsapp", "WhatsApp message")), mode === "whatsapp" ? /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 mb-3" }, "Type your message once, then send it to each client's WhatsApp \u2014 one chat at a time. The console opens WhatsApp with your text ready; you tap ", /* @__PURE__ */ React.createElement("b", null, "Send"), " there, come back, and do the next. Use ", /* @__PURE__ */ React.createElement("code", { className: "bg-slate-100 px-1 rounded" }, "{name}"), " and each client gets their own name. Keep it general communication, not specific stock advice.") : /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 mb-3" }, "WhatsApp can't be sent to automatically from here, so the console ", /* @__PURE__ */ React.createElement("b", null, "prepares"), " your image and text: use ", /* @__PURE__ */ React.createElement("b", null, "Download"), " / ", /* @__PURE__ */ React.createElement("b", null, "Copy message"), ", then send once through a WhatsApp ", /* @__PURE__ */ React.createElement("b", null, "broadcast list"), " (up to 256 clients per list). You can also ", /* @__PURE__ */ React.createElement("b", null, "email"), " it to every client in one click. Keep broadcasts free of specific stock advice so they stay general communication, not a solicitation."), mode === "card" && /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-1.5 mb-4" }, OCCASIONS.map((o) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: o.id,
      onClick: () => pickOcc(o),
      className: `text-xs px-2.5 py-1.5 rounded-md border ${occId === o.id ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`
    },
    o.label
  ))), /* @__PURE__ */ React.createElement("div", { className: "grid md:grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, mode === "card" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500 block mb-1" }, "Greeting title"), /* @__PURE__ */ React.createElement("input", { value: title, onChange: (e) => setTitle(e.target.value), className: "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" })), mode === "own" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500 block mb-1" }, "Your image ", /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "(optional \u2014 leave empty to send a text-only message)")), /* @__PURE__ */ React.createElement(
    "div",
    {
      onClick: () => imgRef.current && imgRef.current.click(),
      onDragOver: (e) => e.preventDefault(),
      onDrop: (e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) onImgFile(e.dataTransfer.files[0]);
      },
      className: "border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40"
    },
    /* @__PURE__ */ React.createElement(Upload, { size: 20, className: "mx-auto text-slate-400 mb-1" }),
    /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-600" }, ownName ? ownName : "Drop an image here, or click to choose"),
    /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mt-0.5" }, ".png \xB7 .jpg"),
    /* @__PURE__ */ React.createElement(
      "input",
      {
        ref: imgRef,
        type: "file",
        accept: "image/*",
        className: "hidden",
        onChange: (e) => {
          if (e.target.files[0]) onImgFile(e.target.files[0]);
          e.target.value = "";
        }
      }
    )
  ), ownImg && /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setOwnImg("");
    setOwnName("");
  }, className: "text-[11px] text-rose-600 hover:underline mt-1" }, "Remove image")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500 block mb-1" }, mode === "whatsapp" ? "WhatsApp message" : mode === "own" ? "Message / caption" : "Message"), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      value: message,
      onChange: (e) => setMessage(e.target.value),
      rows: mode === "card" ? 3 : 5,
      placeholder: mode === "card" ? "" : "Type your message to clients\u2026",
      className: "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-2 mt-1" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400" }, "Type ", /* @__PURE__ */ React.createElement("code", { className: "bg-slate-100 px-1 rounded" }, "{name}"), " to insert each client's name (e.g. ", "\u201C", "Dear ", "{name}", ",", "\u201D", ").", mode === "whatsapp" ? personalize ? /* @__PURE__ */ React.createElement("b", { className: "text-emerald-600" }, " Each client gets their own name.") : " Same text goes to everyone." : personalize ? /* @__PURE__ */ React.createElement("b", { className: "text-emerald-600" }, " Personalised \u2014 one email per client.") : " Without it, one identical email goes to everyone."), /* @__PURE__ */ React.createElement("button", { onClick: insertName, className: "text-[11px] text-indigo-600 hover:underline shrink-0 whitespace-nowrap" }, "Insert ", "\u201C", "Dear ", "{name}", ",", "\u201D"))), mode !== "whatsapp" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500 block mb-1" }, "Email subject"), /* @__PURE__ */ React.createElement("input", { value: subject, onChange: (e) => setSubject(e.target.value), className: "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" })), mode === "whatsapp" ? /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-500 pt-1" }, waClients.length, " client(s) with a WhatsApp number", waFilter !== "all" ? " in this category" : "", " \xB7 ", sent.size, " opened") : /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-500 pt-1" }, recipients.length, " client email address(es) on file for the send.")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-center items-start" }, mode === "whatsapp" ? /* @__PURE__ */ React.createElement("div", { className: "w-full" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-2" }, /* @__PURE__ */ React.createElement("select", { value: waFilter, onChange: (e) => setWaFilter(e.target.value), className: "text-xs border border-slate-300 rounded-md px-2 py-1.5" }, /* @__PURE__ */ React.createElement("option", { value: "all" }, "All risk categories"), RISK_CATEGORIES.map((r) => /* @__PURE__ */ React.createElement("option", { key: r, value: r }, r))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: nextUnsent,
      disabled: !(message || "").trim() || !waClients.length,
      className: "text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md flex items-center gap-1.5 disabled:opacity-50"
    },
    /* @__PURE__ */ React.createElement(MessageCircle, { size: 13 }),
    " Open next unsent"
  ), sent.size > 0 && /* @__PURE__ */ React.createElement("button", { onClick: () => setSent(/* @__PURE__ */ new Set()), className: "text-xs text-slate-500 hover:underline" }, "Reset")), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg divide-y divide-slate-100", style: { maxHeight: "50vh", overflowY: "auto" } }, waClients.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "p-4 text-sm text-slate-400 text-center" }, "No clients with a WhatsApp number in this category."), waClients.map((c) => {
    const done = sent.has(c.code);
    return /* @__PURE__ */ React.createElement("div", { key: c.code, className: "flex items-center gap-2 px-3 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-800 truncate flex items-center gap-1.5" }, done && /* @__PURE__ */ React.createElement(Check, { size: 13, className: "text-emerald-600 shrink-0" }), c.name || c.code), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, waDisplay(c.whatsapp))), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => sendOne(c),
        disabled: !(message || "").trim(),
        className: `text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5 shrink-0 disabled:opacity-50 ${done ? "border border-emerald-200 text-emerald-700 bg-emerald-50" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`
      },
      /* @__PURE__ */ React.createElement(Send, { size: 12 }),
      " ",
      done ? "Send again" : "Send"
    ));
  })), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mt-2" }, "Each Send opens that client's WhatsApp with your message typed in \u2014 you press Send inside WhatsApp. A green tick marks the ones you've opened (this device only).")) : mode === "own" ? ownImg ? /* @__PURE__ */ React.createElement("img", { src: ownImg, alt: "upload preview", style: { maxWidth: 460, maxHeight: 460, borderRadius: 6, border: "1px solid #e2e8f0", objectFit: "contain" } }) : /* @__PURE__ */ React.createElement("div", { style: { width: 460, height: 220 }, className: "flex flex-col items-center justify-center text-center text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg px-6" }, /* @__PURE__ */ React.createElement("span", null, "No image \u2014 this will be a ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-600" }, "text-only"), " broadcast.", /* @__PURE__ */ React.createElement("br", null), "Type your message on the left, then Copy it for WhatsApp or Email it to all clients.")) : /* @__PURE__ */ React.createElement("div", { ref: cardRef, style: {
    width: 460,
    height: 460,
    background: occ.bg,
    color: occ.ink,
    fontFamily: "Georgia, 'Times New Roman', serif",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "38px 34px",
    boxSizing: "border-box",
    borderRadius: 6
  } }, occ.motif === "tricolor" && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: 0, left: 0, right: 0, height: 12, display: "flex" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, background: "#FF9933" } }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, background: "#ffffff" } }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, background: "#138808" } })), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 9, marginBottom: 5 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 30, height: 30, borderRadius: 8, background: occ.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#0b1440", fontWeight: 800, fontFamily: "Arial", fontSize: 16 } }, "V"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, letterSpacing: 2, fontFamily: "Arial", fontWeight: 700 } }, "VASUPRADAH")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, opacity: 0.85, fontFamily: "Arial", letterSpacing: 1 } }, "INVESTMENT ADVISORY")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 38, fontWeight: 700, lineHeight: 1.12, marginBottom: 14 } }, title), /* @__PURE__ */ React.createElement("div", { style: { width: 60, height: 3, background: occ.accent, margin: "0 auto 14px" } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, lineHeight: 1.5, maxWidth: 360, margin: "0 auto", fontFamily: "Arial", opacity: 0.96 } }, message), occ.motif === "dots" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 9, justifyContent: "center", marginTop: 18 } }, ["#F4C430", "#e11d48", "#f97316", "#22c55e", "#a855f7", "#3b82f6"].map((c, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { width: 13, height: 13, borderRadius: "50%", background: c } }))), occ.motif === "diyas" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, justifyContent: "center", marginTop: 20 } }, [0, 1, 2].map((i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { width: 24 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 7, height: 12, background: occ.accent, borderRadius: "0 0 50% 50%", margin: "0 auto" } }), /* @__PURE__ */ React.createElement("div", { style: { width: 24, height: 8, background: "#c2410c", borderRadius: "0 0 40px 40px", marginTop: 2 } })))), occ.motif === "crescent" && /* @__PURE__ */ React.createElement("div", { style: { position: "relative", width: 44, height: 44, margin: "18px auto 0" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", width: 44, height: 44, borderRadius: "50%", background: occ.accent } }), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: 13, width: 40, height: 40, borderRadius: "50%", background: occ.cut } }))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", fontFamily: "Arial", fontSize: 10.5, opacity: 0.82, lineHeight: 1.55 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700 } }, db.advisorName || "Jaideep Menon"), /* @__PURE__ */ React.createElement("div", null, "SEBI RIA Reg. No. ", db.sebiRegNo || ""), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 3, opacity: 0.75 } }, "For private circulation only"))))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mt-5" }, mode !== "whatsapp" && /* @__PURE__ */ React.createElement("button", { onClick: download, disabled: busy, className: "bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Download, { size: 15 }), " ", busy ? "Rendering\u2026" : "Download image (for WhatsApp)"), /* @__PURE__ */ React.createElement("button", { onClick: copyMsg, className: "text-sm px-4 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(MessageCircle, { size: 15 }), " Copy message"), mode !== "whatsapp" && /* @__PURE__ */ React.createElement("button", { onClick: emailAll, disabled: sending || !recipients.length, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Mail, { size: 15 }), " ", sending ? "Sending\u2026" : `Email to all clients (${recipients.length})`), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "text-slate-500 text-sm px-4 py-2 rounded-lg hover:bg-slate-100" }, "Close")), mode !== "whatsapp" && /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mt-2" }, "WhatsApp broadcast: on your phone, WhatsApp \u2192 New broadcast \u2192 pick clients \u2192 send the downloaded image or the copied message. Email goes out from your own Google account via the Apps Script; Gmail caps daily recipients (~1,500 on Google Workspace, ~100 on a personal gmail.com)."));
}
function StatementModal({ data, client, onClose, showToast }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const dl = (blobOrUrl, name) => {
    const url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (typeof blobOrUrl !== "string") setTimeout(() => URL.revokeObjectURL(url), 4e3);
  };
  const downloadHTML = () => dl(new Blob([data.full], { type: "text/html" }), data.fileBase + ".html");
  const makeCanvas = async () => {
    const h2c = window.html2canvas;
    if (!h2c) {
      showToast("Image tool not available here.", "err");
      return null;
    }
    const node = ref.current && ref.current.firstElementChild;
    if (!node) return null;
    return await h2c(node, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false });
  };
  const saveJpg = async () => {
    setBusy(true);
    try {
      const c = await makeCanvas();
      if (c) {
        dl(c.toDataURL("image/jpeg", 0.95), data.fileBase + ".jpg");
        showToast("Image saved to downloads \u2014 attach it in WhatsApp/email.");
      }
    } catch (e) {
      showToast("Couldn't render the image.", "err");
    } finally {
      setBusy(false);
    }
  };
  const shareJpg = async () => {
    setBusy(true);
    try {
      const c = await makeCanvas();
      if (!c) return;
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.95));
      const file = new File([blob], data.fileBase + ".jpg", { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: data.caption });
      } else {
        dl(blob, file.name);
        showToast("Direct share isn't supported on this device \u2014 image downloaded so you can attach it.");
      }
    } catch (e) {
      if (!e || e.name !== "AbortError") showToast("Couldn't share the image.", "err");
    } finally {
      setBusy(false);
    }
  };
  const wa = () => {
    if (!waNumber(client.whatsapp)) {
      showToast("No WhatsApp number for this client.", "err");
      return;
    }
    openWhatsApp(client.whatsapp, data.caption);
  };
  const mail = () => {
    if (!client.email) {
      showToast("No email for this client.", "err");
      return;
    }
    window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent("Your portfolio statement \u2014 Vasupradah")}&body=${encodeURIComponent(data.caption)}`;
  };
  const stockList = Object.values(client.holdings || {}).filter((h) => num(h.quantity) > 0).map((h) => h.stock).sort().join(", ");
  const copyStocks = () => {
    if (!stockList) {
      showToast("This client holds no stocks.", "err");
      return;
    }
    copyText(stockList).then(() => showToast("Stock list copied.")).catch(() => showToast("Copy failed \u2014 select the text and copy manually.", "err"));
  };
  return /* @__PURE__ */ React.createElement(Modal, { onClose, title: "Portfolio statement", wide: true }, /* @__PURE__ */ React.createElement("div", { className: "text-xs text-slate-500 mb-3" }, "Share as an ", /* @__PURE__ */ React.createElement("b", null, "image"), " (best for WhatsApp) or an ", /* @__PURE__ */ React.createElement("b", null, "HTML file"), " (best for email). On a phone, \u201CShare image\u201D opens WhatsApp/Mail directly with the picture attached."), /* @__PURE__ */ React.createElement("div", { ref, className: "rounded-lg overflow-hidden border border-slate-200 max-h-[55vh] overflow-y-auto bg-slate-50" }, /* @__PURE__ */ React.createElement("div", { dangerouslySetInnerHTML: { __html: data.inner } })), /* @__PURE__ */ React.createElement("div", { className: "mt-3 flex items-center gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 truncate", title: stockList }, stockList || "No stocks"), /* @__PURE__ */ React.createElement("button", { onClick: copyStocks, className: "shrink-0 text-xs px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50" }, "Copy stocks")), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mt-4" }, /* @__PURE__ */ React.createElement("button", { onClick: shareJpg, disabled: busy, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Share2, { size: 15 }), " ", busy ? "Rendering\u2026" : "Share image"), /* @__PURE__ */ React.createElement("button", { onClick: saveJpg, disabled: busy, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Download, { size: 15 }), " Save JPG"), /* @__PURE__ */ React.createElement("button", { onClick: downloadHTML, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(FileText, { size: 15 }), " Save HTML"), /* @__PURE__ */ React.createElement("button", { onClick: wa, className: "text-sm px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Send, { size: 15 }), " WhatsApp"), /* @__PURE__ */ React.createElement("button", { onClick: mail, className: "text-sm px-3 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Mail, { size: 15 }), " Email")));
}
function StockNoteModal({ db, row, content, setContent, onClose, showToast }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const data = buildStockNote(db, row, content);
  const set = (patch) => setContent((c) => ({ ...c, ...patch, _dirty: true }));
  const money2 = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const canRebalance = num(row.currentPrice) > 0 && num(row.clientTotal) > 0;
  const [tgtPct, setTgtPct] = useState(row && row._rebalance ? String(row._rebalance.targetPct || "") : "");
  const rebalanceCalc = useMemo(() => {
    if (!canRebalance || tgtPct === "" || isNaN(num(tgtPct))) return null;
    const total = num(row.clientTotal), price = num(row.currentPrice), curVal = num(row.current), cash = num(row.cash);
    const target = total * num(tgtPct) / 100;
    const gap = target - curVal;
    const shares = gap >= 0 ? Math.floor(gap / price) : Math.ceil(gap / price);
    const cost = Math.abs(shares) * price;
    return { total, price, curVal, cash, target, gap, shares, cost, action: shares > 0 ? "buy" : shares < 0 ? "trim" : "hold", insufficientCash: shares > 0 && cost > cash, targetPct: num(tgtPct), curPct: total > 0 ? curVal / total * 100 : 0 };
  }, [canRebalance, tgtPct, row.clientTotal, row.currentPrice, row.current, row.cash]);
  const applyRebalance = (c) => {
    if (!c) return;
    const stock = row.stock;
    let heading, body;
    if (c.action === "hold") {
      heading = `${stock} is already near ${fmtNum(c.targetPct)}%`;
      body = `Your ${stock} holding is already about ${fmtNum(c.curPct)}% of your total assets (holdings + available cash), in line with the ${fmtNum(c.targetPct)}% target. No action is needed right now.`;
    } else if (c.action === "buy") {
      heading = `Recommendation: add ${fmtNum(c.shares)} share(s) of ${stock}`;
      body = `Based on our review of your portfolio, we recommend adding ${fmtNum(c.shares)} share(s) of ${stock} to raise the holding from about ${fmtNum(c.curPct)}% to ${fmtNum(c.targetPct)}% of your total assets (holdings + available cash). Approximate outlay at today's price: ${money2(c.cost)}.`;
      if (c.insufficientCash) body += `

Note: this exceeds the cash currently available (${money2(c.cash)}). Please arrange a top-up, or let us know if you'd like us to size the buy to the available cash.`;
    } else {
      heading = `Recommendation: trim ${fmtNum(Math.abs(c.shares))} share(s) of ${stock}`;
      body = `Based on our review of your portfolio, we recommend trimming ${fmtNum(Math.abs(c.shares))} share(s) of ${stock} to bring the holding from about ${fmtNum(c.curPct)}% down to ${fmtNum(c.targetPct)}% of your total assets (holdings + available cash). Approximate proceeds at today's price: ${money2(c.cost)}.`;
    }
    setContent({ heading, body, withPos: true, _dirty: false });
  };
  const tgtRef = useRef(null);
  useEffect(() => {
    if (tgtRef.current === tgtPct) return;
    tgtRef.current = tgtPct;
    if (rebalanceCalc) applyRebalance(rebalanceCalc);
  }, [tgtPct]);
  const logRebalance = (channel) => {
    if (!rebalanceCalc || rebalanceCalc.action === "hold") return;
    logAdviceTrace(db, [{
      at: Date.now(),
      by: db.adminName || "admin",
      channel,
      title: `Rebalance ${row.stock} to ${fmtNum(rebalanceCalc.targetPct)}%`,
      side: rebalanceCalc.action === "buy" ? "BUY" : "SELL",
      stock: row.stock,
      code: row.code,
      name: row.name || row.code,
      amount: rebalanceCalc.cost,
      qty: Math.abs(rebalanceCalc.shares),
      model: "manual",
      subject: content.heading || "Update on " + row.stock
    }]);
  };
  const lastPrefilledRef = useRef(null);
  const buildPrefill = () => {
    const rb = row && row._rebalance;
    if (!rb || rb.action === "hold") return null;
    const money = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
    const verb = rb.action === "buy" ? "adding" : "trimming";
    const stockName = row.stock;
    const heading = rb.action === "buy" ? `Recommendation: add ${fmtNum(rb.shares)} share(s) of ${stockName}` : rb._conc ? `Reducing concentration in ${stockName}` : `Recommendation: trim ${fmtNum(rb.shares)} share(s) of ${stockName}`;
    let body = "";
    if (rb.action === "buy") {
      body = `Based on our review of your portfolio, we recommend ${verb} ${fmtNum(rb.shares)} share(s) of ${stockName} to bring the holding to about ${fmtNum(rb.targetPct)}% of your total assets (holdings + available cash). Approximate outlay at today's price: ${money(rb.cost)}.`;
      if (rb.capped) body += `

This quantity has been sized to the cash currently available in your account (${money(rb.cash)}); it is the most we can buy now without a top-up. Let us know if you'd like to add funds to reach the full target.`;
      else if (rb.insufficientCash) body += `

Note: this exceeds the cash currently available in the account (${money(rb.cash)}). Please arrange a top-up, or let us know if you'd like us to size the buy down to the available cash.`;
    } else {
      const cc = rb._conc;
      if (cc) {
        body = `Based on our review of your portfolio, your holding in ${stockName} has grown to about ${fmtNum(cc.weight)}% of your total assets (holdings + available cash), which is above the ${fmtNum(cc.limit)}% single-stock limit we apply for your risk category. To reduce concentration risk, we recommend ${verb} ${fmtNum(rb.shares)} share(s), bringing the position back within the limit. Please confirm before we execute.`;
      } else {
        body = `Based on our review of your portfolio, the ${stockName} position is currently above the target weight. We recommend ${verb} ${fmtNum(rb.shares)} share(s) to bring the holding closer to ${fmtNum(rb.targetPct)}% of your total assets. Please confirm before we execute.`;
      }
    }
    return { heading, body };
  };
  useEffect(() => {
    if (!row || !row._rebalance || row._rebalance.action === "hold") return;
    const clientKey = row.code + "|" + row.stock + "|" + row._rebalance.action + "|" + row._rebalance.shares;
    if (lastPrefilledRef.current === clientKey) return;
    const p = buildPrefill();
    if (!p) return;
    setContent({ heading: p.heading, body: p.body, withPos: true, _dirty: false });
    lastPrefilledRef.current = clientKey;
  }, [row && row.code, row && row.stock, row && row._rebalance && row._rebalance.shares, row && row._rebalance && row._rebalance.action]);
  const resetToAuto = () => {
    const p = buildPrefill();
    if (!p) {
      showToast("No auto-recommendation available here \u2014 this looks like a per-holder message, not a rebalance one.", "err");
      return;
    }
    setContent({ heading: p.heading, body: p.body, withPos: true, _dirty: false });
    lastPrefilledRef.current = row.code + "|" + row.stock + "|" + row._rebalance.action + "|" + row._rebalance.shares;
    showToast("Message reset to the auto-recommendation for this client.");
  };
  const dl = (blobOrUrl, name) => {
    const url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (typeof blobOrUrl !== "string") setTimeout(() => URL.revokeObjectURL(url), 4e3);
  };
  const downloadHTML = () => dl(new Blob([data.full], { type: "text/html" }), data.fileBase + ".html");
  const makeCanvas = async () => {
    const h2c = window.html2canvas;
    if (!h2c) {
      showToast("Image tool not available here.", "err");
      return null;
    }
    const node = ref.current && ref.current.firstElementChild;
    if (!node) return null;
    return await h2c(node, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false });
  };
  const saveJpg = async () => {
    setBusy(true);
    try {
      const c = await makeCanvas();
      if (c) {
        dl(c.toDataURL("image/jpeg", 0.95), data.fileBase + ".jpg");
        showToast("Image saved \u2014 attach it in WhatsApp/email.");
      }
    } catch (e) {
      showToast("Couldn't render the image.", "err");
    } finally {
      setBusy(false);
    }
  };
  const shareJpg = async () => {
    setBusy(true);
    try {
      const c = await makeCanvas();
      if (!c) return;
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.95));
      const file = new File([blob], data.fileBase + ".jpg", { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: data.caption });
      else {
        dl(blob, file.name);
        showToast("Direct share isn't supported here \u2014 image downloaded so you can attach it.");
      }
    } catch (e) {
      if (!e || e.name !== "AbortError") showToast("Couldn't share the image.", "err");
    } finally {
      setBusy(false);
    }
  };
  const wa = () => {
    if (!waNumber(row.whatsapp)) {
      showToast("No WhatsApp number for this client.", "err");
      return;
    }
    openWhatsApp(row.whatsapp, data.caption);
    logRebalance("whatsapp");
  };
  const mail = () => {
    if (!row.email) {
      showToast("No email for this client.", "err");
      return;
    }
    window.location.href = `mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent((content.heading || "Update on " + row.stock) + " \u2014 Vasupradah")}&body=${encodeURIComponent(data.caption)}`;
    logRebalance("email");
  };
  const copyText = () => copyText(data.caption).then(() => showToast("Message text copied.")).catch(() => showToast("Copy failed.", "err"));
  return /* @__PURE__ */ React.createElement(Modal, { onClose, title: `Message about ${row.stock} \xB7 ${row.name || row.code}`, wide: true }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-xs text-slate-500" }, "Heading"), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: content.heading,
      onChange: (e) => set({ heading: e.target.value }),
      placeholder: `Update on ${row.stock}`,
      className: "w-full mt-1 mb-3 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    }
  ), canRebalance && /* @__PURE__ */ React.createElement("div", { className: "mb-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2.5" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-600" }, "Rebalance ", /* @__PURE__ */ React.createElement("b", null, row.stock), " to"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      value: tgtPct,
      onChange: (e) => setTgtPct(e.target.value),
      placeholder: fmtNum(row.weight),
      className: "w-20 px-2 py-1 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-500" }, "% of total assets"), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 ml-auto" }, "now ", fmtNum(row.weight), "% \xB7 ", fmtNum(row.quantity), " sh")), rebalanceCalc && /* @__PURE__ */ React.createElement("div", { className: `mt-1.5 text-sm font-medium ${rebalanceCalc.action === "buy" ? "text-emerald-700" : rebalanceCalc.action === "trim" ? "text-rose-700" : "text-slate-600"}` }, rebalanceCalc.action === "hold" ? "Already at target \u2014 no trade needed." : `\u2192 ${rebalanceCalc.action === "buy" ? "BUY" : "SELL"} ${fmtNum(Math.abs(rebalanceCalc.shares))} share(s) \xB7 ${money2(rebalanceCalc.cost)}${rebalanceCalc.insufficientCash ? " \xB7 exceeds available cash" : ""}`), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mt-1" }, "The recommendation below fills in automatically. Send it by WhatsApp or email using the buttons.")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("label", { className: "text-xs text-slate-500" }, "Message about this stock / sector"), row._rebalance && row._rebalance.action !== "hold" && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: resetToAuto,
      type: "button",
      className: "text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline"
    },
    "Reset to auto-recommendation"
  )), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      value: content.body,
      onChange: (e) => set({ body: e.target.value }),
      rows: 7,
      placeholder: row._rebalance ? "Edit the recommendation above before sending, or add any additional context you want the client to see." : "e.g. Carraro India \u2014 Q1 results beat estimates on margin expansion. The auto-ancillary space is seeing strong order inflows; we remain positive and suggest holding.",
      className: "w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
    }
  ), /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-2 mt-3 text-xs text-slate-600" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: content.withPos !== false, onChange: (e) => set({ withPos: e.target.checked }) }), "Include this client's position in ", row.stock), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mt-2" }, row._rebalance ? `You can edit the heading and body above before sending. When you move to the next client, the recommendation will refresh with that client's own quantity \u2014 your edits stay only for this client.` : `Your text is kept as you move to the next holder, so you can write once and send to everyone holding ${row.stock}.`)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "text-xs text-slate-500 mb-1" }, "Preview"), /* @__PURE__ */ React.createElement("div", { ref, className: "rounded-lg overflow-hidden border border-slate-200 max-h-[44vh] overflow-y-auto bg-slate-50" }, /* @__PURE__ */ React.createElement("div", { dangerouslySetInnerHTML: { __html: data.inner } })))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mt-4" }, /* @__PURE__ */ React.createElement("button", { onClick: shareJpg, disabled: busy, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Share2, { size: 15 }), " ", busy ? "Rendering\u2026" : "Share image"), /* @__PURE__ */ React.createElement("button", { onClick: saveJpg, disabled: busy, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Download, { size: 15 }), " Save JPG"), /* @__PURE__ */ React.createElement("button", { onClick: downloadHTML, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(FileText, { size: 15 }), " Save HTML"), /* @__PURE__ */ React.createElement("button", { onClick: wa, className: "text-sm px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Send, { size: 15 }), " WhatsApp text"), /* @__PURE__ */ React.createElement("button", { onClick: mail, className: "text-sm px-3 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Mail, { size: 15 }), " Email"), /* @__PURE__ */ React.createElement("button", { onClick: copyText, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50" }, "Copy text")));
}
function PreviewModal({ db, client, onClose, onSend, onEmail }) {
  const msg = buildMessage(db, client);
  return /* @__PURE__ */ React.createElement(Modal, { onClose, title: `Message \xB7 ${client.name || client.code}` }, /* @__PURE__ */ React.createElement("pre", { className: "whitespace-pre-wrap text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-72 overflow-y-auto" }, msg), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 mt-4" }, /* @__PURE__ */ React.createElement("button", { onClick: onSend, className: "bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 flex-1 justify-center" }, /* @__PURE__ */ React.createElement(Send, { size: 15 }), " WhatsApp"), /* @__PURE__ */ React.createElement("button", { onClick: onEmail, className: "bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 flex-1 justify-center" }, /* @__PURE__ */ React.createElement(Mail, { size: 15 }), " Email"), /* @__PURE__ */ React.createElement("button", { onClick: () => copyText(msg), className: "text-slate-600 text-sm px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50" }, "Copy")));
}
const SortChip = ({ active, dir, onClick, children }) => /* @__PURE__ */ React.createElement(
  "button",
  {
    onClick,
    className: `px-2 py-1 rounded-md border ${active ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`
  },
  children,
  active ? dir === "asc" ? " \u25B2" : " \u25BC" : ""
);

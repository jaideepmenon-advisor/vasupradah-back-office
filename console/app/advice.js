const DEFAULT_ADVICE = `Dear {name},

Trade advice from Vasupradah Investment Advisory Services P Ltd ({date}):

{action}: {company} ({symbol})
Quantity: {quantity}
Indicative price: {price}

{reportLink}

Regards,
{advisorName}
Vasupradah Investment Advisory Services P Ltd
SEBI RIA Reg. No: {sebiRegNo}

Disclaimer: This is advisory only and subject to market risk. Please act as per your advisory agreement.`;
const DEFAULT_REPORT = `Dear {name},

Please find our research report on {company} ({symbol}) from Vasupradah Investment Advisory Services P Ltd:

{reportLink}

Regards,
{advisorName}
SEBI RIA Reg. No: {sebiRegNo}

Disclaimer: For information only; investments are subject to market risk.`;
function parseAdviceRow(row) {
  const rec = pickFields(row);
  return {
    code: String(rec.code ?? "").trim(),
    descriptor: String(rec.descriptor ?? "").trim(),
    action: String(rec.action ?? "").trim().toUpperCase(),
    quantity: num(rec.quantity),
    price: num(rec.price),
    company: String(rec.company ?? "").trim(),
    symbol: String(rec.symbol ?? "").trim().toUpperCase(),
    date: String(rec.date ?? "").trim()
  };
}
function buildAdviceMessage(db, row, link) {
  const base = fill(db.adviceTemplate || DEFAULT_ADVICE, {
    name: row.name || row.descriptor || row.code,
    action: row.action || "BUY",
    symbol: row.symbol,
    company: row.company || row.symbol,
    quantity: fmtNum(row.quantity),
    price: row.price ? fmtINR(row.price) : "at market",
    date: row.date || today(),
    reportLink: link ? "Research report: " + link : "",
    advisorName: db.advisorName,
    sebiRegNo: db.sebiRegNo
  });
  return row.note ? `${base}

${row.note}` : base;
}
function buildReportMessage(db, row, link) {
  return fill(db.reportTemplate || DEFAULT_REPORT, {
    name: row.name || row.descriptor || row.code,
    symbol: row.symbol,
    company: row.company || row.symbol,
    reportLink: link || "(report link not set)",
    advisorName: db.advisorName,
    sebiRegNo: db.sebiRegNo
  });
}
function parseAlertRow(a) {
  const g = {};
  for (const k in a) g[normKey(k)] = a[k];
  return {
    code: String(g.code ?? g.clientcode ?? g.ucc ?? g.portfoliocode ?? "").trim(),
    descriptor: String(g.name ?? g.clientname ?? g.portfolioname ?? "").trim(),
    company: String(g.company ?? g.companyname ?? "").trim(),
    symbol: String(g.symbol ?? g.nse ?? g.scrip ?? g.stock ?? "").trim().toUpperCase(),
    action: String(g.action ?? g.transtype ?? g.type ?? "").trim().toUpperCase() || "BUY",
    quantity: num(g.quantity ?? g.qty),
    price: num(g.price ?? g.rate),
    date: String(g.date ?? "").trim(),
    note: String(g.note ?? g.remarks ?? g.remark ?? g.rationale ?? g.comment ?? "").trim()
  };
}
function buildAlertCard(db, row, link) {
  const NAVY = "#1E2A78", GOLD = "#C9A24B", YEL = "#F5C518", BG = "#F7F8FB", INK = "#1A1A2E", MUT = "#6B7280", UP = "#0F8A4F", DN = "#C0392B";
  const isSell = (row.action || "BUY") === "SELL";
  const accent = isSell ? DN : UP;
  const money = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const name = row.name || row.descriptor || row.code;
  const priceTxt = row.price ? money(row.price) : "At market";
  const noteHtml = row.note ? `<div style="padding:0 26px 4px"><div style="background:${BG};border-left:4px solid ${GOLD};padding:10px 14px;font-size:12.5px;color:${INK};line-height:1.5">${row.note}</div></div>` : "";
  const linkHtml = link ? `<div style="padding:6px 26px 0;font-size:11.5px;color:${NAVY}">Research report: <a href="${link}" style="color:${NAVY}">${link}</a></div>` : "";
  const inner = `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e6ee;font-family:Georgia,'Times New Roman',serif;color:${INK}">
    <div style="background:${NAVY};border-bottom:4px solid ${YEL};padding:20px 26px">
      <table style="width:100%;border-collapse:collapse"><tr>
        <td style="text-align:left;vertical-align:middle">
          <div style="font-size:21px;font-weight:bold;letter-spacing:2px;color:#ffffff">VASUPRADAH</div>
          <div style="font-size:10px;letter-spacing:3px;color:${GOLD};margin-top:3px">INVESTMENT ADVISORY</div>
        </td>
        <td style="text-align:right;vertical-align:middle">
          <div style="font-size:13px;color:#ffffff;font-style:italic">Trade Alert</div>
          <div style="font-size:11px;color:${GOLD};margin-top:3px">${row.date || today()}</div>
        </td>
      </tr></table>
    </div>
    <div style="background:${YEL};height:6px;font-size:0;line-height:0">&nbsp;</div>
    <div style="padding:18px 26px 6px">
      <div style="font-size:12px;color:${MUT}">For</div>
      <div style="font-size:18px;font-weight:bold;color:${NAVY}">${name}</div>
      <div style="font-size:11.5px;color:${MUT};margin-top:2px">Code: ${row.code}</div>
    </div>
    <div style="margin:8px 26px 12px;border:1px solid #e6e6ee;border-radius:6px;overflow:hidden">
      <div style="background:${accent};padding:12px 16px;color:#ffffff">
        <span style="font-size:18px;font-weight:bold;letter-spacing:1px">${isSell ? "SELL" : "BUY"}</span>
        <span style="font-size:18px;font-weight:bold">&nbsp;\xB7&nbsp;${row.symbol || ""}</span>
        ${row.company ? `<div style="font-size:12px;opacity:.9;margin-top:2px">${row.company}</div>` : ""}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13.5px">
        <tr><td style="padding:10px 16px;color:${MUT};border-bottom:1px solid #eee">Quantity</td><td style="padding:10px 16px;text-align:right;font-weight:600;border-bottom:1px solid #eee">${fmtNum(row.quantity)}</td></tr>
        <tr><td style="padding:10px 16px;color:${MUT}">Price</td><td style="padding:10px 16px;text-align:right;font-weight:600">${priceTxt}</td></tr>
      </table>
    </div>
    ${noteHtml}${linkHtml}
    <div style="background:${BG};border-top:1px solid #e6e6ee;padding:14px 26px;font-size:10.5px;color:${MUT};line-height:1.55;margin-top:10px">
      <div style="color:${NAVY};font-weight:bold;font-size:11px">${db.advisorName || "Vasupradah Investment Advisory Services P Ltd"}</div>
      <div>SEBI Registered Investment Adviser${db.sebiRegNo ? ` \u2022 Reg. No: ${db.sebiRegNo}` : ""}</div>
      <div style="margin-top:6px">This is an advisory communication, not a solicitation. Investments in securities are subject to market risks; please read all related documents carefully. <b>For Private Circulation Only.</b></div>
    </div>
  </div>`;
  const full = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${isSell ? "SELL" : "BUY"} ${row.symbol} \u2014 Trade Alert | Vasupradah</title></head><body style="margin:0;padding:20px 0;background:${BG}">${inner}</body></html>`;
  const caption = buildAdviceMessage(db, row, link);
  const fileBase = `Vasupradah_Alert_${String(row.symbol || "")}_${String(name).replace(/[^A-Za-z0-9]+/g, "_")}`;
  return { inner, full, caption, fileBase };
}
async function pullAdviceTrace(url) {
  const res = await fetch(withToken(url) + "&advice_trace=1");
  const data = await res.json();
  return Array.isArray(data.rows) ? data.rows : [];
}
async function pullAdviceAlertsFromSheet(url) {
  const res = await fetch(withToken(url) + "&advice_alerts=1");
  const data = await res.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length < 2) return [];
  const byId = {};
  for (const r of rows.slice(1)) {
    const [id, at, by, title, model, side, stock, code, name, email, whatsapp, amount, qty, subject, bdy, waBdy] = r;
    if (!id) continue;
    const sid = String(id);
    if (!byId[sid]) byId[sid] = { id: sid, at: Number(at) || 0, by: String(by || ""), title: String(title || ""), model: String(model || ""), side: String(side || ""), stock: String(stock || ""), dispatch: [], sheet: [] };
    byId[sid].dispatch.push({ code: String(code || ""), name: String(name || ""), email: String(email || ""), whatsapp: String(whatsapp || ""), amount: amount === "" ? 0 : num(amount), qty: qty === "" ? null : num(qty), subject: String(subject || ""), body: String(bdy || ""), waBody: String(waBdy || "") });
    byId[sid].sheet.push({ Code: code, Name: name, Side: side, Stock: stock, "Order (INR)": amount === "" ? "" : num(amount), Qty: qty, Subject: subject, Email: email, WhatsApp: whatsapp });
  }
  return Object.values(byId).sort((a, b) => b.at - a.at);
}
function AdviceTracePanel({ db, showToast }) {
  const money = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [chan, setChan] = useState("all");
  const [open, setOpen] = useState(false);
  const load = async () => {
    if (!(db.sheetUrl || "").trim()) {
      showToast("No Google Sheet connected on this device.", "err");
      return;
    }
    setLoading(true);
    try {
      const raw = await pullAdviceTrace(db.sheetUrl);
      const body = raw.length > 1 ? raw.slice(1) : [];
      const parsed = body.map((r) => ({ at: Number(r[0]) || 0, by: r[1] || "", channel: String(r[2] || ""), batchId: r[3] || "", title: r[4] || "", side: r[5] || "", stock: r[6] || "", code: r[7] || "", name: r[8] || "", amount: r[9], qty: r[10], model: r[11] || "", subject: r[12] || "" })).sort((a, b) => b.at - a.at);
      setRows(parsed);
      showToast(`Loaded ${parsed.length} sent advice record(s).`);
    } catch (e) {
      showToast("Couldn't load the trace \u2014 is the Apps Script re-deployed?", "err");
    } finally {
      setLoading(false);
    }
  };
  const toggle = () => {
    const nx = !open;
    setOpen(nx);
    if (nx && rows == null) load();
  };
  const filtered = (rows || []).filter((r) => {
    if (chan !== "all" && r.channel !== chan) return false;
    const t = q.trim().toLowerCase();
    return !t || [r.name, r.code, r.stock, r.title, r.by].some((x) => String(x).toLowerCase().includes(t));
  });
  const exportExcel = () => {
    if (!filtered.length) {
      showToast("Nothing to export.", "err");
      return;
    }
    const out = filtered.map((r) => ({ "Date/time": r.at ? new Date(r.at).toLocaleString("en-IN") : "", "Sent by": r.by, Channel: r.channel, Side: r.side, Stock: r.stock, Code: r.code, Client: r.name, "Amount (INR)": r.amount, Qty: r.qty, Model: r.model, Title: r.title }));
    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AdviceTrace");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `advice-trace-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-4 mb-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between gap-3 flex-wrap" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-semibold flex items-center gap-2" }, /* @__PURE__ */ React.createElement(FileText, { size: 18, className: "text-indigo-600" }), " Advice trace ", /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-normal text-slate-400" }, "\u2014 audit log of every advice sent")), open && rows != null && /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500" }, filtered.length, " of ", rows.length, " record(s)", rows.length ? ` \xB7 latest ${new Date(rows[0].at).toLocaleString("en-IN")}` : "")), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, open && /* @__PURE__ */ React.createElement("button", { onClick: load, disabled: loading, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(RefreshCw, { size: 15 }), " ", loading ? "Loading\u2026" : "Refresh"), /* @__PURE__ */ React.createElement("button", { onClick: toggle, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" }, open ? /* @__PURE__ */ React.createElement(X, { size: 15 }) : /* @__PURE__ */ React.createElement(Eye, { size: 15 }), " ", open ? "Hide" : "View sent trace"))), open && /* @__PURE__ */ React.createElement("div", { className: "mt-3 space-y-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 items-center" }, /* @__PURE__ */ React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Filter by client / code / stock / who sent\u2026", className: "flex-1 min-w-[200px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" }), /* @__PURE__ */ React.createElement("select", { value: chan, onChange: (e) => setChan(e.target.value), className: "px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "all" }, "All channels"), /* @__PURE__ */ React.createElement("option", { value: "email" }, "Email"), /* @__PURE__ */ React.createElement("option", { value: "whatsapp" }, "WhatsApp")), /* @__PURE__ */ React.createElement("button", { onClick: exportExcel, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Download, { size: 15 }), " Excel")), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { style: { maxHeight: "55vh", overflowY: "auto" } }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "When"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Client"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Advice"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Amount"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Channel"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "By"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, filtered.map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: i }, /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500 whitespace-nowrap" }, r.at ? new Date(r.at).toLocaleString("en-IN") : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "text-slate-800" }, r.name), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, r.code)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "text-slate-700" }, r.side, " ", r.stock), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, r.model === "execution" ? "execute link" : r.model === "auto" ? "by client" : "email", " \xB7 ", r.title)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-700" }, r.amount ? money(r.amount) : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("span", { className: `text-[11px] px-1.5 py-0.5 rounded ${r.channel === "email" ? "bg-indigo-50 text-indigo-700" : "bg-emerald-50 text-emerald-700"}` }, r.channel)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, r.by))), rows != null && !filtered.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 6, className: "px-3 py-8 text-center text-slate-400 text-sm" }, rows.length ? "No records match the filter." : "No advice sent yet \u2014 the trace fills in as you send."))))))));
}
function AdviceAlertsPanel({ db, user, commit, showToast }) {
  const money = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const isAdmin = user?.role === "admin";
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [waFor, setWaFor] = useState(null);
  const [sentWA, setSentWA] = useState(() => /* @__PURE__ */ new Set());
  const [sentEmail, setSentEmail] = useState(() => /* @__PURE__ */ new Set());
  const [waQuery, setWaQuery] = useState("");
  const [doneIds, setDoneIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("vasupradah_alert_done") || "[]"));
    } catch (e) {
      return /* @__PURE__ */ new Set();
    }
  });
  const markDone = (id) => setDoneIds((p) => {
    const s = new Set(p);
    s.has(id) ? s.delete(id) : s.add(id);
    try {
      localStorage.setItem("vasupradah_alert_done", JSON.stringify([...s]));
    } catch (e) {
    }
    return s;
  });
  const batches = (db.adviceOrders || []).filter((b) => (b.dispatch || []).length);
  const refresh = async () => {
    if (!(db.sheetUrl || "").trim()) {
      showToast("No Google Sheet connected on this device.", "err");
      return;
    }
    setRefreshing(true);
    try {
      const alerts = await pullAdviceAlertsFromSheet(db.sheetUrl);
      await commit((d) => {
        d.adviceOrders = alerts;
      }, "team sync pull");
      showToast(`Loaded ${alerts.length} advice alert(s).`);
    } catch (e) {
      showToast("Couldn't reach the sheet \u2014 is the Apps Script re-deployed?", "err");
    } finally {
      setRefreshing(false);
    }
  };
  const traceFor = (b, r, channel) => ({ at: Date.now(), by: user?.name || "staff", channel, batchId: b.id, title: b.title, side: b.side, stock: b.stock, code: r.code, name: r.name, amount: r.amount, qty: r.qty, model: b.model, subject: r.subject });
  const emailBatch = async (b) => {
    const withE = (b.dispatch || []).filter((r) => r.email && r.email.includes("@"));
    if (!withE.length) {
      showToast("No email addresses in this alert.", "err");
      return;
    }
    if (!(db.sheetUrl || "").trim()) {
      showToast("No Google Sheet connected on this device.", "err");
      return;
    }
    setSending(true);
    try {
      const recipients = withE.map((r) => ({ email: r.email, name: r.name, subject: r.subject, body: r.body }));
      const startedAt = Date.now();
      await fetch(db.sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: db.sheetToken || "", type: "greeting_email", image: "", subject: "Investment advice", bodyText: "", recipients, personalize: true, replyTo: approveReplyTo(db), fromName: db.advisorName || "Vasupradah Investment Advisory" })
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
      else {
        logAdviceTrace(db, withE.map((r) => traceFor(b, r, "email")));
        showToast(result || `Emailing ${withE.length} client(s).`);
      }
    } catch (e) {
      showToast("Couldn't reach the email endpoint.", "err");
    } finally {
      setSending(false);
    }
  };
  const emailOne = async (b, r) => {
    if (!r.email || !r.email.includes("@")) {
      showToast("This client has no email address.", "err");
      return;
    }
    if (!(db.sheetUrl || "").trim()) {
      showToast("No Google Sheet connected on this device.", "err");
      return;
    }
    setSending(true);
    try {
      await fetch(db.sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: db.sheetToken || "", type: "greeting_email", image: "", subject: "Investment advice", bodyText: "", recipients: [{ email: r.email, name: r.name, subject: r.subject, body: r.body }], personalize: true, replyTo: approveReplyTo(db), fromName: db.advisorName || "Vasupradah Investment Advisory" })
      });
      setSentEmail((p) => {
        const s = new Set(p);
        s.add(b.id + ":" + r.code);
        return s;
      });
      logAdviceTrace(db, [traceFor(b, r, "email")]);
      showToast(`Re-sent to ${r.name} by email.`);
    } catch (e) {
      showToast("Couldn't reach the email endpoint.", "err");
    } finally {
      setSending(false);
    }
  };
  const dispList = (b) => b.dispatch || [];
  const waList = (b) => (b.dispatch || []).filter((r) => waNumber(r.whatsapp));
  const sendWaOne = (b, r) => {
    openWhatsApp(r.whatsapp, r.waBody || r.body);
    logAdviceTrace(db, [traceFor(b, r, "whatsapp")]);
    setSentWA((p) => {
      const s = new Set(p);
      s.add(b.id + ":" + r.code);
      return s;
    });
  };
  const waNext = (b) => {
    const r = waList(b).find((x) => !sentWA.has(b.id + ":" + x.code));
    if (!r) {
      showToast("All opened for this alert.", "ok");
      return;
    }
    sendWaOne(b, r);
  };
  const downloadExcel = (b) => {
    const rows = b.sheet && b.sheet.length ? b.sheet : (b.dispatch || []).map((d) => ({ Code: d.code, Name: d.name, "Order (INR)": d.amount, Qty: d.qty == null ? "" : d.qty, Email: d.email, WhatsApp: d.whatsapp }));
    if (!rows.length) {
      showToast("Nothing to export.", "err");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alert");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alert-${b.id}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-4 mb-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between gap-3 flex-wrap mb-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-semibold flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Bell, { size: 18, className: "text-indigo-600" }), " Customer advice alerts"), /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 max-w-2xl" }, "Advice generated by the Principal Officer appears here. Send it to each customer by email or WhatsApp, or download the list to follow up.")), /* @__PURE__ */ React.createElement("button", { onClick: refresh, disabled: refreshing, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(RefreshCw, { size: 15 }), " ", refreshing ? "Checking\u2026" : "Check for new alerts")), !batches.length && /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg" }, "No advice alerts yet.", isAdmin ? " Generate advice in the Advice Orders tab and press \u201CSave order\u201D." : " Press \u201CCheck for new alerts\u201D, or wait for the next sync."), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, batches.map((b) => {
    const done = doneIds.has(b.id);
    const emails = (b.dispatch || []).filter((r) => r.email && r.email.includes("@")).length;
    const was = waList(b).length;
    return /* @__PURE__ */ React.createElement("div", { key: b.id, className: `border rounded-lg px-3 py-2 ${done ? "border-slate-100 bg-slate-50 opacity-70" : "border-slate-200"}` }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-800 flex items-center gap-1.5" }, done && /* @__PURE__ */ React.createElement(Check, { size: 14, className: "text-emerald-600" }), b.title || `${b.side} ${b.stock}`, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500" }, b.model === "execution" ? "execute link" : b.model === "auto" ? "by client" : "email")), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, b.at ? new Date(b.at).toLocaleString("en-IN") : "", " \xB7 ", (b.dispatch || []).length, " client(s) \xB7 ", emails, " email \xB7 ", was, " WhatsApp")), /* @__PURE__ */ React.createElement("button", { onClick: () => emailBatch(b), disabled: sending || !emails, className: "text-xs px-2.5 py-1 rounded-md border border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center gap-1 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Mail, { size: 12 }), " Email all (", emails, ")"), /* @__PURE__ */ React.createElement("button", { onClick: () => setWaFor(waFor === b.id ? null : b.id), disabled: !(b.dispatch || []).length, className: "text-xs px-2.5 py-1 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Users, { size: 12 }), " Send to one client"), /* @__PURE__ */ React.createElement("button", { onClick: () => downloadExcel(b), className: "text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Download, { size: 12 }), " Excel"), /* @__PURE__ */ React.createElement("button", { onClick: () => markDone(b.id), className: `text-xs px-2.5 py-1 rounded-md border flex items-center gap-1 ${done ? "border-slate-200 text-slate-500" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}` }, /* @__PURE__ */ React.createElement(Check, { size: 12 }), " ", done ? "Reopen" : "Mark done")), waFor === b.id && /* @__PURE__ */ React.createElement("div", { className: "mt-2 border-t border-slate-100 pt-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-500" }, "Resend to one client \u2014 use this if a customer missed the mail or couldn't execute."), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 ml-auto" }, waList(b).filter((r) => sentWA.has(b.id + ":" + r.code)).length, " WA \xB7 ", dispList(b).filter((r) => sentEmail.has(b.id + ":" + r.code)).length, " email resent")), /* @__PURE__ */ React.createElement("input", { placeholder: "Filter by name / code\u2026", onChange: (e) => setWaQuery(e.target.value), value: waQuery, className: "w-full mb-1.5 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500" }), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg divide-y divide-slate-100", style: { maxHeight: "45vh", overflowY: "auto" } }, dispList(b).filter((r) => {
      const t = waQuery.trim().toLowerCase();
      return !t || String(r.name).toLowerCase().includes(t) || String(r.code).toLowerCase().includes(t);
    }).map((r) => {
      const es = sentEmail.has(b.id + ":" + r.code), ws = sentWA.has(b.id + ":" + r.code);
      const hasEmail = r.email && r.email.includes("@"), hasWa = waNumber(r.whatsapp);
      return /* @__PURE__ */ React.createElement("div", { key: r.code, className: "flex items-center gap-2 px-3 py-1.5" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-800 truncate" }, r.name, " ", /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400" }, r.code)), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, r.amount ? money(r.amount) : "", hasEmail ? ` \xB7 ${r.email}` : " \xB7 no email", hasWa ? ` \xB7 ${waDisplay(r.whatsapp)}` : " \xB7 no WhatsApp")), /* @__PURE__ */ React.createElement("button", { onClick: () => emailOne(b, r), disabled: sending || !hasEmail, className: `text-xs px-2.5 py-1 rounded-md flex items-center gap-1 shrink-0 border ${es ? "border-indigo-200 text-indigo-700 bg-indigo-50" : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"} disabled:opacity-40` }, /* @__PURE__ */ React.createElement(Mail, { size: 12 }), " ", es ? "Email \u2713" : "Email"), /* @__PURE__ */ React.createElement("button", { onClick: () => sendWaOne(b, r), disabled: !hasWa, className: `text-xs px-2.5 py-1 rounded-md flex items-center gap-1 shrink-0 ${ws ? "border border-emerald-200 text-emerald-700 bg-emerald-50" : "bg-emerald-600 hover:bg-emerald-700 text-white"} disabled:opacity-40` }, /* @__PURE__ */ React.createElement(Send, { size: 12 }), " ", ws ? "WA \u2713" : "WhatsApp"));
    }))));
  })));
}
function AdviceTab({ db, user, commit, showToast }) {
  const [pending, setPending] = useState(null);
  const [sheetPending, setSheetPending] = useState(null);
  const [card, setCard] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [link, setLink] = useState(db.reportLink || "");
  const [q, setQ] = useState("");
  const [actFilter, setActFilter] = useState("All");
  const [symFilter, setSymFilter] = useState("All");
  const [preview, setPreview] = useState(null);
  const inputRef = useRef();
  useEffect(() => {
    setLink(db.reportLink || "");
  }, [db.version]);
  const readFile = (file, cb) => {
    setBusy(true);
    const ext = file.name.split(".").pop().toLowerCase();
    const done = (rows2) => {
      setBusy(false);
      cb(rows2, file.name);
    };
    if (ext === "csv" || ext === "txt") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (r) => done(r.data),
        error: () => {
          setBusy(false);
          showToast("Could not read the CSV.", "err");
        }
      });
    } else if (["xlsx", "xls", "xlsm"].includes(ext)) {
      const r = new FileReader();
      r.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          done(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }));
        } catch {
          setBusy(false);
          showToast("Could not read the Excel file.", "err");
        }
      };
      r.readAsArrayBuffer(file);
    } else {
      setBusy(false);
      showToast("Use a .csv or .xlsx file.", "err");
    }
  };
  const onFile = (file) => {
    readFile(file, (rows2, fname) => {
      const recs = rows2.map(parseAdviceRow).filter((r) => r.code);
      const fileSym = (fname.split(/[._]/)[0] || "").toUpperCase();
      const symbol = recs.find((r) => r.symbol)?.symbol || fileSym;
      const company = recs.find((r) => r.company)?.company || symbol;
      const date = recs.find((r) => r.date)?.date || "";
      const buys = recs.filter((r) => r.action === "BUY").length;
      const sells = recs.filter((r) => r.action === "SELL").length;
      setPending({ recs, symbol, company, date, buys, sells });
    });
  };
  const apply = async () => {
    const { recs, symbol, company, date } = pending;
    const id = (symbol + "_" + (date || "")).replace(/[^A-Za-z0-9_]/g, "") || symbol;
    await commit((d) => {
      if (!d.advice) d.advice = {};
      d.advice[id] = {
        symbol,
        company,
        date,
        at: Date.now(),
        rows: recs.map((r) => ({ code: r.code, descriptor: r.descriptor, action: r.action, quantity: r.quantity, price: r.price }))
      };
    }, `advice ${symbol}`);
    showToast(`${symbol}: ${recs.length} advice rows loaded.`);
    setPending(null);
  };
  const clearBatch = (id, sym) => commit((d) => {
    if (d.advice) delete d.advice[id];
  }, `clear advice ${sym}`).then(() => showToast("Advice list cleared."));
  const saveLink = () => commit((d) => {
    d.reportLink = link.trim();
  }, "set report link").then(() => showToast("Report link saved."));
  const loadFromSheet = async () => {
    const url = (db.sheetUrl || "").trim();
    if (!url) {
      showToast("Set your Google Sheet web-app URL in Settings \u2192 Google Sheet backup first.", "err");
      return;
    }
    setLoadingSheet(true);
    try {
      const res = await fetch(withToken(url) + "&alerts=1");
      const data = await res.json();
      const list = Array.isArray(data.alerts) ? data.alerts : [];
      if (!list.length) {
        showToast("No rows found in the sheet's \u201CAlerts\u201D tab.", "err");
        return;
      }
      const recs = list.map(parseAlertRow).filter((r) => r.code);
      if (!recs.length) {
        showToast("Rows found, but no client codes matched. Check the \u201CClient code\u201D column.", "err");
        return;
      }
      const groups = {};
      for (const r of recs) {
        const sym = r.symbol || "ALERT";
        const id = (sym + "_" + (r.date || "")).replace(/[^A-Za-z0-9_]/g, "") || sym;
        if (!groups[id]) groups[id] = { id, symbol: sym, company: r.company || sym, date: r.date || "", rows: [] };
        groups[id].rows.push(r);
      }
      setSheetPending({ groups: Object.values(groups), count: recs.length, stocks: Object.keys(groups).length });
    } catch (e) {
      showToast("Couldn't reach the sheet. Check the /exec URL is deployed and set to \u201CAnyone\u201D.", "err");
    } finally {
      setLoadingSheet(false);
    }
  };
  const applySheet = async () => {
    await commit((d) => {
      if (!d.advice) d.advice = {};
      for (const g of sheetPending.groups) {
        d.advice[g.id] = {
          symbol: g.symbol,
          company: g.company,
          date: g.date,
          at: Date.now(),
          rows: g.rows.map((r) => ({ code: r.code, descriptor: r.descriptor, action: r.action, quantity: r.quantity, price: r.price, note: r.note }))
        };
      }
    }, "alerts from sheet");
    showToast(`Loaded ${sheetPending.count} alert(s) across ${sheetPending.stocks} stock(s) from the sheet.`);
    setSheetPending(null);
  };
  const rows = useMemo(() => {
    const out = [];
    for (const [id, b] of Object.entries(db.advice || {})) {
      for (const r of b.rows) {
        const c = db.clients[r.code];
        out.push({
          id,
          symbol: b.symbol,
          company: b.company,
          date: b.date,
          code: r.code,
          descriptor: r.descriptor,
          action: r.action,
          quantity: r.quantity,
          price: r.price,
          note: r.note || "",
          name: c?.name || "",
          whatsapp: c?.whatsapp || "",
          email: c?.email || ""
        });
      }
    }
    let arr = out;
    if (actFilter !== "All") arr = arr.filter((r) => r.action === actFilter);
    if (symFilter !== "All") arr = arr.filter((r) => r.symbol === symFilter);
    const s = q.trim().toLowerCase();
    if (s) arr = arr.filter((r) => [r.code, r.name, r.descriptor, r.symbol, r.company].some((x) => String(x || "").toLowerCase().includes(s)));
    return arr.sort((a, b) => String(a.symbol).localeCompare(b.symbol) || String(a.name || a.code).localeCompare(String(b.name || b.code)));
  }, [db.advice, db.clients, actFilter, symFilter, q]);
  const symbols = useMemo(() => Array.from(new Set(Object.values(db.advice || {}).map((b) => b.symbol))).sort(), [db.advice]);
  const batches = useMemo(() => Object.entries(db.advice || {}), [db.advice]);
  const missing = useMemo(() => rows.filter((r) => !waNumber(db.clients[r.code]?.whatsapp)).length, [rows, db.clients]);
  const sendWA = (row, kind) => {
    if (!waNumber(db.clients[row.code]?.whatsapp)) {
      showToast("No WhatsApp number \u2014 upload the client master or set it.", "err");
      return;
    }
    const msg = kind === "report" ? buildReportMessage(db, row, link) : buildAdviceMessage(db, row, link);
    openWhatsApp(db.clients[row.code]?.whatsapp, msg);
  };
  const sendEmail = (row, kind) => {
    const c = db.clients[row.code];
    if (!c?.email) {
      showToast("No email for this client.", "err");
      return;
    }
    const subj = kind === "report" ? `Research report \u2014 ${row.company || row.symbol}` : `Advice: ${row.action} ${row.company || row.symbol}`;
    const body = kind === "report" ? buildReportMessage(db, row, link) : buildAdviceMessage(db, row, link);
    window.location.href = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  };
  const copyEmails = () => {
    const emails = Array.from(new Set(rows.map((r) => db.clients[r.code]?.email).filter(Boolean)));
    if (!emails.length) {
      showToast("No emails found for these clients.", "err");
      return;
    }
    copyText(emails.join(", ")).then(() => showToast(`${emails.length} emails copied \u2014 paste into BCC and attach the report.`)).catch(() => showToast("Copy failed.", "err"));
  };
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(AdviceAlertsPanel, { db, user, commit, showToast }), /* @__PURE__ */ React.createElement(AdviceTracePanel, { db, showToast }), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-6 mb-4" }, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-semibold mb-1 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Bell, { size: 18 }), " Buy / Sell advice alerts"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 mb-4" }, "Upload an advice file (one stock). The symbol, ", /* @__PURE__ */ React.createElement("b", null, "BUY/SELL"), ", quantity and price are read from the sheet (symbol falls back to the file name's first word). Each client is matched to your master for the WhatsApp number. Re-uploading the same stock + date replaces that list."), /* @__PURE__ */ React.createElement(
    "div",
    {
      onDragOver: (e) => e.preventDefault(),
      onDrop: (e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
      },
      onClick: () => inputRef.current.click(),
      className: "border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40"
    },
    /* @__PURE__ */ React.createElement(FileSpreadsheet, { size: 26, className: "mx-auto text-slate-400 mb-2" }),
    /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-600" }, busy ? "Reading\u2026" : "Drop an advice sheet here, or click to choose"),
    /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mt-1" }, ".csv \xB7 .xlsx"),
    /* @__PURE__ */ React.createElement(
      "input",
      {
        ref: inputRef,
        type: "file",
        accept: ".csv,.xlsx,.xls,.xlsm",
        className: "hidden",
        onChange: (e) => e.target.files[0] && onFile(e.target.files[0])
      }
    )
  ), pending && /* @__PURE__ */ React.createElement("div", { className: "mt-4 border border-slate-100 rounded-lg p-4" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm mb-2" }, /* @__PURE__ */ React.createElement("b", null, pending.symbol), " ", pending.company ? "\xB7 " + pending.company : "", " ", pending.date ? "\xB7 " + pending.date : ""), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 gap-3 mb-3" }, /* @__PURE__ */ React.createElement(MiniStat, { label: "Rows", value: pending.recs.length }), /* @__PURE__ */ React.createElement(MiniStat, { label: "BUY", value: pending.buys, tone: "pos" }), /* @__PURE__ */ React.createElement(MiniStat, { label: "SELL", value: pending.sells, tone: "neg" })), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("button", { onClick: apply, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Check, { size: 16 }), " Load advice list"), /* @__PURE__ */ React.createElement("button", { onClick: () => setPending(null), className: "text-slate-500 text-sm px-4 py-2 rounded-lg hover:bg-slate-100" }, "Cancel"))), /* @__PURE__ */ React.createElement("div", { className: "mt-4 pt-4 border-t border-slate-100" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: loadFromSheet,
      disabled: loadingSheet,
      className: "bg-slate-700 hover:bg-slate-800 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
    },
    /* @__PURE__ */ React.createElement(FileSpreadsheet, { size: 15 }),
    " ",
    loadingSheet ? "Reading sheet\u2026" : "Load alerts from the sheet"
  ), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400" }, "Reads an ", /* @__PURE__ */ React.createElement("b", null, "\u201CAlerts\u201D"), " tab from your linked Google Sheet (columns: Client code, Symbol, Action, Quantity, Price, Date, Note).")), sheetPending && /* @__PURE__ */ React.createElement("div", { className: "mt-3 border border-slate-100 rounded-lg p-4 flex items-center gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex-1 text-sm" }, "Found ", /* @__PURE__ */ React.createElement("b", null, sheetPending.count), " alert row(s) across ", /* @__PURE__ */ React.createElement("b", null, sheetPending.stocks), " stock(s) in the sheet."), /* @__PURE__ */ React.createElement("button", { onClick: applySheet, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Check, { size: 16 }), " Load these"), /* @__PURE__ */ React.createElement("button", { onClick: () => setSheetPending(null), className: "text-slate-500 text-sm px-3 py-2 rounded-lg hover:bg-slate-100" }, "Cancel")))), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-5 mb-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold mb-2 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(FileText, { size: 16 }), " Research report"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-3" }, "Paste a ", /* @__PURE__ */ React.createElement("b", null, "link to the report"), " (host the HTML anywhere \u2014 Drive, your site). The link is included when you send a report on WhatsApp or email, and it can be added to the advice message too. WhatsApp can't auto-attach a file, so to send the HTML itself, use ", /* @__PURE__ */ React.createElement("b", null, "Copy emails (BCC)"), " and attach it in one email."), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      value: link,
      onChange: (e) => setLink(e.target.value),
      placeholder: "https://\u2026/research-report.html",
      className: "flex-1 min-w-[220px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    }
  ), /* @__PURE__ */ React.createElement("button", { onClick: saveLink, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg" }, "Save link"), /* @__PURE__ */ React.createElement("button", { onClick: copyEmails, className: "text-sm text-slate-700 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Mail, { size: 15 }), " Copy emails (BCC)"))), batches.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mb-3" }, batches.map(([id, b]) => /* @__PURE__ */ React.createElement("span", { key: id, className: "inline-flex items-center gap-2 text-xs bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1" }, /* @__PURE__ */ React.createElement("b", null, b.symbol), " ", b.date, " \xB7 ", b.rows.length, /* @__PURE__ */ React.createElement("button", { onClick: () => clearBatch(id, b.symbol), className: "text-slate-400 hover:text-rose-600" }, /* @__PURE__ */ React.createElement(X, { size: 13 }))))), missing > 0 && /* @__PURE__ */ React.createElement("div", { className: "mb-3 flex items-center gap-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 14 }), " ", missing, " client(s) in this list have no WhatsApp number. Upload the client master to map them."), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-2 mb-3" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: actFilter,
      onChange: (e) => setActFilter(e.target.value),
      className: "px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
    },
    /* @__PURE__ */ React.createElement("option", { value: "All" }, "BUY & SELL"),
    /* @__PURE__ */ React.createElement("option", { value: "BUY" }, "BUY only"),
    /* @__PURE__ */ React.createElement("option", { value: "SELL" }, "SELL only")
  ), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: symFilter,
      onChange: (e) => setSymFilter(e.target.value),
      className: "px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
    },
    /* @__PURE__ */ React.createElement("option", { value: "All" }, "All stocks"),
    symbols.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }, s))
  ), /* @__PURE__ */ React.createElement("div", { className: "relative flex-1 min-w-[180px] max-w-xs" }, /* @__PURE__ */ React.createElement(Search, { size: 15, className: "absolute left-3 top-2.5 text-slate-400" }), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: q,
      onChange: (e) => setQ(e.target.value),
      placeholder: "Search code, name, stock\u2026",
      className: "w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    }
  )), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400 ml-auto" }, rows.length, " recipients")), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide" }, /* @__PURE__ */ React.createElement(Th, null, "Stock"), /* @__PURE__ */ React.createElement(Th, null, "Action"), /* @__PURE__ */ React.createElement(Th, null, "Client code"), /* @__PURE__ */ React.createElement(Th, null, "Client"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Qty"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Price"), /* @__PURE__ */ React.createElement(Th, { center: true }, "Send"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, rows.map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: r.id + r.code + i, className: "hover:bg-slate-50/70" }, /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "font-medium text-slate-800" }, r.symbol), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 truncate max-w-[150px]", title: r.company }, r.company)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("span", { className: `text-[11px] font-semibold px-2 py-0.5 rounded ${r.action === "SELL" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}` }, r.action || "BUY")), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 font-mono text-[12px] text-slate-600" }, r.code), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, r.name ? /* @__PURE__ */ React.createElement("span", { className: "text-slate-800" }, r.name) : /* @__PURE__ */ React.createElement("span", { className: "text-rose-500 text-xs", title: r.descriptor }, "\u2014 no master \u2014"), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, waDisplay(r.whatsapp) || "no number")), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums" }, fmtNum(r.quantity)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums" }, r.price ? fmtINR(r.price) : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center gap-1" }, /* @__PURE__ */ React.createElement(IconBtn, { title: "Send BUY/SELL alert on WhatsApp", tone: "wa", onClick: () => sendWA(r, "advice") }, /* @__PURE__ */ React.createElement(Send, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Send as image / HTML (JPG card for WhatsApp)", onClick: () => setCard(r) }, /* @__PURE__ */ React.createElement(Share2, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Email the alert", tone: "mail", onClick: () => sendEmail(r, "advice") }, /* @__PURE__ */ React.createElement(Mail, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Send research report link on WhatsApp", onClick: () => sendWA(r, "report") }, /* @__PURE__ */ React.createElement(FileText, { size: 15 })), /* @__PURE__ */ React.createElement(IconBtn, { title: "Preview", onClick: () => setPreview({ row: r, kind: "advice" }) }, /* @__PURE__ */ React.createElement(Eye, { size: 15 })))))), !rows.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 7, className: "px-3 py-10 text-center text-slate-400 text-sm" }, "No advice loaded. Upload a buy/sell file above.")))))), preview && /* @__PURE__ */ React.createElement(Modal, { onClose: () => setPreview(null), title: `${preview.kind === "report" ? "Report" : "Advice"} \xB7 ${preview.row.name || preview.row.code}` }, /* @__PURE__ */ React.createElement("pre", { className: "whitespace-pre-wrap text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-72 overflow-y-auto" }, preview.kind === "report" ? buildReportMessage(db, preview.row, link) : buildAdviceMessage(db, preview.row, link)), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 mt-4" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
    sendWA(preview.row, preview.kind);
    setPreview(null);
  }, className: "bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 flex-1 justify-center" }, /* @__PURE__ */ React.createElement(Send, { size: 15 }), " WhatsApp"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    sendEmail(preview.row, preview.kind);
    setPreview(null);
  }, className: "bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 flex-1 justify-center" }, /* @__PURE__ */ React.createElement(Mail, { size: 15 }), " Email"), /* @__PURE__ */ React.createElement("button", { onClick: () => setPreview((p) => ({ ...p, kind: p.kind === "report" ? "advice" : "report" })), className: "text-slate-600 text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50" }, preview.kind === "report" ? "Show advice" : "Show report"))), card && /* @__PURE__ */ React.createElement(
    AlertShareModal,
    {
      data: buildAlertCard(db, card, link),
      target: { whatsapp: card.whatsapp, email: card.email, name: card.name || card.code },
      onClose: () => setCard(null),
      showToast
    }
  ));
}
function AlertShareModal({ data, target, onClose, showToast }) {
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
    if (!waNumber(target.whatsapp)) {
      showToast("No WhatsApp number for this client.", "err");
      return;
    }
    openWhatsApp(target.whatsapp, data.caption);
  };
  const mail = () => {
    if (!target.email) {
      showToast("No email for this client.", "err");
      return;
    }
    window.location.href = `mailto:${encodeURIComponent(target.email)}?subject=${encodeURIComponent("Trade alert \u2014 Vasupradah")}&body=${encodeURIComponent(data.caption)}`;
  };
  const copyText = () => copyText(data.caption).then(() => showToast("Alert text copied.")).catch(() => showToast("Copy failed.", "err"));
  return /* @__PURE__ */ React.createElement(Modal, { onClose, title: `Send alert \xB7 ${target.name}`, wide: true }, /* @__PURE__ */ React.createElement("div", { className: "text-xs text-slate-500 mb-3" }, "Send as a branded ", /* @__PURE__ */ React.createElement("b", null, "image (JPG)"), " \u2014 best for WhatsApp \u2014 an ", /* @__PURE__ */ React.createElement("b", null, "HTML file"), ", or plain ", /* @__PURE__ */ React.createElement("b", null, "text"), ". On a phone, \u201CShare image\u201D opens WhatsApp/Mail directly with the picture attached."), /* @__PURE__ */ React.createElement("div", { ref, className: "rounded-lg overflow-hidden border border-slate-200 max-h-[55vh] overflow-y-auto bg-slate-50" }, /* @__PURE__ */ React.createElement("div", { dangerouslySetInnerHTML: { __html: data.inner } })), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mt-4" }, /* @__PURE__ */ React.createElement("button", { onClick: shareJpg, disabled: busy, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Share2, { size: 15 }), " ", busy ? "Rendering\u2026" : "Share image"), /* @__PURE__ */ React.createElement("button", { onClick: saveJpg, disabled: busy, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Download, { size: 15 }), " Save JPG"), /* @__PURE__ */ React.createElement("button", { onClick: downloadHTML, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(FileText, { size: 15 }), " Save HTML"), /* @__PURE__ */ React.createElement("button", { onClick: wa, className: "text-sm px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Send, { size: 15 }), " WhatsApp text"), /* @__PURE__ */ React.createElement("button", { onClick: mail, className: "text-sm px-3 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Mail, { size: 15 }), " Email"), /* @__PURE__ */ React.createElement("button", { onClick: copyText, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50" }, "Copy text")));
}

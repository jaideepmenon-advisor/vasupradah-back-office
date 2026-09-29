function parseHoldingRow(row) {
  const rec = pickFields(row);
  const quantity = num(rec.quantity), invested = num(rec.invested), current = num(rec.current);
  return {
    code: String(rec.code ?? "").trim(),
    descriptor: String(rec.descriptor ?? "").trim(),
    quantity,
    invested,
    current,
    purchasePrice: quantity ? invested / quantity : 0,
    currentPrice: quantity ? current / quantity : 0,
    realisedGain: num(rec.realisedGain),
    dividend: num(rec.dividend),
    todaysGain: num(rec.todaysGain),
    totalGain: num(rec.totalGain),
    weightage: num(rec.weightage)
  };
}
function parseCombinedRow(row) {
  const g = {};
  for (const k in row) g[normKey(k)] = row[k];
  const code = String(g.portfoliocode ?? g.clientcode ?? g.code ?? "").trim();
  const nse = String(g.nse ?? g.nsecode ?? g.symbol ?? "").trim().toUpperCase();
  const asset = String(g.assetname ?? g.companyname ?? g.company ?? "").trim();
  const isin = String(g.isin ?? g.isincode ?? "").trim().toUpperCase();
  const stock = (nse || asset || isin).toUpperCase();
  const quantity = num(g.quantity ?? g.qty);
  const invested = num(g.investedamount ?? g.invested);
  const cmp = num(g.cmp ?? g.currentprice ?? g.ltp);
  const current = num(g.currentamount ?? g.currentvalue ?? (cmp && quantity ? cmp * quantity : 0));
  const avg = num(g.avgbuyprice ?? g.averagebuyprice ?? g.avgprice ?? (quantity ? invested / quantity : 0));
  return {
    code,
    stock,
    isin,
    quantity,
    invested,
    current,
    cmp,
    avg,
    descriptor: String(g.portfolio ?? g.portfolioname ?? "").trim()
  };
}
// Advice contacts: client code, client name, email id, mobile number, risk
// category, PAN. The mobile here is the number the client uses to open an order
// link, which is deliberately separate from the WhatsApp number in Holdings.
// Uploaded advice-contact columns. The country code is optional and sits just
// before the mobile number, so both the 6- and 7-column layouts are read.
const CONTACT_FIELDS = ["code", "name", "email", "cc", "mobile", "risk", "pan"];
const CONTACT_FIELDS_NO_CC = ["code", "name", "email", "mobile", "risk", "pan"];
const contactFieldsFor = (n) => n >= 7 ? CONTACT_FIELDS : CONTACT_FIELDS_NO_CC;
const CONTACT_HEADER_FIELD = {
  clientcode: "code", code: "code", portfoliocode: "code",
  clientname: "name", name: "name",
  emailid: "email", email: "email", emailaddress: "email",
  countrycode: "cc", country: "cc", isd: "cc", isdcode: "cc", dialcode: "cc", callingcode: "cc", stdcode: "cc",
  mobilenumber: "mobile", mobile: "mobile", phone: "mobile", phonenumber: "mobile",
  loginnumber: "mobile", loginmobile: "mobile",
  riskcategory: "risk", risk: "risk", category: "risk", riskprofile: "risk",
  pan: "pan", pannumber: "pan", panno: "pan"
};
const looksLikeContactHeader = (cells) => (cells || []).some((c) => !!CONTACT_HEADER_FIELD[normKey(c)]);
// Country code and mobile arrive in separate columns. Trust the split: the
// mobile column is the national number, so the two are simply joined.
function parseContactRow(rec) {
  const cc = String(rec.cc ?? "").trim();
  const mobile = waDisplay(rec.mobile);
  return {
    code: String(rec.code ?? "").trim(),
    name: String(rec.name ?? "").trim(),
    email: String(rec.email ?? "").trim(),
    cc,
    mobile,
    phone: joinPhone(cc, mobile),
    risk: normalizeRisk(rec.risk),
    pan: String(rec.pan ?? "").trim().toUpperCase()
  };
}
// Read a sheet given as rows of raw cells. Object keys can't be used for this:
// a header-less file whose first row holds numbers (a country code, a mobile)
// gets its columns reordered, because JS hoists integer-like keys.
function contactsFromGrid(rows) {
  const grid = (rows || []).filter((r) => Array.isArray(r) && r.some((v) => String(v ?? "").trim() !== ""));
  if (!grid.length) return [];
  const header = looksLikeContactHeader(grid[0]);
  const fields = header
    ? grid[0].map((h) => CONTACT_HEADER_FIELD[normKey(h)] || null)
    : contactFieldsFor(grid[0].length);
  const body = header ? grid.slice(1) : grid;
  return body.map((arr) => {
    const rec = {};
    fields.forEach((f, i) => {
      if (f) rec[f] = arr[i];
    });
    return parseContactRow(rec);
  }).filter((r) => r.code);
}
function parseClientRow(row) {
  const rec = pickFields(row);
  return {
    code: String(rec.code ?? "").trim(),
    name: String(rec.name ?? "").trim(),
    email: String(rec.email ?? "").trim(),
    whatsapp: waDisplay(rec.whatsapp),
    risk: normalizeRisk(rec.risk)
  };
}
async function pushAdviceContacts(db, rows) {
  if (!(db.sheetUrl || "").trim() || !(rows || []).length) return false;
  try {
    await fetch(db.sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "advice_contacts", rows })
    });
    return true;
  } catch (e) {
    return false;
  }
}
// ---- Billing: fee plans -------------------------------------------------
// How often each billing frequency comes round in a year, used to annualise a
// plan so it can be checked against the SEBI fee cap.
async function pullManualTrades(url) {
  const res = await fetch(withToken(url) + "&manual_trades=1");
  const data = await res.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length < 2) return [];
  return rows.slice(1).filter((r) => String(r[0] || "").trim()).map((r) => ({
    id: String(r[0]),
    date: r[1] instanceof Date ? r[1].toISOString().slice(0, 10) : String(r[1] || ""),
    code: String(r[2] || ""),
    name: String(r[3] || ""),
    symbol: String(r[4] || ""),
    action: String(r[5] || ""),
    quantity: num(r[6]),
    price: num(r[7]),
    amount: num(r[8]),
    note: String(r[9] || ""),
    by: String(r[10] || "")
  }));
}
async function pushManualTrade(db, payload) {
  if (!(db.sheetUrl || "").trim()) return false;
  try {
    await fetch(db.sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ token: db.sheetToken || "", type: "manual_trade" }, payload))
    });
    return true;
  } catch (e) {
    return false;
  }
}
function ManualTradePanel({ db, showToast }) {
  const blank = { date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), code: "", symbol: "", action: "BUY", quantity: "", price: "", note: "" };
  const [t, setT] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = (patch) => setT((x) => ({ ...x, ...patch }));
  const clientName = (code) => (db.clients || {})[String(code).trim()]?.name || "";
  const amount = (num(t.quantity) || 0) * (num(t.price) || 0);
  const load = async () => {
    if (!(db.sheetUrl || "").trim()) {
      showToast("Connect your Google Sheet in Settings first.", "err");
      return;
    }
    setLoading(true);
    try {
      setRecent(await pullManualTrades(db.sheetUrl));
    } catch (e) {
      showToast("Couldn't read the ManualTrades tab \u2014 is the script re-deployed?", "err");
    } finally {
      setLoading(false);
    }
  };
  const save = async () => {
    const code = String(t.code).trim(), sym = String(t.symbol).trim().toUpperCase();
    if (!code) {
      showToast("Enter the client code.", "err");
      return;
    }
    if (!(db.clients || {})[code]) {
      showToast(`No client with code ${code}. Check the code before saving.`, "err");
      return;
    }
    if (!sym) {
      showToast("Enter the stock symbol.", "err");
      return;
    }
    if (!(num(t.quantity) > 0)) {
      showToast("Enter a quantity greater than zero.", "err");
      return;
    }
    if (!(num(t.price) > 0)) {
      showToast("Enter a price greater than zero.", "err");
      return;
    }
    if (!(db.sheetUrl || "").trim()) {
      showToast("Connect your Google Sheet in Settings first.", "err");
      return;
    }
    setBusy(true);
    const trade = {
      id: "MT" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: t.date,
      code,
      name: clientName(code),
      symbol: sym,
      action: t.action,
      quantity: num(t.quantity),
      price: num(t.price),
      amount,
      note: t.note,
      by: db.adminName || "admin"
    };
    const ok = await pushManualTrade(db, { trade });
    setBusy(false);
    if (!ok) {
      showToast("Couldn't reach the sheet \u2014 nothing was saved. Try again.", "err");
      return;
    }
    showToast(`${t.action} ${sym} recorded for ${clientName(code) || code}.`);
    setT({ ...blank, code, date: t.date });
    setTimeout(load, 1200);
  };
  const del = async (row) => {
    if (!window.confirm(`Delete the ${row.action} ${row.symbol} entry for ${row.name || row.code}? This is the only way a recorded trade is ever removed.`)) return;
    await pushManualTrade(db, { action: "delete", id: row.id });
    showToast("Entry deleted.");
    setTimeout(load, 1200);
  };
  const inCls = "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const lbl = "text-[11px] text-slate-500 block mb-1";
  return /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-6 mt-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3 flex-wrap mb-1" }, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-semibold flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Plus, { size: 18, className: "text-indigo-600" }), " Enter a trade manually"), /* @__PURE__ */ React.createElement("button", { onClick: load, disabled: loading, className: "text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(RefreshCw, { size: 14 }), " ", loading ? "Loading\u2026" : "Show recorded")), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 mb-4" }, "For trades that don't come through GridKey. They're written straight to a ", /* @__PURE__ */ React.createElement("b", null, "ManualTrades"), " tab in your sheet, which the GridKey sync never touches \u2014 so they can't be overwritten. They feed holdings and performance alongside the broker data."), /* @__PURE__ */ React.createElement("div", { className: "grid md:grid-cols-3 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Trade date"), /* @__PURE__ */ React.createElement("input", { type: "date", value: t.date, onChange: (e) => set({ date: e.target.value }), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Client code"), /* @__PURE__ */ React.createElement("input", { value: t.code, onChange: (e) => set({ code: e.target.value }), placeholder: "e.g. AAG39939", className: inCls }), String(t.code).trim() && /* @__PURE__ */ React.createElement("div", { className: `text-[11px] mt-1 ${clientName(t.code) ? "text-slate-500" : "text-rose-600"}` }, clientName(t.code) || "no client with this code")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Stock symbol"), /* @__PURE__ */ React.createElement("input", { value: t.symbol, onChange: (e) => set({ symbol: e.target.value.toUpperCase() }), placeholder: "e.g. INFY", className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Action"), /* @__PURE__ */ React.createElement("select", { value: t.action, onChange: (e) => set({ action: e.target.value }), className: inCls }, /* @__PURE__ */ React.createElement("option", null, "BUY"), /* @__PURE__ */ React.createElement("option", null, "SELL"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Quantity"), /* @__PURE__ */ React.createElement("input", { type: "number", value: t.quantity, onChange: (e) => set({ quantity: e.target.value }), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Price (\u20B9)"), /* @__PURE__ */ React.createElement("input", { type: "number", value: t.price, onChange: (e) => set({ price: e.target.value }), className: inCls })), /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Note (optional)"), /* @__PURE__ */ React.createElement("input", { value: t.note, onChange: (e) => set({ note: e.target.value }), placeholder: "e.g. off-market transfer, correction", className: inCls })), /* @__PURE__ */ React.createElement("div", { className: "flex items-end pb-1" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-600" }, "Value: ", /* @__PURE__ */ React.createElement("b", { className: "tabular-nums" }, fmtINR(amount))))), /* @__PURE__ */ React.createElement("div", { className: "mt-3" }, /* @__PURE__ */ React.createElement("button", { onClick: save, disabled: busy, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Check, { size: 15 }), " ", busy ? "Saving\u2026" : "Record trade")), recent && /* @__PURE__ */ React.createElement("div", { className: "mt-4 border-t border-slate-100 pt-3" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm font-medium text-slate-700 mb-2" }, "Recorded manual trades (", recent.length, ")"), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg overflow-hidden", style: { maxHeight: "40vh", overflowY: "auto" } }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Date"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Client"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Stock"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Action"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Qty"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Price"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Value"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, recent.map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.id }, /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, r.date), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "text-slate-800" }, r.name || r.code), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, r.code)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-slate-700" }, r.symbol), /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-[12px] font-medium ${r.action === "SELL" ? "text-rose-600" : "text-emerald-600"}` }, r.action), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums" }, fmtNum(r.quantity)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums" }, fmtINR(r.price)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums" }, fmtINR(r.amount)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right" }, /* @__PURE__ */ React.createElement("button", { onClick: () => del(r), className: "text-rose-500 hover:bg-rose-50 rounded p-1" }, /* @__PURE__ */ React.createElement(Trash2, { size: 14 }))))), !recent.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 8, className: "px-3 py-6 text-center text-slate-400 text-sm" }, "No manual trades recorded yet.")))))));
}
function UploadTab({ db, commit, showToast }) {
  const [mode, setMode] = useState("holdings");
  const [stock, setStock] = useState("");
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef();
  const reset = () => {
    setPending(null);
  };
  const readFile = (file, cb) => {
    setBusy(true);
    const ext = file.name.split(".").pop().toLowerCase();
    const done = (rows) => {
      setBusy(false);
      cb(rows, file.name);
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
  // Rows of raw cells, so column order survives regardless of what's in row 1.
  const readGrid = (file, cb) => {
    setBusy(true);
    const ext = file.name.split(".").pop().toLowerCase();
    const done = (rows) => {
      setBusy(false);
      cb(rows);
    };
    if (ext === "csv" || ext === "txt") {
      Papa.parse(file, {
        header: false,
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
          done(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false }));
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
    if (mode === "combined") {
      readFile(file, (rows) => {
        const recs = rows.map(parseCombinedRow).filter((r) => r.code && r.stock);
        const held = recs.filter((r) => r.quantity > 0);
        const clients = new Set(held.map((r) => r.code));
        const stocks = new Set(held.map((r) => r.stock));
        const heldKeys = new Set(held.map((r) => r.code + "|" + r.stock));
        let dropped = 0;
        for (const c of Object.values(db.clients)) {
          for (const st of Object.keys(c.holdings || {})) {
            if (num(c.holdings[st].quantity) > 0 && !heldKeys.has(c.code + "|" + st)) dropped++;
          }
        }
        setPending({ kind: "combined", held, clients: clients.size, stocks: stocks.size, dropped });
      });
    } else if (mode === "holdings") {
      readFile(file, (rows, fname) => {
        if (!stock.trim()) {
          const guess = fname.split(/[._]/)[0];
          if (guess) setStock(guess.toUpperCase());
        }
        const recs = rows.map(parseHoldingRow).filter((r) => r.code);
        const st = (stock.trim() || fname.split(/[._]/)[0] || "").toUpperCase();
        const fileCodes = new Set(recs.map((r) => r.code));
        let added = 0, updated = 0, removed = 0, skipped = 0, absent = 0;
        for (const r of recs) {
          const has = db.clients[r.code]?.holdings?.[st];
          if (r.quantity <= 0) {
            has ? removed++ : skipped++;
          } else has ? updated++ : added++;
        }
        for (const c of Object.values(db.clients)) {
          if (c.holdings?.[st] && num(c.holdings[st].quantity) > 0 && !fileCodes.has(c.code)) absent++;
        }
        setPending({ kind: "holdings", recs, added, updated, removed, skipped, absent });
      });
    } else if (mode === "contacts") {
      readGrid(file, (rows) => {
        const recs = contactsFromGrid(rows);
        if (!recs.length) {
          showToast("No client codes found in that file \u2014 check the column order.", "err");
          return;
        }
        const withMobile = recs.filter((r) => waNumber(r.phone)).length;
        const unknown = recs.filter((r) => !db.clients[r.code]).length;
        const differs = recs.filter((r) => {
          const c = db.clients[r.code];
          return c && waNumber(r.phone) && waNumber(c.whatsapp) && waNumber(r.phone) !== waNumber(c.whatsapp);
        }).length;
        setPending({ kind: "contacts", recs, withMobile, unknown, differs });
      });
    } else {
      readFile(file, (rows) => {
        const recs = rows.map(parseClientRow).filter((r) => r.code);
        let added = 0, updated = 0;
        for (const r of recs) db.clients[r.code] ? updated++ : added++;
        setPending({ kind: "clients", recs, added, updated });
      });
    }
  };
  const applyCombined = async () => {
    const { held } = pending;
    const heldKeys = new Set(held.map((r) => r.code + "|" + r.stock));
    const cmpMap = {};
    const next = await commit((d) => {
      for (const r of held) {
        let c = d.clients[r.code];
        if (!c) c = d.clients[r.code] = { code: r.code, name: "", email: "", whatsapp: "", descriptor: r.descriptor, holdings: {} };
        if (r.descriptor && !c.descriptor) c.descriptor = r.descriptor;
        if (!c.holdings) c.holdings = {};
        c.holdings[r.stock] = {
          stock: r.stock,
          quantity: r.quantity,
          invested: r.invested,
          investedSheet: r.invested,
          investedManual: false,
          current: r.current,
          purchasePrice: r.avg || (r.quantity ? r.invested / r.quantity : 0),
          currentPrice: r.cmp || (r.quantity ? r.current / r.quantity : 0),
          isin: r.isin,
          updatedAt: Date.now()
        };
        if (r.cmp > 0) cmpMap[r.stock] = r.cmp;
      }
      for (const code of Object.keys(d.clients)) {
        const c = d.clients[code];
        for (const st of Object.keys(c.holdings || {})) {
          if (!heldKeys.has(code + "|" + st)) delete c.holdings[st];
        }
      }
      d.prices = Object.assign({}, d.prices || {}, cmpMap);
    }, "upload combined holdings");
    showToast(`Combined holdings applied: ${pending.clients} clients, ${pending.stocks} stocks, ${pending.dropped} sold-out position(s) removed.`);
    setPending(null);
    if (next?.autoBackup && next.sheetUrl && !next.teamSync) {
      const res = await backupToSheet(next);
      showToast(res.ok ? "Also backed up to Google Sheet." : res.msg || "Sheet backup failed \u2014 open Settings and click Back up now (push).", res.ok ? "ok" : "err");
    }
  };
  const applyHoldings = async () => {
    const st = stock.trim().toUpperCase();
    if (!st) {
      showToast("Enter the stock name first.", "err");
      return;
    }
    const { recs, added, updated, removed, absent } = pending;
    const fileCodes = new Set(recs.map((r) => r.code));
    const next = await commit((d) => {
      for (const r of recs) {
        let c = d.clients[r.code];
        if (!c) c = d.clients[r.code] = { code: r.code, name: "", email: "", whatsapp: "", descriptor: r.descriptor, holdings: {} };
        if (r.descriptor) c.descriptor = r.descriptor;
        if (!c.holdings) c.holdings = {};
        if (r.quantity <= 0) {
          delete c.holdings[st];
          continue;
        }
        const prev = c.holdings[st] || {};
        const manual = !!prev.investedManual;
        const invested = manual ? num(prev.invested) : r.invested;
        c.holdings[st] = {
          stock: st,
          quantity: r.quantity,
          invested,
          investedSheet: r.invested,
          investedManual: manual,
          current: r.current,
          purchasePrice: r.quantity ? invested / r.quantity : 0,
          currentPrice: r.quantity ? r.current / r.quantity : 0,
          realisedGain: r.realisedGain,
          dividend: r.dividend,
          totalGain: r.totalGain,
          weightage: r.weightage,
          updatedAt: Date.now()
        };
      }
      for (const code of Object.keys(d.clients)) {
        if (!fileCodes.has(code) && d.clients[code].holdings) delete d.clients[code].holdings[st];
      }
      for (const code of Object.keys(d.clients)) {
        const c = d.clients[code];
        if (!Object.keys(c.holdings || {}).length && !c.name && !c.whatsapp) delete d.clients[code];
      }
    }, `upload ${st} holdings`);
    showToast(`${st}: ${added} added, ${updated} updated, ${removed + (absent || 0)} removed.`);
    setPending(null);
    if (next?.autoBackup && next.sheetUrl && !next.teamSync) {
      const res = await backupToSheet(next);
      showToast(res.ok ? "Also backed up to Google Sheet." : res.msg || "Sheet backup failed \u2014 open Settings and click Back up now (push).", res.ok ? "ok" : "err");
    }
  };
  const applyContacts = async () => {
    const { recs } = pending;
    await commit((d) => {
      const m = { ...d.adviceContacts || {} }, now = Date.now();
      for (const r of recs) m[r.code] = { name: r.name, email: r.email, cc: r.cc, mobile: r.mobile, phone: r.phone, risk: r.risk, pan: r.pan, updatedAt: now };
      d.adviceContacts = m;
    }, "upload advice contacts");
    const ok = await pushAdviceContacts(db, recs);
    showToast(`Advice contacts: ${recs.length} row(s) saved${ok ? " to the sheet's AdviceContacts tab" : " on this device only \u2014 the sheet wasn't reachable"}.`, ok ? "ok" : "err");
    setPending(null);
  };
  const applyClients = async () => {
    const { recs, added, updated } = pending;
    await commit((d) => {
      for (const r of recs) {
        const c = d.clients[r.code] || { code: r.code, holdings: {} };
        if (r.name) c.name = r.name;
        if (r.email) c.email = r.email;
        if (r.whatsapp) c.whatsapp = r.whatsapp;
        if (r.risk) c.risk = r.risk;
        if (!c.holdings) c.holdings = {};
        d.clients[r.code] = c;
      }
    }, "upload client master");
    showToast(`Client master: ${added} added, ${updated} updated.`);
    setPending(null);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "max-w-3xl" }, /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 mb-4" }, /* @__PURE__ */ React.createElement(ModeBtn, { active: mode === "combined", icon: FileSpreadsheet, onClick: () => {
    setMode("combined");
    reset();
  } }, "Combined holdings (GridKey)"), /* @__PURE__ */ React.createElement(ModeBtn, { active: mode === "holdings", icon: Layers, onClick: () => {
    setMode("holdings");
    reset();
  } }, "Stock holdings"), /* @__PURE__ */ React.createElement(ModeBtn, { active: mode === "clients", icon: Contact, onClick: () => {
    setMode("clients");
    reset();
  } }, "Client master"), /* @__PURE__ */ React.createElement(ModeBtn, { active: mode === "contacts", icon: Share2, onClick: () => {
    setMode("contacts");
    reset();
  } }, "Advice contacts (order-link logins)")), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-6" }, mode === "combined" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-semibold mb-1 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(FileSpreadsheet, { size: 18 }), " Upload the GridKey combined holdings"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 mb-4" }, "This is the one file that has ", /* @__PURE__ */ React.createElement("b", null, "every client and every stock"), " in a single sheet \u2014 GridKey's", /* @__PURE__ */ React.createElement("b", null, " combined holdings"), " export (Holdings Overview \u2192 export). It is already ", /* @__PURE__ */ React.createElement("b", null, "split/bonus adjusted"), " and carries the live ", /* @__PURE__ */ React.createElement("b", null, "CMP"), ", so it fixes the quantity, average price and price for every holding at once. It replaces all current positions: stocks that have been fully sold are removed, and client names / WhatsApp numbers you already have are kept. Undo reverses it.")) : mode === "holdings" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-semibold mb-1 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Layers, { size: 18 }), " Upload one stock's holdings"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 mb-4" }, "Each file is ", /* @__PURE__ */ React.createElement("b", null, "one stock"), ", with a row per client (column 1 = client code, column 2 = client details). Type the stock name below \u2014 it's applied to every client in the file. ", /* @__PURE__ */ React.createElement("b", null, "Re-uploading the same stock replaces its holder list"), ": clients in the file are added or updated, and anyone not in the file (or with zero quantity) is removed from that stock. Other stocks are untouched, and Undo reverses it."), /* @__PURE__ */ React.createElement("label", { className: "text-xs text-slate-500" }, "Stock / scrip name"), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: stock,
      onChange: (e) => setStock(e.target.value),
      placeholder: "e.g. ABB",
      className: "w-full mt-1 mb-4 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    }
  )) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-semibold mb-1 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Contact, { size: 18 }), " Update client master"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 mb-4" }, "Upload the sheet of ", /* @__PURE__ */ React.createElement("b", null, "client code, client name, email, WhatsApp number"), ", and a 5th column for", /* @__PURE__ */ React.createElement("b", null, " risk category"), " (Low Risk / Medium to Low / Medium to High / High Risk / SIP; numbers 1\u20135 also work). It's matched to holdings by client code and used for messaging and the category report.")), /* @__PURE__ */ React.createElement(
    "div",
    {
      onDragOver: (e) => e.preventDefault(),
      onDrop: (e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
      },
      onClick: () => inputRef.current.click(),
      className: "border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40"
    },
    /* @__PURE__ */ React.createElement(FileSpreadsheet, { size: 28, className: "mx-auto text-slate-400 mb-2" }),
    /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-600" }, busy ? "Reading\u2026" : "Drop a sheet here, or click to choose"),
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
  )), pending && pending.kind === "combined" && /* @__PURE__ */ React.createElement(
    ReviewCard,
    {
      onApply: applyCombined,
      onCancel: () => setPending(null),
      rightFrom: 3,
      stats: [["Clients", pending.clients, "pos"], ["Stocks", pending.stocks], ["Positions", pending.held.length], ["Sold-out removed", pending.dropped, "neg"]],
      headers: ["Code", "Stock", "Details", "Qty", "Avg buy", "CMP", "Current"],
      rows: pending.held.slice(0, 200).map((r) => [r.code, r.stock, r.descriptor, fmtNum(r.quantity), fmtINR(r.avg), fmtINR(r.cmp), fmtINR(r.current), false]),
      applyLabel: `Apply combined holdings (${pending.clients} clients)`
    }
  ), pending && pending.kind === "holdings" && /* @__PURE__ */ React.createElement(
    ReviewCard,
    {
      onApply: applyHoldings,
      onCancel: () => setPending(null),
      rightFrom: 2,
      stats: [["Add", pending.added, "pos"], ["Update", pending.updated], ["Zero-out", pending.removed, "neg"], ["Drop (absent)", pending.absent, "neg"], ["Skipped", pending.skipped]],
      headers: ["Code", "Client details", "Qty", "Invested", "Current"],
      rows: pending.recs.slice(0, 200).map((r) => [r.code, r.descriptor, fmtNum(r.quantity), fmtINR(r.invested), fmtINR(r.current), r.quantity <= 0]),
      applyLabel: `Apply ${(stock.trim() || "").toUpperCase()} update`,
      disabled: !stock.trim()
    }
  ), pending && pending.kind === "clients" && /* @__PURE__ */ React.createElement(
    ReviewCard,
    {
      onApply: applyClients,
      onCancel: () => setPending(null),
      stats: [["Add", pending.added, "pos"], ["Update", pending.updated]],
      headers: ["Code", "Name", "Email", "WhatsApp", "Risk"],
      rows: pending.recs.slice(0, 200).map((r) => [r.code, r.name, r.email, waDisplay(r.whatsapp), r.risk || "\u2014", false]),
      applyLabel: "Apply client master"
    }
  ), pending && pending.kind === "contacts" && /* @__PURE__ */ React.createElement(
    ReviewCard,
    {
      onApply: applyContacts,
      onCancel: () => setPending(null),
      stats: [["Rows", pending.recs.length], ["With a mobile", pending.withMobile, "pos"], ["Differs from WhatsApp", pending.differs], ["Unknown code", pending.unknown, pending.unknown ? "neg" : null]],
      headers: ["Code", "Name", "Email", "Country", "Order-link number", "Risk", "PAN"],
      rows: pending.recs.slice(0, 200).map((r) => {
        const d = String(r.phone || "").replace(/\D/g, "");
        return [r.code, r.name, r.email, r.cc || "\u2014", r.phone || "\u2014", r.risk || "\u2014", r.pan || "\u2014", !(d.length >= 8 && d.length <= 15)];
      }),
      applyLabel: "Save advice contacts"
    }
  ), /* @__PURE__ */ React.createElement(ManualTradePanel, { db, showToast }));
}
function ReviewCard({ stats, headers, rows, applyLabel, disabled, rightFrom = null, onApply, onCancel }) {
  const isRight = (i) => rightFrom != null && i >= rightFrom;
  return /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-6 mt-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold mb-3" }, "Review before applying"), /* @__PURE__ */ React.createElement("div", { className: `grid gap-3 mb-4 ${stats.length <= 2 ? "grid-cols-2" : stats.length >= 5 ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}` }, stats.map(([label, value, tone]) => /* @__PURE__ */ React.createElement(MiniStat, { key: label, label, value, tone }))), /* @__PURE__ */ React.createElement("div", { className: "max-h-56 overflow-y-auto border border-slate-100 rounded-lg mb-4" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-xs" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 sticky top-0" }, /* @__PURE__ */ React.createElement("tr", null, headers.map((h, i) => /* @__PURE__ */ React.createElement(Th, { key: h, right: isRight(i) }, h)))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, rows.map((r, i) => {
    const strike = r[r.length - 1];
    const cells = r.slice(0, -1);
    return /* @__PURE__ */ React.createElement("tr", { key: i, className: strike ? "text-rose-400 line-through" : "" }, cells.map((c, j) => /* @__PURE__ */ React.createElement("td", { key: j, className: `px-3 py-1.5 ${isRight(j) ? "text-right" : ""} ${j === 1 ? "truncate max-w-[240px]" : ""}` }, c)));
  })))), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: onApply,
      disabled,
      className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
    },
    /* @__PURE__ */ React.createElement(Check, { size: 16 }),
    " ",
    applyLabel
  ), /* @__PURE__ */ React.createElement("button", { onClick: onCancel, className: "text-slate-500 text-sm px-4 py-2 rounded-lg hover:bg-slate-100" }, "Cancel")));
}
const ModeBtn = ({ active, icon: Icon, onClick, children }) => /* @__PURE__ */ React.createElement(
  "button",
  {
    onClick,
    className: `px-4 py-2 rounded-lg text-sm flex items-center gap-2 border ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`
  },
  /* @__PURE__ */ React.createElement(Icon, { size: 16 }),
  " ",
  children
);

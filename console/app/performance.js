const RATES_KEY = "vasupradah_rates_v1";
async function loadRates() {
  if (!hasStore) return null;
  try {
    const r = await window.storage.get(RATES_KEY, true);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function saveRates(t) {
  if (!hasStore) return true;
  try {
    await window.storage.set(RATES_KEY, JSON.stringify(t), true);
    return true;
  } catch (e) {
    console.error("rates save failed", e);
    return false;
  }
}
function deriveTrades(store) {
  const byClient = {};
  for (const t of store?.trades || []) {
    const [code, sym, date, ac, qty, price, amount] = t;
    const cl = byClient[code] || (byClient[code] = { flows: {}, lots: {} });
    const f = cl.flows[date] || (cl.flows[date] = [0, 0]);
    if (ac === "S") f[1] += amount;
    else f[0] += amount;
    (cl.lots[sym] = cl.lots[sym] || []).push([date, ac, qty, price, amount]);
  }
  for (const code in byClient) {
    const cl = byClient[code];
    cl.realized = {};
    cl.pos = {};
    cl.first = null;
    cl.last = null;
    for (const d in cl.flows) {
      if (!cl.first || d < cl.first) cl.first = d;
      if (!cl.last || d > cl.last) cl.last = d;
    }
    for (const sym in cl.lots) {
      const ls = cl.lots[sym].sort((a, b) => a[0] < b[0] ? -1 : 1);
      let q = 0, cost = 0;
      for (const [date, ac, qty, price, amount] of ls) {
        if (ac === "S") {
          const avg = q > 0 ? cost / q : 0;
          const sq = Math.min(qty, q);
          cl.realized[date] = (cl.realized[date] || 0) + (amount - avg * sq);
          cost -= avg * sq;
          q -= sq;
        } else {
          q += qty;
          cost += amount;
        }
      }
      if (q > 1e-6) cl.pos[sym] = [q, cost];
    }
    delete cl.lots;
  }
  return byClient;
}
function xirr(cfs) {
  if (!cfs || cfs.length < 2) return null;
  const base = new Date(cfs[0].date);
  const ts = cfs.map((c) => ({ t: (new Date(c.date) - base) / 864e5 / 365, a: c.amt }));
  const hasPos = ts.some((c) => c.a > 0), hasNeg = ts.some((c) => c.a < 0);
  if (!hasPos || !hasNeg) return null;
  const npv = (r) => ts.reduce((s, c) => s + c.a / Math.pow(1 + r, c.t), 0);
  let lo = -0.9999, hi = 100, fLo = npv(lo), fHi = npv(hi);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2, fm = npv(m);
    if (Math.abs(fm) < 1e-7) return m;
    fLo * fm < 0 ? (hi = m, fHi = fm) : (lo = m, fLo = fm);
  }
  return (lo + hi) / 2;
}
const inRange = (d, x, y) => (!x || d >= x) && (!y || d <= y);
function clientPerf(cl, priceOf, x, y, opts) {
  const o = opts && typeof opts === "object" ? opts : { openValue: opts };
  const openValue = o.openValue;
  let buy = 0, sell = 0, realized = 0;
  for (const d in cl.flows) {
    if (!inRange(d, x, y)) continue;
    buy += cl.flows[d][0];
    sell += cl.flows[d][1];
  }
  for (const d in cl.realized) {
    if (inRange(d, x, y)) realized += cl.realized[d];
  }
  let openVal, openCost;
  if (o.endValue != null) {
    openVal = o.endValue;
    openCost = o.endCost != null ? o.endCost : 0;
  } else {
    openVal = 0;
    openCost = 0;
    for (const sym in cl.pos) {
      const [q, c] = cl.pos[sym];
      openVal += q * priceOf(sym);
      openCost += c;
    }
  }
  const unrealized = openVal - openCost;
  const netDeployed = buy - sell;
  const netPnl = realized + unrealized;
  const flows = [];
  if (openValue != null && openValue > 0 && x) flows.push({ date: x, amt: -Math.abs(openValue) });
  for (const d of Object.keys(cl.flows).sort()) {
    if (!inRange(d, x, y)) continue;
    const amt = cl.flows[d][1] - cl.flows[d][0];
    if (amt) flows.push({ date: d, amt });
  }
  const endDate = o.endDate || y || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (openVal > 0) flows.push({ date: endDate, amt: openVal });
  const rate = xirr(flows.sort((a, b) => a.date < b.date ? -1 : 1));
  return { buy, sell, netDeployed, realized, openVal, openCost, unrealized, netPnl, xirr: rate, first: cl.first, last: cl.last };
}
function periodBreakdown(byClient, codes, mode, x, y) {
  const map = {};
  for (const code of codes) {
    const cl = byClient[code];
    if (!cl) continue;
    for (const d in cl.flows) {
      if (!inRange(d, x, y)) continue;
      const k = periodKey(d, mode);
      map[k] = map[k] || { buy: 0, sell: 0, realized: 0 };
      map[k].buy += cl.flows[d][0];
      map[k].sell += cl.flows[d][1];
    }
    for (const d in cl.realized) {
      if (!inRange(d, x, y)) continue;
      const k = periodKey(d, mode);
      map[k] = map[k] || { buy: 0, sell: 0, realized: 0 };
      map[k].realized += cl.realized[d];
    }
  }
  return Object.entries(map).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, v]) => ({ period: k, ...v, net: v.buy - v.sell }));
}
function positionAsOf(tuples, date, excl) {
  const ls = (date ? (tuples || []).filter((t) => excl ? t[2] < date : t[2] <= date) : (tuples || []).slice()).sort((a, b) => a[2] < b[2] ? -1 : 1);
  const pos = {};
  for (const t of ls) {
    const sym = t[1], ac = t[3], qty = t[4], amount = t[6];
    const p = pos[sym] || (pos[sym] = [0, 0]);
    if (ac === "S") {
      const avg = p[0] > 0 ? p[1] / p[0] : 0;
      const sq = Math.min(qty, p[0]);
      p[1] -= avg * sq;
      p[0] -= sq;
    } else {
      p[0] += qty;
      p[1] += amount;
    }
  }
  const out = {};
  for (const s in pos) if (pos[s][0] > 1e-6) out[s] = pos[s];
  return out;
}
function valuePositions(pos, priceFn) {
  let val = 0, cost = 0;
  const missing = [];
  for (const s in pos) {
    const [q, c] = pos[s];
    const px = priceFn(s);
    if (!px) missing.push(s);
    val += q * (px || 0);
    cost += c;
  }
  return { val, cost, missing };
}
function mergeRates(prev, date, card) {
  const cards = { ...prev && prev.cards ? prev.cards : {} };
  const ex = cards[date] || { prices: {}, nifty50: null, nifty500: null };
  cards[date] = {
    prices: { ...ex.prices, ...card.prices },
    nifty50: card.nifty50 != null ? card.nifty50 : ex.nifty50,
    nifty500: card.nifty500 != null ? card.nifty500 : ex.nifty500
  };
  return { v: 1, cards, updatedAt: Date.now() };
}
function benchReturn(start, end, x, y) {
  const s = num(start), e = num(end);
  if (!s || !e) return null;
  const abs = (e - s) / s * 100;
  const days = x && y ? Math.max(1, (new Date(y) - new Date(x)) / 864e5) : null;
  const cagr = days ? (Math.pow(e / s, 365 / days) - 1) * 100 : null;
  return { abs, cagr };
}
function PerformanceTab({ db, showToast }) {
  const [store, setStore] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [push, setPush] = useState(null);
  const [preset, setPreset] = useState("inception");
  const todayISO = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const [x, setX] = useState("");
  const [y, setY] = useState(todayISO);
  const [openValX, setOpenValX] = useState("");
  const [rates, setRates] = useState(null);
  const [ratesDate, setRatesDate] = useState("");
  const [sheetBacked, setSheetBacked] = useState(false);
  const [skipInfo, setSkipInfo] = useState(null);
  const ratesRef = useRef();
  const [bench, setBench] = useState({ n50x: "", n50y: "", n500x: "", n500y: "" });
  const [bd, setBd] = useState(null);
  const [q, setQ] = useState("");
  const inRef = useRef();
  useEffect(() => {
    (async () => {
      const t = await loadTrades();
      const r = await loadRates();
      setRates(r);
      const hasSheet = (db.sheetUrl || "").trim();
      if (hasSheet) {
        if (t && !t.marker) {
          setStore(t);
        }
        setLoaded(true);
        await loadFromSheet({ silent: true, auto: true });
      } else if (t && t.marker) {
        setSheetBacked(true);
        setLoaded(true);
      } else {
        setStore(t);
        setLoaded(true);
      }
    })();
  }, []);
  const tradesByCode = useMemo(() => {
    const m = {};
    for (const t of store && store.trades ? store.trades : []) (m[t[0]] = m[t[0]] || []).push(t);
    return m;
  }, [store]);
  const priceOf = (sym) => db.prices && db.prices[sym] || store && store.lastPrice && store.lastPrice[sym] || 0;
  const nameOf = (code) => db.clients[code] && db.clients[code].name || store && store.names && store.names[code] || code;
  const isMapped = (code) => !!(db.clients[code] || db.cashCode && db.cashCode[code] != null);
  const byClient = useMemo(() => store ? deriveTrades(store) : {}, [store]);
  const readFile = (file, cb) => {
    setBusy(true);
    const ext = file.name.split(".").pop().toLowerCase();
    const done = (rows) => {
      cb(rows);
    };
    if (ext === "csv" || ext === "txt") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        worker: true,
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
  const ingest = (rows, opts = {}) => {
    const agg = aggregateTradeRows(rows);
    if (!agg.tuples.length) {
      setBusy(false);
      showToast("No usable trades found. Check the columns (client code, symbol, date, BUY/SELL, qty, price).", "err");
      return;
    }
    setSkipInfo(agg.skipped ? { count: agg.skipped, rows: agg.skippedRows || [] } : null);
    const next = mergeTradeStore(store, agg);
    saveTrades(next).then((status) => {
      setStore(next);
      setBusy(false);
      setSheetBacked(status === "marker");
      const total = next.trades.length.toLocaleString("en-IN");
      const skipNote = agg.skipped ? ` \xB7 ${agg.skipped} row(s) had a blank code/symbol/date/qty and were left out (not a storage issue \u2014 use \u201CDownload skipped rows\u201D to review).` : "";
      if (opts.fromSheet) {
        if (!opts.auto) showToast(`Loaded ${total} trades from the Trades tab.${skipNote}`);
      } else if (status === "marker") {
        showToast(`${total} trades are ready and being used now${skipNote ? "." + skipNote : "."} They're too large to keep inside this browser, so click \u201CSave all trades to Google Sheet\u201D below to store them permanently \u2014 after that they load automatically every time.`, "err");
      } else {
        showToast(`${agg.tuples.length.toLocaleString("en-IN")} trades imported.${skipNote}`);
      }
    });
  };
  const onFile = (file) => readFile(file, ingest);
  const downloadSkipped = () => {
    if (!skipInfo || !skipInfo.rows.length) {
      showToast("No skipped rows captured.", "err");
      return;
    }
    const csv = Papa.unparse(skipInfo.rows);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `trades_skipped_${todayISO}.csv`;
    a.click();
    showToast(`${skipInfo.rows.length.toLocaleString("en-IN")} skipped row(s) downloaded for review.`);
  };
  const ingestRates = (rows, forDate) => {
    const card = { prices: {}, nifty50: null, nifty500: null };
    let rowDate = forDate || "";
    for (const r0 of rows) {
      const g = {};
      for (const k in r0) g[normKey(k)] = r0[k];
      const d = g.date ? toISO(g.date) : "";
      if (d) rowDate = d;
      if (g.nifty50 != null && g.nifty50 !== "") card.nifty50 = num(g.nifty50);
      if (g.nifty500 != null && g.nifty500 !== "") card.nifty500 = num(g.nifty500);
      let sym = String(g.nsecode ?? g.symbol ?? g.scrip ?? g.stock ?? g.security ?? g.name ?? "").trim().toUpperCase();
      if (!sym) continue;
      const close = num(g.close ?? g.closingprice ?? g.closeprice ?? g.closingrate ?? g.price ?? g.rate ?? g.ltp ?? g.lastprice ?? g.adjclose ?? g.value);
      const sc = sym.replace(/[^A-Z0-9]/g, "");
      if (sc === "NIFTY50" || sc === "NIFTY" || sc === "NIFTY50TRI" || sc === "NIFTY50TR") {
        if (close) card.nifty50 = close;
        continue;
      }
      if (sc === "NIFTY500" || sc === "NIFTY500TRI" || sc === "NIFTY500TR") {
        if (close) card.nifty500 = close;
        continue;
      }
      if (close) card.prices[sym] = close;
    }
    if (!rowDate) {
      setBusy(false);
      showToast("Set the \u201CRates as of\u201D date first (or include a Date column in the file).", "err");
      return;
    }
    const nStocks = Object.keys(card.prices).length;
    if (!nStocks && card.nifty50 == null && card.nifty500 == null) {
      setBusy(false);
      showToast("No closing prices found. Expected columns like Symbol and Close.", "err");
      return;
    }
    const next = mergeRates(rates, rowDate, card);
    saveRates(next).then((ok) => {
      setRates(next);
      setBusy(false);
      const extra = `${card.nifty50 != null ? ` \xB7 Nifty 50 ${card.nifty50}` : ""}${card.nifty500 != null ? ` \xB7 Nifty 500 ${card.nifty500}` : ""}`;
      showToast(`Saved ${nStocks} closing price${nStocks === 1 ? "" : "s"} for ${rowDate}${extra}${ok ? "" : " (storage full)"}.`);
    });
  };
  const onRatesFile = (file) => readFile(file, (rows) => ingestRates(rows, ratesDate || x || todayISO));
  const exportNeededSymbols = () => {
    const d = ratesDate || x || todayISO;
    const need = {};
    for (const code of codes) {
      const ps = positionAsOf(tradesByCode[code] || [], d);
      for (const s in ps) need[s] = true;
    }
    const syms = Object.keys(need).sort();
    const lines = [["Date", "Symbol", "Close"]].concat(syms.map((s) => [d, s, ""]), [[d, "NIFTY50", ""], [d, "NIFTY500", ""]]);
    const csv = lines.map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `rates_needed_${d}.csv`;
    a.click();
    showToast(`${syms.length} symbol${syms.length === 1 ? "" : "s"} held on ${d}. Fill the Close column and re-upload.`);
  };
  const removeRatesCard = (date) => {
    const cards = { ...rates && rates.cards ? rates.cards : {} };
    delete cards[date];
    const next = { v: 1, cards, updatedAt: Date.now() };
    saveRates(next).then(() => setRates(next));
  };
  const loadFromSheet = async (opts = {}) => {
    const url = (db.sheetUrl || "").trim();
    if (!url) {
      if (!opts.silent) showToast("Set your Google Sheet web-app URL in Settings first.", "err");
      return 0;
    }
    setLoadingSheet(true);
    try {
      const res = await fetch(withToken(url) + "&trades=1");
      const data = await res.json();
      let list = Array.isArray(data.trades) ? data.trades : [];
      if (list.length && Array.isArray(list[0])) {
        list = list.map((a) => ({ "Date": a[0], "Client code": a[1], "Client name": a[2], "Symbol": a[3], "Action": a[4], "Quantity": a[5], "Price": a[6], "Amount": a[7] }));
      }
      if (!list.length) {
        if (!opts.silent) showToast("The Trades tab is empty. It fills automatically from the GridKey auto-sync (Settings \u2192 GridKey auto-sync \u2192 Fetch now), or you can upload a trade file below.", "err");
        return 0;
      }
      ingest(list, { fromSheet: true, auto: opts.auto });
      return list.length;
    } catch (e) {
      if (!opts.silent) showToast("Couldn't reach the sheet. Check the /exec URL is deployed and set to \u201CAnyone\u201D.", "err");
      return 0;
    } finally {
      setLoadingSheet(false);
    }
  };
  const pushToSheet = async () => {
    const url = (db.sheetUrl || "").trim();
    if (!url) {
      showToast("Set your Google Sheet web-app URL in Settings first.", "err");
      return;
    }
    if (!store || !store.trades.length) {
      showToast("No trades to save yet \u2014 upload your trade file first.", "err");
      return;
    }
    const tuples = store.trades, CHUNK = 2e3;
    setPush({ done: 0, total: tuples.length });
    try {
      for (let i = 0; i < tuples.length; i += CHUNK) {
        const rows = tuples.slice(i, i + CHUNK).map((t) => [t[2], t[0], nameOf(t[0]), t[1], t[3] === "S" ? "SELL" : "BUY", t[4], t[5], t[6]]);
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: db.sheetToken || "", type: "trades", reset: i === 0, rows })
        });
        setPush({ done: Math.min(i + CHUNK, tuples.length), total: tuples.length });
      }
      let verified = null;
      try {
        const res = await fetch(withToken(url) + "&trades=1");
        const data = await res.json();
        verified = Array.isArray(data.trades) ? data.trades.length : null;
      } catch (e) {
      }
      const st = await saveTrades(store);
      setSheetBacked(st !== "full");
      if (verified != null && Math.abs(verified - tuples.length) > 2) {
        showToast(`Saved, but the sheet reports ${verified.toLocaleString("en-IN")} rows vs ${tuples.length.toLocaleString("en-IN")} expected. Re-deploy the Apps Script as a NEW version and click Save again.`, "err");
      } else {
        showToast(`Saved ${tuples.length.toLocaleString("en-IN")} trades to your Google Sheet${verified != null ? " (verified)" : ""}. They'll load automatically from the sheet next time.`);
      }
    } catch (e) {
      showToast("Write interrupted \u2014 check the Trades tab and click \u201CSave all trades to Google Sheet\u201D again.", "err");
    } finally {
      setPush(null);
    }
  };
  const applyPreset = (name) => {
    setPreset(name);
    const now = /* @__PURE__ */ new Date(), yr = now.getFullYear(), mo = now.getMonth();
    const ymd = (y2, m2, d2) => `${y2}-${String(m2 + 1).padStart(2, "0")}-${String(d2).padStart(2, "0")}`;
    const lastDay = (y2, m2) => new Date(y2, m2 + 1, 0).getDate();
    let nx = "", ny = todayISO;
    if (name === "thisFY") {
      const s = mo >= 3 ? yr : yr - 1;
      nx = `${s}-04-01`;
    } else if (name === "lastFY") {
      const s = mo >= 3 ? yr - 1 : yr - 2;
      nx = `${s}-04-01`;
      ny = `${s + 1}-03-31`;
    } else if (name === "thisQ") {
      const qs = Math.floor(mo / 3) * 3;
      nx = ymd(yr, qs, 1);
    } else if (name === "lastQ") {
      let qs = Math.floor(mo / 3) * 3 - 3, y2 = yr;
      if (qs < 0) {
        qs += 12;
        y2--;
      }
      nx = ymd(y2, qs, 1);
      ny = ymd(y2, qs + 2, lastDay(y2, qs + 2));
    } else if (name === "thisM") {
      nx = ymd(yr, mo, 1);
    } else if (name === "lastM") {
      let m2 = mo - 1, y2 = yr;
      if (m2 < 0) {
        m2 = 11;
        y2--;
      }
      nx = ymd(y2, m2, 1);
      ny = ymd(y2, m2, lastDay(y2, m2));
    }
    setX(nx);
    setY(ny);
  };
  const codes = useMemo(() => Object.keys(byClient).sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b)))), [byClient, db.clients, store]);
  const filteredCodes = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return codes;
    return codes.filter((c) => c.toLowerCase().includes(s) || String(nameOf(c)).toLowerCase().includes(s));
  }, [codes, q]);
  const result = useMemo(() => {
    const xx = x || "", yy = y || todayISO, ovManual = num(openValX);
    const cards = rates && rates.cards ? rates.cards : {};
    const fromCard = xx ? cards[xx] : null;
    const toCard = yy && yy < todayISO ? cards[yy] : null;
    const fromPrice = (s) => fromCard ? fromCard.prices[s] || 0 : 0;
    const toPrice = (s) => toCard ? toCard.prices[s] || 0 : priceOf(s);
    let agg = { buy: 0, sell: 0, realized: 0, openVal: 0, openCost: 0 };
    const flowsMap = {};
    let earliest = "";
    const per = [];
    let openAtFrom = 0;
    let anyFrom = false;
    const missFrom = /* @__PURE__ */ new Set();
    for (const code of filteredCodes) {
      const cl = byClient[code];
      if (!cl) continue;
      let openValue;
      if (fromCard) {
        const vF = valuePositions(positionAsOf(tradesByCode[code] || [], xx, true), fromPrice);
        openValue = vF.val;
        openAtFrom += vF.val;
        anyFrom = true;
        vF.missing.forEach((s) => missFrom.add(s));
      }
      let endValue, endCost, endDate;
      if (toCard) {
        const vT = valuePositions(positionAsOf(tradesByCode[code] || [], yy), toPrice);
        endValue = vT.val;
        endCost = vT.cost;
        endDate = yy;
      }
      const p = clientPerf(cl, priceOf, xx, yy, { openValue, endValue, endCost, endDate });
      agg.buy += p.buy;
      agg.sell += p.sell;
      agg.realized += p.realized;
      agg.openVal += p.openVal;
      agg.openCost += p.openCost;
      if (cl.first && (!earliest || cl.first < earliest)) earliest = cl.first;
      for (const d in cl.flows) {
        if ((!xx || d >= xx) && (!yy || d <= yy)) {
          flowsMap[d] = flowsMap[d] || [0, 0];
          flowsMap[d][0] += cl.flows[d][0];
          flowsMap[d][1] += cl.flows[d][1];
        }
      }
      per.push({ code, name: nameOf(code), mapped: isMapped(code), ...p });
    }
    agg.unrealized = agg.openVal - agg.openCost;
    agg.netDeployed = agg.buy - agg.sell;
    agg.netPnl = agg.realized + agg.unrealized;
    const ov = anyFrom ? openAtFrom : ovManual;
    const windowValid = !xx || xx <= earliest || ov > 0;
    let bookXirr = null;
    if (windowValid) {
      const cfs = [];
      if (ov > 0 && xx) cfs.push({ date: xx, amt: -ov });
      for (const d of Object.keys(flowsMap).sort()) {
        const amt = flowsMap[d][1] - flowsMap[d][0];
        if (amt) cfs.push({ date: d, amt });
      }
      if (agg.openVal > 0) cfs.push({ date: yy, amt: agg.openVal });
      bookXirr = xirr(cfs.sort((a, b) => a.date < b.date ? -1 : 1));
    }
    per.sort((a, b) => b.netPnl - a.netPnl);
    return { agg, per, bookXirr, earliest, windowValid, xx, yy, hasFromCard: !!fromCard, hasToCard: !!toCard, openAtFrom: anyFrom ? openAtFrom : null, missFrom: [...missFrom] };
  }, [byClient, filteredCodes, x, y, openValX, db.prices, store, rates, tradesByCode]);
  const breakdown = useMemo(() => bd ? periodBreakdown(byClient, filteredCodes, bd, x || "", y || todayISO) : [], [bd, byClient, filteredCodes, x, y]);
  const spanDays = result.xx || result.earliest ? Math.max(1, (new Date(result.yy) - new Date(result.xx || result.earliest)) / 864e5) : null;
  const bk = result.bookXirr != null ? result.bookXirr * 100 : null;
  const _cards = rates && rates.cards ? rates.cards : {};
  const _cardFrom = _cards[result.xx] || (result.earliest ? _cards[result.earliest] : null) || null;
  const _cardTo = _cards[result.yy] || null;
  const eff = (manual, cardVal) => manual !== "" && manual != null ? manual : cardVal != null ? cardVal : "";
  const n50x = eff(bench.n50x, _cardFrom && _cardFrom.nifty50), n50y = eff(bench.n50y, _cardTo && _cardTo.nifty50);
  const n500x = eff(bench.n500x, _cardFrom && _cardFrom.nifty500), n500y = eff(bench.n500y, _cardTo && _cardTo.nifty500);
  const n50 = benchReturn(n50x, n50y, result.xx || result.earliest, result.yy);
  const n500 = benchReturn(n500x, n500y, result.xx || result.earliest, result.yy);
  const benchAuto = { n50x: _cardFrom && _cardFrom.nifty50, n50y: _cardTo && _cardTo.nifty50, n500x: _cardFrom && _cardFrom.nifty500, n500y: _cardTo && _cardTo.nifty500 };
  const unmapped = result.per.filter((p) => !p.mapped).length;
  const tradeCount = store ? store.trades.length : 0;
  const savedCards = Object.entries(_cards).sort((a, b) => a[0] < b[0] ? 1 : -1);
  if (!loaded) return /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-400 py-10 text-center" }, "Loading\u2026");
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-5 mb-4" }, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-semibold mb-1 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(TrendingUp, { size: 18 }), " Portfolio performance from trades"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 mb-4" }, "Performance reads directly from the ", /* @__PURE__ */ React.createElement("b", null, "Trades tab"), " of your Google Sheet \u2014 the same one the GridKey auto-sync refreshes every day. Trades are aggregated, mapped to each client by code, and used to compute ", /* @__PURE__ */ React.createElement("b", null, "money-weighted returns (XIRR)"), ", realized P&L and benchmark comparison. It loads automatically when you open this tab; use ", /* @__PURE__ */ React.createElement("b", null, "Refresh from sheet"), " after a fresh sync, or upload a file only if you need to add trades that aren't in GridKey."), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => loadFromSheet(),
      disabled: loadingSheet || !(db.sheetUrl || "").trim(),
      className: "text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1.5 disabled:opacity-50 font-medium"
    },
    /* @__PURE__ */ React.createElement(RefreshCw, { size: 15, className: loadingSheet ? "animate-spin" : "" }),
    " ",
    loadingSheet ? "Loading from sheet\u2026" : "Refresh from sheet"
  ), !(db.sheetUrl || "").trim() && /* @__PURE__ */ React.createElement("span", { className: "text-[12px] text-amber-700" }, "Connect the office sheet (Settings) to load trades automatically."), /* @__PURE__ */ React.createElement("details", { className: "text-[12px] text-slate-500" }, /* @__PURE__ */ React.createElement("summary", { className: "cursor-pointer hover:text-indigo-600" }, "Upload a trade file instead (fallback)"), /* @__PURE__ */ React.createElement("div", { className: "mt-2 flex flex-wrap items-center gap-2" }, /* @__PURE__ */ React.createElement(
    "div",
    {
      onDragOver: (e) => e.preventDefault(),
      onDrop: (e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
      },
      onClick: () => inRef.current.click(),
      className: "min-w-[260px] border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40"
    },
    /* @__PURE__ */ React.createElement(Upload, { size: 20, className: "mx-auto text-slate-400 mb-1" }),
    /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-600" }, busy ? "Reading\u2026" : "Drop the trades file here, or click to choose"),
    /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mt-1" }, ".csv \xB7 .xlsx \u2014 columns auto-detected"),
    /* @__PURE__ */ React.createElement("input", { ref: inRef, type: "file", accept: ".csv,.xlsx,.xls,.xlsm", className: "hidden", onChange: (e) => e.target.files[0] && onFile(e.target.files[0]) })
  ), /* @__PURE__ */ React.createElement("button", { onClick: pushToSheet, disabled: !!push || !tradeCount, className: "text-sm px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Upload, { size: 15 }), " ", push ? `Saving ${push.done.toLocaleString("en-IN")}/${push.total.toLocaleString("en-IN")}\u2026` : "Save uploaded trades to sheet")), /* @__PURE__ */ React.createElement("p", { className: "mt-2 text-[11px] text-slate-400" }, "Use this only for trades GridKey doesn't have. Note the auto-sync ", /* @__PURE__ */ React.createElement("b", null, "overwrites"), " the Trades tab twice daily, so anything you push here is replaced at the next sync unless it's also in GridKey."))), tradeCount > 0 && /* @__PURE__ */ React.createElement("div", { className: "mt-3 text-[12px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, tradeCount.toLocaleString("en-IN")), " aggregated trades"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, codes.length), " clients"), result.earliest && /* @__PURE__ */ React.createElement("span", null, "since ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, result.earliest)), unmapped > 0 && /* @__PURE__ */ React.createElement("span", { className: "text-amber-700" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 12, className: "inline mb-0.5" }), " ", unmapped, " code(s) not in your client/Cash list"), skipInfo && skipInfo.count > 0 && /* @__PURE__ */ React.createElement("button", { onClick: downloadSkipped, className: "text-slate-500 underline hover:text-indigo-700 inline-flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Download, { size: 12 }), " ", skipInfo.count.toLocaleString("en-IN"), " row(s) skipped (blank fields) \u2014 download to review"))), tradeCount === 0 ? /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm" }, "No trades loaded yet. Upload your trade book above to see performance.") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-4 mb-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-1.5 mb-3" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400 mr-1 flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Calendar, { size: 13 }), " Period:"), [["inception", "Since inception"], ["thisFY", "This FY"], ["lastFY", "Last FY"], ["thisQ", "This quarter"], ["lastQ", "Last quarter"], ["thisM", "This month"], ["lastM", "Last month"], ["custom", "Custom"]].map(([k, lbl]) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: k,
      onClick: () => k === "custom" ? setPreset("custom") : applyPreset(k),
      className: `text-xs px-2.5 py-1 rounded-md border ${preset === k ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`
    },
    lbl
  ))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-end gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500" }, "From"), /* @__PURE__ */ React.createElement("input", { type: "date", value: x, onChange: (e) => {
    setX(e.target.value);
    setPreset("custom");
  }, className: "block mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500" }, "To"), /* @__PURE__ */ React.createElement("input", { type: "date", value: y, onChange: (e) => {
    setY(e.target.value);
    setPreset("custom");
  }, className: "block mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg" })), /* @__PURE__ */ React.createElement("div", { className: "relative flex-1 min-w-[180px] max-w-xs" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500" }, "Search client"), /* @__PURE__ */ React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "name or code\u2026", className: "block w-full mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg" }))), !result.windowValid && /* @__PURE__ */ React.createElement("div", { className: "mt-3 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" }, "This window starts after the first trade, so a true XIRR needs the portfolio's market value on the From date. The best way is to ", /* @__PURE__ */ React.createElement("b", null, "upload the From-date closing prices below"), " \u2014 the app then values each client's holdings automatically. Realized P&L and net deployed are already exact. Or type a single book value here:", /* @__PURE__ */ React.createElement("input", { type: "number", value: openValX, onChange: (e) => setOpenValX(e.target.value), placeholder: "portfolio value on From date", className: "ml-2 px-2 py-1 text-xs border border-amber-300 rounded w-56" }))), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-4 mb-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold mb-1 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Calendar, { size: 15 }), " Opening-date prices & index levels"), /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 mb-3" }, "For a window that starts in the past, upload the ", /* @__PURE__ */ React.createElement("b", null, "closing prices of every held stock on the From date"), ", plus the ", /* @__PURE__ */ React.createElement("b", null, "Nifty 50"), " and ", /* @__PURE__ */ React.createElement("b", null, "Nifty 500"), " closing levels. The app values each client's holdings on that date to give a true money-weighted XIRR, and fills the benchmark levels automatically. To value a window that ", /* @__PURE__ */ React.createElement("i", null, "ends"), " in the past, also upload a card for the To date. File columns: ", /* @__PURE__ */ React.createElement("b", null, "Symbol"), " and ", /* @__PURE__ */ React.createElement("b", null, "Close"), " (a ", /* @__PURE__ */ React.createElement("b", null, "Date"), " column is optional; rows ", /* @__PURE__ */ React.createElement("b", null, "NIFTY50"), " / ", /* @__PURE__ */ React.createElement("b", null, "NIFTY500"), " set the index levels)."), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-end gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500" }, "Rates as of"), /* @__PURE__ */ React.createElement("input", { type: "date", value: ratesDate || x, onChange: (e) => setRatesDate(e.target.value), className: "block mt-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg" })), /* @__PURE__ */ React.createElement("button", { onClick: exportNeededSymbols, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Download, { size: 15 }), " Download stocks to price"), /* @__PURE__ */ React.createElement("button", { onClick: () => ratesRef.current.click(), disabled: busy, className: "text-sm px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Upload, { size: 15 }), " ", busy ? "Reading\u2026" : "Upload closing prices"), /* @__PURE__ */ React.createElement("input", { ref: ratesRef, type: "file", accept: ".csv,.xlsx,.xls,.xlsm", className: "hidden", onChange: (e) => {
    if (e.target.files[0]) onRatesFile(e.target.files[0]);
    e.target.value = "";
  } })), result.hasFromCard && /* @__PURE__ */ React.createElement("div", { className: "mt-3 text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-start gap-1.5" }, /* @__PURE__ */ React.createElement(Check, { size: 14, className: "mt-0.5 shrink-0" }), /* @__PURE__ */ React.createElement("span", null, "Opening value on ", /* @__PURE__ */ React.createElement("b", null, result.xx), " = ", /* @__PURE__ */ React.createElement("b", null, fmtINR(result.openAtFrom)), ", computed from your uploaded prices \u2014 windowed XIRR below uses it automatically.", result.missFrom.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, " ", /* @__PURE__ */ React.createElement("span", { className: "text-amber-700" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 12, className: "inline mb-0.5" }), " ", result.missFrom.length, " held stock(s) have no price in that card (", result.missFrom.slice(0, 8).join(", "), result.missFrom.length > 8 ? "\u2026" : "", "); the opening value is understated until you add them and re-upload.")))), savedCards.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "mt-3 flex flex-wrap gap-2" }, savedCards.map(([d, c]) => /* @__PURE__ */ React.createElement("span", { key: d, className: `inline-flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-full border ${d === result.xx ? "border-emerald-300 bg-emerald-50 text-emerald-800" : d === result.yy ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-600"}` }, /* @__PURE__ */ React.createElement("b", null, d), " \xB7 ", Object.keys(c.prices || {}).length, " stocks", c.nifty50 != null ? ` \xB7 N50 ${fmtNum(c.nifty50)}` : "", c.nifty500 != null ? ` \xB7 N500 ${fmtNum(c.nifty500)}` : "", /* @__PURE__ */ React.createElement("button", { onClick: () => removeRatesCard(d), className: "text-slate-400 hover:text-rose-600", title: "Remove this card" }, /* @__PURE__ */ React.createElement(Trash2, { size: 12 })))))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4" }, /* @__PURE__ */ React.createElement(Stat, { label: "Net deployed", value: fmtINR(result.agg.netDeployed) }), /* @__PURE__ */ React.createElement(Stat, { label: "Realized P/L", value: fmtINR(result.agg.realized), tone: result.agg.realized >= 0 ? "pos" : "neg" }), /* @__PURE__ */ React.createElement(Stat, { label: "Open value", value: fmtINR(result.agg.openVal) }), /* @__PURE__ */ React.createElement(Stat, { label: "Unrealized P/L", value: fmtINR(result.agg.unrealized), tone: result.agg.unrealized >= 0 ? "pos" : "neg" }), /* @__PURE__ */ React.createElement(Stat, { label: "Net P/L", value: fmtINR(result.agg.netPnl), tone: result.agg.netPnl >= 0 ? "pos" : "neg" }), /* @__PURE__ */ React.createElement(Stat, { label: "XIRR (book)", value: bk == null ? "\u2014" : `${fmtNum(bk)}%`, tone: bk == null ? void 0 : bk >= 0 ? "pos" : "neg" })), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-4 mb-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold mb-1 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(TrendingUp, { size: 15 }), " Benchmark comparison"), /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 mb-3" }, "Type the index level on your ", /* @__PURE__ */ React.createElement("b", null, "From"), " and ", /* @__PURE__ */ React.createElement("b", null, "To"), " dates \u2014 or upload them with the opening-date prices above and they fill in automatically (green = from file; typing overrides). The book return is annualized (XIRR); the index is shown as both the point-to-point move and annualized (CAGR) for a like-for-like comparison."), /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("table", { className: "text-sm min-w-[640px]" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "text-[11px] uppercase text-slate-400 text-left" }, /* @__PURE__ */ React.createElement("th", { className: "py-1 pr-4" }, "Benchmark"), /* @__PURE__ */ React.createElement("th", { className: "py-1 pr-3" }, "Level on ", result.xx || result.earliest || "start"), /* @__PURE__ */ React.createElement("th", { className: "py-1 pr-3" }, "Level on ", result.yy), /* @__PURE__ */ React.createElement("th", { className: "py-1 pr-4 text-right" }, "Index move"), /* @__PURE__ */ React.createElement("th", { className: "py-1 pr-4 text-right" }, "Index CAGR"), /* @__PURE__ */ React.createElement("th", { className: "py-1 pr-2 text-right" }, "Book XIRR"), /* @__PURE__ */ React.createElement("th", { className: "py-1 text-right" }, "Alpha"))), /* @__PURE__ */ React.createElement("tbody", null, [["Nifty 50", "n50x", "n50y", n50], ["Nifty 500", "n500x", "n500y", n500]].map(([lbl, kx, ky, b]) => /* @__PURE__ */ React.createElement("tr", { key: lbl, className: "border-t border-slate-100" }, /* @__PURE__ */ React.createElement("td", { className: "py-2 pr-4 font-medium" }, lbl), /* @__PURE__ */ React.createElement("td", { className: "py-2 pr-3" }, /* @__PURE__ */ React.createElement("input", { type: "number", value: bench[kx], onChange: (e) => setBench((s) => ({ ...s, [kx]: e.target.value })), placeholder: benchAuto[kx] != null ? `${fmtNum(benchAuto[kx])} (from file)` : "e.g. 22000", className: `px-2 py-1 text-sm border rounded w-28 ${benchAuto[kx] != null && bench[kx] === "" ? "border-emerald-300 bg-emerald-50" : "border-slate-300"}` })), /* @__PURE__ */ React.createElement("td", { className: "py-2 pr-3" }, /* @__PURE__ */ React.createElement("input", { type: "number", value: bench[ky], onChange: (e) => setBench((s) => ({ ...s, [ky]: e.target.value })), placeholder: benchAuto[ky] != null ? `${fmtNum(benchAuto[ky])} (from file)` : "e.g. 24000", className: `px-2 py-1 text-sm border rounded w-28 ${benchAuto[ky] != null && bench[ky] === "" ? "border-emerald-300 bg-emerald-50" : "border-slate-300"}` })), /* @__PURE__ */ React.createElement("td", { className: `py-2 pr-4 text-right tabular-nums ${b ? b.abs >= 0 ? "text-emerald-600" : "text-rose-600" : "text-slate-300"}` }, b ? `${fmtNum(b.abs)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: `py-2 pr-4 text-right tabular-nums ${b && b.cagr != null ? b.cagr >= 0 ? "text-emerald-600" : "text-rose-600" : "text-slate-300"}` }, b && b.cagr != null ? `${fmtNum(b.cagr)}%` : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "py-2 pr-2 text-right tabular-nums text-slate-700" }, bk == null ? "\u2014" : `${fmtNum(bk)}%`), /* @__PURE__ */ React.createElement("td", { className: `py-2 text-right tabular-nums font-semibold ${b && b.cagr != null && bk != null ? bk - b.cagr >= 0 ? "text-emerald-600" : "text-rose-600" : "text-slate-300"}` }, b && b.cagr != null && bk != null ? `${bk - b.cagr >= 0 ? "+" : ""}${fmtNum(bk - b.cagr)}%` : "\u2014"))))))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-3" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400" }, "Breakdown:"), /* @__PURE__ */ React.createElement("button", { onClick: () => setBd(bd === "M" ? null : "M"), className: `text-xs px-2.5 py-1 rounded-md border ${bd === "M" ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}` }, "Month on month"), /* @__PURE__ */ React.createElement("button", { onClick: () => setBd(bd === "Q" ? null : "Q"), className: `text-xs px-2.5 py-1 rounded-md border ${bd === "Q" ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}` }, "Quarter on quarter"), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400 ml-auto" }, result.per.length, " clients \xB7 ", result.xx || result.earliest || "start", " \u2192 ", result.yy)), bd && /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden mb-4" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase" }, /* @__PURE__ */ React.createElement(Th, null, bd === "Q" ? "Quarter" : "Month"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Bought"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Sold"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Net deployed"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Realized P/L"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, breakdown.map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.period, className: "hover:bg-slate-50/70" }, /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 font-medium" }, r.period), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-500" }, fmtINR(r.buy)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-500" }, fmtINR(r.sell)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums" }, fmtINR(r.net)), /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-right tabular-nums ${r.realized >= 0 ? "text-emerald-600" : "text-rose-600"}` }, fmtINR(r.realized)))), !breakdown.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, className: "px-3 py-8 text-center text-slate-400" }, "No activity in this period."))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide" }, /* @__PURE__ */ React.createElement(Th, null, "Client"), /* @__PURE__ */ React.createElement(Th, null, "Code"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Net deployed"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Realized"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Open value"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Unrealized"), /* @__PURE__ */ React.createElement(Th, { right: true }, "Net P/L"), /* @__PURE__ */ React.createElement(Th, { right: true }, "XIRR"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, result.per.map((p) => /* @__PURE__ */ React.createElement("tr", { key: p.code, className: "hover:bg-slate-50/70" }, /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, p.mapped ? /* @__PURE__ */ React.createElement("span", { className: "text-slate-800" }, p.name) : /* @__PURE__ */ React.createElement("span", { className: "text-amber-600", title: "Not in your client/Cash list" }, p.name)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 font-mono text-[12px] text-slate-600" }, p.code), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums" }, fmtINR(p.netDeployed)), /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-right tabular-nums ${p.realized >= 0 ? "text-emerald-600" : "text-rose-600"}` }, fmtINR(p.realized)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums" }, fmtINR(p.openVal)), /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-right tabular-nums ${p.unrealized >= 0 ? "text-emerald-600" : "text-rose-600"}` }, fmtINR(p.unrealized)), /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-right tabular-nums font-medium ${p.netPnl >= 0 ? "text-emerald-600" : "text-rose-600"}` }, fmtINR(p.netPnl)), /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-right tabular-nums ${p.xirr == null ? "text-slate-300" : p.xirr >= 0 ? "text-emerald-600" : "text-rose-600"}` }, p.xirr == null ? "\u2014" : `${fmtNum(p.xirr * 100)}%`))))))), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mt-3" }, "XIRR is a money-weighted annualized return: buys are cash out, sells cash in, and open holdings are valued at the latest price. Per-client XIRR is most meaningful \u201Csince inception\u201D; for a custom window starting after a client's first trade, treat it as indicative unless a start value is provided. Open holdings use live prices where available, otherwise the last traded price.")));
}

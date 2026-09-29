let _gwOrderSeq = 0;
const gwOrderId = (code) => `${String(code || "").trim().replace(/\s+/g, "") || "CL"}-${Date.now()}-${(_gwOrderSeq++).toString(36)}`;
// The number handed to the gateway, which is also the number the client types to
// open their link. Indian numbers keep the bare 10-digit national form they have
// always been sent in; everything else goes as E.164 with a leading "+", the
// form the gateway was verified to accept (+97455471305 -> a working link).
function gwPhoneDigits(raw) {
  let d = String(raw || "").replace(/\D/g, "").replace(/^00/, "");
  if (!d) return "";
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) return d;
  return d.length >= 8 && d.length <= 15 ? "+" + d : "";
}
async function gwCreateOrderLink(db, { code, phone, sym, qty, side, orderType, price, triggerPrice }) {
  const proxyUrl = String(db && db.gwProxyUrl || "").trim().replace(/\/$/, "");
  const phoneNumber = gwPhoneDigits(phone);
  const ticker = String(sym || "").trim().toUpperCase();
  const q = Math.abs(Math.round(num(qty)));
  if (!proxyUrl) return { ok: false, error: "Order-link proxy URL not set in Settings." };
  if (!phoneNumber) return { ok: false, error: "No usable mobile number on file for this client." };
  if (!ticker || !q) return { ok: false, error: "Missing ticker/quantity." };
  const body = { orderId: gwOrderId(code), phoneNumber, ticker, quantity: q, type: String(side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY" };
  if (orderType) body.orderType = orderType;
  if (price != null) body.price = price;
  if (triggerPrice != null) body.triggerPrice = triggerPrice;
  try {
    const res = await fetch(proxyUrl + "/api/order-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) return { ok: false, error: data && data.error || `Order-link proxy error (HTTP ${res.status}).` };
    // The gateway returns an http:// short link; these carry a client's order
    // details, so never hand one out unencrypted.
    const url = String(data.url || "").replace(/^http:\/\//i, "https://");
    return { ok: true, url, orderId: data.orderId, shortCode: data.shortCode };
  } catch (e) {
    return { ok: false, error: "Could not reach the order-link proxy — is it running? (" + (e.message || "network error") + ")" };
  }
}
const ADVICE_DRAFT_KEY = "vasupradah_advice_draft";
const adviceMobileOf = (db, code) => {
  const c = (db && db.adviceContacts || {})[String(code ?? "").trim()] || {};
  return String(c.phone || joinPhone(c.cc, c.mobile) || "").trim();
};
const orderPhoneOf = (db, code, whatsapp) => adviceMobileOf(db, code) || String(whatsapp || "");
const mailtoUrl = (to, cc, subject, body) => {
  const q = [];
  if (cc && cc.length) q.push("cc=" + cc.join(","));
  q.push("subject=" + encodeURIComponent(subject));
  q.push("body=" + encodeURIComponent(body));
  return `mailto:${to}?${q.join("&")}`;
};
async function pushBaskets(db, payload) {
  if (!(db.sheetUrl || "").trim()) return;
  try {
    await fetch(db.sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ token: db.sheetToken || "", type: "baskets" }, payload))
    });
  } catch (e) {
  }
}
function BasketManager({ db, commit, showToast, onClose, onPick }) {
  const cats = RISK_CATEGORIES;
  const [cat, setCat] = useState(cats[0]);
  const [items, setItems] = useState(() => JSON.parse(JSON.stringify((db.baskets || {})[cats[0]] || [])));
  const load = (c) => {
    setCat(c);
    setItems(JSON.parse(JSON.stringify((db.baskets || {})[c] || [])));
  };
  const upd = (i, k, v) => setItems((a) => a.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const add = () => setItems((a) => [...a, { symbol: "", rationale: "", suitability: "", report: "" }]);
  const del = (i) => setItems((a) => a.filter((_, j) => j !== i));
  const save = async () => {
    const clean = items.map((x) => ({ ...x, symbol: String(x.symbol || "").trim().toUpperCase() })).filter((x) => x.symbol);
    const before = ((db.baskets || {})[cat] || []).map((x) => String(x.symbol).toUpperCase());
    const after = clean.map((x) => String(x.symbol).toUpperCase());
    await commit((d) => {
      d.baskets = d.baskets || {};
      d.baskets[cat] = clean;
    }, "edit basket");
    await pushBaskets(db, { rows: clean.map((x) => ({ ...x, category: cat })) });
    for (const sym of before) if (after.indexOf(sym) < 0) await pushBaskets(db, { action: "delete", category: cat, symbol: sym });
    showToast(`Saved ${clean.length} stock(s) to the ${cat} basket \u2014 stored in your sheet.`);
  };
  const inCls = "w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500";
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/40 z-40 flex items-start justify-center p-4 overflow-y-auto", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl w-full max-w-3xl mt-8", style: { maxHeight: "92vh", overflowY: "auto" }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between px-4 py-3 border-b border-slate-100" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Layers, { size: 16, className: "text-indigo-600" }), /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-slate-800" }, "Stock baskets by risk category")), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "text-slate-400 hover:text-slate-600" }, /* @__PURE__ */ React.createElement(X, { size: 18 }))), /* @__PURE__ */ React.createElement("div", { className: "p-4 space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, cats.map((c) => /* @__PURE__ */ React.createElement("button", { key: c, onClick: () => load(c), className: `text-xs px-3 py-1.5 rounded-lg border ${cat === c ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}` }, c, " ", /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "(", ((db.baskets || {})[c] || []).length, ")")))), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, items.map((it, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "border border-slate-200 rounded-lg p-2 grid md:grid-cols-12 gap-2 items-start" }, /* @__PURE__ */ React.createElement("input", { value: it.symbol, onChange: (e) => upd(i, "symbol", e.target.value), placeholder: "SYMBOL", className: inCls + " md:col-span-2 uppercase" }), /* @__PURE__ */ React.createElement("textarea", { value: it.rationale, onChange: (e) => upd(i, "rationale", e.target.value), placeholder: "Rationale", rows: 2, className: inCls + " md:col-span-4" }), /* @__PURE__ */ React.createElement("textarea", { value: it.suitability, onChange: (e) => upd(i, "suitability", e.target.value), placeholder: "Suitability for this category", rows: 2, className: inCls + " md:col-span-4" }), /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2 space-y-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("input", { value: it.report || "", onChange: (e) => upd(i, "report", e.target.value), placeholder: "report link", className: inCls }), /* @__PURE__ */ React.createElement("button", { onClick: () => del(i), className: "text-rose-500 hover:bg-rose-50 rounded p-1 shrink-0" }, /* @__PURE__ */ React.createElement(Trash2, { size: 15 })))))), !items.length && /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-400 text-center py-4" }, "No stocks in this basket yet.")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("button", { onClick: add, className: "text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Plus, { size: 14 }), " Add stock"), /* @__PURE__ */ React.createElement("button", { onClick: save, className: "text-sm px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Check, { size: 14 }), " Save basket"), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 ml-auto" }, "Each stock's rationale, suitability and report link auto-fill the order window when you pick it.")))));
}
function AdviceOrders({ db, commit, showToast }) {
  const money = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const money2 = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const cashOf = (code, name) => {
    const ck = String(code ?? "").trim();
    if (ck && cashCodeL[ck] != null) return cashCodeL[ck];
    return cashL[normNm(name)] || 0;
  };
  const statusOf = (code, name) => {
    const ck = String(code ?? "").trim();
    if (ck && statusCodeL[ck]) return statusCodeL[ck];
    return statusL[normNm(name)] || "";
  };
  const isPIS = (s) => /pis/i.test(String(s || ""));
  const priceOf = (sym2) => num((db.prices || {})[String(sym2 || "").toUpperCase()]);
  const portfolioOf = (c) => {
    let v = 0;
    for (const h of Object.values(c.holdings || {})) if (num(h.quantity) > 0) v += effOf(h, db.prices).current;
    return v + cashOf(c.code, c.name);
  };
  const heldQtyOf = (c, sym2) => {
    const h = (c.holdings || {})[String(sym2 || "").toUpperCase()] || Object.values(c.holdings || {}).find((x) => String(x.stock).toUpperCase() === String(sym2 || "").toUpperCase());
    return h ? num(h.quantity) : 0;
  };
  const [side, setSide] = useState("BUY");
  const [target, setTarget] = useState("group");
  const [model, setModel] = useState("auto");
  const [methodFilter, setMethodFilter] = useState("all");
  const methodOf = (u) => model === "auto" ? execModeOf(db, u.code) : model === "execution" ? "gateway" : "email";
  const gwUnitsOf = (us) => (us || []).filter((u) => methodOf(u) === "gateway");
  const [risk, setRisk] = useState("");
  const [minCash, setMinCash] = useState(5e3);
  const [minOrder, setMinOrder] = useState(2e4);
  const [pisOn, setPisOn] = useState(true);
  const [pisMinOrder, setPisMinOrder] = useState(5e4);
  const [stock, setStock] = useState("");
  const [orderPct, setOrderPct] = useState(5);
  const [maxCap, setMaxCap] = useState(3e5);
  const [capAtCash, setCapAtCash] = useState(false);
  const [sellMode, setSellMode] = useState("pct");
  const [sellPct, setSellPct] = useState(100);
  const [sellAmount, setSellAmount] = useState(1e5);
  const [fullSale, setFullSale] = useState(false);
  const [manualPx, setManualPx] = useState({});
  const [orderType, setOrderType] = useState("MARKET");
  const [limitBase, setLimitBase] = useState("");
  const [tickStep, setTickStep] = useState(0.05);
  const [rationale, setRationale] = useState("");
  const [suitability, setSuitability] = useState("");
  const [report, setReport] = useState("");
  const [overrides, setOverrides] = useState({});
  const [excluded, setExcluded] = useState(() => /* @__PURE__ */ new Set());
  useEffect(() => {
    setOverrides({});
  }, [side, stock, risk, orderPct, maxCap, capAtCash, sellMode, sellPct, sellAmount, fullSale, minOrder]);
  const [singleCode, setSingleCode] = useState("");
  const [lines, setLines] = useState([]);
  const [basketOpen, setBasketOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [sentWA, setSentWA] = useState(() => /* @__PURE__ */ new Set());
  const [sending, setSending] = useState(false);
  // Advice being worked on is kept in the browser, so switching to another tab
  // and back doesn't lose it. Only the order itself is stored - the sizing
  // rules above it are standing preferences and are left alone by "Clear".
  const [hydrated, setHydrated] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(ADVICE_DRAFT_KEY) || "null");
      if (d && typeof d === "object") {
        if (d.side) setSide(d.side);
        if (d.target) setTarget(d.target);
        if (d.model) setModel(d.model);
        if (d.methodFilter) setMethodFilter(d.methodFilter);
        if (d.risk != null) setRisk(d.risk);
        if (d.minCash != null) setMinCash(d.minCash);
        if (d.minOrder != null) setMinOrder(d.minOrder);
        if (d.pisOn != null) setPisOn(!!d.pisOn);
        if (d.pisMinOrder != null) setPisMinOrder(d.pisMinOrder);
        if (d.stock != null) setStock(d.stock);
        if (d.orderPct != null) setOrderPct(d.orderPct);
        if (d.maxCap != null) setMaxCap(d.maxCap);
        if (d.capAtCash != null) setCapAtCash(!!d.capAtCash);
        if (d.sellMode) setSellMode(d.sellMode);
        if (d.sellPct != null) setSellPct(d.sellPct);
        if (d.sellAmount != null) setSellAmount(d.sellAmount);
        if (d.fullSale != null) setFullSale(!!d.fullSale);
        if (d.manualPx) setManualPx(d.manualPx);
        if (d.orderType) setOrderType(d.orderType);
        if (d.limitBase != null) setLimitBase(d.limitBase);
        if (d.tickStep != null) setTickStep(d.tickStep);
        if (d.rationale != null) setRationale(d.rationale);
        if (d.suitability != null) setSuitability(d.suitability);
        if (d.report != null) setReport(d.report);
        if (d.overrides) setOverrides(d.overrides);
        if (Array.isArray(d.excluded)) setExcluded(new Set(d.excluded));
        if (d.singleCode != null) setSingleCode(d.singleCode);
        if (Array.isArray(d.lines)) setLines(d.lines);
        setDraftRestored(true);
      }
    } catch (e) {
    }
    setHydrated(true);
  }, []);
  const draftHasContent = !!(String(stock || "").trim() || String(rationale || "").trim() || String(suitability || "").trim() || String(report || "").trim() || lines.length || String(singleCode || "").trim());
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (!draftHasContent) {
        localStorage.removeItem(ADVICE_DRAFT_KEY);
        return;
      }
      localStorage.setItem(ADVICE_DRAFT_KEY, JSON.stringify({
        side, target, model, methodFilter, risk, minCash, minOrder, pisOn, pisMinOrder,
        stock, orderPct, maxCap, capAtCash, sellMode, sellPct, sellAmount, fullSale,
        manualPx, orderType, limitBase, tickStep, rationale, suitability, report,
        overrides, excluded: Array.from(excluded), singleCode, lines, at: Date.now()
      }));
    } catch (e) {
    }
  }, [hydrated, draftHasContent, side, target, model, methodFilter, risk, minCash, minOrder, pisOn, pisMinOrder, stock, orderPct, maxCap, capAtCash, sellMode, sellPct, sellAmount, fullSale, manualPx, orderType, limitBase, tickStep, rationale, suitability, report, overrides, excluded, singleCode, lines]);
  const clearDraft = () => {
    try {
      localStorage.removeItem(ADVICE_DRAFT_KEY);
    } catch (e) {
    }
    setStock("");
    setManualPx({});
    setRationale("");
    setSuitability("");
    setReport("");
    setOverrides({});
    setExcluded(/* @__PURE__ */ new Set());
    setSingleCode("");
    setLines([]);
    setLimitBase("");
    setOrderType("MARKET");
    setDraftRestored(false);
    showToast("Draft cleared.");
  };
  const gwLinkRef = useRef({});
  const gwKey = (unit, l) => `${unit.code}|${l.id || `${l.side}_${l.sym || l.stock}_${l.qty}`}|${l.orderType || "MARKET"}|${l.limitPrice || ""}`;
  const ensureGatewayLinks = async (us) => {
    const jobs = [];
    for (const u of us || []) {
      const orderPhone = orderPhoneOf(db, u.code, u.whatsapp);
      const hasPhone = !!waNumber(orderPhone);
      for (const l of u.lines) {
        const key = gwKey(u, l);
        if (gwLinkRef.current[key] != null) continue;
        if (!hasPhone) {
          gwLinkRef.current[key] = { url: "", error: "no order-link mobile on file for this client" };
          continue;
        }
        jobs.push((async () => {
          const lim = l.orderType === "LIMIT" && num(l.limitPrice) > 0 ? num(l.limitPrice) : null;
          const r = await gwCreateOrderLink(db, { code: u.code, phone: orderPhone, sym: l.sym || l.stock, qty: l.qty, side: l.side, orderType: lim ? "LIMIT" : "MARKET", price: lim });
          gwLinkRef.current[key] = r.ok ? { url: r.url } : { url: "", error: r.error };
          if (!r.ok) console.error("Order link failed for", u.code, l.sym || l.stock, r.error);
        })());
      }
    }
    if (jobs.length) await Promise.all(jobs);
  };
  const gwLinkFor = (unit, l) => (gwLinkRef.current[gwKey(unit, l)] || {}).url || "";
  const gwLinkErrorFor = (unit, l) => (gwLinkRef.current[gwKey(unit, l)] || {}).error || "";
  const sym = String(stock || "").trim().toUpperCase();
  // A typed-in price stands in for the live one, so quantities can still be
  // worked out for a stock the price feed doesn't carry.
  const manualPxOf = (s2) => num(manualPx[String(s2 || "").trim().toUpperCase()]);
  const priceFor = (s2) => manualPxOf(s2) > 0 ? manualPxOf(s2) : priceOf(s2);
  const livePrice = priceOf(sym);
  const price = priceFor(sym);
  const stockUniverse = useMemo(() => {
    const s = /* @__PURE__ */ new Set();
    for (const c of Object.values(db.clients || {})) for (const h of Object.values(c.holdings || {})) if (num(h.quantity) > 0) s.add(h.stock);
    return Array.from(s).sort();
  }, [db.clients]);
  const basket = (db.baskets || {})[risk] || [];
  const clientList = useMemo(() => Object.values(db.clients || {}).map((c) => ({ code: c.code, name: c.name || c.code })).sort((a, b) => String(a.name).localeCompare(String(b.name))), [db.clients]);
  const insertSuit = () => setSuitability(`This recommendation has been assessed as suitable for your risk profile${risk ? " (" + risk + " category)" : ""}. Please ensure it fits your overall goals before acting.`);
  const pickBasket = (e) => {
    const it = basket.find((b) => b.symbol === e.target.value);
    if (!it) return;
    setStock(it.symbol);
    if (it.rationale) setRationale(it.rationale);
    if (it.suitability) setSuitability(it.suitability);
    if (it.report) setReport(it.report);
  };
  const groupRows = useMemo(() => {
    if (target !== "group" || !sym) return [];
    const out = [];
    for (const c of Object.values(db.clients || {})) {
      if (risk && (c.risk || "") !== risk) continue;
      const method = execModeOf(db, c.code);
      if (methodFilter !== "all" && method !== methodFilter) continue;
      const cash = cashOf(c.code, c.name);
      const status = statusOf(c.code, c.name), pis = isPIS(status);
      const portfolio = portfolioOf(c);
      const ov = overrides[c.code] || {};
      let amount, qty, capped = false, reason = "", held = 0;
      if (side === "BUY") {
        const raw = portfolio * (num(orderPct) / 100);
        amount = raw;
        capped = num(maxCap) > 0 && raw > num(maxCap);
        if (capped) amount = num(maxCap);
        if (capAtCash) amount = Math.min(amount, cash);
        amount = Math.max(0, Math.round(amount));
        qty = price > 0 ? Math.floor(amount / price) : null;
        if (ov.amount != null) {
          amount = num(ov.amount);
          qty = price > 0 ? Math.floor(amount / price) : ov.qty != null ? num(ov.qty) : qty;
        }
        if (ov.qty != null) {
          qty = num(ov.qty);
          if (price > 0) amount = Math.round(qty * price);
        }
        if (cash < num(minCash)) reason = "cash below minimum";
        else if (amount <= 0) reason = "order is zero";
        else if (num(minOrder) > 0 && cash < num(minOrder)) reason = `cash below min order value (${money(minOrder)})`;
        else if (num(minOrder) > 0 && amount < num(minOrder)) reason = `order below minimum (${money(minOrder)})`;
        else if (pisOn && pis && amount < num(pisMinOrder)) reason = "PIS order below minimum";
      } else {
        held = heldQtyOf(c, sym);
        if (held <= 0) continue;
        const byValue = !fullSale && sellMode === "amount";
        qty = fullSale ? held : byValue ? price > 0 ? Math.floor(num(sellAmount) / price) : 0 : Math.round(held * (num(sellPct) / 100));
        capped = byValue && qty > held;
        qty = Math.max(0, Math.min(qty, held));
        amount = price > 0 ? Math.round(qty * price) : 0;
        if (ov.qty != null) {
          qty = Math.max(0, Math.min(num(ov.qty), held));
          if (price > 0) amount = Math.round(qty * price);
        }
        if (ov.amount != null && price > 0) {
          amount = num(ov.amount);
          qty = Math.min(Math.floor(amount / price), held);
        }
        if (byValue && price <= 0) reason = "no live price — cannot size by value";
        else if (qty <= 0) reason = "nothing to sell";
      }
      out.push({
        code: c.code,
        name: c.name || c.code,
        email: (c.email || "").trim(),
        whatsapp: (c.whatsapp || "").trim(),
        risk: c.risk || "\u2014",
        status: status || "\u2014",
        method,
        pis,
        cash,
        portfolio,
        held,
        amount,
        qty,
        capped,
        eligible: !reason,
        reason
      });
    }
    out.sort((a, b) => b.eligible - a.eligible || b.amount - a.amount || String(a.name).localeCompare(String(b.name)));
    return out;
  }, [target, side, db.clients, db.prices, db.execMode, methodFilter, risk, minCash, minOrder, pisOn, pisMinOrder, orderPct, maxCap, capAtCash, sellMode, sellPct, sellAmount, fullSale, sym, price, overrides]);
  const eligible = groupRows.filter((r) => r.eligible);
  const selected = eligible.filter((r) => !excluded.has(r.code));
  // Limit orders are laddered one tick apart per client so a batch doesn't stack
  // identical prices on the book: buys step up, sells step down.
  const isLimit = orderType === "LIMIT" && num(limitBase) > 0;
  const ladderAt = (i) => {
    const st = num(tickStep) || 0.05;
    const p = num(limitBase) + (side === "BUY" ? 1 : -1) * i * st;
    return Math.max(0.01, Math.round(p * 100) / 100);
  };
  const ladder = {};
  if (isLimit) selected.forEach((r, i) => {
    ladder[r.code] = ladderAt(i);
  });
  const toggle = (code) => setExcluded((p) => {
    const s = new Set(p);
    s.has(code) ? s.delete(code) : s.add(code);
    return s;
  });
  const setAll = (on) => setExcluded(on ? /* @__PURE__ */ new Set() : new Set(eligible.map((r) => r.code)));
  const editAmount = (code, v) => setOverrides((p) => ({ ...p, [code]: { ...p[code] || {}, amount: v === "" ? null : num(v), qty: null } }));
  const editQty = (code, v) => setOverrides((p) => ({ ...p, [code]: { ...p[code] || {}, qty: v === "" ? null : num(v), amount: null } }));
  const singleClient = (db.clients || {})[singleCode];
  const singleCash = singleClient ? cashOf(singleClient.code, singleClient.name) : 0;
  const addLine = () => setLines((a) => [...a, { id: Math.random().toString(36).slice(2), side, stock: "", mode: side === "SELL" ? "full" : "amount", value: "", limit: "", rationale, suitability, report }]);
  const updLine = (id, k, v) => setLines((a) => a.map((l) => l.id === id ? { ...l, [k]: v } : l));
  const delLine = (id) => setLines((a) => a.filter((l) => l.id !== id));
  const computeLine = (l) => {
    const s = String(l.stock || "").toUpperCase();
    const p = priceFor(s);
    let amount = 0, qty = null;
    if (l.side === "BUY") {
      if (l.mode === "amount") {
        amount = Math.round(num(l.value));
        qty = p > 0 ? Math.floor(amount / p) : null;
      } else if (l.mode === "pct") {
        amount = Math.round(portfolioOf(singleClient || {}) * num(l.value) / 100);
        qty = p > 0 ? Math.floor(amount / p) : null;
      } else if (l.mode === "qty") {
        qty = Math.round(num(l.value));
        amount = p > 0 ? Math.round(qty * p) : 0;
      }
    } else {
      const held = singleClient ? heldQtyOf(singleClient, s) : 0;
      if (l.mode === "full") qty = held;
      else if (l.mode === "pct") qty = Math.round(held * num(l.value) / 100);
      else if (l.mode === "amount") qty = p > 0 ? Math.min(Math.floor(num(l.value) / p), held) : 0;
      else if (l.mode === "qty") qty = Math.min(Math.round(num(l.value)), held);
      qty = Math.max(0, Math.min(qty || 0, held));
      amount = p > 0 ? Math.round(qty * p) : 0;
    }
    return { ...l, sym: s, price: p, amount, qty };
  };
  const singleComputed = lines.map(computeLine);
  // Symbols in the order lines with no live price: quantity can't be worked
  // out until someone types the market price, so ask for it right there.
  const missingPxSyms = Array.from(new Set(lines.map((l) => String(l.stock || "").trim().toUpperCase()).filter((s2) => s2 && priceOf(s2) <= 0)));

  const singleBuyTotal = singleComputed.filter((l) => l.side === "BUY").reduce((s, l) => s + l.amount, 0);
  const dmy = (d) => {
    const x = d || /* @__PURE__ */ new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    return `${p2(x.getDate())}-${p2(x.getMonth() + 1)}-${x.getFullYear()}`;
  };
  const atPrice = (l) => l.orderType === "LIMIT" && num(l.limitPrice) > 0
    ? ` at a limit price of ${money2(l.limitPrice)}`
    : l.price ? ` at market (around ${money(l.price)})` : " at market";
  const lineSentence = (l) => {
    if (l.side === "SELL") {
      const how = l.full ? " (your entire holding)" : l.pct != null ? ` (${l.pct}% of your holding)` : "";
      return `SELL ${l.sym || l.stock}: ${l.qty != null ? l.qty : ""} share(s)${how}${atPrice(l)}.`;
    }
    return `BUY ${l.sym || l.stock}: ${l.qty != null ? l.qty : ""} share(s)${atPrice(l)}.`;
  };
  // Approve / reject links for clients who act on advice by replying to the mail.
  // The backend turns these two marker lines into buttons in the HTML mail.
  const approveBlock = (unit) => {
    const who = `${unit.name}${unit.code ? ` (${unit.code})` : ""}`;
    const summary = unit.lines.map((l) => `${l.side} ${l.sym || l.stock}${l.qty != null ? " " + l.qty : ""}`).join(", ");
    const detail = [`Client: ${who}`, ...unit.lines.map(lineSentence)].join("\n");
    const approve = mailList(db.approveTo != null ? db.approveTo : DEFAULT_APPROVE_TO);
    const approveTo = approve.shift();
    const reject = mailList(db.rejectTo != null ? db.rejectTo : DEFAULT_REJECT_TO);
    const rejectTo = reject.shift();
    const gtc = String(db.approveText != null ? db.approveText : DEFAULT_APPROVE_TEXT);
    if (!approveTo && !rejectTo) return [];
    const out = ["To act on this advice, use one of the buttons below.", ""];
    if (approveTo) out.push(`Approve the order: ${mailtoUrl(approveTo, approve, `APPROVED by client — ${who} — ${summary}`, `${gtc}\n\n${detail}`)}`);
    if (rejectTo) out.push(`Reject the order: ${mailtoUrl(rejectTo, reject, `REJECTED BY CLIENT — ${who} — ${summary}`, `I do not wish to act on this advice.\n\n${detail}`)}`);
    out.push("");
    return out;
  };
  const buildOrderNote = (unit, channel) => {
    const L = [
      `Dear ${unit.name}${unit.code ? "/" + unit.code : ""},`,
      "",
      "Your Trade order is created and the details are as follows:",
      "",
      `Date: ${dmy()}`,
      `Portfolio Name: ${unit.code}${unit.risk ? " \u2014 " + unit.risk : ""}`,
      ""
    ];
    unit.lines.forEach((l, i) => {
      if (unit.lines.length > 1) L.push(`Order ${i + 1}`);
      L.push(`Company: ${l.sym || l.stock}`);
      L.push(`NSE: ${l.sym || l.stock}`);
      L.push(`Trans Type: ${l.side}`);
      L.push(`Quantity: ${l.qty != null ? l.qty : ""}`);
      const lim = l.orderType === "LIMIT" && num(l.limitPrice) > 0 ? num(l.limitPrice) : 0;
      if (lim) L.push(`Price: ${lim.toFixed(2)}`);
      else if (l.price) L.push(`Price: ${Number(l.price).toFixed(2)} (indicative)`);
      const gross = lim && l.qty != null ? Math.round(l.qty * lim) : l.amount;
      if (gross) L.push(`Total Amount: ${Number(gross).toFixed(2)}`);
      L.push(lim ? "Order Type: LMT" : "Order Type: MKT");
      L.push("Delayed Execution: No");
      L.push("");
      if ((l.rationale || "").trim()) L.push("Rationale", l.rationale.trim(), "");
      if ((l.suitability || "").trim()) L.push("Suitability", l.suitability.trim(), "");
      if ((l.report || "").trim()) L.push(`Research report: ${l.report.trim()}`, "");
    });
    if (channel !== "whatsapp") L.push(...approveBlock(unit));
    L.push(
      `${db.advisorName || "Jaideep Menon"}, Vasupradah Investment Advisory`,
      `SEBI RIA Reg. No. ${db.sebiRegNo || ""}`,
      "For private circulation only. Investments are subject to market risk; please read all related documents before investing."
    );
    return L.join("\n");
  };
  const buildExecNote = (unit) => {
    const L = [`Dear ${unit.name},`, ""];
    const many = unit.lines.length > 1;
    let anyLink = false;
    unit.lines.forEach((l, i) => {
      L.push(`${many ? i + 1 + ". " : ""}${lineSentence(l)}`);
      if ((l.rationale || "").trim()) L.push(`   Rationale: ${l.rationale.trim()}`);
      if ((l.suitability || "").trim()) L.push(`   Suitability: ${l.suitability.trim()}`);
      if ((l.report || "").trim()) L.push(`   Research report: ${l.report.trim()}`);
      const link = gwLinkFor(unit, l);
      if (link) {
        L.push(`   Click Here To Execute the Order: ${link}`);
        anyLink = true;
      } else {
        const err = gwLinkErrorFor(unit, l);
        L.push(`   Execute link unavailable${err ? ` (${err})` : ""}.`);
      }
      L.push("");
    });
    L.push(anyLink ? "How to act: use the execute link above to place the order in one click, or place it through your broker." : "How to act: place the order through your broker.", "");
    L.push(
      `${db.advisorName || "Jaideep Menon"}, Vasupradah Investment Advisory`,
      `SEBI RIA Reg. No. ${db.sebiRegNo || ""}`,
      "For private circulation only. Investments are subject to market risk; please read all related documents before investing."
    );
    return L.join("\n");
  };
  const buildBody = (unit, channel) => methodOf(unit) === "gateway" ? buildExecNote(unit) : buildOrderNote(unit, channel);
  const priceLabel = (l) => l.orderType === "LIMIT" && num(l.limitPrice) > 0 ? Number(l.limitPrice).toFixed(2) : "market price";
  const orderPhrase = (l) => `${l.side} ${l.sym || l.stock}${l.qty != null ? " " + l.qty : ""} @ ${priceLabel(l)}`;
  const subjectOf = (u) => {
    const who = `${u && u.name || ""}${u && u.code ? ` (${u.code})` : ""}`.trim();
    const ls = u && u.lines || [];
    if (!ls.length) return `${who ? who + " \u2014 " : ""}Stock Recommendation - ${dmy()}`;
    const what = ls.length > 2 ? `${ls.length} orders` : ls.map(orderPhrase).join(", ");
    return `${who ? who + " \u2014 " : ""}${what}`;
  };
  const buildUnits = () => {
    if (target === "single") {
      if (!singleClient) return [];
      const ls = singleComputed.filter((l) => (l.stock || "").trim() && (l.qty || l.amount)).map((l) => ({
        side: l.side,
        stock: l.sym,
        sym: l.sym,
        price: l.price,
        amount: l.amount,
        qty: l.qty,
        pct: l.mode === "pct" ? num(l.value) : null,
        full: l.mode === "full",
        orderType: num(l.limit) > 0 ? "LIMIT" : "MARKET",
        limitPrice: num(l.limit) > 0 ? num(l.limit) : null,
        rationale: l.rationale,
        suitability: l.suitability,
        report: l.report
      }));
      return [{ code: singleClient.code, name: singleClient.name || singleClient.code, risk: singleClient.risk || "", email: (singleClient.email || "").trim(), whatsapp: (singleClient.whatsapp || "").trim(), lines: ls }];
    }
    return selected.map((r) => ({ code: r.code, name: r.name, risk: r.risk, email: r.email, whatsapp: r.whatsapp, lines: [{
      side,
      stock: sym,
      sym,
      price,
      amount: r.amount,
      qty: r.qty,
      pct: side === "BUY" ? num(orderPct) : fullSale || sellMode === "amount" ? null : num(sellPct),
      full: side === "SELL" && fullSale,
      capped: r.capped,
      orderType: isLimit ? "LIMIT" : "MARKET",
      limitPrice: isLimit ? ladder[r.code] : null,
      rationale,
      suitability,
      report
    }] }));
  };
  const units = buildUnits();
  const sheetRows = () => {
    const rows = [];
    for (const u of units) for (const l of u.lines) rows.push({
      Code: u.code,
      Name: u.name,
      Side: l.side,
      Stock: l.sym,
      "Order %": l.pct == null ? "" : l.pct,
      "Order (INR)": l.amount,
      "Qty": l.qty == null ? "" : l.qty,
      "Order type": l.orderType === "LIMIT" ? "LIMIT" : "MARKET",
      "Limit price": l.orderType === "LIMIT" && l.limitPrice ? Number(l.limitPrice).toFixed(2) : "",
      Price: l.price || "",
      "Model": model,
      Rationale: l.rationale || "",
      Suitability: l.suitability || "",
      "Research report": l.report || "",
      "Execution link": gwLinkFor(u, l),
      Email: u.email,
      WhatsApp: u.whatsapp
    });
    return rows;
  };
  const validate = () => {
    if (target === "single") {
      if (!singleClient) {
        showToast("Pick a client.", "err");
        return false;
      }
      if (!units.length || !units[0].lines.length) {
        showToast("Add at least one order line with a stock and amount/qty.", "err");
        return false;
      }
      if (units[0].lines.some((l) => !l.suitability || !l.suitability.trim())) {
        showToast("Each order line needs a suitability statement.", "err");
        return false;
      }
    } else {
      if (!sym) {
        showToast(side === "SELL" ? "Select the stock to sell." : "Select or type the stock.", "err");
        return false;
      }
      if (side === "BUY" && num(orderPct) <= 0) {
        showToast("Enter an order size (%).", "err");
        return false;
      }
      if (orderType === "LIMIT" && num(limitBase) <= 0) {
        showToast("Enter the limit price, or switch the order type back to Market.", "err");
        return false;
      }
      if (side === "SELL" && !fullSale && sellMode === "amount" && num(sellAmount) <= 0) {
        showToast("Enter the sell value (₹).", "err");
        return false;
      }
      if (side === "SELL" && !fullSale && sellMode !== "amount" && num(sellPct) <= 0) {
        showToast("Enter the % of holding to sell.", "err");
        return false;
      }
      if (!suitability.trim()) {
        showToast("Add a suitability statement \u2014 required for advice.", "err");
        return false;
      }
      if (!selected.length) {
        showToast("No eligible clients selected.", "err");
        return false;
      }
    }
    return true;
  };
  const traceRows = (us, channel) => us.map((u) => ({
    at: Date.now(),
    by: db.adminName || "admin",
    channel,
    batchId: "",
    title: target === "single" ? `${u.name}: ${u.lines.length} order(s)` : `${side} ${sym}`,
    side: u.lines.length === 1 ? u.lines[0].side : "MIXED",
    stock: u.lines.length === 1 ? u.lines[0].sym : "multiple",
    code: u.code,
    name: u.name,
    amount: u.lines.reduce((s, l) => s + (l.amount || 0), 0),
    qty: u.lines.length === 1 ? u.lines[0].qty : null,
    model,
    subject: subjectOf(u)
  }));
  const dispatchEmail = async (us) => {
    const withE = us.filter((u) => u.email.includes("@"));
    if (!withE.length) {
      showToast("No selected client has an email address.", "err");
      return;
    }
    if (!(db.sheetUrl || "").trim()) {
      showToast("Connect your Google Sheet in Settings first.", "err");
      return;
    }
    setSending(true);
    try {
      await ensureGatewayLinks(gwUnitsOf(withE));
      const recipients = withE.map((u) => ({ email: u.email, name: u.name, subject: subjectOf(u), body: buildBody(u) }));
      const startedAt = Date.now();
      await fetch(db.sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: db.sheetToken || "", type: "greeting_email", image: "", subject: "Investment advice", bodyText: "", recipients, personalize: true, replyTo: withE.some((u) => methodOf(u) === "email") ? approveReplyTo(db) : "", fromName: db.advisorName || "Vasupradah Investment Advisory" })
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
        logAdviceTrace(db, traceRows(withE, "email"));
        showToast(result || `Sending advice to ${withE.length} client(s) by email.`);
      }
    } catch (e) {
      showToast("Couldn't reach the email endpoint.", "err");
    } finally {
      setSending(false);
    }
  };
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const openEmailPreview = async () => {
    if (!validate()) return;
    const withE = units.filter((u) => u.email.includes("@"));
    if (!withE.length) {
      showToast("No selected client has an email address.", "err");
      return;
    }
    if (gwUnitsOf(withE).length) {
      showToast("Preparing execute links…");
      await ensureGatewayLinks(gwUnitsOf(withE));
    }
    setPreviewIdx(0);
    setEmailPreviewOpen(true);
  };
  const waUnits = units.filter((u) => waNumber(u.whatsapp));
  const sendWaOne = async (u) => {
    if (!waNumber(u.whatsapp)) {
      showToast("No WhatsApp number.", "err");
      return;
    }
    await ensureGatewayLinks(gwUnitsOf([u]));
    openWhatsApp(u.whatsapp, buildBody(u, "whatsapp"));
    logAdviceTrace(db, traceRows([u], "whatsapp"));
    setSentWA((p) => {
      const s = new Set(p);
      s.add(u.code);
      return s;
    });
  };
  const waNext = async () => {
    const u = waUnits.find((x) => !sentWA.has(x.code));
    if (!u) {
      showToast("All opened.", "ok");
      return;
    }
    await sendWaOne(u);
  };
  const downloadExcel = (rows, title) => {
    if (!rows.length) {
      showToast("Nothing to export.", "err");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Advice");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "advice"}-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const exportExcel = async () => {
    if (!validate()) return;
    await ensureGatewayLinks(gwUnitsOf(units));
    downloadExcel(sheetRows(), `advice-${target === "single" ? singleClient.name || "client" : sym || side}`);
    showToast("Excel downloaded.");
  };
  const pushAlerts = async (list) => {
    if (!(db.sheetUrl || "").trim()) return;
    try {
      await fetch(db.sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: db.sheetToken || "", type: "advice_alerts", alerts: (list || []).slice(0, 15) })
      });
    } catch (e) {
    }
  };
  const saveBatch = async () => {
    if (!validate()) return;
    await ensureGatewayLinks(gwUnitsOf(units));
    const dispatch = units.map((u) => ({
      code: u.code,
      name: u.name,
      email: u.email,
      whatsapp: u.whatsapp,
      subject: subjectOf(u),
      body: buildBody(u, "email"),
      waBody: buildBody(u, "whatsapp"),
      amount: u.lines.reduce((s, l) => s + (l.amount || 0), 0),
      qty: u.lines.length === 1 ? u.lines[0].qty : null
    }));
    const batch = {
      id: Date.now().toString(36),
      at: Date.now(),
      by: db.adminName || "admin",
      side,
      target,
      model,
      stock: target === "single" ? "" : sym,
      title: target === "single" ? `${singleClient.name}: ${units[0].lines.length} order(s)` : `${side} ${sym} \xB7 ${dispatch.length} client(s)`,
      dispatch,
      sheet: sheetRows()
    };
    const next = await commit((d) => {
      d.adviceOrders = [batch, ...d.adviceOrders || []].slice(0, 60);
    }, "save advice order");
    await pushAlerts(next.adviceOrders);
    showToast("Order saved and sent to Advice Alerts \u2014 your staff can alert customers from there.");
  };
  const saved = db.adviceOrders || [];
  const resendEmail = async (b) => {
    const withE = (b.dispatch || []).filter((r) => r.email && r.email.includes("@"));
    if (!withE.length) {
      showToast("This batch has no email recipients.", "err");
      return;
    }
    setSending(true);
    try {
      const recipients = withE.map((r) => ({ email: r.email, name: r.name, subject: r.subject, body: r.body }));
      await fetch(db.sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: db.sheetToken || "", type: "greeting_email", image: "", subject: "Investment advice", bodyText: "", recipients, personalize: true, replyTo: approveReplyTo(db), fromName: db.advisorName || "Vasupradah Investment Advisory" })
      });
      showToast(`Resent to ${withE.length} client(s) by email.`);
    } catch (e) {
      showToast("Couldn't reach the email endpoint.", "err");
    } finally {
      setSending(false);
    }
  };
  const resendWa = (b) => {
    const r = (b.dispatch || []).find((x) => waNumber(x.whatsapp));
    if (!r) {
      showToast("No WhatsApp numbers in this batch.", "err");
      return;
    }
    openWhatsApp(r.whatsapp, r.body);
    showToast("Opened first client \u2014 use the batch again for the next.");
  };
  const delBatch = async (id) => {
    const next = await commit((d) => {
      d.adviceOrders = (d.adviceOrders || []).filter((b) => b.id !== id);
    }, "delete advice order");
    await pushAlerts(next.adviceOrders);
  };
  const inCls = "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const lbl = "text-[11px] text-slate-500 block mb-1";
  const seg = (val, cur, set, label) => /* @__PURE__ */ React.createElement("button", { onClick: () => set(val), className: `text-sm px-3 py-1.5 rounded-lg border ${cur === val ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}` }, label);
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3 flex-wrap" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-semibold text-slate-800" }, "Advice orders"), /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 max-w-3xl" }, "Send personalised buy/sell advice \u2014 to a whole risk group or a single client \u2014 by email (client places the order) or the execute-link model. Adjust any amount or quantity before sending, save the batch, and export to Excel for your relationship managers.")), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setBasketOpen(true), className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Layers, { size: 15 }), " Baskets"), /* @__PURE__ */ React.createElement("button", { onClick: () => setSavedOpen((v) => !v), className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(RefreshCw, { size: 15 }), " Saved orders ", saved.length ? `(${saved.length})` : ""), draftHasContent && /* @__PURE__ */ React.createElement("button", { onClick: () => { if (window.confirm("Remove the auto-saved advice draft and clear this order?")) clearDraft(); }, title: "The advice order is auto-saved in this browser. This removes it.", className: "text-sm px-3 py-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Trash2, { size: 15 }), " Clear draft"))), draftRestored && draftHasContent && /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between gap-3 flex-wrap text-[12px] bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2" }, /* @__PURE__ */ React.createElement("span", null, "Picked up the advice order you had in progress. It is saved in this browser as you type, so leaving this tab no longer loses it \u2014 use \"Clear draft\" to start fresh."), /* @__PURE__ */ React.createElement("button", { onClick: () => setDraftRestored(false), className: "text-amber-700 hover:underline whitespace-nowrap" }, "Dismiss")), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 uppercase" }, "Side"), seg("BUY", side, setSide, "Buy"), seg("SELL", side, setSide, "Sell")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 uppercase" }, "For"), seg("group", target, setTarget, "Risk group"), seg("single", target, setTarget, "Single client")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 uppercase" }, "Model"), seg("auto", model, setModel, "By client setting"), seg("manual", model, setModel, "Email (manual)"), seg("execution", model, setModel, "Execution (execute link)")), target === "group" && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 uppercase" }, "Clients"), seg("all", methodFilter, setMethodFilter, "All"), seg("email", methodFilter, setMethodFilter, "Email approval"), seg("gateway", methodFilter, setMethodFilter, "Execute link"))), target === "group" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-4 grid md:grid-cols-3 gap-3" }, side === "SELL" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Stock to sell (NSE symbol)"), /* @__PURE__ */ React.createElement("input", { list: "adv-stocks", value: stock, onChange: (e) => setStock(e.target.value), placeholder: "e.g. INFY", className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Risk category"), /* @__PURE__ */ React.createElement("select", { value: risk, onChange: (e) => {
    setRisk(e.target.value);
    setExcluded(/* @__PURE__ */ new Set());
  }, className: inCls }, /* @__PURE__ */ React.createElement("option", { value: "" }, "All risk categories"), RISK_CATEGORIES.map((r) => /* @__PURE__ */ React.createElement("option", { key: r, value: r }, r)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Order type"), /* @__PURE__ */ React.createElement("select", { value: orderType, onChange: (e) => setOrderType(e.target.value), className: inCls }, /* @__PURE__ */ React.createElement("option", { value: "MARKET" }, "Market"), /* @__PURE__ */ React.createElement("option", { value: "LIMIT" }, "Limit"))), orderType === "LIMIT" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Limit price (\u20B9) ", /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "\u2014 first client's price")), /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.05", value: limitBase, onChange: (e) => setLimitBase(e.target.value), placeholder: price > 0 ? String(price) : "e.g. 116.00", className: inCls })), orderType === "LIMIT" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Tick step (\u20B9) ", /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, side === "BUY" ? "\u2014 each client steps up" : "\u2014 each client steps down")), /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.05", value: tickStep, onChange: (e) => setTickStep(e.target.value), className: inCls }), isLimit && selected.length > 1 && /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mt-1" }, `${selected.length} client(s): ${ladderAt(0).toFixed(2)} \u2192 ${ladderAt(selected.length - 1).toFixed(2)}`)), side === "BUY" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Minimum available cash (\u20B9)"), /* @__PURE__ */ React.createElement("input", { type: "number", value: minCash, onChange: (e) => setMinCash(e.target.value), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Minimum order value (\u20B9) ", /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "\u2014 no order below this")), /* @__PURE__ */ React.createElement("input", { type: "number", value: minOrder, onChange: (e) => setMinOrder(e.target.value), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Stock (NSE symbol)"), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("input", { list: "adv-stocks", value: stock, onChange: (e) => setStock(e.target.value), placeholder: "e.g. HDFCBANK", className: inCls }), basket.length > 0 && /* @__PURE__ */ React.createElement("select", { onChange: pickBasket, value: "", className: "px-2 text-xs border border-slate-300 rounded-lg bg-white", title: "Pick from this category's basket" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Basket\u2026"), basket.map((b) => /* @__PURE__ */ React.createElement("option", { key: b.symbol, value: b.symbol }, b.symbol))))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Order size (% of portfolio)"), /* @__PURE__ */ React.createElement("input", { type: "number", value: orderPct, onChange: (e) => setOrderPct(e.target.value), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Maximum order value (\u20B9) ", /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "\u2014 0 = no cap")), /* @__PURE__ */ React.createElement("input", { type: "number", value: maxCap, onChange: (e) => setMaxCap(e.target.value), className: inCls })), /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-2 text-[12px] text-slate-600 md:col-span-1 self-end pb-2" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: capAtCash, onChange: (e) => setCapAtCash(e.target.checked) }), " Cap each order at available cash")), side === "SELL" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: fullSale ? "opacity-40 pointer-events-none" : "" }, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Sell by"), /* @__PURE__ */ React.createElement("select", { value: sellMode, onChange: (e) => setSellMode(e.target.value), className: inCls }, /* @__PURE__ */ React.createElement("option", { value: "pct" }, "% of holding"), /* @__PURE__ */ React.createElement("option", { value: "amount" }, "Value (₹) per client"))), /* @__PURE__ */ React.createElement("div", { className: fullSale ? "opacity-40 pointer-events-none" : "" }, sellMode === "amount" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Sell value per client (₹) ", /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "— capped at what each client holds")), /* @__PURE__ */ React.createElement("input", { type: "number", value: sellAmount, onChange: (e) => setSellAmount(e.target.value), className: inCls })) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "% of holding to sell"), /* @__PURE__ */ React.createElement("input", { type: "number", value: sellPct, onChange: (e) => setSellPct(e.target.value), className: inCls }))), /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-2 text-[12px] text-slate-600 self-end pb-2" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: fullSale, onChange: (e) => setFullSale(e.target.checked) }), " Full sale (sell entire holding)")), side === "BUY" && /* @__PURE__ */ React.createElement("div", { className: "md:col-span-3 border-t border-slate-100 pt-3 grid md:grid-cols-3 gap-3" }, /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-2 text-[12px] text-slate-600" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: pisOn, onChange: (e) => setPisOn(e.target.checked) }), " Higher minimum for NRI-PIS accounts"), /* @__PURE__ */ React.createElement("div", { className: pisOn ? "" : "opacity-40 pointer-events-none" }, /* @__PURE__ */ React.createElement("label", { className: lbl }, "NRI-PIS minimum order value (\u20B9)"), /* @__PURE__ */ React.createElement("input", { type: "number", value: pisMinOrder, onChange: (e) => setPisMinOrder(e.target.value), className: inCls })), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 self-end pb-1" }, 'PIS detected by "PIS" in account type; small PIS orders are excluded.'))), /* @__PURE__ */ React.createElement("datalist", { id: "adv-stocks" }, stockUniverse.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }))), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-4 grid md:grid-cols-3 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Rationale"), /* @__PURE__ */ React.createElement("textarea", { value: rationale, onChange: (e) => setRationale(e.target.value), rows: 4, placeholder: "Why this now\u2026", className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500" }, "Suitability statement ", /* @__PURE__ */ React.createElement("span", { className: "text-rose-500" }, "*")), /* @__PURE__ */ React.createElement("button", { onClick: insertSuit, className: "text-[11px] text-indigo-600 hover:underline" }, "Insert standard note")), /* @__PURE__ */ React.createElement("textarea", { value: suitability, onChange: (e) => setSuitability(e.target.value), rows: 4, placeholder: "Why this suits the client's risk category\u2026", className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Research report link"), /* @__PURE__ */ React.createElement("input", { value: report, onChange: (e) => setReport(e.target.value), placeholder: "https://\u2026", className: inCls }), /* @__PURE__ */ React.createElement("div", { className: "mt-3" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500 block mb-1" }, "Market price for ", sym || "stock", " (\u20B9) ", /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, livePrice > 0 ? "\u2014 live, override if needed" : "\u2014 no live price, type one to get quantities")), /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.05", disabled: !sym, value: manualPx[sym] ?? "", onChange: (e) => setManualPx((m) => ({ ...m, [sym]: e.target.value })), placeholder: livePrice > 0 ? String(livePrice) : "e.g. 116.00", className: inCls + " disabled:bg-slate-50" }), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] mt-1 " + (price > 0 ? "text-slate-400" : "text-amber-600") }, price > 0 ? (manualPxOf(sym) > 0 ? `Using your price ${money2(price)}` + (livePrice > 0 ? ` instead of the live ${money2(livePrice)}` : "") : `Live price ${money2(price)}`) : "No price yet \u2014 orders will size by amount only, with no quantity."))))) : (
    /* SINGLE CLIENT */
    /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-4 space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "grid md:grid-cols-3 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Client"), /* @__PURE__ */ React.createElement("select", { value: singleCode, onChange: (e) => setSingleCode(e.target.value), className: inCls }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Select a client\u2026"), clientList.map((c) => /* @__PURE__ */ React.createElement("option", { key: c.code, value: c.code }, c.name, " (", c.code, ")")))), singleClient && /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2 flex items-end gap-4 text-[12px] text-slate-500 pb-1" }, /* @__PURE__ */ React.createElement("span", null, "Available cash: ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, money(singleCash))), /* @__PURE__ */ React.createElement("span", null, "Portfolio: ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, money(portfolioOf(singleClient)))), side === "BUY" && /* @__PURE__ */ React.createElement("span", null, "Deployed in lines: ", /* @__PURE__ */ React.createElement("b", { className: singleBuyTotal > singleCash ? "text-amber-600" : "text-slate-700" }, money(singleBuyTotal))))), /* @__PURE__ */ React.createElement("datalist", { id: "adv-stocks" }, stockUniverse.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }))), /* @__PURE__ */ React.createElement("datalist", { id: "held-stocks" }, singleClient && Object.values(singleClient.holdings || {}).filter((h) => num(h.quantity) > 0).map((h) => /* @__PURE__ */ React.createElement("option", { key: h.stock, value: h.stock }))), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, singleComputed.map((l) => /* @__PURE__ */ React.createElement("div", { key: l.id, className: "border border-slate-200 rounded-lg p-2 grid md:grid-cols-12 gap-2 items-start" }, /* @__PURE__ */ React.createElement("select", { value: l.side, onChange: (e) => updLine(l.id, "side", e.target.value), className: "px-2 py-1.5 text-sm border border-slate-300 rounded-md md:col-span-1" }, /* @__PURE__ */ React.createElement("option", null, "BUY"), /* @__PURE__ */ React.createElement("option", null, "SELL")), /* @__PURE__ */ React.createElement("input", { list: l.side === "SELL" ? "held-stocks" : "adv-stocks", value: l.stock, onChange: (e) => updLine(l.id, "stock", e.target.value), placeholder: "SYMBOL", className: "px-2 py-1.5 text-sm border border-slate-300 rounded-md md:col-span-2 uppercase" }), /* @__PURE__ */ React.createElement("select", { value: l.mode, onChange: (e) => updLine(l.id, "mode", e.target.value), className: "px-2 py-1.5 text-sm border border-slate-300 rounded-md md:col-span-2" }, l.side === "BUY" ? [/* @__PURE__ */ React.createElement("option", { key: "amount", value: "amount" }, "Amount \u20B9"), /* @__PURE__ */ React.createElement("option", { key: "pct", value: "pct" }, "% portfolio"), /* @__PURE__ */ React.createElement("option", { key: "qty", value: "qty" }, "Qty")] : [/* @__PURE__ */ React.createElement("option", { key: "full", value: "full" }, "Full holding"), /* @__PURE__ */ React.createElement("option", { key: "pct", value: "pct" }, "% holding"), /* @__PURE__ */ React.createElement("option", { key: "amount", value: "amount" }, "Value ₹"), /* @__PURE__ */ React.createElement("option", { key: "qty", value: "qty" }, "Qty")]), /* @__PURE__ */ React.createElement("input", { value: l.value, onChange: (e) => updLine(l.id, "value", e.target.value), disabled: l.mode === "full", placeholder: l.mode === "full" ? "\u2014" : "value", className: "px-2 py-1.5 text-sm border border-slate-300 rounded-md md:col-span-1 disabled:bg-slate-50" }), /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.05", value: l.limit || "", onChange: (e) => updLine(l.id, "limit", e.target.value), title: "Limit price - leave blank for a market order", placeholder: "mkt", className: "px-2 py-1.5 text-sm border border-slate-300 rounded-md md:col-span-1" }), /* @__PURE__ */ React.createElement("input", { value: l.suitability, onChange: (e) => updLine(l.id, "suitability", e.target.value), placeholder: "Suitability *", className: "px-2 py-1.5 text-sm border border-slate-300 rounded-md md:col-span-2" }), /* @__PURE__ */ React.createElement("div", { className: "md:col-span-3 flex items-center gap-2 text-[12px] text-slate-500" }, /* @__PURE__ */ React.createElement("span", { className: "tabular-nums" }, money(l.amount), l.qty != null ? ` \xB7 ${l.qty} sh` : ""), l.side === "BUY" && /* @__PURE__ */ React.createElement("button", { onClick: () => {
      updLine(l.id, "mode", "amount");
      updLine(l.id, "value", String(Math.max(0, Math.round(singleCash - (singleBuyTotal - l.amount)))));
    }, className: "text-[11px] text-indigo-600 hover:underline" }, "use rem. cash"), /* @__PURE__ */ React.createElement("button", { onClick: () => delLine(l.id), className: "text-rose-500 hover:bg-rose-50 rounded p-1 ml-auto" }, /* @__PURE__ */ React.createElement(Trash2, { size: 14 }))), /* @__PURE__ */ React.createElement("input", { value: l.rationale, onChange: (e) => updLine(l.id, "rationale", e.target.value), placeholder: "Rationale (optional)", className: "px-2 py-1.5 text-sm border border-slate-200 rounded-md md:col-span-6" }), /* @__PURE__ */ React.createElement("input", { value: l.report, onChange: (e) => updLine(l.id, "report", e.target.value), placeholder: "research report link (optional)", className: "px-2 py-1.5 text-sm border border-slate-200 rounded-md md:col-span-6" })))), missingPxSyms.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "border border-amber-200 bg-amber-50 rounded-lg p-2.5 space-y-2" }, /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-amber-800" }, "No live price for these \u2014 type the current market price so the quantity can be worked out."), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-3" }, missingPxSyms.map((s2) => /* @__PURE__ */ React.createElement("label", { key: s2, className: "flex items-center gap-1.5 text-[12px] text-amber-900" }, s2, /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.05", value: manualPx[s2] ?? "", onChange: (e) => setManualPx((m) => ({ ...m, [s2]: e.target.value })), placeholder: "\u20B9", className: "w-24 px-2 py-1 text-sm border border-amber-300 rounded-md bg-white focus:ring-2 focus:ring-amber-400" }))))), /* @__PURE__ */ React.createElement("button", { onClick: addLine, disabled: !singleClient, className: "text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Plus, { size: 14 }), " Add order line"))
  ), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 items-center" }, /* @__PURE__ */ React.createElement("button", { onClick: openEmailPreview, disabled: sending, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Mail, { size: 15 }), " ", sending ? "Sending\u2026" : `Email ${target === "single" ? "client" : `selected (${units.filter((u) => u.email.includes("@")).length})`}`), /* @__PURE__ */ React.createElement("button", { onClick: async () => {
    if (!validate()) return;
    const next = !waOpen;
    if (next) {
      showToast("Preparing execute links…");
      await ensureGatewayLinks(gwUnitsOf(waUnits));
    }
    setWaOpen(next);
  }, disabled: !waUnits.length, className: "text-sm px-4 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(MessageCircle, { size: 15 }), " WhatsApp (", waUnits.length, ")"), /* @__PURE__ */ React.createElement("button", { onClick: saveBatch, className: "text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Check, { size: 15 }), " Save order"), /* @__PURE__ */ React.createElement("button", { onClick: exportExcel, className: "text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Download, { size: 15 }), " Export Excel"), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 ml-1" }, model === "execution" ? "Execution model: one-click execute link in the message." : "Email model: client places the order via their broker or the link.")), waOpen && /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-sm font-medium text-slate-700" }, "WhatsApp \u2014 send one by one"), /* @__PURE__ */ React.createElement("button", { onClick: waNext, className: "text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(MessageCircle, { size: 13 }), " Open next"), sentWA.size > 0 && /* @__PURE__ */ React.createElement("button", { onClick: () => setSentWA(/* @__PURE__ */ new Set()), className: "text-xs text-slate-500 hover:underline" }, "Reset"), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 ml-auto" }, sentWA.size, " of ", waUnits.length, " opened")), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg divide-y divide-slate-100", style: { maxHeight: "45vh", overflowY: "auto" } }, waUnits.map((u) => {
    const done = sentWA.has(u.code);
    const amt = u.lines.reduce((s, l) => s + (l.amount || 0), 0);
    return /* @__PURE__ */ React.createElement("div", { key: u.code, className: "flex items-center gap-2 px-3 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-800 truncate flex items-center gap-1.5" }, done && /* @__PURE__ */ React.createElement(Check, { size: 13, className: "text-emerald-600 shrink-0" }), u.name), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, waDisplay(u.whatsapp), " \xB7 ", money(amt))), /* @__PURE__ */ React.createElement("button", { onClick: () => sendWaOne(u), className: `text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5 shrink-0 ${done ? "border border-emerald-200 text-emerald-700 bg-emerald-50" : "bg-emerald-600 hover:bg-emerald-700 text-white"}` }, /* @__PURE__ */ React.createElement(Send, { size: 12 }), " ", done ? "Again" : "Send"));
  }))), target === "group" && /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between px-4 py-2 border-b border-slate-100 text-[12px] text-slate-500" }, /* @__PURE__ */ React.createElement("span", null, eligible.length, " eligible \xB7 ", groupRows.length - eligible.length, " excluded", Object.keys(overrides).length ? ` \xB7 ${Object.keys(overrides).length} edited` : ""), /* @__PURE__ */ React.createElement("span", { className: "flex gap-3" }, Object.keys(overrides).length > 0 && /* @__PURE__ */ React.createElement("button", { onClick: () => setOverrides({}), className: "text-slate-500 hover:underline" }, "Reset edits"), /* @__PURE__ */ React.createElement("button", { onClick: () => setAll(true), className: "text-indigo-600 hover:underline" }, "Select all"), /* @__PURE__ */ React.createElement("button", { onClick: () => setAll(false), className: "text-slate-500 hover:underline" }, "Clear"))), /* @__PURE__ */ React.createElement("div", { style: { maxHeight: "55vh", overflowY: "auto" } }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2 w-8" }), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Client"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Risk / type"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, side === "SELL" ? "Held qty" : "Portfolio"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, side === "SELL" ? "Holding \u20B9" : "Cash"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, side === "SELL" ? "Sell \u20B9" : "Order \u20B9"), isLimit && /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Limit \u20B9"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Qty"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, groupRows.map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.code, className: r.eligible ? "" : "opacity-45" }, /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", disabled: !r.eligible, checked: r.eligible && !excluded.has(r.code), onChange: () => toggle(r.code) })), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "text-slate-800" }, r.name, r.pis && /* @__PURE__ */ React.createElement("span", { className: "ml-1.5 text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700" }, "PIS")), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, r.code, !r.email.includes("@") ? " \xB7 no email" : "", !waNumber(r.whatsapp) ? " \xB7 no WhatsApp" : "", !r.eligible ? ` \xB7 ${r.reason}` : "")), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, r.risk, /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, r.status), /* @__PURE__ */ React.createElement("span", { className: `text-[10px] px-1.5 py-0.5 rounded ${r.method === "gateway" ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"}` }, EXEC_MODE_LABEL[r.method])), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right text-slate-600" }, side === "SELL" ? r.held : money(r.portfolio)), /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-right ${side === "BUY" && r.amount > r.cash ? "text-amber-600" : "text-slate-600"}` }, side === "SELL" ? money(r.held * price) : money(r.cash)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right" }, /* @__PURE__ */ React.createElement("input", { value: r.amount, onChange: (e) => editAmount(r.code, e.target.value), disabled: !r.eligible, className: "w-24 text-right px-2 py-1 border border-slate-200 rounded-md text-slate-800 focus:ring-2 focus:ring-indigo-500 disabled:bg-transparent disabled:border-transparent" }), r.capped && /* @__PURE__ */ React.createElement("span", { className: "ml-1 text-[10px] text-amber-600" }, "cap")), isLimit && /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, ladder[r.code] != null ? ladder[r.code].toFixed(2) : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right" }, /* @__PURE__ */ React.createElement("input", { value: r.qty == null ? "" : r.qty, onChange: (e) => editQty(r.code, e.target.value), disabled: !r.eligible || price <= 0, className: "w-16 text-right px-2 py-1 border border-slate-200 rounded-md text-slate-600 focus:ring-2 focus:ring-indigo-500 disabled:bg-transparent disabled:border-transparent" })))), !groupRows.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: isLimit ? 8 : 7, className: "px-3 py-8 text-center text-slate-400 text-sm" }, !sym ? `Enter a stock symbol above to see which clients are eligible to ${side === "SELL" ? "sell" : "buy"}.` : side === "SELL" ? "No clients hold this stock in the selected category." : "No clients in this risk category.")))))), savedOpen && /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-3" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm font-medium text-slate-700 mb-2" }, "Saved orders \u2014 resend or export"), !saved.length && /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-400 py-3 text-center" }, 'No saved orders yet. Use "Save order" to keep a batch here.'), /* @__PURE__ */ React.createElement("div", { className: "space-y-2", style: { maxHeight: "50vh", overflowY: "auto" } }, saved.map((b) => /* @__PURE__ */ React.createElement("div", { key: b.id, className: "border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-800" }, b.title, " ", /* @__PURE__ */ React.createElement("span", { className: "text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 ml-1" }, b.model === "execution" ? "execute link" : b.model === "auto" ? "by client" : "email")), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, new Date(b.at).toLocaleString("en-IN"), " \xB7 ", (b.dispatch || []).length, " recipient(s)")), /* @__PURE__ */ React.createElement("button", { onClick: () => resendEmail(b), disabled: sending, className: "text-xs px-2.5 py-1 rounded-md border border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center gap-1 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Mail, { size: 12 }), " Resend email"), /* @__PURE__ */ React.createElement("button", { onClick: () => resendWa(b), className: "text-xs px-2.5 py-1 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1" }, /* @__PURE__ */ React.createElement(MessageCircle, { size: 12 }), " WhatsApp"), /* @__PURE__ */ React.createElement("button", { onClick: () => downloadExcel(b.sheet || [], "advice-" + b.id), className: "text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Download, { size: 12 }), " Excel"), /* @__PURE__ */ React.createElement("button", { onClick: () => delBatch(b.id), className: "text-xs px-2 py-1 rounded-md text-rose-500 hover:bg-rose-50" }, /* @__PURE__ */ React.createElement(Trash2, { size: 13 })))))), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400" }, 'Amber cash means the order exceeds available cash \u2014 edit the amount, tick "cap at available cash", or arrange a top-up. Execution confirmation via the order-link gateway is a separate hookup; the Excel export lets your relationship managers follow up meanwhile.'), emailPreviewOpen && (() => {
    const withE = units.filter((u) => u.email.includes("@"));
    const idx = withE.length ? Math.min(previewIdx, withE.length - 1) : 0;
    const pu = withE[idx];
    return /* @__PURE__ */ React.createElement(Modal, { onClose: () => setEmailPreviewOpen(false), title: `Preview email \xB7 ${withE.length} recipient(s)`, wide: true }, !pu ? /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500" }, "No recipients with an email address.") : /* @__PURE__ */ React.createElement(React.Fragment, null, withE.length > 1 && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-3" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setPreviewIdx((i) => Math.max(0, i - 1)), disabled: idx === 0, className: "text-xs px-2 py-1 rounded-md border border-slate-200 disabled:opacity-40" }, "← Prev"), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-500" }, `${idx + 1} of ${withE.length} \xB7 ${pu.name}`), /* @__PURE__ */ React.createElement("button", { onClick: () => setPreviewIdx((i) => Math.min(withE.length - 1, i + 1)), disabled: idx === withE.length - 1, className: "text-xs px-2 py-1 rounded-md border border-slate-200 disabled:opacity-40" }, "Next →")), /* @__PURE__ */ React.createElement("div", { className: "text-xs text-slate-500 mb-1" }, "To: ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, pu.email)), /* @__PURE__ */ React.createElement("div", { className: "text-xs text-slate-500 mb-2" }, "Subject: ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, subjectOf(pu))), /* @__PURE__ */ React.createElement("pre", { className: "whitespace-pre-wrap text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-[50vh] overflow-y-auto" }, buildBody(pu)), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 mt-4" }, /* @__PURE__ */ React.createElement("button", { onClick: async () => {
      setEmailPreviewOpen(false);
      await dispatchEmail(units);
    }, disabled: sending, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex-1 flex items-center justify-center gap-2 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Mail, { size: 15 }), " ", sending ? "Sending…" : `Send to ${withE.length} client(s)`), /* @__PURE__ */ React.createElement("button", { onClick: () => setEmailPreviewOpen(false), className: "text-slate-500 text-sm px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50" }, "Cancel"))));
  })(), basketOpen && /* @__PURE__ */ React.createElement(BasketManager, { db, commit, showToast, onClose: () => setBasketOpen(false) }));
}
// ====================== BILLING =========================================
// Step one of the billing module: the fee plans the firm bills on. Everything
// later in billing (fee calculation, proforma, invoice, collection) hangs off a
// plan, so the list lives in the Google Sheet's "FeePlans" tab rather than on
// one machine. Plans are added and removed here; nothing else creates them.

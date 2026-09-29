const cgSettingsOf = (db) => {
  const b = db.billingSettings || {};
  const out = { ...CG_DEFAULTS };
  for (const k of Object.keys(CG_DEFAULTS)) if (b[k] != null && b[k] !== "") out[k] = num(b[k]);
  return out;
};
// Sets losses off against gains and works out the tax. Order matters: a long-term
// loss may only go against long-term gain, while a short-term loss may go against
// either - and it is taken against short-term gain first, that being the dearer of
// the two to leave standing.
function cgSetOff(g, rates) {
  const r = { ...CG_DEFAULTS, ...rates || {} };
  let stGain = Math.max(0, num(g.stGain)), ltGain = Math.max(0, num(g.ltGain));
  let stLoss = Math.max(0, num(g.stLoss)) + Math.max(0, num(g.bfStcl));
  let ltLoss = Math.max(0, num(g.ltLoss)) + Math.max(0, num(g.bfLtcl));
  const usedLtOnLt = Math.min(ltLoss, ltGain);
  ltGain -= usedLtOnLt; ltLoss -= usedLtOnLt;
  const usedStOnSt = Math.min(stLoss, stGain);
  stGain -= usedStOnSt; stLoss -= usedStOnSt;
  const usedStOnLt = Math.min(stLoss, ltGain);
  ltGain -= usedStOnLt; stLoss -= usedStOnLt;
  const exempt = Math.min(ltGain, Math.max(0, r.cgLtcgExempt));
  const taxableLt = round2(ltGain - exempt);
  const taxableSt = round2(stGain);
  const stTax = round2(taxableSt * r.cgStcgRate / 100);
  const ltTax = round2(taxableLt * r.cgLtcgRate / 100);
  const base = round2(stTax + ltTax);
  const surcharge = round2(base * Math.max(0, r.cgSurcharge) / 100);
  const cess = round2((base + surcharge) * Math.max(0, r.cgCess) / 100);
  return {
    taxableSt, taxableLt, exemptUsed: round2(exempt), stTax, ltTax, base, surcharge, cess,
    total: round2(base + surcharge + cess),
    carrySt: round2(stLoss), carryLt: round2(ltLoss),
    usedLtOnLt: round2(usedLtOnLt), usedStOnSt: round2(usedStOnSt), usedStOnLt: round2(usedStOnLt)
  };
}
// What selling a losing position now would save in tax this year: the difference
// between the bill as it stands and the bill with that loss booked.
function cgHarvestSaving(g, rates, stclAdd, ltclAdd) {
  const before = cgSetOff(g, rates).total;
  const after = cgSetOff({ ...g, stLoss: num(g.stLoss) + num(stclAdd), ltLoss: num(g.ltLoss) + num(ltclAdd) }, rates).total;
  return round2(before - after);
}
async function pullCapGains(url, fy, code) {
  const q = "capgains=1&fy=" + encodeURIComponent(fy) + (code ? "&code=" + encodeURIComponent(code) : "");
  const res = await fetch(withToken(url) + "&" + q);
  const data = await res.json();
  if (!data || data.ok !== true) throw new Error((data && data.error) || "The sheet could not work out the gains.");
  return data;
}
// The financial years worth offering: this one and the seven before it.
function cgYears(today) {
  const q = fyQuarter(today || new Date());
  const out = [];
  for (let i = 0; i < 8; i++) {
    const y = q.fyStart - i;
    out.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return out;
}
const cgFyRange = (fy) => {
  const y = parseInt(String(fy).slice(0, 4), 10);
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
};
// ---- Missing purchases ------------------------------------------------------
// A sale with nothing to match against is never given a zero cost, so every gap
// has to be explained or filled. This puts a name to the likely cause from what
// the book itself shows, rather than guessing.
async function pullGapScan(url, fy) {
  const res = await fetch(withToken(url) + "&gap_scan=1&fy=" + encodeURIComponent(fy));
  const data = await res.json();
  if (!data || data.ok !== true) throw new Error((data && data.error) || "The sheet could not scan the book.");
  return data;
}
async function pushManualTrades(db, trades) {
  const url = (db.sheetUrl || "").trim();
  if (!url || !(trades || []).length) return { ok: false, msg: "Nothing to send." };
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "manual_trade", trades }) });
    const txt = await res.text();
    return { ok: /^ok:/.test(txt), msg: txt.slice(0, 200) };
  } catch (e) {
    return { ok: false, msg: "Could not reach the office Google Sheet." };
  }
}
// A whole-number ratio, within a hair, is how a bonus or a split shows up in a
// book that recorded the sale but never the extra shares.
const nearWhole = (n) => n >= 1.9 && Math.abs(n - Math.round(n)) < 0.02 ? Math.round(n) : 0;
function diagnoseGap(g, bookFrom) {
  if ((g.near || []).length) {
    const n = g.near[0];
    return { cause: "ticker", fix: "alias",
      text: `The same client traded ${n.sym}, which reduces to the same ticker. The purchase is almost certainly there under that spelling.` };
  }
  if ((g.otherCodes || []).length) {
    const o = g.otherCodes[0];
    return { cause: "twocodes", fix: "merge",
      text: `${o.bought} bought under code ${o.code}, which carries the same client name. The two accounts are probably one client.` };
  }
  const ratio = num(g.bought) > 0 ? num(g.sold) / num(g.bought) : 0;
  const whole = nearWhole(ratio);
  if (whole) {
    return { cause: "corpact", fix: "opening",
      text: `Exactly ${whole} times as many sold as bought, which is what a ${whole === 2 ? "1:1 bonus" : whole + ":1 split or bonus"} looks like when the extra shares never reached the book.` };
  }
  if (num(g.holdingQty) > 0) {
    return { cause: "holdings", fix: "opening",
      text: `Holdings still shows ${g.holdingQty} of this${num(g.holdingBuy) > 0 ? ` at ${rupee(g.holdingBuy)} average cost` : ""}, so the position is real and only the purchase is missing from the trade book.` };
  }
  if (num(g.bought) === 0 && bookFrom && g.firstSale && bookFrom >= "1900-01-01") {
    return { cause: "before", fix: "opening",
      text: `Nothing of this was ever bought in the book, which starts on ${fmtDay(bookFrom)}. It was almost certainly held before the feed begins.` };
  }
  return { cause: "partial", fix: "opening",
    text: `${g.sold} sold against ${g.bought} bought. The difference came from somewhere the book does not cover.` };
}
const GAP_CAUSE_LABEL = {
  ticker: "Ticker spelled differently", twocodes: "Two codes, one client",
  corpact: "Bonus or split", holdings: "In Holdings, not in trades",
  before: "Bought before the book starts", partial: "More sold than bought"
};
// ---- Weekly pipeline MIS ----------------------------------------------------
// Built on the sheet, not here, so the Saturday mail goes out whether or not
// anyone has the console open. This is the preview, the send button and the
// switch for the schedule.
function CapitalGainsTab({ db, user, showToast }) {
  const rates = cgSettingsOf(db);
  const years = useMemo(() => cgYears(new Date()), []);
  const [fy, setFy] = useState(years[0]);
  const [code, setCode] = useState("");
  const [data, setData] = useState(null);
  const [state, setState] = useState("idle");
  const [err, setErr] = useState("");
  const [bfStcl, setBfStcl] = useState("");
  const [bfLtcl, setBfLtcl] = useState("");
  const [surcharge, setSurcharge] = useState(String(rates.cgSurcharge || 0));
  const [view, setView] = useState("harvest");
  const [picked, setPicked] = useState(() => /* @__PURE__ */ new Set());

  const clientList = useMemo(() => Object.values(db.clients || {})
    .map((c) => ({ code: c.code, name: c.name || c.code }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name))), [db.clients]);
  const url = (db.sheetUrl || "").trim();
  const load = async () => {
    if (!url) { setErr("Connect the office Google Sheet in Settings first — the gains are worked out from the trade book on the sheet."); setState("error"); return; }
    setState("loading"); setErr("");
    try {
      const d = await pullCapGains(url, fy, code);
      setData(d); setState("ready"); setPicked(/* @__PURE__ */ new Set());
    } catch (e) {
      setErr(String(e && e.message || e)); setState("error");
    }
  };
  useEffect(() => { load(); }, [fy, code, url]);

  const priceOf = (sym) => num((db.prices || {})[String(sym || "").toUpperCase()]);
  // Open lots priced at the live feed. A scrip the feed does not carry is kept
  // separate rather than valued at nil, which would read as a total loss.
  const open = useMemo(() => {
    const rows = ((data || {}).open || []).filter((o) => !code || o.code === code);
    return rows.map((o) => {
      const px = priceOf(o.sym);
      const value = px > 0 ? round2(num(o.qty) * px) : null;
      return { ...o, px, value, gain: value == null ? null : round2(value - num(o.cost)) };
    }).sort((a, b) => (a.gain == null ? 1 : b.gain == null ? -1 : a.gain - b.gain));
  }, [data, db.prices, code]);
  const unpriced = open.filter((o) => o.value == null);
  const unrealGain = round2(open.reduce((a, o) => a + (o.gain > 0 ? o.gain : 0), 0));
  const unrealLoss = round2(open.reduce((a, o) => a + (o.gain < 0 ? -o.gain : 0), 0));
  const preGf = open.filter((o) => num(o.preGf) > 0);

  const tot = useMemo(() => {
    const list = ((data || {}).clients || []).filter((c) => !code || c.code === code);
    return list.reduce((a, c) => ({
      stGain: a.stGain + num(c.stGain), stLoss: a.stLoss + num(c.stLoss),
      ltGain: a.ltGain + num(c.ltGain), ltLoss: a.ltLoss + num(c.ltLoss), sells: a.sells + num(c.sells)
    }), { stGain: 0, stLoss: 0, ltGain: 0, ltLoss: 0, sells: 0 });
  }, [data, code]);
  const useRates = { ...rates, cgSurcharge: num(surcharge) };
  const gains = { ...tot, bfStcl: num(bfStcl), bfLtcl: num(bfLtcl) };
  const tax = cgSetOff(gains, useRates);

  // Losing positions, dearest saving first. Selling a short-term loser usually
  // saves more, because short-term gain is taxed higher.
  const harvest = useMemo(() => open.filter((o) => o.gain != null && o.gain < 0).map((o) => ({
    ...o,
    saving: cgHarvestSaving(gains, useRates, o.term === "SHORT" ? -o.gain : 0, o.term === "LONG" ? -o.gain : 0)
  })).sort((a, b) => b.saving - a.saving || a.gain - b.gain), [open, tot, bfStcl, bfLtcl, surcharge]);
  const pickedRows = harvest.filter((o) => picked.has(o.code + "|" + o.sym + "|" + o.term));
  const pickedSt = round2(pickedRows.filter((o) => o.term === "SHORT").reduce((a, o) => a - o.gain, 0));
  const pickedLt = round2(pickedRows.filter((o) => o.term === "LONG").reduce((a, o) => a - o.gain, 0));
  const pickedSaving = pickedRows.length ? cgHarvestSaving(gains, useRates, pickedSt, pickedLt) : 0;
  const afterTax = cgSetOff({ ...gains, stLoss: gains.stLoss + pickedSt, ltLoss: gains.ltLoss + pickedLt }, useRates);
  const toggle = (k) => setPicked((s2) => { const n = new Set(s2); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const range = cgFyRange(fy);
  const running = fy === years[0];
  const exportAll = () => {
    const rows = [];
    for (const r of ((data || {}).realised || [])) rows.push({ Sheet: "Realised", Symbol: r.sym, "Bought": r.buyDate, "Sold": r.sellDate, Qty: r.qty, Cost: r.cost, Proceeds: r.proceeds, Gain: r.gain, Term: r.term });
    for (const o of open) rows.push({ Sheet: "Open", Client: o.name, Symbol: o.sym, Term: o.term, Qty: o.qty, Cost: o.cost, "Price": o.px || "", Value: o.value == null ? "" : o.value, "Unrealised": o.gain == null ? "" : o.gain, "Oldest lot": o.oldest });
    if (!rows.length) { showToast("Nothing to export yet.", "err"); return; }
    downloadExcelRows(rows, `capital-gains-${fy}${code ? "-" + code : ""}`);
  };
  const card = (label, value, tone) => /* @__PURE__ */ React.createElement("div", { key: label, className: "bg-white border border-slate-200 rounded-xl px-3 py-2" },
    /* @__PURE__ */ React.createElement("div", { className: "text-[10px] uppercase text-slate-400" }, label),
    /* @__PURE__ */ React.createElement("div", { className: `text-sm font-semibold tabular-nums ${tone || "text-slate-800"}` }, value));
  const th = "text-left font-medium px-3 py-2";
  const thr = "text-right font-medium px-3 py-2";

  return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3 flex-wrap" },
      /* @__PURE__ */ React.createElement("div", null,
        /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-semibold text-slate-800" }, "Capital gains"),
        /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 max-w-3xl" },
          "Worked out from the trade book, matched first in first out. ",
          running ? `This year so far — 1 April ${range.from.slice(0, 4)} to ${data ? fmtDay(data.to) : "today"}.` : `Year ended 31 March ${range.to.slice(0, 4)}.`,
          " Open positions are priced as they stand today.")),
      /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 flex-wrap items-center" },
        /* @__PURE__ */ React.createElement("select", { value: fy, onChange: (e) => setFy(e.target.value), className: "px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" },
          years.map((y) => /* @__PURE__ */ React.createElement("option", { key: y, value: y }, y, y === years[0] ? " (running)" : ""))),
        /* @__PURE__ */ React.createElement("select", { value: code, onChange: (e) => setCode(e.target.value), className: "px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white max-w-[240px]" },
          /* @__PURE__ */ React.createElement("option", { value: "" }, "All clients"),
          clientList.map((c) => /* @__PURE__ */ React.createElement("option", { key: c.code, value: c.code }, c.name, " (", c.code, ")"))),
        /* @__PURE__ */ React.createElement("button", { onClick: load, disabled: state === "loading", className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" },
          /* @__PURE__ */ React.createElement(RefreshCw, { size: 15 }), " ", state === "loading" ? "Working…" : "Refresh"),
        /* @__PURE__ */ React.createElement("button", { onClick: exportAll, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" },
          /* @__PURE__ */ React.createElement(Download, { size: 15 }), " Excel"))),

    state === "error" && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" }, err),
    state === "loading" && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" }, "Matching the trade book… a large book takes a few seconds."),

    state === "ready" && /* @__PURE__ */ React.createElement(React.Fragment, null,
      view !== "gaps" && /* @__PURE__ */ React.createElement("div", { className: "grid sm:grid-cols-3 lg:grid-cols-6 gap-2" },
        card("Realised short term", rupee(tot.stGain - tot.stLoss), tot.stGain - tot.stLoss < 0 ? "text-rose-600" : "text-slate-800"),
        card("Realised long term", rupee(tot.ltGain - tot.ltLoss), tot.ltGain - tot.ltLoss < 0 ? "text-rose-600" : "text-slate-800"),
        card("Unrealised gain", rupee(unrealGain), "text-emerald-700"),
        card("Unrealised loss", rupee(unrealLoss), "text-rose-600"),
        card("Taxable", rupee(tax.taxableSt + tax.taxableLt)),
        card("Tax estimate", rupee(tax.total), "text-indigo-700")),

      view !== "gaps" && /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-4" },
        /* @__PURE__ */ React.createElement("div", { className: "text-sm font-medium text-slate-700 mb-2" }, "How the tax works out"),
        /* @__PURE__ */ React.createElement("div", { className: "text-[12px] max-w-2xl" },
          [["Short-term gain", rupee(tot.stGain)], ["Short-term loss", "(" + rupee(tot.stLoss) + ")"],
           ["Long-term gain", rupee(tot.ltGain)], ["Long-term loss", "(" + rupee(tot.ltLoss) + ")"],
           ["Long-term loss set against long-term gain", "(" + rupee(tax.usedLtOnLt) + ")"],
           ["Short-term loss set against short-term gain", "(" + rupee(tax.usedStOnSt) + ")"],
           ["Short-term loss set against long-term gain", "(" + rupee(tax.usedStOnLt) + ")"],
           [`Exemption used (s.112A, ${rupee(useRates.cgLtcgExempt)} a year)`, "(" + rupee(tax.exemptUsed) + ")"],
           [`Taxable short term @ ${useRates.cgStcgRate}%`, rupee(tax.taxableSt) + "  →  " + rupee(tax.stTax)],
           [`Taxable long term @ ${useRates.cgLtcgRate}%`, rupee(tax.taxableLt) + "  →  " + rupee(tax.ltTax)],
           ...(tax.surcharge > 0 ? [[`Surcharge @ ${useRates.cgSurcharge}%`, rupee(tax.surcharge)]] : []),
           [`Cess @ ${useRates.cgCess}%`, rupee(tax.cess)],
           ["Loss carried to later years", rupee(tax.carrySt + tax.carryLt)]
          ].map(([k, v]) => /* @__PURE__ */ React.createElement("div", { key: k, className: "flex justify-between gap-6 border-b border-slate-100 py-1" },
            /* @__PURE__ */ React.createElement("span", { className: "text-slate-500" }, k),
            /* @__PURE__ */ React.createElement("span", { className: "text-slate-800 tabular-nums" }, v)))),
        /* @__PURE__ */ React.createElement("div", { className: "flex justify-between gap-6 mt-2 pt-2 border-t-2 border-slate-300 text-sm max-w-2xl" },
          /* @__PURE__ */ React.createElement("span", { className: "font-medium text-slate-700" }, "Estimated capital gains tax"),
          /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-indigo-700 tabular-nums" }, rupee(tax.total))),
        /* @__PURE__ */ React.createElement("div", { className: "grid sm:grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100" },
          [["Brought-forward short-term loss", bfStcl, setBfStcl], ["Brought-forward long-term loss", bfLtcl, setBfLtcl], ["Surcharge %", surcharge, setSurcharge]]
            .map(([label, val, setter]) => /* @__PURE__ */ React.createElement("div", { key: label },
              /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-500 block mb-1" }, label),
              /* @__PURE__ */ React.createElement("input", { type: "number", value: val, onChange: (e) => setter(e.target.value), placeholder: "0", className: "w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" })))),
        /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mt-2" }, "Brought-forward losses and surcharge are typed in here for the working and are not saved. Surcharge on gains under s.111A and s.112A is capped at 15%.")),

      /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 flex-wrap border-b border-slate-200" },
        [["harvest", `Losses worth booking (${harvest.length})`], ["open", `Open positions (${open.length})`],
         ["realised", code ? `Every sale (${((data || {}).realised || []).length})` : `By client (${((data || {}).clients || []).length})`],
         ["gaps", `Missing purchases${((data || {}).unmatched || []).length ? " (" + ((data || {}).unmatched || []).length + ")" : ""}`]]
          .map(([id, label]) => /* @__PURE__ */ React.createElement("button", { key: id, onClick: () => setView(id),
            className: `px-3 py-2 text-sm -mb-px border-b-2 ${view === id ? "border-indigo-600 text-indigo-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}` }, label))),

      view === "harvest" && /* @__PURE__ */ React.createElement("div", { className: "space-y-3" },
        /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500" },
          "Positions standing at a loss today. Selling before 31 March books the loss into this year and sets it against the gains above. Tick the ones you are considering to see what the year's tax would become."),
        pickedRows.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-wrap items-center text-[13px]", style: { columnGap: "2rem", rowGap: "0.25rem" } },
          /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("b", null, pickedRows.length), " selected · loss booked ", /* @__PURE__ */ React.createElement("b", null, rupee(pickedSt + pickedLt))),
          /* @__PURE__ */ React.createElement("span", null, "Tax now ", rupee(tax.total), " → ", /* @__PURE__ */ React.createElement("b", { className: "text-emerald-800" }, rupee(afterTax.total))),
          /* @__PURE__ */ React.createElement("span", null, "Saving ", /* @__PURE__ */ React.createElement("b", { className: "text-emerald-800" }, rupee(pickedSaving))),
          /* @__PURE__ */ React.createElement("button", { onClick: () => setPicked(/* @__PURE__ */ new Set()), className: "ml-auto text-[12px] text-slate-500 hover:underline" }, "Clear")),
        /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" },
          /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" },
            /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase" },
              /* @__PURE__ */ React.createElement("tr", null,
                /* @__PURE__ */ React.createElement("th", { className: "w-8 px-3 py-2" }),
                !code && /* @__PURE__ */ React.createElement("th", { className: th }, "Client"),
                /* @__PURE__ */ React.createElement("th", { className: th }, "Stock"),
                /* @__PURE__ */ React.createElement("th", { className: th }, "Term"),
                /* @__PURE__ */ React.createElement("th", { className: thr }, "Qty"),
                /* @__PURE__ */ React.createElement("th", { className: thr }, "Cost"),
                /* @__PURE__ */ React.createElement("th", { className: thr }, "Value"),
                /* @__PURE__ */ React.createElement("th", { className: thr }, "Loss"),
                /* @__PURE__ */ React.createElement("th", { className: thr }, "Tax saved"))),
            /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" },
              harvest.map((o) => {
                const k = o.code + "|" + o.sym + "|" + o.term;
                return /* @__PURE__ */ React.createElement("tr", { key: k, className: picked.has(k) ? "bg-emerald-50/50" : "" },
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: picked.has(k), onChange: () => toggle(k) })),
                  !code && /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-600" }, o.name),
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-slate-800" }, o.sym),
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                    /* @__PURE__ */ React.createElement("span", { className: `text-[10px] px-1.5 py-0.5 rounded ${o.term === "SHORT" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}` }, o.term === "SHORT" ? "Short" : "Long"),
                    /* @__PURE__ */ React.createElement("div", { className: "text-[10px] text-slate-400" }, "since ", fmtDay(o.oldest))),
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, o.qty),
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, rupee(o.cost)),
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, rupee(o.value)),
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-rose-600" }, rupee(o.gain)),
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums font-medium text-emerald-700" }, o.saving > 0 ? rupee(o.saving) : "—"));
              }),
              !harvest.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: code ? 8 : 9, className: "px-3 py-10 text-center text-slate-400 text-sm" }, "No position is standing at a loss today."))))),
        harvest.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2" },
          /* @__PURE__ */ React.createElement(AlertTriangle, { size: 14, className: "shrink-0 mt-0.5" }),
          /* @__PURE__ */ React.createElement("span", null, "Booking a loss is a tax decision, not an investment one. Only sell where it also suits the client's risk profile and the position no longer earns its place — and remember that buying the stock back starts a fresh holding period, so a long-term holding becomes short term again.")),
        tax.total <= 0 && harvest.length > 0 && /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400" }, "There is no tax to save this year, so a loss booked now would only be carried forward — for eight years, and a long-term loss only against long-term gain.")),

      view === "open" && /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" },
        /* @__PURE__ */ React.createElement("div", { style: { maxHeight: "60vh", overflowY: "auto" } },
          /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" },
            /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0" },
              /* @__PURE__ */ React.createElement("tr", null,
                !code && /* @__PURE__ */ React.createElement("th", { className: th }, "Client"),
                /* @__PURE__ */ React.createElement("th", { className: th }, "Stock"),
                /* @__PURE__ */ React.createElement("th", { className: th }, "Term"),
                /* @__PURE__ */ React.createElement("th", { className: thr }, "Qty"),
                /* @__PURE__ */ React.createElement("th", { className: thr }, "Cost"),
                /* @__PURE__ */ React.createElement("th", { className: thr }, "Value"),
                /* @__PURE__ */ React.createElement("th", { className: thr }, "Unrealised"))),
            /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" },
              open.map((o) => /* @__PURE__ */ React.createElement("tr", { key: o.code + o.sym + o.term },
                !code && /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-600" }, o.name),
                /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-slate-800" }, o.sym,
                  num(o.preGf) > 0 && /* @__PURE__ */ React.createElement("span", { title: "Bought before 1 Feb 2018 - grandfathering under s.112A applies", className: "ml-1.5 text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700" }, "pre-2018")),
                /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, o.term === "SHORT" ? "Short" : "Long",
                  /* @__PURE__ */ React.createElement("div", { className: "text-[10px] text-slate-400" }, "since ", fmtDay(o.oldest))),
                /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, o.qty),
                /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, rupee(o.cost)),
                /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, o.value == null ? /* @__PURE__ */ React.createElement("span", { className: "text-slate-300" }, "no price") : rupee(o.value)),
                /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-right tabular-nums ${o.gain == null ? "text-slate-300" : o.gain < 0 ? "text-rose-600" : "text-emerald-700"}` }, o.gain == null ? "—" : rupee(o.gain)))),
              !open.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: code ? 6 : 7, className: "px-3 py-10 text-center text-slate-400 text-sm" }, "Nothing open on the trade book.")))))),

      view === "realised" && /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" },
        /* @__PURE__ */ React.createElement("div", { style: { maxHeight: "60vh", overflowY: "auto" } },
          code
            ? /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" },
                /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0" },
                  /* @__PURE__ */ React.createElement("tr", null,
                    /* @__PURE__ */ React.createElement("th", { className: th }, "Stock"),
                    /* @__PURE__ */ React.createElement("th", { className: th }, "Bought"),
                    /* @__PURE__ */ React.createElement("th", { className: th }, "Sold"),
                    /* @__PURE__ */ React.createElement("th", { className: thr }, "Qty"),
                    /* @__PURE__ */ React.createElement("th", { className: thr }, "Cost"),
                    /* @__PURE__ */ React.createElement("th", { className: thr }, "Proceeds"),
                    /* @__PURE__ */ React.createElement("th", { className: thr }, "Gain"),
                    /* @__PURE__ */ React.createElement("th", { className: th }, "Term"))),
                /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" },
                  ((data || {}).realised || []).map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: i },
                    /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-slate-800" }, r.sym),
                    /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, fmtDay(r.buyDate)),
                    /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, fmtDay(r.sellDate)),
                    /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, r.qty),
                    /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, rupee(r.cost)),
                    /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, rupee(r.proceeds)),
                    /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-right tabular-nums ${num(r.gain) < 0 ? "text-rose-600" : "text-emerald-700"}` }, rupee(r.gain)),
                    /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, r.term === "SHORT" ? "Short" : "Long"))),
                  !((data || {}).realised || []).length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 8, className: "px-3 py-10 text-center text-slate-400 text-sm" }, "No sale in this year."))))
            : /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" },
                /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0" },
                  /* @__PURE__ */ React.createElement("tr", null,
                    /* @__PURE__ */ React.createElement("th", { className: th }, "Client"),
                    /* @__PURE__ */ React.createElement("th", { className: thr }, "Short-term net"),
                    /* @__PURE__ */ React.createElement("th", { className: thr }, "Long-term net"),
                    /* @__PURE__ */ React.createElement("th", { className: thr }, "Tax estimate"),
                    /* @__PURE__ */ React.createElement("th", { className: thr }, ""))),
                /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" },
                  ((data || {}).clients || []).slice().sort((x, y) => cgSetOff(y, useRates).total - cgSetOff(x, useRates).total)
                    .map((c) => /* @__PURE__ */ React.createElement("tr", { key: c.code },
                      /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                        /* @__PURE__ */ React.createElement("div", { className: "text-slate-800" }, c.name),
                        /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, c.code, " · ", c.sells, " matched sale(s)")),
                      /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-right tabular-nums ${c.stGain - c.stLoss < 0 ? "text-rose-600" : "text-slate-700"}` }, rupee(c.stGain - c.stLoss)),
                      /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-right tabular-nums ${c.ltGain - c.ltLoss < 0 ? "text-rose-600" : "text-slate-700"}` }, rupee(c.ltGain - c.ltLoss)),
                      /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums font-medium text-indigo-700" }, rupee(cgSetOff(c, useRates).total)),
                      /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right" },
                        /* @__PURE__ */ React.createElement("button", { onClick: () => setCode(c.code), className: "text-[12px] text-indigo-600 hover:underline" }, "Open")))),
                  !((data || {}).clients || []).length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, className: "px-3 py-10 text-center text-slate-400 text-sm" }, "No sale by anyone in this year.")))))),

      view === "gaps" && /* @__PURE__ */ React.createElement(MissingPurchases, { db, user, fy, showToast, onDone: load }),

      view !== "gaps" && ((data || {}).unmatched || []).length > 0 && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" },
        /* @__PURE__ */ React.createElement("b", null, ((data || {}).unmatched || []).length, " sale(s) had no purchase on record"),
        " — an opening position carried in from before the trade book starts, or a gap in the feed. No gain has been worked out for those, so the figures above are understated. ",
        ((data || {}).unmatched || []).slice(0, 4).map((u) => `${u.name} ${u.sym} ${u.qty} on ${fmtDay(u.date)}`).join("; "),
        ((data || {}).unmatched || []).length > 4 ? " … " : " ",
        /* @__PURE__ */ React.createElement("button", { onClick: () => setView("gaps"), className: "underline font-medium" }, "Find out why")),
      preGf.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" },
        /* @__PURE__ */ React.createElement("b", null, preGf.length, " holding(s) bought before 1 February 2018"),
        " — grandfathering under s.112A lets the cost be stepped up to the 31 January 2018 market value, which is not in the trade book. The long-term gain on those will usually be lower than shown."),
      unpriced.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" },
        unpriced.length, " holding(s) have no live price, so they are left out of the unrealised figures: ", unpriced.slice(0, 8).map((o) => o.sym).join(", "), unpriced.length > 8 ? "…" : ""),
      /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400" },
        "An estimate for planning, not a tax computation. It covers listed equity with STT paid, matched first in first out from the trade book, and does not adjust for bonus issues, splits or demergers, nor for anything held outside these accounts. Cost and proceeds are taken as the trade amounts, so brokerage is included and STT is not separated out. Have it checked against the broker's own statement before it goes into a return.")
    )
  );
}
// Finds, explains and fills the purchases the trade book is missing. Until a gap
// is filled the capital gains above it are understated, so this is the thing to
// clear before a report goes anywhere.
function MissingPurchases({ db, user, fy, showToast, onDone }) {
  const isAdmin = user?.role === "admin";
  const [state, setState] = useState("loading");
  const [err, setErr] = useState("");
  const [scan, setScan] = useState(null);
  const [cause, setCause] = useState("");
  const [q, setQ] = useState("");
  const [cost, setCost] = useState({});           // key -> cost per share typed in
  const [picked, setPicked] = useState(() => /* @__PURE__ */ new Set());
  const [busy, setBusy] = useState(false);
  const url = (db.sheetUrl || "").trim();
  const keyOf = (g) => g.code + "|" + g.sym;

  const load = async () => {
    if (!url) { setErr("Connect the office Google Sheet in Settings first."); setState("error"); return; }
    setState("loading"); setErr("");
    try { setScan(await pullGapScan(url, fy)); setState("ready"); }
    catch (e) { setErr(String(e && e.message || e)); setState("error"); }
  };
  useEffect(() => { load(); }, [fy, url]);

  const rows = useMemo(() => {
    const all = ((scan || {}).gaps || []).map((g) => ({ ...g, dx: diagnoseGap(g, (scan || {}).bookFrom) }));
    const needle = q.trim().toLowerCase();
    return all.filter((g) => (!cause || g.dx.cause === cause) &&
      (!needle || String(g.name).toLowerCase().includes(needle) || String(g.sym).toLowerCase().includes(needle) || String(g.code).toLowerCase().includes(needle)));
  }, [scan, cause, q]);
  const byCause = useMemo(() => {
    const m = {};
    for (const g of ((scan || {}).gaps || [])) {
      const c = diagnoseGap(g, (scan || {}).bookFrom).cause;
      m[c] = (m[c] || 0) + 1;
    }
    return m;
  }, [scan]);
  // An opening purchase is dated the day before the book starts, so it can never
  // land inside a period and be mistaken for a trade of the year.
  const openingDate = useMemo(() => {
    const d = dayOf((scan || {}).bookFrom);
    return d ? ymd(new Date(d.getTime() - DAY_MS)) : ymd(new Date());
  }, [scan]);
  const costOf = (g) => {
    const typed = cost[keyOf(g)];
    if (typed != null && String(typed).trim() !== "") return num(typed);
    return num(g.holdingBuy);
  };
  const ready = rows.filter((g) => g.dx.fix === "opening" && costOf(g) > 0);
  const fillFromHoldings = () => {
    const next = { ...cost };
    let n = 0;
    for (const g of rows) if (num(g.holdingBuy) > 0 && !String(next[keyOf(g)] || "").trim()) { next[keyOf(g)] = g.holdingBuy; n++; }
    setCost(next);
    showToast(n ? `${n} cost(s) taken from the Holdings average price.` : "No Holdings price to take for these.", n ? "ok" : "err");
  };
  const createOpenings = async (list) => {
    const good = list.filter((g) => costOf(g) > 0);
    if (!good.length) { showToast("Put a cost against them first — an opening purchase with no cost would read as pure gain.", "err"); return; }
    setBusy(true);
    const trades = good.map((g) => ({
      id: `open_${g.code}_${g.sym}_${openingDate}`.replace(/[^A-Za-z0-9_\-]/g, ""),
      date: openingDate, code: g.code, name: g.name, symbol: g.sym, action: "BUY",
      quantity: g.shortQty, price: costOf(g), amount: round2(g.shortQty * costOf(g)),
      note: `Opening position - no purchase in the trade book (${g.dx.cause})`, by: user?.name || "staff"
    }));
    const r = await pushManualTrades(db, trades);
    setBusy(false);
    showToast(r.ok ? `${trades.length} opening purchase(s) recorded. Refresh the report.` : r.msg, r.ok ? "ok" : "err");
    if (r.ok) { setPicked(/* @__PURE__ */ new Set()); load(); if (onDone) onDone(); }
  };
  const exportGaps = () => {
    if (!rows.length) { showToast("Nothing to export.", "err"); return; }
    downloadExcelRows(rows.map((g) => ({
      "Client code": g.code, Client: g.name, Symbol: g.sym, "Missing qty": g.shortQty,
      "Sales affected": g.sales, "First sale": g.firstSale, "Last sale": g.lastSale,
      "Bought in book": g.bought, "Sold in book": g.sold,
      "Holdings qty": g.holdingQty == null ? "" : g.holdingQty,
      "Holdings avg price": g.holdingBuy || "",
      "Likely cause": GAP_CAUSE_LABEL[g.dx.cause], Explanation: g.dx.text,
      "Cost per share": costOf(g) || "", "Opening date": openingDate
    })), `missing-purchases-${fy}`);
  };
  // The same sheet back again, with the cost column filled in.
  const importCosts = (file) => {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const wb = XLSX.read(new Uint8Array(rd.result), { type: "array" });
        const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
        const next = { ...cost };
        let n = 0;
        for (const r of sheet) {
          const k = String(r["Client code"] || "").trim() + "|" + String(r["Symbol"] || "").trim().toUpperCase();
          const c = num(r["Cost per share"]);
          if (k.length > 1 && c > 0) { next[k] = c; n++; }
        }
        setCost(next);
        showToast(n ? `${n} cost(s) read from the file.` : "No 'Cost per share' values found in that file.", n ? "ok" : "err");
      } catch (e) {
        showToast("That file could not be read.", "err");
      }
    };
    rd.readAsArrayBuffer(file);
  };
  const toggle = (k) => setPicked((s2) => { const n = new Set(s2); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const pickedRows = rows.filter((g) => picked.has(keyOf(g)));
  const th = "text-left font-medium px-3 py-2", thr = "text-right font-medium px-3 py-2";

  return /* @__PURE__ */ React.createElement("div", { className: "space-y-3" },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3 flex-wrap" },
      /* @__PURE__ */ React.createElement("div", null,
        /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold text-slate-800" }, "Missing purchases"),
        /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 max-w-3xl" }, "Every sale the book could not match, grouped by client and scrip, with what the book itself suggests went wrong. Until these are settled the gains are understated.")),
      /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 flex-wrap" },
        /* @__PURE__ */ React.createElement("button", { onClick: load, disabled: state === "loading", className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" },
          /* @__PURE__ */ React.createElement(RefreshCw, { size: 15 }), " ", state === "loading" ? "Scanning…" : "Re-scan"),
        /* @__PURE__ */ React.createElement("button", { onClick: exportGaps, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" },
          /* @__PURE__ */ React.createElement(Download, { size: 15 }), " Excel"),
        isAdmin && /* @__PURE__ */ React.createElement("label", { className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer" },
          /* @__PURE__ */ React.createElement(Upload, { size: 15 }), " Costs from file",
          /* @__PURE__ */ React.createElement("input", { type: "file", accept: ".xlsx,.xls,.csv", className: "hidden", onChange: (e) => { importCosts(e.target.files && e.target.files[0]); e.target.value = ""; } })))),

    state === "error" && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" }, err),
    state === "loading" && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" }, "Reading the whole trade book…"),

    state === "ready" && /* @__PURE__ */ React.createElement(React.Fragment, null,
      /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center flex-wrap", style: { columnGap: "0.75rem", rowGap: "0.5rem" } },
        /* @__PURE__ */ React.createElement("div", { className: "relative" },
          /* @__PURE__ */ React.createElement(Search, { size: 14, className: "absolute left-3 top-2.5 text-slate-400" }),
          /* @__PURE__ */ React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Client or scrip", className: "pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500" })),
        /* @__PURE__ */ React.createElement("button", { onClick: () => setCause(""), className: `text-xs px-2.5 py-1.5 rounded-md border ${cause === "" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}` }, "All (", ((scan || {}).gaps || []).length, ")"),
        Object.keys(byCause).sort((a, b) => byCause[b] - byCause[a]).map((c) => /* @__PURE__ */ React.createElement("button", {
          key: c, onClick: () => setCause(c === cause ? "" : c),
          className: `text-xs px-2.5 py-1.5 rounded-md border ${cause === c ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`
        }, GAP_CAUSE_LABEL[c], " (", byCause[c], ")")),
        /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 ml-auto" }, "Book runs ", fmtDay((scan || {}).bookFrom), " to ", fmtDay((scan || {}).bookTo))),

      isAdmin && /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center flex-wrap", style: { columnGap: "0.75rem", rowGap: "0.5rem" } },
        /* @__PURE__ */ React.createElement("span", { className: "text-[12px] text-slate-500" }, picked.size, " of ", rows.length, " selected"),
        /* @__PURE__ */ React.createElement("button", { onClick: () => setPicked(new Set(rows.map(keyOf))), className: "text-xs text-indigo-600 hover:underline" }, "Select all shown"),
        /* @__PURE__ */ React.createElement("button", { onClick: () => setPicked(/* @__PURE__ */ new Set()), className: "text-xs text-slate-500 hover:underline" }, "Clear"),
        /* @__PURE__ */ React.createElement("button", { onClick: fillFromHoldings, className: "text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" }, "Fill costs from Holdings"),
        /* @__PURE__ */ React.createElement("button", { onClick: () => createOpenings(pickedRows.length ? pickedRows : []), disabled: busy || !pickedRows.length,
          className: "text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40" },
          busy ? "Recording…" : `Record ${pickedRows.length || ""} opening purchase(s)`),
        /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400" }, "dated ", fmtDay(openingDate), ", the day before the book begins")),

      /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" },
        /* @__PURE__ */ React.createElement("div", { style: { maxHeight: "58vh", overflowY: "auto" } },
          /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" },
            /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0" },
              /* @__PURE__ */ React.createElement("tr", null,
                isAdmin && /* @__PURE__ */ React.createElement("th", { className: "w-8 px-3 py-2" }),
                /* @__PURE__ */ React.createElement("th", { className: th }, "Client"),
                /* @__PURE__ */ React.createElement("th", { className: th }, "Scrip"),
                /* @__PURE__ */ React.createElement("th", { className: thr }, "Missing"),
                /* @__PURE__ */ React.createElement("th", { className: th }, "Likely cause"),
                isAdmin && /* @__PURE__ */ React.createElement("th", { className: thr }, "Cost/share"),
                isAdmin && /* @__PURE__ */ React.createElement("th", { className: thr }, "Opening cost"))),
            /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" },
              rows.slice(0, 400).map((g) => {
                const k = keyOf(g);
                const c = costOf(g);
                return /* @__PURE__ */ React.createElement("tr", { key: k, className: picked.has(k) ? "bg-indigo-50/40" : "" },
                  isAdmin && /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                    /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: picked.has(k), onChange: () => toggle(k) })),
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                    /* @__PURE__ */ React.createElement("div", { className: "text-slate-800" }, g.name),
                    /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, g.code)),
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                    /* @__PURE__ */ React.createElement("div", { className: "text-slate-800" }, g.sym),
                    /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, g.sales, " sale(s), ", fmtDay(g.firstSale), g.lastSale !== g.firstSale ? " – " + fmtDay(g.lastSale) : "")),
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-rose-600" }, g.shortQty,
                    /* @__PURE__ */ React.createElement("div", { className: "text-[10px] text-slate-400" }, "of ", g.sold, " sold")),
                  /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                    /* @__PURE__ */ React.createElement("span", { className: `text-[10px] px-1.5 py-0.5 rounded ${g.dx.fix === "opening" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"}` }, GAP_CAUSE_LABEL[g.dx.cause]),
                    /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-500 mt-0.5 max-w-lg" }, g.dx.text)),
                  isAdmin && /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right" },
                    /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.01", value: cost[k] == null ? "" : cost[k],
                      onChange: (e) => setCost((x) => ({ ...x, [k]: e.target.value })),
                      placeholder: num(g.holdingBuy) > 0 ? String(g.holdingBuy) : "cost",
                      className: "w-24 text-right px-2 py-1 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" })),
                  isAdmin && /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600" }, c > 0 ? rupee(round2(c * g.shortQty)) : /* @__PURE__ */ React.createElement("span", { className: "text-slate-300" }, "—")));
              }),
              !rows.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: isAdmin ? 7 : 4, className: "px-3 py-10 text-center text-slate-400 text-sm" },
                ((scan || {}).gaps || []).length ? "Nothing matches that filter." : "Every sale in this year matched a purchase. Nothing to fix.")))))),
      rows.length > 400 && /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400" }, "Showing the 400 largest. Export to Excel to work through the rest."),

      ((scan || {}).gaps || []).length > 0 && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1" },
        /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("b", null, "How to work through this.")),
        /* @__PURE__ */ React.createElement("div", null, "• ", /* @__PURE__ */ React.createElement("b", null, "Ticker spelled differently"), " and ", /* @__PURE__ */ React.createElement("b", null, "Two codes, one client"), " are not missing purchases at all — the buys are in the book under another name or code. Fix them at source, in the feed or the client master, rather than adding an opening purchase here."),
        /* @__PURE__ */ React.createElement("div", null, "• The rest are genuinely absent. ", /* @__PURE__ */ React.createElement("b", null, "Fill costs from Holdings"), " takes the average purchase price already on file; anything Holdings does not know needs a figure from the client's own contract note or broker statement."),
        /* @__PURE__ */ React.createElement("div", null, "• An opening purchase is written to the ", /* @__PURE__ */ React.createElement("b", null, "ManualTrades"), " tab, dated the day before the book begins, so it can never be mistaken for a trade of the year. Delete the row there to undo it."),
        /* @__PURE__ */ React.createElement("div", { className: "text-amber-700" }, "• The cost you put in decides the gain. A guess here becomes a figure in someone's return, so take it from a contract note where you can."))
    )
  );
}
// The weekly MIS: see it, send it, and set it to go out on its own.

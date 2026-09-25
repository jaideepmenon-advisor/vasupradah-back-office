/**
 * Vasupradah back office API, on PocketBase instead of a Google Sheet + Apps
 * Script. Deliberately shaped like Code.gs's own doGet(e)/doPost(e): ONE big
 * handler per HTTP method, dispatching on a query flag (GET) or `body.type`
 * (POST), because that is the one shape that survives how PocketBase's JS
 * hooks actually run.
 *
 * VERIFIED AGAINST A REAL POCKETBASE 0.40.4, NOT ASSUMED: a routerAdd/cronAdd
 * callback only ever sees what is written INSIDE its own function body. A
 * plain top-level `function helper(){}` sitting right above the routerAdd
 * call in this very file throws "ReferenceError: helper is not defined" the
 * first time a request actually calls it - confirmed by reproducing it
 * twice against a running instance before writing a single real route. Only
 * the routerAdd/cronAdd/migrate calls themselves are read from the whole
 * file at startup; the function VALUES passed to them are re-evaluated on
 * their own after that, with no memory of anything else in the file.
 *
 * That is why this file is two enormous functions instead of many small
 * ones with shared helpers - every helper below is declared fresh inside
 * both routerAdd("GET", "/exec", ...) and routerAdd("POST", "/exec", ...),
 * the same duplication Code.gs itself would have needed had Apps Script
 * worked the same way. Do not "clean this up" by hoisting a helper to the
 * top of the file - it will pass a read of the code and fail at runtime.
 *
 * The console needs exactly one change to run against this instead of the
 * sheet: Settings -> Google Sheet backup -> Web app URL, set to this
 * server's own address plus "/exec" (e.g. https://your-host/exec). Every
 * fetch the console makes is `url + "?flag=1"` (GET) or a POST straight to
 * `url` with a JSON body - both land here unchanged.
 */

// ============================================================================
// GET /exec  - one query flag decides which read runs, exactly like doGet(e)
// ============================================================================
routerAdd("GET", "/exec", (e) => {
  const q = e.requestInfo().query || {};

  function num(v) {
    const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  function str(v) { return v == null ? "" : String(v); }
  function findAll(collection, filter, sort, params) {
    const out = [];
    let page = 0;
    const pageSize = 2000;
    while (true) {
      const batch = params
        ? $app.findRecordsByFilter(collection, filter || "", sort || "", pageSize, page * pageSize, params)
        : $app.findRecordsByFilter(collection, filter || "", sort || "", pageSize, page * pageSize);
      out.push.apply(out, batch);
      if (batch.length < pageSize) break;
      page++;
    }
    return out;
  }
  function rec2obj(r, fields) {
    const o = {};
    for (const f of fields) o[f] = r.get(f);
    return o;
  }

  // ---- ?staff=1 --------------------------------------------------------
  if (str(q.staff)) {
    const rows = findAll("staff", "", "name").map((r) => ({ name: r.get("name"), enabled: !!r.get("enabled") }));
    return e.json(200, { ok: true, staff: rows });
  }

  // ---- ?prices=1 (Sheet1 equivalent) + ?holdings=1 bundle ---------------
  // Code.gs's own ?holdings=1 returns prices/cash/status/holdings/staff all
  // in one payload; this keeps that shape so a console pointed here needs
  // no other change. `alerts` and the inline trade summary that bundle also
  // carried are not yet ported - see the README - and always come back
  // empty rather than silently wrong.
  if (str(q.prices) || str(q.holdings)) {
    const prices = {};
    for (const r of findAll("live_prices")) prices[r.get("symbol")] = r.get("price");

    const cash = {}, cashCode = {}, status = {}, statusCode = {};
    for (const r of findAll("cash_balances")) {
      const code = r.get("client_code"), name = r.get("name"), amt = r.get("amount"), st = r.get("status");
      if (code) cashCode[code] = amt;
      if (name) cash[name] = amt;
      if (st) { if (code) statusCode[code] = st; if (name) status[name] = st; }
    }

    const clientsByCode = {};
    for (const c of findAll("clients")) clientsByCode[c.get("code")] = c;

    const holdingsOut = [];
    if (str(q.holdings)) {
      for (const h of findAll("holdings", "", "client_code")) {
        const code = h.get("client_code");
        const cl = clientsByCode[code];
        holdingsOut.push([
          code, cl ? cl.get("name") : "", cl ? cl.get("email") : "", cl ? cl.get("whatsapp") : "",
          cl ? cl.get("risk_category") : "", h.get("stock"), h.get("quantity"), h.get("purchase_price"),
          h.get("current_price"), h.get("invested"), h.get("current_value"), h.get("pl_amount"),
          h.get("pl_pct"), h.get("invested_set"), h.get("backed_up_at"),
        ]);
      }
    }

    const staff = findAll("staff").map((r) => ({ name: r.get("name"), enabled: !!r.get("enabled") }));

    return e.json(200, {
      ok: true, prices, cash, cashCode, status, statusCode,
      alerts: [], trades: [], holdings: holdingsOut, count: Object.keys(prices).length, staff,
    });
  }

  // ---- ?client_details=1 (now folded into `clients`) --------------------
  if (str(q.client_details)) {
    const rows = [["code", "pan", "address", "phone", "email", "notes", "updatedAt"]];
    for (const c of findAll("clients")) {
      rows.push([c.get("code"), c.get("pan"), c.get("address"), c.get("phone"), c.get("email"), c.get("notes"), c.get("updated_ms")]);
    }
    return e.json(200, { ok: true, rows: rows.length > 1 ? rows : [] });
  }

  // ---- ?advice_contacts=1 -------------------------------------------------
  if (str(q.advice_contacts)) {
    const rows = [["Client code", "Name", "Email", "Country code", "Mobile", "Risk category", "PAN", "Updated at"]];
    for (const r of findAll("advice_contacts")) {
      rows.push([r.get("client_code"), r.get("name"), r.get("email"), r.get("country_code"), r.get("mobile"), r.get("risk_category"), r.get("pan"), r.get("updated_ms")]);
    }
    return e.json(200, { ok: true, rows: rows.length > 1 ? rows : [] });
  }

  // ---- ?exec_modes=1 (OrderMethod) --------------------------------------
  if (str(q.exec_modes)) {
    const rows = [["Client code", "Name", "Method", "Updated at"]];
    for (const r of findAll("order_method")) rows.push([r.get("client_code"), r.get("name"), r.get("method"), r.get("updated_ms")]);
    return e.json(200, { ok: true, rows: rows.length > 1 ? rows : [] });
  }

  // ---- ?baskets=1 -----------------------------------------------------
  if (str(q.baskets)) {
    const rows = [["category", "symbol", "rationale", "suitability", "smallcase", "report", "updatedAt"]];
    for (const r of findAll("baskets")) rows.push([r.get("category"), r.get("symbol"), r.get("rationale"), r.get("suitability"), r.get("smallcase"), r.get("report"), r.get("updated_ms")]);
    return e.json(200, { ok: true, rows: rows.length > 1 ? rows : [] });
  }

  // ---- ?fee_plans=1 -----------------------------------------------------
  if (str(q.fee_plans)) {
    const rows = [["id", "Name", "Mode", "Amount", "Frequency", "Timing", "GST", "Status", "Notes", "Updated at"]];
    for (const r of findAll("fee_plans")) rows.push([r.get("key"), r.get("name"), r.get("mode"), r.get("amount"), r.get("frequency"), r.get("timing"), r.get("gst"), r.get("status"), r.get("notes"), r.get("updated_ms")]);
    return e.json(200, { ok: true, rows: rows.length > 1 ? rows : [] });
  }

  // ---- ?billing_profiles=1 -----------------------------------------------
  if (str(q.billing_profiles)) {
    const rows = [["Client code", "Name", "Fee plan id", "Fee plan", "Residency", "State", "Permanent state", "GSTIN", "Billing start", "Billing email", "Status", "Notes", "Updated at"]];
    for (const r of findAll("billing_profiles")) {
      rows.push([r.get("client_code"), r.get("name"), r.get("fee_plan_key"), r.get("fee_plan_name"), r.get("residency"), r.get("state"), r.get("permanent_state"), r.get("gstin"), r.get("billing_start"), r.get("billing_email"), r.get("status"), r.get("notes"), r.get("updated_ms")]);
    }
    return e.json(200, { ok: true, rows: rows.length > 1 ? rows : [] });
  }

  // ---- ?billing_settings=1 -----------------------------------------------
  if (str(q.billing_settings)) {
    let rec;
    try { rec = $app.findFirstRecordByFilter("billing_settings", "key = {:k}", { k: "settings" }); } catch (err) { rec = null; }
    if (!rec) return e.json(200, { ok: true, rows: [] });
    const header = ["Firm name", "Firm state", "Firm GSTIN", "PAN", "SEBI reg", "Address", "GST rate",
      "Bank name", "Account name", "Account number", "IFSC", "Branch", "UPI id", "UPI QR",
      "Invoice prefix", "Receipt prefix", "Notes", "Updated at",
      "CIN", "Account type", "Invoice seed FY", "Invoice seed no", "Receipt seed FY", "Receipt seed no", "Number by quarter",
      "CG short rate", "CG long rate", "CG long exemption", "CG cess"];
    const row = [rec.get("firm_name"), rec.get("firm_state"), rec.get("firm_gstin"), rec.get("pan"), rec.get("sebi_reg"),
      rec.get("address"), rec.get("gst_rate"), rec.get("bank_name"), rec.get("account_name"), rec.get("account_number"),
      rec.get("ifsc"), rec.get("branch"), rec.get("upi_id"), rec.get("upi_qr"), rec.get("invoice_prefix"), rec.get("receipt_prefix"),
      rec.get("notes"), rec.get("updated_ms"), rec.get("cin"), rec.get("account_type"), rec.get("invoice_seed_fy"),
      rec.get("invoice_seed_no"), rec.get("receipt_seed_fy"), rec.get("receipt_seed_no"), rec.get("number_by_quarter") ? "yes" : "no",
      rec.get("cg_stcg_rate"), rec.get("cg_ltcg_rate"), rec.get("cg_ltcg_exempt"), rec.get("cg_cess")];
    return e.json(200, { ok: true, rows: [header, row] });
  }

  // ---- ?invoices=1[&period=2026-27-Q1] -----------------------------------
  if (str(q.invoices)) {
    const header = ["id", "Invoice no", "Period", "Client code", "Client name", "Email", "Fee plan",
      "From", "To", "Days billed", "Days in quarter", "Basis", "Fee", "GST mode", "CGST", "SGST", "IGST",
      "Total", "Place of supply", "Status", "Issued at", "Emailed at", "WhatsApp at",
      "Receipt no", "Paid on", "Paid mode", "Paid ref", "Receipt at", "Receipt by", "Updated at"];
    const filter = q.period ? `period = {:p}` : "";
    const rows = [header];
    for (const r of findAll("invoices", filter, "", filter ? { p: q.period } : null)) {
      rows.push([r.get("key"), r.get("invoice_no"), r.get("period"), r.get("client_code"), r.get("client_name"),
        r.get("email"), r.get("fee_plan"), r.get("date_from"), r.get("date_to"), r.get("days_billed"), r.get("days_in_quarter"),
        r.get("basis"), r.get("fee"), r.get("gst_mode"), r.get("cgst"), r.get("sgst"), r.get("igst"), r.get("total"),
        r.get("place_of_supply"), r.get("status"), r.get("issued_at_ms"), r.get("emailed_at_ms"), r.get("whatsapp_at_ms"),
        r.get("receipt_no"), r.get("paid_on"), r.get("paid_mode"), r.get("paid_ref"), r.get("receipt_at_ms"), r.get("receipt_by"), r.get("updated_ms")]);
    }
    return e.json(200, { ok: true, rows: rows.length > 1 ? rows : [] });
  }

  // ---- ?pipeline=1 -----------------------------------------------------
  if (str(q.pipeline)) {
    const header = ["id", "name", "phone", "email", "source", "enquiryDate", "corpus", "basket", "assignee", "priority",
      "stage", "nextFollowUp", "pan", "ckyc", "notes", "signedDate", "kycDocs", "check", "log", "updatedAt",
      "service", "meetingLink", "meetingTime"];
    const rows = [header];
    for (const r of findAll("pipeline")) {
      rows.push([r.get("key"), r.get("name"), r.get("phone"), r.get("email"), r.get("source"), r.get("enquiry_date"),
        r.get("corpus"), r.get("basket"), r.get("assignee"), r.get("priority"), r.get("stage"), r.get("next_follow_up"),
        r.get("pan"), r.get("ckyc"), r.get("notes"), r.get("signed_date"), JSON.stringify(r.get("kyc_docs") || {}),
        JSON.stringify(r.get("checklist") || {}), JSON.stringify(r.get("log") || []), r.get("updated_ms"),
        r.get("service"), r.get("meeting_link"), r.get("meeting_time")]);
    }
    return e.json(200, { ok: true, rows: rows.length > 1 ? rows : [] });
  }

  // ---- capital gains / gap scan / first-trade: the trade book itself ----
  // Shared machinery for every route below that needs the whole book -
  // ported field-for-field from Code.gs's gkNormalizedTrades_() plus the
  // FIFO matcher, so the numbers this produces should match the sheet
  // exactly for the same input (checked in pocketbase/tests, not assumed).
  function wholeBook() {
    const out = [];
    for (const r of findAll("trades")) out.push([r.get("date"), r.get("client_code"), r.get("client_name"), r.get("symbol"), r.get("action"), r.get("quantity"), r.get("price"), r.get("amount")]);
    for (const r of findAll("manual_trades")) out.push([r.get("date"), r.get("client_code"), r.get("client_name"), r.get("symbol"), r.get("action"), r.get("quantity"), r.get("price"), r.get("amount")]);
    out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return out;
  }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  if (str(q.capgains)) {
    const fy = str(q.fy).trim();
    const y = parseInt(fy.substring(0, 4), 10);
    if (!y) return e.json(200, { ok: false, error: "fy must look like 2026-27" });
    const want = str(q.code).trim();
    const today = todayStr();
    let from = y + "-04-01", to = (y + 1) + "-03-31";
    if (to > today) to = today;

    const rows = wholeBook();
    const isBuy = (a) => /^(B|BUY|P|PURCHASE)/i.test(String(a || "").trim());
    const isLong = (buy, sell) => {
      const b = buy.split("-").map(Number), s = sell.split("-").map(Number);
      const lastDay = new Date(b[0] + 1, b[1], 0).getDate();
      const edge = new Date(b[0] + 1, b[1] - 1, Math.min(b[2], lastDay));
      const sd = new Date(s[0], s[1] - 1, s[2]);
      return sd > edge;
    };

    const books = {}, names = {}, realised = [], unmatched = [], totals = {};
    const tally = (code) => { if (!totals[code]) totals[code] = { code, name: names[code] || code, stGain: 0, stLoss: 0, ltGain: 0, ltLoss: 0, sells: 0 }; return totals[code]; };

    for (const tr of rows) {
      const dt = String(tr[0] || "").trim(), code = String(tr[1] || "").trim();
      const sym = String(tr[3] || "").trim().toUpperCase();
      if (!dt || !code || !sym) continue;
      if (String(tr[2] || "").trim()) names[code] = String(tr[2]).trim();
      const qty = Math.abs(Number(tr[5]) || 0);
      if (!qty) continue;
      let amt = Math.abs(Number(tr[7]) || 0);
      if (!amt) amt = qty * Math.abs(Number(tr[6]) || 0);
      const key = code + "\u0001" + sym;
      if (!books[key]) books[key] = [];

      if (isBuy(tr[4])) { books[key].push({ date: dt, qty, cost: amt }); continue; }

      if (dt >= from && dt <= to) tally(code);
      let left = qty;
      const proceedsRate = amt / qty;
      const book = books[key];
      while (left > 0 && book.length) {
        const lot = book[0];
        const take = Math.min(left, lot.qty);
        const lotRate = lot.cost / lot.qty;
        const cost = lotRate * take, proceeds = proceedsRate * take;
        const gain = proceeds - cost;
        const long = isLong(lot.date, dt);
        if (dt >= from && dt <= to) {
          const t = tally(code);
          t.sells++;
          if (long) { if (gain >= 0) t.ltGain += gain; else t.ltLoss += -gain; }
          else { if (gain >= 0) t.stGain += gain; else t.stLoss += -gain; }
          if (want && code === want) {
            realised.push({ sym, buyDate: lot.date, sellDate: dt, qty: take, cost: Math.round(cost * 100) / 100, proceeds: Math.round(proceeds * 100) / 100, gain: Math.round(gain * 100) / 100, term: long ? "LONG" : "SHORT" });
          }
        }
        lot.qty -= take; lot.cost -= cost; left -= take;
        if (lot.qty <= 1e-9) book.shift();
      }
      if (left > 1e-9 && dt >= from && dt <= to) unmatched.push({ code, name: names[code] || code, sym, date: dt, qty: Math.round(left * 1e4) / 1e4 });
    }

    const open = [], lots = [];
    for (const k in books) {
      if (!books[k].length) continue;
      const [oc, os] = k.split("\u0001");
      const bucket = {};
      for (const L of books[k]) {
        if (L.qty <= 1e-9) continue;
        const term = isLong(L.date, today) ? "LONG" : "SHORT";
        if (!bucket[term]) bucket[term] = { code: oc, name: names[oc] || oc, sym: os, term, qty: 0, cost: 0, oldest: L.date, preGf: 0 };
        const bk = bucket[term];
        bk.qty += L.qty; bk.cost += L.cost;
        if (L.date < bk.oldest) bk.oldest = L.date;
        if (L.date < "2018-02-01") bk.preGf += L.qty;
        if (want && oc === want) lots.push({ sym: os, date: L.date, qty: Math.round(L.qty * 1e4) / 1e4, cost: Math.round(L.cost * 100) / 100, term });
      }
      for (const bt in bucket) { bucket[bt].qty = Math.round(bucket[bt].qty * 1e4) / 1e4; bucket[bt].cost = Math.round(bucket[bt].cost * 100) / 100; open.push(bucket[bt]); }
    }

    const out = { ok: true, fy, from, to, asOn: today, code: want, clients: [], open, unmatched: unmatched.slice(0, 500) };
    for (const tc in totals) {
      const t = totals[tc];
      t.stGain = Math.round(t.stGain * 100) / 100; t.stLoss = Math.round(t.stLoss * 100) / 100;
      t.ltGain = Math.round(t.ltGain * 100) / 100; t.ltLoss = Math.round(t.ltLoss * 100) / 100;
      out.clients.push(t);
    }
    if (want) { out.realised = realised; out.lots = lots; }
    return e.json(200, out);
  }

  if (str(q.first_trades)) {
    const first = {};
    for (const tr of wholeBook()) {
      const code = String(tr[1] || "").trim(), dt = String(tr[0] || "").trim();
      if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) continue;
      if (!first[code] || dt < first[code]) first[code] = dt;
    }
    return e.json(200, { ok: true, first });
  }

  if (str(q.gap_scan)) {
    const fy = str(q.fy).trim();
    const y = parseInt(fy.substring(0, 4), 10);
    if (!y) return e.json(200, { ok: false, error: "fy must look like 2026-27" });
    const today = todayStr();
    let from = y + "-04-01", to = (y + 1) + "-03-31";
    if (to > today) to = today;

    const rows = wholeBook();
    const isBuy = (a) => /^(B|BUY|P|PURCHASE)/i.test(String(a || "").trim());
    const bare = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(BE|EQ|BL|SM|ST)$/, "");

    const byCS = {}, names = {}, byClient = {};
    let bookFrom = "", bookTo = "";
    for (const tr of rows) {
      const dt = String(tr[0] || "").trim(), code = String(tr[1] || "").trim();
      const sym = String(tr[3] || "").trim().toUpperCase();
      const qty = Math.abs(Number(tr[5]) || 0);
      if (!dt || !code || !sym || !qty) continue;
      if (String(tr[2] || "").trim()) names[code] = String(tr[2]).trim();
      if (!bookFrom || dt < bookFrom) bookFrom = dt;
      if (!bookTo || dt > bookTo) bookTo = dt;
      const k = code + "\u0001" + sym;
      if (!byCS[k]) byCS[k] = { code, sym, bought: 0, sold: 0, first: dt, last: dt, runQty: 0, shortQty: 0, sales: 0, firstSale: "", lastSale: "" };
      const en = byCS[k];
      if (dt < en.first) en.first = dt;
      if (dt > en.last) en.last = dt;
      if (!byClient[code]) byClient[code] = { first: dt, syms: {} };
      if (dt < byClient[code].first) byClient[code].first = dt;
      byClient[code].syms[sym] = (byClient[code].syms[sym] || 0) + (isBuy(tr[4]) ? qty : -qty);

      if (isBuy(tr[4])) { en.bought += qty; en.runQty += qty; }
      else {
        en.sold += qty;
        const have = Math.max(0, en.runQty);
        const missing = qty - have;
        en.runQty = have - Math.min(qty, have);
        if (missing > 1e-9 && dt >= from && dt <= to) {
          en.shortQty += missing; en.sales++;
          if (!en.firstSale || dt < en.firstSale) en.firstSale = dt;
          if (dt > en.lastSale) en.lastSale = dt;
        }
      }
    }

    const holdQty = {}, holdBuy = {};
    for (const h of findAll("holdings")) {
      const k = h.get("client_code") + "\u0001" + String(h.get("stock") || "").toUpperCase();
      holdQty[k] = h.get("quantity"); holdBuy[k] = h.get("purchase_price");
    }
    const codesByName = {};
    for (const nc in names) {
      const nk = names[nc].toUpperCase().replace(/\s+/g, " ").trim();
      if (!nk) continue;
      (codesByName[nk] = codesByName[nk] || []).push(nc);
    }

    const gaps = [];
    for (const gk in byCS) {
      const g = byCS[gk];
      if (!(g.shortQty > 1e-9)) continue;
      const bareSym = bare(g.sym);
      const near = [];
      const mine = (byClient[g.code] || {}).syms || {};
      for (const ms in mine) {
        if (ms === g.sym) continue;
        const mb = bare(ms);
        if (mb === bareSym || (mb.length >= 4 && bareSym.length >= 4 && (mb.indexOf(bareSym) === 0 || bareSym.indexOf(mb) === 0))) near.push({ sym: ms, netQty: Math.round(mine[ms] * 1e4) / 1e4 });
      }
      const others = [];
      const myName = String(names[g.code] || "").toUpperCase().replace(/\s+/g, " ").trim();
      for (const sib of (codesByName[myName] || [])) {
        if (sib === g.code) continue;
        const ok2 = byCS[sib + "\u0001" + g.sym];
        if (ok2 && ok2.bought > 0) others.push({ code: sib, bought: Math.round(ok2.bought * 1e4) / 1e4 });
      }
      const hk = g.code + "\u0001" + g.sym;
      gaps.push({
        code: g.code, name: names[g.code] || g.code, sym: g.sym, shortQty: Math.round(g.shortQty * 1e4) / 1e4,
        sales: g.sales, firstSale: g.firstSale, lastSale: g.lastSale, bought: Math.round(g.bought * 1e4) / 1e4,
        sold: Math.round(g.sold * 1e4) / 1e4, firstTrade: g.first, clientFirstTrade: (byClient[g.code] || {}).first || "",
        holdingQty: holdQty[hk] == null ? null : holdQty[hk], holdingBuy: holdBuy[hk] || 0,
        near: near.slice(0, 5), otherCodes: others.slice(0, 5),
      });
    }
    gaps.sort((a, b) => b.shortQty - a.shortQty);
    return e.json(200, { ok: true, fy, from, to, bookFrom, bookTo, gaps: gaps.slice(0, 2000), gapCount: gaps.length });
  }

  // ---- ?mis=1[&on=YYYY-MM-DD] --------------------------------------------
  if (str(q.mis)) {
    function dayStr(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
    const on = /^\d{4}-\d{2}-\d{2}$/.test(str(q.on)) ? str(q.on) : todayStr();
    const toD = new Date(on + "T00:00:00");
    const fromD = new Date(toD.getTime() - 6 * 864e5);
    const weekFrom = dayStr(fromD), weekTo = on;
    const monthKey = on.slice(0, 7);
    const fyStart = parseInt(on.slice(0, 4), 10) - (parseInt(on.slice(5, 7), 10) >= 4 ? 0 : 1);
    const fyFrom = fyStart + "-04-01";

    const rows = findAll("pipeline").map((r) => ({
      name: r.get("name") || "", source: r.get("source") || "Not stated", enquiryDate: String(r.get("enquiry_date") || "").slice(0, 10),
      corpus: Number(r.get("corpus")) || 0, assignee: r.get("assignee") || "Unassigned", stage: r.get("stage") || "new",
      nextFollowUp: String(r.get("next_follow_up") || "").slice(0, 10), signedDate: String(r.get("signed_date") || "").slice(0, 10),
      service: r.get("service") || "Not stated", updatedMs: Number(r.get("updated_ms")) || 0,
    }));
    const isActive = (x) => x.stage !== "signed" && x.stage !== "lost";
    const inWeek = (d) => d && d >= weekFrom && d <= weekTo;
    const active = rows.filter(isActive), signed = rows.filter((x) => x.stage === "signed"), lost = rows.filter((x) => x.stage === "lost");
    const corpusOf = (l) => l.reduce((s, x) => s + x.corpus, 0);
    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
    const newThisWeek = rows.filter((x) => inWeek(x.enquiryDate));
    const signedThisWeek = signed.filter((x) => inWeek(x.signedDate));
    const lostThisWeek = lost.filter((x) => x.updatedMs && dayStr(new Date(x.updatedMs)) >= weekFrom && dayStr(new Date(x.updatedMs)) <= weekTo);
    const touchedThisWeek = rows.filter((x) => x.updatedMs && dayStr(new Date(x.updatedMs)) >= weekFrom && dayStr(new Date(x.updatedMs)) <= weekTo);
    const overdue = active.filter((x) => x.nextFollowUp && x.nextFollowUp <= on);

    return e.json(200, {
      ok: true, on, weekFrom, weekTo,
      activeCount: active.length, activeCorpus: corpusOf(active),
      signedCount: signed.length, lostCount: lost.length, conv: pct(signed.length, signed.length + lost.length),
      signedThisMonth: signed.filter((x) => x.signedDate.slice(0, 7) === monthKey).length,
      signedThisFy: signed.filter((x) => x.signedDate && x.signedDate >= fyFrom).length,
      week: { newCount: newThisWeek.length, newCorpus: corpusOf(newThisWeek), signedCount: signedThisWeek.length, signedCorpus: corpusOf(signedThisWeek), lostCount: lostThisWeek.length, touched: touchedThisWeek.length },
      overdueCount: overdue.length,
    });
  }

  return e.json(200, { message: "Vasupradah PocketBase backend is live (use POST for writes)." });
});

// ============================================================================
// POST /exec  - body.type decides which write runs, exactly like doPost(e).
// Every branch checks the shared secret first, exactly as Code.gs did; GET
// stays unauthenticated because that is what Code.gs itself did (reads never
// carried a token) - not a gap introduced by this port.
// ============================================================================
routerAdd("POST", "/exec", (e) => {
  const body = e.requestInfo().body || {};

  function pbSecret() {
    const v = $os.getenv("PB_SECRET");
    return v && v.trim() ? v.trim() : "820082";
  }
  if (String(body.token || "") !== pbSecret()) {
    return e.json(200, { ok: false, error: "token mismatch" });
  }

  function num(v) {
    const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  function str(v) { return v == null ? "" : String(v); }
  function trim(v) { return str(v).trim(); }
  function findOne(collection, field, value) {
    try { return $app.findFirstRecordByFilter(collection, `${field} = {:v}`, { v: value }); }
    catch (err) { return null; }
  }
  // Finds-or-creates by a natural key and sets every field in `data` on it -
  // the same "look it up by code, update in place or append" every POST
  // branch in Code.gs used, just named once here instead of copied into each
  // sheet-writer function.
  function upsertBy(collection, keyField, keyValue, data) {
    const coll = $app.findCollectionByNameOrId(collection);
    let rec = findOne(collection, keyField, keyValue);
    const created = !rec;
    if (!rec) { rec = new Record(coll); rec.set(keyField, keyValue); }
    // A field explicitly left as `undefined` is skipped rather than blanked,
    // so callers can say "leave whatever is already there" - used when a
    // holdings rebuild carries master data back over without overwriting a
    // client's real email/whatsapp with an empty column from the payload.
    for (const k in data) if (data[k] !== undefined) rec.set(k, data[k]);
    $app.save(rec);
    return { record: rec, created };
  }
  function deleteBy(collection, field, value) {
    const rec = findOne(collection, field, value);
    if (!rec) return false;
    $app.delete(rec);
    return true;
  }

  // ---- staff (replace-all, mirrors the old PropertiesService blob) -------
  if (body.type === "staff" || Array.isArray(body.staff)) {
    const list = Array.isArray(body.staff) ? body.staff : [];
    for (const s of list) {
      const name = trim(s && s.name);
      if (!name) continue;
      upsertBy("staff", "name", name, { enabled: !!(s && s.enabled) });
    }
    if (body.type === "staff") return e.json(200, { ok: true, saved: list.length });
    // else: fall through - this was a payload that carried a staff list
    // alongside something else (a holdings backup used to do this too).
  }

  // ---- fee_plans ----------------------------------------------------------
  if (body.type === "fee_plans") {
    if (body.action === "delete") {
      const id = trim(body.id);
      if (!id) return e.json(200, { ok: false, error: "delete needs an id" });
      const gone = deleteBy("fee_plans", "key", id);
      return e.json(200, { ok: true, message: gone ? "fee plan deleted" : "fee plan not found" });
    }
    const rows = Array.isArray(body.rows) ? body.rows : [];
    let added = 0, updated = 0;
    for (const r of rows) {
      const id = trim(r.id), name = trim(r.name);
      if (!id || !name) continue;
      const { created } = upsertBy("fee_plans", "key", id, {
        name, mode: str(r.mode), amount: num(r.amount), frequency: str(r.frequency), timing: str(r.timing),
        gst: str(r.gst), status: str(r.status), notes: str(r.notes), updated_ms: Number(r.updatedAt) || Date.now(),
      });
      created ? added++ : updated++;
    }
    return e.json(200, { ok: true, added, updated });
  }

  // ---- billing_profiles ---------------------------------------------------
  if (body.type === "billing_profiles") {
    if (body.action === "delete") {
      const code = trim(body.code);
      if (!code) return e.json(200, { ok: false, error: "delete needs a client code" });
      const gone = deleteBy("billing_profiles", "client_code", code);
      return e.json(200, { ok: true, message: gone ? "billing profile deleted" : "billing profile not found" });
    }
    const rows = Array.isArray(body.rows) ? body.rows : [];
    let added = 0, updated = 0;
    for (const r of rows) {
      const code = trim(r.code);
      if (!code) continue;
      const { created } = upsertBy("billing_profiles", "client_code", code, {
        name: str(r.name), fee_plan_key: str(r.planId), fee_plan_name: str(r.planName), residency: str(r.residency),
        state: str(r.state), permanent_state: str(r.permanentState), gstin: str(r.gstin), billing_start: str(r.billingStart),
        billing_email: str(r.email), status: str(r.status), notes: str(r.notes), updated_ms: Number(r.updatedAt) || Date.now(),
      });
      created ? added++ : updated++;
    }
    return e.json(200, { ok: true, added, updated });
  }

  // ---- billing_settings (singleton) ---------------------------------------
  if (body.type === "billing_settings") {
    const r = body.row || {};
    let qr = str(r.upiQr);
    let qrNote = "";
    if (qr.length > 55000) { qr = ""; qrNote = " (UPI QR too large to store - use a smaller image)"; }
    upsertBy("billing_settings", "key", "settings", {
      firm_name: str(r.firmName), firm_state: str(r.firmState), firm_gstin: str(r.firmGstin), pan: str(r.pan),
      sebi_reg: str(r.sebiReg), address: str(r.address), gst_rate: num(r.gstRate), bank_name: str(r.bankName),
      account_name: str(r.accountName), account_number: str(r.accountNo), ifsc: str(r.ifsc), branch: str(r.branch),
      upi_id: str(r.upiId), upi_qr: qr, invoice_prefix: str(r.invoicePrefix), receipt_prefix: str(r.receiptPrefix),
      notes: str(r.notes), cin: str(r.cin), account_type: str(r.accountType), invoice_seed_fy: str(r.invoiceSeedFy),
      invoice_seed_no: num(r.invoiceSeedNo), receipt_seed_fy: str(r.receiptSeedFy), receipt_seed_no: num(r.receiptSeedNo),
      number_by_quarter: !!r.numberByQuarter, cg_stcg_rate: r.cgStcgRate == null ? null : num(r.cgStcgRate),
      cg_ltcg_rate: r.cgLtcgRate == null ? null : num(r.cgLtcgRate), cg_ltcg_exempt: r.cgLtcgExempt == null ? null : num(r.cgLtcgExempt),
      cg_cess: r.cgCess == null ? null : num(r.cgCess), updated_ms: Number(r.updatedAt) || Date.now(),
    });
    return e.json(200, { ok: true, message: "billing settings saved" + qrNote });
  }

  // ---- invoices -------------------------------------------------------
  if (body.type === "invoices") {
    if (body.action === "delete") {
      const id = trim(body.id);
      if (!id) return e.json(200, { ok: false, error: "delete needs an id" });
      const gone = deleteBy("invoices", "key", id);
      return e.json(200, { ok: true, message: gone ? "invoice deleted" : "invoice not found" });
    }
    const rows = Array.isArray(body.rows) ? body.rows : [];
    let added = 0, updated = 0;
    for (const iv of rows) {
      const id = trim(iv.id);
      if (!id) continue;
      const rcp = iv.receipt || {};
      const { created } = upsertBy("invoices", "key", id, {
        invoice_no: str(iv.no), period: str(iv.period), client_code: str(iv.code), client_name: str(iv.name),
        email: str(iv.email), fee_plan: str(iv.planName), date_from: str(iv.from), date_to: str(iv.to),
        days_billed: num(iv.days), days_in_quarter: num(iv.daysInQuarter), basis: str(iv.basis), fee: num(iv.fee),
        gst_mode: str(iv.gstMode), cgst: num(iv.cgst), sgst: num(iv.sgst), igst: num(iv.igst), total: num(iv.total),
        place_of_supply: str(iv.placeOfSupply), status: str(iv.status), issued_at_ms: num(iv.issuedAt),
        emailed_at_ms: num(iv.emailedAt), whatsapp_at_ms: num(iv.waAt), receipt_no: str(rcp.no), paid_on: str(rcp.paidOn),
        paid_mode: str(rcp.mode), paid_ref: str(rcp.ref), receipt_at_ms: num(rcp.at), receipt_by: str(rcp.by),
        updated_ms: Number(iv.updatedAt) || Date.now(),
      });
      created ? added++ : updated++;
    }
    return e.json(200, { ok: true, added, updated });
  }

  // ---- exec_modes (OrderMethod) -------------------------------------------
  if (body.type === "exec_modes") {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    let added = 0, updated = 0;
    for (const r of rows) {
      const code = trim(r.code);
      if (!code) continue;
      const method = String(r.method || "").toLowerCase() === "gateway" ? "gateway" : "email";
      const { created } = upsertBy("order_method", "client_code", code, { name: str(r.name), method, updated_ms: Date.now() });
      created ? added++ : updated++;
    }
    return e.json(200, { ok: true, added, updated });
  }

  // ---- baskets --------------------------------------------------------
  if (body.type === "baskets") {
    // A printable delimiter, not "\u0001" - a raw control character in a filter
    // parameter value silently matches nothing in PocketBase (verified against
    // 0.40.4: the exact same bytes round-trip fine through .get()/.set(), but
    // findFirstRecordByFilter's {:v} binding never matches it), even though the
    // in-memory FIFO-matcher maps elsewhere in this file use "\u0001" safely
    // since those never go through a filter query.
    const bKey = (c, sym) => trim(c).toLowerCase() + "::" + trim(sym).toUpperCase();
    if (body.action === "delete") {
      const gone = deleteBy("baskets", "key", bKey(body.category, body.symbol));
      return e.json(200, { ok: true, message: gone ? "basket row deleted" : "basket row not found" });
    }
    const rows = Array.isArray(body.rows) ? body.rows : [];
    let added = 0, updated = 0;
    for (const r of rows) {
      if (!r.symbol || !r.category) continue;
      const { created } = upsertBy("baskets", "key", bKey(r.category, r.symbol), {
        category: str(r.category), symbol: str(r.symbol).toUpperCase(), rationale: str(r.rationale),
        suitability: str(r.suitability), smallcase: str(r.smallcase), report: str(r.report), updated_ms: Date.now(),
      });
      created ? added++ : updated++;
    }
    return e.json(200, { ok: true, added, updated });
  }

  // ---- client_details (folded into `clients`) -----------------------------
  if (body.type === "client_details") {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    let n = 0;
    for (const r of rows) {
      const code = trim(r.code);
      if (!code) continue;
      upsertBy("clients", "code", code, { pan: str(r.pan), address: str(r.address), phone: str(r.phone), email: str(r.email), notes: str(r.notes), updated_ms: Number(r.updatedAt) || Date.now() });
      n++;
    }
    return e.json(200, { ok: true, saved: n });
  }

  // ---- advice_contacts ------------------------------------------------
  if (body.type === "advice_contacts") {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    let added = 0, updated = 0;
    for (const r of rows) {
      const code = trim(r.code);
      if (!code) continue;
      const { created } = upsertBy("advice_contacts", "client_code", code, {
        name: str(r.name), email: str(r.email), country_code: str(r.cc), mobile: str(r.mobile),
        risk_category: str(r.risk), pan: str(r.pan), updated_ms: Date.now(),
      });
      created ? added++ : updated++;
    }
    return e.json(200, { ok: true, added, updated });
  }

  // ---- manual trades (single, or bulk via body.trades[]) -------------------
  if (body.type === "manual_trade") {
    const coll = $app.findCollectionByNameOrId("manual_trades");
    if (body.action === "delete") {
      const gone = deleteBy("manual_trades", "key", trim(body.id));
      return e.json(200, { ok: true, message: gone ? "manual trade deleted" : "manual trade not found" });
    }
    if (Array.isArray(body.trades)) {
      let added = 0, skipped = 0;
      for (const t of body.trades) {
        const key = trim(t.id);
        if (!key || findOne("manual_trades", "key", key)) { skipped++; continue; }
        const rec = new Record(coll);
        rec.set("key", key); rec.set("date", str(t.date)); rec.set("client_code", str(t.code)); rec.set("client_name", str(t.name));
        rec.set("symbol", str(t.symbol).toUpperCase()); rec.set("action", String(t.action || "BUY").toUpperCase());
        rec.set("quantity", num(t.quantity)); rec.set("price", num(t.price));
        rec.set("amount", num(t.amount) || num(t.quantity) * num(t.price));
        rec.set("note", str(t.note)); rec.set("entered_by", str(t.by)); rec.set("entered_at_ms", Date.now());
        $app.save(rec);
        added++;
      }
      return e.json(200, { ok: true, added, skipped });
    }
    const t = body.trade || {};
    const key = trim(t.id);
    if (!key) return e.json(200, { ok: false, error: "manual trade needs an id" });
    if (findOne("manual_trades", "key", key)) return e.json(200, { ok: true, message: "manual trade already recorded" });
    const rec = new Record(coll);
    rec.set("key", key); rec.set("date", str(t.date)); rec.set("client_code", str(t.code)); rec.set("client_name", str(t.name));
    rec.set("symbol", str(t.symbol).toUpperCase()); rec.set("action", String(t.action || "").toUpperCase());
    rec.set("quantity", num(t.quantity)); rec.set("price", num(t.price));
    rec.set("amount", num(t.amount) || num(t.quantity) * num(t.price));
    rec.set("note", str(t.note)); rec.set("entered_by", str(t.by)); rec.set("entered_at_ms", Date.now());
    $app.save(rec);
    return e.json(200, { ok: true, message: "manual trade added" });
  }

  // ---- pipeline -------------------------------------------------------
  if (body.type === "pipeline") {
    if (body.action === "delete") {
      const gone = deleteBy("pipeline", "key", trim(body.id));
      return e.json(200, { ok: true, message: gone ? "deleted" : "not found" });
    }
    const rec = body.rec || {};
    const key = trim(rec.id);
    if (!key) return e.json(200, { ok: false, error: "pipeline record needs an id" });
    upsertBy("pipeline", "key", key, {
      name: str(rec.name), phone: str(rec.phone), email: str(rec.email), source: str(rec.source),
      enquiry_date: str(rec.enquiryDate), corpus: num(rec.corpus), basket: str(rec.basket), assignee: str(rec.assignee),
      priority: str(rec.priority), stage: str(rec.stage) || "new", next_follow_up: str(rec.nextFollowUp),
      pan: str(rec.pan), ckyc: str(rec.ckyc), notes: str(rec.notes), signed_date: str(rec.signedDate),
      kyc_docs: rec.kycDocs || {}, checklist: rec.check || {}, log: rec.log || [],
      updated_ms: Number(rec.updatedAt) || Date.now(), service: str(rec.service), meeting_link: str(rec.meetingLink),
      meeting_time: str(rec.meetingTime),
    });
    return e.json(200, { ok: true, message: "pipeline saved" });
  }

  // ---- holdings backup (the default POST, same rule as Code.gs: a body
  //      with no rows array at all is refused rather than silently emptying
  //      the table) -------------------------------------------------------
  if (!Array.isArray(body.rows)) {
    return e.json(200, { ok: false, error: "this request carried no rows, so holdings was left untouched" });
  }
  // Replace-all: every existing holdings row goes, and is rebuilt from the
  // payload - same semantics as the sheet's clearContents() + rewrite.
  for (const old of $app.findRecordsByFilter("holdings", "", "", 0, 0)) $app.delete(old);
  const hColl = $app.findCollectionByNameOrId("holdings");
  let written = 0;
  for (const r of body.rows) {
    const code = trim(r[0]);
    if (!code) continue;
    upsertBy("clients", "code", code, {
      name: str(r[1]) || undefined, email: str(r[2]) || undefined, whatsapp: str(r[3]) || undefined, risk_category: str(r[4]) || undefined,
    });
    const rec = new Record(hColl);
    rec.set("client_code", code); rec.set("stock", str(r[5])); rec.set("quantity", num(r[6])); rec.set("purchase_price", num(r[7]));
    rec.set("current_price", num(r[8])); rec.set("invested", num(r[9])); rec.set("current_value", num(r[10]));
    rec.set("pl_amount", num(r[11])); rec.set("pl_pct", num(r[12])); rec.set("invested_set", str(r[13])); rec.set("backed_up_at", str(r[14]));
    $app.save(rec);
    written++;
  }
  return e.json(200, { ok: true, message: "wrote " + written + " data rows" });
});

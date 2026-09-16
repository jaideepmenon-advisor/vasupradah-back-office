// Vasupradah backend — Google Apps Script Web App.
//
// This file mirrors the Apps Script project's Code.gs. The console
// (console/VasupradahClientConsole.html) also carries its own embedded copy
// of the backend under its APPS_SCRIPT constant (Settings tab -> "Copy
// backend code") for in-app copy-paste convenience. The two can drift when
// either is edited alone — keep them in sync by hand until a build step
// wires them together.

/************************************************************************
 *  Vasupradah Investment Advisory - Client Console  ·  Google Apps Script
 *  Principal Officer: Jaideep Menon  ·  SEBI Registered Investment Adviser
 *
 *  ====================  SETUP ORDER  (do not skip / reorder)  ==========
 *
 *  0. THERE MUST BE ONLY ONE SCRIPT FILE.
 *     If the left panel shows 'Untitled.gs' as well as 'Code.gs', delete
 *     Untitled.gs (3 dots -> Delete). Two files = two doGet/doPost = errors.
 *
 *  1. Paste this ENTIRE file over everything in Code.gs. Press SAVE.
 *
 *  2. Function dropdown (top bar) -> choose 'grantPermissions' -> Run.
 *     Google asks for permission -> Advanced -> Go to ... -> Allow.
 *     This grants everything at once and needs NO token to be set yet.
 *
 *     If you get "An unknown error has occurred": that is the editor, not
 *     your code. It is nearly always caused by being signed in to MORE THAN
 *     ONE Google account. Fix: open the sheet in an Incognito window signed
 *     in ONLY as the account that owns the sheet, then retry.
 *
 *  3. Set the GridKey token. Either:
 *       (a) Project Settings (gear) -> Script properties -> Add:
 *             GK_TOKEN       = <your token>
 *             GK_TRADES_URL  = https://django-backend-prod.gridkey.in/transaction/export_csv/?show_zero_holding=false&filter=%7B%7D
 *             GK_LEDGER_URL  = <paste when you have it>
 *       (b) or run 'setGridkeyTokenManually' after pasting values into it.
 *       (c) or, once step 4 is done, from the app: Settings -> GridKey auto-sync.
 *
 *  4. Deploy -> Manage deployments -> pencil -> Version: NEW VERSION -> Deploy.
 *     ("Who has access" must stay: Anyone.)
 *
 *  5. Function dropdown -> 'authorizeGridkey' -> Run.  This does a REAL fetch
 *     and should log: SUCCESS ... HTTP 200 ... about 101570 lines.
 *
 *  6. Function dropdown -> 'setupGridkeyTriggers' -> Run ONCE.
 *     Installs the 6:00 am and 6:00 pm daily sync. Do this LAST: triggers
 *     remember the permissions they had when created.
 *
 *  7. Project Settings -> timezone must be (GMT+05:30) India.
 *
 *  =====================================================================
 *  Endpoints:
 *    GET  ?prices=1  ?alerts=1  ?trades=1  ?holdings=1  ?gridkey=1
 *    POST type=holdings (default) | trades | gridkey_config | gridkey_run
 ************************************************************************/

// ============================================================================
//  Vasupradah backend. FIRST TIME: pick "setup" in the function dropdown above
//  and press Run once — approve the permissions (including "send email as you").
//  It emails you a confirmation. Then Deploy > Manage deployments > Edit > New version.
// ============================================================================
function setup() {
  var email = Session.getEffectiveUser().getEmail();
  var quota = MailApp.getRemainingDailyQuota();
  MailApp.sendEmail(email, "Vasupradah - setup OK",
    "Authorisation complete. This Google account (" + email + ") can now send email from the console. "
    + "Gmail sends left today: " + quota + ".");
  Logger.log("Authorised as " + email + " - Gmail sends left today: " + quota);
  return "OK - authorised as " + email + ", quota " + quota;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.prices && !p.alerts && !p.trades && !p.holdings && !p.gridkey && !p.greeting_status && !p.advice_alerts && !p.advice_trace && !p.ping && !p.pipeline && !p.baskets && !p.manual_trades && !p.client_details && !p.shorten && !p.dedupe && !p.gk_probe) {
    return ContentService.createTextOutput("Vasupradah backup endpoint is live (use POST from the console).");
  }

  // Diagnostics: confirms this deployment is current, which Google account it sends mail as, and
  // how much Gmail quota is left today. Used by Settings → Email diagnostics.
  if (p.ping) {
    var pq = 0; try { pq = MailApp.getRemainingDailyQuota(); } catch (ePq) { pq = -1; }
    var pu = ""; try { pu = Session.getEffectiveUser().getEmail(); } catch (ePu) { pu = ""; }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, version: "2026-09-05-pipeline", canSendEmail: pq >= 0, quota: pq, user: pu, tz: Session.getScriptTimeZone(), shortener: String(gkProps_().getProperty("SHORT_PROVIDER") || "isgd") })).setMimeType(ContentService.MimeType.JSON);
  }

  // Diagnose why a trade is not showing: what does the export actually return, what did the
  // last sync do, and how big is the tab (a bloated sheet can hit Google's cell ceiling).
  if (p.gk_probe) {
    if (String(p.token || "") !== (PropertiesService.getScriptProperties().getProperty("SECRET") || "820082")) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "bad token" })).setMimeType(ContentService.MimeType.JSON);
    }
    var pr = gkProps_();
    var which = String(p.gk_probe) === "ledger" ? "ledger" : "trades";
    var purl = String(which === "ledger" ? (pr.getProperty("GK_LEDGER_URL") || "") : (pr.getProperty("GK_TRADES_URL") || "")).trim();
    var sheetName = which === "ledger" ? GK_LEDGER_SHEET : GK_TRADES_SHEET;
    var pss = SpreadsheetApp.getActiveSpreadsheet();
    var psh = pss.getSheetByName(sheetName);
    var out = {
      ok: true, which: which, hasUrl: !!purl,
      lastSync: pr.getProperty("GK_LAST_SYNC") || "", lastResult: pr.getProperty("GK_LAST_RESULT") || "",
      sheetRows: psh ? Math.max(0, psh.getLastRow() - 1) : 0,
      sheetCols: psh ? psh.getLastColumn() : 0,
      sheetCells: psh ? psh.getLastRow() * psh.getLastColumn() : 0
    };
    if (!purl) { out.error = "no export URL saved for " + which; return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON); }
    try {
      var parsedP = gkParseCsv_(sheetName, gkFetch_(purl));
      var prows = parsedP.rows;
      out.exportRows = prows.length - 1;
      out.header = prows[0];
      // find the column that looks most like a date and summarise its range
      var bestCol = -1, bestHits = 0, ci, ri, hits, canon;
      for (ci = 0; ci < parsedP.W; ci++) {
        hits = 0;
        for (ri = 1; ri < Math.min(prows.length, 60); ri++) if (gkDatePart_(String(prows[ri][ci] || ""))) hits++;
        if (hits > bestHits) { bestHits = hits; bestCol = ci; }
      }
      if (bestCol >= 0) {
        var minD = "", maxD = "", found = false, want = String(p.on || "");
        var wantCanon = want ? gkDatePart_(want) : "";
        for (ri = 1; ri < prows.length; ri++) {
          canon = gkDatePart_(String(prows[ri][bestCol] || ""));
          if (!canon) continue;
          if (!minD || canon < minD) minD = canon;
          if (!maxD || canon > maxD) maxD = canon;
          if (wantCanon && canon === wantCanon) found = true;
        }
        out.dateColumn = prows[0][bestCol];
        out.earliest = minD; out.latest = maxD;
        if (wantCanon) { out.askedFor = wantCanon; out.presentInExport = found; }
      }
    } catch (eP) { out.fetchError = String(eP.message || eP); }
    // Stock-level check: where does a given symbol actually appear?
    if (p.sym) {
      var wantSym = String(p.sym).trim().toUpperCase();
      out.symbol = wantSym;
      try {
        var nts = gkNormalizedTrades_(), hits = 0, lastD = "";
        for (var si = 0; si < nts.length; si++) {
          if (String(nts[si][3]).trim().toUpperCase() !== wantSym) continue;
          hits++;
          if (String(nts[si][0]) > lastD) lastD = String(nts[si][0]);
        }
        out.tradesForSymbol = hits;
        out.lastTradeForSymbol = lastD;
      } catch (eS) { out.symbolTradeError = String(eS.message || eS); }
      // and is it a live position in the holdings the console reads?
      try {
        var hs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Holdings");
        var hcount = 0;
        if (hs && hs.getLastRow() > 1) {
          var hv = hs.getRange(2, 1, hs.getLastRow() - 1, hs.getLastColumn()).getValues();
          for (var hi = 0; hi < hv.length; hi++) {
            for (var hj = 0; hj < hv[hi].length; hj++) {
              if (String(hv[hi][hj]).trim().toUpperCase() === wantSym) { hcount++; break; }
            }
          }
        }
        out.holdingRowsForSymbol = hcount;
      } catch (eH) { out.symbolHoldingError = String(eH.message || eH); }
      // and does the broker's combined-holdings export still carry it?
      try {
        var curl = String(gkProps_().getProperty("GK_COMBINED_URL") || gkProps_().getProperty("GK_HOLDINGS_URL") || "").trim();
        if (curl) {
          var cp = gkParseCsv_("CombinedHoldings", gkFetch_(curl));
          var cHits = 0;
          for (var ci2 = 1; ci2 < cp.rows.length; ci2++) {
            for (var cj2 = 0; cj2 < cp.rows[ci2].length; cj2++) {
              if (String(cp.rows[ci2][cj2]).trim().toUpperCase() === wantSym) { cHits++; break; }
            }
          }
          out.combinedRowsForSymbol = cHits;
        }
      } catch (eC) { out.symbolCombinedError = String(eC.message || eC); }
    }

    // Sheet-side checks run regardless of whether the export can be fetched, because
    // "does the console's feed see this date?" is the question that actually matters.
    if (psh && psh.getLastRow() > 1 && p.on) {
      var wc2 = gkDatePart_(String(p.on)), inSheet2 = 0, rj, cj;
      var sv2 = psh.getRange(2, 1, psh.getLastRow() - 1, psh.getLastColumn()).getValues();
      for (rj = 0; rj < sv2.length; rj++) {
        for (cj = 0; cj < sv2[rj].length; cj++) {
          var cc2 = gkCanon_(sv2[rj][cj]);
          if (cc2 && cc2.slice(0, 10) === wc2) { inSheet2++; break; }
        }
      }
      out.rowsInSheetOnThatDate = inSheet2;
      try {
        var nt2 = gkNormalizedTrades_(), nOn2 = 0;
        for (rj = 0; rj < nt2.length; rj++) if (String(nt2[rj][0]).slice(0, 10) === wc2) nOn2++;
        out.normalisedTotal = nt2.length;
        out.normalisedOnThatDate = nOn2;
      } catch (eN2) { out.normaliseError = String(eN2.message || eN2); }
    }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }

  // Clean rows duplicated by the earlier comparison bug. Token-guarded because it rewrites a tab.
  if (p.dedupe) {
    if (String(p.token || "") !== (PropertiesService.getScriptProperties().getProperty("SECRET") || "820082")) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "bad token" })).setMimeType(ContentService.MimeType.JSON);
    }
    var names = String(p.dedupe) === "1" ? ["Trades", "Ledger"] : String(p.dedupe).split(",");
    var out = [];
    for (var di = 0; di < names.length; di++) {
      try { out.push(gkDedupeSheet_(String(names[di]).trim())); }
      catch (eD) { out.push({ sheet: names[di], error: String(eD.message || eD) }); }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, results: out })).setMimeType(ContentService.MimeType.JSON);
  }

  // Shorten an execute link (used for WhatsApp, where a URL cannot be hidden behind text).
  // Cached in a "ShortLinks" tab so the same order link is only ever shortened once.
  if (p.shorten) {
    var longUrl = String(p.u || "").trim();
    if (!longUrl) return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "no url" })).setMimeType(ContentService.MimeType.JSON);
    var lss = SpreadsheetApp.getActiveSpreadsheet();
    var lsh = lss.getSheetByName("ShortLinks");
    if (!lsh) { lsh = lss.insertSheet("ShortLinks"); lsh.getRange(1, 1, 1, 3).setValues([["long", "short", "at"]]); }
    if (lsh.getLastRow() > 1) {
      var lv = lsh.getRange(2, 1, lsh.getLastRow() - 1, 2).getValues();
      for (var li = 0; li < lv.length; li++) {
        if (String(lv[li][0]) === longUrl && String(lv[li][1])) {
          return ContentService.createTextOutput(JSON.stringify({ ok: true, short: String(lv[li][1]), cached: true })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    var sp = gkProps_();
    var prov = String(sp.getProperty("SHORT_PROVIDER") || "isgd");
    var stok = String(sp.getProperty("SHORT_TOKEN") || "");
    var sbase = String(sp.getProperty("SHORT_BASE") || "");
    var shortUrl = "";
    try {
      if (prov === "off") {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "shortening is switched off" })).setMimeType(ContentService.MimeType.JSON);
      } else if (prov === "bitly") {
        if (!stok) throw new Error("no bitly token");
        var payload = { long_url: longUrl };
        if (sbase) payload.domain = sbase;                 // your own branded Bitly domain, if you have one
        var br = UrlFetchApp.fetch("https://api-ssl.bitly.com/v4/shorten", {
          method: "post", contentType: "application/json",
          headers: { Authorization: "Bearer " + stok },
          payload: JSON.stringify(payload), muteHttpExceptions: true });
        if (br.getResponseCode() < 300) {
          var bj = JSON.parse(br.getContentText() || "{}");
          if (bj.link) shortUrl = String(bj.link);
        }
      } else if (prov === "custom") {
        // Your own redirect service: it should return the short URL as plain text.
        if (!sbase) throw new Error("no custom endpoint");
        var cr = UrlFetchApp.fetch(sbase + (sbase.indexOf("?") >= 0 ? "&" : "?") + "url=" + encodeURIComponent(longUrl), { muteHttpExceptions: true });
        if (cr.getResponseCode() === 200) {
          var ct = String(cr.getContentText() || "").trim();
          if (ct.indexOf("http") === 0) shortUrl = ct;
        }
      } else if (prov === "tinyurl") {
        var tr = UrlFetchApp.fetch("https://tinyurl.com/api-create.php?url=" + encodeURIComponent(longUrl), { muteHttpExceptions: true });
        if (tr.getResponseCode() === 200) {
          var tt = String(tr.getContentText() || "").trim();
          if (tt.indexOf("http") === 0) shortUrl = tt;
        }
      } else {   // default: is.gd — free, no account, no tracking
        var ir = UrlFetchApp.fetch("https://is.gd/create.php?format=simple&url=" + encodeURIComponent(longUrl), { muteHttpExceptions: true });
        if (ir.getResponseCode() === 200) {
          var it = String(ir.getContentText() || "").trim();
          if (it.indexOf("http") === 0) shortUrl = it;
        }
      }
    } catch (eSh) { shortUrl = ""; }
    if (shortUrl && shortUrl.length >= longUrl.length) shortUrl = "";   // no point if it isn't shorter
    if (!shortUrl) return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "shortener unavailable" })).setMimeType(ContentService.MimeType.JSON);
    lsh.appendRow([longUrl, shortUrl, Date.now()]);
    SpreadsheetApp.flush();
    return ContentService.createTextOutput(JSON.stringify({ ok: true, short: shortUrl })).setMimeType(ContentService.MimeType.JSON);
  }

  // Client contact/KYC details (PAN, address, phone, email). Own tab, upsert-only.
  if (p.client_details) {
    var css1 = SpreadsheetApp.getActiveSpreadsheet();
    var csh1 = css1.getSheetByName("ClientDetails");
    if (!csh1 || csh1.getLastRow() < 2) return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: [] })).setMimeType(ContentService.MimeType.JSON);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: csh1.getDataRange().getValues() })).setMimeType(ContentService.MimeType.JSON);
  }

  // Stock baskets by risk category, kept in the "Baskets" tab so they survive a device reset.
  if (p.baskets) {
    var bss = SpreadsheetApp.getActiveSpreadsheet();
    var bsh = bss.getSheetByName("Baskets");
    if (!bsh || bsh.getLastRow() < 2) return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: [] })).setMimeType(ContentService.MimeType.JSON);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: bsh.getDataRange().getValues() })).setMimeType(ContentService.MimeType.JSON);
  }

  // Manually entered trades. Kept in their OWN tab so the GridKey sync can never touch them.
  if (p.manual_trades) {
    var mss = SpreadsheetApp.getActiveSpreadsheet();
    var msh = mss.getSheetByName("ManualTrades");
    if (!msh || msh.getLastRow() < 2) return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: [] })).setMimeType(ContentService.MimeType.JSON);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: msh.getDataRange().getValues() })).setMimeType(ContentService.MimeType.JSON);
  }

  // Enquiry & onboarding pipeline (CRM). One row per prospect in the "Pipeline" tab.
  if (p.pipeline) {
    var pss = SpreadsheetApp.getActiveSpreadsheet();
    var psh = pss.getSheetByName("Pipeline");
    if (!psh || psh.getLastRow() < 2) return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: [] })).setMimeType(ContentService.MimeType.JSON);
    var pv = psh.getDataRange().getValues();
    return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: pv })).setMimeType(ContentService.MimeType.JSON);
  }

  // Advice trace: the running audit log of every advice actually sent (append-only). Returns the
  // most recent rows (header + up to last 2000) so the console can display and export the record.
  if (p.advice_trace) {
    var tss = SpreadsheetApp.getActiveSpreadsheet();
    var tsh = tss.getSheetByName("AdviceTrace");
    if (!tsh || tsh.getLastRow() < 1) return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: [] })).setMimeType(ContentService.MimeType.JSON);
    var tv = tsh.getDataRange().getValues();
    var thead = tv[0], tdata = tv.slice(1);
    if (tdata.length > 2000) tdata = tdata.slice(tdata.length - 2000);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: [thead].concat(tdata) })).setMimeType(ContentService.MimeType.JSON);
  }

  // Advice alerts pushed by the Principal Officer, so staff on any device can send them from
  // the Advice Alerts tab. Stored one row per (batch × client) in the "AdviceAlerts" tab.
  if (p.advice_alerts) {
    var ass = SpreadsheetApp.getActiveSpreadsheet();
    var ash = ass.getSheetByName("AdviceAlerts");
    if (!ash || ash.getLastRow() < 1) return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: [] })).setMimeType(ContentService.MimeType.JSON);
    var avals = ash.getDataRange().getValues();
    return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: avals })).setMimeType(ContentService.MimeType.JSON);
  }

  // Result of the last greeting-email broadcast (so the console can confirm how many went out).
  if (p.greeting_status) {
    var gv = PropertiesService.getScriptProperties().getProperty("GK_LAST_GREETING");
    var gj = {};
    try { gj = gv ? JSON.parse(gv) : {}; } catch (eg) { gj = {}; }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, result: gj.result || "", at: gj.at || 0 })).setMimeType(ContentService.MimeType.JSON);
  }

  // GridKey auto-sync status. NEVER returns the token itself — only whether one is set.
  if (p.gridkey) {
    var gp = PropertiesService.getScriptProperties();
    var st = {
      ok: true,
      tokenSet: !!String(gp.getProperty("GK_TOKEN") || "").trim(),
      tradesUrl: gp.getProperty("GK_TRADES_URL") || "",
      ledgerUrl: gp.getProperty("GK_LEDGER_URL") || "",
      holdingsUrl: gp.getProperty("GK_HOLDINGS_URL") || "",
      lastSync: gp.getProperty("GK_LAST_SYNC") || "",
      lastResult: gp.getProperty("GK_LAST_RESULT") || "",
      tradesRows: gp.getProperty("GK_TRADES_ROWS") || "",
      ledgerRows: gp.getProperty("GK_LEDGER_ROWS") || "",
      triggers: gkTriggerCount_(),
      timezone: Session.getScriptTimeZone()
    };
    return ContentService.createTextOutput(JSON.stringify(st)).setMimeType(ContentService.MimeType.JSON);
  }
  // Return Sheet1 as a {SYMBOL: current price} map for the live portfolio
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet1") || ss.getSheets()[0];
  var out = { ok: true, prices: {}, cash: {}, cashCode: {}, status: {}, statusCode: {}, alerts: [], trades: [], holdings: [], count: 0 };
  var values = sheet.getDataRange().getValues();
  if (values.length) {
    var head = values[0].map(function (x) { return String(x).toLowerCase(); });
    function col(words, dflt) {
      for (var i = 0; i < head.length; i++)
        for (var w = 0; w < words.length; w++)
          if (head[i].indexOf(words[w]) >= 0) return i;
      return dflt;
    }
    var symC = col(["symbol", "scrip", "nse", "ticker", "stock"], 0);
    var prC = col(["current", "cmp", "ltp", "last", "clos", "price", "rate"], 1);
    for (var r = 1; r < values.length; r++) {
      var sym = String(values[r][symC] || "").trim().toUpperCase();
      var pr = parseFloat(String(values[r][prC]).replace(/[^0-9.\-]/g, ""));
      if (sym && !isNaN(pr)) out.prices[sym] = pr;
    }
    out.count = Object.keys(out.prices).length;
  }

  // Enrich prices with CMP from the combined-holdings export, so every currently-held stock
  // has a live price even if it isn't in Sheet1 (this is what removes the ₹0 / -100% rows).
  var cmpMap = gkCombinedPrices_();
  for (var cs in cmpMap) { if (out.prices[cs] == null) out.prices[cs] = cmpMap[cs]; }
  out.count = Object.keys(out.prices).length;

  // Cash balances per client from a tab named "Cash"
  var cashSheet = ss.getSheetByName("Cash");
  if (cashSheet) {
    var cv = cashSheet.getDataRange().getValues();
    if (cv.length) {
      var ch = cv[0].map(function (x) { return String(x).toLowerCase(); });
      function ccol(words, dflt) {
        for (var i = 0; i < ch.length; i++)
          for (var w = 0; w < words.length; w++)
            if (ch[i].indexOf(words[w]) >= 0) return i;
        return dflt;
      }
      var nameC = ccol(["name", "investor", "holder", "client"], 0);
      var amtC = ccol(["cash", "balance", "available", "ledger", "fund", "amount"], 1);
      var codeC = ccol(["code", "ucc", "portfolio"], -1);
      var statC = ccol(["status", "residen", "nre", "nro", "account", "type"], -1);
      var usedFallback = -1;
      if (codeC < 0 && ch.length >= 3) {
        for (var i = 0; i < ch.length; i++) { if (i !== nameC && i !== amtC && i !== statC) { codeC = i; usedFallback = i; break; } }
      }
      if (statC < 0 && ch.length >= 4) {
        for (var j = 0; j < ch.length; j++) { if (j !== nameC && j !== amtC && j !== codeC && j !== usedFallback) { statC = j; break; } }
      }
      for (var k = 1; k < cv.length; k++) {
        var am = parseFloat(String(cv[k][amtC]).replace(/[^0-9.\-]/g, ""));
        var nm = String(cv[k][nameC] || "").trim();
        var cd = codeC >= 0 ? String(cv[k][codeC] || "").trim() : "";
        var st = statC >= 0 ? String(cv[k][statC] || "").trim() : "";
        if (!isNaN(am)) {
          if (nm) out.cash[nm] = am;
          if (cd) out.cashCode[cd] = am;
        }
        if (st) {
          if (nm) out.status[nm] = st;
          if (cd) out.statusCode[cd] = st;
        }
      }
    }
  }

  // Cash from the GridKey LEDGER tab. Column "Broker ledger balance" is the account's
  // available cash; keyed on Portfolio code (each portfolio kept separate, not combined).
  // This overlays anything from the Cash tab so the ledger is the source of truth for cash.
  var ledgerSheet = ss.getSheetByName("Ledger");
  if (ledgerSheet) {
    var lv = ledgerSheet.getDataRange().getValues();
    if (lv.length > 1) {
      var lh = lv[0].map(function (x) { return String(x).toLowerCase().replace(/[^a-z0-9]/g, ""); });
      function lcol() {
        for (var a = 0; a < arguments.length; a++) {
          var idx = lh.indexOf(arguments[a]);
          if (idx >= 0) return idx;
        }
        return -1;
      }
      var lPCode = lcol("portfoliocode");
      var lCCode = lcol("clientcode");
      var lName = lcol("clientname", "portfolioname");
      // Prefer the broker ledger balance; fall back to available/ledger balance if absent.
      var lBal = lcol("brokerledgerbalance");
      if (lBal < 0) lBal = lcol("availableledgerbalance", "ledgerbalance", "balance");
      for (var li = 1; li < lv.length; li++) {
        var lrow = lv[li];
        if (lBal < 0) break;
        var amt = parseFloat(String(lrow[lBal]).replace(/[^0-9.\-]/g, ""));
        if (isNaN(amt)) continue;
        var pcode = lPCode >= 0 ? String(lrow[lPCode] || "").trim() : "";
        var lnm = lName >= 0 ? String(lrow[lName] || "").trim() : "";
        // Key cash on Portfolio code to match how Holdings accounts are keyed.
        if (pcode) out.cashCode[pcode] = amt;
        else if (lCCode >= 0 && String(lrow[lCCode] || "").trim()) out.cashCode[String(lrow[lCCode]).trim()] = amt;
        if (lnm) out.cash[lnm] = amt;
      }
    }
  }

  // Buy/Sell alerts from a tab named "Alerts" — returned as a list of objects
  var alertSheet = ss.getSheetByName("Alerts") || ss.getSheetByName("Advice");
  if (alertSheet) {
    var av = alertSheet.getDataRange().getValues();
    if (av.length > 1) {
      var keys = av[0].map(function (x) {
        return String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
      });
      for (var a = 1; a < av.length; a++) {
        var rowVals = av[a];
        var blank = true, obj = {};
        for (var c = 0; c < keys.length; c++) {
          if (!keys[c]) continue;
          var v = rowVals[c];
          obj[keys[c]] = v;
          if (String(v).trim() !== "") blank = false;
        }
        if (!blank) out.alerts.push(obj);
      }
    }
  }

  // Trades from a tab named "Trades" — always returned as compact arrays
  // [Date, Client code, Client name, Symbol, Action, Quantity, Price, Amount].
  // The tab may hold EITHER the app's own 8-column backup format, OR a raw broker/GridKey
  // export (29 columns: Portfolio code, Nse code, Bill amount, ...). We detect which and
  // normalise here so the payload stays small and the app doesn't care which one it is.
  var tradeSheet = ss.getSheetByName("Trades");
  if (tradeSheet) {
    var allTrades = gkNormalizedTrades_();
    // The full book is ~100k trades, which is far too large to ship in one response — the
    // request stalls and the console ends up showing stale data. Allow the caller to narrow
    // it: ?code= (one client), ?sym= (one stock), ?since=YYYY-MM-DD, ?limit=.
    var fCode = String(p.code || "").trim();
    var fSym = String(p.sym || "").trim().toUpperCase();
    var fSince = String(p.since || "").trim();
    var lim = parseInt(p.limit || "0", 10);
    if (fCode || fSym || fSince) {
      var picked = [];
      for (var ti = 0; ti < allTrades.length; ti++) {
        var tr = allTrades[ti];
        if (fCode && String(tr[1]).trim() !== fCode) continue;
        if (fSym && String(tr[3]).trim().toUpperCase() !== fSym) continue;
        if (fSince && String(tr[0]) < fSince) continue;
        picked.push(tr);
      }
      allTrades = picked;
    }
    out.tradesTotal = allTrades.length;
    if (lim > 0 && allTrades.length > lim) allTrades = allTrades.slice(allTrades.length - lim);
    out.trades = allTrades;
  }

  // Holdings (team sync): the client/holdings backup table, returned as row arrays (header skipped)
  var holdSheet = ss.getSheetByName("Holdings");
  if (holdSheet) {
    var hv = holdSheet.getDataRange().getValues();
    var htz = Session.getScriptTimeZone();
    for (var hi = 1; hi < hv.length; hi++) {
      var hrow = hv[hi], hblank = true;
      for (var hc = 0; hc < hrow.length; hc++) { if (String(hrow[hc]).trim() !== "") { hblank = false; break; } }
      if (hblank) continue;
      var hout = [];
      for (var hc2 = 0; hc2 < hrow.length; hc2++) {
        var hval = hrow[hc2];
        if (Object.prototype.toString.call(hval) === "[object Date]") { hval = Utilities.formatDate(hval, htz, "yyyy-MM-dd HH:mm"); }
        hout.push(hval);
      }
      out.holdings.push(hout);
    }
  }

  // Staff list (for team sign-in from a fresh device). We store it as a JSON string
  // in PropertiesService; the app updates it on every backup so this reflects the
  // Principal Officer's latest Enable/Disable choices.
  try {
    var staffJson = PropertiesService.getScriptProperties().getProperty("staff");
    if (staffJson) { out.staff = JSON.parse(staffJson); }
  } catch (e) { /* never block the pull on a bad properties value */ }

  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var SECRET = PropertiesService.getScriptProperties().getProperty("SECRET") || "820082"; // matches the Secret in the console; set a "SECRET" script property to override

  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return ContentService.createTextOutput("error: bad JSON");
  }
  if (String(body.token) !== SECRET) {
    return ContentService.createTextOutput("error: token mismatch");
  }

  // Staff list: whenever the app sends one along with a backup, publish it so a fresh
  // device can read who is enabled at the login screen (before any local data exists).
  if (Array.isArray(body.staff)) {
    try { PropertiesService.getScriptProperties().setProperty("staff", JSON.stringify(body.staff)); } catch (e) { /* ignore */ }
  }

  // --- GridKey auto-sync: save the token / URLs (token is stored server-side only) ---
  if (body.type === "gridkey_config") {
    var gp2 = PropertiesService.getScriptProperties();
    // Only overwrite the token when a new one is actually supplied, so you can edit the
    // URLs without having to retype the token every time.
    if (typeof body.gkToken === "string" && body.gkToken.trim()) gp2.setProperty("GK_TOKEN", body.gkToken.trim());
    if (typeof body.gkTradesUrl === "string") gp2.setProperty("GK_TRADES_URL", body.gkTradesUrl.trim());
    if (typeof body.gkLedgerUrl === "string") gp2.setProperty("GK_LEDGER_URL", body.gkLedgerUrl.trim());
    if (typeof body.gkHoldingsUrl === "string") gp2.setProperty("GK_HOLDINGS_URL", body.gkHoldingsUrl.trim());
    if (body.clearToken === true) gp2.deleteProperty("GK_TOKEN");
    return ContentService.createTextOutput("ok: gridkey config saved");
  }

  // --- GridKey auto-sync: run the fetch right now (same code the 6am/6pm triggers use) ---
  if (body.type === "gridkey_run") {
    var r = runGridkeySync(true);
    return ContentService.createTextOutput("ok: " + r);
  }

  // --- Short-link provider settings. Stored on Google's server, never in the browser. ---
  if (body.type === "shortener_config") {
    var spx = gkProps_();
    if (body.provider) spx.setProperty("SHORT_PROVIDER", String(body.provider));
    if (body.shortToken != null && String(body.shortToken).trim()) spx.setProperty("SHORT_TOKEN", String(body.shortToken).trim());
    if (body.base != null) spx.setProperty("SHORT_BASE", String(body.base).trim());
    return ContentService.createTextOutput("ok: shortener set to " + String(body.provider || spx.getProperty("SHORT_PROVIDER") || "isgd"));
  }

  // --- Client details (PAN / address / contact). Upsert by client code; a row is only ever
  //     replaced by a newer version of itself, never cleared by a reload or a fresh device. ---
  if (body.type === "client_details") {
    var cdHdr = ["code", "pan", "address", "phone", "email", "notes", "updatedAt"];
    var cds = SpreadsheetApp.getActiveSpreadsheet();
    var cdsh = cds.getSheetByName("ClientDetails");
    if (!cdsh) { cdsh = cds.insertSheet("ClientDetails"); cdsh.getRange(1, 1, 1, cdHdr.length).setValues([cdHdr]); }
    if (cdsh.getLastRow() < 1) cdsh.getRange(1, 1, 1, cdHdr.length).setValues([cdHdr]);
    var cdAll = cdsh.getLastRow() > 1 ? cdsh.getRange(2, 1, cdsh.getLastRow() - 1, cdHdr.length).getValues() : [];
    var cdIn = Array.isArray(body.rows) ? body.rows : (body.row ? [body.row] : []);
    var cdA = 0, cdU = 0;
    for (var ci = 0; ci < cdIn.length; ci++) {
      var cr = cdIn[ci] || {};
      var ccode = String(cr.code || "").trim();
      if (!ccode) continue;
      var crow = [ccode, String(cr.pan || "").toUpperCase(), String(cr.address || ""), String(cr.phone || ""),
        String(cr.email || ""), String(cr.notes || ""), Date.now()];
      var chit = -1;
      for (var cj = 0; cj < cdAll.length; cj++) if (String(cdAll[cj][0]).trim() === ccode) { chit = cj; break; }
      if (chit >= 0) { cdsh.getRange(chit + 2, 1, 1, cdHdr.length).setValues([crow]); cdAll[chit] = crow; cdU++; }
      else { cdsh.appendRow(crow); cdAll.push(crow); cdA++; }
    }
    SpreadsheetApp.flush();
    return ContentService.createTextOutput("ok: client details +" + cdA + " ~" + cdU);
  }

  // --- Stock baskets. Append/update only: a basket row is removed solely when you delete it
  //     here, never by a reload, a fresh device or an empty local copy. ---
  if (body.type === "baskets") {
    var bHdr = ["category", "symbol", "rationale", "suitability", "smallcase", "report", "updatedAt"];
    var bss2 = SpreadsheetApp.getActiveSpreadsheet();
    var bsh2 = bss2.getSheetByName("Baskets");
    if (!bsh2) { bsh2 = bss2.insertSheet("Baskets"); bsh2.getRange(1, 1, 1, bHdr.length).setValues([bHdr]); }
    if (bsh2.getLastRow() < 1) bsh2.getRange(1, 1, 1, bHdr.length).setValues([bHdr]);
    var bAll = bsh2.getLastRow() > 1 ? bsh2.getRange(2, 1, bsh2.getLastRow() - 1, bHdr.length).getValues() : [];
    var bKey = function (c, sym) { return String(c).trim().toLowerCase() + "\u0001" + String(sym).trim().toUpperCase(); };

    if (body.action === "delete") {
      var dk = bKey(body.category, body.symbol);
      for (var bd = 0; bd < bAll.length; bd++) {
        if (bKey(bAll[bd][0], bAll[bd][1]) === dk) { bsh2.deleteRow(bd + 2); SpreadsheetApp.flush(); return ContentService.createTextOutput("ok: basket row deleted"); }
      }
      return ContentService.createTextOutput("ok: basket row not found");
    }

    // Default: upsert a list of rows. Anything already in the sheet and not in this payload is LEFT ALONE.
    var bIn = Array.isArray(body.rows) ? body.rows : [];
    var bAdded = 0, bUpd = 0;
    for (var bi = 0; bi < bIn.length; bi++) {
      var br = bIn[bi] || {};
      if (!br.symbol || !br.category) continue;
      var row = [String(br.category), String(br.symbol).toUpperCase(), String(br.rationale || ""),
        String(br.suitability || ""), String(br.smallcase || ""), String(br.report || ""), Date.now()];
      var hit = -1, k = bKey(br.category, br.symbol);
      for (var bj = 0; bj < bAll.length; bj++) if (bKey(bAll[bj][0], bAll[bj][1]) === k) { hit = bj; break; }
      if (hit >= 0) { bsh2.getRange(hit + 2, 1, 1, bHdr.length).setValues([row]); bAll[hit] = row; bUpd++; }
      else { bsh2.appendRow(row); bAll.push(row); bAdded++; }
    }
    SpreadsheetApp.flush();
    return ContentService.createTextOutput("ok: baskets +" + bAdded + " ~" + bUpd);
  }

  // --- Manually entered trades. Own tab, append-only; removed only on an explicit delete. ---
  if (body.type === "manual_trade") {
    var mHdr = ["id", "Date", "Code", "Name", "Symbol", "Action", "Quantity", "Price", "Amount", "Note", "EnteredBy", "EnteredAt"];
    var mss2 = SpreadsheetApp.getActiveSpreadsheet();
    var msh2 = mss2.getSheetByName("ManualTrades");
    if (!msh2) { msh2 = mss2.insertSheet("ManualTrades"); msh2.getRange(1, 1, 1, mHdr.length).setValues([mHdr]); }
    if (msh2.getLastRow() < 1) msh2.getRange(1, 1, 1, mHdr.length).setValues([mHdr]);
    var mAll = msh2.getLastRow() > 1 ? msh2.getRange(2, 1, msh2.getLastRow() - 1, mHdr.length).getValues() : [];

    if (body.action === "delete") {
      var mid = String(body.id || "");
      for (var mi = 0; mi < mAll.length; mi++) {
        if (String(mAll[mi][0]) === mid) { msh2.deleteRow(mi + 2); SpreadsheetApp.flush(); return ContentService.createTextOutput("ok: manual trade deleted"); }
      }
      return ContentService.createTextOutput("ok: manual trade not found");
    }

    var t = body.trade || {};
    if (!t.id) return ContentService.createTextOutput("error: manual trade needs an id");
    for (var mk = 0; mk < mAll.length; mk++) if (String(mAll[mk][0]) === String(t.id)) return ContentService.createTextOutput("ok: manual trade already recorded");
    msh2.appendRow([t.id, t.date || "", t.code || "", t.name || "", String(t.symbol || "").toUpperCase(),
      String(t.action || "").toUpperCase(), Number(t.quantity) || 0, Number(t.price) || 0,
      Number(t.amount) || (Number(t.quantity) || 0) * (Number(t.price) || 0), t.note || "", t.by || "", Date.now()]);
    SpreadsheetApp.flush();
    return ContentService.createTextOutput("ok: manual trade added");
  }

  // --- Enquiry & onboarding pipeline (CRM). action = upsert | delete | replaceAll. ---
  if (body.type === "pipeline") {
    var pHdr = ["id", "name", "phone", "email", "source", "enquiryDate", "corpus", "basket", "assignee", "priority",
      "stage", "nextFollowUp", "pan", "ckyc", "notes", "signedDate", "kycDocs", "check", "log", "updatedAt",
      "service", "meetingLink", "meetingTime"];
    var pss2 = SpreadsheetApp.getActiveSpreadsheet();
    var psh2 = pss2.getSheetByName("Pipeline");
    if (!psh2) { psh2 = pss2.insertSheet("Pipeline"); psh2.getRange(1, 1, 1, pHdr.length).setValues([pHdr]); }
    if (psh2.getLastRow() < 1) psh2.getRange(1, 1, 1, pHdr.length).setValues([pHdr]);

    function pRowOf(rec) {
      var row = [];
      for (var k = 0; k < pHdr.length; k++) {
        var key = pHdr[k], v = rec[key];
        if (key === "kycDocs" || key === "check" || key === "log") v = JSON.stringify(v || (key === "log" ? [] : {}));
        row.push(v == null ? "" : v);
      }
      return row;
    }
    var pAll = psh2.getLastRow() > 1 ? psh2.getRange(2, 1, psh2.getLastRow() - 1, pHdr.length).getValues() : [];

    if (body.action === "replaceAll") {
      var inRecs = Array.isArray(body.data) ? body.data : [];
      // Safety valve: never let an empty/near-empty device wipe a populated sheet.
      if (!body.force && pAll.length >= 3 && inRecs.length < pAll.length / 2) {
        return ContentService.createTextOutput("error: refusing to replace " + pAll.length + " pipeline record(s) with " + inRecs.length + " (send force:true to override)");
      }
      if (psh2.getLastRow() > 1) psh2.getRange(2, 1, psh2.getLastRow() - 1, pHdr.length).clearContent();
      if (inRecs.length) {
        var outRows = [];
        for (var ri = 0; ri < inRecs.length; ri++) outRows.push(pRowOf(inRecs[ri]));
        psh2.getRange(2, 1, outRows.length, pHdr.length).setValues(outRows);
      }
      SpreadsheetApp.flush();
      return ContentService.createTextOutput("ok: pipeline replaced " + inRecs.length);
    }

    if (body.action === "delete") {
      var delId = String(body.id || "");
      for (var di = 0; di < pAll.length; di++) {
        if (String(pAll[di][0]) === delId) { psh2.deleteRow(di + 2); SpreadsheetApp.flush(); return ContentService.createTextOutput("ok: pipeline deleted"); }
      }
      return ContentService.createTextOutput("ok: pipeline id not found");
    }

    // default: upsert one record (match on id, else append)
    var rec = body.record || {};
    if (!rec.id) return ContentService.createTextOutput("error: pipeline record needs an id");
    var newRow = pRowOf(rec);
    for (var ui = 0; ui < pAll.length; ui++) {
      if (String(pAll[ui][0]) === String(rec.id)) {
        psh2.getRange(ui + 2, 1, 1, pHdr.length).setValues([newRow]);
        SpreadsheetApp.flush();
        return ContentService.createTextOutput("ok: pipeline updated");
      }
    }
    psh2.getRange(psh2.getLastRow() + 1, 1, 1, pHdr.length).setValues([newRow]);
    SpreadsheetApp.flush();
    return ContentService.createTextOutput("ok: pipeline added");
  }

  // --- Advice trace: append one row per advice actually sent (email/WhatsApp). Append-only audit
  //     log kept in the "AdviceTrace" tab. Never cleared by the console. ---
  if (body.type === "advice_trace") {
    var trIn = Array.isArray(body.rows) ? body.rows : [];
    var tss3 = SpreadsheetApp.getActiveSpreadsheet();
    var thdr = ["At", "SentBy", "Channel", "BatchId", "Title", "Side", "Stock", "Code", "Name", "Amount", "Qty", "Model", "Subject"];
    var tsh3 = tss3.getSheetByName("AdviceTrace");
    if (!tsh3) { tsh3 = tss3.insertSheet("AdviceTrace"); tsh3.getRange(1, 1, 1, thdr.length).setValues([thdr]); }
    var tout = [];
    for (var tri = 0; tri < trIn.length; tri++) {
      var te = trIn[tri] || {};
      tout.push([te.at || Date.now(), te.by || "", te.channel || "", te.batchId || "", te.title || "", te.side || "", te.stock || "",
        te.code || "", te.name || "", te.amount == null ? "" : te.amount, te.qty == null ? "" : te.qty, te.model || "", te.subject || ""]);
    }
    if (tout.length) tsh3.getRange(tsh3.getLastRow() + 1, 1, tout.length, thdr.length).setValues(tout);
    SpreadsheetApp.flush();
    return ContentService.createTextOutput("ok: trace " + tout.length);
  }

  // --- Advice alerts: the Principal Officer pushes generated advice batches so staff on any
  //     device see them in the Advice Alerts tab and can send them to customers. Replace-all. ---
  if (body.type === "advice_alerts") {
    var alerts2 = Array.isArray(body.alerts) ? body.alerts : [];
    var ass2 = SpreadsheetApp.getActiveSpreadsheet();
    var ash2 = ass2.getSheetByName("AdviceAlerts") || ass2.insertSheet("AdviceAlerts");
    ash2.clearContents();
    var ahdr = ["BatchId", "At", "By", "Title", "Model", "Side", "Stock", "Code", "Name", "Email", "WhatsApp", "Amount", "Qty", "Subject", "Body", "WaBody"];
    var arows = [ahdr];
    for (var ai = 0; ai < alerts2.length; ai++) {
      var ab = alerts2[ai] || {};
      var adisp = ab.dispatch || [];
      for (var aj = 0; aj < adisp.length; aj++) {
        var ad = adisp[aj] || {};
        arows.push([ab.id || "", ab.at || "", ab.by || "", ab.title || "", ab.model || "", ab.side || "", ab.stock || "",
          ad.code || "", ad.name || "", ad.email || "", ad.whatsapp || "", ad.amount == null ? "" : ad.amount, ad.qty == null ? "" : ad.qty, ad.subject || "", ad.body || "", ad.waBody || ""]);
      }
    }
    ash2.getRange(1, 1, arows.length, ahdr.length).setValues(arows);
    SpreadsheetApp.flush();
    return ContentService.createTextOutput("ok: advice alerts " + (arows.length - 1));
  }

  // --- Broadcast email: image and/or message to all clients. If the subject or body contains
  //     {name}, each client gets an individual, personalised email; otherwise one BCC email. ---
  if (body.type === "greeting_email") {
    var gres;
    try {
      // Recipients may be plain emails (["a@x.com", ...]) or objects ([{email, name}, ...]).
      var seen = {}, recips = [];
      var inList = body.recipients || [];
      for (var gi = 0; gi < inList.length; gi++) {
        var it = inList[gi], em = "", nm = "", bd = "", sj = "";
        if (it && typeof it === "object") {
          em = String(it.email || "").trim().toLowerCase(); nm = String(it.name || "").trim();
          bd = it.body ? String(it.body) : ""; sj = it.subject ? String(it.subject) : "";
        } else { em = String(it || "").trim().toLowerCase(); }
        if (em && em.indexOf("@") > 0 && !seen[em]) { seen[em] = true; recips.push({ email: em, name: nm, body: bd, subject: sj }); }
      }
      if (!recips.length) {
        gres = "error: no client email addresses to send to";
      } else {
        var subjectT = String(body.subject || "A message from Vasupradah Investment Advisory");
        var textT = String(body.bodyText || "");
        var fromName = String(body.fromName || "Vasupradah Investment Advisory");
        var personalize = !!body.personalize || subjectT.indexOf("{name}") >= 0 || textT.indexOf("{name}") >= 0;

        // Build the inline image blob once (reused for every send).
        var inlineImages = null;
        var img = String(body.image || "");
        var ci = img.indexOf("base64,");
        if (ci >= 0) {
          var b64 = img.substring(ci + 7);
          var mime = "image/jpeg";
          var semi = img.indexOf(";");
          if (img.indexOf("data:") === 0 && semi > 5) mime = img.substring(5, semi);
          inlineImages = { greeting: Utilities.newBlob(Utilities.base64Decode(b64), mime, "greeting") };
        }

        var nameFor = function (n) { return (n && n.length) ? n : "Investor"; };
        var subName = function (s, n) { return s.split("{name}").join(nameFor(n)); };
        // Turn plain text into simple HTML: newlines -> <br>, and leading "* " bullets -> "• ".
        var htmlOf = function (t) {
          var lines = t.split(String.fromCharCode(10)), out = [];
          for (var li = 0; li < lines.length; li++) {
            var ln = lines[li], i = 0;
            while (i < ln.length && (ln.charCodeAt(i) === 32 || ln.charCodeAt(i) === 9)) i++;
            var rest = ln.substring(i);
            if (rest.charAt(0) === "*" && rest.charAt(1) === " ") ln = ln.substring(0, i) + "• " + rest.substring(2);
            out.push(ln);
          }
          return out.join("<br>");
        };
        var SP = String.fromCharCode(32), NL = String.fromCharCode(10), CR = String.fromCharCode(13), LT = String.fromCharCode(60);
        var execAnchor = function (esc) {
          var marker = "Click Here To Execute the Order: ";
          var out = "", i = 0;
          while (true) {
            var pIdx = esc.indexOf(marker, i);
            if (pIdx < 0) { out += esc.slice(i); break; }
            out += esc.slice(i, pIdx);
            var j = pIdx + marker.length, k = j;
            while (k < esc.length) {
              var ch = esc.charAt(k);
              if (ch === SP || ch === NL || ch === CR || ch === LT) break;
              k++;
            }
            var url = esc.slice(j, k);
            out += '<a href="' + url + '" style="display:inline-block;background:#2E3192;color:#ffffff;'
              + 'text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:bold">Click Here To Execute the Order</a>';
            i = k;
          }
          return out;
        };
        var bodyHtml = function (t) {
          var h = '<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:14px;line-height:1.5">';
          // The client sees the wording as a button; the URL itself is never shown.
          h += '<p>' + execAnchor(htmlOf(t)) + '</p>';
          if (inlineImages) h += '<img src="cid:greeting" alt="image" style="max-width:100%;height:auto;border-radius:8px"/>';
          return h + '</div>';
        };

        var quota = MailApp.getRemainingDailyQuota();
        var toAddr = "";
        try { toAddr = Session.getEffectiveUser().getEmail(); } catch (e2) { toAddr = ""; }

        if (personalize) {
          // One individual email per client. Each recipient may carry its own {body}/{subject}
          // (used by advice orders, where the rupee amount differs per client); otherwise the
          // shared subject/body is used, with {name} filled in.
          var sent = 0, skipped = 0;
          for (var pi = 0; pi < recips.length; pi++) {
            if (sent >= quota) { skipped = recips.length - sent; break; }
            var rc = recips[pi];
            var rcText = rc.body ? String(rc.body) : textT;
            var rcSubj = rc.subject ? String(rc.subject) : subjectT;
            var opts = { name: fromName, htmlBody: bodyHtml(subName(rcText, rc.name)) };
            if (inlineImages) opts.inlineImages = inlineImages;
            try { MailApp.sendEmail(rc.email, subName(rcSubj, rc.name), subName(rcText, rc.name), opts); sent++; }
            catch (eSend) { /* skip a bad address, keep going */ }
          }
          if (sent === 0) gres = "error: Gmail's daily send limit is already used up. Try again tomorrow, or broadcast on WhatsApp.";
          else gres = "OK — personalised email sent to " + sent + " client(s)"
            + (skipped > 0 ? " (" + skipped + " not sent today — Gmail daily limit; send the rest tomorrow)" : "");
        } else {
          // One BCC email, identical to everyone.
          var list = [];
          for (var bi = 0; bi < recips.length; bi++) list.push(recips[bi].email);
          var sendList = list, extra = "";
          if (list.length > quota) { sendList = list.slice(0, quota); extra = " (" + (list.length - quota) + " not sent today — Gmail daily limit; send the rest tomorrow or broadcast on WhatsApp)"; }
          if (!sendList.length) {
            gres = "error: Gmail's daily send limit is already used up. Try again tomorrow, or broadcast on WhatsApp.";
          } else {
            var opts2 = { bcc: sendList.join(","), name: fromName, htmlBody: bodyHtml(textT) };
            if (inlineImages) opts2.inlineImages = inlineImages;
            if (!toAddr) toAddr = sendList[0];
            MailApp.sendEmail(toAddr, subjectT, textT, opts2);
            gres = "OK — emailed to " + sendList.length + " client(s)" + extra;
          }
        }
      }
    } catch (err) {
      gres = "error: " + (err && err.message ? err.message : err);
    }
    try { PropertiesService.getScriptProperties().setProperty("GK_LAST_GREETING", JSON.stringify({ result: gres, at: Date.now() })); } catch (e3) { /* ignore */ }
    return ContentService.createTextOutput(gres);
  }

  // --- Trades writer: body.type === "trades", body.rows = [[Date,Code,Name,Symbol,Action,Qty,Price,Amount], ...]
  if (body.type === "trades") {
    var tHeader = ["Date", "Client code", "Client name", "Symbol", "Action", "Quantity", "Price", "Amount"];
    var TW = tHeader.length;
    var tRows = Array.isArray(body.rows) ? body.rows : [];
    var tClean = tRows.map(function (r) { r = Array.isArray(r) ? r.slice(0, TW) : []; while (r.length < TW) r.push(""); return r; });
    var tss = SpreadsheetApp.getActiveSpreadsheet();
    var tsheet = tss.getSheetByName("Trades") || tss.insertSheet("Trades");
    if (body.reset) { tsheet.clearContents(); tsheet.getRange(1, 1, 1, TW).setValues([tHeader]); }
    if (tsheet.getLastRow() === 0) tsheet.getRange(1, 1, 1, TW).setValues([tHeader]);
    if (tClean.length) tsheet.getRange(tsheet.getLastRow() + 1, 1, tClean.length, TW).setValues(tClean);
    SpreadsheetApp.flush();
    return ContentService.createTextOutput("ok: trades appended " + tClean.length);
  }

  // --- Holdings backup (default POST): body.rows = full holdings table ---
  var header = ["Client code","Name","Email","WhatsApp","Risk category","Stock","Quantity",
    "Purchase price","Current price","Invested","Current value",
    "P/L amount","P/L %","Invested set","Backed up at"];
  var W = header.length;

  // force every row to exactly W columns so setValues can never fail on width
  var rows = Array.isArray(body.rows) ? body.rows : [];
  var clean = rows.map(function (r) {
    r = Array.isArray(r) ? r.slice(0, W) : [];
    while (r.length < W) r.push("");
    return r;
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Holdings") || ss.insertSheet("Holdings");
  sheet.clearContents();

  var all = [header].concat(clean);
  sheet.getRange(1, 1, all.length, W).setValues(all);
  SpreadsheetApp.flush();

  return ContentService.createTextOutput("ok: wrote " + clean.length + " data rows");
}

/* ==================================================================
 *  GRIDKEY AUTO-SYNC  (trades + ledger, twice daily)
 *
 *  The API token is stored in Script Properties — NOT in the sheet and
 *  NOT in the browser app. Set it from the console:
 *      Settings -> GridKey auto-sync -> paste token -> Save.
 *  Or here:  Project Settings -> Script properties -> GK_TOKEN.
 *
 *  To turn on the 6am / 6pm schedule, run setupGridkeyTriggers() ONCE
 *  from the Apps Script editor (pick it from the function dropdown and
 *  press Run). Authorise it when Google asks.
 * ================================================================== */

var GK_TRADES_SHEET = "Trades";
var GK_LEDGER_SHEET = "Ledger";
var GK_HOLDINGS_SHEET = "CombinedHoldings";

function gkProps_() { return PropertiesService.getScriptProperties(); }

// Pull a clean URL out of whatever was pasted — a plain URL, or a full cURL command
// (e.g. "curl 'https://...' -H '...'"). Prevents the common 'pasted the whole cURL' mistake.
function gkExtractUrl_(v) {
  var s = String(v || "").trim();
  if (!s) return s;
  var m = s.match(/https?:\/\/[^\s'"]+/);
  return m ? m[0] : s;
}

function gkFetch_(url) {
  var props = gkProps_();
  var token = String(props.getProperty("GK_TOKEN") || "").trim();
  if (!token) throw new Error("No GridKey token set. Add it in the console (Settings -> GridKey auto-sync).");
  url = gkExtractUrl_(url);
  if (!url || url.indexOf("http") !== 0) throw new Error("No valid URL configured for this feed (paste only the https://… address, not the whole cURL).");
  var opts = {
    method: "get", muteHttpExceptions: true, followRedirects: true,
    headers: {
      "accept": "application/json, text/plain, */*",
      "authorization": "Token " + token,
      "origin": "https://gridkey.in",
      "referer": "https://gridkey.in/",
      "x-gridkey-user-role": "advisor"
    }
  };
  // Retry a couple of times on transient errors (rate-limit / gateway), with a short backoff.
  var res, code, attempt = 0;
  while (true) {
    res = UrlFetchApp.fetch(url, opts);
    code = res.getResponseCode();
    if (code === 200) return res.getContentText();
    if (code === 401 || code === 403) throw new Error("GridKey rejected the token (HTTP " + code + "). Update the token in the console.");
    var transient = (code === 429 || code === 500 || code === 502 || code === 503 || code === 504);
    if (!transient || attempt >= 2) throw new Error("GridKey returned HTTP " + code + ": " + String(res.getContentText()).slice(0, 160));
    attempt++;
    Utilities.sleep(2000 * attempt);
  }
}

// Parse a GridKey CSV payload into padded rows (shared by the merge and replace writers).
function gkParseCsv_(sheetName, csvText) {
  var body = String(csvText || "").replace(/^\uFEFF/, "").trim();
  if (!body) throw new Error("Empty response from GridKey for " + sheetName + ".");
  if (body.charAt(0) === "{" || body.charAt(0) === "[") {
    var j;
    try { j = JSON.parse(body); } catch (e) { j = null; }
    if (j) {
      if (typeof j === "string") body = j;
      else if (j.data && typeof j.data === "string") body = j.data;
      else if (j.csv && typeof j.csv === "string") body = j.csv;
      else if (j.url) { body = gkFetch_(j.url); }
      else throw new Error("Unexpected JSON from GridKey for " + sheetName + " (no csv/data/url field).");
    }
  }
  var rows = Utilities.parseCsv(body);
  if (!rows || rows.length < 2) throw new Error("Parsed 0 data rows for " + sheetName + " — check the URL/filters.");
  var W = 0;
  for (var i = 0; i < rows.length; i++) W = Math.max(W, rows[i].length);
  for (var r = 0; r < rows.length; r++) { while (rows[r].length < W) rows[r].push(""); }
  return { rows: rows, W: W };
}

// Values must be compared in a canonical form, because Sheets silently converts what we write:
// the text 2026-07-14 comes back as a Date, and 9450 as a number. Comparing the raw values made
// every row look new, so each sync re-appended the whole export. Written without regular
// expressions, since this file lives inside a template literal where escapes do not survive.
function gkNumStr_(n) {
  if (!isFinite(n)) return "";
  var s = String(n);
  if (s.indexOf("e") >= 0 || s.indexOf("E") >= 0) s = n.toFixed(6);
  return s;
}
function gkDatePart_(s) {
  var sep = "";
  if (s.indexOf("-") >= 0) sep = "-"; else if (s.indexOf("/") >= 0) sep = "/"; else return "";
  var head = s.split(" ")[0];
  var bits = head.split(sep);
  if (bits.length !== 3) return "";
  var a = bits[0], b = bits[1], c = bits[2], i, ch;
  for (i = 0; i < head.length; i++) { ch = head.charAt(i); if (ch !== sep && (ch < "0" || ch > "9")) return ""; }
  var y, m, d;
  if (a.length === 4) { y = a; m = b; d = c; }
  else if (c.length === 4) { y = c; m = b; d = a; }
  else return "";
  if (m.length < 2) m = "0" + m;
  if (d.length < 2) d = "0" + d;
  return y + "-" + m + "-" + d;
}
function gkCanon_(v) {
  if (v == null) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    var tz = Session.getScriptTimeZone();
    var withTime = v.getHours() || v.getMinutes() || v.getSeconds();
    return Utilities.formatDate(v, tz, withTime ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd");
  }
  if (typeof v === "number") return gkNumStr_(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  var s = String(v);
  var t = "", k;
  for (k = 0; k < s.length; k++) { var c0 = s.charAt(k); if (c0 !== " " && c0 !== String.fromCharCode(9)) break; }
  t = s.slice(k);
  while (t.length && (t.charAt(t.length - 1) === " " || t.charAt(t.length - 1) === String.fromCharCode(9))) t = t.slice(0, -1);
  if (!t) return "";
  // number written as text, possibly with thousands separators or a currency prefix
  var cleaned = "", digits = 0, dots = 0, okNum = true, i, ch;
  for (i = 0; i < t.length; i++) {
    ch = t.charAt(i);
    if (ch >= "0" && ch <= "9") { digits++; cleaned += ch; }
    else if (ch === ".") { dots++; cleaned += ch; }
    else if (ch === "-" && i === 0) { cleaned += ch; }
    else if (ch === "," || ch === " ") { /* separator */ }
    else if (i === 0 && (ch === String.fromCharCode(8377) || ch === "$")) { /* currency */ }
    else { okNum = false; break; }
  }
  if (okNum && digits > 0 && dots <= 1) {
    var n = Number(cleaned);
    if (!isNaN(n)) return gkNumStr_(n);
  }
  var dp = gkDatePart_(t);
  if (dp) {
    var rest = t.split(" ")[1];
    return rest ? dp + " " + rest.slice(0, 5) : dp;
  }
  return t.toLowerCase();
}
// One comparable signature per row, so a row already in the sheet is never added twice.
function gkRowSig_(row) {
  var SEP = String.fromCharCode(1), parts = [], i;
  for (i = 0; i < row.length; i++) parts.push(gkCanon_(row[i]));
  while (parts.length && parts[parts.length - 1] === "") parts.pop();   // ignore trailing blanks
  return parts.join(SEP);
}

// Remove rows already duplicated by the old comparison. Keeps the FIRST copy of each row.
function gkDedupeSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 3) return { sheet: name, before: sh ? Math.max(0, sh.getLastRow() - 1) : 0, after: sh ? Math.max(0, sh.getLastRow() - 1) : 0, removed: 0 };
  var w = sh.getLastColumn();
  var vals = sh.getRange(1, 1, sh.getLastRow(), w).getValues();
  var header = vals[0], seen = {}, kept = [], i, sig;
  for (i = 1; i < vals.length; i++) {
    sig = gkRowSig_(vals[i]);
    if (!sig) continue;                 // drop fully blank rows
    if (seen[sig]) continue;
    seen[sig] = true;
    kept.push(vals[i]);
  }
  var before = vals.length - 1, removed = before - kept.length;
  if (removed > 0) {
    sh.clearContents();
    sh.getRange(1, 1, 1, w).setValues([header]);
    var CH = 5000;
    for (var st = 0; st < kept.length; st += CH) {
      var block = kept.slice(st, st + CH);
      sh.getRange(2 + st, 1, block.length, w).setValues(block);
    }
    SpreadsheetApp.flush();
  }
  return { sheet: name, before: before, after: kept.length, removed: removed };
}

// APPEND-ONLY writer. Compares by COUNT, not by presence: if the export lists a row three
// times (a broker reporting one order as three identical fills) the tab must end up with three.
// We append only the shortfall, so re-running the same export adds nothing while genuine repeat
// trades are never swallowed.
function gkMergeCsv_(sheetName, csvText) {
  var parsed = gkParseCsv_(sheetName, csvText);
  var rows = parsed.rows, W = parsed.W;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, W).setValues([rows[0]]);

  var exW = Math.max(sh.getLastColumn(), W);
  var have = {}, i, sig;
  if (sh.getLastRow() > 1) {
    var ev = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
    for (i = 0; i < ev.length; i++) {
      sig = gkRowSig_(ev[i]);
      have[sig] = (have[sig] || 0) + 1;
    }
  }
  var want = {}, order = [];
  for (i = 1; i < rows.length; i++) {
    sig = gkRowSig_(rows[i]);
    if (!sig) continue;
    want[sig] = (want[sig] || 0) + 1;
    order.push({ sig: sig, row: rows[i] });
  }
  var used = {}, fresh = [];
  for (i = 0; i < order.length; i++) {
    var sg = order[i].sig;
    used[sg] = (used[sg] || 0) + 1;
    if (used[sg] <= (have[sg] || 0)) continue;      // this copy is already in the sheet
    var row = order[i].row.slice();
    while (row.length < exW) row.push("");
    fresh.push(row.slice(0, exW));
  }
  if (fresh.length) {
    var CH = 5000;
    for (var st = 0; st < fresh.length; st += CH) {
      var block = fresh.slice(st, st + CH);
      sh.getRange(sh.getLastRow() + 1, 1, block.length, exW).setValues(block);
    }
  }
  SpreadsheetApp.flush();
  return fresh.length;   // NEW rows appended this run
}

// Write a CSV payload to a tab, replacing whatever was there.
function gkWriteCsv_(sheetName, csvText) {
  var body = String(csvText || "").replace(/^\uFEFF/, "").trim();
  if (!body) throw new Error("Empty response from GridKey for " + sheetName + ".");
  // Some endpoints wrap the CSV in JSON, e.g. {"data":"a,b\n1,2"} or {"url":"https://..."}
  if (body.charAt(0) === "{" || body.charAt(0) === "[") {
    var j;
    try { j = JSON.parse(body); } catch (e) { j = null; }
    if (j) {
      if (typeof j === "string") body = j;
      else if (j.data && typeof j.data === "string") body = j.data;
      else if (j.csv && typeof j.csv === "string") body = j.csv;
      else if (j.url) { body = gkFetch_(j.url); }
      else throw new Error("Unexpected JSON from GridKey for " + sheetName + " (no csv/data/url field).");
    }
  }
  var rows = Utilities.parseCsv(body);
  if (!rows || rows.length < 2) throw new Error("Parsed 0 data rows for " + sheetName + " — check the URL/filters.");

  // Pad every row to the header width so setValues never fails on ragged rows.
  var W = 0;
  for (var i = 0; i < rows.length; i++) W = Math.max(W, rows[i].length);
  for (var r = 0; r < rows.length; r++) { while (rows[r].length < W) rows[r].push(""); }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  // Holdings is a snapshot of current positions, so it is replaced rather than appended — but
  // never with a suspiciously small export, which would silently wipe most of the book.
  var hadRows = Math.max(0, sh.getLastRow() - 1);
  if (hadRows >= 20 && (rows.length - 1) < hadRows * 0.5) {
    throw new Error("Refusing to replace " + hadRows + " rows in " + sheetName + " with only " + (rows.length - 1) + " — the export looks truncated. Nothing was changed.");
  }
  sh.clearContents(); // snapshot tab: replaced, guarded above
  // Write in chunks so very large exports don't blow the execution limit in one call.
  var CH = 5000;
  for (var s = 0; s < rows.length; s += CH) {
    var block = rows.slice(s, s + CH);
    sh.getRange(s + 1, 1, block.length, W).setValues(block);
  }
  SpreadsheetApp.flush();
  return rows.length - 1; // data rows, excluding header
}

function syncGridkeyTrades() {
  var url = String(gkProps_().getProperty("GK_TRADES_URL") || "").trim();
  return gkMergeCsv_(GK_TRADES_SHEET, gkFetch_(url));   // append-only: history is never lost
}

function syncGridkeyLedger() {
  var url = String(gkProps_().getProperty("GK_LEDGER_URL") || "").trim();
  if (!url) return -1; // not configured yet — skip quietly
  return gkMergeCsv_(GK_LEDGER_SHEET, gkFetch_(url));  // append-only
}

// The function the 6am / 6pm triggers call.
function runGridkeySync(force) {
  var props = gkProps_();
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var stamp = Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm");
  var hr = Number(Utilities.formatDate(now, tz, "H"));

  var msgs = [], ok = true;
  // The transaction export is large (~24MB) and only feeds the Performance/XIRR tab, so the
  // scheduled morning run skips it and the 6pm run does it. A manual "Fetch now" (force) always
  // does the full sync. Positions/prices come from combined holdings and cash from the ledger,
  // which run every time.
  var heavyRun = force || (hr < 9 || hr > 16);
  if (heavyRun) {
    try {
      var t = syncGridkeyTrades();
      msgs.push("trades: " + t + " rows");
      props.setProperty("GK_TRADES_ROWS", String(t));
    } catch (e) {
      ok = false;
      var em = String(e && e.message ? e.message : e);
      if (em.indexOf("script.external_request") >= 0 || em.indexOf("permission to call UrlFetchApp") >= 0) {
        em = "NOT AUTHORISED YET — in the Apps Script editor, pick 'authorizeGridkey' from the function dropdown and press Run, click Allow, then Deploy a New version and re-run setupGridkeyTriggers.";
      }
      msgs.push("trades FAILED: " + em);
    }
  } else {
    msgs.push("trades: skipped (intraday)");
  }
  try {
    var l = syncGridkeyLedger();
    if (l < 0) msgs.push("ledger: not configured");
    else { msgs.push("ledger: " + l + " rows"); props.setProperty("GK_LEDGER_ROWS", String(l)); }
  } catch (e) { ok = false; msgs.push("ledger FAILED: " + e.message); }

  // Fetch the combined-holdings export (per-portfolio, corporate-action adjusted, with CMP).
  var haveCombined = false;
  try {
    var cw = syncGridkeyHoldings();
    if (cw < 0) msgs.push("combined holdings: not configured");
    else { msgs.push("combined holdings: " + cw + " rows"); haveCombined = true; }
  } catch (e) { ok = false; msgs.push("combined holdings FAILED: " + e.message); }

  // Rebuild the Holdings tab ONLY from the combined-holdings export (corporate-action correct).
  // We deliberately NO LONGER rebuild from the raw transaction feed — that feed is pre-split and
  // was overwriting good data. If the combined export isn't configured, Holdings is left exactly
  // as-is (so a manual "Combined holdings" upload from the console persists). Set
  // GK_REBUILD_HOLDINGS="0" to switch even the combined rebuild off.
  if (String(props.getProperty("GK_REBUILD_HOLDINGS") || "1") !== "0") {
    if (haveCombined) {
      try {
        var h = rebuildHoldingsFromCombined();
        msgs.push("holdings (from combined): " + h.positions + " positions / " + h.clients + " clients");
      } catch (e) { ok = false; msgs.push("holdings FAILED: " + e.message); }
    } else {
      msgs.push("holdings: left untouched (no combined-holdings URL set)");
    }
  }

  var result = (ok ? "OK" : "ERROR") + " — " + msgs.join(" · ");
  props.setProperty("GK_LAST_SYNC", stamp);
  props.setProperty("GK_LAST_RESULT", result);

  // Keep a visible log in the sheet so you can see the history without opening Apps Script.
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var log = ss.getSheetByName("Sync log") || ss.insertSheet("Sync log");
    if (log.getLastRow() === 0) log.getRange(1, 1, 1, 3).setValues([["When", "Status", "Detail"]]);
    log.insertRowAfter(1);
    log.getRange(2, 1, 1, 3).setValues([[stamp, ok ? "OK" : "ERROR", msgs.join(" · ")]]);
    // trim to the last 200 entries
    if (log.getLastRow() > 201) log.deleteRows(202, log.getLastRow() - 201);
  } catch (e) { /* logging must never break the sync */ }
  return result;
}

// Run ONCE from the Apps Script editor to install the schedule:
//   - 9:30 am : fresh positions, cash and prices (combined holdings + ledger)
//   - 6:00 pm : full run, including the heavy trade export for the Performance tab
function setupGridkeyTriggers() {
  removeGridkeyTriggers();
  ScriptApp.newTrigger("runGridkeySync").timeBased().atHour(9).nearMinute(30).everyDays(1).create();
  ScriptApp.newTrigger("runGridkeySync").timeBased().atHour(18).nearMinute(0).everyDays(1).create();
  var n = gkTriggerCount_();
  return "Triggers installed: 9:30 am and 6:00 pm daily. Total " + n + " triggers (" + Session.getScriptTimeZone() + ").";
}

function removeGridkeyTriggers() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === "runGridkeySync") ScriptApp.deleteTrigger(ts[i]);
  }
  return "Triggers removed.";
}

function gkTriggerCount_() {
  var n = 0, ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) if (ts[i].getHandlerFunction() === "runGridkeySync") n++;
  return n;
}

/* ==================================================================
 *  POSITIONS FROM THE TRADE BOOK  ->  HOLDINGS TAB
 *
 *  Runs right after each GridKey sync, so the Holdings tab always
 *  reflects the latest dealing without anyone re-uploading anything.
 *
 *  Client master data (Name / Email / WhatsApp / Risk category) is NOT
 *  invented here — it is carried over from whatever is already in the
 *  Holdings tab, keyed on client code. Clients you have in Holdings but
 *  who have no trades (e.g. cash-only) are left untouched.
 * ================================================================== */

// Read the Trades tab and return compact rows:
// [Date, Client code, Client name, Symbol, Action, Quantity, Price, Amount]
// Works with a raw GridKey export (29 cols) OR the app's own 8-col backup.
// NOTE: for a broker export the key is PORTFOLIO code (e.g. MAY39939), not the
// client code (C000009) — one client can run several portfolios and the console
// treats each as its own account. Keep this order.
function gkNormalizedTrades_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Trades");
  var res = [];
  if (!sh) return res;
  var tv = sh.getDataRange().getValues();
  if (tv.length < 2) return res;
  var tz = Session.getScriptTimeZone();

  var thead = tv[0].map(function (x) { return String(x).toLowerCase().replace(/[^a-z0-9]/g, ""); });
  function tcol() {
    for (var a = 0; a < arguments.length; a++) {
      var idx = thead.indexOf(arguments[a]);
      if (idx >= 0) return idx;
    }
    return -1;
  }
  var iDate = tcol("date", "tradedate", "tradeddate");
  var iCode = tcol("portfoliocode", "clientcode", "ucc", "code");
  var iName = tcol("clientname", "name", "portfolioname");
  var iSym = tcol("symbol", "nsecode", "nse", "scrip");
  var iAct = tcol("action", "transactiontype", "transtype", "type", "side");
  var iQty = tcol("quantity", "qty");
  var iPrice = tcol("price", "rate", "netrateperunit");
  var iAmt = tcol("amount", "billamount", "amountwithbrokerage", "totalamount", "netamount");
  var iCompany = tcol("companyname", "company");
  var iBse = tcol("bsecode");
  var iIsin = tcol("isincode", "isin");
  var isinSym = {};

  function tstr(v) { return String(v == null ? "" : v).trim(); }
  function tnum(v) {
    var n = parseFloat(tstr(v).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  function tdate(v) {
    if (Object.prototype.toString.call(v) === "[object Date]") return Utilities.formatDate(v, tz, "yyyy-MM-dd");
    var s = tstr(v);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    return s;
  }

  for (var ti = 1; ti < tv.length; ti++) {
    var trow = tv[ti], blank = true;
    for (var tc = 0; tc < trow.length; tc++) { if (tstr(trow[tc]) !== "") { blank = false; break; } }
    if (blank) continue;

    var code = iCode >= 0 ? tstr(trow[iCode]) : "";
    var nse = iSym >= 0 ? tstr(trow[iSym]) : "";
    var isin = iIsin >= 0 ? tstr(trow[iIsin]).toUpperCase() : "";
    var sym = nse;
    if (!sym && iCompany >= 0) sym = tstr(trow[iCompany]);
    if (!sym && iBse >= 0) sym = tstr(trow[iBse]);
    if (!sym) sym = isin;
    sym = sym.toUpperCase();
    if (!nse && isin) { if (isinSym[isin]) sym = isinSym[isin]; else isinSym[isin] = sym; }

    var act = iAct >= 0 ? tstr(trow[iAct]).toUpperCase() : "BUY";
    act = (act === "SELL" || act === "S" || act === "SALE") ? "SELL" : "BUY";
    var qty = iQty >= 0 ? tnum(trow[iQty]) : 0;
    var price = iPrice >= 0 ? tnum(trow[iPrice]) : 0;
    var amt = iAmt >= 0 ? tnum(trow[iAmt]) : 0;
    if (!amt) amt = Math.abs(qty * price);
    var dt = iDate >= 0 ? tdate(trow[iDate]) : "";
    var nm = iName >= 0 ? tstr(trow[iName]) : "";

    if (!code || !sym || !dt || !qty) continue;
    res.push([dt, code, nm, sym, act, qty, price, amt]);
  }

  // Manually entered trades live in their own tab (the GridKey sync never touches it) and are
  // merged in here so performance, XIRR and holdings see the complete picture.
  var msh = ss.getSheetByName("ManualTrades");
  if (msh && msh.getLastRow() > 1) {
    var mv = msh.getRange(2, 1, msh.getLastRow() - 1, 9).getValues();
    for (var mi = 0; mi < mv.length; mi++) {
      var mr = mv[mi];
      var mdt = tdate(mr[1]), mcode = tstr(mr[2]), msym = tstr(mr[4]).toUpperCase();
      var mact = tstr(mr[5]).toUpperCase().indexOf("S") === 0 ? "SELL" : "BUY";
      var mqty = Math.abs(Number(mr[6]) || 0), mprice = Number(mr[7]) || 0;
      var mamt = Number(mr[8]) || Math.abs(mqty * mprice);
      if (!mcode || !msym || !mdt || !mqty) continue;
      res.push([mdt, mcode, tstr(mr[3]), msym, mact, mqty, mprice, mamt]);
    }
  }
  return res;
}

// Live prices from Sheet1, as { SYMBOL: price }
function gkPricesMap_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Sheet1") || ss.getSheets()[0];
  var map = {};
  if (!sh) return map;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    var sym = String(v[i][0] || "").trim().toUpperCase();
    var px = parseFloat(String(v[i][1]).replace(/[^0-9.\-]/g, ""));
    if (sym && !isNaN(px)) map[sym] = px;
  }
  return map;
}

// Net position per client+stock, using average-cost accounting over the full trade history.
function gkPositions_() {
  var trades = gkNormalizedTrades_();
  trades.sort(function (a, b) { return String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0; });
  var pos = {}, names = {};
  for (var i = 0; i < trades.length; i++) {
    var t = trades[i];
    var code = t[1], name = t[2], sym = t[3], act = t[4], qty = t[5], amt = t[7];
    if (name && !names[code]) names[code] = name;
    var k = code + "|" + sym;
    if (!pos[k]) pos[k] = { code: code, stock: sym, qty: 0, cost: 0 };
    var p = pos[k];
    if (act === "BUY") {
      p.qty += qty;
      p.cost += amt;
    } else { // SELL — relieve cost at the running average, so 'cost' stays the book value of what's left
      var avg = p.qty > 0 ? p.cost / p.qty : 0;
      var sell = Math.min(qty, p.qty);
      p.qty -= sell;
      p.cost -= avg * sell;
      if (p.qty <= 0.000001) { p.qty = 0; p.cost = 0; }
    }
  }
  return { pos: pos, names: names, tradeCount: trades.length };
}

// Rebuild the Holdings tab from the trade book, preserving client master data.
function rebuildHoldingsFromTrades() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var header = ["Client code", "Name", "Email", "WhatsApp", "Risk category", "Stock", "Quantity",
    "Purchase price", "Current price", "Invested", "Current value",
    "P/L amount", "P/L %", "Invested set", "Backed up at"];
  var W = header.length;

  // --- what's in Holdings today: master data + any manual overrides + clients with no trades
  var hs = ss.getSheetByName("Holdings");
  var master = {}, manual = {}, existingCodes = {}, prevRows = 0, prevPositions = 0, cashOnly = {};
  if (hs) {
    var hv = hs.getDataRange().getValues();
    prevRows = Math.max(0, hv.length - 1);
    for (var i = 1; i < hv.length; i++) {
      var r = hv[i];
      var code = String(r[0] || "").trim();
      if (!code) continue;
      existingCodes[code] = true;
      if (!master[code]) {
        master[code] = { name: r[1] || "", email: r[2] || "", whatsapp: r[3] || "", risk: r[4] || "" };
      }
      var stock = String(r[5] || "").trim().toUpperCase();
      if (!stock) { cashOnly[code] = true; continue; } // cash-only / master-only row
      if (Number(r[6]) > 0) prevPositions++;           // a real holding row
      if (String(r[13] || "").trim().toLowerCase() === "manual") {
        manual[code + "|" + stock] = { qty: Number(r[6]) || 0, invested: Number(r[9]) || 0, purchase: Number(r[7]) || 0 };
      }
    }
  }

  var P = gkPositions_();
  var prices = gkPricesMap_();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");

  var rows = [], liveCodes = {}, open = 0;
  for (var k in P.pos) {
    var p = P.pos[k];
    if (p.qty <= 0) continue; // fully exited — drop from Holdings
    open++;
    liveCodes[p.code] = true;
    var m = master[p.code] || {};
    var qty = p.qty, invested = p.cost;
    var setBy = "Sheet";
    // Respect a manual invested override, but only while the quantity still matches;
    // once the position changes, the manual figure is stale so we recompute.
    var mo = manual[p.code + "|" + p.stock];
    if (mo && Math.abs(mo.qty - qty) < 0.000001 && mo.invested > 0) { invested = mo.invested; setBy = "Manual"; }
    var buyPx = qty > 0 ? invested / qty : 0;
    var ltp = prices[p.stock] != null ? prices[p.stock] : 0;
    var curVal = ltp > 0 ? qty * ltp : 0;
    var pnl = curVal > 0 ? curVal - invested : 0;
    var pnlPct = (curVal > 0 && invested > 0) ? (pnl / invested) * 100 : 0;
    rows.push([p.code, m.name || P.names[p.code] || "", m.email || "", m.whatsapp || "", m.risk || "",
      p.stock, qty, buyPx.toFixed(2), Number(ltp).toFixed(2), Math.round(invested * 100) / 100,
      Math.round(curVal * 100) / 100, pnl.toFixed(2), pnlPct.toFixed(2), setBy, stamp]);
  }

  // Keep clients who exist in Holdings but have no open position from trades
  // (cash-only accounts, or clients added by hand) so they never silently vanish.
  for (var c in existingCodes) {
    if (liveCodes[c]) continue;
    var mm = master[c] || {};
    rows.push([c, mm.name || "", mm.email || "", mm.whatsapp || "", mm.risk || "",
      "", 0, "0.00", "0.00", 0, 0, "0.00", "0.00", "Sheet", stamp]);
  }

  // ---- safety valve: never wipe a healthy Holdings tab on a bad or truncated feed ----
  // Compare POSITION rows (a real holding) rather than total rows: master rows for clients
  // with no trades are re-added either way, so a total-row count would hide a truncated feed.
  if (P.tradeCount === 0) throw new Error("Refusing to rebuild Holdings: the Trades tab produced 0 usable rows.");
  if (open === 0) throw new Error("Refusing to rebuild Holdings: 0 open positions computed from " + P.tradeCount + " trades.");
  if (prevPositions > 20 && open < prevPositions * 0.5) {
    throw new Error("Refusing to rebuild Holdings: open positions would fall from " + prevPositions + " to " + open
      + ". That usually means the Trades tab is incomplete. Holdings left untouched.");
  }

  var sh2 = hs || ss.insertSheet("Holdings");
  sh2.clearContents();
  var all = [header].concat(rows);
  var CH = 5000;
  for (var s = 0; s < all.length; s += CH) {
    var block = all.slice(s, s + CH);
    sh2.getRange(s + 1, 1, block.length, W).setValues(block);
  }
  SpreadsheetApp.flush();
  PropertiesService.getScriptProperties().setProperty("GK_HOLDINGS_ROWS", String(rows.length));
  return { rows: rows.length, positions: open, clients: Object.keys(liveCodes).length, trades: P.tradeCount };
}

/* ==================================================================
 *  HOLDINGS FROM GRIDKEY'S COMBINED HOLDINGS EXPORT  (preferred source)
 *
 *  GridKey's "combined holdings" export is per-portfolio-per-stock, already
 *  corporate-action adjusted (splits/bonuses), and carries the live CMP. It
 *  only lists what is actually held. This is strictly better than rebuilding
 *  from the raw transaction feed (which is pre-split and can have orphaned
 *  buys), so when a combined-holdings URL is set we use THIS, not the trades.
 *
 *  Columns handled (case/space-insensitive):
 *    Portfolio code | Asset name | Isin | Nse | Bse | Quantity |
 *    Avg buy price | Invested amount | Cmp | Current amount
 * ================================================================== */
function syncGridkeyHoldings() {
  var url = String(gkProps_().getProperty("GK_HOLDINGS_URL") || "").trim();
  if (!url) return -1; // not configured — skip quietly
  var n = gkWriteCsv_(GK_HOLDINGS_SHEET, gkFetch_(url));
  return n;
}

function rebuildHoldingsFromCombined() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(GK_HOLDINGS_SHEET);
  if (!src) throw new Error("No CombinedHoldings tab — set the combined-holdings URL and sync first.");
  var v = src.getDataRange().getValues();
  if (v.length < 2) throw new Error("CombinedHoldings tab is empty.");

  var hh = v[0].map(function (x) { return String(x).toLowerCase().replace(/[^a-z0-9]/g, ""); });
  function hc() { for (var a = 0; a < arguments.length; a++) { var i = hh.indexOf(arguments[a]); if (i >= 0) return i; } return -1; }
  var iPC = hc("portfoliocode", "clientcode", "code");
  var iAsset = hc("assetname", "companyname", "company", "name");
  var iIsin = hc("isin", "isincode");
  var iNse = hc("nse", "nsecode", "symbol");
  var iQty = hc("quantity", "qty");
  var iAvg = hc("avgbuyprice", "averagebuyprice", "avgprice", "buyprice");
  var iInv = hc("investedamount", "invested");
  var iCmp = hc("cmp", "currentprice", "ltp", "marketprice");
  var iCur = hc("currentamount", "currentvalue", "marketvalue");
  if (iPC < 0 || iQty < 0) throw new Error("CombinedHoldings is missing Portfolio code / Quantity columns.");

  function nstr(x) { return String(x == null ? "" : x).trim(); }
  function nnum(x) { var n = parseFloat(nstr(x).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }

  var header = ["Client code", "Name", "Email", "WhatsApp", "Risk category", "Stock", "Quantity",
    "Purchase price", "Current price", "Invested", "Current value", "P/L amount", "P/L %", "Invested set", "Backed up at"];
  var W = header.length;

  // Preserve client master data (Name/Email/WhatsApp/Risk) from the existing Holdings tab.
  var hs = ss.getSheetByName("Holdings");
  var master = {}, existingCodes = {}, prevPositions = 0;
  if (hs) {
    var hv = hs.getDataRange().getValues();
    for (var i = 1; i < hv.length; i++) {
      var code0 = String(hv[i][0] || "").trim();
      if (!code0) continue;
      existingCodes[code0] = true;
      if (!master[code0]) master[code0] = { name: hv[i][1] || "", email: hv[i][2] || "", whatsapp: hv[i][3] || "", risk: hv[i][4] || "" };
      if (Number(hv[i][6]) > 0) prevPositions++;
    }
  }

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  var rows = [], liveCodes = {}, open = 0, isinSym = {};
  for (var r = 1; r < v.length; r++) {
    var row = v[r];
    var qty = nnum(row[iQty]);
    if (qty <= 0) continue; // only actual holdings
    var code = nstr(row[iPC]); if (!code) continue;
    var isin = iIsin >= 0 ? nstr(row[iIsin]).toUpperCase() : "";
    var sym = iNse >= 0 ? nstr(row[iNse]).toUpperCase() : "";
    if (!sym && iAsset >= 0) sym = nstr(row[iAsset]).toUpperCase();
    if (!sym) sym = isin;
    if (!sym) continue;
    if (isin) { if (isinSym[isin]) sym = isinSym[isin]; else isinSym[isin] = sym; }

    var avg = iAvg >= 0 ? nnum(row[iAvg]) : 0;
    var inv = iInv >= 0 ? nnum(row[iInv]) : avg * qty;
    var cmp = iCmp >= 0 ? nnum(row[iCmp]) : 0;
    var cur = iCur >= 0 ? nnum(row[iCur]) : (cmp > 0 ? cmp * qty : 0);
    if ((!avg || avg <= 0) && inv > 0) avg = inv / qty;
    var pnl = cur > 0 ? cur - inv : 0;
    var pnlPct = (cur > 0 && inv > 0) ? (pnl / inv) * 100 : 0;
    var m = master[code] || {};
    liveCodes[code] = true; open++;
    rows.push([code, m.name || "", m.email || "", m.whatsapp || "", m.risk || "",
      sym, qty, avg.toFixed(2), cmp.toFixed(2), Math.round(inv * 100) / 100,
      Math.round(cur * 100) / 100, pnl.toFixed(2), pnlPct.toFixed(2), "Sheet", stamp]);
  }

  // Keep clients who exist in Holdings but have no current position (cash-only / manual).
  for (var c in existingCodes) {
    if (liveCodes[c]) continue;
    var mm = master[c] || {};
    rows.push([c, mm.name || "", mm.email || "", mm.whatsapp || "", mm.risk || "",
      "", 0, "0.00", "0.00", 0, 0, "0.00", "0.00", "Sheet", stamp]);
  }

  // Safety valve — never wipe a healthy Holdings tab on a bad/short feed.
  if (open === 0) throw new Error("Refusing to rebuild Holdings: 0 holdings parsed from CombinedHoldings.");
  if (prevPositions > 20 && open < prevPositions * 0.5)
    throw new Error("Refusing to rebuild Holdings: positions would fall from " + prevPositions + " to " + open + ". Check the CombinedHoldings tab.");

  var out = hs || ss.insertSheet("Holdings");
  out.clearContents();
  var all = [header].concat(rows);
  for (var s = 0; s < all.length; s += 5000) { var b = all.slice(s, s + 5000); out.getRange(s + 1, 1, b.length, W).setValues(b); }
  SpreadsheetApp.flush();
  PropertiesService.getScriptProperties().setProperty("GK_HOLDINGS_ROWS", String(rows.length));
  return { rows: rows.length, positions: open, clients: Object.keys(liveCodes).length };
}

// CMP per symbol from the CombinedHoldings tab — used to enrich the price feed so held
// stocks always have a live price (no more ₹0 / -100%).
function gkCombinedPrices_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(GK_HOLDINGS_SHEET);
  var map = {};
  if (!src) return map;
  var v = src.getDataRange().getValues();
  if (v.length < 2) return map;
  var hh = v[0].map(function (x) { return String(x).toLowerCase().replace(/[^a-z0-9]/g, ""); });
  function hc() { for (var a = 0; a < arguments.length; a++) { var i = hh.indexOf(arguments[a]); if (i >= 0) return i; } return -1; }
  var iNse = hc("nse", "nsecode", "symbol"), iAsset = hc("assetname", "companyname"), iCmp = hc("cmp", "currentprice", "ltp");
  if (iCmp < 0) return map;
  for (var r = 1; r < v.length; r++) {
    var sym = iNse >= 0 ? String(v[r][iNse] || "").trim().toUpperCase() : "";
    if (!sym && iAsset >= 0) sym = String(v[r][iAsset] || "").trim().toUpperCase();
    var px = parseFloat(String(v[r][iCmp]).replace(/[^0-9.\-]/g, ""));
    if (sym && !isNaN(px) && px > 0) map[sym] = px;
  }
  return map;
}

/* ------------------------------------------------------------------
 *  STEP 1 OF AUTHORISATION — RUN THIS FIRST, FROM THE EDITOR.
 *
 *  This asks Google for every permission the script needs, and it does
 *  NOT depend on the token or the URLs being saved yet. Pick
 *  'grantPermissions' in the dropdown above and press Run, then Allow.
 *  (If Google warns the app isn't verified: Advanced -> Go to ... ->
 *  Allow. It is your own script.)
 * ------------------------------------------------------------------ */
function grantPermissions() {
  // Touch each service that needs a permission, so one consent screen covers them all.
  var r = UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true }); // external requests
  PropertiesService.getScriptProperties().getProperty("GK_TOKEN");                    // script properties
  ScriptApp.getProjectTriggers();                                                     // triggers
  SpreadsheetApp.getActiveSpreadsheet().getName();                                    // the sheet
  var msg = "Permissions granted (test request returned HTTP " + r.getResponseCode() + "). "
    + "Next: Deploy -> Manage deployments -> New version -> Deploy. "
    + "Then save the GridKey token, then run setupGridkeyTriggers.";
  Logger.log(msg);
  return msg;
}

/* ------------------------------------------------------------------
 *  Set the GridKey token WITHOUT the app (useful before the new web-app
 *  version is deployed). Paste your values between the quotes, press Run,
 *  then BLANK THEM OUT AGAIN and Save so the token isn't left in the code.
 *  (Or use Project Settings -> Script properties, which is tidier.)
 * ------------------------------------------------------------------ */
function setGridkeyTokenManually() {
  var TOKEN = "";      // <-- paste the GridKey token here
  var TRADES_URL = "https://django-backend-prod.gridkey.in/transaction/export_csv/?show_zero_holding=false&filter=%7B%7D";
  var LEDGER_URL = ""; // <-- paste the ledger export URL here when you have it

  var p = PropertiesService.getScriptProperties();
  if (TOKEN) p.setProperty("GK_TOKEN", TOKEN.trim());
  if (TRADES_URL) p.setProperty("GK_TRADES_URL", TRADES_URL.trim());
  if (LEDGER_URL) p.setProperty("GK_LEDGER_URL", LEDGER_URL.trim());
  var msg = "Saved. token=" + (p.getProperty("GK_TOKEN") ? "set" : "MISSING")
    + ", tradesUrl=" + (p.getProperty("GK_TRADES_URL") ? "set" : "MISSING")
    + ", ledgerUrl=" + (p.getProperty("GK_LEDGER_URL") ? "set" : "not set");
  Logger.log(msg);
  return msg;
}

/* ------------------------------------------------------------------
 *  STEP 2 — a real test fetch against GridKey, once the token is saved.
 * ------------------------------------------------------------------ */
function authorizeGridkey() {
  var props = gkProps_();
  var token = String(props.getProperty("GK_TOKEN") || "").trim();
  var url = String(props.getProperty("GK_TRADES_URL") || "").trim();
  if (!token) throw new Error("No token saved yet. In the console: Settings -> GridKey auto-sync -> paste the token -> Save to server. Then run this again.");
  if (!url) throw new Error("No trades URL saved yet. Save it from the console first, then run this again.");

  // This line is what needs the permission — running it by hand triggers the consent screen.
  var res = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      "accept": "application/json, text/plain, */*",
      "authorization": "Token " + token,
      "origin": "https://gridkey.in",
      "referer": "https://gridkey.in/",
      "x-gridkey-user-role": "advisor"
    }
  });
  var code = res.getResponseCode();
  var text = String(res.getContentText() || "");
  var msg;
  if (code === 200) {
    var lines = text.split(/\r?\n/).length;
    msg = "SUCCESS — permission granted and GridKey answered (HTTP 200, about " + lines + " lines). Now: Deploy -> Manage deployments -> New version -> Deploy, then run setupGridkeyTriggers.";
  } else if (code === 401 || code === 403) {
    msg = "Permission is now granted, BUT GridKey rejected the token (HTTP " + code + "). Update the token in the console and try again.";
  } else {
    msg = "Permission is now granted, but GridKey returned HTTP " + code + ": " + text.slice(0, 200);
  }
  Logger.log(msg);
  return msg;
}


const Scale = mkIcon("<path d=\"M12 3v18\"/><path d=\"M5 7h14\"/><path d=\"m5 7-3 6a4 4 0 0 0 6 0Z\"/><path d=\"m19 7 3 6a4 4 0 0 1-6 0Z\"/><path d=\"M8 21h8\"/>");
const Receipt = mkIcon("<path d=\"M4 2v20l2.5-1.5L9 22l2.5-1.5L14 22l2.5-1.5L19 22V2l-2.5 1.5L14 2l-2.5 1.5L9 2 6.5 3.5Z\"/><path d=\"M8 7h8\"/><path d=\"M8 11h5\"/><path d=\"M8 15h3\"/>");
const FEE_FREQUENCIES = ["Monthly", "Quarterly", "Half-yearly", "Annually", "One-time"];
const FEE_PERIODS_PER_YEAR = { "Monthly": 12, "Quarterly": 4, "Half-yearly": 2, "Annually": 1, "One-time": 0 };
const FEE_MODES = ["Fixed fee", "% of AUA"];
const FEE_GST = ["GST extra", "GST inclusive", "No GST"];
// SEBI (Investment Advisers) Regulations: per family of clients, either a fixed
// fee capped at Rs 1,51,000 a year, or up to 2.5% of Assets under Advice a year.
const SEBI_FIXED_FEE_CAP = 151000;
const SEBI_AUA_CAP_PCT = 2.5;
const feeMoney = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const feePlanAnnual = (p) => {
  const n = FEE_PERIODS_PER_YEAR[p && p.frequency] || 0;
  return n ? num(p.amount) * n : num(p.amount);
};
// Returns the reason a plan breaches the SEBI cap, or "" when it is within it.
function feePlanCapWarning(p) {
  if (!p || num(p.amount) <= 0) return "";
  const perYear = feePlanAnnual(p);
  if (p.mode === "% of AUA") {
    return perYear > SEBI_AUA_CAP_PCT
      ? `${perYear.toFixed(2)}% of AUA a year is above the SEBI cap of ${SEBI_AUA_CAP_PCT}%.`
      : "";
  }
  if (FEE_PERIODS_PER_YEAR[p.frequency] === 0) return "";
  return perYear > SEBI_FIXED_FEE_CAP
    ? `${feeMoney(perYear)} a year is above the SEBI fixed-fee cap of ${feeMoney(SEBI_FIXED_FEE_CAP)} per family.`
    : "";
}
async function pullFeePlans(url) {
  const res = await fetch(withToken(url) + "&fee_plans=1");
  const data = await res.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length < 2) return {};
  const out = {};
  for (const r of rows.slice(1)) {
    const id = String(r[0] || "").trim();
    const name = String(r[1] || "").trim();
    if (!id || !name) continue;
    out[id] = {
      id,
      name,
      mode: String(r[2] || "") || FEE_MODES[0],
      amount: num(r[3]),
      frequency: String(r[4] || "") || "Quarterly",
      timing: String(r[5] || "") || "In advance",
      gst: String(r[6] || "") || FEE_GST[0],
      status: String(r[7] || "") || "Active",
      notes: String(r[8] || ""),
      updatedAt: num(r[9])
    };
  }
  return out;
}
async function pushFeePlans(db, rows) {
  if (!(db.sheetUrl || "").trim() || !(rows || []).length) return false;
  try {
    await fetch(db.sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "fee_plans", rows })
    });
    return true;
  } catch (e) {
    return false;
  }
}
async function deleteFeePlanOnSheet(db, id) {
  if (!(db.sheetUrl || "").trim() || !id) return false;
  try {
    await fetch(db.sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "fee_plans", action: "delete", id })
    });
    return true;
  } catch (e) {
    return false;
  }
}
// ---- Billing: quarters, GST and the fee for one client for one quarter ------
// Fees are billed on the first day of a quarter for the quarter just finished, so
// everything here works on a CLOSED period: Apr-Jun is billed on 1 July.
const OUTSIDE_INDIA = "Outside India (export of service)";
const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];
const daysBetween = (a, b) => Math.round((dayOf(b) - dayOf(a)) / DAY_MS) + 1;
// Indian financial-year quarters: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar.
const prevQuarter = (anyDate) => {
  const cur = fyQuarter(anyDate);
  return fyQuarter(new Date(cur.from.getTime() - DAY_MS));
};
// The day a quarter's bills are raised, and the date they carry. Q1 to Q3 are billed
// on the first day of the quarter that follows; the year's last quarter is billed on
// 31 March itself, so that bill stays inside the financial year it belongs to - its
// number, its GST return and the books all fall in the right year.
const quarterBillDate = (q) => q.q === 4 ? new Date(q.to.getTime()) : new Date(q.to.getTime() + DAY_MS);
// The latest quarter whose bill date has arrived. On 31 March that is Jan-Mar, which
// is still running for a few hours; on every other day it is the quarter just closed.
function billableQuarter(anyDate) {
  const today = dayOf(anyDate) || new Date();
  const cur = fyQuarter(today);
  if (quarterBillDate(cur) <= today) return cur;
  return prevQuarter(today);
}
function placeOfSupplyFor(prof) {
  if (!prof) return "";
  if (String(prof.residency || "") === "NRI") return prof.permanentState || prof.state || "";
  return prof.state || "";
}
// Same state as the firm means the tax splits into CGST and SGST; a different state
// means one IGST line; outside India is a zero-rated export.
function gstSplit(fee, placeOfSupply, firmState, rate) {
  const taxable = round2(fee);
  const pos = String(placeOfSupply || "").trim();
  const r = Number(rate) || 0;
  if (!pos) return { cgst: 0, sgst: 0, igst: 0, mode: "Not set", tax: 0 };
  if (pos === OUTSIDE_INDIA) return { cgst: 0, sgst: 0, igst: 0, mode: "Zero-rated export", tax: 0 };
  if (!r || taxable <= 0) return { cgst: 0, sgst: 0, igst: 0, mode: "No GST", tax: 0 };
  const tax = round2(taxable * r / 100);
  if (pos.toLowerCase() === String(firmState || "").trim().toLowerCase()) {
    const half = round2(tax / 2);
    return { cgst: half, sgst: round2(tax - half), igst: 0, mode: "CGST + SGST", tax };
  }
  return { cgst: 0, sgst: 0, igst: tax, mode: "IGST", tax };
}
// What one quarter of a plan costs, whatever the plan's own billing frequency is.
// A monthly plan bills three months in the quarter; an annual plan bills a quarter of
// the year. A one-time plan is not a recurring charge and is left out of a quarter run.
function quarterFeeOf(plan, aua) {
  if (!plan) return { fee: 0, why: "no fee plan attached" };
  const perYear = FEE_PERIODS_PER_YEAR[plan.frequency];
  if (!perYear) return { fee: 0, why: "one-time plan, not billed quarterly" };
  if (plan.status === "Inactive") return { fee: 0, why: "fee plan is inactive" };
  if (plan.mode === "% of AUA") {
    const pctPerYear = num(plan.amount) * perYear;
    if (!(num(aua) > 0)) return { fee: 0, why: "no portfolio value to charge a percentage on" };
    return { fee: round2(num(aua) * (pctPerYear / 4) / 100), why: "" };
  }
  return { fee: round2(num(plan.amount) * perYear / 4), why: "" };
}
// The whole calculation for one client for one quarter, kept in one place so the
// preview, the generated invoice and any re-run agree to the paisa.
// firstTrade is the earliest executed trade on the account; a client whose first
// trade falls inside the quarter is charged from that date, pro rata on days.
function computeQuarterFee(opts) {
  const { plan, quarter, firstTrade, billingStart, aua, profile, settings } = opts;
  const qFrom = dayOf(quarter.from), qTo = dayOf(quarter.to);
  const daysInQuarter = daysBetween(qFrom, qTo);
  const base = quarterFeeOf(plan, aua);
  if (base.why) return { skip: base.why, daysInQuarter };
  // An explicit billing start on the profile overrides the trade book - that is the
  // escape hatch for an account transferred in with history, or a fee holiday.
  const startRaw = billingStart || firstTrade || "";
  const start = dayOf(startRaw);
  if (!start) return { skip: "no executed trade on this account yet, and no billing start set", daysInQuarter };
  if (start > qTo) return { skip: `billing starts ${fmtDay(start)}, after this quarter`, daysInQuarter };
  const proRata = start > qFrom;
  const from = proRata ? start : qFrom;
  const days = daysBetween(from, qTo);
  const fee = proRata ? round2(base.fee * days / daysInQuarter) : base.fee;
  const pos = placeOfSupplyFor(profile);
  const g = gstSplit(fee, pos, settings && settings.firmState, settings && settings.gstRate);
  return {
    skip: "", proRata, basis: proRata ? "Pro rata" : "Full quarter",
    from: ymd(from), to: ymd(qTo), days, daysInQuarter, fullFee: base.fee, fee,
    placeOfSupply: pos, gstMode: g.mode, cgst: g.cgst, sgst: g.sgst, igst: g.igst,
    total: round2(fee + g.cgst + g.sgst + g.igst), aua: num(aua), firstTrade: firstTrade || ""
  };
}
// WhatsApp alerts keep using the number in Holdings, as everywhere else in the
// console - AdviceContacts is only for opening an order link.
const waOf = (db, code) => ((db.clients || {})[String(code || "").trim()] || {}).whatsapp || "";
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const CIN_RE = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
function billingFieldWarning(key, v) {
  const t = String(v || "").trim().toUpperCase();
  if (!t) return "";
  if (key === "ifsc" && !IFSC_RE.test(t))
    return `An IFSC is 11 characters - four letters, a zero, then six more. This is ${t.length}.`;
  if (key === "firmGstin" && !GSTIN_RE.test(t)) return "That does not look like a 15-character GSTIN.";
  if (key === "pan" && !PAN_RE.test(t)) return "A PAN is five letters, four digits, then a letter.";
  if (key === "cin" && !CIN_RE.test(t))
    return t.length === 21
      ? "21 characters, but not in the CIN pattern - check for a letter O where a zero belongs."
      : `A CIN is 21 characters. This is ${t.length}.`;
  if (key === "upiId" && !/^[\w.\-]{2,}@[a-zA-Z][\w.\-]*$/.test(String(v).trim()))
    return "A UPI id looks like name@bank.";
  return "";
}
const DEFAULT_BILLING_SETTINGS = () => ({
  firmName: "Vasupradah Investment Advisory Services P Ltd",
  firmState: "Kerala", firmGstin: "32AAICV4624L1Z5", pan: "AAICV4624L", cin: "U6712OKL2021PTC073050",
  sebiReg: "",
  address: "Regd Office: G32, Ground Floor, Pioneer Towers, Marine Drive, Kochi 682031",
  gstRate: 18,
  bankName: "ICICI Bank", accountName: "Vasupradah Investment Advisory Services P Ltd",
  accountNo: "635105600988", accountType: "Current", ifsc: "ICIC00063515", branch: "",
  upiId: "vasupradah.ia@validicici", upiQr: "",
  invoicePrefix: "VIAS", receiptPrefix: "VIAS/R",
  // The invoice series runs unbroken to the end of the financial year. Seed it with
  // the number already reached elsewhere and it carries on from there.
  invoiceSeedFy: "", invoiceSeedNo: 0, receiptSeedFy: "", receiptSeedNo: 0,
  numberByQuarter: false,
  notes: "", updatedAt: 0
});
// A UPI intent string. Filling in the amount and the invoice number means the client
// scans and pays the exact sum against the right bill, with nothing to type.
function upiPayUri(st, amount, note) {
  const vpa = String((st || {}).upiId || "").trim();
  if (!vpa) return "";
  const p = [
    "pa=" + encodeURIComponent(vpa),
    "pn=" + encodeURIComponent(String(st.accountName || st.firmName || "").slice(0, 60)),
    "cu=INR"
  ];
  const amt = Number(amount) || 0;
  if (amt > 0) p.push("am=" + amt.toFixed(2));
  if (note) p.push("tn=" + encodeURIComponent(String(note).slice(0, 50)));
  return "upi://pay?" + p.join("&");
}
// Draws a QR as a PNG data URL. Returns "" if anything is missing, so a bill without
// a UPI id simply shows no QR rather than a broken image.
function qrDataUrl(text, px) {
  const body = String(text || "");
  if (!body || typeof window === "undefined" || typeof window.qrcode !== "function") return "";
  try {
    const r = window.qrcode(0, "M");
    r.addData(body, "Byte");
    r.make();
    const n = r.getModuleCount(), quiet = 4, size = px || 300;
    const scale = Math.max(1, Math.floor(size / (n + quiet * 2)));
    const side = (n + quiet * 2) * scale;
    const cv = document.createElement("canvas");
    cv.width = side; cv.height = side;
    const cx = cv.getContext("2d");
    cx.fillStyle = "#ffffff";
    cx.fillRect(0, 0, side, side);
    cx.fillStyle = "#000000";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (r.isDark(y, x)) cx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    }
    return cv.toDataURL("image/png");
  } catch (e) {
    return "";
  }
}
// The QR that goes on one bill: the client's own amount and invoice number, falling
// back to whatever static QR was uploaded if there is no UPI id to build one from.
function invoiceQr(inv, st) {
  const uri = upiPayUri(st, inv && inv.total, inv && inv.no);
  return (uri && qrDataUrl(uri, 300)) || (st || {}).upiQr || "";
}
async function pushBillingProfiles(db, rows) {
  if (!(db.sheetUrl || "").trim() || !(rows || []).length) return false;
  try {
    await fetch(db.sheetUrl, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "billing_profiles", rows }) });
    return true;
  } catch (e) { return false; }
}
async function pushBillingSettings(db, row) {
  if (!(db.sheetUrl || "").trim()) return false;
  try {
    await fetch(db.sheetUrl, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "billing_settings", row }) });
    return true;
  } catch (e) { return false; }
}
async function pushInvoices(db, rows) {
  if (!(db.sheetUrl || "").trim() || !(rows || []).length) return false;
  try {
    await fetch(db.sheetUrl, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "invoices", rows }) });
    return true;
  } catch (e) { return false; }
}
async function deleteInvoiceOnSheet(db, id) {
  if (!(db.sheetUrl || "").trim() || !id) return false;
  try {
    await fetch(db.sheetUrl, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "invoices", action: "delete", id }) });
    return true;
  } catch (e) { return false; }
}
// The earliest executed trade per client code, computed on the sheet so this stays a
// few KB. It is what a new client's first quarter is charged from.
async function pullFirstTrades(url) {
  const res = await fetch(withToken(url) + "&first_trades=1");
  const data = await res.json();
  return data && data.first && typeof data.first === "object" ? data.first : {};
}
// Bills and receipts are ready-made HTML, unlike the advice mail, so they go through
// their own endpoint. Returns {sent, skipped, failed} rather than a bare ok.
async function sendBillingEmail(db, recipients, qr) {
  const url = (db.sheetUrl || "").trim();
  if (!url) return { ok: false, msg: "Connect the office Google Sheet in Settings first." };
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "billing_email", recipients, qr: qr || "",
        fromName: db.firmName || "Vasupradah Investment Advisory", replyTo: "" }) });
    const txt = await res.text();
    try {
      const j = JSON.parse(txt);
      return { ok: !!j.ok, sent: j.sent, sentTo: Array.isArray(j.sentTo) ? j.sentTo : null, skipped: j.skipped, failed: j.failed, quota: j.quota,
        msg: j.ok ? `Sent ${j.sent} mail(s).${j.failed ? ` ${j.failed} failed.` : ""}${j.skipped ? ` ${j.skipped} skipped.` : ""}`
                  : "Nothing was sent - check the email addresses and your Gmail quota." };
    } catch (e) {
      return { ok: false, msg: txt.slice(0, 200) || "The sheet gave an unexpected reply." };
    }
  } catch (e) {
    return { ok: false, msg: "Could not reach the office Google Sheet." };
  }
}
// ---- Billing: the bill and the receipt, as documents ------------------------
function rupeesInWords(amount) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
    "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n) => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  const chunk = (n) => n > 99 ? ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + two(n % 100) : "") : two(n);
  const whole = Math.floor(Math.abs(Number(amount) || 0));
  const paise = Math.round((Math.abs(Number(amount) || 0) - whole) * 100);
  let n = whole, parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thou = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(chunk(crore) + " Crore");
  if (lakh) parts.push(chunk(lakh) + " Lakh");
  if (thou) parts.push(chunk(thou) + " Thousand");
  if (n) parts.push(chunk(n));
  let out = parts.join(" ") || "Zero";
  out = "Rupees " + out;
  if (paise) out += " and " + two(paise) + " Paise";
  return out + " only";
}
// The one account clients may pay into, as an HTML block and as plain text. Kept in
// one place so the bill, the WhatsApp message and the on-screen copy cannot drift.
function payeeBlockHtml(st, withQr, amount) {
  const rows = [
    ["Account name", st.accountName], ["Bank", st.bankName],
    [st.accountType ? `${st.accountType} account number` : "Account number", st.accountNo],
    ["IFSC", st.ifsc], ["Branch", st.branch], ["UPI", st.upiId]
  ].filter(([, v]) => String(v || "").trim());
  if (!rows.length) return "";
  return `<div style="margin-top:18px;border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#f8fafc">
  <div style="font-weight:bold;font-size:13px;margin-bottom:8px">How to pay</div>
  <table style="font-size:13px;border-collapse:collapse">${rows.map(([k, v]) =>
    `<tr><td style="padding:2px 14px 2px 0;color:#64748b">${esc(k)}</td><td style="padding:2px 0;font-weight:bold">${esc(v)}</td></tr>`).join("")}</table>
  ${withQr ? `<div style="margin-top:10px">
    <img src="cid:upiqr" alt="UPI QR" style="width:150px;height:150px;border:1px solid #e2e8f0;border-radius:8px"/>
    <div style="font-size:11px;color:#64748b;margin-top:4px">${amount > 0 ? `Scan to pay ${rupee(amount)} \u2014 the amount and this invoice number are already filled in.` : "Scan to pay by UPI."}</div>
  </div>` : ""}
  <div style="margin-top:10px;font-size:12px;color:#b45309">Please pay only into the account shown above. We will never ask you to pay into any other account, and we do not accept cash.</div>
</div>`;
}
function payeeBlockText(st) {
  const rows = [["Account name", st.accountName], ["Bank", st.bankName],
    [st.accountType ? `${st.accountType} a/c no` : "A/c no", st.accountNo],
    ["IFSC", st.ifsc], ["UPI", st.upiId]].filter(([, v]) => String(v || "").trim());
  return rows.map(([k, v]) => `${k}: ${v}`).join("\n");
}
function invoiceHtml(inv, st, hasQr) {
  const gstRows = [];
  if (inv.gstMode === "CGST + SGST") {
    gstRows.push([`CGST @ ${num(st.gstRate) / 2}%`, inv.cgst], [`SGST @ ${num(st.gstRate) / 2}%`, inv.sgst]);
  } else if (inv.gstMode === "IGST") {
    gstRows.push([`IGST @ ${num(st.gstRate)}%`, inv.igst]);
  }
  const line = (k, v, bold) => `<tr><td style="padding:6px 0;color:#475569">${esc(k)}</td>
    <td style="padding:6px 0;text-align:right;${bold ? "font-weight:bold;font-size:15px" : ""}">${rupee(v)}</td></tr>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:14px;line-height:1.5;max-width:640px">
  <div style="border-bottom:3px solid #C9A24B;padding-bottom:10px;margin-bottom:14px">
    <div style="font-size:17px;font-weight:bold;color:#1E2A78">${esc(st.firmName)}</div>
    <div style="font-size:12px;color:#64748b">${esc(st.address)}${st.sebiReg ? ` &middot; SEBI RIA Reg. No. ${esc(st.sebiReg)}` : ""}</div>
    <div style="font-size:12px;color:#64748b">${[st.firmGstin ? `GSTIN ${esc(st.firmGstin)}` : "", st.pan ? `PAN ${esc(st.pan)}` : "", st.cin ? `CIN ${esc(st.cin)}` : ""].filter(Boolean).join(" &middot; ")}</div>
  </div>
  <div style="font-size:15px;font-weight:bold;margin-bottom:10px">Tax invoice ${esc(inv.no)}</div>
  <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:14px">
    <tr><td style="vertical-align:top;padding-right:16px">
      <div style="color:#64748b">Billed to</div>
      <div style="font-weight:bold">${esc(inv.name)}</div>
      <div style="color:#64748b">Client code ${esc(inv.code)}</div>
      ${inv.gstin ? `<div style="color:#64748b">GSTIN ${esc(inv.gstin)}</div>` : ""}
      <div style="color:#64748b">Place of supply: ${esc(inv.placeOfSupply || "not set")}</div>
    </td><td style="vertical-align:top;text-align:right">
      <div style="color:#64748b">Invoice date</div><div style="font-weight:bold">${esc(fmtDay(inv.issuedAt ? new Date(inv.issuedAt) : new Date()))}</div>
      <div style="color:#64748b;margin-top:6px">Period</div><div style="font-weight:bold">${esc(fmtDay(inv.from))} to ${esc(fmtDay(inv.to))}</div>
    </td></tr>
  </table>
  <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:8px">
    <tr style="background:#f1f5f9"><th style="text-align:left;padding:8px;font-size:12px">Particulars</th><th style="text-align:right;padding:8px;font-size:12px">Amount</th></tr>
    <tr><td style="padding:10px 8px;border-top:1px solid #e2e8f0">
      Investment advisory fee &ndash; ${esc(inv.planName)}<br>
      <span style="color:#64748b;font-size:12px">${esc(inv.basis)}${inv.basis === "Pro rata" ? ` &middot; ${inv.days} of ${inv.daysInQuarter} days, from ${esc(fmtDay(inv.from))}` : ""}</span>
    </td><td style="padding:10px 8px;border-top:1px solid #e2e8f0;text-align:right">${rupee(inv.fee)}</td></tr>
  </table>
  <table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:8px">
    ${line("Fee", inv.fee)}
    ${gstRows.map(([k, v]) => line(k, v)).join("")}
    ${inv.gstMode === "Zero-rated export" ? '<tr><td colspan="2" style="padding:6px 0;color:#64748b;font-size:12px">Export of service &ndash; zero rated, no GST charged.</td></tr>' : ""}
    <tr><td colspan="2" style="border-top:1px solid #e2e8f0"></td></tr>
    ${line("Total payable", inv.total, true)}
  </table>
  <div style="font-size:12px;color:#64748b;margin-top:6px">${esc(rupeesInWords(inv.total))}</div>
  ${payeeBlockHtml(st, hasQr !== false && !!(String(st.upiId || "").trim() || st.upiQr), inv.total)}
  <div style="margin-top:16px;font-size:11px;color:#94a3b8">
    Investment advisory fees are charged under the SEBI (Investment Advisers) Regulations, 2013.
    Please quote invoice ${esc(inv.no)} with your payment. If anything here looks wrong, write back before paying.
  </div>
</div>`;
}
function receiptHtml(inv, st) {
  const r = inv.receipt || {};
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:14px;line-height:1.5;max-width:640px">
  <div style="border-bottom:3px solid #C9A24B;padding-bottom:10px;margin-bottom:14px">
    <div style="font-size:17px;font-weight:bold;color:#1E2A78">${esc(st.firmName)}</div>
    <div style="font-size:12px;color:#64748b">${esc(st.address)}${st.sebiReg ? ` &middot; SEBI RIA Reg. No. ${esc(st.sebiReg)}` : ""}</div>
    <div style="font-size:12px;color:#64748b">${[st.firmGstin ? `GSTIN ${esc(st.firmGstin)}` : "", st.cin ? `CIN ${esc(st.cin)}` : ""].filter(Boolean).join(" &middot; ")}</div>
  </div>
  <div style="font-size:15px;font-weight:bold;margin-bottom:4px">Receipt ${esc(r.no)}</div>
  <div style="font-size:12px;color:#64748b;margin-bottom:14px">Dated ${esc(fmtDay(r.at ? new Date(r.at) : new Date()))}</div>
  <p>Received with thanks from <b>${esc(inv.name)}</b> (client code ${esc(inv.code)}) the sum of
  <b>${rupee(inv.total)}</b> &ndash; ${esc(rupeesInWords(inv.total))} &ndash; towards invoice
  <b>${esc(inv.no)}</b> for the period ${esc(fmtDay(inv.from))} to ${esc(fmtDay(inv.to))}.</p>
  <table style="font-size:13px;border-collapse:collapse;margin-top:10px">
    ${[["Payment received on", fmtDay(r.paidOn)], ["Mode", r.mode], ["Reference", r.ref]]
      .filter(([, v]) => String(v || "").trim())
      .map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#64748b">${esc(k)}</td><td style="padding:3px 0;font-weight:bold">${esc(v)}</td></tr>`).join("")}
  </table>
  <div style="margin-top:16px;font-size:11px;color:#94a3b8">This receipt is issued against the invoice named above. No further amount is due for that period.</div>
</div>`;
}
// The WhatsApp note is deliberately not the bill: it says the bill is in their inbox,
// gives the amount and how to pay, and nothing that would be unsafe to read off a
// forwarded message.
function invoiceWaText(inv, st, sentOn) {
  const lines = [
    `Dear ${inv.name || "Investor"},`, "",
    `Your investment advisory fee bill for ${fmtDay(inv.from)} to ${fmtDay(inv.to)} is ${rupee(inv.total)} (invoice ${inv.no}).`,
    `The bill has been sent to your registered email${inv.email ? " (" + inv.email + ")" : ""} on ${fmtDay(sentOn || new Date())}.`, ""
  ];
  const pay = payeeBlockText(st);
  if (pay) {
    lines.push("Payment may be made to:", pay, "");
    if (st.upiId) lines.push(`The bill mail carries a UPI QR already set to ${rupee(inv.total)}, so you can scan and pay without typing anything.`, "");
    lines.push("Please pay only into this account. We never ask you to pay anywhere else.", "");
  }
  lines.push(st.firmName || "Vasupradah Investment Advisory Services P Ltd");
  if (st.sebiReg) lines.push(`SEBI RIA Reg. No. ${st.sebiReg}`);
  return lines.join("\n");
}
function receiptWaText(inv, st) {
  const r = inv.receipt || {};
  const lines = [
    `Dear ${inv.name || "Investor"},`, "",
    `Received with thanks ${rupee(inv.total)} towards invoice ${inv.no} for ${fmtDay(inv.from)} to ${fmtDay(inv.to)}.`,
    `Receipt ${r.no} dated ${fmtDay(r.at ? new Date(r.at) : new Date())} has been sent to your registered email${inv.email ? " (" + inv.email + ")" : ""}.`,
    "", st.firmName || "Vasupradah Investment Advisory Services P Ltd"
  ];
  if (st.sebiReg) lines.push(`SEBI RIA Reg. No. ${st.sebiReg}`);
  return lines.join("\n");
}
// Next running number within a financial year. Invoice numbers must not repeat, so
// the sequence is taken from the highest one already issued in that year rather than
// from a count, which would collide after a deletion.
function nextDocSeq(existingNos, prefix, fyLabel, seedFy, seedNo) {
  let top = 0;
  const head = `${prefix}/${fyLabel}/`;
  for (const no of existingNos) {
    const s2 = String(no || "");
    if (!s2.startsWith(head)) continue;
    const m = s2.match(/(\d+)\s*$/);
    if (m) top = Math.max(top, parseInt(m[1], 10));
  }
  // A series carried over from wherever you were numbering before: the seed is the
  // NEXT number to use, and it only applies until the console's own run passes it.
  const seed = String(seedFy || "").trim() === String(fyLabel) ? Math.floor(num(seedNo)) : 0;
  return Math.max(top + 1, seed > 0 ? seed : 0) || 1;
}
const docNo = (prefix, fyLabel, q, seq) =>
  `${prefix}/${fyLabel}/${q ? "Q" + q + "/" : ""}${String(seq).padStart(3, "0")}`;
// Works out the whole quarter's billing run without touching any state, so the
// preview you approve and the invoices that get written are the same numbers.
function buildQuarterRun(opts) {
  const { quarter, clients, profiles, plans, firstTrades, settings, existing, auaOf, issuedOn } = opts;
  const st = { ...DEFAULT_BILLING_SETTINGS(), ...settings || {} };
  // The series belongs to the year the invoice is RAISED in, not the year it bills
  // for. A Jan-Mar bill raised on 1 April is the new year's first invoice - that is
  // what a GST invoice series has to be sequential within.
  // Dated by the quarter's own bill date rather than the keystroke, so a run done a
  // few days late still carries the right date, series and financial year.
  const issuedAtDay = dayOf(issuedOn) || quarterBillDate(quarter);
  const issueFy = fyQuarter(issuedAtDay).fyLabel;
  const already = {};
  for (const iv of Object.values(existing || {})) {
    if (iv.period === quarter.key && iv.status !== "Cancelled") already[iv.code] = iv;
  }
  let seq = nextDocSeq(Object.values(existing || {}).map((x) => x.no), st.invoicePrefix, issueFy, st.invoiceSeedFy, st.invoiceSeedNo);
  const bills = [], skipped = [], repeats = [];
  const sorted = Object.values(clients || {}).sort((a, b) => String(a.name || a.code).localeCompare(String(b.name || b.code)));
  for (const c of sorted) {
    const prof = (profiles || {})[c.code];
    const name = c.name || c.code;
    if (already[c.code]) { repeats.push({ code: c.code, name, no: already[c.code].no }); continue; }
    if (!prof) { skipped.push({ code: c.code, name, why: "no billing setup - attach a fee plan first" }); continue; }
    if (prof.status === "Inactive") { skipped.push({ code: c.code, name, why: "billing marked inactive" }); continue; }
    const plan = (plans || {})[prof.planId];
    if (!plan) { skipped.push({ code: c.code, name, why: "fee plan missing or deleted" }); continue; }
    const r = computeQuarterFee({
      plan, quarter, firstTrade: (firstTrades || {})[c.code] || "",
      billingStart: prof.billingStart, aua: auaOf ? auaOf(c) : 0, profile: prof, settings: st
    });
    if (r.skip) { skipped.push({ code: c.code, name, why: r.skip }); continue; }
    if (!(r.total > 0)) { skipped.push({ code: c.code, name, why: "the fee works out to nothing" }); continue; }
    const email = String(prof.email || c.email || "").trim();
    bills.push({
      id: `inv_${quarter.key}_${c.code}`.replace(/[^A-Za-z0-9_\-]/g, ""),
      no: docNo(st.invoicePrefix, issueFy, st.numberByQuarter ? quarter.q : 0, seq++),
      period: quarter.key, periodLabel: quarter.label, code: c.code, name, email,
      gstin: prof.gstin || "", planId: prof.planId, planName: plan.name,
      from: r.from, to: r.to, days: r.days, daysInQuarter: r.daysInQuarter, basis: r.basis,
      fullFee: r.fullFee, fee: r.fee, aua: r.aua, firstTrade: r.firstTrade,
      placeOfSupply: r.placeOfSupply, gstMode: r.gstMode, cgst: r.cgst, sgst: r.sgst, igst: r.igst,
      total: r.total, status: "Unpaid", issuedAt: issuedAtDay.getTime(), emailedAt: 0, waAt: 0, receipt: null,
      noEmail: !email.includes("@"), gstUnset: r.gstMode === "Not set"
    });
  }
  return { bills, skipped, repeats, quarter, issueFy, issuedAt: issuedAtDay.getTime(), settings: st };
}
// ---- Capital gains ----------------------------------------------------------
// Listed equity with STT paid, which is all this console deals in:
//   short term (held 12 months or less)  - s.111A, 20% for transfers on or after
//     23 July 2024 (15% before that);
//   long term (held more than 12 months) - s.112A, 12.5% on the excess over
//     Rs 1,25,000 in the year (10% over Rs 1,00,000 before 23 July 2024).
// Rates are settings rather than constants so a Budget change is a field, not a
// rebuild.
const BLANK_FEE_PLAN = () => ({
  id: "", name: "", mode: FEE_MODES[0], amount: "", frequency: "Quarterly",
  timing: "In advance", gst: FEE_GST[0], status: "Active", notes: ""
});
// The plans already in use, offered as a one-click starting list on an empty setup.
const STARTER_FEE_PLANS = [
  { name: "Fixed Fee 1000 Quarterly", amount: 1000 },
  { name: "Fixed Fee Billing Rs. 1500", amount: 1500 },
  { name: "FIXED FEE 2500 QUARTERLY", amount: 2500 },
  { name: "Fixed Fee 5000 per Quarter", amount: 5000 },
  { name: "Fixed Fee 7500 Quarterly", amount: 7500 },
  { name: "Fixed Fee Rs 8750 Per Quarter", amount: 8750 },
  { name: "Fixed Fee 10,000 per Quarter", amount: 1e4 },
  { name: "Fixed Fee 15000 Per Quarter", amount: 15e3 },
  { name: "Fixed Fee 22,500 Per Quarter", amount: 22500 }
];
// The billing module. Fees are billed on the first day of a quarter for the quarter
// just finished, so the Invoices section opens on the closed period and generates it
// if that has not happened yet.
const BILLING_SECTIONS = [
  { id: "invoices", label: "Invoices" },
  { id: "receipts", label: "Receipts" },
  { id: "clients", label: "Client billing setup" },
  { id: "plans", label: "Fee plans" },
  { id: "settings", label: "Bank & GST" }
];
const billingSettingsOf = (db) => ({ ...DEFAULT_BILLING_SETTINGS(), ...db.billingSettings || {} });
// cid: only resolves inside a mail client, so the on-screen copy needs the real image.
const previewHtml = (html, qr) => qr ? String(html).split('src="cid:upiqr"').join(`src="${qr}"`) : String(html);
function BillingTab({ db, user, commit, showToast }) {
  const [sec, setSec] = useState("invoices");
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 flex-wrap border-b border-slate-200" },
      BILLING_SECTIONS.map((t) => /* @__PURE__ */ React.createElement("button", {
        key: t.id, onClick: () => setSec(t.id),
        className: `px-3 py-2 text-sm -mb-px border-b-2 ${sec === t.id ? "border-indigo-600 text-indigo-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`
      }, t.label))
    ),
    sec === "plans" && /* @__PURE__ */ React.createElement(FeePlanSetup, { db, user, commit, showToast }),
    sec === "clients" && /* @__PURE__ */ React.createElement(BillingClients, { db, user, commit, showToast }),
    sec === "invoices" && /* @__PURE__ */ React.createElement(BillingInvoices, { db, user, commit, showToast }),
    sec === "receipts" && /* @__PURE__ */ React.createElement(BillingReceipts, { db, user, commit, showToast }),
    sec === "settings" && /* @__PURE__ */ React.createElement(BillingSettingsSection, { db, user, commit, showToast })
  );
}
// A document (bill or receipt) shown as it will arrive, with a print option.
function DocModal({ title, html, qr, onClose, actions }) {
  const print = () => {
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${title}</title></head><body style="margin:24px">${previewHtml(html, qr)}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4", onClick: onClose },
    /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col", onClick: (e) => e.stopPropagation() },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 px-5 py-3 border-b border-slate-100" },
        /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold text-slate-800" }, title),
        /* @__PURE__ */ React.createElement("div", { className: "ml-auto flex items-center gap-2" },
          actions,
          /* @__PURE__ */ React.createElement("button", { onClick: print, className: "text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" }, "Print / save PDF"),
          /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "text-slate-400 hover:text-slate-600" }, /* @__PURE__ */ React.createElement(X, { size: 18 }))
        )
      ),
      /* @__PURE__ */ React.createElement("div", { className: "overflow-y-auto p-5 bg-slate-50" },
        /* @__PURE__ */ React.createElement("div", { className: "bg-white p-5 rounded-xl border border-slate-200", dangerouslySetInnerHTML: { __html: previewHtml(html, qr) } })
      )
    )
  );
}
// Which fee plan each client is on, and the state that decides their GST. Without a
// row here a client is simply not billed - the quarter run says so rather than
// guessing a plan or a place of supply.
function BillingClients({ db, user, commit, showToast }) {
  const isAdmin = user?.role === "admin";
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [firstTrades, setFirstTrades] = useState(null);
  const [bulkPlan, setBulkPlan] = useState("");
  const [picked, setPicked] = useState(() => /* @__PURE__ */ new Set());
  const plans = useMemo(() => Object.values(db.feePlans || {}).filter((p) => p.status !== "Inactive")
    .sort((a, b) => feePlanAnnual(a) - feePlanAnnual(b)), [db.feePlans]);
  const profiles = db.billingProfiles || {};
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.values(db.clients || {})
      .map((c) => ({ c, p: profiles[c.code] || null }))
      .filter(({ c }) => !needle || String(c.name || "").toLowerCase().includes(needle) || String(c.code || "").toLowerCase().includes(needle))
      .sort((a, b) => String(a.c.name || a.c.code).localeCompare(String(b.c.name || b.c.code)));
  }, [db.clients, profiles, q]);
  const missing = rows.filter(({ p }) => !p || !p.planId).length;

  useEffect(() => {
    const url = (db.sheetUrl || "").trim();
    if (!url) return;
    let dead = false;
    pullFirstTrades(url).then((f) => { if (!dead) setFirstTrades(f); }).catch(() => { if (!dead) setFirstTrades({}); });
    return () => { dead = true; };
  }, [db.sheetUrl]);

  const saveProfile = async (code, patch) => {
    const c = (db.clients || {})[code] || {};
    const cur = profiles[code] || { code, name: c.name || code, residency: "Resident", status: "Active" };
    const rec = { ...cur, ...patch, code, name: c.name || cur.name || code, updatedAt: Date.now() };
    if (rec.planId) rec.planName = ((db.feePlans || {})[rec.planId] || {}).name || "";
    setBusy(true);
    try {
      const next = await commit((d) => {
        d.billingProfiles = { ...d.billingProfiles || {}, [code]: rec };
      }, "billing setup");
      await pushBillingProfiles(next, [rec]);
    } finally { setBusy(false); }
    return rec;
  };
  const applyBulkPlan = async () => {
    if (!bulkPlan || !picked.size) return;
    const planName = ((db.feePlans || {})[bulkPlan] || {}).name || "";
    const recs = [];
    for (const code of picked) {
      const c = (db.clients || {})[code] || {};
      const cur = profiles[code] || { code, residency: "Resident", status: "Active" };
      recs.push({ ...cur, code, name: c.name || code, planId: bulkPlan, planName, updatedAt: Date.now() });
    }
    setBusy(true);
    try {
      const next = await commit((d) => {
        const all = { ...d.billingProfiles || {} };
        for (const r of recs) all[r.code] = r;
        d.billingProfiles = all;
      }, "billing setup (bulk)");
      await pushBillingProfiles(next, recs);
    } finally { setBusy(false); }
    setPicked(/* @__PURE__ */ new Set());
    showToast(`${recs.length} client(s) put on ${planName}.`);
  };
  const toggle = (code) => setPicked((s2) => {
    const n = new Set(s2);
    n.has(code) ? n.delete(code) : n.add(code);
    return n;
  });
  const sel = "px-2 py-1 text-[12px] border border-slate-200 rounded-md bg-white max-w-[190px]";
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-3" },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3 flex-wrap" },
      /* @__PURE__ */ React.createElement("div", null,
        /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-semibold text-slate-800" }, "Client billing setup"),
        /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 max-w-3xl" }, "Which fee plan each client is on, and the state that decides their GST. A client with no fee plan here is not billed at all — the quarter run lists them rather than guessing.")
      ),
      missing > 0 && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" },
        /* @__PURE__ */ React.createElement("b", null, missing), " client(s) have no fee plan yet and will not be billed.")
    ),
    isAdmin && /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap" },
      /* @__PURE__ */ React.createElement("div", { className: "relative" },
        /* @__PURE__ */ React.createElement(Search, { size: 14, className: "absolute left-3 top-2.5 text-slate-400" }),
        /* @__PURE__ */ React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search client", className: "pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500" })
      ),
      /* @__PURE__ */ React.createElement("span", { className: "text-[12px] text-slate-400" }, picked.size, " selected"),
      /* @__PURE__ */ React.createElement("select", { value: bulkPlan, onChange: (e) => setBulkPlan(e.target.value), className: sel },
        /* @__PURE__ */ React.createElement("option", { value: "" }, "Put selected on…"),
        plans.map((p) => /* @__PURE__ */ React.createElement("option", { key: p.id, value: p.id }, p.name))
      ),
      /* @__PURE__ */ React.createElement("button", { onClick: applyBulkPlan, disabled: busy || !bulkPlan || !picked.size, className: "text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40" }, "Apply"),
      /* @__PURE__ */ React.createElement("button", { onClick: () => setPicked(new Set(rows.map((r) => r.c.code))), className: "text-xs text-indigo-600 hover:underline" }, "Select all"),
      /* @__PURE__ */ React.createElement("button", { onClick: () => setPicked(/* @__PURE__ */ new Set()), className: "text-xs text-slate-500 hover:underline" }, "Clear")
    ),
    /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" },
      /* @__PURE__ */ React.createElement("div", { style: { maxHeight: "62vh", overflowY: "auto" } },
        /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" },
          /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0" },
            /* @__PURE__ */ React.createElement("tr", null,
              isAdmin && /* @__PURE__ */ React.createElement("th", { className: "w-8 px-3 py-2" }),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Client"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Fee plan"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Residency"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "State for GST"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Billing starts"),
              isAdmin && /* @__PURE__ */ React.createElement("th", { className: "w-10 px-3 py-2" })
            )
          ),
          /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" },
            rows.map(({ c, p }) => {
              const nri = (p || {}).residency === "NRI";
              const ft = firstTrades ? firstTrades[c.code] || "" : null;
              const start = (p || {}).billingStart || "";
              return /* @__PURE__ */ React.createElement("tr", { key: c.code, className: p && p.status === "Inactive" ? "opacity-50" : "" },
                isAdmin && /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                  /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: picked.has(c.code), onChange: () => toggle(c.code) })),
                /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                  /* @__PURE__ */ React.createElement("div", { className: "text-slate-800" }, c.name || c.code),
                  /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, c.code, (p || {}).gstin ? ` · GSTIN ${p.gstin}` : "")
                ),
                /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                  isAdmin ? /* @__PURE__ */ React.createElement("select", { value: (p || {}).planId || "", onChange: (e) => saveProfile(c.code, { planId: e.target.value }), className: sel + ((p || {}).planId ? "" : " border-amber-300 bg-amber-50") },
                    /* @__PURE__ */ React.createElement("option", { value: "" }, "— not billed —"),
                    plans.map((x) => /* @__PURE__ */ React.createElement("option", { key: x.id, value: x.id }, x.name))
                  ) : /* @__PURE__ */ React.createElement("span", { className: "text-[12px] text-slate-600" }, (p || {}).planName || "—")
                ),
                /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                  isAdmin ? /* @__PURE__ */ React.createElement("select", { value: (p || {}).residency || "Resident", onChange: (e) => saveProfile(c.code, { residency: e.target.value }), className: sel },
                    ["Resident", "NRI"].map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x }, x))
                  ) : /* @__PURE__ */ React.createElement("span", { className: "text-[12px] text-slate-600" }, (p || {}).residency || "Resident")
                ),
                /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                  isAdmin ? /* @__PURE__ */ React.createElement(React.Fragment, null,
                    /* @__PURE__ */ React.createElement("select", { value: (nri ? (p || {}).permanentState : (p || {}).state) || "", onChange: (e) => saveProfile(c.code, nri ? { permanentState: e.target.value } : { state: e.target.value }), className: sel + ((nri ? (p || {}).permanentState : (p || {}).state) ? "" : " border-amber-300 bg-amber-50") },
                      /* @__PURE__ */ React.createElement("option", { value: "" }, "— not set —"),
                      INDIAN_STATES.map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x }, x)),
                      nri && /* @__PURE__ */ React.createElement("option", { value: OUTSIDE_INDIA }, OUTSIDE_INDIA)
                    ),
                    nri && /* @__PURE__ */ React.createElement("div", { className: "text-[10px] text-slate-400 mt-0.5" }, "permanent residence")
                  ) : /* @__PURE__ */ React.createElement("span", { className: "text-[12px] text-slate-600" }, placeOfSupplyFor(p) || "—")
                ),
                /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px]" },
                  start
                    ? /* @__PURE__ */ React.createElement("span", { className: "text-slate-700" }, fmtDay(start), /* @__PURE__ */ React.createElement("div", { className: "text-[10px] text-slate-400" }, "set by hand"))
                    : ft === null
                      ? /* @__PURE__ */ React.createElement("span", { className: "text-slate-300" }, "…")
                      : ft
                        ? /* @__PURE__ */ React.createElement("span", { className: "text-slate-600" }, fmtDay(ft), /* @__PURE__ */ React.createElement("div", { className: "text-[10px] text-slate-400" }, "first trade"))
                        : /* @__PURE__ */ React.createElement("span", { className: "text-amber-600" }, "no trade yet")
                ),
                isAdmin && /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right" },
                  /* @__PURE__ */ React.createElement(IconBtn, { title: "More billing details", onClick: () => setEditing({ ...(p || { code: c.code, name: c.name || c.code, residency: "Resident", status: "Active" }), _clientName: c.name || c.code, _firstTrade: ft }) }, /* @__PURE__ */ React.createElement(Edit3, { size: 15 }))
                )
              );
            }),
            !rows.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: isAdmin ? 7 : 5, className: "px-3 py-10 text-center text-slate-400 text-sm" }, Object.keys(db.clients || {}).length ? "No client matches that search." : "No clients yet — import them under Upload Data first."))
          )
        )
      )
    ),
    /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400" }, "“Billing starts” is the first executed trade found on the account, which is what a new client's first quarter is charged from. Set it by hand only to override that — for an account transferred in with history, or a fee holiday."),
    editing && /* @__PURE__ */ React.createElement(BillingProfileEditor, {
      draft: editing, busy,
      onCancel: () => setEditing(null),
      onSave: async (d) => { await saveProfile(d.code, d); setEditing(null); showToast("Billing details saved."); }
    })
  );
}
function BillingProfileEditor({ draft, busy, onSave, onCancel }) {
  const [f, setF] = useState(draft);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const inCls = "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const lbl = "text-[11px] text-slate-500 block mb-1";
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4", onClick: onCancel },
    /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto", onClick: (e) => e.stopPropagation() },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-1" },
        /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold text-slate-800" }, "Billing details — ", f._clientName || f.code),
        /* @__PURE__ */ React.createElement("button", { onClick: onCancel, className: "ml-auto text-slate-400 hover:text-slate-600" }, /* @__PURE__ */ React.createElement(X, { size: 18 }))
      ),
      /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mb-4" }, "Client code ", f.code),
      /* @__PURE__ */ React.createElement("div", { className: "space-y-3" },
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "GSTIN (only if the client is registered)"),
          /* @__PURE__ */ React.createElement("input", { value: f.gstin || "", onChange: (e) => set("gstin", e.target.value.toUpperCase()), placeholder: "22AAAAA0000A1Z5", className: inCls })
        ),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Billing start date — overrides the first trade"),
          /* @__PURE__ */ React.createElement("input", { type: "date", value: f.billingStart || "", onChange: (e) => set("billingStart", e.target.value), className: inCls }),
          /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mt-1" },
            f._firstTrade ? `First executed trade on record: ${fmtDay(f._firstTrade)}. Leave this blank to bill from there.` : "No executed trade found on this account yet. Without a date here the client is not billed.")
        ),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Billing email — leave blank to use the client's usual email"),
          /* @__PURE__ */ React.createElement("input", { value: f.email || "", onChange: (e) => set("email", e.target.value), placeholder: "accounts@example.com", className: inCls })
        ),
        /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" },
          /* @__PURE__ */ React.createElement("div", null,
            /* @__PURE__ */ React.createElement("label", { className: lbl }, "Billing status"),
            /* @__PURE__ */ React.createElement("select", { value: f.status || "Active", onChange: (e) => set("status", e.target.value), className: inCls },
              ["Active", "Inactive"].map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x }, x)))
          ),
          /* @__PURE__ */ React.createElement("div", null,
            /* @__PURE__ */ React.createElement("label", { className: lbl }, "Residency"),
            /* @__PURE__ */ React.createElement("select", { value: f.residency || "Resident", onChange: (e) => set("residency", e.target.value), className: inCls },
              ["Resident", "NRI"].map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x }, x)))
          )
        ),
        /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" },
          /* @__PURE__ */ React.createElement("div", null,
            /* @__PURE__ */ React.createElement("label", { className: lbl }, "State of residence"),
            /* @__PURE__ */ React.createElement("select", { value: f.state || "", onChange: (e) => set("state", e.target.value), className: inCls },
              /* @__PURE__ */ React.createElement("option", { value: "" }, "— not set —"),
              INDIAN_STATES.map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x }, x)))
          ),
          (f.residency === "NRI") && /* @__PURE__ */ React.createElement("div", null,
            /* @__PURE__ */ React.createElement("label", { className: lbl }, "Permanent residence state"),
            /* @__PURE__ */ React.createElement("select", { value: f.permanentState || "", onChange: (e) => set("permanentState", e.target.value), className: inCls },
              /* @__PURE__ */ React.createElement("option", { value: "" }, "— not set —"),
              INDIAN_STATES.map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x })),
              /* @__PURE__ */ React.createElement("option", { value: OUTSIDE_INDIA }, OUTSIDE_INDIA))
          )
        ),
        /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" },
          "GST will be charged on a place of supply of ", /* @__PURE__ */ React.createElement("b", null, placeOfSupplyFor(f) || "— not set —"),
          f.residency === "NRI" ? " (an NRI's permanent Indian address, or an export if they are outside India)." : "."),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Notes"),
          /* @__PURE__ */ React.createElement("input", { value: f.notes || "", onChange: (e) => set("notes", e.target.value), className: inCls })
        )
      ),
      /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 mt-5" },
        /* @__PURE__ */ React.createElement("button", { onClick: () => onSave(f), disabled: busy, className: "flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 rounded-lg disabled:opacity-50" }, busy ? "Saving…" : "Save"),
        /* @__PURE__ */ React.createElement("button", { onClick: onCancel, className: "px-4 text-sm text-slate-500 hover:text-slate-700" }, "Cancel")
      )
    )
  );
}
// The quarter's bills. Opens on the quarter that has just closed and generates it if
// that has not happened yet, which is what "billed on the first day of the quarter"
// comes to in a console that only runs while someone has it open.
function BillingInvoices({ db, user, commit, showToast }) {
  const isAdmin = user?.role === "admin";
  const st = billingSettingsOf(db);
  const [periodKey, setPeriodKey] = useState(() => billableQuarter(new Date()).key);
  const [busy, setBusy] = useState(false);
  const [firstTrades, setFirstTrades] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [waOpen, setWaOpen] = useState(false);
  const [sentWA, setSentWA] = useState(() => /* @__PURE__ */ new Set());
  const ranRef = useRef("");

  // The last eight closed quarters, so an older period can be re-opened or corrected.
  const periods = useMemo(() => {
    const out = [];
    let d = new Date();
    for (let i = 0; i < 8; i++) {
      const qq = i === 0 ? billableQuarter(d) : prevQuarter(d);
      out.push(qq);
      d = new Date(qq.from.getTime() - DAY_MS);
    }
    return out;
  }, []);
  const quarter = useMemo(() => periods.find((x) => x.key === periodKey) || periods[0], [periods, periodKey]);
  const invoices = useMemo(() => Object.values(db.invoices || {}).filter((x) => x.period === periodKey)
    .sort((a, b) => String(a.no).localeCompare(String(b.no), "en", { numeric: true })), [db.invoices, periodKey]);

  const effOfLocal = (h) => effOf(h, db.prices);
  const cashCodeL = db.cashCode || {};
  const auaOf = (c) => {
    let v = 0;
    for (const h of Object.values(c.holdings || {})) if (num(h.quantity) > 0) v += effOfLocal(h).current;
    return v + num(cashCodeL[String(c.code || "").trim()]);
  };

  useEffect(() => {
    const url = (db.sheetUrl || "").trim();
    if (!url) { setFirstTrades({}); return; }
    let dead = false;
    pullFirstTrades(url).then((f) => { if (!dead) setFirstTrades(f); }).catch(() => { if (!dead) setFirstTrades({}); });
    return () => { dead = true; };
  }, [db.sheetUrl]);

  const runQuarter = (quiet) => {
    const res = buildQuarterRun({
      quarter, clients: db.clients, profiles: db.billingProfiles, plans: db.feePlans,
      firstTrades: firstTrades || {}, settings: st, existing: db.invoices, auaOf
    });
    setLastRun(res);
    return res;
  };
  const generate = async (quiet) => {
    const res = runQuarter();
    if (!res.bills.length) {
      if (!quiet) showToast(res.repeats.length ? "Every eligible client already has a bill for this quarter." : "Nothing to bill for this quarter.", "err");
      return res;
    }
    const now = Date.now();
    const recs = res.bills.map((b) => ({ ...b, updatedAt: now }));
    setBusy(true);
    try {
      const next = await commit((d) => {
        const all = { ...d.invoices || {} };
        for (const r of recs) all[r.id] = r;
        d.invoices = all;
        d.lastBillRun = quarter.key;
      }, "generate quarter bills");
      await pushInvoices(next, recs);
    } finally { setBusy(false); }
    showToast(`${recs.length} bill(s) generated for ${quarter.label}. Nothing has been emailed yet.`);
    return res;
  };
  // Auto-generate once per quarter, the first time the console is opened after it
  // closes. Nothing is sent by this - the bills just exist, ready to review.
  useEffect(() => {
    if (!isAdmin || firstTrades === null || busy) return;
    if (periodKey !== billableQuarter(new Date()).key) return;
    if (ranRef.current === periodKey) return;
    if ((db.lastBillRun || "") === periodKey) { ranRef.current = periodKey; runQuarter(); return; }
    if (!Object.keys(db.feePlans || {}).length || !Object.keys(db.billingProfiles || {}).length) return;
    ranRef.current = periodKey;
    generate(true);
  }, [isAdmin, firstTrades, periodKey, db.lastBillRun, db.feePlans, db.billingProfiles, busy]);
  useEffect(() => { if (firstTrades !== null) runQuarter(); }, [firstTrades, periodKey, db.invoices, db.billingProfiles, db.feePlans]);

  const saveInvoices = async (recs, label) => {
    const next = await commit((d) => {
      const all = { ...d.invoices || {} };
      for (const r of recs) all[r.id] = r;
      d.invoices = all;
    }, label);
    await pushInvoices(next, recs);
    return next;
  };
  const unsent = invoices.filter((x) => !x.emailedAt && String(x.email || "").includes("@") && x.status !== "Cancelled");
  const emailThese = async (list) => {
    const withEmail = list.filter((x) => String(x.email || "").includes("@"));
    if (!withEmail.length) { showToast("None of those have an email address on file.", "err"); return; }
    setBusy(true);
    const r = await sendBillingEmail(db, withEmail.map((inv) => ({
      email: inv.email,
      subject: `Investment advisory fee — ${fmtDay(inv.from)} to ${fmtDay(inv.to)} — invoice ${inv.no}`,
      // The bill IS the body, and rides along as a PDF the client can file.
      html: invoiceHtml(inv, st),
      pdfName: `Invoice ${String(inv.no).split("/").join("-")}`,
      qr: invoiceQr(inv, st),
      text: `Your investment advisory fee bill for ${fmtDay(inv.from)} to ${fmtDay(inv.to)} is ${rupee(inv.total)} (invoice ${inv.no}).`
    })), st.upiQr);
    if (r.ok) {
      // Only the addresses Gmail actually accepted are marked as mailed. An older
      // backend does not report them, and there the count is all we have to go on.
      const at = Date.now();
      const took = r.sentTo ? new Set(r.sentTo.map((x) => String(x).toLowerCase())) : null;
      const done = took ? withEmail.filter((x) => took.has(String(x.email).toLowerCase())) : withEmail;
      if (done.length) await saveInvoices(done.map((x) => ({ ...x, emailedAt: at, updatedAt: at })), "email bills");
    }
    setBusy(false);
    showToast(r.msg, r.ok ? "ok" : "err");
  };
  const markPaid = async (inv, form) => {
    const at = Date.now();
    // A receipt belongs to the year it is written in, not the year it is billing for.
    const rcFy = fyQuarter(new Date()).fyLabel;
    const no = docNo(st.receiptPrefix, rcFy, 0,
      nextDocSeq(Object.values(db.invoices || {}).map((x) => (x.receipt || {}).no), st.receiptPrefix, rcFy, st.receiptSeedFy, st.receiptSeedNo));
    const rec = { ...inv, status: "Paid", updatedAt: at,
      receipt: { no, paidOn: form.paidOn, mode: form.mode, ref: form.ref, at, by: user?.name || "staff" } };
    setBusy(true);
    try { await saveInvoices([rec], "record payment"); } finally { setBusy(false); }
    setPaying(null);
    showToast(`Receipt ${no} created, dated today.`);
  };
  const removeInvoice = async (inv) => {
    if (!window.confirm(`Delete bill ${inv.no} for ${inv.name}? Do this only if it was generated in error — to void a bill you have already sent, mark it cancelled instead.`)) return;
    setBusy(true);
    try {
      const next = await commit((d) => {
        const all = { ...d.invoices || {} };
        delete all[inv.id];
        d.invoices = all;
      }, "delete bill");
      await deleteInvoiceOnSheet(next, inv.id);
    } finally { setBusy(false); }
    showToast("Bill deleted.");
  };
  const cancelInvoice = async (inv) => {
    if (!window.confirm(`Mark ${inv.no} cancelled? It stays on record with its number, and the client can be billed again for this quarter.`)) return;
    await saveInvoices([{ ...inv, status: "Cancelled", updatedAt: Date.now() }], "cancel bill");
    showToast("Bill cancelled.");
  };
  const waList = invoices.filter((x) => x.status !== "Cancelled" && waNumber(waOf(db, x.code)));
  const sendWaOne = (inv) => {
    const n = waNumber(waOf(db, inv.code));
    if (!n) { showToast("No WhatsApp number on file for this client.", "err"); return; }
    window.open(waChatUrl(n, invoiceWaText(inv, st, inv.emailedAt ? new Date(inv.emailedAt) : new Date())), "_blank");
    setSentWA((s2) => new Set(s2).add(inv.code));
    saveInvoices([{ ...inv, waAt: Date.now(), updatedAt: Date.now() }], "whatsapp bill");
  };
  const exportRun = () => {
    const rows = invoices.map((x) => ({
      "Invoice no": x.no, "Client code": x.code, Client: x.name, Email: x.email, "Fee plan": x.planName,
      From: x.from, To: x.to, Basis: x.basis, Days: x.days, "Days in quarter": x.daysInQuarter,
      Fee: x.fee, "Place of supply": x.placeOfSupply, "GST mode": x.gstMode, CGST: x.cgst, SGST: x.sgst,
      IGST: x.igst, Total: x.total, Status: x.status,
      Emailed: x.emailedAt ? new Date(x.emailedAt).toLocaleString("en-IN") : "",
      "Receipt no": (x.receipt || {}).no || "", "Paid on": (x.receipt || {}).paidOn || ""
    }));
    if (!rows.length) { showToast("Nothing to export.", "err"); return; }
    downloadExcelRows(rows, `bills-${periodKey}`);
  };

  const totals = invoices.filter((x) => x.status !== "Cancelled").reduce((a, x) => ({
    fee: a.fee + num(x.fee), tax: a.tax + num(x.cgst) + num(x.sgst) + num(x.igst), total: a.total + num(x.total)
  }), { fee: 0, tax: 0, total: 0 });
  const setupGaps = [];
  if (!st.firmGstin) setupGaps.push("the firm's GSTIN");
  if (!st.accountNo && !st.upiId) setupGaps.push("a bank account or UPI id to collect into");
  const notYetRun = isAdmin && periodKey === billableQuarter(new Date()).key && !invoices.length;

  return /* @__PURE__ */ React.createElement("div", { className: "space-y-3" },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3 flex-wrap" },
      /* @__PURE__ */ React.createElement("div", null,
        /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-semibold text-slate-800" }, "Invoices"),
        /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 max-w-3xl" }, "Fees are billed at the start of a quarter for the quarter just finished. A client who joined during the quarter is charged from their first executed trade, pro rata on days; everyone already on the books pays the full quarter.")
      ),
      /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 flex-wrap items-center" },
        /* @__PURE__ */ React.createElement("select", { value: periodKey, onChange: (e) => setPeriodKey(e.target.value), className: "px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" },
          periods.map((x) => /* @__PURE__ */ React.createElement("option", { key: x.key, value: x.key }, x.label))),
        isAdmin && /* @__PURE__ */ React.createElement("button", { onClick: () => generate(false), disabled: busy, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(RefreshCw, { size: 15 }), " Generate"),
        isAdmin && /* @__PURE__ */ React.createElement("button", { onClick: () => emailThese(unsent), disabled: busy || !unsent.length, className: "text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 disabled:opacity-40" }, /* @__PURE__ */ React.createElement(Mail, { size: 15 }), " Email all unsent (", unsent.length, ")"),
        /* @__PURE__ */ React.createElement("button", { onClick: () => setWaOpen((v) => !v), disabled: !waList.length, className: "text-sm px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5 disabled:opacity-40" }, /* @__PURE__ */ React.createElement(MessageCircle, { size: 15 }), " WhatsApp (", waList.length, ")"),
        /* @__PURE__ */ React.createElement("button", { onClick: exportRun, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Download, { size: 15 }), " Excel")
      )
    ),
    setupGaps.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2" },
      /* @__PURE__ */ React.createElement(AlertTriangle, { size: 14, className: "shrink-0 mt-0.5" }),
      /* @__PURE__ */ React.createElement("span", null, "Bank & GST is missing ", setupGaps.join(" and "), ". Bills will still generate, but fill that in before you send any.")),
    notYetRun && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" },
      "No bills for ", quarter.label, " yet. They generate on their own the first time the console is opened after the quarter closes — or press Generate."),
    invoices.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "grid sm:grid-cols-4 gap-2" },
      [["Bills", invoices.length], ["Fee", rupee(totals.fee)], ["GST", rupee(totals.tax)], ["Total billed", rupee(totals.total)]]
        .map(([k, v]) => /* @__PURE__ */ React.createElement("div", { key: k, className: "bg-white border border-slate-200 rounded-xl px-3 py-2" },
          /* @__PURE__ */ React.createElement("div", { className: "text-[10px] uppercase text-slate-400" }, k),
          /* @__PURE__ */ React.createElement("div", { className: "text-sm font-semibold text-slate-800 tabular-nums" }, v)))),
    /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" },
      /* @__PURE__ */ React.createElement("div", { style: { maxHeight: "58vh", overflowY: "auto" } },
        /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" },
          /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0" },
            /* @__PURE__ */ React.createElement("tr", null,
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Invoice"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Client"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Basis"),
              /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Fee"),
              /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "GST"),
              /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Total"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Status"),
              /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "")
            )),
          /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" },
            invoices.map((x) => /* @__PURE__ */ React.createElement("tr", { key: x.id, className: x.status === "Cancelled" ? "opacity-45 line-through" : "" },
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                /* @__PURE__ */ React.createElement("button", { onClick: () => setViewing(x), className: "text-indigo-600 hover:underline text-[12px]" }, x.no),
                /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, fmtDay(x.from), " – ", fmtDay(x.to))),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                /* @__PURE__ */ React.createElement("div", { className: "text-slate-800" }, x.name),
                /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, x.code, String(x.email || "").includes("@") ? "" : " · no email")),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px]" },
                x.basis === "Pro rata"
                  ? /* @__PURE__ */ React.createElement("span", { className: "text-amber-700" }, "Pro rata", /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, x.days, " of ", x.daysInQuarter, " days"))
                  : /* @__PURE__ */ React.createElement("span", { className: "text-slate-500" }, "Full quarter")),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-700" }, rupee(x.fee)),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600 text-[12px]" },
                rupee(num(x.cgst) + num(x.sgst) + num(x.igst)),
                /* @__PURE__ */ React.createElement("div", { className: `text-[10px] ${x.gstMode === "Not set" ? "text-rose-600" : "text-slate-400"}` }, x.gstMode)),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums font-medium text-slate-800" }, rupee(x.total)),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                /* @__PURE__ */ React.createElement("span", { className: `text-[10px] px-1.5 py-0.5 rounded ${x.status === "Paid" ? "bg-emerald-50 text-emerald-700" : x.status === "Cancelled" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}` }, x.status),
                /* @__PURE__ */ React.createElement("div", { className: "text-[10px] text-slate-400 mt-0.5" },
                  x.emailedAt ? `mailed ${fmtDay(new Date(x.emailedAt))}` : "not mailed", x.waAt ? " · wa" : "")),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right whitespace-nowrap" },
                /* @__PURE__ */ React.createElement(IconBtn, { title: "View bill", onClick: () => setViewing(x) }, /* @__PURE__ */ React.createElement(Eye, { size: 15 })),
                isAdmin && x.status !== "Cancelled" && /* @__PURE__ */ React.createElement(IconBtn, { title: x.emailedAt ? "Send again" : "Email this bill", tone: "mail", onClick: () => emailThese([x]) }, /* @__PURE__ */ React.createElement(Mail, { size: 15 })),
                x.status !== "Cancelled" && /* @__PURE__ */ React.createElement(IconBtn, { title: "WhatsApp the client", tone: "wa", onClick: () => sendWaOne(x) }, /* @__PURE__ */ React.createElement(MessageCircle, { size: 15 })),
                x.status === "Unpaid" && /* @__PURE__ */ React.createElement("button", { onClick: () => setPaying(x), className: "text-[11px] px-2 py-1 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 ml-1" }, "Mark paid"),
                isAdmin && x.status !== "Paid" && /* @__PURE__ */ React.createElement(IconBtn, { title: x.emailedAt ? "Cancel this bill" : "Delete this bill", tone: "danger", onClick: () => x.emailedAt ? cancelInvoice(x) : removeInvoice(x) }, /* @__PURE__ */ React.createElement(Trash2, { size: 15 })))
            )),
            !invoices.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 8, className: "px-3 py-10 text-center text-slate-400 text-sm" }, "No bills for ", quarter.label, " yet."))
          )
        )
      )
    ),
    waOpen && /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-3" },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-2" },
        /* @__PURE__ */ React.createElement("span", { className: "text-sm font-medium text-slate-700" }, "WhatsApp — one at a time"),
        /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 ml-auto" }, sentWA.size, " of ", waList.length, " opened")),
      /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mb-2" }, "The message says the bill is in their inbox and how to pay. It does not repeat the bill itself."),
      /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg divide-y divide-slate-100", style: { maxHeight: "40vh", overflowY: "auto" } },
        waList.map((x) => /* @__PURE__ */ React.createElement("div", { key: x.id, className: "flex items-center gap-2 px-3 py-2" },
          /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" },
            /* @__PURE__ */ React.createElement("div", { className: "text-sm text-slate-800 truncate flex items-center gap-1.5" }, sentWA.has(x.code) && /* @__PURE__ */ React.createElement(Check, { size: 13, className: "text-emerald-600 shrink-0" }), x.name),
            /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, waDisplay(waOf(db, x.code)), " · ", rupee(x.total), x.emailedAt ? "" : " · bill not emailed yet")),
          /* @__PURE__ */ React.createElement("button", { onClick: () => sendWaOne(x), className: `text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5 shrink-0 ${sentWA.has(x.code) ? "border border-emerald-200 text-emerald-700 bg-emerald-50" : "bg-emerald-600 hover:bg-emerald-700 text-white"}` },
            /* @__PURE__ */ React.createElement(Send, { size: 12 }), " ", sentWA.has(x.code) ? "Again" : "Send")))
      )),
    lastRun && (lastRun.skipped.length > 0 || lastRun.repeats.length > 0) && /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-3" },
      /* @__PURE__ */ React.createElement("div", { className: "text-sm font-medium text-slate-700 mb-1" }, "Not billed this quarter (", lastRun.skipped.length, ")"),
      /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mb-2" }, "Fix the reason and press Generate again — only the newly eligible are added, nobody is billed twice."),
      /* @__PURE__ */ React.createElement("div", { className: "space-y-1", style: { maxHeight: "30vh", overflowY: "auto" } },
        lastRun.skipped.map((x) => /* @__PURE__ */ React.createElement("div", { key: x.code, className: "text-[12px] flex gap-2 flex-wrap" },
          /* @__PURE__ */ React.createElement("span", { className: "text-slate-700 min-w-[180px]" }, x.name),
          /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, x.why))))),
    viewing && /* @__PURE__ */ React.createElement(DocModal, {
      title: `Bill ${viewing.no} — ${viewing.name}`, html: invoiceHtml(viewing, st), qr: invoiceQr(viewing, st),
      onClose: () => setViewing(null),
      actions: isAdmin && viewing.status !== "Cancelled" ? /* @__PURE__ */ React.createElement("button", { onClick: () => { emailThese([viewing]); setViewing(null); }, className: "text-xs px-2.5 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700" }, viewing.emailedAt ? "Send again" : "Email this bill") : null
    }),
    paying && /* @__PURE__ */ React.createElement(PaymentEntry, { inv: paying, busy, user, onCancel: () => setPaying(null), onSave: (f) => markPaid(paying, f) })
  );
}
// Staff record the credit once it shows in the bank. The receipt is dated the day
// this entry is made, which is what the firm is certifying; the day the money
// actually moved is kept separately on the receipt.
function PaymentEntry({ inv, busy, user, onSave, onCancel }) {
  const [f, setF] = useState({ paidOn: ymd(new Date()), mode: "NEFT / IMPS", ref: "" });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const inCls = "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const lbl = "text-[11px] text-slate-500 block mb-1";
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4", onClick: onCancel },
    /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl w-full max-w-md p-5", onClick: (e) => e.stopPropagation() },
      /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold text-slate-800 mb-1" }, "Record payment"),
      /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 mb-4" }, inv.name, " · ", inv.no, " · ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, rupee(inv.total))),
      /* @__PURE__ */ React.createElement("div", { className: "space-y-3" },
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Credit appeared in the bank on"),
          /* @__PURE__ */ React.createElement("input", { type: "date", value: f.paidOn, max: ymd(new Date()), onChange: (e) => set("paidOn", e.target.value), className: inCls })),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Mode"),
          /* @__PURE__ */ React.createElement("select", { value: f.mode, onChange: (e) => set("mode", e.target.value), className: inCls },
            ["NEFT / IMPS", "UPI", "RTGS", "Cheque", "Bank transfer", "Other"].map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x }, x)))),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Bank reference / UTR"),
          /* @__PURE__ */ React.createElement("input", { value: f.ref, onChange: (e) => set("ref", e.target.value), placeholder: "as it appears on the statement", className: inCls })),
        /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" },
          "The receipt will be dated ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, fmtDay(new Date())), " — today, the day this entry is made — and signed off as ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, user?.name || "staff"), ".")
      ),
      /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 mt-5" },
        /* @__PURE__ */ React.createElement("button", { onClick: () => onSave(f), disabled: busy || !f.paidOn, className: "flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm py-2.5 rounded-lg disabled:opacity-50" }, busy ? "Saving…" : "Record payment & make receipt"),
        /* @__PURE__ */ React.createElement("button", { onClick: onCancel, className: "px-4 text-sm text-slate-500 hover:text-slate-700" }, "Cancel"))
    )
  );
}
// Every payment staff have recorded, with the receipt that came out of it.
function BillingReceipts({ db, user, commit, showToast }) {
  const isAdmin = user?.role === "admin";
  const st = billingSettingsOf(db);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const paid = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.values(db.invoices || {}).filter((x) => x.receipt && x.receipt.no)
      .filter((x) => !needle || String(x.name).toLowerCase().includes(needle) || String(x.code).toLowerCase().includes(needle) || String(x.receipt.no).toLowerCase().includes(needle))
      .sort((a, b) => num(b.receipt.at) - num(a.receipt.at));
  }, [db.invoices, q]);
  const total = paid.reduce((a, x) => a + num(x.total), 0);
  const emailReceipt = async (inv) => {
    if (!String(inv.email || "").includes("@")) { showToast("No email address on file for this client.", "err"); return; }
    setBusy(true);
    const r = await sendBillingEmail(db, [{
      email: inv.email,
      subject: `Receipt ${inv.receipt.no} — ${rupee(inv.total)} received against invoice ${inv.no}`,
      html: receiptHtml(inv, st),
      pdfName: `Receipt ${String(inv.receipt.no).split("/").join("-")}`,
      text: `Received with thanks ${rupee(inv.total)} towards invoice ${inv.no}. Receipt ${inv.receipt.no}.`
    }], "");
    setBusy(false);
    showToast(r.msg, r.ok ? "ok" : "err");
  };
  const waReceipt = (inv) => {
    const n = waNumber(waOf(db, inv.code));
    if (!n) { showToast("No WhatsApp number on file for this client.", "err"); return; }
    window.open(waChatUrl(n, receiptWaText(inv, st)), "_blank");
  };
  const exportAll = () => {
    const rows = paid.map((x) => ({
      "Receipt no": x.receipt.no, "Receipt date": ymd(new Date(x.receipt.at)), "Invoice no": x.no,
      "Client code": x.code, Client: x.name, Period: x.period, Amount: x.total,
      "Credited on": x.receipt.paidOn, Mode: x.receipt.mode, Reference: x.receipt.ref, "Entered by": x.receipt.by
    }));
    if (!rows.length) { showToast("Nothing to export.", "err"); return; }
    downloadExcelRows(rows, "receipts");
  };
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-3" },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3 flex-wrap" },
      /* @__PURE__ */ React.createElement("div", null,
        /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-semibold text-slate-800" }, "Receipts"),
        /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 max-w-3xl" }, "One receipt for every payment recorded against a bill. A receipt is dated the day staff entered the credit, not the day the money moved — both appear on it.")),
      /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 items-center flex-wrap" },
        /* @__PURE__ */ React.createElement("div", { className: "relative" },
          /* @__PURE__ */ React.createElement(Search, { size: 14, className: "absolute left-3 top-2.5 text-slate-400" }),
          /* @__PURE__ */ React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search receipts", className: "pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500" })),
        /* @__PURE__ */ React.createElement("button", { onClick: exportAll, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Download, { size: 15 }), " Excel"))),
    /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" },
      /* @__PURE__ */ React.createElement("div", { className: "px-3 py-2 border-b border-slate-100 text-[12px] text-slate-500" }, paid.length, " receipt(s) · ", rupee(total), " collected"),
      /* @__PURE__ */ React.createElement("div", { style: { maxHeight: "62vh", overflowY: "auto" } },
        /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" },
          /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0" },
            /* @__PURE__ */ React.createElement("tr", null,
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Receipt"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Client"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Against"),
              /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Amount"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Credited"),
              /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, ""))),
          /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" },
            paid.map((x) => /* @__PURE__ */ React.createElement("tr", { key: x.id },
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                /* @__PURE__ */ React.createElement("button", { onClick: () => setViewing(x), className: "text-indigo-600 hover:underline text-[12px]" }, x.receipt.no),
                /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, "dated ", fmtDay(new Date(x.receipt.at)))),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" },
                /* @__PURE__ */ React.createElement("div", { className: "text-slate-800" }, x.name),
                /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, x.code)),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, x.no,
                /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, fmtDay(x.from), " – ", fmtDay(x.to))),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-800" }, rupee(x.total)),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, fmtDay(x.receipt.paidOn),
                /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, x.receipt.mode, x.receipt.ref ? ` · ${x.receipt.ref}` : "", " · by ", x.receipt.by)),
              /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right whitespace-nowrap" },
                /* @__PURE__ */ React.createElement(IconBtn, { title: "View receipt", onClick: () => setViewing(x) }, /* @__PURE__ */ React.createElement(Eye, { size: 15 })),
                isAdmin && /* @__PURE__ */ React.createElement(IconBtn, { title: "Email the receipt", tone: "mail", onClick: () => emailReceipt(x) }, /* @__PURE__ */ React.createElement(Mail, { size: 15 })),
                /* @__PURE__ */ React.createElement(IconBtn, { title: "WhatsApp the receipt", tone: "wa", onClick: () => waReceipt(x) }, /* @__PURE__ */ React.createElement(MessageCircle, { size: 15 }))))),
            !paid.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 6, className: "px-3 py-10 text-center text-slate-400 text-sm" }, "No payments recorded yet. Mark a bill paid under Invoices and the receipt appears here."))))
      )),
    viewing && /* @__PURE__ */ React.createElement(DocModal, {
      title: `Receipt ${viewing.receipt.no} — ${viewing.name}`, html: receiptHtml(viewing, st),
      onClose: () => setViewing(null),
      actions: isAdmin ? /* @__PURE__ */ React.createElement("button", { onClick: () => { emailReceipt(viewing); setViewing(null); }, disabled: busy, className: "text-xs px-2.5 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50" }, "Email the receipt") : null
    })
  );
}
// The firm's own GST details and the ONE account clients are told to pay into.
function BillingSettingsSection({ db, user, commit, showToast }) {
  const isAdmin = user?.role === "admin";
  const [f, setF] = useState(() => billingSettingsOf(db));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => { setF(billingSettingsOf(db)); }, [db.billingSettings]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const inCls = "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50";
  const lbl = "text-[11px] text-slate-500 block mb-1";
  // The QR travels to every device and gets inlined into the bill mail, so it is
  // shrunk to something a Google Sheets cell and an email can both carry.
  const pickQr = (file) => {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const side = Math.min(420, Math.max(img.width, img.height) || 420);
        const cv = document.createElement("canvas");
        cv.width = side; cv.height = side;
        const cx = cv.getContext("2d");
        cx.fillStyle = "#ffffff";
        cx.fillRect(0, 0, side, side);
        cx.drawImage(img, 0, 0, side, side);
        const out = cv.toDataURL("image/png");
        if (out.length > 44000) { showToast("That QR image is too large even after shrinking. Save it smaller and try again.", "err"); return; }
        set("upiQr", out);
        showToast("QR loaded. Press Save to keep it.");
      };
      img.onerror = () => showToast("That file could not be read as an image.", "err");
      img.src = String(rd.result || "");
    };
    rd.readAsDataURL(file);
  };
  const save = async () => {
    const row = { ...f, gstRate: num(f.gstRate), invoiceSeedNo: num(f.invoiceSeedNo), receiptSeedNo: num(f.receiptSeedNo),
      cgStcgRate: num(f.cgStcgRate), cgLtcgRate: num(f.cgLtcgRate), cgLtcgExempt: num(f.cgLtcgExempt), cgCess: num(f.cgCess),
      updatedAt: Date.now() };
    setBusy(true);
    try {
      const next = await commit((d) => { d.billingSettings = row; }, "billing settings");
      await pushBillingSettings(next, row);
    } finally { setBusy(false); }
    showToast("Billing settings saved.");
  };
  const thisFy = fyQuarter(new Date()).fyLabel;
  const fyChoices = [thisFy, fyQuarter(new Date(Date.now() - 400 * DAY_MS)).fyLabel].filter((v, i, a) => a.indexOf(v) === i);
  const nextInvoiceNo = docNo(f.invoicePrefix || "VIAS", thisFy, f.numberByQuarter ? billableQuarter(new Date()).q : 0,
    nextDocSeq(Object.values(db.invoices || {}).map((x) => x.no), f.invoicePrefix || "VIAS", thisFy, f.invoiceSeedFy, f.invoiceSeedNo));
  const fld = (k, label, ph, type) => {
    const warn = billingFieldWarning(k, f[k]);
    return /* @__PURE__ */ React.createElement("div", null,
      /* @__PURE__ */ React.createElement("label", { className: lbl }, label),
      /* @__PURE__ */ React.createElement("input", { type: type || "text", value: f[k] == null ? "" : f[k], onChange: (e) => set(k, e.target.value), placeholder: ph || "", disabled: !isAdmin, className: inCls + (warn ? " border-amber-400" : "") }),
      warn && /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-amber-700 mt-1 flex gap-1" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 12, className: "shrink-0 mt-0.5" }), warn));
  };
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-4 max-w-4xl" },
    /* @__PURE__ */ React.createElement("div", null,
      /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-semibold text-slate-800" }, "Bank & GST"),
      /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500" }, "What goes at the top of every bill, and the one account clients are told to pay into. Nothing else is ever printed on a bill.")),
    /* @__PURE__ */ React.createElement(Card, { title: "The firm", icon: FileText },
      /* @__PURE__ */ React.createElement("div", { className: "grid md:grid-cols-2 gap-3" },
        fld("firmName", "Name on the bill"),
        fld("address", "Address"),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "State the firm is registered in"),
          /* @__PURE__ */ React.createElement("select", { value: f.firmState || "", onChange: (e) => set("firmState", e.target.value), disabled: !isAdmin, className: inCls },
            /* @__PURE__ */ React.createElement("option", { value: "" }, "— not set —"),
            INDIAN_STATES.map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x }, x))),
          /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mt-1" }, "A client in this state is charged CGST + SGST; anywhere else in India is IGST.")),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "GST rate on advisory fees (%)"),
          /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.5", value: f.gstRate, onChange: (e) => set("gstRate", e.target.value), disabled: !isAdmin, className: inCls }),
          /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mt-1" }, "Split in half as CGST and SGST within the state. 18% is the usual rate.")),
        fld("firmGstin", "GSTIN", "32AAAAA0000A1Z5"),
        fld("pan", "PAN"),
        fld("cin", "CIN"),
        fld("sebiReg", "SEBI RIA registration no."))),
    /* @__PURE__ */ React.createElement(Card, { title: "Invoice and receipt numbers", icon: FileText },
      /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 mb-3" }, "Numbers run in one unbroken series to the end of the financial year and start again at 1 on 1 April. Today's year is ", /* @__PURE__ */ React.createElement("b", null, thisFy), "; the next bill would be ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, nextInvoiceNo), "."),
      /* @__PURE__ */ React.createElement("div", { className: "grid md:grid-cols-2 gap-3" },
        fld("invoicePrefix", "Invoice number prefix", "VIAS"),
        fld("receiptPrefix", "Receipt number prefix", "VIAS/R"),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Carry on the invoice series from number"),
          /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", value: f.invoiceSeedNo || "", onChange: (e) => set("invoiceSeedNo", e.target.value), placeholder: "e.g. 48", disabled: !isAdmin, className: inCls }),
          /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mt-1" }, "If your last bill this year was number 47, put 48 here and the first one from the console takes it.")),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "…in financial year"),
          /* @__PURE__ */ React.createElement("select", { value: f.invoiceSeedFy || "", onChange: (e) => set("invoiceSeedFy", e.target.value), disabled: !isAdmin, className: inCls },
            /* @__PURE__ */ React.createElement("option", { value: "" }, "— not carrying a series over —"),
            fyChoices.map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x }, x))),
          /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mt-1" }, "The seed only applies to this one year. Next 1 April the series starts at 1 on its own.")),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Carry on the receipt series from number"),
          /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", value: f.receiptSeedNo || "", onChange: (e) => set("receiptSeedNo", e.target.value), placeholder: "e.g. 12", disabled: !isAdmin, className: inCls })),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "…in financial year"),
          /* @__PURE__ */ React.createElement("select", { value: f.receiptSeedFy || "", onChange: (e) => set("receiptSeedFy", e.target.value), disabled: !isAdmin, className: inCls },
            /* @__PURE__ */ React.createElement("option", { value: "" }, "— not carrying a series over —"),
            fyChoices.map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x }, x))))),
      /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-2 text-[12px] text-slate-600 mt-3" },
        /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!f.numberByQuarter, onChange: (e) => set("numberByQuarter", e.target.checked), disabled: !isAdmin }),
        "Put the quarter in the number too (", f.invoicePrefix || "VIAS", "/", thisFy, "/Q1/001 instead of ", f.invoicePrefix || "VIAS", "/", thisFy, "/001)")),
    /* @__PURE__ */ React.createElement(Card, { title: "Capital gains tax rates", icon: Scale },
      /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 mb-3" }, "Used by the Capital Gains tab. The rates below are those for transfers on or after 23 July 2024 \u2014 change them here if a Budget moves them, or to work out an earlier year on the old basis."),
      /* @__PURE__ */ React.createElement("div", { className: "grid md:grid-cols-3 gap-3" },
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Short term, s.111A (%)"),
          /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.5", value: f.cgStcgRate == null ? CG_DEFAULTS.cgStcgRate : f.cgStcgRate, onChange: (e) => set("cgStcgRate", e.target.value), disabled: !isAdmin, className: inCls })),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Long term, s.112A (%)"),
          /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.5", value: f.cgLtcgRate == null ? CG_DEFAULTS.cgLtcgRate : f.cgLtcgRate, onChange: (e) => set("cgLtcgRate", e.target.value), disabled: !isAdmin, className: inCls })),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Long-term exemption a year (\u20B9)"),
          /* @__PURE__ */ React.createElement("input", { type: "number", step: "1000", value: f.cgLtcgExempt == null ? CG_DEFAULTS.cgLtcgExempt : f.cgLtcgExempt, onChange: (e) => set("cgLtcgExempt", e.target.value), disabled: !isAdmin, className: inCls })),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Health & education cess (%)"),
          /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.5", value: f.cgCess == null ? CG_DEFAULTS.cgCess : f.cgCess, onChange: (e) => set("cgCess", e.target.value), disabled: !isAdmin, className: inCls })))),
    /* @__PURE__ */ React.createElement(Card, { title: "Where clients pay", icon: Receipt },
      /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 mb-3" }, "These details are printed on every bill and repeated in the WhatsApp note, with a line telling the client to pay nowhere else."),
      /* @__PURE__ */ React.createElement("div", { className: "grid md:grid-cols-2 gap-3" },
        fld("accountName", "Account name"), fld("bankName", "Bank"),
        fld("accountNo", "Account number"), fld("ifsc", "IFSC"),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Account type"),
          /* @__PURE__ */ React.createElement("select", { value: f.accountType || "", onChange: (e) => set("accountType", e.target.value), disabled: !isAdmin, className: inCls },
            ["", "Current", "Savings"].map((x) => /* @__PURE__ */ React.createElement("option", { key: x || "none", value: x }, x || "\u2014 not stated \u2014")))),
        fld("branch", "Branch"), fld("upiId", "UPI id", "yourfirm@bank")),
      /* @__PURE__ */ React.createElement("div", { className: "mt-4 flex items-start gap-4 flex-wrap" },
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "UPI QR code"),
          f.upiQr
            ? /* @__PURE__ */ React.createElement("img", { src: f.upiQr, alt: "UPI QR", className: "w-32 h-32 border border-slate-200 rounded-lg bg-white" })
            : /* @__PURE__ */ React.createElement("div", { className: "w-32 h-32 border border-dashed border-slate-300 rounded-lg flex items-center justify-center text-[11px] text-slate-400 text-center px-2" }, "No QR yet")),
        isAdmin && /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-2 pt-5" },
          /* @__PURE__ */ React.createElement("label", { className: "text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1.5" },
            /* @__PURE__ */ React.createElement(Upload, { size: 14 }), " ", f.upiQr ? "Replace QR" : "Upload QR",
            /* @__PURE__ */ React.createElement("input", { type: "file", accept: "image/*", className: "hidden", onChange: (e) => { pickQr(e.target.files && e.target.files[0]); e.target.value = ""; } })),
          f.upiQr && /* @__PURE__ */ React.createElement("button", { onClick: () => set("upiQr", ""), className: "text-xs px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-100" }, "Remove QR"),
          /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 max-w-[220px]" }, "Shrunk to 420px and sent as an inline image, so it shows in the mail rather than being stripped."))),
      /* @__PURE__ */ React.createElement("div", { className: "mt-4" },
        /* @__PURE__ */ React.createElement("label", { className: lbl }, "Note at the foot of the bill (optional)"),
        /* @__PURE__ */ React.createElement("input", { value: f.notes || "", onChange: (e) => set("notes", e.target.value), disabled: !isAdmin, className: inCls }))),
    isAdmin && /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 items-center" },
      /* @__PURE__ */ React.createElement("button", { onClick: save, disabled: busy, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2.5 rounded-lg disabled:opacity-50" }, busy ? "Saving…" : "Save billing settings"),
      /* @__PURE__ */ React.createElement("button", { onClick: () => setPreview(true), className: "text-sm px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" }, "Preview a sample bill"),
      /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400" }, "Saved to the office sheet, so every device shows the same details.")),
    preview && /* @__PURE__ */ React.createElement(DocModal, {
      title: "Sample bill", qr: invoiceQr({ total: round2(15e3 * (1 + num(f.gstRate) / 100)), no: nextInvoiceNo }, f), onClose: () => setPreview(false),
      html: invoiceHtml({
        no: nextInvoiceNo, name: "Sample Client", code: "SAMPLE",
        gstin: "", placeOfSupply: f.firmState, planName: "Fixed Fee 15000 Per Quarter", basis: "Full quarter",
        from: ymd(billableQuarter(new Date()).from), to: ymd(billableQuarter(new Date()).to), days: 91, daysInQuarter: 91,
        fee: 15e3, gstMode: "CGST + SGST", cgst: round2(15e3 * num(f.gstRate) / 200), sgst: round2(15e3 * num(f.gstRate) / 200),
        igst: 0, total: round2(15e3 * (1 + num(f.gstRate) / 100)), issuedAt: Date.now()
      }, { ...f, gstRate: num(f.gstRate) })
    })
  );
}
// ====================== CAPITAL GAINS ===================================
// Realised gains for a financial year, what is still open and what it is worth
// today, and - the point of the thing - which losing positions could be sold
// before 31 March to bring the year's tax down.
function FeePlanSetup({ db, user, commit, showToast }) {
  const isAdmin = user?.role === "admin";
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const plans = useMemo(() => {
    const all = Object.values(db.feePlans || {});
    const needle = q.trim().toLowerCase();
    return all
      .filter((p) => !needle || String(p.name || "").toLowerCase().includes(needle) || String(p.notes || "").toLowerCase().includes(needle))
      .sort((a, b) => {
        // Cheapest first reads as a ladder, which is how you scan a fee list;
        // retired plans drop to the bottom rather than breaking it up.
        const off = (p) => p.status === "Inactive" ? 1 : 0;
        return off(a) - off(b) || feePlanAnnual(a) - feePlanAnnual(b) || String(a.name || "").localeCompare(String(b.name || ""));
      });
  }, [db.feePlans, q]);
  const total = Object.keys(db.feePlans || {}).length;
  const activeCount = Object.values(db.feePlans || {}).filter((p) => p.status !== "Inactive").length;

  const savePlan = async (draft) => {
    const name = String(draft.name || "").trim();
    if (!name) {
      showToast("Give the plan a name.", "err");
      return false;
    }
    const clash = Object.values(db.feePlans || {}).find(
      (p) => p.id !== draft.id && String(p.name || "").trim().toLowerCase() === name.toLowerCase()
    );
    if (clash) {
      showToast("A plan with that name already exists.", "err");
      return false;
    }
    const rec = {
      ...draft,
      id: draft.id || `fp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      amount: num(draft.amount),
      notes: String(draft.notes || "").trim(),
      updatedAt: Date.now()
    };
    setBusy(true);
    try {
      const next = await commit((d) => {
        d.feePlans = { ...d.feePlans || {}, [rec.id]: rec };
      }, draft.id ? "edit fee plan" : "add fee plan");
      await pushFeePlans(next, [rec]);
    } finally {
      setBusy(false);
    }
    showToast(draft.id ? "Fee plan updated." : `${name} added.`);
    return true;
  };
  const removePlan = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? Anything billed under it stays as it is; only the plan goes.`)) return;
    setBusy(true);
    try {
      const next = await commit((d) => {
        const rest = { ...d.feePlans || {} };
        delete rest[p.id];
        d.feePlans = rest;
      }, "delete fee plan");
      await deleteFeePlanOnSheet(next, p.id);
    } finally {
      setBusy(false);
    }
    showToast("Fee plan deleted.");
  };
  const addStarters = async () => {
    const have = new Set(Object.values(db.feePlans || {}).map((p) => String(p.name || "").trim().toLowerCase()));
    const recs = STARTER_FEE_PLANS.filter((x) => !have.has(x.name.trim().toLowerCase())).map((x, i) => ({
      ...BLANK_FEE_PLAN(),
      id: `fp_${Date.now().toString(36)}_${i}`,
      name: x.name,
      amount: x.amount,
      updatedAt: Date.now()
    }));
    if (!recs.length) {
      showToast("Those plans are already here.", "err");
      return;
    }
    setBusy(true);
    try {
      const next = await commit((d) => {
        const all = { ...d.feePlans || {} };
        for (const r of recs) all[r.id] = r;
        d.feePlans = all;
      }, "add starter fee plans");
      await pushFeePlans(next, recs);
    } finally {
      setBusy(false);
    }
    showToast(`${recs.length} fee plan(s) added.`);
  };
  const loadFromSheet = async () => {
    const url = (db.sheetUrl || "").trim();
    if (!url) {
      showToast("Connect the office Google Sheet in Settings first.", "err");
      return;
    }
    setBusy(true);
    try {
      const remote = await pullFeePlans(url);
      const n = Object.keys(remote).length;
      if (!n) {
        showToast("The sheet has no fee plans on it yet.", "err");
        return;
      }
      await commit((d) => {
        const merged = { ...d.feePlans || {} };
        for (const [id, v] of Object.entries(remote)) {
          if (!merged[id] || num(v.updatedAt) > num(merged[id].updatedAt)) merged[id] = v;
        }
        d.feePlans = merged;
      }, "load fee plans from sheet");
      showToast(`${n} fee plan(s) loaded from the sheet.`);
    } catch (e) {
      showToast("Couldn't reach the office Google Sheet.", "err");
    } finally {
      setBusy(false);
    }
  };
  const saveAllToSheet = async () => {
    const all = Object.values(db.feePlans || {});
    if (!all.length) {
      showToast("No fee plans to save yet.", "err");
      return;
    }
    setBusy(true);
    const ok = await pushFeePlans(db, all);
    setBusy(false);
    showToast(ok ? `${all.length} fee plan(s) sent to the sheet.` : "Couldn't reach the office Google Sheet.", ok ? "ok" : "err");
  };

  const cell = "px-3 py-2.5 text-sm";
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3 flex-wrap" },
      /* @__PURE__ */ React.createElement("div", null,
        /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-semibold text-slate-800" }, "Fee plan setup"),
        /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 max-w-3xl" }, "The fee plans the firm bills on. Every plan is stored in the office Google Sheet, so the same list shows up on every device. Add a plan here before you attach it to a client.")
      ),
      isAdmin && /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 flex-wrap" },
        /* @__PURE__ */ React.createElement("button", { onClick: loadFromSheet, disabled: busy, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Download, { size: 15 }), " Load from sheet"),
        /* @__PURE__ */ React.createElement("button", { onClick: saveAllToSheet, disabled: busy, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(RefreshCw, { size: 15 }), " Save all to sheet"),
        /* @__PURE__ */ React.createElement("button", { onClick: () => setEditing(BLANK_FEE_PLAN()), disabled: busy, className: "text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Plus, { size: 15 }), " Create fee plan")
      )
    ),
    /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 flex-wrap" },
        /* @__PURE__ */ React.createElement("div", { className: "relative" },
          /* @__PURE__ */ React.createElement(Search, { size: 14, className: "absolute left-3 top-2.5 text-slate-400" }),
          /* @__PURE__ */ React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search fee plans", className: "pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500" })
        ),
        /* @__PURE__ */ React.createElement("span", { className: "text-[12px] text-slate-500" }, "FEE PLAN (", total, ")", total ? ` · ${activeCount} active` : ""),
        q.trim() && /* @__PURE__ */ React.createElement("span", { className: "text-[12px] text-slate-400" }, plans.length, " shown")
      ),
      /* @__PURE__ */ React.createElement("div", { style: { maxHeight: "62vh", overflowY: "auto" } },
        /* @__PURE__ */ React.createElement("table", { className: "w-full" },
          /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0" },
            /* @__PURE__ */ React.createElement("tr", null,
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Fee plan"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Mode"),
              /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Amount"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Billing"),
              /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Per year"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "GST"),
              /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Status"),
              isAdmin && /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2 w-20" })
            )
          ),
          /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" },
            plans.map((p) => {
              const warn = feePlanCapWarning(p);
              const pct = p.mode === "% of AUA";
              return /* @__PURE__ */ React.createElement("tr", { key: p.id, className: p.status === "Inactive" ? "opacity-50" : "" },
                /* @__PURE__ */ React.createElement("td", { className: cell },
                  /* @__PURE__ */ React.createElement("div", { className: "text-slate-800" }, p.name),
                  p.notes && /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, p.notes),
                  warn && /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-amber-600 flex items-start gap-1 mt-0.5" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 12, className: "shrink-0 mt-0.5" }), warn)
                ),
                /* @__PURE__ */ React.createElement("td", { className: cell + " text-slate-500 text-[12px]" }, p.mode),
                /* @__PURE__ */ React.createElement("td", { className: cell + " text-right tabular-nums text-slate-700" }, pct ? `${num(p.amount)}%` : feeMoney(p.amount)),
                /* @__PURE__ */ React.createElement("td", { className: cell + " text-[12px] text-slate-500" }, p.frequency, /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, p.timing)),
                /* @__PURE__ */ React.createElement("td", { className: cell + " text-right tabular-nums text-slate-500 text-[12px]" }, FEE_PERIODS_PER_YEAR[p.frequency] ? pct ? `${feePlanAnnual(p).toFixed(2)}%` : feeMoney(feePlanAnnual(p)) : "—"),
                /* @__PURE__ */ React.createElement("td", { className: cell + " text-[12px] text-slate-500" }, p.gst),
                /* @__PURE__ */ React.createElement("td", { className: cell },
                  /* @__PURE__ */ React.createElement("span", { className: `text-[10px] px-1.5 py-0.5 rounded ${p.status === "Inactive" ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}` }, p.status || "Active")
                ),
                isAdmin && /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right whitespace-nowrap" },
                  /* @__PURE__ */ React.createElement(IconBtn, { title: "Edit", onClick: () => setEditing({ ...p }) }, /* @__PURE__ */ React.createElement(Edit3, { size: 15 })),
                  /* @__PURE__ */ React.createElement(IconBtn, { title: "Delete", tone: "danger", onClick: () => removePlan(p) }, /* @__PURE__ */ React.createElement(Trash2, { size: 15 }))
                )
              );
            }),
            !plans.length && /* @__PURE__ */ React.createElement("tr", null,
              /* @__PURE__ */ React.createElement("td", { colSpan: isAdmin ? 8 : 7, className: "px-3 py-10 text-center text-sm text-slate-400" },
                total ? "No fee plan matches that search." : /* @__PURE__ */ React.createElement(React.Fragment, null,
                  "No fee plans yet.",
                  isAdmin && /* @__PURE__ */ React.createElement("div", { className: "mt-3 flex items-center justify-center gap-2" },
                    /* @__PURE__ */ React.createElement("button", { onClick: () => setEditing(BLANK_FEE_PLAN()), className: "text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white" }, "Create the first one"),
                    /* @__PURE__ */ React.createElement("button", { onClick: addStarters, disabled: busy, className: "text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50" }, "Add the ", STARTER_FEE_PLANS.length, " plans already in use")
                  )
                )
              )
            )
          )
        )
      )
    ),
    /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400" }, "A plan's yearly figure is checked against the SEBI fee cap — ", feeMoney(SEBI_FIXED_FEE_CAP), " a year per family on fixed fees, or ", SEBI_AUA_CAP_PCT, "% of Assets under Advice. A plan over the cap is flagged but still saved, since the cap applies per family rather than per plan."),
    editing && /* @__PURE__ */ React.createElement(FeePlanEditor, { draft: editing, busy, onCancel: () => setEditing(null), onSave: async (d) => {
      const ok = await savePlan(d);
      if (ok) setEditing(null);
    } })
  );
}
function FeePlanEditor({ draft, busy, onSave, onCancel }) {
  const [f, setF] = useState(draft);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const inCls = "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const lbl = "text-[11px] text-slate-500 block mb-1";
  const pct = f.mode === "% of AUA";
  const warn = feePlanCapWarning({ ...f, amount: num(f.amount) });
  const perYear = feePlanAnnual({ ...f, amount: num(f.amount) });
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4", onClick: onCancel },
    /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto", onClick: (e) => e.stopPropagation() },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-4" },
        /* @__PURE__ */ React.createElement(Receipt, { size: 17 }),
        /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold text-slate-800" }, f.id ? "Edit fee plan" : "Create fee plan"),
        /* @__PURE__ */ React.createElement("button", { onClick: onCancel, className: "ml-auto text-slate-400 hover:text-slate-600" }, /* @__PURE__ */ React.createElement(X, { size: 18 }))
      ),
      /* @__PURE__ */ React.createElement("div", { className: "space-y-3" },
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Plan name *"),
          /* @__PURE__ */ React.createElement("input", { autoFocus: true, value: f.name, onChange: (e) => set("name", e.target.value), placeholder: "e.g. Fixed Fee 15000 Per Quarter", className: inCls })
        ),
        /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" },
          /* @__PURE__ */ React.createElement("div", null,
            /* @__PURE__ */ React.createElement("label", { className: lbl }, "Fee mode"),
            /* @__PURE__ */ React.createElement("select", { value: f.mode, onChange: (e) => set("mode", e.target.value), className: inCls }, FEE_MODES.map((m) => /* @__PURE__ */ React.createElement("option", { key: m, value: m }, m)))
          ),
          /* @__PURE__ */ React.createElement("div", null,
            /* @__PURE__ */ React.createElement("label", { className: lbl }, pct ? "Percent of AUA, per period" : "Amount per period (₹)"),
            /* @__PURE__ */ React.createElement("input", { type: "number", step: pct ? "0.05" : "1", value: f.amount, onChange: (e) => set("amount", e.target.value), placeholder: pct ? "e.g. 1.5" : "e.g. 15000", className: inCls })
          )
        ),
        /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" },
          /* @__PURE__ */ React.createElement("div", null,
            /* @__PURE__ */ React.createElement("label", { className: lbl }, "Billing frequency"),
            /* @__PURE__ */ React.createElement("select", { value: f.frequency, onChange: (e) => set("frequency", e.target.value), className: inCls }, FEE_FREQUENCIES.map((m) => /* @__PURE__ */ React.createElement("option", { key: m, value: m }, m)))
          ),
          /* @__PURE__ */ React.createElement("div", null,
            /* @__PURE__ */ React.createElement("label", { className: lbl }, "Billed"),
            /* @__PURE__ */ React.createElement("select", { value: f.timing, onChange: (e) => set("timing", e.target.value), className: inCls }, ["In advance", "In arrears"].map((m) => /* @__PURE__ */ React.createElement("option", { key: m, value: m }, m)))
          )
        ),
        /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" },
          /* @__PURE__ */ React.createElement("div", null,
            /* @__PURE__ */ React.createElement("label", { className: lbl }, "GST"),
            /* @__PURE__ */ React.createElement("select", { value: f.gst, onChange: (e) => set("gst", e.target.value), className: inCls }, FEE_GST.map((m) => /* @__PURE__ */ React.createElement("option", { key: m, value: m }, m)))
          ),
          /* @__PURE__ */ React.createElement("div", null,
            /* @__PURE__ */ React.createElement("label", { className: lbl }, "Status"),
            /* @__PURE__ */ React.createElement("select", { value: f.status, onChange: (e) => set("status", e.target.value), className: inCls }, ["Active", "Inactive"].map((m) => /* @__PURE__ */ React.createElement("option", { key: m, value: m }, m)))
          )
        ),
        /* @__PURE__ */ React.createElement("div", null,
          /* @__PURE__ */ React.createElement("label", { className: lbl }, "Notes (optional)"),
          /* @__PURE__ */ React.createElement("input", { value: f.notes, onChange: (e) => set("notes", e.target.value), placeholder: "Anything the team should know before putting a client on this plan", className: inCls })
        ),
        num(f.amount) > 0 && FEE_PERIODS_PER_YEAR[f.frequency] > 0 && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" },
          "Works out to ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-700" }, pct ? `${perYear.toFixed(2)}% of AUA` : feeMoney(perYear)), " a year."
        ),
        warn && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2" },
          /* @__PURE__ */ React.createElement(AlertTriangle, { size: 14, className: "shrink-0 mt-0.5" }),
          /* @__PURE__ */ React.createElement("span", null, warn, " You can still save it — the cap applies to everything a family is charged in a year, not to one plan.")
        )
      ),
      /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 mt-5" },
        /* @__PURE__ */ React.createElement("button", { onClick: () => onSave(f), disabled: busy || !String(f.name || "").trim(), className: "flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 rounded-lg disabled:opacity-50" }, busy ? "Saving…" : f.id ? "Save changes" : "Create fee plan"),
        /* @__PURE__ */ React.createElement("button", { onClick: onCancel, className: "px-4 text-sm text-slate-500 hover:text-slate-700" }, "Cancel")
      )
    )
  );
}

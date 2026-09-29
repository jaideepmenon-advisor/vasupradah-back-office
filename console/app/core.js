const {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback
} = React;

// Persistence for the standalone file: browser localStorage (per computer / browser).
window.storage = {
  async get(key) {
    const v = localStorage.getItem(key);
    return v == null ? null : {
      key,
      value: v
    };
  },
  async set(key, value) {
    localStorage.setItem(key, String(value));
    return {
      key,
      value
    };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return {
      key,
      deleted: true
    };
  },
  async list(prefix) {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!prefix || k.startsWith(prefix)) keys.push(k);
    }
    return {
      keys
    };
  }
};

// The signed-in person's own PocketBase login token, mirrored here from
// db.sheetToken (which is what actually persists, and what every POST body
// already sends) so the ~30 GET helpers below - which take a bare `url`
// string, not the whole `db` object - can reach it too, without changing
// every one of those function signatures. Kept in sync by App() whenever
// db.sheetToken changes (login, logout, or restoring a saved session).
let SESSION_TOKEN = "";
function withToken(url) {
  const u = (url || "").trim();
  if (!u) return u;
  return u + (u.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(SESSION_TOKEN);
}

// Inline icon set (lucide path data) so no icon library is needed.
const mkIcon = inner => function Icon({
  size = 18,
  className = ""
}) {
  return React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    dangerouslySetInnerHTML: {
      __html: inner
    }
  });
};
const Upload = mkIcon("<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"17 8 12 3 7 8\"/><line x1=\"12\" x2=\"12\" y1=\"3\" y2=\"15\"/>");
const Send = mkIcon("<path d=\"m22 2-7 20-4-9-9-4Z\"/><path d=\"M22 2 11 13\"/>");
const Trash2 = mkIcon("<path d=\"M3 6h18\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/><line x1=\"10\" x2=\"10\" y1=\"11\" y2=\"17\"/><line x1=\"14\" x2=\"14\" y1=\"11\" y2=\"17\"/>");
const Settings = mkIcon("<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>");
const Search = mkIcon("<circle cx=\"11\" cy=\"11\" r=\"8\"/><path d=\"m21 21-4.3-4.3\"/>");
const LogOut = mkIcon("<path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/><polyline points=\"16 17 21 12 16 7\"/><line x1=\"21\" x2=\"9\" y1=\"12\" y2=\"12\"/>");
const Users = mkIcon("<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><path d=\"M16 3.13a4 4 0 0 1 0 7.75\"/>");
const FileSpreadsheet = mkIcon("<path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\"/><path d=\"M14 2v5h5\"/><path d=\"M8 13h2\"/><path d=\"M14 13h2\"/><path d=\"M8 17h2\"/><path d=\"M14 17h2\"/>");
const Plus = mkIcon("<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>");
const X = mkIcon("<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>");
const Edit3 = mkIcon("<path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z\"/>");
const Eye = mkIcon("<path d=\"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>");
const Download = mkIcon("<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" x2=\"12\" y1=\"15\" y2=\"3\"/>");
const ShieldCheck = mkIcon("<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z\"/><path d=\"m9 12 2 2 4-4\"/>");
const AlertTriangle = mkIcon("<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>");
const RefreshCw = mkIcon("<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/>");
const Check = mkIcon("<path d=\"M20 6 9 17l-5-5\"/>");
const MessageCircle = mkIcon("<path d=\"M7.9 20A9 9 0 1 0 4 16.1L2 22Z\"/>");
const Lock = mkIcon("<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>");
const Layers = mkIcon("<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z\"/><path d=\"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65\"/><path d=\"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65\"/>");
const Contact = mkIcon("<path d=\"M16 2v2\"/><path d=\"M7 22v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2\"/><path d=\"M8 2v2\"/><circle cx=\"12\" cy=\"11\" r=\"3\"/><rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"2\"/>");
const Mail = mkIcon("<rect width=\"20\" height=\"16\" x=\"2\" y=\"4\" rx=\"2\"/><path d=\"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7\"/>");
const Bell = mkIcon("<path d=\"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9\"/><path d=\"M10.3 21a1.94 1.94 0 0 0 3.4 0\"/>");
const TrendingUp = mkIcon("<polyline points=\"22 7 13.5 15.5 8.5 10.5 2 17\"/><polyline points=\"16 7 22 7 22 13\"/>");
const Calendar = mkIcon("<path d=\"M8 2v4\"/><path d=\"M16 2v4\"/><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"/><path d=\"M3 10h18\"/>");
const Share2 = mkIcon("<circle cx=\"18\" cy=\"5\" r=\"3\"/><circle cx=\"6\" cy=\"12\" r=\"3\"/><circle cx=\"18\" cy=\"19\" r=\"3\"/><line x1=\"8.59\" x2=\"15.42\" y1=\"13.51\" y2=\"17.49\"/><line x1=\"15.41\" x2=\"8.59\" y1=\"6.51\" y2=\"10.49\"/>");
const FileText = mkIcon("<path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\"/><path d=\"M14 2v4a2 2 0 0 0 2 2h4\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/><path d=\"M10 9H8\"/>");


const DB_KEY = "vasupradah_db_v2";
const PRICES_KEY = "vasupradah_prices_v1";
const TRADES_KEY = "vasupradah_trades_v1";
const POLL_MS = 4e3;
const PRICE_MS = 12e4;
const SYNC_MS = 18e4;
const HIST_CAP = 4;
const DEFAULT_APPROVE_TO = "pratheep.kambalath@iiflcapital.com, kavyajaigopal@vasupradah.com, beenarenjith@gmail.com, minicr@vasupradah.com, jaideepmenon@vasupradah.com";
const OLD_APPROVE_TO = "jaideepmenon@vasupradah.com, kavyajaigopal@vasupradah.com, pratheep.kambalath@iiflcapital.com, beenarenjith@gmail.com, minicr@vasupradah.com";
const DEFAULT_REJECT_TO = "jaideepmenon@vasupradah.com, kavyajaigopal@vasupradah.com, minicr@vasupradah.com";
const OLD_REJECT_TO = "jaideepmenon@vasupradah.com";
const DEFAULT_APPROVE_TEXT = "Place this order as GTC";
const defaultDB = () => ({
  version: 1,
  clients: {},
  history: [],
  staff: [],
  adminName: "Jaideep Menon",
  adminPin: null,
  advisorName: "Jaideep Menon",
  sebiRegNo: "INHxxxxxxxxx",
  template: DEFAULT_TEMPLATE,
  lineTemplate: DEFAULT_LINE,
  adviceTemplate: DEFAULT_ADVICE,
  reportTemplate: DEFAULT_REPORT,
  advice: {},
  reportLink: "",
  prices: {},
  cash: {},
  cashCode: {},
  status: {},
  statusCode: {},
  // How each client acts on advice: "email" (approve/reject by reply) or
  // "gateway" (one-click execute link). Keyed by client code; unset = email.
  execMode: {},
  execModeAt: {},
  adviceContacts: {},
  // Billing: fee plans keyed by id. See BillingTab.
  feePlans: {},
  // Billing: per-client setup (plan, state, resident/NRI), issued invoices keyed by
  // id, and the firm's own GST + bank details. See BillingTab.
  billingProfiles: {},
  invoices: {},
  billingSettings: {},
  lastBillRun: "",
  waOpenMode: "auto",
  approveTo: DEFAULT_APPROVE_TO,
  rejectTo: DEFAULT_REJECT_TO,
  approveText: DEFAULT_APPROVE_TEXT,
  pricesAt: null,
  sheetUrl: "",
  sheetToken: "",
  autoBackup: false,
  teamSync: false,
  // Single-stock concentration limits, as % of the client's TOTAL assets (holdings + cash).
  // "default" applies to any risk category without its own override.
  concLimits: { default: 10 },
  lastAction: null
});
const hasStore = typeof window !== "undefined" && window.storage;
async function loadDB() {
  if (!hasStore) return null;
  try {
    const r = await window.storage.get(DB_KEY, true);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function saveDB(db) {
  if (!hasStore) return true;
  try {
    await window.storage.set(DB_KEY, JSON.stringify(db), true);
    return true;
  } catch (e) {
    try {
      await window.storage.set(DB_KEY, JSON.stringify({ ...db, history: [] }), true);
      return true;
    } catch (e2) {
      console.error("save failed", e2);
      return false;
    }
  }
}
const EMPTY_PRICES = { prices: {}, cash: {}, cashCode: {}, status: {}, statusCode: {}, pricesAt: null, pv: 0 };
async function loadPrices() {
  if (!hasStore) return null;
  try {
    const r = await window.storage.get(PRICES_KEY, true);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function savePricesStore(p) {
  if (!hasStore) return true;
  try {
    await window.storage.set(PRICES_KEY, JSON.stringify(p), true);
    return true;
  } catch (e) {
    console.error("price save failed", e);
    return false;
  }
}
async function loadTrades() {
  if (!hasStore) return null;
  try {
    const r = await window.storage.get(TRADES_KEY, true);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function saveTrades(t) {
  if (!hasStore) return "memory";
  try {
    await window.storage.set(TRADES_KEY, JSON.stringify(t), true);
    return "full";
  } catch (e) {
    try {
      await window.storage.set(TRADES_KEY, JSON.stringify({ v: 1, marker: true, count: t && t.trades ? t.trades.length : 0, updatedAt: Date.now() }), true);
    } catch (e2) {
    }
    return "marker";
  }
}
const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
};
const fmtINR = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const fmtNum = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const today = () => (/* @__PURE__ */ new Date()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const pnlOf = (h) => {
  const p = num(h.current) - num(h.invested);
  return { pnl: p, pnlPct: num(h.invested) ? p / num(h.invested) * 100 : 0 };
};
const effOf = (h, prices) => {
  const s = String(h.stock || "").toUpperCase();
  const px = prices && prices[s];
  const live = px != null && !isNaN(px) && Number(px) > 0;
  const invested = num(h.invested);
  if (live) {
    const currentPrice = Number(px);
    const current = currentPrice * num(h.quantity);
    const pnl = current - invested;
    return { currentPrice, current, invested, pnl, pnlPct: invested ? pnl / invested * 100 : 0, live: true, priced: true };
  }
  const storedPx = num(h.currentPrice);
  const storedVal = num(h.current);
  if (storedPx > 0 || storedVal > 0) {
    const currentPrice = storedPx;
    const current = storedVal > 0 ? storedVal : storedPx * num(h.quantity);
    const pnl = current - invested;
    return { currentPrice, current, invested, pnl, pnlPct: invested ? pnl / invested * 100 : 0, live: false, priced: true };
  }
  return { currentPrice: 0, current: invested, invested, pnl: 0, pnlPct: 0, live: false, priced: false };
};
const RISK_CATEGORIES = ["Low Risk", "Medium to Low Risk", "Medium to High Risk", "High Risk", "SIP"];
const VP_LOGO = "data:image/png;base64,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41/4vEMJNthcSM7GyNkyS5Gxt2DcY49tTJAcqtIkQExAcellq3/vjZ+cmu62R5doS62EIFK6IHoVrrhiy+WXff2C825+z3te3B0FVIPK5i2Dc8674Stf+dHtd8yUrXGheNLZjUs4RJHntmSCif9UggkFESweAZefhd6SeYDRsIibIMrc9IFkyLsFXbdh6h8+9p2zz7xzy4aiVZYWRtUWxdqq2jdu7l1xxSX/+ZWrfuO5u/7R2541Pt6ONWVI8XVG0otgv/s7x/3hlV8VFB4SpTmMOWxaCYXJ1QqgBjw5zUoI7r5r0/nn33zZFbfce/+W6am639OJjVNveOPR2+8wXsdBYSUBdxcVujupYh//1CVf+PIV969+qFV2CxsxW0T4oJc2313dfPvNp373xkMO2uatb3vmgfutSqlWSRlmOhyq54CqREil2hlMDA7eb4eTn7Vvcmpu5ZAKB+hUU7no4ts+8rffufHGGWCsbHXNOhnbdv+DvOue1aeffstuu53zht97xnOf8+S60WcTESFj4+4ByYB3Fy281eq95jXHqMJTk+vlklNMDBYeWt//27/91pmn3zk1E4pWK4SFqkJqb6a+7MrJSy+87AtfPO95L9zn9//g2eNj7TpFaLRZ/DvIuboMHuCzuvnedFJdBUhZM5/6hS+e+x+fv/S+e3smY2WrwxQF4a571v/wnG997ZsX/M37f3OPXZYzKkRcwQYe7yuXjey88zbX3jBdluWPafCFxznEhlhJBYV0p5ft9urV67//g2tf/puHOpOICYJAReGeDjpk1ycdsOqCi+/vji52DChRIAKjR4QkGDz9GXuPjlqMDEFzMklCVNzxrW9cllJy9p/1nKNGxqSqWRQKusDUJCUJoX3+OXf86Tv+Y8ukjIwuSantUPeYPUAIWoaWIj24dsu7/uI/b71+7Z++45SiFCICOUKoIQoEQsBAioqLVAvGRwDALUOoQSZ6EHz58+cMJpcvWrhiJm6i9RSlewkYEEVje6StPn7qN67vjnbe977nbtg8+M43r/jON6+/5bZ1rt2i3QUQvQpFVrX4FZg7LHTuuXvTW97y6RtvXj82vnTBgq47gUiRYOJMRYluZ2EapC99/vK7bl/30Y++esU2neQJKLLGsUhKTIccttsBB6265OrVFkbch0nSVnYf1UgmSKCLmd5939QXP3PeWadfv2FD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";
const VasupradahMark = ({ height = 34 }) => /* @__PURE__ */ React.createElement("img", { src: VP_LOGO, alt: "Vasupradah Investment Advisors", style: { height, width: "auto", display: "block" } });
const SHORT_CACHE = {};
async function shortenLink(db, url) {
  if (!url) return url;
  if (SHORT_CACHE[url]) return SHORT_CACHE[url];
  const base = (db.sheetUrl || "").trim();
  if (!base) return url;
  try {
    const res = await fetch(withToken(base) + "&shorten=1&u=" + encodeURIComponent(url));
    const d = await res.json();
    if (d && d.ok && d.short) {
      SHORT_CACHE[url] = d.short;
      return d.short;
    }
  } catch (e) {
  }
  return url;
}
function normalizeRisk(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^[1-5]$/.test(s)) return RISK_CATEGORIES[+s - 1];
  const low = s.toLowerCase();
  const exact = RISK_CATEGORIES.find((c) => c.toLowerCase() === low);
  if (exact) return exact;
  const t = low.replace(/[^a-z]/g, "");
  const map = {
    lowrisk: "Low Risk",
    low: "Low Risk",
    mediumtolowrisk: "Medium to Low Risk",
    mediumtolow: "Medium to Low Risk",
    mediumlow: "Medium to Low Risk",
    medtolow: "Medium to Low Risk",
    ml: "Medium to Low Risk",
    mediumtohighrisk: "Medium to High Risk",
    mediumtohigh: "Medium to High Risk",
    mediumhigh: "Medium to High Risk",
    medtohigh: "Medium to High Risk",
    mh: "Medium to High Risk",
    highrisk: "High Risk",
    high: "High Risk",
    sip: "SIP"
  };
  return map[t] || s;
}
// The order-link login number, falling back to the WhatsApp number when a client
// has no separate advice contact on file.
const EXEC_MODE_LABEL = { email: "Email approval", gateway: "Execute link" };
const execModeOf = (db, code) => (db && db.execMode || {})[String(code ?? "").trim()] === "gateway" ? "gateway" : "email";
const mailList = (s) => String(s || "").split(/[,;]/).map((x) => x.trim()).filter((x) => x.includes("@"));
// navigator.clipboard only exists in a secure context, so it is undefined when this
// console is opened as a local file:// page. Fall back to execCommand, and report
// failure honestly rather than claiming a copy that never happened.
async function copyText(text) {
  const s = String(text == null ? "" : text);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch (e) {
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = s;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, s.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch (e) {
    return false;
  }
}
const COPY_FAILED = "Couldn't reach the clipboard — select the text and copy it manually (Ctrl/Cmd+C).";
const approveReplyTo = (db) => mailList(db && db.approveTo != null ? db.approveTo : DEFAULT_APPROVE_TO).join(",");
const waDisplay = (s) => String(s || "").replace(/^'+/, "").trim();
function waNumber(raw) {
  const s = String(raw || "");
  const hasPlus = s.includes("+");
  const d = s.replace(/\D/g, "");
  if (!d) return "";
  if (hasPlus) return d;
  if (d.length === 10) return "91" + d;
  if (d.length === 11 && d.startsWith("0")) return "91" + d.slice(1);
  return d;
}
// Always use wa.me click-to-chat. The whatsapp:// scheme silently ignores the
// phone parameter on WhatsApp Desktop and drops the text into whichever chat
// happens to be open - which means one client's advice can land in another
// client's chat.
function openWaUrl(url) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
// How to open a chat. On a desktop, web.whatsapp.com is the only target that
// reliably lands on the right conversation: both wa.me and the whatsapp://
// scheme hand off to the installed app, which - when it is already running -
// simply focuses its window on whatever chat was last open. On a phone the
// opposite is true, so "auto" sends mobile to wa.me and desktop to the web app.
let WA_OPEN_MODE = "auto";
const isMobileUA = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
function waChatUrl(n, text) {
  const t = encodeURIComponent(text || "");
  const mode = WA_OPEN_MODE === "auto" ? isMobileUA() ? "link" : "web" : WA_OPEN_MODE;
  if (mode === "app") return `whatsapp://send?phone=${n}&text=${t}`;
  if (mode === "link") return `https://wa.me/${n}?text=${t}`;
  return `https://web.whatsapp.com/send?phone=${n}&text=${t}`;
}
function openWhatsApp(number, text) {
  const n = waNumber(number);
  if (!n || n.length < 8 || n.length > 15) return false;
  return openWaUrl(waChatUrl(n, text));
}
const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_MAP = {
  portfoliocode: "code",
  clientcode: "code",
  code: "code",
  portfolioname: "descriptor",
  clientname: "name",
  name: "name",
  emailid: "email",
  email: "email",
  emailaddress: "email",
  mobilenumber: "whatsapp",
  whatsapp: "whatsapp",
  whatsappnumber: "whatsapp",
  mobile: "whatsapp",
  phone: "whatsapp",
  phonenumber: "whatsapp",
  riskcategory: "risk",
  risk: "risk",
  category: "risk",
  riskprofile: "risk",
  investmentcategory: "risk",
  categoryofinvestment: "risk",
  transtype: "action",
  transactiontype: "action",
  action: "action",
  type: "action",
  company: "company",
  companyname: "company",
  nse: "symbol",
  symbol: "symbol",
  nsesymbol: "symbol",
  scripsymbol: "symbol",
  price: "price",
  rate: "price",
  date: "date",
  tradedate: "date",
  quantity: "quantity",
  qty: "quantity",
  investedamount: "invested",
  invested: "invested",
  currentamount: "current",
  current: "current",
  realisedgain: "realisedGain",
  dividend: "dividend",
  todaysgain: "todaysGain",
  totalgain: "totalGain",
  weightage: "weightage"
};
const pickFields = (row) => {
  const rec = {};
  for (const k of Object.keys(row)) {
    const f = HEADER_MAP[normKey(k)];
    if (f) rec[f] = row[k];
  }
  return rec;
};
function joinPhone(cc, mobile) {
  const m = String(mobile ?? "").replace(/\D/g, "");
  const c = String(cc ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (!m) return "";
  if (!c) return waDisplay(mobile);
  return "+" + c + m;
}
const fill = (tpl, map) => String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => map[k] != null ? map[k] : `{${k}}`);
function toISO(s) {
  s = String(s == null ? "" : s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let [_, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt)) return dt.toISOString().slice(0, 10);
  return s;
}
function normTradeRow(row) {
  const g = {};
  for (const k in row) g[normKey(k)] = row[k];
  const pick = (...vs) => {
    for (const v of vs) {
      const s = String(v ?? "").trim();
      if (s) return s;
    }
    return "";
  };
  let action = pick(g.transactiontype, g.transtype, g.type, g.action, g.side).toUpperCase();
  action = action === "SELL" || action === "S" || action === "SALE" ? "SELL" : "BUY";
  const code = pick(g.portfoliocode, g.clientcode, g.ucc, g.code);
  const nse = pick(g.nsecode, g.symbol, g.nse, g.scrip);
  const isin = pick(g.isincode, g.isin).toUpperCase();
  const symbol = pick(nse, g.companyname, g.company, g.bsecode, isin).toUpperCase();
  const date = toISO(pick(g.date, g.tradedate, g.tradeddate));
  const qty = num(pick(g.quantity, g.qty));
  const price = num(pick(g.price, g.rate, g.netrateperunit));
  const amount = num(pick(g.billamount, g.amountwithbrokerage, g.totalamount, g.netamount, g.amount)) || Math.abs(qty * price);
  const name = pick(g.clientname, g.name, g.portfolioname);
  return { code, name, symbol, date, action, qty, price, amount, isin, hasNse: !!nse };
}
function aggregateTradeRows(rawRows) {
  const m = /* @__PURE__ */ new Map();
  const names = {};
  const lastPrice = {};
  let skipped = 0;
  const skippedRows = [];
  const isinSym = {};
  for (const row of rawRows) {
    const t = normTradeRow(row);
    if (!t.hasNse && t.isin) {
      t.symbol = isinSym[t.isin] || (isinSym[t.isin] = t.symbol);
    }
    if (!t.code || !t.symbol || !t.date || !t.qty) {
      skipped++;
      if (skippedRows.length < 5e3) skippedRows.push(row);
      continue;
    }
    if (t.name && !names[t.code]) names[t.code] = t.name;
    if (t.price) lastPrice[t.symbol] = t.price;
    const ac = t.action === "SELL" ? "S" : "B";
    const key = t.code + "|" + t.symbol + "|" + t.date + "|" + ac + "|" + t.price;
    const a = m.get(key);
    if (!a) m.set(key, [t.code, t.symbol, t.date, ac, t.qty, t.price, t.amount]);
    else {
      a[4] += t.qty;
      a[6] += t.amount;
    }
  }
  return { tuples: [...m.values()], names, lastPrice, skipped, skippedRows };
}
function mergeTradeStore(prev, add) {
  const keyOf = (t) => t[0] + "|" + t[1] + "|" + t[2] + "|" + t[3] + "|" + t[5];
  const map = /* @__PURE__ */ new Map();
  for (const t of prev?.trades || []) map.set(keyOf(t), t);
  for (const t of add.tuples) map.set(keyOf(t), t);
  const lastPrice = { ...prev?.lastPrice || {}, ...add.lastPrice };
  const names = { ...prev?.names || {}, ...add.names };
  return { v: 1, trades: [...map.values()], names, lastPrice, updatedAt: Date.now() };
}
function periodKey(d, mode) {
  return mode === "Q" ? `${d.slice(0, 4)}-Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}` : d.slice(0, 7);
}
function clientRows(db) {
  const stamp = (/* @__PURE__ */ new Date()).toLocaleString("en-IN");
  const out = [];
  for (const c of Object.values(db.clients)) {
    let wrote = 0;
    for (const h of Object.values(c.holdings || {})) {
      if (num(h.quantity) <= 0) continue;
      const e = effOf(h, db.prices);
      out.push([
        c.code,
        c.name || "",
        c.email || "",
        waDisplay(c.whatsapp),
        c.risk || "",
        h.stock,
        h.quantity,
        Number(h.purchasePrice || 0).toFixed(2),
        Number(e.currentPrice || 0).toFixed(2),
        e.invested,
        e.current,
        Number(e.pnl).toFixed(2),
        Number(e.pnlPct).toFixed(2),
        h.investedManual ? "Manual" : "Sheet",
        stamp
      ]);
      wrote++;
    }
    if (!wrote) {
      out.push([c.code, c.name || "", c.email || "", waDisplay(c.whatsapp), c.risk || "", "", 0, "0.00", "0.00", 0, 0, "0.00", "0.00", "Sheet", stamp]);
    }
  }
  return out;
}
function clientsSig(clients) {
  const codes = Object.keys(clients || {}).sort();
  return JSON.stringify(codes.map((code) => {
    const c = clients[code] || {};
    const hs = Object.keys(c.holdings || {}).sort().map((s) => {
      const h = c.holdings[s];
      return num(h.quantity) > 0 ? [s, num(h.quantity), Math.round(num(h.invested) * 100) / 100, h.investedManual ? 1 : 0] : null;
    }).filter(Boolean);
    return [code, c.name || "", c.email || "", waDisplay(c.whatsapp) || "", c.risk || "", hs];
  }));
}
function mergeStaffLists(local, remote) {
  const byKey = /* @__PURE__ */ new Map();
  for (const s of [...local || [], ...remote || []]) {
    const k = nameKey(s && s.name);
    if (k) byKey.set(k, { name: tidyName(s.name), enabled: !!(s && s.enabled) });
  }
  return [...byKey.values()];
}
// Returns the sheet's staff list, or null if the sheet could not be reached.
async function pullStaffFromSheet(url) {
  // ?staff=1 returns just the list. It replaced ?holdings=1, which also builds the
  // whole trade book on the way and left the sign-in screen hanging; the old call is
  // kept as a fallback so nobody is locked out before the backend is redeployed.
  const ask = async (q, ms) => {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
    try {
      const res = await fetch(withToken(url) + "&" + q, ctl ? { signal: ctl.signal } : void 0);
      const data = await res.json();
      return Array.isArray(data.staff) ? data.staff : null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  try {
    const quick = await ask("staff=1", 1e4);
    if (quick) return quick;
  } catch (e) {
  }
  try {
    return await ask("holdings=1", 3e4) || [];
  } catch (e) {
    return null;
  }
}
// Publishes the staff list on its own, so a name enabled (or disabled) in Settings
// reaches other devices immediately instead of waiting for the next full backup.
async function logAdviceTrace(db, entries) {
  if (!(db.sheetUrl || "").trim() || !entries || !entries.length) return;
  try {
    await fetch(db.sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "advice_trace", rows: entries })
    });
  } catch (e) {
  }
}
async function pullClientDetails(url) {
  const res = await fetch(withToken(url) + "&client_details=1");
  const data = await res.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length < 2) return {};
  const out = {};
  for (const r of rows.slice(1)) {
    const code = String(r[0] || "").trim();
    if (!code) continue;
    out[code] = {
      pan: String(r[1] || ""),
      address: String(r[2] || ""),
      phone: String(r[3] || ""),
      email: String(r[4] || ""),
      notes: String(r[5] || ""),
      updatedAt: num(r[6])
    };
  }
  return out;
}
async function pushClientDetails(db, row) {
  if (!(db.sheetUrl || "").trim()) return false;
  try {
    await fetch(db.sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "client_details", row })
    });
    return true;
  } catch (e) {
    return false;
  }
}
async function pullAdviceContacts(url) {
  const res = await fetch(withToken(url) + "&advice_contacts=1");
  const data = await res.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length < 2) return {};
  const out = {};
  for (const r of rows.slice(1)) {
    const code = String(r[0] || "").trim();
    if (!code) continue;
    const cc = String(r[3] || "").trim(), mob = waDisplay(r[4]);
    out[code] = {
      name: String(r[1] || ""),
      email: String(r[2] || "").trim(),
      cc,
      mobile: mob,
      phone: joinPhone(cc, mob),
      risk: String(r[5] || ""),
      pan: String(r[6] || ""),
      updatedAt: num(r[7])
    };
  }
  return out;
}
const DAY_MS = 864e5;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ymd = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
// A yyyy-mm-dd string as a LOCAL midnight Date. new Date("2026-04-01") is UTC
// midnight, which in IST is the previous day - that would misprice a client whose
// first trade lands on the first or last day of a quarter.
const dayOf = (v) => {
  // Duck-typed rather than `instanceof Date`, which is false for a Date made in
  // another realm (an iframe, a worker) and would silently blank out the date.
  if (v && typeof v.getTime === "function" && !isNaN(v.getTime())) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === "number" && isFinite(v) && v > 0) { const d = new Date(v); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  const m = String(v || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
function fyQuarter(anyDate) {
  const d = dayOf(anyDate) || new Date();
  const qi = Math.floor(((d.getMonth() + 9) % 12) / 3);
  const startMonth = [3, 6, 9, 0][qi];
  const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const year = qi === 3 ? fyStart + 1 : fyStart;
  const from = new Date(year, startMonth, 1);
  const to = new Date(year, startMonth + 3, 0);
  const fyLabel = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
  return { q: qi + 1, fyStart, fyLabel, from, to, key: `${fyLabel}-Q${qi + 1}`, label: `Q${qi + 1} ${fyLabel} (${monShort(from)}–${monShort(to)})` };
}
const monShort = (d) => d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const fmtDay = (v) => {
  const d = dayOf(v);
  return d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";
};
// Where the service is treated as supplied. For an NRI that is the Indian address on
// record, which is why the billing profile keeps a permanent state of its own.
function downloadExcelRows(rows, title) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Billing");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
// Light format checks on the few fields that go on every bill and are painful to get
// wrong. They warn rather than block - an unusual but real value must still be savable.
async function pullBillingProfiles(url) {
  const res = await fetch(withToken(url) + "&billing_profiles=1");
  const data = await res.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length < 2) return {};
  const out = {};
  for (const r of rows.slice(1)) {
    const code = String(r[0] || "").trim();
    if (!code) continue;
    out[code] = {
      code, name: String(r[1] || ""), planId: String(r[2] || ""), planName: String(r[3] || ""),
      residency: String(r[4] || "") || "Resident", state: String(r[5] || ""),
      permanentState: String(r[6] || ""), gstin: String(r[7] || ""), billingStart: String(r[8] || ""),
      email: String(r[9] || ""), status: String(r[10] || "") || "Active", notes: String(r[11] || ""),
      updatedAt: num(r[12])
    };
  }
  return out;
}
async function pullBillingSettings(url) {
  const res = await fetch(withToken(url) + "&billing_settings=1");
  const data = await res.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length < 2) return null;
  const r = rows[1];
  return {
    firmName: String(r[0] || ""), firmState: String(r[1] || ""), firmGstin: String(r[2] || ""),
    pan: String(r[3] || ""), sebiReg: String(r[4] || ""), address: String(r[5] || ""), gstRate: num(r[6]),
    bankName: String(r[7] || ""), accountName: String(r[8] || ""), accountNo: String(r[9] || "").replace(/^'/, ""),
    ifsc: String(r[10] || ""), branch: String(r[11] || ""), upiId: String(r[12] || ""), upiQr: String(r[13] || ""),
    invoicePrefix: String(r[14] || ""), receiptPrefix: String(r[15] || ""), notes: String(r[16] || ""),
    updatedAt: num(r[17]), cin: String(r[18] || ""), accountType: String(r[19] || ""),
    invoiceSeedFy: String(r[20] || ""), invoiceSeedNo: num(r[21]),
    receiptSeedFy: String(r[22] || ""), receiptSeedNo: num(r[23]), numberByQuarter: String(r[24] || "") === "yes",
    cgStcgRate: r[25] === "" || r[25] == null ? null : num(r[25]),
    cgLtcgRate: r[26] === "" || r[26] == null ? null : num(r[26]),
    cgLtcgExempt: r[27] === "" || r[27] == null ? null : num(r[27]),
    cgCess: r[28] === "" || r[28] == null ? null : num(r[28])
  };
}
async function pullInvoices(url, period) {
  const res = await fetch(withToken(url) + "&invoices=1" + (period ? "&period=" + encodeURIComponent(period) : ""));
  const data = await res.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length < 2) return {};
  const out = {};
  for (const r of rows.slice(1)) {
    const id = String(r[0] || "").trim();
    if (!id) continue;
    out[id] = {
      id, no: String(r[1] || ""), period: String(r[2] || ""), code: String(r[3] || ""), name: String(r[4] || ""),
      email: String(r[5] || ""), planName: String(r[6] || ""), from: String(r[7] || ""), to: String(r[8] || ""),
      days: num(r[9]), daysInQuarter: num(r[10]), basis: String(r[11] || ""), fee: num(r[12]),
      gstMode: String(r[13] || ""), cgst: num(r[14]), sgst: num(r[15]), igst: num(r[16]), total: num(r[17]),
      placeOfSupply: String(r[18] || ""), status: String(r[19] || "") || "Unpaid",
      issuedAt: num(r[20]), emailedAt: num(r[21]), waAt: num(r[22]),
      receipt: String(r[23] || "") ? { no: String(r[23]), paidOn: String(r[24] || ""), mode: String(r[25] || ""), ref: String(r[26] || ""), at: num(r[27]), by: String(r[28] || "") } : null,
      updatedAt: num(r[29])
    };
  }
  return out;
}
const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rupee = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Rupees in words, for the amount line every invoice is expected to carry.
const CG_DEFAULTS = {
  cgStcgRate: 20, cgLtcgRate: 12.5, cgLtcgExempt: 125000, cgCess: 4, cgSurcharge: 0
};
async function pullBaskets(url) {
  const res = await fetch(withToken(url) + "&baskets=1");
  const data = await res.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length < 2) return {};
  const out = {};
  for (const r of rows.slice(1)) {
    const cat = String(r[0] || "").trim(), sym = String(r[1] || "").trim().toUpperCase();
    if (!cat || !sym) continue;
    (out[cat] = out[cat] || []).push({
      symbol: sym,
      rationale: String(r[2] || ""),
      suitability: String(r[3] || ""),
      smallcase: String(r[4] || ""),
      report: String(r[5] || "")
    });
  }
  return out;
}
function mergeBaskets(local, remote) {
  const out = {};
  for (const [cat, list] of Object.entries(remote || {})) out[cat] = (list || []).slice();
  for (const [cat, list] of Object.entries(local || {})) {
    const byId = {};
    for (const b of out[cat] || []) byId[String(b.symbol).toUpperCase()] = b;
    for (const b of list || []) if (b && b.symbol) byId[String(b.symbol).toUpperCase()] = b;
    out[cat] = Object.values(byId);
  }
  return out;
}
async function backupToSheet(db, opts = {}) {
  if (!db.sheetUrl) return { ok: false, msg: "No Google Sheet web-app URL set." };
  const rows = clientRows(db);
  const clientCount = Object.keys(db.clients || {}).length;
  if (!opts.force) {
    if (clientCount === 0) {
      return { ok: false, msg: "Refused to push: this device has no clients. Pull from the sheet first, or upload holdings \u2014 the sheet's Holdings tab has been left untouched." };
    }
    try {
      const r = await fetch(withToken(db.sheetUrl) + "&holdings=1");
      const data = await r.json();
      const sheetHoldings = Array.isArray(data.holdings) ? data.holdings.length : 0;
      const sheetClients = Array.isArray(data.holdings) ? new Set(data.holdings.map((row) => String((Array.isArray(row) ? row[0] : row["Client code"]) || "").trim()).filter(Boolean)).size : 0;
      if (sheetClients > 0) {
        const SHRINK_THRESHOLD = 0.5;
        const shrinkPct = (sheetClients - clientCount) / sheetClients;
        if (shrinkPct > SHRINK_THRESHOLD) {
          return {
            ok: false,
            needsConfirm: true,
            sheetClients,
            sheetHoldings,
            deviceClients: clientCount,
            deviceHoldings: rows.length,
            msg: `Refused to push: sheet has ${sheetClients} client(s) with ${sheetHoldings} holding row(s), but this device would replace them with only ${clientCount} client(s) and ${rows.length} row(s). If this shrinkage is intended, use the \u201CForce push (override safety check)\u201D button in Settings.`
          };
        }
      }
    } catch (e) {
      return { ok: false, msg: "Refused to push: couldn't verify what's in the sheet right now. Check your internet and try again." };
    }
  }
  try {
    await fetch(db.sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", rows, staff: Array.isArray(db.staff) ? db.staff : [] })
    });
    return { ok: true, msg: `Sent ${clientCount} client(s), ${rows.length} row(s) to the Google Sheet.` };
  } catch (e) {
    return { ok: false, msg: "Could not reach the Google Sheet endpoint." };
  }
}
function App() {
  const [db, setDb] = useState(defaultDB());
  const [px, setPx] = useState(EMPTY_PRICES);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [saveWarn, setSaveWarn] = useState(false);
  const verRef = useRef(0);
  const pvRef = useRef(0);
  useEffect(() => {
    WA_OPEN_MODE = db.waOpenMode || "auto";
    SESSION_TOKEN = db.sheetToken || "";
  }, [db.waOpenMode, db.sheetToken]);
  useEffect(() => {
    (async () => {
      const loaded = await loadDB();
      if (loaded) {
        // The approval mail now goes To the dealer with the team in Cc. Anyone still
        // on the original default is moved across rather than having to retype it.
        let fixed = loaded;
        if (fixed.approveTo === OLD_APPROVE_TO) fixed = { ...fixed, approveTo: DEFAULT_APPROVE_TO };
        if (fixed.rejectTo === OLD_REJECT_TO) fixed = { ...fixed, rejectTo: DEFAULT_REJECT_TO };
        if (fixed !== loaded) await saveDB(fixed);
        setDb(fixed);
        verRef.current = fixed.version || 0;
      } else {
        const d = defaultDB();
        await saveDB(d);
        setDb(d);
        verRef.current = d.version;
      }
      const lp = await loadPrices();
      if (lp) {
        setPx({ ...EMPTY_PRICES, ...lp });
        pvRef.current = lp.pv || 0;
      }
      setReady(true);
    })();
  }, []);
  useEffect(() => {
    if (!hasStore) return;
    const t = setInterval(async () => {
      const latest = await loadDB();
      if (latest && (latest.version || 0) > verRef.current) {
        verRef.current = latest.version || 0;
        setDb(latest);
      }
      const lp = await loadPrices();
      if (lp && (lp.pv || 0) > pvRef.current) {
        pvRef.current = lp.pv || 0;
        setPx({ ...EMPTY_PRICES, ...lp });
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, []);
  const commit = useCallback(async (mutator, label) => {
    const latest = await loadDB() || db;
    const next = JSON.parse(JSON.stringify(latest));
    next.history = [...latest.history || [], JSON.stringify(latest.clients)].slice(-HIST_CAP);
    mutator(next);
    next.version = (latest.version || 0) + 1;
    next.lastAction = { by: user?.name || "system", type: label, at: Date.now() };
    verRef.current = next.version;
    setDb(next);
    const ok = await saveDB(next);
    if (!ok) setSaveWarn(true);
    if (next.teamSync && (next.sheetUrl || "").trim() && label !== "team sync pull" && Object.keys(next.clients || {}).length > 0 && user?.role === "admin") {
      backupToSheet(next);
    }
    return next;
  }, [db, user]);
  const undo = useCallback(async () => {
    const latest = await loadDB() || db;
    const hist = latest.history || [];
    if (!hist.length) return;
    const prevClients = JSON.parse(hist[hist.length - 1]);
    const next = { ...latest, clients: prevClients, history: hist.slice(0, -1) };
    next.version = (latest.version || 0) + 1;
    next.lastAction = { by: user?.name || "system", type: "undo", at: Date.now() };
    verRef.current = next.version;
    setDb(next);
    const ok = await saveDB(next);
    if (!ok) setSaveWarn(true);
    if (next.teamSync && (next.sheetUrl || "").trim() && Object.keys(next.clients || {}).length > 0 && user?.role === "admin") {
      backupToSheet(next);
    }
  }, [db, user]);
  const urlRef = useRef("");
  useEffect(() => {
    urlRef.current = (db.sheetUrl || "").trim();
  }, [db.sheetUrl]);
  const syncingRef = useRef(false);
  const syncPull = useCallback(async () => {
    const url = urlRef.current;
    if (!url || syncingRef.current) return;
    const latest = await loadDB() || db;
    const localCount = Object.keys(latest.clients || {}).length;
    if (!latest.teamSync && localCount > 0) return;
    syncingRef.current = true;
    try {
      const r = await pullHoldingsFromSheet(url);
      if (r && r.built && r.built.clientCount > 0 && clientsSig(r.built.clients) !== clientsSig(latest.clients)) {
        await commit((d) => {
          d.clients = r.built.clients;
        }, "team sync pull");
      }
      try {
        const alerts = await pullAdviceAlertsFromSheet(url);
        const cur = await loadDB() || latest;
        const sig = (a) => (a || []).map((b) => b.id + ":" + (b.dispatch || []).length).join("|");
        let next = alerts;
        if (user?.role === "admin") {
          const byId = {};
          for (const b of alerts) byId[b.id] = b;
          for (const b of cur.adviceOrders || []) byId[b.id] = b;
          next = Object.values(byId).sort((a, b) => num(b.at) - num(a.at)).slice(0, 60);
        }
        if (sig(next) !== sig(cur.adviceOrders)) await commit((d) => {
          d.adviceOrders = next;
        }, "team sync pull");
      } catch (e) {
      }
      try {
        const cd = await pullClientDetails(url);
        const curD = await loadDB() || latest;
        const sigD = (o) => Object.entries(o || {}).map(([k, v]) => k + ":" + num(v.updatedAt)).sort().join("|");
        const mergedD = Object.assign({}, cd, curD.clientDetails || {});
        for (const [k, v] of Object.entries(cd)) {
          const mine = (curD.clientDetails || {})[k];
          if (!mine || num(v.updatedAt) > num(mine.updatedAt)) mergedD[k] = v;
        }
        if (sigD(mergedD) !== sigD(curD.clientDetails)) await commit((d) => {
          d.clientDetails = mergedD;
        }, "team sync pull");
      } catch (e) {
      }
      try {
        const remoteC = await pullAdviceContacts(url);
        const curC = await loadDB() || latest;
        const mergedC = { ...curC.adviceContacts || {} };
        let changedC = false;
        for (const [code, v] of Object.entries(remoteC)) {
          const mine = mergedC[code];
          if (mine && num(mine.updatedAt) >= num(v.updatedAt)) continue;
          mergedC[code] = v;
          changedC = true;
        }
        if (changedC) await commit((d) => {
          d.adviceContacts = mergedC;
        }, "team sync pull");
      } catch (e) {
      }
      try {
        const remoteF = await pullFeePlans(url);
        const curF = await loadDB() || latest;
        const mergedF = { ...curF.feePlans || {} };
        let changedF = false;
        for (const [id, v] of Object.entries(remoteF)) {
          const mine = mergedF[id];
          if (mine && num(mine.updatedAt) >= num(v.updatedAt)) continue;
          mergedF[id] = v;
          changedF = true;
        }
        if (changedF) await commit((d) => {
          d.feePlans = mergedF;
        }, "team sync pull");
      } catch (e) {
      }
      try {
        const remoteBP = await pullBillingProfiles(url);
        const curBP = await loadDB() || latest;
        const mergedBP = { ...curBP.billingProfiles || {} };
        let changedBP = false;
        for (const [code, v] of Object.entries(remoteBP)) {
          const mine = mergedBP[code];
          if (mine && num(mine.updatedAt) >= num(v.updatedAt)) continue;
          mergedBP[code] = v;
          changedBP = true;
        }
        if (changedBP) await commit((d) => {
          d.billingProfiles = mergedBP;
        }, "team sync pull");
      } catch (e) {
      }
      try {
        const remoteBS = await pullBillingSettings(url);
        const curBS = await loadDB() || latest;
        if (remoteBS && num(remoteBS.updatedAt) > num((curBS.billingSettings || {}).updatedAt)) {
          await commit((d) => {
            d.billingSettings = remoteBS;
          }, "team sync pull");
        }
      } catch (e) {
      }
      try {
        const remoteIV = await pullInvoices(url);
        const curIV = await loadDB() || latest;
        const mergedIV = { ...curIV.invoices || {} };
        let changedIV = false;
        for (const [id, v] of Object.entries(remoteIV)) {
          const mine = mergedIV[id];
          if (mine && num(mine.updatedAt) >= num(v.updatedAt)) continue;
          mergedIV[id] = v;
          changedIV = true;
        }
        if (changedIV) await commit((d) => {
          d.invoices = mergedIV;
        }, "team sync pull");
      } catch (e) {
      }
      try {
        const remoteX = await pullExecModes(url);
        const curX = await loadDB() || latest;
        const mode = { ...curX.execMode || {} }, at = { ...curX.execModeAt || {} };
        let changed = false;
        for (const [code, v] of Object.entries(remoteX)) {
          if (num(at[code]) >= num(v.updatedAt) && mode[code]) continue;
          if (mode[code] === v.method && num(at[code]) === num(v.updatedAt)) continue;
          mode[code] = v.method;
          at[code] = num(v.updatedAt);
          changed = true;
        }
        if (changed) await commit((d) => {
          d.execMode = mode;
          d.execModeAt = at;
        }, "team sync pull");
      } catch (e) {
      }
      try {
        const remoteB = await pullBaskets(url);
        const curB = await loadDB() || latest;
        const mergedB = mergeBaskets(curB.baskets || {}, remoteB);
        const sigB = (b) => Object.entries(b || {}).map(([k, v]) => k + ":" + (v || []).map((x) => x.symbol).sort().join(",")).sort().join("|");
        if (sigB(mergedB) !== sigB(curB.baskets)) await commit((d) => {
          d.baskets = mergedB;
        }, "team sync pull");
      } catch (e) {
      }
      try {
        const remote = await pullPipeline(url);
        const cur2 = await loadDB() || latest;
        const merged = mergePipeline(cur2.pipeline || [], remote);
        const sigP = (a) => (a || []).map((x) => x.id + ":" + num(x.updatedAt)).join("|");
        if (sigP(merged) !== sigP(cur2.pipeline)) await commit((d) => {
          d.pipeline = merged;
        }, "team sync pull");
      } catch (e) {
      }
    } catch (e) {
    } finally {
      syncingRef.current = false;
    }
  }, [commit, db, user]);
  useEffect(() => {
    if (!ready) return;
    syncPull();
    const t = setInterval(syncPull, SYNC_MS);
    return () => clearInterval(t);
  }, [ready]);
  const refreshPrices = useCallback(async () => {
    const url = urlRef.current;
    if (!url) return { ok: false, msg: "No linked sheet URL set (Settings \u2192 Google Sheet backup)." };
    try {
      const u = withToken(url) + "&prices=1";
      const res = await fetch(u, { redirect: "follow" });
      const data = await res.json();
      if (data && data.ok && data.prices) {
        const next = {
          prices: data.prices || {},
          cash: data.cash || {},
          cashCode: data.cashCode || {},
          status: data.status || {},
          statusCode: data.statusCode || {},
          pricesAt: Date.now(),
          pv: (pvRef.current || 0) + 1
        };
        pvRef.current = next.pv;
        setPx(next);
        await savePricesStore(next);
        return { ok: true, count: data.count || Object.keys(data.prices).length, cash: Object.keys(data.cash || {}).length };
      }
      return { ok: false, msg: "The sheet returned no prices. Re-deploy the script and check Sheet1." };
    } catch (e) {
      return { ok: false, msg: "Couldn't read the sheet directly (browser blocked it)." };
    }
  }, []);
  useEffect(() => {
    if (!user || !(db.sheetUrl || "").trim()) return;
    refreshPrices();
    const t = setInterval(() => refreshPrices(), PRICE_MS);
    return () => clearInterval(t);
  }, [user, db.sheetUrl, refreshPrices]);
  const dbView = useMemo(() => ({
    ...db,
    prices: px.prices,
    cash: px.cash,
    cashCode: px.cashCode,
    status: px.status,
    statusCode: px.statusCode,
    pricesAt: px.pricesAt
  }), [db, px]);
  if (!ready)
    return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen flex items-center justify-center text-slate-500" }, "Loading\u2026");
  if (!user)
    return /* @__PURE__ */ React.createElement(Login, { db, commit, onLogin: setUser });
  return /* @__PURE__ */ React.createElement(React.Fragment, null, saveWarn && /* @__PURE__ */ React.createElement("div", { className: "fixed top-0 inset-x-0 z-[60] bg-rose-600 text-white text-[12px] text-center px-3 py-1.5" }, "This browser's storage is full \u2014 your newest changes may not survive a page reload. Export a CSV backup (Settings \u2192 Security) and remove data you no longer need.", /* @__PURE__ */ React.createElement("button", { onClick: () => setSaveWarn(false), className: "underline ml-2" }, "dismiss")), /* @__PURE__ */ React.createElement(Console, { db: dbView, user, commit, undo, refreshPrices, onLogout: () => setUser(null) }));
}
function Login({ db, commit, onLogin }) {
  const [connUrl, setConnUrl] = useState(db.sheetUrl || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [changingServer, setChangingServer] = useState(!(db.sheetUrl || "").trim());
  // The server's own address minus the "/exec" the console calls for everything
  // else - PocketBase's built-in login endpoint lives one level up, at /api/...
  const baseUrl = (u) => (u || "").trim().replace(/\/?exec\/?$/, "");
  const connectServer = async () => {
    setErr("");
    const url = connUrl.trim();
    if (!url) {
      setErr("Paste the server's Web app URL first.");
      return;
    }
    setBusy(true);
    try {
      await commit((d) => {
        d.sheetUrl = url;
      }, "connect to server");
      setChangingServer(false);
    } finally {
      setBusy(false);
    }
  };
  const submitLogin = async () => {
    setErr("");
    const url = (db.sheetUrl || "").trim();
    if (!url) {
      setErr("Set the server's Web app URL first.");
      return;
    }
    if (!email.trim() || !password) {
      setErr("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(baseUrl(url) + "/api/collections/users/auth-with-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: email.trim(), password })
      });
      const data = await res.json().catch(() => null);
      if (data && data.token && data.record) {
        await commit((d) => {
          d.sheetToken = data.token;
        }, "sign in");
        onLogin({ name: data.record.name || data.record.email, role: data.record.role, email: data.record.email, id: data.record.id });
        return;
      }
      if (res.status === 403) {
        setErr("Your account has been deactivated. Ask the Principal Officer to reactivate it.");
      } else {
        setErr("Incorrect email or password.");
      }
    } catch (e) {
      setErr("Can't reach the server. Check the Web app URL and your internet connection.");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen bg-slate-50 flex items-center justify-center p-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8" },
    /* @__PURE__ */ React.createElement("div", { className: "text-center mb-6" },
      /* @__PURE__ */ React.createElement("div", { className: "inline-flex items-center justify-center rounded-xl mb-3 px-4 py-3", style: { background: VP_NAVY } }, /* @__PURE__ */ React.createElement(VasupradahMark, { height: 30 })),
      /* @__PURE__ */ React.createElement("h1", { className: "text-lg font-semibold text-slate-800" }, "Client Console"),
      /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mt-1" }, "Investment Advisory Services P Ltd \xB7 Kochi")
    ),
    changingServer ? /* @__PURE__ */ React.createElement(React.Fragment, null,
      /* @__PURE__ */ React.createElement("label", { className: "block text-sm font-medium text-slate-700 mb-1" }, "Server Web app URL"),
      /* @__PURE__ */ React.createElement("input", {
        autoFocus: true,
        value: connUrl,
        onChange: (e) => setConnUrl(e.target.value),
        onKeyDown: (e) => e.key === "Enter" && connectServer(),
        placeholder: "https://your-server-host/exec",
        className: "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      }),
      /* @__PURE__ */ React.createElement("button", {
        onClick: connectServer,
        disabled: busy || !connUrl.trim(),
        className: "mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-60"
      }, busy ? "Saving…" : "Save & continue"),
      (db.sheetUrl || "").trim() && /* @__PURE__ */ React.createElement("button", {
        onClick: () => { setChangingServer(false); setErr(""); },
        className: "mt-2 w-full text-slate-500 text-xs py-1"
      }, "Back")
    ) : /* @__PURE__ */ React.createElement(React.Fragment, null,
      /* @__PURE__ */ React.createElement("label", { className: "block text-sm font-medium text-slate-700 mb-1" }, "Email"),
      /* @__PURE__ */ React.createElement("input", {
        autoFocus: true,
        type: "email",
        value: email,
        onChange: (e) => setEmail(e.target.value),
        onKeyDown: (e) => e.key === "Enter" && submitLogin(),
        placeholder: "you@vasupradah.com",
        className: "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      }),
      /* @__PURE__ */ React.createElement("label", { className: "block text-sm font-medium text-slate-700 mb-1 mt-3" }, "Password"),
      /* @__PURE__ */ React.createElement("input", {
        type: "password",
        value: password,
        onChange: (e) => setPassword(e.target.value),
        onKeyDown: (e) => e.key === "Enter" && submitLogin(),
        placeholder: "Password",
        className: "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      }),
      /* @__PURE__ */ React.createElement("button", {
        onClick: submitLogin,
        disabled: busy,
        className: "mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-60"
      }, busy ? "Signing in…" : "Sign in"),
      /* @__PURE__ */ React.createElement("button", {
        onClick: () => { setChangingServer(true); setErr(""); },
        className: "mt-2 w-full text-slate-500 text-xs py-1"
      }, "Change server")
    ),
    err && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-rose-600 mt-3" }, err),
    !hasStore && /* @__PURE__ */ React.createElement("div", { className: "mt-5 flex gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 14, className: "shrink-0 mt-0.5" }), /* @__PURE__ */ React.createElement("span", null, "Preview mode: saving and multi-user sync are off. Open the published/shared link to enable them."))
  ));
}
function Console({ db, user, commit, undo, refreshPrices, onLogout }) {
  const [tab, setTab] = useState("report");
  const [toast, setToast] = useState(null);
  const [showPwModal, setShowPwModal] = useState(false);
  const showToast = (m, kind = "ok") => {
    setToast({ m, kind });
    setTimeout(() => setToast(null), 2600);
  };
  const tabs = [
    { id: "report", label: "Portfolio Report", icon: FileSpreadsheet },
    { id: "advice", label: "Advice Alerts", icon: Bell },
    { id: "performance", label: "Performance", icon: TrendingUp },
    ...user.role === "admin" ? [{ id: "orders", label: "Advice Orders", icon: Send }] : [],
    { id: "pipeline", label: "Pipeline", icon: Contact },
    // Billing: everyone can see the fee plans, only the Principal Officer changes them.
    // The dot says a closed quarter has not been billed yet, so it is noticed without
    // having to remember to open the tab on the first of the month.
    { id: "billing", label: "Billing", icon: Receipt, dot: user.role === "admin" && Object.keys(db.billingProfiles || {}).length > 0 && (db.lastBillRun || "") !== billableQuarter(new Date()).key },
    // Capital gains: a read of the trade book, so staff can see it too.
    { id: "capgains", label: "Capital Gains", icon: Scale },
    // Upload Data and Settings change the shared data, so they are admin-only. Staff are view-only.
    ...user.role === "admin" ? [{ id: "upload", label: "Upload Data", icon: Upload }] : [],
    ...user.role === "admin" ? [{ id: "settings", label: "Settings", icon: Settings }] : []
  ];
  return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen bg-slate-50 text-slate-800" }, /* @__PURE__ */ React.createElement("header", { className: "vp-header sticky top-0 z-20", style: { background: VP_NAVY, borderBottom: `3px solid ${VP_GOLD}` } }, /* @__PURE__ */ React.createElement("div", { className: "max-w-[1760px] mx-auto px-4 py-3 flex items-center gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement(VasupradahMark, { height: 34 }), /* @__PURE__ */ React.createElement("div", { style: { width: 1, height: 26, background: "rgba(255,255,255,0.25)" } }), /* @__PURE__ */ React.createElement("div", { className: "leading-tight" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm font-semibold text-white" }, "Client Console"), /* @__PURE__ */ React.createElement("div", { className: "text-[11px]", style: { color: VP_GOLD } }, "Portfolio & advisory"))), /* @__PURE__ */ React.createElement("nav", { className: "hidden md:flex items-center gap-1 ml-4" }, tabs.map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t.id,
      onClick: () => setTab(t.id),
      title: t.dot ? "A finished quarter has not been billed yet" : void 0,
      className: "px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 vp-navtab",
      style: tab === t.id ? { background: VP_GOLD, color: VP_NAVY, fontWeight: 600 } : { color: "rgba(255,255,255,0.82)" }
    },
    /* @__PURE__ */ React.createElement(t.icon, { size: 15 }),
    " ",
    t.label,
    t.dot && /* @__PURE__ */ React.createElement("span", { "aria-hidden": "true", className: "w-1.5 h-1.5 rounded-full", style: { background: tab === t.id ? VP_NAVY : VP_GOLD } })
  ))), /* @__PURE__ */ React.createElement("div", { className: "ml-auto flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: undo,
      disabled: !(db.history || []).length,
      title: "Undo last action",
      className: "px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5 vp-onnavy-btn disabled:opacity-40 disabled:cursor-not-allowed"
    },
    /* @__PURE__ */ React.createElement(Undo2, { size: 15 }),
    " Undo"
  ), /* @__PURE__ */ React.createElement("div", { className: "text-right leading-tight mr-1" }, /* @__PURE__ */ React.createElement("div", { className: "text-xs font-medium text-white" }, user.name), /* @__PURE__ */ React.createElement("div", { className: "text-[10px] capitalize", style: { color: "rgba(255,255,255,0.6)" } }, user.role, user.role !== "admin" ? " \xB7 view only" : "")), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowPwModal(true), title: "Change password", className: "p-1.5 rounded-lg vp-onnavy-icon" }, /* @__PURE__ */ React.createElement(Lock, { size: 16 })), /* @__PURE__ */ React.createElement("button", { onClick: onLogout, title: "Sign out", className: "p-1.5 rounded-lg vp-onnavy-icon" }, /* @__PURE__ */ React.createElement(LogOut, { size: 16 })))), /* @__PURE__ */ React.createElement("div", { className: "md:hidden flex", style: { borderTop: "1px solid rgba(255,255,255,0.15)" } }, tabs.map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t.id,
      onClick: () => setTab(t.id),
      className: "flex-1 py-2 text-xs flex flex-col items-center gap-0.5",
      style: { color: tab === t.id ? VP_GOLD : "rgba(255,255,255,0.65)", fontWeight: tab === t.id ? 600 : 400 }
    },
    /* @__PURE__ */ React.createElement(t.icon, { size: 16 }),
    " ",
    t.label.split(" ")[0]
  ))), db.lastAction && /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 border-t border-slate-100 px-4 py-1 text-[11px] text-slate-400 text-center" }, "Last: ", /* @__PURE__ */ React.createElement("b", { className: "text-slate-500" }, db.lastAction.type), " by ", db.lastAction.by, " \xB7 ", new Date(db.lastAction.at).toLocaleTimeString("en-IN"))), /* @__PURE__ */ React.createElement("main", { className: "max-w-[1760px] mx-auto px-3 py-5" }, tab === "report" && /* @__PURE__ */ React.createElement(Report, { db, user, commit, showToast, refreshPrices }), tab === "advice" && /* @__PURE__ */ React.createElement(AdviceTab, { db, user, commit, showToast }), tab === "performance" && /* @__PURE__ */ React.createElement(PerformanceTab, { db, showToast }), tab === "orders" && user.role === "admin" && /* @__PURE__ */ React.createElement(AdviceOrders, { db, commit, showToast }), tab === "pipeline" && /* @__PURE__ */ React.createElement(PipelineTab, { db, user, commit, showToast }), tab === "billing" && /* @__PURE__ */ React.createElement(BillingTab, { db, user, commit, showToast }), tab === "capgains" && /* @__PURE__ */ React.createElement(CapitalGainsTab, { db, user, showToast }), tab === "upload" && user.role === "admin" && /* @__PURE__ */ React.createElement(UploadTab, { db, commit, showToast }), tab === "settings" && user.role === "admin" && /* @__PURE__ */ React.createElement(SettingsTab, { db, commit, showToast, user })), toast && /* @__PURE__ */ React.createElement("div", { className: `fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 flex items-center gap-2 ${toast.kind === "err" ? "bg-rose-600" : "bg-slate-800"}` }, toast.kind === "err" ? /* @__PURE__ */ React.createElement(AlertTriangle, { size: 15 }) : /* @__PURE__ */ React.createElement(Check, { size: 15 }), " ", toast.m), showPwModal && /* @__PURE__ */ React.createElement(ChangePasswordModal, { db, onClose: () => setShowPwModal(false), showToast }));
}
function ChangePasswordModal({ db, onClose, showToast }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr("");
    if (next.length < 8) { setErr("New password needs at least 8 characters."); return; }
    if (next !== confirm) { setErr("The new password and its confirmation don't match."); return; }
    setBusy(true);
    try {
      const res = await fetch((db.sheetUrl || "").trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: db.sheetToken || "", type: "change_password", currentPassword: current, newPassword: next })
      });
      const data = await res.json().catch(() => null);
      if (data && data.ok) {
        showToast("Password changed.");
        onClose();
      } else {
        setErr((data && data.error) || "Could not change the password.");
      }
    } catch (e) {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" },
    /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl shadow-lg w-full max-w-sm p-5" },
      /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Lock, { size: 15 }), " Change password"),
      /* @__PURE__ */ React.createElement("input", { type: "password", value: current, onChange: (e) => setCurrent(e.target.value), placeholder: "Current password", className: "w-full mb-2 px-3 py-2 text-sm border border-slate-300 rounded-lg" }),
      /* @__PURE__ */ React.createElement("input", { type: "password", value: next, onChange: (e) => setNext(e.target.value), placeholder: "New password (8+ characters)", className: "w-full mb-2 px-3 py-2 text-sm border border-slate-300 rounded-lg" }),
      /* @__PURE__ */ React.createElement("input", { type: "password", value: confirm, onChange: (e) => setConfirm(e.target.value), onKeyDown: (e) => e.key === "Enter" && submit(), placeholder: "Confirm new password", className: "w-full mb-3 px-3 py-2 text-sm border border-slate-300 rounded-lg" }),
      err && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-rose-600 mb-3" }, err),
      /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" },
        /* @__PURE__ */ React.createElement("button", { onClick: submit, disabled: busy, className: "flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2 rounded-lg disabled:opacity-60" }, busy ? "Saving…" : "Save"),
        /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "flex-1 border border-slate-300 text-slate-600 text-sm py-2 rounded-lg hover:bg-slate-50" }, "Cancel")
      )
    )
  );
}
function ConfirmModal({ title, body, confirmLabel, tone, onConfirm, onClose }) {
  return /* @__PURE__ */ React.createElement(Modal, { onClose, title }, /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-600" }, body), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 mt-5" }, /* @__PURE__ */ React.createElement("button", { onClick: onConfirm, className: `text-white text-sm px-4 py-2 rounded-lg flex-1 ${tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}` }, confirmLabel), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "text-slate-500 text-sm px-4 py-2 rounded-lg hover:bg-slate-100" }, "Cancel")));
}
function Modal({ title, children, onClose, wide }) {
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-slate-900/40 z-40 flex items-center justify-center p-4", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: `bg-white rounded-2xl shadow-xl w-full ${wide ? "max-w-2xl" : "max-w-md"} p-5`, style: { maxHeight: "92vh", overflowY: "auto" }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold text-slate-800" }, title), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "text-slate-400 hover:text-slate-600" }, /* @__PURE__ */ React.createElement(X, { size: 18 }))), children));
}
const Th = ({ children, right, center }) => /* @__PURE__ */ React.createElement("th", { className: `px-2 py-2 font-medium ${right ? "text-right" : center ? "text-center" : "text-left"}` }, children);
const HERO_ACCENTS = {
  slate: { bar: "#94a3b8", chip: "#f1f5f9", ic: "#475569", val: "#0f172a" },
  indigo: { bar: "#1E2A78", chip: "#eaedf8", ic: "#1E2A78", val: "#1E2A78" },
  gold: { bar: "#F5C518", chip: "#fef8e0", ic: "#a1740a", val: "#7a5606" },
  emerald: { bar: "#10b981", chip: "#ecfdf5", ic: "#059669", val: "#065f46" },
  rose: { bar: "#f43f5e", chip: "#fff1f2", ic: "#e11d48", val: "#9f1239" }
};
const HeroStat = ({ label, value, sub, subTone, icon: Icon, symbol, accent = "slate" }) => {
  const A = HERO_ACCENTS[accent] || HERO_ACCENTS.slate;
  return /* @__PURE__ */ React.createElement("div", { className: "vp-hero", style: { position: "relative", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "14px 16px 14px 18px", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: A.bar } }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 20, fontWeight: 700, marginTop: 4, color: A.val, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } }, value), sub != null && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, marginTop: 3, fontWeight: 600, color: subTone === "pos" ? "#059669" : subTone === "neg" ? "#e11d48" : "#94a3b8" } }, sub)), /* @__PURE__ */ React.createElement("div", { style: { flexShrink: 0, width: 38, height: 38, borderRadius: 11, background: A.chip, display: "flex", alignItems: "center", justifyContent: "center", color: A.ic } }, symbol ? /* @__PURE__ */ React.createElement("span", { style: { fontSize: 17, fontWeight: 700 } }, symbol) : Icon ? /* @__PURE__ */ React.createElement(Icon, { size: 18 }) : null)));
};
const Stat = ({ label, value, tone }) => /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-3" }, /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 uppercase tracking-wide" }, label), /* @__PURE__ */ React.createElement("div", { className: `text-lg font-semibold mt-0.5 ${tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-rose-600" : "text-slate-800"}` }, value));
const MiniStat = ({ label, value, tone }) => /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 rounded-lg p-2.5 text-center" }, /* @__PURE__ */ React.createElement("div", { className: `text-xl font-semibold ${tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-rose-600" : "text-slate-700"}` }, value), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, label));
const Card = ({ title, icon: Icon, children }) => /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl p-5" }, /* @__PURE__ */ React.createElement("h2", { className: "text-sm font-semibold mb-3 flex items-center gap-2" }, Icon && /* @__PURE__ */ React.createElement(Icon, { size: 16 }), " ", title), children);
const IconBtn = ({ children, onClick, title, tone }) => /* @__PURE__ */ React.createElement(
  "button",
  {
    title,
    onClick,
    className: `p-1.5 rounded-md ${tone === "wa" ? "text-emerald-600 hover:bg-emerald-50" : tone === "mail" ? "text-blue-600 hover:bg-blue-50" : tone === "danger" ? "text-slate-400 hover:bg-rose-50 hover:text-rose-600" : "text-slate-500 hover:bg-slate-100"}`
  },
  children
);

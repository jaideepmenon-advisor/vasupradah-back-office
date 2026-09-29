const PL_SERVICES = [
  { id: "Equity Advisory", short: "Equity", color: "#1E2A78" },
  { id: "Financial Planning", short: "Fin Plan", color: "#0d9488" },
  { id: "Mutual Fund Advisory", short: "MF Advisory", color: "#7c3aed" },
  { id: "MF Distribution", short: "MF Distribution", color: "#c2710c" },
  { id: "Portfolio Evaluation", short: "Portfolio Eval", color: "#0891b2" }
];
const PL_STAGES = [
  { id: "new", label: "New Enquiry", color: "#6b7280" },
  { id: "contacted", label: "Contacted", color: "#2563eb" },
  { id: "awaiting", label: "Response Awaited", color: "#d97706" },
  { id: "discovery", label: "Discovery / Assessment", color: "#7c3aed" },
  { id: "risk", label: "Risk Profiling", color: "#0891b2" },
  { id: "proposal", label: "Proposal / Recommendation", color: "#9333ea" },
  { id: "agreement", label: "Agreement / Engagement", color: "#6d28d9" },
  { id: "kyc", label: "KYC / Onboarding", color: "#0d9488" },
  { id: "signed", label: "Signed / Converted", color: "#1f9d55" },
  { id: "hold", label: "On Hold", color: "#c2710c" },
  { id: "lost", label: "Lost", color: "#b91c1c" }
];
const PL_SOURCES = ["Referral", "Website", "Mathrubhumi Column", "Seminar / Talk", "Social Media", "Walk-in", "Existing Client", "Other"];
const PL_BASKETS = [
  "Suraksha Vitta (Low Risk)",
  "Samana Utpady (Med-to-Low)",
  "Sthira Sampatti (Med-to-High)",
  "S\u0101hasa Sampatti (High Risk)",
  "Niyamabadha Praksepaka Yojana (SIP)",
  "Not yet decided"
];
const PL_ADVISORS = ["Jaideep S. Menon", "Abhishake Mathur", "Pramod Sivan"];
const PL_KYC_DOCS = [
  { key: "pancard", label: "PAN Card" },
  { key: "aadhaar", label: "Aadhaar / Address Proof" },
  { key: "bank", label: "Bank Proof (cheque/statement)" },
  { key: "photo", label: "Photograph" },
  { key: "fatca", label: "FATCA Declaration" },
  { key: "riskform", label: "Risk Profile Form signed" }
];
const PL_CHECKLISTS = {
  "Equity Advisory": [
    { key: "risk", label: "Risk Profiling completed", req: true },
    { key: "suit", label: "Suitability Assessment recorded", req: true },
    { key: "fee", label: "Fee structure disclosed & agreed", req: true },
    { key: "agr", label: "Investment Advisory Agreement executed", req: true },
    { key: "pay", label: "First advisory fee received" }
  ],
  "Financial Planning": [
    { key: "data", label: "Goals & financial data gathered", req: true },
    { key: "risk", label: "Risk Profiling completed", req: true },
    { key: "plan", label: "Financial plan prepared", req: true },
    { key: "present", label: "Plan presented to client", req: true },
    { key: "agr", label: "Engagement / advisory agreement executed", req: true },
    { key: "fee", label: "Planning fee received" }
  ],
  "MF Distribution": [
    { key: "kycdone", label: "KYC / CKYC verified", req: true },
    { key: "risk", label: "Risk profiling / suitability noted", req: true },
    { key: "fatca", label: "FATCA & nominee details captured", req: true },
    { key: "arn", label: "ARN / commission disclosure made", req: true },
    { key: "folio", label: "Folio / SIP / lumpsum set up" }
  ],
  "Portfolio Evaluation": [
    { key: "stmt", label: "Portfolio statements received", req: true },
    { key: "eval", label: "Evaluation / analysis completed", req: true },
    { key: "report", label: "Evaluation report delivered", req: true },
    { key: "discuss", label: "Findings discussed with prospect" },
    { key: "convert", label: "Converted to advisory (if applicable)" }
  ]
};
PL_CHECKLISTS["Mutual Fund Advisory"] = PL_CHECKLISTS["Equity Advisory"];
const PL_GROUP = "Vasupradah Wealth";
const plShareText = (r, cfg) => {
  const L = [`*New lead \u2014 ${cfg && cfg.groupName || PL_GROUP}*`, ""];
  const add = (label, val) => {
    const v = String(val == null ? "" : val).trim();
    if (v) L.push(`${label}: ${v}`);
  };
  add("Type of lead", r.service);
  add("Advisor", r.assignee);
  add("Name", r.name);
  add("Phone", r.phone);
  add("Email", r.email);
  add("Enquiry date", r.enquiryDate);
  add("Source", r.source);
  if (num(r.corpus) > 0) add("Approx. corpus", plCorpus(r.corpus));
  add("Priority", r.priority);
  if (r.basket && r.basket !== "Not yet decided") add("Basket", r.basket);
  add("Next follow-up", r.nextFollowUp);
  add("Notes", r.notes);
  L.push("", "Vasupradah Investment Advisory Services Pvt. Ltd.", "For internal circulation only.");
  return L.join("\n");
};
const plStage = (id) => PL_STAGES.find((x) => x.id === id) || PL_STAGES[0];
const plService = (id) => PL_SERVICES.find((x) => x.id === id) || PL_SERVICES[0];
const plToday = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
const plIsActive = (r) => r.stage !== "signed" && r.stage !== "lost";
const plOverdue = (r) => !!r.nextFollowUp && r.nextFollowUp <= plToday() && plIsActive(r);
const plCorpus = (n) => {
  const v = num(n);
  if (!v) return "\u2014";
  if (v >= 1e7) return "\u20B9" + (v / 1e7).toFixed(v % 1e7 ? 2 : 0) + " Cr";
  if (v >= 1e5) return "\u20B9" + (v / 1e5).toFixed(v % 1e5 ? 2 : 0) + " L";
  return "\u20B9" + v.toLocaleString("en-IN");
};
const plNewRecord = () => ({
  id: "L" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  name: "",
  phone: "",
  email: "",
  service: PL_SERVICES[0].id,
  source: "Referral",
  enquiryDate: plToday(),
  corpus: "",
  basket: "Not yet decided",
  assignee: PL_ADVISORS[0],
  priority: "Medium",
  stage: "new",
  nextFollowUp: "",
  pan: "",
  ckyc: "",
  meetingLink: "",
  meetingTime: "",
  notes: "",
  signedDate: "",
  check: {},
  kycDocs: {},
  log: [],
  updatedAt: Date.now()
});
const plHasContent = (r) => !!(r && (String(r.name || "").trim() || String(r.phone || "").trim() || String(r.email || "").trim() || String(r.notes || "").trim()));
const plResumeDraft = (saved) => {
  try {
    const d = JSON.parse(localStorage.getItem("vasupradah_pipeline_draft") || "null");
    if (!d || !d.id || !plHasContent(d.rec)) return null;
    if ((saved || []).some((x) => x.id === d.id)) return null;
    return { ...plNewRecord(), id: d.id };
  } catch (e) {
    return null;
  }
};
function openWhatsAppShare(text) {
  // No recipient: wa.me opens the chat picker so a group can be chosen, rather
  // than dropping the message into whatever chat is already open.
  return openWaUrl(`https://wa.me/?text=${encodeURIComponent(text || "")}`);
}
const MIS_DEFAULT_TO = ["jaideepmenon@vasupradah.com", "neelakantanpillai@vasupradah.com", "abhishakemathur@vasupradah.com"];
const MIS_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
async function pullMis(url, on) {
  const res = await fetch(withToken(url) + "&mis=1" + (on ? "&on=" + encodeURIComponent(on) : ""));
  const data = await res.json();
  if (!data || data.ok !== true) throw new Error((data && data.error) || "The sheet could not build the report.");
  return data;
}
async function sendMisNow(db, to, on) {
  const url = (db.sheetUrl || "").trim();
  if (!url) return { ok: false, msg: "Connect the office Google Sheet in Settings first." };
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "mis_send", to, on: on || "" }) });
    const txt = await res.text();
    try {
      const j = JSON.parse(txt);
      return { ok: !!j.ok, msg: j.ok ? `Sent to ${(j.sentTo || []).join(", ")}.${(j.failed || []).length ? ` Could not reach ${j.failed.join(", ")}.` : ""}` : (j.error || "Nothing was sent.") };
    } catch (e) { return { ok: false, msg: txt.slice(0, 200) }; }
  } catch (e) { return { ok: false, msg: "Could not reach the office Google Sheet." }; }
}
async function saveMisSchedule(db, cfg) {
  const url = (db.sheetUrl || "").trim();
  if (!url) return { ok: false, msg: "Connect the office Google Sheet in Settings first." };
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: db.sheetToken || "", type: "mis_config", ...cfg }) });
    const txt = await res.text();
    try { const j = JSON.parse(txt); return { ok: !!j.ok, scheduled: j.scheduled, config: j.config }; }
    catch (e) { return { ok: false, msg: txt.slice(0, 200) }; }
  } catch (e) { return { ok: false, msg: "Could not reach the office Google Sheet." }; }
}
// How close the spreadsheet is to the limits that would force a move to a real
// database. Measured on the sheet, because that is the only place the timings mean
// anything.
async function pullPipeline(url) {
  const res = await fetch(withToken(url) + "&pipeline=1");
  const data = await res.json();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length < 2) return [];
  const hdr = rows[0].map((h) => String(h));
  return rows.slice(1).filter((r) => String(r[0] || "").trim()).map((r) => {
    const rec = {};
    hdr.forEach((h, i) => {
      let v = r[i];
      if (h === "kycDocs" || h === "check" || h === "log") {
        try {
          v = typeof v === "string" && v.trim() ? JSON.parse(v) : h === "log" ? [] : {};
        } catch (e) {
          v = h === "log" ? [] : {};
        }
      } else if (h === "updatedAt") v = num(v);
      else if (v instanceof Date) v = v.toISOString().slice(0, 10);
      else v = v == null ? "" : String(v);
      rec[h] = v;
    });
    return rec;
  });
}
async function pushPipeline(db, payload) {
  if (!(db.sheetUrl || "").trim()) return;
  try {
    await fetch(db.sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ token: db.sheetToken || "", type: "pipeline" }, payload))
    });
  } catch (e) {
  }
}
function mergePipeline(local, remote) {
  const byId = {};
  for (const r of remote || []) byId[r.id] = r;
  for (const l of local || []) {
    const r = byId[l.id];
    if (!r || num(l.updatedAt) > num(r.updatedAt)) byId[l.id] = l;
  }
  return Object.values(byId).sort((a, b) => num(b.updatedAt) - num(a.updatedAt));
}
function MisModal({ db, user, showToast, onClose }) {
  const isAdmin = user?.role === "admin";
  const [state, setState] = useState("loading");
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);
  const [to, setTo] = useState("");
  const [day, setDay] = useState("SATURDAY");
  const [hour, setHour] = useState(10);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asOf, setAsOf] = useState("");
  const url = (db.sheetUrl || "").trim();

  const load = async (d) => {
    if (!url) { setErr("Connect the office Google Sheet in Settings first — the report is built from the Pipeline tab on the sheet."); setState("error"); return; }
    setState("loading"); setErr("");
    try {
      const r = await pullMis(url, d);
      setData(r);
      setTo((r.config.to || MIS_DEFAULT_TO).join(", "));
      setDay(r.config.day || "SATURDAY");
      setHour(num(r.config.hour) || 10);
      setOn(!!(r.scheduled || {}).on);
      setState("ready");
    } catch (e) { setErr(String(e && e.message || e)); setState("error"); }
  };
  useEffect(() => { load(""); }, [url]);

  const toList = () => String(to).split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes("@"));
  const sendNow = async () => {
    const list = toList();
    if (!list.length) { showToast("Put at least one email address in.", "err"); return; }
    if (!window.confirm(`Send this week's MIS now to ${list.join(", ")}?`)) return;
    setBusy(true);
    const r = await sendMisNow(db, list, asOf);
    setBusy(false);
    showToast(r.msg, r.ok ? "ok" : "err");
  };
  const saveSchedule = async (enabled) => {
    setBusy(true);
    const r = await saveMisSchedule(db, { to: toList(), day, hour: num(hour), enabled });
    setBusy(false);
    if (!r.ok) { showToast(r.msg || "Could not save the schedule.", "err"); return; }
    setOn(!!(r.scheduled || {}).on);
    showToast(enabled === false ? "Weekly MIS turned off."
      : `Weekly MIS is on — ${r.scheduled.day.charAt(0) + r.scheduled.day.slice(1).toLowerCase()} around ${r.scheduled.hour}:00.`);
  };
  const waSend = () => {
    const t = (data || {}).text || "";
    if (!t) return;
    if (WA_OPEN_MODE === "app" || isMobileUA()) window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, "_blank");
    else window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(t)}`, "_blank");
  };
  const copyWa = async () => showToast(await copyText((data || {}).text || "") ? "Report copied — paste it into any chat." : COPY_FAILED, "ok");
  const printIt = () => {
    const w = window.open("", "_blank", "width=860,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Pipeline MIS</title></head><body style="margin:24px">${(data || {}).html || ""}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  };
  const inCls = "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const lbl = "text-[11px] text-slate-500 block mb-1";

  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/40 z-40 flex items-start justify-center p-3 overflow-y-auto", onClick: onClose },
    /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl w-full max-w-4xl my-4", onClick: (e) => e.stopPropagation() },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 px-5 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl" },
        /* @__PURE__ */ React.createElement(FileText, { size: 17 }),
        /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-semibold text-slate-800" }, "Weekly pipeline MIS"),
        state === "ready" && /* @__PURE__ */ React.createElement("span", { className: `ml-2 text-[10px] px-2 py-0.5 rounded ${on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}` },
          on ? `Automatic — every ${day.charAt(0) + day.slice(1).toLowerCase()} around ${hour}:00` : "Not scheduled"),
        /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "ml-auto text-slate-400 hover:text-slate-600" }, /* @__PURE__ */ React.createElement(X, { size: 18 }))),

      /* @__PURE__ */ React.createElement("div", { className: "p-5 space-y-4" },
        state === "error" && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" }, err),
        state === "loading" && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" }, "Building the report from the Pipeline tab…"),

        state === "ready" && /* @__PURE__ */ React.createElement(React.Fragment, null,
          /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-xl p-4 space-y-3" },
            /* @__PURE__ */ React.createElement("div", { className: "text-sm font-medium text-slate-700" }, "Who gets it, and when"),
            /* @__PURE__ */ React.createElement("div", null,
              /* @__PURE__ */ React.createElement("label", { className: lbl }, "Send to — separate addresses with a comma"),
              /* @__PURE__ */ React.createElement("input", { value: to, onChange: (e) => setTo(e.target.value), disabled: !isAdmin, className: inCls })),
            /* @__PURE__ */ React.createElement("div", { className: "grid sm:grid-cols-3 gap-3" },
              /* @__PURE__ */ React.createElement("div", null,
                /* @__PURE__ */ React.createElement("label", { className: lbl }, "Day"),
                /* @__PURE__ */ React.createElement("select", { value: day, onChange: (e) => setDay(e.target.value), disabled: !isAdmin, className: inCls },
                  MIS_DAYS.map((d) => /* @__PURE__ */ React.createElement("option", { key: d, value: d }, d.charAt(0) + d.slice(1).toLowerCase())))),
              /* @__PURE__ */ React.createElement("div", null,
                /* @__PURE__ */ React.createElement("label", { className: lbl }, "Hour (24h, ", (data || {}).tz || "sheet time", ")"),
                /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", max: "23", value: hour, onChange: (e) => setHour(e.target.value), disabled: !isAdmin, className: inCls })),
              /* @__PURE__ */ React.createElement("div", { className: "flex items-end" },
                isAdmin && /* @__PURE__ */ React.createElement("button", { onClick: () => saveSchedule(!on), disabled: busy,
                  className: `w-full text-sm py-2 rounded-lg disabled:opacity-50 ${on ? "border border-rose-200 text-rose-700 hover:bg-rose-50" : "bg-emerald-600 hover:bg-emerald-700 text-white"}` },
                  busy ? "Working…" : on ? "Turn off" : "Turn on automatic sending"))),
            isAdmin && on && /* @__PURE__ */ React.createElement("button", { onClick: () => saveSchedule(true), disabled: busy, className: "text-xs text-indigo-600 hover:underline" }, "Save changes to the list or time"),
            /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400" },
              "Sent by the Google Sheet itself, so it goes out whether or not anyone has this console open. Google runs weekly triggers within the hour you pick, so it may arrive any time between ", hour, ":00 and ", (num(hour) + 1) % 24, ":00.")),

          /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 flex-wrap items-center" },
            isAdmin && /* @__PURE__ */ React.createElement("button", { onClick: sendNow, disabled: busy, className: "text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 disabled:opacity-50" },
              /* @__PURE__ */ React.createElement(Mail, { size: 15 }), " ", busy ? "Sending…" : "Send now"),
            /* @__PURE__ */ React.createElement("button", { onClick: waSend, className: "text-sm px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5" },
              /* @__PURE__ */ React.createElement(MessageCircle, { size: 15 }), " WhatsApp"),
            /* @__PURE__ */ React.createElement("button", { onClick: copyWa, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" }, "Copy summary"),
            /* @__PURE__ */ React.createElement("button", { onClick: printIt, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" }, "Print / save PDF"),
            /* @__PURE__ */ React.createElement("div", { className: "ml-auto flex items-center gap-2" },
              /* @__PURE__ */ React.createElement("label", { className: "text-[11px] text-slate-400" }, "Week ending"),
              /* @__PURE__ */ React.createElement("input", { type: "date", value: asOf || ((data || {}).mis || {}).weekTo || "", max: ymd(new Date()),
                onChange: (e) => { setAsOf(e.target.value); load(e.target.value); },
                className: "px-2 py-1.5 text-sm border border-slate-200 rounded-lg" }))),

          /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-xl bg-slate-50 p-4" },
            /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400 mb-2" }, "This is exactly what lands in the inbox."),
            /* @__PURE__ */ React.createElement("div", { className: "bg-white p-5 rounded-lg border border-slate-200 overflow-x-auto", dangerouslySetInnerHTML: { __html: (data || {}).html || "" } }))))
    )
  );
}
// Is the Google Sheet still the right place for this data? Two things decide it:
// the 10 million cell ceiling on a spreadsheet, and the 6 minutes Apps Script gets
// for one run. Both are measured here rather than guessed at.
function PipelineTab({ db, user, commit, showToast }) {
  const isAdmin = user?.role === "admin";
  const recs = useMemo(() => (db.pipeline || []).slice().sort((a, b) => num(b.updatedAt) - num(a.updatedAt)), [db.pipeline]);
  const [misOpen, setMisOpen] = useState(false);
  const cfg = db.pipelineCfg || {};
  const [view, setView] = useState("board");
  const [q, setQ] = useState("");
  const [fService, setFService] = useState("All");
  const [fAdvisor, setFAdvisor] = useState("All");
  const [fSource, setFSource] = useState("All");
  const [activity, setActivity] = useState("active");
  const [editRec, setEditRec] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [drag, setDrag] = useState(null);
  const saveRec = async (rec, logText) => {
    const next = { ...rec, updatedAt: Date.now() };
    if (next.stage === "signed" && !next.signedDate) next.signedDate = plToday();
    if (logText) next.log = [{ date: (/* @__PURE__ */ new Date()).toISOString(), text: logText }, ...next.log || []].slice(0, 200);
    await commit((d) => {
      const list = (d.pipeline || []).slice();
      const i = list.findIndex((x) => x.id === next.id);
      if (i >= 0) list[i] = next;
      else list.unshift(next);
      d.pipeline = list;
    }, "edit pipeline");
    pushPipeline(db, { action: "upsert", record: next });
    return next;
  };
  const deleteRec = async (rec) => {
    await commit((d) => {
      d.pipeline = (d.pipeline || []).filter((x) => x.id !== rec.id);
    }, "delete pipeline");
    pushPipeline(db, { action: "delete", id: rec.id });
    showToast(`${rec.name || "Enquiry"} removed from the pipeline.`);
  };
  const syncNow = async () => {
    if (!(db.sheetUrl || "").trim()) {
      showToast("Connect your Google Sheet in Settings first.", "err");
      return;
    }
    setSyncing(true);
    try {
      const remote = await pullPipeline(db.sheetUrl);
      const merged = mergePipeline(db.pipeline || [], remote);
      await commit((d) => {
        d.pipeline = merged;
      }, "team sync pull");
      const rmap = {};
      for (const r of remote) rmap[r.id] = r;
      for (const m of merged) if (!rmap[m.id] || num(m.updatedAt) > num(rmap[m.id].updatedAt)) pushPipeline(db, { action: "upsert", record: m });
      showToast(`Pipeline synced \u2014 ${merged.length} enquiry record(s).`);
    } catch (e) {
      showToast("Couldn't reach the sheet \u2014 is the Apps Script re-deployed?", "err");
    } finally {
      setSyncing(false);
    }
  };
  const setStage = async (rec, stage) => {
    if (rec.stage === stage) return;
    const st = plStage(stage);
    const saved = await saveRec({ ...rec, stage }, `Stage \u2192 ${st.label}`);
    if (stage === "signed") {
      const items = PL_CHECKLISTS[saved.service] || [];
      const missing = items.filter((it) => it.req && !(saved.check || {})[it.key]);
      if (missing.length) showToast(`Marked signed. Still outstanding: ${missing.map((m) => m.label).join(", ")}.`, "err");
      else showToast("Marked Signed / Converted.");
    }
  };
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return recs.filter((r) => {
      if (activity === "active" && !plIsActive(r)) return false;
      if (activity === "overdue" && !plOverdue(r)) return false;
      if (fService !== "All" && r.service !== fService) return false;
      if (fAdvisor !== "All" && r.assignee !== fAdvisor) return false;
      if (fSource !== "All" && r.source !== fSource) return false;
      if (s && ![r.name, r.phone, r.email].some((x) => String(x || "").toLowerCase().includes(s))) return false;
      return true;
    });
  }, [recs, q, fService, fAdvisor, fSource, activity]);
  const M = useMemo(() => {
    const active = recs.filter(plIsActive);
    const signed = recs.filter((r) => r.stage === "signed");
    const lost = recs.filter((r) => r.stage === "lost");
    const mth = plToday().slice(0, 7);
    return {
      active: active.length,
      corpus: active.reduce((s, r) => s + num(r.corpus), 0),
      signed: signed.length,
      signedThisMonth: signed.filter((r) => String(r.signedDate || "").slice(0, 7) === mth).length,
      conv: signed.length + lost.length ? Math.round(signed.length / (signed.length + lost.length) * 100) : 0,
      overdue: recs.filter(plOverdue).length
    };
  }, [recs]);
  const inCls = "px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
  const initials = (n) => String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const dueTone = (r) => {
    if (!r.nextFollowUp || !plIsActive(r)) return "";
    const d = (new Date(r.nextFollowUp) - new Date(plToday())) / 864e5;
    return d < 0 ? "text-rose-600" : d <= 2 ? "text-amber-600" : "text-slate-400";
  };
  return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3 flex-wrap" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-semibold text-slate-800" }, "Enquiry & onboarding pipeline"), /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-slate-500 max-w-3xl" }, "Track enquiries from first contact to a signed advisory agreement. Advice is one-to-one \u2014 the basket you record must be ", /* @__PURE__ */ React.createElement("b", null, "suitable for that prospect's assessed risk category"), ". Everything is saved to the ", /* @__PURE__ */ React.createElement("b", null, "Pipeline"), " tab of your Google Sheet.")), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("button", { onClick: syncNow, disabled: syncing, className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(RefreshCw, { size: 15 }), " ", syncing ? "Syncing\u2026" : "Sync"), /* @__PURE__ */ React.createElement("button", { onClick: () => setMisOpen(true), className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(FileText, { size: 15 }), " Weekly MIS"), isAdmin && /* @__PURE__ */ React.createElement("button", { onClick: () => setEditRec(plResumeDraft(recs) || plNewRecord()), className: "text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Plus, { size: 15 }), " New enquiry"))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" }, /* @__PURE__ */ React.createElement(HeroStat, { label: "Active prospects", value: String(M.active), icon: Users, accent: "indigo" }), /* @__PURE__ */ React.createElement(HeroStat, { label: "Pipeline corpus", value: plCorpus(M.corpus), symbol: "\u20B9", accent: "slate" }), /* @__PURE__ */ React.createElement(HeroStat, { label: "Signed / converted", value: String(M.signed), sub: `${M.signedThisMonth} this month`, icon: ShieldCheck, accent: "emerald" }), /* @__PURE__ */ React.createElement(HeroStat, { label: "Conversion", value: `${M.conv}%`, icon: TrendingUp, accent: "emerald" }), /* @__PURE__ */ React.createElement(HeroStat, { label: "Overdue follow-ups", value: String(M.overdue), icon: Bell, accent: M.overdue > 0 ? "rose" : "slate" })), M.overdue > 0 && activity !== "overdue" && /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setActivity("overdue");
    setView("list");
  }, className: "text-[12px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-center gap-1.5 w-full text-left" }, /* @__PURE__ */ React.createElement(AlertTriangle, { size: 13, className: "shrink-0" }), " ", /* @__PURE__ */ React.createElement("b", null, M.overdue), " follow-up(s) due or overdue \u2014 tap to see them."), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 items-center" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setView("board"), className: `text-sm px-3 py-1.5 rounded-lg border ${view === "board" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}` }, "Board"), /* @__PURE__ */ React.createElement("button", { onClick: () => setView("list"), className: `text-sm px-3 py-1.5 rounded-lg border ${view === "list" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}` }, "List")), /* @__PURE__ */ React.createElement("div", { className: "relative flex-1 min-w-[180px]" }, /* @__PURE__ */ React.createElement(Search, { size: 14, className: "absolute left-2.5 top-2.5 text-slate-400" }), /* @__PURE__ */ React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search name, phone, email\u2026", className: inCls + " w-full pl-8" })), /* @__PURE__ */ React.createElement("select", { value: fService, onChange: (e) => setFService(e.target.value), className: inCls }, /* @__PURE__ */ React.createElement("option", { value: "All" }, "All services"), PL_SERVICES.map((x) => /* @__PURE__ */ React.createElement("option", { key: x.id, value: x.id }, x.id))), /* @__PURE__ */ React.createElement("select", { value: fAdvisor, onChange: (e) => setFAdvisor(e.target.value), className: inCls }, /* @__PURE__ */ React.createElement("option", { value: "All" }, "All advisors"), PL_ADVISORS.map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x }, x))), /* @__PURE__ */ React.createElement("select", { value: fSource, onChange: (e) => setFSource(e.target.value), className: inCls }, /* @__PURE__ */ React.createElement("option", { value: "All" }, "All sources"), PL_SOURCES.map((x) => /* @__PURE__ */ React.createElement("option", { key: x, value: x }, x))), /* @__PURE__ */ React.createElement("select", { value: activity, onChange: (e) => setActivity(e.target.value), className: inCls }, /* @__PURE__ */ React.createElement("option", { value: "active" }, "Active only"), /* @__PURE__ */ React.createElement("option", { value: "all" }, "Include lost & hold"), /* @__PURE__ */ React.createElement("option", { value: "overdue" }, "Overdue follow-ups")), /* @__PURE__ */ React.createElement("button", { onClick: () => exportPipelineCsv(filtered, showToast), className: "text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Download, { size: 15 }), " CSV")), view === "board" ? /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("div", { className: "flex gap-3", style: { minWidth: "1100px" } }, PL_STAGES.map((st) => {
    const col = filtered.filter((r) => r.stage === st.id);
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: st.id,
        style: { width: 240, flexShrink: 0 },
        onDragOver: (e) => {
          if (drag) e.preventDefault();
        },
        onDrop: () => {
          if (drag && isAdmin) {
            setStage(drag, st.id);
            setDrag(null);
          }
        }
      },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5 mb-2 px-1" }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: 999, background: st.color, display: "inline-block" } }), /* @__PURE__ */ React.createElement("span", { className: "text-[12px] font-medium text-slate-700" }, st.label), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 ml-auto" }, col.length)),
      /* @__PURE__ */ React.createElement("div", { className: "space-y-2", style: { minHeight: 60 } }, col.map((r) => {
        const sv = plService(r.service);
        return /* @__PURE__ */ React.createElement(
          "div",
          {
            key: r.id,
            draggable: isAdmin,
            onDragStart: () => setDrag(r),
            onDragEnd: () => setDrag(null),
            onClick: () => setEditRec(r),
            className: `bg-white border rounded-xl p-2.5 cursor-pointer ${r.stage === "lost" ? "opacity-60 border-slate-200" : r.stage === "hold" ? "border-amber-200 bg-amber-50/40" : "border-slate-200 hover:border-slate-300"}`
          },
          /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm font-medium text-slate-800 truncate" }, r.name || "(no name)"), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, r.phone || "\u2014", r.source ? ` \xB7 ${r.source}` : "")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 shrink-0" }, /* @__PURE__ */ React.createElement(
            "button",
            {
              title: `Share this lead to ${cfg.groupName || PL_GROUP} on WhatsApp`,
              onClick: (e) => {
                e.stopPropagation();
                openWhatsAppShare(plShareText(r, cfg));
              },
              className: "p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
            },
            /* @__PURE__ */ React.createElement(Share2, { size: 13 })
          ), /* @__PURE__ */ React.createElement("span", { title: r.assignee, className: "text-[10px] w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center" }, initials(r.assignee)))),
          /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 mt-1.5 flex-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] px-1.5 py-0.5 rounded text-white", style: { background: sv.color } }, sv.short), num(r.corpus) > 0 && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600" }, plCorpus(r.corpus)), /* @__PURE__ */ React.createElement("span", { className: `text-[10px] px-1.5 py-0.5 rounded ${r.priority === "High" ? "bg-rose-100 text-rose-700" : r.priority === "Low" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700"}` }, r.priority)),
          r.nextFollowUp && /* @__PURE__ */ React.createElement("div", { className: `text-[11px] mt-1 ${dueTone(r)}` }, "Follow-up ", r.nextFollowUp)
        );
      }), !col.length && /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-300 text-center py-3 border border-dashed border-slate-200 rounded-lg" }, "\u2014"))
    );
  }))) : /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200 rounded-xl overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 text-slate-500 text-[11px] uppercase" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Name"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Service"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Stage"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Source"), /* @__PURE__ */ React.createElement("th", { className: "text-right font-medium px-3 py-2" }, "Corpus"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Advisor"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Next follow-up"), /* @__PURE__ */ React.createElement("th", { className: "text-left font-medium px-3 py-2" }, "Priority"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, filtered.slice().sort((a, b) => PL_STAGES.findIndex((s) => s.id === a.stage) - PL_STAGES.findIndex((s) => s.id === b.stage)).map((r) => {
    const st = plStage(r.stage), sv = plService(r.service);
    return /* @__PURE__ */ React.createElement("tr", { key: r.id, className: "hover:bg-slate-50/70 cursor-pointer", onClick: () => setEditRec(r) }, /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("div", { className: "text-slate-800" }, r.name || "(no name)"), /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-slate-400" }, r.phone)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] px-1.5 py-0.5 rounded text-white", style: { background: sv.color } }, sv.short)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px]", style: { color: st.color } }, st.label), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, r.source), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-right tabular-nums text-slate-700" }, plCorpus(r.corpus)), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, r.assignee), /* @__PURE__ */ React.createElement("td", { className: `px-3 py-2 text-[12px] ${dueTone(r)}` }, r.nextFollowUp || "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "px-3 py-2 text-[12px] text-slate-500" }, r.priority));
  }), !filtered.length && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 8, className: "px-3 py-10 text-center text-slate-400 text-sm" }, "No enquiries match the current filter.")))))), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400" }, "Risk profiling and a recorded suitability assessment are required before an advisory engagement is signed. Advisory services and MF Distribution are tracked as separate service types so those records stay segregated."), editRec && /* @__PURE__ */ React.createElement(
    PipelineEditor,
    {
      rec: editRec,
      db,
      isAdmin,
      cfg,
      onClose: () => setEditRec(null),
      onSave: async (r, logText) => {
        await saveRec(r, logText);
        setEditRec(null);
        showToast("Enquiry saved.");
      },
      onDelete: async (r) => {
        await deleteRec(r);
        setEditRec(null);
      },
      showToast
    }
  ), misOpen && /* @__PURE__ */ React.createElement(MisModal, { db, user, showToast, onClose: () => setMisOpen(false) }));
}
function exportPipelineCsv(rows, showToast) {
  if (!rows.length) {
    showToast("Nothing to export.", "err");
    return;
  }
  const head = ["Name", "Service", "Phone", "Email", "Stage", "Source", "Corpus", "Basket", "Advisor", "Priority", "PAN", "CKYC", "EnquiryDate", "NextFollowUp", "SignedDate", "Notes"];
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = [head.map(esc).join(",")];
  for (const r of rows) lines.push([r.name, r.service, r.phone, r.email, plStage(r.stage).label, r.source, r.corpus, r.basket, r.assignee, r.priority, r.pan, r.ckyc, r.enquiryDate, r.nextFollowUp, r.signedDate, r.notes].map(esc).join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pipeline-${plToday()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Exported ${rows.length} enquiry record(s).`);
}
const PL_DRAFT_KEY = "vasupradah_pipeline_draft";
function PipelineEditor({ rec, db, isAdmin, cfg, onClose, onSave, onDelete, showToast }) {
  const [restored, setRestored] = useState(false);
  const [r, setR] = useState(() => {
    try {
      const d = JSON.parse(localStorage.getItem(PL_DRAFT_KEY) || "null");
      if (d && d.id === rec.id && d.rec) return d.rec;
    } catch (e) {
    }
    return JSON.parse(JSON.stringify(rec));
  });
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(PL_DRAFT_KEY) || "null");
      if (d && d.id === rec.id && JSON.stringify(d.rec) !== JSON.stringify(rec)) setRestored(true);
    } catch (e) {
    }
  }, []);
  const dirty = JSON.stringify(r) !== JSON.stringify(rec);
  useEffect(() => {
    try {
      localStorage.setItem(PL_DRAFT_KEY, JSON.stringify({ id: rec.id, rec: r, at: Date.now() }));
    } catch (e) {
    }
  }, [r, rec.id]);
  const clearDraft = () => {
    try {
      localStorage.removeItem(PL_DRAFT_KEY);
    } catch (e) {
    }
  };
  useEffect(() => {
    const h = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const requestClose = () => {
    if (dirty && !window.confirm("Discard the changes you've typed? Your draft will be lost.")) return;
    clearDraft();
    onClose();
  };
  const discardDraft = () => {
    clearDraft();
    setR(JSON.parse(JSON.stringify(rec)));
    setRestored(false);
  };
  const [note, setNote] = useState("");
  const [tpl, setTpl] = useState("followup");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const set = (patch) => setR((x) => ({ ...x, ...patch }));
  const items = PL_CHECKLISTS[r.service] || [];
  const ro = !isAdmin;
  const SENDER = cfg.sender || `${db.advisorName || "Jaideep Menon"}
Vasupradah Investment Advisory Services Pvt. Ltd.`;
  const link = (r.meetingLink || "").trim() || (cfg.meetingLink || "").trim();
  const when = (r.meetingTime || "").trim() ? new Date(r.meetingTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
  const TPLS = {
    followup: {
      label: "Follow-up reminder",
      subject: "Following up on your enquiry \u2014 Vasupradah Investment Advisory",
      body: `Dear ${r.name || "Sir/Madam"},

This is from Vasupradah Investment Advisory. We are following up on your enquiry regarding ${r.service}. Do let us know a convenient time to take this forward.

Warm regards,
${SENDER}`
    },
    meeting: {
      label: "Meeting invite",
      subject: "Meeting invite \u2014 Vasupradah Investment Advisory",
      body: `Dear ${r.name || "Sir/Madam"},

We would like to schedule a discussion regarding ${r.service}.
${when ? `Proposed time: ${when}
` : ""}${link ? `Join via: ${link}
` : "(Meeting link to follow.)\n"}
Please confirm if this works for you.

Regards,
${SENDER}`
    },
    kyc: {
      label: "Request KYC documents",
      subject: "KYC documents for onboarding \u2014 Vasupradah Investment Advisory",
      body: `Dear ${r.name || "Sir/Madam"},

To proceed with onboarding for ${r.service}, kindly share the following: PAN, Aadhaar / address proof, a bank proof (cancelled cheque or statement) and a recent photograph. If you already have a CKYC / KIN number, sharing that may avoid re-submitting documents.

Regards,
${SENDER}`
    },
    custom: { label: "Custom", subject: "Vasupradah Investment Advisory", body: `Dear ${r.name || "Sir/Madam"},



Regards,
${SENDER}` }
  };
  useEffect(() => {
    setMsg(TPLS[tpl].body);
  }, [tpl, r.name, r.service, r.meetingTime, r.meetingLink]);
  const logSend = (text) => setR((x) => ({ ...x, log: [{ date: (/* @__PURE__ */ new Date()).toISOString(), text }, ...x.log || []] }));
  const sendWA = () => {
    if (!waNumber(r.phone)) {
      showToast("No usable phone number.", "err");
      return;
    }
    openWhatsApp(r.phone, msg);
    logSend(`${TPLS[tpl].label} sent via WhatsApp`);
  };
  const openMail = () => {
    if (!r.email) {
      showToast("No email address.", "err");
      return;
    }
    window.location.href = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(TPLS[tpl].subject)}&body=${encodeURIComponent(msg)}`;
    logSend(`${TPLS[tpl].label} emailed`);
  };
  const sendMailNow = async () => {
    if (!r.email) {
      showToast("No email address.", "err");
      return;
    }
    if (!(db.sheetUrl || "").trim()) {
      showToast("Connect your Google Sheet in Settings to send email directly.", "err");
      return;
    }
    setSending(true);
    try {
      const startedAt = Date.now();
      await fetch(db.sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: db.sheetToken || "",
          type: "greeting_email",
          image: "",
          subject: TPLS[tpl].subject,
          bodyText: msg,
          recipients: [{ email: r.email, name: r.name }],
          personalize: false,
          fromName: "Vasupradah Investment Advisory"
        })
      });
      let result = null;
      for (let i = 0; i < 6; i++) {
        await new Promise((z) => setTimeout(z, 1800));
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
      logSend(`${TPLS[tpl].label} emailed (direct send)`);
      showToast(result || "Email sent.");
    } catch (e) {
      showToast("Couldn't reach the email endpoint.", "err");
    } finally {
      setSending(false);
    }
  };
  const copyMsg = () => {
    try {
      copyText(msg);
      showToast("Message copied.");
    } catch (e) {
      showToast("Couldn't copy.", "err");
    }
  };
  const inCls = "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50";
  const lbl = "text-[11px] text-slate-500 block mb-1";
  const missing = items.filter((it) => it.req && !(r.check || {})[it.key]);
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/40 z-40 flex items-start justify-center p-3 overflow-y-auto" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl w-full max-w-4xl mt-6", style: { maxHeight: "92vh", overflowY: "auto" }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Contact, { size: 16, className: "text-indigo-600" }), /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-slate-800" }, r.name || "New enquiry"), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] px-1.5 py-0.5 rounded text-white", style: { background: plStage(r.stage).color } }, plStage(r.stage).label), dirty && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700" }, "unsaved")), /* @__PURE__ */ React.createElement("button", { onClick: requestClose, className: "text-slate-400 hover:text-slate-600" }, /* @__PURE__ */ React.createElement(X, { size: 18 }))), /* @__PURE__ */ React.createElement("div", { className: "p-4 space-y-4" }, restored && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Check, { size: 13, className: "shrink-0" }), /* @__PURE__ */ React.createElement("span", null, "Restored what you had typed before this page closed \u2014 nothing was lost."), /* @__PURE__ */ React.createElement("button", { onClick: discardDraft, className: "ml-auto text-[11px] text-slate-500 hover:underline shrink-0" }, "Start fresh")), /* @__PURE__ */ React.createElement("div", { className: "grid md:grid-cols-3 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Stage"), /* @__PURE__ */ React.createElement("select", { disabled: ro, value: r.stage, onChange: (e) => set({ stage: e.target.value }), className: inCls }, PL_STAGES.map((s) => /* @__PURE__ */ React.createElement("option", { key: s.id, value: s.id }, s.label)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Service / enquiry type"), /* @__PURE__ */ React.createElement("select", { disabled: ro, value: r.service, onChange: (e) => set({ service: e.target.value }), className: inCls }, PL_SERVICES.map((s) => /* @__PURE__ */ React.createElement("option", { key: s.id, value: s.id }, s.id)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Assigned advisor"), /* @__PURE__ */ React.createElement("select", { disabled: ro, value: r.assignee, onChange: (e) => set({ assignee: e.target.value }), className: inCls }, PL_ADVISORS.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }, s)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Name"), /* @__PURE__ */ React.createElement("input", { disabled: ro, value: r.name, onChange: (e) => set({ name: e.target.value }), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Phone"), /* @__PURE__ */ React.createElement("input", { disabled: ro, value: r.phone, onChange: (e) => set({ phone: e.target.value }), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Email"), /* @__PURE__ */ React.createElement("input", { disabled: ro, value: r.email, onChange: (e) => set({ email: e.target.value }), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Enquiry date"), /* @__PURE__ */ React.createElement("input", { disabled: ro, type: "date", value: r.enquiryDate, onChange: (e) => set({ enquiryDate: e.target.value }), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Source"), /* @__PURE__ */ React.createElement("select", { disabled: ro, value: r.source, onChange: (e) => set({ source: e.target.value }), className: inCls }, PL_SOURCES.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }, s)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Approx. corpus (\u20B9)"), /* @__PURE__ */ React.createElement("input", { disabled: ro, type: "number", value: r.corpus, onChange: (e) => set({ corpus: e.target.value }), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Priority"), /* @__PURE__ */ React.createElement("select", { disabled: ro, value: r.priority, onChange: (e) => set({ priority: e.target.value }), className: inCls }, /* @__PURE__ */ React.createElement("option", null, "High"), /* @__PURE__ */ React.createElement("option", null, "Medium"), /* @__PURE__ */ React.createElement("option", null, "Low"))), /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Basket ", /* @__PURE__ */ React.createElement("span", { className: "text-slate-400" }, "\u2014 must suit the assessed risk category")), /* @__PURE__ */ React.createElement("select", { disabled: ro, value: r.basket, onChange: (e) => set({ basket: e.target.value }), className: inCls }, PL_BASKETS.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }, s)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Next follow-up"), /* @__PURE__ */ React.createElement("input", { disabled: ro, type: "date", value: r.nextFollowUp, onChange: (e) => set({ nextFollowUp: e.target.value }), className: inCls })), /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2 flex items-end gap-2 pb-1" }, /* @__PURE__ */ React.createElement("a", { href: r.phone ? `tel:${r.phone}` : void 0, className: "text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" }, "Call"), /* @__PURE__ */ React.createElement("button", { onClick: () => waNumber(r.phone) ? openWhatsApp(r.phone, msg) : showToast("No usable phone number.", "err"), className: "text-xs px-2.5 py-1.5 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50" }, "WhatsApp"), /* @__PURE__ */ React.createElement("button", { onClick: openMail, className: "text-xs px-2.5 py-1.5 rounded-md border border-indigo-200 text-indigo-700 hover:bg-indigo-50" }, "Email"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Notes"), /* @__PURE__ */ React.createElement("textarea", { disabled: ro, rows: 3, value: r.notes, onChange: (e) => set({ notes: e.target.value }), className: inCls })), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg p-3" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Lock, { size: 14 }), " KYC / identification"), /* @__PURE__ */ React.createElement("div", { className: "grid md:grid-cols-2 gap-3 mb-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "PAN"), /* @__PURE__ */ React.createElement("input", { disabled: ro, value: r.pan, onChange: (e) => set({ pan: e.target.value.toUpperCase() }), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "CKYC / KIN"), /* @__PURE__ */ React.createElement("input", { disabled: ro, value: r.ckyc, onChange: (e) => set({ ckyc: e.target.value }), className: inCls }))), /* @__PURE__ */ React.createElement("div", { className: "grid md:grid-cols-2 gap-1" }, PL_KYC_DOCS.map((d) => /* @__PURE__ */ React.createElement("label", { key: d.key, className: "flex items-center gap-2 text-[13px] text-slate-600" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", disabled: ro, checked: !!(r.kycDocs || {})[d.key], onChange: (e) => set({ kycDocs: { ...r.kycDocs || {}, [d.key]: e.target.checked } }) }), " ", d.label)))), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg p-3" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Check, { size: 14 }), " Onboarding checklist \u2014 ", r.service), /* @__PURE__ */ React.createElement("div", { className: "space-y-1" }, items.map((it) => /* @__PURE__ */ React.createElement("label", { key: it.key, className: "flex items-center gap-2 text-[13px] text-slate-600" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", disabled: ro, checked: !!(r.check || {})[it.key], onChange: (e) => set({ check: { ...r.check || {}, [it.key]: e.target.checked } }) }), it.label, " ", it.req && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] px-1 py-0.5 rounded bg-rose-50 text-rose-600" }, "Req")))), missing.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5" }, "Outstanding before signing: ", missing.map((m) => m.label).join(", "), ".")), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg p-3" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Share2, { size: 14 }), " Share as a new lead"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-500 mb-2" }, "Sends the filled-in details to your team group. WhatsApp can't be pointed at a group automatically, so it opens with the message ready \u2014 pick ", /* @__PURE__ */ React.createElement("b", null, cfg.groupName || PL_GROUP), " from the chat list and send."), /* @__PURE__ */ React.createElement("pre", { className: "text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap", style: { maxHeight: "22vh", overflowY: "auto" } }, plShareText(r, cfg)), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mt-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        openWhatsAppShare(plShareText(r, cfg));
        logSend(`Lead shared to the ${cfg.groupName || PL_GROUP} group on WhatsApp`);
      },
      className: "text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
    },
    /* @__PURE__ */ React.createElement(MessageCircle, { size: 13 }),
    " Share to ",
    cfg.groupName || PL_GROUP
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        try {
          copyText(plShareText(r, cfg));
          showToast("Lead details copied.");
        } catch (e) {
          showToast("Couldn't copy.", "err");
        }
      },
      className: "text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
    },
    "Copy lead details"
  ))), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg p-3" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Send, { size: 14 }), " Send reminder / meeting invite"), /* @__PURE__ */ React.createElement("div", { className: "grid md:grid-cols-3 gap-3 mb-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Meeting link"), /* @__PURE__ */ React.createElement("input", { disabled: ro, value: r.meetingLink, onChange: (e) => set({ meetingLink: e.target.value }), placeholder: cfg.meetingLink || "https://\u2026", className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Meeting time"), /* @__PURE__ */ React.createElement("input", { disabled: ro, type: "datetime-local", value: r.meetingTime, onChange: (e) => set({ meetingTime: e.target.value }), className: inCls })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: lbl }, "Template"), /* @__PURE__ */ React.createElement("select", { value: tpl, onChange: (e) => setTpl(e.target.value), className: inCls }, Object.entries(TPLS).map(([k, v]) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, v.label))))), /* @__PURE__ */ React.createElement("textarea", { rows: 7, value: msg, onChange: (e) => setMsg(e.target.value), className: inCls }), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mt-2" }, /* @__PURE__ */ React.createElement("button", { onClick: sendWA, className: "text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(MessageCircle, { size: 13 }), " Send WhatsApp"), /* @__PURE__ */ React.createElement("button", { onClick: openMail, className: "text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Mail, { size: 13 }), " Open email app"), (db.sheetUrl || "").trim() && /* @__PURE__ */ React.createElement("button", { onClick: sendMailNow, disabled: sending, className: "text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 disabled:opacity-50" }, /* @__PURE__ */ React.createElement(Send, { size: 13 }), " ", sending ? "Sending\u2026" : "Send email now"), /* @__PURE__ */ React.createElement("button", { onClick: copyMsg, className: "text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" }, "Copy message"))), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-200 rounded-lg p-3" }, /* @__PURE__ */ React.createElement("div", { className: "text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(FileText, { size: 14 }), " Activity log"), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 mb-2" }, /* @__PURE__ */ React.createElement("input", { value: note, onChange: (e) => setNote(e.target.value), placeholder: "Add a note\u2026", className: inCls }), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        if (!note.trim()) return;
        setR((x) => ({ ...x, log: [{ date: (/* @__PURE__ */ new Date()).toISOString(), text: note.trim() }, ...x.log || []] }));
        setNote("");
      },
      className: "text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
    },
    "Add"
  )), /* @__PURE__ */ React.createElement("div", { className: "space-y-1", style: { maxHeight: "28vh", overflowY: "auto" } }, (r.log || []).map((l, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "text-[12px] text-slate-600 flex gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-slate-400 shrink-0" }, new Date(l.date).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })), /* @__PURE__ */ React.createElement("span", null, l.text))), !(r.log || []).length && /* @__PURE__ */ React.createElement("div", { className: "text-[12px] text-slate-400" }, "No activity yet.")))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 px-4 py-3 border-t border-slate-100 sticky bottom-0 bg-white" }, isAdmin && /* @__PURE__ */ React.createElement("button", { onClick: () => {
    clearDraft();
    onSave(r, rec.name ? null : `Enquiry created \xB7 ${r.service}`);
  }, className: "bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Check, { size: 15 }), " Save"), /* @__PURE__ */ React.createElement("button", { onClick: requestClose, className: "text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" }, dirty ? "Cancel" : "Close"), isAdmin && rec.name && /* @__PURE__ */ React.createElement("button", { onClick: () => {
    clearDraft();
    onDelete(r);
  }, className: "ml-auto text-sm px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Trash2, { size: 15 }), " Delete"), !isAdmin && /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-400 ml-2" }, "View only \u2014 ask the Principal Officer to make changes."))));
}

/* app.js — MorbiusFin admin. Painel de licenças. */
(function () {
  "use strict";
  const APP_VERSION = "1.0.0";
  const META_LS = "mfadmin.meta.v1";   // apelidos (PII) — só local, nunca publicado
  const THEME_LS = "mfadmin.theme";
  const DAY = 86400;
  const FRESH_MAX = 14 * DAY;          // janela offline embutida no financas (informativo)
  const PLANS = { vitalicio: null, mensal: 30 * DAY, anual: 365 * DAY, teste: 7 * DAY };
  const PLAN_LABEL = { vitalicio: "Vitalício", mensal: "Mensal", anual: "Anual", teste: "Teste" };

  let STATE = { iat: 0, v: 1, licencas: [] };
  let SHA = null;
  let META = {};
  let dirty = false;
  let editH = null;

  const $ = s => document.querySelector(s);
  const now = () => Math.floor(Date.now() / 1000);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- helpers ---------- */
  function normCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function fmtCode(h) { return h.length === 8 ? h.slice(0, 4) + "-" + h.slice(4) : h; }
  function fmtDate(ep) { if (!ep) return "—"; const d = new Date(ep * 1000); return d.toLocaleDateString("pt-BR"); }
  function daysActive(since) { return Math.max(0, Math.floor((now() - since) / DAY)); }
  function daysLeft(exp) { return exp ? Math.ceil((exp - now()) / DAY) : null; }
  function loadMeta() { try { META = JSON.parse(localStorage.getItem(META_LS) || "{}"); } catch (e) { META = {}; } }
  function saveMeta() { localStorage.setItem(META_LS, JSON.stringify(META)); }
  function apelido(h) { return (META[h] && META[h].apelido) || ""; }

  function statusOf(l) {
    if (l.st === "bloqueado") return "bloqueado";
    if (l.exp && now() > l.exp) return "expirado";
    return "ativo";
  }
  function mkEntry(e) { return { h: e.h, st: e.st, pl: e.pl, since: e.since, exp: e.exp == null ? null : e.exp }; }

  /* ---------- toast ---------- */
  let toastT;
  function toast(msg, kind) {
    const t = $("#toast");
    t.textContent = msg; t.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = "toast"; }, 2600);
  }

  /* ---------- modais ---------- */
  function openModal(id) { $("#" + id).classList.remove("hidden"); }
  function closeModal(id) { $("#" + id).classList.add("hidden"); }
  document.addEventListener("click", e => {
    const c = e.target.closest("[data-close]");
    if (c) closeModal(c.getAttribute("data-close"));
  });

  /* ---------- routing de telas ---------- */
  function showScreen(which) {
    $("#setup").classList.toggle("hidden", which !== "setup");
    $("#dash").classList.toggle("hidden", which !== "dash");
    $("#fab").classList.toggle("hidden", which !== "dash");
    $("#connBar").classList.toggle("hidden", which !== "dash");
  }

  /* ---------- conexão ---------- */
  function setConn(state, text) {
    $("#connDot").className = "conn-dot" + (state ? " " + state : "");
    $("#connText").textContent = text;
  }

  async function connect(repo, path, branch, token) {
    const cur = mfGit.get() || {};
    mfGit.save({ repo: repo.trim(), path: (path || "licencas.json").trim(), branch: (branch || "main").trim(), token: token || cur.token || "" });
    const r = await mfGit.test();      // joga se falhar
    SHA = r.sha;
    if (r.text) {
      try { const f = JSON.parse(r.text); STATE = { iat: f.iat || 0, v: f.v || 1, licencas: Array.isArray(f.licencas) ? f.licencas : [] }; }
      catch (e) { STATE = { iat: 0, v: 1, licencas: [] }; }
    } else { STATE = { iat: 0, v: 1, licencas: [] }; }
    dirty = false;
  }

  /* ---------- publicar (assina + commit) ---------- */
  function canonical(iat, licencas) {
    return JSON.stringify({ iat: iat, v: 1, licencas: licencas.map(mkEntry) });
  }
  async function publish() {
    if (!mfSign.hasKeys()) { toast("Sem chave de assinatura.", "err"); return; }
    if (!mfGit.isConfigured()) { toast("Sem conexão GitHub.", "err"); return; }
    const btn = $("#publish"); const old = btn.textContent; btn.textContent = "Publicando…"; btn.disabled = true;
    try {
      const iat = now();
      const licencas = STATE.licencas.map(mkEntry);
      const payload = canonical(iat, licencas);
      const sig = await mfSign.sign(payload);
      const file = JSON.stringify({ iat: iat, v: 1, licencas: licencas, sig: sig, app: "morbiusfin", gen: APP_VERSION }, null, 2);
      SHA = await mfGit.writeFile(file, SHA, "acesso: atualiza licencas (" + licencas.length + ")");
      STATE.iat = iat; dirty = false;
      render();
      toast("Publicado ✓", "ok");
    } catch (e) {
      toast(e.message || "Falha ao publicar", "err");
    } finally { btn.textContent = old; btn.disabled = false; }
  }

  /* ---------- ações ---------- */
  function findL(h) { return STATE.licencas.find(l => l.h === h); }
  function markDirty() { dirty = true; render(); }

  function addOrEdit() {
    const code = normCode($("#addCode").value);
    const name = $("#addName").value.trim();
    const plan = $("#addPlan").value;
    if (!code || code.length < 4) { toast("Código inválido.", "err"); return; }
    const dur = PLANS[plan];
    if (editH) {
      const l = findL(editH);
      if (l) { l.pl = plan; l.exp = dur == null ? null : now() + dur; }
      META[editH] = META[editH] || { addedAt: now() }; META[editH].apelido = name; saveMeta();
    } else {
      if (findL(code)) { toast("Esse código já existe.", "err"); return; }
      STATE.licencas.unshift({ h: code, st: "ativo", pl: plan, since: now(), exp: dur == null ? null : now() + dur });
      META[code] = { apelido: name, addedAt: now() }; saveMeta();
    }
    closeModal("modalAdd"); editH = null; markDirty();
  }

  function toggleBlock(h) {
    const l = findL(h); if (!l) return;
    l.st = l.st === "bloqueado" ? "ativo" : "bloqueado";
    markDirty();
    toast(l.st === "bloqueado" ? "Bloqueado — publique pra valer" : "Liberado — publique pra valer");
  }
  function renew(h) {
    const l = findL(h); if (!l) return;
    const dur = PLANS[l.pl]; if (dur == null) { toast("Vitalício não expira.", "ok"); return; }
    const base = Math.max(now(), l.exp || now());
    l.exp = base + dur; if (l.st === "bloqueado") l.st = "ativo";
    markDirty(); toast("Renovado +" + Math.round(dur / DAY) + "d");
  }
  function removeL(h) {
    STATE.licencas = STATE.licencas.filter(l => l.h !== h);
    delete META[h]; saveMeta(); markDirty();
  }

  function openEdit(h) {
    const l = findL(h); if (!l) return;
    editH = h;
    $("#addTitle").textContent = "Editar licença";
    $("#addCode").value = fmtCode(h); $("#addCode").readOnly = true;
    $("#addName").value = apelido(h);
    $("#addPlan").value = l.pl;
    $("#addSave").textContent = "Salvar";
    openModal("modalAdd");
  }
  function openAdd() {
    editH = null;
    $("#addTitle").textContent = "Adicionar licença";
    $("#addCode").value = ""; $("#addCode").readOnly = false;
    $("#addName").value = ""; $("#addPlan").value = "vitalicio";
    $("#addSave").textContent = "Adicionar";
    openModal("modalAdd");
  }

  let confirmCb = null;
  function confirmAction(title, text, okLabel, cb) {
    $("#cfTitle").textContent = title; $("#cfText").innerHTML = text;
    $("#cfOk").textContent = okLabel || "Confirmar"; confirmCb = cb; openModal("modalConfirm");
  }

  /* ---------- render ---------- */
  function render() {
    if (!mfGit.isConfigured()) { showScreen("setup"); setupBadges(); return; }
    showScreen("dash");
    setConn(mfGit.get().token ? "ok" : "err", mfGit.get().token ? (mfGit.get().repo) : "sem token");

    const ls = STATE.licencas;
    let ativos = 0, bloq = 0, vit = 0, exp = 0;
    ls.forEach(l => {
      const s = statusOf(l);
      if (s === "ativo") ativos++; if (s === "bloqueado") bloq++;
      if (l.pl === "vitalicio") vit++;
      const dl = daysLeft(l.exp);
      if (s === "ativo" && dl != null && dl >= 0 && dl <= 7) exp++;
    });
    $("#stAtivos").textContent = ativos; $("#stBloq").textContent = bloq;
    $("#stVit").textContent = vit; $("#stExp").textContent = exp;

    $("#dirtyBar").classList.toggle("hidden", !dirty);
    if (dirty) $("#dirtyText").textContent = "Alterações não publicadas";

    const q = $("#search").value.trim().toUpperCase();
    const filt = $("#filterSt").value;
    const list = $("#list"); list.innerHTML = "";
    const shown = ls.filter(l => {
      const s = statusOf(l);
      if (filt === "vitalicio" && l.pl !== "vitalicio") return false;
      if (filt !== "all" && filt !== "vitalicio" && s !== filt) return false;
      if (q) return l.h.includes(q) || apelido(l.h).toUpperCase().includes(q);
      return true;
    });
    $("#empty").classList.toggle("hidden", ls.length !== 0);
    shown.forEach(l => list.appendChild(card(l)));

    $("#lastPub").textContent = STATE.iat ? "Última publicação: " + new Date(STATE.iat * 1000).toLocaleString("pt-BR") : "Ainda não publicado.";
  }

  function card(l) {
    const s = statusOf(l);
    const ap = apelido(l.h);
    const name = ap || "(sem apelido)";
    const initial = (ap[0] || l.h[0] || "?").toUpperCase();
    const el = document.createElement("div");
    el.className = "lic " + s;
    const dl = daysLeft(l.exp);
    const dur = PLANS[l.pl];
    let bar = "";
    if (dur) {
      const total = dur / DAY, left = Math.max(0, dl);
      const pct = Math.max(2, Math.min(100, (left / total) * 100));
      const cls = left <= 3 ? "crit" : left <= 7 ? "low" : "";
      bar = `<div class="exp-bar"><div class="exp-fill ${cls}" style="width:${pct}%"></div></div>`;
    }
    const planCls = l.pl === "vitalicio" ? "plan-tag vit" : "plan-tag";
    const validade = l.pl === "vitalicio" ? "vitalício" : (dl != null && dl < 0 ? "expirou " + fmtDate(l.exp) : fmtDate(l.exp) + (dl != null ? ` · ${dl}d` : ""));
    el.innerHTML = `
      <div class="lic-top">
        <div class="lic-avatar">${esc(initial)}</div>
        <div class="lic-info">
          <div class="lic-name">${esc(name)}</div>
          <div class="lic-code">${esc(fmtCode(l.h))}</div>
        </div>
        <span class="lic-badge badge-${s}">${s}</span>
      </div>
      <div class="lic-meta">
        <span class="m"><span class="${planCls}">${PLAN_LABEL[l.pl]}</span></span>
        <span class="m">início <b>${fmtDate(l.since)}</b></span>
        <span class="m"><b>${daysActive(l.since)}</b> dias</span>
        <span class="m">validade <b>${validade}</b></span>
      </div>
      ${bar}
      <div class="lic-actions">
        <button class="btn ${l.st === "bloqueado" ? "primary" : "danger"} act-toggle">${l.st === "bloqueado" ? "Liberar" : "Bloquear"}</button>
        ${dur ? `<button class="btn ghost act-renew">Renovar</button>` : ``}
        <button class="btn ghost la-menu act-edit" title="Editar">✏️</button>
        <button class="btn ghost la-menu act-remove" title="Remover">🗑️</button>
      </div>`;
    el.querySelector(".act-toggle").onclick = () => toggleBlock(l.h);
    const rn = el.querySelector(".act-renew"); if (rn) rn.onclick = () => renew(l.h);
    el.querySelector(".act-edit").onclick = () => openEdit(l.h);
    el.querySelector(".act-remove").onclick = () => confirmAction("Remover licença",
      `Remover <b>${esc(name)}</b> (${esc(fmtCode(l.h))})? O acesso dela cai na próxima publicação.`, "Remover", () => removeL(l.h));
    return el;
  }

  /* ---------- setup ---------- */
  function setupBadges() {
    const k = mfSign.hasKeys();
    $("#step1Badge").textContent = k ? "ok" : "pendente"; $("#step1Badge").classList.toggle("ok", k);
    $("#keyMissing").classList.toggle("hidden", k); $("#keyReady").classList.toggle("hidden", !k);
    const g = mfGit.isConfigured();
    $("#step2Badge").textContent = g ? "ok" : "pendente"; $("#step2Badge").classList.toggle("ok", g);
    if (k) mfSign.publicKeyB64().then(b => { $("#pubKeyOut").value = b; });
    const c = mfGit.get(); if (c) { $("#ghRepo").value = c.repo || ""; $("#ghPath").value = c.path || "licencas.json"; $("#ghBranch").value = c.branch || "main"; }
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---------- wiring ---------- */
  function wire() {
    // tema
    $("#btnTheme").onclick = () => {
      const h = document.documentElement;
      const dark = h.classList.contains("theme-dark") || (!h.classList.contains("theme-light") && matchMedia("(prefers-color-scheme:dark)").matches);
      h.classList.remove("theme-dark", "theme-light"); h.classList.add(dark ? "theme-light" : "theme-dark");
      localStorage.setItem(THEME_LS, dark ? "light" : "dark");
    };
    // sync
    $("#btnSync").onclick = async () => {
      if (!mfGit.isConfigured()) return;
      try { const r = await mfGit.readFile(); SHA = r.sha;
        if (r.text) { const f = JSON.parse(r.text); STATE = { iat: f.iat || 0, v: f.v || 1, licencas: Array.isArray(f.licencas) ? f.licencas : [] }; }
        dirty = false; render(); toast("Atualizado", "ok");
      } catch (e) { toast(e.message, "err"); }
    };

    // setup: gerar chave
    $("#genKey").onclick = async () => {
      try { await mfSign.generate(); setupBadges(); toast("Chave gerada ✓", "ok"); }
      catch (e) { toast("Falha ao gerar chave", "err"); }
    };
    $("#copyPub").onclick = async () => { try { await navigator.clipboard.writeText($("#pubKeyOut").value); toast("Pública copiada", "ok"); } catch (e) { toast("Copie manualmente", "err"); } };
    $("#backupKeys").onclick = () => { const b = mfSign.exportBackup(); if (b) download("morbiusfin-admin-chaves.json", JSON.stringify(b, null, 2)); };
    $("#restoreKeys").onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader(); rd.onload = async () => {
        try { await mfSign.importBackup(JSON.parse(rd.result)); setupBadges(); toast("Chaves restauradas ✓", "ok"); }
        catch (err) { toast("Backup inválido", "err"); }
      }; rd.readAsText(f);
    };

    // setup: conectar github
    $("#connectGh").onclick = async () => {
      $("#connErr").classList.add("hidden");
      const repo = $("#ghRepo").value.trim(), token = $("#ghToken").value.trim();
      if (!/.+\/.+/.test(repo)) { showErr("#connErr", "Repo no formato dono/nome."); return; }
      if (!token) { showErr("#connErr", "Cole o token."); return; }
      const btn = $("#connectGh"), old = btn.textContent; btn.textContent = "Conectando…"; btn.disabled = true;
      try { await connect(repo, $("#ghPath").value, $("#ghBranch").value, token); $("#ghToken").value = ""; render(); toast("Conectado ✓", "ok"); }
      catch (e) { showErr("#connErr", e.message); }
      finally { btn.textContent = old; btn.disabled = false; }
    };

    // dashboard
    $("#fab").onclick = openAdd;
    $("#addSave").onclick = addOrEdit;
    $("#publish").onclick = publish;
    $("#search").oninput = render;
    $("#filterSt").onchange = render;
    $("#cfOk").onclick = () => { closeModal("modalConfirm"); if (confirmCb) { const cb = confirmCb; confirmCb = null; cb(); } };

    // conexão modal
    $("#connEdit").onclick = () => { const c = mfGit.get() || {}; $("#cmRepo").value = c.repo || ""; $("#cmPath").value = c.path || "licencas.json"; $("#cmBranch").value = c.branch || "main"; $("#cmToken").value = ""; $("#cmErr").classList.add("hidden"); openModal("connModal"); };
    $("#cmSave").onclick = async () => {
      $("#cmErr").classList.add("hidden");
      try { await connect($("#cmRepo").value.trim(), $("#cmPath").value, $("#cmBranch").value, $("#cmToken").value.trim()); closeModal("connModal"); render(); toast("Conexão salva ✓", "ok"); }
      catch (e) { showErr("#cmErr", e.message); }
    };
    $("#cmForget").onclick = () => { mfGit.forgetToken(); closeModal("connModal"); render(); toast("Token esquecido neste aparelho"); };
  }
  function showErr(sel, msg) { const e = $(sel); e.textContent = msg; e.classList.remove("hidden"); }

  /* ---------- boot ---------- */
  async function boot() {
    loadMeta();
    await mfSign.loadFromStorage();
    mfGit.load();
    wire();
    if (mfGit.isConfigured()) {
      try { await connect(mfGit.get().repo, mfGit.get().path, mfGit.get().branch, mfGit.get().token); } catch (e) { /* mostra setup/erro */ }
    }
    render();
    setTimeout(() => { const s = $("#splash"); s.classList.add("gone"); document.body.classList.remove("splash-on"); setTimeout(() => s.remove(), 600); }, 650);

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  document.addEventListener("DOMContentLoaded", boot);
})();

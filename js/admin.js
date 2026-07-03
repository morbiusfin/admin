/* ===== MorbiusFin · Admin (Supabase) — gestão de acessos/licenças =====
   Login do admin (email+senha). RLS no banco garante que só o email-admin lê/edita
   a tabela 'licencas'. Sem segredo no painel (publishable key é pública). */
(function () {
  "use strict";
  var SB_URL = "https://fyjzrsmfeokdkhboeopc.supabase.co";
  var SB_KEY = "sb_publishable_oUTz-QGMaaMo42n0hXJMlw_JVUst6Om";
  var sb = null;
  // Worker de push (Cloudflare). O /admin/notify exige a ADMIN_KEY (segredo do worker) no header x-admin-key.
  // A chave NÃO fica no código: o admin digita 1x e ela fica salva só neste aparelho.
  var PUSH_API = "https://financas-push.morbiusfin.workers.dev";
  var PUSH_KEY_LS = "mfadmin.pushKey";
  function getPushKey() {
    var k = ""; try { k = localStorage.getItem(PUSH_KEY_LS) || ""; } catch (e) {}
    if (!k) {
      k = (window.prompt("Chave de notificação (ADMIN_KEY do worker de push).\nFica salva só neste aparelho.") || "").trim();
      if (!k) return null;
      try { localStorage.setItem(PUSH_KEY_LS, k); } catch (e) {}
    }
    return k;
  }
  // storageKey próprio ("mfadmin-auth"): app e admin ficam no MESMO origin (morbiusfin.github.io) e dividem
  // localStorage; sem isso a sessão do admin sobrescreveria a do app (e vice-versa). Isolado, um não derruba o outro.
  function client() { if (sb) return sb; if (!window.supabase || !window.supabase.createClient) return null; sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "mfadmin-auth" } }); return sb; }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]); }); };
  var view = function () { return document.getElementById("adView"); };
  var who = function () { return document.getElementById("adWho"); };
  var _all = [], _email = "", _refreshT = null, _tab = "contas";
  // TESTE GRÁTIS (dias) p/ contas novas — fonte única na tabela 'config'. O app lê; aqui edita.
  var _trialCfg = 7;
  async function loadTrialCfg() {
    try { var q = await client().from("config").select("v").eq("k", "trial_days").limit(1); if (!q.error && q.data && q.data[0]) { var n = parseInt(q.data[0].v, 10); if (n >= 0 && n <= 365) _trialCfg = n; } } catch (e) {}
  }
  function fmtNasc(s) { s = String(s || ""); var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? (m[3] + "/" + m[2] + "/" + m[1]) : s; }   // "1996-04-18" -> "18/04/1996"

  // PLANOS (preços/textos/links) — editáveis aqui; salvos em config.planos (JSON); o app lê e mostra na tela de planos.
  var PLANOS_DEF = [
    { id: "plus", nome: "Plus", desc: "Sync na nuvem + backup automático + multi-dispositivo", preco_mensal: "R$ 9,90/mês", preco_anual: "R$ 79,90/ano", link_mensal: "https://mpago.la/1v75rri", link_anual: "https://mpago.la/1jMBXjG" },
    { id: "pro", nome: "Pro", desc: "Tudo do Plus + suporte prioritário + acesso antecipado às novidades", preco_mensal: "R$ 19,90/mês", preco_anual: "R$ 149,90/ano", link_mensal: "https://mpago.la/348pX4C", link_anual: "https://mpago.la/2N3VVMp" },
    { id: "ultimate", nome: "Ultimate", unico: true, desc: "Tudo do Pro, vitalício + novidades futuras", preco_unico: "R$ 249,90 (pagamento único)", link_mensal: "https://mpago.la/17XLZZw", link_anual: "https://mpago.la/17axJzb" },
  ];
  var _planosCfg = null;
  async function loadPlanosCfg() {
    try { var q = await client().from("config").select("v").eq("k", "planos").limit(1); if (!q.error && q.data && q.data[0] && q.data[0].v) { var p = JSON.parse(q.data[0].v); if (Array.isArray(p)) _planosCfg = p; } } catch (e) {}
  }

  // ===== ACESSOS (feature flags) — matriz por plano + override por pessoa =====
  var FEATURE_LIST = [
    { k: "nuvem", lbl: "Sync na nuvem + backup auto" },
    { k: "multidisp", lbl: "Multi-dispositivo" },
    { k: "conjunta", lbl: "Conta conjunta (casal)" },
    { k: "suporte", lbl: "Suporte prioritário" },
    { k: "antecipado", lbl: "Acesso antecipado" },
  ];
  var PLAN_LIST = [{ k: "teste", lbl: "Grátis" }, { k: "plus", lbl: "Plus" }, { k: "pro", lbl: "Pro" }, { k: "ultimate", lbl: "Ultimate" }];
  var FEAT_DEF = { teste: {}, plus: { nuvem: true, multidisp: true }, pro: { nuvem: true, multidisp: true, suporte: true, antecipado: true }, ultimate: { nuvem: true, multidisp: true, conjunta: true, suporte: true, antecipado: true } };
  var _planFeat = null;
  async function loadPlanFeatCfg() {
    try { var q = await client().from("config").select("v").eq("k", "plan_features").limit(1); if (!q.error && q.data && q.data[0] && q.data[0].v) { var p = JSON.parse(q.data[0].v); if (p && typeof p === "object") _planFeat = p; } } catch (e) {}
  }

  // ===== DESCONTOS por indicação (links MP por faixa de %, só mensal) =====
  var DISC_TIERS = [10, 20, 30, 40];
  var DISC_PLANS = [{ k: "plus", lbl: "Plus" }, { k: "pro", lbl: "Pro" }, { k: "ultimate", lbl: "Ultimate" }];
  var _refDisc = null;
  async function loadRefDiscCfg() {
    try { var q = await client().from("config").select("v").eq("k", "ref_discounts").limit(1); if (!q.error && q.data && q.data[0] && q.data[0].v) { var p = JSON.parse(q.data[0].v); if (p && typeof p === "object") _refDisc = p; } } catch (e) {}
  }
  function baseMensal(planoKey) {
    var ps = planoMerged(); var p = ps.filter(function (x) { return x.id === planoKey; })[0]; if (!p) return 0;
    var m = String(p.preco_mensal || "").match(/[\d.,]+/); if (!m) return 0;
    return parseFloat(m[0].replace(/\./g, "").replace(",", ".")) || 0;
  }
  function fmtBRL(n) { return "R$ " + (n || 0).toFixed(2).replace(".", ","); }
  function renderDescontos() {
    var c = content(); if (!c) return;
    var rd = _refDisc || {};
    var blocks = DISC_PLANS.map(function (p) {
      var base = baseMensal(p.k);
      var rows = DISC_TIERS.map(function (t) {
        var price = base * (1 - t / 100);
        var val = (rd[p.k] && rd[p.k][t]) || "";
        return '<div class="dz-row"><span class="dz-tier">' + t + '% OFF</span><span class="dz-price">' + (base ? fmtBRL(price) + "/mês" : "—") + '</span><input class="dz-link" data-p="' + p.k + '" data-t="' + t + '" placeholder="link Mercado Pago" value="' + esc(val) + '"></div>';
      }).join("");
      return '<div class="pl-card"><div class="pl-h">' + esc(p.lbl) + ' <span class="pl-id">base ' + (base ? fmtBRL(base) : "—") + '/mês</span></div>' + rows + '</div>';
    }).join("");
    c.innerHTML = '<div class="ad-card">'
      + '<div class="pl-intro">Cole os links do Mercado Pago com desconto (mensal). O preço com desconto é calculado da <b>base</b> (aba Planos). A pessoa cai no link da faixa conforme quantos amigos qualificou (5%/amigo → faixas de 10%, teto 40%).</div>'
      + blocks
      + '<div class="pl-save-row"><button type="button" class="btn primary" id="dzSave">Salvar e publicar</button><span id="dzMsg" class="ad-trial-msg"></span></div>'
      + '<div class="pl-note">Se faltar um link de faixa, o app usa o link normal do plano. Anual não tem desconto.</div></div>';
    var sv = c.querySelector("#dzSave");
    sv.onclick = async function () {
      var out = {};
      c.querySelectorAll(".dz-link").forEach(function (i) { var v = i.value.trim(); if (v) { (out[i.dataset.p] = out[i.dataset.p] || {})[i.dataset.t] = v; } });
      var msg = c.querySelector("#dzMsg"); sv.disabled = true; sv.textContent = "…";
      var r = await client().from("config").upsert({ k: "ref_discounts", v: JSON.stringify(out) }).select();
      sv.disabled = false; sv.textContent = "Salvar e publicar";
      if (r.error) { msg.textContent = "Erro — rodou trial-config?"; msg.className = "ad-trial-msg bad"; return; }
      _refDisc = out; msg.textContent = "✓ publicado"; msg.className = "ad-trial-msg ok"; adToast("🎁 Descontos atualizados");
    };
  }
  function planFeatMerged() {
    var out = {};
    PLAN_LIST.forEach(function (p) { var base = FEAT_DEF[p.k] || {}, cfg = (_planFeat && _planFeat[p.k]) || {}, row = {}; FEATURE_LIST.forEach(function (f) { row[f.k] = (cfg[f.k] != null) ? !!cfg[f.k] : !!base[f.k]; }); out[p.k] = row; });
    return out;
  }
  function renderAcessos() {
    var c = content(); if (!c) return;
    var m = planFeatMerged();
    var head = '<tr><th>Recurso</th>' + PLAN_LIST.map(function (p) { return '<th>' + esc(p.lbl) + '</th>'; }).join("") + '</tr>';
    var rows = FEATURE_LIST.map(function (f) {
      return '<tr><td class="acx-flab">' + esc(f.lbl) + '</td>' + PLAN_LIST.map(function (p) {
        return '<td><input type="checkbox" class="acx-ck" data-p="' + p.k + '" data-f="' + f.k + '"' + (m[p.k][f.k] ? " checked" : "") + '></td>';
      }).join("") + '</tr>';
    }).join("");
    c.innerHTML = '<div class="ad-card">'
      + '<div class="pl-intro">Tique o que cada plano tem. <b>Salvar</b> publica pra todos. Override individual é o 🔑 na aba Contas.</div>'
      + '<div class="acx-wrap"><table class="acx-tbl">' + head + rows + '</table></div>'
      + '<div class="pl-save-row"><button type="button" class="btn primary" id="acxSave">Salvar e publicar</button><span id="acxMsg" class="ad-trial-msg"></span></div></div>';
    var sv = c.querySelector("#acxSave");
    sv.onclick = async function () {
      var out = {}; PLAN_LIST.forEach(function (p) { out[p.k] = {}; });
      c.querySelectorAll(".acx-ck").forEach(function (ck) { out[ck.dataset.p][ck.dataset.f] = ck.checked; });
      var msg = c.querySelector("#acxMsg"); sv.disabled = true; sv.textContent = "…";
      var r = await client().from("config").upsert({ k: "plan_features", v: JSON.stringify(out) }).select();
      sv.disabled = false; sv.textContent = "Salvar e publicar";
      if (r.error) { msg.textContent = "Erro — rodou features.sql?"; msg.className = "ad-trial-msg bad"; return; }
      _planFeat = out; msg.textContent = "✓ publicado"; msg.className = "ad-trial-msg ok"; adToast("🔑 Acessos por plano atualizados");
    };
  }
  function openUserFeatures(uid) {
    var l = byUid(uid); if (!l) return;
    var ov = (l.features && typeof l.features === "object") ? l.features : {};
    var m = document.getElementById("ufOv"); if (m) m.remove();
    m = document.createElement("div"); m.id = "ufOv"; m.className = "fc-ov"; document.body.appendChild(m);
    var rows = FEATURE_LIST.map(function (f) {
      var v = (ov[f.k] === true) ? "on" : (ov[f.k] === false) ? "off" : "herda";
      return '<label class="uf-row"><span>' + esc(f.lbl) + '</span><select data-f="' + f.k + '">'
        + '<option value="herda"' + (v === "herda" ? " selected" : "") + '>Herda do plano</option>'
        + '<option value="on"' + (v === "on" ? " selected" : "") + '>Ligado</option>'
        + '<option value="off"' + (v === "off" ? " selected" : "") + '>Desligado</option></select></label>';
    }).join("");
    m.innerHTML = '<div class="fc-card"><div class="fc-h">🔑 Acessos de ' + esc(l.nome || l.email || "(sem nome)") + '</div>'
      + '<div class="fc-sub">Override desta pessoa. "Herda" = usa o padrão do plano (' + esc(l.plano || "teste") + ').</div>'
      + '<div class="uf-list">' + rows + '</div>'
      + '<div class="fc-acts"><button type="button" class="btn ghost" id="ufCancel">Cancelar</button><button type="button" class="btn primary" id="ufSave">Salvar</button></div></div>';
    m.querySelector("#ufCancel").onclick = function () { m.remove(); };
    m.addEventListener("click", function (e) { if (e.target === m) m.remove(); });
    m.querySelector("#ufSave").onclick = async function () {
      var obj = {};
      m.querySelectorAll(".uf-row select").forEach(function (s) { if (s.value === "on") obj[s.dataset.f] = true; else if (s.value === "off") obj[s.dataset.f] = false; });
      var feats = Object.keys(obj).length ? obj : null;
      var btn = this; btn.disabled = true; btn.textContent = "…";
      var r = await client().from("licencas").update({ features: feats, atualizado_em: new Date().toISOString() }).eq("user_id", uid).select();
      btn.disabled = false; btn.textContent = "Salvar";
      if (r.error) { alert("Erro ao salvar acessos: " + r.error.message + "\n(rodou features.sql?)"); return; }
      l.features = feats; m.remove(); adToast("🔑 Acessos salvos");
    };
  }
  function planoMerged() {
    return PLANOS_DEF.map(function (d) { var o = (_planosCfg || []).find(function (x) { return x && x.id === d.id; }) || {}; var m = {}; for (var k in d) m[k] = d[k]; for (var k2 in o) { if (o[k2] !== "" && o[k2] != null) m[k2] = o[k2]; } return m; });
  }
  function plFld(id, k, label, val) {
    return '<label class="pl-fld"><span>' + esc(label) + '</span><input data-pl="' + esc(id) + '-' + k + '" value="' + esc(val || "") + '"></label>';
  }
  function renderPlanos() {
    var c = content(); if (!c) return;
    var ps = planoMerged();
    var blocks = ps.map(function (p) {
      var precoRow = p.unico
        ? plFld(p.id, "preco_unico", "Preço (pagamento único)", p.preco_unico)
        : plFld(p.id, "preco_mensal", "Preço mensal", p.preco_mensal) + plFld(p.id, "preco_anual", "Preço anual", p.preco_anual);
      var linkM = p.unico ? "Link pagamento (ciclo Mensal)" : "Link pagamento mensal";
      var linkA = p.unico ? "Link pagamento (ciclo Anual)" : "Link pagamento anual";
      return '<div class="pl-card">'
        + '<div class="pl-h">' + esc(p.nome) + ' <span class="pl-id">' + esc(p.id) + '</span></div>'
        + plFld(p.id, "nome", "Nome", p.nome)
        + plFld(p.id, "desc", "Descrição", p.desc)
        + precoRow
        + plFld(p.id, "link_mensal", linkM, p.link_mensal)
        + plFld(p.id, "link_anual", linkA, p.link_anual)
        + '</div>';
    }).join("");
    c.innerHTML = '<div class="ad-card">'
      + '<div class="pl-intro">Edite preços, textos e links de pagamento (Mercado Pago). <b>Salvar</b> publica direto no app de produção.</div>'
      + blocks
      + '<div class="pl-save-row"><button type="button" class="btn primary" id="plSave">Salvar e publicar</button><span id="plMsg" class="ad-trial-msg"></span></div>'
      + '<div class="pl-note">Preço é texto livre (ex.: "R$ 9,90/mês"). Link vazio → botão mostra "Em breve" no app. Cor e selo do plano seguem fixos.</div>'
      + '</div>';
    var sv = c.querySelector("#plSave");
    sv.onclick = async function () {
      var out = ps.map(function (p) {
        function g(k) { var el = c.querySelector('[data-pl="' + p.id + '-' + k + '"]'); return el ? el.value.trim() : ""; }
        var o = { id: p.id, nome: g("nome"), desc: g("desc"), link_mensal: g("link_mensal"), link_anual: g("link_anual") };
        if (p.unico) { o.unico = true; o.preco_unico = g("preco_unico"); } else { o.preco_mensal = g("preco_mensal"); o.preco_anual = g("preco_anual"); }
        return o;
      });
      var msg = c.querySelector("#plMsg");
      sv.disabled = true; sv.textContent = "…";
      var r = await client().from("config").upsert({ k: "planos", v: JSON.stringify(out) }).select();
      sv.disabled = false; sv.textContent = "Salvar e publicar";
      if (r.error) { msg.textContent = "Erro — rodou o SQL config (trial-config)?"; msg.className = "ad-trial-msg bad"; return; }
      _planosCfg = out;
      msg.textContent = "✓ publicado no app"; msg.className = "ad-trial-msg ok";
      adToast("💳 Planos atualizados no app");
    };
  }
  function content() { return document.getElementById("adContent"); }
  // dias restantes da licença (pro admin saber quanto falta)
  function diasInfo(v) {
    if (!v) return { txt: "vitalício", cls: "dias-vit" };
    // vence no FIM do dia, horário de Brasília (GMT-03) — não meia-noite UTC
    var s = String(v);
    var d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T23:59:59-03:00") : new Date(s);
    if (isNaN(d.getTime())) return { txt: "", cls: "" };
    var dias = Math.ceil((d - new Date()) / 86400000);
    if (dias < 0) return { txt: "vencido", cls: "dias-venc" };
    if (dias === 0) return { txt: "vence hoje", cls: "dias-venc" };
    if (dias === 1) return { txt: "falta 1 dia", cls: "dias-poucos" };
    return { txt: "faltam " + dias + " dias", cls: dias <= 3 ? "dias-poucos" : "dias-ok" };
  }
  // 2 abas: Contas (lista) e Uso (dash + ranking)
  function renderShell() {
    view().innerHTML = '<div class="ad-tabs">'
      + '<button type="button" class="ad-tab' + (_tab === "contas" ? " on" : "") + '" data-tab="contas">📋 Contas</button>'
      + '<button type="button" class="ad-tab' + (_tab === "uso" ? " on" : "") + '" data-tab="uso">📈 Uso</button>'
      + '<button type="button" class="ad-tab' + (_tab === "planos" ? " on" : "") + '" data-tab="planos">💳 Planos</button>'
      + '<button type="button" class="ad-tab' + (_tab === "acessos" ? " on" : "") + '" data-tab="acessos">🔑 Acessos</button>'
      + '<button type="button" class="ad-tab' + (_tab === "descontos" ? " on" : "") + '" data-tab="descontos">🎁 Descontos</button>'
      + '</div><div id="adContent"></div>';
    view().querySelectorAll(".ad-tab").forEach(function (b) { b.onclick = function () { _tab = b.dataset.tab; renderShell(); }; });
    if (_tab === "uso") renderUsage(); else if (_tab === "planos") renderPlanos(); else if (_tab === "acessos") renderAcessos(); else if (_tab === "descontos") renderDescontos(); else renderTable("");
  }
  function adToast(msg) {
    var t = document.getElementById("adToast");
    if (!t) { t = document.createElement("div"); t.id = "adToast"; t.className = "ad-toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 6000);
  }
  function stopAutoRefresh() { if (_refreshT) { clearInterval(_refreshT); _refreshT = null; } }
  function startAutoRefresh() {
    stopAutoRefresh();
    _refreshT = setInterval(async function () {
      if (document.hidden) return;
      var ae = document.activeElement;
      if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;   // não atualiza enquanto edita/busca
      try {
        var q = await client().from("licencas").select("*").order("criado_em", { ascending: false });
        if (q.error || !q.data) return;
        if (JSON.stringify(q.data) === JSON.stringify(_all)) return;     // nada mudou → sem flicker
        var novos = q.data.filter(function (n) { return !_all.some(function (o) { return o.email === n.email; }); });
        _all = q.data;
        if (_tab === "contas") { var s = document.getElementById("adSearch"); renderTable(s ? s.value : ""); }   // re-renderiza só a aba de contas (não atrapalha a aba Uso)
        if (novos.length) adToast("🔔 " + (novos.length === 1 ? "Nova conta: " + (novos[0].email || "(sem email)") : novos.length + " novas contas"));
      } catch (e) {}
    }, 5000);   // a cada 5s: conta nova aparece sozinha + alerta
  }

  var PW_EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var PW_EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  function pwEyes() {
    try {
      document.querySelectorAll('input[type="password"]').forEach(function (input) {
        if (input.dataset.eye) return; input.dataset.eye = "1";
        var p = input.parentNode; if (!p) return;
        var w = document.createElement("span"); w.className = "pw-wrap"; p.insertBefore(w, input); w.appendChild(input);
        var b = document.createElement("button"); b.type = "button"; b.className = "pw-eye"; b.tabIndex = -1; b.setAttribute("aria-label", "Mostrar senha"); b.innerHTML = PW_EYE;
        b.onmousedown = function (e) { e.preventDefault(); };
        b.onclick = function () { var show = input.getAttribute("type") === "password"; input.setAttribute("type", show ? "text" : "password"); b.innerHTML = show ? PW_EYE_OFF : PW_EYE; };
        w.appendChild(b);
      });
    } catch (e) {}
  }
  function msg(t, cls) { var m = $("#adMsg"); if (m) { m.textContent = t || ""; m.className = "ad-msg" + (cls ? (" " + cls) : ""); } }
  function fmtDate(s) { if (!s) return "—"; try { var d = new Date(s); if (isNaN(d.getTime())) return String(s).slice(0, 10); return d.toLocaleDateString("pt-BR"); } catch (e) { return String(s).slice(0, 10); } }

  function showLogin(m, bad) {
    stopAutoRefresh();
    who().innerHTML = "";
    view().innerHTML = '<div class="ad-card ad-login">'
      + '<div class="ad-field"><span>Email do admin</span><input id="adEmail" type="email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="voce@email.com"></div>'
      + '<div class="ad-field"><span>Senha</span><input id="adSen" type="password" autocomplete="current-password" placeholder="sua senha"></div>'
      + '<div id="adMsg" class="ad-msg' + (bad ? " bad" : "") + '">' + (m || "") + '</div>'
      + '<button class="btn primary" id="adGo">Entrar</button></div>';
    $("#adGo").onclick = doLogin;
    $("#adSen").onkeydown = function (e) { if (e.key === "Enter") doLogin(); };
    pwEyes();
  }
  async function doLogin() {
    var c = client(); if (!c) { msg("Sem conexão", "bad"); return; }
    var email = ($("#adEmail").value || "").trim().toLowerCase(), sen = $("#adSen").value || "";
    if (!/.+@.+\..+/.test(email) || !sen) { msg("Preencha email e senha", "bad"); return; }
    msg("Entrando…");
    var r = await c.auth.signInWithPassword({ email: email, password: sen });
    if (r.error) { msg(/invalid login/i.test(r.error.message) ? "Email ou senha incorretos" : r.error.message, "bad"); return; }
    showPanel(r.data.user.email);
  }
  async function boot() {
    var c = client(); if (!c) { showLogin("Carregando…"); setTimeout(boot, 400); return; }
    var s = await c.auth.getSession();
    if (s.data && s.data.session) showPanel(s.data.session.user.email); else showLogin();
  }
  async function showPanel(email) {
    _email = email || "";
    who().innerHTML = '<span>' + esc(_email) + '</span><button class="btn ghost sm" id="adOut">Sair</button>';
    $("#adOut").onclick = async function () { try { await client().auth.signOut(); } catch (e) {} _all = []; showLogin(); };
    view().innerHTML = '<div class="ad-card"><div class="ad-empty">Carregando licenças…</div></div>';
    var q = await client().from("licencas").select("*").order("criado_em", { ascending: false });
    if (q.error) {
      view().innerHTML = '<div class="ad-card"><div class="ad-empty">Não consegui ler as licenças.<br><b>'
        + esc(q.error.message) + '</b><br><br>Se diz permissão/RLS: confira se o <b>SEU_EMAIL_ADMIN</b> da política do banco é exatamente <b>' + esc(_email) + '</b>.</div></div>';
      return;
    }
    _all = q.data || [];
    try { await loadTrialCfg(); } catch (e) {}   // dias do teste grátis (pro controle no topo das Contas)
    try { await loadPlanosCfg(); } catch (e) {}  // preços/textos/links dos planos (aba Planos)
    try { await loadPlanFeatCfg(); } catch (e) {} // matriz de acessos por plano (aba Acessos)
    try { await loadRefDiscCfg(); } catch (e) {}  // links de desconto por indicação (aba Descontos)
    renderShell();
    startAutoRefresh();
    try { maybeFixContato(); } catch (e) {}   // 1x: completa nome/telefone das contas antigas que ficaram vazias
  }
  function renderTable(filter) {
    var f = (filter || "").trim().toLowerCase();
    var rows = _all.filter(function (l) {
      if (!f) return true;
      var fd = f.replace(/\D/g, "");
      return String(l.email || "").toLowerCase().indexOf(f) >= 0
        || String(l.nome || "").toLowerCase().indexOf(f) >= 0
        || (!!fd && String(l.telefone || "").replace(/\D/g, "").indexOf(fd) >= 0);
    });
    var ativos = _all.filter(function (l) { return l.status !== "bloqueado"; }).length;
    var html = '<div class="ad-toolbar"><input id="adSearch" class="ad-search" placeholder="Buscar nome, email ou telefone…" value="' + esc(filter || "") + '">'
      + '<span class="ad-stat">' + _all.length + ' conta(s) · ' + ativos + ' ativa(s)</span>'
      + '<button class="btn ghost sm" id="adNotify">🔔 Notificar</button>'
      + '<button class="btn ghost sm" id="adReload">↻ Atualizar</button></div>'
      + '<div class="ad-trial">🎁 <b>Teste grátis</b> p/ contas novas: <input id="adTrialDays" type="number" min="0" max="365" inputmode="numeric" value="' + _trialCfg + '"> dias <button type="button" class="btn ghost sm" id="adTrialSave">Salvar</button><span id="adTrialMsg" class="ad-trial-msg"></span></div>'
      + '<div class="ad-rows">';
    if (!rows.length) html += '<div class="ad-card"><div class="ad-empty">Nenhuma conta' + (f ? " pra esse filtro" : " ainda") + '.</div></div>';
    rows.forEach(function (l) {
      var bloq = l.status === "bloqueado";
      var tier = l.plano || "teste";
      var tEmoji = { teste: "broto", plus: "estrela", pro: "foguete", ultimate: "coroa" }[tier] || "broto";
      var tNome = { teste: "Grátis", plus: "Plus", pro: "Pro", ultimate: "Ultimate" }[tier] || tier;
      var tierPill = '<span class="tier tier-' + esc(tier) + '"><img src="https://morbiusfin.github.io/emoji/' + tEmoji + '.webp" alt="" loading="lazy" draggable="false">' + esc(tNome) + '</span>';
      var planoLbl = { teste: "Grátis", plus: "Plus", pro: "Pro", ultimate: "Ultimate" };
      var planos = ["teste", "plus", "pro", "ultimate"].map(function (p) { return '<option value="' + p + '"' + (l.plano === p ? " selected" : "") + '>' + (planoLbl[p] || p) + '</option>'; }).join("");
      var nomeTxt = (l.nome && String(l.nome).trim()) ? esc(l.nome) : '<span class="ad-noname">sem nome</span>';
      var telTxt = (l.telefone && String(l.telefone).trim()) ? '<div class="ad-tel">📱 ' + esc(l.telefone) + '</div>' : '';
      var nascTxt = (l.nascimento && String(l.nascimento).trim()) ? '<div class="ad-tel">🎂 ' + esc(fmtNasc(l.nascimento)) + '</div>' : '';
      html += '<div class="ad-row row-' + esc(tier) + '" data-uid="' + esc(l.user_id) + '">'
        + '<div><div class="ad-name">' + nomeTxt + '</div><div class="ad-email">' + esc(l.email || "(sem email)") + '</div>' + telTxt + nascTxt
        + '<div class="ad-sub">' + tierPill + '<span class="pill ' + (bloq ? "bloqueado" : "ativo") + '">' + (bloq ? "bloqueado" : "ativo") + '</span>'
        + '<span>criado ' + fmtDate(l.criado_em) + '</span>' + (l.validade ? '<span>· vence ' + fmtDate(l.validade) + '</span>' : '') + (function () { var di = diasInfo(l.validade); return '<span class="ad-dias ' + di.cls + '">' + di.txt + '</span>'; })() + '</div></div>'
        + '<div class="ad-controls">'
        + '<select data-k="plano" title="Plano">' + planos + '</select>'
        + '<label class="ad-datelbl">Expira (bloqueia ao vencer)<input type="date" data-k="validade" title="Data em que o acesso expira e bloqueia. Vazio = vitalício." value="' + (l.validade ? String(l.validade).slice(0, 10) : "") + '"></label>'
        + '<div class="ad-quick"><button class="btn ghost sm" data-act="plus30" title="+30 dias">+30d</button>'
        + '<button class="btn ghost sm" data-act="plus1y" title="+1 ano">+1a</button>'
        + '<button class="btn ghost sm" data-act="vitalicio" title="Vitalício (sem validade)">Vit.</button></div>'
        + '<button class="btn ' + (bloq ? "primary" : "ghost") + ' sm" data-act="toggle">' + (bloq ? "Ativar" : "Bloquear") + '</button>'
        + '<button class="btn primary sm" data-act="save">Salvar</button>'
        + '<button class="btn ghost sm" data-act="feats" title="Acessos desta pessoa (override do plano)">🔑</button>'
        + '</div></div>';
    });
    html += '</div>';
    var c = content(); if (c) c.innerHTML = html; else view().innerHTML = html;
    var s = $("#adSearch"); if (s) s.oninput = function (e) { renderKeepFocus(e.target.value); };
    var rl = $("#adReload"); if (rl) rl.onclick = function () { showPanel(_email); };
    var nt = $("#adNotify"); if (nt) nt.onclick = openNotify;
    var tsv = $("#adTrialSave");
    if (tsv) tsv.onclick = async function () {
      var n = parseInt(($("#adTrialDays") || {}).value, 10);
      var tm = $("#adTrialMsg");
      if (!(n >= 0 && n <= 365)) { if (tm) { tm.textContent = "use 0 a 365"; tm.className = "ad-trial-msg bad"; } return; }
      tsv.disabled = true; tsv.textContent = "…";
      var r = await client().from("config").upsert({ k: "trial_days", v: String(n) }).select();
      tsv.disabled = false; tsv.textContent = "Salvar";
      if (r.error) { if (tm) { tm.textContent = "Erro — rodou o SQL trial-config?"; tm.className = "ad-trial-msg bad"; } return; }
      _trialCfg = n;
      if (tm) { tm.textContent = "✓ salvo · vale pras próximas contas"; tm.className = "ad-trial-msg ok"; }
      adToast("🎁 Teste grátis: " + n + " dia(s)");
    };
    document.querySelectorAll(".ad-row").forEach(function (row) {
      var uid = row.dataset.uid;
      var dateInp = row.querySelector('[data-k="validade"]');
      // FLEXÍVEL: QUALQUER plano pode ter (ou não) uma data de expiração — plano e data são independentes.
      // Mudar a data salva na hora MANTENDO o plano escolhido (reflete no app do usuário em segundos).
      dateInp.onchange = function () { setData(uid, row); };
      row.querySelector('[data-act="toggle"]').onclick = function () { toggleBlock(uid); };
      row.querySelector('[data-act="save"]').onclick = function () { saveRow(uid, row); };
      row.querySelector('[data-act="plus30"]').onclick = function () { shiftValidade(uid, row, 30); };
      row.querySelector('[data-act="plus1y"]').onclick = function () { shiftValidade(uid, row, 365); };
      row.querySelector('[data-act="vitalicio"]').onclick = function () { setVitalicio(uid, row); };
      var fb = row.querySelector('[data-act="feats"]'); if (fb) fb.onclick = function () { openUserFeatures(uid); };
    });
  }
  var _searchT = null;
  function renderKeepFocus(v) { clearTimeout(_searchT); _searchT = setTimeout(function () { renderTable(v); var s = $("#adSearch"); if (s) { s.focus(); try { s.setSelectionRange(s.value.length, s.value.length); } catch (e) {} } }, 130); }
  function byUid(uid) { return _all.find(function (x) { return x.user_id === uid; }); }
  // data curta dd/mm - hh:mm no horário de Brasília
  function fmtDM(ts) {
    var d = new Date(ts); if (isNaN(d.getTime())) return "";
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(", ", " - ");
  }
  var USO_SINCE_KEY = "mfadmin.usoSince";   // reset "soft": só conta acessos a partir deste ts (não apaga a tabela)
  // Aba USO: dash de acessos por dia (14d) + ranking de quem mais acessa (com último acesso) + reset.
  async function renderUsage() {
    var c = content(); if (!c) return;
    c.innerHTML = '<div class="ad-card"><div class="ad-empty">Carregando uso…</div></div>';
    var resetTs = 0; try { resetTs = +(localStorage.getItem(USO_SINCE_KEY) || 0) || 0; } catch (e) {}
    var sinceMs = Math.max(Date.now() - 30 * 86400000, resetTs);   // janela = 30d OU desde o reset (o que for mais recente)
    var since = new Date(sinceMs).toISOString();
    var q = await client().from("acessos").select("user_id, ts").gte("ts", since).order("ts", { ascending: true });
    if (q.error) {
      c.innerHTML = '<div class="ad-card"><div class="ad-empty">📈 Registro de acessos ainda não ativo.<br><br>Rode o SQL <b>usage.sql</b> no Supabase pra ligar o dash.<br><span style="opacity:.6">' + esc(q.error.message) + '</span></div></div>';
      return;
    }
    var rows = q.data || [];
    var days = [], map = {};
    for (var i = 13; i >= 0; i--) { var dt = new Date(Date.now() - i * 86400000); var key = dt.toISOString().slice(0, 10); days.push(key); map[key] = 0; }
    var perUser = {}, lastTs = {};
    rows.forEach(function (r) {
      var key = String(r.ts).slice(0, 10); if (key in map) map[key]++;
      perUser[r.user_id] = (perUser[r.user_id] || 0) + 1;
      var t = +new Date(r.ts); if (!lastTs[r.user_id] || t > lastTs[r.user_id]) lastTs[r.user_id] = t;   // último acesso por pessoa
    });
    var max = days.reduce(function (m, k) { return Math.max(m, map[k]); }, 1);
    var bars = days.map(function (k) {
      var v = map[k]; var h = v ? Math.max(Math.round(v / max * 100), 7) : 0; var d = k.slice(8, 10) + "/" + k.slice(5, 7);
      return '<div class="uso-bar" title="' + d + ': ' + v + '"><div class="uso-bar-n">' + (v || "") + '</div><div class="uso-bar-fill" style="height:' + h + '%"></div><div class="uso-bar-d">' + d + '</div></div>';
    }).join("");
    var rank = Object.keys(perUser).map(function (uid) { var l = byUid(uid) || {}; return { nome: (l.nome && String(l.nome).trim()) || l.email || "(sem nome)", n: perUser[uid], last: lastTs[uid] || 0 }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 15);
    var rankMax = rank.length ? rank[0].n : 1;
    var resetNota = resetTs ? ' · desde ' + fmtDM(resetTs) : '';
    var html = '<div class="ad-card uso-card"><div class="uso-h">📈 Acessos por dia <span class="uso-sub">últimos 14 dias · ' + rows.length + ' registro(s)' + resetNota + '</span><button type="button" class="btn ghost sm" id="usoReset" title="Recomeça a contagem de agora">↺ Resetar</button></div><div class="uso-chart">' + bars + '</div></div>';
    html += '<div class="ad-card uso-card"><div class="uso-h">🏆 Quem mais acessa</div><div class="uso-rank">';
    if (!rank.length) html += '<div class="ad-empty">Sem acessos no período.</div>';
    rank.forEach(function (r, i) {
      var medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1) + "º";
      var w = Math.max(Math.round(r.n / rankMax * 100), 8);
      var last = r.last ? '<span class="uso-rk-last">📅 ' + fmtDM(r.last) + '</span>' : '';
      html += '<div class="uso-rk"><span class="uso-rk-pos">' + medal + '</span><div class="uso-rk-mid"><span class="uso-rk-nome">' + esc(r.nome) + '</span>' + last + '<span class="uso-rk-bar" style="width:' + w + '%"></span></div><span class="uso-rk-n">' + r.n + '</span></div>';
    });
    html += '</div></div>';
    c.innerHTML = html;
    var rb = document.getElementById("usoReset");
    if (rb) rb.onclick = function () {
      if (!window.confirm("Resetar o painel de uso?\n\nA contagem recomeça de AGORA — os acessos anteriores deixam de aparecer aqui. Não apaga nada permanente; é só a visão.")) return;
      try { localStorage.setItem(USO_SINCE_KEY, String(Date.now())); } catch (e) {}
      adToast("Uso resetado — contando de agora ↺");
      renderUsage();
    };
  }
  // TODAS as escritas por USER_ID (PK, mesma chave que o APP lê) + .select() pra confirmar que mudou.
  async function toggleBlock(uid) {
    var l = byUid(uid); if (!l) return;
    var novo = l.status === "bloqueado" ? "ativo" : "bloqueado";
    var r = await client().from("licencas").update({ status: novo }).eq("user_id", uid).select();
    if (r.error) { alert("Falha: " + r.error.message); return; }
    if (!r.data || !r.data.length) { alert("Nada gravado (linha não encontrada)."); return; }
    l.status = novo; renderTable($("#adSearch") ? $("#adSearch").value : "");
  }
  async function saveRow(uid, row) {
    var plano = row.querySelector('[data-k="plano"]').value;
    var validade = row.querySelector('[data-k="validade"]').value || null;   // plano e data independentes (qualquer plano pode ter data)
    var btn = row.querySelector('[data-act="save"]'); btn.textContent = "…";
    var r = await client().from("licencas").update({ plano: plano, validade: validade }).eq("user_id", uid).select();
    if (r.error) { btn.textContent = "Salvar"; alert("Falha: " + r.error.message); return; }
    if (!r.data || !r.data.length) { btn.textContent = "Salvar"; alert("Nada gravado (linha não encontrada)."); return; }
    var l = byUid(uid); if (l) { l.plano = plano; l.validade = validade; }
    btn.textContent = "✓"; setTimeout(function () { btn.textContent = "Salvar"; }, 1200);
  }
  // shiftValidade: soma dias à validade (partindo do maior entre hoje e validade atual)
  async function shiftValidade(uid, row, dias) {
    var l = byUid(uid); if (!l) return;
    var base = new Date();
    if (l.validade) { var v = new Date(l.validade); if (!isNaN(v.getTime()) && v > base) base = v; }
    base.setDate(base.getDate() + dias);
    var novaVal = base.toISOString().slice(0, 10);
    var inp = row.querySelector('[data-k="validade"]'); if (inp) inp.value = novaVal;
    var r = await client().from("licencas").update({ validade: novaVal }).eq("user_id", uid).select();   // só estende o prazo; mantém o plano atual
    if (r.error) { alert("Falha: " + r.error.message); return; }
    if (!r.data || !r.data.length) { alert("Nada gravado (linha não encontrada)."); return; }
    l.validade = novaVal;
    renderTable(document.getElementById("adSearch") ? document.getElementById("adSearch").value : "");
  }
  // setData: escolher a data no input já grava {plano atual + validade} na hora (qualquer plano pode ter data).
  async function setData(uid, row) {
    var plano = row.querySelector('[data-k="plano"]').value;
    var dateVal = row.querySelector('[data-k="validade"]').value || null;
    var r = await client().from("licencas").update({ plano: plano, validade: dateVal }).eq("user_id", uid).select();
    if (r.error) { alert("Falha: " + r.error.message); return; }
    if (!r.data || !r.data.length) { alert("Nada gravado (linha não encontrada)."); return; }
    var l = byUid(uid); if (l) { l.plano = plano; l.validade = dateVal; }
    renderTable(document.getElementById("adSearch") ? document.getElementById("adSearch").value : "");
  }
  // setVitalicio: remove a validade (null = nunca expira)
  async function setVitalicio(uid, row) {
    var l = byUid(uid);
    var r = await client().from("licencas").update({ validade: null }).eq("user_id", uid).select();
    if (r.error) { alert("Falha: " + r.error.message); return; }
    if (!r.data || !r.data.length) { alert("Nada gravado (linha não encontrada)."); return; }
    if (l) l.validade = null;
    var inp = row.querySelector('[data-k="validade"]'); if (inp) inp.value = "";
    renderTable(document.getElementById("adSearch") ? document.getElementById("adSearch").value : "");
  }
  // Telefone: o +55 é FIXO fora do input → o input guarda só DDD+número, sem código de país, sem strip
  // (não trava no DDD 55) e sem separador no fim até ter dígito depois (backspace apaga dígito a dígito).
  function maskTelLocal(v) {
    var d = (v || "").replace(/\D/g, "").slice(0, 11); if (!d) return "";
    if (d.length <= 2) return "(" + d;
    var out = "(" + d.slice(0, 2) + ") " + d.slice(2, 7);
    if (d.length > 7) out += "-" + d.slice(7, 11);
    return out;
  }
  function telStripDDI(v) { return (v || "").replace(/^\s*\+?55\s*/, ""); }   // tira o "+55 " do valor salvo
  // Modelos prontos de recado (criativos). O Kaick escolhe um e edita, ou escreve do zero. Vão pra quem ele marcar.
  var NT_TEMPLATES = [
    { lbl: "🥺 Saudade", txt: "Faz tempo que a gente não se vê! Suas contas estão com saudade 🥺💚 Dá um pulinho no MorbiusFin pra deixar tudo em dia." },
    { lbl: "📊 Organizar", txt: "Que tal 2 minutinhos pra deixar as finanças em dia? 📊 Seu eu do futuro agradece 🙌" },
    { lbl: "🔔 Contas a vencer", txt: "Você tem contas chegando perto do vencimento 👀 Confere no MorbiusFin pra não pagar juros 💸" },
    { lbl: "🎯 Metas", txt: "Bora chegar mais perto das suas metas? 🎯 Registra os gastos de hoje no MorbiusFin 🚀" },
    { lbl: "☀️ Bom dia", txt: "Bom dia! ☀️ Começa o dia no controle: lança seus gastos no MorbiusFin 💚" },
    { lbl: "🧾 Fim de mês", txt: "Fim de mês chegando! 🧾 Confere como ficou seu saldo no MorbiusFin 📈" },
    { lbl: "🔥 Sequência", txt: "Não perde o ritmo! 🔥 Faz uns dias que você não registra nada. Bora manter a sequência? 💪" },
    { lbl: "✨ Novidade", txt: "Tem novidade no MorbiusFin! ✨ Abre o app e dá uma olhada 👀" }
  ];
  // POPUP: dispara um RECADO pros usuários marcados. Modelo pronto OU texto livre. O admin SEMPRE chega
  // (independe do liga/desliga do usuário). O painel não vê dado nenhum da pessoa — só manda a mensagem.
  function openNotify() {
    if (document.getElementById("ntOv")) return;
    var comEmail = _all.filter(function (l) { return (l.email || "").trim(); });
    var rows = comEmail.map(function (l) {
      var nome = (l.nome && String(l.nome).trim()) ? esc(l.nome) : '<span class="ad-noname">sem nome</span>';
      return '<label class="nt-row"><input type="checkbox" class="nt-ck" value="' + esc(l.email) + '" checked>'
        + '<span class="nt-mid"><span class="nt-nome">' + nome + '</span><span class="nt-em">' + esc(l.email) + '</span></span></label>';
    }).join("");
    var chips = NT_TEMPLATES.map(function (t, i) { return '<button type="button" class="nt-chip" data-i="' + i + '">' + esc(t.lbl) + '</button>'; }).join("")
      + '<button type="button" class="nt-chip nt-chip-blank" data-i="-1">✍️ Escrever a minha</button>';
    var ov = document.createElement("div"); ov.id = "ntOv"; ov.className = "fc-ov";
    ov.innerHTML = '<div class="fc-card nt-card"><button type="button" class="wn-x" id="ntX" aria-label="Fechar">✕</button>'
      + '<div class="fc-h">🔔 Enviar recado</div>'
      + '<div class="fc-sub">Escolha um modelo (dá pra editar) ou escreva o seu, e marque quem vai receber. Esse recado sempre chega — não depende do liga/desliga do usuário.</div>'
      + '<label class="nt-lbl">Título</label>'
      + '<input id="ntTitulo" class="nt-titulo" maxlength="60" value="MorbiusFin 🐧">'
      + '<label class="nt-lbl">Modelos</label>'
      + '<div class="nt-chips">' + chips + '</div>'
      + '<label class="nt-lbl">Mensagem</label>'
      + '<textarea id="ntCorpo" class="nt-corpo" rows="3" maxlength="280" placeholder="Escreva o recado…">' + esc(NT_TEMPLATES[0].txt) + '</textarea>'
      + '<div class="nt-count"><span id="ntCount">0</span>/280</div>'
      + (comEmail.length ? '<label class="nt-all"><input type="checkbox" id="ntAll" checked> Selecionar todos</label>' : '')
      + '<div class="fc-list nt-list">' + (rows || '<div class="ad-empty">Nenhuma conta com email cadastrado.</div>') + '</div>'
      + '<div class="fc-acts"><button type="button" class="btn ghost" id="ntCancel">Cancelar</button><button type="button" class="btn primary" id="ntSend"' + (comEmail.length ? '' : ' disabled') + '>Enviar recado</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { try { ov.remove(); } catch (e) {} };
    ov.querySelector("#ntX").onclick = close;
    ov.querySelector("#ntCancel").onclick = close;
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    var corpo = ov.querySelector("#ntCorpo"), count = ov.querySelector("#ntCount");
    var upd = function () { count.textContent = corpo.value.length; };
    corpo.oninput = upd; upd();
    ov.querySelectorAll(".nt-chip").forEach(function (ch) {
      ch.onclick = function () {
        ov.querySelectorAll(".nt-chip").forEach(function (x) { x.classList.remove("on"); });
        ch.classList.add("on");
        var i = parseInt(ch.dataset.i, 10);
        corpo.value = (i >= 0 && NT_TEMPLATES[i]) ? NT_TEMPLATES[i].txt : "";
        upd(); corpo.focus();
      };
    });
    var all = ov.querySelector("#ntAll");
    if (all) all.onchange = function () { ov.querySelectorAll(".nt-ck").forEach(function (c) { c.checked = all.checked; }); };
    ov.querySelectorAll(".nt-ck").forEach(function (c) {
      c.onchange = function () { if (!all) return; var todos = Array.prototype.every.call(ov.querySelectorAll(".nt-ck"), function (x) { return x.checked; }); all.checked = todos; };
    });
    var send = ov.querySelector("#ntSend"); if (send) send.onclick = function () { doNotify(ov, this); };
  }
  async function doNotify(ov, btn) {
    var key = getPushKey(); if (!key) return;
    var titulo = (ov.querySelector("#ntTitulo").value || "").trim() || "MorbiusFin 🐧";
    var corpo = (ov.querySelector("#ntCorpo").value || "").trim();
    if (!corpo) { adToast("Escreva a mensagem do recado"); ov.querySelector("#ntCorpo").focus(); return; }
    var emails = []; ov.querySelectorAll(".nt-ck").forEach(function (c) { if (c.checked) emails.push(c.value); });
    if (!emails.length) { adToast("Selecione ao menos um usuário"); return; }
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      var r = await fetch(PUSH_API + "/admin/notify", {
        method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": key },
        body: JSON.stringify({ emails: emails, titulo: titulo, corpo: corpo })
      });
      var j = {}; try { j = await r.json(); } catch (e) {}
      if (r.status === 401) { try { localStorage.removeItem(PUSH_KEY_LS); } catch (e) {} adToast("Chave do admin inválida — tente de novo"); btn.disabled = false; btn.textContent = "Enviar recado"; return; }
      if (!r.ok || !j.ok) { adToast("Falha ao enviar: " + (j.error || ("HTTP " + r.status))); btn.disabled = false; btn.textContent = "Enviar recado"; return; }
      try { ov.remove(); } catch (e) {}
      var extra = (j.semInscricao && j.semInscricao.length) ? " · " + j.semInscricao.length + " sem push ativo" : "";
      adToast("🔔 Enviado a " + (j.enviados || 0) + " de " + (j.alvos || emails.length) + extra);
    } catch (e) {
      adToast("Erro de rede ao enviar"); btn.disabled = false; btn.textContent = "Enviar recado";
    }
  }
  // POPUP ÚNICA: completa nome/telefone das contas antigas que ficaram vazias (antes da regra obrigatória).
  // Aparece 1x só (flag em localStorage). Depois de preencher e salvar (ou "Agora não"), não volta.
  function maybeFixContato() {
    try { if (localStorage.getItem("mfadmin.fixContato.v1")) return; } catch (e) {}
    var faltando = _all.filter(function (l) { return !((l.nome || "").trim()) || !((l.telefone || "").trim()); });
    if (!faltando.length) { try { localStorage.setItem("mfadmin.fixContato.v1", "1"); } catch (e) {} return; }
    if (document.getElementById("fcOv")) return;
    var rows = faltando.map(function (l) {
      return '<div class="fc-row" data-uid="' + esc(l.user_id) + '">'
        + '<div class="fc-em">' + esc(l.email || "(sem email)") + '</div>'
        + '<input class="fc-nome" placeholder="Nome" value="' + esc(l.nome || "") + '">'
        + '<div class="fc-telwrap"><span class="fc-ddi">+55</span><input class="fc-tel" inputmode="numeric" placeholder="(00) 00000-0000" value="' + esc(maskTelLocal(telStripDDI(l.telefone || ""))) + '"></div>'
        + '</div>';
    }).join("");
    var ov = document.createElement("div"); ov.id = "fcOv"; ov.className = "fc-ov";
    ov.innerHTML = '<div class="fc-card"><div class="fc-h">Complete os cadastros antigos</div>'
      + '<div class="fc-sub">' + faltando.length + ' conta(s) sem nome ou telefone. Preencha o que souber e salve — esta janela aparece só esta vez.</div>'
      + '<div class="fc-list">' + rows + '</div>'
      + '<div class="fc-acts"><button type="button" class="btn ghost" id="fcLater">Agora não</button><button type="button" class="btn primary" id="fcSave">Salvar tudo</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelectorAll(".fc-tel").forEach(function (t) { t.oninput = function () { t.value = maskTelLocal(t.value); }; });
    var done = function () { try { localStorage.setItem("mfadmin.fixContato.v1", "1"); } catch (e) {} try { ov.remove(); } catch (e) {} };
    ov.querySelector("#fcLater").onclick = done;
    ov.querySelector("#fcSave").onclick = async function () {
      var btn = this; btn.disabled = true; btn.textContent = "Salvando…";
      var rws = ov.querySelectorAll(".fc-row"), n = 0;
      for (var i = 0; i < rws.length; i++) {
        var r = rws[i], uid = r.dataset.uid;
        var nome = (r.querySelector(".fc-nome").value || "").trim();
        var telD = (r.querySelector(".fc-tel").value || "").replace(/\D/g, "").slice(0, 11);
        var tel = telD ? "+55 " + maskTelLocal(telD) : "";   // monta o full só na hora de salvar
        var patch = {}; if (nome) patch.nome = nome; if (tel) patch.telefone = tel;
        if (!Object.keys(patch).length) continue;
        try { var rr = await client().from("licencas").update(patch).eq("user_id", uid).select(); if (!rr.error && rr.data && rr.data.length) { var l = byUid(uid); if (l) Object.assign(l, patch); n++; } } catch (e) {}
      }
      done(); renderShell(); adToast(n + " cadastro(s) atualizado(s)");
    };
  }
  boot();
})();

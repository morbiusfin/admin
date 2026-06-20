/* ===== MorbiusFin · Admin (Supabase) — gestão de acessos/licenças =====
   Login do admin (email+senha). RLS no banco garante que só o email-admin lê/edita
   a tabela 'licencas'. Sem segredo no painel (publishable key é pública). */
(function () {
  "use strict";
  var SB_URL = "https://fyjzrsmfeokdkhboeopc.supabase.co";
  var SB_KEY = "sb_publishable_oUTz-QGMaaMo42n0hXJMlw_JVUst6Om";
  var sb = null;
  function client() { if (sb) return sb; if (!window.supabase || !window.supabase.createClient) return null; sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } }); return sb; }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]); }); };
  var view = function () { return document.getElementById("adView"); };
  var who = function () { return document.getElementById("adWho"); };
  var _all = [], _email = "";

  function msg(t, cls) { var m = $("#adMsg"); if (m) { m.textContent = t || ""; m.className = "ad-msg" + (cls ? (" " + cls) : ""); } }
  function fmtDate(s) { if (!s) return "—"; try { var d = new Date(s); if (isNaN(d.getTime())) return String(s).slice(0, 10); return d.toLocaleDateString("pt-BR"); } catch (e) { return String(s).slice(0, 10); } }

  function showLogin(m, bad) {
    who().innerHTML = "";
    view().innerHTML = '<div class="ad-card ad-login">'
      + '<div class="ad-field"><span>Email do admin</span><input id="adEmail" type="email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="voce@email.com"></div>'
      + '<div class="ad-field"><span>Senha</span><input id="adSen" type="password" autocomplete="current-password" placeholder="sua senha"></div>'
      + '<div id="adMsg" class="ad-msg' + (bad ? " bad" : "") + '">' + (m || "") + '</div>'
      + '<button class="btn primary" id="adGo">Entrar</button></div>';
    $("#adGo").onclick = doLogin;
    $("#adSen").onkeydown = function (e) { if (e.key === "Enter") doLogin(); };
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
    renderTable("");
  }
  function renderTable(filter) {
    var f = (filter || "").trim().toLowerCase();
    var rows = _all.filter(function (l) { return !f || String(l.email || "").toLowerCase().indexOf(f) >= 0; });
    var ativos = _all.filter(function (l) { return l.status !== "bloqueado"; }).length;
    var html = '<div class="ad-toolbar"><input id="adSearch" class="ad-search" placeholder="Buscar email…" value="' + esc(filter || "") + '">'
      + '<span class="ad-stat">' + _all.length + ' conta(s) · ' + ativos + ' ativa(s)</span>'
      + '<button class="btn ghost sm" id="adReload">↻ Atualizar</button></div><div class="ad-rows">';
    if (!rows.length) html += '<div class="ad-card"><div class="ad-empty">Nenhuma conta' + (f ? " pra esse filtro" : " ainda") + '.</div></div>';
    rows.forEach(function (l) {
      var bloq = l.status === "bloqueado";
      var tier = l.plano || "teste";
      var tEmoji = { teste: "broto", plus: "estrela", pro: "foguete", ultimate: "coroa" }[tier] || "broto";
      var tNome = { teste: "Teste", plus: "Plus", pro: "Pro", ultimate: "Ultimate" }[tier] || tier;
      var tierPill = '<span class="tier tier-' + esc(tier) + '"><img src="https://morbiusfin.github.io/emoji/' + tEmoji + '.webp" alt="" loading="lazy" draggable="false">' + esc(tNome) + '</span>';
      var planos = ["teste", "plus", "pro", "ultimate"].map(function (p) { return '<option value="' + p + '"' + (l.plano === p ? " selected" : "") + '>' + p + '</option>'; }).join("");
      html += '<div class="ad-row row-' + esc(tier) + '" data-uid="' + esc(l.user_id) + '">'
        + '<div><div class="ad-email">' + esc(l.email || "(sem email)") + '</div>'
        + '<div class="ad-sub">' + tierPill + '<span class="pill ' + (bloq ? "bloqueado" : "ativo") + '">' + (bloq ? "bloqueado" : "ativo") + '</span>'
        + '<span>criado ' + fmtDate(l.criado_em) + '</span>' + (l.validade ? '<span>· vence ' + fmtDate(l.validade) + '</span>' : '<span>· vitalício</span>') + '</div></div>'
        + '<div class="ad-controls">'
        + '<select data-k="plano" title="Plano">' + planos + '</select>'
        + '<label class="ad-datelbl">Expira (bloqueia ao vencer)<input type="date" data-k="validade" title="Data em que o acesso expira e bloqueia. Vazio = vitalício." value="' + (l.validade ? String(l.validade).slice(0, 10) : "") + '"></label>'
        + '<div class="ad-quick"><button class="btn ghost sm" data-act="plus30" title="+30 dias">+30d</button>'
        + '<button class="btn ghost sm" data-act="plus1y" title="+1 ano">+1a</button>'
        + '<button class="btn ghost sm" data-act="vitalicio" title="Vitalício (sem validade)">Vit.</button></div>'
        + '<button class="btn ' + (bloq ? "primary" : "ghost") + ' sm" data-act="toggle">' + (bloq ? "Ativar" : "Bloquear") + '</button>'
        + '<button class="btn primary sm" data-act="save">Salvar</button>'
        + '</div></div>';
    });
    html += '</div>';
    view().innerHTML = html;
    var s = $("#adSearch"); if (s) s.oninput = function (e) { renderKeepFocus(e.target.value); };
    var rl = $("#adReload"); if (rl) rl.onclick = function () { showPanel(_email); };
    document.querySelectorAll(".ad-row").forEach(function (row) {
      var uid = row.dataset.uid;
      row.querySelector('[data-act="toggle"]').onclick = function () { toggleBlock(uid); };
      row.querySelector('[data-act="save"]').onclick = function () { saveRow(uid, row); };
      row.querySelector('[data-act="plus30"]').onclick = function () { shiftValidade(uid, row, 30); };
      row.querySelector('[data-act="plus1y"]').onclick = function () { shiftValidade(uid, row, 365); };
      row.querySelector('[data-act="vitalicio"]').onclick = function () { setVitalicio(uid, row); };
    });
  }
  var _searchT = null;
  function renderKeepFocus(v) { clearTimeout(_searchT); _searchT = setTimeout(function () { renderTable(v); var s = $("#adSearch"); if (s) { s.focus(); try { s.setSelectionRange(s.value.length, s.value.length); } catch (e) {} } }, 130); }
  async function toggleBlock(uid) {
    var l = _all.find(function (x) { return x.user_id === uid; }); if (!l) return;
    var novo = l.status === "bloqueado" ? "ativo" : "bloqueado";
    var r = await client().from("licencas").update({ status: novo }).eq("user_id", uid);
    if (r.error) { alert("Falha: " + r.error.message); return; }
    l.status = novo; renderTable($("#adSearch") ? $("#adSearch").value : "");
  }
  async function saveRow(uid, row) {
    var plano = row.querySelector('[data-k="plano"]').value;
    var validade = row.querySelector('[data-k="validade"]').value || null;
    var email = (function () { var l = _all.find(function (x) { return x.user_id === uid; }); return l ? (l.email || "").toLowerCase().trim() : null; })();
    var btn = row.querySelector('[data-act="save"]'); btn.textContent = "…";
    var upd = { plano: plano, validade: validade };
    if (email) upd.email = email;
    var r = await client().from("licencas").update(upd).eq("user_id", uid);
    if (r.error) { btn.textContent = "Salvar"; alert("Falha: " + r.error.message); return; }
    var l = _all.find(function (x) { return x.user_id === uid; }); if (l) { l.plano = plano; l.validade = validade; }
    btn.textContent = "✓"; setTimeout(function () { btn.textContent = "Salvar"; }, 1200);
  }
  // shiftValidade: soma dias à validade (partindo do maior entre hoje e validade atual)
  async function shiftValidade(uid, row, dias) {
    var l = _all.find(function (x) { return x.user_id === uid; }); if (!l) return;
    var base = new Date();
    if (l.validade) { var v = new Date(l.validade); if (!isNaN(v.getTime()) && v > base) base = v; }
    base.setDate(base.getDate() + dias);
    var novaVal = base.toISOString().slice(0, 10);
    var inp = row.querySelector('[data-k="validade"]'); if (inp) inp.value = novaVal;
    var r = await client().from("licencas").update({ validade: novaVal }).eq("user_id", uid);
    if (r.error) { alert("Falha: " + r.error.message); return; }
    l.validade = novaVal;
    renderTable(document.getElementById("adSearch") ? document.getElementById("adSearch").value : "");
  }
  // setVitalicio: remove a validade (null = nunca expira)
  async function setVitalicio(uid, row) {
    var r = await client().from("licencas").update({ validade: null }).eq("user_id", uid);
    if (r.error) { alert("Falha: " + r.error.message); return; }
    var l = _all.find(function (x) { return x.user_id === uid; }); if (l) l.validade = null;
    var inp = row.querySelector('[data-k="validade"]'); if (inp) inp.value = "";
    renderTable(document.getElementById("adSearch") ? document.getElementById("adSearch").value : "");
  }
  boot();
})();

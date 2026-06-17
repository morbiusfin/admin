/* github.js — lê/grava licencas.json via GitHub Contents API.
   Token fica só no localStorage deste aparelho; nunca é commitado. */
(function () {
  const CFG_LS = "mfadmin.gh.v1";
  const API = "https://api.github.com";
  let cfg = null; // {repo, path, branch, token}

  function load() {
    try { cfg = JSON.parse(localStorage.getItem(CFG_LS) || "null"); } catch (e) { cfg = null; }
    return cfg;
  }
  function save(c) { cfg = c; localStorage.setItem(CFG_LS, JSON.stringify(c)); }
  function get() { return cfg; }
  function isConfigured() { return !!(cfg && cfg.repo && cfg.token && /.+\/.+/.test(cfg.repo)); }
  function forgetToken() { if (cfg) { cfg.token = ""; localStorage.setItem(CFG_LS, JSON.stringify(cfg)); } }

  function headers() {
    return {
      "Authorization": "Bearer " + cfg.token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  // base64 unicode-safe
  function utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function contentsUrl() {
    const [owner, repo] = cfg.repo.split("/");
    return `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(cfg.path).replace(/%2F/g, "/")}`;
  }

  // retorna {text, sha} ou {text:null, sha:null} se 404 (arquivo ainda não existe)
  async function readFile() {
    const url = contentsUrl() + "?ref=" + encodeURIComponent(cfg.branch || "main") + "&t=" + Date.now();
    const r = await fetch(url, { headers: headers(), cache: "no-store" });
    if (r.status === 404) return { text: null, sha: null };
    if (!r.ok) throw new Error(await msg(r));
    const j = await r.json();
    return { text: b64ToUtf8(j.content || ""), sha: j.sha };
  }

  async function writeFile(text, sha, message) {
    const body = {
      message: message || "update licencas",
      content: utf8ToB64(text),
      branch: cfg.branch || "main"
    };
    if (sha) body.sha = sha;
    const r = await fetch(contentsUrl(), { method: "PUT", headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await msg(r));
    const j = await r.json();
    return j.content ? j.content.sha : null;
  }

  // valida token + acesso ao repo
  async function test() {
    const r = await readFile();
    return r; // joga se falhar
  }

  async function msg(r) {
    let detail = "";
    try { const j = await r.json(); detail = j.message || ""; } catch (e) {}
    if (r.status === 401) return "Token inválido ou expirado (401).";
    if (r.status === 403) return "Sem permissão — o token precisa de Contents: Read and write nesse repo (403).";
    if (r.status === 404) return "Repo/arquivo não encontrado — confira dono/nome e branch (404).";
    if (r.status === 409) return "Conflito de versão — outra alteração chegou antes. Atualize e tente de novo (409).";
    if (r.status === 422) return "Dados inválidos no commit (422). " + detail;
    return `Erro ${r.status}. ${detail}`;
  }

  window.mfGit = { load, save, get, isConfigured, forgetToken, readFile, writeFile, test };
})();

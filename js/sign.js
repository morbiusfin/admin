/* sign.js — assinatura ECDSA P-256 (WebCrypto). Chave privada NUNCA sai deste aparelho.
   A pública (SPKI base64) é embutida no app financas pra VERIFICAR as licenças. */
(function () {
  const KEYS_LS = "mfadmin.keys.v1";
  const ALG = { name: "ECDSA", namedCurve: "P-256" };
  const SIGN_ALG = { name: "ECDSA", hash: "SHA-256" };
  let _priv = null, _pubJwk = null, _privJwk = null;

  const b64 = {
    enc(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); },
    dec(s) { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }
  };
  const enc = new TextEncoder();

  async function importPriv(jwk) { return crypto.subtle.importKey("jwk", jwk, ALG, false, ["sign"]); }

  async function loadFromStorage() {
    try {
      const raw = localStorage.getItem(KEYS_LS);
      if (!raw) return false;
      const o = JSON.parse(raw);
      if (!o.priv || !o.pub) return false;
      _privJwk = o.priv; _pubJwk = o.pub;
      _priv = await importPriv(o.priv);
      return true;
    } catch (e) { return false; }
  }

  async function generate() {
    const pair = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
    _privJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    _pubJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    _priv = await importPriv(_privJwk);
    localStorage.setItem(KEYS_LS, JSON.stringify({ priv: _privJwk, pub: _pubJwk }));
    return await publicKeyB64();
  }

  // SPKI base64 — formato que o financas importa pra verificar
  async function publicKeyB64() {
    const pub = await crypto.subtle.importKey("jwk", _pubJwk, ALG, true, ["verify"]);
    const spki = await crypto.subtle.exportKey("spki", pub);
    return b64.enc(spki);
  }

  async function sign(str) {
    if (!_priv) throw new Error("sem chave privada");
    const sig = await crypto.subtle.sign(SIGN_ALG, _priv, enc.encode(str));
    return b64.enc(sig); // assinatura crua r||s (64 bytes)
  }

  function hasKeys() { return !!_priv; }

  function exportBackup() {
    if (!_privJwk || !_pubJwk) return null;
    return { app: "morbiusfin-admin", kind: "signing-keys", v: 1, priv: _privJwk, pub: _pubJwk, savedAt: new Date().toISOString() };
  }

  async function importBackup(obj) {
    if (!obj || !obj.priv || !obj.pub) throw new Error("backup inválido");
    _privJwk = obj.priv; _pubJwk = obj.pub;
    _priv = await importPriv(obj.priv);
    localStorage.setItem(KEYS_LS, JSON.stringify({ priv: _privJwk, pub: _pubJwk }));
    return await publicKeyB64();
  }

  window.mfSign = { loadFromStorage, generate, publicKeyB64, sign, hasKeys, exportBackup, importBackup };
})();

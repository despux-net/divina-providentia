// Cifrado de extremo a extremo del chat de Vivinati (Web Crypto del navegador).
//
// - Cada persona tiene un par de claves ECDH P-256 creado en SU navegador.
// - La clave pública se publica (tabla claves_publicas).
// - La privada vive en este navegador (IndexedDB) y, para poder usarla en
//   otro dispositivo, se guarda una copia CIFRADA con una clave derivada de
//   la contraseña de la cuenta (PBKDF2-SHA-256, 310.000 vueltas). El
//   servidor nunca ve ni la contraseña ni la clave privada.
// - Para cada conversación: ECDH(mi privada, su pública) → HKDF-SHA-256 →
//   clave AES-GCM de 256 bits. Cada mensaje lleva su propio IV aleatorio.
// - «Código de seguridad»: huella de las dos claves públicas que ambas
//   personas pueden comparar para comprobar que nadie está en medio.
(() => {
  const sb = DP.sb;
  const ITER = 310000;
  const subtle = crypto.subtle;
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const ECDH = { name: 'ECDH', namedCurve: 'P-256' };

  // ---------- IndexedDB: la clave privada de este navegador ----------
  const abrirDB = () => new Promise((ok, mal) => {
    const r = indexedDB.open('vivinati-chat', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('claves');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  async function idb(modo, fn) {
    const db = await abrirDB();
    return new Promise((ok, mal) => {
      const tx = db.transaction('claves', modo);
      const req = fn(tx.objectStore('claves'));
      tx.oncomplete = () => { db.close(); ok(req && req.result); };
      tx.onerror = () => { db.close(); mal(tx.error); };
    });
  }
  const guardarLocal = (uid, privada, publicaJwk) => idb('readwrite', s => s.put({ privada, publicaJwk }, uid));
  const leerLocal = uid => idb('readonly', s => s.get(uid)).catch(() => null);

  // ---------- Contraseña → clave para el respaldo ----------
  async function claveDeContraseña(contraseña, sal, iter = ITER) {
    const base = await subtle.importKey('raw', te.encode(contraseña), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: iter, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function respaldar(uid, privadaJwk, contraseña) {
    const sal = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const k = await claveDeContraseña(contraseña, sal);
    const cifrada = await subtle.encrypt({ name: 'AES-GCM', iv }, k, te.encode(JSON.stringify(privadaJwk)));
    const { error } = await sb.from('claves_respaldo').upsert({
      user_id: uid, cifrada: b64(cifrada), sal: b64(sal), iv: b64(iv), iteraciones: ITER, actualizado: new Date().toISOString()
    });
    if (error) throw error;
  }
  const importarPrivada = jwk => subtle.importKey('jwk', jwk, ECDH, true, ['deriveBits']);
  const publicaDe = ({ kty, crv, x, y }) => ({ kty, crv, x, y, ext: true });

  async function crearClaves(uid, contraseña) {
    const par = await subtle.generateKey(ECDH, true, ['deriveBits']);
    const privadaJwk = await subtle.exportKey('jwk', par.privateKey);
    const publicaJwk = publicaDe(await subtle.exportKey('jwk', par.publicKey));
    await respaldar(uid, privadaJwk, contraseña);
    const { error } = await sb.from('claves_publicas').upsert({ user_id: uid, jwk: publicaJwk, actualizado: new Date().toISOString() });
    if (error) throw error;
    await guardarLocal(uid, par.privateKey, publicaJwk);
    return par.privateKey;
  }

  const E2E = {
    // Claves nuevas (los mensajes cifrados con las antiguas ya no se podrán leer).
    async nuevasClaves(contraseña) {
      const { data: { session } } = await sb.auth.getSession();
      if (session) await crearClaves(session.user.id, contraseña);
    },

    // Tras iniciar sesión con contraseña: recupera la clave del respaldo o crea una nueva.
    // Devuelve 'ok', 'nueva' o 'contraseña' (si la contraseña no abre el respaldo).
    async desbloquear(contraseña) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return 'sin-sesion';
      const uid = session.user.id;
      const { data: r } = await sb.from('claves_respaldo').select('*').eq('user_id', uid).maybeSingle();
      if (!r) { await crearClaves(uid, contraseña); return 'nueva'; }
      try {
        const k = await claveDeContraseña(contraseña, deB64(r.sal), r.iteraciones);
        const plano = await subtle.decrypt({ name: 'AES-GCM', iv: deB64(r.iv) }, k, deB64(r.cifrada));
        const privadaJwk = JSON.parse(td.decode(plano));
        const privada = await importarPrivada(privadaJwk);
        await guardarLocal(uid, privada, publicaDe(privadaJwk));
        // Por si la pública no quedó guardada
        await sb.from('claves_publicas').upsert({ user_id: uid, jwk: publicaDe(privadaJwk) });
        return 'ok';
      } catch { return 'contraseña'; }
    },

    // Tras cambiar la contraseña: vuelve a cifrar el respaldo con la nueva.
    // Si este navegador no tiene la clave (p. ej. contraseña olvidada desde
    // otro equipo), se crea una nueva: los mensajes antiguos ya no se podrán leer.
    async cambiarContraseña(nueva) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      const local = await leerLocal(uid);
      if (local && local.privada && local.privada.extractable) {
        await respaldar(uid, await subtle.exportKey('jwk', local.privada), nueva);
        return 'ok';
      }
      await crearClaves(uid, nueva);
      return 'nueva';
    },

    // ¿Este navegador puede leer y escribir mensajes? 'lista' | 'bloqueada' (hay respaldo) | 'sin-claves'
    async estado() {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return 'sin-sesion';
      const local = await leerLocal(session.user.id);
      if (local && local.privada) {
        // ¿Coincide con la pública publicada? (si cambió en otro equipo, hay que desbloquear de nuevo)
        const { data } = await sb.from('claves_publicas').select('jwk').eq('user_id', session.user.id).maybeSingle();
        if (data && data.jwk.x === local.publicaJwk.x && data.jwk.y === local.publicaJwk.y) return 'lista';
      }
      const { data: r } = await sb.from('claves_respaldo').select('user_id').eq('user_id', session.user.id).maybeSingle();
      return r ? 'bloqueada' : 'sin-claves';
    },

    async _miClave() {
      const { data: { session } } = await sb.auth.getSession();
      const local = session && await leerLocal(session.user.id);
      return local || null;
    },

    _cache: new Map(),
    // Clave AES de la conversación con «otroId» (ECDH + HKDF).
    async claveCon(otroId) {
      const mia = await E2E._miClave();
      if (!mia) throw new Error('sin-clave');
      const { data } = await sb.from('claves_publicas').select('jwk').eq('user_id', otroId).maybeSingle();
      if (!data) throw new Error('sin-clave-otro');
      const id = `${otroId}:${data.jwk.x}:${mia.publicaJwk.x}`;
      if (E2E._cache.has(id)) return E2E._cache.get(id);
      const suPublica = await subtle.importKey('jwk', data.jwk, ECDH, false, []);
      const secreto = await subtle.deriveBits({ name: 'ECDH', public: suPublica }, mia.privada, 256);
      const hkdf = await subtle.importKey('raw', secreto, 'HKDF', false, ['deriveKey']);
      const clave = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('vivinati-chat'), info: te.encode('v1') },
        hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const res = { clave, suJwk: data.jwk, miJwk: mia.publicaJwk };
      E2E._cache.set(id, res);
      return res;
    },

    async cifrar(texto, otroId) {
      const { clave } = await E2E.claveCon(otroId);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const c = await subtle.encrypt({ name: 'AES-GCM', iv }, clave, te.encode(texto));
      return { iv: b64(iv), cifrado: b64(c) };
    },

    async descifrar(m, otroId) {
      try {
        const { clave } = await E2E.claveCon(otroId);
        const p = await subtle.decrypt({ name: 'AES-GCM', iv: deB64(m.iv) }, clave, deB64(m.cifrado));
        return td.decode(p);
      } catch { return null; }
    },

    // Abre (o reutiliza) la conversación y envía el mensaje cifrado. Devuelve el id de la conversación.
    async enviar(otroId, inmuebleId, texto, convId) {
      const { iv, cifrado } = await E2E.cifrar(texto, otroId);   // falla con 'sin-clave-otro' si no tiene chat
      let conv = convId;
      if (!conv) {
        const { data, error } = await sb.rpc('abrir_conversacion', { p_otro: otroId, p_inmueble: inmuebleId || null });
        if (error) throw new Error(error.message);
        conv = data;
      }
      const { error } = await sb.from('mensajes').insert({ conversacion_id: conv, iv, cifrado });
      if (error) throw new Error(/muy rápido/.test(error.message) ? error.message : 'No se pudo enviar el mensaje.');
      return conv;
    },

    // Código de seguridad: igual en los dos teléfonos si nadie se ha metido en medio.
    async codigo(otroId) {
      const { suJwk, miJwk } = await E2E.claveCon(otroId);
      const partes = [suJwk.x + suJwk.y, miJwk.x + miJwk.y].sort();
      const h = new Uint8Array(await subtle.digest('SHA-256', te.encode(partes.join('|'))));
      return Array.from(h.slice(0, 10)).map(b => String(b % 100).padStart(2, '0')).join('').match(/.{5}/g).join(' ');
    }
  };
  DP.e2e = E2E;
})();

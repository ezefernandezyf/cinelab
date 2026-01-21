/* common.js
   Helpers compartidos, cache y almacenamiento local (sin seleccionar elementos DOM específicos)
   Mejoras de robustez: manejo de JSON.parse/stringify con try/catch, normalización de historial,
   y protección ante datos corruptos en storage.
*/

/* ESTADO GLOBAL Y CONFIG */
const state = {
  cargando: false,
  busquedaActual: null,
  historial: [],
  controlador: null,
};

const WATCHED_KEY = 'watchedMovies';
const MAX_SUG_CACHE = 200;

/* HELPERS DE CACHE */
const CACHE_PREFIX = 'movie:';
const CACHE_TTL = 1000 * 60 * 60; // 1 hora
const CACHE_MAX_ENTRIES = 50;

const makeCacheKey = (titulo) => {
  if (titulo == null) return null;
  let stringCache = String(titulo).trim();
  if (stringCache === '') return null;
  try {
    stringCache = stringCache.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  } catch (e) {
    // si normalize con Unicode property escapes no está disponible, caemos al fallback simple
    stringCache = stringCache.normalize ? stringCache.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : stringCache;
  }
  stringCache = stringCache.toLowerCase();
  const encoded = encodeURIComponent(stringCache);
  return CACHE_PREFIX + encoded;
};

function adjustMainForNavbar() {
  const nav = document.querySelector('.navbar.fixed-top');
  const main = document.querySelector('main');
  if (nav && main) {
    try {
      main.style.paddingTop = (nav.offsetHeight + 8) + 'px';
    } catch (e) {
      // ignore
    }
  }
}
window.addEventListener('load', adjustMainForNavbar);
window.addEventListener('resize', adjustMainForNavbar);
adjustMainForNavbar();

const getFromCache = (titulo) => {
  if (titulo == null) return null;
  const key = makeCacheKey(titulo);
  if (!key) return null;

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (!entry || typeof entry.ts !== 'number') {
      try { sessionStorage.removeItem(key); } catch (_) { /* ignore */ }
      return null;
    }

    if ((Date.now() - entry.ts) > CACHE_TTL) {
      try { sessionStorage.removeItem(key); } catch (_) { /* ignore */ }
      return null;
    }

    return entry.data;
  } catch (e) {
    try { sessionStorage.removeItem(key); } catch (_) { /* ignore */ }
    return null;
  }
};

const pruneCacheIfNeeded = () => {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }

    if (keys.length <= CACHE_MAX_ENTRIES) return;

    const items = keys.map(k => {
      try {
        const raw = sessionStorage.getItem(k);
        const entry = raw ? JSON.parse(raw) : null;
        return { key: k, ts: entry && typeof entry.ts === 'number' ? entry.ts : 0 };
      } catch (e) {
        return { key: k, ts: 0 };
      }
    });

    items.sort((a, b) => a.ts - b.ts);

    const removeCount = items.length - CACHE_MAX_ENTRIES;
    for (let j = 0; j < removeCount; j++) {
      try {
        sessionStorage.removeItem(items[j].key);
      } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // ignore any sessionStorage iteration issues
  }
};

const saveToCache = (titulo, data) => {
  const key = makeCacheKey(titulo);
  if (key == null) return;
  const raw = {
    data,
    ts: Date.now()
  };
  let json;
  try {
    json = JSON.stringify(raw);
  } catch (e) {
    // data not serializable
    return;
  }

  try {
    sessionStorage.setItem(key, json);
    pruneCacheIfNeeded();
  } catch (e) {
    // storage might be full: try pruning and retry once
    try {
      pruneCacheIfNeeded();
      sessionStorage.setItem(key, json);
    } catch (e2) {
      // bail out silently
    }
  }
};

/* STORAGE: historial de búsquedas (localStorage) */
const cargarHistorialDesdeStorage = () => {
  try {
    const guardado = localStorage.getItem('historialBusquedas');
    if (!guardado) {
      state.historial = [];
      return;
    }
    const parsed = JSON.parse(guardado);
    state.historial = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // si está corrupto, limpiamos y no rompemos la app
    try { localStorage.removeItem('historialBusquedas'); } catch (_) { /* ignore */ }
    state.historial = [];
  }
};
cargarHistorialDesdeStorage();


const guardarEnHistorial = (titulo) => {
  const raw = titulo == null ? '' : String(titulo).trim();
  if (!raw) return state.historial ? [...state.historial] : [];

  // normalize for comparison
  let key;
  try {
    key = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  } catch (e) {
    key = raw.normalize ? raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : raw.toLowerCase();
  }

  const nuevoHistorial = Array.isArray(state.historial) ? [...state.historial] : [];

  const existingIndex = nuevoHistorial.findIndex(h => {
    if (!h) return false;
    let hKey;
    try {
      hKey = String(h).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    } catch (e) {
      hKey = String(h).normalize ? String(h).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : String(h).toLowerCase();
    }
    return hKey === key;
  });

  if (existingIndex !== -1) {
    nuevoHistorial.splice(existingIndex, 1);
  }
  nuevoHistorial.unshift(raw);

  if (nuevoHistorial.length > 10) {
    nuevoHistorial.splice(10);
  }

  // update state but DO NOT persist here (caller may persist explicitly)
  state.historial = nuevoHistorial;
  return nuevoHistorial;
};

const actualizarHistorialEnStorage = (historialSto) => {
  try {
    const toSave = Array.isArray(historialSto) ? historialSto : (Array.isArray(state.historial) ? state.historial : []);
    localStorage.setItem('historialBusquedas', JSON.stringify(toSave));
    // keep state coherent
    state.historial = toSave.slice();
    return true;
  } catch (e) {
    try { localStorage.removeItem('historialBusquedas'); } catch (_) { /* ignore */ }
    return false;
  }
};

/* UTILIDADES GENERALES */
const debounce = (fn, wait = 300) => {
  let timerId = null;
  function wrapped(...args) {
    if (timerId) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      try { fn.apply(this, args); } catch (e) { /* swallow errors from handlers */ }
    }, wait);
  }

  wrapped.cancel = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  return wrapped;
};

/* isDifferent: comparador robusto que soporta tanto el shape de OMDB como el mapeo TMDB.
   Comprueba título, año, poster y overview/Plot (y rating).
*/
function isDifferent(oldData, newData) {
  if (!oldData || !newData) return true;

  // Helper para leer campo buscando nombres alternativos
  const getField = (obj, keys) => {
    if (!obj) return '';
    for (const k of keys) {
      if (typeof obj[k] !== 'undefined' && obj[k] !== null) return String(obj[k]);
    }
    return '';
  };

  // Campos a comparar con aliases
  const checks = [
    { keysA: ['Title', 'title'], keysB: ['Title', 'title'] }, // title
    { keysA: ['Year', 'year'], keysB: ['Year', 'year'] }, // year
    { keysA: ['Poster', 'poster', 'poster_path'], keysB: ['Poster', 'poster', 'poster_path'] }, // poster
    { keysA: ['Runtime', 'runtime'], keysB: ['Runtime', 'runtime'] }, // runtime
    { keysA: ['imdbRating', 'vote_average'], keysB: ['imdbRating', 'vote_average'] }, // rating
    { keysA: ['Plot', 'plot', 'overview'], keysB: ['Plot', 'plot', 'overview'] } // synopsis / overview
  ];

  for (const chk of checks) {
    const a = (getField(oldData, chk.keysA) || '').trim();
    const b = (getField(newData, chk.keysB) || '').trim();
    if (a !== b) return true;
  }

  // Fallback deep compare when above fields equal (still safe)
  try {
    return JSON.stringify(oldData) !== JSON.stringify(newData);
  } catch (e) {
    return true;
  }
}

/* WATCHED MOVIES */
const getWatched = () => {
  const watched = localStorage.getItem(WATCHED_KEY);
  if (watched == null || !watched) return [];
  try {
    const list = JSON.parse(watched);
    return Array.isArray(list) ? list.slice() : [];
  } catch (e) {
    try { localStorage.removeItem(WATCHED_KEY); } catch (_) { /* ignore */ }
    return [];
  }
};

const saveWatched = (list) => {
  try {
    const listStr = JSON.stringify(list || []);
    localStorage.setItem(WATCHED_KEY, listStr);
    return true;
  } catch (e) {
    try { localStorage.removeItem(WATCHED_KEY); } catch (_) { /* ignore */ }
    return false;
  }
};

const addWatched = (item) => {
  const normalized = { ...item };
  if (!normalized || !normalized.id) return;
  normalized.id = String(normalized.id).trim();
  normalized.title = String(normalized.title || '').trim();
  normalized.year = String(normalized.year || '').trim();
  if (!normalized.poster || normalized.poster === 'N/A') normalized.poster = './assets/placeholder.png';
  const watched = getWatched();
  const index = watched.findIndex(i => i.id === normalized.id);
  if (index !== -1) {
    watched.splice(index, 1);
  }
  watched.unshift(normalized);

  saveWatched(watched);
  return watched;
};

const updateWatched = (id, patch) => {
  if (!id || !patch) return null;
  const watched = getWatched();
  const index = watched.findIndex(i => i.id === id);
  if (index === -1) return null;
  const item = watched[index];
  const updatedItem = { ...item, ...patch };
  watched[index] = updatedItem;
  saveWatched(watched);
  return updatedItem;
};

const removeWatched = (id) => {
  const watched = getWatched();
  if (!id) return watched;
  const index = watched.findIndex(i => i.id === id);
  if (index === -1) return watched;
  watched.splice(index, 1);
  saveWatched(watched);
  return watched;
};
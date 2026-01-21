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

function getCanonicalMovieIdFromRaw(raw) {
  if (!raw) return null;

  if (raw.imdbID) return String(raw.imdbID).trim();
  if (raw.imdb_id) return String(raw.imdb_id).trim();
  if (raw.tmdb_id) return `tmdb:${String(raw.tmdb_id).trim()}`;
  if (raw.id && typeof raw.id === 'string' && raw.id.startsWith('tmdb:')) return raw.id;
  if (raw.id && !isNaN(Number(raw.id))) return `tmdb:${String(raw.id)}`;
  return null;
}

function safeCssEscape(s) {
  if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/([^\w-])/g, (m) => '\\' + m);
}


function updateMarkButtonState(buttonEl, movieIdOrRaw) {
  if (!buttonEl) return;
  let isWatched = false;

  try {

    if (movieIdOrRaw && typeof movieIdOrRaw === 'object') {
      isWatched = isMovieWatchedByRaw(movieIdOrRaw);
    } else {

      const ds = buttonEl.dataset || {};
      const candidate = {};

      // Si se pasó un id string explícito (puede ser 'tt...' o 'tmdb:123' o 'Title::Year')
      if (movieIdOrRaw && typeof movieIdOrRaw === 'string') {
        candidate.id = movieIdOrRaw;
      }


      if (ds.movie) {
        try {
          const parsed = JSON.parse(ds.movie);

          Object.assign(candidate, parsed);
        } catch (e) {

        }
      }


      if (ds.movieId) candidate.id = ds.movieId;
      if (ds.movieImdb) candidate.imdbID = ds.movieImdb;
      if (ds.movieTmdb) {

        const v = ds.movieTmdb;
        candidate.tmdb_id = v && String(v).startsWith('tmdb:') ? String(v).split(':')[1] : v;
        // keep original form too
        candidate.id = candidate.id || ds.movieTmdb;
      }


      isWatched = isMovieWatchedByRaw(candidate);
    }
  } catch (e) {

    try {
      const watched = getWatched();
      isWatched = watched.some(w => String(w.id) === String(movieIdOrRaw));
    } catch (_) {
      isWatched = false;
    }
  }

  if (isWatched) {
    buttonEl.textContent = 'Ya vista';
    buttonEl.classList.remove('btn-primary', 'btn-success');
    buttonEl.classList.add('btn-secondary');
    buttonEl.setAttribute('aria-pressed', 'true');
    buttonEl.disabled = true;
    buttonEl.dataset.watched = 'true';
  } else {
    buttonEl.textContent = 'Marcar como vista';
    buttonEl.classList.remove('btn-secondary');
    buttonEl.classList.add('btn-success');
    buttonEl.setAttribute('aria-pressed', 'false');
    buttonEl.disabled = false;
    buttonEl.dataset.watched = 'false';
  }
}


function updateAllMarkButtons(movieIdOrRaw) {
  if (!movieIdOrRaw) return;

  let ids = { canonical: null, imdbId: null, tmdbId: null, titleYear: null };

  // Si pasaron un string (por ejemplo 'tt1234' o 'tmdb:1234'), intentamos expandirlo
  if (typeof movieIdOrRaw === 'string') {
    ids.canonical = movieIdOrRaw;


    try {
      const watched = typeof getWatched === 'function' ? getWatched() : [];
      const match = watched.find(w => String(w && w.id ? w.id : '').trim() === String(movieIdOrRaw).trim());
      if (match) {
        const src = match.sourceData || match.source || match.raw || match;
        const srcIds = getMovieIdentifiersFromRaw(src);
        ids.imdbId = srcIds.imdbId;
        ids.tmdbId = srcIds.tmdbId;

        if (!ids.canonical && srcIds.canonicalId) ids.canonical = srcIds.canonicalId;
      }
    } catch (e) {
      // ignore, we'll still try selectors based on canonical only
    }
  } else {

    const o = getMovieIdentifiersFromRaw(movieIdOrRaw);
    ids.imdbId = o.imdbId;
    ids.tmdbId = o.tmdbId;
    ids.titleYear = o.titleYear;
    ids.canonical = o.canonicalId || ids.canonical;
  }

  // construir lista de selectores para cubrir variantes
  const selectors = new Set();
  if (ids.canonical) selectors.add(`[data-movie-id="${ids.canonical}"]`);
  if (ids.imdbId) selectors.add(`[data-movie-imdb="${ids.imdbId}"]`);
  if (ids.tmdbId) selectors.add(`[data-movie-tmdb="${ids.tmdbId}"]`);
  if (ids.titleYear) selectors.add(`[data-movie-id="${ids.titleYear}"]`);

  const sel = Array.from(selectors).join(',');
  const nodes = sel ? Array.from(document.querySelectorAll(sel)) : [];

  nodes.forEach(n => {
    const btn = (n.tagName && n.tagName.toLowerCase() === 'button') ? n : n.querySelector('button[data-action="mark-watched"], button[data-movie-id], button[data-movie-imdb], button[data-movie-tmdb]');
    if (!btn) return;
    try {
      if (typeof updateMarkButtonState === 'function') {
        // pasa la mejor id canónica que tengamos
        updateMarkButtonState(btn, ids.canonical || ids.imdbId || ids.tmdbId || ids.titleYear);
      } else {
        btn.textContent = 'Ya vista';
        btn.classList.remove('btn-success');
        btn.classList.add('btn-secondary');
        btn.disabled = true;
        btn.dataset.watched = 'true';
      }
    } catch (e) {
      // no detener el loop por errores individuales
      console.warn('updateAllMarkButtons: failed updating a button', e);
    }
  });
}


function getMovieIdentifiersFromRaw(raw) {
  if (!raw) return { imdbId: null, tmdbId: null, titleYear: null, canonicalId: null };

  const imdbId = raw.imdbID || raw.imdb_id || (raw.raw && (raw.raw.imdb_id || raw.raw.imdbID)) || null;

  const tmdbNumeric = raw.tmdb_id || (raw.id && String(raw.id).match(/^\d+$/) ? raw.id : (raw.raw && raw.raw.id && String(raw.raw.id).match(/^\d+$/) ? raw.raw.id : null));
  const tmdbId = tmdbNumeric ? `tmdb:${String(tmdbNumeric)}` : (String(raw.id || '').startsWith('tmdb:') ? raw.id : (raw.raw && String(raw.raw.id || '').startsWith('tmdb:') ? raw.raw.id : null));

  const title = raw.Title || raw.title || raw.name || (raw._normalized && raw._normalized.Title) || (raw.raw && (raw.raw.title || raw.raw.name)) || '';
  const year = raw.Year || raw.year || (raw._normalized && raw._normalized.Year) || (raw.raw && (raw.raw.release_date ? String(raw.raw.release_date).slice(0, 4) : raw.raw.year)) || '';
  const titleYear = (String(title || '').trim() && String(year || '').trim()) ? `${String(title).trim()}::${String(year).trim()}` : null;

  const canonicalId = imdbId || tmdbId || titleYear;
  return { imdbId, tmdbId, titleYear, canonicalId };
}


function isMovieWatchedByRaw(raw) {
  if (!raw) return false;

  const ids = getMovieIdentifiersFromRaw(raw);
  const watched = typeof getWatched === 'function' ? getWatched() : [];

  // Normalización helper para comparar de forma segura (trim + toString)
  const eq = (a, b) => {
    if (a == null || b == null) return false;
    return String(a).trim() === String(b).trim();
  };

  for (const w of watched) {
    try {

      if (w && w.id) {
        if ((ids.imdbId && eq(w.id, ids.imdbId)) ||
          (ids.tmdbId && eq(w.id, ids.tmdbId)) ||
          (ids.titleYear && eq(w.id, ids.titleYear))) {
          return true;
        }
      }


      const src = w && (w.sourceData || w.source || w.raw) ? (w.sourceData || w.source || w.raw) : null;
      if (src) {
        const srcIds = getMovieIdentifiersFromRaw(src);
        if ((ids.imdbId && srcIds.imdbId && eq(srcIds.imdbId, ids.imdbId)) ||
          (ids.tmdbId && srcIds.tmdbId && eq(srcIds.tmdbId, ids.tmdbId)) ||
          (ids.titleYear && srcIds.titleYear && eq(srcIds.titleYear, ids.titleYear))) {
          return true;
        }

        if (ids.tmdbId && srcIds.tmdbId && eq(srcIds.tmdbId.replace(/^tmdb:/, ''), ids.tmdbId.replace(/^tmdb:/, ''))) {
          return true;
        }
      }


      const wIds = getMovieIdentifiersFromRaw(w);
      if ((ids.imdbId && wIds.imdbId && eq(wIds.imdbId, ids.imdbId)) ||
        (ids.tmdbId && wIds.tmdbId && eq(wIds.tmdbId, ids.tmdbId)) ||
        (ids.titleYear && wIds.titleYear && eq(wIds.titleYear, ids.titleYear))) {
        return true;
      }

    } catch (e) {

      console.warn('isMovieWatchedByRaw check failed for item', w, e);
    }
  }

  return false;
}

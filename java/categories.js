// tmdb-browse.js - Prototipo cliente para filas tipo Netflix (usa TMDB)
// Requiere: Bootstrap 5 (opcional), y los helpers getWatched/saveWatched si quieres marcar como vista.
(() => {
  const TMDB_KEY = 'TU_TMDB_API_KEY_AQUI'; // <- reemplazá por tu TMDB key
  if (!TMDB_KEY || TMDB_KEY === 'TU_TMDB_API_KEY_AQUI') {
    console.warn('TMDB: poné tu TMDB_KEY en tmdb-browse.js para que funcione el prototipo.');
    return;
  }

  const API_BASE = 'https://api.themoviedb.org/3';
  const IMG_BASE = 'https://image.tmdb.org/t/p/';
  const POSTER_SIZE = 'w342';

  const rowsContainer = document.getElementById('tmdb-rows');
  const genreSelect = document.getElementById('tmdb-genre-select');
  const refreshGenresBtn = document.getElementById('tmdb-refresh-genres');

  const genreCache = { list: null, byId: new Map() };
  const moviesCache = new Map(); // key->Promise/results

  // helper reducedMotion 
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  // listen for changes so the app responds if the user toggles the OS preference live
  const _reducedMotionMQ = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)')) || null;
  if (_reducedMotionMQ) {
    const _onReducedMotionChange = (e) => {
      const reduced = e.matches;
      // update existing scrollers' inline scroll-behavior so keyboard/arrow uses the correct mode
      document.querySelectorAll('.tmdb-scroller').forEach(s => {
        try { s.style.scrollBehavior = reduced ? 'auto' : 'smooth'; } catch (err) { /* ignore */ }
      });
    };
    if (typeof _reducedMotionMQ.addEventListener === 'function') {
      _reducedMotionMQ.addEventListener('change', _onReducedMotionChange);
    } else if (typeof _reducedMotionMQ.addListener === 'function') {
      _reducedMotionMQ.addListener(_onReducedMotionChange);
    }
  }

  // helper fetch
  async function tmdbFetch(path, params = {}) {
    const url = new URL(API_BASE + path);
    url.searchParams.set('api_key', TMDB_KEY);
    for (const k in params) {
      if (params[k] != null) url.searchParams.set(k, params[k]);
    }
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB fetch ${url} -> ${res.status}`);
    return res.json();
  }

  async function loadGenres() {
    if (genreCache.list) return genreCache.list;
    const data = await tmdbFetch('/genre/movie/list', { language: 'es-ES' });
    genreCache.list = data.genres || [];
    genreCache.list.forEach(g => genreCache.byId.set(String(g.id), g));
    return genreCache.list;
  }

  async function loadMoviesFor(key, fetchFn) {
    if (moviesCache.has(key)) {
      const cached = moviesCache.get(key);
      // cached may be a Promise or resolved results; return awaited value
      return await cached;
    }
    const p = fetchFn().then(r => r).catch(err => { moviesCache.delete(key); throw err; });
    moviesCache.set(key, p);
    return await p;
  }

  // create poster card with overlay and accessibility
  function createPosterCard(movie) {
    const card = document.createElement('div');
    card.className = 'tmdb-poster-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${movie.title || movie.name}`);
    Object.assign(card.style, {
      width: '160px',
      flex: '0 0 auto',
      cursor: 'pointer',
      textAlign: 'center',
    });

    const img = document.createElement('img');
    img.alt = movie.title || movie.name || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.style.width = '100%';
    img.style.borderRadius = '6px';
    img.style.display = 'block';
    img.style.objectFit = 'cover';
    img.style.height = '240px';

    if (movie.poster_path) {
      img.src = `${IMG_BASE}${POSTER_SIZE}${movie.poster_path}`;
    } else if (movie.poster) {
      img.src = movie.poster;
    } else {
      img.src = '../assets/placeholder.png';
    }

    // overlay
    const overlay = document.createElement('div');
    overlay.className = 'tmdb-poster-overlay';
    overlay.innerHTML = `
      <div class="text-truncate"><strong style="font-size:.9rem">${escapeHtml(movie.title || movie.name || '')}</strong></div>
      <div class="badge bg-dark" style="opacity:.9">${movie.vote_average ?? ''}</div>
    `;

    const caption = document.createElement('div');
    caption.style.fontSize = '0.85rem';
    caption.style.marginTop = '6px';
    caption.style.whiteSpace = 'nowrap';
    caption.style.overflow = 'hidden';
    caption.style.textOverflow = 'ellipsis';
    caption.textContent = movie.title || movie.name || '—';

    card.appendChild(img);
    card.appendChild(overlay);
    card.appendChild(caption);

    const open = () => openDetailModal(movie.id, card);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
    });

    return card;
  }

  // === Skeleton helpers (mover aquí, antes de renderRow) ===
  function createSkeletonCard() {
    const wrap = document.createElement('div');
    wrap.className = 'tmdb-skeleton-item';

    const box = document.createElement('div');
    box.className = 'tmdb-skeleton-card';

    const caption = document.createElement('div');
    caption.className = 'tmdb-skeleton-caption';

    wrap.appendChild(box);
    wrap.appendChild(caption);

    // ocupar el mismo comportamiento flex que .tmdb-poster-card
    wrap.style.flex = '0 0 auto';
    wrap.style.boxSizing = 'border-box';

    // etiqueta para depuración
    wrap.dataset.skeleton = 'true';
    return wrap;
  }

  function showSkeletons(scroller, count = 6) {
    if (!scroller) return;
    // evita duplicados
    if (scroller.querySelector('.tmdb-skeleton-item')) return;
    for (let i = 0; i < count; i++) {
      scroller.appendChild(createSkeletonCard());
    }
  }

  function removeSkeletons(scroller) {
    if (!scroller) return;
    const nodes = Array.from(scroller.querySelectorAll('.tmdb-skeleton-item'));
    nodes.forEach(n => n.remove());
  }
  // === end skeleton helpers ===


  // render a row with arrows and load more button
  // render a row with arrows and load more button
  function renderRow({ id, title, initialMovies = [], loadMoreFn }) {
    if (document.getElementById(`tmdb-row-${id}`)) return null;

    const row = document.createElement('section');
    row.id = `tmdb-row-${id}`;
    row.className = 'mb-4';

    const header = document.createElement('div');
    header.className = 'd-flex tmdb-row-header justify-content-between mb-2';

    const left = document.createElement('div');
    left.className = 'd-flex align-items-center gap-3';
    left.innerHTML = `<h5 class="mb-0">${escapeHtml(title)}</h5>`;

    const controls = document.createElement('div');
    controls.className = 'tmdb-row-controls';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'tmdb-arrow-btn';
    prevBtn.setAttribute('aria-label', `Mover ${title} izquierda`);
    prevBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 12L6 8L10 4" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'tmdb-arrow-btn';
    nextBtn.setAttribute('aria-label', `Mover ${title} derecha`);
    nextBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4L10 8L6 12" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    controls.appendChild(prevBtn);
    controls.appendChild(nextBtn);

    header.appendChild(left);
    header.appendChild(controls);
    row.appendChild(header);

    const scroller = document.createElement('div');
    scroller.className = 'tmdb-scroller d-flex gap-2 overflow-auto pb-2';
    scroller.style.scrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    scroller.style.padding = '6px 0';
    scroller.style.maxHeight = '320px';
    scroller.style.alignItems = 'flex-start';
    scroller.setAttribute('tabindex', '0');
    scroller.setAttribute('aria-roledescription', 'Carrusel de películas');
    scroller.setAttribute('aria-label', `${title} - fila de películas`);
    scroller.setAttribute('role', 'region');


    scroller.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight' || ev.key === 'Home' || ev.key === 'End') {
        ev.preventDefault();
        const amount = Math.min(scroller.clientWidth, 560);
        const behavior = prefersReducedMotion() ? 'auto' : 'smooth';

        if (ev.key === 'ArrowLeft') scroller.scrollBy({ left: -amount, behavior });
        if (ev.key === 'ArrowRight') scroller.scrollBy({ left: amount, behavior });
        if (ev.key === 'Home') scroller.scrollTo({ left: 0, behavior });
        if (ev.key === 'End') scroller.scrollTo({ left: Math.max(0, scroller.scrollWidth - scroller.clientWidth), behavior });
      }
    });


    showSkeletons(scroller, 6);

    // append any initial movies passed
    initialMovies.forEach(m => scroller.appendChild(createPosterCard(m)));

    // arrows behaviour: scroll by visible width (or 3 cards)
    const scrollAmount = () => Math.min(scroller.clientWidth, 560);

    prevBtn.addEventListener('click', () => {
      const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
      scroller.scrollBy({ left: -scrollAmount(), behavior });

    });
    nextBtn.addEventListener('click', () => {
      const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
      scroller.scrollBy({ left: scrollAmount(), behavior });

    });

    // show/hide arrows based on scroll (desktop only)
    function updateArrows() {
      prevBtn.style.visibility = scroller.scrollLeft > 10 ? 'visible' : 'hidden';
      nextBtn.style.visibility = (scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft) > 10 ? 'visible' : 'hidden';
    }
    scroller.addEventListener('scroll', throttle(updateArrows, 100));
    window.addEventListener('resize', throttle(updateArrows, 200));
    setTimeout(updateArrows, 250);

    // controls area with "Cargar más"
    const controlsRow = document.createElement('div');
    controlsRow.className = 'd-flex gap-2 mt-2 align-items-center justify-content-end';
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'btn btn-sm btn-outline-primary';
    loadMoreBtn.textContent = 'Cargar más';
    controlsRow.appendChild(loadMoreBtn);

    loadMoreBtn.addEventListener('click', async () => {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Cargando...';
      try {
        const newMovies = await loadMoreFn();
        newMovies.forEach(m => scroller.appendChild(createPosterCard(m)));
        updateArrows();
      } catch (err) {
        console.error('Error loadMore', err);
        showToast('Error cargando más películas.', { duration: 5000 });
      } finally {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Cargar más';
      }
    });

    row.appendChild(scroller);
    row.appendChild(controlsRow);
    rowsContainer.appendChild(row);

    // devolver el scroller para poder inyectar resultados desde fuera (first load)
    return scroller;
  }

  // open detail modal (re-uses existing modalMovieDetails if present)
  async function openDetailModal(tmdbId, triggerEl) {
    const existingModalEl = document.getElementById('modalMovieDetails');
    const modalEl = existingModalEl || document.getElementById('tmdbDetailModal');
    const modalBody = modalEl ? modalEl.querySelector('.modal-body') : null;
    const modalTitle = modalEl ? modalEl.querySelector('.modal-title') : null;
    let savedTrigger = triggerEl || null;

    if (!modalEl || !modalBody) { alert('No se encontró modal de detalles en el DOM.'); return; }

    if (modalTitle) modalTitle.textContent = 'Cargando...';
    modalBody.innerHTML = '<p>Cargando detalles...</p>';
    const modalInstance = (typeof bootstrap !== 'undefined') ? new bootstrap.Modal(modalEl) : null;

    try {
      const data = await tmdbFetch(`/movie/${tmdbId}`, { language: 'es-ES' });
      const poster = data.poster_path ? IMG_BASE + POSTER_SIZE + data.poster_path : '../assets/placeholder.png';
      const html = `
        <div class="d-flex gap-3 flex-column flex-md-row">
          <img src="${poster}" alt="${escapeHtml(data.title)}" style="width:160px; height:240px; object-fit:cover; border-radius:6px"/>
          <div class="flex-fill">
            <h5>${escapeHtml(data.title)}</h5>
            <p class="mb-1"><strong>Año:</strong> ${data.release_date ? data.release_date.slice(0, 4) : '—'}</p>
            <p class="mb-1"><strong>Rating TMDB:</strong> ${data.vote_average ?? '—'}</p>
            <p class="mb-1"><strong>Géneros:</strong> ${(data.genres || []).map(g => g.name).join(', ')}</p>
            <p class="mt-2">${escapeHtml(data.overview || 'Sin descripción.')}</p>
            <div class="mt-3">
              <button id="tmdb-mark-watched" class="btn btn-sm btn-primary">Marcar como vista</button>
            </div>
          </div>
        </div>
      `;
      modalBody.innerHTML = html;
      if (modalTitle) modalTitle.textContent = data.title || 'Detalles';

      const markBtn = modalBody.querySelector('#tmdb-mark-watched');
      if (markBtn) {
        markBtn.addEventListener('click', () => {
          const movie = {
            id: data.imdb_id || `tmdb:${data.id}`,
            title: data.title || '',
            year: data.release_date ? data.release_date.slice(0, 4) : '',
            poster: poster,
            viewedAt: new Date().toISOString(),
            rating: null,
            note: '',
            sourceData: data
          };
          try {
            const savedId = movie.id;

            const watched = typeof getWatched === 'function' ? getWatched() : [];
            watched.unshift(movie);
            if (typeof saveWatched === 'function') saveWatched(watched);
            if (typeof renderWatchedMovies === 'function') renderWatchedMovies();

            try { markBtn.blur(); } catch (e) { }


            // Reemplaza esta parte dentro del markBtn click handler (la rama modalInstance)
            if (modalInstance) {
              // Añadimos el listener ANTES de ocultar el modal para no perder el evento
              modalEl.addEventListener('hidden.bs.modal', function onHidden() {
                try {
                  if (window.innerWidth > 576) {
                    // Desktop: restaurar foco primero, luego mostrar toast (toast no debe robar foco)
                    tryFocus(savedTrigger);
                    // debug
                    // console.log('hidden.bs.modal fired - desktop, launching toast', savedId);
                    window.showToast('Película marcada como vista', {
                      duration: 6000,
                      action: {
                        label: 'Deshacer',
                        onClick: () => {
                          try {
                            const w = typeof getWatched === 'function' ? getWatched() : [];
                            const idx = w.findIndex(x => x.id === savedId);
                            if (idx !== -1) {
                              w.splice(idx, 1);
                              if (typeof saveWatched === 'function') saveWatched(w);
                              if (typeof renderWatchedMovies === 'function') renderWatchedMovies();
                            }
                          } catch (e) {
                            console.warn('Undo error', e);
                          }
                        }
                      }
                    });
                  } else {
                    // Mobile: mostrar toast primero (el toast puede gestionar su propio foco en mobile)
                    // console.log('hidden.bs.modal fired - mobile, launching toast', savedId);
                    window.showToast('Película marcada como vista', {
                      duration: 6000,
                      action: {
                        label: 'Deshacer',
                        onClick: () => {
                          try {
                            const w = typeof getWatched === 'function' ? getWatched() : [];
                            const idx = w.findIndex(x => x.id === savedId);
                            if (idx !== -1) {
                              w.splice(idx, 1);
                              if (typeof saveWatched === 'function') saveWatched(w);
                              if (typeof renderWatchedMovies === 'function') renderWatchedMovies();
                            }
                          } catch (e) {
                            console.warn('Undo error', e);
                          }
                        }
                      }
                    });
                  }
                } catch (e) {
                  console.warn('hidden.bs.modal handler error', e);
                } finally {
                  // el listener se ejecuta solo una vez por { once: true } si lo pusiste, pero lo limpiamos de todas formas
                  try { modalEl.removeEventListener('hidden.bs.modal', onHidden); } catch (_) { /* ignore */ }
                }
              }, { once: true });

              // Ahora sí ocultamos el modal (listener ya está activo)
              modalInstance.hide();
            }



          } catch (err) {
            console.warn('No se pudo marcar como vista: falta getWatched/saveWatched', err);
          }

        });
      }
    } catch (err) {
      console.error('Error fetching detail', err);
      modalBody.innerHTML = '<p>Error cargando detalles.</p>';
      if (modalTitle) modalTitle.textContent = 'Error';
    }
    if (modalInstance) modalInstance.show();
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"'`=\/]/g, c => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;' };
      return map[c];
    });
  }

  // small throttle helper
  function throttle(fn, wait) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last > wait) {
        last = now;
        fn(...args);
      }
    };
  }

  // init: robusto — re-consulta nodos, logs y fallback si falla la API de géneros
  async function init() {

    // re-obtener nodos del DOM dentro de init para asegurarnos que existen
    const rowsContainerEl = document.getElementById('tmdb-rows');
    const genreSelectEl = document.getElementById('tmdb-genre-select');
    const refreshGenresBtnEl = document.getElementById('tmdb-refresh-genres');

    if (!rowsContainerEl) {
      console.warn('tmdb: #tmdb-rows no encontrado en DOM. Abortando init.');
      return;
    }

    try {
      let genres;
      try {
        genres = await loadGenres();

      } catch (err) {
        console.error('tmdb: loadGenres falló, aplicando fallback local', err);
        // fallback: al menos poner las tres categorías que queremos por defecto
        genres = [
          { id: 28, name: 'Acción' },
          { id: 35, name: 'Comedia' },
          { id: 10751, name: 'Familia' }
        ];
        // actualizar genreCache para que createGenreRow pueda usarlo
        genreCache.list = genres;
        genreCache.byId.set('28', { id: 28, name: 'Acción' });
        genreCache.byId.set('35', { id: 35, name: 'Comedia' });
        genreCache.byId.set('10751', { id: 10751, name: 'Familia' });
      }

      // comprobar que existe el select y rellenarlo
      if (genreSelectEl) {
        genreSelectEl.innerHTML = `<option value="">-- Seleccionar género --</option>`;
        genres.forEach(g => {
          const opt = document.createElement('option');
          opt.value = g.id;
          opt.textContent = g.name;
          genreSelectEl.appendChild(opt);
        });
        const lastGenre = sessionStorage.getItem('tmdb.lastGenre');
        if (lastGenre && genreSelectEl.querySelector(`option[value="${lastGenre}"]`)) {
          genreSelectEl.value = lastGenre;
        }

      }

      // Populares
      (function createPopularRow() {
        let page = 0;
        const scroller = renderRow({
          id: 'popular',
          title: 'Populares',
          initialMovies: [],
          loadMoreFn: async () => {
            page++;
            const key = `popular|${page}`;
            const data = await loadMoviesFor(key, () => tmdbFetch('/movie/popular', { language: 'es-ES', page }));
            return data.results || [];
          }
        });
        // initial load explicitly calling the loader and appending into scroller
        (async () => {
          try {
            const first = await loadMoviesFor(`popular|1`, () => tmdbFetch('/movie/popular', { language: 'es-ES', page: 1 }));
            removeSkeletons(scroller);
            (first.results || []).forEach(m => scroller && scroller.appendChild(createPosterCard(m)));
          } catch (err) {
            console.error('Initial load popular failed', err);
          }
        })();
      })();

      // Top rated
      (function createTopRow() {
        let page = 0;
        const scroller = renderRow({
          id: 'top',
          title: 'Mejor puntuadas',
          initialMovies: [],
          loadMoreFn: async () => {
            page++;
            const key = `top_rated|${page}`;
            const data = await loadMoviesFor(key, () => tmdbFetch('/movie/top_rated', { language: 'es-ES', page }));
            return data.results || [];
          }
        });
        (async () => {
          try {
            const first = await loadMoviesFor(`top_rated|1`, () => tmdbFetch('/movie/top_rated', { language: 'es-ES', page: 1 }));
            removeSkeletons(scroller);
            (first.results || []).forEach(m => scroller && scroller.appendChild(createPosterCard(m)));
          } catch (err) {
            console.error('Initial load top failed', err);
          }
        })();
      })();

      // Helper para crear fila por género (gid = TMDB genre id)
      async function createGenreRow(gid, forcedTitle) {
        const rowId = `genre_${gid}`;
        if (document.getElementById(`tmdb-row-${rowId}`)) return; // ya existe
        let page = 0;
        const title = forcedTitle || `${genreCache.byId.get(String(gid))?.name || gid}`;
        const scroller = renderRow({
          id: rowId,
          title,
          initialMovies: [],
          loadMoreFn: async () => {
            page++;
            const key = `discover_genre_${gid}|${page}`;
            const data = await loadMoviesFor(key, () => tmdbFetch('/discover/movie', { with_genres: gid, sort_by: 'popularity.desc', language: 'es-ES', page }));
            return data.results || [];
          }
        });
        // initial load
        try {
          const first = await loadMoviesFor(`discover_genre_${gid}|1`, () => tmdbFetch('/discover/movie', { with_genres: gid, sort_by: 'popularity.desc', language: 'es-ES', page: 1 }));
          removeSkeletons(scroller);
          (first.results || []).forEach(m => scroller && scroller.appendChild(createPosterCard(m)));
        } catch (err) {
          console.error(`Initial load genre ${gid} failed`, err);
        }
      }

      // Crear las 3 filas de género que querías: Acción, Comedia, Infantiles(Family)
      // TMDB genre ids: Action=28, Comedy=35, Family=10751
      await createGenreRow(28, 'Acción');
      await createGenreRow(35, 'Comedia');
      await createGenreRow(10751, 'Familia');

      // --- AFTER your createGenreRow definition (inside init) ---
      // Exponer createGenreRow para que la función global pueda usarla si es necesario
      window.createGenreRow = createGenreRow;

      // Reemplazar showRestoreToast existente por esta versión robusta.
      // Puedes pegarla dentro de init() (o fuera), pero la dejo como función global
      // para poder llamarla desde consola también.

      // small improvements: compute original padding from computed style (not just inline)
      const originalBodyPaddingBottom = window.getComputedStyle(document.body).paddingBottom || '';

      function animateIn(el) {
        if (!el) return;
        // Si el usuario prefiere reducir movimiento, evitar animaciones
        if (prefersReducedMotion()) {
          try { el.classList.add('is-visible'); el.style.visibility = 'visible'; el.style.opacity = '1'; } catch (e) { /* noop */ }
          return;
        }
        el.classList.remove('is-hiding');
        requestAnimationFrame(() => {
          el.classList.add('is-visible');
        });
      }

      function animateOut(el, cb) {
        if (!el) {
          if (typeof cb === 'function') cb();
          return;
        }
        if (prefersReducedMotion()) {
          try { if (typeof cb === 'function') cb(); } catch (_) { /* noop */ }
          return;
        }
        el.classList.remove('is-visible');
        el.classList.add('is-hiding');

        const onEnd = (e) => {
          if (e && e.target !== el) return;
          el.removeEventListener('transitionend', onEnd);
          if (typeof cb === 'function') cb();
        };

        const timeout = setTimeout(() => {
          el.removeEventListener('transitionend', onEnd);
          if (typeof cb === 'function') cb();
        }, 400);

        el.addEventListener('transitionend', (e) => {
          clearTimeout(timeout);
          onEnd(e);
        });
      }

      window.showRestoreToast = function (title, rowId, gid) {
        try {
          let container = document.getElementById('tmdb-toasts');
          if (!container) {
            container = document.createElement('div');
            container.id = 'tmdb-toasts';
            container.className = 'toast-container position-fixed p-3';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('role', 'status');
            container.setAttribute('aria-atomic', 'true');
            document.body.appendChild(container);
          }


          try {
            container.style.position = 'fixed';
            container.style.zIndex = '99999';
            container.style.pointerEvents = 'auto';
            if (window.innerWidth <= 576) {
              container.style.left = '50%';
              container.style.right = 'auto';
              container.style.transform = 'translateX(-50%)';
              container.style.bottom = '1.75rem';
              container.style.maxWidth = 'calc(100% - 2rem)';
            } else {
              container.style.right = '0.75rem';
              container.style.left = 'auto';
              container.style.transform = '';
              container.style.bottom = '0.75rem';
              container.style.maxWidth = '380px';
            }
          } catch (e) { /* ignore style errors */ }
          // evitar duplicados

          if (container.querySelector(`[data-row="${rowId}"]`)) return;

          // crear toast
          const toastEl = document.createElement('div');
          toastEl.className = 'tmdb-toast';
          toastEl.setAttribute('data-row', rowId);
          Object.assign(toastEl.style, {
            background: '#222',
            color: '#fff',
            padding: '0.6rem 0.75rem',
            borderRadius: '0.5rem',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            minWidth: '220px',
            boxSizing: 'border-box',
            pointerEvents: 'auto'
          });

          toastEl.setAttribute('role', 'status');
          toastEl.setAttribute('aria-atomic', 'true');

          // contenido
          const textDiv = document.createElement('div');
          textDiv.style.flex = '1';
          textDiv.style.fontSize = '0.95rem';
          textDiv.textContent = title || 'Último género';

          const goBtn = document.createElement('button');
          goBtn.type = 'button';
          goBtn.textContent = 'Ir';
          goBtn.setAttribute('aria-label', `Ir a ${title}`);
          Object.assign(goBtn.style, {
            background: 'transparent',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem'
          });

          const closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.textContent = '×';
          Object.assign(closeBtn.style, {
            background: 'transparent',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1rem',
            lineHeight: '1'
          });

          toastEl.appendChild(textDiv);
          toastEl.appendChild(goBtn);
          toastEl.appendChild(closeBtn);
          container.appendChild(toastEl);
          updateBodyForToasts();
          animateIn(toastEl);

          requestAnimationFrame(() => {
            try {
              // Dejar animateIn para la animación; pero también forzamos inline styles para visibilidad inmediata.
              toastEl.style.visibility = 'visible';
              toastEl.style.opacity = '1';
              toastEl.style.zIndex = '200000';
              // También para que quede por delante de otros elementos si es necesario
              animateIn(toastEl);
            } catch (e) { /* ignore */ }
          });


          // focus (ayuda en mobile para traer el toast a la vista)
          if (window.innerWidth <= 576 && !prefersReducedMotion()) {
            goBtn.focus({ preventScroll: true });
          }

          // handlers
          const removeToast = () => {
            if (prefersReducedMotion()) {
              try { toastEl.remove(); } catch (e) { }
              updateBodyForToasts();
              return;
            }
            animateOut(toastEl, () => {
              try { toastEl.remove(); } catch (e) { }
              updateBodyForToasts();
            });
          };

          const handleGo = async () => {

            try {
              const rowEl = document.getElementById(rowId);
              const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
              if (rowEl) {
                rowEl.scrollIntoView({ behavior });
              } else if (gid && typeof window.createGenreRow === 'function') {
                await window.createGenreRow(gid);
                const created = document.getElementById(rowId);
                if (created) created.scrollIntoView({ behavior });
              }
            } catch (e) {
              console.warn('toast go error', e);
            }
            removeToast();
            clearTimeout(autoTimer);
          };

          goBtn.addEventListener('click', handleGo, { passive: true });
          closeBtn.addEventListener('click', () => { removeToast(); clearTimeout(autoTimer); }, { passive: true });

          const autoTimer = setTimeout(() => { removeToast(); }, 7000);

        } catch (err) {
          console.error('showRestoreToast error', err);
        }
      };

      function updateBodyForToasts() {
        const container = document.getElementById('tmdb-toasts');
        if (!container || container.children.length === 0) {
          document.body.style.paddingBottom = originalBodyPaddingBottom;
          return;
        }
        requestAnimationFrame(() => {
          try {
            const height = container.getBoundingClientRect().height;
            document.body.style.paddingBottom = `${height + 16}px`;
          } catch (e) {
            document.body.style.paddingBottom = originalBodyPaddingBottom || '';
          }
        });

      };

      window.showToast = function (message, options = {}) {
        console.log('showToast called:', message, options);
        const duration = (typeof options.duration === 'number') ? options.duration : 5000;

        // ensure container
        let container = document.getElementById('tmdb-toasts');
        if (!container) {
          container = document.createElement('div');
          container.id = 'tmdb-toasts';
          container.className = 'toast-container position-fixed p-3';
          container.setAttribute('aria-live', 'polite');
          container.setAttribute('role', 'status');
          container.setAttribute('aria-atomic', 'true');
          document.body.appendChild(container);
          console.log('created tmdb-toasts container');
        }

        // force container styles so it is above modal/backdrop and visible
        try {
          container.style.position = 'fixed';
          container.style.zIndex = '999999';
          container.style.pointerEvents = 'auto';
          if (window.innerWidth <= 576) {
            container.style.left = '50%';
            container.style.transform = 'translateX(-50%)';
            container.style.bottom = '1.75rem';
            container.style.maxWidth = 'calc(100% - 2rem)';
          } else {
            container.style.right = '0.75rem';
            container.style.left = 'auto';
            container.style.bottom = '0.75rem';
            container.style.maxWidth = '380px';
          }
        } catch (e) { console.warn('container style error', e); }

        // create toast element
        const toastEl = document.createElement('div');
        toastEl.className = 'tmdb-toast';
        Object.assign(toastEl.style, {
          background: '#222',
          color: '#fff',
          padding: '0.6rem 0.75rem',
          borderRadius: '0.5rem',
          boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          minWidth: '220px',
          boxSizing: 'border-box',
          pointerEvents: 'auto',
          opacity: '0',
          visibility: 'hidden',
          transform: 'translateY(10px)'
        });

        const textDiv = document.createElement('div');
        textDiv.style.flex = '1';
        textDiv.style.fontSize = '0.95rem';
        textDiv.textContent = message || '';
        toastEl.appendChild(textDiv);

        if (options.action && typeof options.action.onClick === 'function') {
          const actionBtn = document.createElement('button');
          actionBtn.type = 'button';
          actionBtn.textContent = options.action.label || 'Acción';
          Object.assign(actionBtn.style, {
            background: 'transparent',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem'
          });
          actionBtn.addEventListener('click', (ev) => {
            try { options.action.onClick(ev); } catch (e) { console.warn('toast action error', e); }
            safeRemove();
            clearTimeout(autoTimer);
          }, { passive: true });
          toastEl.appendChild(actionBtn);
        }

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        Object.assign(closeBtn.style, {
          background: 'transparent',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1rem',
          lineHeight: '1'
        });
        closeBtn.addEventListener('click', () => { safeRemove(); clearTimeout(autoTimer); }, { passive: true });
        toastEl.appendChild(closeBtn);

        container.appendChild(toastEl);
        console.log('toast appended to container, children:', container.children.length);

        // force visible immediately and above everything
        requestAnimationFrame(() => {
          try {
            toastEl.style.visibility = 'visible';
            toastEl.style.opacity = '1';
            toastEl.style.transform = 'translateY(0)';
            toastEl.style.zIndex = '200000';
            // add class for transition if present
            toastEl.classList.add('is-visible');
            console.log('forced toast visible');
          } catch (e) {
            console.warn('force visible failed', e);
          }
        });

        function safeRemove() {
          try {
            toastEl.classList.remove('is-visible');
            toastEl.classList.add('is-hiding');
            // remove after short timeout to allow CSS transition (if any)
            setTimeout(() => {
              try { toastEl.remove(); updateBodyForToasts(); } catch (e) { /* ignore */ }
            }, 220);
          } catch (e) {
            try { toastEl.remove(); updateBodyForToasts(); } catch (_) { }
          }
        }

        const autoTimer = setTimeout(() => { safeRemove(); }, duration);
        updateBodyForToasts();

        return { close: safeRemove, element: toastEl };
      };

      // Restaurar la última selección (si existe) — ejecutarlo después de crear las filas por defecto


      // hookup del select de géneros (usa la referencia local, si existe)
      if (genreSelectEl) {
        genreSelectEl.addEventListener('change', async (e) => {
          const gid = e.target.value;
          try { sessionStorage.setItem('tmdb.lastGenre', gid); } catch (err) { /* ignore */ }
          if (!gid) return;
          const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
          const rowId = `genre_${gid}`;
          if (document.getElementById(`tmdb-row-${rowId}`)) {

            document.getElementById(`tmdb-row-${rowId}`).scrollIntoView({ behavior });
            return;
          }
          await createGenreRow(gid);
          const el = document.getElementById(`tmdb-row-${rowId}`);
          if (el) {

            el.scrollIntoView({ behavior });
          };
        });
      }

      try {
        const lastGenre = sessionStorage.getItem('tmdb.lastGenre');
        if (lastGenre && genreSelectEl && genreSelectEl.querySelector(`option[value="${lastGenre}"]`)) {
          genreSelectEl.value = lastGenre;
          const existingRow = document.getElementById(`tmdb-row-genre_${lastGenre}`);
          const genreName = genreCache.byId.get(String(lastGenre))?.name || 'género';
          showRestoreToast(`Último género: ${genreName}`, `tmdb-row-genre_${lastGenre}`, String(lastGenre));

        }
      } catch (err) {
        console.warn('tmdb: error durante restauración de género', err);
      }

      // hookup refresh button si existe
      if (refreshGenresBtnEl) {
        refreshGenresBtnEl.addEventListener('click', async () => {
          genreCache.list = null;
          genreCache.byId.clear();
          await loadGenres();
          if (genreSelectEl) {
            genreSelectEl.innerHTML = `<option value="">-- Seleccionar género --</option>`;
            genreCache.list.forEach(g => {
              const opt = document.createElement('option');
              opt.value = g.id;
              opt.textContent = g.name;
              genreSelectEl.appendChild(opt);
            });
          }
        });
      }


    } catch (err) {
      console.error('TMDB init failed', err);
      rowsContainerEl.innerHTML = '<p>Error cargando contenido de TMDB.</p>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function tryFocus(el) {
    if (!el) return false;
    if (!el.isConnected) return false;
    if (typeof el.focus === 'function') {
      try {
        el.focus({ preventScroll: true });
        return true;
      } catch (e) { return false; }
    }
  };




})();
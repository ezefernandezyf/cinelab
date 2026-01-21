// tmdb-browse.js - Prototipo cliente para filas tipo Netflix (usa TMDB wrapper window.TMDBApi)
(() => {
  // Dependemos de window.TMDBApi (proporcionado por java/api.js)
  if (!window.TMDBApi) {
    console.warn('TMDBApi no disponible. Asegurate de cargar java/api.js con una TMDB key local.');
    return;
  }

  const IMG_BASE = (window.TMDB_CONFIG && window.TMDB_CONFIG.IMG_BASE) || 'https://image.tmdb.org/t/p/';
  const POSTER_SIZE = (window.TMDB_CONFIG && window.TMDB_CONFIG.POSTER_SIZE) || 'w342';

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

  // helper: load genres via TMDBApi._rawFetch
  async function loadGenres() {
    if (genreCache.list) return genreCache.list;
    if (!window.TMDBApi || typeof window.TMDBApi._rawFetch !== 'function') {
      throw new Error('TMDBApi._rawFetch not available');
    }
    const data = await window.TMDBApi._rawFetch('/genre/movie/list', { language: 'es-ES' });
    genreCache.list = data.genres || [];
    genreCache.list.forEach(g => genreCache.byId.set(String(g.id), g));
    return genreCache.list;
  }

  async function loadMoviesFor(key, fetchFn) {
    if (moviesCache.has(key)) {
      const cached = moviesCache.get(key);
      return await cached;
    }
    const p = (async () => {
      try {
        const r = await fetchFn();
        return r;
      } catch (err) {
        moviesCache.delete(key);
        throw err;
      }
    })();
    moviesCache.set(key, p);
    return await p;
  }

  // create poster card with overlay and accessibility
  function createPosterCard(movieRaw) {
    // movieRaw may be either the mapped shape from TMDBApi (title, poster, tmdb_id, id 'tmdb:123', etc)
    // or the older raw TMDB result (with poster_path). Normalize minimally:
    const movie = (movieRaw && movieRaw.title) ? movieRaw : {
      title: movieRaw.title || movieRaw.name || '',
      poster_path: movieRaw.poster_path,
      poster: movieRaw.poster || null,
      vote_average: movieRaw.vote_average ?? movieRaw.vote,
      id: movieRaw.id || movieRaw.tmdb_id || null,
      tmdb_id: movieRaw.tmdb_id || movieRaw.id || null,
      raw: movieRaw
    };

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

    // resolve poster src
    if (movie.poster) {
      img.src = movie.poster;
    } else if (movie.poster_path) {
      img.src = `${IMG_BASE}${POSTER_SIZE}${movie.poster_path}`;
    } else {
      img.src = '../assets/placeholder.png';
    }

    // overlay
    const overlay = document.createElement('div');
    overlay.className = 'tmdb-poster-overlay';
    overlay.innerHTML = `
      <div class="badge bg-dark mt-2" style="opacity:.95; color: #fff;">${movie.vote_average != null ? `Rating: ${movie.vote_average}` : ''}</div>
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

    const open = () => {
      // determine numeric tmdb id if available
      let tmdbId = null;
      if (movie.tmdb_id) tmdbId = Number(movie.tmdb_id);
      else if (movie.id && typeof movie.id === 'string' && movie.id.startsWith('tmdb:')) tmdbId = Number(movie.id.split(':')[1]);
      else if (!isNaN(Number(movie.id))) tmdbId = Number(movie.id);
      openDetailModal(tmdbId, card);
    };

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

    wrap.style.flex = '0 0 auto';
    wrap.style.boxSizing = 'border-box';
    wrap.dataset.skeleton = 'true';
    return wrap;
  }

  function showSkeletons(scroller, count = 6) {
    if (!scroller) return;
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
    prevBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'tmdb-arrow-btn';
    nextBtn.setAttribute('aria-label', `Mover ${title} derecha`);
    nextBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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

    // append any initial movies passed (assume they are already in mapped shape or TMDB raw)
    initialMovies.forEach(m => scroller.appendChild(createPosterCard(m)));

    // arrows behaviour
    const scrollAmount = () => Math.min(scroller.clientWidth, 560);

    prevBtn.addEventListener('click', () => {
      const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
      scroller.scrollBy({ left: -scrollAmount(), behavior });
    });
    nextBtn.addEventListener('click', () => {
      const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
      scroller.scrollBy({ left: scrollAmount(), behavior });
    });

    function updateArrows() {
      prevBtn.style.visibility = scroller.scrollLeft > 10 ? 'visible' : 'hidden';
      nextBtn.style.visibility = (scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft) > 10 ? 'visible' : 'hidden';
    }
    scroller.addEventListener('scroll', throttle(updateArrows, 100));
    window.addEventListener('resize', throttle(updateArrows, 200));
    setTimeout(updateArrows, 250);

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
        (newMovies || []).forEach(m => scroller.appendChild(createPosterCard(m)));
        updateArrows();
      } catch (err) {
        console.error('Error loadMore', err);
        if (typeof window.showToast === 'function') window.showToast('Error cargando más películas.', { duration: 5000 });
      } finally {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Cargar más';
      }
    });

    row.appendChild(scroller);
    row.appendChild(controlsRow);
    rowsContainer.appendChild(row);

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
      if (!tmdbId) {
        throw new Error('No TMDB id disponible para detalle');
      }
      const data = await window.TMDBApi.getMovieById(tmdbId);
      const poster = data.poster || (data.raw && data.raw.poster_path ? IMG_BASE + POSTER_SIZE + data.raw.poster_path : '../assets/placeholder.png');
      const html = `
        <div class="d-flex gap-3 flex-column flex-md-row">
          <img src="${poster}" alt="${escapeHtml(data.title)}" style="width:160px; height:240px; object-fit:cover; border-radius:6px"/>
          <div class="flex-fill">
            <h5>${escapeHtml(data.title)}</h5>
            <p class="mb-1"><strong>Año:</strong> ${data.release_date ? data.release_date.slice(0, 4) : '—'}</p>
            <p class="mb-1"><strong>Rating TMDB:</strong> ${data.vote_average ?? '—'}</p>
            <p class="mb-1"><strong>Géneros:</strong> ${(data.raw && data.raw.genres || []).map(g => g.name).join(', ')}</p>
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
            id: data.raw && data.raw.imdb_id ? data.raw.imdb_id : `tmdb:${data.tmdb_id || data.raw && data.raw.id}`,
            title: data.title || '',
            year: data.release_date ? data.release_date.slice(0, 4) : '',
            poster: poster,
            viewedAt: new Date().toISOString(),
            rating: null,
            note: '',
            sourceData: data.raw || data
          };
          try {
            const savedId = movie.id;
            const watched = typeof getWatched === 'function' ? getWatched() : [];
            watched.unshift(movie);
            if (typeof saveWatched === 'function') saveWatched(watched);
            if (typeof renderWatchedMovies === 'function') renderWatchedMovies();
            try { markBtn.blur(); } catch (e) { /* noop */ }

            if (modalInstance) {
              modalEl.addEventListener('hidden.bs.modal', function onHidden() {
                try {
                  if (window.innerWidth > 576) {
                    tryFocus(savedTrigger);
                    if (typeof window.showToast === 'function') {
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
                            } catch (e) { console.warn('Undo error', e); }
                          }
                        }
                      });
                    }
                  } else {
                    if (typeof window.showToast === 'function') {
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
                            } catch (e) { console.warn('Undo error', e); }
                          }
                        }
                      });
                    }
                  }
                } catch (e) {
                  console.warn('hidden.bs.modal handler error', e);
                } finally {
                  try { modalEl.removeEventListener('hidden.bs.modal', onHidden); } catch (_) { /* ignore */ }
                }
              }, { once: true });
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
        genres = [
          { id: 28, name: 'Acción' },
          { id: 35, name: 'Comedia' },
          { id: 10751, name: 'Familia' }
        ];
        genreCache.list = genres;
        genreCache.byId.set('28', { id: 28, name: 'Acción' });
        genreCache.byId.set('35', { id: 35, name: 'Comedia' });
        genreCache.byId.set('10751', { id: 10751, name: 'Familia' });
      }

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
            const data = await loadMoviesFor(key, async () => {
              const res = await window.TMDBApi.getPopular(page);
              return { results: res.results || [] };
            });
            return (data.results || []);
          }
        });
        (async () => {
          try {
            const first = await loadMoviesFor(`popular|1`, async () => {
              const res = await window.TMDBApi.getPopular(1);
              return { results: res.results || [] };
            });
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
            const data = await loadMoviesFor(key, async () => {
              const res = await window.TMDBApi._rawFetch('/movie/top_rated', { language: 'es-ES', page });
              return {
                results: (res.results || []).map(r => {
                  // normalize via TMDBApi mapping if possible
                  if (r && r.id) return { title: r.title || r.name, poster_path: r.poster_path, vote_average: r.vote_average, id: r.id, raw: r, tmdb_id: r.id };
                  return r;
                })
              };
            });
            return (data.results || []);
          }
        });
        (async () => {
          try {
            const first = await loadMoviesFor(`top_rated|1`, async () => {
              const res = await window.TMDBApi._rawFetch('/movie/top_rated', { language: 'es-ES', page: 1 });
              return { results: res.results || [] };
            });
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
        if (document.getElementById(`tmdb-row-${rowId}`)) return;
        let page = 0;
        const title = forcedTitle || `${genreCache.byId.get(String(gid))?.name || gid}`;
        const scroller = renderRow({
          id: rowId,
          title,
          initialMovies: [],
          loadMoreFn: async () => {
            page++;
            const key = `discover_genre_${gid}|${page}`;
            const data = await loadMoviesFor(key, async () => {
              const res = await window.TMDBApi.discoverByGenre(gid, page);
              return { results: res.results || [] };
            });
            return (data.results || []);
          }
        });
        try {
          const first = await loadMoviesFor(`discover_genre_${gid}|1`, async () => {
            const res = await window.TMDBApi.discoverByGenre(gid, 1);
            return { results: res.results || [] };
          });
          removeSkeletons(scroller);
          (first.results || []).forEach(m => scroller && scroller.appendChild(createPosterCard(m)));
        } catch (err) {
          console.error(`Initial load genre ${gid} failed`, err);
        }
      }

      await createGenreRow(28, 'Acción');
      await createGenreRow(35, 'Comedia');
      await createGenreRow(10751, 'Familia');

      window.createGenreRow = createGenreRow;

      // small improvements: compute original padding from computed style (not just inline)
      const originalBodyPaddingBottom = window.getComputedStyle(document.body).paddingBottom || '';

      function animateIn(el) {
        if (!el) return;
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

          if (container.querySelector(`[data-row="${rowId}"]`)) return;

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
              toastEl.style.visibility = 'visible';
              toastEl.style.opacity = '1';
              toastEl.style.zIndex = '200000';
              animateIn(toastEl);
            } catch (e) { /* ignore */ }
          });

          if (window.innerWidth <= 576 && !prefersReducedMotion()) {
            goBtn.focus({ preventScroll: true });
          }

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
        const duration = (typeof options.duration === 'number') ? options.duration : 5000;
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
        } catch (e) { /* ignore */ }

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

        requestAnimationFrame(() => {
          try {
            toastEl.style.visibility = 'visible';
            toastEl.style.opacity = '1';
            toastEl.style.transform = 'translateY(0)';
            toastEl.style.zIndex = '200000';
            toastEl.classList.add('is-visible');
          } catch (e) { /* ignore */ }
        });

        function safeRemove() {
          try {
            toastEl.classList.remove('is-visible');
            toastEl.classList.add('is-hiding');
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

      // hookup del select de géneros
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
          if (el) el.scrollIntoView({ behavior });
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
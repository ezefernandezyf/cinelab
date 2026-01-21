(function () {
  const cfg = window.TMDB_CONFIG || {};
  const API_BASE = cfg.API_BASE || 'https://api.themoviedb.org/3';
  const KEY = cfg.TMDB_KEY || '';

  function buildUrl(path, params = {}) {
    const url = new URL(API_BASE + path);
    url.searchParams.set('api_key', KEY);
    Object.keys(params).forEach(k => {
      if (params[k] != null) url.searchParams.set(k, params[k]);
    });
    return url.toString();
  }

  // tmdbFetch soporta opcionalmente signal para AbortController
  async function tmdbFetch(path, params = {}, options = {}) {
    if (!KEY) throw new Error('TMDB key missing. Set window.TMDB_CONFIG.TMDB_KEY in java/config.js (local only).');
    const url = buildUrl(path, params);
    const fetchOpts = {};
    if (options.signal) fetchOpts.signal = options.signal;
    const res = await fetch(url, fetchOpts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`TMDB fetch ${path} -> ${res.status}: ${text}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function mapMovie(tmdb) {
    return {
      id: `tmdb:${tmdb.id}`,
      tmdb_id: tmdb.id,
      title: tmdb.title || tmdb.name || '',
      year: tmdb.release_date ? String(tmdb.release_date).slice(0, 4) : (tmdb.first_air_date ? String(tmdb.first_air_date).slice(0, 4) : ''),
      poster: tmdb.poster_path ? ((cfg.IMG_BASE || '') + (cfg.POSTER_SIZE || 'w342') + tmdb.poster_path) : (tmdb.poster || ''),
      overview: tmdb.overview || '',
      vote_average: (typeof tmdb.vote_average !== 'undefined') ? tmdb.vote_average : null,
      release_date: tmdb.release_date || tmdb.first_air_date || null,
      raw: tmdb
    };
  }

  async function search(query, page = 1, options = {}) {
    if (!query) return { page: 1, results: [], total_pages: 0, total_results: 0 };
    const params = { query, language: 'es-ES', page };
    const data = await tmdbFetch('/search/movie', params, options);
    return {
      page: data.page || 1,
      total_results: data.total_results || 0,
      total_pages: data.total_pages || 0,
      results: (data.results || []).map(mapMovie)
    };
  }

  async function getMovieById(tmdbId, options = {}) {
    if (!tmdbId) throw new Error('getMovieById requires tmdbId');
    const data = await tmdbFetch(`/movie/${tmdbId}`, { language: 'es-ES' }, options);
    return mapMovie(data);
  }

  async function getPopular(page = 1, options = {}) {
    const data = await tmdbFetch('/movie/popular', { language: 'es-ES', page }, options);
    return {
      page: data.page || 1,
      results: (data.results || []).map(mapMovie),
      total_pages: data.total_pages || 0,
      total_results: data.total_results || 0
    };
  }

  async function discoverByGenre(gid, page = 1, options = {}) {
    const data = await tmdbFetch('/discover/movie', { with_genres: gid, language: 'es-ES', page, sort_by: 'popularity.desc' }, options);
    return {
      page: data.page || 1,
      results: (data.results || []).map(mapMovie),
      total_pages: data.total_pages || 0,
      total_results: data.total_results || 0
    };
  }

  // Buscar TMDB id por id externo (ej: imdb id "tt1234567")
  // Retorna el primer resultado mapeado o null.
  async function findByExternalId(externalId, externalSource = 'imdb_id', options = {}) {
    if (!externalId) return null;
    // path: /find/{external_id}?external_source=imdb_id
    const path = `/find/${externalId}`;
    const params = { external_source: externalSource };
    const data = await tmdbFetch(path, params, options);
    // data.movie_results is array
    const results = data.movie_results || data.tv_results || [];
    if (!results || results.length === 0) return null;
    return mapMovie(results[0]);
  }


  window.TMDBApi = {
    search,
    getMovieById,
    getPopular,
    discoverByGenre,
    findByExternalId,
    _rawFetch: tmdbFetch
  };
})();
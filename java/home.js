/* home.js
   Lógica del buscador, sugerencias y renderizado.
   Este archivo asume que common.js ya fue cargado (state, helpers de cache, debounce, etc).
*/

/* DOM */
const botonBuscar = document.getElementById('btnPelicula');
const resultados = document.getElementById('resultados');
const loader = document.getElementById('loader');
// historial DOM removed from home.js (moved to historial.js)
const inputBuscar = document.getElementById('buscarPelicula');
const modalError = document.getElementById('modalError') ? new bootstrap.Modal(document.getElementById('modalError')) : null;
const suggestionsLista = document.getElementById('sugerencias');

let suggestionsVisible = false;
let selectedIndex = -1;
let currentSuggestions = [];
const maxSuggestions = 6;

/* API key (ocupas reemplazar/gestionar según tu repo) */
const apikey = 'TU_OMDB_API_KEY_AQUI';

/* Inicialización segura de atributos/focus */
if (inputBuscar) {
    try { inputBuscar.focus(); } catch (e) { /* ignore */ }
    inputBuscar.setAttribute('aria-controls', 'sugerencias');
}

/* UI: loader / resultados / modal */
const activarLoader = () => {
    state.cargando = true;
    if (loader) loader.classList.replace('fondoLoader', 'loaderActivo');
    if (botonBuscar) botonBuscar.disabled = true;
    if (inputBuscar) inputBuscar.disabled = true;
};

const desactivarLoader = () => {
    state.cargando = false;
    if (loader) loader.classList.replace('loaderActivo', 'fondoLoader');
    if (botonBuscar) botonBuscar.disabled = false;
    if (inputBuscar) inputBuscar.disabled = false;
};

const mostrarResultados = (peliculaEncontrada) => {
    if (!resultados) return;

    resultados.innerHTML = '';
    resultados.classList.replace('d-none', 'd-block');

    const card = document.createElement('div');
    card.classList.add('card', 'mx-auto');
    card.style.width = '18rem';

    const placeHolderSrc = './assets/placeholder.png';
    const posterRaw = (peliculaEncontrada.Poster || '').trim();
    const posterSrc = (!posterRaw || posterRaw === 'N/A') ? placeHolderSrc : posterRaw;

    const imagen = document.createElement('img');
    imagen.classList.add('card-img-top', 'poster');
    imagen.loading = 'lazy';
    imagen.decoding = 'async';
    imagen.alt = `Poster de ${peliculaEncontrada.Title} la película`;
    imagen.src = posterSrc;

    imagen.onload = () => {
        imagen.style.opacity = '1';
    };

    imagen.onerror = () => {
        imagen.onerror = null;
        imagen.src = placeHolderSrc;
    };

    card.appendChild(imagen);

    const cardBody = document.createElement('div');
    cardBody.classList.add('card-body');

    const titulo = document.createElement('h5');
    titulo.classList.add('card-title');
    titulo.textContent = peliculaEncontrada.Title || 'Sin título';

    const descripcion = document.createElement('p');
    descripcion.classList.add('card-text');
    let raw = peliculaEncontrada.Year;
    let trimmedYear = raw ? String(raw).trim() : null;
    descripcion.textContent = `Año: ${trimmedYear || 'Año desconocido'}`;

    const btnWatched = document.createElement('button');
    btnWatched.classList.add('btn', 'btn-success', 'mt-2');
    btnWatched.textContent = 'Marcar como vista';
    btnWatched.setAttribute('type', 'button');
    btnWatched.setAttribute('aria-pressed', 'false')
    btnWatched.dataset.movie = JSON.stringify(peliculaEncontrada);
    btnWatched.dataset.action = 'mark-watched'

    btnWatched.addEventListener('click', handlerWatchedButton);

    const checkId = peliculaEncontrada.imdbID ? String(peliculaEncontrada.imdbID).trim() : `${String(peliculaEncontrada.Title || '').trim()}::${String(peliculaEncontrada.Year || '').trim()}`
    const index = getWatched().findIndex(i => i.id === checkId);
    if (index !== -1) {
        btnWatched.textContent = 'Ya vista';
        btnWatched.classList.replace('btn-success', 'btn-secondary');
        btnWatched.setAttribute('aria-pressed', 'true')
        btnWatched.setAttribute('disabled', 'true');
    }

    cardBody.appendChild(btnWatched);
    cardBody.appendChild(titulo);
    cardBody.appendChild(descripcion);

    card.appendChild(cardBody);

    resultados.appendChild(card);
};

/* Modal de error: usa bootstrap modal instanciado más arriba */
const errorModal = (tipoError) => {
    if (!modalError) return;
    const modalTitle = document.getElementById('modalErrorTitulo');
    const modalBody = document.getElementById('modalBody');

    switch (tipoError) {
        case 'inputVacio':
            modalTitle.textContent = 'Por favor, ingresa el título de una película.';
            modalBody.textContent = 'Escribe el nombre de una película antes de presionar “Buscar”.';
            break;
        case 'peliculaNoEncontrada':
            modalTitle.textContent = 'Película no encontrada';
            modalBody.textContent = 'No se encontraron resultados para el título ingresado. Prueba con otro nombre o revisa la ortografía.';
            break;
        case 'errorServidor':
            modalTitle.textContent = 'Error del servidor';
            modalBody.textContent = 'Ocurrió un problema al comunicarse con el servidor. Por favor, intente nuevamente en unos segundos.';
            break;
        case 'timeout':
            modalTitle.textContent = 'Tiempo de espera agotado';
            modalBody.textContent = 'La solicitud tardó demasiado en completarse. Por favor, verifica tu conexión a internet e intenta nuevamente.';
            break;
        case 'errorWatched':
            modalTitle.textContent = 'Error al marcar como vista';
            modalBody.textContent = 'Ocurrió un problema al intentar marcar la película como vista. Por favor, intente nuevamente.';
        default:
            modalTitle.textContent = 'Error desconocido';
            modalBody.textContent = 'Ocurrió un error que no pudimos identificar. Intente nuevamente.';
    }
    resultados.classList.replace('d-block', 'd-none');
    modalError.show();
};

/* LOGIC: búsqueda principal */
const buscarPelicula = () => {
    if (state.cargando) return;
    if (!inputBuscar) return;

    const peliBuscada = inputBuscar.value.trim();
    if (peliBuscada === '') {
        errorModal('inputVacio');
        if (resultados) resultados.innerHTML = '';
        return;
    }

    if (resultados) resultados.innerHTML = '';

    obtenerPeliculas(peliBuscada);
};

if (botonBuscar) botonBuscar.addEventListener('click', buscarPelicula);

const handlerWatchedButton = (event) => {
    event.preventDefault();
    const btn = event.target.closest('button');
    if (!btn || btn.type !== 'button') return;
    btn.disabled = true;

    let movie = null;
    if (btn.dataset && btn.dataset.movie) {
        try {
            movie = JSON.parse(btn.dataset.movie);
        } catch (e) {
            movie = null;
        }
    }

    if (!movie && typeof peliculaEncontrada !== 'undefined') {
        movie = peliculaEncontrada;
    }

    if (!movie) {
        console.error('handlerWatchedButton: no hay datos de la película disponibles.');
        btn.disabled = false;
        return;
    }

    if (btn.dataset.watched === 'true') {
        btn.disabled = true;
        return;
    }

    if (btn.textContent === 'Marcar como vista') {
        const imdbId = movie.imdbID ? String(movie.imdbID).trim() : '';
        const title = String(movie.Title || movie.title || '').trim();
        const year = String(movie.Year || movie.year || '').trim();
        const idWatched = imdbId || `${title}::${year}`;

        const posterRaw = movie.Poster || movie.poster || '';
        const posterWatched = (posterRaw && posterRaw !== 'N/A') ? String(posterRaw).trim() : './assets/placeholder.png';

        const watchedItem = {
            id: idWatched,
            title: title || idWatched,
            year: year,
            poster: posterWatched,
            viewedAt: new Date().toISOString(),
            rating: null,
            note: '',
            sourceData: movie
        };


        try {
            addWatched(watchedItem);

            btn.textContent = 'Ya vista';
            btn.classList.remove('btn-success');
            btn.classList.add('btn-secondary');
            btn.setAttribute('aria-pressed', 'true');
            btn.dataset.watched = 'true';
            btn.disabled = true;

            // update history storage, rendering handled in historial.js
            const nuevoHistorial = guardarEnHistorial(watchedItem.title);
            actualizarHistorialEnStorage(nuevoHistorial);
            state.historial = nuevoHistorial;
            state.busquedaActual = watchedItem.title;

        } catch (e) {
            console.error('Error guardando watchedItem:', e);

            btn.disabled = false;

            errorModal('errorWatched');
            return;
        }
    }
};

/* Teclado / navegación en sugerencias */
const keydownHandler = (event) => {
    if (event.key === 'Enter') {
        if (typeof buscarDebounced !== 'undefined' && buscarDebounced.cancel) buscarDebounced.cancel();
        buscarPelicula();
    }
    if (suggestionsVisible) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (selectedIndex === -1) {
                updateActiveIndex(0);
            } else {
                const next = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
                updateActiveIndex(next);
            }
        }
        else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (currentSuggestions.length === 0) return;
            if (selectedIndex === -1) {
                updateActiveIndex(currentSuggestions.length - 1);
            }
            else {
                const prev = Math.max(selectedIndex - 1, -1);
                updateActiveIndex(prev);
            }
        }
        else if (event.key === 'Enter') {
            event.preventDefault();
            if (selectedIndex >= 0) {
                if (currentSuggestions.length > 0) {
                    const title = currentSuggestions[selectedIndex].Title;
                    selectSuggestion(title);
                }
            }
            if (selectedIndex === -1) {
                if (typeof buscarDebounced !== 'undefined' && buscarDebounced.cancel) {
                    buscarDebounced.cancel();
                }
                buscarPelicula();
            }
        }
        else if (event.key === 'Escape') {
            event.preventDefault();
            ocultarSugerencias();
        }

    }
};

if (inputBuscar) inputBuscar.addEventListener('keydown', keydownHandler);

/* backgroundRefresh (usa isDifferent y saveToCache de common.js) */
async function backgroundRefresh(titulo, url, cached) {
    try {
        const respuestaBack = await fetch(url);
        if (!respuestaBack.ok) return;

        const dataBack = await respuestaBack.json();
        if (!dataBack || dataBack.Response === "False") return;

        if (state.busquedaActual !== titulo) return;

        if (isDifferent(cached, dataBack)) {
            saveToCache(titulo, dataBack);
            mostrarResultados(dataBack);

            state.historial = guardarEnHistorial(dataBack.Title || titulo);
            actualizarHistorialEnStorage(state.historial);
            state.busquedaActual = dataBack.Title || titulo;
            // rendering of historial moved to historial.js
        }
    } catch (e) {
        // ignore
    }
}

/* obtenerPeliculas (busqueda por título) */
const obtenerPeliculas = async (titulo) => {
    const tituloTrim = String(titulo || '').trim();
    if (!tituloTrim) {
        errorModal('inputVacio');
        return;
    }

    const tituloParaUrl = encodeURIComponent(tituloTrim);
    const url = `https://www.omdbapi.com/?apikey=${apikey}&t=${tituloParaUrl}`;

    const cached = getFromCache(tituloTrim);
    if (cached) {
        mostrarResultados(cached);
        state.historial = guardarEnHistorial(cached.Title || tituloTrim);
        actualizarHistorialEnStorage(state.historial);
        state.busquedaActual = tituloTrim;
        // rendering of historial moved to historial.js
        backgroundRefresh(tituloTrim, url, cached);
        return;
    }

    activarLoader();

    if (state.controlador) {
        state.controlador._manualAbort = true;
        state.controlador.abort();
    }
    const controller = new AbortController();
    controller._manualAbort = false;
    state.controlador = controller;

    const timeoutMs = 8000;
    const timeoutId = setTimeout(() => { controller.abort(); }, timeoutMs);

    try {
        const respuesta = await fetch(url, { signal: controller.signal });
        if (!respuesta.ok) {
            const err = new Error(`HTTP ${respuesta.status}`);
            err.type = 'errorServidor';
            err.status = respuesta.status;
            throw err;
        }
        const data = await respuesta.json();

        if (data.Response === "False") {
            const err = new Error(data.Error || 'Película no encontrada');
            err.type = 'peliculaNoEncontrada';
            throw err;
        }

        if (state.controlador && state.controlador !== controller) {
            return;
        }
        saveToCache(tituloTrim, data);

        mostrarResultados(data);
        state.historial = guardarEnHistorial(data.Title || tituloTrim);
        actualizarHistorialEnStorage(state.historial);
        state.busquedaActual = tituloTrim;
        // rendering of historial moved to historial.js

    } catch (error) {
        if (error.type === 'peliculaNoEncontrada') {
            errorModal('peliculaNoEncontrada');
        } else if (error.type === 'errorServidor') {
            errorModal('errorServidor');
            if (resultados) resultados.classList.replace('d-block', 'd-none');
        } else if (error.name === 'AbortError') {
            if (controller._manualAbort) {
                return;
            }
            error.type = 'timeout';
            errorModal('timeout');
            if (resultados) resultados.classList.replace('d-block', 'd-none');
        } else {
            errorModal('default');
            if (resultados) resultados.classList.replace('d-block', 'd-none');
        }
    } finally {
        clearTimeout(timeoutId);
        if (state.controlador === controller) {
            state.controlador = null;
        }
        desactivarLoader();
    }
};

/* Búsqueda automática y sugerencias (usa debounce de common.js) */
const handleDebounce = () => {
    if (!inputBuscar) return;
    const tituloTrim = inputBuscar.value.trim();
    if (tituloTrim.length < 4 || state.cargando) {
        return;
    }
    obtenerPeliculas(tituloTrim);
};

const hadleSuggestInput = async () => {
    if (!inputBuscar || !suggestionsLista) return;

    const term = inputBuscar.value.trim();
    const termTrim = String(term || '').trim();
    const termKey = termTrim.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();

    if (!sugerenciasCache.has(termKey)) {
        if (!suggestionsLista.querySelector('li.suggestion-loading')) {
            const li = document.createElement('li');
            li.setAttribute('role', 'option');
            li.setAttribute('aria-disabled', 'true');
            li.classList.add('suggestion-item', 'list-group-item', 'list-group-item-secondary', 'disabled', 'suggestion-loading');
            li.textContent = 'Cargando...';
            suggestionsLista.appendChild(li);
            suggestionsLista.classList.remove('d-none');
            suggestionsLista.setAttribute('aria-hidden', 'false');
            inputBuscar.setAttribute('aria-expanded', 'true');
            suggestionsVisible = true;
            inputBuscar.removeAttribute('aria-activedescendant');
            selectedIndex = -1;
        }
    }

    if (termKey.length < 2 || state.cargando) {
        renderSugerencias([], term);
        return;
    }

    const list = await obtenerSugerencias(termKey);
    renderSugerencias(list, term);
};

const suggestDebounced = debounce(hadleSuggestInput, 250);
const buscarDebounced = debounce(handleDebounce, 600);

if (inputBuscar) {
    inputBuscar.addEventListener('input', buscarDebounced);
    inputBuscar.addEventListener('input', suggestDebounced);
}

/* Click fuera para ocultar sugerencias y blur handling */
addEventListener('click', (event) => {
    const clicked = event.target;
    const insideList = clicked.closest && clicked.closest('#sugerencias') !== null;
    const onInput = clicked === inputBuscar || (clicked.closest && clicked.closest('#buscarPelicula') !== null);
    if (!insideList && !onInput) ocultarSugerencias();
});

if (inputBuscar && suggestionsLista) {
    inputBuscar.addEventListener('blur', () => {
        setTimeout(() => {
            if (document.activeElement !== inputBuscar && !suggestionsLista.contains(document.activeElement)) {
                ocultarSugerencias();
            }
        }, 150);
    });
}

/* Sugerencias: cache y fetch */
const sugerenciasCache = new Map();
let controladorSugerencia = null;

const obtenerSugerencias = async (term) => {
    const termTrim = String(term || '').trim();
    const termNormalized = termTrim.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
    const termKey = termNormalized;
    const termForUrl = encodeURIComponent(termNormalized);
    if (termTrim.length < 2) return [];
    if (sugerenciasCache.has(termKey)) {
        return sugerenciasCache.get(termKey);
    }
    if (controladorSugerencia) {
        controladorSugerencia.abort();
    }
    controladorSugerencia = new AbortController();
    const url = `https://www.omdbapi.com/?apikey=${apikey}&s=${termForUrl}`;
    try {
        const respuestaSugerencia = await fetch(url, { signal: controladorSugerencia.signal });
        if (!respuestaSugerencia.ok) {
            return [];
        }
        const dataSugerencia = await respuestaSugerencia.json();
        if (!dataSugerencia || dataSugerencia.Response === "False") {
            if (dataSugerencia.Error && dataSugerencia.Error.includes('Too many')) {
                return 'too-many';
            };
            if (dataSugerencia.Error === "Movie not found!") {
                return [];
            }
            return [];
        }

        const results = (dataSugerencia.Search || []).slice(0, 6);
        sugerenciasCache.set(termKey, results);
        if (sugerenciasCache.size > MAX_SUG_CACHE) {
            const firstKey = sugerenciasCache.keys().next().value;
            sugerenciasCache.delete(firstKey);
        }
        return results;

    } catch (e) {
        if (e.name === 'AbortError') {
            return [];
        }
        return [];
    }
    finally {
        controladorSugerencia = null;
    }
};

/* UI sugerencias y selección (con mejoras para accesibilidad) */
const ocultarSugerencias = () => {
    if (!suggestionsLista || !inputBuscar) return;

    if (document.activeElement && suggestionsLista.contains(document.activeElement)) {
        try {
            inputBuscar.focus();
        } catch (e) {

        }
    }

    suggestionsLista.classList.add('d-none');
    suggestionsLista.setAttribute('aria-hidden', 'true');
    inputBuscar.setAttribute('aria-expanded', 'false');
    suggestionsVisible = false;
    selectedIndex = -1;
    currentSuggestions = [];
    inputBuscar.removeAttribute('aria-activedescendant');
};

const selectSuggestion = (title) => {
    if (!inputBuscar) return;
    inputBuscar.value = title;
    if (typeof buscarDebounced !== 'undefined' && buscarDebounced.cancel) {
        buscarDebounced.cancel();
    };
    if (typeof suggestDebounced !== 'undefined' && suggestDebounced.cancel) {
        suggestDebounced.cancel();
    };
    ocultarSugerencias();
    obtenerPeliculas(title);
};

const updateActiveIndex = (newIndex) => {
    if (!suggestionsLista) return;

    suggestionsLista.setAttribute('aria-hidden', 'false');

    const itemsRaw = suggestionsLista.querySelectorAll('li.suggestion-item');
    const items = Array.from(itemsRaw).filter(i => i.getAttribute('data-selectable') !== 'false');

    if (items.length === 0) {
        selectedIndex = -1;
        return;
    }

    for (let i = 0; i < items.length; i++) {
        if (i === newIndex) {
            items[i].classList.add('active');
            items[i].setAttribute('aria-selected', 'true');

            try {
                items[i].scrollIntoView({ block: 'nearest' });
            } catch (e) {
                // ignore
            }

        } else {
            items[i].classList.remove('active');
            items[i].setAttribute('aria-selected', 'false');
        };
    }

    if (newIndex >= 0 && newIndex < items.length) {
        selectedIndex = newIndex;
        if (items[newIndex].id && inputBuscar) {
            inputBuscar.setAttribute('aria-activedescendant', items[newIndex].id);
        }
    } else {
        selectedIndex = -1;
        if (inputBuscar) inputBuscar.removeAttribute('aria-activedescendant');
    }
};

const renderSugerencias = (list, term) => {
    if (!inputBuscar || !suggestionsLista) return;

    if (inputBuscar.value.trim() !== term) {
        ocultarSugerencias();
        return;
    }

    suggestionsLista.innerHTML = '';

    if (!list || list.length === 0) {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-disabled', 'true');
        li.classList.add('suggestion-item', 'list-group-item', 'list-group-item-secondary', 'disabled');
        li.textContent = 'No se encontraron sugerencias.';
        li.setAttribute('aria-live', 'polite');
        li.setAttribute('data-selectable', 'false');
        suggestionsLista.appendChild(li);
        suggestionsLista.classList.remove('d-none');
        suggestionsLista.setAttribute('aria-hidden', 'false');
        inputBuscar.setAttribute('aria-expanded', 'true');
        suggestionsVisible = true;
        inputBuscar.removeAttribute('aria-activedescendant');
        selectedIndex = -1;
        return;
    }

    if (list === 'too-many') {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-disabled', 'true');
        li.classList.add('suggestion-item', 'list-group-item', 'list-group-item-secondary', 'disabled');
        li.textContent = 'Demasiadas coincidencias, por favor afina la búsqueda.';
        li.setAttribute('data-selectable', 'false');
        li.setAttribute('aria-live', 'polite');
        suggestionsLista.appendChild(li);

        suggestionsLista.classList.remove('d-none');
        suggestionsLista.setAttribute('aria-hidden', 'false');
        inputBuscar.setAttribute('aria-expanded', 'true');
        suggestionsVisible = true;
        inputBuscar.removeAttribute('aria-activedescendant');
        selectedIndex = -1;
        return;
    }

    currentSuggestions = list.slice(0, maxSuggestions);
    selectedIndex = -1;

    currentSuggestions.forEach((item, index) => {
        const li = document.createElement('li');
        li.classList.add('suggestion-item', 'list-group-item', 'list-group-item-action');
        li.tabIndex = -1;
        li.id = `suggestion-item-${index}`;
        li.dataset.title = item.Title;
        li.setAttribute('aria-selected', 'false');
        li.setAttribute('role', 'option');
        li.textContent = `${item.Title} (${item.Year || ''})`;
        li.addEventListener('click', () => selectSuggestion(item.Title));
        li.addEventListener('mousemove', () => updateActiveIndex(index));

        suggestionsLista.appendChild(li);
    });
    suggestionsLista.classList.remove('d-none');
    suggestionsLista.setAttribute('aria-hidden', 'false');
    inputBuscar.setAttribute('aria-expanded', 'true');
    suggestionsVisible = true;
    inputBuscar.removeAttribute('aria-activedescendant');
    selectedIndex = -1;
};

window.obtenerPeliculas = obtenerPeliculas;
window.buscarPelicula = buscarPelicula;

// Al cargar la página comprobamos si venimos desde historial con una búsqueda pendiente
document.addEventListener('DOMContentLoaded', () => {
    try {
        const pending = localStorage.getItem('tmdb.navigateSearch');
        if (!pending) return;
        // eliminamos la marca inmediatamente para evitar doble ejecución
        localStorage.removeItem('tmdb.navigateSearch');

        if (inputBuscar) {
            // rellenar input y ejecutar búsqueda
            inputBuscar.value = pending;
            // pequeño delay para asegurar que otros inits han terminado
            setTimeout(() => {
                try {
                    if (typeof window.obtenerPeliculas === 'function') {
                        window.obtenerPeliculas(pending);
                    } else if (typeof window.buscarPelicula === 'function') {
                        window.buscarPelicula();
                    } else {
                        // como fallback, intentar llamar la función local (si existe en scope)
                        try { obtenerPeliculas(pending); } catch (_) { /* ignore */ }
                    }
                } catch (e) {
                    console.warn('Error launching pending search', e);
                }
            }, 50);
        } else {
            // fallback: guardar en state para que otra lógica lo aproveche
            state.busquedaActual = pending;
        }
    } catch (e) {
        console.warn('checkNavigateSearch error', e);
    }
});
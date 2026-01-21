/* historial.js
   Lógica para renderizar y gestionar el historial de búsquedas.
   Depende de common.js para state, guardarEnHistorial, actualizarHistorialEnStorage, etc.
*/

(function () {
    const historialEl = document.getElementById('historial');
    if (!historialEl) return;

    // Renderiza el historial basado en state.historial (array de strings)
    function renderizarHistorial() {
        const historialStorage = state.historial || [];

        if (!historialEl) return;

        if (historialStorage.length > 0) {
            historialEl.innerHTML = '';
            historialEl.classList.remove('d-none');
            historialEl.classList.add('list-group', 'my-4');


            historialStorage.forEach(titulo => {
                const itemHistorial = document.createElement('button');
                itemHistorial.classList.add('list-group-item', 'list-group-item-action', 'lista');
                itemHistorial.textContent = titulo;
                itemHistorial.dataset.titulo = titulo;
                itemHistorial.type = 'button';
                if (titulo === state.busquedaActual) {
                    itemHistorial.classList.add('active');
                }
                historialEl.appendChild(itemHistorial);
            });

            const btnBorrarHistorial = document.createElement('button');
            btnBorrarHistorial.classList.add('btn', 'btn-danger');
            btnBorrarHistorial.textContent = 'Borrar Historial';
            btnBorrarHistorial.dataset.action = 'borrar-historial';

            const footerDiv = document.createElement('div');
            footerDiv.classList.add('d-flex', 'justify-content-end', 'p-3');
            footerDiv.appendChild(btnBorrarHistorial);
            historialEl.appendChild(footerDiv);

        } else {
            // ocultar el contenedor si está vacío
            historialEl.innerHTML = '';
            historialEl.classList.add('d-none');
        }
    }

    // Handler para clicks dentro del contenedor de historial
    function historialHandler(event) {
        if (state.cargando) return;
        if (!historialEl) return;

        const btn = event.target.closest('button');
        if (!btn || !historialEl.contains(btn)) return;

        if (btn.dataset.action === 'borrar-historial') {
            try {
                if (typeof actualizarHistorialEnStorage === 'function') {
                    actualizarHistorialEnStorage([]);
                } else {
                    localStorage.removeItem('historialBusquedas');
                }
            } catch (e) {
                try { localStorage.removeItem('historialBusquedas'); } catch (ee) { }
            }
            historialEl.innerHTML = '';
            state.historial = [];
            state.busquedaActual = null;
            historialEl.classList.add('d-none');
            return;
        }

        const titulo = (btn.dataset.titulo || btn.textContent).trim();
        if (!titulo) return;
        // Intentamos enviar al buscador en la página principal si existe; si no, solo hacemos una búsqueda local
        const inputOnPage = document.getElementById('buscarPelicula');
        if (inputOnPage) {
            inputOnPage.value = titulo;
            if (typeof window.buscarPelicula === 'function') {
                window.buscarPelicula();
            } else if (typeof window.obtenerPeliculas === 'function') {
                window.obtenerPeliculas(titulo);
            }
            return;
        }


        // En caso de que no haya buscador en esta página, simplemente actualizar state y (opcional) mostrar algo
        try {
            localStorage.setItem('tmdb.navigateSearch', titulo);
            // Navegar de forma robusta: intentar raíz relativa (index.html) y como fallback ../index.html
            const tryNavigate = () => {
                try {
                    window.location.href = '../index.html';
                } catch (e) {
                    try {
                        window.location.href = 'index.html';
                    } catch (ee) {
         
                        window.location.href = '/';
                    }
                }
            };
            tryNavigate();
        } catch (e) {
            state.busquedaActual = titulo;
        }
    }


    // Inicialización: attach listener y render inicial
    function init() {
        // Ensure state.historial is loaded (common.js should populate it on init)
        if (!Array.isArray(state.historial)) {
            // try load from localStorage fallback
            try {
                const raw = localStorage.getItem('historialBusquedas');
                state.historial = raw ? JSON.parse(raw) : [];
            } catch (e) {
                state.historial = [];
            }
        }

        renderizarHistorial();

        if (!historialEl._listenerAttached) {
            historialEl.addEventListener('click', historialHandler);
            historialEl._listenerAttached = true;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Exponer para depuración si hace falta
    window.renderizarHistorial = renderizarHistorial;

})();
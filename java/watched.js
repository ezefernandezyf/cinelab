(function setupWatchedHandlers() {
    const watchedList = document.getElementById('watched-movies');
    if (!watchedList) return;


    const detailsModalEl = document.getElementById('modalMovieDetails');
    const detailsModal = (typeof bootstrap !== 'undefined' && detailsModalEl) ? new bootstrap.Modal(detailsModalEl) : null;
    const detailsModalBody = detailsModalEl ? detailsModalEl.querySelector('.modal-body') : null;
    const detailsModalTitle = detailsModalEl ? detailsModalEl.querySelector('.modal-title') : null;

    const editModalEl = document.getElementById('modalEditWatched');
    const editModal = (typeof bootstrap !== 'undefined' && editModalEl) ? new bootstrap.Modal(editModalEl) : null;
    const editForm = editModalEl ? editModalEl.querySelector('#editWatchedForm') : null;
    const editRatingInput = editModalEl ? editModalEl.querySelector('#editRating') : null;
    const editNoteInput = editModalEl ? editModalEl.querySelector('#editNote') : null;
    const confirmDeleteModalEl = document.getElementById('confirmDeleteModal');
    const confirmDeleteModal = (typeof bootstrap !== 'undefined' && confirmDeleteModalEl) ? new bootstrap.Modal(confirmDeleteModalEl) : null;
    const confirmDeleteBtn = confirmDeleteModalEl ? confirmDeleteModalEl.querySelector('#confirmDeleteBtn') : null;
    const confirmDeleteTitleEl = confirmDeleteModalEl ? confirmDeleteModalEl.querySelector('.modal-title') : null;
    const confirmDeleteBodyEl = confirmDeleteModalEl ? confirmDeleteModalEl.querySelector('.modal-body') : null;

    const TOAST_UNDO_TIMEOUT = 6000;
    let pendingDeleteId = null;
    const OMDB_API_KEY = 'TU_API_KEY_AQUI';
    let activeDetailsMovieId = null;


    if (confirmDeleteBtn && !confirmDeleteBtn.dataset.handlerAttached) {
        confirmDeleteBtn.dataset.handlerAttached = 'true';
        confirmDeleteBtn.addEventListener('click', () => {
            if (!pendingDeleteId) {
                if (confirmDeleteModal) confirmDeleteModal.hide();
                return;
            }

            const movieToDelete = getWatched().find(m => m.id === pendingDeleteId);

            removeWatched(pendingDeleteId);

            if (confirmDeleteModal) confirmDeleteModal.hide();
            if (detailsModal) {
                try { detailsModal.hide(); } catch (e) { }
            }
            activeDetailsMovieId = null;

            renderWatchedMovies();

            if (movieToDelete) {
                showUndoToast(movieToDelete);
            }

            pendingDeleteId = null;
        });
    }

    function showUndoToast(movie) {
        const containerId = 'toastContainer';
        let container = document.getElementById(containerId);

        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            Object.assign(container.style, {
                position: 'fixed',
                bottom: '1rem',
                right: '1rem',
                display: 'flex',
                flexDirection: 'column-reverse',
                gap: '0.5rem',
                zIndex: String(2147483647), 
                pointerEvents: 'none' 
            });
            document.body.appendChild(container);
        }

        // helper para escapar texto (por seguridad)
        const escapeHtmlLocal = (str) => {
            return String(str || '').replace(/[&<>"'`=\/]/g, s => {
                const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;' };
                return map[s];
            });
        };

        const toastEl = document.createElement('div');
        Object.assign(toastEl.style, {
            background: '#222',
            color: '#fff',
            padding: '0.6rem 0.75rem',
            borderRadius: '0.5rem',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            minWidth: '260px',
            pointerEvents: 'auto' 
        });

        const textDiv = document.createElement('div');
        textDiv.style.flex = '1';
        textDiv.style.fontSize = '0.95rem';
        textDiv.textContent = `Película eliminada: ${escapeHtmlLocal(movie.title)}`;

        const undoBtn = document.createElement('button');
        undoBtn.type = 'button';
        undoBtn.textContent = 'Deshacer';
        Object.assign(undoBtn.style, {
            background: 'transparent',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
            padding: '0 0.25rem',
            fontSize: '0.9rem'
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
        toastEl.appendChild(undoBtn);
        toastEl.appendChild(closeBtn);
        container.appendChild(toastEl);


        const handleUndo = () => {
            try {
                const watched = getWatched();
                if (!watched.find(m => m.id === movie.id)) {
                    watched.push(movie);
                    saveWatched(watched);
                    renderWatchedMovies();
                }
            } catch (err) {
                console.error('Undo failed', err);
            } finally {
                cleanup();
            }
        };

        const cleanup = () => {
            try { toastEl.remove(); } catch (e) { /* ignore */ }
            // si el contenedor queda vacío, opcionalmente lo podés quitar
            if (container && container.children.length === 0) {
                try { container.remove(); } catch (e) { /* ignore */ }
            }
        };

        undoBtn.addEventListener('click', handleUndo);
        closeBtn.addEventListener('click', cleanup);

        // auto‑close (sin undo) tras TOAST_UNDO_TIMEOUT
        const timeoutId = setTimeout(() => {
            cleanup();
        }, TOAST_UNDO_TIMEOUT);

        // si el usuario pulsa undo o close, limpiamos el timeout
        const clearAll = () => clearTimeout(timeoutId);
        undoBtn.addEventListener('click', clearAll);
        closeBtn.addEventListener('click', clearAll);
    }





    const renderWatchedMovies = () => {

        const movies = getWatched();
        if (movies.length === 0) {
            watchedList.innerHTML = '<p class="text-light">No has marcado ninguna película como vista.</p>';
            watchedList.innerHTML += '<a href="index.html" class="btn btn-primary mt-3">Volver al buscador</a>';
            return;
        }
        watchedList.innerHTML = '';
        movies.forEach(movie => {
            const movieCard = document.createElement('div');
            movieCard.classList.add('watched-card', 'card', 'mx-auto', 'mb-3', 'd-flex', 'flex-column', 'shadow');
            movieCard.style.width = '19rem';

            const movieImagen = document.createElement('img');
            movieImagen.classList.add('card-img-top', 'poster', 'pt-3');
            movieImagen.loading = 'lazy';
            movieImagen.decoding = 'async';
            movieImagen.alt = `Poster de ${movie.Title} la película`;
            const posterSrc = (movie.poster && movie.poster !== 'N/A') ? String(movie.poster).trim() : '../assets/placeholder.png';
            movieImagen.src = posterSrc;

            movieImagen.onload = () => {
                movieImagen.style.opacity = '1';
            };

            movieImagen.onerror = () => {
                movieImagen.onerror = null;
                movieImagen.src = '../assets/placeholder.png';
            };


            const cardBody = document.createElement('div');
            cardBody.classList.add('card-body', 'flex-grow-1');

            const movieTitulo = document.createElement('h5');
            movieTitulo.classList.add('card-title', 'text-center', 'mt-2');
            movieTitulo.textContent = movie.title;

            const movieYear = document.createElement('p');
            movieYear.classList.add('card-text', 'text-center', 'mb-2');
            movieYear.textContent = `Año: ${movie.year}`;

            const viewedAt = document.createElement('p');
            viewedAt.classList.add('card-text', 'text-center', 'mb-2');
            const viewedDate = new Date(movie.viewedAt) ? new Date(movie.viewedAt) : 'Fecha desconocida';
            viewedAt.textContent = `Visto el: ${viewedDate.toLocaleDateString()}`;

            const cardFooter = document.createElement('div');
            cardFooter.classList.add('card-footer', 'mt-auto', 'd-flex', 'flex-wrap', 'justify-content-center', 'gap-2', 'p-3');


            const btnEliminar = document.createElement('button');
            btnEliminar.classList.add('btn', 'btn-danger');
            btnEliminar.textContent = 'Eliminar';
            btnEliminar.setAttribute('type', 'button');
            btnEliminar.setAttribute('aria-pressed', 'false')
            btnEliminar.dataset.id = movie.id;
            btnEliminar.setAttribute('aria-label', 'Eliminar ' + movie.title + ' de películas vistas');
            btnEliminar.setAttribute('data-action', 'delete');

            const btnEditar = document.createElement('button');
            btnEditar.classList.add('btn', 'btn-secondary');
            btnEditar.textContent = 'Editar';
            btnEditar.setAttribute('type', 'button');
            btnEditar.setAttribute('aria-pressed', 'false')
            btnEditar.dataset.id = movie.id;
            btnEditar.setAttribute('aria-label', 'Editar detalles de ' + movie.title);
            btnEditar.setAttribute('data-action', 'edit');

            const btnDetalles = document.createElement('button');
            btnDetalles.classList.add('btn', 'btn-primary');
            btnDetalles.textContent = 'Detalles';
            btnDetalles.setAttribute('type', 'button');
            btnDetalles.setAttribute('aria-pressed', 'false')
            btnDetalles.dataset.id = movie.id;
            btnDetalles.setAttribute('aria-label', `Ver detalles de ${movie.title}`);
            btnDetalles.setAttribute('data-action', 'details');

            cardBody.appendChild(movieTitulo);
            cardBody.appendChild(movieYear);
            cardBody.appendChild(viewedAt);

            cardFooter.appendChild(btnDetalles);
            cardFooter.appendChild(btnEditar);
            cardFooter.appendChild(btnEliminar);

            movieCard.appendChild(movieImagen);
            movieCard.appendChild(cardBody);
            movieCard.appendChild(cardFooter);

            watchedList.appendChild(movieCard);

        });
    };

    function watchedClickHandler(e) {
        e.preventDefault();
        const target = e.target.closest('button');
        if (!target) return;
        const action = target.getAttribute('data-action');
        const movieId = target.dataset.id;
        if (!action || !movieId) return;
        if (action === 'delete') {
            const movie = getWatched().find(m => m.id === movieId);
            if (!movie) return;
            pendingDeleteId = movieId;
            if (confirmDeleteTitleEl) confirmDeleteTitleEl.textContent = `Eliminar "${movie.title}"?`;
            if (confirmDeleteBodyEl) confirmDeleteBodyEl.textContent = '¿Estás seguro de que quieres eliminar esta película de tu lista de vistas?';
            if (confirmDeleteModal) confirmDeleteModal.show();
            return;

        }

        if (action === 'details') {
            const movie = getWatched().find(m => m.id === movieId);
            if (!movie) {
                alert('Película no encontrada en la lista de vistas.');
                return;
            }
            if (detailsModal && detailsModalBody && detailsModalTitle) {
                detailsModalTitle.textContent = movie.title || 'Detalles';
                detailsModalBody.innerHTML = '';
                let synopsis = '';

                if (movie.sourceData) { synopsis = movie.sourceData.Plot || movie.sourceData.plot || movie.sourceData.Overview || movie.sourceData.overview || ''; }
                synopsis = synopsis || movie.Plot || movie.plot || movie.overview || movie.summary || '';
                synopsis = (typeof synopsis === 'string') ? synopsis.trim() : '';
                const synopsisNormal = synopsis
                const maxPreviewLength = 300;
                let previewText = '';
                let needsTruncate = false;
                if (synopsis.length > 0) {
                    if (synopsis.length > maxPreviewLength) {
                        previewText = synopsis.slice(0, maxPreviewLength) + '…';
                        needsTruncate = true;
                    }
                    else {
                        previewText = synopsis;
                        needsTruncate = false;
                    }
                }

                const img = document.createElement('img');
                img.src = movie.poster || '../assets/placeholder.png';
                img.alt = `Poster de ${movie.title} la película`;
                img.style.width = '120px';
                img.style.height = '180px';
                img.style.objectFit = 'cover';
                img.setAttribute('draggable', 'false');

                img.onerror = () => {
                    img.onerror = null;
                    img.src = '../assets/placeholder.png';
                };

                const infoDiv = document.createElement('div');

                const tituloInfo = document.createElement('h5');
                tituloInfo.textContent = movie.title;

                const pInfo = document.createElement('p');
                pInfo.textContent = `Año: ${movie.year} \nVisto: ${movie.viewedAt ? new Date(movie.viewedAt).toLocaleDateString() : '—'}`;
                const pRating = document.createElement('p');
                pRating.textContent = `Rating: ${movie.rating == null ? '—' : movie.rating}`;
                const pNote = document.createElement('p');
                pNote.textContent = `Nota: ${movie.note || '—'}`;

                const synopsisSub = document.createElement('h6');
                synopsisSub.textContent = 'Sinopsis:';
                const synopsisP = document.createElement('p');
                synopsisP.textContent = previewText || 'No hay sinopsis disponible.';
                // --- reemplazar desde 'let moreLink;' hasta el append del enlace ---
                let moreLink;

                // decidir si creamos enlace:
                // - si needsTruncate === true => tenemos preview y queremos toggle
                // - else si no hay synopsis pero movie.id es imdb => creamos link para fetch-on-demand
                const isImdbId = typeof movie.id === 'string' && /^tt\d+$/i.test(movie.id);
                const shouldCreateLink = needsTruncate || (!synopsis && isImdbId);

                if (shouldCreateLink) {
                    moreLink = document.createElement('a');
                    moreLink.href = '#';
                    // texto inicial: si hay preview usamos "Leer más", si no hay sinopsis usamos "Leer sinopsis"
                    moreLink.textContent = needsTruncate ? ' Leer más' : ' Leer sinopsis';
                    moreLink.setAttribute('aria-label', `Leer más sobre la sinopsis de ${movie.title}`);
                    moreLink.dataset.expanded = 'false'; // 'true' cuando está expandido
                    moreLink.dataset.loading = 'false';
                    moreLink.classList.add('btn', 'btn-link', 'p-0');

                    // click handler combina toggle (si hay sinopsis) y fetch-on-demand (si no la hay)
                    moreLink.addEventListener('click', (event) => {
                        event.preventDefault();

                        // si ya estamos en proceso de carga, ignorar clicks
                        if (moreLink.dataset.loading === 'true') return;

                        // Caso A: ya tenemos sinopsis local -> toggle preview/full
                        if (synopsis && synopsis.length > 0) {
                            const expanded = moreLink.dataset.expanded === 'true';
                            if (!expanded) {
                                synopsisP.textContent = synopsis; // mostrar completa
                                moreLink.textContent = ' Mostrar menos';
                                moreLink.dataset.expanded = 'true';
                                moreLink.setAttribute('aria-label', `Mostrar menos sobre la sinopsis de ${movie.title}`);
                            } else {
                                synopsisP.textContent = previewText;
                                moreLink.textContent = ' Leer más';
                                moreLink.dataset.expanded = 'false';
                                moreLink.setAttribute('aria-label', `Leer más sobre la sinopsis de ${movie.title}`);
                            }
                            return;
                        }

                        // Caso B: no hay sinopsis local -> hacemos fetch on-demand (solo si es imdb id)
                        if (!isImdbId) {
                            // no podemos obtener sinopsis automáticamente
                            synopsisP.textContent = 'Sinopsis no disponible.';
                            moreLink.style.display = 'none';
                            return;
                        }

                        // UI: marcar loading
                        moreLink.dataset.loading = 'true';
                        moreLink.classList.add('disabled');
                        moreLink.setAttribute('aria-disabled', 'true');
                        moreLink.style.pointerEvents = 'none';
                        const prevText = synopsisP.textContent;
                        synopsisP.textContent = 'Cargando sinopsis…';

                        // llamar al helper (fetchSynopsis) que retorna Promise<string|null>
                        fetchSynopsis(movie.id)
                            .then((plot) => {
                                // si el modal ya cambió a otra película o se cerró, no actualizamos UI
                                if (activeDetailsMovieId !== movie.id || !detailsModalEl || !detailsModalEl.isConnected) return;

                                if (!plot) {
                                    // OMDb devolvió no disponible
                                    synopsisP.textContent = 'Sinopsis no disponible.';
                                    // guardado en cache ya fue hecho por fetchSynopsis (''), ocultamos el enlace
                                    moreLink.style.display = 'none';
                                    return;
                                }

                                // persistir en el objeto y en storage
                                movie.sourceData = movie.sourceData || {};
                                movie.sourceData.Plot = plot;
                                try {
                                    const existingPlot = movie.sourceData?.Plot?.trim() || '';
                                    if (plot && plot !== existingPlot) {
                                        const newSource = Object.assign({}, movie.sourceData || {}, { Plot: plot });
                                        updateWatched(movie.id, { sourceData: newSource });
                                    }
                                    updateWatched(movie.id, { sourceData: movie.sourceData });
                                } catch (err) {
                                    // si updateWatched lanza o re-renderiza inmediatamente, no fallamos aquí
                                    console.warn('updateWatched failed while persisting plot', err);
                                }

                                // actualizar variables locales y UI
                                synopsis = plot;
                                previewText = (plot.length > maxPreviewLength) ? (plot.slice(0, maxPreviewLength) + '…') : plot;
                                needsTruncate = plot.length > maxPreviewLength;

                                // Mostrar la sinopsis completa inmediatamente y ajustar el texto del enlace
                                synopsisP.textContent = plot;
                                if (needsTruncate) {
                                    moreLink.textContent = ' Mostrar menos';
                                    moreLink.dataset.expanded = 'true';
                                    moreLink.setAttribute('aria-label', `Mostrar menos sobre la sinopsis de ${movie.title}`);
                                } else {
                                    // si no hay truncado, podemos ocultar o cambiar el link; aquí lo ocultamos
                                    moreLink.style.display = 'none';
                                }
                            })
                            .catch((err) => {
                                console.error('Error fetching synopsis for', movie.id, err);
                                if (activeDetailsMovieId !== movie.id || !detailsModalEl || !detailsModalEl.isConnected) return;
                                synopsisP.textContent = 'Error al obtener sinopsis. Reintenta.';
                            })
                            .finally(() => {
                                // reactivar el enlace para permitir reintento (si decide mantenerse visible)
                                moreLink.dataset.loading = 'false';
                                moreLink.classList.remove('disabled');
                                moreLink.removeAttribute('aria-disabled');
                                moreLink.style.pointerEvents = '';
                            });
                    });
                }





                if (detailsModalEl && !detailsModalEl.dataset.detailsHandlerAttached) {
                    detailsModalEl.dataset.detailsHandlerAttached = 'true';
                    detailsModalEl.addEventListener('hidden.bs.modal', () => {
                        activeDetailsMovieId = null;
                    });
                }
                const modalActions = document.createElement('div');
                modalActions.classList.add('d-flex', 'gap-2', 'mt-2', 'justify-content-center');

                // Edit button
                const btnModalEdit = document.createElement('button');
                btnModalEdit.type = 'button';
                btnModalEdit.classList.add('btn', 'btn-secondary');
                btnModalEdit.textContent = 'Editar';
                btnModalEdit.dataset.action = 'edit';
                btnModalEdit.dataset.id = movie.id;
                btnModalEdit.setAttribute('aria-label', `Editar ${movie.title}`);

                // Delete button
                const btnModalDelete = document.createElement('button');
                btnModalDelete.type = 'button';
                btnModalDelete.classList.add('btn', 'btn-danger');
                btnModalDelete.textContent = 'Eliminar';
                btnModalDelete.dataset.action = 'delete';
                btnModalDelete.dataset.id = movie.id;
                btnModalDelete.setAttribute('aria-label', `Eliminar ${movie.title} de vistas`);

                modalActions.appendChild(btnModalEdit);
                modalActions.appendChild(btnModalDelete);



                infoDiv.appendChild(tituloInfo);
                infoDiv.appendChild(pInfo);
                infoDiv.appendChild(pRating);
                infoDiv.appendChild(pNote);
                infoDiv.appendChild(synopsisSub);
                infoDiv.appendChild(synopsisP);
                if (needsTruncate) infoDiv.appendChild(moreLink);
                infoDiv.appendChild(modalActions);
                

                const wrapper = document.createElement('div');
                wrapper.classList.add('d-flex', 'gap-3');
                wrapper.appendChild(img);
                wrapper.appendChild(infoDiv);

                detailsModalBody.appendChild(wrapper);
                activeDetailsMovieId = movie.id;
                detailsModal.show();


            } else {
                alert(`${movie.title} \nAño: ${movie.year} \nVisto: ${movie.viewedAt ? new Date(movie.viewedAt).toLocaleString() : '—'} \nRating: ${movie.rating == null ? '—' : movie.rating} \nNota: ${movie.note || '—'} `);
            }
            return;
        }
        if (action === 'edit') {
            const movie = getWatched().find(m => m.id === movieId);
            if (!movie) {
                alert('Película no encontrada en la lista de vistas.');
                return;
            }
            if (editModal && editForm && editRatingInput && editNoteInput) {
                editForm.dataset.id = movie.id;
                editRatingInput.value = movie.rating != null ? movie.rating : '';
                editNoteInput.value = movie.note || '';
                editModal.show();
            } else {
                const newRating = prompt('Introduce el nuevo rating (0-10):', movie.rating != null ? movie.rating : '');
                const newNote = prompt('Introduce la nueva nota:', movie.note || '');
                const patch = {};
                if (newRating !== null) patch.rating = newRating === '' ? null : Number(newRating);
                if (newNote !== null) patch.note = String(newNote || '');
                updateWatched(movie.id, patch);
                renderWatchedMovies();
            }

        }

    };

    const pendingSynopsisRequests = new Map();
    const synopsisCache = new Map();

    function fetchSynopsis(imdbID) {
        if (!imdbID) return Promise.resolve(null);

        if (synopsisCache.has(imdbID)) {
            const cached = synopsisCache.get(imdbID);
            return Promise.resolve(cached === '' ? null : cached);
        }

        if (pendingSynopsisRequests.has(imdbID)) {
            return pendingSynopsisRequests.get(imdbID);
        }

        const url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${imdbID}&plot=full`;
        const p = fetch(url)
            .then(response => {
                if (!response.ok) throw new Error('Network error');
                return response.json();
            })
            .then(data => {
                if (!data || data.Response === 'False' || !data.Plot || data.Plot === 'N/A') {

                    synopsisCache.set(imdbID, '');
                    return null;
                }
                const plot = String(data.Plot).trim();
                synopsisCache.set(imdbID, plot);
                return plot;
            })
            .catch(err => {

                console.error('fetchSynopsis error', err);
                throw err;
            })
            .finally(() => {
                pendingSynopsisRequests.delete(imdbID);
            });

        pendingSynopsisRequests.set(imdbID, p);
        return p;
    }



    function handleEditSubmit(e) {
        e.preventDefault();
        const id = editForm.dataset.id;
        if (!id) return;
        const ratingValue = editRatingInput.value;
        const noteValue = editNoteInput.value;
        const patch = {
            rating: ratingValue === '' ? null : Number(ratingValue),
            note: String(noteValue || '')
        };
        updateWatched(id, patch);
        editModal.hide();
        renderWatchedMovies();
    }

    function storageHandler(e) {
        if (e.key === WATCHED_KEY) {
            renderWatchedMovies();
        }
    }

    watchedList.addEventListener('click', watchedClickHandler);
    if (editForm) editForm.addEventListener('submit', handleEditSubmit);
    window.addEventListener('storage', storageHandler);
    if (detailsModalEl && !detailsModalEl.dataset.clickDelegation) {
        detailsModalEl.dataset.clickDelegation = 'true';
        detailsModalEl.addEventListener('click', watchedClickHandler);
    }

    renderWatchedMovies();
})();






// Finalmente, el lugar donde antes usabas confirm(...) (o cuando el usuario pulsa eliminar desde el modal),

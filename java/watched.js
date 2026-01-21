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
            if (container && container.children.length === 0) {
                try { container.remove(); } catch (e) { /* ignore */ }
            }
        };

        undoBtn.addEventListener('click', handleUndo);
        closeBtn.addEventListener('click', cleanup);

        const timeoutId = setTimeout(() => {
            cleanup();
        }, TOAST_UNDO_TIMEOUT);

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
            movieImagen.alt = `Poster de ${movie.Title || movie.title} la película`;
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
            const viewedDate = movie.viewedAt ? new Date(movie.viewedAt) : null;
            viewedAt.textContent = `Visto el: ${viewedDate ? viewedDate.toLocaleDateString() : 'Fecha desconocida'}`;

            const cardFooter = document.createElement('div');
            cardFooter.classList.add('card-footer', 'mt-auto', 'd-flex', 'flex-wrap', 'justify-content-center', 'gap-2', 'p-3');

            const btnEliminar = document.createElement('button');
            btnEliminar.classList.add('btn', 'btn-danger');
            btnEliminar.textContent = 'Eliminar';
            btnEliminar.setAttribute('type', 'button');
            btnEliminar.setAttribute('aria-pressed', 'false');
            btnEliminar.dataset.id = movie.id;
            btnEliminar.setAttribute('aria-label', 'Eliminar ' + movie.title + ' de películas vistas');
            btnEliminar.setAttribute('data-action', 'delete');

            const btnEditar = document.createElement('button');
            btnEditar.classList.add('btn', 'btn-secondary');
            btnEditar.textContent = 'Editar';
            btnEditar.setAttribute('type', 'button');
            btnEditar.setAttribute('aria-pressed', 'false');
            btnEditar.dataset.id = movie.id;
            btnEditar.setAttribute('aria-label', 'Editar detalles de ' + movie.title);
            btnEditar.setAttribute('data-action', 'edit');

            const btnDetalles = document.createElement('button');
            btnDetalles.classList.add('btn', 'btn-primary');
            btnDetalles.textContent = 'Detalles';
            btnDetalles.setAttribute('type', 'button');
            btnDetalles.setAttribute('aria-pressed', 'false');
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

                if (movie.sourceData) { synopsis = movie.sourceData.Plot || movie.sourceData.plot || movie.sourceData.Overview || movie.sourceData.overview || movie.sourceData.raw?.overview || ''; }
                synopsis = synopsis || movie.Plot || movie.plot || movie.overview || movie.summary || '';
                synopsis = (typeof synopsis === 'string') ? synopsis.trim() : '';
                const maxPreviewLength = 300;
                let previewText = '';
                let needsTruncate = false;
                if (synopsis.length > 0) {
                    if (synopsis.length > maxPreviewLength) {
                        previewText = synopsis.slice(0, maxPreviewLength) + '…';
                        needsTruncate = true;
                    } else {
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

                let moreLink;
                const isImdbId = typeof movie.id === 'string' && /^tt\d+$/i.test(movie.id);
                const isTmdbIdPrefixed = typeof movie.id === 'string' && movie.id.startsWith('tmdb:');
                const tmdbNumericId = isTmdbIdPrefixed ? Number(movie.id.split(':')[1]) : (Number(movie.id) || null);
                const shouldCreateLink = needsTruncate || (!synopsis && (isImdbId || isTmdbIdPrefixed || (tmdbNumericId && !isNaN(tmdbNumericId))));

                if (shouldCreateLink) {
                    moreLink = document.createElement('a');
                    moreLink.href = '#';
                    moreLink.textContent = needsTruncate ? ' Leer más' : ' Leer sinopsis';
                    moreLink.setAttribute('aria-label', `Leer más sobre la sinopsis de ${movie.title}`);
                    moreLink.dataset.expanded = 'false';
                    moreLink.dataset.loading = 'false';
                    moreLink.classList.add('btn', 'btn-link', 'p-0');

                    moreLink.addEventListener('click', (event) => {
                        event.preventDefault();
                        if (moreLink.dataset.loading === 'true') return;

                        if (synopsis && synopsis.length > 0) {
                            const expanded = moreLink.dataset.expanded === 'true';
                            if (!expanded) {
                                synopsisP.textContent = synopsis;
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

                        // Caso: no tenemos sinopsis -> fetch on demand usando TMDB
                        if (!window.TMDBApi || typeof window.TMDBApi.findByExternalId !== 'function') {
                            synopsisP.textContent = 'Sinopsis no disponible.';
                            moreLink.style.display = 'none';
                            return;
                        }

                        moreLink.dataset.loading = 'true';
                        moreLink.classList.add('disabled');
                        moreLink.setAttribute('aria-disabled', 'true');
                        moreLink.style.pointerEvents = 'none';
                        const prevText = synopsisP.textContent;
                        synopsisP.textContent = 'Cargando sinopsis…';

                        // Flow: si movie.id tiene formato tmdb:<id> -> getMovieById
                        // else if movie.id is an imdb id (ttxxxx) -> findByExternalId(imdb, 'imdb_id') -> getMovieById
                        const tryFetchSynopsis = async () => {
                            try {
                                let tmdbMovie = null;
                                if (isTmdbIdPrefixed && tmdbNumericId) {
                                    tmdbMovie = await window.TMDBApi.getMovieById(tmdbNumericId);
                                } else if (isImdbId) {
                                    // TMDB find endpoint
                                    tmdbMovie = await window.TMDBApi.findByExternalId(movie.id.replace(/^tt/i, ''), 'imdb_id');
                                    // note: findByExternalId implementation expects the external id without 'tt' or with it?
                                    // The TMDB find endpoint expects the external_id value, including the 'tt' prefix. We'll try with and without:
                                    if (!tmdbMovie) {
                                        tmdbMovie = await window.TMDBApi.findByExternalId(movie.id, 'imdb_id');
                                    }
                                } else if (tmdbNumericId) {
                                    tmdbMovie = await window.TMDBApi.getMovieById(tmdbNumericId);
                                }

                                if (!tmdbMovie || !tmdbMovie.overview) {
                                    synopsisP.textContent = 'Sinopsis no disponible.';
                                    moreLink.style.display = 'none';
                                    return;
                                }

                                const plot = String(tmdbMovie.overview).trim();
                                // persistir en movie.sourceData.Plot para no volver a fetch
                                movie.sourceData = movie.sourceData || {};
                                movie.sourceData.Plot = plot;

                                try {
                                    updateWatched(movie.id, { sourceData: movie.sourceData });
                                } catch (err) {
                                    console.warn('updateWatched failed while persisting plot', err);
                                }

                                synopsis = plot;
                                previewText = (plot.length > maxPreviewLength) ? (plot.slice(0, maxPreviewLength) + '…') : plot;
                                needsTruncate = plot.length > maxPreviewLength;

                                synopsisP.textContent = plot;
                                if (needsTruncate) {
                                    moreLink.textContent = ' Mostrar menos';
                                    moreLink.dataset.expanded = 'true';
                                    moreLink.setAttribute('aria-label', `Mostrar menos sobre la sinopsis de ${movie.title}`);
                                } else {
                                    moreLink.style.display = 'none';
                                }
                            } catch (err) {
                                console.error('Error fetching synopsis for', movie.id, err);
                                if (activeDetailsMovieId !== movie.id || !detailsModalEl || !detailsModalEl.isConnected) return;
                                synopsisP.textContent = 'Error al obtener sinopsis. Reintenta.';
                            } finally {
                                moreLink.dataset.loading = 'false';
                                moreLink.classList.remove('disabled');
                                moreLink.removeAttribute('aria-disabled');
                                moreLink.style.pointerEvents = '';
                            }
                        };

                        tryFetchSynopsis();
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

                const btnModalEdit = document.createElement('button');
                btnModalEdit.type = 'button';
                btnModalEdit.classList.add('btn', 'btn-secondary');
                btnModalEdit.textContent = 'Editar';
                btnModalEdit.dataset.action = 'edit';
                btnModalEdit.dataset.id = movie.id;
                btnModalEdit.setAttribute('aria-label', `Editar ${movie.title}`);

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
                if (shouldCreateLink && moreLink) infoDiv.appendChild(moreLink);
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
    }

    // pendingSynopsisRequests, synopsisCache kept if you need per-session cache:
    const pendingSynopsisRequests = new Map();
    const synopsisCache = new Map();

    // NOTE: fetchSynopsis now uses TMDBApi when possible (findByExternalId + getMovieById)
    function fetchSynopsis(externalId) {
        if (!externalId) return Promise.resolve(null);

        // cache key as provided id string
        if (synopsisCache.has(externalId)) {
            const cached = synopsisCache.get(externalId);
            return Promise.resolve(cached === '' ? null : cached);
        }

        if (pendingSynopsisRequests.has(externalId)) {
            return pendingSynopsisRequests.get(externalId);
        }

        const p = (async () => {
            try {
                // prefer using TMDBApi
                if (window.TMDBApi) {
                    // case: stored id may be "tmdb:1234" or "tt1234567" or plain numeric
                    let tmdbId = null;
                    if (typeof externalId === 'string' && externalId.startsWith('tmdb:')) {
                        tmdbId = Number(externalId.split(':')[1]);
                    } else if (typeof externalId === 'string' && /^tt\d+$/i.test(externalId)) {
                        // use findByExternalId with imdb id
                        try {
                            const found = await window.TMDBApi.findByExternalId(externalId, 'imdb_id');
                            if (found && found.tmdb_id) tmdbId = found.tmdb_id;
                        } catch (e) {
                            // try without trimming
                            try {
                                const found2 = await window.TMDBApi.findByExternalId(externalId.replace(/^tt/i, ''), 'imdb_id');
                                if (found2 && found2.tmdb_id) tmdbId = found2.tmdb_id;
                            } catch (e2) { /* ignore */ }
                        }
                    } else if (!isNaN(Number(externalId))) {
                        tmdbId = Number(externalId);
                    }

                    if (tmdbId) {
                        try {
                            const movie = await window.TMDBApi.getMovieById(tmdbId);
                            if (movie && movie.overview) {
                                synopsisCache.set(externalId, movie.overview);
                                return movie.overview;
                            } else {
                                synopsisCache.set(externalId, '');
                                return null;
                            }
                        } catch (err) {
                            console.warn('TMDB getMovieById failed for', tmdbId, err);
                            // continue to return null
                        }
                    }
                }

                // Fallback: no TMDB or no mapping -> return null
                synopsisCache.set(externalId, '');
                return null;
            } catch (err) {
                console.error('fetchSynopsis error', err);
                synopsisCache.set(externalId, '');
                return null;
            } finally {
                pendingSynopsisRequests.delete(externalId);
            }
        })();

        pendingSynopsisRequests.set(externalId, p);
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
# CineLab

[![Demo](https://img.shields.io/badge/demo-vercel-00ADEF)](https://cinelab-movies.vercel.app/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Topics](https://img.shields.io/badge/topics-cinema%20%7C%20movies-blueviolet)](#)

CineLab es un sitio web estático multipágina para buscar películas usando The Movie Database (TMDB).  
El proyecto no es una única SPA: contiene varias páginas HTML (index y secciones) que componen la experiencia.

Genera un archivo cliente `java/config.js` en tiempo de build con la API key (no se almacena en el repo).

## Contenido
- [Estado](#estado)
- [Demo & Capturas](#demo--capturas)
- [Estructura relevante](#estructura-relevante)
- [Desarrollo local](#desarrollo-local)
- [Despliegue en Vercel](#despliegue-en-vercel)
- [Probar / Depurar en producción](#probar--depurar-en-produccion)
- [Mejoras pendientes / TODO](#mejoras-pendientes--todo)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

---

## Estado
- Deploy: https://cinelab-movies.vercel.app/

## Demo & Capturas

Demo en Vercel: https://cinelab-movies.vercel.app

**GIF demostración** — búsqueda y marcado como vista:  
![Demo GIF](/assets/screenshots/demo-search.gif)

**Capturas**
- Desktop — Pantalla principal (home):  
  ![CineLab - home (desktop)](/assets/screenshots/home-desktop.png)

- Desktop — Sección "Películas vistas":  
  ![CineLab - películas vistas (desktop)](/assets/screenshots/watched-desktop.png)

- Mobile — Vista home (emulación móvil):  
  ![CineLab - home (mobile)](/assets/screenshots/home-mobile.png)

## Estructura relevante
- `index.html`, `sections/` — páginas HTML estáticas de la app.  
- `java/` — scripts JS servidos al cliente (`api.js`, `categories.js`, etc.).  
- `scripts/generate-config.js` — script que genera `java/config.js` durante el build.  
- `package.json` — contiene `postinstall` que ejecuta el script en CI / Vercel.  
- `.gitignore` — contiene `java/config.js` para evitar subir la key.

## Variables de entorno
- `TMDB_API_KEY` — clave pública de TMDB usada para las peticiones desde el cliente.

> NO incluir `java/config.js` en Git. El archivo se genera en el build usando `TMDB_API_KEY`.

---

## Quick start

1. Clona el repo:
```bash
git clone https://github.com/ezefernandezyf/cinelab.git
cd cinelab
```

2. (Opcional) Generar `java/config.js` localmente (Node):
```bash
# Unix / Git Bash
export TMDB_API_KEY="tu_api_key_aqui"
node scripts/generate-config.js

# PowerShell
# $env:TMDB_API_KEY="tu_api_key_aqui"
# node scripts/generate-config.js
```
> Esto crea `java/config.js` localmente (NO lo comitees). Luego abre `index.html` en un servidor estático.

3. Servir la carpeta localmente (sin Node):
```bash
python -m http.server 8080
# Abrir http://localhost:8080
```

---

## Despliegue en Vercel

1. Conecta el repositorio a Vercel.  
2. Añade la variable de entorno `TMDB_API_KEY` en Settings → Environment Variables (Production y Preview).  
3. (Opcional) En Settings → Build & Output:
   - Build Command: `npm install`
   - Output Directory: `.`  
   Esto asegura que `postinstall` se ejecute y `scripts/generate-config.js` genere `java/config.js`.  
4. Despliega la rama `master` o usa previews para ramas de feature.

---

## Probar / Depurar en producción

- Verificar `java/config.js`:
  - Abrí `https://TU-SITE.vercel.app/java/config.js` y confirmá `window.TMDB_CONFIG`.
- Prueba rápida desde la consola del navegador:
```javascript
// Ver config
window.TMDB_CONFIG

// Probar una llamada
fetch(`${window.TMDB_CONFIG.API_BASE}movie/popular?api_key=${window.TMDB_CONFIG.TMDB_KEY}`)
  .then(r => { console.log('status', r.status); return r.json(); })
  .then(j => console.log(j))
  .catch(e => console.error(e));
```

---

## Solución de problemas comunes

- `node: command not found`:
  - Instala Node (https://nodejs.org/) o deja que Vercel genere `java/config.js` durante el build.
- 404 desde TMDB:
  - Asegurate que `window.TMDB_CONFIG.API_BASE` no termine con `/`. Debe ser `https://api.themoviedb.org/3` (sin slash final) para evitar `//` en las URLs.
- App no muestra películas pero `java/config.js` existe:
  - Abrí DevTools → Console/Network y revisá errores y peticiones a TMDB.

---

## Mejoras pendientes / TODO
- Mejorar el diseño del estado vacío (cuando no hay películas vistas).
- (Opcional) Mover las llamadas a TMDB a un backend para ocultar la API key (si necesitás mayor seguridad).

---

## Contribuir
1. Fork y crea una rama feature: `git checkout -b feature/mi-mejora`  
2. Haz commits claros y push a tu fork.  
3. Abre PR contra `master` en este repo.

---

## Licencia

Este repositorio se publica bajo la licencia MIT. Ver archivo `LICENSE` para el texto completo.
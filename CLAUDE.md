# CLAUDE.md — sudoku-game

Jeu de Sudoku perso de Fred, **mobile-first**, en **HTML/CSS/JS pur** (aucun build, aucune
dépendance, aucun framework). Repo public `SilentspectreFr/sudoku-game`.

## Règle d'or déploiement
Site statique → une fois le repo lié à Netlify, **`git push origin main` = déploiement**.
(Netlify n'est PAS encore branché : étape ultérieure, Fred connecte le repo dans l'UI Netlify
puis le push déploiera. `netlify.toml` est déjà prêt avec `publish = "."`.)

## Lancer en local
Pas de modules ES → on peut ouvrir `index.html` directement. Sinon :
`python3 -m http.server 8000` puis http://localhost:8000

## Architecture
- `js/sudoku-engine.js` — moteur **pur** (DOM-free, testable en Node) : génération de grille
  complète, compteur de solutions (unicité), creusage, graduation de difficulté. C'est le cœur
  correct du jeu — toute modif ici se **re-teste** : `node -e "require('./js/sudoku-engine.js');
  console.table(SudokuEngine.selfTest())"`.
- `js/game.js` — état de partie + rendu + interactions (le gros du code UI).
- `js/main.js` — bootstrap + auto-test console.

## Conventions
- Pas d'ES modules (scripts `<script>` classiques) pour garder l'ouverture `file://` et un
  déploiement statique sans friction.
- Mobile-first : Pointer Events, cibles tactiles larges, viewport non-zoomable.
- Difficulté = nombre d'indices + résolubilité par « singles » (voir `DIFFICULTIES` dans le moteur).

## Hors périmètre (idées futures)
PWA/offline, undo fin, mode Killer, records persistés.

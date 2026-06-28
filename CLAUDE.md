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

## Pages
- `index.html` = **home** (Partie classique / Mode entraînement).
- `play.html` = la partie classique. `train.html` = le mode entraînement.

## Architecture
- `js/sudoku-engine.js` — moteur **pur** (DOM-free, testable en Node) : génération de grille
  complète, compteur de solutions (unicité), creusage, graduation de difficulté. C'est le cœur
  correct du jeu — toute modif ici se **re-teste** : `node -e "require('./js/sudoku-engine.js');
  console.table(SudokuEngine.selfTest())"`.
- `js/game.js` — partie classique : état + rendu + interactions (le gros du code UI).
- `js/main.js` — bootstrap du jeu + auto-test console.
- `js/techniques.js` — **moteur de TECHNIQUES** (PUR, testable en Node) : un détecteur par
  technique (full house, singles, paires/triplets nus & cachés, pointants… puis X-Wing/Y-Wing/
  Swordfish en vague 2) + génération d'exercices où la technique visée est le **prochain pas
  logique**. Toute modif d'un détecteur se **re-teste en Node** : générer N exercices et vérifier
  que chaque instance est **valide contre la solution** (placement = solution ; élimination ≠
  solution). NE JAMAIS livrer un détecteur sans cette validation.
- `js/trainer.js` — UI du mode entraînement (liste, plateau, indice/solution/explication).

## Mode entraînement — vagues
Vague 1 (faite) : 11 techniques de base jusqu'aux pointants. Vague 2 (à faire) : X-Wing, Y-Wing,
Swordfish (ajouter le détecteur + l'entrée `LESSONS` ; même discipline de test Node).

## Conventions
- Pas d'ES modules (scripts `<script>` classiques) pour garder l'ouverture `file://` et un
  déploiement statique sans friction.
- Mobile-first : Pointer Events, cibles tactiles larges, viewport non-zoomable.
- Difficulté = nombre d'indices + résolubilité par « singles » (voir `DIFFICULTIES` dans le moteur).

## Hors périmètre (idées futures)
PWA/offline, undo fin, mode Killer, records persistés.

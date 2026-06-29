# CLAUDE.md — sudoku-game

Jeu de Sudoku perso de Fred, **mobile-first**, en **HTML/CSS/JS pur** (aucun build, aucune
dépendance, aucun framework). Repo public `SilentspectreFr/sudoku-game`.

## Déploiement (EN PROD le 28/06)
- **URL live : https://sudoku-fred.netlify.app** (site Netlify `sudoku-fred`, équipe FLOWXIFY,
  compte `fjouvin`, project id `88126486-308d-4926-be4a-b81ebbbfb50c`).
- Déployé par **CLI Netlify en direct** (`netlify deploy --prod --dir .`), site statique,
  `publish = "."`. Le dossier `~/Dev/sudoku-game` est **lié** au site.
- ⚠️ **PAS d'auto-deploy GitHub** : un `git push` ne redéploie PAS tout seul. Pour publier une
  nouvelle version : `cd ~/Dev/sudoku-game && netlify deploy --prod --dir .`.
- Pour activer l'auto-deploy sur push : connecter le repo `SilentspectreFr/sudoku-game` dans
  l'UI Netlify (Site config → Build & deploy → link repository) — étape manuelle (OAuth GitHub).

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

## Mode entraînement — techniques
14 techniques couvertes : 11 de base (jusqu'aux pointants) + X-Wing / Y-Wing / Swordfish.
Pour en ajouter une : écrire le détecteur, l'ajouter à `SOLVERS` (avec son rang de difficulté) et
une entrée `LESSONS` ; puis **valider en Node** (générer N exercices, vérifier chaque instance
contre la solution). La génération déroule toute la résolution et capture la position où la
technique visée est le prochain pas logique (gère les techniques rares comme le Swordfish).

## Conventions
- Pas d'ES modules (scripts `<script>` classiques) pour garder l'ouverture `file://` et un
  déploiement statique sans friction.
- Mobile-first : Pointer Events, cibles tactiles larges, viewport non-zoomable.
- Difficulté = nombre d'indices + résolubilité par « singles » (voir `DIFFICULTIES` dans le moteur).

## Versioning (source unique) — IMPORTANT pour la maintenance
`js/version.js` définit **`APP_VERSION`** (semver `MAJOR.MINOR.PATCH`). C'est le **seul** endroit
à modifier pour publier. Ce numéro :
- s'**affiche** en pied de page (tout élément `[data-app-version]` est rempli par `version.js`) ;
- nomme le **cache du service worker** : `sw.js` fait `importScripts('./js/version.js')` et pose
  `CACHE = 'sudoku-v' + APP_VERSION`. Bumper la version **renomme le cache automatiquement** →
  les visiteurs reçoivent la nouvelle version. Plus de bump manuel du cache (l'ancien piège).

⚠️ **À chaque release qui change un fichier livré : bumper `APP_VERSION` dans `js/version.js`**,
puis déployer (`netlify deploy --prod --dir .`). C'est tout.

## PWA (installable + offline)
Le jeu est une **PWA** : `manifest.json` (lié dans les 3 pages), `sw.js` (service worker :
pré-cache du jeu, navigations en network-first, repli cache hors-ligne), icônes dans `icons/`.
Les icônes sont **générées en pur JS** par `node scripts/make-icons.js` (zéro dépendance, zlib).
Mise à jour côté visiteur = recharger / fermer-rouvrir la PWA (le SW s'actualise au lancement
suivant). iOS : installation manuelle via *Partager → Sur l'écran d'accueil* (pas de bannière auto).

## Hors périmètre (idées futures)
undo fin, mode Killer, records persistés.

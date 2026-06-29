# Sudoku

Jeu de Sudoku **mobile-first**, en HTML/CSS/JS pur — aucune dépendance, aucun build.

## Jouer en local

Le jeu n'utilise pas de modules ES : tu peux simplement **ouvrir `index.html`** dans le
navigateur. Pour un contexte identique à la prod (et éviter toute restriction `file://`) :

```bash
cd sudoku-game
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Fonctionnalités

- Génération de grilles **à solution unique** (backtracking + vérification d'unicité).
- 4 niveaux : **Facile / Moyen / Difficile / Expert** (pilotés par nombre d'indices +
  résolubilité par « singles »).
- Chronomètre avec pause, compteur d'erreurs (**game over à 3**), surlignage
  ligne / colonne / bloc et mise en évidence du même chiffre.
- **Deux façons de remplir** : sélectionner une case puis un chiffre, ou **appui long** sur un
  chiffre pour le verrouiller puis taper les cases.
- Outils : **Annuler** (retour en arrière multi-pas : restaure chiffres, notes *et* compteur
  d'erreurs), Gomme (mode), Crayon (annotations manuelles), **Auto** (remplit / efface toutes les
  annotations possibles), **Astuce**.
- **Astuce** (ampoule) : indice progressif réutilisant le moteur de techniques — nomme la
  technique la plus simple applicable, puis propose un coup concret à poser (toujours un placement
  jouable ; signale d'abord une erreur au plateau le cas échéant).
- Reprise de partie automatique (localStorage).

## Mode entraînement

Une page dédiée (`train.html`) enseigne les techniques de résolution : pour chaque technique,
un **exercice réel** est généré (le moteur de détection trouve une position où la technique est
le prochain pas logique), avec **indice**, **solution** et **explication**. Techniques couvertes
(14) : dernière case libre/restante, dernier chiffre possible, singletons nus/cachés,
paires/triplets nus et cachés, paires/triplets pointants, **X-Wing, Y-Wing, Swordfish**.

## Structure

```
index.html            home (Partie classique / Mode entraînement)
play.html             la partie classique
train.html            le mode entraînement
css/styles.css        styles mobile-first (partagés)
js/version.js         SOURCE UNIQUE de version (pied de page + nom du cache SW)
js/sudoku-engine.js   moteur pur (génération, unicité, difficulté) — testable en Node
js/game.js            partie classique : état, rendu, interactions, astuce, annulation
js/main.js            bootstrap du jeu + auto-test moteur (console)
js/techniques.js      moteur de TECHNIQUES (détecteurs + génération d'exercices) — testable en Node
js/trainer.js         mode entraînement : liste, exercices, indice/solution
manifest.json         manifeste PWA (installable)
sw.js                 service worker (offline + cache versionné)
icons/                icônes PWA (générées par scripts/make-icons.js)
scripts/make-icons.js génère les icônes en pur JS (zéro dépendance)
netlify.toml          publish = "."
```

## PWA & versioning

Le jeu est une **PWA** installable et jouable hors-ligne (manifeste + service worker qui
pré-cache le jeu). La **version** vit dans un seul fichier, `js/version.js` (`APP_VERSION`) :
elle s'affiche en pied de page **et** nomme le cache du service worker (`sudoku-v{APP_VERSION}`).
Pour publier une mise à jour : **bumper `APP_VERSION`** — le cache se renomme tout seul et les
visiteurs reçoivent la nouvelle version (plus de bump manuel à oublier).

## Tests (Node, sans dépendance)

```bash
npm test
```

Lance `test/run.js` : vérifie que chaque grille générée a une **solution unique** et que chaque
exercice de technique est **valide contre la solution** (placement = solution ; élimination ≠
solution). Exécuté automatiquement à chaque `push` via GitHub Actions (`.github/workflows/test.yml`).

Vérif rapide du moteur seul :

```bash
node -e "require('./js/sudoku-engine.js'); console.table(SudokuEngine.selfTest());"
```

## Déploiement

**En ligne : https://sudoku-fred.netlify.app**

Site statique déployé via la CLI Netlify (le dossier est lié au site `sudoku-fred`).
Pour publier une nouvelle version :

1. **bumper `APP_VERSION`** dans `js/version.js` (semver) ;
2. `netlify deploy --prod --dir .`.

*(L'auto-deploy sur `git push` n'est pas branché ; connecter le repo dans l'UI Netlify pour
l'activer.)*

## Licence

[MIT](LICENSE) © Frédéric Jouvin.

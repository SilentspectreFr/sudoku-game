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
- Outils : Recommencer (avec confirmation), Gomme (mode), Crayon (annotations),
  **Ampoule** (remplit / efface toutes les annotations possibles).
- Reprise de partie automatique (localStorage).

## Structure

```
index.html            structure de la page
css/styles.css        styles mobile-first
js/sudoku-engine.js   moteur pur (génération, unicité, difficulté) — testable en Node
js/game.js            état de partie, rendu, interactions
js/main.js            bootstrap + auto-test moteur (console)
netlify.toml          publish = "."
```

## Tester le moteur (Node)

```bash
node -e "require('./js/sudoku-engine.js'); console.table(SudokuEngine.selfTest());"
```

## Déploiement

Site statique. Une fois le repo lié à Netlify, **`git push origin main` = déploiement**.

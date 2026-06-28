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
js/sudoku-engine.js   moteur pur (génération, unicité, difficulté) — testable en Node
js/game.js            partie classique : état, rendu, interactions
js/main.js            bootstrap du jeu + auto-test moteur (console)
js/techniques.js      moteur de TECHNIQUES (détecteurs + génération d'exercices) — testable en Node
js/trainer.js         mode entraînement : liste, exercices, indice/solution
netlify.toml          publish = "."
```

## Tester le moteur (Node)

```bash
node -e "require('./js/sudoku-engine.js'); console.table(SudokuEngine.selfTest());"
```

## Déploiement

**En ligne : https://sudoku-fred.netlify.app**

Site statique déployé via la CLI Netlify (le dossier est lié au site `sudoku-fred`).
Pour publier une nouvelle version : `netlify deploy --prod --dir .`. *(L'auto-deploy sur
`git push` n'est pas branché ; connecter le repo dans l'UI Netlify pour l'activer.)*

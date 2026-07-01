/*
 * board.js — construction du plateau (81 cases) PARTAGÉE entre la partie
 * classique (game.js) et le mode entraînement (trainer.js). On ne fabrique ici
 * que la structure DOM ; chaque écran garde son propre rendu (logiques
 * volontairement séparées : jeu vs exercice pédagogique).
 */
(function (global) {
  'use strict';

  // Construit les 81 cases dans `container` (vidé au passage) et renvoie leur liste.
  // onTap(i) optionnel : branché au clic/tap de chaque case.
  function buildBoard(container, onTap) {
    container.innerHTML = '';
    const cells = [];
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.index = i;
      const col = i % 9, row = (i / 9) | 0;
      if (col % 3 === 2 && col !== 8) cell.classList.add('b-right');
      if (row % 3 === 2 && row !== 8) cell.classList.add('b-bottom');

      const val = document.createElement('span');
      val.className = 'cell-value';
      cell.appendChild(val);

      const notes = document.createElement('span');
      notes.className = 'cell-notes';
      for (let n = 1; n <= 9; n++) {
        const sp = document.createElement('span');
        sp.className = 'note';
        sp.dataset.n = n;
        notes.appendChild(sp);
      }
      cell.appendChild(notes);

      if (onTap) cell.addEventListener('click', () => onTap(i));
      cell.addEventListener('contextmenu', (e) => e.preventDefault());
      container.appendChild(cell);
      cells.push(cell);
    }
    return cells;
  }

  global.SudokuBoard = { buildBoard };
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * game.js — état de partie, rendu et interactions (contrôleur).
 * Dépend de SudokuEngine (sudoku-engine.js) chargé avant.
 * Aucun module ES : on expose `Game` sur window.
 */
(function (global) {
  'use strict';

  const E = global.SudokuEngine;
  const STORAGE_KEY = 'sudoku-game:v1';
  const MAX_ERRORS = 3;

  // ---- État -----------------------------------------------------------------
  const state = {
    solution: [],
    givens: [],          // 81 : valeur d'indice (0 si vide à l'origine)
    values: [],          // 81 : saisies joueur (0 si vide)
    notes: [],           // 81 : tableau de Set<number>
    difficulty: 'facile',
    selectedCell: null,
    selectedNumber: null, // chiffre mis en évidence
    lockedNumber: null,   // mode verrou (appui long)
    pencil: false,
    eraser: false,
    autoNotes: false,
    errors: 0,
    seconds: 0,
    paused: false,
    status: 'playing',    // playing | won | lost
  };

  let els = {};          // références DOM (rempli par bind)
  let cellEls = [];      // 81 éléments de cellule
  let timerId = null;
  let confirmCb = null;  // callback du modal de confirmation

  // ---- Helpers --------------------------------------------------------------
  const valueAt = (i) => state.givens[i] || state.values[i];
  const isGiven = (i) => state.givens[i] !== 0;
  const rowOf = (i) => (i / 9) | 0;
  const colOf = (i) => i % 9;
  const boxOf = (i) => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);

  function fmtTime(s) {
    const m = (s / 60) | 0, sec = s % 60;
    return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }

  // ---- Cycle de vie de la partie -------------------------------------------
  function newGame(difficulty) {
    difficulty = difficulty || state.difficulty;
    showLoading(true);
    // setTimeout(0) pour laisser le navigateur peindre l'overlay avant de générer.
    setTimeout(() => {
      const { puzzle, solution } = E.generatePuzzle(difficulty);
      state.solution = solution;
      state.givens = puzzle.slice();
      state.values = new Array(81).fill(0);
      state.notes = Array.from({ length: 81 }, () => new Set());
      state.difficulty = difficulty;
      state.selectedCell = null;
      state.selectedNumber = null;
      state.lockedNumber = null;
      state.pencil = false;
      state.eraser = false;
      state.autoNotes = false;
      state.errors = 0;
      state.seconds = 0;
      state.paused = false;
      state.status = 'playing';
      hideOverlay();
      showLoading(false);
      startTimer();
      render();
      save();
    }, 30);
  }

  function restart() {
    state.values = new Array(81).fill(0);
    state.notes = Array.from({ length: 81 }, () => new Set());
    state.errors = 0;
    state.autoNotes = false;
    state.eraser = false;
    state.pencil = false;
    state.lockedNumber = null;
    state.selectedCell = null;
    state.selectedNumber = null;
    state.status = 'playing';
    state.paused = false;
    hideOverlay();
    startTimer();
    render();
    save();
  }

  // ---- Saisie ---------------------------------------------------------------
  function selectCell(i) {
    if (state.status !== 'playing' || state.paused) return;
    state.selectedCell = i;

    if (state.eraser) { eraseCell(i); return; }
    if (state.lockedNumber) { applyDigit(i, state.lockedNumber); return; }

    // Sélection simple : le surlignage suit la valeur de la case.
    state.selectedNumber = valueAt(i) || state.selectedNumber;
    render();
  }

  function eraseCell(i) {
    if (isGiven(i)) { render(); return; }
    state.values[i] = 0;
    state.notes[i].clear();
    render();
    save();
  }

  // Appui court sur un chiffre du pavé.
  function tapNumber(d) {
    if (state.status !== 'playing' || state.paused) return;

    if (state.lockedNumber === d) {            // re-tap = déverrouille
      state.lockedNumber = null;
      state.selectedNumber = d;
      render();
      return;
    }

    state.selectedNumber = d;

    // Méthode "case -> chiffre" : une case est sélectionnée et modifiable.
    if (state.selectedCell != null && !isGiven(state.selectedCell) && !state.eraser) {
      applyDigit(state.selectedCell, d);
      return;
    }
    render();
  }

  // Appui long sur un chiffre = mode verrou.
  function lockNumber(d) {
    if (state.status !== 'playing' || state.paused) return;
    state.eraser = false;
    state.lockedNumber = d;
    state.selectedNumber = d;
    render();
    if (navigator.vibrate) navigator.vibrate(25);
  }

  // Écriture effective dans une case (valeur ou annotation selon le mode crayon).
  function applyDigit(i, d) {
    if (isGiven(i)) return;
    state.selectedCell = i;

    if (state.pencil) {
      if (state.values[i] !== 0) return;       // pas d'annotation sur une case remplie
      if (state.notes[i].has(d)) state.notes[i].delete(d);
      else state.notes[i].add(d);
      render();
      save();
      return;
    }

    // Mode valeur
    if (state.values[i] === d) {               // re-poser la même valeur = effacer
      state.values[i] = 0;
      render();
      save();
      return;
    }

    const wasWrong = state.values[i] !== 0 && state.values[i] !== state.solution[i];
    state.values[i] = d;
    state.notes[i].clear();

    if (d === state.solution[i]) {
      // nettoyage des annotations de ce chiffre chez les pairs
      forEachPeer(i, (p) => state.notes[p].delete(d));
    } else if (!wasWrong) {
      // nouvelle erreur (on ne recompte pas une case déjà fausse)
      state.errors++;
      if (state.errors >= MAX_ERRORS) { render(); save(); gameLost(); return; }
    }

    render();
    save();
    if (isComplete()) gameWon();
  }

  function forEachPeer(i, fn) {
    const r = rowOf(i), c = colOf(i), br = r - (r % 3), bc = c - (c % 3);
    for (let k = 0; k < 9; k++) { fn(r * 9 + k); fn(k * 9 + c); }
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) fn((br + dr) * 9 + bc + dc);
  }

  function isComplete() {
    for (let i = 0; i < 81; i++) if (valueAt(i) !== state.solution[i]) return false;
    return true;
  }

  // ---- Outils (barre du bas) -----------------------------------------------
  function toggleEraser() {
    state.eraser = !state.eraser;
    if (state.eraser) state.lockedNumber = null;
    render();
  }

  function togglePencil() {
    state.pencil = !state.pencil;
    render();
  }

  // Ampoule : remplit toutes les annotations possibles, ou les efface si déjà actif.
  function toggleAutoNotes() {
    if (state.autoNotes) {
      for (let i = 0; i < 81; i++) state.notes[i].clear();
      state.autoNotes = false;
    } else {
      for (let i = 0; i < 81; i++) {
        if (valueAt(i)) { state.notes[i].clear(); continue; }
        const cm = E.candMask(buildWorkingGrid(), i);
        const set = new Set();
        for (let d = 1; d <= 9; d++) if (cm & (1 << (d - 1))) set.add(d);
        state.notes[i] = set;
      }
      state.autoNotes = true;
    }
    render();
    save();
  }

  // Grille "de travail" = indices + saisies correctes (les fausses comptent comme vides
  // pour le calcul des candidats, sinon une erreur fausserait toutes les annotations).
  function buildWorkingGrid() {
    const g = new Array(81);
    for (let i = 0; i < 81; i++) {
      const v = state.givens[i] || state.values[i];
      g[i] = (state.givens[i] || (state.values[i] && state.values[i] === state.solution[i])) ? v : 0;
    }
    return g;
  }

  // ---- Fin de partie --------------------------------------------------------
  function gameWon() {
    state.status = 'won';
    stopTimer();
    showOverlay('won', 'Gagné&nbsp;!', 'Terminé en ' + fmtTime(state.seconds) + ' · ' + diffLabel());
    save();
  }

  function gameLost() {
    state.status = 'lost';
    stopTimer();
    showOverlay('lost', 'Partie perdue', '3 erreurs atteintes. On réessaie&nbsp;?');
    save();
  }

  function diffLabel() {
    return (E.DIFFICULTIES[state.difficulty] || E.DIFFICULTIES.facile).label;
  }

  // ---- Chrono ---------------------------------------------------------------
  function startTimer() {
    stopTimer();
    if (state.status !== 'playing' || state.paused) return;
    timerId = setInterval(() => {
      state.seconds++;
      if (els.time) els.time.textContent = fmtTime(state.seconds);
      if (state.seconds % 5 === 0) save();
    }, 1000);
  }

  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function togglePause() {
    if (state.status !== 'playing') return;
    state.paused = !state.paused;
    if (state.paused) {
      stopTimer();
      showOverlay('pause', 'Pause', 'Le temps est suspendu.');
    } else {
      hideOverlay();
      startTimer();
    }
    render();
  }

  // ---- Persistance ----------------------------------------------------------
  function save() {
    try {
      const data = {
        solution: state.solution,
        givens: state.givens,
        values: state.values,
        notes: state.notes.map((s) => [...s]),
        difficulty: state.difficulty,
        errors: state.errors,
        seconds: state.seconds,
        autoNotes: state.autoNotes,
        status: state.status,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* stockage indisponible : on ignore */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d.solution || d.solution.length !== 81) return false;
      state.solution = d.solution;
      state.givens = d.givens;
      state.values = d.values;
      state.notes = d.notes.map((a) => new Set(a));
      state.difficulty = d.difficulty || 'facile';
      state.errors = d.errors || 0;
      state.seconds = d.seconds || 0;
      state.autoNotes = !!d.autoNotes;
      state.status = d.status || 'playing';
      state.paused = false;
      return true;
    } catch (e) { return false; }
  }

  // ---- Rendu ----------------------------------------------------------------
  function buildBoard() {
    els.board.innerHTML = '';
    cellEls = [];
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.dataset.index = i;
      if (colOf(i) % 3 === 2 && colOf(i) !== 8) cell.classList.add('b-right');
      if (rowOf(i) % 3 === 2 && rowOf(i) !== 8) cell.classList.add('b-bottom');

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

      cell.addEventListener('click', () => selectCell(i));
      cell.addEventListener('contextmenu', (e) => e.preventDefault());
      els.board.appendChild(cell);
      cellEls.push(cell);
    }
  }

  function render() {
    const active = state.lockedNumber || state.selectedNumber ||
      (state.selectedCell != null ? valueAt(state.selectedCell) : null);
    const sel = state.selectedCell;

    for (let i = 0; i < 81; i++) {
      const cell = cellEls[i];
      const v = valueAt(i);
      const valEl = cell.firstChild;
      const notesEl = cell.lastChild;

      // valeur / annotations
      if (v) {
        valEl.textContent = v;
        notesEl.style.display = 'none';
      } else {
        valEl.textContent = '';
        notesEl.style.display = '';
        const set = state.notes[i];
        for (const sp of notesEl.children) {
          const n = +sp.dataset.n;
          const has = set.has(n);
          sp.textContent = has ? n : '';
          // chiffre actif (sélectionné/verrouillé) mis en évidence dans les annotations
          sp.classList.toggle('hl', has && active != null && n === active);
        }
      }

      // classes d'état
      cell.classList.toggle('given', isGiven(i));
      cell.classList.toggle('user', !isGiven(i) && state.values[i] !== 0);
      const wrong = !isGiven(i) && state.values[i] !== 0 && state.values[i] !== state.solution[i];
      cell.classList.toggle('error', wrong);

      // surlignages
      cell.classList.toggle('selected', i === sel);
      const inUnit = sel != null && i !== sel &&
        (rowOf(i) === rowOf(sel) || colOf(i) === colOf(sel) || boxOf(i) === boxOf(sel));
      cell.classList.toggle('hl-unit', inUnit);
      cell.classList.toggle('hl-same', active != null && v === active && v !== 0);
    }

    // pavé numérique : compteur de chiffres restants + état verrou
    for (const btn of els.numBtns) {
      const d = +btn.dataset.d;
      const placed = countPlaced(d);
      btn.classList.toggle('locked', state.lockedNumber === d);
      btn.classList.toggle('done', placed >= 9);
    }

    // outils
    els.toolErase.classList.toggle('active', state.eraser);
    els.toolPencil.classList.toggle('active', state.pencil);
    els.pencilBadge.textContent = state.pencil ? 'ON' : 'OFF';
    els.toolBulb.classList.toggle('active', state.autoNotes);

    // entête
    els.errors.textContent = state.errors + '/' + MAX_ERRORS;
    els.time.textContent = fmtTime(state.seconds);
    els.diffValue.textContent = diffLabel();
    els.pauseBtn.textContent = state.paused ? '▶' : '❚❚';
  }

  function countPlaced(d) {
    let n = 0;
    for (let i = 0; i < 81; i++) {
      const v = valueAt(i);
      if (v === d && (isGiven(i) || state.values[i] === state.solution[i])) n++;
    }
    return n;
  }

  // ---- Overlays / modal / loading ------------------------------------------
  function showOverlay(kind, title, sub) {
    els.overlay.hidden = false;
    els.overlay.dataset.kind = kind;
    els.overlayTitle.innerHTML = title;
    els.overlaySub.innerHTML = sub || '';
    els.overlayResume.hidden = kind !== 'pause';
    els.overlayRestart.hidden = kind === 'pause';
    els.overlayNew.hidden = kind === 'pause';
  }
  function hideOverlay() { els.overlay.hidden = true; }
  function showLoading(on) { if (els.loading) els.loading.hidden = !on; }

  function askConfirm(message, cb) {
    els.modalText.textContent = message;
    els.modal.hidden = false;
    confirmCb = cb;
  }
  function closeConfirm(ok) {
    els.modal.hidden = true;
    const cb = confirmCb; confirmCb = null;
    if (ok && cb) cb();
  }

  // Une partie "entamée" : au moins une saisie joueur.
  function inProgress() {
    return state.status === 'playing' && state.values.some((v) => v !== 0);
  }

  // ---- Câblage initial ------------------------------------------------------
  function bind() {
    els = {
      board: document.getElementById('board'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlaySub: document.getElementById('overlay-sub'),
      overlayResume: document.getElementById('overlay-resume'),
      overlayRestart: document.getElementById('overlay-restart'),
      overlayNew: document.getElementById('overlay-new'),
      loading: document.getElementById('loading'),
      errors: document.getElementById('errors-value'),
      time: document.getElementById('time-value'),
      diffValue: document.getElementById('difficulty-value'),
      diffBtn: document.getElementById('difficulty-btn'),
      diffMenu: document.getElementById('difficulty-menu'),
      pauseBtn: document.getElementById('pause-btn'),
      newGameBtn: document.getElementById('new-game'),
      toolRestart: document.getElementById('tool-restart'),
      toolErase: document.getElementById('tool-erase'),
      toolPencil: document.getElementById('tool-pencil'),
      toolBulb: document.getElementById('tool-bulb'),
      pencilBadge: document.getElementById('pencil-badge'),
      numpad: document.getElementById('numpad'),
      modal: document.getElementById('modal'),
      modalText: document.getElementById('modal-text'),
      modalOk: document.getElementById('modal-ok'),
      modalCancel: document.getElementById('modal-cancel'),
    };
    els.numBtns = Array.from(els.numpad.querySelectorAll('.num'));

    buildBoard();

    // Pavé numérique : appui court vs appui long.
    for (const btn of els.numBtns) {
      const d = +btn.dataset.d;
      let timer = null, longFired = false;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        longFired = false;
        timer = setTimeout(() => { longFired = true; lockNumber(d); }, 450);
      });
      const end = () => { if (timer) { clearTimeout(timer); timer = null; } };
      btn.addEventListener('pointerup', () => { end(); if (!longFired) tapNumber(d); });
      btn.addEventListener('pointerleave', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Outils
    els.toolRestart.addEventListener('click', () => {
      if (!inProgress()) { restart(); return; }
      askConfirm('Recommencer la partie ? Toutes tes saisies seront effacées.', restart);
    });
    els.toolErase.addEventListener('click', toggleEraser);
    els.toolPencil.addEventListener('click', togglePencil);
    els.toolBulb.addEventListener('click', toggleAutoNotes);

    // Pause
    els.pauseBtn.addEventListener('click', togglePause);

    // Nouvelle partie
    els.newGameBtn.addEventListener('click', () => {
      if (inProgress()) askConfirm('Démarrer une nouvelle partie ?', () => newGame());
      else newGame();
    });

    // Menu difficulté
    els.diffBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      els.diffMenu.hidden = !els.diffMenu.hidden;
    });
    for (const li of els.diffMenu.querySelectorAll('[data-diff]')) {
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        els.diffMenu.hidden = true;
        const diff = li.dataset.diff;
        if (diff === state.difficulty && !inProgress() && state.status === 'playing') return;
        if (inProgress()) askConfirm('Changer de difficulté lance une nouvelle partie. Continuer ?', () => newGame(diff));
        else newGame(diff);
      });
    }
    document.addEventListener('click', () => { els.diffMenu.hidden = true; });

    // Modal de confirmation
    els.modalOk.addEventListener('click', () => closeConfirm(true));
    els.modalCancel.addEventListener('click', () => closeConfirm(false));

    // Overlay (pause / fin)
    els.overlayResume.addEventListener('click', togglePause);
    els.overlayRestart.addEventListener('click', restart);
    els.overlayNew.addEventListener('click', () => newGame());

    // Clavier (pratique sur desktop)
    document.addEventListener('keydown', (e) => {
      if (e.key >= '1' && e.key <= '9') tapNumber(+e.key);
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (state.selectedCell != null) eraseCell(state.selectedCell);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        moveSelection(e.key); e.preventDefault();
      }
    });
  }

  function moveSelection(key) {
    let i = state.selectedCell == null ? 0 : state.selectedCell;
    let r = rowOf(i), c = colOf(i);
    if (key === 'ArrowUp') r = (r + 8) % 9;
    if (key === 'ArrowDown') r = (r + 1) % 9;
    if (key === 'ArrowLeft') c = (c + 8) % 9;
    if (key === 'ArrowRight') c = (c + 1) % 9;
    selectCell(r * 9 + c);
  }

  function init() {
    bind();
    if (load()) {
      render();
      if (state.status === 'playing') startTimer();
      else if (state.status === 'won') showOverlay('won', 'Gagné&nbsp;!', 'Partie terminée · ' + diffLabel());
      else if (state.status === 'lost') showOverlay('lost', 'Partie perdue', 'On réessaie&nbsp;?');
    } else {
      newGame('facile');
    }
  }

  global.Game = { init, newGame, _state: state };
})(typeof window !== 'undefined' ? window : globalThis);

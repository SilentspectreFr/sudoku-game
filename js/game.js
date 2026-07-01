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
  let hint = { data: null, phase: 0 };  // astuce en cours (éphémère, non persisté)
  const history = [];                   // pile d'annulation (snapshots, éphémère)
  const HISTORY_MAX = 80;

  // ---- Helpers --------------------------------------------------------------
  const valueAt = (i) => state.givens[i] || state.values[i];
  const isGiven = (i) => state.givens[i] !== 0;
  // une saisie joueur CORRECTE se verrouille comme un indice (ni modifiable ni effaçable) ;
  // une saisie fausse reste modifiable pour pouvoir se corriger.
  const isCorrect = (i) => state.values[i] !== 0 && state.values[i] === state.solution[i];
  const isLocked = (i) => isGiven(i) || isCorrect(i);
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
      // Génération bornée à l'arsenal de techniques (jamais d'impasse « Indice direct »).
      // Repli sur le moteur seul si techniques.js n'est pas chargé (robustesse file://).
      const { puzzle, solution } = (global.SudokuTech && global.SudokuTech.generatePuzzleGraded)
        ? global.SudokuTech.generatePuzzleGraded(difficulty)
        : E.generatePuzzle(difficulty);
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
      dismissHint();
      clearHistory();
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
    dismissHint();
    clearHistory();
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
    dismissHint();
    if (isLocked(i)) { render(); return; }
    if (state.values[i] === 0 && state.notes[i].size === 0) { render(); return; }
    pushHistory();
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
    if (state.selectedCell != null && !isLocked(state.selectedCell) && !state.eraser) {
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
    dismissHint();
    if (isLocked(i)) return;
    state.selectedCell = i;

    if (state.pencil) {
      if (state.values[i] !== 0) return;       // pas d'annotation sur une case remplie
      pushHistory();
      if (state.notes[i].has(d)) state.notes[i].delete(d);
      else state.notes[i].add(d);
      render();
      save();
      return;
    }

    // Mode valeur
    if (state.values[i] === d) {               // re-poser la même valeur = effacer
      pushHistory();
      state.values[i] = 0;
      render();
      save();
      return;
    }

    pushHistory();
    const wasWrong = state.values[i] !== 0 && state.values[i] !== state.solution[i];
    state.values[i] = d;
    state.notes[i].clear();

    if (d === state.solution[i]) {
      // nettoyage pratique : on retire ce chiffre des annotations des pairs (jamais une
      // perte de travail : ce chiffre y est devenu impossible). On NE recalcule PAS tout,
      // pour préserver les candidats que le joueur a barrés à la main.
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

  // ---- Annulation (retour en arrière) --------------------------------------
  // Snapshot de tout ce qu'un coup peut modifier : valeurs, notes, erreurs…
  function snapshot() {
    return {
      values: state.values.slice(),
      notes: state.notes.map((s) => [...s]),
      errors: state.errors,
      status: state.status,
      autoNotes: state.autoNotes,
      selectedCell: state.selectedCell,
    };
  }
  // À appeler AVANT toute mutation annulable (pose, effacement, notes auto).
  function pushHistory() {
    history.push(snapshot());
    if (history.length > HISTORY_MAX) history.shift();
    updateUndoBtn();
  }
  function clearHistory() { history.length = 0; updateUndoBtn(); }
  function updateUndoBtn() {
    if (els.toolUndo) els.toolUndo.disabled = history.length === 0;
  }
  function undo() {
    if (!history.length) return;
    dismissHint();
    const s = history.pop();
    state.values = s.values.slice();
    state.notes = s.notes.map((a) => new Set(a));
    state.errors = s.errors;
    state.autoNotes = s.autoNotes;
    state.selectedCell = s.selectedCell;
    state.status = s.status;
    if (state.status === 'playing') {           // annuler une fin de partie réactive le jeu
      hideOverlay();
      if (!state.paused && !timerId) startTimer();
    }
    render();
    save();
    updateUndoBtn();
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

  // Remplit toutes les annotations = vrais candidats du plateau, UNE SEULE FOIS.
  // C'est un coup de pouce de départ : ensuite le bouton est grisé et le joueur reste
  // maître de ses notes (ses ratures à la main ne sont jamais écrasées). L'astuce, elle,
  // tient compte des candidats déjà barrés (voir nextHint).
  function toggleAutoNotes() {
    if (state.autoNotes) return;                 // déjà utilisé : bouton grisé, sans effet
    pushHistory();
    const g = buildWorkingGrid();
    for (let i = 0; i < 81; i++) {
      if (valueAt(i)) { state.notes[i].clear(); continue; }
      const cm = E.candMask(g, i);
      const set = new Set();
      for (let d = 1; d <= 9; d++) if (cm & (1 << (d - 1))) set.add(d);
      state.notes[i] = set;
    }
    state.autoNotes = true;
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

  // ---- Astuce (moteur de techniques) ---------------------------------------
  // Libellé "LxCy" d'une case (réutilise le moteur de techniques, repli local).
  function cellLabel(i) {
    const T = global.SudokuTech;
    return (T && T.cellName) ? T.cellName(i) : ('L' + (rowOf(i) + 1) + 'C' + (colOf(i) + 1));
  }

  // Leçon du catalogue associée à une donnée d'astuce (cas particulier du
  // singleton caché : la leçon dépend du scope, boîte vs global).
  function lessonFor(data) {
    const T = global.SudokuTech;
    if (!T || !T.LESSON_BY_ID) return null;
    if (data.technique === 'hiddenSingle') {
      return data.scope === 'box' ? T.LESSON_BY_ID.lastRemaining : T.LESSON_BY_ID.hiddenSingle;
    }
    return T.LESSON_BY_ID[data.technique] || null;
  }

  // Titre lisible d'une technique ; cas particulier du singleton caché (boîte vs global).
  function hintTitle(data) {
    if (data.technique === 'hiddenSingle') {
      return data.scope === 'box' ? 'Dernière case restante' : 'Singleton caché';
    }
    const lesson = lessonFor(data);
    return (lesson && lesson.title) || 'Technique logique';
  }

  // Une élimination est « déjà faite » par le joueur si, pour CHAQUE case visée qui porte
  // des annotations, le chiffre à retirer en est déjà absent (il l'a barré à la main, ou
  // un placement l'a nettoyé). On exige au moins une case annotée, sinon le joueur ne
  // suit pas ses notes et on ne saute rien.
  function eliminationAlreadyDone(elims) {
    let sawNotes = false;
    for (const e of elims) {
      const notes = state.notes[e.cell];
      if (!notes || notes.size === 0) continue;   // case sans notes : on ne peut rien déduire
      sawNotes = true;
      if (notes.has(e.digit)) return false;        // ce candidat est encore là -> pas fait
    }
    return sawNotes;
  }

  // Renvoie le PROCHAIN pas logique réel, en tenant compte de la progression du joueur :
  // les éliminations qu'il a DÉJÀ faites dans ses notes sont avalées en silence, pour lui
  // montrer la première étape NOUVELLE (placement OU élimination pas encore faite). Les
  // explications restent vraies (calculées sur les vrais candidats du plateau).
  function nextHint() {
    const T = global.SudokuTech;
    if (!T) return null;
    const g = buildWorkingGrid();
    const cands = T.computeCands(g);
    for (let guard = 0; guard < 200; guard++) {
      const inst = T.solveFull(g, cands);
      if (!inst) return null;
      if (inst.placements && inst.placements.length) {
        const p = inst.placements[0];
        if (p.digit !== state.solution[p.cell]) return null;   // garde-fou anti-bug détecteur
        return { kind: 'place', cell: p.cell, digit: p.digit, highlight: inst.highlight,
                 technique: inst.technique, scope: inst.scope, explain: inst.explain };
      }
      // garde-fou : une élimination ne doit jamais viser le vrai chiffre de la case.
      for (const e of inst.eliminations) if (state.solution[e.cell] === e.digit) return null;
      if (eliminationAlreadyDone(inst.eliminations)) {
        T.applyInstance(g, cands, inst);           // déjà fait par le joueur -> on avance
        continue;
      }
      const cells = (inst.highlight && inst.highlight.cells) ? inst.highlight.cells.slice() : [];
      return { kind: 'eliminate', technique: inst.technique, scope: inst.scope, highlight: inst.highlight,
               explain: inst.explain, eliminations: inst.eliminations.slice(),
               cells, cell: cells.length ? cells[0] : inst.eliminations[0].cell };
    }
    return null;
  }

  // Première case fausse posée par le joueur (hors indices), ou null.
  function findMistake() {
    for (let i = 0; i < 81; i++) {
      if (state.givens[i] === 0 && state.values[i] !== 0 && state.values[i] !== state.solution[i]) return i;
    }
    return null;
  }

  // Repli quand aucune technique connue ne s'applique : un placement sûr depuis la solution.
  function fallbackPlacement() {
    for (let i = 0; i < 81; i++) {
      if (!state.givens[i] && !state.values[i]) return { cell: i, digit: state.solution[i] };
    }
    return null;
  }

  // Entrée de l'astuce (clic sur l'ampoule).
  function showHint() {
    if (state.status !== 'playing' || state.paused) return;

    // 1) Une erreur au plateau fausse tout : on la signale d'abord.
    const m = findMistake();
    if (m != null) {
      state.eraser = false; state.lockedNumber = null;
      selectCell(m);
      hint = { data: { kind: 'mistake', cell: m }, phase: 1 };
      renderHintPanel();
      return;
    }

    // 2) Prochain pas logique réel (placement ou élimination) sur le plateau actuel.
    const data = nextHint();
    if (data) { hint = { data, phase: 1 }; render(); renderHintPanel(); return; }

    // 3) Repli : indice direct depuis la solution.
    const fb = fallbackPlacement();
    if (fb) {
      state.eraser = false; state.lockedNumber = null;
      hint = { data: { kind: 'direct', cell: fb.cell, digit: fb.digit }, phase: 2 };
      selectCell(fb.cell);                   // rend la grille avec l'aperçu du chiffre
      renderHintPanel();
      return;
    }

    hint = { data: { kind: 'none' }, phase: 1 };
    renderHintPanel();
  }

  // Passe de la phase 1 (nom) à la phase 2 (solution concrète + surlignage).
  function revealHint() {
    if (!hint.data || (hint.data.kind !== 'place' && hint.data.kind !== 'eliminate')) return;
    hint.phase = 2;
    state.eraser = false; state.lockedNumber = null;
    if (hint.data.cell != null) selectCell(hint.data.cell);
    renderHintPanel();
  }

  // Pose le chiffre proposé (placement ou indice direct), sans compter d'erreur.
  function placeHint() {
    const d = hint.data;
    if (!d || (d.kind !== 'place' && d.kind !== 'direct')) return;
    const cell = d.cell, digit = d.digit;
    if (digit !== state.solution[cell]) return;            // garde-fou
    state.eraser = false; state.lockedNumber = null; state.pencil = false;
    selectCell(cell);
    applyDigit(cell, digit);                               // dismissHint() en tête : ferme le panneau
  }

  function dismissHint() {
    hint = { data: null, phase: 0 };
    if (els.hintPanel) els.hintPanel.hidden = true;
  }

  function renderHintPanel() {
    const d = hint.data;
    if (!d || !els.hintPanel) return;
    let html = '', showMore = false, showPlace = false;

    if (d.kind === 'mistake') {
      html = '<strong>Erreur —</strong> tu as une erreur en <strong>' + cellLabel(d.cell) +
             '</strong>. Corrige-la d\'abord, puis redemande une astuce.';
    } else if (d.kind === 'none') {
      html = '<strong>Astuce —</strong> la grille est déjà complète.';
    } else if (d.kind === 'direct') {
      html = '<strong>Indice direct —</strong> aucune technique simple ne s\'applique ici. ' +
             'Place le <strong>' + d.digit + '</strong> en <strong>' + cellLabel(d.cell) + '</strong>.';
      showPlace = true;
    } else if (hint.phase === 1) {            // phase 1 : mini-leçon (définition) sans la réponse
      const lesson = lessonFor(d);
      html = '<strong>Technique — ' + hintTitle(d) + '.</strong> ' +
             (lesson ? lesson.summary + ' ' : '') +
             '<br><span class="hint-sub">Cherche-la sur la grille, ou touche « Voir la solution » pour voir où elle s\'applique ici.</span>';
      showMore = true;
    } else if (d.kind === 'place') {          // phase 2 : placement concret
      html = '<strong>' + hintTitle(d) + ' —</strong> ' + (d.explain || '') +
             '<br><span class="hint-sub">Place le <strong>' + d.digit + '</strong> en <strong>' +
             cellLabel(d.cell) + '</strong>.</span>';
      showPlace = true;
    } else {                                  // phase 2 : élimination (rien à poser encore)
      const what = d.eliminations.map((e) => 'le ' + e.digit + ' en ' + cellLabel(e.cell)).join(', ');
      html = '<strong>' + hintTitle(d) + ' —</strong> ' + (d.explain || '') +
             '<br><span class="hint-sub">Pas de chiffre à poser ici : retire ' + what +
             ' de tes notes — c\'est exactement ce que la technique démontre — puis redemande une astuce pour la suite.</span>';
    }

    els.hintBody.innerHTML = html;
    els.hintMore.hidden = !showMore;
    els.hintPlace.hidden = !showPlace;
    els.hintPanel.hidden = false;
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
  // Surligne l'astuce SUR la grille (phase « Voir la solution ») : cases-clés du motif
  // en contour ambre, candidats du motif en badge ambre, candidats à retirer barrés en
  // rouge, et aperçu vert du chiffre à poser. Réutilise le langage visuel de l'entraînement.
  function applyHintHighlight() {
    // purge des classes propres à l'astuce (non gérées par la boucle de rendu)
    for (let i = 0; i < 81; i++) {
      const cell = cellEls[i];
      cell.classList.remove('base', 'hl-line', 'hint-place');
      for (const sp of cell.lastChild.children) sp.classList.remove('elim');
    }
    const d = hint.data;
    if (!d || hint.phase !== 2) return;
    if (d.kind !== 'place' && d.kind !== 'eliminate' && d.kind !== 'direct') return;

    const hl = d.highlight || {};
    const baseCells = new Set(hl.cells || []);
    const unitCells = new Set(hl.unitCells || []);
    const lineCells = new Set(hl.lineCells || []);
    const baseDigits = new Set(hl.baseDigits || []);
    const elims = d.eliminations || hl.elim || [];
    const elimSet = new Set(elims.map((e) => e.cell * 10 + e.digit));

    for (let i = 0; i < 81; i++) {
      const cell = cellEls[i];
      if (unitCells.has(i)) cell.classList.add('hl-unit');
      if (lineCells.has(i)) cell.classList.add('hl-line');
      if (baseCells.has(i)) cell.classList.add('base');
      if (valueAt(i)) continue;
      for (const sp of cell.lastChild.children) {
        const n = +sp.dataset.n;
        if (!state.notes[i].has(n)) continue;
        if (baseCells.has(i) && baseDigits.has(n)) sp.classList.add('hl');   // badge ambre
        if (elimSet.has(i * 10 + n)) sp.classList.add('elim');               // barré rouge
      }
    }

    // aperçu (vert, translucide) du chiffre à poser
    if ((d.kind === 'place' || d.kind === 'direct') && d.cell != null && !valueAt(d.cell)) {
      const cell = cellEls[d.cell];
      cell.classList.add('hint-place');
      cell.firstChild.textContent = d.digit;
      cell.lastChild.style.display = 'none';
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

    applyHintHighlight();

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
    els.toolAutonotes.disabled = state.autoNotes;   // Auto = coup de pouce unique, puis grisé
    updateUndoBtn();

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
      toolUndo: document.getElementById('tool-undo'),
      toolErase: document.getElementById('tool-erase'),
      toolPencil: document.getElementById('tool-pencil'),
      toolAutonotes: document.getElementById('tool-autonotes'),
      toolBulb: document.getElementById('tool-bulb'),
      pencilBadge: document.getElementById('pencil-badge'),
      hintPanel: document.getElementById('hint-panel'),
      hintBody: document.getElementById('hint-body'),
      hintMore: document.getElementById('hint-more'),
      hintPlace: document.getElementById('hint-place'),
      hintClose: document.getElementById('hint-close'),
      numpad: document.getElementById('numpad'),
      modal: document.getElementById('modal'),
      modalText: document.getElementById('modal-text'),
      modalOk: document.getElementById('modal-ok'),
      modalCancel: document.getElementById('modal-cancel'),
    };
    els.numBtns = Array.from(els.numpad.querySelectorAll('.num'));

    cellEls = global.SudokuBoard.buildBoard(els.board, selectCell);

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
    els.toolUndo.addEventListener('click', undo);
    els.toolErase.addEventListener('click', toggleEraser);
    els.toolPencil.addEventListener('click', togglePencil);
    els.toolAutonotes.addEventListener('click', toggleAutoNotes);
    els.toolBulb.addEventListener('click', showHint);

    // Panneau d'astuce
    els.hintMore.addEventListener('click', revealHint);
    els.hintPlace.addEventListener('click', placeHint);
    els.hintClose.addEventListener('click', () => { dismissHint(); render(); });

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

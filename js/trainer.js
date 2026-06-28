/*
 * trainer.js — mode entraînement : liste des techniques + exercices générés
 * par le moteur de détection (techniques.js), avec indice, solution et explication.
 */
(function (global) {
  'use strict';

  const T = global.SudokuTech;
  const LEVELS = [
    { key: 'debutant', label: 'Pour débuter', hint: 'Les réflexes de base, sans annotations.' },
    { key: 'technique', label: 'Techniques', hint: 'Avec les annotations (candidats).' },
  ];

  let els = {};
  let cells = [];          // 81 éléments du plateau d'entraînement
  let current = null;      // { lessonId, exercise, phase }

  // ---- Construction de la liste ---------------------------------------------
  function buildList() {
    els.groups.innerHTML = '';
    for (const lvl of LEVELS) {
      const lessons = T.LESSONS.filter((l) => l.level === lvl.key);
      if (!lessons.length) continue;
      const group = document.createElement('div');
      group.className = 'lesson-group';
      group.innerHTML = '<h3 class="group-title">' + lvl.label
        + '<span class="group-hint">' + lvl.hint + '</span></h3>';
      const grid = document.createElement('div');
      grid.className = 'lesson-grid';
      lessons.forEach((l, n) => {
        const card = document.createElement('button');
        card.className = 'lesson-card';
        card.type = 'button';
        card.innerHTML =
          '<span class="lc-index">' + (n + 1) + '</span>' +
          '<span class="lc-body"><span class="lc-title">' + l.title + '</span>' +
          '<span class="lc-sum">' + l.summary + '</span></span>' +
          '<span class="lc-arrow">›</span>';
        card.addEventListener('click', () => openLesson(l.id));
        grid.appendChild(card);
      });
      group.appendChild(grid);
      els.groups.appendChild(group);
    }
  }

  // ---- Plateau --------------------------------------------------------------
  function buildBoard() {
    els.board.innerHTML = '';
    cells = [];
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (i % 9 % 3 === 2 && i % 9 !== 8) cell.classList.add('b-right');
      if (((i / 9) | 0) % 3 === 2 && ((i / 9) | 0) !== 8) cell.classList.add('b-bottom');
      const val = document.createElement('span'); val.className = 'cell-value'; cell.appendChild(val);
      const notes = document.createElement('span'); notes.className = 'cell-notes';
      for (let n = 1; n <= 9; n++) { const sp = document.createElement('span'); sp.className = 'note'; sp.dataset.n = n; notes.appendChild(sp); }
      cell.appendChild(notes);
      els.board.appendChild(cell);
      cells.push(cell);
    }
  }

  // ---- Ouverture d'une leçon ------------------------------------------------
  function openLesson(id) {
    const lesson = T.LESSON_BY_ID[id];
    current = { lessonId: id, exercise: null, phase: 'plain' };
    els.viewList.hidden = true;
    els.viewLesson.hidden = false;
    els.level.textContent = LEVELS.find((v) => v.key === lesson.level).label;
    els.title.textContent = lesson.title;
    els.summary.textContent = lesson.summary;
    els.how.textContent = lesson.how;
    window.scrollTo(0, 0);
    loadExercise();
  }

  function backToList() {
    els.viewLesson.hidden = true;
    els.viewList.hidden = false;
    current = null;
  }

  function loadExercise() {
    els.explain.hidden = true;
    els.loading.hidden = false;
    setBtns(true);
    // délai pour laisser apparaître le loader (la génération peut prendre ~100ms)
    setTimeout(() => {
      const ex = T.generateExercise(current.lessonId, 800);
      els.loading.hidden = true;
      if (!ex) {
        els.explain.hidden = false;
        els.explain.innerHTML = '<em>Impossible de trouver un exemple cette fois — réessaie.</em>';
        setBtns(false, true);
        return;
      }
      current.exercise = ex;
      current.phase = 'plain';
      renderBoard();
      setBtns(false);
    }, 40);
  }

  function setBtns(loading, onlyNext) {
    els.hint.disabled = loading || onlyNext;
    els.reveal.disabled = loading || onlyNext;
    els.next.disabled = loading;
  }

  // ---- Rendu du plateau selon la phase --------------------------------------
  function renderBoard() {
    const ex = current.exercise;
    const inst = ex.instance;
    const hl = inst.highlight;
    const phase = current.phase; // plain | hint | reveal
    const show = phase === 'hint' || phase === 'reveal';

    const baseCells = new Set(hl.cells || []);
    const unitCells = new Set(show ? (hl.unitCells || []) : []);
    const lineCells = new Set(show ? (hl.lineCells || []) : []);
    const baseDigits = new Set(hl.baseDigits || (inst.placements ? inst.placements.map((p) => p.digit) : []));
    const placeMap = {}; if (inst.placements) inst.placements.forEach((p) => placeMap[p.cell] = p.digit);
    const elimSet = new Set((phase === 'reveal' && inst.eliminations ? inst.eliminations : []).map((e) => e.cell * 10 + e.digit));

    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const valEl = cell.firstChild, notesEl = cell.lastChild;
      cell.className = 'cell'
        + (i % 9 % 3 === 2 && i % 9 !== 8 ? ' b-right' : '')
        + (((i / 9) | 0) % 3 === 2 && ((i / 9) | 0) !== 8 ? ' b-bottom' : '');

      const placedHere = phase === 'reveal' && placeMap[i] != null;

      if (ex.grid[i]) {                         // case déjà remplie (donnée)
        valEl.textContent = ex.grid[i];
        notesEl.style.display = 'none';
        cell.classList.add('given');
      } else if (placedHere) {                  // placement révélé
        valEl.textContent = placeMap[i];
        notesEl.style.display = 'none';
        cell.classList.add('placed');
      } else {                                  // candidats
        valEl.textContent = '';
        notesEl.style.display = '';
        const cm = ex.cands[i];
        for (const sp of notesEl.children) {
          const n = +sp.dataset.n;
          const has = !!(cm & (1 << (n - 1)));
          sp.textContent = has ? n : '';
          sp.className = 'note';
          if (has && baseCells.has(i) && baseDigits.has(n)) sp.classList.add('hl');
          if (has && elimSet.has(i * 10 + n)) sp.classList.add('elim');
        }
      }

      if (unitCells.has(i)) cell.classList.add('hl-unit');
      if (lineCells.has(i)) cell.classList.add('hl-line');
      if (show && baseCells.has(i)) cell.classList.add('base');
    }
  }

  // ---- Actions --------------------------------------------------------------
  function doHint() {
    if (!current.exercise) return;
    current.phase = 'hint';
    renderBoard();
    els.explain.hidden = false;
    els.explain.innerHTML = '<strong>Indice —</strong> ' + hintText(current.exercise.instance);
  }

  function doReveal() {
    if (!current.exercise) return;
    current.phase = 'reveal';
    renderBoard();
    els.explain.hidden = false;
    els.explain.innerHTML = '<strong>Solution —</strong> ' + current.exercise.instance.explain;
  }

  function hintText(inst) {
    const hl = inst.highlight;
    if (inst.placements) {
      return 'Concentre-toi sur la zone surlignée : une case n’a plus qu’une possibilité.';
    }
    const ds = (hl.baseDigits || []).join(', ');
    return 'Observe l’unité surlignée et les chiffres {' + ds + '} dans les cases mises en avant.';
  }

  // ---- Init -----------------------------------------------------------------
  function init() {
    els = {
      groups: document.getElementById('lesson-groups'),
      viewList: document.getElementById('view-list'),
      viewLesson: document.getElementById('view-lesson'),
      backList: document.getElementById('back-list'),
      level: document.getElementById('lesson-level'),
      title: document.getElementById('lesson-title'),
      summary: document.getElementById('lesson-summary'),
      how: document.getElementById('lesson-how'),
      board: document.getElementById('train-board'),
      loading: document.getElementById('train-loading'),
      explain: document.getElementById('explain'),
      hint: document.getElementById('btn-hint'),
      reveal: document.getElementById('btn-reveal'),
      next: document.getElementById('btn-next'),
    };
    buildList();
    buildBoard();
    els.backList.addEventListener('click', backToList);
    els.hint.addEventListener('click', doHint);
    els.reveal.addEventListener('click', doReveal);
    els.next.addEventListener('click', loadExercise);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);

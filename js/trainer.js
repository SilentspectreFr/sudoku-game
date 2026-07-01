/*
 * trainer.js — mode entraînement : liste des techniques + exercices générés
 * par le moteur de détection (techniques.js). Le joueur RÉPOND sur la grille
 * (touche une case puis un chiffre) ; le jeu valide contre l'instance attendue,
 * explique, et suit la progression par technique en localStorage.
 */
(function (global) {
  'use strict';

  const T = global.SudokuTech;
  const STORAGE_KEY = 'sudoku-trainer:v1';
  const MASTERY_STREAK = 3;   // réussites consécutives (sans « Voir la solution ») = maîtrisée
  const LEVELS = [
    { key: 'debutant', label: 'Pour débuter', hint: 'Les réflexes de base, sans annotations.' },
    { key: 'technique', label: 'Techniques', hint: 'Avec les annotations (candidats).' },
    { key: 'avance', label: 'Techniques avancées', hint: 'Les structures : X-Wing, Y-Wing, XYZ-Wing, W-Wing, Swordfish.' },
  ];

  let els = {};
  let cells = [];          // 81 éléments du plateau d'entraînement
  let current = null;      // { lessonId, exercise, phase, hintStep, selectedCell, found, attempts, revealed }

  // ---- Progression (localStorage) --------------------------------------------
  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { v: 1, techniques: {} };
      const d = JSON.parse(raw);
      if (!d || d.v !== 1 || typeof d.techniques !== 'object') return { v: 1, techniques: {} };
      return d;
    } catch (e) { return { v: 1, techniques: {} }; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) { /* stockage indisponible */ }
  }
  // Un exercice terminé sans reveal = réussite (les essais faux et les indices ne
  // pénalisent pas) ; un reveal casse la série. La maîtrise, une fois acquise, reste.
  function recordResult(lessonId, success) {
    const p = loadProgress();
    const t = p.techniques[lessonId] || (p.techniques[lessonId] = { ok: 0, tries: 0, streak: 0, mastered: false });
    t.tries++;
    if (success) {
      t.ok++; t.streak++;
      if (t.streak >= MASTERY_STREAK) t.mastered = true;
    } else {
      t.streak = 0;
    }
    saveProgress(p);
  }
  function progressOf(lessonId) {
    const t = loadProgress().techniques[lessonId];
    return t || { ok: 0, tries: 0, streak: 0, mastered: false };
  }
  // Prochaine technique à travailler : la première non maîtrisée, dans l'ordre
  // du catalogue (déjà trié du plus simple au plus avancé).
  function nextSuggestion() {
    for (const l of T.LESSONS) if (!progressOf(l.id).mastered) return l;
    return null;
  }

  // ---- Construction de la liste ---------------------------------------------
  function buildList() {
    els.groups.innerHTML = '';

    // Carte « prochaine étape » (suggestion), en tête de liste.
    const next = nextSuggestion();
    const sugg = document.createElement(next ? 'button' : 'div');
    sugg.className = 'suggest-card';
    if (next) {
      sugg.type = 'button';
      sugg.innerHTML = '<span class="sc-label">Prochaine étape</span>'
        + '<span class="sc-title">' + next.title + '</span>'
        + '<span class="sc-sum">' + next.summary + '</span>';
      sugg.addEventListener('click', () => openLesson(next.id));
    } else {
      sugg.innerHTML = '<span class="sc-label">Bravo</span>'
        + '<span class="sc-title">Toutes les techniques sont maîtrisées — chapeau !</span>';
    }
    els.groups.appendChild(sugg);

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
        const prog = progressOf(l.id);
        let progHtml = '';
        if (prog.mastered) {
          progHtml = '<span class="lc-progress mastered">✓ Maîtrisée</span>';
        } else if (prog.tries > 0) {
          const filled = Math.min(prog.streak, MASTERY_STREAK);
          progHtml = '<span class="lc-progress">' + '●'.repeat(filled) + '○'.repeat(MASTERY_STREAK - filled) + '</span>';
        }
        const card = document.createElement('button');
        card.className = 'lesson-card';
        card.type = 'button';
        card.innerHTML =
          '<span class="lc-index">' + (n + 1) + '</span>' +
          '<span class="lc-body"><span class="lc-title">' + l.title + '</span>' +
          '<span class="lc-sum">' + l.summary + '</span></span>' +
          progHtml +
          '<span class="lc-arrow">›</span>';
        card.addEventListener('click', () => openLesson(l.id));
        grid.appendChild(card);
      });
      group.appendChild(grid);
      els.groups.appendChild(group);
    }
  }

  // ---- Ouverture d'une leçon ------------------------------------------------
  function openLesson(id) {
    const lesson = T.LESSON_BY_ID[id];
    current = { lessonId: id, exercise: null, phase: 'answer', hintStep: 0,
                selectedCell: null, found: new Set(), attempts: 0, revealed: false };
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
    buildList();   // rafraîchit badges et suggestion
  }

  function loadExercise() {
    clearFeedback();
    els.task.hidden = true;
    els.loading.hidden = false;
    updateButtons(true);
    // délai pour laisser apparaître le loader (la génération peut prendre ~100ms)
    setTimeout(() => {
      const ex = T.generateExercise(current.lessonId, 800);
      els.loading.hidden = true;
      if (!ex) {
        current.exercise = null;
        setFeedback('<em>Impossible de trouver un exemple cette fois — réessaie.</em>', null);
        updateButtons(false);
        return;
      }
      current.exercise = ex;
      current.phase = 'answer';
      current.hintStep = 0;
      current.selectedCell = null;
      current.found = new Set();
      current.attempts = 0;
      current.revealed = false;
      renderBoard();
      renderTask();
      updateButtons(false);
    }, 40);
  }

  function updateButtons(loading) {
    const answering = !loading && current && current.exercise && current.phase === 'answer';
    els.hint.disabled = !answering || current.hintStep >= 2;
    els.hint.textContent = (current && current.hintStep >= 1) ? 'Indice +' : 'Indice';
    els.reveal.disabled = !answering;
    els.next.disabled = !!loading;
    for (const b of els.numBtns) b.disabled = !answering;
  }

  // ---- Rendu du plateau selon la phase --------------------------------------
  function renderBoard() {
    const ex = current.exercise;
    if (!ex) return;
    const inst = ex.instance;
    const hl = inst.highlight;
    const phase = current.phase;          // answer | correct | reveal
    const reveal = phase === 'reveal' || phase === 'correct';
    // Indice + (cran 2) : on montre la ZONE du motif (unités, et cases-clés pour
    // une élimination) sans révéler les chiffres. Pour un placement, on ne montre
    // que l'unité : trouver LA case reste l'exercice.
    const zone = reveal || current.hintStep >= 2;
    const zoneBases = reveal || (current.hintStep >= 2 && !inst.placements);

    const baseCells = new Set(hl.cells || []);
    const unitCells = new Set(zone ? (hl.unitCells || []) : []);
    const lineCells = new Set(zone ? (hl.lineCells || []) : []);
    const baseDigits = new Set(hl.baseDigits || (inst.placements ? inst.placements.map((p) => p.digit) : []));
    const placeMap = {}; if (inst.placements) inst.placements.forEach((p) => placeMap[p.cell] = p.digit);
    // révélé : toutes les éliminations barrées ; en cours de réponse : celles trouvées
    const elims = inst.eliminations || [];
    const shown = reveal ? elims : elims.filter((e) => current.found.has(e.cell + ':' + e.digit));
    const elimSet = new Set(shown.map((e) => e.cell * 10 + e.digit));

    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const valEl = cell.firstChild, notesEl = cell.lastChild;
      cell.className = 'cell'
        + (i % 9 % 3 === 2 && i % 9 !== 8 ? ' b-right' : '')
        + (((i / 9) | 0) % 3 === 2 && ((i / 9) | 0) !== 8 ? ' b-bottom' : '');

      const placedHere = reveal && placeMap[i] != null;

      if (ex.grid[i]) {                         // case déjà remplie (donnée)
        valEl.textContent = ex.grid[i];
        notesEl.style.display = 'none';
        cell.classList.add('given');
      } else if (placedHere) {                  // placement révélé / réussi
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
          if (reveal && has && baseCells.has(i) && baseDigits.has(n)) sp.classList.add('hl');
          if (has && elimSet.has(i * 10 + n)) sp.classList.add('elim');
        }
      }

      if (unitCells.has(i)) cell.classList.add('hl-unit');
      if (lineCells.has(i)) cell.classList.add('hl-line');
      if (zoneBases && baseCells.has(i)) cell.classList.add('base');
      if (phase === 'answer' && i === current.selectedCell) cell.classList.add('selected');
    }
  }

  // Consigne au-dessus du pavé (avec compteur pour les éliminations).
  function renderTask() {
    if (!current || !current.exercise || current.phase !== 'answer') { els.task.hidden = true; return; }
    const inst = current.exercise.instance;
    if (inst.placements) {
      els.task.innerHTML = '<strong>À toi de jouer</strong> — touche la case où cette technique '
        + 'place un chiffre, puis le chiffre sur le pavé.';
    } else {
      const total = inst.eliminations.length;
      els.task.innerHTML = '<strong>À toi de jouer</strong> — barre les candidats que cette technique '
        + 'élimine : touche la case, puis le chiffre à barrer. <strong>' + current.found.size + '/' + total
        + '</strong> trouvé' + (total > 1 ? 's' : '') + '.';
    }
    els.task.hidden = false;
  }

  // ---- Bandeau de feedback ----------------------------------------------------
  function setFeedback(html, kind) {
    els.explain.hidden = false;
    els.explain.className = 'explain' + (kind ? ' ' + kind : '');
    els.explain.innerHTML = html;
  }
  function clearFeedback() {
    els.explain.hidden = true;
    els.explain.className = 'explain';
    els.explain.innerHTML = '';
  }

  // ---- Réponse du joueur ------------------------------------------------------
  function onCellTap(i) {
    if (!current || !current.exercise || current.phase !== 'answer') return;
    if (current.exercise.grid[i]) return;       // case donnée : rien à répondre là
    current.selectedCell = i;
    renderBoard();
  }

  function onNumTap(d) {
    if (!current || !current.exercise || current.phase !== 'answer') return;
    if (current.selectedCell == null) {
      setFeedback('Touche d\'abord une case de la grille, puis le chiffre sur le pavé.', null);
      return;
    }
    const inst = current.exercise.instance;
    const cell = current.selectedCell;
    const res = T.checkAnswer(inst, cell, d);

    if (!res.correct) { wrongAnswer(res.kind); return; }

    if (res.kind === 'place') { finishCorrect(); return; }

    // élimination correcte
    const key = cell + ':' + d;
    if (current.found.has(key)) {
      setFeedback('Déjà barré ✓ — continue, il en reste.', null);
      return;
    }
    current.found.add(key);
    const total = inst.eliminations.length;
    if (current.found.size >= total) { finishCorrect(); return; }
    renderBoard();
    renderTask();
    setFeedback('✔ Bien vu — le ' + d + ' s\'élimine en ' + T.cellName(cell) + '. Encore '
      + (total - current.found.size) + ' à barrer.', 'ok');
  }

  function finishCorrect() {
    const lesson = T.LESSON_BY_ID[current.lessonId];
    current.phase = 'correct';
    recordResult(current.lessonId, !current.revealed);
    renderBoard();
    renderTask();
    updateButtons(false);
    setFeedback('<strong>✔ Correct !</strong> ' + current.exercise.instance.explain
      + '<br><em>À retenir : ' + lesson.summary + '</em>', 'ok');
  }

  function wrongAnswer(kind) {
    current.attempts++;
    const cellEl = cells[current.selectedCell];
    cellEl.classList.add('wrong-flash');
    setTimeout(() => cellEl.classList.remove('wrong-flash'), 500);
    let msg = kind === 'place'
      ? '✘ Pas ici — ce n\'est pas ce que cette technique donne sur cette grille. Réessaie.'
      : '✘ Non — ce candidat n\'est pas éliminé par cette technique. Réessaie.';
    if (current.attempts >= 2) msg += ' Bloqué ? Touche « Indice ».';
    setFeedback(msg, 'ko');
  }

  // ---- Indice progressif / solution ------------------------------------------
  function doHint() {
    if (!current || !current.exercise || current.phase !== 'answer') return;
    const lesson = T.LESSON_BY_ID[current.lessonId];
    current.hintStep = Math.min(current.hintStep + 1, 2);
    if (current.hintStep === 1) {
      // cran 1 : la méthode de la technique (le « comment chercher »)
      setFeedback('<strong>Indice —</strong> ' + lesson.how, null);
    } else {
      // cran 2 : on surligne la zone du motif, sans donner la réponse
      renderBoard();
      setFeedback('<strong>Indice + —</strong> Le motif se joue dans la zone surlignée : '
        + 'à toi de trouver la réponse.', null);
    }
    updateButtons(false);
  }

  function doReveal() {
    if (!current || !current.exercise || current.phase !== 'answer') return;
    const lesson = T.LESSON_BY_ID[current.lessonId];
    current.revealed = true;
    current.phase = 'reveal';
    recordResult(current.lessonId, false);
    renderBoard();
    renderTask();
    updateButtons(false);
    setFeedback('<strong>Solution —</strong> ' + current.exercise.instance.explain
      + '<br><em>À retenir : ' + lesson.summary + '</em>', null);
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
      task: document.getElementById('train-task'),
      numpad: document.getElementById('train-numpad'),
      hint: document.getElementById('btn-hint'),
      reveal: document.getElementById('btn-reveal'),
      next: document.getElementById('btn-next'),
    };
    els.numBtns = Array.from(els.numpad.querySelectorAll('.num'));

    buildList();
    cells = global.SudokuBoard.buildBoard(els.board, onCellTap);

    for (const btn of els.numBtns) {
      btn.addEventListener('click', () => onNumTap(+btn.dataset.d));
    }
    document.addEventListener('keydown', (e) => {
      if (e.key >= '1' && e.key <= '9') onNumTap(+e.key);
    });

    els.backList.addEventListener('click', backToList);
    els.hint.addEventListener('click', doHint);
    els.reveal.addEventListener('click', doReveal);
    els.next.addEventListener('click', loadExercise);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);

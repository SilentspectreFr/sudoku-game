/*
 * sudoku-engine.js — moteur PUR (aucune dépendance au DOM).
 *
 * Trois briques :
 *   1. generateFull()            -> une grille 9x9 COMPLÈTE et valide (backtracking randomisé).
 *   2. countSolutions(grid, lim) -> compte les solutions jusqu'à `lim` (sert à garantir l'UNICITÉ).
 *   3. generatePuzzle(diff)      -> { puzzle, solution, givens } via "creusage" à solution unique.
 *
 * La difficulté est pilotée par deux leviers combinés :
 *   - le nombre d'indices donnés (givens),
 *   - la résolubilité par "singles" seuls (naked + hidden) : c'est la frontière classique
 *     facile/difficile. Facile & Moyen DOIVENT être résolubles aux singles ; Difficile & Expert
 *     NON (ils exigent un raisonnement plus poussé).
 *
 * Représentation : tableau plat de 81 entiers, 0 = case vide. index = ligne*9 + colonne.
 */
(function (global) {
  'use strict';

  // ---- Bitmasks utilitaires -------------------------------------------------
  const ALL = 0x1FF; // 9 bits = chiffres 1..9
  const BIT_TO_DIGIT = { 1: 1, 2: 2, 4: 3, 8: 4, 16: 5, 32: 6, 64: 7, 128: 8, 256: 9 };

  function popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---- Unités (9 lignes, 9 colonnes, 9 blocs) et pairs (peers) --------------
  const UNITS = [];
  for (let r = 0; r < 9; r++) { const u = []; for (let c = 0; c < 9; c++) u.push(r * 9 + c); UNITS.push(u); }
  for (let c = 0; c < 9; c++) { const u = []; for (let r = 0; r < 9; r++) u.push(r * 9 + c); UNITS.push(u); }
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const u = [];
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) u.push((br * 3 + dr) * 9 + (bc * 3 + dc));
    UNITS.push(u);
  }

  // Candidats possibles pour la case i dans la grille g (bitmask).
  function candMask(g, i) {
    const r = (i / 9) | 0, c = i % 9;
    let used = 0;
    for (let k = 0; k < 9; k++) {
      const rv = g[r * 9 + k]; if (rv) used |= 1 << (rv - 1);
      const cv = g[k * 9 + c]; if (cv) used |= 1 << (cv - 1);
    }
    const br = r - (r % 3), bc = c - (c % 3);
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
      const v = g[(br + dr) * 9 + bc + dc]; if (v) used |= 1 << (v - 1);
    }
    return (~used) & ALL;
  }

  // ---- 1. Grille complète valide -------------------------------------------
  function generateFull() {
    const g = new Array(81).fill(0);
    const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);

    function fill(pos) {
      if (pos === 81) return true;
      const r = (pos / 9) | 0, c = pos % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      const used = rows[r] | cols[c] | boxes[b];
      const order = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (const d of order) {
        const bit = 1 << (d - 1);
        if (used & bit) continue;
        g[pos] = d; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        if (fill(pos + 1)) return true;
        g[pos] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      }
      return false;
    }
    fill(0);
    return g;
  }

  // ---- 2. Compteur de solutions (s'arrête dès `limit`) ----------------------
  function countSolutions(grid, limit) {
    limit = limit || 2;
    const g = grid.slice();
    const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
      if (g[i]) {
        const r = (i / 9) | 0, c = i % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
        const bit = 1 << (g[i] - 1);
        rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
      }
    }
    let count = 0;

    function solve() {
      // MRV : on choisit la case vide avec le moins de candidats.
      let best = -1, bestCount = 10, bestCand = 0;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const r = (i / 9) | 0, c = i % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
        const cand = (~(rows[r] | cols[c] | boxes[b])) & ALL;
        const n = popcount(cand);
        if (n === 0) return;            // impasse
        if (n < bestCount) { bestCount = n; best = i; bestCand = cand; if (n === 1) break; }
      }
      if (best === -1) { count++; return; } // grille pleine = 1 solution
      const r = (best / 9) | 0, c = best % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      let cand = bestCand;
      while (cand) {
        const bit = cand & (-cand); cand &= cand - 1;
        g[best] = BIT_TO_DIGIT[bit];
        rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        solve();
        g[best] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
        if (count >= limit) return;
      }
    }
    solve();
    return count;
  }

  // ---- Solveur "singles" seuls (graduation de difficulté) -------------------
  // Résout uniquement par naked singles (1 candidat) + hidden singles
  // (un chiffre n'a qu'une place possible dans une unité). Renvoie true si la
  // grille est entièrement résolue par ces seules techniques.
  function solvableBySingles(puzzle) {
    const g = puzzle.slice();
    for (;;) {
      let progress = false;

      // naked singles
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const cm = candMask(g, i);
        if (cm === 0) return false;            // contradiction
        if (popcount(cm) === 1) { g[i] = BIT_TO_DIGIT[cm]; progress = true; }
      }
      if (progress) continue;

      // hidden singles
      let placed = false;
      for (const unit of UNITS) {
        for (let d = 1; d <= 9 && !placed; d++) {
          const bit = 1 << (d - 1);
          let present = false;
          for (const i of unit) { if (g[i] === d) { present = true; break; } }
          if (present) continue;
          let spot = -1, n = 0;
          for (const i of unit) { if (!g[i] && (candMask(g, i) & bit)) { n++; spot = i; if (n > 1) break; } }
          if (n === 1) { g[spot] = d; placed = true; }
        }
        if (placed) break;
      }
      if (placed) { progress = true; continue; }

      break; // bloqué
    }
    return g.every((v) => v !== 0);
  }

  // ---- 3. Génération du puzzle ---------------------------------------------
  const DIFFICULTIES = {
    facile:    { label: 'Facile',    minGivens: 42, singlesOnly: true,  maxAttempts: 25 },
    moyen:     { label: 'Moyen',     minGivens: 35, singlesOnly: true,  maxAttempts: 30 },
    difficile: { label: 'Difficile', minGivens: 30, singlesOnly: false, maxAttempts: 50 },
    expert:    { label: 'Expert',    minGivens: 26, singlesOnly: false, maxAttempts: 60 },
  };

  function digPuzzle(solution, minGivens) {
    const puzzle = solution.slice();
    let givens = 81;
    const order = shuffle([...Array(81).keys()]);
    for (const pos of order) {
      if (givens <= minGivens) break;
      const saved = puzzle[pos];
      if (saved === 0) continue;
      puzzle[pos] = 0;
      if (countSolutions(puzzle, 2) !== 1) {
        puzzle[pos] = saved; // le retrait casse l'unicité -> on remet
      } else {
        givens--;
      }
    }
    return { puzzle, givens };
  }

  function generatePuzzle(difficulty) {
    const cfg = DIFFICULTIES[difficulty] || DIFFICULTIES.facile;
    let fallback = null;
    for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
      const solution = generateFull();
      const { puzzle, givens } = digPuzzle(solution, cfg.minGivens);
      const singles = solvableBySingles(puzzle);
      fallback = { puzzle, solution, givens, difficulty };
      if (cfg.singlesOnly === singles) {
        return fallback; // graduation respectée
      }
    }
    return fallback; // dernier recours : on accepte la dernière grille générée
  }

  // ---- Auto-test (garde-fou anti-régression) -------------------------------
  function selfTest() {
    const report = {};
    for (const diff of Object.keys(DIFFICULTIES)) {
      const { puzzle, solution, givens } = generatePuzzle(diff);
      const unique = countSolutions(puzzle, 2) === 1;
      const consistent = puzzle.every((v, i) => v === 0 || v === solution[i]);
      const singles = solvableBySingles(puzzle);
      report[diff] = { givens, unique, consistent, singles };
      if (!unique || !consistent) {
        console.error('[SudokuEngine] ÉCHEC self-test', diff, report[diff]);
      }
    }
    return report;
  }

  global.SudokuEngine = {
    generateFull,
    countSolutions,
    generatePuzzle,
    solvableBySingles,
    candMask,
    DIFFICULTIES,
    UNITS,
    selfTest,
  };
})(typeof window !== 'undefined' ? window : globalThis);

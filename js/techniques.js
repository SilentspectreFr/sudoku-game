/*
 * techniques.js — moteur de TECHNIQUES de résolution (PUR, DOM-free).
 *
 * Rôle : détecter une instance d'une technique donnée dans une position, et
 * fabriquer des exercices pédagogiques (position + candidats + solution +
 * explication générée) où la technique visée est précisément le prochain pas
 * logique (toutes les techniques plus simples ayant été appliquées avant).
 *
 * C'est ce module qui encode la "maîtrise" de chaque règle. Chaque détecteur
 * renvoie soit un placement (cell, digit), soit des éliminations (cell, digit),
 * + les éléments à surligner et un texte d'explication en français.
 *
 * Dépend de SudokuEngine (génération de grilles à solution unique).
 */
(function (global) {
  'use strict';

  const E = global.SudokuEngine;
  const ALL = 0x1FF;
  const BIT_TO_DIGIT = { 1: 1, 2: 2, 4: 3, 8: 4, 16: 5, 32: 6, 64: 7, 128: 8, 256: 9 };

  function popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }
  function digitsOf(mask) { const a = []; for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) a.push(d); return a; }
  function bit(d) { return 1 << (d - 1); }

  // ---- Unités et pairs ------------------------------------------------------
  const UNIT_DEFS = []; // {type:'row'|'col'|'box', idx, cells:[9]}
  for (let r = 0; r < 9; r++) { const cells = []; for (let c = 0; c < 9; c++) cells.push(r * 9 + c); UNIT_DEFS.push({ type: 'row', idx: r, cells }); }
  for (let c = 0; c < 9; c++) { const cells = []; for (let r = 0; r < 9; r++) cells.push(r * 9 + c); UNIT_DEFS.push({ type: 'col', idx: c, cells }); }
  for (let b = 0; b < 9; b++) {
    const br = ((b / 3) | 0) * 3, bc = (b % 3) * 3, cells = [];
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) cells.push((br + dr) * 9 + (bc + dc));
    UNIT_DEFS.push({ type: 'box', idx: b, cells });
  }
  const ROWS = UNIT_DEFS.filter((u) => u.type === 'row');
  const COLS = UNIT_DEFS.filter((u) => u.type === 'col');
  const BOXES = UNIT_DEFS.filter((u) => u.type === 'box');

  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const r = (i / 9) | 0, c = i % 9, br = r - (r % 3), bc = c - (c % 3), set = new Set();
    for (let k = 0; k < 9; k++) { set.add(r * 9 + k); set.add(k * 9 + c); }
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) set.add((br + dr) * 9 + bc + dc);
    set.delete(i);
    PEERS.push([...set]);
  }

  const rowOf = (i) => (i / 9) | 0;
  const colOf = (i) => i % 9;
  const boxOf = (i) => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);
  const cellName = (i) => 'L' + (rowOf(i) + 1) + 'C' + (colOf(i) + 1);
  function unitName(u) {
    if (u.type === 'row') return 'la ligne ' + (u.idx + 1);
    if (u.type === 'col') return 'la colonne ' + (u.idx + 1);
    return 'le bloc ' + (u.idx + 1);
  }
  const cellsName = (arr) => arr.map(cellName).join(' et ');

  // ---- Candidats ------------------------------------------------------------
  function computeCands(g) {
    const cands = new Array(81).fill(0);
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      let used = 0;
      for (const p of PEERS[i]) if (g[p]) used |= bit(g[p]);
      cands[i] = (~used) & ALL;
    }
    return cands;
  }

  function applyInstance(g, cands, inst) {
    if (inst.placements) {
      for (const { cell, digit } of inst.placements) {
        g[cell] = digit; cands[cell] = 0;
        for (const p of PEERS[cell]) cands[p] &= ~bit(digit);
      }
    }
    if (inst.eliminations) {
      for (const { cell, digit } of inst.eliminations) cands[cell] &= ~bit(digit);
    }
  }

  function isSolved(g) { for (let i = 0; i < 81; i++) if (!g[i]) return false; return true; }

  // combinaisons de k éléments
  function combos(arr, k) {
    const res = [];
    (function rec(start, acc) {
      if (acc.length === k) { res.push(acc.slice()); return; }
      for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
    })(0, []);
    return res;
  }

  // =========================================================================
  //  DÉTECTEURS
  // =========================================================================

  // 1. Dernière case libre (Full House) : une unité n'a qu'une case vide.
  function detectFullHouse(g, cands, out) {
    for (const u of UNIT_DEFS) {
      const empties = u.cells.filter((i) => !g[i]);
      if (empties.length === 1) {
        const cell = empties[0];
        const digit = digitsOf(cands[cell])[0];
        if (!digit) continue;
        const inst = {
          technique: 'fullHouse',
          placements: [{ cell, digit }],
          highlight: { unitCells: u.cells.slice(), cells: [cell], place: [{ cell, digit }] },
          explain: 'Dans ' + unitName(u) + ', toutes les cases sont remplies sauf '
            + cellName(cell) + '. Le seul chiffre manquant de cette unité est le ' + digit
            + ' : on le place donc en ' + cellName(cell) + '.',
        };
        if (out) out.push(inst); else return inst;
      }
    }
    return null;
  }

  // 2/5. Singleton caché : dans une unité, un chiffre n'a qu'une case possible.
  //   scope 'box' = Dernière case restante ; 'all' = Singletons cachés.
  function detectHiddenSingle(g, cands, scope, out) {
    const units = scope === 'box' ? BOXES : UNIT_DEFS;
    for (const u of units) {
      const present = new Set(u.cells.map((i) => g[i]).filter(Boolean));
      for (let d = 1; d <= 9; d++) {
        if (present.has(d)) continue;
        const spots = u.cells.filter((i) => !g[i] && (cands[i] & bit(d)));
        if (spots.length === 1) {
          const cell = spots[0];
          const inst = {
            technique: 'hiddenSingle',
            scope,
            placements: [{ cell, digit: d }],
            highlight: { unitCells: u.cells.slice(), cells: [cell], place: [{ cell, digit: d }] },
            explain: 'Dans ' + unitName(u) + ', le chiffre ' + d + ' ne peut aller que dans '
              + cellName(cell) + ' (toutes les autres cases de l’unité sont occupées '
              + 'ou voient déjà un ' + d + '). On place le ' + d + '.',
          };
          if (out) out.push(inst); else return inst;
        }
      }
    }
    return null;
  }

  // 3. Singleton nu / Dernier chiffre possible : une case n'a qu'un candidat.
  function detectNakedSingle(g, cands, out) {
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      if (popcount(cands[i]) === 1) {
        const digit = digitsOf(cands[i])[0];
        const inst = {
          technique: 'nakedSingle',
          placements: [{ cell: i, digit }],
          highlight: { cells: [i], place: [{ cell: i, digit }] },
          explain: 'La case ' + cellName(i) + ' voit déjà huit chiffres différents sur sa '
            + 'ligne, sa colonne et son bloc : il ne lui reste qu’un seul candidat possible, le '
            + digit + '. On le place.',
        };
        if (out) out.push(inst); else return inst;
      }
    }
    return null;
  }

  // 6/7. Sous-ensemble nu (paire/triplet nu).
  function detectNakedSubset(g, cands, size, out) {
    for (const u of UNIT_DEFS) {
      const empties = u.cells.filter((i) => !g[i] && popcount(cands[i]) >= 2 && popcount(cands[i]) <= size);
      if (empties.length < size) continue;
      for (const grp of combos(empties, size)) {
        let union = 0;
        for (const i of grp) union |= cands[i];
        if (popcount(union) !== size) continue;
        // éliminations : ces digits chez les AUTRES cases vides de l'unité
        const elims = [];
        for (const i of u.cells) {
          if (g[i] || grp.includes(i)) continue;
          const common = cands[i] & union;
          if (common) for (const d of digitsOf(common)) elims.push({ cell: i, digit: d });
        }
        if (!elims.length) continue;
        const ds = digitsOf(union);
        const inst = {
          technique: size === 2 ? 'nakedPair' : 'nakedTriple',
          eliminations: elims,
          highlight: { unitCells: u.cells.slice(), cells: grp.slice(), baseDigits: ds, elim: elims.slice() },
          explain: 'Dans ' + unitName(u) + ', les cases ' + cellsName(grp) + ' ne contiennent que les '
            + 'chiffres {' + ds.join(', ') + '} (' + size + ' cases pour ' + size + ' chiffres). Ces chiffres '
            + 'leur sont donc réservés : on les retire des candidats des autres cases de l’unité.',
        };
        if (out) out.push(inst); else return inst;
      }
    }
    return null;
  }

  // 8/9. Sous-ensemble caché (paire/triplet caché).
  function detectHiddenSubset(g, cands, size, out) {
    for (const u of UNIT_DEFS) {
      // pour chaque chiffre absent, ses cases candidates dans l'unité
      const spotsByDigit = {};
      const present = new Set(u.cells.map((i) => g[i]).filter(Boolean));
      const digits = [];
      for (let d = 1; d <= 9; d++) {
        if (present.has(d)) continue;
        const spots = u.cells.filter((i) => !g[i] && (cands[i] & bit(d)));
        if (spots.length >= 1 && spots.length <= size) { spotsByDigit[d] = spots; digits.push(d); }
      }
      if (digits.length < size) continue;
      for (const grp of combos(digits, size)) {
        const cellSet = new Set();
        for (const d of grp) spotsByDigit[d].forEach((i) => cellSet.add(i));
        if (cellSet.size !== size) continue;
        const groupMask = grp.reduce((m, d) => m | bit(d), 0);
        // les chiffres du groupe ne doivent apparaître nulle part ailleurs dans l'unité
        let exclusive = true;
        for (const d of grp) {
          for (const i of u.cells) {
            if (g[i] || cellSet.has(i)) continue;
            if (cands[i] & bit(d)) { exclusive = false; break; }
          }
          if (!exclusive) break;
        }
        if (!exclusive) continue;
        // éliminations : tout autre candidat dans les cellules du groupe
        const elims = [];
        for (const i of cellSet) {
          const extra = cands[i] & ~groupMask;
          if (extra) for (const d of digitsOf(extra)) elims.push({ cell: i, digit: d });
        }
        if (!elims.length) continue;
        const inst = {
          technique: size === 2 ? 'hiddenPair' : 'hiddenTriple',
          eliminations: elims,
          highlight: { unitCells: u.cells.slice(), cells: [...cellSet], baseDigits: grp.slice(), elim: elims.slice() },
          explain: 'Dans ' + unitName(u) + ', les chiffres {' + grp.join(', ') + '} ne peuvent se placer que '
            + 'dans les cases ' + cellsName([...cellSet]) + ' (' + size + ' chiffres pour ' + size + ' cases). '
            + 'Ces cases leur sont réservées : on retire tous leurs autres candidats.',
        };
        if (out) out.push(inst); else return inst;
      }
    }
    return null;
  }

  // 10/11. Candidats verrouillés "pointants" (paire/triplet pointant).
  //   Dans un bloc, un chiffre n'a de candidats que sur une seule ligne (ou colonne)
  //   -> on l'élimine du reste de cette ligne/colonne, hors du bloc.
  function detectPointing(g, cands, size, out) {
    for (const box of BOXES) {
      const present = new Set(box.cells.map((i) => g[i]).filter(Boolean));
      for (let d = 1; d <= 9; d++) {
        if (present.has(d)) continue;
        const spots = box.cells.filter((i) => !g[i] && (cands[i] & bit(d)));
        if (spots.length < 2 || spots.length > 3) continue;
        if (size && spots.length !== size) continue;
        const rows = new Set(spots.map(rowOf)), cols = new Set(spots.map(colOf));
        let line = null;
        if (rows.size === 1) line = ROWS[[...rows][0]];
        else if (cols.size === 1) line = COLS[[...cols][0]];
        if (!line) continue;
        const elims = [];
        for (const i of line.cells) {
          if (boxOf(i) === box.idx || g[i]) continue;
          if (cands[i] & bit(d)) elims.push({ cell: i, digit: d });
        }
        if (!elims.length) continue;
        const inst = {
          technique: spots.length === 2 ? 'pointingPair' : 'pointingTriple',
          eliminations: elims,
          highlight: { unitCells: box.cells.slice(), lineCells: line.cells.slice(), cells: spots.slice(), baseDigits: [d], elim: elims.slice() },
          explain: 'Dans ' + unitName(box) + ', le chiffre ' + d + ' n’a de candidats que sur '
            + unitName(line) + ' (cases ' + cellsName(spots) + '). Il sera donc forcément dans le bloc, '
            + 'sur cette ' + (line.type === 'row' ? 'ligne' : 'colonne') + ' : on retire le ' + d
            + ' du reste de ' + unitName(line) + ', hors du bloc.',
        };
        if (out) out.push(inst); else return inst;
      }
    }
    return null;
  }

  // 12/14. Poisson (Fish) : X-Wing (size 2) et Swordfish (size 3).
  //   Un chiffre confiné, sur `size` lignes de base, à `size` colonnes de couverture
  //   (ou l'inverse) -> on l'élimine de ces colonnes dans les autres lignes.
  function digitPositions(g, cands, d) {
    const bd = bit(d);
    const rowCols = Array.from({ length: 9 }, () => []);
    const colRows = Array.from({ length: 9 }, () => []);
    for (let i = 0; i < 81; i++) {
      if (g[i] || !(cands[i] & bd)) continue;
      rowCols[rowOf(i)].push(colOf(i));
      colRows[colOf(i)].push(rowOf(i));
    }
    return { rowCols, colRows };
  }

  function detectFish(g, cands, size, out) {
    for (let d = 1; d <= 9; d++) {
      const pos = digitPositions(g, cands, d);
      for (const base of ['row', 'col']) {
        const linePos = base === 'row' ? pos.rowCols : pos.colRows;
        const baseLines = [];
        for (let l = 0; l < 9; l++) if (linePos[l].length >= 2 && linePos[l].length <= size) baseLines.push(l);
        if (baseLines.length < size) continue;
        for (const combo of combos(baseLines, size)) {
          const coverSet = new Set();
          for (const l of combo) linePos[l].forEach((x) => coverSet.add(x));
          if (coverSet.size !== size) continue;
          const cover = [...coverSet];
          const baseSet = new Set(combo);
          const bd = bit(d);
          const at = (l, x) => (base === 'row' ? l * 9 + x : x * 9 + l);
          const elims = [];
          for (const x of cover) for (let l = 0; l < 9; l++) {
            if (baseSet.has(l)) continue;
            const cell = at(l, x);
            if (!g[cell] && (cands[cell] & bd)) elims.push({ cell, digit: d });
          }
          if (!elims.length) continue;
          const baseCells = [];
          for (const l of combo) for (const x of linePos[l]) baseCells.push(at(l, x));
          const lineCells = [];
          for (const x of cover) for (let l = 0; l < 9; l++) lineCells.push(at(l, x));
          const baseName = base === 'row' ? 'lignes' : 'colonnes';
          const coverName = base === 'row' ? 'colonnes' : 'lignes';
          const inst = {
            technique: size === 2 ? 'xWing' : 'swordfish',
            eliminations: elims,
            highlight: { cells: baseCells, lineCells, baseDigits: [d], elim: elims.slice() },
            explain: 'Le chiffre ' + d + (size === 2 ? ' forme un X-Wing' : ' forme un Swordfish')
              + ' : sur les ' + baseName + ' ' + combo.map((l) => l + 1).join(', ')
              + ', il n’est candidat que dans les ' + coverName + ' ' + cover.map((c) => c + 1).join(', ')
              + '. Dans la solution, ces ' + baseName + ' y placeront le ' + d + ' (une fois par '
              + coverName.slice(0, -1) + ') : on élimine donc le ' + d + ' de ces ' + coverName
              + ' dans les autres ' + baseName + '.',
          };
          if (out) out.push(inst); else return inst;
        }
      }
    }
    return null;
  }

  // 13. Y-Wing (XY-Wing) : pivot bivaleur {A,B} relié à deux pinces {A,C} et {B,C}.
  //   Le chiffre C s'élimine de toute case voyant les DEUX pinces.
  function detectYWing(g, cands, out) {
    const biv = [];
    for (let i = 0; i < 81; i++) if (!g[i] && popcount(cands[i]) === 2) biv.push(i);
    for (const P of biv) {
      const [a, b] = digitsOf(cands[P]);
      const peersBiv = PEERS[P].filter((p) => !g[p] && popcount(cands[p]) === 2);
      for (const Q of peersBiv) {
        const qd = digitsOf(cands[Q]);
        const sharedQ = qd.filter((x) => x === a || x === b);
        if (sharedQ.length !== 1) continue;          // Q partage exactement un chiffre du pivot
        const x = sharedQ[0];
        const c = qd.find((z) => z !== x);            // 3e chiffre (Z)
        if (c === a || c === b) continue;
        const y = x === a ? b : a;                    // l'autre chiffre du pivot
        for (const R of peersBiv) {
          if (R === Q) continue;
          const rd = digitsOf(cands[R]);
          if (rd.length !== 2 || !rd.includes(y) || !rd.includes(c)) continue; // R = {y, c}
          const seesQ = new Set(PEERS[Q]);
          const bc = bit(c);
          const elims = [];
          for (const cell of PEERS[R]) {
            if (cell === P || cell === Q || cell === R) continue;
            if (!seesQ.has(cell) || g[cell] || !(cands[cell] & bc)) continue;
            elims.push({ cell, digit: c });
          }
          if (!elims.length) continue;
          const inst = {
            technique: 'yWing',
            eliminations: elims,
            highlight: { cells: [P, Q, R], baseDigits: [a, b, c], elim: elims.slice() },
            explain: 'Y-Wing : la case pivot ' + cellName(P) + ' {' + a + ', ' + b + '} voit deux « pinces » '
              + cellName(Q) + ' {' + x + ', ' + c + '} et ' + cellName(R) + ' {' + y + ', ' + c + '}. '
              + 'Quelle que soit la valeur du pivot, l’une des deux pinces vaudra ' + c + ' : toute case '
              + 'voyant les deux pinces ne peut donc pas contenir ' + c + '. On retire le ' + c + ' de '
              + cellsName(elims.map((e) => e.cell)) + '.',
          };
          if (out) out.push(inst); else return inst;
        }
      }
    }
    return null;
  }

  // =========================================================================
  //  SOLVEUR PAR PALIERS (pour amener une position au "prochain pas = T")
  // =========================================================================
  const SOLVERS = [
    { rank: 1, fn: detectFullHouse },
    { rank: 2, fn: (g, c) => detectHiddenSingle(g, c, 'box') },
    { rank: 3, fn: detectNakedSingle },
    { rank: 4, fn: (g, c) => detectHiddenSingle(g, c, 'all') },
    { rank: 5, fn: (g, c) => detectNakedSubset(g, c, 2) },
    { rank: 6, fn: (g, c) => detectNakedSubset(g, c, 3) },
    { rank: 7, fn: (g, c) => detectHiddenSubset(g, c, 2) },
    { rank: 8, fn: (g, c) => detectHiddenSubset(g, c, 3) },
    { rank: 9, fn: (g, c) => detectPointing(g, c, 0) },
    { rank: 11, fn: (g, c) => detectFish(g, c, 2) },   // X-Wing
    { rank: 12, fn: detectYWing },                     // Y-Wing
    { rank: 13, fn: (g, c) => detectFish(g, c, 3) },   // Swordfish
  ];

  function solveBelow(g, cands, rT) {
    for (const s of SOLVERS) {
      if (s.rank >= rT) break;
      const inst = s.fn(g, cands);
      if (inst) return inst;
    }
    return null;
  }

  function solveFull(g, cands) {
    for (const s of SOLVERS) { const inst = s.fn(g, cands); if (inst) return inst; }
    return null;
  }

  function validInstance(inst, solution) {
    if (inst.placements) for (const { cell, digit } of inst.placements) if (solution[cell] !== digit) return false;
    if (inst.eliminations) for (const { cell, digit } of inst.eliminations) if (solution[cell] === digit) return false;
    return true;
  }

  // =========================================================================
  //  CATALOGUE DES LEÇONS (vague 1)
  // =========================================================================
  const LESSONS = [
    {
      id: 'fullHouse', title: 'Dernière case libre', level: 'debutant', rank: 1,
      detect: detectFullHouse, gen: ['facile', 'moyen'],
      summary: 'Quand une ligne, une colonne ou un bloc n’a plus qu’une seule case vide, le chiffre à y mettre est le seul manquant de cette unité.',
      how: 'Repère une unité (ligne, colonne ou bloc) où 8 cases sont déjà remplies. La 9e ne peut accueillir que le chiffre absent.',
    },
    {
      id: 'lastRemaining', title: 'Dernière case restante', level: 'debutant', rank: 2,
      detect: (g, c, out) => detectHiddenSingle(g, c, 'box', out), gen: ['facile', 'moyen'],
      summary: 'Dans un bloc, un chiffre ne peut souvent aller que dans une seule case, parce que les autres voient déjà ce chiffre sur leur ligne ou leur colonne.',
      how: 'Choisis un chiffre, balaie un bloc : barre les cases où ce chiffre apparaît déjà sur la ligne ou la colonne. S’il ne reste qu’une case, c’est là.',
    },
    {
      id: 'lastPossible', title: 'Dernier chiffre possible', level: 'debutant', rank: 3,
      detect: detectNakedSingle, gen: ['facile', 'moyen'],
      summary: 'Une case qui « voit » déjà huit chiffres différents (sur sa ligne, sa colonne et son bloc) n’a plus qu’un seul chiffre possible.',
      how: 'Pour une case vide, liste les chiffres présents dans sa ligne, sa colonne et son bloc. S’il n’en manque qu’un, place-le.',
    },
    {
      id: 'nakedSingle', title: 'Singletons nus', level: 'technique', rank: 3,
      detect: detectNakedSingle, gen: ['moyen', 'difficile'],
      summary: 'Avec les annotations : une case dont il ne reste qu’un seul candidat est un « singleton nu » — ce candidat est la solution.',
      how: 'En notant les candidats de chaque case, cherche une case avec un unique candidat. C’est la version annotée du « dernier chiffre possible ».',
    },
    {
      id: 'hiddenSingle', title: 'Singletons cachés', level: 'technique', rank: 4,
      detect: (g, c, out) => detectHiddenSingle(g, c, 'all', out), gen: ['moyen', 'difficile'],
      summary: 'Un « singleton caché » : dans une ligne, une colonne ou un bloc, un chiffre n’a qu’une seule case candidate, même si cette case a d’autres candidats.',
      how: 'Pour chaque chiffre, regarde dans une unité combien de cases peuvent l’accueillir. Une seule ? Le chiffre y va, peu importe ses autres candidats.',
    },
    {
      id: 'nakedPair', title: 'Paires nues', level: 'technique', rank: 5,
      detect: (g, c, out) => detectNakedSubset(g, c, 2, out), gen: ['difficile', 'expert'],
      summary: 'Deux cases d’une même unité qui portent exactement les deux mêmes candidats {a, b} se réservent ces deux chiffres : on les retire des autres cases de l’unité.',
      how: 'Cherche deux cases alignées (même ligne, colonne ou bloc) avec le même couple de candidats. Ces deux chiffres n’iront nulle part ailleurs dans l’unité.',
    },
    {
      id: 'nakedTriple', title: 'Triplets nus', level: 'technique', rank: 6,
      detect: (g, c, out) => detectNakedSubset(g, c, 3, out), gen: ['difficile', 'expert'],
      summary: 'Trois cases d’une même unité dont les candidats tiennent en trois chiffres {a, b, c} se réservent ces trois chiffres (chaque case n’a pas besoin des trois).',
      how: 'Trois cases d’une unité dont l’union des candidats fait exactement trois chiffres. On retire ces chiffres des autres cases de l’unité.',
    },
    {
      id: 'hiddenPair', title: 'Paires cachées', level: 'technique', rank: 7,
      detect: (g, c, out) => detectHiddenSubset(g, c, 2, out), gen: ['difficile', 'expert'],
      summary: 'Deux chiffres qui, dans une unité, ne peuvent se placer que dans les deux mêmes cases : ces cases leur sont réservées, on en retire tous les autres candidats.',
      how: 'Trouve deux chiffres dont les seules cases possibles dans l’unité sont les deux mêmes. Nettoie ces deux cases de leurs autres candidats.',
    },
    {
      id: 'hiddenTriple', title: 'Triplets cachés', level: 'technique', rank: 8,
      detect: (g, c, out) => detectHiddenSubset(g, c, 3, out), gen: ['expert'],
      summary: 'Trois chiffres confinés aux trois mêmes cases d’une unité : on retire tous les autres candidats de ces trois cases.',
      how: 'Trois chiffres dont les cases possibles dans l’unité se réduisent à trois cases communes. On y supprime tout le reste.',
    },
    {
      id: 'pointingPair', title: 'Paires pointantes', level: 'technique', rank: 9,
      detect: (g, c, out) => detectPointing(g, c, 2, out), gen: ['difficile', 'expert'],
      summary: 'Dans un bloc, si un chiffre n’a que deux cases candidates et qu’elles sont sur la même ligne (ou colonne), ce chiffre quitte le reste de cette ligne/colonne.',
      how: 'Un chiffre confiné à deux cases d’un bloc, alignées : il « pointe » sur cette ligne/colonne et s’élimine ailleurs sur celle-ci.',
    },
    {
      id: 'pointingTriple', title: 'Triplets pointants', level: 'technique', rank: 9,
      detect: (g, c, out) => detectPointing(g, c, 3, out), gen: ['expert'],
      summary: 'Même idée que la paire pointante, mais le chiffre occupe trois cases alignées d’un bloc.',
      how: 'Un chiffre confiné à trois cases alignées d’un bloc s’élimine du reste de leur ligne ou colonne.',
    },
    {
      id: 'xWing', title: 'X-Wing', level: 'avance', rank: 11,
      detect: (g, c, out) => detectFish(g, c, 2, out), gen: ['expert'],
      summary: 'Un chiffre candidat dans seulement deux cases sur deux lignes, alignées sur les deux mêmes colonnes, forme un rectangle (X-Wing) : on l’élimine de ces deux colonnes ailleurs (et symétriquement lignes ↔ colonnes).',
      how: 'Repère un chiffre confiné à 2 cases sur deux lignes, dans les deux mêmes colonnes. Élimine-le de ces colonnes dans les autres lignes (ou l’inverse).',
    },
    {
      id: 'yWing', title: 'Y-Wing', level: 'avance', rank: 12,
      detect: detectYWing, gen: ['expert'],
      summary: 'Trois cases à deux candidats formant une chaîne : un pivot {X, Y} relié à deux pinces {X, Z} et {Y, Z}. Le chiffre Z s’élimine de toute case qui voit les deux pinces.',
      how: 'Trouve une case pivot {X, Y} reliée à deux pinces {X, Z} et {Y, Z}. Le Z disparaît des cases voyant les deux pinces.',
    },
    {
      id: 'swordfish', title: 'Swordfish', level: 'avance', rank: 13,
      detect: (g, c, out) => detectFish(g, c, 3, out), gen: ['expert'],
      summary: 'La généralisation du X-Wing à trois lignes et trois colonnes : un chiffre confiné, sur trois lignes, à trois colonnes communes s’élimine de ces colonnes dans les autres lignes (et inversement).',
      how: 'Trois lignes où le chiffre tient dans (au plus) trois colonnes communes. Élimine-le de ces trois colonnes dans les autres lignes.',
    },
  ];
  const LESSON_BY_ID = {};
  for (const l of LESSONS) LESSON_BY_ID[l.id] = l;

  // =========================================================================
  //  GÉNÉRATION D'EXERCICES
  // =========================================================================
  function generateExercise(lessonId, maxAttempts) {
    const lesson = LESSON_BY_ID[lessonId];
    if (!lesson) return null;
    maxAttempts = maxAttempts || 400;
    const diffs = lesson.gen;
    for (let a = 0; a < maxAttempts; a++) {
      const diff = diffs[a % diffs.length];
      const { puzzle, solution } = E.generatePuzzle(diff);
      const g = puzzle.slice();
      const cands = computeCands(g);
      // On déroule TOUTE la résolution. À chaque fois que les techniques plus
      // simples sont épuisées, on regarde si la technique visée est le prochain
      // pas logique ; sinon on avance d'un cran (technique de rang ≥ cible) et on
      // continue — ainsi on attrape même les techniques rares plus loin dans la grille.
      let guard = 0;
      while (guard++ < 300) {
        const below = solveBelow(g, cands, lesson.rank);
        if (below) { applyInstance(g, cands, below); continue; }
        // Techniques plus simples épuisées : la technique visée applicable ICI ?
        // On exige UNE SEULE instance (sinon l'exercice aurait plusieurs solutions).
        const all = detectAllInstances(lessonId, g, cands, solution);
        if (all.length === 1) {
          return { lessonId, grid: g.slice(), givens: g.slice(), cands: cands.slice(), solution, instance: all[0] };
        }
        const next = solveFull(g, cands); // applique une instance (rang ≥ cible) et on continue
        if (!next) break;                  // grille bloquée même avec tout l'arsenal
        applyInstance(g, cands, next);
      }
    }
    return null;
  }

  // Toutes les instances de la technique d'une leçon présentes dans la position
  // (dédoublonnées ; pour un motif vu via plusieurs unités, on fusionne ses
  // éliminations). Sert au mode entraînement à révéler TOUTES les solutions.
  function instKey(inst) {
    if (inst.placements) return 'P:' + inst.placements.map((p) => p.cell + '.' + p.digit).sort().join(',');
    const cells = (inst.highlight.cells || []).slice().sort((a, b) => a - b).join('.');
    const ds = (inst.highlight.baseDigits || []).slice().sort((a, b) => a - b).join('.');
    return inst.technique + '|' + cells + '|' + ds;
  }

  function detectAllInstances(lessonId, g, cands, solution) {
    const lesson = LESSON_BY_ID[lessonId];
    if (!lesson) return [];
    const raw = [];
    lesson.detect(g, cands, raw);
    const map = new Map();
    for (const inst of raw) {
      if (solution && !validInstance(inst, solution)) continue;
      const key = instKey(inst);
      if (!map.has(key)) { map.set(key, inst); continue; }
      // même motif vu via une autre unité -> on fusionne les éliminations
      const ex = map.get(key);
      if (inst.eliminations && ex.eliminations) {
        for (const e of inst.eliminations) {
          if (!ex.eliminations.some((x) => x.cell === e.cell && x.digit === e.digit)) ex.eliminations.push(e);
        }
        ex.highlight.elim = ex.eliminations.slice();
      }
    }
    return [...map.values()];
  }

  global.SudokuTech = {
    LESSONS, LESSON_BY_ID,
    computeCands, applyInstance, solveBelow, generateExercise, detectAllInstances,
    detectFullHouse, detectHiddenSingle, detectNakedSingle,
    detectNakedSubset, detectHiddenSubset, detectPointing,
    detectFish, detectYWing, solveFull,
    cellName, unitName, digitsOf,
    UNIT_DEFS, PEERS,
  };
})(typeof window !== 'undefined' ? window : globalThis);

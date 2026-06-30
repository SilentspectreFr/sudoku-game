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
  const SUBSET_NAME = { 2: 'Pair', 3: 'Triple', 4: 'Quad' };
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
          technique: 'naked' + SUBSET_NAME[size],
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
          technique: 'hidden' + SUBSET_NAME[size],
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

  // 10b. Candidats verrouillés "claiming" (réduction ligne→bloc).
  //   Complément du pointant : dans une ligne (ou colonne), un chiffre n'a de
  //   candidats que dans un seul bloc -> on l'élimine du reste de ce bloc.
  function detectClaiming(g, cands, out) {
    const lines = ROWS.concat(COLS);
    for (const line of lines) {
      const present = new Set(line.cells.map((i) => g[i]).filter(Boolean));
      for (let d = 1; d <= 9; d++) {
        if (present.has(d)) continue;
        const spots = line.cells.filter((i) => !g[i] && (cands[i] & bit(d)));
        if (spots.length < 2 || spots.length > 3) continue;
        const boxes = new Set(spots.map(boxOf));
        if (boxes.size !== 1) continue;
        const box = BOXES[[...boxes][0]];
        const elims = [];
        for (const i of box.cells) {
          if (line.cells.includes(i) || g[i]) continue;
          if (cands[i] & bit(d)) elims.push({ cell: i, digit: d });
        }
        if (!elims.length) continue;
        const inst = {
          technique: 'claiming',
          eliminations: elims,
          highlight: { unitCells: line.cells.slice(), lineCells: box.cells.slice(), cells: spots.slice(), baseDigits: [d], elim: elims.slice() },
          explain: 'Dans ' + unitName(line) + ', le chiffre ' + d + ' n’a de candidats que dans '
            + unitName(box) + ' (cases ' + cellsName(spots) + '). Il sera donc forcément dans ce bloc, '
            + 'sur cette ' + (line.type === 'row' ? 'ligne' : 'colonne') + ' : on retire le ' + d
            + ' du reste de ' + unitName(box) + '.',
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

  // 15. XYZ-Wing : pivot trivaleur {a,b,c} relié à deux pinces bivalues {a,c} et {b,c}.
  //   Le chiffre c (commun au pivot et aux deux pinces) s'élimine de toute case
  //   voyant À LA FOIS le pivot et les deux pinces.
  function detectXYZWing(g, cands, out) {
    const empties = [];
    for (let i = 0; i < 81; i++) if (!g[i]) empties.push(i);
    const pivots = empties.filter((i) => popcount(cands[i]) === 3);
    const bivs = empties.filter((i) => popcount(cands[i]) === 2);
    for (const P of pivots) {
      const pd = cands[P];
      const pinces = bivs.filter((q) => PEERS[P].includes(q) && (cands[q] & ~pd) === 0);
      for (let i = 0; i < pinces.length; i++) {
        for (let j = i + 1; j < pinces.length; j++) {
          const A = pinces[i], B = pinces[j];
          if ((cands[A] | cands[B]) !== pd) continue;   // l'union des pinces = les 3 chiffres du pivot
          const commonMask = cands[A] & cands[B];
          if (popcount(commonMask) !== 1) continue;     // les pinces partagent exactement un chiffre
          const c = digitsOf(commonMask)[0];
          const bc = bit(c);
          const elims = [];
          for (const cell of PEERS[P]) {
            if (cell === A || cell === B || g[cell] || !(cands[cell] & bc)) continue;
            if (PEERS[A].includes(cell) && PEERS[B].includes(cell)) elims.push({ cell, digit: c });
          }
          if (!elims.length) continue;
          const inst = {
            technique: 'xyzWing',
            eliminations: elims,
            highlight: { cells: [P, A, B], baseDigits: digitsOf(pd), elim: elims.slice() },
            explain: 'XYZ-Wing : le pivot ' + cellName(P) + ' {' + digitsOf(pd).join(', ') + '} et ses deux pinces '
              + cellName(A) + ' {' + digitsOf(cands[A]).join(', ') + '} et ' + cellName(B) + ' {' + digitsOf(cands[B]).join(', ')
              + '} contiennent toutes le ' + c + '. Toute case voyant ces trois cases ne peut pas valoir ' + c
              + ' : on retire le ' + c + ' de ' + cellsName(elims.map((e) => e.cell)) + '.',
          };
          if (out) out.push(inst); else return inst;
        }
      }
    }
    return null;
  }

  // 16. W-Wing : deux cases bivalues IDENTIQUES {a,b}, non voisines, reliées par un
  //   lien fort sur b (une unité où b n'a que 2 cases, voisines respectives des deux).
  //   Alors a s'élimine de toute case voyant les deux cases bivalues.
  function detectWWing(g, cands, out) {
    const bivs = [];
    for (let i = 0; i < 81; i++) if (!g[i] && popcount(cands[i]) === 2) bivs.push(i);
    for (let i = 0; i < bivs.length; i++) {
      for (let j = i + 1; j < bivs.length; j++) {
        const X = bivs[i], Y = bivs[j];
        if (cands[X] !== cands[Y]) continue;
        if (PEERS[X].includes(Y)) continue;
        const [d1, d2] = digitsOf(cands[X]);
        for (const link of [d1, d2]) {
          const other = link === d1 ? d2 : d1;
          const bl = bit(link);
          let linked = false;
          for (const u of UNIT_DEFS) {
            const spots = u.cells.filter((k) => !g[k] && (cands[k] & bl));
            if (spots.length !== 2) continue;
            const [s1, s2] = spots;
            if (s1 === X || s1 === Y || s2 === X || s2 === Y) continue;
            if ((PEERS[X].includes(s1) && PEERS[Y].includes(s2)) || (PEERS[X].includes(s2) && PEERS[Y].includes(s1))) { linked = true; break; }
          }
          if (!linked) continue;
          const bo = bit(other);
          const elims = [];
          for (let cell = 0; cell < 81; cell++) {
            if (cell === X || cell === Y || g[cell] || !(cands[cell] & bo)) continue;
            if (PEERS[X].includes(cell) && PEERS[Y].includes(cell)) elims.push({ cell, digit: other });
          }
          if (!elims.length) continue;
          const inst = {
            technique: 'wWing',
            eliminations: elims,
            highlight: { cells: [X, Y], baseDigits: [d1, d2], elim: elims.slice() },
            explain: 'W-Wing : les cases ' + cellName(X) + ' et ' + cellName(Y) + ' portent la même paire {'
              + d1 + ', ' + d2 + '}, reliées par un lien fort sur le ' + link + '. L’une des deux vaudra donc ' + other
              + ' : toute case voyant les deux ne peut pas valoir ' + other + '. On retire le ' + other + ' de '
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
    { rank: 10, fn: detectClaiming },                   // box/line reduction
    { rank: 11, fn: (g, c) => detectNakedSubset(g, c, 4) },   // Quad nu
    { rank: 13, fn: (g, c) => detectFish(g, c, 2) },   // X-Wing
    { rank: 14, fn: detectYWing },                     // Y-Wing
    { rank: 15, fn: detectXYZWing },                   // XYZ-Wing
    { rank: 16, fn: detectWWing },                     // W-Wing
    { rank: 17, fn: (g, c) => detectFish(g, c, 3) },   // Swordfish
  ];

  // Rang d'une technique par son id (SOLVERS étant indexé par fonction). Sert à la
  // gradation : on suit le rang max réellement requis pour résoudre une grille.
  const TECH_RANK = {
    fullHouse: 1, nakedSingle: 3,
    nakedPair: 5, nakedTriple: 6, hiddenPair: 7, hiddenTriple: 8,
    pointingPair: 9, pointingTriple: 9, claiming: 10,
    nakedQuad: 11,
    xWing: 13, yWing: 14, xyzWing: 15, wWing: 16, swordfish: 17,
  };
  // hiddenSingle dépend du scope (box=2, all=4) — résolu à part dans rankOf.
  function rankOf(inst) {
    if (inst.technique === 'hiddenSingle') return inst.scope === 'box' ? 2 : 4;
    return TECH_RANK[inst.technique] || 0;
  }

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

  // =========================================================================
  //  GRADATION & GÉNÉRATION GRADUÉE (bornée à l'arsenal)
  // =========================================================================
  // Résout une grille avec TOUT l'arsenal et renvoie {solved, maxRank, techniquesUsed}.
  // C'est ce qui garantit qu'une grille livrée est résoluble sans deviner, et qui
  // mesure le rang de la technique la plus dure réellement requise.
  function gradePuzzle(puzzle) {
    const g = puzzle.slice();
    const cands = computeCands(g);
    let maxRank = 0; const used = {};
    for (let guard = 0; guard < 400; guard++) {
      const inst = solveFull(g, cands);
      if (!inst) break;
      const r = rankOf(inst);
      if (r > maxRank) maxRank = r;
      used[inst.technique] = (used[inst.technique] || 0) + 1;
      applyInstance(g, cands, inst);
    }
    return { solved: isSolved(g), maxRank, techniquesUsed: used };
  }

  // Bandes de difficulté : on conserve les minGivens du moteur (ressenti inchangé) et on
  // AJOUTE une borne par rang de technique. floor = il faut au moins une technique de ce
  // rang ; ceil = rien au-dessus (et la grille DOIT être résoluble par l'arsenal).
  //   facile/moyen : singles only (ceil 4). difficile : au-delà des singles. expert :
  //   préfère une technique avancée (floor 13), plancher relâchable si le budget l'exige.
  const DIFF_BANDS = {
    facile:    { minGivens: 42, floor: 1, ceil: 4,  preferFloor: 1,  maxAttempts: 40 },
    moyen:     { minGivens: 35, floor: 1, ceil: 4,  preferFloor: 1,  maxAttempts: 40 },
    difficile: { minGivens: 30, floor: 5, ceil: 17, preferFloor: 5,  maxAttempts: 120 },
    expert:    { minGivens: 26, floor: 5, ceil: 17, preferFloor: 13, maxAttempts: 200 },
  };

  // Génère une grille GARANTIE résoluble par l'arsenal et dans la bande du niveau.
  // Pilote directement les primitives du moteur (generateFull/digPuzzle) puis grade.
  function generatePuzzleGraded(difficulty) {
    const band = DIFF_BANDS[difficulty] || DIFF_BANDS.facile;
    let best = null;
    for (let attempt = 0; attempt < band.maxAttempts; attempt++) {
      const solution = E.generateFull();
      const { puzzle, givens } = E.digPuzzle(solution, band.minGivens);
      const grade = gradePuzzle(puzzle);
      if (!grade.solved) continue;                 // jamais d'impasse : rejet dur
      if (grade.maxRank > band.ceil) continue;     // trop dur pour la bande : rejet dur
      const cand = { puzzle, solution, givens, difficulty, maxRank: grade.maxRank, techniquesUsed: grade.techniquesUsed };
      if (!best || grade.maxRank > best.maxRank) best = cand; // garde la plus relevée vue
      if (grade.maxRank >= band.preferFloor) return cand;     // plancher « idéal » atteint
    }
    if (best && best.maxRank >= band.floor) return best;      // plancher minimal accepté
    if (best) return best;                                     // résoluble, sous le plancher
    return fallbackSolvedPuzzle(difficulty);                   // garde-fou ultime
  }

  // Repli ultime : remonte le nombre d'indices jusqu'à une grille résoluble par l'arsenal.
  // Termine toujours (une grille résoluble par singles l'est par l'arsenal).
  function fallbackSolvedPuzzle(difficulty) {
    for (let givensTarget = (DIFF_BANDS[difficulty] || DIFF_BANDS.facile).minGivens; givensTarget <= 60; givensTarget += 4) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const solution = E.generateFull();
        const { puzzle, givens } = E.digPuzzle(solution, givensTarget);
        const grade = gradePuzzle(puzzle);
        if (grade.solved) return { puzzle, solution, givens, difficulty, maxRank: grade.maxRank, techniquesUsed: grade.techniquesUsed };
      }
    }
    // ne devrait jamais arriver : grille pleine = résoluble trivialement
    const solution = E.generateFull();
    return { puzzle: solution.slice(), solution, givens: 81, difficulty, maxRank: 0, techniquesUsed: {} };
  }

  // Garde-fou anti-régression, sans DOM : par niveau, génère perLevel grilles et vérifie
  // qu'elles sont TOUTES résolubles par l'arsenal et dans le plafond de la bande.
  function selfTestGraded(perLevel) {
    perLevel = perLevel || 30;
    const report = {};
    for (const diff of Object.keys(DIFF_BANDS)) {
      const band = DIFF_BANDS[diff];
      let solvedAll = true, withinCeil = true, floorHits = 0, sumGivens = 0;
      for (let i = 0; i < perLevel; i++) {
        const p = generatePuzzleGraded(diff);
        const grade = gradePuzzle(p.puzzle);
        if (!grade.solved) solvedAll = false;
        if (grade.maxRank > band.ceil) withinCeil = false;
        if (grade.maxRank >= band.preferFloor) floorHits++;
        sumGivens += p.givens;
      }
      report[diff] = { solvedAll, withinCeil, floorRate: Math.round(100 * floorHits / perLevel), avgGivens: Math.round(sumGivens / perLevel) };
    }
    return report;
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
      id: 'claiming', title: 'Réduction ligne→bloc', level: 'technique', rank: 10,
      detect: (g, c, out) => detectClaiming(g, c, out), gen: ['difficile', 'expert'],
      summary: 'Le complément du pointant : si dans une ligne (ou colonne) un chiffre n’a de candidats que dans un seul bloc, ce chiffre quitte le reste de ce bloc.',
      how: 'Un chiffre confiné, dans une ligne/colonne, aux cases d’un seul bloc : on le « revendique » pour ce bloc et on l’élimine des autres cases du bloc.',
    },
    {
      id: 'nakedQuad', title: 'Quadruplets nus', level: 'technique', rank: 11,
      detect: (g, c, out) => detectNakedSubset(g, c, 4, out), gen: ['expert'],
      summary: 'Quatre cases d’une même unité dont les candidats tiennent en quatre chiffres se réservent ces quatre chiffres : on les retire des autres cases de l’unité.',
      how: 'Quatre cases d’une unité dont l’union des candidats fait exactement quatre chiffres. On retire ces chiffres des autres cases de l’unité.',
    },
    {
      id: 'xWing', title: 'X-Wing', level: 'avance', rank: 13,
      detect: (g, c, out) => detectFish(g, c, 2, out), gen: ['expert'],
      summary: 'Un chiffre candidat dans seulement deux cases sur deux lignes, alignées sur les deux mêmes colonnes, forme un rectangle (X-Wing) : on l’élimine de ces deux colonnes ailleurs (et symétriquement lignes ↔ colonnes).',
      how: 'Repère un chiffre confiné à 2 cases sur deux lignes, dans les deux mêmes colonnes. Élimine-le de ces colonnes dans les autres lignes (ou l’inverse).',
    },
    {
      id: 'yWing', title: 'Y-Wing', level: 'avance', rank: 14,
      detect: detectYWing, gen: ['expert'],
      summary: 'Trois cases à deux candidats formant une chaîne : un pivot {X, Y} relié à deux pinces {X, Z} et {Y, Z}. Le chiffre Z s’élimine de toute case qui voit les deux pinces.',
      how: 'Trouve une case pivot {X, Y} reliée à deux pinces {X, Z} et {Y, Z}. Le Z disparaît des cases voyant les deux pinces.',
    },
    {
      id: 'xyzWing', title: 'XYZ-Wing', level: 'avance', rank: 15,
      detect: (g, c, out) => detectXYZWing(g, c, out), gen: ['expert'],
      summary: 'Variante du Y-Wing où le pivot porte trois candidats {X, Y, Z} et ses deux pinces {X, Z} et {Y, Z}. Le Z s’élimine des cases voyant le pivot ET les deux pinces.',
      how: 'Un pivot à trois chiffres relié à deux pinces partageant un Z commun : le Z disparaît des cases voyant les trois.',
    },
    {
      id: 'wWing', title: 'W-Wing', level: 'avance', rank: 16,
      detect: (g, c, out) => detectWWing(g, c, out), gen: ['expert'],
      summary: 'Deux cases à la même paire {a, b}, reliées par un lien fort sur b : l’une des deux vaut forcément a. Le a s’élimine de toute case voyant ces deux cases.',
      how: 'Deux bivaleurs identiques {a, b} reliés par une unité où b n’a que deux places : on retire a des cases voyant les deux.',
    },
    {
      id: 'swordfish', title: 'Swordfish', level: 'avance', rank: 17,
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
    detectNakedSubset, detectHiddenSubset, detectPointing, detectClaiming,
    detectFish, detectYWing, detectXYZWing, detectWWing, solveFull,
    gradePuzzle, generatePuzzleGraded, selfTestGraded, DIFF_BANDS, rankOf,
    cellName, unitName, digitsOf,
    UNIT_DEFS, PEERS,
  };
})(typeof window !== 'undefined' ? window : globalThis);

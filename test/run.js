/*
 * test/run.js — tests de non-régression des moteurs PURS (sans DOM).
 * Lancé par `npm test` et par la CI GitHub. Sort en code 1 si un test échoue.
 *
 * Couvre la doctrine du projet :
 *  - moteur : chaque grille générée a une SOLUTION UNIQUE et reste cohérente ;
 *  - techniques : chaque exercice généré est VALIDE contre la solution
 *    (placement = solution ; élimination ≠ solution) — revérifié ici, sans
 *    faire confiance au générateur.
 */
require('../js/sudoku-engine.js');
require('../js/techniques.js');
const E = globalThis.SudokuEngine;
const T = globalThis.SudokuTech;

let failures = 0;
const ok = (m) => console.log('  ✓ ' + m);
const fail = (m) => { console.error('  ✗ ' + m); failures++; };

// 1) Moteur — self-test unicité/cohérence par difficulté.
console.log('Moteur — self-test :');
const report = E.selfTest();
for (const [diff, r] of Object.entries(report)) {
  (r.unique && r.consistent)
    ? ok(`${diff} : grille unique & cohérente (${r.givens} indices)`)
    : fail(`${diff} : unique=${r.unique} consistent=${r.consistent}`);
}

// 2) Moteur — lot de grilles : solution unique + puzzle ⊂ solution.
console.log('Moteur — lots de grilles :');
const N_GRIDS = 20;
for (const diff of Object.keys(E.DIFFICULTIES)) {
  let bad = 0;
  for (let i = 0; i < N_GRIDS; i++) {
    const { puzzle, solution } = E.generatePuzzle(diff);
    if (E.countSolutions(puzzle, 2) !== 1) bad++;
    else if (!puzzle.every((v, k) => v === 0 || v === solution[k])) bad++;
  }
  bad === 0 ? ok(`${diff} : ${N_GRIDS} grilles à solution unique`)
            : fail(`${diff} : ${bad}/${N_GRIDS} grilles non conformes`);
}

// 2b) Génération graduée — chaque grille livrée est ENTIÈREMENT résoluble par l'arsenal
//     (zéro impasse « Indice direct ») et reste sous le plafond de rang de sa bande.
console.log('Génération graduée — résolubilité garantie :');
const N_GRADED = 25;
for (const diff of Object.keys(T.DIFF_BANDS)) {
  const ceil = T.DIFF_BANDS[diff].ceil;
  let unsolved = 0, overCeil = 0;
  for (let i = 0; i < N_GRADED; i++) {
    const p = T.generatePuzzleGraded(diff);
    const grade = T.gradePuzzle(p.puzzle);
    if (!grade.solved) unsolved++;
    if (grade.maxRank > ceil) overCeil++;
  }
  if (unsolved > 0) fail(`${diff} : ${unsolved}/${N_GRADED} grilles NON résolubles par l'arsenal`);
  else if (overCeil > 0) fail(`${diff} : ${overCeil}/${N_GRADED} grilles au-dessus du plafond (rang ${ceil})`);
  else ok(`${diff} : ${N_GRADED} grilles 100% résolubles par l'arsenal (≤ rang ${ceil})`);
}

// 3) Techniques — chaque exercice généré est valide contre la solution.
console.log('Techniques — validité des exercices :');
const validInstance = (inst, solution) => {
  if (inst.placements) for (const { cell, digit } of inst.placements) if (solution[cell] !== digit) return false;
  if (inst.eliminations) for (const { cell, digit } of inst.eliminations) if (solution[cell] === digit) return false;
  return true;
};
const N_EX = 3, MAX_ATTEMPTS = 4000;
for (const lesson of T.LESSONS) {
  let made = 0, invalid = 0;
  for (let i = 0; i < N_EX; i++) {
    const ex = T.generateExercise(lesson.id, MAX_ATTEMPTS);
    if (!ex) continue;
    made++;
    if (!validInstance(ex.instance, ex.solution)) invalid++;
  }
  if (invalid > 0) fail(`${lesson.id} : ${invalid}/${made} instances INVALIDES`);
  else if (made === 0) fail(`${lesson.id} : aucun exercice généré`);
  else ok(`${lesson.id} : ${made} exercice(s) valide(s)`);
}

console.log('');
if (failures) { console.error(`ÉCHEC — ${failures} test(s) en échec`); process.exit(1); }
console.log('OK — tous les tests passent.'); process.exit(0);

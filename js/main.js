/*
 * main.js — bootstrap. Lance le jeu une fois le DOM prêt et exécute un
 * auto-test léger du moteur en console (garde-fou anti-régression).
 */
(function () {
  'use strict';

  function boot() {
    window.Game.init();

    // Auto-test différé pour ne pas retarder le premier rendu.
    setTimeout(() => {
      try {
        const rep = window.SudokuEngine.selfTest();
        const ok = Object.values(rep).every((r) => r.unique && r.consistent);
        console.log('%c[Sudoku] self-test moteur ' + (ok ? 'OK ✓' : 'ÉCHEC ✗'),
          'color:' + (ok ? '#16a34a' : '#dc2626') + ';font-weight:bold');
        console.table(rep);

        // Garde-fou génération graduée : toute grille livrée est résoluble par l'arsenal.
        if (window.SudokuTech && window.SudokuTech.selfTestGraded) {
          const grep = window.SudokuTech.selfTestGraded(12);
          const gok = Object.values(grep).every((r) => r.solvedAll && r.withinCeil);
          console.log('%c[Sudoku] self-test génération graduée ' + (gok ? 'OK ✓' : 'ÉCHEC ✗'),
            'color:' + (gok ? '#16a34a' : '#dc2626') + ';font-weight:bold');
          console.table(grep);
        }
      } catch (e) {
        console.warn('[Sudoku] self-test indisponible', e);
      }
    }, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

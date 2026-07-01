/*
 * version.js — SOURCE UNIQUE de la version de l'application.
 *
 * Ce numéro sert à deux choses, d'où le fichier partagé :
 *   1. Affichage : il remplit tout élément portant l'attribut [data-app-version]
 *      (le pied de page des pages).
 *   2. Cache du service worker : sw.js fait `importScripts('./js/version.js')`
 *      et nomme son cache `sudoku-v{APP_VERSION}`. Bumper la version renomme donc
 *      le cache tout seul → les visiteurs reçoivent la nouvelle version sans
 *      qu'on ait à toucher sw.js (fini l'oubli de bump du cache).
 *
 * ⚠️ Bump APP_VERSION (semver MAJOR.MINOR.PATCH) à CHAQUE release qui change un
 *    fichier livré. C'est le seul endroit à modifier.
 *
 * Fonctionne dans une page (self === window) ET dans un service worker
 * (self === worker global, pas de `document`).
 */
self.APP_VERSION = '1.4.0';

if (typeof document !== 'undefined') {
  var applyVersion = function () {
    var label = 'v' + self.APP_VERSION;
    var nodes = document.querySelectorAll('[data-app-version]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = label;
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyVersion);
  } else {
    applyVersion();
  }
}

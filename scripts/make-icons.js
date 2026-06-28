// Génère les icônes PWA en pur JS (zéro dépendance, zlib intégré de Node).
// Design : fond indigo plein (charte), panneau blanc arrondi, grille 9x9 avec
// quelques cases remplies. Full-bleed -> propre en icône iOS + "maskable" Android.
// Lancer : node scripts/make-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const COL = {
  indigo:   [0x4f, 0x63, 0xd2],
  indigoHi: [0x3a, 0x4c, 0xc0],
  white:    [0xff, 0xff, 0xff],
  ink:      [0x2b, 0x3a, 0x52],
  line:     [0xc8, 0xd0, 0xe0],
};

function makeIcon(N) {
  const buf = new Uint8Array(N * N * 4);
  const px = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  const rect = (x, y, w, h, c) => {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) px(xx, yy, c);
  };
  // Fond indigo plein bord à bord (maskable-safe, iOS sans transparence).
  rect(0, 0, N, N, COL.indigo);

  // Panneau blanc arrondi dans la zone de sécurité (~76%).
  const pad = N * 0.12;            // marge -> reste dans le safe zone maskable
  const P = N - 2 * pad;           // côté du panneau
  const rad = N * 0.06;            // rayon des coins
  for (let yy = 0; yy < P; yy++) {
    for (let xx = 0; xx < P; xx++) {
      // coins arrondis
      const dx = Math.min(xx, P - 1 - xx), dy = Math.min(yy, P - 1 - yy);
      if (dx < rad && dy < rad) {
        const cx = rad - dx, cy = rad - dy;
        if (cx * cx + cy * cy > rad * rad) continue;
      }
      px(Math.round(pad + xx), Math.round(pad + yy), COL.white);
    }
  }

  // Grille 9x9 à l'intérieur du panneau.
  const gpad = P * 0.10;           // marge intérieure
  const G = P - 2 * gpad;          // côté de la grille
  const x0 = pad + gpad, y0 = pad + gpad;
  const step = G / 9;
  const thin = Math.max(1, Math.round(N * 0.004));
  const bold = Math.max(2, Math.round(N * 0.011));

  // Quelques cases remplies -> évoque un sudoku en cours (motif fixe).
  const filled = [[0,1],[1,4],[2,7],[3,0],[4,4],[4,8],[6,2],[7,5],[8,3],[8,6]];
  for (const [r, c] of filled) {
    rect(x0 + c * step + thin, y0 + r * step + thin, step - 2 * thin, step - 2 * thin,
         (r + c) % 2 ? COL.indigoHi : COL.indigo);
  }

  // Lignes : fines partout, épaisses tous les 3 (séparateurs de blocs).
  for (let k = 0; k <= 9; k++) {
    const w = (k % 3 === 0) ? bold : thin;
    const c = (k % 3 === 0) ? COL.ink : COL.line;
    const off = -Math.floor(w / 2);
    rect(x0 + k * step + off, y0, w, G, c);   // verticales
    rect(x0, y0 + k * step + off, G, w, c);   // horizontales
  }

  return encodePNG(N, N, buf);
}

function encodePNG(w, h, rgba) {
  // données brutes filtrées (filter 0 par scanline)
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.subarray(y * w * 4, (y + 1) * w * 4)
        .forEach((v, i) => { raw[y * (w * 4 + 1) + 1 + i] = v; });
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const body = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const N of [192, 512, 180]) {
  const name = N === 180 ? 'apple-touch-icon.png' : `icon-${N}.png`;
  fs.writeFileSync(path.join(out, name), makeIcon(N));
  console.log('écrit  icons/' + name + '  (' + N + 'px)');
}

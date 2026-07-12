/**
 * Coquille Electron pour le build Windows de Patrimoine.
 *
 * Sert l'export web statique (dossier ../dist) via un petit serveur HTTP local
 * sur un port FIXE — indispensable pour que l'origine reste stable d'un lancement
 * à l'autre, sinon localStorage (données + secrets côté web) serait perdu.
 *
 * webSecurity est désactivé sur la fenêtre pour lever le CORS : contrairement au
 * navigateur, les connecteurs (Binance, Kraken, Enable Banking, Yahoo, Trade
 * Republic) peuvent ainsi appeler leurs API. La fenêtre ne charge QUE notre
 * propre interface (contenu de confiance), et l'intégration Node reste coupée
 * côté rendu.
 */
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8099; // fixe → origine stable → persistance localStorage
const DIST = path.join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

/** Sert dist/ avec repli SPA sur index.html pour les routes clientes. */
function createServer() {
  return http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.normalize(path.join(DIST, urlPath));
      // Empêche toute remontée hors de dist/.
      if (!filePath.startsWith(DIST)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        const indexInDir = path.join(filePath, 'index.html');
        filePath = fs.existsSync(indexInDir) ? indexInDir : path.join(DIST, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 380,
    backgroundColor: '#0F172A',
    title: 'Patrimoine',
    webPreferences: {
      webSecurity: false, // lève le CORS pour les connecteurs (contenu local de confiance)
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.removeMenu();
  win.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(() => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    // dist absent : on l'indique clairement plutôt qu'une fenêtre blanche.
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'Build web manquant',
      "Le dossier dist/ est introuvable. Lancez « npm run build:web » avant de démarrer Electron."
    );
    app.quit();
    return;
  }
  const server = createServer();
  server.listen(PORT, '127.0.0.1', () => createWindow());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const fs = require('fs');

const file = process.argv[2];
if (!file) throw new Error('Falta la ruta de index.html');
let html = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const edits = [
  [
    `let navigationSyncTimer = null;\n    let lastNavigationSyncAt = 0;`,
    `let navigationSyncTimer = null;\n    let navigationRenderTimer = null;\n    let lastNavigationSyncAt = 0;`
  ],
  [
    `renderPage();\n      scheduleNavigationSync(page);`,
    `clearTimeout(navigationRenderTimer);\n      const contentArea = document.getElementById('content-area');\n      if (contentArea) contentArea.style.opacity = '0.82';\n      navigationRenderTimer = setTimeout(() => {\n        if (AppState.currentPage !== page) return;\n        renderPage();\n        if (contentArea) contentArea.style.opacity = '';\n        scheduleNavigationSync(page);\n      }, 0);`
  ],
  [
    `lucide.createIcons();\n      enhanceSearchInputs(container);\n    }\n\n    function renderPageQuietly`,
    `enhanceSearchInputs(container);\n      requestAnimationFrame(() => {\n        if (container.isConnected) lucide.createIcons();\n      });\n    }\n\n    function renderPageQuietly`
  ],
  [
    `invoices.slice().reverse().map(inv =>`,
    `invoices.slice().reverse().slice(0, 60).map(inv =>`
  ]
];

for (const [before, after] of edits) {
  if (!html.includes(before)) throw new Error(`No se encontro un bloque requerido: ${before.slice(0, 55)}`);
  html = html.replace(before, after);
}

fs.writeFileSync(file, html);
console.log('Mejoras de rendimiento aplicadas correctamente');

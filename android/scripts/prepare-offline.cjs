const fs = require('fs');

const file = process.argv[2];
if (!file) throw new Error('Falta la ruta de index.html');
let html = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const edits = [
  [
    `async init() {\n        await SupabaseSync.init();\n        localStorage.removeItem('erp_session');`,
    `async init() {\n        await SupabaseSync.init();\n        const cachedOfflineUser = localStorage.getItem('erp_offline_user');\n        if (cachedOfflineUser) {\n          try {\n            this.currentUser = JSON.parse(cachedOfflineUser);\n            if (this.currentUser?.username) {\n              await this.showMainApp({ localFirst: true });\n              if (!navigator.onLine) showToast('Modo sin conexion: trabajando con datos guardados en el telefono', 'warning');\n              return;\n            }\n          } catch (error) {\n            console.warn('No se pudo abrir la sesion offline', error);\n          }\n        }\n        localStorage.removeItem('erp_session');`
  ],
  [
    `async showMainApp() {\n        document.getElementById('loginScreen').classList.add('hidden');`,
    `async showMainApp({ localFirst = false } = {}) {\n        if (this.currentUser?.username) {\n          localStorage.setItem('erp_offline_user', JSON.stringify(this.currentUser));\n        }\n        document.getElementById('loginScreen').classList.add('hidden');`
  ],
  [
    `await AppState.loadUserData(this.currentUser.username);`,
    `await AppState.loadUserData(this.currentUser.username, { localOnly: localFirst });`
  ],
  [
    `async loadUserData(username) {\n        this.currentUser = username;\n        await SupabaseSync.pullUser(username);`,
    `async loadUserData(username, { localOnly = false } = {}) {\n        this.currentUser = username;\n        if (!localOnly && navigator.onLine) {\n          try { await SupabaseSync.pullUser(username); }\n          catch (error) { console.warn('Se usaran los datos locales', error); }\n        }`
  ],
  [
    `async logout() {\n        if (SupabaseSync.client) await SupabaseSync.client.auth.signOut();`,
    `async logout() {\n        localStorage.removeItem('erp_offline_user');\n        if (SupabaseSync.client && navigator.onLine) await SupabaseSync.client.auth.signOut();`
  ],
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
console.log('Inicio offline aplicado correctamente');

const fs = require('fs');

const file = process.argv[2];
if (!file) throw new Error('Falta la ruta de index.html');
let html = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const edits = [
  [
    `passwordRecoveryDetected: false,`,
    `passwordRecoveryDetected: false,\n      dirtyStorageKey: 'erp_local_dirty_keys',`
  ],
  [
    `this.installLocalStorageSync();\n          console.info('Supabase conectado y sincronizado.');`,
    `this.installLocalStorageSync();\n          this.restorePendingWrites();\n          console.info('Supabase conectado y sincronizado.');`
  ],
  [
    `key !== 'erp_session' &&\n          !key.startsWith('erp_safety_');`,
    `key !== 'erp_session' &&\n          key !== this.dirtyStorageKey &&\n          !key.startsWith('erp_safety_');`
  ],
  [
    `setLocalOnly(key, value) {`,
    `getDirtyKeys() {\n        try {\n          const parsed = JSON.parse(this.originalSetItem ? localStorage.getItem(this.dirtyStorageKey) || '[]' : '[]');\n          return new Set(Array.isArray(parsed) ? parsed : []);\n        } catch (error) {\n          return new Set();\n        }\n      },\n\n      saveDirtyKeys(keys) {\n        this.originalSetItem(this.dirtyStorageKey, JSON.stringify(Array.from(keys)));\n      },\n\n      markDirty(key) {\n        const keys = this.getDirtyKeys();\n        keys.add(key);\n        this.saveDirtyKeys(keys);\n      },\n\n      clearDirty(keysToClear) {\n        const keys = this.getDirtyKeys();\n        keysToClear.forEach(key => keys.delete(key));\n        this.saveDirtyKeys(keys);\n      },\n\n      restorePendingWrites() {\n        this.getDirtyKeys().forEach(key => {\n          if (!this.shouldSyncKey(key)) return;\n          const raw = localStorage.getItem(key);\n          if (raw == null) return;\n          this.pending.set(key, {\n            key,\n            value: this.parseStoredValue(raw, null),\n            updated_at: new Date().toISOString()\n          });\n        });\n      },\n\n      setLocalOnly(key, value) {`
  ],
  [
    `if (key.startsWith('erp_data_')) {\n          if (Array.isArray(remoteParsed)) return remoteParsed;\n          return Array.isArray(localValue) ? localValue : [];\n        }`,
    `if (key.startsWith('erp_data_')) {\n          const records = new Map();\n          [...(Array.isArray(remoteParsed) ? remoteParsed : []), ...(Array.isArray(localValue) ? localValue : [])].forEach(record => {\n            if (!record) return;\n            const id = record.__backendId || record.id || JSON.stringify(record);\n            records.set(id, { ...(records.get(id) || {}), ...record });\n          });\n          return Array.from(records.values());\n        }`
  ],
  [
    `if (key.startsWith('erp_config_')) {\n          if (remoteParsed && typeof remoteParsed === 'object') {\n            return { ...(localValue || {}), ...remoteParsed };\n          }\n          return localValue || {};\n        }`,
    `if (key.startsWith('erp_config_')) {\n          if (remoteParsed && typeof remoteParsed === 'object') {\n            return this.getDirtyKeys().has(key)\n              ? { ...remoteParsed, ...(localValue || {}) }\n              : { ...(localValue || {}), ...remoteParsed };\n          }\n          return localValue || {};\n        }`
  ],
  [
    `queueUpsert(key, rawValue) {\n        if (!this.client) return;\n        this.pending.set(key, {`,
    `queueUpsert(key, rawValue) {\n        this.markDirty(key);\n        this.pending.set(key, {`
  ],
  [
    `});\n        clearTimeout(this.flushTimer);\n        this.flushTimer = setTimeout(() => this.flush(), 500);\n      },`,
    `});\n        if (!this.client) return;\n        clearTimeout(this.flushTimer);\n        this.flushTimer = setTimeout(() => this.flush(), 500);\n      },`
  ],
  [
    `async flush() {\n        if (!this.client) return;\n        if (this.flushing) return this.flushing;`,
    `async flush() {\n        if (!this.client) return;\n        if (!this.pending.size) this.restorePendingWrites();\n        if (this.flushing) return this.flushing;`
  ],
  [
    `if (error) {\n                rows.forEach(row => this.pending.set(row.key, row));\n                console.warn('No se pudo sincronizar Supabase:', error.message);\n                break;\n              }`,
    `if (error) {\n                rows.forEach(row => this.pending.set(row.key, row));\n                console.warn('No se pudo sincronizar Supabase:', error.message);\n                break;\n              }\n              this.clearDirty(rows.map(row => row.key));`
  ]
];

for (const [before, after] of edits) {
  if (!html.includes(before)) throw new Error(`No se encontro un bloque requerido: ${before.slice(0, 70)}`);
  html = html.replace(before, after);
}

fs.writeFileSync(file, html);
console.log('Sincronizacion segura aplicada correctamente');

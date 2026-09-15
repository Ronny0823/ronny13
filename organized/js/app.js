// ==================== SUPABASE CONNECTION ====================
    // 1) Crea la tabla con el SQL que queda al final de esta respuesta.
    // 2) Reemplaza estos dos valores por los de Project Settings > API.
    const SUPABASE_CONFIG = {
      url: 'https://qlxqnuzfagsdlynygjik.supabase.co',
      anonKey: 'sb_publishable_PA5VvwBcwUXnVaEM42r2pA_modeW_sa',
      table: 'erp_documents'
    };
    const AUTH_REDIRECT_URL = 'https://ronny0823.github.io/ronny13/';
    const AUTH_RESET_URL = 'https://ronny0823.github.io/ronny13/';
    const INITIAL_AUTH_SEARCH = window.location.search || '';
    const INITIAL_AUTH_HASH = window.location.hash || '';

    const safeText = (value) => String(value ?? '').trim();
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
    const escapeAttr = (value) => escapeHtml(value).replace(/`/g, '&#96;');
    const toFiniteNumber = (value, fallback = 0) => {
      const num = Number(String(value ?? '').replace(/,/g, '.'));
      return Number.isFinite(num) ? num : fallback;
    };
    const isPositiveNumber = (value) => Number.isFinite(value) && value > 0;
    const isValidDateInput = (value) => {
      if (!value) return false;
      const date = new Date(`${value}T12:00:00`);
      return !Number.isNaN(date.getTime());
    };
    const buildSaleDateTime = (dateKey) => {
      const createdAt = new Date();
      if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return createdAt.toISOString();
      const [year, month, day] = dateKey.split('-').map(Number);
      return new Date(
        year,
        month - 1,
        day,
        createdAt.getHours(),
        createdAt.getMinutes(),
        createdAt.getSeconds(),
        createdAt.getMilliseconds()
      ).toISOString();
    };
    const showExcelLibraryError = () => {
      showToast('No se pudo cargar la libreria de Excel. Revisa tu conexion e intenta de nuevo.', 'error');
    };

    // Evita recorrer todo el documento varias veces cuando una vista crea muchos iconos.
    const nativeLucideCreateIcons = window.lucide?.createIcons?.bind(window.lucide);
    let lucideRenderFrame = null;
    function queueLucideIcons() {
      if (!nativeLucideCreateIcons || lucideRenderFrame) return;
      lucideRenderFrame = requestAnimationFrame(() => {
        lucideRenderFrame = null;
        nativeLucideCreateIcons();
      });
    }
    if (nativeLucideCreateIcons) window.lucide.createIcons = queueLucideIcons;

    const SupabaseSync = {
      client: null,
      enabled: false,
      originalSetItem: localStorage.setItem.bind(localStorage),
      originalRemoveItem: localStorage.removeItem.bind(localStorage),
      pending: new Map(),
      flushTimer: null,
      flushing: null,
      hooksInstalled: false,
      passwordRecoveryDetected: false,

      async init() {
        if (this.hooksInstalled) return;

        this.enabled = Boolean(
          window.supabase &&
          SUPABASE_CONFIG.url &&
          SUPABASE_CONFIG.anonKey &&
          !SUPABASE_CONFIG.url.includes('TU-PROYECTO') &&
          !SUPABASE_CONFIG.anonKey.includes('TU_SUPABASE')
        );

        if (!this.enabled) {
          console.info('Supabase no configurado: usando almacenamiento local.');
          return;
        }

        try {
          this.client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
            auth: {
              detectSessionInUrl: true,
              flowType: 'implicit'
            }
          });
          this.client.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && hasPasswordRecoveryParams())) {
              this.passwordRecoveryDetected = true;
            }
          });
          this.installLocalStorageSync();
          console.info('Supabase conectado y sincronizado.');
        } catch (error) {
          this.client = null;
          this.enabled = false;
          console.warn('Supabase no disponible. La app seguira usando datos locales:', error.message || error);
        }
      },

      installLocalStorageSync() {
        if (this.hooksInstalled) return;
        const sync = this;
        localStorage.setItem = function(key, value) {
          sync.originalSetItem(key, value);
          if (sync.shouldSyncKey(key)) sync.queueUpsert(key, value);
        };

        localStorage.removeItem = function(key) {
          sync.originalRemoveItem(key);
          if (sync.shouldSyncKey(key)) sync.queueDelete(key);
        };
        this.hooksInstalled = true;
      },

      shouldSyncKey(key) {
        return typeof key === 'string' &&
          key.startsWith('erp_') &&
          key !== 'erp_users' &&
          key !== 'erp_session' &&
          !key.startsWith('erp_safety_');
      },

      setLocalOnly(key, value) {
        if (this.originalSetItem) {
          this.originalSetItem(key, value);
        } else {
          localStorage.setItem(key, value);
        }
      },

      parseStoredValue(raw, fallback) {
        if (!raw) return fallback;
        try {
          return JSON.parse(raw);
        } catch (error) {
          return raw;
        }
      },

      stringifyValue(value) {
        return typeof value === 'string' ? value : JSON.stringify(value);
      },

      mergeValue(key, localRaw, remoteValue) {
        const localValue = this.parseStoredValue(localRaw, key.startsWith('erp_data_') || key === 'erp_users' ? [] : {});
        const remoteParsed = typeof remoteValue === 'string' ? this.parseStoredValue(remoteValue, remoteValue) : remoteValue;

        if (key === 'erp_users') {
          const users = new Map();
          [...(Array.isArray(remoteParsed) ? remoteParsed : []), ...(Array.isArray(localValue) ? localValue : [])].forEach(user => {
            if (user && user.username) users.set(user.username, { ...(users.get(user.username) || {}), ...user });
          });
          return Array.from(users.values());
        }

        if (key.startsWith('erp_data_')) {
          if (Array.isArray(remoteParsed)) return remoteParsed;
          return Array.isArray(localValue) ? localValue : [];
        }

        if (key.startsWith('erp_config_')) {
          if (remoteParsed && typeof remoteParsed === 'object') {
            return { ...(localValue || {}), ...remoteParsed };
          }
          return localValue || {};
        }

        return localValue || remoteParsed;
      },

      async pullAll() {
        if (!this.client) return;
        try {
          const { data, error } = await this.client
            .from(SUPABASE_CONFIG.table)
            .select('key,value')
            .like('key', 'erp_%');

          if (error) {
            console.warn('No se pudo leer Supabase:', error.message);
            return;
          }

          (data || []).forEach(row => {
            if (!this.shouldSyncKey(row.key)) return;
            const merged = this.mergeValue(row.key, localStorage.getItem(row.key), row.value);
            this.originalSetItem(row.key, this.stringifyValue(merged));
          });
        } catch (error) {
          console.warn('No se pudo leer Supabase. Se mantienen los datos locales:', error.message || error);
        }
      },

      async pullUser(username) {
        if (!this.client || !username) return;
        const keys = ['erp_users', `erp_data_${username}`, `erp_config_${username}`];
        try {
          const { data, error } = await this.client
            .from(SUPABASE_CONFIG.table)
            .select('key,value')
            .in('key', keys);

          if (error) {
            console.warn('No se pudo leer el usuario desde Supabase:', error.message);
            return;
          }

          (data || []).forEach(row => {
            if (!this.shouldSyncKey(row.key)) return;
            const merged = this.mergeValue(row.key, localStorage.getItem(row.key), row.value);
            this.originalSetItem(row.key, this.stringifyValue(merged));
          });
        } catch (error) {
          console.warn('No se pudo leer el usuario desde Supabase. Se mantienen los datos locales:', error.message || error);
        }
      },

      async pushLocalSnapshot() {
        if (!this.client) return;
        const rows = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!this.shouldSyncKey(key)) continue;
          rows.push({
            key,
            value: this.parseStoredValue(localStorage.getItem(key), null),
            updated_at: new Date().toISOString()
          });
        }
        if (!rows.length) return;
        try {
          const { error } = await this.client.from(SUPABASE_CONFIG.table).upsert(rows, { onConflict: 'key' });
          if (error) console.warn('No se pudo enviar el respaldo inicial a Supabase:', error.message);
        } catch (error) {
          console.warn('No se pudo enviar el respaldo inicial a Supabase:', error.message || error);
        }
      },

      queueUpsert(key, rawValue) {
        if (!this.client) return;
        this.pending.set(key, {
          key,
          value: this.parseStoredValue(rawValue, null),
          updated_at: new Date().toISOString()
        });
        clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => this.flush(), 500);
      },

      async queueDelete(key) {
        if (!this.client) return;
        try {
          const { error } = await this.client.from(SUPABASE_CONFIG.table).delete().eq('key', key);
          if (error) console.warn('No se pudo borrar en Supabase:', error.message);
        } catch (error) {
          console.warn('No se pudo borrar en Supabase:', error.message || error);
        }
      },

      async flush() {
        if (!this.client) return;
        if (this.flushing) return this.flushing;

        this.flushing = (async () => {
          while (this.pending.size) {
            const rows = Array.from(this.pending.values());
            this.pending.clear();
            try {
              const { error } = await this.client.from(SUPABASE_CONFIG.table).upsert(rows, { onConflict: 'key' });
              if (error) {
                rows.forEach(row => this.pending.set(row.key, row));
                console.warn('No se pudo sincronizar Supabase:', error.message);
                break;
              }
            } catch (error) {
              rows.forEach(row => this.pending.set(row.key, row));
              console.warn('No se pudo sincronizar Supabase. Se reintentara luego:', error.message || error);
              break;
            }
          }
        })();

        try {
          await this.flushing;
        } finally {
          this.flushing = null;
        }
      }
    };

    // ==================== AUTHENTICATION SYSTEM ====================
    function getAuthEmailKey(email) {
      return String(email || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'usuario';
    }

    function getSupabaseUserDataKey(user) {
      const id = String(user?.id || '').trim().toLowerCase();
      if (id) return `user_${id.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
      return getAuthEmailKey(user?.email || '');
    }

    function getAuthKickKey(username) {
      return `erp_auth_kick_${String(username || '').trim()}`;
    }

    function getAuthRedirectUrl() {
      const configuredUrl = safeText(AUTH_REDIRECT_URL);
      if (configuredUrl) return configuredUrl;
      if (window.location.protocol === 'file:') return '';
      return window.location.href.split('#')[0].split('?')[0];
    }

    function getPasswordResetOptions() {
      const redirectTo = safeText(AUTH_RESET_URL) || getAuthRedirectUrl();
      return redirectTo ? { redirectTo } : {};
    }

    function getAuthUrlParams() {
      const query = new URLSearchParams(window.location.search || INITIAL_AUTH_SEARCH);
      const hash = new URLSearchParams(String(window.location.hash || INITIAL_AUTH_HASH).replace(/^#/, ''));
      return { query, hash };
    }

    const PASSWORD_RECOVERY_PENDING_KEY = 'erp_password_recovery_pending';
    const PASSWORD_RECOVERY_DONE_KEY = 'erp_password_recovery_done';

    function markPasswordRecoveryPending() {
      localStorage.setItem(PASSWORD_RECOVERY_PENDING_KEY, String(Date.now()));
    }

    function clearPasswordRecoveryPending() {
      localStorage.removeItem(PASSWORD_RECOVERY_PENDING_KEY);
    }

    function markPasswordRecoveryDone() {
      localStorage.setItem(PASSWORD_RECOVERY_DONE_KEY, String(Date.now()));
    }

    function clearPasswordRecoveryDone() {
      localStorage.removeItem(PASSWORD_RECOVERY_DONE_KEY);
    }

    function hasRecentPasswordRecoveryDone() {
      const finishedAt = Number(localStorage.getItem(PASSWORD_RECOVERY_DONE_KEY) || 0);
      return Number.isFinite(finishedAt) && finishedAt > 0 && Date.now() - finishedAt < 1000 * 60 * 15;
    }

    function hasPasswordRecoveryPending() {
      const startedAt = Number(localStorage.getItem(PASSWORD_RECOVERY_PENDING_KEY) || 0);
      return Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 1000 * 60 * 60;
    }

    function hasPasswordRecoveryParams() {
      const { query, hash } = getAuthUrlParams();
      const fullUrl = `${window.location.search || INITIAL_AUTH_SEARCH}${window.location.hash || INITIAL_AUTH_HASH}`.toLowerCase();
      const hasTokenParam = query.has('code') ||
        query.has('token') ||
        query.has('token_hash') ||
        query.has('access_token') ||
        hash.has('access_token');
      return query.get('type') === 'recovery' ||
        hash.get('type') === 'recovery' ||
        hasTokenParam ||
        fullUrl.includes('recovery') ||
        fullUrl.includes('reset');
    }

    function hasLivePasswordRecoveryParams() {
      const query = new URLSearchParams(window.location.search || '');
      const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
      const fullUrl = `${window.location.search || ''}${window.location.hash || ''}`.toLowerCase();
      return query.get('type') === 'recovery' ||
        hash.get('type') === 'recovery' ||
        query.has('code') ||
        query.has('token') ||
        query.has('token_hash') ||
        query.has('access_token') ||
        hash.has('access_token') ||
        fullUrl.includes('recovery') ||
        fullUrl.includes('reset');
    }

    function isRecentPasswordRecoverySession(session) {
      const sentAt = session?.user?.recovery_sent_at || session?.user?.user_metadata?.recovery_sent_at || '';
      if (!sentAt) return false;
      const sentTime = new Date(sentAt).getTime();
      return Number.isFinite(sentTime) && Date.now() - sentTime < 1000 * 60 * 60;
    }

    function clearAuthUrlParams() {
      if (!window.history?.replaceState || window.location.protocol === 'file:') return;
      window.history.replaceState({}, document.title, getAuthRedirectUrl());
    }

    function redirectToCleanAuthUrl() {
      const cleanUrl = getAuthRedirectUrl();
      if (!cleanUrl || window.location.protocol === 'file:') return;
      window.location.replace(`${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}login=1&t=${Date.now()}`);
    }

    function clearSupabaseAuthStorage() {
      const clearFromStorage = (storage) => {
        if (!storage) return;
        const keys = [];
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.startsWith('sb-') && key.includes('auth-token')) keys.push(key);
        }
        keys.forEach(key => storage.removeItem(key));
      };
      clearFromStorage(localStorage);
      clearFromStorage(sessionStorage);
    }

    function getPasswordResetNotice() {
      if (window.location.protocol !== 'file:') return '';
      return ' Nota: como estas abriendo la app desde Descargas, algunos correos no pueden regresar a este archivo. Para que el enlace abra directo, publica la app en una URL https y pon esa URL en AUTH_REDIRECT_URL y en Redirect URLs de Supabase.';
    }

    const AuthSystem = {
      currentUser: null,
      recoveryMode: false,
      recoveryHandled: false,
      recoverySessionReady: false,
      authListenerReady: false,
      mainAppStarted: false,
      clockTimer: null,
      sessionStartedAt: 0,
      sessionWatchTimer: null,
      cloudSyncTimer: null,
      
      async init() {
        await SupabaseSync.init();
        localStorage.removeItem('erp_session');

        if (!SupabaseSync.client) {
          this.showLogin();
          showAuthMessage('Supabase no esta disponible. Revisa la conexion.', 'error');
          return;
        }

        if (!this.authListenerReady) {
          SupabaseSync.client.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY' && !this.recoveryHandled) {
              this.recoveryMode = true;
              await this.handlePasswordRecovery();
              return;
            }
            if (event === 'SIGNED_IN' && session?.user && (SupabaseSync.passwordRecoveryDetected || isRecentPasswordRecoverySession(session)) && !this.recoveryHandled) {
              this.recoveryMode = true;
              this.recoveryHandled = true;
              this.recoverySessionReady = true;
              this.showPasswordResetForm();
              return;
            }
            if (event === 'SIGNED_OUT') {
              this.currentUser = null;
              this.stopSessionWatcher();
              this.stopCloudSync();
              AppState.data = [];
              this.mainAppStarted = false;
              this.showLogin();
            }
          });
          this.authListenerReady = true;
        }

        const { data, error } = await SupabaseSync.client.auth.getSession();
        if (error) console.warn('No se pudo leer la sesion de Supabase:', error.message || error);

        if (data?.session?.user && (SupabaseSync.passwordRecoveryDetected || hasPasswordRecoveryParams() || isRecentPasswordRecoverySession(data.session)) && !this.recoveryHandled) {
          this.recoveryMode = true;
          this.recoveryHandled = true;
          this.recoverySessionReady = true;
          this.showPasswordResetForm();
          return;
        }

        if (data?.session?.user && hasPasswordRecoveryPending() && !this.recoveryHandled) {
          this.recoveryMode = true;
          this.recoveryHandled = true;
          this.recoverySessionReady = true;
          this.showPasswordResetForm();
          return;
        }

        if (hasPasswordRecoveryParams() && !this.recoveryHandled) {
          this.recoveryMode = true;
          await this.handlePasswordRecovery();
          return;
        }

        if (data?.session?.user && !this.recoveryMode) {
          this.currentUser = this.userFromSupabase(data.session.user);
          await this.showMainApp();
          return;
        }

        this.showLogin();
      },

      userFromSupabase(user) {
        const email = String(user?.email || '').trim().toLowerCase();
        const metadata = user?.user_metadata || {};
        const username = getSupabaseUserDataKey(user);
        return {
          id: user?.id || '',
          email,
          username,
          fullName: metadata.fullName || metadata.full_name || email
        };
      },

      ensureUserStorage(user) {
        if (!user?.username) return;
        if (!localStorage.getItem(`erp_data_${user.username}`)) {
          SupabaseSync.setLocalOnly(`erp_data_${user.username}`, JSON.stringify([]));
        }
        if (!localStorage.getItem(`erp_config_${user.username}`)) {
          SupabaseSync.setLocalOnly(`erp_config_${user.username}`, JSON.stringify({
            company_name: 'Materiales del Norte',
            company_slogan: 'Calidad en cada metro cubico',
            currency: 'MXN',
            iva_default_enabled: true,
            iva_default_rate: 16
          }));
        }
      },

      migrateLegacyDataIfNeeded(user) {
        return;
      },

      showLogin() {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
        lucide.createIcons();
      },

      showPasswordResetForm() {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
        document.getElementById('loginForm')?.classList.add('hidden');
        document.getElementById('registerForm')?.classList.add('hidden');
        document.getElementById('resetPasswordForm')?.classList.remove('hidden');
        document.getElementById('tabLogin')?.classList.remove('bg-primary-500', 'text-slate-900');
        document.getElementById('tabLogin')?.classList.add('text-slate-400');
        document.getElementById('tabRegister')?.classList.remove('bg-emerald-500', 'text-slate-900');
        document.getElementById('tabRegister')?.classList.add('text-slate-400');
        showAuthMessage('Enlace validado. Escribe tu nueva contrasena.', 'success');
        lucide.createIcons();
      },

      async showMainApp() {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('currentUserDisplay').textContent = this.currentUser.fullName || this.currentUser.email || this.currentUser.username;
        
        this.ensureUserStorage(this.currentUser);
        this.migrateLegacyDataIfNeeded(this.currentUser);
        await AppState.loadUserData(this.currentUser.username);
        this.sessionStartedAt = this.sessionStartedAt || Date.now();
        this.startSessionWatcher();
        this.startCloudSync();
        
        updateDate();
        if (!this.clockTimer) this.clockTimer = setInterval(updateDate, 60000);
        if (!this.mainAppStarted) {
          initDataSDK();
          this.mainAppStarted = true;
        }
        lucide.createIcons();
        renderPage();
      },

      async register(fullName, email, password) {
        if (!SupabaseSync.client) return { success: false, message: 'Supabase no esta disponible' };
        if (!fullName || !email || !password) return { success: false, message: 'Todos los campos son requeridos' };
        if (password.length < 6) return { success: false, message: 'La contrasena debe tener al menos 6 caracteres' };

        const cleanEmail = String(email).trim().toLowerCase();
        const dataKey = getAuthEmailKey(cleanEmail);
        const { data, error } = await SupabaseSync.client.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(),
            data: { fullName: fullName.trim(), dataKey }
          }
        });

        if (error) return { success: false, message: error.message || 'No se pudo crear la cuenta' };

        const authUser = data?.user ? this.userFromSupabase(data.user) : { email: cleanEmail, username: dataKey, fullName: fullName.trim() };
        this.ensureUserStorage(authUser);

        if (data?.session?.user) {
          this.currentUser = this.userFromSupabase(data.session.user);
          return { success: true, message: 'Cuenta creada correctamente' };
        }

        return { success: true, message: 'Cuenta creada. Revisa tu correo para confirmar y luego inicia sesion.' };
      },

      async login(email, password) {
        if (!SupabaseSync.client) return { success: false, message: 'Supabase no esta disponible' };
        if (!email || !password) return { success: false, message: 'Correo y contrasena son requeridos' };

        const cleanEmail = String(email).trim().toLowerCase();
        const { data, error } = await SupabaseSync.client.auth.signInWithPassword({ email: cleanEmail, password });

        if (error || !data?.user) return { success: false, message: error?.message || 'Correo o contrasena incorrectos' };

        this.currentUser = this.userFromSupabase(data.user);
        this.sessionStartedAt = Date.now();
        this.ensureUserStorage(this.currentUser);
        return { success: true, message: 'Bienvenido al sistema' };
      },

      async logout() {
        if (SupabaseSync.client) await SupabaseSync.client.auth.signOut();
        this.currentUser = null;
        this.stopSessionWatcher();
        this.stopCloudSync();
        localStorage.removeItem('erp_session');
        AppState.data = [];
        this.mainAppStarted = false;
        this.showLogin();
      },

      async markPasswordChanged(username) {
        if (!SupabaseSync.client || !username) return;
        const changedAt = Date.now();
        try {
          await SupabaseSync.client.from(SUPABASE_CONFIG.table).upsert([{
            key: getAuthKickKey(username),
            value: { changed_at: changedAt },
            updated_at: new Date(changedAt).toISOString()
          }], { onConflict: 'key' });
        } catch (error) {
          console.warn('No se pudo avisar el cambio de contrasena a otros dispositivos:', error.message || error);
        }
      },

      parsePasswordChangedAt(value) {
        if (!value) return 0;
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          try {
            return this.parsePasswordChangedAt(JSON.parse(value));
          } catch (error) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
          }
        }
        const changedAt = Number(value.changed_at || value.changedAt || 0);
        return Number.isFinite(changedAt) ? changedAt : 0;
      },

      async checkPasswordChangedElsewhere() {
        if (!SupabaseSync.client || !this.currentUser?.username || !this.sessionStartedAt) return false;
        try {
          const { data, error } = await SupabaseSync.client
            .from(SUPABASE_CONFIG.table)
            .select('value')
            .eq('key', getAuthKickKey(this.currentUser.username))
            .maybeSingle();

          if (error) return false;
          const changedAt = this.parsePasswordChangedAt(data?.value);
          if (changedAt && changedAt > this.sessionStartedAt) {
            await this.forceLocalLogoutAfterPasswordChange();
            return true;
          }
        } catch (error) {
          console.warn('No se pudo revisar si la contrasena cambio:', error.message || error);
        }
        return false;
      },

      startSessionWatcher() {
        if (this.sessionWatchTimer) return;
        this.sessionWatchTimer = setInterval(() => this.checkPasswordChangedElsewhere(), 15000);
      },

      stopSessionWatcher() {
        if (!this.sessionWatchTimer) return;
        clearInterval(this.sessionWatchTimer);
        this.sessionWatchTimer = null;
        this.sessionStartedAt = 0;
      },

      startCloudSync() {
        if (this.cloudSyncTimer) return;
        this.cloudSyncTimer = setInterval(async () => {
          if (!this.currentUser?.username || this.recoveryMode || document.hidden) return;
          const changed = await syncCurrentUserFromCloud({ silent: true });
          if (changed) renderPage();
        }, 60000);
      },

      stopCloudSync() {
        if (!this.cloudSyncTimer) return;
        clearInterval(this.cloudSyncTimer);
        this.cloudSyncTimer = null;
      },

      async forceLocalLogoutAfterPasswordChange() {
        this.stopSessionWatcher();
        try {
          if (SupabaseSync.client) await SupabaseSync.client.auth.signOut();
        } catch (error) {
          console.warn('No se pudo cerrar la sesion local:', error.message || error);
        }
        clearSupabaseAuthStorage();
        this.currentUser = null;
        this.stopCloudSync();
        AppState.data = [];
        this.mainAppStarted = false;
        this.showLogin();
        showAuthMessage('Tu sesion fue cerrada porque la contrasena de esta cuenta cambio en otro dispositivo.', 'error');
      },

      async changePassword(currentPassword, newPassword, confirmPassword) {
        if (!SupabaseSync.client || !this.currentUser?.email) return { success: false, message: 'No hay usuario activo' };
        if (!currentPassword || !newPassword || !confirmPassword) return { success: false, message: 'Completa todos los campos de contrasena' };
        if (newPassword.length < 6) return { success: false, message: 'La nueva contrasena debe tener al menos 6 caracteres' };
        if (newPassword !== confirmPassword) return { success: false, message: 'La nueva contrasena no coincide' };
        if (currentPassword === newPassword) return { success: false, message: 'La nueva contrasena debe ser diferente a la actual' };

        const verify = await SupabaseSync.client.auth.signInWithPassword({ email: this.currentUser.email, password: currentPassword });
        if (verify.error) return { success: false, message: 'La contrasena actual es incorrecta' };

        const { error } = await SupabaseSync.client.auth.updateUser({ password: newPassword });
        if (error) return { success: false, message: error.message || 'No se pudo actualizar la contrasena' };

        await this.markPasswordChanged(this.currentUser.username);
        try {
          await SupabaseSync.client.auth.signOut({ scope: 'global' });
        } catch (signOutError) {
          console.warn('No se pudo cerrar la sesion en todos los dispositivos:', signOutError.message || signOutError);
        }

        clearSupabaseAuthStorage();
        this.currentUser = null;
        this.stopSessionWatcher();
        this.stopCloudSync();
        AppState.data = [];
        this.mainAppStarted = false;
        this.showLogin();
        return { success: true, message: 'Contrasena actualizada. Se cerro la sesion en todos los dispositivos.' };
      },

      async sendPasswordReset(email) {
        if (!SupabaseSync.client) return { success: false, message: 'Supabase no esta disponible' };
        if (!email) return { success: false, message: 'Escribe tu correo primero' };

        clearPasswordRecoveryDone();
        markPasswordRecoveryPending();
        const { error } = await SupabaseSync.client.auth.resetPasswordForEmail(
          String(email).trim().toLowerCase(),
          getPasswordResetOptions()
        );
        if (error) {
          clearPasswordRecoveryPending();
          return { success: false, message: error.message || 'No se pudo enviar el correo' };
        }
        return { success: true, message: `Te enviamos un enlace para recuperar la contrasena. Abre el ultimo correo recibido antes de 2 minutos.${getPasswordResetNotice()}` };
      },

      async activateRecoverySession() {
        if (!SupabaseSync.client) return false;
        const { query, hash } = getAuthUrlParams();
        const code = query.get('code');
        const accessToken = hash.get('access_token') || query.get('access_token');
        const refreshToken = hash.get('refresh_token') || query.get('refresh_token');
        const tokenHash = query.get('token_hash') || hash.get('token_hash');
        const token = query.get('token') || hash.get('token');
        const hasRecoveryToken = Boolean(code || (accessToken && refreshToken) || tokenHash || token);

        try {
          if (code) {
            const { error } = await SupabaseSync.client.auth.exchangeCodeForSession(code);
            if (!error) return true;
            console.warn('No se pudo activar recuperacion con code:', error.message || error);
          }

          if (accessToken && refreshToken) {
            const { error } = await SupabaseSync.client.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            if (!error) return true;
            console.warn('No se pudo activar recuperacion con access_token:', error.message || error);
          }

          if (tokenHash || token) {
            const payload = tokenHash
              ? { type: 'recovery', token_hash: tokenHash }
              : { type: 'recovery', token };
            const { error } = await SupabaseSync.client.auth.verifyOtp(payload);
            if (!error) return true;
            console.warn('No se pudo activar recuperacion con token:', error.message || error);
          }

          if (hasRecoveryToken) {
            clearPasswordRecoveryPending();
            clearAuthUrlParams();
            return false;
          }

          const { data } = await SupabaseSync.client.auth.getSession();
          return Boolean(data?.session?.user);
        } catch (error) {
          console.warn('No se pudo validar el enlace de recuperacion:', error.message || error);
          return false;
        }
      },

      async handlePasswordRecovery() {
        if (this.recoveryHandled) return;
        this.recoveryHandled = true;
        this.recoveryMode = true;
        this.showLogin();
        const recoveryReady = await this.activateRecoverySession();
        if (!recoveryReady) {
          showAuthMessage(`No se pudo validar el enlace de recuperacion.${getPasswordResetNotice()}`, 'error');
          return;
        }

        this.recoverySessionReady = true;
        this.showPasswordResetForm();
      },

      async completePasswordRecovery(newPassword, confirmPassword) {
        if (!this.recoverySessionReady) {
          const recoveryReady = await this.activateRecoverySession();
          if (!recoveryReady) return { success: false, message: 'El enlace de recuperacion no esta activo o ya expiro' };
          this.recoverySessionReady = true;
        }

        if (!newPassword || newPassword.length < 6) {
          return { success: false, message: 'La nueva contrasena debe tener al menos 6 caracteres' };
        }
        if (newPassword !== confirmPassword) {
          return { success: false, message: 'Las contrasenas no coinciden' };
        }

        const { error } = await SupabaseSync.client.auth.updateUser({ password: newPassword });
        if (error) {
          return { success: false, message: error.message || 'No se pudo actualizar la contrasena' };
        }

        try {
          const { data } = await SupabaseSync.client.auth.getUser();
          const recoveryUsername = data?.user ? getSupabaseUserDataKey(data.user) : '';
          await this.markPasswordChanged(recoveryUsername);
        } catch (markError) {
          console.warn('No se pudo avisar el cambio de contrasena por recuperacion:', markError.message || markError);
        }

        clearAuthUrlParams();
        try {
          await SupabaseSync.client.auth.signOut({ scope: 'global' });
        } catch (error) {
          console.warn('No se pudo cerrar la sesion de recuperacion:', error.message || error);
        }
        clearSupabaseAuthStorage();
        clearPasswordRecoveryPending();
        markPasswordRecoveryDone();
        this.recoveryMode = false;
        this.recoveryHandled = false;
        this.recoverySessionReady = false;
        this.stopSessionWatcher();
        SupabaseSync.passwordRecoveryDetected = false;
        document.getElementById('resetPasswordForm')?.reset();
        document.getElementById('resetPasswordForm')?.classList.add('hidden');
        switchAuthTab('login');
        setTimeout(redirectToCleanAuthUrl, 700);
        return { success: true, message: 'Contrasena actualizada. Ya puedes iniciar sesion.' };
      }
    };
    const DataBackup = {
      prefix: 'erp_',
      safetyPrefix: 'erp_safety_',
      lastSavedAt: 0,
      saveTimer: null,

      snapshot() {
        const keys = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.prefix) && !key.startsWith(this.safetyPrefix) && key !== 'erp_session') {
            keys[key] = localStorage.getItem(key);
          }
        }
        return {
          app: 'ERP Materiales Premium',
          version: 1,
          exportedAt: new Date().toISOString(),
          keys
        };
      },

      saveSafetyBackup(username, { force = false } = {}) {
        if (!username) return;
        const elapsed = Date.now() - this.lastSavedAt;
        if (!force && elapsed < 5000) {
          if (!this.saveTimer) {
            this.saveTimer = setTimeout(() => {
              this.saveTimer = null;
              this.saveSafetyBackup(username, { force: true });
            }, 5000 - elapsed);
          }
          return;
        }
        try {
          const backup = this.snapshot();
          localStorage.setItem(`${this.safetyPrefix}${username}`, JSON.stringify(backup));
          this.lastSavedAt = Date.now();
        } catch (error) {
          console.warn('No se pudo crear respaldo local', error);
        }
      },

      download() {
        try {
          const backup = this.snapshot();
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const date = new Date().toISOString().slice(0, 10);
          a.href = url;
          a.download = `respaldo_erp_${date}.json`;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showToast('Respaldo descargado correctamente');
        } catch (error) {
          console.error(error);
          showToast('No se pudo descargar el respaldo', 'error');
        }
      },

      importFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const backup = JSON.parse(reader.result);
            this.restore(backup);
            showToast('Respaldo importado sin borrar datos actuales');
            if (AuthSystem.currentUser) {
              await AppState.loadUserData(AuthSystem.currentUser.username);
              renderPage();
            } else {
              await AuthSystem.init();
            }
          } catch (error) {
            console.error(error);
            showToast('No se pudo importar el respaldo', 'error');
          } finally {
            event.target.value = '';
          }
        };
        reader.readAsText(file);
      },

      restore(backup) {
        if (!backup || typeof backup !== 'object' || !backup.keys) {
          throw new Error('Formato de respaldo no valido');
        }

        Object.entries(backup.keys).forEach(([key, value]) => {
          if (!key.startsWith(this.prefix) || key === 'erp_session') return;

          if (key === 'erp_users') {
            localStorage.setItem(key, JSON.stringify(this.mergeUsers(localStorage.getItem(key), value)));
            return;
          }

          if (key.startsWith('erp_data_')) {
            localStorage.setItem(key, JSON.stringify(this.mergeRecords(localStorage.getItem(key), value)));
            return;
          }

          if (key.startsWith('erp_config_')) {
            localStorage.setItem(key, JSON.stringify({
              ...this.safeParse(localStorage.getItem(key), {}),
              ...this.safeParse(value, {})
            }));
            return;
          }

          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, value);
          }
        });
      },

      mergeUsers(currentRaw, incomingRaw) {
        const merged = [];
        const byUser = new Map();
        [...this.safeParse(currentRaw, []), ...this.safeParse(incomingRaw, [])].forEach(user => {
          if (!user || !user.username) return;
          const existing = byUser.get(user.username) || {};
          byUser.set(user.username, { ...existing, ...user });
        });
        byUser.forEach(user => merged.push(user));
        return merged;
      },

      mergeRecords(currentRaw, incomingRaw) {
        const merged = [];
        const seen = new Set();
        [...this.safeParse(currentRaw, []), ...this.safeParse(incomingRaw, [])].forEach(record => {
          const id = record && (record.__backendId || record.id || JSON.stringify(record));
          if (!id || seen.has(id)) return;
          seen.add(id);
          merged.push(record);
        });
        return merged;
      },

      safeParse(raw, fallback) {
        if (!raw) return fallback;
        try {
          return JSON.parse(raw);
        } catch (error) {
          return fallback;
        }
      }
    };

    function switchAuthTab(tab) {
      const loginBtn = document.getElementById('tabLogin');
      const registerBtn = document.getElementById('tabRegister');
      const loginForm = document.getElementById('loginForm');
      const registerForm = document.getElementById('registerForm');
      const resetPasswordForm = document.getElementById('resetPasswordForm');
      const message = document.getElementById('authMessage');
      
      message.classList.add('hidden');
      resetPasswordForm?.classList.add('hidden');
      
      if (tab === 'login') {
        loginBtn.classList.add('bg-primary-500', 'text-slate-900');
        loginBtn.classList.remove('text-slate-400');
        registerBtn.classList.remove('bg-emerald-500', 'text-slate-900');
        registerBtn.classList.add('text-slate-400');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
      } else {
        registerBtn.classList.add('bg-emerald-500', 'text-slate-900');
        registerBtn.classList.remove('text-slate-400');
        loginBtn.classList.remove('bg-primary-500', 'text-slate-900');
        loginBtn.classList.add('text-slate-400');
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
      }
    }

    function showAuthMessage(message, type = 'error') {
      const msgEl = document.getElementById('authMessage');
      msgEl.textContent = message;
      msgEl.classList.remove('hidden', 'bg-emerald-500/10', 'text-emerald-400', 'bg-rose-500/10', 'text-rose-400');
      
      if (type === 'success') {
        msgEl.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border', 'border-emerald-500/20');
      } else {
        msgEl.classList.add('bg-rose-500/10', 'text-rose-400', 'border', 'border-rose-500/20');
      }
    }

    async function handleLogin(e) {
      e.preventDefault();
      const username = safeText(document.getElementById('loginUsername').value);
      const password = document.getElementById('loginPassword').value;
      if (!username || !password) {
        showAuthMessage('Correo y contrasena son requeridos', 'error');
        return;
      }
      
      const result = await AuthSystem.login(username, password);
      
      if (result.success) {
        showAuthMessage(result.message, 'success');
        setTimeout(() => AuthSystem.showMainApp(), 500);
      } else {
        showAuthMessage(result.message, 'error');
      }
    }

    async function handleRegister(e) {
      e.preventDefault();
      
      const fullName = safeText(document.getElementById('regFullName').value);
      const username = safeText(document.getElementById('regUsername').value);
      const password = document.getElementById('regPassword').value;
      const passwordConfirm = document.getElementById('regPasswordConfirm').value;
      
      // Validaciones en el cliente
      if (!fullName || !username || !password) {
        showAuthMessage('Todos los campos son requeridos', 'error');
        return;
      }
      
      if (password !== passwordConfirm) {
        showAuthMessage('Las contrasenas no coinciden', 'error');
        return;
      }
      
      if (password.length < 6) {
        showAuthMessage('La contrasena debe tener al menos 6 caracteres', 'error');
        return;
      }
      
      if (!username.includes('@')) {
        showAuthMessage('Escribe un correo electronico valido', 'error');
        return;
      }
      
      const result = await AuthSystem.register(fullName, username, password);
      
      if (result.success) {
        showAuthMessage(result.message, 'success');
        
        // Limpiar formulario
        document.getElementById('registerForm').reset();

        if (!AuthSystem.currentUser) {
          setTimeout(() => switchAuthTab('login'), 1200);
          return;
        }
        
        // Esperar un momento y luego iniciar sesion automaticamente
        setTimeout(async () => {
          await AuthSystem.showMainApp();
        }, 1500);
      } else {
        showAuthMessage(result.message, 'error');
      }
    }

    function logout() {
      if (confirm('Estas seguro de cerrar sesion?')) {
        AuthSystem.logout();
      }
    }

    async function handleForgotPassword() {
      const email = safeText(document.getElementById('loginUsername').value);
      const result = await AuthSystem.sendPasswordReset(email);
      showAuthMessage(result.message, result.success ? 'success' : 'error');
    }

    async function handleResetPasswordSubmit(event) {
      event.preventDefault();
      const newPassword = document.getElementById('resetNewPassword')?.value || '';
      const confirmPassword = document.getElementById('resetConfirmPassword')?.value || '';
      const result = await AuthSystem.completePasswordRecovery(newPassword, confirmPassword);
      showAuthMessage(result.message, result.success ? 'success' : 'error');
    }

    // ==================== APP STATE ====================
    const AppState = {
      data: [],
      config: {
        company_name: 'Materiales del Norte',
        company_slogan: 'Calidad en cada metro cubico',
        company_rfc: '',
        company_address: '',
        company_phone: '',
        company_logo: '',
        tax_rate: 16,
        currency: 'MXN',
        printer_type: 'standard',
        bluetooth_print_mode: 'thermal_80',
        bluetooth_charset: 'cp850',
        printer_name: '',
        paper_size: 'letter',
        auto_print: false,
        backup_enabled: true,
        iva_default_enabled: true,
        iva_default_rate: 16
      },
      currentPage: 'dashboard',
      invoiceCounter: 1000,
      saleItems: [],
      saleSaving: false,
      deleteConfirmId: null,
      chartInstance: null,
      sidebarOpen: false,
      invoiceSalePanelOpen: false,
      clientFilters: { search: '' },
      entryFilters: { search: '', supplier: '', dateFrom: '', dateTo: '', quickPeriod: '' },
      supplierFilters: { search: '', material: '', status: '', dateFrom: '', dateTo: '' },
      creditFilters: { client: '', dateFrom: '', dateTo: '', status: 'all' },
      invoiceFilters: { client: '', dateFrom: '', dateTo: '' },
      reportFilters: { period: '', dateFrom: '', dateTo: '', search: '', tab: 'resumen' },
      pendingClientReportFilters: { dateFrom: '', dateTo: '' },
      dailyMetersFilters: { search: '', dateFrom: '', dateTo: '', quickPeriod: '' },
      directTripFilters: { search: '', company: '', dateFrom: '', dateTo: '', status: 'all', quickPeriod: '' },
      fuelFilters: { search: '', dateFrom: '', dateTo: '' },
      currentUser: null,
      recordCache: null,
      inventoryCache: null,

      invalidateDataCache() {
        this.recordCache = null;
        this.inventoryCache = null;
      },

      async loadUserData(username) {
        this.currentUser = username;
        await SupabaseSync.pullUser(username);
        
        const savedData = localStorage.getItem(`erp_data_${username}`);
        if (savedData) {
          try {
            const parsedData = JSON.parse(savedData);
            this.data = Array.isArray(parsedData) ? parsedData : [];
          } catch (error) {
            console.warn('Datos locales invalidos. Se inicia con lista vacia:', error.message || error);
            this.data = [];
            showToast('Los datos locales tenian un formato invalido. Se evito un cierre inesperado.', 'warning');
          }
        } else {
          this.data = [];
        }
        this.invalidateDataCache();
        
        const savedConfig = localStorage.getItem(`erp_config_${username}`);
        if (savedConfig) {
          try {
            this.config = { ...this.config, ...JSON.parse(savedConfig) };
          } catch (error) {
            console.warn('Configuracion local invalida. Se usara la configuracion base:', error.message || error);
            showToast('La configuracion local tenia un formato invalido. Se uso la configuracion base.', 'warning');
          }
        }
        
        // Update invoice counter from existing invoices
        const invoices = this.data.filter(r => r.type === 'invoice');
        invoices.forEach(inv => {
          const num = parseInt((inv.invoice_number || '').replace('FAC-', ''));
          if (num && num >= this.invoiceCounter) this.invoiceCounter = num + 1;
        });
        
        updateCompanyInfo();
        updateLogoDisplay();
      },

      saveUserData() {
        if (!this.currentUser) return;
        this.invalidateDataCache();
        localStorage.setItem(`erp_data_${this.currentUser}`, JSON.stringify(this.data));
        localStorage.setItem(`erp_config_${this.currentUser}`, JSON.stringify(this.config));
        DataBackup.saveSafetyBackup(this.currentUser);
        return SupabaseSync.flush();
      }
    };

    document.addEventListener('DOMContentLoaded', async () => {
      await AuthSystem.init();
    });

    document.addEventListener('visibilitychange', async () => {
      if (document.hidden || !AuthSystem.currentUser?.username) return;
      const synced = await syncCurrentUserFromCloud({ silent: true });
      if (synced) renderPage();
    });

    window.addEventListener('pagehide', () => {
      if (AppState.currentUser) DataBackup.saveSafetyBackup(AppState.currentUser, { force: true });
    });

    function getEffectivePrinterType() {
      const printerType = AppState.config.printer_type || 'standard';
      if (printerType === 'bluetooth') {
        return AppState.config.bluetooth_print_mode || 'thermal_80';
      }
      return printerType;
    }

    function isDownloadPrintMode(printerType = getEffectivePrinterType()) {
      return printerType === 'pdf' || printerType === 'thermal_80' || printerType === 'thermal_58';
    }

    function isBluetoothPrinterSelected() {
      return (AppState.config.printer_type || 'standard') === 'bluetooth';
    }

    function getPrinterModeLabel(printerType = getEffectivePrinterType()) {
      const labels = {
        standard: 'Estandar',
        thermal_80: 'Termica 80mm',
        thermal_58: 'Termica 58mm',
        pdf: 'PDF'
      };
      return labels[printerType] || 'Estandar';
    }

    function updateDate() {
      const now = new Date();
      document.getElementById('current-date').textContent = now.toLocaleDateString('es-MX', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
    }

    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('mobileOverlay');
      const isOpen = sidebar.classList.contains('open');
      
      if (isOpen) {
        closeSidebar();
      } else {
        openSidebar();
      }
    }

    function openSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('mobileOverlay');
      
      sidebar.classList.add('open');
      overlay.classList.remove('hidden');
      void overlay.offsetWidth;
      overlay.classList.remove('opacity-0');
      overlay.classList.add('opacity-100');
      AppState.sidebarOpen = true;
      document.body.style.overflow = 'hidden';
    }

    function closeSidebar(instant = false) {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('mobileOverlay');
      
      sidebar.classList.remove('open');
      overlay.classList.remove('opacity-100');
      overlay.classList.add('opacity-0');
      AppState.sidebarOpen = false;
      document.body.style.overflow = '';

      if (instant) {
        overlay.classList.add('hidden');
        return;
      }
      
      setTimeout(() => {
        overlay.classList.add('hidden');
      }, 300);
    }

    let navigationSyncTimer = null;
    let navigationRenderTimer = null;
    let lastNavigationSyncAt = 0;

    function scheduleNavigationSync(page) {
      clearTimeout(navigationSyncTimer);
      const elapsed = Date.now() - lastNavigationSyncAt;
      const delay = elapsed > 30000 ? 1200 : 30000 - elapsed;

      navigationSyncTimer = setTimeout(() => {
        lastNavigationSyncAt = Date.now();
        syncCurrentUserFromCloud({ silent: true }).then((changed) => {
          if (changed && AppState.currentPage === page) {
            renderPageQuietly();
          }
        });
      }, delay);
    }

    function navigate(page) {
      AppState.currentPage = page;
      
      if (window.innerWidth <= 900) {
        closeSidebar(true);
      }
      
      document.querySelectorAll('.nav-item').forEach(item => {
        const isActive = item.dataset.page === page;
        if (isActive) {
          item.className = 'nav-item active flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200 text-sm font-medium text-primary-400 bg-primary-500/10 border-l-2 border-primary-500';
        } else {
          item.className = 'nav-item flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50';
        }
      });
      
      const titles = {
        dashboard: 'Dashboard', inventory: 'Inventario', entries: 'Entradas',
        suppliers: 'Proveedores', clients: 'Clientes', sales: 'Nueva Venta',
        credit: 'Gestion de Credito', invoices: 'Facturas', 
        dailyMeters: 'Reporte de Metros Diarios',
        directTrips: 'Viajes Directos',
        fuelDispatch: 'Despacho de gasol',
        reports: 'Reportes',
        settings: 'Configuracion'
      };
      document.getElementById('page-title').textContent = titles[page] || page;
      
      clearTimeout(navigationRenderTimer);
      const contentArea = document.getElementById('content-area');
      if (contentArea) contentArea.style.opacity = '0.82';
      navigationRenderTimer = setTimeout(() => {
        if (AppState.currentPage !== page) return;
        renderPage();
        if (contentArea) contentArea.style.opacity = '';
        scheduleNavigationSync(page);
      }, 0);
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && AppState.sidebarOpen) {
        closeSidebar();
      }
    });

    let viewportUpdateFrame = null;
    window.addEventListener('resize', () => {
      if (viewportUpdateFrame) return;
      viewportUpdateFrame = requestAnimationFrame(() => {
        viewportUpdateFrame = null;
      const mobileToggle = document.getElementById('mobileToggle');
      
      if (window.innerWidth > 900) {
        mobileToggle.classList.add('hidden');
        document.getElementById('mobileOverlay').classList.add('hidden');
        document.body.style.overflow = '';
      } else {
        mobileToggle.classList.remove('hidden');
      }
      });
    });

    function getRecords(type) {
      const cache = AppState.recordCache;
      if (cache?.data === AppState.data && cache.size === AppState.data.length) {
        return cache.byType[type] || [];
      }

      const byType = Object.create(null);
      AppState.data.forEach(record => {
        const bucket = byType[record.type] || (byType[record.type] = []);
        bucket.push(record);
      });
      AppState.recordCache = { data: AppState.data, size: AppState.data.length, byType };
      return byType[type] || [];
    }

    function calcInventory() {
      if (AppState.inventoryCache) return AppState.inventoryCache;
      const materials = getRecords('material');
      const entries = getRecords('entry');
      const sales = getRecords('sale');
      const inv = {};
      
      materials.forEach(m => {
        inv[m.name] = {
          name: m.name, price: m.price || 0, unit: m.unit || 'm3',
          stock: 0, id: m.__backendId, min_stock: m.min_stock || 10
        };
      });
      
      entries.forEach(e => {
        if (inv[e.material_name]) inv[e.material_name].stock += (e.quantity || 0);
      });
      
      sales.forEach(s => {
        if (Array.isArray(s.items) && s.items.length) {
          s.items.forEach(item => {
            if (inv[item.material_name]) inv[item.material_name].stock -= (item.quantity || 0);
          });
        } else if (inv[s.material_name]) {
          inv[s.material_name].stock -= (s.sale_quantity || 0);
        }
      });
      
      AppState.inventoryCache = inv;
      return inv;
    }

    function generateInvoiceNum() {
      AppState.invoiceCounter++;
      AppState.saveUserData();
      return `FAC-${String(AppState.invoiceCounter).padStart(4, '0')}`;
    }

    const CURRENCY_SYMBOL_OVERRIDES = {
      DOP: 'RD$'
    };
    const numberFormatterCache = new Map();
    const dateFormatterCache = new Map();
    const currencyFormatterCache = new Map();
    const currencySymbolCache = new Map();

    function getNumberFormatter(locale, options) {
      const key = `${locale}:${JSON.stringify(options)}`;
      if (!numberFormatterCache.has(key)) {
        numberFormatterCache.set(key, new Intl.NumberFormat(locale, options));
      }
      return numberFormatterCache.get(key);
    }

    function getCurrencyFormatter(code) {
      if (!currencyFormatterCache.has(code)) {
        currencyFormatterCache.set(code, new Intl.NumberFormat('es-DO', {
          style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2
        }));
      }
      return currencyFormatterCache.get(code);
    }

    function getDateFormatter(locale, options) {
      const key = `${locale}:${JSON.stringify(options)}`;
      if (!dateFormatterCache.has(key)) {
        dateFormatterCache.set(key, new Intl.DateTimeFormat(locale, options));
      }
      return dateFormatterCache.get(key);
    }

    function formatCurrencyValue(value) {
      const code = AppState.config.currency || 'MXN';
      const amount = Number(value || 0);

      try {
        const formatter = getCurrencyFormatter(code);
        if (!currencySymbolCache.has(code)) {
          currencySymbolCache.set(code, formatter.formatToParts(0).find(part => part.type === 'currency')?.value || '');
        }
        const nativeSymbol = currencySymbolCache.get(code);
        return formatter.format(amount).replace(nativeSymbol, getCurrencySymbol(code));
      } catch (error) {
        return `${getCurrencySymbol(code)} ${getNumberFormatter('es-DO', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(amount)}`;
      }
    }

    const fmt = {
      currency: (n) => formatCurrencyValue(n),
      number: (n, d = 1) => getNumberFormatter('es-MX', {
        minimumFractionDigits: d, maximumFractionDigits: d
      }).format(n || 0),
      quantity: (n, max = 6) => getNumberFormatter('es-MX', {
        minimumFractionDigits: 0,
        maximumFractionDigits: max
      }).format(Number(n) || 0),
      date: (iso) => iso ? getDateFormatter('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric'
      }).format(new Date(iso)) : '-',
      dateTime: (iso) => iso ? getDateFormatter('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(new Date(iso)) : '-',
      dateInput: (iso) => iso ? iso.split('T')[0] : ''
    };

    function formatDateKey(dateKey) {
      if (!dateKey) return '-';
      const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return fmt.date(dateKey);
      const [, year, month, day] = match;
      return getDateFormatter('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric'
      }).format(new Date(Number(year), Number(month) - 1, Number(day)));
    }

    function getLocalDateKey(value) {
      if (!value) return '';
      const raw = String(value);
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const date = new Date(raw);
      if (isNaN(date.getTime())) return raw.slice(0, 10);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function matchesDateFilter(isoDate, dateFrom = '', dateTo = '') {
      if (!dateFrom && !dateTo) return true;
      const day = getLocalDateKey(isoDate);
      if (!day) return false;
      if (dateFrom && dateTo) return day >= dateFrom && day <= dateTo;
      return day === (dateFrom || dateTo);
    }

    let filterRenderTimer = null;
    let reportSearchTimer = null;
    let isFilterRendering = false;
    let isTextComposing = false;

    document.addEventListener('compositionstart', () => {
      isTextComposing = true;
    });

    document.addEventListener('compositionend', () => {
      isTextComposing = false;
    });

    function isTouchKeyboardLikely() {
      return window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    function getFilterRenderDelay() {
      if (isTextComposing) return 600;
      return isTouchKeyboardLikely() ? 450 : 180;
    }

    function enhanceSearchInputs(root = document) {
      root.querySelectorAll('input[type="text"][id*="Search"], input[type="search"], input[id$="FilterSearch"], #fuelSearch, #configPrinterSearch, #currencySearch').forEach(input => {
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocapitalize', 'none');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('spellcheck', 'false');
      });
    }

    function renderPageForFilter(searchInputId) {
      const active = document.getElementById(searchInputId);
      const focusState = active ? {
        id: searchInputId,
        start: active.selectionStart,
        end: active.selectionEnd
      } : null;
      const scrollState = { x: window.scrollX, y: window.scrollY };

      isFilterRendering = true;
      if (AppState.currentPage === 'reports') {
        const container = document.getElementById('content-area');
        renderReports(container);
        lucide.createIcons();
        enhanceSearchInputs(container);
      } else {
        renderPage();
      }
      isFilterRendering = false;

      if (focusState) {
        const nextInput = document.getElementById(focusState.id);
        if (nextInput) {
          nextInput.focus({ preventScroll: true });
          if (typeof nextInput.setSelectionRange === 'function') {
            nextInput.setSelectionRange(focusState.start, focusState.end);
          }
        }
      }
      window.scrollTo(scrollState.x, scrollState.y);
    }

    function renderPageDebounced(delay = 250, searchInputId = null) {
      clearTimeout(filterRenderTimer);
      filterRenderTimer = setTimeout(() => {
        filterRenderTimer = null;
        if (searchInputId) {
          renderPageForFilter(searchInputId);
        } else {
          renderPage();
        }
      }, delay);
    }

    function renderFilterPage(searchInputId) {
      if (document.activeElement?.id === searchInputId) {
        renderPageDebounced(getFilterRenderDelay(), searchInputId);
        return;
      }
      clearTimeout(filterRenderTimer);
      renderPage();
    }

    function showToast(message, type = 'success') {
      const container = document.getElementById('toastContainer');
      if (!container) return;
      const toast = document.createElement('div');
      
      const icons = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
      const colors = {
        success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
        error: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
        warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
        info: 'bg-primary-500/10 border-primary-500/20 text-primary-400'
      };
      
      toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg transform transition-all duration-300 translate-x-full opacity-0 ${colors[type]}`;
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', icons[type] || icons.info);
      icon.className = 'w-5 h-5 flex-shrink-0';
      const text = document.createElement('span');
      text.className = 'text-sm font-medium';
      text.textContent = String(message ?? '');
      toast.append(icon, text);
      
      container.appendChild(toast);
      lucide.createIcons();
      
      requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
      });
      
      setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    function openPrintDocument(html, options = {}) {
      const printWindow = options.windowRef || window.open('', '_blank');
      if (!printWindow) {
        showToast(options.blockedMessage || 'El navegador bloqueo la ventana de impresion', 'warning');
        return null;
      }

      const autoClose = options.autoClose !== false;
      const printDelay = Number.isFinite(options.delay) ? options.delay : 250;
      const content = String(html).replace(/<body([^>]*)\s+onload="[^"]*"([^>]*)>/i, '<body$1$2>');

      printWindow.document.open();
      printWindow.document.write(content);
      printWindow.document.close();

      const waitForAssets = () => {
        const images = Array.from(printWindow.document.images || []);
        if (!images.length) return Promise.resolve();

        const imagePromises = images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        });

        return Promise.race([
          Promise.all(imagePromises),
          new Promise(resolve => setTimeout(resolve, 1800))
        ]);
      };

      const printWhenReady = async () => {
        await waitForAssets();
        setTimeout(() => {
          try {
            printWindow.focus();
            printWindow.print();
            if (autoClose) {
              setTimeout(() => {
                try { printWindow.close(); } catch (error) {}
              }, 700);
            }
          } catch (error) {
            showToast('No se pudo abrir la impresion', 'error');
          }
        }, printDelay);
      };

      if (printWindow.document.readyState === 'complete') {
        printWhenReady();
      } else {
        printWindow.addEventListener('load', printWhenReady, { once: true });
        setTimeout(printWhenReady, 1200);
      }

      return printWindow;
    }

    function showModal(content) {
      const container = document.getElementById('modalContainer');
      const modalContent = document.getElementById('modalContent');
      modalContent.innerHTML = content;
      container.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      lucide.createIcons();
    }

    function closeModal() {
      document.getElementById('modalContainer').classList.add('hidden');
      if (!AppState.sidebarOpen) {
        document.body.style.overflow = '';
      }
    }

    function updateCompanyInfo() {
      document.getElementById('nav-company-name').textContent = AppState.config.company_name;
    }

    function updateLogoDisplay() {
      const logoImg = document.getElementById('companyLogoImg');
      const defaultIcon = document.getElementById('defaultLogoIcon');
      const container = document.getElementById('companyLogoContainer');
      
      if (AppState.config.company_logo) {
        logoImg.src = AppState.config.company_logo;
        logoImg.classList.remove('hidden');
        defaultIcon.classList.add('hidden');
        container.classList.add('has-logo');
      } else {
        logoImg.classList.add('hidden');
        defaultIcon.classList.remove('hidden');
        container.classList.remove('has-logo');
      }
    }

    function updateStorageIndicator() {
      const bar = document.getElementById('storage-bar');
      const text = document.getElementById('storage-text');
      
      if (bar && text) {
        bar.style.width = '100%';
        text.textContent = `${AppState.data.length} registros`;
        bar.className = 'h-full transition-all duration-500 bg-gradient-to-r from-primary-500 to-primary-400';
      }
    }

    function updateCreditBadge() {
      const sales = getRecords('sale');
      const pending = sales.filter(s => s.payment_status === 'pendiente').length;
      const badge = document.getElementById('credit-badge');
      if (badge) {
        badge.textContent = pending;
        badge.classList.toggle('hidden', pending === 0);
      }
    }

    function renderPage() {
      const container = document.getElementById('content-area');
      updateStorageIndicator();
      updateCreditBadge();
      
      switch(AppState.currentPage) {
        case 'dashboard': renderDashboard(container); break;
        case 'inventory': renderInventory(container); break;
        case 'entries': renderEntries(container); break;
        case 'suppliers': renderSuppliers(container); break;
        case 'clients': renderClients(container); break;
        case 'sales': renderSales(container); break;
        case 'credit': renderCredit(container); break;
        case 'invoices': renderInvoices(container); break;
        case 'reports': renderReports(container); break;
        case 'dailyMeters': renderDailyMeters(container); break;
        case 'directTrips': renderDirectTrips(container); break;
        case 'fuelDispatch': renderFuelDispatch(container); break;
        case 'settings': renderSettings(container); break;
      }

      container.querySelectorAll('.animate-fade-in').forEach(el => el.classList.remove('animate-fade-in'));
      
      enhanceSearchInputs(container);
      requestAnimationFrame(() => {
        if (container.isConnected) lucide.createIcons();
      });
    }

    function renderPageQuietly({ preserveScroll = true } = {}) {
      const scrollState = { x: window.scrollX, y: window.scrollY };
      const previousFilterRendering = isFilterRendering;
      isFilterRendering = true;
      renderPage();
      isFilterRendering = previousFilterRendering;
      if (preserveScroll) {
        requestAnimationFrame(() => window.scrollTo(scrollState.x, scrollState.y));
      }
    }

    let currentCloudSyncPromise = null;
    async function syncCurrentUserFromCloud({ silent = false } = {}) {
      if (!AuthSystem.currentUser?.username || !SupabaseSync.client) return false;
      if (currentCloudSyncPromise) return currentCloudSyncPromise;

      currentCloudSyncPromise = (async () => {
        try {
          const username = AuthSystem.currentUser.username;
          const beforeData = localStorage.getItem(`erp_data_${username}`) || '';
          const beforeConfig = localStorage.getItem(`erp_config_${username}`) || '';
          await SupabaseSync.flush();
          await AppState.loadUserData(username);
          const afterData = localStorage.getItem(`erp_data_${username}`) || '';
          const afterConfig = localStorage.getItem(`erp_config_${username}`) || '';
          const changed = beforeData !== afterData || beforeConfig !== afterConfig;
          if (changed && !silent) showToast('Datos y configuracion actualizados desde la nube', 'success');
          return changed;
        } catch (error) {
          console.warn('No se pudo sincronizar desde Supabase:', error.message || error);
          if (!silent) showToast('No se pudo leer la nube. Revisa la conexion o Supabase.', 'error');
          return false;
        }
      })();

      try {
        return await currentCloudSyncPromise;
      } finally {
        currentCloudSyncPromise = null;
      }
    }

    async function forceUploadToCloud() {
      if (!AuthSystem.currentUser?.username || !SupabaseSync.client) {
        showToast('Inicia sesion para subir datos a la nube', 'error');
        return;
      }

      const ok = confirm(`Subir a la nube los datos de este telefono para la cuenta ${AuthSystem.currentUser.email || AuthSystem.currentUser.username}?`);
      if (!ok) return;

      try {
        const username = AuthSystem.currentUser.username;
        let dataToUpload = Array.isArray(AppState.data) ? AppState.data : [];
        let configToUpload = AppState.config || {};
        try {
          const storedData = JSON.parse(localStorage.getItem(`erp_data_${username}`) || '[]');
          if (Array.isArray(storedData) && storedData.length >= dataToUpload.length) dataToUpload = storedData;
          const storedConfig = JSON.parse(localStorage.getItem(`erp_config_${username}`) || '{}');
          if (storedConfig && typeof storedConfig === 'object') configToUpload = { ...configToUpload, ...storedConfig };
        } catch (readError) {
          console.warn('No se pudo leer la copia local para subir:', readError.message || readError);
        }

        const rows = [
          {
            key: `erp_data_${username}`,
            value: dataToUpload,
            updated_at: new Date().toISOString()
          },
          {
            key: `erp_config_${username}`,
            value: configToUpload,
            updated_at: new Date().toISOString()
          }
        ];

        const { error } = await SupabaseSync.client
          .from(SUPABASE_CONFIG.table)
          .upsert(rows, { onConflict: 'key' });

        if (error) {
          showToast(error.message || 'No se pudo subir a la nube', 'error');
          console.warn('No se pudo subir a Supabase:', error.message || error);
          return;
        }

        showToast(`Subido a la nube: ${dataToUpload.length} registros`, 'success');
      } catch (error) {
        console.warn('No se pudo subir a Supabase:', error.message || error);
        showToast('No se pudo subir a la nube. Revisa conexion o permisos de Supabase.', 'error');
      }
    }

    function renderDashboard(container) {
      const inv = calcInventory();
      const materials = Object.values(inv);
      const sales = getRecords('sale');
      const clients = getRecords('client');
      
      const today = new Date().toISOString().split('T')[0];
      const todaySales = sales.filter(s => s.date?.startsWith(today));
      const todayTotal = todaySales.reduce((a, s) => a + (s.sale_total || 0), 0);
      const lowStock = materials.filter(m => m.stock < m.min_stock).length;

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="glass rounded-xl p-5 hover-lift border-l-4 border-primary-500">
              <div class="flex items-center justify-between mb-3">
                <span class="text-slate-400 text-xs font-semibold uppercase">Stock Total</span>
                <div class="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center">
                  <i data-lucide="package" class="w-4 h-4 text-primary-400"></i>
                </div>
              </div>
              <div class="text-2xl font-bold text-slate-100 font-mono">${fmt.number(materials.reduce((a, m) => a + m.stock, 0))}</div>
              <div class="text-xs text-slate-500 mt-1">${materials.length} materiales</div>
            </div>
            
            <div class="glass rounded-xl p-5 hover-lift border-l-4 border-emerald-500">
              <div class="flex items-center justify-between mb-3">
                <span class="text-slate-400 text-xs font-semibold uppercase">Ventas Hoy</span>
                <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <i data-lucide="trending-up" class="w-4 h-4 text-emerald-400"></i>
                </div>
              </div>
              <div class="text-2xl font-bold text-emerald-400 font-mono">${fmt.currency(todayTotal)}</div>
              <div class="text-xs text-slate-500 mt-1">${todaySales.length} transacciones</div>
            </div>
            
            <div class="glass rounded-xl p-5 hover-lift border-l-4 border-blue-500">
              <div class="flex items-center justify-between mb-3">
                <span class="text-slate-400 text-xs font-semibold uppercase">Ingresos Totales</span>
                <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <i data-lucide="dollar-sign" class="w-4 h-4 text-blue-400"></i>
                </div>
              </div>
              <div class="text-2xl font-bold text-blue-400 font-mono">${fmt.currency(sales.reduce((a, s) => a + (s.sale_total || 0), 0))}</div>
              <div class="text-xs text-slate-500 mt-1">${sales.length} ventas</div>
            </div>
            
            <div class="glass rounded-xl p-5 hover-lift border-l-4 ${lowStock > 0 ? 'border-rose-500' : 'border-emerald-500'}">
              <div class="flex items-center justify-between mb-3">
                <span class="text-slate-400 text-xs font-semibold uppercase">Alertas Stock</span>
                <div class="w-8 h-8 rounded-lg ${lowStock > 0 ? 'bg-rose-500/10' : 'bg-emerald-500/10'} flex items-center justify-center">
                  <i data-lucide="alert-triangle" class="w-4 h-4 ${lowStock > 0 ? 'text-rose-400' : 'text-emerald-400'}"></i>
                </div>
              </div>
              <div class="text-2xl font-bold ${lowStock > 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">${lowStock}</div>
              <div class="text-xs text-slate-500 mt-1">materiales bajos</div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 glass rounded-xl overflow-hidden">
              <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 class="font-semibold text-slate-200 flex items-center gap-2">
                  <i data-lucide="package" class="w-4 h-4 text-primary-400"></i> Inventario Actual
                </h3>
                <button onclick="navigate('inventory')" class="text-xs text-primary-400 hover:text-primary-300 font-medium">Ver todo -></button>
              </div>
              <div class="divide-y divide-slate-800/50">
                ${materials.length === 0 ? `
                  <div class="p-8 text-center text-slate-500">
                    <i data-lucide="package-x" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
                    <p>Sin materiales registrados</p>
                    <button onclick="showMaterialModal()" class="mt-3 text-primary-400 hover:text-primary-300 text-sm">Agregar material</button>
                  </div>
                ` : materials.slice(0, 5).map(m => `
                  <div class="px-6 py-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                        <i data-lucide="box" class="w-5 h-5 text-slate-400"></i>
                      </div>
                      <div>
                        <div class="font-medium text-slate-200">${m.name}</div>
                        <div class="text-xs text-slate-500">${m.unit} - ${fmt.currency(m.price)}/unidad</div>
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="font-mono font-semibold ${m.stock < m.min_stock ? 'text-rose-400' : 'text-slate-100'}">${fmt.number(m.stock)}</div>
                      <span class="status-badge ${m.stock < m.min_stock ? 'bg-rose-500/10 text-rose-400' : m.stock < m.min_stock * 3 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}">
                        <div class="w-1.5 h-1.5 rounded-full ${m.stock < m.min_stock ? 'bg-rose-400' : m.stock < m.min_stock * 3 ? 'bg-amber-400' : 'bg-emerald-400'}"></div>
                        ${m.stock < m.min_stock ? 'Critico' : m.stock < m.min_stock * 3 ? 'Bajo' : 'OK'}
                      </span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="glass rounded-xl overflow-hidden">
              <div class="px-6 py-4 border-b border-slate-800">
                <h3 class="font-semibold text-slate-200 flex items-center gap-2">
                  <i data-lucide="activity" class="w-4 h-4 text-primary-400"></i> Actividad Reciente
                </h3>
              </div>
              <div class="p-4 space-y-3 max-h-96 overflow-y-auto">
                ${sales.length === 0 ? `
                  <div class="text-center text-slate-500 py-8">
                    <i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 opacity-50"></i>
                    <p class="text-sm">Sin ventas recientes</p>
                  </div>
                ` : sales.slice(-5).reverse().map(s => `
                  <div class="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-800/50">
                    <div class="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <i data-lucide="shopping-cart" class="w-4 h-4 text-emerald-400"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center justify-between gap-2">
                        <span class="font-medium text-slate-200 text-sm truncate">${s.client_name}</span>
                        <span class="text-emerald-400 font-mono font-semibold text-sm">${fmt.currency(s.sale_total)}</span>
                      </div>
                      <div class="text-xs text-slate-500 mt-0.5">${s.material_name} - ${fmt.date(s.date)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            ${[
              { icon: 'plus-circle', color: 'emerald', label: 'Nueva Venta', desc: 'Registrar transaccion', action: "navigate('sales')" },
              { icon: 'arrow-down-left', color: 'blue', label: 'Entrada', desc: 'Recibir material', action: "showEntryModal()" },
              { icon: 'user-plus', color: 'purple', label: 'Cliente', desc: 'Agregar nuevo', action: "showClientModal()" },
              { icon: 'file-text', color: 'amber', label: 'Reporte', desc: 'Ver analisis', action: "navigate('reports')" }
            ].map(btn => `
              <button onclick="${btn.action}" class="glass rounded-xl p-4 text-left hover:bg-slate-800/50 transition-all group">
                <div class="w-10 h-10 rounded-lg bg-${btn.color}-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <i data-lucide="${btn.icon}" class="w-5 h-5 text-${btn.color}-400"></i>
                </div>
                <div class="font-medium text-slate-200 text-sm">${btn.label}</div>
                <div class="text-xs text-slate-500 mt-1">${btn.desc}</div>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    function renderInventory(container) {
      const inv = calcInventory();
      const materials = getRecords('material');
      const invData = materials.map(m => ({
        ...m, stock: inv[m.name] ? inv[m.name].stock : 0,
        total_value: (inv[m.name] ? inv[m.name].stock : 0) * (m.price || 0)
      }));

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 class="text-2xl font-bold text-slate-100">Inventario</h2>
              <p class="text-slate-500 text-sm mt-1">Gestion de materiales y stock</p>
            </div>
            <button onclick="showMaterialModal()" class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-400 text-slate-900 font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20">
              <i data-lucide="plus" class="w-4 h-4"></i> Nuevo Material
            </button>
          </div>

          <div class="glass rounded-xl overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full data-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Unidad</th>
                    <th>Precio</th>
                    <th>Stock</th>
                    <th>Valor Total</th>
                    <th>Estado</th>
                    <th class="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${invData.length === 0 ? `
                    <tr>
                      <td colspan="7" class="text-center py-12 text-slate-500">
                        <div class="flex flex-col items-center gap-3">
                          <i data-lucide="package-x" class="w-12 h-12 opacity-30"></i>
                          <p>No hay materiales registrados</p>
                          <button onclick="showMaterialModal()" class="text-primary-400 hover:text-primary-300 text-sm font-medium">Agregar primer material</button>
                        </div>
                      </td>
                    </tr>
                  ` : invData.map(m => `
                    <tr>
                      <td>
                        <div class="flex items-center gap-3">
                          <div class="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                            <i data-lucide="box" class="w-4 h-4 text-slate-400"></i>
                          </div>
                          <span class="font-medium text-slate-200">${m.name}</span>
                        </div>
                      </td>
                      <td class="text-slate-400">${m.unit || 'm3'}</td>
                      <td class="font-mono text-slate-300">${fmt.currency(m.price)}</td>
                      <td class="font-mono font-semibold ${m.stock < (m.min_stock || 10) ? 'text-rose-400' : 'text-slate-200'}">${fmt.number(m.stock)}</td>
                      <td class="font-mono text-slate-300">${fmt.currency(m.total_value)}</td>
                      <td>
                        <span class="status-badge ${m.stock < (m.min_stock || 10) ? 'bg-rose-500/10 text-rose-400' : m.stock < (m.min_stock || 10) * 3 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}">
                          <div class="w-1.5 h-1.5 rounded-full ${m.stock < (m.min_stock || 10) ? 'bg-rose-400' : m.stock < (m.min_stock || 10) * 3 ? 'bg-amber-400' : 'bg-emerald-400'}"></div>
                          ${m.stock < (m.min_stock || 10) ? 'Critico' : m.stock < (m.min_stock || 10) * 3 ? 'Bajo' : 'Normal'}
                        </span>
                      </td>
                      <td class="text-right">
                        <div class="flex items-center justify-end gap-2">
                          <button onclick="showEditMaterialModal('${m.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 transition-colors" title="Editar">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                          </button>
                          ${AppState.deleteConfirmId === m.__backendId ? `
                            <div class="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-1.5">
                              <span class="text-xs text-rose-400">Eliminar?</span>
                              <button onclick="confirmDeleteRecord('${m.__backendId}')" class="text-xs text-rose-400 hover:text-rose-300 font-semibold">Si</button>
                              <button onclick="cancelDelete()" class="text-xs text-slate-400 hover:text-slate-300">No</button>
                            </div>
                          ` : `
                            <button onclick="askDelete('${m.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Eliminar">
                              <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                          `}
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    function renderEntries(container) {
      const entries = getRecords('entry');
      const materials = getRecords('material');
      const filteredEntries = getFilteredEntries();

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 class="text-2xl font-bold text-slate-100">Registro de Entradas</h2>
              <p class="text-slate-500 text-sm mt-1">Material recibido de proveedores</p>
            </div>
            <button onclick="showEntryModal()" ${materials.length === 0 ? 'disabled' : ''} 
              class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-900 font-semibold rounded-lg transition-all">
              <i data-lucide="plus" class="w-4 h-4"></i> Nueva Entrada
            </button>
          </div>

          <div class="glass rounded-xl p-4 border border-slate-700/50">
            <div class="flex items-center gap-2 mb-4 text-primary-400">
              <i data-lucide="filter" class="w-4 h-4"></i>
              <span class="text-sm font-medium">Filtrar Entradas</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div class="md:col-span-2">
                <label class="block text-xs text-slate-500 mb-1">Buscar</label>
                <div class="relative">
                  <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-2.5"></i>
                  <input type="text" id="entryFilterSearch" value="${AppState.entryFilters.search || ''}" oninput="updateEntryFilters()" placeholder="Material, proveedor, factura..."
                    class="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                </div>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">PDF</label>
                <button type="button" onclick="exportEntryReportPDF()"
                  class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-rose-500 hover:bg-rose-400 text-white rounded-lg text-sm font-semibold transition-colors">
                  <i data-lucide="file-text" class="w-4 h-4"></i> PDF
                </button>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Desde</label>
                <input type="date" id="entryFilterDateFrom" value="${AppState.entryFilters.dateFrom}" onchange="updateEntryFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Hasta</label>
                <input type="date" id="entryFilterDateTo" value="${AppState.entryFilters.dateTo}" onchange="updateEntryFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
            </div>
            
            <div class="flex flex-wrap gap-2 mt-3">
              <div class="w-full sm:w-48">
                <label class="block text-xs text-slate-500 mb-1">Periodo rapido</label>
                <select id="entryQuickDateFilter" onchange="setQuickDateFilter(this.value)"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus select-custom">
                  <option value="" ${!AppState.entryFilters.quickPeriod ? 'selected' : ''}>Seleccionar</option>
                  <option value="today" ${AppState.entryFilters.quickPeriod === 'today' ? 'selected' : ''}>Hoy</option>
                  <option value="week" ${AppState.entryFilters.quickPeriod === 'week' ? 'selected' : ''}>Semana</option>
                  <option value="month" ${AppState.entryFilters.quickPeriod === 'month' ? 'selected' : ''}>Mes</option>
                  <option value="year" ${AppState.entryFilters.quickPeriod === 'year' ? 'selected' : ''}>Año</option>
                </select>
              </div>
            </div>

            ${AppState.entryFilters.supplier || AppState.entryFilters.dateFrom || AppState.entryFilters.dateTo ? `
              <div class="mt-3 flex items-center gap-2">
                <button onclick="clearEntryFilters()" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
                  <i data-lucide="x-circle" class="w-3 h-3"></i> Limpiar filtros
                </button>
                <span class="text-xs text-slate-500">- Mostrando ${filteredEntries.length} de ${entries.length} entradas</span>
              </div>
            ` : ''}
          </div>

          ${materials.length === 0 ? `
            <div class="glass rounded-xl p-8 text-center border border-amber-500/20 bg-amber-500/5">
              <i data-lucide="alert-circle" class="w-12 h-12 text-amber-400 mx-auto mb-3"></i>
              <h3 class="text-lg font-semibold text-amber-400 mb-2">Materiales Requeridos</h3>
              <p class="text-slate-400 mb-4">Debes registrar materiales antes de poder crear entradas</p>
              <button onclick="showMaterialModal()" class="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors font-medium">Crear Material</button>
            </div>
          ` : ''}

          <div class="glass rounded-xl overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Material</th>
                    <th>Cantidad</th>
                    <th>Proveedor</th>
                    <th>Factura Prov.</th>
                    <th>Costo Total</th>
                    <th class="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredEntries.length === 0 ? `
                    <tr>
                      <td colspan="7" class="text-center py-12 text-slate-500">
                        <div class="flex flex-col items-center gap-3">
                          <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
                          <p>${entries.length === 0 ? 'Sin entradas registradas' : 'No hay entradas con los filtros seleccionados'}</p>
                        </div>
                      </td>
                    </tr>
                  ` : filteredEntries.slice().reverse().map(e => `
                    <tr>
                      <td class="text-slate-400 text-sm">${fmt.dateTime(e.date)}</td>
                      <td class="font-medium text-slate-200">${e.material_name}</td>
                      <td class="font-mono text-slate-300">${fmt.number(e.quantity)}</td>
                      <td class="text-slate-300">${e.supplier_name || '-'}</td>
                      <td class="font-mono text-primary-400">${e.supplier_invoice || '-'}</td>
                      <td class="font-mono text-slate-300">${e.price ? fmt.currency(e.price * e.quantity) : '-'}</td>
                      <td class="text-right">
                        ${AppState.deleteConfirmId === e.__backendId ? `
                          <div class="flex items-center justify-end gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-1.5">
                            <span class="text-xs text-rose-400">Eliminar?</span>
                            <button onclick="confirmDeleteRecord('${e.__backendId}')" class="text-xs text-rose-400 hover:text-rose-300 font-semibold">Si</button>
                            <button onclick="cancelDelete()" class="text-xs text-slate-400 hover:text-slate-300">No</button>
                          </div>
                        ` : `
                          <div class="flex items-center justify-end gap-2">
                            <button onclick="showEntryModal('${e.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 transition-colors" title="Editar">
                              <i data-lucide="edit-2" class="w-4 h-4"></i>
                            </button>
                            <button onclick="askDelete('${e.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Eliminar">
                              <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                          </div>
                        `}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    function setQuickDateFilter(period) {
      const today = new Date();
      const formatDate = (d) => d.toISOString().split('T')[0];
      const daysAgo = (days) => {
        const date = new Date(today);
        date.setDate(today.getDate() - days);
        return date;
      };
      
      let fromDate, toDate;
      
      switch(period) {
        case '':
          AppState.entryFilters.quickPeriod = '';
          AppState.entryFilters.dateFrom = '';
          AppState.entryFilters.dateTo = '';
          renderPage();
          return;
        case 'today':
          fromDate = toDate = formatDate(today);
          break;
        case 'thisWeek':
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          fromDate = formatDate(weekStart);
          toDate = formatDate(today);
          break;
        case 'week':
          fromDate = formatDate(daysAgo(6));
          toDate = formatDate(today);
          break;
        case 'thisMonth':
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          fromDate = formatDate(monthStart);
          toDate = formatDate(today);
          break;
        case 'month':
          fromDate = formatDate(daysAgo(29));
          toDate = formatDate(today);
          break;
        case 'thisYear':
          const yearStart = new Date(today.getFullYear(), 0, 1);
          fromDate = formatDate(yearStart);
          toDate = formatDate(today);
          break;
        case 'year':
          fromDate = formatDate(daysAgo(364));
          toDate = formatDate(today);
          break;
        default:
          return;
      }
      
      AppState.entryFilters.quickPeriod = period;
      AppState.entryFilters.dateFrom = fromDate;
      AppState.entryFilters.dateTo = toDate;
      renderPage();
    }

    function updateEntryFilters() {
      AppState.entryFilters.search = document.getElementById('entryFilterSearch')?.value || '';
      AppState.entryFilters.dateFrom = document.getElementById('entryFilterDateFrom').value;
      AppState.entryFilters.dateTo = document.getElementById('entryFilterDateTo').value;
      AppState.entryFilters.quickPeriod = '';
      renderFilterPage('entryFilterSearch');
    }

    function clearEntryFilters() {
      AppState.entryFilters = { search: '', supplier: '', dateFrom: '', dateTo: '', quickPeriod: '' };
      renderPage();
    }

    function getFilteredEntries() {
      let filteredEntries = getRecords('entry');
      if (AppState.entryFilters.search) {
        const search = AppState.entryFilters.search.toLowerCase();
        filteredEntries = filteredEntries.filter(e =>
          (e.material_name?.toLowerCase() || '').includes(search) ||
          (e.supplier_name?.toLowerCase() || '').includes(search) ||
          (e.supplier_invoice?.toLowerCase() || '').includes(search)
        );
      }
      if (AppState.entryFilters.supplier) {
        filteredEntries = filteredEntries.filter(e =>
          e.supplier_name?.toLowerCase().includes(AppState.entryFilters.supplier.toLowerCase())
        );
      }
      if (AppState.entryFilters.dateFrom || AppState.entryFilters.dateTo) {
        filteredEntries = filteredEntries.filter(e => matchesDateFilter(e.date, AppState.entryFilters.dateFrom, AppState.entryFilters.dateTo));
      }
      return filteredEntries;
    }

    function exportEntryReportPDF() {
      if (!window.jspdf?.jsPDF) {
        showToast('La libreria PDF no esta disponible.', 'error');
        return;
      }

      const entries = getFilteredEntries().slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      if (!entries.length) {
        showToast('No hay entradas para exportar en PDF.', 'warning');
        return;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const black = [0, 0, 0];
      let y = 0;

      const materialTotals = {};
      entries.forEach(e => {
        const material = e.material_name || 'Sin material';
        materialTotals[material] = (materialTotals[material] || 0) + (Number(e.quantity) || 0);
      });

      const reportDate = new Date();
      const formatReportDate = (date) => date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const formatReportTime = (date) => date.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).replace('a. m.', 'a. m.').replace('p. m.', 'p. m.');
      const formatEntryDate = (value) => {
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) return value || '';
        return date.toLocaleString('es-MX', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).replace('a. m.', 'a. m.').replace('p. m.', 'p. m.');
      };
      const textFit = (text, maxWidth) => {
        const value = String(text || '');
        const lines = doc.splitTextToSize(value, maxWidth);
        return lines.length > 1 ? `${lines[0].replace(/\s+$/g, '')}...` : value;
      };

      const drawTopHeader = () => {
        y = 14;
        const logo = AppState.config.company_logo || RLRR_LOGO_DATA;
        try {
          doc.addImage(logo, 'PNG', margin + 2, 9, 18, 13);
        } catch (err) {
          doc.setDrawColor(...black);
          doc.setLineWidth(0.4);
          doc.rect(margin + 2, 9, 18, 13);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...black);
        doc.text(AppState.config.company_name || 'AGRECACI', margin + 26, 14);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Gestion de Materiales', margin + 26, 22);

        doc.setFontSize(10);
        doc.setTextColor(...black);
        doc.setFont('helvetica', 'bold');
        doc.text('Fecha del reporte:', pageWidth - 70, 14);
        doc.text('Hora:', pageWidth - 70, 22);
        doc.setFont('helvetica', 'normal');
        doc.text(formatReportDate(reportDate), pageWidth - margin, 14, { align: 'right' });
        doc.text(formatReportTime(reportDate), pageWidth - margin, 22, { align: 'right' });

        doc.setDrawColor(...black);
        doc.setLineWidth(0.45);
        doc.line(margin, 31, pageWidth - margin, 31);
      };

      const drawTitleAndTableHead = () => {
        y = 50;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...black);
        doc.text('REPORTE DE ENTRADA DE MATERIALES', pageWidth / 2, y, { align: 'center' });
        y += 18;

        doc.setFontSize(10);
        doc.setTextColor(...black);
        const headers = [
          { label: 'Fecha', x: margin + 18, align: 'left' },
          { label: 'Material', x: margin + 70, align: 'left' },
          { label: 'Cantidad', x: pageWidth / 2 + 1, align: 'center' },
          { label: 'Proveedor', x: margin + 135, align: 'left' },
          { label: 'Factura', x: pageWidth - margin - 28, align: 'left' }
        ];
        doc.setDrawColor(...black);
        doc.setLineWidth(0.35);
        headers.forEach(h => {
          doc.text(h.label, h.x, y, { align: h.align });
        });
        doc.line(margin + 10, y + 6, pageWidth - margin - 8, y + 6);
        y += 13;
      };

      const drawPageScaffold = () => {
        drawTopHeader();
        drawTitleAndTableHead();
      };

      const addPageIfNeeded = (needed = 10) => {
        if (y + needed <= pageHeight - 14) return;
        doc.addPage();
        drawPageScaffold();
      };

      drawPageScaffold();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      entries.forEach(e => {
        addPageIfNeeded(9);
        doc.setTextColor(...black);
        doc.text(textFit(formatEntryDate(e.date), 58), margin + 18, y);
        doc.text(textFit(e.material_name || '', 42), margin + 70, y);
        doc.text(String(fmt.number(Number(e.quantity) || 0, 0)), pageWidth / 2 + 1, y, { align: 'center' });
        doc.text(textFit(e.supplier_name || '', 42), margin + 135, y);
        doc.text(textFit(e.supplier_invoice || '', 34), pageWidth - margin - 28, y);
        y += 9;
      });

      y += 16;
      addPageIfNeeded(50);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...black);
      doc.text('RESUMEN DE MATERIALES', pageWidth / 2, y, { align: 'center' });
      y += 10;

      doc.setFontSize(10);
      const summaryWidth = 86;
      const summaryX = (pageWidth - summaryWidth) / 2;
      const totalX = summaryX + summaryWidth - 10;
      doc.text('Material', summaryX + 5, y);
      doc.text('Total', totalX, y, { align: 'center' });
      doc.setDrawColor(...black);
      doc.setLineWidth(0.35);
      doc.line(summaryX, y + 5, summaryX + summaryWidth, y + 5);
      y += 10;

      const sortedTotals = Object.entries(materialTotals).sort(([a], [b]) => a.localeCompare(b));
      sortedTotals.forEach(([material, total]) => {
        addPageIfNeeded(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...black);
        doc.text(textFit(material, 62), summaryX + 5, y);
        doc.text(fmt.number(total, 0), totalX, y, { align: 'center' });
        y += 8;
      });

      addPageIfNeeded(14);
      const totalGeneral = sortedTotals.reduce((sum, [, total]) => sum + total, 0);
      doc.setDrawColor(...black);
      doc.line(summaryX, y - 4, summaryX + summaryWidth, y - 4);
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...black);
      doc.text('TOTAL GENERAL', summaryX + 5, y);
      doc.text(fmt.number(totalGeneral, 0), totalX, y, { align: 'center' });
      doc.line(summaryX, y + 7, summaryX + summaryWidth, y + 7);
      doc.save(`reporte_entrada_materiales_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast(`PDF de entradas generado: ${entries.length} registros`, 'success');
    }

    function getFilteredSupplierEntries() {
      const entries = getRecords('entry');
      const filters = AppState.supplierFilters || { search: '', material: '', status: '', dateFrom: '', dateTo: '' };
      const supplierSearch = (filters.search || '').toLowerCase().trim();

      return entries.filter(entry => {
        if (!entry.supplier_name) return false;
        const matchesName = !supplierSearch || entry.supplier_name.toLowerCase().includes(supplierSearch);
        const matchesMaterial = !filters.material || entry.material_name === filters.material;
        const matchesStatus = !filters.status || filters.status === 'active';
        const matchesDates = !(filters.dateFrom || filters.dateTo) || matchesDateFilter(entry.date, filters.dateFrom, filters.dateTo);
        return matchesName && matchesMaterial && matchesStatus && matchesDates;
      });
    }

    function renderSuppliers(container) {
      const filteredEntries = getFilteredSupplierEntries();
      const allEntries = getRecords('entry').filter(e => e.supplier_name);
      const filters = AppState.supplierFilters || { search: '', material: '', status: '', dateFrom: '', dateTo: '' };
      const suppMap = {};
      
      filteredEntries.forEach(e => {
        if (!e.supplier_name) return;
        if (!suppMap[e.supplier_name]) suppMap[e.supplier_name] = [];
        suppMap[e.supplier_name].push(e);
      });
      const suppliers = Object.keys(suppMap).sort();
      const todayKey = new Date().toISOString().split('T')[0];
      const materialOptions = [...new Set(allEntries.map(e => e.material_name).filter(Boolean))].sort();
      const totalVolume = filteredEntries.reduce((total, entry) => total + (Number(entry.quantity) || 0), 0);
      const todayDeliveries = filteredEntries.filter(entry => (entry.date || '').startsWith(todayKey)).length;
      const materialTotals = {};
      const supplierRows = suppliers.map((supplier, index) => {
        const entriesSupp = suppMap[supplier].sort((a, b) => new Date(a.date) - new Date(b.date));
        const deliveries = entriesSupp.length;
        const volume = entriesSupp.reduce((total, entry) => total + (Number(entry.quantity) || 0), 0);
        const lastDelivery = entriesSupp[entriesSupp.length - 1];
        const materialMap = {};
        entriesSupp.forEach(entry => {
          const material = entry.material_name || 'Sin material';
          const quantity = Number(entry.quantity) || 0;
          materialMap[material] = (materialMap[material] || 0) + quantity;
          materialTotals[material] = (materialTotals[material] || 0) + quantity;
        });
        return { supplier, index, entries: entriesSupp, deliveries, volume, lastDelivery, materials: materialMap };
      });
      const maxSupplierDeliveries = Math.max(1, ...supplierRows.map(row => row.deliveries));
      const maxSupplierVolume = Math.max(1, ...supplierRows.map(row => row.volume));
      const materialList = Object.entries(materialTotals).sort(([a], [b]) => a.localeCompare(b));
      const materialGradient = materialList.length
        ? materialList.reduce((parts, [material, value], index) => {
            const start = materialList.slice(0, index).reduce((sum, [, current]) => sum + current, 0) / Math.max(totalVolume, 1) * 100;
            const end = start + (value / Math.max(totalVolume, 1) * 100);
            const color = index % 2 === 0 ? '#1558ff' : '#16c77a';
            parts.push(`${color} ${start}% ${end}%`);
            return parts;
          }, []).join(', ')
        : '#1e293b 0% 100%';
      const topDeliveries = supplierRows.slice().sort((a, b) => b.deliveries - a.deliveries).slice(0, 4);
      const topVolumes = supplierRows.slice().sort((a, b) => b.volume - a.volume).slice(0, 4);
      const dateParts = (value) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return { day: '-', hour: '-' };
        return {
          day: d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          hour: d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true })
        };
      };
      const hasFilters = filters.search || filters.material || filters.status || filters.dateFrom || filters.dateTo;

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            ${[
              { label: 'Total Proveedores', value: suppliers.length, detail: 'Activos', icon: 'users', color: 'blue' },
              { label: 'Total Entregas', value: filteredEntries.length, detail: 'Realizadas', icon: 'truck', color: 'emerald' },
              { label: 'Total m3 Entregados', value: `${fmt.number(totalVolume, 2)} m3`, detail: 'En total', icon: 'box', color: 'violet' },
              { label: 'Entregas Hoy', value: todayDeliveries, detail: 'Hoy', icon: 'calendar-days', color: 'amber' }
            ].map(card => `
              <div class="glass rounded-xl p-5 border border-slate-800/80 min-h-[136px] flex items-center gap-4">
                <div class="w-14 h-14 rounded-2xl bg-${card.color}-500/15 border border-${card.color}-500/20 flex items-center justify-center shadow-lg shadow-${card.color}-500/10">
                  <i data-lucide="${card.icon}" class="w-7 h-7 text-${card.color}-400"></i>
                </div>
                <div>
                  <div class="text-sm text-slate-200 font-medium">${card.label}</div>
                  <div class="text-3xl font-bold text-white mt-2 font-mono">${card.value}</div>
                  <div class="text-sm text-slate-400 mt-2">${card.detail}</div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="glass rounded-xl p-6 border border-slate-800/80">
            <h2 class="text-xl font-bold text-slate-100 mb-5">Buscar y filtrar proveedores</h2>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div>
                <label class="block text-sm text-slate-200 mb-2">Buscar proveedor</label>
                <div class="relative">
                  <i data-lucide="search" class="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2"></i>
                  <input type="text" id="supplierFilterSearch" value="${escapeAttr(filters.search || '')}" oninput="updateSupplierSearchLive()" placeholder="Buscar por nombre del proveedor..."
                    class="w-full pl-12 pr-4 py-3 bg-slate-950/40 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                </div>
              </div>
              <div>
                <label class="block text-sm text-slate-200 mb-2">Material</label>
                <select id="supplierFilterMaterial" onchange="updateSupplierFilters()" class="w-full px-4 py-3 bg-slate-950/40 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                  <option value="">Todos los materiales</option>
                  ${materialOptions.map(material => `<option value="${escapeAttr(material)}" ${filters.material === material ? 'selected' : ''}>${escapeHtml(material)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-sm text-slate-200 mb-2">Estado</label>
                <select id="supplierFilterStatus" onchange="updateSupplierFilters()" class="w-full px-4 py-3 bg-slate-950/40 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                  <option value="">Todos</option>
                  <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Activos</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-5 items-end">
              <div>
                <label class="block text-sm text-slate-200 mb-2">Desde</label>
                <input type="date" id="supplierFilterDateFrom" value="${escapeAttr(filters.dateFrom || '')}" onchange="updateSupplierFilters()"
                  class="w-full px-4 py-3 bg-slate-950/40 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div>
                <label class="block text-sm text-slate-200 mb-2">Hasta</label>
                <input type="date" id="supplierFilterDateTo" value="${escapeAttr(filters.dateTo || '')}" onchange="updateSupplierFilters()"
                  class="w-full px-4 py-3 bg-slate-950/40 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <button onclick="clearSupplierFilters()" class="px-4 py-3 rounded-lg bg-slate-950/40 border border-slate-700 text-slate-200 hover:text-white hover:border-slate-500 transition-all flex items-center justify-center gap-2">
                <i data-lucide="refresh-cw" class="w-5 h-5"></i> Limpiar filtros
              </button>
              <button onclick="exportSuppliersExcel()" class="px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20">
                <i data-lucide="file-spreadsheet" class="w-5 h-5"></i> Excel
              </button>
            </div>
          </div>

          <div class="glass rounded-xl border border-slate-800/80 overflow-hidden">
            <div class="px-5 py-5 flex flex-wrap items-center gap-3 border-b border-slate-800">
              <h2 class="text-xl font-bold text-slate-100">Listado de proveedores</h2>
              <span id="supplierVisibleCount" class="px-3 py-1 rounded-full bg-slate-800/80 text-slate-300 text-sm">${suppliers.length} proveedores</span>
            </div>
            ${suppliers.length === 0 ? `
              <div class="p-12 text-center">
                <i data-lucide="truck" class="w-16 h-16 text-slate-600 mx-auto mb-4"></i>
                <h3 class="text-lg font-semibold text-slate-300 mb-2">Sin Proveedores</h3>
                <p class="text-slate-500 max-w-md mx-auto">${hasFilters ? 'No hay proveedores que coincidan con los filtros seleccionados' : 'Los proveedores se crearan automaticamente al registrar entradas de material'}</p>
              </div>
            ` : `
              <div class="overflow-x-auto">
                <table class="w-full min-w-[820px] text-sm">
                  <thead class="bg-slate-900/80 text-blue-400">
                    <tr>
                      <th class="px-5 py-4 text-left font-medium">Proveedor</th>
                      <th class="px-5 py-4 text-left font-medium">Material(es)</th>
                      <th class="px-5 py-4 text-center font-medium">Entregas</th>
                      <th class="px-5 py-4 text-center font-medium">Total m3</th>
                      <th class="px-5 py-4 text-left font-medium">Ultima entrega</th>
                      <th class="px-5 py-4 text-center font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${supplierRows.map(row => {
                      const last = dateParts(row.lastDelivery?.date);
                      return `
                        <tr data-supplier-row data-supplier-name="${escapeAttr(row.supplier.toLowerCase())}" class="border-t border-slate-800 hover:bg-slate-900/50 transition-colors">
                          <td class="px-5 py-4">
                            <div class="flex items-center gap-3">
                              <div class="w-11 h-11 rounded-full bg-gradient-to-br ${row.index % 2 === 0 ? 'from-blue-600 to-blue-800' : 'from-violet-600 to-violet-800'} flex items-center justify-center">
                                <i data-lucide="building-2" class="w-5 h-5 text-white"></i>
                              </div>
                              <div>
                                <div class="font-semibold text-slate-100">${escapeHtml(row.supplier)}</div>
                                <div class="text-xs text-slate-400 mt-1">Proveedor activo</div>
                              </div>
                            </div>
                          </td>
                          <td class="px-5 py-4 text-slate-200">
                            <ul class="space-y-1">
                              ${Object.entries(row.materials).map(([material, value]) => `<li class="flex gap-2"><span class="text-slate-400">•</span><span>${escapeHtml(material)} (${fmt.number(value, 2)} m3)</span></li>`).join('')}
                            </ul>
                          </td>
                          <td class="px-5 py-4 text-center text-slate-200 font-mono">${row.deliveries}</td>
                          <td class="px-5 py-4 text-center text-slate-200 font-mono">${fmt.number(row.volume, 2)} m3</td>
                          <td class="px-5 py-4 text-slate-200">
                            <div>${last.day}</div>
                            <div class="mt-1">${last.hour}</div>
                          </td>
                          <td class="px-5 py-4 text-center">
                            <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <span class="w-2 h-2 rounded-full bg-emerald-400"></span> Activo
                            </span>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                    <tr id="supplierLiveEmptyRow" class="hidden border-t border-slate-800">
                      <td colspan="7" class="px-5 py-8 text-center text-slate-500">No hay proveedores que coincidan con la busqueda.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <div class="glass rounded-xl p-5 border border-slate-800/80">
            <h2 class="text-xl font-bold text-slate-100 mb-5">Resumen visual</h2>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div class="rounded-lg border border-slate-800 bg-slate-950/20 p-5">
                <h3 class="text-center text-slate-100 font-semibold mb-4">Total m3 por material</h3>
                <div class="mx-auto w-40 h-40 rounded-full flex items-center justify-center" style="background: conic-gradient(${materialGradient});">
                  <div class="w-24 h-24 rounded-full bg-slate-950 flex flex-col items-center justify-center text-white">
                    <span class="text-2xl font-bold font-mono">${fmt.number(totalVolume, 2)}</span>
                    <span class="text-sm">m3</span>
                  </div>
                </div>
                <div class="mt-4 space-y-2">
                  ${materialList.map(([material, value], index) => `
                    <div class="flex items-center justify-center gap-2 text-sm text-slate-200">
                      <span class="w-3 h-3 rounded-sm ${index % 2 === 0 ? 'bg-blue-600' : 'bg-emerald-500'}"></span>
                      <span>${escapeHtml(material)}: ${fmt.number(value, 2)} m3 (${totalVolume ? Math.round(value / totalVolume * 100) : 0}%)</span>
                    </div>
                  `).join('') || '<p class="text-center text-slate-500 text-sm">Sin datos</p>'}
                </div>
              </div>
              <div class="rounded-lg border border-slate-800 bg-slate-950/20 p-5">
                <h3 class="text-center text-slate-100 font-semibold mb-4">Entregas por proveedor</h3>
                <div class="h-48 flex items-end justify-center gap-8 border-b border-slate-700 px-4">
                  ${topDeliveries.map(row => `
                    <div class="flex flex-col items-center gap-2">
                      <div class="text-slate-200 font-mono">${row.deliveries}</div>
                      <div class="w-16 rounded-t bg-gradient-to-t from-blue-700 to-blue-500" style="height:${Math.max(18, row.deliveries / maxSupplierDeliveries * 120)}px"></div>
                      <div class="text-xs text-slate-300 max-w-[72px] truncate">${escapeHtml(row.supplier)}</div>
                    </div>
                  `).join('') || '<p class="text-slate-500 text-sm self-center">Sin datos</p>'}
                </div>
                <div class="mt-3 text-center text-sm text-slate-300"><span class="inline-block w-3 h-3 rounded-sm bg-blue-600 mr-2"></span>Entregas</div>
              </div>
              <div class="rounded-lg border border-slate-800 bg-slate-950/20 p-5">
                <h3 class="text-center text-slate-100 font-semibold mb-4">Total m3 por proveedor</h3>
                <div class="h-48 flex items-end justify-center gap-8 border-b border-slate-700 px-4">
                  ${topVolumes.map((row, index) => `
                    <div class="flex flex-col items-center gap-2">
                      <div class="text-slate-200 font-mono">${fmt.number(row.volume, 2)}</div>
                      <div class="w-16 rounded-t ${index % 2 === 0 ? 'bg-gradient-to-t from-blue-700 to-blue-500' : 'bg-gradient-to-t from-emerald-700 to-emerald-500'}" style="height:${Math.max(18, row.volume / maxSupplierVolume * 120)}px"></div>
                      <div class="text-xs text-slate-300 max-w-[72px] truncate">${escapeHtml(row.supplier)}</div>
                    </div>
                  `).join('') || '<p class="text-slate-500 text-sm self-center">Sin datos</p>'}
                </div>
                <div class="mt-3 text-center text-sm text-slate-300"><span class="inline-block w-3 h-3 rounded-sm bg-blue-600 mr-2"></span>Total m3</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function updateSupplierSearchLive() {
      const input = document.getElementById('supplierFilterSearch');
      const query = (input?.value || '').toLowerCase().trim();
      AppState.supplierFilters.search = input?.value || '';

      const rows = Array.from(document.querySelectorAll('[data-supplier-row]'));
      let visibleCount = 0;
      rows.forEach(row => {
        const matches = !query || (row.dataset.supplierName || '').includes(query);
        row.classList.toggle('hidden', !matches);
        if (matches) visibleCount++;
      });

      const count = document.getElementById('supplierVisibleCount');
      if (count) count.textContent = `${visibleCount} proveedor${visibleCount === 1 ? '' : 'es'}`;

      const emptyRow = document.getElementById('supplierLiveEmptyRow');
      if (emptyRow) emptyRow.classList.toggle('hidden', visibleCount !== 0);
    }

    function updateSupplierFilters() {
      AppState.supplierFilters.search = document.getElementById('supplierFilterSearch')?.value || '';
      AppState.supplierFilters.material = document.getElementById('supplierFilterMaterial')?.value || '';
      AppState.supplierFilters.status = document.getElementById('supplierFilterStatus')?.value || '';
      AppState.supplierFilters.dateFrom = document.getElementById('supplierFilterDateFrom')?.value || '';
      AppState.supplierFilters.dateTo = document.getElementById('supplierFilterDateTo')?.value || '';
      renderFilterPage('supplierFilterSearch');
    }

    function clearSupplierFilters() {
      AppState.supplierFilters = { search: '', material: '', status: '', dateFrom: '', dateTo: '' };
      renderPage();
    }

    function exportSuppliersExcel() {
      if (!window.XLSX) {
        showExcelLibraryError();
        return;
      }

      const entries = getFilteredSupplierEntries().sort((a, b) => new Date(a.date) - new Date(b.date));
      if (!entries.length) {
        showToast('No hay proveedores para exportar con esos filtros', 'error');
        return;
      }

      const dateParts = (value) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return { day: value || '', hour: '' };
        return {
          day: d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          hour: d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true })
        };
      };

      const materialTotals = new Map();
      entries.forEach(entry => {
        const material = entry.material_name || 'Sin material';
        materialTotals.set(material, (materialTotals.get(material) || 0) + (Number(entry.quantity) || 0));
      });
      const materialRows = Array.from(materialTotals.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([material, total]) => [material, '', '', total, '']);
      const totalQuantity = entries.reduce((total, entry) => total + (Number(entry.quantity) || 0), 0);

      const rows = [
        ['CONTROL DE MATERIALES', '', '', '', ''],
        [],
        ['Fecha', 'Hora', 'Nombre', 'Cantidad (m3)', 'Material'],
        ...entries.map(entry => {
          const date = dateParts(entry.date);
          return [
            date.day,
            date.hour,
            entry.supplier_name || '',
            Number(entry.quantity) || 0,
            entry.material_name || ''
          ];
        }),
        ['TOTAL GENERAL', '', '', totalQuantity, ''],
        [],
        [],
        ['RESUMEN POR TIPO DE MATERIAL', '', '', '', ''],
        ['Material', '', '', 'Total (m3)', ''],
        ...materialRows,
        ['TOTAL GENERAL', '', '', totalQuantity, '']
      ];

      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      const detailTotalRow = entries.length + 4;
      const summaryTitleRow = detailTotalRow + 3;
      const summaryHeaderRow = summaryTitleRow + 1;
      const summaryStartRow = summaryHeaderRow + 1;
      const summaryTotalRow = rows.length;
      const textWidth = (value) => String(value ?? '').length;
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const columnLimits = [
        { min: 16, max: 18 },
        { min: 16, max: 18 },
        { min: 24, max: 28 },
        { min: 20, max: 22 },
        { min: 22, max: 24 },
        { min: 10, max: 10 },
        { min: 10, max: 10 }
      ];
      sheet['!cols'] = columnLimits.map((limit, columnIndex) => {
        const longest = rows.reduce((max, row) => Math.max(max, textWidth(row[columnIndex])), 0);
        return { wch: clamp(longest + 3, limit.min, limit.max) };
      });
      sheet['!ref'] = `A1:G${summaryTotalRow}`;
      const summaryMergeRows = Array.from(
        { length: materialRows.length + 2 },
        (_, index) => summaryHeaderRow - 1 + index
      );
      sheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
        { s: { r: detailTotalRow - 1, c: 0 }, e: { r: detailTotalRow - 1, c: 2 } },
        { s: { r: summaryTitleRow - 1, c: 0 }, e: { r: summaryTitleRow - 1, c: 4 } },
        ...summaryMergeRows.flatMap(r => [
          { s: { r, c: 0 }, e: { r, c: 2 } },
          { s: { r, c: 3 }, e: { r, c: 4 } }
        ]),
        { s: { r: summaryHeaderRow - 1, c: 5 }, e: { r: summaryTotalRow - 1, c: 6 } }
      ];

      const blue = '1F5FD5';
      const dark = '000000';
      const alternateBg = '050505';
      const totalBg = '020817';
      const border = { style: 'thin', color: { rgb: '1F2937' } };
      const baseBorder = { top: border, bottom: border, left: border, right: border };
      const center = { horizontal: 'center', vertical: 'center', wrapText: true };
      const solidFill = (rgb) => ({ patternType: 'solid', fgColor: { rgb } });
      const applyStyle = (addr, style) => {
        if (!sheet[addr]) sheet[addr] = { t: 's', v: '' };
        sheet[addr].s = style;
      };
      const rangeStyle = (range, style) => {
        const decoded = XLSX.utils.decode_range(range);
        for (let r = decoded.s.r; r <= decoded.e.r; r++) {
          for (let c = decoded.s.c; c <= decoded.e.c; c++) {
            applyStyle(XLSX.utils.encode_cell({ r, c }), style);
          }
        }
      };
      const titleStyle = {
        font: { bold: true, sz: 30, color: { rgb: 'FFFFFF' } },
        fill: solidFill(dark),
        alignment: { horizontal: 'left', vertical: 'center' },
        border: baseBorder
      };
      const headerStyle = {
        font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
        fill: solidFill(blue),
        alignment: center,
        border: baseBorder
      };
      const bodyStyle = {
        font: { sz: 13, color: { rgb: 'FFFFFF' } },
        fill: solidFill(dark),
        alignment: center,
        border: baseBorder
      };
      const alternateStyle = {
        font: { sz: 13, color: { rgb: 'FFFFFF' } },
        fill: solidFill(alternateBg),
        alignment: center,
        border: baseBorder
      };
      const totalStyle = {
        font: { bold: true, sz: 18, color: { rgb: blue } },
        fill: solidFill(totalBg),
        alignment: center,
        border: baseBorder,
        numFmt: '#,##0.00'
      };
      const noteStyle = {
        font: { sz: 13, color: { rgb: 'FFFFFF' } },
        fill: solidFill(dark),
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: baseBorder
      };

      rangeStyle(`A1:G${summaryTotalRow}`, { fill: solidFill(dark), border: baseBorder });
      rangeStyle('A1:G1', titleStyle);
      rangeStyle('A3:E3', headerStyle);
      if (entries.length) {
        for (let row = 4; row < detailTotalRow; row++) {
          rangeStyle(`A${row}:E${row}`, row % 2 === 0 ? bodyStyle : alternateStyle);
        }
        rangeStyle(`D4:D${detailTotalRow}`, { ...bodyStyle, numFmt: '#,##0.00' });
      }
      rangeStyle(`A${detailTotalRow}:E${detailTotalRow}`, totalStyle);
      rangeStyle(`A${summaryTitleRow}:E${summaryTitleRow}`, titleStyle);
      rangeStyle(`A${summaryHeaderRow}:E${summaryHeaderRow}`, headerStyle);
      if (materialRows.length) {
        for (let row = summaryStartRow; row < summaryTotalRow; row++) {
          rangeStyle(`A${row}:E${row}`, row % 2 === 0 ? bodyStyle : alternateStyle);
        }
        rangeStyle(`D${summaryStartRow}:D${summaryTotalRow}`, { ...bodyStyle, numFmt: '#,##0.00' });
      }
      rangeStyle(`A${summaryTotalRow}:E${summaryTotalRow}`, totalStyle);
      rangeStyle(`F${summaryHeaderRow}:G${summaryTotalRow}`, noteStyle);
      applyStyle(`F${summaryHeaderRow}`, {
        ...noteStyle,
        font: { color: { rgb: 'FFFFFF' }, sz: 13 },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true }
      });
      sheet[`F${summaryHeaderRow}`] = { t: 's', v: 'Los totales se calculan automaticamente por tipo de material.', s: sheet[`F${summaryHeaderRow}`]?.s };
      sheet['!autofilter'] = { ref: `A3:E${Math.max(detailTotalRow - 1, 3)}` };
      sheet['!rows'] = rows.map((row, index) => {
        if (index === 0) return { hpt: 56 };
        if (index === 1 || index === detailTotalRow || index === detailTotalRow + 1) return { hpt: 22 };
        if (index === 2 || index === summaryHeaderRow - 1) return { hpt: 42 };
        if (index === summaryTitleRow - 1) return { hpt: 34 };
        if (index === summaryTotalRow - 1) return { hpt: 36 };
        const longest = Math.max(...row.map(textWidth));
        return { hpt: longest > 35 ? 34 : 28 };
      });

      const filters = AppState.supplierFilters || {};
      const suffix = (filters.search || 'todos').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'todos';
      XLSX.utils.book_append_sheet(workbook, sheet, 'Control materiales');
      XLSX.writeFile(workbook, `control_materiales_${suffix}_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast(`Excel de proveedores exportado: ${entries.length} entrega(s)`);
    }

    function renderClients(container) {
      const allClients = getRecords('client');
      const sales = getRecords('sale');
      const search = (AppState.clientFilters?.search || '').toLowerCase().trim();
      const clients = search
        ? allClients.filter(c =>
            (c.client_name || '').toLowerCase().includes(search) ||
            (c.client_phone || '').toLowerCase().includes(search) ||
            (c.client_address || '').toLowerCase().includes(search) ||
            (c.vehicle_plate || '').toLowerCase().includes(search)
          )
        : allClients;
      
      const clientTotals = {};
      sales.forEach(s => {
        clientTotals[s.client_name] = (clientTotals[s.client_name] || 0) + (s.sale_total || 0);
      });

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 class="text-2xl font-bold text-slate-100">Clientes</h2>
              <p class="text-slate-500 text-sm mt-1">Registro de clientes y contactos</p>
            </div>
            <button onclick="showClientModal()" class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-400 text-slate-900 font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20">
              <i data-lucide="plus" class="w-4 h-4"></i> Nuevo Cliente
            </button>
          </div>

          <div class="glass rounded-xl p-4 border border-slate-700/50">
            <label class="block text-sm font-medium text-slate-400 mb-2">Buscar cliente</label>
            <div class="relative">
              <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-3.5 pointer-events-none"></i>
              <input type="text" id="clientSearchInput" value="${escapeAttr(AppState.clientFilters?.search || '')}" oninput="updateClientSearch()"
                autocomplete="off" placeholder="Nombre, contacto, placa o direccion..."
                class="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus transition-all">
            </div>
            <div class="text-xs text-slate-500 mt-2">Mostrando ${clients.length} de ${allClients.length} clientes</div>
          </div>

          <div id="clientCardsGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${renderClientCards(clients, clientTotals, allClients.length)}
          </div>
        </div>
      `;
    }

    function renderClientCards(clients, clientTotals, totalClients = clients.length) {
      const hasSearch = !!(AppState.clientFilters?.search || '').trim();
      if (clients.length === 0) {
        return `
          <div class="md:col-span-2 lg:col-span-3 glass rounded-xl p-12 text-center">
            <i data-lucide="users" class="w-16 h-16 text-slate-600 mx-auto mb-4"></i>
            <h3 class="text-lg font-semibold text-slate-300 mb-2">${hasSearch ? 'Sin resultados' : 'Sin Clientes'}</h3>
            <p class="text-slate-500 mb-4">${hasSearch ? 'No hay clientes que coincidan con esa busqueda' : 'Comienza agregando tu primer cliente'}</p>
            ${totalClients === 0 ? `<button onclick="showClientModal()" class="px-4 py-2 bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30 transition-colors font-medium">Agregar Cliente</button>` : ''}
          </div>
        `;
      }

      return clients.map(c => `
              <div class="glass rounded-xl p-5 hover-lift group">
                <div class="flex items-start gap-4">
                  <div class="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/20 flex items-center justify-center text-primary-400 font-bold text-lg border border-primary-500/20">
                    ${(c.client_name || '?')[0].toUpperCase()}
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-slate-200 truncate">${c.client_name}</h3>
                    <div class="flex items-center gap-1 text-slate-500 text-sm mt-1">
                      <i data-lucide="phone" class="w-3 h-3"></i>
                      <span class="truncate">${c.client_phone || 'Sin telefono'}</span>
                    </div>
                    <div class="flex items-center gap-1 text-slate-500 text-sm mt-1">
                      <i data-lucide="map-pin" class="w-3 h-3"></i>
                      <span class="truncate">${c.client_address || 'Sin direccion'}</span>
                    </div>
                    <div class="flex items-center gap-1 text-slate-500 text-sm mt-1">
                      <i data-lucide="truck" class="w-3 h-3"></i>
                      <span class="truncate font-mono">${c.vehicle_plate || 'Sin placa'}</span>
                    </div>
                    ${clientTotals[c.client_name] ? `
                      <div class="mt-2 pt-2 border-t border-slate-800">
                        <span class="text-xs text-slate-500">Total comprado: </span>
                        <span class="text-sm font-mono text-emerald-400">${fmt.currency(clientTotals[c.client_name])}</span>
                      </div>
                    ` : ''}
                  </div>
                </div>
                
                <div class="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800">
                  <button onclick="showEditClientModal('${c.__backendId}')" class="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors">
                    <i data-lucide="edit-2" class="w-4 h-4"></i> Editar
                  </button>
                  ${AppState.deleteConfirmId === c.__backendId ? `
                    <div class="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                      <span class="text-xs text-rose-400">Eliminar?</span>
                      <button onclick="confirmDeleteRecord('${c.__backendId}')" class="text-xs text-rose-400 hover:text-rose-300 font-semibold">Si</button>
                      <button onclick="cancelDelete()" class="text-xs text-slate-400 hover:text-slate-300">No</button>
                    </div>
                  ` : `
                    <button onclick="askDelete('${c.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                  `}
                </div>
              </div>
            `).join('');
    }

    function updateClientSearch() {
      if (!AppState.clientFilters) AppState.clientFilters = { search: '' };
      AppState.clientFilters.search = document.getElementById('clientSearchInput')?.value || '';
      const search = AppState.clientFilters.search.toLowerCase().trim();
      const allClients = getRecords('client');
      const clients = search
        ? allClients.filter(c =>
            (c.client_name || '').toLowerCase().includes(search) ||
            (c.client_phone || '').toLowerCase().includes(search) ||
            (c.client_address || '').toLowerCase().includes(search) ||
            (c.vehicle_plate || '').toLowerCase().includes(search)
          )
        : allClients;
      const clientTotals = {};
      getRecords('sale').forEach(s => {
        clientTotals[s.client_name] = (clientTotals[s.client_name] || 0) + (s.sale_total || 0);
      });
      const grid = document.getElementById('clientCardsGrid');
      if (grid) grid.innerHTML = renderClientCards(clients, clientTotals, allClients.length);
      if (window.lucide) lucide.createIcons();
    }

    function renderSales(container) {
      const materials = getRecords('material');
      const inv = calcInventory();
      const clients = getRecords('client');
      const ivaEnabled = AppState.config.iva_default_enabled;
      const nowLocal = new Date();
      const today = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in w-full" style="width:100%;max-width:none;">
          <div>
            <h2 class="text-2xl font-bold text-slate-100">Nueva Venta</h2>
            <p class="text-slate-500 text-sm mt-1">Registrar transaccion de venta</p>
          </div>

          ${materials.length === 0 ? `
            <div class="glass rounded-xl p-8 text-center border border-amber-500/20 bg-amber-500/5">
              <i data-lucide="alert-circle" class="w-12 h-12 text-amber-400 mx-auto mb-3"></i>
              <h3 class="text-lg font-semibold text-amber-400 mb-2">Inventario Vacio</h3>
              <p class="text-slate-400 mb-4">Registra materiales primero para poder realizar ventas</p>
              <button onclick="navigate('inventory')" class="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors font-medium">Ir a Inventario</button>
            </div>
          ` : `
            <div class="glass rounded-xl p-6 w-full" style="width:100%;max-width:none;">
              <form onsubmit="handleSale(event)" id="saleForm" class="space-y-5 w-full" style="width:100%;max-width:none;">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Cliente</label>
                  <div class="relative">
                    <input type="text" id="saleClient" required placeholder="Buscar cliente por nombre..."
                      autocomplete="off" oninput="updateSaleClientSuggestions()" onfocus="updateSaleClientSuggestions()" onblur="hideSaleClientSuggestions()"
                      class="w-full px-4 py-3 pr-10 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus transition-all">
                    <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute right-3 top-3.5 pointer-events-none"></i>
                    <div id="saleClientSuggestions" class="hidden absolute z-50 left-0 right-0 top-full mt-2 max-h-56 overflow-y-auto bg-slate-950 border border-slate-700 rounded-lg shadow-xl shadow-black/30"></div>
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Fecha de venta</label>
                  <input type="date" id="saleDate" value="${today}" max="${today}" required
                    class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus transition-all">
                  <p class="text-xs text-slate-500 mt-1">Puedes cambiarla si estas registrando una venta de otro dia</p>
                </div>

                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">
                    <span class="flex items-center gap-2">
                      <i data-lucide="truck" class="w-4 h-4"></i>
                      Placa del Vehiculo
                    </span>
                  </label>
                  <input type="text" id="saleVehiclePlate" placeholder="Ej: ABC-1234" maxlength="20"
                    class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 font-mono uppercase placeholder-slate-600 input-focus transition-all">
                  <p class="text-xs text-slate-500 mt-1">Opcional - Para control de transporte</p>
                </div>
                </div>

                <div class="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                  <div class="flex items-center justify-between gap-3 mb-3">
                    <label class="block text-sm font-medium text-slate-400">Productos de la venta</label>
                    <button type="button" onclick="addSaleItem()" class="w-10 h-10 bg-primary-500 hover:bg-primary-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20 flex items-center justify-center" title="Agregar producto">
                      <i data-lucide="plus" class="w-5 h-5"></i>
                    </button>
                  </div>

                  <div class="space-y-3">
                    <div class="relative">
                      <input type="text" id="saleMaterial" oninput="updateSaleMaterialSuggestions(); updateSalePrice()" onchange="updateSalePrice()"
                        onfocus="updateSaleMaterialSuggestions()" onblur="hideSaleMaterialSuggestions()"
                        autocomplete="off" placeholder="Escribe o selecciona material..."
                        class="w-full px-4 py-3 pr-10 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus transition-all">
                      <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute right-3 top-3.5 pointer-events-none"></i>
                      <div id="saleMaterialSuggestions" class="hidden absolute z-50 left-0 right-0 top-full mt-2 max-h-56 overflow-y-auto bg-slate-950 border border-slate-700 rounded-lg shadow-xl shadow-black/30"></div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div class="min-w-0">
                        <label class="block text-xs text-slate-500 mb-1">Cantidad</label>
                        <input type="number" id="saleQty" step="any" min="0.01" inputmode="decimal" oninput="updateSaleTotal()"
                          class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus transition-all">
                      </div>
                      <div class="min-w-0">
                        <label class="block text-xs text-slate-500 mb-1">Precio Unitario</label>
                        <input type="number" id="salePrice" step="0.01" min="0.01" inputmode="decimal" oninput="updateSaleTotal()"
                          class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus transition-all">
                      </div>
                      <div class="sm:col-span-2">
                        <label class="block text-xs text-slate-500 mb-1">Nota</label>
                        <textarea id="saleNote" rows="3" placeholder="Escribe una nota para esta venta..."
                          class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus transition-all resize-y"></textarea>
                      </div>
                    </div>
                  </div>

                  <div id="saleItemsList" class="mt-4 space-y-2"></div>
                </div>

                <div class="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                  <div class="flex items-center justify-between mb-3">
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" id="saleIvaEnabled" ${ivaEnabled ? 'checked' : ''} onchange="toggleIvaManual(this.checked)"
                        class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-slate-900">
                      <span class="text-sm font-medium text-slate-200">Aplicar IVA</span>
                    </label>
                    <span id="ivaBadge" class="text-xs px-2 py-1 rounded-full ${ivaEnabled ? 'bg-primary-500/20 text-primary-400' : 'bg-slate-700 text-slate-500'}">
                      ${ivaEnabled ? 'ACTIVO' : 'NO APLICA'}
                    </span>
                  </div>
                  
                  <div id="ivaControls" class="${ivaEnabled ? '' : 'opacity-50 pointer-events-none'} transition-opacity duration-200">
                    <div class="flex items-center gap-4">
                      <div class="flex-1">
                        <label class="block text-xs text-slate-500 mb-1">Porcentaje IVA (%)</label>
                        <input type="number" id="saleIvaRate" step="0.01" min="0" max="100" value="${AppState.config.iva_default_rate}" 
                          oninput="updateSaleTotal()"
                          class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 font-mono text-sm input-focus">
                      </div>
                      <div class="flex-1">
                        <label class="block text-xs text-slate-500 mb-1">Monto IVA</label>
                        <input type="text" id="saleIvaAmount" readonly
                          class="w-full px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-slate-400 font-mono text-sm">
                      </div>
                    </div>
                  </div>
                </div>

                <div class="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm text-slate-500">Subtotal</span>
                    <span id="saleSubtotal" class="font-mono text-slate-400">$0.00</span>
                  </div>
                  <div id="ivaSummaryRow" class="flex items-center justify-between mb-2 ${ivaEnabled ? '' : 'hidden'}">
                    <span class="text-sm text-slate-500">IVA (<span id="ivaRateDisplay">${AppState.config.iva_default_rate}</span>%)</span>
                    <span id="saleTax" class="font-mono text-slate-400">$0.00</span>
                  </div>
                  <div class="flex items-center justify-between pt-2 border-t border-slate-700/50">
                    <span class="text-sm font-semibold text-slate-300">Total</span>
                    <span id="saleTotalDisplay" class="text-2xl font-bold text-emerald-400 font-mono">$0.00</span>
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Tipo de Pago</label>
                  <div class="grid grid-cols-2 gap-3">
                    <label class="cursor-pointer">
                      <input type="radio" name="paymentType" value="pago" checked class="sr-only peer" onchange="updatePaymentType(this)">
                      <div class="flex items-center justify-center gap-2 p-3 rounded-lg border border-slate-700 bg-slate-800/30 text-slate-400 peer-checked:border-emerald-500/50 peer-checked:bg-emerald-500/10 peer-checked:text-emerald-400 transition-all">
                        <i data-lucide="banknote" class="w-4 h-4"></i>
                        <span class="font-medium">Contado</span>
                      </div>
                    </label>
                    <label class="cursor-pointer">
                      <input type="radio" name="paymentType" value="credito" class="sr-only peer" onchange="updatePaymentType(this)">
                      <div class="flex items-center justify-center gap-2 p-3 rounded-lg border border-slate-700 bg-slate-800/30 text-slate-400 peer-checked:border-amber-500/50 peer-checked:bg-amber-500/10 peer-checked:text-amber-400 transition-all">
                        <i data-lucide="credit-card" class="w-4 h-4"></i>
                        <span class="font-medium">Credito</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <button type="submit" id="saleBtn" class="py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-emerald-500/20 flex items-center justify-center gap-2">
                    <i data-lucide="check-circle" class="w-5 h-5"></i> Guardar Venta
                  </button>
                  <button type="button" onclick="handleSaleAndPrint()" id="salePrintBtn" class="py-3 bg-primary-500 hover:bg-primary-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20 flex items-center justify-center gap-2">
                    <i data-lucide="printer" class="w-5 h-5" id="salePrintIcon"></i> <span id="salePrintText">Guardar e Imprimir</span>
                  </button>
                </div>
              </form>
            </div>
          `}
        </div>
      `;
      if (document.getElementById('saleForm')) {
        renderSaleItemsList();
        updateSaleTotal();
      }
    }

    function updateSaleClientSuggestions() {
      const input = document.getElementById('saleClient');
      const box = document.getElementById('saleClientSuggestions');
      if (!input || !box) return;

      const query = input.value.trim().toLowerCase();
      const clients = getRecords('client')
        .filter(c => !query || (c.client_name || '').toLowerCase().includes(query))
        .sort((a, b) => (a.client_name || '').localeCompare(b.client_name || ''))
        .slice(0, 8);

      if (!clients.length) {
        box.innerHTML = `<div class="px-4 py-3 text-sm text-slate-500">Sin clientes encontrados</div>`;
        box.classList.remove('hidden');
        return;
      }

      box.innerHTML = clients.map(c => `
        <button type="button" data-client-id="${escapeAttr(c.__backendId || '')}" onmousedown="selectSaleClient(this.dataset.clientId)"
          class="w-full text-left px-4 py-3 hover:bg-slate-800/80 border-b border-slate-800 last:border-b-0 transition-colors">
          <div class="font-medium text-slate-200">${escapeHtml(c.client_name || 'Sin nombre')}</div>
          <div class="text-xs text-slate-500">${escapeHtml(c.vehicle_plate ? `Placa: ${c.vehicle_plate}` : (c.client_phone || c.client_address || 'Cliente registrado'))}</div>
        </button>
      `).join('');
      box.classList.remove('hidden');
    }

    function selectSaleClient(clientId) {
      const input = document.getElementById('saleClient');
      const plateInput = document.getElementById('saleVehiclePlate');
      const box = document.getElementById('saleClientSuggestions');
      const client = getRecords('client').find(c => c.__backendId === clientId);
      if (input && client) input.value = client.client_name || '';
      if (plateInput && client) plateInput.value = String(client.vehicle_plate || '').toUpperCase();
      if (box) box.classList.add('hidden');
    }

    function hideSaleClientSuggestions() {
      setTimeout(() => {
        document.getElementById('saleClientSuggestions')?.classList.add('hidden');
      }, 120);
    }

    function updateSaleMaterialSuggestions() {
      const input = document.getElementById('saleMaterial');
      const box = document.getElementById('saleMaterialSuggestions');
      if (!input || !box) return;

      const query = input.value.trim().toLowerCase();
      const inv = calcInventory();
      const materials = getRecords('material')
        .filter(m => !query || (m.name || '').toLowerCase().includes(query))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .slice(0, 8);

      if (!materials.length) {
        box.innerHTML = `<div class="px-4 py-3 text-sm text-slate-500">Sin materiales encontrados</div>`;
        box.classList.remove('hidden');
        return;
      }

      box.innerHTML = materials.map(m => {
        const stock = inv[m.name] ? inv[m.name].stock : 0;
        return `
          <button type="button" data-material="${escapeAttr(m.name || '')}" onmousedown="selectSaleMaterial(this.dataset.material)"
            class="w-full text-left px-4 py-3 hover:bg-slate-800/80 border-b border-slate-800 last:border-b-0 transition-colors ${stock <= 0 ? 'opacity-60' : ''}">
            <div class="font-medium text-slate-200">${escapeHtml(m.name || 'Sin nombre')}</div>
            <div class="text-xs text-slate-500">Stock: ${fmt.number(stock)}${stock <= 0 ? ' (Agotado)' : ''} - Precio: ${fmt.currency(m.price || 0)}</div>
          </button>
        `;
      }).join('');
      box.classList.remove('hidden');
    }

    function selectSaleMaterial(name) {
      const input = document.getElementById('saleMaterial');
      const box = document.getElementById('saleMaterialSuggestions');
      if (input) input.value = name;
      if (box) box.classList.add('hidden');
      updateSalePrice();
    }

    function hideSaleMaterialSuggestions() {
      setTimeout(() => {
        document.getElementById('saleMaterialSuggestions')?.classList.add('hidden');
      }, 120);
    }

    function toggleIvaManual(enabled) {
      const controls = document.getElementById('ivaControls');
      const badge = document.getElementById('ivaBadge');
      const summaryRow = document.getElementById('ivaSummaryRow');
      
      if (enabled) {
        controls.classList.remove('opacity-50', 'pointer-events-none');
        badge.textContent = 'ACTIVO';
        badge.className = 'text-xs px-2 py-1 rounded-full bg-primary-500/20 text-primary-400';
        summaryRow.classList.remove('hidden');
      } else {
        controls.classList.add('opacity-50', 'pointer-events-none');
        badge.textContent = 'NO APLICA';
        badge.className = 'text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-500';
        summaryRow.classList.add('hidden');
      }
      
      updateSaleTotal();
    }

    function updateSalePrice() {
      const sel = document.getElementById('saleMaterial');
      if (!sel) return;

      const materialName = (sel.value || '').trim();
      if (!materialName) {
        updateSaleTotal();
        return;
      }
      
      const material = getRecords('material').find(m => (m.name || '').toLowerCase() === materialName.toLowerCase());
      if (!material) {
        updateSaleTotal();
        return;
      }

      const price = Math.max(0, toFiniteNumber(material.price, 0));
      sel.value = material.name;
      document.getElementById('salePrice').value = price;
      updateSaleTotal();
    }

    function getCurrentSaleItem() {
      const sel = document.getElementById('saleMaterial');
      if (!sel) return null;

      const typedMaterialName = (sel.value || '').trim();
      const material = getRecords('material').find(m => (m.name || '').toLowerCase() === typedMaterialName.toLowerCase());
      const materialName = material ? material.name : typedMaterialName;
      const qty = toFiniteNumber(document.getElementById('saleQty')?.value, 0);
      const price = toFiniteNumber(document.getElementById('salePrice')?.value, 0);
      const inv = calcInventory();
      const stock = toFiniteNumber(inv[materialName]?.stock, 0);

      if (!material || !materialName || !isPositiveNumber(qty) || !isPositiveNumber(price) || stock < 0) return null;

      return {
        material_name: materialName,
        quantity: qty,
        price: price,
        subtotal: qty * price,
        stock: stock
      };
    }

    function getSaleSubtotal() {
      if (AppState.saleItems.length) {
        return AppState.saleItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
      }

      const currentItem = getCurrentSaleItem();
      return currentItem ? currentItem.subtotal : 0;
    }

    function renderSaleItemsList() {
      const list = document.getElementById('saleItemsList');
      if (!list) return;

      if (!AppState.saleItems.length) {
        list.innerHTML = `<div class="text-sm text-slate-500 text-center py-3 border border-dashed border-slate-700 rounded-lg">Presiona + para agregar productos a esta venta</div>`;
        return;
      }

      list.innerHTML = AppState.saleItems.map((item, index) => `
        <div class="flex items-center justify-between gap-3 p-3 bg-slate-900/40 border border-slate-700/50 rounded-lg">
          <div class="min-w-0">
            <div class="font-medium text-slate-200 truncate">${escapeHtml(item.material_name)}</div>
            <div class="text-xs text-slate-500 font-mono">${fmt.quantity(item.quantity)} x ${fmt.currency(item.price)}</div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class="font-mono text-emerald-400">${fmt.currency(item.subtotal)}</span>
            <button type="button" onclick="removeSaleItem(${index})" class="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Quitar producto">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('');

      if (window.lucide) lucide.createIcons();
    }

    function addSaleItem() {
      const item = getCurrentSaleItem();
      if (!item) {
        const materialName = (document.getElementById('saleMaterial')?.value || '').trim();
        const qty = toFiniteNumber(document.getElementById('saleQty')?.value, 0);
        const price = toFiniteNumber(document.getElementById('salePrice')?.value, 0);
        if (!materialName) showToast('Escribe o selecciona un material.', 'warning');
        else if (!getRecords('material').some(m => (m.name || '').toLowerCase() === materialName.toLowerCase())) showToast('Ese material no esta registrado en inventario.', 'warning');
        else if (!isPositiveNumber(qty)) showToast('Escribe la cantidad antes de presionar +.', 'warning');
        else if (!isPositiveNumber(price)) showToast('Escribe el precio unitario antes de presionar +.', 'warning');
        else showToast('Revisa el material, cantidad y precio para agregar.', 'warning');
        return false;
      }

      const alreadyAdded = AppState.saleItems
        .filter(i => i.material_name === item.material_name)
        .reduce((sum, i) => sum + (i.quantity || 0), 0);

      if (!Number.isFinite(item.subtotal) || item.subtotal <= 0) {
        showToast('Revisa la cantidad y el precio antes de agregar el producto.', 'warning');
        return false;
      }

      if (item.quantity + alreadyAdded > item.stock) {
        showToast('Stock insuficiente para agregar este producto', 'error');
        return false;
      }

      AppState.saleItems.push({
        material_name: item.material_name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal
      });

      document.getElementById('saleMaterial').value = '';
      document.getElementById('saleQty').value = '';
      document.getElementById('salePrice').value = '';
      renderSaleItemsList();
      updateSaleTotal();
      return true;
    }

    function removeSaleItem(index) {
      AppState.saleItems.splice(index, 1);
      renderSaleItemsList();
      updateSaleTotal();
    }

    function updateSaleTotal() {
      if (!document.getElementById('saleTotalDisplay')) return;
      const ivaEnabled = document.getElementById('saleIvaEnabled')?.checked ?? AppState.config.iva_default_enabled;
      const ivaRate = Math.min(100, Math.max(0, toFiniteNumber(document.getElementById('saleIvaRate')?.value, 0)));
      
      const subtotal = Math.max(0, toFiniteNumber(getSaleSubtotal(), 0));
      let tax = 0;
      let total = subtotal;
      
      if (ivaEnabled && ivaRate > 0) {
        tax = subtotal * (ivaRate / 100);
        total = subtotal + tax;
      }
      
      document.getElementById('saleSubtotal').textContent = fmt.currency(subtotal);
      
      const taxDisplay = document.getElementById('saleTax');
      if (taxDisplay) taxDisplay.textContent = fmt.currency(tax);
      
      const ivaAmountInput = document.getElementById('saleIvaAmount');
      if (ivaAmountInput) ivaAmountInput.value = fmt.currency(tax);
      
      const ivaRateDisplay = document.getElementById('ivaRateDisplay');
      if (ivaRateDisplay) ivaRateDisplay.textContent = ivaRate;
      
      document.getElementById('saleTotalDisplay').textContent = fmt.currency(total);
    }

    function updatePaymentType(radio) {
      // Visual feedback handled by CSS
    }

    function updateSalePrintButton() {
      const icon = document.getElementById('salePrintIcon');
      const text = document.getElementById('salePrintText');
      if (!icon || !text) return;

      const printerType = getEffectivePrinterType();

      if (printerType === 'pdf') {
        icon.setAttribute('data-lucide', 'download');
        text.textContent = 'Guardar y Descargar PDF';
      } else if (printerType === 'thermal_80' || printerType === 'thermal_58') {
        // En termica: siempre generar PDF descargable (funciona en movil)
        icon.setAttribute('data-lucide', 'download');
        text.textContent = AppState.config.printer_type === 'bluetooth' ? 'Guardar y Descargar Ticket Bluetooth' : 'Guardar y Descargar Ticket';
      } else {
        icon.setAttribute('data-lucide', 'printer');
        text.textContent = AppState.config.printer_type === 'bluetooth' ? 'Guardar e Imprimir Bluetooth' : 'Guardar e Imprimir';
      }

      if (window.lucide) {
        lucide.createIcons();
      }
    }

    async function handleSaleAndPrint() {
      const printerType = isBluetoothPrinterSelected() ? 'standard' : getEffectivePrinterType();

      if (isBluetoothPrinterSelected()) {
        await handleSale(null, true);
        return;
      }

      // Si es PDF o termica: guardar venta y luego generar PDF descargable
      // Esto funciona en CUALQUIER navegador incluido moviles
      if (printerType === 'pdf' || printerType === 'thermal_80' || printerType === 'thermal_58') {
        await handleSale(null, false); // Guardar sin imprimir ventana
        // El PDF se generara automaticamente despues de guardar
        return;
      }

      // Solo para impresora estandar: guardar e imprimir por ventana
      await handleSale(null, true);
    }

    async function handleSale(e, shouldPrint = false) {
      if (e) e.preventDefault();
      if (AppState.saleSaving) {
        showToast('La venta ya se esta guardando. Espera un momento.', 'warning');
        return;
      }
      
      const btn = document.getElementById('saleBtn');
      const printBtn = document.getElementById('salePrintBtn');
      
      const client = safeText(document.getElementById('saleClient').value);
      const vehiclePlate = safeText(document.getElementById('saleVehiclePlate').value).toUpperCase();
      const note = safeText(document.getElementById('saleNote')?.value || '');
      const paymentType = document.querySelector('input[name="paymentType"]:checked')?.value || 'pago';
      const saleDate = document.getElementById('saleDate')?.value;
      
      const ivaEnabled = document.getElementById('saleIvaEnabled').checked;
      const ivaRate = ivaEnabled ? toFiniteNumber(document.getElementById('saleIvaRate').value, 0) : 0;

      if (!client) {
        showToast('El nombre del cliente es requerido.', 'warning');
        return;
      }

      if (!isValidDateInput(saleDate)) {
        showToast('Selecciona una fecha de venta valida.', 'warning');
        return;
      }

      const todayKey = getLocalDateKey(new Date().toISOString());
      if (saleDate > todayKey) {
        showToast('La fecha de venta no puede ser futura.', 'warning');
        return;
      }

      if (ivaEnabled && (ivaRate < 0 || ivaRate > 100)) {
        showToast('El porcentaje de IVA debe estar entre 0 y 100.', 'warning');
        return;
      }

      let saleItems = [...AppState.saleItems];
      if (!saleItems.length) {
        const currentItem = getCurrentSaleItem();
        if (!currentItem) {
          showToast('Agrega al menos un producto con el boton +', 'warning');
          return;
        }
        if (currentItem.quantity > currentItem.stock) {
          showToast('Stock insuficiente para esta venta', 'error');
          return;
        }
        saleItems = [{
          material_name: currentItem.material_name,
          quantity: currentItem.quantity,
          price: currentItem.price,
          subtotal: currentItem.subtotal
        }];
      }

      const stockByMaterial = {};
      saleItems.forEach(item => {
        stockByMaterial[item.material_name] = (stockByMaterial[item.material_name] || 0) + (item.quantity || 0);
      });

      const inv = calcInventory();
      const stockProblem = Object.entries(stockByMaterial).find(([name, qty]) => qty > ((inv[name] && inv[name].stock) || 0));
      if (stockProblem) {
        showToast(`Stock insuficiente para ${stockProblem[0]}`, 'error');
        return;
      }
      
      const invalidItem = saleItems.find(item =>
        !item.material_name ||
        !isPositiveNumber(toFiniteNumber(item.quantity, 0)) ||
        !isPositiveNumber(toFiniteNumber(item.price, 0)) ||
        !isPositiveNumber(toFiniteNumber(item.subtotal, 0))
      );
      if (invalidItem) {
        showToast('Hay un producto con cantidad, precio o subtotal invalido.', 'error');
        return;
      }

      const subtotal = saleItems.reduce((sum, item) => sum + toFiniteNumber(item.subtotal, 0), 0);
      const tax = ivaEnabled ? subtotal * (ivaRate / 100) : 0;
      const total = subtotal + tax;
      if (!isPositiveNumber(total)) {
        showToast('El total de la venta debe ser mayor que cero.', 'warning');
        return;
      }
      const firstItem = saleItems[0];
      const materialLabel = saleItems.length === 1 ? firstItem.material_name : 'Varios productos';
      const quantityTotal = saleItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const invNum = generateInvoiceNum();
      const now = buildSaleDateTime(saleDate);
      
      AppState.saleSaving = true;
      btn.disabled = true;
      printBtn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Procesando...`;
      printBtn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Procesando...`;
      lucide.createIcons();
      let saleCompleted = false;
      
      try {
        const saleData = {
          type: 'sale',
          material_name: materialLabel,
          client_name: client,
          vehicle_plate: vehiclePlate,
          note: note,
          sale_quantity: quantityTotal,
          sale_subtotal: subtotal,
          sale_tax: tax,
          sale_total: total,
          price: saleItems.length === 1 ? firstItem.price : 0,
          items: saleItems,
          invoice_number: invNum,
          date: now,
          status: 'completed',
          payment_type: paymentType,
          payment_status: paymentType === 'credito' ? 'pendiente' : 'pagada',
          iva_enabled: ivaEnabled,
          iva_rate: ivaRate,
          amount_paid: paymentType === 'credito' ? 0 : total,
          remaining_balance: paymentType === 'credito' ? total : 0,
          payments: []
        };
        
        saleData.__backendId = 'sale_' + Date.now();
        AppState.data.push(saleData);
        
        const invoiceData = {
          type: 'invoice',
          invoice_number: invNum,
          client_name: client,
          vehicle_plate: vehiclePlate,
          note: note,
          material_name: materialLabel,
          quantity: quantityTotal,
          price: saleItems.length === 1 ? firstItem.price : 0,
          items: saleItems,
          subtotal: subtotal,
          tax: tax,
          sale_total: total,
          date: now,
          status: paymentType === 'credito' ? 'pendiente' : 'pagada',
          payment_type: paymentType,
          payment_status: paymentType === 'credito' ? 'pendiente' : 'pagada',
          iva_enabled: ivaEnabled,
          iva_rate: ivaRate
        };
        
        invoiceData.__backendId = 'inv_' + Date.now();
        AppState.data.push(invoiceData);
        
        await AppState.saveUserData();
        
        showToast(`OK Venta registrada - Factura ${invNum}`, 'success');
        
        if (shouldPrint || AppState.config.auto_print) {
          const printerType = getEffectivePrinterType();

          if (isBluetoothPrinterSelected()) {
            try {
              await BluetoothPrinter.printInvoice(invoiceData);
              showToast('Factura enviada directo por Bluetooth', 'success');
            } catch (err) {
              showToast('No se pudo imprimir directo por Bluetooth. Se abrira impresion normal.', 'warning');
              printInvoice(invoiceData);
            }
          } else {
            // PDF o termica: generar PDF descargable (funciona en movil y cualquier navegador)
            if (isDownloadPrintMode(printerType)) {
              generateInvoicePDF(invoiceData);
            } else {
              // Estandar: imprimir por ventana del navegador
              printInvoice(invoiceData);
            }
          }
        }
        
        document.getElementById('saleForm').reset();
        AppState.saleItems = [];
        const ivaCheckbox = document.getElementById('saleIvaEnabled');
        if (ivaCheckbox) {
          ivaCheckbox.checked = AppState.config.iva_default_enabled;
          toggleIvaManual(AppState.config.iva_default_enabled);
        }
        renderSaleItemsList();
        updateSaleTotal();
        saleCompleted = true;
        
      } catch (err) {
        showToast('Error al procesar la venta', 'error');
        console.error(err);
      } finally {
        AppState.saleSaving = false;
        if (saleCompleted && AppState.currentPage === 'invoices') {
          AppState.invoiceSalePanelOpen = false;
        }
        btn.disabled = false;
        printBtn.disabled = false;
        btn.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> Guardar Venta`;
        printBtn.innerHTML = `<i data-lucide="printer" class="w-5 h-5"></i> Guardar e Imprimir`;
        lucide.createIcons();
        if (saleCompleted && AppState.currentPage === 'invoices') {
          renderPageQuietly();
        } else {
          renderPage();
        }
      }
    }

    // ==================== GESTION DE CREDITO CON ABONOS Y PAGO TOTAL ====================
    function getCreditClientKey(clientName) {
      const value = String(clientName || 'cliente');
      let hash = 0;
      for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
      }
      const slug = value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'cliente';
      return `credit_client_${slug}_${(hash >>> 0).toString(36)}`;
    }

    function renderCredit(container) {
      const sales = getRecords('sale').filter(s => s.payment_type === 'credito' || s.payment_status === 'pagada');
      const payments = getRecords('payment');
      const clients = getRecords('client');

      // Agrupar por cliente
      const clientDebts = {};

      sales.forEach(s => {
        if (!clientDebts[s.client_name]) {
          clientDebts[s.client_name] = {
            totalDebt: 0,
            totalPaid: 0,
            transactions: []
          };
        }

        const saleTotal = s.sale_total || 0;
        const salePayments = payments.filter(p => p.sale_id === s.__backendId);
        const paymentTotal = salePayments.reduce((sum, p) => sum + p.amount, 0);
        const paidAmount = s.payment_status === 'pagada'
          ? Math.max(paymentTotal, s.amount_paid || 0, saleTotal)
          : paymentTotal;
        const remaining = Math.max(0, saleTotal - paidAmount);

        clientDebts[s.client_name].totalDebt += saleTotal;
        clientDebts[s.client_name].totalPaid += paidAmount;
        clientDebts[s.client_name].transactions.push({
          ...s,
          paidAmount,
          remaining,
          payments: salePayments,
          selected: false
        });
      });

      let filteredClients = Object.keys(clientDebts);

      if (AppState.creditFilters.search) {
        const search = AppState.creditFilters.search.toLowerCase();
        filteredClients = filteredClients.filter(cn => {
          // Buscar en nombre de cliente
          if (cn.toLowerCase().includes(search)) return true;
          // Buscar en transacciones del cliente
          return clientDebts[cn].transactions.some(t => 
            (t.invoice_number?.toLowerCase() || '').includes(search) ||
            (t.material_name?.toLowerCase() || '').includes(search)
          );
        });
      }

      if (AppState.creditFilters.client) {
        filteredClients = filteredClients.filter(cn => 
          cn.toLowerCase().includes(AppState.creditFilters.client.toLowerCase())
        );
      }

      if (AppState.creditFilters.dateFrom || AppState.creditFilters.dateTo) {
        filteredClients = filteredClients.filter(cn => {
          return clientDebts[cn].transactions.some(t => {
            return matchesDateFilter(t.date, AppState.creditFilters.dateFrom, AppState.creditFilters.dateTo);
          });
        });
      }

      if (AppState.creditFilters.status === 'pending') {
        filteredClients = filteredClients.filter(cn => {
          return clientDebts[cn].transactions.some(t => t.remaining > 0.01 && t.payment_status !== 'pagada');
        });
      } else if (AppState.creditFilters.status === 'paid') {
        filteredClients = filteredClients.filter(cn => {
          return clientDebts[cn].transactions.some(t => t.remaining <= 0.01 && t.payment_status === 'pagada');
        });
      }

      filteredClients.sort();

      const getVisibleCreditTransactions = (cn) => {
        let tx = clientDebts[cn].transactions;
        if (AppState.creditFilters.dateFrom || AppState.creditFilters.dateTo) {
          tx = tx.filter(t => matchesDateFilter(t.date, AppState.creditFilters.dateFrom, AppState.creditFilters.dateTo));
        }
        if (AppState.creditFilters.status === 'pending') return tx.filter(t => t.remaining > 0.01 && t.payment_status !== 'pagada');
        if (AppState.creditFilters.status === 'paid') return tx.filter(t => t.remaining <= 0.01 && t.payment_status === 'pagada');
        return tx;
      };

      const totalPending = filteredClients.reduce((a, cn) => a + getVisibleCreditTransactions(cn).reduce((sum, t) => sum + Math.max(0, t.remaining || 0), 0), 0);
      const totalPaid = filteredClients.reduce((a, cn) => a + getVisibleCreditTransactions(cn).reduce((sum, t) => sum + (t.paidAmount || 0), 0), 0);
      const paymentRows = payments
        .map(p => {
          const sale = sales.find(s => s.__backendId === p.sale_id);
          return sale ? { ...p, sale } : null;
        })
        .filter(Boolean)
        .filter(p => {
          const search = (AppState.creditFilters.search || '').toLowerCase();
          const matchesSearch = !search ||
            (p.client_name || '').toLowerCase().includes(search) ||
            (p.invoice_number || '').toLowerCase().includes(search) ||
            (p.sale.material_name || '').toLowerCase().includes(search);
          const matchesClient = !AppState.creditFilters.client ||
            (p.client_name || '').toLowerCase().includes(AppState.creditFilters.client.toLowerCase());
          const matchesDate = matchesDateFilter(p.date, AppState.creditFilters.dateFrom, AppState.creditFilters.dateTo);
          return matchesSearch && matchesClient && matchesDate;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
          <div>
            <h2 class="text-2xl font-bold text-slate-100">Gestion de Credito y Abonos</h2>
            <p class="text-slate-500 text-sm mt-1">Control de deudas - Seleccion multiple de facturas para pago</p>
          </div>

          <div class="glass rounded-xl p-4 border border-slate-700/50">
            <div class="flex items-center gap-2 mb-3 text-primary-400">
              <i data-lucide="filter" class="w-4 h-4"></i>
              <span class="text-sm font-medium">Buscar Clientes</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div class="md:col-span-2">
                <label class="block text-xs text-slate-500 mb-1">Buscar Cliente / Factura / Material</label>
                <div class="relative">
                  <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-2.5"></i>
                  <input type="text" id="creditFilterSearch" value="${AppState.creditFilters.search || ''}" oninput="updateCreditFilters()" placeholder="Cliente, factura, material..."
                    class="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                </div>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Filtrar por Cliente</label>
                <select id="creditFilterClient" onchange="updateCreditFilters()" 
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus select-custom">
                  <option value="">Todos los clientes</option>
                  ${Object.keys(clientDebts).sort().map(c => `<option value="${c}" ${AppState.creditFilters.client === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Desde</label>
                <input type="date" id="creditFilterDateFrom" value="${AppState.creditFilters.dateFrom}" onchange="updateCreditFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Hasta</label>
                <input type="date" id="creditFilterDateTo" value="${AppState.creditFilters.dateTo}" onchange="updateCreditFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
              <button onclick="setCreditStatusFilter('all')" data-credit-action="status" data-status="all" id="btnStatusAll" 
                class="py-2 px-3 rounded-lg text-sm font-medium transition-all ${AppState.creditFilters.status === 'all' ? 'bg-primary-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}">
                Todos
              </button>
              <button onclick="setCreditStatusFilter('pending')" data-credit-action="status" data-status="pending" id="btnStatusPending"
                class="py-2 px-3 rounded-lg text-sm font-medium transition-all ${AppState.creditFilters.status === 'pending' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}">
                Deudores
              </button>
              <button onclick="setCreditStatusFilter('paid')" data-credit-action="status" data-status="paid" id="btnStatusPaid"
                class="py-2 px-3 rounded-lg text-sm font-medium transition-all ${AppState.creditFilters.status === 'paid' ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}">
                Pagados
              </button>
              <button onclick="setCreditStatusFilter('payments')" data-credit-action="status" data-status="payments" id="btnStatusPayments"
                class="py-2 px-3 rounded-lg text-sm font-medium transition-all ${AppState.creditFilters.status === 'payments' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}">
                Abonos
              </button>
            </div>
            ${AppState.creditFilters.client || AppState.creditFilters.dateFrom || AppState.creditFilters.dateTo || AppState.creditFilters.status !== 'all' ? `
              <div class="mt-3 flex items-center gap-2">
                <button onclick="clearCreditFilters()" data-credit-action="clear-filters" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
                  <i data-lucide="x-circle" class="w-3 h-3"></i> Limpiar filtros
                </button>
                <span class="text-xs text-slate-500">- Mostrando ${filteredClients.length} clientes</span>
              </div>
            ` : ''}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="glass rounded-xl p-5 border-l-4 border-rose-500">
              <div class="flex items-center justify-between mb-2">
                <span class="text-slate-400 text-xs font-semibold uppercase">Por Cobrar</span>
                <i data-lucide="alert-circle" class="w-4 h-4 text-rose-400"></i>
              </div>
              <div class="text-2xl font-bold text-rose-400 font-mono">${fmt.currency(totalPending)}</div>
              <div class="text-xs text-slate-500 mt-1">${filteredClients.filter(cn => getVisibleCreditTransactions(cn).some(t => t.remaining > 0.01 && t.payment_status !== 'pagada')).length} clientes</div>
            </div>

            <div class="glass rounded-xl p-5 border-l-4 border-emerald-500">
              <div class="flex items-center justify-between mb-2">
                <span class="text-slate-400 text-xs font-semibold uppercase">Cobrado</span>
                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i>
              </div>
              <div class="text-2xl font-bold text-emerald-400 font-mono">${fmt.currency(totalPaid)}</div>
              <div class="text-xs text-slate-500 mt-1">Total en abonos</div>
            </div>

            <div class="glass rounded-xl p-5 border-l-4 border-blue-500">
              <div class="flex items-center justify-between mb-2">
                <span class="text-slate-400 text-xs font-semibold uppercase">Cartera Total</span>
                <i data-lucide="wallet" class="w-4 h-4 text-blue-400"></i>
              </div>
              <div class="text-2xl font-bold text-blue-400 font-mono">${fmt.currency(totalPending + totalPaid)}</div>
              <div class="text-xs text-slate-500 mt-1">Volumen de credito</div>
            </div>
          </div>

          <div class="space-y-4">
            ${AppState.creditFilters.status === 'payments' ? `
              <div class="glass rounded-xl p-5 border-l-4 border-blue-500">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <h3 class="text-lg font-semibold text-slate-200 flex items-center gap-2">
                      <i data-lucide="receipt" class="w-5 h-5 text-blue-400"></i>
                      Abonos registrados
                    </h3>
                    <p class="text-sm text-slate-500">Historial separado de pagos parciales y pagos totales</p>
                  </div>
                  <div class="text-right">
                    <div class="text-2xl font-bold text-blue-400 font-mono">${fmt.currency(paymentRows.reduce((sum, p) => sum + (p.amount || 0), 0))}</div>
                    <div class="text-xs text-slate-500">${paymentRows.length} abonos</div>
                  </div>
                </div>

                ${paymentRows.length === 0 ? `
                  <div class="rounded-lg border border-dashed border-slate-700 p-8 text-center">
                    <i data-lucide="receipt" class="w-12 h-12 text-slate-600 mx-auto mb-3"></i>
                    <div class="font-semibold text-slate-300">Sin abonos</div>
                    <div class="text-sm text-slate-500">No hay abonos que coincidan con los filtros</div>
                  </div>
                ` : `
                  <div class="mb-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div class="text-xs font-semibold text-blue-400 flex items-center gap-2">
                        <i data-lucide="receipt" class="w-4 h-4"></i>
                        Seleccionar abonos para imprimir
                      </div>
                      <div class="flex gap-2">
                        <button onclick="selectVisibleCreditPayments(true)" data-credit-action="select-visible-payments" data-select="true" class="text-xs text-primary-400 hover:text-primary-300">Seleccionar todos</button>
                        <span class="text-slate-600">|</span>
                        <button onclick="selectVisibleCreditPayments(false)" data-credit-action="select-visible-payments" data-select="false" class="text-xs text-slate-400 hover:text-slate-300">Ninguno</button>
                      </div>
                    </div>
                    <div class="mt-3 flex items-center justify-between">
                      <span class="text-sm text-slate-400">Seleccionados: <span id="selectedPaymentCount" class="font-bold text-primary-400">0</span></span>
                      <button onclick="printSelectedCreditPayments()" data-credit-action="print-selected-payments" id="btnPrintSelectedPayments" disabled
                        class="py-2 px-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                        <i data-lucide="printer" class="w-4 h-4"></i> Imprimir
                      </button>
                    </div>
                  </div>
                  <div class="space-y-2">
                    ${paymentRows.map(p => {
                      const salePayments = payments.filter(x => x.sale_id === p.sale_id);
                      const paidSoFar = salePayments
                        .filter(x => x.date <= p.date)
                        .reduce((sum, x) => sum + (x.amount || 0), 0);
                      const remainingAfter = Math.max(0, (p.sale.sale_total || 0) - paidSoFar);
                      return `
                        <div class="p-4 bg-slate-800/30 border border-blue-500/20 rounded-lg">
                          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div class="flex items-start gap-3">
                              <input type="checkbox" id="paychk_${p.__backendId}" class="credit-payment-check mt-1 w-4 h-4 rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500" onchange="updateSelectedPaymentTotal()">
                              <div>
                              <div class="flex items-center gap-2 mb-1">
                                <span class="font-semibold text-slate-200">${p.client_name}</span>
                                <span class="text-xs px-2 py-1 rounded-full ${remainingAfter <= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}">
                                  ${remainingAfter <= 0 ? 'Pago total' : 'Abono'}
                                </span>
                              </div>
                              <div class="text-sm text-slate-500">${p.invoice_number} - ${p.sale.material_name} - ${fmt.dateTime(p.date)}</div>
                              </div>
                            </div>
                            <div class="text-right">
                              <div class="text-xl font-bold text-emerald-400 font-mono">${fmt.currency(p.amount)}</div>
                              <div class="text-xs text-slate-500">Resta: ${fmt.currency(remainingAfter)}</div>
                            </div>
                          </div>
                          <div class="mt-3 flex items-center justify-between pt-3 border-t border-slate-700/50">
                            <span class="text-xs text-slate-500">${p.method ? 'Metodo: ' + p.method : 'Abono registrado'}</span>
                            <button onclick="printPaymentReceipt('${p.__backendId}')" data-credit-action="print-payment-receipt" data-payment-id="${escapeAttr(p.__backendId)}" class="px-3 py-1 bg-primary-500/10 border border-primary-500/20 text-primary-400 rounded text-xs hover:bg-primary-500/20 transition-colors flex items-center gap-1">
                              <i data-lucide="printer" class="w-3 h-3"></i> Imprimir recibo
                            </button>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `}
              </div>
            ` : filteredClients.length === 0 ? `
              <div class="glass rounded-xl p-12 text-center">
                <i data-lucide="check-circle-2" class="w-16 h-16 text-slate-600 mx-auto mb-4"></i>
                <h3 class="text-lg font-semibold text-slate-300 mb-2">Sin Resultados</h3>
                <p class="text-slate-500">No hay clientes con credito que coincidan con los filtros</p>
              </div>
            ` : filteredClients.map(cn => {
              const client = clientDebts[cn];
              let displayTransactions = client.transactions;
              if (AppState.creditFilters.dateFrom || AppState.creditFilters.dateTo) {
                displayTransactions = displayTransactions.filter(t => matchesDateFilter(t.date, AppState.creditFilters.dateFrom, AppState.creditFilters.dateTo));
              }

              // Solo mostrar transacciones pendientes para seleccion
              const pendingTransactions = displayTransactions.filter(t => t.remaining > 0.01 && t.payment_status !== 'pagada');
              const paidTransactions = displayTransactions.filter(t => t.remaining <= 0.01 && t.payment_status === 'pagada');
              const visibleTransactions = AppState.creditFilters.status === 'pending'
                ? pendingTransactions
                : AppState.creditFilters.status === 'paid'
                  ? paidTransactions
                  : displayTransactions;
              const viewTotalDebt = visibleTransactions.reduce((sum, t) => sum + (t.sale_total || 0), 0);
              const viewTotalPaid = visibleTransactions.reduce((sum, t) => sum + (t.paidAmount || 0), 0);
              const remaining = AppState.creditFilters.status === 'paid'
                ? 0
                : visibleTransactions.reduce((sum, t) => sum + Math.max(0, t.remaining || 0), 0);
              const percentPaid = viewTotalDebt > 0 ? Math.min(100, (viewTotalPaid / viewTotalDebt) * 100) : 0;
              const hasPending = pendingTransactions.length > 0;
              const safeClientKey = getCreditClientKey(cn);
              const clientArg = JSON.stringify(cn);
              const canSelectInvoices = AppState.creditFilters.status === 'all' || AppState.creditFilters.status === 'pending' || AppState.creditFilters.status === 'paid';
              const canPaySelected = AppState.creditFilters.status === 'all' || AppState.creditFilters.status === 'pending';
              const showPendingTools = false;

              return `
                <div class="glass rounded-xl p-5 hover-lift">
                  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-full ${remaining > 0 ? 'bg-rose-500/10' : 'bg-emerald-500/10'} flex items-center justify-center">
                        <i data-lucide="user" class="w-5 h-5 ${remaining > 0 ? 'text-rose-400' : 'text-emerald-400'}"></i>
                      </div>
                      <div>
                        <h3 class="font-semibold text-slate-200">${cn}</h3>
                        <p class="text-sm text-slate-500">${visibleTransactions.length} venta${visibleTransactions.length === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="text-2xl font-bold ${remaining > 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">${fmt.currency(remaining)}</div>
                      <div class="text-xs text-slate-500">${remaining > 0 ? 'Pendiente por cobrar' : 'Pagado completamente'}</div>
                    </div>
                  </div>

                  <div class="space-y-2 mb-4">
                    <div class="flex justify-between text-xs text-slate-400">
                      <span>Progreso de pago</span>
                      <span>${percentPaid.toFixed(0)}%</span>
                    </div>
                    <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div class="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500" style="width: ${percentPaid}%"></div>
                    </div>
                    <div class="flex justify-between text-xs text-slate-500 pt-1">
                      <span>Pagado: ${fmt.currency(viewTotalPaid)}</span>
                      <span>Total: ${fmt.currency(viewTotalDebt)}</span>
                    </div>
                  </div>

                  ${showPendingTools ? `
                    <!-- SELECCION MULTIPLE DE FACTURAS -->
                    <div class="mt-4 pt-4 border-t border-slate-800">
                      <div class="flex items-center justify-between mb-3">
                        <div class="text-xs font-semibold text-primary-400 flex items-center gap-2">
                          <i data-lucide="list-checks" class="w-4 h-4"></i>
                          Seleccionar facturas para pago:
                        </div>
                        <div class="flex gap-2">
                          <button onclick="selectAllInvoices(${clientArg}, true)" data-credit-action="select-all-invoices" data-client="${escapeAttr(cn)}" data-select="true" class="text-xs text-primary-400 hover:text-primary-300">
                            Seleccionar todas
                          </button>
                          <span class="text-slate-600">|</span>
                          <button onclick="selectAllInvoices(${clientArg}, false)" data-credit-action="select-all-invoices" data-client="${escapeAttr(cn)}" data-select="false" class="text-xs text-slate-400 hover:text-slate-300">
                            Ninguna
                          </button>
                        </div>
                      </div>

                      <div class="space-y-2 max-h-64 overflow-y-auto" id="invoiceList_${safeClientKey}">
                        ${pendingTransactions.map(t => `
                          <div class="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 hover:border-primary-500/30 transition-colors cursor-pointer"
                               onclick="toggleInvoiceSelection('${t.__backendId}', ${clientArg})" data-credit-action="toggle-invoice" data-sale-id="${escapeAttr(t.__backendId)}" data-client="${escapeAttr(cn)}">
                            <input type="checkbox" id="chk_${t.__backendId}" data-client="${escapeAttr(cn)}" class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500"
                                   onchange="event.stopPropagation(); updateSelectedTotal(${clientArg})">
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center justify-between">
                                <span class="font-medium text-slate-300 text-sm">${t.invoice_number}</span>
                                <span class="font-mono text-rose-400 text-sm">${fmt.currency(t.remaining)}</span>
                              </div>
                              <div class="text-xs text-slate-500 mt-1">
                                ${t.material_name} - ${fmt.date(t.date)} - Total: ${fmt.currency(t.sale_total)}
                              </div>
                            </div>
                          </div>
                        `).join('')}
                      </div>

                      <!-- RESUMEN DE SELECCION -->
                      <div class="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                        <div class="flex items-center justify-between mb-2">
                          <span class="text-sm text-slate-400">Facturas seleccionadas:</span>
                          <span id="selectedCount_${safeClientKey}" class="text-sm font-bold text-primary-400">0</span>
                        </div>
                        <div class="flex items-center justify-between mb-3">
                          <span class="text-sm text-slate-400">Monto total seleccionado:</span>
                          <span id="selectedTotal_${safeClientKey}" class="text-lg font-bold text-emerald-400 font-mono">$0.00</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                        <button onclick="paySelectedInvoices(${clientArg})" data-credit-action="pay-selected" data-client="${escapeAttr(cn)}" id="btnPaySelected_${safeClientKey}" disabled
                            class="py-2 px-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                            <i data-lucide="check-circle" class="w-4 h-4"></i> Pagar Seleccionadas
                          </button>
                        <button onclick="showPartialPaymentModal(${clientArg})" data-credit-action="partial-selected" data-client="${escapeAttr(cn)}" id="btnPartialPay_${safeClientKey}" disabled
                            class="py-2 px-3 bg-primary-500/10 border border-primary-500/20 text-primary-400 rounded-lg text-sm font-medium hover:bg-primary-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                            <i data-lucide="plus-circle" class="w-4 h-4"></i> Abonar
                          </button>
                        </div>
                      </div>
                    </div>
                  ` : ''}

                  <div class="mt-4 pt-4 border-t border-slate-800">
                    ${canSelectInvoices ? `
                      <div class="mb-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                          <div class="text-xs font-semibold ${AppState.creditFilters.status === 'pending' ? 'text-rose-400' : 'text-emerald-400'} flex items-center gap-2">
                            <i data-lucide="${AppState.creditFilters.status === 'paid' ? 'check-circle' : 'alert-circle'}" class="w-4 h-4"></i>
                            ${AppState.creditFilters.status === 'paid' ? 'Seleccionar facturas pagadas' : 'Seleccionar facturas deudoras'}
                          </div>
                          <div class="flex gap-2">
                            <button onclick="selectVisibleCreditInvoices('${safeClientKey}', ${clientArg}, true)" data-credit-action="select-visible-invoices" data-client-key="${safeClientKey}" data-client="${escapeAttr(cn)}" data-select="true" class="text-xs text-primary-400 hover:text-primary-300">Seleccionar todas</button>
                            <span class="text-slate-600">|</span>
                            <button onclick="selectVisibleCreditInvoices('${safeClientKey}', ${clientArg}, false)" data-credit-action="select-visible-invoices" data-client-key="${safeClientKey}" data-client="${escapeAttr(cn)}" data-select="false" class="text-xs text-slate-400 hover:text-slate-300">Ninguna</button>
                          </div>
                        </div>
                        <div class="grid grid-cols-2 gap-2 mb-3">
                          <div class="text-sm text-slate-400">Seleccionadas: <span id="selectedCount_${safeClientKey}" class="font-bold text-primary-400">0</span></div>
                          <div class="text-sm text-slate-400 text-right">Total: <span id="selectedTotal_${safeClientKey}" class="font-bold text-emerald-400 font-mono">$0.00</span></div>
                        </div>
                        <div class="grid ${canPaySelected ? 'grid-cols-3' : 'grid-cols-1'} gap-2">
                          ${canPaySelected ? `
                            <button onclick="paySelectedInvoices(${clientArg})" data-credit-action="pay-selected" data-client="${escapeAttr(cn)}" id="btnPaySelected_${safeClientKey}" disabled
                              class="py-2 px-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                              <i data-lucide="check-circle" class="w-4 h-4"></i> Pagar
                            </button>
                            <button onclick="showPartialPaymentModal(${clientArg})" data-credit-action="partial-selected" data-client="${escapeAttr(cn)}" id="btnPartialPay_${safeClientKey}" disabled
                              class="py-2 px-3 bg-primary-500/10 border border-primary-500/20 text-primary-400 rounded-lg text-sm font-medium hover:bg-primary-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                              <i data-lucide="plus-circle" class="w-4 h-4"></i> Abonar
                            </button>
                          ` : ''}
                          <button onclick="printSelectedCreditInvoices('${safeClientKey}')" data-credit-action="print-selected-invoices" data-client-key="${safeClientKey}" id="btnPrintSelected_${safeClientKey}" disabled
                            class="py-2 px-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                            <i data-lucide="printer" class="w-4 h-4"></i> Imprimir
                          </button>
                        </div>
                      </div>
                    ` : ''}
                    <div class="text-xs font-semibold text-slate-400 mb-3">
                      ${AppState.creditFilters.status === 'pending' ? '' : AppState.creditFilters.status === 'paid' ? 'Facturas pagadas:' : 'Historial de Transacciones:'}
                    </div>
                    <div class="space-y-3 max-h-64 overflow-y-auto">
                      ${visibleTransactions.slice().reverse().map(t => {
                        const saleIdArg = JSON.stringify(t.__backendId);
                        const canSelectTransaction = AppState.creditFilters.status === 'paid'
                          ? t.remaining <= 0.01 && t.payment_status === 'pagada'
                          : t.remaining > 0.01 && t.payment_status !== 'pagada';
                        return `
                        <div class="bg-slate-800/30 rounded-lg p-3 border ${t.remaining > 0 ? 'border-rose-500/20' : 'border-emerald-500/20'}">
                          <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-2">
                              ${canSelectInvoices && canSelectTransaction ? `<input type="checkbox" id="chk_${t.__backendId}" data-client="${escapeAttr(cn)}" class="credit-invoice-check credit_invoice_${safeClientKey} w-4 h-4 rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500" onchange="updateSelectedTotal(${clientArg})">` : ''}
                              <i data-lucide="file-text" class="w-4 h-4 text-slate-500"></i>
                              <span class="text-slate-300 font-medium">${t.invoice_number}</span>
                              <span class="text-slate-500 text-xs">${fmt.date(t.date)}</span>
                            </div>
                            <div class="flex items-center gap-2">
                              <span class="font-mono text-slate-200">${fmt.currency(t.sale_total)}</span>
                              ${AppState.deleteConfirmId === t.__backendId ? `
                                <span class="text-xs text-rose-400">Eliminar?</span>
                                <button onclick="confirmDeleteRecord('${t.__backendId}')" class="text-xs text-rose-400 hover:text-rose-300 font-semibold">Si</button>
                                <button onclick="cancelDelete()" class="text-xs text-slate-400 hover:text-slate-300">No</button>
                              ` : `
                                <button onclick="askDelete('${t.__backendId}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Eliminar credito">
                                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                </button>
                              `}
                            </div>
                          </div>

                          <div class="text-sm text-slate-400 mb-2">
                            ${t.material_name} - ${fmt.quantity(t.sale_quantity)} ${t.iva_enabled ? '- IVA ' + t.iva_rate + '%' : ''}
                          </div>

                          ${t.payments.length > 0 && AppState.creditFilters.status !== 'pending' ? `
                            <div class="mb-2 space-y-1">
                              <div class="text-xs text-slate-500 font-medium">Abonos realizados:</div>
                              ${t.payments.map(p => `
                                <div class="flex items-center justify-between text-xs bg-slate-800/50 rounded px-2 py-1">
                                  <span class="text-emerald-400">${fmt.dateTime(p.date)}</span>
                                  <div class="flex items-center gap-2">
                                    <span class="font-mono text-emerald-400">${fmt.currency(p.amount)}</span>
                                    <button onclick="printPaymentReceipt('${p.__backendId}')" data-credit-action="print-payment-receipt" data-payment-id="${escapeAttr(p.__backendId)}" class="text-primary-400 hover:text-primary-300" title="Imprimir recibo">
                                      <i data-lucide="printer" class="w-3 h-3"></i>
                                    </button>
                                  </div>
                                </div>
                              `).join('')}
                            </div>
                          ` : ''}

                          <div class="flex items-center justify-between pt-2 border-t border-slate-700/50">
                            <div class="text-xs">
                              <span class="text-slate-500">Pagado: </span>
                              <span class="text-emerald-400 font-mono">${fmt.currency(t.paidAmount)}</span>
                              <span class="text-slate-500 mx-1">|</span>
                              <span class="text-slate-500">Resta: </span>
                              <span class="${t.remaining > 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">${fmt.currency(t.remaining)}</span>
                            </div>
                            ${t.remaining > 0 ? `
                              <div class="flex items-center gap-2">
                                <button onclick="showPaymentModal(${saleIdArg})" data-credit-action="show-payment" data-sale-id="${escapeAttr(t.__backendId)}" class="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-xs hover:bg-emerald-500/20 transition-colors flex items-center gap-1">
                                  <i data-lucide="plus-circle" class="w-3 h-3"></i> Abonar
                                </button>
                                <button onclick="showFullPaymentModal(${saleIdArg})" data-credit-action="show-full-payment" data-sale-id="${escapeAttr(t.__backendId)}" class="px-3 py-1 bg-primary-500/10 border border-primary-500/20 text-primary-400 rounded text-xs hover:bg-primary-500/20 transition-colors flex items-center gap-1">
                                  <i data-lucide="check-circle" class="w-3 h-3"></i> Pago Total
                                </button>
                              </div>
                            ` : `
                              <span class="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                                <i data-lucide="check-circle" class="w-3 h-3"></i> Pagado
                              </span>
                            `}
                          </div>
                        </div>
                      `;
                      }).join('')}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
    function showFullPaymentModal(saleId) {
      const sale = AppState.data.find(r => r.__backendId === saleId);
      if (!sale) return;

      const payments = getRecords('payment').filter(p => p.sale_id === saleId);
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const remaining = (sale.sale_total || 0) - totalPaid;

      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-100">Pago Total</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="bg-primary-500/10 border border-primary-500/20 rounded-lg p-4 mb-6">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
                <i data-lucide="check-circle" class="w-5 h-5 text-primary-400"></i>
              </div>
              <div>
                <div class="text-sm text-slate-400">Monto total pendiente (editable)</div>
                <div class="text-2xl font-bold text-primary-400 font-mono">${fmt.currency(remaining)}</div>
              </div>
            </div>
            <p class="text-xs text-slate-500">Puedes modificar el monto si es necesario</p>
          </div>

          <div class="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
            <div class="flex justify-between items-center mb-2">
              <span class="text-slate-400 text-sm">Factura</span>
              <span class="text-slate-200 font-mono">${sale.invoice_number}</span>
            </div>
            <div class="flex justify-between items-center mb-2">
              <span class="text-slate-400 text-sm">Total venta</span>
              <span class="text-slate-200 font-mono">${fmt.currency(sale.sale_total)}</span>
            </div>
            <div class="flex justify-between items-center mb-2">
              <span class="text-slate-400 text-sm">Pagado hasta ahora</span>
              <span class="text-emerald-400 font-mono">${fmt.currency(totalPaid)}</span>
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-slate-700">
              <span class="text-slate-400 text-sm">Pendiente maximo</span>
              <span class="text-primary-400 font-mono font-bold text-lg">${fmt.currency(remaining)}</span>
            </div>
          </div>

          <form onsubmit="saveFullPayment(event, '${saleId}', ${remaining})" data-credit-submit="full-payment" data-sale-id="${escapeAttr(saleId)}" data-max-amount="${remaining}" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Monto a Pagar (editable)</label>
              <div class="relative">
                <span class="absolute left-3 top-3 text-slate-500">$</span>
                <input type="number" id="fullPaymentAmount" step="0.01" min="0.01" max="${remaining}" 
                  value="${remaining.toFixed(2)}" required
                  class="w-full pl-8 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus"
                  placeholder="0.00">
              </div>
              <p class="text-xs text-slate-500 mt-1">Maximo: ${fmt.currency(remaining)} - Puedes pagar menos si es un abono parcial</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Metodo de Pago</label>
              <select id="paymentMethod" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Notas (opcional)</label>
              <input type="text" id="paymentNotes" placeholder="Referencia, concepto, etc."
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
            </div>

            <div class="flex gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" class="flex-1 px-4 py-3 bg-primary-500 hover:bg-primary-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20 flex items-center justify-center gap-2">
                <i data-lucide="check-circle" class="w-4 h-4"></i> Confirmar Pago
              </button>
            </div>
          </form>
        </div>
      `);
    }

    async function saveFullPayment(e, saleId, amount) {
      e.preventDefault();
      
      const method = document.getElementById('paymentMethod').value;
      const notes = safeText(document.getElementById('paymentNotes').value);
      const enteredAmount = document.getElementById('fullPaymentAmount')?.value;
      const safeAmount = toFiniteNumber(enteredAmount || amount, 0);
      const maxAmount = toFiniteNumber(amount, 0);
      if (!isPositiveNumber(safeAmount)) {
        showToast('El monto del pago debe ser mayor que cero.', 'error');
        return;
      }
      if (safeAmount > maxAmount) {
        showToast(`El pago no puede ser mayor a ${fmt.currency(maxAmount)}.`, 'error');
        return;
      }
      
      try {
        const sale = AppState.data.find(r => r.__backendId === saleId);
        if (!sale) {
          showToast('No se encontro la venta para registrar el pago.', 'error');
          return;
        }
        
        const paymentData = {
          type: 'payment',
          sale_id: saleId,
          client_name: sale.client_name,
          invoice_number: sale.invoice_number,
          amount: safeAmount,
          method: method,
          notes: notes || 'Pago total - Liquidacion completa',
          date: document.getElementById('entryDate')?.value || new Date().toISOString(),
          is_full_payment: true,
          __backendId: 'pay_' + Date.now()
        };
        
        AppState.data.push(paymentData);
        
        const payments = getRecords('payment').filter(p => p.sale_id === saleId);
        const totalPaid = payments.reduce((sum, p) => sum + toFiniteNumber(p.amount, 0), 0);
        const remaining = Math.max(0, (sale.sale_total || 0) - totalPaid);

        sale.payment_status = remaining <= 0.01 ? 'pagada' : 'pendiente';
        sale.remaining_balance = remaining;
        sale.amount_paid = totalPaid;

        const invoice = AppState.data.find(r => r.type === 'invoice' && r.invoice_number === sale.invoice_number);
        if (invoice) {
          invoice.payment_status = remaining <= 0.01 ? 'pagada' : 'pendiente';
          invoice.status = remaining <= 0.01 ? 'pagada' : 'pendiente';
        }
        
        AppState.saveUserData();
        
        showToast(`Pago total de ${fmt.currency(safeAmount)} registrado correctamente`, 'success');
        
        setTimeout(() => {
          if (confirm('Deseas imprimir el recibo de pago total?')) {
            printPaymentReceipt(paymentData.__backendId);
          }
        }, 300);
        
        closeModal();
        renderPage();
        
      } catch (err) {
        showToast('Error al registrar el pago total', 'error');
        console.error(err);
      }
    }

    function showPaymentModal(saleId) {
      const sale = AppState.data.find(r => r.__backendId === saleId);
      if (!sale) return;
      
      const payments = getRecords('payment').filter(p => p.sale_id === saleId);
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const remaining = (sale.sale_total || 0) - totalPaid;
      
      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-100">Registrar Abono</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          
          <div class="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
            <div class="flex justify-between items-center mb-2">
              <span class="text-slate-400 text-sm">Factura</span>
              <span class="text-slate-200 font-mono">${sale.invoice_number}</span>
            </div>
            <div class="flex justify-between items-center mb-2">
              <span class="text-slate-400 text-sm">Total venta</span>
              <span class="text-slate-200 font-mono">${fmt.currency(sale.sale_total)}</span>
            </div>
            <div class="flex justify-between items-center mb-2">
              <span class="text-slate-400 text-sm">Pagado hasta ahora</span>
              <span class="text-emerald-400 font-mono">${fmt.currency(totalPaid)}</span>
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-slate-700">
              <span class="text-slate-400 text-sm">Pendiente</span>
              <span class="text-rose-400 font-mono font-bold text-lg">${fmt.currency(remaining)}</span>
            </div>
          </div>
          
          <form onsubmit="savePayment(event, '${saleId}', ${remaining})" data-credit-submit="single-payment" data-sale-id="${escapeAttr(saleId)}" data-max-amount="${remaining}" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Monto del Abono</label>
              <div class="relative">
                <span class="absolute left-3 top-3 text-slate-500">$</span>
                <input type="number" id="paymentAmount" step="0.01" min="0.01" max="${remaining}" required
                  class="w-full pl-8 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus"
                  placeholder="0.00">
              </div>
              <p class="text-xs text-slate-500 mt-1">Maximo: ${fmt.currency(remaining)}</p>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Metodo de Pago</label>
              <select id="paymentMethod" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Notas (opcional)</label>
              <input type="text" id="paymentNotes" placeholder="Referencia, concepto, etc."
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
            </div>
            
            <div class="flex gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" class="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-emerald-500/20 flex items-center justify-center gap-2">
                <i data-lucide="save" class="w-4 h-4"></i> Guardar Abono
              </button>
            </div>
          </form>
        </div>
      `);
    }

    async function savePayment(e, saleId, maxAmount) {
      e.preventDefault();
      
      const amount = toFiniteNumber(document.getElementById('paymentAmount').value, 0);
      const safeMaxAmount = toFiniteNumber(maxAmount, 0);
      const method = document.getElementById('paymentMethod').value;
      const notes = safeText(document.getElementById('paymentNotes').value);
      
      if (!isPositiveNumber(amount) || amount > safeMaxAmount) {
        showToast(`Ingresa un monto mayor que cero y no mayor a ${fmt.currency(safeMaxAmount)}.`, 'error');
        return;
      }
      
      try {
        const sale = AppState.data.find(r => r.__backendId === saleId);
        if (!sale) {
          showToast('No se encontro la venta para registrar el abono.', 'error');
          return;
        }
        
        const paymentData = {
          type: 'payment',
          sale_id: saleId,
          client_name: sale.client_name,
          invoice_number: sale.invoice_number,
          amount: amount,
          method: method,
          notes: notes,
          date: new Date().toISOString(),
          __backendId: 'pay_' + Date.now()
        };
        
        AppState.data.push(paymentData);
        
        const payments = getRecords('payment').filter(p => p.sale_id === saleId);
        const totalPaid = payments.reduce((sum, p) => sum + toFiniteNumber(p.amount, 0), 0);
        const remaining = (sale.sale_total || 0) - totalPaid;
        
        if (remaining <= 0) {
          sale.payment_status = 'pagada';
          sale.remaining_balance = 0;
          sale.amount_paid = sale.sale_total;
        } else {
          sale.remaining_balance = remaining;
          sale.amount_paid = totalPaid;
        }

        const invoice = AppState.data.find(r => r.type === 'invoice' && r.invoice_number === sale.invoice_number);
        if (invoice) {
          invoice.payment_status = remaining <= 0 ? 'pagada' : 'pendiente';
          invoice.status = remaining <= 0 ? 'pagada' : 'pendiente';
        }
        
        await AppState.saveUserData();
        
        showToast(`Abono de ${fmt.currency(amount)} registrado correctamente`, 'success');
        
        setTimeout(() => {
          if (confirm('Deseas imprimir el recibo de abono?')) {
            printPaymentReceipt(paymentData.__backendId);
          }
        }, 300);
        
        closeModal();
        renderPage();
        
      } catch (err) {
        showToast('Error al registrar el abono', 'error');
        console.error(err);
      }
    }

    async function printPaymentReceipt(paymentId) {
      const payment = AppState.data.find(r => r.__backendId === paymentId);
      if (!payment) return;

      const printerType = isBluetoothPrinterSelected() ? 'standard' : getEffectivePrinterType();

      if (isBluetoothPrinterSelected()) {
        try {
          await BluetoothPrinter.printText(BluetoothPrinter.buildPaymentReceiptText(paymentId));
          showToast('Recibo enviado directo por Bluetooth', 'success');
          return;
        } catch (err) {
          showToast('No se pudo imprimir directo por Bluetooth. Se abrira impresion normal.', 'warning');
        }
      }

      // Si es termica o PDF: generar PDF descargable
      if (printerType === 'pdf' || printerType === 'thermal_80' || printerType === 'thermal_58') {
        generatePaymentReceiptPDF(paymentId);
        return;
      }

      const sale = AppState.data.find(r => r.__backendId === payment.sale_id);

      // Calcular saldo pendiente actual
      const allPayments = getRecords('payment').filter(p => p.sale_id === payment.sale_id);
      const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
      const remainingBalance = Math.max(0, (sale?.sale_total || 0) - totalPaid);

      // Determinar si es pago total o abono
      const isFullPayment = payment.is_full_payment || remainingBalance <= 0;
      const receiptTitle = isFullPayment ? 'RECIBO DE PAGO TOTAL' : 'RECIBO DE ABONO';
      const receiptType = isFullPayment ? 'PAGO TOTAL' : 'ABONO';

      const isThermal = printerType.includes('thermal');
      const is58mm = printerType === 'thermal_58';
      const width = is58mm ? '58mm' : isThermal ? '80mm' : '210mm';

      const thermalStyles = isThermal ? `
        <style>
          @page { size: ${width} auto; margin: 0; }
          body { width: ${width}; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; padding: 5mm; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 5px 0; }
          .item { display: flex; justify-content: space-between; }
          .product-highlight { font-weight: bold; text-transform: uppercase; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin: 5px 0; }
          .total { font-size: 14px; font-weight: bold; }
          .iva-info { font-size: 10px; color: #666; }
          .plate { font-size: 11px; background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
          .logo { max-width: 60mm; max-height: 20mm; margin-bottom: 5px; }
          .full-payment { background: #f59e0b; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; }
          .partial-payment { background: #3b82f6; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; }
          .pending-box { background: #fef3c7; border: 1px dashed #f59e0b; padding: 5px; margin: 5px 0; }
        </style>
      ` : `
        <style>
          @page { size: letter; margin: 20mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 30px; }
          .company { font-size: 24px; font-weight: bold; color: #f59e0b; }
          .receipt-box { border: 1px solid #ddd; padding: 20px; margin: 20px 0; background: #f9fafb; }
          .total { text-align: right; font-size: 18px; font-weight: bold; color: #059669; }
          .footer { margin-top: 40px; text-align: center; color: #6b7280; font-size: 11px; }
          .full-payment-badge { display: inline-block; padding: 4px 12px; background: #f59e0b; color: white; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .partial-payment-badge { display: inline-block; padding: 4px 12px; background: #3b82f6; color: white; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .pending-box { background: #fef3c7; border: 2px dashed #f59e0b; padding: 15px; margin: 20px 0; border-radius: 8px; }
          .pending-title { color: #d97706; font-weight: bold; margin-bottom: 5px; }
          .pending-amount { color: #d97706; font-size: 18px; font-weight: bold; }
          .logo { max-width: 150px; max-height: 80px; margin-bottom: 10px; }
        </style>
      `;

      // Seccion de saldo pendiente (solo para abonos)
      const pendingSection = !isFullPayment ? `
        <div class="pending-box">
          <div class="pending-title">FALTA POR PAGAR:</div>
          <div class="pending-amount">${fmt.currency(remainingBalance)}</div>
          <div style="font-size: 10px; color: #666; margin-top: 5px;">
            Total factura: ${fmt.currency(sale?.sale_total || 0)} | Pagado: ${fmt.currency(totalPaid)} | Resta: ${fmt.currency(remainingBalance)}
          </div>
          <div style="font-size: 9px; color: #999; margin-top: 8px; font-style: italic;">
            * Conserve este recibo para futuros pagos
          </div>
        </div>
      ` : `
        <div style="background: #d1fae5; border: 2px solid #059669; padding: 10px; margin: 10px 0; border-radius: 5px; text-align: center;">
          <div style="color: #059669; font-weight: bold; font-size: 14px;">OK DEUDA LIQUIDADA COMPLETAMENTE</div>
          <div style="color: #059669; font-size: 10px; margin-top: 5px;">Gracias por su pago</div>
        </div>
      `;

      const content = isThermal ? `
        <div class="center bold" style="font-size: 14px;">${AppState.config.company_name}</div>
        <div class="center" style="font-size: 10px;">${AppState.config.company_slogan}</div>
        ${AppState.config.company_rfc ? `<div class="center" style="font-size: 9px;">RNC: ${AppState.config.company_rfc}</div>` : ''}
        <div class="line"></div>
        <div class="center bold">${receiptTitle}</div>
        ${isFullPayment ? '<div class="center full-payment">LIQUIDACION COMPLETA</div>' : '<div class="center partial-payment">ABONO PARCIAL</div>'}
        <div class="line"></div>
        <div>Fecha: ${fmt.dateTime(payment.date)}</div>
        <div>Recibo #: ${payment.__backendId.replace('pay_', isFullPayment ? 'TOT-' : 'ABO-')}</div>
        <div>Cliente: ${payment.client_name}</div>
        <div class="line"></div>
        <div>Factura ref: ${payment.invoice_number}</div>
        <div>Metodo: ${payment.method.toUpperCase()}</div>
        ${payment.notes ? `<div>Nota: ${payment.notes}</div>` : ''}
        <div class="line"></div>
        <div class="center total">${receiptType}: ${fmt.currency(payment.amount)}</div>
        <div class="line"></div>
        ${pendingSection}
        <div class="line"></div>
        <div class="center" style="font-size: 9px; margin-top: 20px;">
          ${isFullPayment ? '** PAGO COMPLETADO **' : '** ABONO REGISTRADO **'}<br>
          ${AppState.config.company_phone ? `Tel: ${AppState.config.company_phone}` : ''}
        </div>
      ` : `
        <div class="header">
          <div style="font-size: 24px; font-weight: bold; color: #f59e0b;">${AppState.config.company_name}</div>
          <div>${AppState.config.company_slogan}</div>
        </div>

        <div class="receipt-box">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: ${isFullPayment ? '#f59e0b' : '#3b82f6'}; margin-bottom: 10px;">${receiptTitle}</h2>
            ${isFullPayment ? '<span class="full-payment-badge">LIQUIDACION COMPLETA</span>' : '<span class="partial-payment-badge">ABONO PARCIAL</span>'}
          </div>

          <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
            <div>
              <strong>Recibo #:</strong> ${payment.__backendId.replace('pay_', isFullPayment ? 'TOT-' : 'ABO-')}<br>
              <strong>Fecha:</strong> ${fmt.dateTime(payment.date)}
            </div>
            <div style="text-align: right;">
              <strong>Cliente:</strong><br>
              ${payment.client_name}
            </div>
          </div>

          <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <div style="margin-bottom: 10px;"><strong>Factura de referencia:</strong> ${payment.invoice_number}</div>
            <div style="margin-bottom: 10px;"><strong>Metodo de pago:</strong> ${payment.method.toUpperCase()}</div>
            ${payment.notes ? `<div style="margin-bottom: 10px;"><strong>Notas:</strong> ${payment.notes}</div>` : ''}
          </div>

          <div class="total" style="border-top: 2px solid ${isFullPayment ? '#f59e0b' : '#3b82f6'}; padding-top: 15px; margin-top: 15px; color: ${isFullPayment ? '#f59e0b' : '#3b82f6'};">
            MONTO ${receiptType}: ${fmt.currency(payment.amount)}
          </div>

          ${pendingSection}
        </div>

        <div style="text-align: center; color: #6b7280; font-size: 11px; margin-top: 40px;">
          <p>${isFullPayment ? 'Este documento certifica que la deuda ha sido liquidada completamente.' : 'Este documento es un comprobante de abono. Conserve para futuras referencias.'}</p>
          <p>${AppState.config.company_name} - ${AppState.config.company_phone || ''}</p>
        </div>
      `;

      openPrintDocument(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>${receiptTitle}</title>
            ${thermalStyles}
          <base target="_blank">
</head>
          <body onload="window.print(); window.close();">
            ${content}
          </body>
        </html>
      `, { autoClose: true });
    }
    

    function updateCreditFilters() {
      AppState.creditFilters.search = document.getElementById('creditFilterSearch')?.value || '';
      AppState.creditFilters.client = document.getElementById('creditFilterClient').value;
      AppState.creditFilters.dateFrom = document.getElementById('creditFilterDateFrom').value;
      AppState.creditFilters.dateTo = document.getElementById('creditFilterDateTo').value;
      renderFilterPage('creditFilterSearch');
    }

    function setCreditStatusFilter(status) {
      AppState.creditFilters.status = status;
      renderPage();
    }

    function clearCreditFilters() {
      AppState.creditFilters = { search: '', client: '', dateFrom: '', dateTo: '', status: 'all' };
      renderPage();
    }

    document.addEventListener('click', (event) => {
      const target = event.target.closest?.('[data-credit-action]');
      if (!target || target.disabled) return;

      const action = target.dataset.creditAction;
      const clientName = target.dataset.client || '';
      const select = target.dataset.select === 'true';

      event.preventDefault();
      event.stopImmediatePropagation();

      try {
        switch (action) {
          case 'status':
            setCreditStatusFilter(target.dataset.status || 'all');
            break;
          case 'clear-filters':
            clearCreditFilters();
            break;
          case 'select-all-invoices':
            selectAllInvoices(clientName, select);
            break;
          case 'select-visible-invoices':
            selectVisibleCreditInvoices(target.dataset.clientKey, clientName, select);
            break;
          case 'toggle-invoice':
            toggleInvoiceSelection(target.dataset.saleId, clientName);
            break;
          case 'pay-selected':
            paySelectedInvoices(clientName);
            break;
          case 'partial-selected':
            showPartialPaymentModal(clientName);
            break;
          case 'print-selected-invoices':
            printSelectedCreditInvoices(target.dataset.clientKey);
            break;
          case 'select-visible-payments':
            selectVisibleCreditPayments(select);
            break;
          case 'print-selected-payments':
            printSelectedCreditPayments();
            break;
          case 'print-payment-receipt':
            printPaymentReceipt(target.dataset.paymentId);
            break;
          case 'show-payment':
            showPaymentModal(target.dataset.saleId);
            break;
          case 'show-full-payment':
            showFullPaymentModal(target.dataset.saleId);
            break;
        }
      } catch (error) {
        console.error(error);
        showToast('No se pudo ejecutar la accion de credito', 'error');
      }
    }, true);

    document.addEventListener('change', (event) => {
      const target = event.target;
      if (!target?.classList?.contains('credit-invoice-check')) return;
      event.stopImmediatePropagation();
      updateSelectedTotal(target.dataset.client || '');
    }, true);

    document.addEventListener('submit', (event) => {
      const form = event.target;
      const action = form?.dataset?.creditSubmit;
      if (!action) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      try {
        switch (action) {
          case 'full-payment':
            saveFullPayment(event, form.dataset.saleId, toFiniteNumber(form.dataset.maxAmount, 0));
            break;
          case 'single-payment':
            savePayment(event, form.dataset.saleId, toFiniteNumber(form.dataset.maxAmount, 0));
            break;
          case 'multiple-payment':
            processMultiplePayment(event, form.dataset.client || '');
            break;
          case 'partial-multiple-payment':
            processPartialMultiplePayment(event, form.dataset.client || '');
            break;
        }
      } catch (error) {
        console.error(error);
        showToast('No se pudo guardar el pago de credito', 'error');
      }
    }, true);

    function renderInvoices(container) {
      let invoices = getRecords('invoice');
      const clients = [...new Set(invoices.map(i => i.client_name))].sort();

      if (AppState.invoiceFilters.search) {
        const search = AppState.invoiceFilters.search.toLowerCase();
        invoices = invoices.filter(i => 
          (i.invoice_number?.toLowerCase() || '').includes(search) ||
          (i.client_name?.toLowerCase() || '').includes(search) ||
          (i.material_name?.toLowerCase() || '').includes(search) ||
          (i.vehicle_plate?.toLowerCase() || '').includes(search)
        );
      }
      if (AppState.invoiceFilters.client) {
        invoices = invoices.filter(i => i.client_name === AppState.invoiceFilters.client);
      }
      if (AppState.invoiceFilters.dateFrom || AppState.invoiceFilters.dateTo) {
        invoices = invoices.filter(i => matchesDateFilter(i.date, AppState.invoiceFilters.dateFrom, AppState.invoiceFilters.dateTo));
      }

      const totalRevenue = invoices.reduce((a, i) => a + (i.sale_total || 0), 0);
      const paidInvoices = invoices.filter(i => i.payment_status === 'pagada').length;
      const pendingInvoices = invoices.filter(i => i.payment_status === 'pendiente').length;
      const cancelledInvoices = invoices.filter(i => i.status === 'cancelled').length;

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 class="text-2xl font-bold text-slate-100">Facturas</h2>
              <p class="text-slate-500 text-sm mt-1">Registro de facturacion - Gestion completa</p>
            </div>
            <div class="flex flex-col sm:flex-row sm:items-center gap-3">
              <button type="button" onclick="toggleInvoiceSalePanel()"
                class="inline-flex items-center justify-center gap-2 px-4 py-2 ${AppState.invoiceSalePanelOpen ? 'bg-slate-700 hover:bg-slate-600 text-slate-100' : 'bg-primary-500 hover:bg-primary-400 text-slate-900'} font-semibold rounded-lg transition-all">
                <i data-lucide="${AppState.invoiceSalePanelOpen ? 'chevron-up' : 'shopping-cart'}" class="w-4 h-4"></i> ${AppState.invoiceSalePanelOpen ? 'Ocultar opciones' : 'Nueva Venta'}
              </button>
              <div class="text-right">
                <div class="text-xs text-slate-500">Total Filtrado</div>
                <div class="text-xl font-bold text-emerald-400 font-mono">${fmt.currency(totalRevenue)}</div>
              </div>
            </div>
          </div>

          ${AppState.invoiceSalePanelOpen ? `
            <div class="border border-primary-500/30 bg-primary-500/5 rounded-xl p-4">
              <div id="invoiceInlineSaleContainer"></div>
            </div>
          ` : ''}

          <div class="glass rounded-xl p-4 border border-slate-700/50">
            <div class="flex items-center gap-2 mb-3 text-primary-400">
              <i data-lucide="search" class="w-4 h-4"></i>
              <span class="text-sm font-medium">Buscar Facturas</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div class="md:col-span-2">
                <label class="block text-xs text-slate-500 mb-1">Buscar</label>
                <div class="relative">
                  <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-2.5"></i>
                  <input type="text" id="invoiceFilterSearch" value="${AppState.invoiceFilters.search || ''}" oninput="updateInvoiceFilters()" placeholder="Factura, cliente, material, placa..."
                    class="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                </div>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Cliente</label>
                <select id="invoiceFilterClient" onchange="updateInvoiceFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus select-custom">
                  <option value="">Todos los clientes</option>
                  ${clients.map(c => `<option value="${c}" ${AppState.invoiceFilters.client === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Desde</label>
                <input type="date" id="invoiceFilterDateFrom" value="${AppState.invoiceFilters.dateFrom}" onchange="updateInvoiceFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Hasta</label>
                <input type="date" id="invoiceFilterDateTo" value="${AppState.invoiceFilters.dateTo}" onchange="updateInvoiceFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
            </div>
            ${AppState.invoiceFilters.client || AppState.invoiceFilters.dateFrom || AppState.invoiceFilters.dateTo ? `
              <div class="mt-3 flex items-center gap-2">
                <button onclick="clearInvoiceFilters()" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
                  <i data-lucide="x-circle" class="w-3 h-3"></i> Limpiar filtros
                </button>
                <span class="text-xs text-slate-500">- Mostrando ${invoices.length} facturas</span>
              </div>
            ` : ''}
          </div>

          <div class="grid grid-cols-4 gap-4">
            <div class="glass rounded-xl p-4 text-center">
              <div class="text-2xl font-bold text-slate-200 font-mono">${invoices.length}</div>
              <div class="text-xs text-slate-500 mt-1">Total Facturas</div>
            </div>
            <div class="glass rounded-xl p-4 text-center border border-emerald-500/20 bg-emerald-500/5">
              <div class="text-2xl font-bold text-emerald-400 font-mono">${paidInvoices}</div>
              <div class="text-xs text-slate-500 mt-1">Pagadas</div>
            </div>
            <div class="glass rounded-xl p-4 text-center border border-amber-500/20 bg-amber-500/5">
              <div class="text-2xl font-bold text-amber-400 font-mono">${pendingInvoices}</div>
              <div class="text-xs text-slate-500 mt-1">Pendientes</div>
            </div>
            <div class="glass rounded-xl p-4 text-center border border-rose-500/20 bg-rose-500/5">
              <div class="text-2xl font-bold text-rose-400 font-mono">${cancelledInvoices}</div>
              <div class="text-xs text-slate-500 mt-1">Anuladas</div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${invoices.length === 0 ? `
              <div class="md:col-span-2 lg:col-span-3 glass rounded-xl p-12 text-center">
                <i data-lucide="file-x" class="w-16 h-16 text-slate-600 mx-auto mb-4"></i>
                <h3 class="text-lg font-semibold text-slate-300 mb-2">Sin Facturas</h3>
                <p class="text-slate-500">${getRecords('invoice').length === 0 ? 'Las facturas se generan automaticamente al registrar ventas' : 'No hay facturas con los filtros seleccionados'}</p>
              </div>
            ` : invoices.slice().reverse().slice(0, 60).map(inv => `
              <div class="glass rounded-xl overflow-hidden hover-lift ${inv.status === 'cancelled' ? 'opacity-60' : ''}">
                <div class="bg-gradient-to-r ${inv.status === 'cancelled' ? 'from-slate-600 to-slate-700' : inv.payment_status === 'pagada' ? 'from-emerald-500 to-emerald-600' : 'from-primary-500 to-primary-600'} p-4 text-white">
                  <div class="flex justify-between items-start mb-2">
                    <div>
                      <div class="text-xs opacity-80 mb-1">Factura</div>
                      <div class="font-mono font-bold text-lg">${inv.invoice_number}</div>
                      ${inv.status === 'cancelled' ? '<span class="text-xs bg-rose-500 px-2 py-0.5 rounded">ANULADA</span>' : ''}
                    </div>
                    <div class="text-right">
                      <div class="text-xs opacity-80 mb-1">Total</div>
                      <div class="font-bold text-lg">${fmt.currency(inv.sale_total)}</div>
                    </div>
                  </div>
                </div>
                <div class="p-4 space-y-3">
                  <div class="flex items-center gap-2 text-sm">
                    <i data-lucide="user" class="w-4 h-4 text-slate-500"></i>
                    <span class="text-slate-300 font-medium">${inv.client_name}</span>
                  </div>
                  ${inv.vehicle_plate ? `
                    <div class="flex items-center gap-2 text-sm">
                      <i data-lucide="truck" class="w-4 h-4 text-slate-500"></i>
                      <span class="text-slate-400 font-mono">Placa: ${inv.vehicle_plate}</span>
                    </div>
                  ` : ''}
                  <div class="flex items-center gap-2 text-sm">
                    <i data-lucide="box" class="w-4 h-4 text-slate-500"></i>
                    <span class="text-slate-400">${inv.material_name}</span>
                    <span class="text-slate-600">-</span>
                    <span class="text-slate-400 font-mono">${fmt.quantity(inv.quantity)}</span>
                  </div>
                  <div class="flex items-center gap-2 text-sm">
                    <i data-lucide="calendar" class="w-4 h-4 text-slate-500"></i>
                    <span class="text-slate-400 text-xs">${fmt.dateTime(inv.date)}</span>
                  </div>
                  ${inv.iva_enabled ? `
                    <div class="flex items-center gap-2 text-xs">
                      <span class="px-2 py-1 rounded bg-primary-500/10 text-primary-400">IVA ${inv.iva_rate}%</span>
                      <span class="text-slate-500">Subtotal: ${fmt.currency(inv.subtotal)}</span>
                    </div>
                  ` : `
                    <div class="flex items-center gap-2 text-xs">
                      <span class="px-2 py-1 rounded bg-slate-700 text-slate-400">Sin IVA</span>
                    </div>
                  `}

                  <!-- BOTONES DE ACCION: PAGAR, EDITAR, ANULAR -->
                  <div class="pt-3 border-t border-slate-800">
                    <div class="flex items-center justify-between mb-3">
                      <span class="status-badge ${inv.payment_status === 'pagada' ? 'bg-emerald-500/10 text-emerald-400' : inv.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}">
                        <div class="w-1.5 h-1.5 rounded-full ${inv.payment_status === 'pagada' ? 'bg-emerald-400' : inv.status === 'cancelled' ? 'bg-rose-400' : 'bg-amber-400'}"></div>
                        ${inv.status === 'cancelled' ? 'Anulada' : inv.payment_status === 'pagada' ? 'Pagada' : 'Pendiente'}
                      </span>
                    </div>

                    ${inv.status !== 'cancelled' ? `
                      <div class="grid grid-cols-3 gap-2">
                        ${inv.payment_status !== 'pagada' ? `
                          <button onclick="payInvoice('${inv.__backendId}')" class="flex items-center justify-center gap-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-colors text-xs font-medium" title="Marcar como pagada">
                            <i data-lucide="check-circle" class="w-3 h-3"></i> Pagar
                          </button>
                        ` : `
                          <button disabled class="flex items-center justify-center gap-1 px-3 py-2 bg-slate-800 text-slate-500 rounded-lg text-xs cursor-not-allowed">
                            <i data-lucide="check-circle" class="w-3 h-3"></i> Pagada
                          </button>
                        `}

                        <button onclick="editInvoice('${inv.__backendId}')" class="flex items-center justify-center gap-1 px-3 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors text-xs font-medium" title="Editar factura">
                          <i data-lucide="edit-2" class="w-3 h-3"></i> Editar
                        </button>

                        <button onclick="confirmCancelInvoice('${inv.__backendId}')" class="flex items-center justify-center gap-1 px-3 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/20 transition-colors text-xs font-medium" title="Anular factura">
                          <i data-lucide="x-circle" class="w-3 h-3"></i> Anular
                        </button>
                      </div>
                    ` : `
                      <div class="text-center py-2">
                        <span class="text-xs text-rose-400">Factura anulada el ${fmt.date(inv.cancelled_date || inv.date)}</span>
                        ${inv.cancellation_reason ? `<p class="text-xs text-slate-500 mt-1">Motivo: ${inv.cancellation_reason}</p>` : ''}
                      </div>
                    `}

                    <div class="flex gap-2 mt-3 pt-3 border-t border-slate-800/50">
                      <button onclick="printInvoiceById('${inv.__backendId}')" class="flex-1 p-2 rounded-lg text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 transition-colors text-xs flex items-center justify-center gap-1" title="Imprimir">
                        <i data-lucide="printer" class="w-3 h-3"></i> Imprimir
                      </button>
                      <button onclick="downloadInvoicePDF('${inv.__backendId}')" class="flex-1 p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors text-xs flex items-center justify-center gap-1" title="Descargar PDF">
                        <i data-lucide="download" class="w-3 h-3"></i> PDF
                      </button>
                      ${AppState.deleteConfirmId === inv.__backendId ? `
                        <button onclick="confirmDeleteRecord('${inv.__backendId}')" class="flex-1 p-2 rounded-lg text-rose-400 bg-rose-500/10 border border-rose-500/20 text-xs font-semibold">Si</button>
                        <button onclick="cancelDelete()" class="flex-1 p-2 rounded-lg text-slate-400 bg-slate-800/70 text-xs">No</button>
                      ` : `
                        <button onclick="askDelete('${inv.__backendId}')" class="flex-1 p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors text-xs flex items-center justify-center gap-1" title="Eliminar factura">
                          <i data-lucide="trash-2" class="w-3 h-3"></i> Borrar
                        </button>
                      `}
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      if (AppState.invoiceSalePanelOpen) {
        const inlineSaleContainer = document.getElementById('invoiceInlineSaleContainer');
        if (inlineSaleContainer) renderSales(inlineSaleContainer);
      }
    }

    function toggleInvoiceSalePanel() {
      AppState.invoiceSalePanelOpen = !AppState.invoiceSalePanelOpen;
      renderPage();
    }

    function updateInvoiceFilters() {
      AppState.invoiceFilters.search = document.getElementById('invoiceFilterSearch')?.value || '';
      AppState.invoiceFilters.client = document.getElementById('invoiceFilterClient').value;
      AppState.invoiceFilters.dateFrom = document.getElementById('invoiceFilterDateFrom').value;
      AppState.invoiceFilters.dateTo = document.getElementById('invoiceFilterDateTo').value;
      renderFilterPage('invoiceFilterSearch');
    }

    function clearInvoiceFilters() {
      AppState.invoiceFilters = { search: '', client: '', dateFrom: '', dateTo: '' };
      renderPage();
    }

    function matchesReportPeriodDate(dateValue) {
      const now = new Date();

      if (AppState.reportFilters.dateFrom || AppState.reportFilters.dateTo) {
        return matchesDateFilter(dateValue, AppState.reportFilters.dateFrom, AppState.reportFilters.dateTo);
      }

      const day = getLocalDateKey(dateValue);
      if (!day) return !AppState.reportFilters.period;

      switch(AppState.reportFilters.period) {
        case 'today':
          return day === getLocalDateKey(now.toISOString());
        case 'week': {
          const weekAgo = getLocalDateKey(new Date(now - 7 * 86400000).toISOString());
          return day >= weekAgo;
        }
        case 'month': {
          const monthStart = getLocalDateKey(new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
          return day >= monthStart;
        }
        case 'year': {
          const yearStart = getLocalDateKey(new Date(now.getFullYear(), 0, 1).toISOString());
          return day >= yearStart;
        }
        default:
          return true;
      }
    }

    function saleMatchesReportSearch(sale, search) {
      if (!search) return true;
      const itemNames = Array.isArray(sale.items) ? sale.items.map(i => i.material_name).join(' ') : '';
      return (sale.client_name || '').toLowerCase().includes(search) ||
        (sale.invoice_number || '').toLowerCase().includes(search) ||
        (sale.material_name || '').toLowerCase().includes(search) ||
        itemNames.toLowerCase().includes(search) ||
        (sale.note || '').toLowerCase().includes(search) ||
        (sale.vehicle_plate || '').toLowerCase().includes(search);
    }

    function getFilteredReportSales() {
      const reportSearch = (AppState.reportFilters.search || '').toLowerCase().trim();
      return getRecords('sale')
        .filter(s => matchesReportPeriodDate(s.date))
        .filter(s => saleMatchesReportSearch(s, reportSearch));
    }

    function getFilteredReportPayments() {
      const reportSearch = (AppState.reportFilters.search || '').toLowerCase().trim();
      const salesById = Object.fromEntries(getRecords('sale').map(s => [s.__backendId, s]));

      return getRecords('payment')
        .map(payment => ({ payment, sale: salesById[payment.sale_id] || null }))
        .filter(({ payment }) => matchesReportPeriodDate(payment.date))
        .filter(({ payment, sale }) => {
          if (!reportSearch) return true;
          return (payment.client_name || sale?.client_name || '').toLowerCase().includes(reportSearch) ||
            (payment.invoice_number || sale?.invoice_number || '').toLowerCase().includes(reportSearch) ||
            (payment.method || '').toLowerCase().includes(reportSearch) ||
            (payment.notes || '').toLowerCase().includes(reportSearch) ||
            (sale?.vehicle_plate || '').toLowerCase().includes(reportSearch) ||
            (sale?.material_name || '').toLowerCase().includes(reportSearch);
        });
    }

    function getReportCustomerPaymentStatus(sales, paymentEntries = []) {
      const payments = getRecords('payment');
      const clientMap = new Map();
      const reportSalesById = new Map();

      sales.forEach(sale => {
        if (sale?.__backendId) reportSalesById.set(sale.__backendId, sale);
      });

      paymentEntries.forEach(({ sale }) => {
        if (sale?.__backendId) reportSalesById.set(sale.__backendId, sale);
      });

      Array.from(reportSalesById.values()).forEach(sale => {
        const clientName = sale.client_name || 'Sin cliente';
        const saleTotal = toFiniteNumber(sale.sale_total, 0);
        const paidAmount = sale.payment_type === 'credito'
          ? payments
              .filter(payment => payment.sale_id === sale.__backendId)
              .reduce((sum, payment) => sum + toFiniteNumber(payment.amount, 0), 0)
          : saleTotal;
        const pendingAmount = sale.payment_type === 'credito'
          ? Math.max(0, toFiniteNumber(sale.remaining_balance, Math.max(0, saleTotal - paidAmount)))
          : 0;
        const isPaid = pendingAmount <= 0.01;

        if (!clientMap.has(clientName)) {
          clientMap.set(clientName, {
            clientName,
            invoiceCount: 0,
            paidInvoices: 0,
            pendingInvoices: 0,
            totalAmount: 0,
            paidAmount: 0,
            pendingAmount: 0,
            invoices: []
          });
        }

        const client = clientMap.get(clientName);
        client.invoiceCount += 1;
        client.paidInvoices += isPaid ? 1 : 0;
        client.pendingInvoices += isPaid ? 0 : 1;
        client.totalAmount += saleTotal;
        client.paidAmount += Math.min(saleTotal, paidAmount);
        client.pendingAmount += pendingAmount;
        client.invoices.push(sale.invoice_number || 'S/F');
      });

      const clients = Array.from(clientMap.values()).map(client => ({
        ...client,
        status: client.pendingAmount <= 0.01 ? 'PAGADO' : 'PENDIENTE'
      }));
      const paidClients = clients.filter(client => client.status === 'PAGADO');
      const pendingClients = clients.filter(client => client.status === 'PENDIENTE');

      return {
        clients,
        paidClients,
        pendingClients,
          paidInvoices: Array.from(reportSalesById.values()).filter(sale => {
          const saleTotal = toFiniteNumber(sale.sale_total, 0);
          const paid = sale.payment_type === 'credito'
            ? payments.filter(payment => payment.sale_id === sale.__backendId).reduce((sum, payment) => sum + toFiniteNumber(payment.amount, 0), 0)
            : saleTotal;
          const pending = sale.payment_type === 'credito'
            ? Math.max(0, toFiniteNumber(sale.remaining_balance, Math.max(0, saleTotal - paid)))
            : 0;
          return pending <= 0.01;
        }).length,
        pendingInvoices: Array.from(reportSalesById.values()).filter(sale => {
          const saleTotal = toFiniteNumber(sale.sale_total, 0);
          const paid = payments.filter(payment => payment.sale_id === sale.__backendId).reduce((sum, payment) => sum + toFiniteNumber(payment.amount, 0), 0);
          const pending = sale.payment_type === 'credito'
            ? Math.max(0, toFiniteNumber(sale.remaining_balance, Math.max(0, saleTotal - paid)))
            : 0;
          return pending > 0.01;
        }).length,
        totalPaidAmount: clients.reduce((sum, client) => sum + client.paidAmount, 0),
        totalPendingAmount: clients.reduce((sum, client) => sum + client.pendingAmount, 0)
      };
    }

    function getCurrentMonthPaymentStatusReport() {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const monthEnd = getLocalDateKey(now.toISOString());
      const sales = getRecords('sale');
      const payments = getRecords('payment');
      const salesById = Object.fromEntries(sales.map(sale => [sale.__backendId, sale]));
      const monthSales = sales.filter(sale => matchesDateFilter(sale.date, monthStart, monthEnd));
      const monthPayments = payments
        .map(payment => ({ payment, sale: salesById[payment.sale_id] || null }))
        .filter(({ payment }) => matchesDateFilter(payment.date, monthStart, monthEnd));

      const paidClientMap = new Map();
      monthPayments.forEach(({ payment, sale }) => {
        const clientName = payment.client_name || sale?.client_name || 'Sin cliente';
        if (!paidClientMap.has(clientName)) {
          paidClientMap.set(clientName, {
            clientName,
            paymentCount: 0,
            invoiceSet: new Set(),
            paidAmount: 0,
            methods: new Set()
          });
        }
        const client = paidClientMap.get(clientName);
        client.paymentCount += 1;
        client.invoiceSet.add(payment.invoice_number || sale?.invoice_number || 'S/F');
        client.paidAmount += toFiniteNumber(payment.amount, 0);
        if (payment.method) client.methods.add(payment.method);
      });

      const pendingClientMap = new Map();
      monthSales.forEach(sale => {
        const saleTotal = toFiniteNumber(sale.sale_total, 0);
        const paidAmount = sale.payment_type === 'credito'
          ? payments
              .filter(payment => payment.sale_id === sale.__backendId)
              .reduce((sum, payment) => sum + toFiniteNumber(payment.amount, 0), 0)
          : saleTotal;
        const pendingAmount = sale.payment_type === 'credito'
          ? Math.max(0, toFiniteNumber(sale.remaining_balance, Math.max(0, saleTotal - paidAmount)))
          : 0;
        if (pendingAmount <= 0.01) return;

        const clientName = sale.client_name || 'Sin cliente';
        if (!pendingClientMap.has(clientName)) {
          pendingClientMap.set(clientName, {
            clientName,
            invoiceCount: 0,
            invoiceSet: new Set(),
            totalAmount: 0,
            paidAmount: 0,
            pendingAmount: 0
          });
        }
        const client = pendingClientMap.get(clientName);
        client.invoiceCount += 1;
        client.invoiceSet.add(sale.invoice_number || 'S/F');
        client.totalAmount += saleTotal;
        client.paidAmount += Math.min(saleTotal, paidAmount);
        client.pendingAmount += pendingAmount;
      });

      const paidClients = Array.from(paidClientMap.values()).map(client => ({
        ...client,
        invoices: Array.from(client.invoiceSet),
        methodsText: Array.from(client.methods).join(', ') || '-'
      }));
      const pendingClients = Array.from(pendingClientMap.values()).map(client => ({
        ...client,
        invoices: Array.from(client.invoiceSet)
      }));

      return {
        monthStart,
        monthEnd,
        paidClients,
        pendingClients,
        monthPayments,
        monthSales,
        totalPaidAmount: paidClients.reduce((sum, client) => sum + client.paidAmount, 0),
        totalPendingAmount: pendingClients.reduce((sum, client) => sum + client.pendingAmount, 0)
      };
    }

    function getPendingClientReportFilters() {
      const filters = AppState.pendingClientReportFilters || {};
      const today = getLocalDateKey(new Date().toISOString());
      const currentMonthStart = today ? `${today.slice(0, 7)}-01` : '';
      return {
        dateFrom: filters.dateFrom || currentMonthStart,
        dateTo: filters.dateTo || today
      };
    }

    function getPendingClientPaymentReport() {
      const filters = getPendingClientReportFilters();
      const payments = getRecords('payment');
      const clientMap = new Map();
      const addPendingClientAmount = (clientName, totalAmount, paidAmount, pendingAmount, reference) => {
        if (pendingAmount <= 0.01) return;

        const safeClientName = clientName || 'Sin cliente';
        if (!clientMap.has(safeClientName)) {
          clientMap.set(safeClientName, {
            clientName: safeClientName,
            totalAmount: 0,
            paidAmount: 0,
            pendingAmount: 0,
            invoiceCount: 0,
            invoices: []
          });
        }

        const client = clientMap.get(safeClientName);
        client.totalAmount += totalAmount;
        client.paidAmount += Math.min(totalAmount, paidAmount);
        client.pendingAmount += pendingAmount;
        client.invoiceCount += 1;
        client.invoices.push(reference || 'S/F');
      };

      getRecords('sale')
        .filter(sale => sale.payment_type === 'credito')
        .filter(sale => matchesDateFilter(sale.date, filters.dateFrom, filters.dateTo))
        .forEach(sale => {
          const saleTotal = toFiniteNumber(sale.sale_total, 0);
          const paidAmount = payments
            .filter(payment => payment.sale_id === sale.__backendId)
            .reduce((sum, payment) => sum + toFiniteNumber(payment.amount, 0), 0);
          const pendingAmount = Math.max(0, toFiniteNumber(sale.remaining_balance, saleTotal - paidAmount));

          addPendingClientAmount(sale.client_name, saleTotal, paidAmount, pendingAmount, sale.invoice_number);
        });

      getRecords('direct_trip')
        .filter(trip => matchesDateFilter(trip.date, filters.dateFrom, filters.dateTo))
        .forEach(trip => {
          const tripTotal = toFiniteNumber(trip.trip_amount, 0);
          const paidAmount = toFiniteNumber(trip.amount_paid, 0);
          const pendingAmount = trip.payment_status === 'pagado'
            ? 0
            : Math.max(0, tripTotal - paidAmount);

          addPendingClientAmount(trip.destination_client, tripTotal, paidAmount, pendingAmount, trip.invoice_number);
        });

      const clients = Array.from(clientMap.values())
        .sort((a, b) => b.pendingAmount - a.pendingAmount || a.clientName.localeCompare(b.clientName));

      return {
        filters,
        clients,
        totalSales: clients.reduce((sum, client) => sum + client.totalAmount, 0),
        totalPaid: clients.reduce((sum, client) => sum + client.paidAmount, 0),
        totalPending: clients.reduce((sum, client) => sum + client.pendingAmount, 0)
      };
    }

    function renderPendingClientPaymentReportCard(report) {
      const periodText = `${formatDateKey(report.filters.dateFrom)} - ${formatDateKey(report.filters.dateTo)}`;

      return `
        <div class="glass rounded-xl p-6 border border-slate-700/50">
          <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
            <div class="flex items-start gap-4 min-w-0">
              <div class="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                <i data-lucide="file-text" class="w-7 h-7 text-blue-400"></i>
              </div>
              <div class="min-w-0">
                <h3 class="text-lg sm:text-xl font-bold text-slate-100 leading-tight whitespace-normal break-words">Clientes Pendientes por Pagar</h3>
                <p class="text-slate-500 text-sm mt-1">Muestra los clientes con saldo pendiente en el periodo seleccionado.</p>
              </div>
            </div>
            <div class="text-xs text-slate-500 lg:text-right">Periodo: ${periodText}</div>
          </div>

          <div class="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 mb-5">
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <label class="block text-xs text-slate-500 mb-1">Fecha inicial</label>
                <input type="date" id="pendingClientDateFrom" value="${report.filters.dateFrom}"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Fecha final</label>
                <input type="date" id="pendingClientDateTo" value="${report.filters.dateTo}"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <button onclick="updatePendingClientReportDates()" class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors text-sm font-semibold">
                <i data-lucide="search" class="w-4 h-4"></i> Buscar
              </button>
              <button onclick="exportPendingClientReportExcel()" class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors text-sm font-semibold">
                <i data-lucide="file-spreadsheet" class="w-4 h-4"></i> Excel
              </button>
              <button onclick="printPendingClientReport()" class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm font-semibold border border-slate-700">
                <i data-lucide="printer" class="w-4 h-4"></i> Imprimir
              </button>
            </div>
          </div>

          ${report.clients.length === 0 ? `
            <div class="rounded-lg border border-slate-800 p-6 text-center text-slate-500 text-sm">
              No hay clientes con saldo pendiente en este periodo.
            </div>
          ` : `
            <div class="overflow-x-auto rounded-xl border border-slate-700/60 mb-5">
              <table class="w-full text-sm">
                <thead class="bg-slate-950/70">
                  <tr class="text-left text-xs uppercase text-slate-400">
                    <th class="py-3 px-4">Cliente</th>
                    <th class="py-3 px-4 text-right">Saldo pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  ${report.clients.map(client => `
                    <tr class="border-t border-slate-800/80">
                      <td class="py-3 px-4 text-slate-200 font-medium">${escapeHtml(client.clientName)}</td>
                      <td class="py-3 px-4 text-right font-mono text-rose-400 font-semibold">${fmt.currency(client.pendingAmount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="rounded-xl border border-slate-700/60 overflow-hidden">
              <div class="flex items-center justify-between gap-4 px-4 py-3">
                <span class="text-rose-400 font-semibold">Total pendiente por cobrar:</span>
                <span class="font-mono font-bold text-rose-400">${fmt.currency(report.totalPending)}</span>
              </div>
            </div>
          `}
        </div>
      `;
    }

    function renderReports(container) {
      const activeReportTab = AppState.reportFilters.tab || 'resumen';
      const filteredSales = getFilteredReportSales();
      const filteredPayments = getFilteredReportPayments();
      const emptyCustomerPaymentStatus = { clients: [], paidClients: [], pendingClients: [], paidInvoices: 0, pendingInvoices: 0, totalPaidAmount: 0, totalPendingAmount: 0 };
      const customerPaymentStatus = activeReportTab === 'cobranza'
        ? getReportCustomerPaymentStatus(filteredSales, filteredPayments)
        : emptyCustomerPaymentStatus;
      const pendingClientPaymentReport = activeReportTab === 'cobranza' ? getPendingClientPaymentReport() : null;
      const reportTabs = [
        { id: 'resumen', label: 'Resumen', icon: 'layout-dashboard' },
        { id: 'cobranza', label: 'Cobranza', icon: 'wallet-cards' },
        { id: 'ventas', label: 'Ventas', icon: 'receipt-text' },
        { id: 'graficas', label: 'Graficas', icon: 'bar-chart-3' }
      ];
      const reportTabButton = tab => `
        <button type="button" onclick="setReportTab('${tab.id}')"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeReportTab === tab.id ? 'bg-primary-500 text-slate-950' : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700'}">
          <i data-lucide="${tab.icon}" class="w-4 h-4"></i>
          <span>${tab.label}</span>
        </button>
      `;

      const recentPayments = activeReportTab === 'cobranza'
        ? filteredPayments.slice().sort((a, b) => new Date(b.payment.date) - new Date(a.payment.date))
        : [];
      const recentSales = activeReportTab === 'ventas'
        ? filteredSales.slice().sort((a, b) => new Date(b.date) - new Date(a.date))
        : [];
      const totalRevenue = filteredSales.reduce((a, s) => a + (s.sale_total || 0), 0);
      const totalPayments = filteredPayments.reduce((a, item) => a + (toFiniteNumber(item.payment.amount, 0) || 0), 0);
      const fullPayments = filteredPayments.filter(item => item.payment.is_full_payment);
      const partialPayments = filteredPayments.filter(item => !item.payment.is_full_payment);
      const paymentsByMethod = filteredPayments.reduce((acc, { payment }) => {
        const method = payment.method || 'sin metodo';
        acc[method] = (acc[method] || 0) + (toFiniteNumber(payment.amount, 0) || 0);
        return acc;
      }, {});
      const topPaymentMethod = Object.entries(paymentsByMethod).sort((a, b) => b[1] - a[1])[0];
      const totalTransactions = filteredSales.length;
      const avgTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
      const cashSales = filteredSales.filter(s => s.payment_type !== 'credito');
      const creditSales = filteredSales.filter(s => s.payment_type === 'credito');
      const cashRevenue = cashSales.reduce((a, s) => a + (s.sale_total || 0), 0);
      const periodCashTotal = cashRevenue + totalPayments;
      const creditRevenue = creditSales.reduce((a, s) => a + (s.sale_total || 0), 0);
      const pendingCredit = creditSales.reduce((a, s) => a + Math.max(0, s.remaining_balance ?? ((s.sale_total || 0) - (s.amount_paid || 0))), 0);
      const paidCredit = Math.max(0, creditRevenue - pendingCredit);
      const bestSale = filteredSales.slice().sort((a, b) => (b.sale_total || 0) - (a.sale_total || 0))[0];
      
      const salesByDay = {};
      filteredSales.forEach(s => {
        const day = s.date?.split('T')[0];
        if (day) {
          salesByDay[day] = (salesByDay[day] || 0) + (s.sale_total || 0);
        }
      });
      const sortedDayEntries = Object.entries(salesByDay).sort((a, b) => b[1] - a[1]);
      const bestDay = sortedDayEntries[0];
      const activeDays = Object.keys(salesByDay).length;
      const dailyAverage = activeDays > 0 ? totalRevenue / activeDays : 0;
      
      const materialSales = {};
      filteredSales.forEach(s => {
        if (Array.isArray(s.items) && s.items.length) {
          s.items.forEach(item => {
            const itemTotal = item.subtotal || ((item.quantity || 0) * (item.price || 0));
            materialSales[item.material_name] = (materialSales[item.material_name] || 0) + itemTotal;
          });
        } else {
          materialSales[s.material_name] = (materialSales[s.material_name] || 0) + (s.sale_total || 0);
        }
      });
      const topMaterials = Object.entries(materialSales).sort((a, b) => b[1] - a[1]).slice(0, 5);
      
      const clientSales = {};
      filteredSales.forEach(s => {
        clientSales[s.client_name] = (clientSales[s.client_name] || 0) + (s.sale_total || 0);
      });
      const topClients = Object.entries(clientSales).sort((a, b) => b[1] - a[1]).slice(0, 5);
      
      const salesWithIva = filteredSales.filter(s => s.iva_enabled);
      const totalIva = salesWithIva.reduce((a, s) => a + (s.sale_tax || 0), 0);
      const collectionRate = creditRevenue > 0 ? (paidCredit / creditRevenue) * 100 : 100;
      const insights = [
        bestDay ? { icon: 'calendar-check', label: 'Dia mas fuerte', value: `${formatDateKey(bestDay[0])} - ${fmt.currency(bestDay[1])}`, color: 'emerald' } : null,
        bestSale ? { icon: 'trophy', label: 'Venta mas alta', value: `${bestSale.invoice_number || 'S/F'} - ${fmt.currency(bestSale.sale_total || 0)}`, color: 'amber' } : null,
        topClients[0] ? { icon: 'star', label: 'Cliente principal', value: `${topClients[0][0]} - ${fmt.currency(topClients[0][1])}`, color: 'blue' } : null,
        pendingCredit > 0 ? { icon: 'alert-triangle', label: 'Credito por cobrar', value: `${fmt.currency(pendingCredit)} pendiente`, color: 'rose' } : { icon: 'shield-check', label: 'Cartera limpia', value: 'Sin saldo pendiente en el filtro', color: 'emerald' }
      ].filter(Boolean);

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 class="text-2xl font-bold text-slate-100">Reportes y Analisis</h2>
              <p class="text-slate-500 text-sm mt-1">Metricas y estadisticas del negocio</p>
            </div>
            <button onclick="exportReport()" class="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm font-medium">
              <i data-lucide="download" class="w-4 h-4"></i> Exportar Excel
            </button>
          </div>

          <div class="glass rounded-xl p-4 border border-slate-700/50">
            <div class="flex items-center gap-2 mb-4 text-primary-400">
              <i data-lucide="calendar-range" class="w-4 h-4"></i>
              <span class="text-sm font-medium">Periodo del Reporte</span>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div class="md:col-span-3">
                <div class="relative">
                  <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-2.5"></i>
                  <input type="text" id="reportFilterSearch" value="${AppState.reportFilters.search || ''}" oninput="updateReportSearch()" placeholder="Buscar cliente, material, factura..."
                    class="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                </div>
              </div>
              <div>
                <select id="reportPeriodSelect" onchange="setReportPeriod(this.value)"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus select-custom">
                  <option value="" ${!AppState.reportFilters.period ? 'selected' : ''}>Seleccionar</option>
                  <option value="today" ${AppState.reportFilters.period === 'today' ? 'selected' : ''}>Hoy</option>
                  <option value="week" ${AppState.reportFilters.period === 'week' ? 'selected' : ''}>Semana</option>
                  <option value="month" ${AppState.reportFilters.period === 'month' ? 'selected' : ''}>Mes</option>
                  <option value="year" ${AppState.reportFilters.period === 'year' ? 'selected' : ''}>Año</option>
                  <option value="custom" ${AppState.reportFilters.period === 'custom' ? 'selected' : ''}>Custom</option>
                </select>
              </div>
            </div>

            ${AppState.reportFilters.period === 'custom' ? `
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Fecha Inicio</label>
                  <input type="date" id="reportDateFrom" value="${AppState.reportFilters.dateFrom}" onchange="updateReportCustomDates()"
                    class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Fecha Fin</label>
                  <input type="date" id="reportDateTo" value="${AppState.reportFilters.dateTo}" onchange="updateReportCustomDates()"
                    class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                </div>
              </div>
            ` : ''}
            
            <div class="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <i data-lucide="info" class="w-3 h-3"></i>
              <span>Mostrando ${filteredSales.length} venta(s) y ${filteredPayments.length} pago(s)/abono(s)</span>
            </div>
          </div>

          <div class="glass rounded-xl p-3 border border-slate-700/50">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
              ${reportTabs.map(reportTabButton).join('')}
            </div>
          </div>

          ${activeReportTab === 'cobranza' ? renderPendingClientPaymentReportCard(pendingClientPaymentReport) : ''}

          <div class="${activeReportTab === 'resumen' ? 'space-y-4' : 'hidden'}">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="glass rounded-xl p-5 border-l-4 border-emerald-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Cuadre del Periodo</div>
              <div class="text-2xl font-bold text-emerald-400 font-mono">${fmt.currency(periodCashTotal)}</div>
              <div class="text-xs text-slate-500 mt-1">Contado ${fmt.currency(cashRevenue)} + pagos/abonos ${fmt.currency(totalPayments)}</div>
            </div>
            <div class="glass rounded-xl p-5 border-l-4 border-blue-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Ticket Promedio</div>
              <div class="text-2xl font-bold text-blue-400 font-mono">${fmt.currency(avgTicket)}</div>
              <div class="text-xs text-slate-500 mt-1">Promedio diario: ${fmt.currency(dailyAverage)}</div>
            </div>
            <div class="glass rounded-xl p-5 border-l-4 border-primary-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Ventas facturadas</div>
              <div class="text-2xl font-bold text-primary-400 font-mono">${fmt.currency(totalRevenue)}</div>
              <div class="text-xs text-slate-500 mt-1">${totalTransactions} venta(s) en el periodo</div>
            </div>
            <div class="glass rounded-xl p-5 border-l-4 border-purple-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Credito pendiente</div>
              <div class="text-2xl font-bold text-purple-400 font-mono">${fmt.currency(pendingCredit)}</div>
              <div class="text-xs text-slate-500 mt-1">Cobranza: ${collectionRate.toFixed(0)}%</div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            ${insights.map(insight => `
              <div class="glass rounded-xl p-4 border border-${insight.color}-500/20 bg-${insight.color}-500/5">
                <div class="flex items-start gap-3">
                  <div class="w-9 h-9 rounded-lg bg-${insight.color}-500/10 flex items-center justify-center flex-shrink-0">
                    <i data-lucide="${insight.icon}" class="w-5 h-5 text-${insight.color}-400"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="text-xs uppercase text-slate-500 font-semibold">${insight.label}</div>
                    <div class="text-sm text-slate-200 font-medium mt-1 break-words">${insight.value}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="glass rounded-xl p-5 border-l-4 border-amber-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">IVA Recaudado</div>
              <div class="text-2xl font-bold text-amber-400 font-mono">${fmt.currency(totalIva)}</div>
              <div class="text-xs text-slate-500 mt-1">${salesWithIva.length} ventas con IVA</div>
            </div>
            <div class="glass rounded-xl p-5 border-l-4 border-cyan-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Credito vendido</div>
              <div class="text-2xl font-bold text-cyan-400 font-mono">${fmt.currency(creditRevenue)}</div>
              <div class="text-xs text-slate-500 mt-1">Cobrado: ${fmt.currency(paidCredit)}</div>
            </div>
            <div class="glass rounded-xl p-5 border-l-4 border-indigo-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Materiales vendidos</div>
              <div class="text-2xl font-bold text-indigo-400 font-mono">${Object.keys(materialSales).length}</div>
              <div class="text-xs text-slate-500 mt-1">Diferentes tipos</div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="glass rounded-xl p-5 border-l-4 border-emerald-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Pagos recibidos</div>
              <div class="text-2xl font-bold text-emerald-400 font-mono">${fmt.currency(totalPayments)}</div>
              <div class="text-xs text-slate-500 mt-1">${filteredPayments.length} pago(s) en el periodo</div>
            </div>
            <div class="glass rounded-xl p-5 border-l-4 border-sky-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Pagos completos</div>
              <div class="text-2xl font-bold text-sky-400 font-mono">${fullPayments.length}</div>
              <div class="text-xs text-slate-500 mt-1">${fmt.currency(fullPayments.reduce((a, item) => a + (toFiniteNumber(item.payment.amount, 0) || 0), 0))}</div>
            </div>
            <div class="glass rounded-xl p-5 border-l-4 border-orange-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Abonos</div>
              <div class="text-2xl font-bold text-orange-400 font-mono">${partialPayments.length}</div>
              <div class="text-xs text-slate-500 mt-1">${fmt.currency(partialPayments.reduce((a, item) => a + (toFiniteNumber(item.payment.amount, 0) || 0), 0))}</div>
            </div>
            <div class="glass rounded-xl p-5 border-l-4 border-violet-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Metodo principal</div>
              <div class="text-2xl font-bold text-violet-400 font-mono truncate">${topPaymentMethod ? topPaymentMethod[0] : '-'}</div>
              <div class="text-xs text-slate-500 mt-1">${topPaymentMethod ? fmt.currency(topPaymentMethod[1]) : 'Sin pagos'}</div>
            </div>
          </div>

          </div>

          <div class="${activeReportTab === 'cobranza' ? 'space-y-6' : 'hidden'}">
          <div class="glass rounded-xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-slate-200 flex items-center gap-2">
                <i data-lucide="receipt-text" class="w-5 h-5 text-emerald-400"></i> Personas que pagaron o abonaron
              </h3>
              <span class="text-xs text-slate-500">${filteredPayments.length} en el cuadre</span>
            </div>
            ${filteredPayments.length === 0 ? '<p class="text-slate-500 text-sm">No hay pagos ni abonos en este periodo</p>' : `
              <div class="overflow-x-auto rounded-xl border border-slate-700/70 bg-slate-950/30">
                <table class="w-full text-sm">
                  <thead class="bg-slate-900/90">
                    <tr class="text-left text-xs uppercase text-slate-400 border-b border-slate-700">
                      <th class="py-3 px-4">Persona</th>
                      <th class="py-3 px-4">Factura</th>
                      <th class="py-3 px-4">Tipo</th>
                      <th class="py-3 px-4">Por donde pago</th>
                      <th class="py-3 px-4 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recentPayments.slice(0, 10).map(({ payment, sale }) => `
                      <tr class="border-b border-slate-800/70 hover:bg-slate-800/35 transition-colors">
                        <td class="py-3 px-4 text-slate-200 font-semibold">${escapeHtml(payment.client_name || sale?.client_name || 'Sin cliente')}</td>
                        <td class="py-3 px-4 text-slate-400 font-mono">${escapeHtml(payment.invoice_number || sale?.invoice_number || 'S/F')}</td>
                        <td class="py-3 px-4">
                          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${payment.is_full_payment ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'}">
                            ${payment.is_full_payment ? 'Pago total' : 'Abono'}
                          </span>
                        </td>
                        <td class="py-3 px-4">
                          <div class="text-slate-200 font-medium">${escapeHtml(payment.notes || payment.method || '-')}</div>
                          <div class="text-xs text-slate-500 mt-0.5">${escapeHtml(payment.method || '')}</div>
                        </td>
                        <td class="py-3 px-4 text-right font-mono text-emerald-400 font-bold">${fmt.currency(payment.amount || 0)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <div class="glass rounded-xl p-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <h3 class="font-semibold text-slate-200 flex items-center gap-2">
                <i data-lucide="user-check" class="w-5 h-5 text-emerald-400"></i> Estado de pagos de clientes
              </h3>
              <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                <span class="text-xs text-slate-500">${customerPaymentStatus.clients.length} cliente(s) en el filtro</span>
                <button onclick="exportCurrentMonthPaymentStatusReport()" class="inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors text-xs font-semibold">
                  <i data-lucide="download" class="w-4 h-4"></i> Descargar mes actual
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
              <div class="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div class="text-xs uppercase text-slate-500 font-semibold">Clientes que pagaron</div>
                <div class="text-2xl font-bold text-emerald-400 font-mono mt-1">${customerPaymentStatus.paidClients.length}</div>
                <div class="text-xs text-slate-500 mt-1">${customerPaymentStatus.paidInvoices} factura(s) pagada(s)</div>
              </div>
              <div class="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
                <div class="text-xs uppercase text-slate-500 font-semibold">Clientes pendientes</div>
                <div class="text-2xl font-bold text-rose-400 font-mono mt-1">${customerPaymentStatus.pendingClients.length}</div>
                <div class="text-xs text-slate-500 mt-1">${customerPaymentStatus.pendingInvoices} factura(s) pendiente(s)</div>
              </div>
              <div class="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
                <div class="text-xs uppercase text-slate-500 font-semibold">Monto pagado</div>
                <div class="text-2xl font-bold text-sky-400 font-mono mt-1">${fmt.currency(customerPaymentStatus.totalPaidAmount)}</div>
                <div class="text-xs text-slate-500 mt-1">Segun ventas, pagos y abonos del filtro</div>
              </div>
              <div class="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <div class="text-xs uppercase text-slate-500 font-semibold">Monto pendiente</div>
                <div class="text-2xl font-bold text-amber-400 font-mono mt-1">${fmt.currency(customerPaymentStatus.totalPendingAmount)}</div>
                <div class="text-xs text-slate-500 mt-1">Saldo por cobrar</div>
              </div>
            </div>

            ${customerPaymentStatus.clients.length === 0 ? '<p class="text-slate-500 text-sm">Sin clientes para mostrar</p>' : `
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-800">
                      <th class="py-2 pr-3">Cliente</th>
                      <th class="py-2 pr-3">Estado</th>
                      <th class="py-2 pr-3">Facturas</th>
                      <th class="py-2 text-right pr-3">Pagado</th>
                      <th class="py-2 text-right">Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${customerPaymentStatus.clients
                      .slice()
                      .sort((a, b) => b.pendingAmount - a.pendingAmount || b.paidAmount - a.paidAmount)
                      .slice(0, 10)
                      .map(client => `
                        <tr class="border-b border-slate-800/70">
                          <td class="py-3 pr-3 text-slate-300 font-medium">${escapeHtml(client.clientName)}</td>
                          <td class="py-3 pr-3">
                            <span class="text-xs px-2 py-1 rounded-full ${client.status === 'PAGADO' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">
                              ${client.status === 'PAGADO' ? 'Pago' : 'No ha pagado'}
                            </span>
                          </td>
                          <td class="py-3 pr-3 text-slate-400">${client.paidInvoices}/${client.invoiceCount} pagada(s)</td>
                          <td class="py-3 text-right pr-3 font-mono text-emerald-400">${fmt.currency(client.paidAmount)}</td>
                          <td class="py-3 text-right font-mono ${client.pendingAmount > 0 ? 'text-amber-400' : 'text-slate-500'}">${fmt.currency(client.pendingAmount)}</td>
                        </tr>
                      `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          </div>

          <div class="${activeReportTab === 'graficas' ? 'space-y-6' : 'hidden'}">
          <div class="glass rounded-xl p-6">
            <h3 class="font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <i data-lucide="bar-chart-2" class="w-5 h-5 text-primary-400"></i> Ventas por Dia
            </h3>
            <div class="relative h-64">
              <canvas id="reportChart"></canvas>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="glass rounded-xl p-6">
              <h3 class="font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <i data-lucide="package" class="w-5 h-5 text-primary-400"></i> Top 5 Materiales
              </h3>
              ${topMaterials.length === 0 ? '<p class="text-slate-500 text-sm">Sin datos suficientes</p>' : `
                <div class="space-y-3">
                  ${topMaterials.map(([mat, total], i) => `
                    <div class="flex items-center gap-3">
                      <div class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500">${i + 1}</div>
                      <div class="flex-1">
                        <div class="flex justify-between mb-1">
                          <span class="text-sm text-slate-300">${mat}</span>
                          <span class="text-sm font-mono text-emerald-400">${fmt.currency(total)}</span>
                        </div>
                        <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div class="h-full bg-primary-500 rounded-full" style="width: ${(total / topMaterials[0][1]) * 100}%"></div>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <div class="glass rounded-xl p-6">
              <h3 class="font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <i data-lucide="users" class="w-5 h-5 text-primary-400"></i> Top 5 Clientes
              </h3>
              ${topClients.length === 0 ? '<p class="text-slate-500 text-sm">Sin datos suficientes</p>' : `
                <div class="space-y-3">
                  ${topClients.map(([client, total], i) => `
                    <div class="flex items-center gap-3">
                      <div class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500">${i + 1}</div>
                      <div class="flex-1">
                        <div class="flex justify-between mb-1">
                          <span class="text-sm text-slate-300">${client}</span>
                          <span class="text-sm font-mono text-emerald-400">${fmt.currency(total)}</span>
                        </div>
                        <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div class="h-full bg-blue-500 rounded-full" style="width: ${(total / topClients[0][1]) * 100}%"></div>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>

          </div>

          <div class="${activeReportTab === 'cobranza' ? 'space-y-6' : 'hidden'}">
          <div class="glass rounded-xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-slate-200 flex items-center gap-2">
                <i data-lucide="wallet-cards" class="w-5 h-5 text-emerald-400"></i> Pagos del Periodo
              </h3>
              <span class="text-xs text-slate-500">${Math.min(filteredPayments.length, 8)} de ${filteredPayments.length} pagos</span>
            </div>
            ${filteredPayments.length === 0 ? '<p class="text-slate-500 text-sm">Sin pagos para mostrar</p>' : `
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-800">
                      <th class="py-2 pr-3">Fecha</th>
                      <th class="py-2 pr-3">Factura</th>
                      <th class="py-2 pr-3">Cliente</th>
                      <th class="py-2 pr-3">Metodo</th>
                      <th class="py-2 pr-3">Tipo</th>
                      <th class="py-2 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recentPayments.slice(0, 8).map(({ payment, sale }) => `
                      <tr class="border-b border-slate-800/70">
                        <td class="py-3 pr-3 text-slate-300 font-medium">${fmt.date(payment.date)}</td>
                        <td class="py-3 pr-3 text-slate-400">${payment.invoice_number || sale?.invoice_number || 'S/F'}</td>
                        <td class="py-3 pr-3 text-slate-400">${payment.client_name || sale?.client_name || 'Sin cliente'}</td>
                        <td class="py-3 pr-3 text-slate-400">${payment.method || '-'}</td>
                        <td class="py-3 pr-3">
                          <span class="text-xs px-2 py-1 rounded-full ${payment.is_full_payment ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}">
                            ${payment.is_full_payment ? 'Pago total' : 'Abono'}
                          </span>
                        </td>
                        <td class="py-3 text-right font-mono text-emerald-400">${fmt.currency(payment.amount || 0)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          </div>

          <div class="${activeReportTab === 'ventas' ? 'space-y-6' : 'hidden'}">
          <div class="glass rounded-xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-slate-200 flex items-center gap-2">
                <i data-lucide="activity" class="w-5 h-5 text-primary-400"></i> Movimiento Ejecutivo
              </h3>
              <span class="text-xs text-slate-500">${Math.min(filteredSales.length, 8)} de ${filteredSales.length} registros</span>
            </div>
            ${filteredSales.length === 0 ? '<p class="text-slate-500 text-sm">Sin ventas para mostrar</p>' : `
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-800">
                      <th class="py-2 pr-3">Factura</th>
                      <th class="py-2 pr-3">Cliente</th>
                      <th class="py-2 pr-3">Material</th>
                      <th class="py-2 pr-3">Nota</th>
                      <th class="py-2 pr-3">Pago</th>
                      <th class="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recentSales.slice(0, 8).map(s => `
                      <tr class="border-b border-slate-800/70">
                        <td class="py-3 pr-3 text-slate-300 font-medium">${s.invoice_number || 'S/F'}<div class="text-xs text-slate-600">${fmt.date(s.date)}</div></td>
                        <td class="py-3 pr-3 text-slate-400">${s.client_name || 'Sin cliente'}</td>
                        <td class="py-3 pr-3 text-slate-400">${s.material_name || 'Varios productos'}</td>
                        <td class="py-3 pr-3 text-slate-400 max-w-xs break-words">${s.note ? escapeHtml(s.note) : '<span class="text-slate-600">Sin nota</span>'}</td>
                        <td class="py-3 pr-3">
                          <span class="text-xs px-2 py-1 rounded-full ${s.payment_type === 'credito' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}">
                            ${s.payment_type === 'credito' ? (s.payment_status === 'pagada' ? 'Credito pagado' : 'Credito pendiente') : 'Contado'}
                          </span>
                        </td>
                        <td class="py-3 text-right font-mono text-emerald-400">${fmt.currency(s.sale_total || 0)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
          </div>
        </div>
      `;

      if (activeReportTab === 'graficas') {
        setTimeout(() => initReportChart(salesByDay), 100);
      }
    }

    function setReportPeriod(period) {
      AppState.reportFilters.period = period;
      
      if (period !== 'custom') {
        AppState.reportFilters.dateFrom = '';
        AppState.reportFilters.dateTo = '';
      }
      
      renderPage();
    }

    function updateReportCustomDates() {
      AppState.reportFilters.dateFrom = document.getElementById('reportDateFrom').value;
      AppState.reportFilters.dateTo = document.getElementById('reportDateTo').value;
      AppState.reportFilters.period = 'custom';
      renderPage();
    }

    function updateReportSearch() {
      const search = document.getElementById('reportFilterSearch')?.value || '';
      clearTimeout(reportSearchTimer);
      reportSearchTimer = setTimeout(() => {
        AppState.reportFilters.search = search;
        reportSearchTimer = null;
        renderFilterPage('reportFilterSearch');
      }, Math.max(250, getFilterRenderDelay()));
    }

    function setReportTab(tab) {
      const nextTab = tab || 'resumen';
      if (AppState.reportFilters.tab === nextTab) return;
      AppState.reportFilters.tab = nextTab;
      const container = document.getElementById('content-area');
      renderReports(container);
      lucide.createIcons();
      enhanceSearchInputs(container);
    }

    function updatePendingClientReportDates() {
      const dateFrom = document.getElementById('pendingClientDateFrom')?.value || '';
      const dateTo = document.getElementById('pendingClientDateTo')?.value || '';

      if (dateFrom && dateTo && dateFrom > dateTo) {
        showToast('La fecha inicial no puede ser mayor que la fecha final.', 'warning');
        return;
      }

      AppState.pendingClientReportFilters = { dateFrom, dateTo };
      renderPage();
    }

    function exportPendingClientReportExcel() {
      if (!window.XLSX) {
        showExcelLibraryError();
        return;
      }

      const report = getPendingClientPaymentReport();
      const periodText = `${formatDateKey(report.filters.dateFrom)} - ${formatDateKey(report.filters.dateTo)}`;
      const rows = [
        ['CLIENTES PENDIENTES POR PAGAR'],
        [`PERIODO: ${periodText}`],
        [],
        ['Cliente', 'Saldo pendiente'],
        ...report.clients.map(client => [
          client.clientName,
          client.pendingAmount
        ]),
        [],
        ['Total pendiente por cobrar', report.totalPending]
      ];

      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = [{ wch: 34 }, { wch: 18 }];
      sheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }
      ];

      const titleStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 },
        fill: { fgColor: { rgb: '0B2E6F' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      };
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '0B2E6F' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      };
      const periodStyle = {
        font: { bold: true, color: { rgb: '111827' } },
        fill: { fgColor: { rgb: 'D9EAFB' } },
        alignment: { horizontal: 'center', vertical: 'center' }
      };
      const moneyStyle = { numFmt: '#,##0.00' };
      if (sheet.A1) sheet.A1.s = titleStyle;
      if (sheet.A2) sheet.A2.s = periodStyle;
      ['A4', 'B4'].forEach(addr => {
        if (sheet[addr]) sheet[addr].s = headerStyle;
      });
      for (let row = 5; row < 5 + report.clients.length; row++) {
        ['B'].forEach(col => {
          const cell = sheet[`${col}${row}`];
          if (cell) cell.s = moneyStyle;
        });
      }
      sheet['!autofilter'] = { ref: `A4:B${Math.max(4 + report.clients.length, 4)}` };

      XLSX.utils.book_append_sheet(workbook, sheet, 'Clientes pendientes');
      XLSX.writeFile(workbook, `clientes_pendientes_por_pagar_${report.filters.dateFrom}_a_${report.filters.dateTo}.xlsx`);
      showToast(`Reporte exportado: ${report.clients.length} cliente(s) pendiente(s)`);
    }

    function printPendingClientReport() {
      const report = getPendingClientPaymentReport();
      const periodText = `${formatDateKey(report.filters.dateFrom)} - ${formatDateKey(report.filters.dateTo)}`;
      const rows = report.clients.map(client => `
        <tr>
          <td>${escapeHtml(client.clientName)}</td>
          <td class="money pending">${fmt.currency(client.pendingAmount)}</td>
        </tr>
      `).join('');
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showToast('No se pudo abrir la ventana de impresion.', 'error');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Clientes Pendientes por Pagar</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
            .header { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 24px; }
            .icon { width: 48px; height: 48px; border: 3px solid #1267b2; border-radius: 8px; color: #1267b2; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; }
            h1 { font-size: 24px; margin: 0 0 8px; line-height: 1.2; overflow-wrap: anywhere; }
            p { margin: 0; color: #475569; font-size: 15px; line-height: 1.4; }
            .period { border: 1px solid #d1d5db; border-radius: 8px; padding: 14px 18px; margin-bottom: 18px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
            th { background: #102a4d; color: white; padding: 12px; font-size: 14px; }
            td { border: 1px solid #d9dee7; padding: 12px; font-size: 14px; }
            .money { text-align: right; white-space: nowrap; }
            .pending { color: #dc2626; font-weight: bold; }
            .totals { border: 1px solid #d9dee7; border-radius: 8px; overflow: hidden; }
            .total-row { display: flex; justify-content: space-between; padding: 11px 16px; border-bottom: 1px solid #d9dee7; font-size: 15px; }
            .total-row:last-child { border-bottom: 0; }
            .strong { font-weight: bold; }
            .danger { color: #dc2626; }
            @media print { body { margin: 12mm; } }
          </style>
        </head>
        <body onload="window.print();">
          <div class="header">
            <div class="icon">≡</div>
            <div>
              <h1>Clientes Pendientes por Pagar</h1>
              <p>Muestra todos los clientes que tienen saldo pendiente por pagar<br>en el periodo seleccionado.</p>
            </div>
          </div>
          <div class="period">Periodo: ${periodText}</div>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Saldo pendiente</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="2" style="text-align:center;color:#64748b;">No hay clientes con saldo pendiente en este periodo.</td></tr>'}
            </tbody>
          </table>
          <div class="totals">
            <div class="total-row"><span class="danger">Total pendiente por cobrar:</span><span class="strong danger">${fmt.currency(report.totalPending)}</span></div>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
    }

    function initReportChart(salesByDay) {
      const sortedDays = Object.keys(salesByDay).sort();
      const labels = sortedDays.map(d => {
        const date = new Date(d + 'T00:00:00');
        return date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
      });
      const data = sortedDays.map(d => salesByDay[d]);

      const ctx = document.getElementById('reportChart');
      if (!ctx) return;

      if (AppState.chartInstance) AppState.chartInstance.destroy();

      AppState.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Ventas',
            data: data,
            backgroundColor: '#f59e0b',
            borderRadius: 6,
            borderSkipped: false,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              titleColor: '#e2e8f0',
              bodyColor: '#e2e8f0',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 12,
              callbacks: { label: (context) => fmt.currency(context.raw) }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: '#64748b',
                font: { size: 11 },
                callback: (value) => '$' + (value >= 1000 ? (value/1000) + 'k' : value)
              },
              grid: { color: 'rgba(51, 65, 85, 0.3)', drawBorder: false }
            },
            x: {
              ticks: { color: '#64748b', font: { size: 11 } },
              grid: { display: false }
            }
          }
        }
      });
    }

    function exportReport() {
      if (!window.XLSX) {
        showExcelLibraryError();
        return;
      }

      const sales = getFilteredReportSales();
      const paymentEntries = getFilteredReportPayments();
      const customerPaymentStatus = getReportCustomerPaymentStatus(sales, paymentEntries);

      const saleRows = sales.flatMap(s => {
        const saleDate = new Date(s.date);
        const fecha = Number.isNaN(saleDate.getTime()) ? (s.date || '') : saleDate.toLocaleDateString('es-DO');
        const hora = Number.isNaN(saleDate.getTime()) ? '' : saleDate.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true });
        const items = Array.isArray(s.items) && s.items.length ? s.items : [{
          material_name: s.material_name || '',
          quantity: Number(s.sale_quantity) || 0,
          price: Number(s.price) || 0,
          subtotal: Number(s.sale_subtotal) || 0
        }];

        return items.map((item, index) => [
          fecha,
          hora,
          s.invoice_number || '',
          s.client_name || '',
          s.vehicle_plate || '',
          item.material_name || '',
          Number(item.quantity) || 0,
          Number(item.price) || 0,
          Number(item.subtotal) || 0,
          index === 0 ? (Number(s.sale_tax) || 0) : 0,
          index === 0 ? (Number(s.sale_total) || 0) : 0,
          s.note || '',
          s.payment_type === 'credito' ? 'CREDITO' : 'CONTADO',
          s.payment_status === 'pagada' ? 'PAGADA' : 'PENDIENTE'
        ]);
      });

      const paymentRows = paymentEntries.map(({ payment, sale }) => {
        const paymentDate = new Date(payment.date);
        const fecha = Number.isNaN(paymentDate.getTime()) ? (payment.date || '') : paymentDate.toLocaleDateString('es-DO');
        const hora = Number.isNaN(paymentDate.getTime()) ? '' : paymentDate.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true });
        const saleTotal = toFiniteNumber(sale?.sale_total, 0);
        const amount = toFiniteNumber(payment.amount, 0);
        const paidAfterPayment = sale
          ? getRecords('payment')
              .filter(p => p.sale_id === sale.__backendId && new Date(p.date) <= paymentDate)
              .reduce((sum, p) => sum + toFiniteNumber(p.amount, 0), 0)
          : '';
        const balanceAfterPayment = sale && paidAfterPayment !== '' ? Math.max(0, saleTotal - paidAfterPayment) : '';

        return [
          fecha,
          hora,
          payment.invoice_number || sale?.invoice_number || '',
          payment.client_name || sale?.client_name || '',
          sale?.vehicle_plate || '',
          payment.notes || payment.method || '',
          payment.is_full_payment ? 'PAGO TOTAL' : 'ABONO',
          amount,
          saleTotal || '',
          paidAfterPayment,
          balanceAfterPayment,
          payment.notes || ''
        ];
      });

      const contadoSales = sales.filter(s => s.payment_type !== 'credito');
      const creditoSales = sales.filter(s => s.payment_type === 'credito');
      const totalContado = contadoSales.reduce((a, s) => a + (Number(s.sale_total) || 0), 0);
      const totalCredito = creditoSales.reduce((a, s) => a + (Number(s.sale_total) || 0), 0);
      const totalGeneral = totalContado + totalCredito;
      const totalPayments = paymentEntries.reduce((a, { payment }) => a + toFiniteNumber(payment.amount, 0), 0);
      const periodCashTotal = totalContado + totalPayments;
      const fullPaymentEntries = paymentEntries.filter(({ payment }) => payment.is_full_payment);
      const partialPaymentEntries = paymentEntries.filter(({ payment }) => !payment.is_full_payment);
      const paymentMethodTotals = paymentEntries.reduce((acc, { payment }) => {
        const method = payment.method || 'SIN METODO';
        acc[method] = acc[method] || { count: 0, total: 0 };
        acc[method].count += 1;
        acc[method].total += toFiniteNumber(payment.amount, 0);
        return acc;
      }, {});
      const rows = [
        ['Fecha', 'Hora', 'Factura', 'Cliente', 'Placa', 'Material', 'Cantidad', 'Precio Unitario', 'Subtotal', 'IVA', 'Total', 'Nota', 'Tipo de Pago', 'Estado'],
        ...saleRows,
        [],
        [],
        ['RESUMEN DE VENTAS'],
        ['TIPO DE PAGO', 'CANTIDAD TBA', 'MONTO TOTAL'],
        ['CONTADO', contadoSales.length, totalContado],
        ['CREDITO', creditoSales.length, totalCredito],
        ['TOTAL FACTURADO', sales.length, totalGeneral],
        [],
        ['RESUMEN DE CUADRE'],
        ['CONCEPTO', 'CANTIDAD', 'MONTO'],
        ['VENTAS DE CONTADO', contadoSales.length, totalContado],
        ['PAGOS/ABONOS RECIBIDOS', paymentEntries.length, totalPayments],
        ['TOTAL CUADRE DEL PERIODO', contadoSales.length + paymentEntries.length, periodCashTotal],
        [],
        ['DETALLE DE PAGOS/ABONOS DEL CUADRE'],
        ['PERSONA', 'FACTURA', 'TIPO', 'POR DONDE PAGO', 'MONTO'],
        ...paymentEntries.map(({ payment, sale }) => [
          payment.client_name || sale?.client_name || 'Sin cliente',
          payment.invoice_number || sale?.invoice_number || 'S/F',
          payment.is_full_payment ? 'PAGO TOTAL' : 'ABONO',
          payment.notes || payment.method || '',
          toFiniteNumber(payment.amount, 0)
        ])
      ];

      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = [
        { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 22 },
        { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 30 },
        { wch: 16 }, { wch: 14 }
      ];
      const salesEndRow = saleRows.length + 1;
      const summaryTitleRow = saleRows.length + 4;
      const summaryHeaderRow = saleRows.length + 5;
      const summaryTotalRow = saleRows.length + 8;
      const cashSummaryTitleRow = saleRows.length + 10;
      const cashSummaryHeaderRow = saleRows.length + 11;
      const cashSummaryTotalRow = saleRows.length + 14;
      sheet['!merges'] = [
        { s: { r: summaryTitleRow - 1, c: 0 }, e: { r: summaryTitleRow - 1, c: 2 } },
        { s: { r: cashSummaryTitleRow - 1, c: 0 }, e: { r: cashSummaryTitleRow - 1, c: 2 } }
      ];

      const darkBlue = '0B2E6F';
      const gridBlack = '111111';
      const borderColor = '4B5563';
      const border = { style: 'thin', color: { rgb: borderColor } };
      const baseBorder = { top: border, bottom: border, left: border, right: border };
      const center = { horizontal: 'center', vertical: 'center', wrapText: true };
      const applyStyle = (addr, style) => {
        if (!sheet[addr]) sheet[addr] = { t: 's', v: '' };
        sheet[addr].s = style;
      };
      const rangeStyle = (range, style) => {
        const decoded = XLSX.utils.decode_range(range);
        for (let r = decoded.s.r; r <= decoded.e.r; r++) {
          for (let c = decoded.s.c; c <= decoded.e.c; c++) {
            applyStyle(XLSX.utils.encode_cell({ r, c }), style);
          }
        }
      };
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: darkBlue } },
        alignment: center,
        border: baseBorder
      };
      const bodyStyle = {
        font: { color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '000000' } },
        alignment: center,
        border: baseBorder
      };
      const moneyStyle = {
        font: { color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '000000' } },
        alignment: center,
        border: baseBorder,
        numFmt: '#,##0.00'
      };
      const summaryTitleStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: darkBlue } },
        alignment: center,
        border: baseBorder
      };
      const summaryTotalStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: darkBlue } },
        alignment: center,
        border: baseBorder,
        numFmt: '#,##0.00'
      };

      rangeStyle('A1:N1', headerStyle);
      if (salesEndRow > 1) {
        rangeStyle(`A2:N${salesEndRow}`, bodyStyle);
        rangeStyle(`H2:K${salesEndRow}`, moneyStyle);
      }
      rangeStyle(`A${summaryTitleRow}:C${summaryTitleRow}`, summaryTitleStyle);
      rangeStyle(`A${summaryHeaderRow}:C${summaryHeaderRow}`, headerStyle);
      rangeStyle(`A${summaryHeaderRow + 1}:C${summaryTotalRow - 1}`, bodyStyle);
      rangeStyle(`A${summaryTotalRow}:C${summaryTotalRow}`, summaryTotalStyle);
      rangeStyle(`C${summaryHeaderRow + 1}:C${summaryTotalRow}`, summaryTotalStyle);
      rangeStyle(`A${cashSummaryTitleRow}:C${cashSummaryTitleRow}`, summaryTitleStyle);
      rangeStyle(`A${cashSummaryHeaderRow}:C${cashSummaryHeaderRow}`, headerStyle);
      rangeStyle(`A${cashSummaryHeaderRow + 1}:C${cashSummaryTotalRow - 1}`, bodyStyle);
      rangeStyle(`A${cashSummaryTotalRow}:C${cashSummaryTotalRow}`, summaryTotalStyle);
      rangeStyle(`C${cashSummaryHeaderRow + 1}:C${cashSummaryTotalRow}`, summaryTotalStyle);
      rangeStyle(`O1:O${cashSummaryTotalRow}`, {
        fill: { fgColor: { rgb: gridBlack } },
        border: baseBorder
      });
      sheet['!autofilter'] = { ref: `A1:N${Math.max(salesEndRow, 1)}` };
      sheet['!rows'] = [{ hpt: 24 }];

      XLSX.utils.book_append_sheet(workbook, sheet, 'Reporte ventas');
      
      const paymentsSheetRows = [
        ['Fecha', 'Hora', 'Factura', 'Cliente', 'Placa', 'Metodo', 'Tipo', 'Monto', 'Total Venta', 'Pagado Acumulado', 'Saldo Despues', 'Notas'],
        ...paymentRows
      ];
      const paymentsSheet = XLSX.utils.aoa_to_sheet(paymentsSheetRows);
      paymentsSheet['!cols'] = [
        { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 16 },
        { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 30 }
      ];
      paymentsSheet['!autofilter'] = { ref: `A1:L${Math.max(paymentRows.length + 1, 1)}` };
      XLSX.utils.book_append_sheet(workbook, paymentsSheet, 'Reporte pagos');

      const paymentSummaryRows = [
        ['RESUMEN DE PAGOS'],
        ['CONCEPTO', 'CANTIDAD', 'MONTO'],
        ['PAGOS TOTALES', fullPaymentEntries.length, fullPaymentEntries.reduce((a, { payment }) => a + toFiniteNumber(payment.amount, 0), 0)],
        ['ABONOS', partialPaymentEntries.length, partialPaymentEntries.reduce((a, { payment }) => a + toFiniteNumber(payment.amount, 0), 0)],
        ['TOTAL PAGOS', paymentEntries.length, totalPayments],
        [],
        ['METODO', 'CANTIDAD', 'MONTO'],
        ...Object.entries(paymentMethodTotals)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([method, data]) => [method.toUpperCase(), data.count, data.total])
      ];
      const paymentSummarySheet = XLSX.utils.aoa_to_sheet(paymentSummaryRows);
      paymentSummarySheet['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(workbook, paymentSummarySheet, 'Resumen pagos');

      const customerStatusRows = [
        ['RESUMEN ESTADO DE CLIENTES'],
        ['CONCEPTO', 'CANTIDAD', 'MONTO'],
        ['CLIENTES QUE PAGARON', customerPaymentStatus.paidClients.length, customerPaymentStatus.totalPaidAmount],
        ['CLIENTES PENDIENTES', customerPaymentStatus.pendingClients.length, customerPaymentStatus.totalPendingAmount],
        ['FACTURAS PAGADAS', customerPaymentStatus.paidInvoices, ''],
        ['FACTURAS PENDIENTES', customerPaymentStatus.pendingInvoices, ''],
        [],
        ['CLIENTE', 'ESTADO', 'FACTURAS', 'PAGADAS', 'PENDIENTES', 'MONTO PAGADO', 'MONTO PENDIENTE', 'FACTURAS'],
        ...customerPaymentStatus.clients
          .slice()
          .sort((a, b) => b.pendingAmount - a.pendingAmount || b.paidAmount - a.paidAmount)
          .map(client => [
            client.clientName,
            client.status === 'PAGADO' ? 'PAGO' : 'NO HA PAGADO',
            client.invoiceCount,
            client.paidInvoices,
            client.pendingInvoices,
            client.paidAmount,
            client.pendingAmount,
            client.invoices.join(', ')
          ])
      ];
      const customerStatusSheet = XLSX.utils.aoa_to_sheet(customerStatusRows);
      customerStatusSheet['!cols'] = [
        { wch: 26 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 34 }
      ];
      XLSX.utils.book_append_sheet(workbook, customerStatusSheet, 'Estado clientes');

      XLSX.writeFile(workbook, `reporte_ventas_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast(`Reporte Excel exportado: ${sales.length} ventas, ${paymentEntries.length} pagos y ${customerPaymentStatus.clients.length} clientes`);
    }

    function exportCurrentMonthPaymentStatusReport() {
      if (!window.XLSX) {
        showExcelLibraryError();
        return;
      }

      const report = getCurrentMonthPaymentStatusReport();
      const workbook = XLSX.utils.book_new();
      const periodText = `${formatDateKey(report.monthStart)} a ${formatDateKey(report.monthEnd)}`;

      const summaryRows = [
        ['REPORTE DE PAGOS DEL MES'],
        ['PERIODO', periodText],
        [],
        ['CONCEPTO', 'CANTIDAD', 'MONTO'],
        ['CLIENTES QUE PAGARON ESTE MES', report.paidClients.length, report.totalPaidAmount],
        ['CLIENTES QUE NO HAN PAGADO ESTE MES', report.pendingClients.length, report.totalPendingAmount],
        ['PAGOS REGISTRADOS ESTE MES', report.monthPayments.length, report.totalPaidAmount],
        ['VENTAS DEL MES REVISADAS', report.monthSales.length, '']
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

      const paidRows = [
        ['Cliente', 'Cantidad de pagos', 'Facturas', 'Metodos', 'Monto pagado'],
        ...report.paidClients
          .slice()
          .sort((a, b) => b.paidAmount - a.paidAmount)
          .map(client => [
            client.clientName,
            client.paymentCount,
            client.invoices.join(', '),
            client.methodsText,
            client.paidAmount
          ])
      ];
      const paidSheet = XLSX.utils.aoa_to_sheet(paidRows);
      paidSheet['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 34 }, { wch: 22 }, { wch: 16 }];
      paidSheet['!autofilter'] = { ref: `A1:E${Math.max(paidRows.length, 1)}` };
      XLSX.utils.book_append_sheet(workbook, paidSheet, 'Pagaron este mes');

      const pendingRows = [
        ['Cliente', 'Facturas pendientes', 'Facturas', 'Monto venta', 'Monto abonado', 'Monto pendiente'],
        ...report.pendingClients
          .slice()
          .sort((a, b) => b.pendingAmount - a.pendingAmount)
          .map(client => [
            client.clientName,
            client.invoiceCount,
            client.invoices.join(', '),
            client.totalAmount,
            client.paidAmount,
            client.pendingAmount
          ])
      ];
      const pendingSheet = XLSX.utils.aoa_to_sheet(pendingRows);
      pendingSheet['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
      pendingSheet['!autofilter'] = { ref: `A1:F${Math.max(pendingRows.length, 1)}` };
      XLSX.utils.book_append_sheet(workbook, pendingSheet, 'No han pagado');

      const fileMonth = report.monthStart.slice(0, 7);
      XLSX.writeFile(workbook, `reporte_pagos_estado_${fileMonth}.xlsx`);
      showToast(`Reporte del mes descargado: ${report.paidClients.length} pagaron y ${report.pendingClients.length} no han pagado`);
    }
    

    const WORLD_CURRENCIES = [
      ['AED', 'Dirham de Emiratos Arabes Unidos'],
      ['AFN', 'Afgani afgano'],
      ['ALL', 'Lek albanes'],
      ['AMD', 'Dram armenio'],
      ['ANG', 'Florin antillano neerlandes'],
      ['AOA', 'Kwanza angoleno'],
      ['ARS', 'Peso argentino'],
      ['AUD', 'Dolar australiano'],
      ['AWG', 'Florin arubano'],
      ['AZN', 'Manat azerbaiyano'],
      ['BAM', 'Marco convertible bosnio'],
      ['BBD', 'Dolar de Barbados'],
      ['BDT', 'Taka bangladesi'],
      ['BGN', 'Lev bulgaro'],
      ['BHD', 'Dinar bareini'],
      ['BIF', 'Franco burundes'],
      ['BMD', 'Dolar bermudeno'],
      ['BND', 'Dolar de Brunei'],
      ['BOB', 'Boliviano'],
      ['BRL', 'Real brasileno'],
      ['BSD', 'Dolar bahameno'],
      ['BTN', 'Ngultrum butanes'],
      ['BWP', 'Pula botsuano'],
      ['BYN', 'Rublo bielorruso'],
      ['BZD', 'Dolar beliceno'],
      ['CAD', 'Dolar canadiense'],
      ['CDF', 'Franco congoles'],
      ['CHF', 'Franco suizo'],
      ['CLP', 'Peso chileno'],
      ['CNY', 'Yuan chino'],
      ['COP', 'Peso colombiano'],
      ['CRC', 'Colon costarricense'],
      ['CUP', 'Peso cubano'],
      ['CVE', 'Escudo caboverdiano'],
      ['CZK', 'Corona checa'],
      ['DJF', 'Franco yibutiano'],
      ['DKK', 'Corona danesa'],
      ['DOP', 'Peso dominicano'],
      ['DZD', 'Dinar argelino'],
      ['EGP', 'Libra egipcia'],
      ['ERN', 'Nakfa eritreo'],
      ['ETB', 'Birr etiope'],
      ['EUR', 'Euro'],
      ['FJD', 'Dolar fiyiano'],
      ['FKP', 'Libra malvinense'],
      ['GBP', 'Libra esterlina'],
      ['GEL', 'Lari georgiano'],
      ['GHS', 'Cedi ghanes'],
      ['GIP', 'Libra gibraltarena'],
      ['GMD', 'Dalasi gambiano'],
      ['GNF', 'Franco guineano'],
      ['GTQ', 'Quetzal guatemalteco'],
      ['GYD', 'Dolar guyanes'],
      ['HKD', 'Dolar de Hong Kong'],
      ['HNL', 'Lempira hondureno'],
      ['HTG', 'Gourde haitiano'],
      ['HUF', 'Forinto hungaro'],
      ['IDR', 'Rupia indonesia'],
      ['ILS', 'Nuevo shekel israeli'],
      ['INR', 'Rupia india'],
      ['IQD', 'Dinar iraqui'],
      ['IRR', 'Rial irani'],
      ['ISK', 'Corona islandesa'],
      ['JMD', 'Dolar jamaicano'],
      ['JOD', 'Dinar jordano'],
      ['JPY', 'Yen japones'],
      ['KES', 'Chelin keniano'],
      ['KGS', 'Som kirguis'],
      ['KHR', 'Riel camboyano'],
      ['KMF', 'Franco comorense'],
      ['KRW', 'Won surcoreano'],
      ['KWD', 'Dinar kuwaiti'],
      ['KYD', 'Dolar caiman'],
      ['KZT', 'Tenge kazajo'],
      ['LAK', 'Kip laosiano'],
      ['LBP', 'Libra libanesa'],
      ['LKR', 'Rupia esrilanquesa'],
      ['LRD', 'Dolar liberiano'],
      ['LSL', 'Loti lesotense'],
      ['LYD', 'Dinar libio'],
      ['MAD', 'Dirham marroqui'],
      ['MDL', 'Leu moldavo'],
      ['MGA', 'Ariary malgache'],
      ['MKD', 'Denar macedonio'],
      ['MMK', 'Kyat birmano'],
      ['MNT', 'Tugrik mongol'],
      ['MOP', 'Pataca macaense'],
      ['MRU', 'Uguiya mauritana'],
      ['MUR', 'Rupia mauriciana'],
      ['MVR', 'Rufiyaa maldiva'],
      ['MWK', 'Kwacha malaui'],
      ['MXN', 'Peso mexicano'],
      ['MYR', 'Ringgit malasio'],
      ['MZN', 'Metical mozambiqueno'],
      ['NAD', 'Dolar namibio'],
      ['NGN', 'Naira nigeriana'],
      ['NIO', 'Cordoba nicaraguense'],
      ['NOK', 'Corona noruega'],
      ['NPR', 'Rupia nepali'],
      ['NZD', 'Dolar neozelandes'],
      ['OMR', 'Rial omani'],
      ['PAB', 'Balboa panameno'],
      ['PEN', 'Sol peruano'],
      ['PGK', 'Kina papuana'],
      ['PHP', 'Peso filipino'],
      ['PKR', 'Rupia pakistani'],
      ['PLN', 'Zloty polaco'],
      ['PYG', 'Guarani paraguayo'],
      ['QAR', 'Riyal qatari'],
      ['RON', 'Leu rumano'],
      ['RSD', 'Dinar serbio'],
      ['RUB', 'Rublo ruso'],
      ['RWF', 'Franco ruandes'],
      ['SAR', 'Riyal saudi'],
      ['SBD', 'Dolar salomonense'],
      ['SCR', 'Rupia seychellense'],
      ['SDG', 'Libra sudanesa'],
      ['SEK', 'Corona sueca'],
      ['SGD', 'Dolar singapurense'],
      ['SHP', 'Libra de Santa Elena'],
      ['SLE', 'Leone sierraleones'],
      ['SOS', 'Chelin somali'],
      ['SRD', 'Dolar surinames'],
      ['STN', 'Dobra santotomense'],
      ['SYP', 'Libra siria'],
      ['SZL', 'Lilangeni suazi'],
      ['THB', 'Baht tailandes'],
      ['TJS', 'Somoni tayiko'],
      ['TMT', 'Manat turcomano'],
      ['TND', 'Dinar tunecino'],
      ['TOP', 'Paanga tongano'],
      ['TRY', 'Lira turca'],
      ['TTD', 'Dolar trinitense'],
      ['TWD', 'Nuevo dolar taiwanes'],
      ['TZS', 'Chelin tanzano'],
      ['UAH', 'Grivna ucraniana'],
      ['UGX', 'Chelin ugandes'],
      ['USD', 'Dolar estadounidense'],
      ['UYU', 'Peso uruguayo'],
      ['UZS', 'Som uzbeko'],
      ['VES', 'Bolivar venezolano'],
      ['VND', 'Dong vietnamita'],
      ['VUV', 'Vatu vanuatuense'],
      ['WST', 'Tala samoano'],
      ['XAF', 'Franco CFA de Africa Central'],
      ['XCD', 'Dolar del Caribe Oriental'],
      ['XOF', 'Franco CFA de Africa Occidental'],
      ['XPF', 'Franco CFP'],
      ['YER', 'Rial yemeni'],
      ['ZAR', 'Rand sudafricano'],
      ['ZMW', 'Kwacha zambiano'],
      ['ZWL', 'Dolar zimbabuense']
    ];

    function getCurrencySymbol(code) {
      if (CURRENCY_SYMBOL_OVERRIDES[code]) return CURRENCY_SYMBOL_OVERRIDES[code];

      try {
        const parts = new Intl.NumberFormat('es-DO', {
          style: 'currency',
          currency: code,
          currencyDisplay: 'narrowSymbol',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).formatToParts(0);
        return parts.find(part => part.type === 'currency')?.value || code;
      } catch (error) {
        return code;
      }
    }

    function renderCurrencyOptions(selectedCurrency, searchTerm = '') {
      const selected = selectedCurrency || 'MXN';
      const query = String(searchTerm || '').trim().toLowerCase();
      const matches = getCurrencyMatches(query);
      const hasSelected = matches.some(([code]) => code === selected);
      const options = hasSelected ? matches : WORLD_CURRENCIES.filter(([code]) => code === selected).concat(matches);

      return options.map(([code, name]) => {
        const isSelected = code === selected ? 'selected' : '';
        const currentLabel = !hasSelected && code === selected && query ? ' (actual)' : '';
        return `<option value="${code}" ${isSelected}>${getCurrencySymbol(code)} ${code} - ${name}${currentLabel}</option>`;
      }).join('');
    }

    function getCurrencyMatches(query) {
      return WORLD_CURRENCIES.filter(([code, name]) => {
        if (!query) return true;
        return code.toLowerCase().includes(query) || name.toLowerCase().includes(query);
      });
    }

    function renderCurrencySearchResults(searchTerm) {
      const query = String(searchTerm || '').trim().toLowerCase();
      if (!query) return '';

      const matches = getCurrencyMatches(query).slice(0, 8);
      if (!matches.length) {
        return `<div class="px-3 py-2 text-sm text-slate-500">No se encontro esa moneda</div>`;
      }

      return matches.map(([code, name]) => {
        const symbol = getCurrencySymbol(code);
        return `
          <button type="button" onclick="selectCurrencyResult('${code}')"
            class="w-full px-3 py-2 text-left hover:bg-primary-500/10 text-slate-200 transition-colors flex items-center justify-between gap-3">
            <span class="text-sm">${symbol} ${code} - ${name}</span>
            <span class="text-xs text-primary-400">Seleccionar</span>
          </button>
        `;
      }).join('');
    }

    function filterCurrencyOptions(searchTerm) {
      const select = document.getElementById('configCurrency');
      if (!select) return;
      const selected = select.value || AppState.config.currency || 'MXN';
      select.innerHTML = renderCurrencyOptions(selected, searchTerm);

      const results = document.getElementById('currencySearchResults');
      if (results) {
        const html = renderCurrencySearchResults(searchTerm);
        results.innerHTML = html;
        results.classList.toggle('hidden', !html);
      }
    }

    function selectCurrencyResult(code) {
      const select = document.getElementById('configCurrency');
      const search = document.getElementById('currencySearch');
      const results = document.getElementById('currencySearchResults');
      const match = WORLD_CURRENCIES.find(([currencyCode]) => currencyCode === code);
      if (!select || !match) return;

      select.innerHTML = renderCurrencyOptions(code);
      select.value = code;
      if (search) search.value = `${getCurrencySymbol(code)} ${code} - ${match[1]}`;
      if (results) {
        results.innerHTML = '';
        results.classList.add('hidden');
      }
    }

    function renderSettings(container) {
      const stats = {
        materials: getRecords('material').length,
        entries: getRecords('entry').length,
        clients: getRecords('client').length,
        sales: getRecords('sale').length,
        invoices: getRecords('invoice').length,
        payments: getRecords('payment').length
      };

      const hasLogo = !!AppState.config.company_logo;
      const displayUser = AuthSystem.currentUser?.fullName || AuthSystem.currentUser?.email || 'Cuenta activa';

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in max-w-4xl">
          <div>
            <h2 class="text-2xl font-bold text-slate-100">Configuracion del Sistema</h2>
            <p class="text-slate-500 text-sm mt-1">Personaliza tu ERP y gestiona datos</p>
          </div>

          <div class="glass rounded-xl p-6 border border-primary-500/20">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                <i data-lucide="image" class="w-5 h-5 text-primary-400"></i>
              </div>
              <div>
                <h3 class="font-semibold text-slate-200">Logo de la Empresa</h3>
                <p class="text-sm text-slate-500">Sube el logo para mostrar en facturas y reportes</p>
              </div>
            </div>

            <div class="flex flex-col md:flex-row gap-6 items-start">
              <div class="flex-shrink-0">
                <div id="logoPreviewContainer" class="w-32 h-32 rounded-xl bg-slate-800/50 border-2 ${hasLogo ? 'border-primary-500/50' : 'border-dashed border-slate-600'} flex items-center justify-center overflow-hidden">
                  ${hasLogo 
                    ? `<img id="logoPreview" src="${AppState.config.company_logo}" class="w-full h-full object-contain p-2" alt="Logo preview">`
                    : `<div class="text-center p-4">
                        <i data-lucide="image" class="w-8 h-8 text-slate-600 mx-auto mb-2"></i>
                        <span class="text-xs text-slate-500">Sin logo</span>
                       </div>`
                  }
                </div>
              </div>

              <div class="flex-1 space-y-4">
                <div class="logo-upload-area rounded-xl p-6 text-center cursor-pointer transition-all" 
                     onclick="document.getElementById('logoInput').click()"
                     ondragover="event.preventDefault(); this.classList.add('bg-primary-500/10')"
                     ondragleave="this.classList.remove('bg-primary-500/10')"
                     ondrop="handleLogoDrop(event)">
                  <input type="file" id="logoInput" accept="image/*" class="hidden" onchange="handleLogoSelect(event)">
                  <i data-lucide="upload-cloud" class="w-10 h-10 text-primary-400 mx-auto mb-3"></i>
                  <p class="text-sm text-slate-300 font-medium mb-1">Arrastra una imagen o haz clic para seleccionar</p>
                  <p class="text-xs text-slate-500">PNG, JPG o GIF. Maximo 2MB. Recomendado: 200x200px</p>
                </div>

                ${hasLogo ? `
                  <div class="flex gap-2">
                    <button onclick="removeLogo()" class="flex-1 px-4 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/20 transition-colors text-sm font-medium flex items-center justify-center gap-2">
                      <i data-lucide="trash-2" class="w-4 h-4"></i> Eliminar Logo
                    </button>
                    <button onclick="testLogoPrint()" class="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2">
                      <i data-lucide="printer" class="w-4 h-4"></i> Probar en Impresion
                    </button>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <div class="glass rounded-xl p-6">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                <i data-lucide="building-2" class="w-5 h-5 text-primary-400"></i>
              </div>
              <div>
                <h3 class="font-semibold text-slate-200">Informacion de la Empresa</h3>
                <p class="text-sm text-slate-500">Datos fiscales y de contacto</p>
              </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Nombre de la Empresa</label>
                <input type="text" id="configCompanyName" value="${AppState.config.company_name}"
                  class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 input-focus">
              </div>
              <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">RNC</label>
                  <input type="text" id="configRFC" value="${AppState.config.company_rfc}" placeholder="000000000"
                  class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus uppercase">
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-slate-400 mb-2">Direccion Fiscal</label>
                <input type="text" id="configAddress" value="${AppState.config.company_address}"
                  class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 input-focus">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Telefono</label>
                <input type="tel" id="configPhone" value="${AppState.config.company_phone}"
                  class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 input-focus">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Slogan</label>
                <input type="text" id="configSlogan" value="${AppState.config.company_slogan}"
                  class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 input-focus">
              </div>
            </div>
          </div>

          <div class="glass rounded-xl p-6 border border-primary-500/20">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                <i data-lucide="printer" class="w-5 h-5 text-primary-400"></i>
              </div>
              <div>
                <h3 class="font-semibold text-slate-200">Configuracion de Impresion</h3>
                <p class="text-sm text-slate-500">Selecciona tipo de impresora y opciones</p>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Tipo de Impresora</label>
                <select id="configPrinterType" onchange="updatePrinterOptions()"
                  class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                  <option value="standard" ${AppState.config.printer_type === 'standard' ? 'selected' : ''}>Impresora Estandar (Carta/A4)</option>
                  <option value="thermal_80" ${AppState.config.printer_type === 'thermal_80' ? 'selected' : ''}>Termica 80mm (Ticket)</option>
                  <option value="thermal_58" ${AppState.config.printer_type === 'thermal_58' ? 'selected' : ''}>Termica 58mm (Mini)</option>
                  <option value="pdf" ${AppState.config.printer_type === 'pdf' ? 'selected' : ''}>Solo PDF (Digital)</option>
                  <option value="bluetooth" ${AppState.config.printer_type === 'bluetooth' ? 'selected' : ''}>Bluetooth</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Nombre de Impresora (Opcional)</label>
                <input type="text" id="configPrinterName" value="${AppState.config.printer_name}" placeholder="Ej: EPSON TM-T20"
                  class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 input-focus">
              </div>

              <div class="md:col-span-2 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <label class="block text-sm font-medium text-slate-300 mb-2">Buscador de Impresora</label>
                <div class="flex flex-col md:flex-row gap-3">
                  <div class="relative flex-1">
                    <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"></i>
                    <input type="text" id="configPrinterSearch" oninput="renderPrinterSearchResults()" placeholder="Buscar Bluetooth, Epson, 58mm, 80mm, PDF..."
                      class="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-200 input-focus">
                  </div>
                  <button type="button" onclick="searchBluetoothPrinter()" class="px-4 py-3 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/20 transition-colors text-sm font-medium flex items-center justify-center gap-2">
                    <i data-lucide="bluetooth" class="w-4 h-4"></i> Buscar Bluetooth
                  </button>
                </div>
                <div id="printerSearchResults" class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2"></div>
                <p class="text-xs text-slate-500 mt-3">El navegador muestra los equipos Bluetooth disponibles cuando presionas buscar. Para impresoras instaladas por Windows, usa el modo Estandar y el cuadro normal de impresion.</p>
              </div>

              <div id="bluetoothPrintModeWrap" class="${AppState.config.printer_type === 'bluetooth' ? '' : 'hidden'} md:col-span-2 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <label class="block text-sm font-medium text-blue-200 mb-2">Modo de Impresion por Bluetooth</label>
                <select id="configBluetoothPrintMode" onchange="updatePrinterOptions()"
                  class="w-full px-4 py-3 bg-slate-800/50 border border-blue-500/30 rounded-lg text-slate-200 input-focus select-custom">
                  <option value="standard" ${AppState.config.bluetooth_print_mode === 'standard' ? 'selected' : ''}>Impresora Estandar (Carta/A4)</option>
                  <option value="thermal_80" ${(AppState.config.bluetooth_print_mode || 'thermal_80') === 'thermal_80' ? 'selected' : ''}>Termica 80mm (Ticket)</option>
                  <option value="thermal_58" ${AppState.config.bluetooth_print_mode === 'thermal_58' ? 'selected' : ''}>Termica 58mm (Mini)</option>
                  <option value="pdf" ${AppState.config.bluetooth_print_mode === 'pdf' ? 'selected' : ''}>Solo PDF (Digital)</option>
                </select>
                <p class="text-xs text-blue-200/70 mt-2">Cuando Bluetooth este seleccionado, este formato controla como se genera la factura o recibo.</p>

                <label class="block text-sm font-medium text-blue-200 mt-4 mb-2">Letras Espanolas / Codificacion</label>
                <select id="configBluetoothCharset"
                  class="w-full px-4 py-3 bg-slate-800/50 border border-blue-500/30 rounded-lg text-slate-200 input-focus select-custom">
                  <option value="cp850" ${(AppState.config.bluetooth_charset || 'cp850') === 'cp850' ? 'selected' : ''}>CP850 Espanol / ESC-POS (recomendado)</option>
                  <option value="utf8" ${AppState.config.bluetooth_charset === 'utf8' ? 'selected' : ''}>UTF-8 (solo si tu impresora lo soporta)</option>
                  <option value="cp1252" ${AppState.config.bluetooth_charset === 'cp1252' ? 'selected' : ''}>Windows-1252 Espanol</option>
                  <option value="ascii" ${AppState.config.bluetooth_charset === 'ascii' ? 'selected' : ''}>Compatible sin acentos</option>
                </select>
                <p class="text-xs text-blue-200/70 mt-2">Para recibos con a, e, i, o, u, n,  y  usa CP850. Si tu impresora es moderna y ya imprime bien, puedes probar UTF-8.</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Tamano de Papel</label>
                <select id="configPaperSize"
                  class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                  <option value="letter" ${AppState.config.paper_size === 'letter' ? 'selected' : ''}>Carta (216 x 279 mm)</option>
                  <option value="a4" ${AppState.config.paper_size === 'a4' ? 'selected' : ''}>A4 (210 x 297 mm)</option>
                  <option value="thermal_80" ${AppState.config.paper_size === 'thermal_80' ? 'selected' : ''}>Termica 80mm (Continuo)</option>
                  <option value="thermal_58" ${AppState.config.paper_size === 'thermal_58' ? 'selected' : ''}>Termica 58mm (Continuo)</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Moneda</label>
                <div class="relative mb-2">
                  <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-3.5"></i>
                  <input type="text" id="currencySearch" oninput="filterCurrencyOptions(this.value)" placeholder="Buscar moneda por nombre o codigo..."
                    class="w-full pl-9 pr-3 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                  <div id="currencySearchResults"
                    class="hidden absolute z-30 mt-2 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"></div>
                </div>
                <select id="configCurrency"
                  class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                  ${renderCurrencyOptions(AppState.config.currency)}
                </select>
              </div>
            </div>

            <div class="mt-6 space-y-3">
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" id="configAutoPrint" ${AppState.config.auto_print ? 'checked' : ''}
                  class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-slate-900">
                <div>
                  <div class="text-sm font-medium text-slate-200">Impresion Automatica</div>
                  <div class="text-xs text-slate-500">Imprimir automaticamente despues de cada venta</div>
                </div>
              </label>
            </div>

            <div class="mt-6 flex gap-3">
              <button onclick="testPrint()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm font-medium flex items-center gap-2">
                <i data-lucide="printer-check" class="w-4 h-4"></i> Prueba de Impresion
              </button>
            </div>
          </div>

          <div class="glass rounded-xl p-6 border border-emerald-500/20">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <i data-lucide="percent" class="w-5 h-5 text-emerald-400"></i>
              </div>
              <div>
                <h3 class="font-semibold text-slate-200">Configuracion de IVA</h3>
                <p class="text-sm text-slate-500">Valores por defecto para nuevas ventas</p>
              </div>
            </div>

            <div class="space-y-4">
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" id="configIvaDefaultEnabled" ${AppState.config.iva_default_enabled ? 'checked' : ''}
                  class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900">
                <div>
                  <div class="text-sm font-medium text-slate-200">IVA Habilitado por Defecto</div>
                  <div class="text-xs text-slate-500">Las nuevas ventas incluiran IVA automaticamente</div>
                </div>
              </label>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Porcentaje de IVA por Defecto (%)</label>
                  <input type="number" id="configIvaDefaultRate" value="${AppState.config.iva_default_rate}" min="0" max="100" step="0.01"
                    class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Tasa de Impuesto Anterior (Legacy)</label>
                  <input type="number" id="configTax" value="${AppState.config.tax_rate}" min="0" max="100" step="0.01"
                    class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-400 font-mono input-focus" readonly>
                  <p class="text-xs text-slate-500 mt-1">Mantenido para compatibilidad</p>
                </div>
              </div>
            </div>
          </div>

          <div class="glass rounded-xl p-6 border border-blue-500/20">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <i data-lucide="key-round" class="w-5 h-5 text-blue-400"></i>
              </div>
              <div>
                <h3 class="font-semibold text-slate-200">Cambiar Contrasena</h3>
                <p class="text-sm text-slate-500">Actualiza la contrasena del usuario actual</p>
              </div>
            </div>

            <form onsubmit="changeLoginPassword(event)" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Contrasena actual</label>
                  <input type="password" id="currentLoginPassword" autocomplete="current-password"
                    class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 input-focus">
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Nueva contrasena</label>
                  <input type="password" id="newLoginPassword" minlength="6" autocomplete="new-password"
                    class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 input-focus">
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Confirmar contrasena</label>
                  <input type="password" id="confirmLoginPassword" minlength="6" autocomplete="new-password"
                    class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 input-focus">
                </div>
              </div>
              <div class="flex justify-end">
                <button type="submit" class="px-5 py-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-lg transition-colors flex items-center gap-2">
                  <i data-lucide="key-round" class="w-4 h-4"></i> Cambiar Contrasena
                </button>
              </div>
            </form>
          </div>

          <div class="glass rounded-xl p-6">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <i data-lucide="database" class="w-5 h-5 text-blue-400"></i>
              </div>
              <div>
                <h3 class="font-semibold text-slate-200">Almacenamiento</h3>
                <p class="text-sm text-slate-500">Uso de la base de datos por usuario</p>
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
              ${Object.entries(stats).map(([key, val]) => `
                <div class="bg-slate-800/30 rounded-lg p-3 text-center border border-slate-700/50">
                  <div class="text-lg font-bold text-primary-400 font-mono">${val}</div>
                  <div class="text-xs text-slate-500 capitalize">${key}</div>
                </div>
              `).join('')}
            </div>

            <div class="mt-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div class="flex justify-between text-sm mb-2">
                <span class="text-slate-400">Registros guardados</span>
                <span class="font-mono text-primary-400">${AppState.data.length}</span>
              </div>
              <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-500" style="width: 100%"></div>
              </div>
              <p class="text-xs text-slate-500 mt-2">${AppState.data.length} registros sin limite configurado - Usuario: ${escapeHtml(displayUser)}</p>
            </div>

            <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <button onclick="forceUploadToCloud()" class="px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg hover:bg-emerald-500/20 transition-colors text-sm font-medium flex items-center justify-center gap-2">
                <i data-lucide="upload-cloud" class="w-4 h-4"></i> Subir a la nube
              </button>
              <button onclick="refreshData()" class="px-4 py-3 bg-slate-800/70 border border-slate-700 text-slate-200 rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium flex items-center justify-center gap-2">
                <i data-lucide="cloud-download" class="w-4 h-4"></i> Bajar de la nube
              </button>
            </div>
            <p class="text-xs text-slate-500 mt-3">Sube los datos de este dispositivo o baja la version guardada en la nube para esta cuenta.</p>
          </div>

          <div class="flex justify-end">
            <button onclick="saveAllSettings()" class="px-6 py-3 bg-primary-500 hover:bg-primary-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20 flex items-center gap-2">
              <i data-lucide="save" class="w-5 h-5"></i> Guardar Configuracion
            </button>
          </div>
        </div>
      `;

      setTimeout(renderPrinterSearchResults, 0);
    }

    async function changeLoginPassword(event) {
      event.preventDefault();

      const currentPasswordEl = document.getElementById('currentLoginPassword');
      const newPasswordEl = document.getElementById('newLoginPassword');
      const confirmPasswordEl = document.getElementById('confirmLoginPassword');

      const result = await AuthSystem.changePassword(
        currentPasswordEl?.value || '',
        newPasswordEl?.value || '',
        confirmPasswordEl?.value || ''
      );

      showToast(result.message, result.success ? 'success' : 'error');

      if (result.success) {
        currentPasswordEl.value = '';
        newPasswordEl.value = '';
        confirmPasswordEl.value = '';
      }
    }

    function handleLogoSelect(event) {
      const file = event.target.files[0];
      if (file) processLogoFile(file);
    }

    function handleLogoDrop(event) {
      event.preventDefault();
      event.currentTarget.classList.remove('bg-primary-500/10');
      const file = event.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        processLogoFile(file);
      } else {
        showToast('Por favor sube solo archivos de imagen', 'error');
      }
    }

    function processLogoFile(file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('El logo no debe superar los 2MB', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          const maxSize = 400;
          
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height / width) * maxSize;
              width = maxSize;
            } else {
              width = (width / height) * maxSize;
              height = maxSize;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          
          AppState.config.company_logo = compressedDataUrl;
          updateLogoDisplay();
          renderPage();
          showToast('Logo cargado correctamente');
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function removeLogo() {
      if (confirm('Estas seguro de eliminar el logo?')) {
        AppState.config.company_logo = '';
        updateLogoDisplay();
        renderPage();
        showToast('Logo eliminado');
      }
    }

    function testLogoPrint() {
      if (!AppState.config.company_logo) {
        showToast('No hay logo configurado', 'error');
        return;
      }
      
      openPrintDocument(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Prueba de Logo</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
              .logo-container { margin-bottom: 30px; }
              .logo-container img { max-width: 200px; max-height: 100px; }
              .info { color: #666; margin-top: 20px; }
            </style>
          <base target="_blank">
</head>
          <body onload="window.print();">
            <h2>Prueba de Impresion de Logo</h2>
            <div class="logo-container">
              <img src="${AppState.config.company_logo}" alt="Logo de ${AppState.config.company_name}">
            </div>
            <div class="info">
              <p><strong>${AppState.config.company_name}</strong></p>
              <p>${AppState.config.company_slogan}</p>
            </div>
          </body>
        </html>
      `, { autoClose: false, blockedMessage: 'Permite ventanas emergentes para probar la impresion del logo' });
    }

    function getPrinterSearchOptions() {
      const configuredName = (AppState.config.printer_name || '').trim();
      const savedOption = configuredName ? [{
        name: configuredName,
        description: 'Impresora guardada actualmente',
        printerType: AppState.config.printer_type || 'standard',
        bluetoothMode: AppState.config.bluetooth_print_mode || 'thermal_80',
        printerName: configuredName
      }] : [];

      return [
        ...savedOption,
        { name: 'Bluetooth termica 80mm', description: 'Ticket Bluetooth ancho para recibos', printerType: 'bluetooth', bluetoothMode: 'thermal_80', printerName: configuredName || 'Bluetooth 80mm' },
        { name: 'Bluetooth termica 58mm', description: 'Ticket Bluetooth mini', printerType: 'bluetooth', bluetoothMode: 'thermal_58', printerName: configuredName || 'Bluetooth 58mm' },
        { name: 'Bluetooth estandar Carta/A4', description: 'Bluetooth usando formato de hoja', printerType: 'bluetooth', bluetoothMode: 'standard', printerName: configuredName || 'Bluetooth Estandar' },
        { name: 'Bluetooth PDF', description: 'Genera PDF para compartir o imprimir por Bluetooth', printerType: 'bluetooth', bluetoothMode: 'pdf', printerName: configuredName || 'Bluetooth PDF' },
        { name: 'EPSON TM-T20 / TM-T88 80mm', description: 'Formato termico 80mm', printerType: 'thermal_80', bluetoothMode: 'thermal_80', printerName: 'EPSON TM-T20' },
        { name: 'POS 80 / Generic 80mm', description: 'Formato termico 80mm', printerType: 'thermal_80', bluetoothMode: 'thermal_80', printerName: 'POS 80' },
        { name: 'POS 58 / Generic 58mm', description: 'Formato termico 58mm', printerType: 'thermal_58', bluetoothMode: 'thermal_58', printerName: 'POS 58' },
        { name: 'Impresora instalada de Windows', description: 'Abre el cuadro normal de impresion', printerType: 'standard', bluetoothMode: 'standard', printerName: configuredName || 'Impresora de Windows' },
        { name: 'PDF digital', description: 'Descarga facturas y recibos en PDF', printerType: 'pdf', bluetoothMode: 'pdf', printerName: configuredName || 'PDF' }
      ];
    }

    function renderPrinterSearchResults() {
      const results = document.getElementById('printerSearchResults');
      if (!results) return;

      const query = (document.getElementById('configPrinterSearch')?.value || '').trim().toLowerCase();
      const options = getPrinterSearchOptions()
        .filter(opt => !query || `${opt.name} ${opt.description} ${opt.printerType} ${opt.bluetoothMode} ${opt.printerName}`.toLowerCase().includes(query))
        .slice(0, 8);

      if (options.length === 0) {
        results.innerHTML = `<div class="md:col-span-2 px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700 text-sm text-slate-500">No se encontraron impresoras o tipos con ese nombre.</div>`;
        return;
      }

      results.innerHTML = options.map(opt => `
        <button type="button" onclick="selectPrinterSearchOption('${opt.printerType}', '${opt.bluetoothMode}', '${String(opt.printerName).replace(/'/g, "\\'")}')"
          class="text-left px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700 hover:border-primary-500/40 hover:bg-primary-500/10 transition-colors">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium text-slate-200">${opt.name}</span>
            <span class="text-[10px] uppercase tracking-wide text-primary-300">${getPrinterModeLabel(opt.printerType === 'bluetooth' ? opt.bluetoothMode : opt.printerType)}</span>
          </div>
          <div class="text-xs text-slate-500 mt-1">${opt.description}</div>
        </button>
      `).join('');

      if (window.lucide) lucide.createIcons();
    }

    function selectPrinterSearchOption(printerType, bluetoothMode, printerName) {
      const printerTypeSelect = document.getElementById('configPrinterType');
      const bluetoothModeSelect = document.getElementById('configBluetoothPrintMode');
      const printerNameInput = document.getElementById('configPrinterName');

      if (printerTypeSelect) printerTypeSelect.value = printerType;
      if (bluetoothModeSelect) bluetoothModeSelect.value = bluetoothMode || 'thermal_80';
      if (printerNameInput && printerName) printerNameInput.value = printerName;

      updatePrinterOptions();
      renderPrinterSearchResults();
      showToast(`Impresora seleccionada: ${printerName || getPrinterModeLabel(printerType)}`);
    }

    const BluetoothPrinter = {
      device: null,
      characteristic: null,

      optionalServices: [
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '000018f0-0000-1000-8000-00805f9b34fb',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455'
      ],

      async selectDevice() {
        if (!navigator.bluetooth || !navigator.bluetooth.requestDevice) {
          throw new Error('Bluetooth no disponible en este navegador');
        }

        this.device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: this.optionalServices
        });

        return this.device;
      },

      async connect() {
        if (!this.device) {
          await this.selectDevice();
        }

        if (!this.device.gatt) {
          throw new Error('La impresora no expone conexion Bluetooth compatible');
        }

        const server = await this.device.gatt.connect();
        const services = await server.getPrimaryServices();

        for (const service of services) {
          const characteristics = await service.getCharacteristics();
          const writable = characteristics.find(ch => ch.properties.write || ch.properties.writeWithoutResponse);
          if (writable) {
            this.characteristic = writable;
            return writable;
          }
        }

        throw new Error('No se encontro canal de escritura para imprimir');
      },

      async writeBytes(bytes) {
        if (!this.characteristic) {
          await this.connect();
        }

        const chunkSize = 180;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.slice(i, i + chunkSize);
          if (this.characteristic.properties.writeWithoutResponse && this.characteristic.writeValueWithoutResponse) {
            await this.characteristic.writeValueWithoutResponse(chunk);
          } else {
            await this.characteristic.writeValue(chunk);
          }
          await new Promise(resolve => setTimeout(resolve, 35));
        }
      },

      encodeSpanishEscPos(text) {
        const cp850 = {
          'C': 128, 'u': 129, 'e': 130, 'a': 131, 'a': 132, 'a': 133, 'a': 134, 'c': 135,
          'e': 136, 'e': 137, 'e': 138, 'i': 139, 'i': 140, 'i': 141, 'A': 142, 'A': 143,
          'E': 144, 'ae': 145, 'AE': 146, 'o': 147, 'o': 148, 'o': 149, 'u': 150, 'u': 151,
          'y': 152, 'O': 153, 'U': 154, 'o': 155, 'GBP': 156, 'O': 157, 'O': 158, 'f': 159,
          'a': 160, 'i': 161, 'o': 162, 'u': 163, 'n': 164, 'N': 165, 'a': 166, 'o': 167,
          '': 168, '': 169, '': 170, '1/2': 171, '1/4': 172, '': 173, '': 174, '': 175,
          'A': 181, 'A': 182, 'A': 183, '(c)': 184, 'I': 214, 'O': 224, 'U': 233
        };

        const bytes = [];
        for (const char of String(text || '')) {
          const code = char.charCodeAt(0);
          if (code <= 127) {
            bytes.push(code);
          } else if (cp850[char] !== undefined) {
            bytes.push(cp850[char]);
          } else {
            const fallback = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const fallbackCode = fallback.charCodeAt(0);
            bytes.push(fallbackCode <= 127 ? fallbackCode : 63);
          }
        }
        return new Uint8Array(bytes);
      },

      sanitizeBluetoothText(text) {
        return String(text || '')
          .replace(/[\u00a0\u1680\u180e\u2000-\u200d\u202f\u205f\u2060\u3000\ufeff]/g, ' ')
          .replace(/[^\S\r\n\t ]+/g, ' ')
          .replace(/RD\$\s+/g, 'RD$')
          .replace(/\$\s+/g, '$');
      },

      stripSpanishMarks(text) {
        return this.sanitizeBluetoothText(text)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      },

      encodeBluetoothText(text) {
        const charset = AppState.config.bluetooth_charset || 'cp850';
        const cleanText = this.sanitizeBluetoothText(text);

        if (charset === 'utf8') {
          return new TextEncoder().encode(cleanText);
        }

        if (charset === 'ascii') {
          return new TextEncoder().encode(this.stripSpanishMarks(cleanText));
        }

        if (charset === 'cp1252') {
          const bytes = [];
          for (const char of cleanText) {
            const code = char.charCodeAt(0);
            bytes.push(code <= 255 ? code : 63);
          }
          return new Uint8Array(bytes);
        }

        return this.encodeSpanishEscPos(cleanText);
      },

      charsetCommand() {
        const charset = AppState.config.bluetooth_charset || 'cp850';
        if (charset === 'cp850') return '\x1bt\x02';
        if (charset === 'cp1252') return '\x1bt\x10';
        return '';
      },

      concatBytes(parts) {
        const totalLength = parts.reduce((sum, part) => sum + (part?.length || 0), 0);
        const output = new Uint8Array(totalLength);
        let offset = 0;
        parts.forEach(part => {
          if (!part?.length) return;
          output.set(part, offset);
          offset += part.length;
        });
        return output;
      },

      async logoImageBytes() {
        const logo = AppState.config.company_logo;
        if (!logo) return new Uint8Array();

        try {
          const img = new Image();
          img.decoding = 'async';
          img.src = logo;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });

          const bluetoothMode = AppState.config.bluetooth_print_mode || 'thermal_80';
          const maxWidth = bluetoothMode === 'thermal_58' ? 288 : 384;
          const targetWidth = Math.min(maxWidth, bluetoothMode === 'thermal_58' ? 220 : 300);
          const scale = Math.min(1, targetWidth / Math.max(1, img.naturalWidth || img.width));
          const width = Math.max(8, Math.floor((img.naturalWidth || img.width) * scale));
          const height = Math.max(8, Math.floor((img.naturalHeight || img.height) * scale));
          const bytesPerRow = Math.ceil(width / 8);

          const canvas = document.createElement('canvas');
          canvas.width = bytesPerRow * 8;
          canvas.height = height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return new Uint8Array();

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, Math.floor((canvas.width - width) / 2), 0, width, height);

          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const raster = new Uint8Array(bytesPerRow * height);
          for (let y = 0; y < height; y++) {
            for (let xByte = 0; xByte < bytesPerRow; xByte++) {
              let value = 0;
              for (let bit = 0; bit < 8; bit++) {
                const x = xByte * 8 + bit;
                const idx = (y * canvas.width + x) * 4;
                const alpha = pixels[idx + 3];
                const luminance = (pixels[idx] * 0.299) + (pixels[idx + 1] * 0.587) + (pixels[idx + 2] * 0.114);
                if (alpha > 40 && luminance < 180) value |= 0x80 >> bit;
              }
              raster[y * bytesPerRow + xByte] = value;
            }
          }

          return this.concatBytes([
            this.encodeBluetoothText('\x1ba\x01'),
            new Uint8Array([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff]),
            raster
          ]);
        } catch (error) {
          console.warn('No se pudo preparar el logo para Bluetooth:', error);
          return new Uint8Array();
        }
      },

      async buildThermalBytes(text) {
        const logoBytes = await this.logoImageBytes();
        if (!logoBytes.length) return this.encodeBluetoothText(text);

        return this.concatBytes([
          this.encodeBluetoothText('\x1b@' + this.charsetCommand() + '\x1ba\x01'),
          logoBytes,
          this.encodeBluetoothText(String(text || ''))
        ]);
      },

      async buildInvoiceBytes(invoice) {
        const logoBytes = await this.logoImageBytes();
        const text = this.buildInvoiceText(invoice, {
          logoPrinted: logoBytes.length > 0,
          skipInit: logoBytes.length > 0
        });
        if (!logoBytes.length) return this.encodeBluetoothText(text);

        return this.concatBytes([
          this.encodeBluetoothText('\x1b@' + this.charsetCommand() + '\x1ba\x01'),
          logoBytes,
          this.encodeBluetoothText(text)
        ]);
      },

      buildInvoiceText(invoice, options = {}) {
        const bluetoothMode = AppState.config.bluetooth_print_mode || 'thermal_80';
        const lineWidth = bluetoothMode === 'thermal_58' ? 32 : 42;
        const line = '-'.repeat(lineWidth);
        const thickLine = '='.repeat(lineWidth);
        const center = (text = '') => {
          text = String(text).trim();
          if (text.length >= lineWidth) return text;
          const pad = Math.floor((lineWidth - text.length) / 2);
          return ' '.repeat(pad) + text;
        };
        const item = (left = '', right = '') => {
          left = String(left);
          right = String(right);
          const space = Math.max(1, lineWidth - left.length - right.length);
          return left + ' '.repeat(space) + right;
        };
        const wrap = (text = '') => {
          text = String(text || '');
          const out = [];
          for (let i = 0; i < text.length; i += lineWidth) {
            out.push(text.slice(i, i + lineWidth));
          }
          return out;
        };
        const wordWrap = (text = '') => {
          const words = String(text || '').trim().split(/\s+/).filter(Boolean);
          const lines = [];
          let current = '';
          words.forEach(word => {
            if (!current) {
              current = word;
            } else if ((current + ' ' + word).length <= lineWidth) {
              current += ' ' + word;
            } else {
              lines.push(current);
              current = word;
            }
          });
          if (current) lines.push(current);
          return lines.length ? lines : [''];
        };
        const labelBlock = (label, value) => {
          const valueLines = wordWrap(value || '');
          return [
            '\x1bE\x01' + label + '\x1bE\x00',
            ...valueLines
          ];
        };
        const invoiceItems = getInvoiceItems(invoice);
        const invoiceNote = getInvoiceNote(invoice);
        const noteRows = invoiceNote ? [
          line,
          ...labelBlock('NOTA', invoiceNote)
        ] : [];
        const itemRows = invoiceItems.flatMap((saleItem, index) => [
          index > 0 ? line : '',
          '\x1bE\x01' + (saleItem.material_name || '').toUpperCase() + '\x1bE\x00',
          item('Cantidad:', fmt.quantity(saleItem.quantity)),
          item('Precio:', fmt.currency(saleItem.price)),
          item('Importe:', fmt.currency(saleItem.subtotal || ((saleItem.quantity || 0) * (saleItem.price || 0))))
        ]).filter(Boolean);

        const isCredito = invoice.payment_type === 'credito';
        const creditSale = AppState.data.find(r => r.type === 'sale' && r.invoice_number === invoice.invoice_number);
        const creditPayments = creditSale ? getRecords('payment').filter(payment => payment.sale_id === creditSale.__backendId) : [];
        const creditAmountPaid = creditPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
        const creditRemaining = Math.max(0, (creditSale?.sale_total || invoice.sale_total || 0) - creditAmountPaid);
        const isPagada = invoice.payment_status === 'pagada' || (isCredito && creditAmountPaid > 0 && creditRemaining <= 0);
        let mensajeAgradecimiento = '';
        let mensajeEstado = '';

        if (isCredito) {
          if (isPagada) {
            mensajeAgradecimiento = '** GRACIAS POR SU PAGO **';
            mensajeEstado = '** PAGO COMPLETADO **';
          } else {
            mensajeAgradecimiento = '** GRACIAS POR SU COMPRA A CREDITO **';
            mensajeEstado = '** PAGO A CREDITO - PENDIENTE **';
          }
        } else {
          mensajeAgradecimiento = '** GRACIAS POR SU PAGO **';
          mensajeEstado = '** PAGADO **';
        }

        const subtotal = invoice.subtotal || (invoice.sale_total - (invoice.tax || 0));
        const ivaSection = invoice.iva_enabled ? [
          item('Subtotal:', fmt.currency(subtotal)),
          item('IVA (' + invoice.iva_rate + '%):', fmt.currency(invoice.tax || 0))
        ] : [
          item('Subtotal:', fmt.currency(invoice.sale_total))
        ];

        const initRows = options.skipInit ? [] : [
          '\x1b@',
          this.charsetCommand()
        ];
        const headerRows = [
          '\x1ba\x01',
          '\x1b!\x00',
          options.logoPrinted ? '' : '\x1d!\x01',
          options.logoPrinted ? '' : '\x1bE\x01' + center(AppState.config.company_name || '') + '\x1bE\x00',
          options.logoPrinted ? '' : '\x1d!\x00',
          AppState.config.company_slogan ? center(AppState.config.company_slogan) : '',
          AppState.config.company_rfc ? center('RNC: ' + AppState.config.company_rfc) : ''
        ].filter(Boolean);

        const rows = [
          ...initRows,
          ...headerRows,
          thickLine,
          '\x1bE\x01FACTURA\x1bE\x00',
          center(invoice.invoice_number || ''),
          center(fmt.dateTime(invoice.date)),
          center(mensajeEstado.replace(/\*/g, '')),
          thickLine,
          '\x1ba\x00',
          ...labelBlock('CLIENTE', invoice.client_name || ''),
          invoice.vehicle_plate ? item('Placa:', invoice.vehicle_plate) : '',
          ...noteRows,
          line,
          '\x1bE\x01DETALLE\x1bE\x00',
          ...itemRows,
          ...ivaSection,
          thickLine,
          '\x1ba\x01',
          '\x1d!\x11',
          '\x1bE\x01TOTAL\x1bE\x00',
          fmt.currency(invoice.sale_total),
          '\x1d!\x00',
          isCredito ? item('Abonado:', fmt.currency(creditAmountPaid)) : '',
          isCredito ? item('Falta por pagar:', fmt.currency(creditRemaining)) : '',
          thickLine,
          '\x1ba\x01',
          center(mensajeEstado),
          '',
          center(mensajeAgradecimiento),
          AppState.config.company_phone ? 'Tel: ' + AppState.config.company_phone : '',
          '\n\n\n',
          '\x1dV\x42\x00'
        ].filter(Boolean);

        return rows.join('\n');
      },

      helpers() {
        const bluetoothMode = AppState.config.bluetooth_print_mode || 'thermal_80';
        const lineWidth = bluetoothMode === 'thermal_58' ? 32 : 42;
        const line = '-'.repeat(lineWidth);
        const thickLine = '='.repeat(lineWidth);
        const center = (text = '') => {
          text = String(text || '').trim();
          if (text.length >= lineWidth) return text;
          const pad = Math.floor((lineWidth - text.length) / 2);
          return ' '.repeat(pad) + text;
        };
        const item = (left = '', right = '') => {
          left = String(left || '');
          right = String(right || '');
          const space = Math.max(1, lineWidth - left.length - right.length);
          return left + ' '.repeat(space) + right;
        };
        const wrap = (text = '') => {
          text = String(text || '');
          const out = [];
          for (let i = 0; i < text.length; i += lineWidth) out.push(text.slice(i, i + lineWidth));
          return out;
        };
        const wordWrap = (text = '') => {
          const words = String(text || '').trim().split(/\s+/).filter(Boolean);
          const lines = [];
          let current = '';
          words.forEach(word => {
            if (!current) current = word;
            else if ((current + ' ' + word).length <= lineWidth) current += ' ' + word;
            else {
              lines.push(current);
              current = word;
            }
          });
          if (current) lines.push(current);
          return lines.length ? lines : [''];
        };
        const section = (title, lines = []) => [
          thickLine,
          '\x1bE\x01' + title + '\x1bE\x00',
          ...lines.filter(Boolean)
        ];
        const totalBlock = (label, value) => [
          thickLine,
          '\x1ba\x01',
          '\x1d!\x11',
          '\x1bE\x01' + label + '\x1bE\x00',
          value,
          '\x1d!\x00',
          '\x1ba\x00',
          thickLine
        ];
        return { lineWidth, line, thickLine, center, item, wrap, wordWrap, section, totalBlock };
      },

      thermalHeader(title, subtitle = '') {
        const h = this.helpers();
        const hasLogo = !!AppState.config.company_logo;
        return [
          '\x1b@',
          this.charsetCommand(),
          '\x1ba\x01',
          '\x1b!\x00',
          hasLogo ? '' : '\x1d!\x01',
          hasLogo ? '' : '\x1bE\x01' + h.center(AppState.config.company_name || '') + '\x1bE\x00',
          hasLogo ? '' : '\x1d!\x00',
          h.center(AppState.config.company_slogan || ''),
      AppState.config.company_rfc ? h.center('RNC: ' + AppState.config.company_rfc) : '',
          h.thickLine,
          '\x1bE\x01' + h.center(title) + '\x1bE\x00',
          subtitle ? h.center(subtitle) : '',
          h.thickLine,
          '\x1ba\x00'
        ].filter(Boolean);
      },

      thermalFooter(message = 'GRACIAS') {
        const h = this.helpers();
        return [
          h.thickLine,
          '\x1ba\x01',
          h.center(message),
          AppState.config.company_phone ? 'Tel: ' + AppState.config.company_phone : '',
          '\n\n\n',
          '\x1dV\x42\x00'
        ].filter(Boolean);
      },

      buildPaymentReceiptText(paymentId) {
        const h = this.helpers();
        const payment = AppState.data.find(r => r.__backendId === paymentId);
        if (!payment) return '';
        const sale = AppState.data.find(r => r.__backendId === payment.sale_id);
        const allPayments = getRecords('payment').filter(p => p.sale_id === payment.sale_id);
        const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
        const remainingBalance = Math.max(0, (sale?.sale_total || 0) - totalPaid);
        const isFullPayment = payment.is_full_payment || remainingBalance <= 0;
        const receiptTitle = isFullPayment ? 'RECIBO DE PAGO TOTAL' : 'RECIBO DE ABONO';

        return [
          ...this.thermalHeader(receiptTitle, isFullPayment ? 'LIQUIDACION COMPLETA' : 'ABONO PARCIAL'),
          ...h.section('RECIBO', [
            'Fecha: ' + fmt.dateTime(payment.date),
            'No: ' + payment.__backendId.replace('pay_', isFullPayment ? 'TOT-' : 'ABO-')
          ]),
          ...h.section('CLIENTE', h.wordWrap(payment.client_name || '')),
          ...h.section('DETALLE', [
            'Factura: ' + payment.invoice_number,
            'Metodo: ' + String(payment.method || '').toUpperCase()
          ]),
          payment.notes ? 'Nota: ' + payment.notes : '',
          ...h.totalBlock(isFullPayment ? 'PAGO TOTAL' : 'ABONO', fmt.currency(payment.amount)),
          !isFullPayment ? h.item('Falta por pagar:', fmt.currency(remainingBalance)) : 'DEUDA LIQUIDADA COMPLETAMENTE',
          !isFullPayment ? h.item('Total factura:', fmt.currency(sale?.sale_total || 0)) : '',
          !isFullPayment ? h.item('Pagado:', fmt.currency(totalPaid)) : '',
          ...this.thermalFooter(isFullPayment ? 'PAGO COMPLETADO' : 'ABONO REGISTRADO')
        ].filter(Boolean).join('\n');
      },

      buildMultiplePaymentText(selectedSales, total, method, notes) {
        const h = this.helpers();
        return [
          ...this.thermalHeader('RECIBO PAGO MULTIPLE'),
          ...h.section('CLIENTE', h.wordWrap(selectedSales[0]?.sale?.client_name || '')),
          ...h.section('PAGO', [
            'Fecha: ' + fmt.dateTime(new Date().toISOString()),
            'Metodo: ' + String(method || '').toUpperCase()
          ]),
          notes ? 'Nota: ' + notes : '',
          ...h.section('FACTURAS PAGADAS'),
          ...selectedSales.flatMap(item => [
            h.item(item.sale.invoice_number, fmt.currency(item.remaining)),
            ...h.wordWrap(item.sale.material_name || '')
          ]),
          ...h.totalBlock('TOTAL', fmt.currency(total)),
          ...this.thermalFooter('GRACIAS POR SU PAGO')
        ].filter(Boolean).join('\n');
      },

      buildDirectTripInvoiceText(trip) {
        const h = this.helpers();
        const remaining = (trip.trip_amount || 0) - (trip.amount_paid || 0);
        const paymentStatus = trip.payment_status === 'pagado' ? 'PAGADO' : remaining > 0 && trip.amount_paid > 0 ? 'PARCIAL' : 'PENDIENTE';
        return [
          ...this.thermalHeader('FACTURA VIAJE DIRECTO', trip.invoice_number),
          h.center(paymentStatus),
          ...h.section('FECHA', ['Fecha: ' + fmt.dateTime(trip.date)]),
          ...h.section('COMPANIA ORIGEN', h.wordWrap(trip.source_company || '')),
          ...h.section('INFORMACION DEL VIAJE', [
            h.item('Chofer:', trip.driver_name),
            h.item('Vehiculo:', trip.vehicle_plate),
            h.item('Metros3:', fmt.number(trip.meters, 2))
          ]),
          ...h.section('DESTINO', h.wordWrap(trip.destination_client || '')),
          ...h.totalBlock('TOTAL', fmt.currency(trip.trip_amount)),
          trip.amount_paid > 0 ? h.item('Pagado:', fmt.currency(trip.amount_paid)) : '',
          trip.amount_paid > 0 ? h.item('Restante:', fmt.currency(remaining)) : '',
          trip.notes ? h.thickLine : '',
          trip.notes ? 'Notas: ' + trip.notes : '',
          ...this.thermalFooter('DOCUMENTO GENERADO')
        ].filter(Boolean).join('\n');
      },

      buildDirectTripPaymentText(trip, amount, method, notes) {
        const h = this.helpers();
        const remaining = (trip.trip_amount || 0) - (trip.amount_paid || 0);
        const isFullyPaid = remaining <= 0;
        return [
          ...this.thermalHeader(isFullyPaid ? 'RECIBO PAGO TOTAL' : 'RECIBO ABONO VIAJE'),
          ...h.section('RECIBO', [
            'Fecha: ' + fmt.dateTime(new Date().toISOString()),
            'Factura: ' + trip.invoice_number,
            'Metodo: ' + String(method || '').toUpperCase()
          ]),
          ...h.section('CLIENTE', h.wordWrap(trip.destination_client || '')),
          notes ? 'Nota: ' + notes : '',
          ...h.totalBlock(isFullyPaid ? 'PAGO' : 'ABONO', fmt.currency(amount)),
          h.item('Total viaje:', fmt.currency(trip.trip_amount)),
          h.item('Pagado:', fmt.currency(trip.amount_paid || 0)),
          h.item('Restante:', fmt.currency(remaining)),
          ...this.thermalFooter(isFullyPaid ? 'PAGO COMPLETADO' : 'ABONO REGISTRADO')
        ].filter(Boolean).join('\n');
      },

      buildFuelReceiptText(id) {
        const h = this.helpers();
        const r = AppState.data.find(x => x.__backendId === id);
        if (!r) return '';
        const totals = getFuelTotals();
        return [
          ...this.thermalHeader('RECIBO DESPACHO GASOL', r.__backendId.replace('fuel_dispatch_', 'GAS-')),
          ...h.section('DATOS', [
            'Fecha: ' + fmt.dateTime(r.date),
            'Nombre: ' + fuelSafe(r.name),
            r.odometer ? 'Horometro: ' + fuelSafe(r.odometer) : '',
            'Placa: ' + fuelSafe(fuelPlate(r)),
            'Modelo: ' + fuelSafe(fuelVehicleModel(r))
          ]),
          ...h.section('DIRECCION', h.wordWrap(fuelSafe(r.address))),
          ...h.totalBlock('CANTIDAD', fmt.number(r.quantity, 2) + ' G'),
          h.center('Disponible: ' + fmt.number(totals.remaining, 2) + ' G'),
          h.thickLine,
          '',
          '',
          '____________________________',
          h.center('Firma de recibido'),
          ...this.thermalFooter('')
        ].filter(Boolean).join('\n');
      },

      buildDailyMetersReportText() {
        const h = this.helpers();
        const sales = getRecords('sale');
        const dailyData = {};
        sales.forEach(s => {
          const day = s.date ? s.date.split('T')[0] : 'sin-fecha';
          if (!dailyData[day]) dailyData[day] = { transactions: [], totalMeters: 0, totalAmount: 0 };
          dailyData[day].transactions.push(s);
          dailyData[day].totalMeters += (s.sale_quantity || 0);
          dailyData[day].totalAmount += (s.sale_total || 0);
        });

        const rows = [
          ...this.thermalHeader('REPORTE METROS DIARIOS'),
          'Fecha: ' + fmt.dateTime(new Date().toISOString()),
          h.line
        ];

        Object.entries(dailyData).sort((a, b) => b[0].localeCompare(a[0])).forEach(([day, data]) => {
          rows.push('\x1bE\x01' + day + '\x1bE\x00');
          rows.push(h.item('Metros:', fmt.number(data.totalMeters, 2)));
          rows.push(h.item('Monto:', fmt.currency(data.totalAmount)));
          rows.push(h.thickLine);
          data.transactions.forEach(s => {
            rows.push(h.line);
            rows.push(String(s.invoice_number || ''));
            rows.push(...h.wordWrap((s.client_name || '') + ' - ' + (s.material_name || '')));
            rows.push(h.item(fmt.number(s.sale_quantity, 2), fmt.currency(s.sale_total || 0)));
          });
          rows.push(h.thickLine);
        });

        rows.push(...this.thermalFooter('FIN DEL REPORTE'));
        return rows.filter(Boolean).join('\n');
      },

      async printText(text) {
        await this.writeBytes(await this.buildThermalBytes(text));
      },

      async printInvoice(invoice) {
        await this.writeBytes(await this.buildInvoiceBytes(invoice));
      }
    };

    async function searchBluetoothPrinter() {
      if (!navigator.bluetooth || !navigator.bluetooth.requestDevice) {
        showToast('Este navegador no permite buscar dispositivos Bluetooth desde la pagina', 'error');
        return;
      }

      try {
        const device = await BluetoothPrinter.selectDevice();
        if (!device) return;

        const printerTypeSelect = document.getElementById('configPrinterType');
        const bluetoothModeSelect = document.getElementById('configBluetoothPrintMode');
        const printerNameInput = document.getElementById('configPrinterName');

        if (printerTypeSelect) printerTypeSelect.value = 'bluetooth';
        if (bluetoothModeSelect && !bluetoothModeSelect.value) bluetoothModeSelect.value = AppState.config.bluetooth_print_mode || 'thermal_80';
        if (printerNameInput) printerNameInput.value = device.name || device.id || 'Impresora Bluetooth';

        updatePrinterOptions();
        renderPrinterSearchResults();
        await BluetoothPrinter.connect();
        showToast('Bluetooth conectado. Guarda la configuracion.');
      } catch (err) {
        showToast('Bluetooth seleccionado, pero no se pudo abrir el canal directo de impresion', 'warning');
      }
    }

    function updatePrinterOptions() {
      const type = document.getElementById('configPrinterType').value;
      const bluetoothModeSelect = document.getElementById('configBluetoothPrintMode');
      const bluetoothWrap = document.getElementById('bluetoothPrintModeWrap');
      const paperSelect = document.getElementById('configPaperSize');
      const effectiveType = type === 'bluetooth' ? (bluetoothModeSelect?.value || 'thermal_80') : type;

      if (bluetoothWrap) {
        bluetoothWrap.classList.toggle('hidden', type !== 'bluetooth');
      }
      
      if (effectiveType === 'thermal_80') {
        paperSelect.value = 'thermal_80';
      } else if (effectiveType === 'thermal_58') {
        paperSelect.value = 'thermal_58';
      } else if (effectiveType === 'standard' || effectiveType === 'pdf') {
        paperSelect.value = 'letter';
      }
    }

    function testPrint() {
      const testData = {
        invoice_number: 'TEST-001',
        client_name: 'Cliente de Prueba',
        vehicle_plate: 'TEST-1234',
        material_name: 'Material Test',
        quantity: 1,
        price: 100,
        subtotal: 100,
        tax: 16,
        sale_total: 116,
        date: new Date().toISOString(),
        payment_type: 'pago',
        iva_enabled: true,
        iva_rate: 16
      };
      
      printInvoice(testData, true);
      showToast('Pagina de prueba enviada a impresion');
    }

    function saveAllSettings() {
      AppState.config.company_name = document.getElementById('configCompanyName').value;
      AppState.config.company_rfc = document.getElementById('configRFC').value.toUpperCase();
      AppState.config.company_address = document.getElementById('configAddress').value;
      AppState.config.company_phone = document.getElementById('configPhone').value;
      AppState.config.company_slogan = document.getElementById('configSlogan').value;
      AppState.config.printer_type = document.getElementById('configPrinterType').value;
      AppState.config.bluetooth_print_mode = document.getElementById('configBluetoothPrintMode')?.value || AppState.config.bluetooth_print_mode || 'thermal_80';
      AppState.config.bluetooth_charset = document.getElementById('configBluetoothCharset')?.value || AppState.config.bluetooth_charset || 'cp850';
      AppState.config.printer_name = document.getElementById('configPrinterName').value;
      AppState.config.paper_size = document.getElementById('configPaperSize').value;
      AppState.config.currency = document.getElementById('configCurrency').value;
      AppState.config.auto_print = document.getElementById('configAutoPrint').checked;
      
      AppState.config.iva_default_enabled = document.getElementById('configIvaDefaultEnabled').checked;
      AppState.config.iva_default_rate = parseFloat(document.getElementById('configIvaDefaultRate').value) || 16;
      AppState.config.tax_rate = parseFloat(document.getElementById('configTax').value) || 16;
      
      saveConfig();
      updateCompanyInfo();
    }

    function saveConfig() {
      AppState.saveUserData();
      showToast('Configuracion guardada correctamente');
    }

    async function printInvoiceById(id) {
      const inv = AppState.data.find(r => r.__backendId === id);
      if (!inv) return;

      const printerType = getEffectivePrinterType();

      if (isBluetoothPrinterSelected()) {
        try {
          await BluetoothPrinter.printInvoice(inv);
          showToast('Factura enviada directo por Bluetooth', 'success');
        } catch (err) {
          showToast('No se pudo imprimir directo por Bluetooth. Se abrira impresion normal.', 'warning');
          printInvoice(inv);
        }
        return;
      }

      // Si es PDF o termica: generar PDF descargable (funciona en cualquier navegador/movil)
      if (printerType === 'pdf' || printerType === 'thermal_80' || printerType === 'thermal_58') {
        generateInvoicePDF(inv);
        return;
      }

      // Solo para impresora estandar en desktop: abrir ventana de impresion
      printInvoice(inv);
    }

    function downloadInvoicePDF(id) {
      const inv = AppState.data.find(r => r.__backendId === id);
      if (!inv) return;
      // SIEMPRE usar generateInvoicePDF que respeta el tipo de impresora configurado
      generateInvoicePDF(inv);
    }

    function getInvoiceItems(inv) {
      if (Array.isArray(inv.items) && inv.items.length) return inv.items;
      return [{
        material_name: inv.material_name,
        quantity: inv.quantity,
        price: inv.price,
        subtotal: (inv.subtotal || inv.sale_total || 0) - (inv.tax || 0)
      }];
    }

    function getInvoiceNote(inv) {
      const invoiceNote = safeText(inv?.note || '');
      if (invoiceNote) return invoiceNote;

      const relatedSale = AppState.data.find(r =>
        r.type === 'sale' &&
        r.invoice_number === inv?.invoice_number &&
        safeText(r.note || '')
      );
      return safeText(relatedSale?.note || '');
    }

    function generateInvoicePDF(inv) {
      if (!window.jspdf?.jsPDF) {
        showToast('No se pudo cargar la libreria de PDF. Revisa tu conexion e intenta de nuevo.', 'error');
        return;
      }
      const { jsPDF } = window.jspdf;
      const invoiceItems = getInvoiceItems(inv);
      const invoiceNote = getInvoiceNote(inv);
      const isCreditoInvoice = inv.payment_type === 'credito';
      const creditSale = AppState.data.find(r => r.type === 'sale' && r.invoice_number === inv.invoice_number);
      const creditPayments = creditSale ? getRecords('payment').filter(payment => payment.sale_id === creditSale.__backendId) : [];
      const creditAmountPaid = creditPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
      const creditRemaining = Math.max(0, (creditSale?.sale_total || inv.sale_total || 0) - creditAmountPaid);

      // ============================================================
      // DETERMINAR FORMATO SEGUN TIPO DE IMPRESORA (PRINCIPAL)
      // ============================================================
      // El tipo de impresora seleccionado en Configuracion dicta
      // el formato del PDF. Esto permite descargar/"imprimir" desde
      // CUALQUIER navegador incluido moviles, generando el PDF en
      // el formato correcto para luego enviarlo a la impresora.
      // ============================================================

      const printerType = getEffectivePrinterType();
      let format, unit, pageWidth, pageHeight, isThermal, is58mm, formatLabel;

      switch (printerType) {
        case 'thermal_58':
          format = [58, 200];
          unit = 'mm';
          pageWidth = 58;
          pageHeight = 200;
          isThermal = true;
          is58mm = true;
          formatLabel = 'Termica 58mm';
          break;
        case 'thermal_80':
          format = [80, 200];
          unit = 'mm';
          pageWidth = 80;
          pageHeight = 200;
          isThermal = true;
          is58mm = false;
          formatLabel = 'Termica 80mm';
          break;
        case 'pdf':
          // Para "Solo PDF" usar el tamano de papel seleccionado
          if (AppState.config.paper_size === 'a4') {
            format = 'a4';
            pageWidth = 210;
            pageHeight = 297;
          } else {
            format = 'letter';
            pageWidth = 216;
            pageHeight = 279;
          }
          unit = 'mm';
          isThermal = false;
          is58mm = false;
          formatLabel = AppState.config.paper_size === 'a4' ? 'A4' : 'Carta';
          break;
        case 'standard':
        default:
          // Impresora estandar: usar tamano de papel configurado
          if (AppState.config.paper_size === 'a4') {
            format = 'a4';
            pageWidth = 210;
            pageHeight = 297;
          } else {
            format = 'letter';
            pageWidth = 216;
            pageHeight = 279;
          }
          unit = 'mm';
          isThermal = false;
          is58mm = false;
          formatLabel = AppState.config.paper_size === 'a4' ? 'A4' : 'Carta';
          break;
      }

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: unit,
        format: format
      });

      const margin = isThermal ? 3 : 20;
      const contentWidth = pageWidth - (margin * 2);
      let yPos = margin + 2;

      // === LOGO ===
      if (AppState.config.company_logo) {
        try {
          const logoWidth = isThermal ? (is58mm ? 25 : 35) : 40;
          const logoHeight = logoWidth * 0.5;
          doc.addImage(AppState.config.company_logo, 'JPEG', pageWidth/2 - logoWidth/2, yPos, logoWidth, logoHeight);
          yPos += logoHeight + (isThermal ? 2 : 5);
        } catch (e) {
          console.log('No se pudo agregar el logo al PDF');
        }
      }

      // === ENCABEZADO ===
      if (isThermal) {
        // TERMICO: Todo en negrita, texto negro puro, sin colores
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text(AppState.config.company_name.toUpperCase(), pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 4;

        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.text(AppState.config.company_slogan, pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 3;

        if (AppState.config.company_rfc) {
          doc.setFontSize(6);
          doc.setFont(undefined, 'bold');
        doc.text(`RNC: ${AppState.config.company_rfc}`, pageWidth/2, yPos, { align: 'center' });
          doc.setFont(undefined, 'normal');
          yPos += 3;
        }

        // Linea separadora negra gruesa
        yPos += 2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;

        // TITULO FACTURA
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('FACTURA', pageWidth/2, yPos, { align: 'center' });
        yPos += 4;

        doc.setFontSize(9);
        doc.text(inv.invoice_number, pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 4;

        // DATOS DE LA VENTA - TODO EN NEGRITA
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text(`FECHA: ${fmt.dateTime(inv.date)}`, margin, yPos);
        yPos += 4;
        doc.text(`CLIENTE: ${inv.client_name}`, margin, yPos);
        yPos += 4;

        if (inv.vehicle_plate) {
          doc.text(`PLACA: ${inv.vehicle_plate}`, margin, yPos);
          yPos += 4;
        }

        if (invoiceNote) {
          const noteLines = doc.splitTextToSize(`NOTA: ${invoiceNote}`, contentWidth);
          doc.setFontSize(7);
          doc.text(noteLines, margin, yPos);
          yPos += (noteLines.length * 3) + 2;
        }

        if (inv.iva_enabled) {
          doc.setFontSize(7);
          doc.text(`* INCLUYE IVA ${inv.iva_rate}%`, margin, yPos);
          yPos += 4;
        }
        doc.setFont(undefined, 'normal');

        // Linea separadora
        yPos += 1;
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;

        // ITEMS EN NEGRITA
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        invoiceItems.forEach((item, index) => {
          if (index > 0) {
            doc.setLineWidth(0.2);
            doc.line(margin, yPos, pageWidth - margin, yPos);
            yPos += 3;
          }
          doc.text(`${(item.material_name || '').toUpperCase()}`, margin, yPos);
          yPos += 4;
          doc.text(`${fmt.quantity(item.quantity)} x ${fmt.currency(item.price)}`, margin, yPos);
          yPos += 4;
        });
        doc.setFont(undefined, 'normal');
        yPos += 1;

        // TOTALES IVA EN NEGRITA
        if (inv.iva_enabled) {
          doc.setFontSize(7);
          doc.setFont(undefined, 'bold');
          doc.text(`SUBTOTAL: ${fmt.currency(inv.subtotal || (inv.sale_total - (inv.tax || 0)))}`, margin, yPos);
          yPos += 4;
          doc.text(`IVA (${inv.iva_rate}%): ${fmt.currency(inv.tax || 0)}`, margin, yPos);
          doc.setFont(undefined, 'normal');
          yPos += 4;
        }
      } else {
        // FORMATO ESTANDAR/CARTA (sin cambios)
        doc.setFontSize(20);
        doc.setTextColor(0, 0, 0);
        doc.text(AppState.config.company_name, pageWidth/2, yPos, { align: 'center' });
        yPos += 8;

        doc.setFontSize(10);
        doc.text(AppState.config.company_slogan, pageWidth/2, yPos, { align: 'center' });
        yPos += 5;

        if (AppState.config.company_rfc) {
          doc.setFontSize(8);
        doc.text(`RNC: ${AppState.config.company_rfc}`, pageWidth/2, yPos, { align: 'center' });
          yPos += 4;
        }

        // Linea separadora
        yPos += 2;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;

        // TITULO FACTURA
        doc.setFontSize(16);
        doc.setTextColor(245, 158, 11);
        doc.text('FACTURA', pageWidth/2, yPos, { align: 'center' });
        yPos += 6;

        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(inv.invoice_number, pageWidth/2, yPos, { align: 'center' });
        yPos += 6;

        // DATOS DE LA VENTA
        doc.setFontSize(10);
        doc.text(`Fecha: ${fmt.dateTime(inv.date)}`, margin, yPos);
        yPos += 5;
        doc.text(`Cliente: ${inv.client_name}`, margin, yPos);
        yPos += 5;

        if (inv.vehicle_plate) {
          doc.text(`Placa: ${inv.vehicle_plate}`, margin, yPos);
          yPos += 5;
        }

        if (invoiceNote) {
          const noteLines = doc.splitTextToSize(`Nota: ${invoiceNote}`, contentWidth);
          doc.setFontSize(9);
          doc.text(noteLines, margin, yPos);
          yPos += (noteLines.length * 4) + 2;
        }

        if (inv.iva_enabled) {
          doc.setTextColor(245, 158, 11);
          doc.setFontSize(8);
          doc.text(`* Incluye IVA ${inv.iva_rate}%`, margin, yPos);
          doc.setTextColor(0, 0, 0);
          yPos += 4;
        }

        // Linea separadora
        yPos += 2;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;

        // ITEMS con tabla
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, yPos, contentWidth, 8, 'F');
        doc.setFontSize(9);
        doc.text('Material', margin + 2, yPos + 5);
        doc.text('Cant.', margin + contentWidth - 60, yPos + 5);
        doc.text('Precio', margin + contentWidth - 35, yPos + 5);
        doc.text('Total', margin + contentWidth - 10, yPos + 5);
        yPos += 12;

        invoiceItems.forEach((item, index) => {
          if (index % 2 === 0) {
            doc.setFillColor(255, 247, 237);
            doc.rect(margin, yPos - 5, contentWidth, 8, 'F');
          }
          doc.setFont(undefined, 'bold');
          doc.text(item.material_name, margin + 2, yPos);
          doc.setFont(undefined, 'normal');
          doc.text(String(item.quantity), margin + contentWidth - 60, yPos);
          doc.text(fmt.currency(item.price), margin + contentWidth - 35, yPos);
          doc.text(fmt.currency(item.subtotal || ((item.quantity || 0) * (item.price || 0))), margin + contentWidth - 10, yPos);
          yPos += 8;
        });

        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;

        // TOTALES IVA
        if (inv.iva_enabled) {
          doc.setFontSize(10);
          doc.text(`Subtotal:`, pageWidth - margin - 50, yPos);
          doc.text(fmt.currency(inv.subtotal || (inv.sale_total - (inv.tax || 0))), pageWidth - margin, yPos, { align: 'right' });
          yPos += 5;
          doc.text(`IVA (${inv.iva_rate}%):`, pageWidth - margin - 50, yPos);
          doc.text(fmt.currency(inv.tax || 0), pageWidth - margin, yPos, { align: 'right' });
          yPos += 8;
        }
      }

      // === TOTAL FINAL ===
      if (!isThermal) {
        // Formato estandar/carta
        doc.setFontSize(14);
        doc.setTextColor(245, 158, 11);
        doc.text(`TOTAL:`, pageWidth - margin - 50, yPos);
        doc.text(fmt.currency(inv.sale_total), pageWidth - margin, yPos, { align: 'right' });
        if (isCreditoInvoice) {
          yPos += 6;
          doc.setFontSize(10);
          doc.setTextColor(5, 150, 105);
          doc.text(`Abonado:`, pageWidth - margin - 50, yPos);
          doc.text(fmt.currency(creditAmountPaid), pageWidth - margin, yPos, { align: 'right' });
          yPos += 5;
          doc.setFontSize(12);
          doc.setTextColor(217, 119, 6);
          doc.setFont(undefined, 'bold');
          doc.text(`Falta por pagar:`, pageWidth - margin - 50, yPos);
          doc.text(fmt.currency(creditRemaining), pageWidth - margin, yPos, { align: 'right' });
          doc.setFont(undefined, 'normal');
        }
      } else {
        // === FORMATO TERMICO: TODO EN NEGRITA, SIN COLORES ===
        // Las impresoras termicas en blanco y negro necesitan
        // maximo contraste sin fondos de color

        yPos += 2;
        // Linea separadora superior
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;

        // TOTAL en negrita grande
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text(`TOTAL:`, margin, yPos);
        doc.text(fmt.currency(inv.sale_total), pageWidth - margin, yPos, { align: 'right' });
        if (isCreditoInvoice) {
          yPos += 4;
          doc.setFontSize(8);
          doc.text(`Abonado:`, margin, yPos);
          doc.text(fmt.currency(creditAmountPaid), pageWidth - margin, yPos, { align: 'right' });
          yPos += 4;
          doc.text(`Falta por pagar:`, margin, yPos);
          doc.text(fmt.currency(creditRemaining), pageWidth - margin, yPos, { align: 'right' });
        }
        doc.setFont(undefined, 'normal');
        yPos += 4;

        // Linea separadora inferior
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;

        // === ESTADO DE PAGO - SOLO TEXTO NEGRO EN NEGRITA ===
        const isCredito = inv.payment_type === 'credito';
        const isPagada = inv.payment_status === 'pagada' || (isCredito && creditAmountPaid > 0 && creditRemaining <= 0);
        const isAbono = creditAmountPaid > 0 && creditRemaining > 0;

        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');

        if (isCredito) {
          if (isPagada) {
            doc.text('*** PAGO COMPLETADO ***', pageWidth / 2, yPos, { align: 'center' });
            yPos += 5;
          } else if (isAbono) {
            doc.text('*** ABONO PARCIAL ***', pageWidth / 2, yPos, { align: 'center' });
            yPos += 5;
            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            doc.text(`Pagado: ${fmt.currency(creditAmountPaid)}`, margin, yPos);
            yPos += 4;
            doc.text(`Falta por pagar: ${fmt.currency(creditRemaining)}`, margin, yPos);
            yPos += 5;
          } else {
            doc.text('*** CREDITO - PENDIENTE ***', pageWidth / 2, yPos, { align: 'center' });
            yPos += 5;
          }
        } else {
          doc.text('*** PAGO DE CONTADO ***', pageWidth / 2, yPos, { align: 'center' });
          yPos += 5;
        }

        doc.setFont(undefined, 'normal');
        doc.setTextColor(0, 0, 0);
      }

      // === PIE DE PAGINA ===
      if (!isThermal) {
        yPos += 15;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(`Documento generado por ERP Materiales del Norte`, pageWidth/2, yPos, { align: 'center' });
        if (AppState.config.company_phone) {
          yPos += 5;
          doc.text(`Tel: ${AppState.config.company_phone}`, pageWidth/2, yPos, { align: 'center' });
        }
      } else {
        // PIE TERMICO: Todo en negrita, mensaje de agradecimiento
        yPos += 6;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;

        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text('GRACIAS POR SU COMPRA', pageWidth/2, yPos, { align: 'center' });
        yPos += 4;

        doc.setFontSize(6);
        doc.text(AppState.config.company_name.toUpperCase(), pageWidth/2, yPos, { align: 'center' });
        yPos += 3;

        if (AppState.config.company_phone) {
          doc.text(`TEL: ${AppState.config.company_phone}`, pageWidth/2, yPos, { align: 'center' });
          yPos += 3;
        }

        doc.setFont(undefined, 'normal');
      }

      // === NOMBRE DEL ARCHIVO SEGUN FORMATO ===
      let fileName;
      if (isThermal) {
        fileName = `factura_${inv.invoice_number}_${is58mm ? '58mm' : '80mm'}.pdf`;
      } else {
        fileName = `factura_${inv.invoice_number}_${AppState.config.paper_size === 'a4' ? 'A4' : 'Carta'}.pdf`;
      }

      doc.save(fileName);
      showToast(`PDF descargado: ${inv.invoice_number} (${formatLabel})`);
    }

    function printInvoice(invoice, isTest = false) {
      const printerType = isBluetoothPrinterSelected() ? 'standard' : getEffectivePrinterType();
      const invoiceItems = getInvoiceItems(invoice);
      const invoiceNote = getInvoiceNote(invoice);

      // Si es PDF o termica: generar PDF descargable (funciona en CUALQUIER navegador incluido moviles)
      if ((printerType === 'pdf' || printerType === 'thermal_80' || printerType === 'thermal_58') && !isTest) {
        const existingInv = AppState.data.find(r => r.__backendId === invoice.__backendId);
        if (existingInv) {
          generateInvoicePDF(existingInv);
          return;
        }
      }
      const isThermal = printerType.includes('thermal');
      const is58mm = printerType === 'thermal_58';
      const width = is58mm ? '58mm' : isThermal ? '80mm' : '210mm';

      // Determinar mensaje segun tipo de pago
      const isCredito = invoice.payment_type === 'credito';
      const creditSale = AppState.data.find(r => r.type === 'sale' && r.invoice_number === invoice.invoice_number);
      const creditPayments = creditSale ? getRecords('payment').filter(payment => payment.sale_id === creditSale.__backendId) : [];
      const creditAmountPaid = creditPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
      const creditRemaining = Math.max(0, (creditSale?.sale_total || invoice.sale_total || 0) - creditAmountPaid);
      const isPagada = invoice.payment_status === 'pagada' || (isCredito && creditAmountPaid > 0 && creditRemaining <= 0);

      let mensajeAgradecimiento = '';
      let mensajeEstado = '';

      if (isCredito) {
        if (isPagada) {
          mensajeAgradecimiento = '** GRACIAS POR SU PAGO **';
          mensajeEstado = '** PAGO COMPLETADO **';
        } else {
          mensajeAgradecimiento = '** GRACIAS POR SU COMPRA A CREDITO **';
          mensajeEstado = '** PAGO A CREDITO - PENDIENTE **';
        }
      } else {
        mensajeAgradecimiento = '** GRACIAS POR SU PAGO **';
        mensajeEstado = '** PAGADO **';
      }

      const thermalStyles = isThermal ? `
        <style>
          @page { size: ${width} auto; margin: 0; }
          body { width: ${width}; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; padding: 5mm; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 5px 0; }
          .item { display: flex; justify-content: space-between; }
          .product-highlight { font-weight: bold; text-transform: uppercase; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin: 5px 0; }
          .total { font-size: 14px; font-weight: bold; }
          .iva-info { font-size: 10px; color: #666; }
          .plate { font-size: 11px; background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
          .logo { max-width: 60mm; max-height: 20mm; margin-bottom: 5px; }
          .credito-badge { font-size: 10px; background: #d97706; color: white; padding: 2px 6px; border-radius: 3px; }
          .pagado-badge { font-size: 10px; background: #059669; color: white; padding: 2px 6px; border-radius: 3px; }
        </style>
      ` : `
        <style>
          @page { size: letter; margin: 20mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 30px; }
          .company { font-size: 24px; font-weight: bold; color: #f59e0b; }
          .invoice-box { border: 1px solid #ddd; padding: 20px; margin: 20px 0; background: #f9fafb; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f9fafb; }
          .total { text-align: right; font-size: 18px; font-weight: bold; color: #059669; }
          .footer { margin-top: 40px; text-align: center; color: #6b7280; font-size: 11px; }
          .iva-badge { display: inline-block; padding: 2px 8px; background: #f59e0b; color: white; border-radius: 4px; font-size: 10px; }
          .plate-badge { display: inline-block; padding: 2px 8px; background: #3b82f6; color: white; border-radius: 4px; font-size: 10px; font-family: monospace; }
          .credito-badge { display: inline-block; padding: 4px 12px; background: #d97706; color: white; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .pagado-badge { display: inline-block; padding: 4px 12px; background: #059669; color: white; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .logo { max-width: 150px; max-height: 80px; margin-bottom: 10px; }
          .product-highlight td { background: #fff7ed; font-weight: bold; border-top: 2px solid #f59e0b; border-bottom: 1px solid #f59e0b; }
        </style>
      `;

      const ivaSection = invoice.iva_enabled ? `
        <div class="iva-info">* Incluye IVA ${invoice.iva_rate}%</div>
        <div class="line"></div>
        <div class="item">
          <span>Subtotal:</span>
          <span>${fmt.currency(invoice.subtotal || (invoice.sale_total - (invoice.tax || 0)))}</span>
        </div>
        <div class="item">
          <span>IVA (${invoice.iva_rate}%):</span>
          <span>${fmt.currency(invoice.tax || 0)}</span>
        </div>
      ` : '';

      const plateSection = invoice.vehicle_plate ? `
        <div class="item" style="margin: 5px 0;">
          <span>Placa Vehiculo:</span>
          <span class="plate">${invoice.vehicle_plate}</span>
        </div>
      ` : '';

      const noteSection = invoiceNote ? `
        <div class="line"></div>
        <div style="margin: 5px 0;">
          <div class="bold">Nota:</div>
          <div style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(invoiceNote)}</div>
        </div>
      ` : '';

      const logoSection = AppState.config.company_logo ? 
        `<div class="center"><img src="${AppState.config.company_logo}" class="logo" alt="Logo"></div>` : '';

      const thermalItemRows = invoiceItems.map(item => `
        <div class="item product-highlight">
          <span>${item.material_name}</span>
          <span>${fmt.quantity(item.quantity)} x ${fmt.currency(item.price)}</span>
        </div>
      `).join('');

      const standardItemRows = invoiceItems.map(item => `
        <tr class="product-highlight">
          <td>${item.material_name}</td>
          <td style="text-align: center;">${fmt.quantity(item.quantity)}</td>
          <td style="text-align: right;">${fmt.currency(item.price)}</td>
          <td style="text-align: right;">${fmt.currency(item.subtotal || ((item.quantity || 0) * (item.price || 0)))}</td>
        </tr>
      `).join('');

      // Badge de estado de pago
      const estadoBadge = isCredito 
        ? (isPagada 
            ? `<div class="center" style="margin: 10px 0;"><span class="pagado-badge">OK PAGO COMPLETADO</span></div>`
            : `<div class="center" style="margin: 10px 0;"><span class="credito-badge">PENDIENTE CREDITO PENDIENTE</span></div>`)
        : `<div class="center" style="margin: 10px 0;"><span class="pagado-badge">OK PAGADO</span></div>`;

      const content = isThermal ? `
        ${logoSection}
        <div class="center bold" style="font-size: 14px;">${AppState.config.company_name}</div>
        <div class="center">${AppState.config.company_slogan}</div>
        ${AppState.config.company_rfc ? `<div class="center" style="font-size: 9px;">RNC: ${AppState.config.company_rfc}</div>` : ''}
        <div class="line"></div>
        <div class="center bold">FACTURA</div>
        <div class="center">${invoice.invoice_number}</div>
        ${invoice.iva_enabled ? `<div class="center iva-info">* IVA ${invoice.iva_rate}%</div>` : ''}
        ${estadoBadge}
        <div class="line"></div>
        <div>Fecha: ${fmt.dateTime(invoice.date)}</div>
        <div>Cliente: ${invoice.client_name}</div>
        ${plateSection}
        ${noteSection}
        <div class="line"></div>
        ${thermalItemRows}
        ${ivaSection}
        <div class="line"></div>
        <div class="item total">
          <span>TOTAL:</span>
          <span>${fmt.currency(invoice.sale_total)}</span>
        </div>
        ${isCredito ? `
          <div class="item" style="font-weight: bold;">
            <span>Abonado:</span>
            <span>${fmt.currency(creditAmountPaid)}</span>
          </div>
          <div class="item" style="font-weight: bold;">
            <span>Falta por pagar:</span>
            <span>${fmt.currency(creditRemaining)}</span>
          </div>
        ` : ''}
        <div class="line"></div>
        <div class="center" style="font-size: 10px; margin-top: 10px; font-weight: bold;">
          ${mensajeEstado}
        </div>
        <div class="center" style="font-size: 9px; margin-top: 20px;">
          ${mensajeAgradecimiento}<br>
          ${AppState.config.company_phone ? `Tel: ${AppState.config.company_phone}` : ''}
        </div>
      ` : `
        <div class="header">
          ${logoSection}
          <div class="company">${AppState.config.company_name}</div>
          <div>${AppState.config.company_slogan}</div>
          ${AppState.config.company_rfc ? `<div style="margin-top: 10px;">RNC: ${AppState.config.company_rfc}</div>` : ''}
          ${AppState.config.company_address ? `<div style="font-size: 11px; margin-top: 5px;">${AppState.config.company_address}</div>` : ''}
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div>
            <div style="font-size: 11px; color: #6b7280;">FACTURAR A:</div>
            <div style="font-weight: bold; font-size: 14px;">${invoice.client_name}</div>
            ${invoice.vehicle_plate ? `<div style="margin-top: 5px;"><span class="plate-badge">${invoice.vehicle_plate}</span></div>` : ''}
            ${invoiceNote ? `<div style="margin-top: 10px; max-width: 360px;"><div style="font-size: 11px; color: #6b7280;">NOTA:</div><div style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(invoiceNote)}</div></div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 24px; font-weight: bold; color: #f59e0b;">${invoice.invoice_number}</div>
            <div style="color: #6b7280; margin-top: 5px;">${fmt.dateTime(invoice.date)}</div>
            ${invoice.iva_enabled ? `<span class="iva-badge">IVA ${invoice.iva_rate}%</span>` : '<span class="iva-badge" style="background: #6b7280;">Sin IVA</span>'}
          </div>
        </div>

        ${estadoBadge}

        <table>
          <thead>
            <tr>
              <th>Descripcion</th>
              <th style="text-align: center;">Cantidad</th>
              <th style="text-align: right;">Precio Unit.</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${standardItemRows}
          </tbody>
        </table>

        <div style="margin-top: 30px; border-top: 2px solid #f3f4f6; padding-top: 20px;">
          <div style="display: flex; justify-content: flex-end; gap: 40px;">
            <div style="text-align: right;">
              ${invoice.iva_enabled ? `
                <div style="color: #6b7280; margin-bottom: 5px;">Subtotal</div>
                <div style="color: #6b7280; margin-bottom: 5px;">IVA (${invoice.iva_rate}%)</div>
              ` : '<div style="color: #6b7280; margin-bottom: 5px;">Subtotal (sin IVA)</div>'}
              <div style="font-size: 20px; font-weight: bold; color: #059669; margin-top: 10px;">TOTAL</div>
              ${isCredito ? `
                <div style="color: #059669; margin-top: 8px;">Abonado</div>
                <div style="font-size: 18px; font-weight: bold; color: #d97706; margin-top: 4px;">Falta por pagar</div>
              ` : ''}
            </div>
            <div style="text-align: right;">
              ${invoice.iva_enabled ? `
                <div style="margin-bottom: 5px;">${fmt.currency((invoice.subtotal || invoice.sale_total) - (invoice.tax || 0))}</div>
                <div style="margin-bottom: 5px;">${fmt.currency(invoice.tax || 0)}</div>
              ` : `<div style="margin-bottom: 5px;">${fmt.currency(invoice.sale_total)}</div>`}
              <div style="font-size: 20px; font-weight: bold; color: #059669; margin-top: 10px;">${fmt.currency(invoice.sale_total)}</div>
              ${isCredito ? `
                <div style="color: #059669; margin-top: 8px;">${fmt.currency(creditAmountPaid)}</div>
                <div style="font-size: 18px; font-weight: bold; color: #d97706; margin-top: 4px;">${fmt.currency(creditRemaining)}</div>
              ` : ''}
            </div>
          </div>
        </div>

        <div style="margin-top: 30px; padding: 15px; background: #f9fafb; border-radius: 8px; text-align: center;">
          <div style="font-weight: bold; margin-bottom: 5px; color: ${isCredito && !isPagada ? '#d97706' : '#059669'};">${mensajeEstado}</div>
          <div style="color: #6b7280; font-size: 11px;">${mensajeAgradecimiento}</div>
        </div>

        <div class="footer">
          <p>Documento generado por ERP Materiales del Norte</p>
          ${isTest ? '<p style="color: #dc2626; font-weight: bold;">--- DOCUMENTO DE PRUEBA ---</p>' : ''}
        </div>
      `;

      openPrintDocument(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Factura ${invoice.invoice_number}</title>
            ${thermalStyles}
          <base target="_blank">
</head>
          <body onload="window.print(); window.close();">
            ${content}
          </body>
        </html>
      `, { autoClose: true });
    }
    

    function showMaterialModal(editId) {
      const existing = editId ? AppState.data.find(r => r.__backendId === editId) : null;
      
      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-100">${existing ? 'Editar' : 'Nuevo'} Material</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          
          <form onsubmit="saveMaterial(event, '${editId || ''}')" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Nombre del Material</label>
              <input type="text" id="matName" required value="${existing ? existing.name : ''}" placeholder="Ej: Arena, Grava, Cemento"
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Precio Unitario</label>
                <input type="number" id="matPrice" step="0.01" min="0" required value="${existing ? existing.price : ''}"
                  class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Unidad</label>
                <select id="matUnit" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                  <option value="m3" ${existing?.unit === 'm3' ? 'selected' : ''}>m3 (Metros cubicos)</option>
                  <option value="ton" ${existing?.unit === 'ton' ? 'selected' : ''}>ton (Toneladas)</option>
                  <option value="kg" ${existing?.unit === 'kg' ? 'selected' : ''}>kg (Kilogramos)</option>
                  <option value="pz" ${existing?.unit === 'pz' ? 'selected' : ''}>pz (Piezas)</option>
                  <option value="ltr" ${existing?.unit === 'ltr' ? 'selected' : ''}>ltr (Litros)</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Stock Minimo (Alerta)</label>
              <input type="number" id="matMinStock" step="0.1" min="0" value="${existing ? existing.min_stock || 10 : 10}"
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
              <p class="text-xs text-slate-500 mt-1">Se mostrara alerta cuando el stock este por debajo de este valor</p>
            </div>
            
            <div class="flex gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" class="flex-1 px-4 py-3 bg-primary-500 hover:bg-primary-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20">
                ${existing ? 'Guardar Cambios' : 'Crear Material'}
              </button>
            </div>
          </form>
        </div>
      `);
    }

    function showEditMaterialModal(id) { showMaterialModal(id); }

    async function saveMaterial(e, editId) {
      e.preventDefault();
      const data = {
        type: 'material',
        name: document.getElementById('matName').value.trim(),
        price: parseFloat(document.getElementById('matPrice').value),
        unit: document.getElementById('matUnit').value,
        min_stock: parseFloat(document.getElementById('matMinStock').value) || 10
      };

      try {
        if (editId) {
          const existing = AppState.data.find(r => r.__backendId === editId);
          if (existing) {
            Object.assign(existing, data);
            AppState.saveUserData();
            showToast('Material actualizado correctamente');
          }
        } else {
          data.__backendId = 'mat_' + Date.now();
          AppState.data.push(data);
          AppState.saveUserData();
          showToast('Material creado correctamente');
        }
        closeModal();
        renderPage();
      } catch (err) {
        showToast('Error al guardar el material', 'error');
        console.error(err);
      }
    }

    function showEntryModal(editId = null) {
      const materials = getRecords('material');
      const existing = editId ? AppState.data.find(r => r.__backendId === editId && r.type === 'entry') : null;
      
      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-100">${existing ? 'Editar Entrada' : 'Registrar Entrada'}</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          
          <form onsubmit="saveEntry(event, ${existing ? `'${existing.__backendId}'` : 'null'})" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Fecha de Entrada</label>
              <input type="datetime-local" id="entryDate" required value="${existing ? escapeAttr(toDateTimeLocalValue(existing.date)) : ''}"
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
              <p class="text-xs text-slate-500 mt-1">Por defecto: fecha y hora actual</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Material</label>
             <select id="entryMat" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                ${materials.map(m => `<option value="${escapeAttr(m.name)}" ${existing?.material_name === m.name ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
              </select>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Cantidad</label>
                <input type="number" id="entryQty" step="any" min="0.01" inputmode="decimal" required value="${existing ? escapeAttr(existing.quantity) : ''}"
                  class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Costo Unitario</label>
                <input type="number" id="entryPrice" step="0.01" min="0" placeholder="Opcional" value="${existing ? escapeAttr(existing.price || '') : ''}"
                  class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Proveedor</label>
              <input type="text" id="entrySupp" required placeholder="Nombre del proveedor" value="${existing ? escapeAttr(existing.supplier_name || '') : ''}"
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
            </div>
            
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Factura del Proveedor</label>
              <input type="text" id="entrySupplierInv" placeholder="Ej: FAC-001" value="${existing ? escapeAttr(existing.supplier_invoice || '') : ''}"
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono placeholder-slate-600 input-focus">
            </div>
            
            <div class="flex gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" class="flex-1 px-4 py-3 bg-primary-500 hover:bg-primary-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20">
                ${existing ? 'Guardar Cambios' : 'Registrar Entrada'}
              </button>
            </div>
          </form>
        </div>
      `);

      // Inicializar fecha actual por defecto
      setTimeout(() => {
        const dateInput = document.getElementById('entryDate');
        if (dateInput && !dateInput.value) {
          const now = new Date();
          now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
          dateInput.value = now.toISOString().slice(0, 16);
        }
      }, 100);
    }

    function toDateTimeLocalValue(value) {
      if (!value) return '';
      const date = new Date(value);
      if (isNaN(date.getTime())) return String(value).slice(0, 16);
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      return date.toISOString().slice(0, 16);
    }

    async function saveEntry(e, editId = null) {
      e.preventDefault();
      
      try {
        const existing = editId ? AppState.data.find(r => r.__backendId === editId && r.type === 'entry') : null;
        if (editId && !existing) {
          showToast('No se encontro la entrada para editar', 'error');
          return;
        }

        const data = {
          type: 'entry',
          material_name: document.getElementById('entryMat').value,
          quantity: parseFloat(document.getElementById('entryQty').value),
          price: parseFloat(document.getElementById('entryPrice').value || 0),
          supplier_name: document.getElementById('entrySupp').value.trim(),
          supplier_invoice: document.getElementById('entrySupplierInv').value.trim(),
          date: document.getElementById('entryDate').value || new Date().toISOString()
        };

        if (existing) {
          Object.assign(existing, data);
        } else {
          data.__backendId = 'ent_' + Date.now();
          AppState.data.push(data);
        }
        await AppState.saveUserData();
        
        showToast(existing ? 'Entrada actualizada correctamente' : 'Entrada registrada correctamente');
        closeModal();
        renderPage();
      } catch (err) {
        showToast('Error al guardar la entrada', 'error');
        console.error(err);
      }
    }

    function showClientModal(editId) {
      const existing = editId ? AppState.data.find(r => r.__backendId === editId) : null;
      
      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-100">${existing ? 'Editar' : 'Nuevo'} Cliente</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          
          <form onsubmit="saveClient(event, '${editId || ''}')" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Nombre Completo</label>
              <input type="text" id="cliName" required value="${existing ? existing.client_name || '' : ''}"
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
            </div>
            
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Telefono</label>
              <input type="tel" id="cliPhone" value="${existing ? existing.client_phone || '' : ''}"
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono placeholder-slate-600 input-focus">
            </div>
            
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Direccion</label>
              <input type="text" id="cliAddr" value="${existing ? existing.client_address || '' : ''}"
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Placa habitual del Vehiculo</label>
              <input type="text" id="cliPlate" maxlength="20" value="${existing ? existing.vehicle_plate || '' : ''}" placeholder="Ej: ABC-1234"
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono uppercase placeholder-slate-600 input-focus">
              <p class="text-xs text-slate-500 mt-1">Se colocara automaticamente al seleccionar este cliente en Nueva Venta, pero podras editarla.</p>
            </div>
            
            <div class="flex gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" class="flex-1 px-4 py-3 bg-primary-500 hover:bg-primary-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20">
                ${existing ? 'Guardar Cambios' : 'Crear Cliente'}
              </button>
            </div>
          </form>
        </div>
      `);
    }

    function showEditClientModal(id) { showClientModal(id); }

    async function saveClient(e, editId) {
      e.preventDefault();
      const data = {
        type: 'client',
        client_name: document.getElementById('cliName').value.trim(),
        client_phone: document.getElementById('cliPhone').value.trim(),
        client_address: document.getElementById('cliAddr').value.trim(),
        vehicle_plate: document.getElementById('cliPlate').value.trim().toUpperCase()
      };

      try {
        if (editId) {
          const existing = AppState.data.find(r => r.__backendId === editId);
          if (existing) {
            Object.assign(existing, data);
            await AppState.saveUserData();
            showToast('Cliente actualizado correctamente');
          }
        } else {
          data.__backendId = 'cli_' + Date.now();
          AppState.data.push(data);
          await AppState.saveUserData();
          showToast('Cliente creado correctamente');
        }
        closeModal();
        renderPage();
      } catch (err) {
        showToast('Error al guardar el cliente', 'error');
        console.error(err);
      }
    }

    function askDelete(id) {
      AppState.deleteConfirmId = id;
      renderPage();
    }

    function cancelDelete() {
      AppState.deleteConfirmId = null;
      renderPage();
    }

    async function confirmDeleteRecord(id) {
      const rec = AppState.data.find(r => r.__backendId === id);
      if (!rec) return;
      
      try {
        const linkedInvoiceNumber = rec.invoice_number || '';
        const linkedSaleId = rec.type === 'sale'
          ? rec.__backendId
          : AppState.data.find(r => r.type === 'sale' && linkedInvoiceNumber && r.invoice_number === linkedInvoiceNumber)?.__backendId;

        AppState.data = AppState.data.filter(item => {
          if (item.__backendId === id) return false;
          if (linkedInvoiceNumber && item.type === 'invoice' && item.invoice_number === linkedInvoiceNumber) return false;
          if (rec.type === 'invoice' && linkedInvoiceNumber && item.type === 'sale' && item.invoice_number === linkedInvoiceNumber) return false;
          if (linkedSaleId && item.type === 'payment' && item.sale_id === linkedSaleId) return false;
          return true;
        });
        AppState.saveUserData();
        showToast('Registro eliminado correctamente');
        AppState.deleteConfirmId = null;
        renderPage();
      } catch (err) {
        showToast('Error al eliminar el registro', 'error');
        console.error(err);
      }
    }

    
    // ========== FUNCIONES PARA GESTION DE FACTURAS ==========

    function payInvoice(invoiceId) {
      const invoice = AppState.data.find(r => r.__backendId === invoiceId);
      if (!invoice) return;

      if (confirm(`Marcar la factura ${invoice.invoice_number} como PAGADA?\n\nCliente: ${invoice.client_name}\nMonto: ${fmt.currency(invoice.sale_total)}`)) {
        // Actualizar factura
        invoice.payment_status = 'pagada';
        invoice.status = 'completed';

        // Buscar y actualizar la venta relacionada
        const sale = AppState.data.find(r => r.type === 'sale' && r.invoice_number === invoice.invoice_number);
        if (sale) {
          sale.payment_status = 'pagada';
          sale.amount_paid = sale.sale_total;
          sale.remaining_balance = 0;
        }

        AppState.saveUserData();
        showToast(`Factura ${invoice.invoice_number} marcada como pagada`, 'success');
        renderPage();
      }
    }

    function getInvoiceEditItems(invoice) {
      if (Array.isArray(invoice.items) && invoice.items.length) {
        return invoice.items.map(item => ({
          material_name: item.material_name,
          quantity: toFiniteNumber(item.quantity, 0),
          price: toFiniteNumber(item.price, 0),
          subtotal: toFiniteNumber(item.subtotal, 0) || toFiniteNumber(item.quantity, 0) * toFiniteNumber(item.price, 0)
        })).filter(item => item.material_name && item.quantity > 0 && item.price > 0);
      }

      return [{
        material_name: invoice.material_name,
        quantity: toFiniteNumber(invoice.quantity, 0),
        price: toFiniteNumber(invoice.price, 0),
        subtotal: toFiniteNumber(invoice.subtotal, 0) || toFiniteNumber(invoice.quantity, 0) * toFiniteNumber(invoice.price, 0)
      }].filter(item => item.material_name && item.quantity > 0 && item.price > 0);
    }

    function getInvoiceOriginalQtyByMaterial(invoice) {
      const sale = AppState.data.find(r => r.type === 'sale' && r.invoice_number === invoice.invoice_number);
      const items = sale ? getInvoiceEditItems(sale) : getInvoiceEditItems(invoice);
      return items.reduce((map, item) => {
        map[item.material_name] = (map[item.material_name] || 0) + toFiniteNumber(item.quantity, 0);
        return map;
      }, {});
    }

    function updateEditInvoiceMaterialPrice() {
      const materialName = document.getElementById('editInvNewMaterial')?.value || '';
      const material = getRecords('material').find(m => m.name === materialName);
      const priceInput = document.getElementById('editInvNewPrice');
      if (material && priceInput) priceInput.value = Math.max(0, toFiniteNumber(material.price, 0));
    }

    function renderEditInvoiceItems() {
      const list = document.getElementById('editInvItemsList');
      if (!list) return;

      if (!AppState.editInvoiceItems?.length) {
        list.innerHTML = `<div class="text-sm text-slate-500 text-center py-3 border border-dashed border-slate-700 rounded-lg">Agrega al menos un material a la factura</div>`;
        updateEditInvoiceTotalPreview();
        return;
      }

      list.innerHTML = AppState.editInvoiceItems.map((item, index) => `
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-slate-900/40 border border-slate-700/50 rounded-lg">
          <div class="min-w-0 text-center sm:text-left">
            <div class="font-medium text-slate-200 break-words">${escapeHtml(item.material_name)}</div>
            <div class="text-xs text-slate-500 font-mono">${fmt.quantity(item.quantity)} x ${fmt.currency(item.price)}</div>
          </div>
          <div class="flex items-center justify-center sm:justify-end gap-2 flex-shrink-0">
            <span class="font-mono text-emerald-400">${fmt.currency(item.subtotal)}</span>
            <button type="button" onclick="removeEditInvoiceItem(${index})" class="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Quitar material">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('');

      updateEditInvoiceTotalPreview();
      if (window.lucide) lucide.createIcons();
    }

    function updateEditInvoiceTotalPreview() {
      const invoiceId = AppState.editInvoiceId;
      const invoice = AppState.data.find(r => r.__backendId === invoiceId);
      const totalPreview = document.getElementById('editInvTotalPreview');
      const subtotalPreview = document.getElementById('editInvSubtotalPreview');
      const taxPreview = document.getElementById('editInvTaxPreview');
      if (!invoice || !totalPreview) return;

      const subtotal = (AppState.editInvoiceItems || []).reduce((sum, item) => sum + toFiniteNumber(item.subtotal, 0), 0);
      const tax = invoice.iva_enabled ? subtotal * (toFiniteNumber(invoice.iva_rate, 0) / 100) : 0;
      const total = subtotal + tax;

      if (subtotalPreview) subtotalPreview.textContent = fmt.currency(subtotal);
      if (taxPreview) taxPreview.textContent = fmt.currency(tax);
      totalPreview.textContent = fmt.currency(total);
    }

    function addEditInvoiceItem() {
      const invoice = AppState.data.find(r => r.__backendId === AppState.editInvoiceId);
      const materialName = document.getElementById('editInvNewMaterial')?.value || '';
      const qty = toFiniteNumber(document.getElementById('editInvNewQty')?.value, 0);
      const price = toFiniteNumber(document.getElementById('editInvNewPrice')?.value, 0);
      const material = getRecords('material').find(m => m.name === materialName);

      if (!invoice || !material) {
        showToast('Selecciona un material registrado.', 'warning');
        return;
      }
      if (!isPositiveNumber(qty) || !isPositiveNumber(price)) {
        showToast('Cantidad y precio deben ser mayores que cero.', 'warning');
        return;
      }

      const originalQty = getInvoiceOriginalQtyByMaterial(invoice);
      const requestedQty = (AppState.editInvoiceItems || [])
        .filter(item => item.material_name === materialName)
        .reduce((sum, item) => sum + toFiniteNumber(item.quantity, 0), 0) + qty;
      const stock = toFiniteNumber(calcInventory()[materialName]?.stock, 0) + toFiniteNumber(originalQty[materialName], 0);

      if (requestedQty > stock) {
        showToast(`Stock insuficiente para ${materialName}`, 'error');
        return;
      }

      AppState.editInvoiceItems.push({
        material_name: materialName,
        quantity: qty,
        price: price,
        subtotal: qty * price
      });

      document.getElementById('editInvNewMaterial').value = '';
      document.getElementById('editInvNewQty').value = '';
      document.getElementById('editInvNewPrice').value = '';
      renderEditInvoiceItems();
    }

    function removeEditInvoiceItem(index) {
      AppState.editInvoiceItems.splice(index, 1);
      renderEditInvoiceItems();
    }

    function editInvoice(invoiceId) {
      const invoice = AppState.data.find(r => r.__backendId === invoiceId);
      if (!invoice) return;
      const materials = getRecords('material');
      AppState.editInvoiceId = invoiceId;
      AppState.editInvoiceItems = getInvoiceEditItems(invoice);

      showModal(`
        <div class="w-full max-w-full max-h-[88vh] overflow-y-auto overflow-x-hidden mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-3 sm:p-6 shadow-2xl">
          <div class="flex items-center justify-between gap-3 mb-5">
            <h2 class="text-lg sm:text-xl font-bold text-slate-100 min-w-0">Editar Factura</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="saveInvoiceEdit(event, '${invoiceId}')" class="space-y-4 w-full max-w-full mx-auto overflow-x-hidden">
            <div class="text-center sm:text-left">
              <label class="block text-sm font-medium text-slate-400 mb-2">Numero de Factura</label>
              <input type="text" id="editInvNumber" value="${invoice.invoice_number}" readonly
                class="w-full max-w-full px-3 sm:px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-500 font-mono">
            </div>

            <div class="text-center sm:text-left">
              <label class="block text-sm font-medium text-slate-400 mb-2">Fecha de Factura</label>
              <input type="datetime-local" id="editInvDate" value="${escapeAttr(toDateTimeLocalValue(invoice.date))}" required
                class="w-full max-w-full px-3 sm:px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
            </div>

            <div class="text-center sm:text-left">
              <label class="block text-sm font-medium text-slate-400 mb-2">Cliente</label>
              <input type="text" id="editInvClient" value="${invoice.client_name}" required
                class="w-full max-w-full px-3 sm:px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus">
            </div>

            <div class="text-center sm:text-left">
              <label class="block text-sm font-medium text-slate-400 mb-2">Placa del Vehiculo</label>
              <input type="text" id="editInvPlate" value="${invoice.vehicle_plate || ''}"
                class="w-full max-w-full px-3 sm:px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono uppercase input-focus">
            </div>

            <div class="space-y-3">
              <div class="flex items-center justify-center sm:justify-between gap-3">
                <label class="block text-sm font-medium text-slate-400">Materiales de la factura</label>
              </div>
              <div id="editInvItemsList" class="space-y-2"></div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_110px_130px_110px] gap-3 items-end p-3 sm:p-4 bg-slate-800/30 rounded-lg border border-slate-700/50 overflow-hidden max-w-full">
              <div class="sm:col-span-2 lg:col-span-1 min-w-0">
                <label class="block text-xs text-slate-500 mb-1">Material</label>
                <select id="editInvNewMaterial" onchange="updateEditInvoiceMaterialPrice()" class="w-full max-w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                  <option value="">Seleccionar...</option>
                  ${materials.map(m => `<option value="${escapeAttr(m.name)}">${escapeHtml(m.name)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Cantidad</label>
                <input type="number" id="editInvNewQty" step="any" min="0.01" inputmode="decimal"
                  class="w-full max-w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Precio</label>
                <input type="number" id="editInvNewPrice" step="0.01" min="0.01"
                  class="w-full max-w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
              </div>
              <button type="button" onclick="addEditInvoiceItem()" class="h-10 w-full px-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2">
                <i data-lucide="plus" class="w-4 h-4"></i> Agregar
              </button>
            </div>

            <div class="p-3 sm:p-4 bg-slate-800/30 rounded-lg border border-slate-700/50 max-w-full overflow-hidden">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-sm text-slate-400">Subtotal:</span>
                  <span id="editInvSubtotalPreview" class="font-mono text-slate-300">${fmt.currency(invoice.subtotal || 0)}</span>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-sm text-slate-400">IVA:</span>
                  <span id="editInvTaxPreview" class="font-mono text-slate-300">${fmt.currency(invoice.tax || 0)}</span>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-700/50">
                  <span class="text-sm text-slate-400">Total Calculado:</span>
                  <span id="editInvTotalPreview" class="text-xl font-bold text-emerald-400 font-mono break-all">${fmt.currency(invoice.sale_total)}</span>
                </div>
              </div>
            </div>

            <div class="flex flex-col sm:flex-row gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" class="flex-1 px-4 py-3 bg-primary-500 hover:bg-primary-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20">
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      `);

      setTimeout(() => {
        renderEditInvoiceItems();
      }, 100);
    }

    async function saveInvoiceEdit(e, invoiceId) {
      e.preventDefault();

      const invoice = AppState.data.find(r => r.__backendId === invoiceId);
      if (!invoice) return;

      const clientName = safeText(document.getElementById('editInvClient').value);
      const invoiceDateValue = document.getElementById('editInvDate')?.value;
      const items = (AppState.editInvoiceItems || []).map(item => ({
        material_name: item.material_name,
        quantity: toFiniteNumber(item.quantity, 0),
        price: toFiniteNumber(item.price, 0),
        subtotal: toFiniteNumber(item.subtotal, 0)
      }));

      if (!clientName) {
        showToast('El cliente es requerido.', 'warning');
        return;
      }

      const updatedDate = invoiceDateValue ? new Date(invoiceDateValue).toISOString() : '';
      if (!invoiceDateValue || isNaN(new Date(updatedDate).getTime())) {
        showToast('Selecciona una fecha de factura valida.', 'warning');
        return;
      }

      const todayKey = getLocalDateKey(new Date().toISOString());
      if (getLocalDateKey(updatedDate) > todayKey) {
        showToast('La fecha de factura no puede ser futura.', 'warning');
        return;
      }

      if (!items.length) {
        showToast('Agrega al menos un material a la factura.', 'warning');
        return;
      }

      const invalidItem = items.find(item => !item.material_name || !isPositiveNumber(item.quantity) || !isPositiveNumber(item.price) || !isPositiveNumber(item.subtotal));
      if (invalidItem) {
        showToast('Hay un material con cantidad o precio invalido.', 'warning');
        return;
      }

      const originalQty = getInvoiceOriginalQtyByMaterial(invoice);
      const requestedQty = items.reduce((map, item) => {
        map[item.material_name] = (map[item.material_name] || 0) + item.quantity;
        return map;
      }, {});
      const inv = calcInventory();
      const stockProblem = Object.entries(requestedQty).find(([name, qty]) => qty > (toFiniteNumber(inv[name]?.stock, 0) + toFiniteNumber(originalQty[name], 0)));
      if (stockProblem) {
        showToast(`Stock insuficiente para ${stockProblem[0]}`, 'error');
        return;
      }

      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      const tax = invoice.iva_enabled ? subtotal * (invoice.iva_rate / 100) : 0;
      const total = subtotal + tax;
      const firstItem = items[0];
      const materialLabel = items.length === 1 ? firstItem.material_name : 'Varios productos';
      const quantityTotal = items.reduce((sum, item) => sum + item.quantity, 0);
      const averagePrice = items.length === 1 ? firstItem.price : 0;

      try {
        // Actualizar factura
        invoice.client_name = clientName;
        invoice.date = updatedDate;
        invoice.vehicle_plate = safeText(document.getElementById('editInvPlate').value).toUpperCase();
        invoice.material_name = materialLabel;
        invoice.quantity = quantityTotal;
        invoice.price = averagePrice;
        invoice.items = items;
        invoice.subtotal = subtotal;
        invoice.tax = tax;
        invoice.sale_total = total;

        // Actualizar venta relacionada
        const sale = AppState.data.find(r => r.type === 'sale' && r.invoice_number === invoice.invoice_number);
        if (sale) {
          sale.client_name = invoice.client_name;
          sale.date = invoice.date;
          sale.vehicle_plate = invoice.vehicle_plate;
          sale.material_name = invoice.material_name;
          sale.sale_quantity = quantityTotal;
          sale.price = averagePrice;
          sale.items = items;
          sale.sale_subtotal = subtotal;
          sale.sale_tax = tax;
          sale.sale_total = total;
          if (sale.payment_status === 'pagada') {
            sale.amount_paid = total;
            sale.remaining_balance = 0;
          } else {
            sale.amount_paid = Math.min(toFiniteNumber(sale.amount_paid, 0), total);
            sale.remaining_balance = Math.max(0, total - toFiniteNumber(sale.amount_paid, 0));
          }
        }

        AppState.saveUserData();
        showToast('Factura actualizada correctamente', 'success');
        closeModal();
        renderPage();
      } catch (err) {
        showToast('Error al actualizar la factura', 'error');
        console.error(err);
      }
    }

    function confirmCancelInvoice(invoiceId) {
      const invoice = AppState.data.find(r => r.__backendId === invoiceId);
      if (!invoice) return;

      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-rose-400">Anular Factura</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 mb-6">
            <div class="flex items-center gap-3 mb-3">
              <i data-lucide="alert-triangle" class="w-8 h-8 text-rose-400"></i>
              <div>
                <p class="text-sm text-rose-400 font-medium">Estas seguro de anular esta factura?</p>
                <p class="text-xs text-slate-400">Esta accion no se puede deshacer</p>
              </div>
            </div>
            <div class="text-sm text-slate-300">
              <p><strong>Factura:</strong> ${invoice.invoice_number}</p>
              <p><strong>Cliente:</strong> ${invoice.client_name}</p>
              <p><strong>Monto:</strong> ${fmt.currency(invoice.sale_total)}</p>
            </div>
          </div>

          <form onsubmit="cancelInvoice(event, '${invoiceId}')" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Motivo de anulacion (opcional)</label>
              <textarea id="cancelReason" rows="3" placeholder="Ej: Error en datos, cliente cancelo, etc."
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus resize-none"></textarea>
            </div>

            <div class="flex gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" class="flex-1 px-4 py-3 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-rose-500/20 flex items-center justify-center gap-2">
                <i data-lucide="x-circle" class="w-5 h-5"></i> Confirmar Anulacion
              </button>
            </div>
          </form>
        </div>
      `);
    }

    async function cancelInvoice(e, invoiceId) {
      e.preventDefault();

      const invoice = AppState.data.find(r => r.__backendId === invoiceId);
      if (!invoice) return;

      const reason = document.getElementById('cancelReason').value.trim();

      try {
        // Marcar factura como anulada
        invoice.status = 'cancelled';
        invoice.cancelled_date = new Date().toISOString();
        invoice.cancellation_reason = reason;
        invoice.payment_status = 'cancelled';

        // Actualizar venta relacionada
        const sale = AppState.data.find(r => r.type === 'sale' && r.invoice_number === invoice.invoice_number);
        if (sale) {
          sale.status = 'cancelled';
          sale.payment_status = 'cancelled';
        }

        AppState.saveUserData();
        showToast(`Factura ${invoice.invoice_number} anulada correctamente`, 'success');
        closeModal();
        renderPage();
      } catch (err) {
        showToast('Error al anular la factura', 'error');
        console.error(err);
      }
    }

    // ========== FUNCIONES PARA SELECCION MULTIPLE EN CREDITO ==========

    function selectAllInvoices(clientName, select) {
      const clientDebts = {};
      const sales = getRecords('sale').filter(s => s.payment_type === 'credito');
      const payments = getRecords('payment');

      sales.forEach(s => {
        if (!clientDebts[s.client_name]) {
          clientDebts[s.client_name] = { transactions: [] };
        }
        const salePayments = payments.filter(p => p.sale_id === s.__backendId);
        const paidAmount = salePayments.reduce((sum, p) => sum + p.amount, 0);
        const remaining = (s.sale_total || 0) - paidAmount;

        if (remaining > 0) {
          clientDebts[s.client_name].transactions.push({
            __backendId: s.__backendId,
            remaining: remaining
          });
        }
      });

      const client = clientDebts[clientName];
      if (!client) return;

      client.transactions.forEach(t => {
        const checkbox = document.getElementById(`chk_${t.__backendId}`);
        if (checkbox) {
          checkbox.checked = select;
        }
      });

      updateSelectedTotal(clientName);
    }

    function selectVisibleCreditInvoices(safeClientName, clientName, select) {
      document.querySelectorAll(`.credit_invoice_${safeClientName}`).forEach(checkbox => {
        checkbox.checked = select;
      });
      updateSelectedTotal(clientName);
    }

    function toggleInvoiceSelection(saleId, clientName) {
      const checkbox = document.getElementById(`chk_${saleId}`);
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        updateSelectedTotal(clientName);
      }
    }

    function updateSelectedTotal(clientName) {
      const sales = getRecords('sale').filter(s => s.payment_type === 'credito' && s.client_name === clientName);
      const payments = getRecords('payment');

      let selectedCount = 0;
      let selectedTotal = 0;

      const safeClientName = getCreditClientKey(clientName);
      const checkedBoxes = Array.from(document.querySelectorAll(`.credit_invoice_${safeClientName}:checked`));
      const sourceSales = checkedBoxes.length
        ? checkedBoxes.map(cb => AppState.data.find(r => r.__backendId === cb.id.replace('chk_', ''))).filter(Boolean)
        : sales;

      sourceSales.forEach(s => {
        const checkbox = document.getElementById(`chk_${s.__backendId}`);
        if (checkbox && checkbox.checked) {
          const salePayments = payments.filter(p => p.sale_id === s.__backendId);
          const paidAmount = salePayments.reduce((sum, p) => sum + p.amount, 0);
          const remaining = (s.sale_total || 0) - paidAmount;

          selectedCount++;
          selectedTotal += remaining > 0.01 ? remaining : (s.sale_total || 0);
        }
      });

      const countEl = document.getElementById(`selectedCount_${safeClientName}`);
      const totalEl = document.getElementById(`selectedTotal_${safeClientName}`);
      const payBtn = document.getElementById(`btnPaySelected_${safeClientName}`);
      const partialBtn = document.getElementById(`btnPartialPay_${safeClientName}`);
      const printBtn = document.getElementById(`btnPrintSelected_${safeClientName}`);

      if (countEl) countEl.textContent = selectedCount;
      if (totalEl) totalEl.textContent = fmt.currency(selectedTotal);
      if (payBtn) payBtn.disabled = selectedCount === 0;
      if (partialBtn) partialBtn.disabled = selectedCount === 0;
      if (printBtn) printBtn.disabled = selectedCount === 0;
    }

    function openCombinedCreditPrint(title, sections, thermalText = '') {
      if (!sections.length) {
        showToast('No hay elementos para imprimir', 'error');
        return;
      }

      const printerType = isBluetoothPrinterSelected() ? 'bluetooth' : getEffectivePrinterType();

      if (printerType === 'bluetooth') {
        BluetoothPrinter.printText(thermalText || sections.join('\n\n'))
          .then(() => showToast('Impresion Bluetooth enviada', 'success'))
          .catch(err => {
            console.error(err);
            showToast('No se pudo imprimir por Bluetooth', 'error');
          });
        return;
      }

      if (printerType === 'thermal_80' || printerType === 'thermal_58') {
        const receiptText = thermalText || sections.join('\n\n');
        const safeTitle = String(title || 'recibo')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '') || 'recibo';
        const blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeTitle}_${printerType}.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast('Recibo termico descargado');
        return;
      }

      openPrintDocument(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
              @page { size: letter; margin: 16mm; }
              body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
              .doc { page-break-after: always; padding: 8px 0; }
              .doc:last-child { page-break-after: auto; }
              .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 12px; margin-bottom: 18px; }
              .company { font-size: 22px; font-weight: bold; color: #f59e0b; }
              .meta { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
              .muted { color: #6b7280; font-size: 11px; }
              table { width: 100%; border-collapse: collapse; margin: 16px 0; }
              th, td { padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: left; }
              th { background: #f9fafb; }
              .right { text-align: right; }
              .center { text-align: center; }
              .total { font-size: 18px; font-weight: bold; color: #059669; }
              .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #ecfdf5; color: #047857; }
              .pending { background: #fff7ed; color: #c2410c; }
            </style>
          </head>
          <body onload="window.print();">
            ${sections.join('')}
          </body>
        </html>
      `, { autoClose: false });
    }

    function buildConsolidatedCreditInvoicePrintSection(invoices) {
      const firstInvoice = invoices[0] || {};
      const rows = invoices.flatMap(invoice => getInvoiceItems(invoice).map(item => ({
        invoice_number: invoice.invoice_number,
        date: invoice.date,
        material_name: item.material_name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal || ((item.quantity || 0) * (item.price || 0))
      })));
      const subtotal = invoices.reduce((sum, inv) => sum + (inv.subtotal || ((inv.sale_total || 0) - (inv.tax || 0))), 0);
      const tax = invoices.reduce((sum, inv) => sum + (inv.tax || 0), 0);
      const total = invoices.reduce((sum, inv) => sum + (inv.sale_total || 0), 0);
      const payments = getRecords('payment');
      const pendingByInvoice = invoices.map(invoice => {
        const sale = AppState.data.find(r => r.type === 'sale' && r.invoice_number === invoice.invoice_number);
        const saleTotal = sale?.sale_total || invoice.sale_total || 0;
        const paid = sale ? payments
          .filter(payment => payment.sale_id === sale.__backendId)
          .reduce((sum, payment) => sum + (payment.amount || 0), 0) : 0;
        return {
          invoice_number: invoice.invoice_number,
          paid,
          remaining: Math.max(0, saleTotal - paid)
        };
      });
      const totalPaid = pendingByInvoice.reduce((sum, item) => sum + item.paid, 0);
      const totalPending = pendingByInvoice.reduce((sum, item) => sum + item.remaining, 0);
      return `
        <section class="doc">
          <div class="header">
            <div class="company">${AppState.config.company_name}</div>
            <div>${AppState.config.company_slogan || ''}</div>
            ${AppState.config.company_rfc ? `<div class="muted">RNC: ${AppState.config.company_rfc}</div>` : ''}
          </div>
          <div class="meta">
            <div>
              <div class="muted">CLIENTE</div>
              <div><strong>${firstInvoice.client_name || ''}</strong></div>
              ${firstInvoice.vehicle_plate ? `<div class="muted">Placa: ${firstInvoice.vehicle_plate}</div>` : ''}
            </div>
            <div class="right">
              <div style="font-size: 22px; font-weight: bold; color: #f59e0b;">FACTURAS SELECCIONADAS</div>
              <div class="muted">${fmt.dateTime(new Date().toISOString())}</div>
              <span class="badge">${invoices.length} factura(s)</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Descripcion</th>
                <th class="center">Cantidad</th>
                <th class="right">Precio Unit.</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(item => `
                <tr>
                  <td>${item.invoice_number || ''}</td>
                  <td><strong>${item.material_name || ''}</strong></td>
                  <td class="center">${fmt.quantity(item.quantity)}</td>
                  <td class="right">${fmt.currency(item.price)}</td>
                  <td class="right">${fmt.currency(item.subtotal)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="right">
            <div>Subtotal: ${fmt.currency(subtotal)}</div>
            <div>IVA: ${fmt.currency(tax)}</div>
            <div class="total">TOTAL GENERAL: ${fmt.currency(total)}</div>
            <div style="margin-top: 8px; color: #059669;">Abonado: ${fmt.currency(totalPaid)}</div>
            <div style="margin-top: 4px; font-size: 18px; font-weight: bold; color: #d97706;">FALTA POR PAGAR: ${fmt.currency(totalPending)}</div>
          </div>
        </section>
      `;
    }

    function buildConsolidatedCreditInvoiceThermalText(invoices) {
      const h = BluetoothPrinter.helpers();
      const firstInvoice = invoices[0] || {};
      const rows = invoices.flatMap(invoice => getInvoiceItems(invoice).map(item => ({
        invoice_number: invoice.invoice_number,
        material_name: item.material_name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal || ((item.quantity || 0) * (item.price || 0))
      })));
      const subtotal = invoices.reduce((sum, inv) => sum + (inv.subtotal || ((inv.sale_total || 0) - (inv.tax || 0))), 0);
      const tax = invoices.reduce((sum, inv) => sum + (inv.tax || 0), 0);
      const total = invoices.reduce((sum, inv) => sum + (inv.sale_total || 0), 0);
      const payments = getRecords('payment');
      const totalPaid = invoices.reduce((sum, invoice) => {
        const sale = AppState.data.find(r => r.type === 'sale' && r.invoice_number === invoice.invoice_number);
        if (!sale) return sum;
        const paid = payments
          .filter(payment => payment.sale_id === sale.__backendId)
          .reduce((paymentSum, payment) => paymentSum + (payment.amount || 0), 0);
        return sum + paid;
      }, 0);
      const totalPending = Math.max(0, total - totalPaid);

      return [
        ...BluetoothPrinter.thermalHeader('FACTURAS SELECCIONADAS', invoices.length + ' FACTURA(S)'),
        ...h.section('CLIENTE', h.wordWrap(firstInvoice.client_name || '')),
        firstInvoice.vehicle_plate ? h.item('Placa:', firstInvoice.vehicle_plate) : '',
        ...h.section('DETALLE'),
        ...rows.flatMap(item => [
          h.line,
          item.invoice_number || '',
          ...h.wordWrap(item.material_name || ''),
          h.item('Cant:', fmt.quantity(item.quantity)),
          h.item('Precio:', fmt.currency(item.price)),
          h.item('Total:', fmt.currency(item.subtotal))
        ]),
        h.thickLine,
        h.item('Subtotal:', fmt.currency(subtotal)),
        h.item('IVA:', fmt.currency(tax)),
        ...h.totalBlock('TOTAL GENERAL', fmt.currency(total)),
        h.item('Abonado:', fmt.currency(totalPaid)),
        h.item('Falta por pagar:', fmt.currency(totalPending)),
        ...BluetoothPrinter.thermalFooter('IMPRESION CONSOLIDADA')
      ].filter(Boolean).join('\n');
    }

    function generateConsolidatedCreditInvoicePDF(invoices) {
      if (!window.jspdf?.jsPDF) {
        showToast('No se pudo cargar la libreria de PDF. Revisa tu conexion e intenta de nuevo.', 'error');
        return;
      }

      const { jsPDF } = window.jspdf;
      const printerType = getEffectivePrinterType();
      let format, pageWidth, pageHeight, isThermal, is58mm, formatLabel;

      switch (printerType) {
        case 'thermal_58':
          format = [58, 200];
          pageWidth = 58;
          pageHeight = 200;
          isThermal = true;
          is58mm = true;
          formatLabel = 'Termica 58mm';
          break;
        case 'thermal_80':
          format = [80, 200];
          pageWidth = 80;
          pageHeight = 200;
          isThermal = true;
          is58mm = false;
          formatLabel = 'Termica 80mm';
          break;
        case 'pdf':
        case 'standard':
        default:
          if (AppState.config.paper_size === 'a4') {
            format = 'a4';
            pageWidth = 210;
            pageHeight = 297;
          } else {
            format = 'letter';
            pageWidth = 216;
            pageHeight = 279;
          }
          isThermal = false;
          is58mm = false;
          formatLabel = AppState.config.paper_size === 'a4' ? 'A4' : 'Carta';
          break;
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format });
      const margin = isThermal ? 3 : 20;
      const contentWidth = pageWidth - (margin * 2);
      const lineHeight = isThermal ? 4 : 6;
      const payments = getRecords('payment');
      const firstInvoice = invoices[0] || {};
      const rows = invoices.flatMap(invoice => getInvoiceItems(invoice).map(item => ({
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        material_name: item.material_name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal || ((item.quantity || 0) * (item.price || 0))
      })));
      const subtotal = invoices.reduce((sum, inv) => sum + (inv.subtotal || ((inv.sale_total || 0) - (inv.tax || 0))), 0);
      const tax = invoices.reduce((sum, inv) => sum + (inv.tax || 0), 0);
      const total = invoices.reduce((sum, inv) => sum + (inv.sale_total || 0), 0);
      const totalPaid = invoices.reduce((sum, invoice) => {
        const sale = AppState.data.find(r => r.type === 'sale' && r.invoice_number === invoice.invoice_number);
        if (!sale) return sum;
        return sum + payments
          .filter(payment => payment.sale_id === sale.__backendId)
          .reduce((paymentSum, payment) => paymentSum + (payment.amount || 0), 0);
      }, 0);
      const totalPending = Math.max(0, total - totalPaid);
      let yPos = margin + 2;

      const addPageIfNeeded = (needed = lineHeight) => {
        if (yPos + needed <= pageHeight - margin) return;
        doc.addPage();
        yPos = margin + 2;
      };
      const drawLine = (thick = false) => {
        addPageIfNeeded(3);
        doc.setDrawColor(isThermal ? 0 : 200, isThermal ? 0 : 200, isThermal ? 0 : 200);
        doc.setLineWidth(thick ? 0.5 : 0.2);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += isThermal ? 3 : 5;
      };
      const writeText = (text, x, options = {}) => {
        addPageIfNeeded(lineHeight);
        doc.text(String(text || ''), x, yPos, options);
      };

      if (AppState.config.company_logo) {
        try {
          const logoWidth = isThermal ? (is58mm ? 25 : 35) : 40;
          const logoHeight = logoWidth * 0.5;
          doc.addImage(AppState.config.company_logo, 'JPEG', pageWidth / 2 - logoWidth / 2, yPos, logoWidth, logoHeight);
          yPos += logoHeight + (isThermal ? 2 : 5);
        } catch (e) {}
      }

      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(isThermal ? 10 : 20);
      writeText(isThermal ? String(AppState.config.company_name || '').toUpperCase() : AppState.config.company_name, pageWidth / 2, { align: 'center' });
      yPos += isThermal ? 4 : 8;

      doc.setFont(undefined, isThermal ? 'bold' : 'normal');
      doc.setFontSize(isThermal ? 7 : 10);
      writeText(AppState.config.company_slogan || '', pageWidth / 2, { align: 'center' });
      yPos += isThermal ? 3 : 5;

      if (AppState.config.company_rfc) {
        doc.setFontSize(isThermal ? 6 : 8);
        writeText('RNC: ' + AppState.config.company_rfc, pageWidth / 2, { align: 'center' });
        yPos += isThermal ? 3 : 4;
      }

      yPos += 2;
      drawLine(true);

      doc.setFont(undefined, 'bold');
      doc.setFontSize(isThermal ? 10 : 16);
      doc.setTextColor(isThermal ? 0 : 245, isThermal ? 0 : 158, isThermal ? 0 : 11);
      writeText('FACTURAS SELECCIONADAS', pageWidth / 2, { align: 'center' });
      yPos += isThermal ? 4 : 6;

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(isThermal ? 8 : 10);
      doc.setFont(undefined, isThermal ? 'bold' : 'normal');
      writeText('Fecha: ' + fmt.dateTime(new Date().toISOString()), margin);
      yPos += lineHeight;
      writeText('Cliente: ' + (firstInvoice.client_name || ''), margin);
      yPos += lineHeight;
      if (firstInvoice.vehicle_plate) {
        writeText('Placa: ' + firstInvoice.vehicle_plate, margin);
        yPos += lineHeight;
      }
      const paidInvoices = invoices.filter(invoice => {
        const sale = AppState.data.find(r => r.type === 'sale' && r.invoice_number === invoice.invoice_number);
        const paid = sale ? payments
          .filter(payment => payment.sale_id === sale.__backendId)
          .reduce((paymentSum, payment) => paymentSum + (payment.amount || 0), 0) : 0;
        return invoice.payment_status === 'pagada' || paid >= (sale?.sale_total || invoice.sale_total || 0);
      }).length;
      const consolidatedStatus = paidInvoices === invoices.length ? 'Facturas pagadas' : 'Facturas seleccionadas';
      writeText(invoices.length + ' factura(s) - ' + consolidatedStatus, margin);
      yPos += lineHeight;
      drawLine();

      if (isThermal) {
        doc.setFontSize(8);
        rows.forEach(item => {
          addPageIfNeeded(22);
          doc.setFont(undefined, 'bold');
          doc.text(item.invoice_number || '', margin, yPos);
          yPos += 4;
          const materialLines = doc.splitTextToSize(String(item.material_name || '').toUpperCase(), contentWidth);
          materialLines.forEach(line => {
            addPageIfNeeded(4);
            doc.text(line, margin, yPos);
            yPos += 4;
          });
          doc.text('Cant: ' + fmt.quantity(item.quantity), margin, yPos);
          yPos += 4;
          doc.text('Precio: ' + fmt.currency(item.price), margin, yPos);
          yPos += 4;
          doc.text('Total: ' + fmt.currency(item.subtotal), margin, yPos);
          yPos += 4;
          drawLine();
        });
      } else {
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, yPos - 4, contentWidth, 8, 'F');
        doc.text('Factura', margin + 2, yPos);
        doc.text('Descripcion', margin + 35, yPos);
        doc.text('Cant.', pageWidth - margin - 65, yPos);
        doc.text('Precio', pageWidth - margin - 42, yPos);
        doc.text('Total', pageWidth - margin, yPos, { align: 'right' });
        yPos += 8;
        doc.setFont(undefined, 'normal');
        rows.forEach(item => {
          addPageIfNeeded(10);
          const material = doc.splitTextToSize(String(item.material_name || ''), 70)[0] || '';
          doc.text(String(item.invoice_number || ''), margin + 2, yPos);
          doc.text(material, margin + 35, yPos);
          doc.text(fmt.quantity(item.quantity), pageWidth - margin - 65, yPos);
          doc.text(fmt.currency(item.price), pageWidth - margin - 42, yPos);
          doc.text(fmt.currency(item.subtotal), pageWidth - margin, yPos, { align: 'right' });
          yPos += 7;
        });
        drawLine();
      }

      addPageIfNeeded(isThermal ? 28 : 35);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(isThermal ? 8 : 10);
      if (!isThermal) {
        doc.text('Subtotal:', pageWidth - margin - 55, yPos);
        doc.text(fmt.currency(subtotal), pageWidth - margin, yPos, { align: 'right' });
        yPos += 6;
        doc.text('IVA:', pageWidth - margin - 55, yPos);
        doc.text(fmt.currency(tax), pageWidth - margin, yPos, { align: 'right' });
        yPos += 8;
      } else {
        doc.text('Subtotal: ' + fmt.currency(subtotal), margin, yPos);
        yPos += 4;
        doc.text('IVA: ' + fmt.currency(tax), margin, yPos);
        yPos += 4;
      }

      doc.setFontSize(isThermal ? 12 : 14);
      doc.setTextColor(isThermal ? 0 : 245, isThermal ? 0 : 158, isThermal ? 0 : 11);
      doc.text('TOTAL:', isThermal ? margin : pageWidth - margin - 55, yPos);
      doc.text(fmt.currency(total), pageWidth - margin, yPos, { align: 'right' });
      yPos += isThermal ? 5 : 7;

      doc.setFontSize(isThermal ? 8 : 10);
      doc.setTextColor(5, 150, 105);
      doc.text('Abonado:', isThermal ? margin : pageWidth - margin - 55, yPos);
      doc.text(fmt.currency(totalPaid), pageWidth - margin, yPos, { align: 'right' });
      yPos += isThermal ? 4 : 6;
      doc.setTextColor(217, 119, 6);
      doc.text('Falta por pagar:', isThermal ? margin : pageWidth - margin - 55, yPos);
      doc.text(fmt.currency(totalPending), pageWidth - margin, yPos, { align: 'right' });

      doc.setTextColor(0, 0, 0);
      if (isThermal) {
        yPos += 8;
        drawLine(true);
        doc.setFontSize(8);
        doc.text('IMPRESION CONSOLIDADA', pageWidth / 2, yPos, { align: 'center' });
      } else {
        yPos += 15;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text('Documento generado por ERP Materiales del Norte', pageWidth / 2, yPos, { align: 'center' });
      }

      const fileName = 'facturas_credito_seleccionadas_' + (isThermal ? (is58mm ? '58mm' : '80mm') : formatLabel) + '.pdf';
      doc.save(fileName);
      showToast('PDF descargado: Facturas seleccionadas (' + formatLabel + ')');
    }

    async function printSelectedCreditInvoices(safeClientName) {
      const selectedIds = Array.from(document.querySelectorAll(`.credit_invoice_${safeClientName}:checked`)).map(cb => cb.id.replace('chk_', ''));
      if (selectedIds.length === 0) {
        showToast('No hay facturas seleccionadas', 'error');
        return;
      }

      const invoices = [];
      selectedIds.forEach(saleId => {
        const sale = AppState.data.find(r => r.__backendId === saleId);
        const invoice = sale ? AppState.data.find(r => r.type === 'invoice' && r.invoice_number === sale.invoice_number) : null;
        if (invoice) {
          invoices.push(invoice);
        }
      });

      if (!invoices.length) {
        showToast('No se encontraron las facturas seleccionadas', 'error');
        return;
      }

      if (isBluetoothPrinterSelected()) {
        try {
          await BluetoothPrinter.printText(buildConsolidatedCreditInvoiceThermalText(invoices));
          showToast('Facturas seleccionadas enviadas por Bluetooth', 'success');
        } catch (err) {
          showToast('No se pudo imprimir directo por Bluetooth. Se abrira impresion normal.', 'warning');
          openCombinedCreditPrint('Facturas seleccionadas', [buildConsolidatedCreditInvoicePrintSection(invoices)], buildConsolidatedCreditInvoiceThermalText(invoices));
        }
        return;
      }

      const printerType = getEffectivePrinterType();
      if (printerType === 'pdf' || printerType === 'thermal_80' || printerType === 'thermal_58') {
        generateConsolidatedCreditInvoicePDF(invoices);
        return;
      }

      openCombinedCreditPrint('Facturas seleccionadas', [buildConsolidatedCreditInvoicePrintSection(invoices)], buildConsolidatedCreditInvoiceThermalText(invoices));
    }

    function selectVisibleCreditPayments(select) {
      document.querySelectorAll('.credit-payment-check').forEach(checkbox => {
        checkbox.checked = select;
      });
      updateSelectedPaymentTotal();
    }

    function updateSelectedPaymentTotal() {
      const selectedCount = document.querySelectorAll('.credit-payment-check:checked').length;
      const countEl = document.getElementById('selectedPaymentCount');
      const printBtn = document.getElementById('btnPrintSelectedPayments');
      if (countEl) countEl.textContent = selectedCount;
      if (printBtn) printBtn.disabled = selectedCount === 0;
    }

    function buildCreditPaymentPrintSection(payment) {
      const sale = AppState.data.find(r => r.__backendId === payment.sale_id);
      const allPayments = getRecords('payment').filter(p => p.sale_id === payment.sale_id);
      const paidUntilThis = allPayments
        .filter(p => p.date <= payment.date)
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const remaining = Math.max(0, (sale?.sale_total || 0) - paidUntilThis);
      const isFullPayment = remaining <= 0;

      return `
        <section class="doc">
          <div class="header">
            <div class="company">${AppState.config.company_name}</div>
            <div>${AppState.config.company_slogan || ''}</div>
          </div>
          <div class="meta">
            <div>
              <div class="muted">CLIENTE</div>
              <div><strong>${payment.client_name || ''}</strong></div>
              <div class="muted">Factura: ${payment.invoice_number || ''}</div>
            </div>
            <div class="right">
              <div style="font-size: 20px; font-weight: bold; color: #f59e0b;">${isFullPayment ? 'RECIBO PAGO TOTAL' : 'RECIBO DE ABONO'}</div>
              <div class="muted">${fmt.dateTime(payment.date)}</div>
              <span class="badge ${isFullPayment ? '' : 'pending'}">${isFullPayment ? 'PAGO COMPLETO' : 'ABONO PARCIAL'}</span>
            </div>
          </div>
          <table>
            <tbody>
              <tr><th>Material</th><td>${sale?.material_name || ''}</td></tr>
              <tr><th>Monto abonado</th><td class="right"><strong>${fmt.currency(payment.amount || 0)}</strong></td></tr>
              <tr><th>Total factura</th><td class="right">${fmt.currency(sale?.sale_total || 0)}</td></tr>
              <tr><th>Falta por pagar</th><td class="right">${fmt.currency(remaining)}</td></tr>
              ${payment.method ? `<tr><th>Metodo</th><td>${payment.method}</td></tr>` : ''}
              ${payment.notes ? `<tr><th>Nota</th><td>${payment.notes}</td></tr>` : ''}
            </tbody>
          </table>
          <div class="center muted">Conserve este recibo como comprobante.</div>
        </section>
      `;
    }

    function buildConsolidatedCreditPaymentPrintSection(paymentsSelected) {
      const firstPayment = paymentsSelected[0] || {};
      const total = paymentsSelected.reduce((sum, payment) => sum + (payment.amount || 0), 0);
      const clientSales = getRecords('sale').filter(s => s.payment_type === 'credito' && s.client_name === firstPayment.client_name);
      const allPayments = getRecords('payment');
      const clientPending = clientSales.reduce((sum, sale) => {
        const paid = allPayments
          .filter(payment => payment.sale_id === sale.__backendId)
          .reduce((paymentSum, payment) => paymentSum + (payment.amount || 0), 0);
        return sum + Math.max(0, (sale.sale_total || 0) - paid);
      }, 0);
      return `
        <section class="doc">
          <div class="header">
            <div class="company">${AppState.config.company_name}</div>
            <div>${AppState.config.company_slogan || ''}</div>
          </div>
          <div class="meta">
            <div>
              <div class="muted">CLIENTE</div>
              <div><strong>${firstPayment.client_name || ''}</strong></div>
            </div>
            <div class="right">
              <div style="font-size: 22px; font-weight: bold; color: #f59e0b;">ABONOS SELECCIONADOS</div>
              <div class="muted">${fmt.dateTime(new Date().toISOString())}</div>
              <span class="badge">${paymentsSelected.length} abono(s)</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Fecha</th>
                <th>Material</th>
                <th class="right">Abono</th>
              </tr>
            </thead>
            <tbody>
              ${paymentsSelected.map(payment => {
                const sale = AppState.data.find(r => r.__backendId === payment.sale_id);
                const allPayments = getRecords('payment').filter(p => p.sale_id === payment.sale_id);
                const paidUntilThis = allPayments
                  .filter(p => p.date <= payment.date)
                  .reduce((sum, p) => sum + (p.amount || 0), 0);
                const remaining = Math.max(0, (sale?.sale_total || 0) - paidUntilThis);
                return `
                  <tr>
                    <td>${payment.invoice_number || ''}</td>
                    <td>${fmt.dateTime(payment.date)}</td>
                    <td>${sale?.material_name || ''}</td>
                    <td class="right">
                      <strong>${fmt.currency(payment.amount || 0)}</strong>
                      <div class="muted" style="font-size: 11px;">Falta por pagar: ${fmt.currency(remaining)}</div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div class="right">
            <div class="total">TOTAL ABONADO: ${fmt.currency(total)}</div>
            <div style="margin-top: 8px; font-size: 18px; font-weight: bold; color: #d97706;">FALTA POR PAGAR DEL CLIENTE: ${fmt.currency(clientPending)}</div>
          </div>
          <div class="center muted">Conserve este comprobante consolidado.</div>
        </section>
      `;
    }

    function buildConsolidatedCreditPaymentThermalText(paymentsSelected) {
      const h = BluetoothPrinter.helpers();
      const firstPayment = paymentsSelected[0] || {};
      const total = paymentsSelected.reduce((sum, payment) => sum + (payment.amount || 0), 0);
      const clientSales = getRecords('sale').filter(s => s.payment_type === 'credito' && s.client_name === firstPayment.client_name);
      const allPayments = getRecords('payment');
      const clientPending = clientSales.reduce((sum, sale) => {
        const paid = allPayments
          .filter(payment => payment.sale_id === sale.__backendId)
          .reduce((paymentSum, payment) => paymentSum + (payment.amount || 0), 0);
        return sum + Math.max(0, (sale.sale_total || 0) - paid);
      }, 0);

      return [
        ...BluetoothPrinter.thermalHeader('ABONOS SELECCIONADOS', paymentsSelected.length + ' ABONO(S)'),
        ...h.section('CLIENTE', h.wordWrap(firstPayment.client_name || '')),
        ...h.section('DETALLE'),
        ...paymentsSelected.flatMap(payment => {
          const sale = AppState.data.find(r => r.__backendId === payment.sale_id);
          const allPayments = getRecords('payment').filter(p => p.sale_id === payment.sale_id);
          const paidUntilThis = allPayments
            .filter(p => p.date <= payment.date)
            .reduce((sum, p) => sum + (p.amount || 0), 0);
          const remaining = Math.max(0, (sale?.sale_total || 0) - paidUntilThis);
          return [
            h.line,
            'Factura: ' + (payment.invoice_number || ''),
            'Fecha: ' + fmt.dateTime(payment.date),
            ...h.wordWrap(sale?.material_name || ''),
            h.item('Abono:', fmt.currency(payment.amount || 0)),
            h.item('Falta por pagar:', fmt.currency(remaining))
          ];
        }),
        h.thickLine,
        ...h.totalBlock('TOTAL ABONADO', fmt.currency(total)),
        h.item('Falta por pagar cliente:', fmt.currency(clientPending)),
        ...BluetoothPrinter.thermalFooter('COMPROBANTE CONSOLIDADO')
      ].filter(Boolean).join('\n');
    }

    function generateConsolidatedCreditPaymentPDF(paymentsSelected) {
      if (!window.jspdf?.jsPDF) {
        showToast('No se pudo cargar la libreria de PDF. Revisa tu conexion e intenta de nuevo.', 'error');
        return;
      }

      const { jsPDF } = window.jspdf;
      const printerType = getEffectivePrinterType();
      let format, pageWidth, pageHeight, isThermal, is58mm, formatLabel;

      switch (printerType) {
        case 'thermal_58':
          format = [58, 200]; pageWidth = 58; pageHeight = 200;
          isThermal = true; is58mm = true; formatLabel = 'Termica 58mm';
          break;
        case 'thermal_80':
          format = [80, 200]; pageWidth = 80; pageHeight = 200;
          isThermal = true; is58mm = false; formatLabel = 'Termica 80mm';
          break;
        case 'pdf':
        case 'standard':
        default:
          if (AppState.config.paper_size === 'a4') {
            format = 'a4'; pageWidth = 210; pageHeight = 297; formatLabel = 'A4';
          } else {
            format = 'letter'; pageWidth = 216; pageHeight = 279; formatLabel = 'Carta';
          }
          isThermal = false; is58mm = false;
          break;
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format });
      const margin = isThermal ? 3 : 20;
      const contentWidth = pageWidth - (margin * 2);
      const firstPayment = paymentsSelected[0] || {};
      const total = paymentsSelected.reduce((sum, payment) => sum + (payment.amount || 0), 0);
      const clientSales = getRecords('sale').filter(s => s.payment_type === 'credito' && s.client_name === firstPayment.client_name);
      const allPayments = getRecords('payment');
      const clientPending = clientSales.reduce((sum, sale) => {
        const paid = allPayments
          .filter(payment => payment.sale_id === sale.__backendId)
          .reduce((paymentSum, payment) => paymentSum + (payment.amount || 0), 0);
        return sum + Math.max(0, (sale.sale_total || 0) - paid);
      }, 0);
      let yPos = margin + 2;

      const addPageIfNeeded = (needed = 6) => {
        if (yPos + needed <= pageHeight - margin) return;
        doc.addPage();
        yPos = margin + 2;
      };
      const drawLine = (thick = false) => {
        addPageIfNeeded(4);
        doc.setDrawColor(isThermal ? 0 : 200, isThermal ? 0 : 200, isThermal ? 0 : 200);
        doc.setLineWidth(thick ? 0.5 : 0.2);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += isThermal ? 3 : 5;
      };

      if (AppState.config.company_logo) {
        try {
          const logoWidth = isThermal ? (is58mm ? 25 : 35) : 40;
          const logoHeight = logoWidth * 0.5;
          doc.addImage(AppState.config.company_logo, 'JPEG', pageWidth / 2 - logoWidth / 2, yPos, logoWidth, logoHeight);
          yPos += logoHeight + (isThermal ? 2 : 5);
        } catch (e) {}
      }

      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(isThermal ? 10 : 20);
      doc.text(isThermal ? String(AppState.config.company_name || '').toUpperCase() : AppState.config.company_name, pageWidth / 2, yPos, { align: 'center' });
      yPos += isThermal ? 4 : 8;

      doc.setFont(undefined, isThermal ? 'bold' : 'normal');
      doc.setFontSize(isThermal ? 7 : 10);
      doc.text(AppState.config.company_slogan || '', pageWidth / 2, yPos, { align: 'center' });
      yPos += isThermal ? 3 : 5;

      if (AppState.config.company_rfc) {
        doc.setFontSize(isThermal ? 6 : 8);
        doc.text('RNC: ' + AppState.config.company_rfc, pageWidth / 2, yPos, { align: 'center' });
        yPos += isThermal ? 3 : 4;
      }

      yPos += 2;
      drawLine(true);

      doc.setFont(undefined, 'bold');
      doc.setFontSize(isThermal ? 10 : 16);
      doc.setTextColor(isThermal ? 0 : 245, isThermal ? 0 : 158, isThermal ? 0 : 11);
      doc.text('ABONOS SELECCIONADOS', pageWidth / 2, yPos, { align: 'center' });
      yPos += isThermal ? 5 : 8;

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(isThermal ? 8 : 10);
      doc.setFont(undefined, isThermal ? 'bold' : 'normal');
      doc.text('Fecha: ' + fmt.dateTime(new Date().toISOString()), margin, yPos);
      yPos += isThermal ? 4 : 6;
      doc.text('Cliente: ' + (firstPayment.client_name || ''), margin, yPos);
      yPos += isThermal ? 4 : 6;
      doc.text(paymentsSelected.length + ' abono(s) seleccionado(s)', margin, yPos);
      yPos += isThermal ? 4 : 6;
      drawLine();

      if (isThermal) {
        doc.setFontSize(8);
        paymentsSelected.forEach(payment => {
          const sale = AppState.data.find(r => r.__backendId === payment.sale_id);
          const salePayments = getRecords('payment').filter(p => p.sale_id === payment.sale_id);
          const paidUntilThis = salePayments
            .filter(p => p.date <= payment.date)
            .reduce((sum, p) => sum + (p.amount || 0), 0);
          const remaining = Math.max(0, (sale?.sale_total || 0) - paidUntilThis);
          addPageIfNeeded(24);
          doc.setFont(undefined, 'bold');
          doc.text('Factura: ' + (payment.invoice_number || ''), margin, yPos);
          yPos += 4;
          doc.text('Fecha: ' + fmt.dateTime(payment.date), margin, yPos);
          yPos += 4;
          doc.splitTextToSize(String(sale?.material_name || '').toUpperCase(), contentWidth).forEach(line => {
            addPageIfNeeded(4);
            doc.text(line, margin, yPos);
            yPos += 4;
          });
          doc.text('Abono: ' + fmt.currency(payment.amount || 0), margin, yPos);
          yPos += 4;
          doc.text('Falta: ' + fmt.currency(remaining), margin, yPos);
          yPos += 4;
          drawLine();
        });
      } else {
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, yPos - 4, contentWidth, 8, 'F');
        doc.text('Factura', margin + 2, yPos);
        doc.text('Fecha', margin + 35, yPos);
        doc.text('Material', margin + 75, yPos);
        doc.text('Abono', pageWidth - margin, yPos, { align: 'right' });
        yPos += 8;
        doc.setFont(undefined, 'normal');
        paymentsSelected.forEach(payment => {
          const sale = AppState.data.find(r => r.__backendId === payment.sale_id);
          addPageIfNeeded(10);
          const material = doc.splitTextToSize(String(sale?.material_name || ''), 55)[0] || '';
          doc.text(String(payment.invoice_number || ''), margin + 2, yPos);
          doc.text(fmt.dateTime(payment.date), margin + 35, yPos);
          doc.text(material, margin + 75, yPos);
          doc.text(fmt.currency(payment.amount || 0), pageWidth - margin, yPos, { align: 'right' });
          yPos += 7;
        });
        drawLine();
      }

      addPageIfNeeded(isThermal ? 24 : 30);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(isThermal ? 12 : 14);
      doc.setTextColor(isThermal ? 0 : 245, isThermal ? 0 : 158, isThermal ? 0 : 11);
      doc.text('TOTAL ABONADO:', isThermal ? margin : pageWidth - margin - 65, yPos);
      doc.text(fmt.currency(total), pageWidth - margin, yPos, { align: 'right' });
      yPos += isThermal ? 5 : 8;
      doc.setFontSize(isThermal ? 8 : 11);
      doc.setTextColor(217, 119, 6);
      doc.text('Falta por pagar cliente:', isThermal ? margin : pageWidth - margin - 65, yPos);
      doc.text(fmt.currency(clientPending), pageWidth - margin, yPos, { align: 'right' });

      doc.setTextColor(0, 0, 0);
      yPos += isThermal ? 8 : 15;
      drawLine(true);
      doc.setFontSize(isThermal ? 8 : 9);
      doc.setTextColor(isThermal ? 0 : 100, isThermal ? 0 : 100, isThermal ? 0 : 100);
      doc.text('COMPROBANTE CONSOLIDADO', pageWidth / 2, yPos, { align: 'center' });

      const fileName = 'abonos_credito_seleccionados_' + (isThermal ? (is58mm ? '58mm' : '80mm') : formatLabel) + '.pdf';
      doc.save(fileName);
      showToast('PDF descargado: Abonos seleccionados (' + formatLabel + ')');
    }

    function printSelectedCreditPayments() {
      const selectedIds = Array.from(document.querySelectorAll('.credit-payment-check:checked')).map(cb => cb.id.replace('paychk_', ''));
      if (selectedIds.length === 0) {
        showToast('No hay abonos seleccionados', 'error');
        return;
      }

      const selectedPayments = selectedIds
        .map(id => AppState.data.find(r => r.__backendId === id))
        .filter(Boolean);

      if (isBluetoothPrinterSelected()) {
        BluetoothPrinter.printText(buildConsolidatedCreditPaymentThermalText(selectedPayments))
          .then(() => showToast('Abonos seleccionados enviados por Bluetooth', 'success'))
          .catch(err => {
            console.error(err);
            showToast('No se pudo imprimir por Bluetooth', 'error');
          });
        return;
      }

      const printerType = getEffectivePrinterType();
      if (printerType === 'pdf' || printerType === 'thermal_80' || printerType === 'thermal_58') {
        generateConsolidatedCreditPaymentPDF(selectedPayments);
        return;
      }

      openCombinedCreditPrint('Abonos seleccionados', [buildConsolidatedCreditPaymentPrintSection(selectedPayments)], buildConsolidatedCreditPaymentThermalText(selectedPayments));
    }

    function paySelectedInvoices(clientName) {
      const sales = getRecords('sale').filter(s => s.payment_type === 'credito' && s.client_name === clientName);
      const payments = getRecords('payment');
      const clientArg = JSON.stringify(clientName);

      const selectedSales = [];
      let totalAmount = 0;

      sales.forEach(s => {
        const checkbox = document.getElementById(`chk_${s.__backendId}`);
        if (checkbox && checkbox.checked) {
          const salePayments = payments.filter(p => p.sale_id === s.__backendId);
          const paidAmount = salePayments.reduce((sum, p) => sum + p.amount, 0);
          const remaining = (s.sale_total || 0) - paidAmount;

          selectedSales.push({
            sale: s,
            remaining: remaining
          });
          totalAmount += remaining;
        }
      });

      if (selectedSales.length === 0) {
        showToast('No hay facturas seleccionadas', 'error');
        return;
      }

      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-100">Pago Multiple de Facturas</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 mb-6">
            <div class="text-sm text-emerald-400 font-medium mb-2">Resumen de pago:</div>
            <div class="text-2xl font-bold text-emerald-400 font-mono mb-1">${fmt.currency(totalAmount)}</div>
            <div class="text-xs text-slate-400">${selectedSales.length} factura(s) seleccionada(s)</div>
          </div>

          <div class="max-h-48 overflow-y-auto mb-4 space-y-2">
            ${selectedSales.map(item => `
              <div class="flex items-center justify-between p-2 bg-slate-800/30 rounded text-sm">
                <span class="text-slate-300">${item.sale.invoice_number}</span>
                <span class="font-mono text-rose-400">${fmt.currency(item.remaining)}</span>
              </div>
            `).join('')}
          </div>

          <form onsubmit="processMultiplePayment(event, ${clientArg})" data-credit-submit="multiple-payment" data-client="${escapeAttr(clientName)}" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Metodo de Pago</label>
              <select id="multiPaymentMethod" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Notas (opcional)</label>
              <input type="text" id="multiPaymentNotes" placeholder="Referencia de pago multiple"
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
            </div>

            <div class="flex gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" class="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-emerald-500/20 flex items-center justify-center gap-2">
                <i data-lucide="check-circle" class="w-5 h-5"></i> Confirmar Pago
              </button>
            </div>
          </form>
        </div>
      `);
    }

    async function processMultiplePayment(e, clientName) {
      e.preventDefault();

      const method = document.getElementById('multiPaymentMethod').value;
      const notes = document.getElementById('multiPaymentNotes').value.trim();

      const sales = getRecords('sale').filter(s => s.payment_type === 'credito' && s.client_name === clientName);
      const payments = getRecords('payment');

      const selectedSales = [];

      sales.forEach(s => {
        const checkbox = document.getElementById(`chk_${s.__backendId}`);
        if (checkbox && checkbox.checked) {
          const salePayments = payments.filter(p => p.sale_id === s.__backendId);
          const paidAmount = salePayments.reduce((sum, p) => sum + p.amount, 0);
          const remaining = (s.sale_total || 0) - paidAmount;

          selectedSales.push({
            sale: s,
            remaining: remaining
          });
        }
      });

      try {
        let totalPaid = 0;

        selectedSales.forEach(item => {
          const paymentData = {
            type: 'payment',
            sale_id: item.sale.__backendId,
            client_name: clientName,
            invoice_number: item.sale.invoice_number,
            amount: item.remaining,
            method: method,
            notes: notes || 'Pago multiple de facturas',
            date: new Date().toISOString(),
            is_multiple_payment: true,
            __backendId: 'pay_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
          };

          AppState.data.push(paymentData);

          // Actualizar venta
          item.sale.payment_status = 'pagada';
          item.sale.remaining_balance = 0;
          item.sale.amount_paid = item.sale.sale_total;

          // Actualizar factura relacionada
          const invoice = AppState.data.find(r => r.type === 'invoice' && r.invoice_number === item.sale.invoice_number);
          if (invoice) {
            invoice.payment_status = 'pagada';
          }

          totalPaid += item.remaining;
        });

        AppState.saveUserData();

        showToast(`Pago multiple procesado: ${fmt.currency(totalPaid)} por ${selectedSales.length} facturas`, 'success');

        setTimeout(() => {
          if (confirm('Deseas imprimir el recibo de pago multiple?')) {
            printMultiplePaymentReceipt(selectedSales, totalPaid, method, notes);
          }
        }, 300);

        closeModal();
        renderPage();

      } catch (err) {
        showToast('Error al procesar el pago multiple', 'error');
        console.error(err);
      }
    }

    function showPartialPaymentModal(clientName) {
      const sales = getRecords('sale').filter(s => s.payment_type === 'credito' && s.client_name === clientName);
      const payments = getRecords('payment');
      const clientArg = JSON.stringify(clientName);

      const selectedSales = [];
      let totalPending = 0;

      sales.forEach(s => {
        const checkbox = document.getElementById(`chk_${s.__backendId}`);
        if (checkbox && checkbox.checked) {
          const salePayments = payments.filter(p => p.sale_id === s.__backendId);
          const paidAmount = salePayments.reduce((sum, p) => sum + p.amount, 0);
          const remaining = (s.sale_total || 0) - paidAmount;

          selectedSales.push({
            sale: s,
            remaining: remaining,
            paidAmount: paidAmount
          });
          totalPending += remaining;
        }
      });

      if (selectedSales.length === 0) {
        showToast('No hay facturas seleccionadas', 'error');
        return;
      }

      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-100">Abono a Facturas Seleccionadas</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="bg-primary-500/10 border border-primary-500/20 rounded-lg p-4 mb-6">
            <div class="text-sm text-primary-400 font-medium mb-2">Monto total pendiente:</div>
            <div class="text-2xl font-bold text-primary-400 font-mono">${fmt.currency(totalPending)}</div>
            <div class="text-xs text-slate-400">${selectedSales.length} factura(s) seleccionada(s)</div>
          </div>

          <div class="max-h-48 overflow-y-auto mb-4 space-y-2">
            ${selectedSales.map(item => `
              <div class="flex items-center justify-between p-2 bg-slate-800/30 rounded text-sm">
                <div>
                  <span class="text-slate-300">${item.sale.invoice_number}</span>
                  <span class="text-slate-500 text-xs ml-2">(Resta: ${fmt.currency(item.remaining)})</span>
                </div>
                <span class="text-xs text-slate-500">Seleccionada</span>
              </div>
            `).join('')}
          </div>

          <div class="p-3 bg-slate-800/50 rounded-lg mb-4">
            <label class="block text-sm font-medium text-slate-400 mb-2">Monto del abono</label>
            <input type="number" id="partialTotalAmount" step="0.01" min="0.01" max="${totalPending}" value="${totalPending.toFixed(2)}"
              oninput="updatePartialTotal(${totalPending})"
              class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
            <div class="flex items-center justify-between mt-2">
              <span class="text-xs text-slate-500">Maximo: ${fmt.currency(totalPending)}</span>
              <span id="partialTotalDisplay" class="text-sm font-bold text-emerald-400 font-mono">${fmt.currency(totalPending)}</span>
            </div>
          </div>

          <form onsubmit="processPartialMultiplePayment(event, ${clientArg})" data-credit-submit="partial-multiple-payment" data-client="${escapeAttr(clientName)}" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Metodo de Pago</label>
              <select id="partialMultiPaymentMethod" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Notas (opcional)</label>
              <input type="text" id="partialMultiPaymentNotes" placeholder="Referencia de abono"
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
            </div>

            <div class="flex gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" class="flex-1 px-4 py-3 bg-primary-500 hover:bg-primary-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20 flex items-center justify-center gap-2">
                <i data-lucide="plus-circle" class="w-5 h-5"></i> Registrar Abono
              </button>
            </div>
          </form>
        </div>
      `);

      setTimeout(() => updatePartialTotal(totalPending), 100);
    }

    function updatePartialTotal(maxTotal) {
      const input = document.getElementById('partialTotalAmount');
      let total = parseFloat(input?.value || 0) || 0;
      if (input && total > maxTotal) {
        total = maxTotal;
        input.value = maxTotal.toFixed(2);
      }

      const display = document.getElementById('partialTotalDisplay');
      if (display) {
        display.textContent = fmt.currency(total);
      }
    }

    async function processPartialMultiplePayment(e, clientName) {
      e.preventDefault();

      const method = document.getElementById('partialMultiPaymentMethod').value;
      const notes = document.getElementById('partialMultiPaymentNotes').value.trim();
      let amountToApply = parseFloat(document.getElementById('partialTotalAmount')?.value || 0) || 0;

      const sales = getRecords('sale').filter(s => s.payment_type === 'credito' && s.client_name === clientName);
      const payments = getRecords('payment');

      try {
        let totalAbonado = 0;
        const processedSales = [];

        sales.forEach(s => {
          if (amountToApply <= 0) return;

          const checkbox = document.getElementById(`chk_${s.__backendId}`);
          if (checkbox && checkbox.checked) {
            const salePaymentsBefore = payments.filter(p => p.sale_id === s.__backendId);
            const paidBefore = salePaymentsBefore.reduce((sum, p) => sum + p.amount, 0);
            const pendingBefore = Math.max(0, (s.sale_total || 0) - paidBefore);
            const amount = Math.min(amountToApply, pendingBefore);

            if (amount > 0) {
              const paymentData = {
                type: 'payment',
                sale_id: s.__backendId,
                client_name: clientName,
                invoice_number: s.invoice_number,
                amount: amount,
                method: method,
                notes: notes || 'Abono multiple',
                date: new Date().toISOString(),
                is_partial_multiple: true,
                __backendId: 'pay_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
              };

              AppState.data.push(paymentData);
              payments.push(paymentData);
              amountToApply -= amount;

              // Actualizar saldo de la venta
              const currentPayments = payments.filter(p => p.sale_id === s.__backendId);
              const totalPaid = currentPayments.reduce((sum, p) => sum + p.amount, 0);
              const remaining = (s.sale_total || 0) - totalPaid;

              s.amount_paid = totalPaid;
              s.remaining_balance = Math.max(0, remaining);

              if (remaining <= 0) {
                s.payment_status = 'pagada';
                const invoice = AppState.data.find(r => r.type === 'invoice' && r.invoice_number === s.invoice_number);
                if (invoice) invoice.payment_status = 'pagada';
              } else {
                s.payment_status = 'pendiente';
                const invoice = AppState.data.find(r => r.type === 'invoice' && r.invoice_number === s.invoice_number);
                if (invoice) invoice.payment_status = 'pendiente';
              }

              totalAbonado += amount;
              processedSales.push({ sale: s, amount: amount, remaining: Math.max(0, remaining) });
            }
          }
        });

        if (processedSales.length === 0) {
          showToast('Ingresa un monto mayor a cero para abonar', 'error');
          return;
        }

        AppState.saveUserData();

        showToast(`Abono de ${fmt.currency(totalAbonado)} registrado en ${processedSales.length} facturas`, 'success');
        closeModal();
        renderPage();

      } catch (err) {
        showToast('Error al procesar el abono multiple', 'error');
        console.error(err);
      }
    }

    async function printMultiplePaymentReceipt(selectedSales, total, method, notes) {
      const printerType = isBluetoothPrinterSelected() ? 'standard' : getEffectivePrinterType();

      if (isBluetoothPrinterSelected()) {
        try {
          await BluetoothPrinter.printText(BluetoothPrinter.buildMultiplePaymentText(selectedSales, total, method, notes));
          showToast('Recibo multiple enviado directo por Bluetooth', 'success');
          return;
        } catch (err) {
          showToast('No se pudo imprimir directo por Bluetooth. Se abrira impresion normal.', 'warning');
        }
      }

      // Si es termica o PDF: generar PDF descargable
      if (printerType === 'pdf' || printerType === 'thermal_80' || printerType === 'thermal_58') {
        generateMultiplePaymentPDF(selectedSales, total, method, notes);
        return;
      }

      const isThermal = false;
      const is58mm = printerType === 'thermal_58';
      const width = is58mm ? '58mm' : isThermal ? '80mm' : '210mm';

      const thermalStyles = isThermal ? `
        <style>
          @page { size: ${width} auto; margin: 0; }
          body { width: ${width}; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; padding: 5mm; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 5px 0; }
          .item { display: flex; justify-content: space-between; }
          .total { font-size: 14px; font-weight: bold; }
        </style>
      ` : `
        <style>
          @page { size: letter; margin: 20mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 30px; }
          .company { font-size: 24px; font-weight: bold; color: #f59e0b; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          .total { text-align: right; font-size: 18px; font-weight: bold; color: #059669; }
        </style>
      `;

      const content = isThermal ? `
        <div class="center bold" style="font-size: 14px;">${AppState.config.company_name}</div>
        <div class="center">${AppState.config.company_slogan}</div>
        <div class="line"></div>
        <div class="center bold">RECIBO DE PAGO MULTIPLE</div>
        <div class="line"></div>
        <div>Fecha: ${fmt.dateTime(new Date().toISOString())}</div>
        <div>Cliente: ${selectedSales[0].sale.client_name}</div>
        <div>Metodo: ${method.toUpperCase()}</div>
        ${notes ? `<div>Nota: ${notes}</div>` : ''}
        <div class="line"></div>
        <div class="bold">Facturas pagadas:</div>
        ${selectedSales.map(item => `
          <div class="item">
            <span>${item.sale.invoice_number}</span>
            <span>${fmt.currency(item.remaining)}</span>
          </div>
        `).join('')}
        <div class="line"></div>
        <div class="item total">
          <span>TOTAL:</span>
          <span>${fmt.currency(total)}</span>
        </div>
        <div class="line"></div>
        <div class="center" style="font-size: 10px; margin-top: 20px;">
          Gracias por su pago
        </div>
      ` : `
        <div class="header">
          <div class="company">${AppState.config.company_name}</div>
          <div>${AppState.config.company_slogan}</div>
        </div>
        <h2 style="text-align: center; color: #059669;">RECIBO DE PAGO MULTIPLE</h2>
        <p><strong>Fecha:</strong> ${fmt.dateTime(new Date().toISOString())}</p>
        <p><strong>Cliente:</strong> ${selectedSales[0].sale.client_name}</p>
        <p><strong>Metodo:</strong> ${method.toUpperCase()}</p>
        ${notes ? `<p><strong>Notas:</strong> ${notes}</p>` : ''}
        <table>
          <thead>
            <tr>
              <th>Factura</th>
              <th>Material</th>
              <th style="text-align: right;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${selectedSales.map(item => `
              <tr>
                <td>${item.sale.invoice_number}</td>
                <td>${item.sale.material_name}</td>
                <td style="text-align: right;">${fmt.currency(item.remaining)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="total">TOTAL PAGADO: ${fmt.currency(total)}</div>
      `;

      openPrintDocument(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Recibo Pago Multiple</title>
            ${thermalStyles}
          <base target="_blank">
</head>
          <body onload="window.print(); window.close();">
            ${content}
          </body>
        </html>
      `, { autoClose: true });
    }

    
    function renderDailyMeters(container) {
      const sales = getRecords('sale');
      const materials = getRecords('material');

      // Aplicar filtros de fecha si existen
      let filteredSales = sales;
      if (AppState.dailyMetersFilters.search) {
        const search = AppState.dailyMetersFilters.search.toLowerCase();
        filteredSales = filteredSales.filter(s => 
          (s.client_name?.toLowerCase() || '').includes(search) ||
          (s.material_name?.toLowerCase() || '').includes(search) ||
          (s.invoice_number?.toLowerCase() || '').includes(search) ||
          (s.vehicle_plate?.toLowerCase() || '').includes(search)
        );
      }
      if (AppState.dailyMetersFilters.dateFrom || AppState.dailyMetersFilters.dateTo) {
        filteredSales = filteredSales.filter(s => matchesDateFilter(s.date, AppState.dailyMetersFilters.dateFrom, AppState.dailyMetersFilters.dateTo));
      }

      // Agrupar ventas por dia
      const dailyData = {};

      filteredSales.forEach(s => {
        const day = s.date ? s.date.split('T')[0] : 'sin-fecha';
        if (!dailyData[day]) {
          dailyData[day] = {
            date: day,
            totalMeters: 0,
            totalAmount: 0,
            transactions: [],
            byMaterial: {}
          };
        }

        const qty = s.sale_quantity || 0;
        const total = s.sale_total || 0;
        const matName = s.material_name || 'Desconocido';

        dailyData[day].totalMeters += qty;
        dailyData[day].totalAmount += total;
        dailyData[day].transactions.push(s);

        // Agrupar por material
        if (!dailyData[day].byMaterial[matName]) {
          dailyData[day].byMaterial[matName] = {
            quantity: 0,
            amount: 0,
            count: 0
          };
        }
        dailyData[day].byMaterial[matName].quantity += qty;
        dailyData[day].byMaterial[matName].amount += total;
        dailyData[day].byMaterial[matName].count += 1;
      });

      // Convertir a array y ordenar por fecha descendente
      const sortedDays = Object.values(dailyData).sort((a, b) => b.date.localeCompare(a.date));

      // Calcular totales generales
      const grandTotalMeters = sortedDays.reduce((sum, d) => sum + d.totalMeters, 0);
      const grandTotalAmount = sortedDays.reduce((sum, d) => sum + d.totalAmount, 0);
      const totalTransactions = filteredSales.length;

      // Agrupar por material global
      const globalByMaterial = {};
      filteredSales.forEach(s => {
        const mat = s.material_name || 'Desconocido';
        if (!globalByMaterial[mat]) {
          globalByMaterial[mat] = { quantity: 0, amount: 0, count: 0 };
        }
        globalByMaterial[mat].quantity += (s.sale_quantity || 0);
        globalByMaterial[mat].amount += (s.sale_total || 0);
        globalByMaterial[mat].count += 1;
      });

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 class="text-2xl font-bold text-slate-100">Reporte de Metros Diarios</h2>
              <p class="text-slate-500 text-sm mt-1">Detalle de salidas por dia y material</p>
            </div>
            <div class="flex gap-2">
              <button onclick="exportDailyMetersReport()" class="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm font-medium">
                <i data-lucide="download" class="w-4 h-4"></i> Exportar Excel
              </button>
              <button onclick="printDailyMetersReport()" class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-400 text-slate-900 font-semibold rounded-lg transition-all">
                <i data-lucide="printer" class="w-4 h-4"></i> Imprimir
              </button>
            </div>
          </div>

          <!-- FILTROS DE FECHA -->
          <div class="glass rounded-xl p-4 border border-slate-700/50">
            <div class="flex items-center gap-2 mb-4 text-primary-400">
              <i data-lucide="filter" class="w-4 h-4"></i>
              <span class="text-sm font-medium">Filtrar por Fecha</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div class="md:col-span-2">
                <label class="block text-xs text-slate-500 mb-1">Buscar</label>
                <div class="relative">
                  <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-2.5"></i>
                  <input type="text" id="dailyMetersFilterSearch" value="${AppState.dailyMetersFilters.search || ''}" oninput="updateDailyMetersFilters()" placeholder="Cliente, material, factura..."
                    class="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                </div>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Desde</label>
                <input type="date" id="dailyMetersDateFrom" value="${AppState.dailyMetersFilters.dateFrom}" onchange="updateDailyMetersFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Hasta</label>
                <input type="date" id="dailyMetersDateTo" value="${AppState.dailyMetersFilters.dateTo}" onchange="updateDailyMetersFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Periodo rapido</label>
                <select id="dailyMetersQuickFilter" onchange="setDailyMetersQuickFilter(this.value)"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus select-custom">
                  <option value="" ${!AppState.dailyMetersFilters.quickPeriod ? 'selected' : ''}>Seleccionar</option>
                  <option value="today" ${AppState.dailyMetersFilters.quickPeriod === 'today' ? 'selected' : ''}>Hoy</option>
                  <option value="week" ${AppState.dailyMetersFilters.quickPeriod === 'week' ? 'selected' : ''}>Semana</option>
                  <option value="month" ${AppState.dailyMetersFilters.quickPeriod === 'month' ? 'selected' : ''}>Mes</option>
                </select>
              </div>
              <div class="flex items-end">
                <button onclick="clearDailyMetersFilters()" class="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1">
                  <i data-lucide="x-circle" class="w-3 h-3"></i> Limpiar
                </button>
              </div>
            </div>
            ${AppState.dailyMetersFilters.dateFrom || AppState.dailyMetersFilters.dateTo ? `
              <div class="mt-3 flex items-center gap-2">
                <span class="text-xs text-slate-500">- Mostrando ${filteredSales.length} de ${sales.length} ventas</span>
              </div>
            ` : ''}
          </div>

          <!-- RESUMEN GENERAL -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="glass rounded-xl p-5 border-l-4 border-primary-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Total Metros3</div>
              <div class="text-2xl font-bold text-primary-400 font-mono">${fmt.number(grandTotalMeters, 2)}</div>
              <div class="text-xs text-slate-500 mt-1">Volumen total vendido</div>
            </div>
            <div class="glass rounded-xl p-5 border-l-4 border-emerald-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Ingresos Totales</div>
              <div class="text-2xl font-bold text-emerald-400 font-mono">${fmt.currency(grandTotalAmount)}</div>
              <div class="text-xs text-slate-500 mt-1">${totalTransactions} ventas</div>
            </div>
            <div class="glass rounded-xl p-5 border-l-4 border-blue-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Promedio Diario</div>
              <div class="text-2xl font-bold text-blue-400 font-mono">${sortedDays.length > 0 ? fmt.number(grandTotalMeters / sortedDays.length, 2) : '0.00'}</div>
              <div class="text-xs text-slate-500 mt-1">Metros3 por dia</div>
            </div>
            <div class="glass rounded-xl p-5 border-l-4 border-purple-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-2">Dias con Venta</div>
              <div class="text-2xl font-bold text-purple-400 font-mono">${sortedDays.length}</div>
              <div class="text-xs text-slate-500 mt-1">Dias registrados</div>
            </div>
          </div>

          <!-- RESUMEN POR MATERIAL -->
          <div class="glass rounded-xl p-6">
            <h3 class="font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <i data-lucide="package" class="w-5 h-5 text-primary-400"></i> Resumen por Material
            </h3>
            <div class="overflow-x-auto">
              <table class="w-full data-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th class="text-right">Total Metros3</th>
                    <th class="text-right">Total Ventas</th>
                    <th class="text-right">Monto Total</th>
                    <th class="text-right">Promedio/Venta</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(globalByMaterial).sort((a, b) => b[1].quantity - a[1].quantity).map(([mat, data]) => `
                    <tr>
                      <td class="font-medium text-slate-200">${mat}</td>
                      <td class="text-right font-mono text-primary-400">${fmt.number(data.quantity, 2)}</td>
                      <td class="text-right font-mono text-slate-300">${data.count}</td>
                      <td class="text-right font-mono text-emerald-400">${fmt.currency(data.amount)}</td>
                      <td class="text-right font-mono text-slate-400">${fmt.number(data.quantity / data.count, 2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- DETALLE DIARIO -->
          <div class="space-y-4">
            <h3 class="font-semibold text-slate-200 flex items-center gap-2">
              <i data-lucide="calendar" class="w-5 h-5 text-primary-400"></i> Detalle por Dia
            </h3>

            ${sortedDays.length === 0 ? `
              <div class="glass rounded-xl p-12 text-center">
                <i data-lucide="ruler" class="w-16 h-16 text-slate-600 mx-auto mb-4"></i>
                <h3 class="text-lg font-semibold text-slate-300 mb-2">Sin Datos</h3>
                <p class="text-slate-500">No hay ventas registradas para generar el reporte de metros diarios</p>
              </div>
            ` : sortedDays.map(day => {
              const dateObj = new Date(day.date + 'T00:00:00');
              const dateStr = dateObj.toLocaleDateString('es-MX', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              });

              return `
                <div class="glass rounded-xl overflow-hidden hover-lift">
                  <div class="bg-gradient-to-r from-slate-800 to-slate-900 p-4 border-b border-slate-700">
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                          <i data-lucide="calendar" class="w-5 h-5 text-primary-400"></i>
                        </div>
                        <div>
                          <h4 class="font-semibold text-slate-200 capitalize">${dateStr}</h4>
                          <p class="text-xs text-slate-500">${day.transactions.length} transacciones</p>
                        </div>
                      </div>
                      <div class="flex gap-4 text-right">
                        <div>
                          <div class="text-xs text-slate-500">Metros3</div>
                          <div class="text-xl font-bold text-primary-400 font-mono">${fmt.number(day.totalMeters, 2)}</div>
                        </div>
                        <div>
                          <div class="text-xs text-slate-500">Total</div>
                          <div class="text-xl font-bold text-emerald-400 font-mono">${fmt.currency(day.totalAmount)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="p-4">
                    <!-- Resumen por material del dia -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      ${Object.entries(day.byMaterial).map(([mat, data]) => `
                        <div class="bg-slate-800/30 rounded-lg p-3 border border-slate-700/50">
                          <div class="text-xs text-slate-500 mb-1">${mat}</div>
                          <div class="flex justify-between items-center">
                            <span class="font-mono text-primary-400 font-semibold">${fmt.number(data.quantity, 2)}</span>
                            <span class="text-xs text-slate-600">${data.count} ventas</span>
                          </div>
                        </div>
                      `).join('')}
                    </div>

                    <!-- Tabla detallada de transacciones -->
                    <div class="overflow-x-auto">
                      <table class="w-full data-table text-sm">
                        <thead>
                          <tr>
                            <th>Hora</th>
                            <th>Cliente</th>
                            <th>Material</th>
                            <th class="text-right">Cantidad</th>
                            <th class="text-right">Precio Unit.</th>
                            <th class="text-right">Total</th>
                            <th>Factura</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${day.transactions.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(t => {
                            const time = t.date ? new Date(t.date).toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                            return `
                              <tr>
                                <td class="text-slate-500 font-mono">${time}</td>
                                <td class="text-slate-300">${t.client_name}</td>
                                <td class="text-slate-300">${t.material_name}</td>
                                <td class="text-right font-mono text-primary-400">${fmt.number(t.sale_quantity, 2)}</td>
                                <td class="text-right font-mono text-slate-400">${fmt.currency(t.price)}</td>
                                <td class="text-right font-mono text-emerald-400">${fmt.currency(t.sale_total)}</td>
                                <td class="font-mono text-xs text-primary-400">${t.invoice_number}</td>
                              </tr>
                            `;
                          }).join('')}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      lucide.createIcons();
    }

    function updateDailyMetersFilters() {
      AppState.dailyMetersFilters.search = document.getElementById('dailyMetersFilterSearch')?.value || '';
      AppState.dailyMetersFilters.dateFrom = document.getElementById('dailyMetersDateFrom').value;
      AppState.dailyMetersFilters.dateTo = document.getElementById('dailyMetersDateTo').value;
      AppState.dailyMetersFilters.quickPeriod = '';
      renderFilterPage('dailyMetersFilterSearch');
    }

    function setDailyMetersQuickFilter(period) {
      const today = new Date();
      const formatDate = (d) => d.toISOString().split('T')[0];

      let fromDate, toDate;

      switch(period) {
        case '':
          AppState.dailyMetersFilters.quickPeriod = '';
          AppState.dailyMetersFilters.dateFrom = '';
          AppState.dailyMetersFilters.dateTo = '';
          renderPage();
          return;
        case 'today':
          fromDate = toDate = formatDate(today);
          break;
        case 'week':
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          fromDate = formatDate(weekStart);
          toDate = formatDate(today);
          break;
        case 'month':
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          fromDate = formatDate(monthStart);
          toDate = formatDate(today);
          break;
        default:
          return;
      }

      AppState.dailyMetersFilters.quickPeriod = period;
      AppState.dailyMetersFilters.dateFrom = fromDate;
      AppState.dailyMetersFilters.dateTo = toDate;
      renderPage();
    }

    function clearDailyMetersFilters() {
      AppState.dailyMetersFilters = { search: '', dateFrom: '', dateTo: '', quickPeriod: '' };
      renderPage();
    }

    function exportDailyMetersReport() {
      if (!window.XLSX) {
        showExcelLibraryError();
        return;
      }

      let sales = getRecords('sale');
      if (AppState.dailyMetersFilters.search) {
        const search = AppState.dailyMetersFilters.search.toLowerCase();
        sales = sales.filter(s =>
          (s.client_name?.toLowerCase() || '').includes(search) ||
          (s.material_name?.toLowerCase() || '').includes(search) ||
          (s.invoice_number?.toLowerCase() || '').includes(search) ||
          (s.vehicle_plate?.toLowerCase() || '').includes(search)
        );
      }
      if (AppState.dailyMetersFilters.dateFrom || AppState.dailyMetersFilters.dateTo) {
        sales = sales.filter(s => matchesDateFilter(s.date, AppState.dailyMetersFilters.dateFrom, AppState.dailyMetersFilters.dateTo));
      }

      const sortedSales = sales.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      const rows = [
        ['FECHA', 'HORA', 'CLIENTE', 'MATERIAL', 'METROS', 'PRECIO', 'TOTAL', 'FACTURA', 'TIPO_PAGO'],
        ...sortedSales.map(s => {
          const date = new Date(s.date);
          const fecha = Number.isNaN(date.getTime()) ? (s.date || '') : date.toLocaleDateString('es-DO');
          const hora = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true });
          return [
            fecha,
            hora,
            s.client_name || '',
            s.material_name || '',
            Number(s.sale_quantity) || 0,
            Number(s.price) || 0,
            Number(s.sale_total) || 0,
            s.invoice_number || '',
            s.payment_type === 'credito' ? 'credito' : 'contado'
          ];
        }),
        [`TOTAL METROS: ${fmt.number(sortedSales.reduce((a, s) => a + (Number(s.sale_quantity) || 0), 0), 2)} m3`]
      ];

      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      const lastDataRow = sortedSales.length + 1;
      const totalRow = sortedSales.length + 2;
      sheet['!cols'] = [
        { wch: 13 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 12 },
        { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }
      ];
      sheet['!merges'] = [
        { s: { r: totalRow - 1, c: 0 }, e: { r: totalRow - 1, c: 8 } }
      ];

      const headerBlue = '2E95D1';
      const totalBlue = '14587A';
      const totalGreen = 'A7E8C1';
      const creditYellow = 'FFE699';
      const cashGreen = 'B7E1CD';
      const rowGray = 'EDEFF2';
      const border = { style: 'thin', color: { rgb: 'D1D5DB' } };
      const baseBorder = { top: border, bottom: border, left: border, right: border };
      const center = { horizontal: 'center', vertical: 'center', wrapText: true };
      const applyStyle = (addr, style) => {
        if (!sheet[addr]) sheet[addr] = { t: 's', v: '' };
        sheet[addr].s = style;
      };
      const rangeStyle = (range, style) => {
        const decoded = XLSX.utils.decode_range(range);
        for (let r = decoded.s.r; r <= decoded.e.r; r++) {
          for (let c = decoded.s.c; c <= decoded.e.c; c++) {
            applyStyle(XLSX.utils.encode_cell({ r, c }), style);
          }
        }
      };
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
        fill: { fgColor: { rgb: headerBlue } },
        alignment: center,
        border: baseBorder
      };
      const bodyStyle = {
        font: { bold: true, color: { rgb: '1F2937' } },
        alignment: center,
        border: baseBorder
      };
      const altBodyStyle = {
        ...bodyStyle,
        fill: { fgColor: { rgb: rowGray } }
      };
      const totalValueStyle = {
        font: { bold: true, color: { rgb: '1F2937' } },
        fill: { fgColor: { rgb: totalGreen } },
        alignment: center,
        border: baseBorder,
        numFmt: '#,##0.00'
      };
      const totalRowStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 },
        fill: { fgColor: { rgb: totalBlue } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: baseBorder
      };
      rangeStyle('A1:I1', headerStyle);
      for (let row = 2; row <= lastDataRow; row++) {
        const style = row % 2 === 0 ? altBodyStyle : bodyStyle;
        rangeStyle(`A${row}:I${row}`, style);
        rangeStyle(`G${row}:G${row}`, totalValueStyle);
        const paymentCell = `I${row}`;
        const paymentValue = String(sheet[paymentCell]?.v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        applyStyle(paymentCell, {
          ...bodyStyle,
          fill: { fgColor: { rgb: paymentValue.includes('cr') ? creditYellow : cashGreen } }
        });
      }
      rangeStyle(`A${totalRow}:I${totalRow}`, totalRowStyle);
      sheet['!autofilter'] = { ref: `A1:I${Math.max(lastDataRow, 1)}` };
      sheet['!rows'] = [{ hpt: 24 }];

      XLSX.utils.book_append_sheet(workbook, sheet, 'Metros diarios');
      XLSX.writeFile(workbook, `reporte_metros_diarios_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Reporte de metros diarios exportado en Excel');
    }

    async function printDailyMetersReport() {
      if (isBluetoothPrinterSelected()) {
        try {
          await BluetoothPrinter.printText(BluetoothPrinter.buildDailyMetersReportText());
          showToast('Reporte enviado por Bluetooth', 'success');
          return;
        } catch (err) {
          showToast('No se pudo imprimir directo por Bluetooth. Se abrira impresion normal.', 'warning');
        }
      }

      const sales = getRecords('sale');
      const dailyData = {};

      sales.forEach(s => {
        const day = s.date ? s.date.split('T')[0] : 'sin-fecha';
        if (!dailyData[day]) {
          dailyData[day] = { transactions: [], totalMeters: 0, totalAmount: 0 };
        }
        dailyData[day].transactions.push(s);
        dailyData[day].totalMeters += (s.sale_quantity || 0);
        dailyData[day].totalAmount += (s.sale_total || 0);
      });

      const content = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Reporte de Metros Diarios - ${AppState.config.company_name}</title>
            <style>
              @page { size: letter; margin: 15mm; }
              body { font-family: Arial, sans-serif; font-size: 11px; line-height: 1.4; }
              .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 15px; margin-bottom: 20px; }
              .company { font-size: 20px; font-weight: bold; color: #f59e0b; }
              .day-section { margin-bottom: 25px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
              .day-header { background: #f9fafb; padding: 10px 15px; border-bottom: 1px solid #ddd; }
              .day-title { font-size: 14px; font-weight: bold; color: #374151; }
              .day-stats { display: flex; gap: 20px; margin-top: 5px; font-size: 11px; }
              .stat { color: #6b7280; }
              .stat-value { font-weight: bold; color: #059669; }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
              th { background: #f3f4f6; font-weight: bold; font-size: 10px; text-transform: uppercase; }
              .text-right { text-align: right; }
              .total-row { background: #ecfdf5; font-weight: bold; }
              .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 15px; }
            </style>
          <base target="_blank">
</head>
          <body onload="window.print();">
            <div class="header">
              <div class="company">${AppState.config.company_name}</div>
              <div>${AppState.config.company_slogan}</div>
              <h2 style="margin-top: 10px; color: #374151;">REPORTE DE METROS DIARIOS</h2>
              <p style="color: #6b7280; font-size: 10px;">Generado: ${new Date().toLocaleString('es-MX')}</p>
            </div>

            ${Object.keys(dailyData).sort().reverse().map(day => {
              const d = dailyData[day];
              const dateObj = new Date(day + 'T00:00:00');
              const dateStr = dateObj.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

              return `
                <div class="day-section">
                  <div class="day-header">
                    <div class="day-title">${dateStr.toUpperCase()}</div>
                    <div class="day-stats">
                      <span class="stat">Total Metros3: <span class="stat-value">${d.totalMeters.toFixed(2)}</span></span>
                      <span class="stat">Total Ventas: <span class="stat-value">${d.transactions.length}</span></span>
                      <span class="stat">Monto Total: <span class="stat-value">$${d.totalAmount.toFixed(2)}</span></span>
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Hora</th>
                        <th>Cliente</th>
                        <th>Material</th>
                        <th class="text-right">Metros3</th>
                        <th class="text-right">Precio Unit.</th>
                        <th class="text-right">Total</th>
                        <th>Factura</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${d.transactions.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(t => {
                        const time = t.date ? new Date(t.date).toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                        return `
                          <tr>
                            <td>${time}</td>
                            <td>${t.client_name}</td>
                            <td>${t.material_name}</td>
                            <td class="text-right">${(t.sale_quantity || 0).toFixed(2)}</td>
                            <td class="text-right">$${(t.price || 0).toFixed(2)}</td>
                            <td class="text-right">$${(t.sale_total || 0).toFixed(2)}</td>
                            <td>${t.invoice_number}</td>
                          </tr>
                        `;
                      }).join('')}
                      <tr class="total-row">
                        <td colspan="3"><strong>TOTAL DEL DIA</strong></td>
                        <td class="text-right"><strong>${d.totalMeters.toFixed(2)}</strong></td>
                        <td></td>
                        <td class="text-right"><strong>$${d.totalAmount.toFixed(2)}</strong></td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              `;
            }).join('')}

            <div class="footer">
              <p><strong>${AppState.config.company_name}</strong> - Reporte de Metros Diarios</p>
              <p>${AppState.config.company_phone || ''} ${AppState.config.company_address || ''}</p>
            </div>
          </body>
        </html>
      `;

      openPrintDocument(content, { autoClose: false });
    }


    function renderDirectTrips(container) {
      const trips = getRecords('direct_trip');

      // Obtener companias unicas para el filtro
      const companies = [...new Set(trips.map(t => t.source_company).filter(Boolean))].sort();

      // Aplicar filtros
      let filteredTrips = trips;
      if (AppState.directTripFilters.search) {
        const search = AppState.directTripFilters.search.toLowerCase();
        filteredTrips = filteredTrips.filter(t => 
          (t.source_company?.toLowerCase() || '').includes(search) ||
          (t.driver_name?.toLowerCase() || '').includes(search) ||
          (t.destination_client?.toLowerCase() || '').includes(search) ||
          (t.invoice_number?.toLowerCase() || '').includes(search) ||
          (t.vehicle_plate?.toLowerCase() || '').includes(search) ||
          (t.material_type?.toLowerCase() || '').includes(search)
        );
      }
      if (AppState.directTripFilters.company) {
        filteredTrips = filteredTrips.filter(t => 
          t.source_company?.toLowerCase().includes(AppState.directTripFilters.company.toLowerCase())
        );
      }
      if (AppState.directTripFilters.dateFrom || AppState.directTripFilters.dateTo) {
        filteredTrips = filteredTrips.filter(t => matchesDateFilter(t.date, AppState.directTripFilters.dateFrom, AppState.directTripFilters.dateTo));
      }
      if (AppState.directTripFilters.status !== 'all') {
        filteredTrips = filteredTrips.filter(t => t.payment_status === AppState.directTripFilters.status);
      }

      // Calcular estadisticas
      const totalTrips = filteredTrips.length;
      const totalMeters = filteredTrips.reduce((a, t) => a + (t.meters || 0), 0);
      const totalAmount = filteredTrips.reduce((a, t) => a + (t.trip_amount || 0), 0);
      const pendingAmount = filteredTrips
        .filter(t => t.payment_status === 'pendiente')
        .reduce((a, t) => a + ((t.trip_amount || 0) - (t.amount_paid || 0)), 0);

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 class="text-2xl font-bold text-slate-100">Viajes Directos</h2>
              <p class="text-slate-500 text-sm mt-1">Gestion de viajes de otras companias</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button onclick="exportDirectTripsExcel()" class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 font-semibold rounded-lg transition-all">
                <i data-lucide="download" class="w-4 h-4"></i> Excel
              </button>
              <button onclick="showDirectTripModal()" class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-400 text-slate-900 font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20">
                <i data-lucide="plus" class="w-4 h-4"></i> Nuevo Viaje Directo
              </button>
            </div>
          </div>

          <!-- Estadisticas -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="glass rounded-xl p-4 border-l-4 border-primary-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-1">Total Viajes</div>
              <div class="text-xl font-bold text-slate-100 font-mono">${totalTrips}</div>
            </div>
            <div class="glass rounded-xl p-4 border-l-4 border-blue-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-1">Metros3 Totales</div>
              <div class="text-xl font-bold text-blue-400 font-mono">${fmt.number(totalMeters, 2)}</div>
            </div>
            <div class="glass rounded-xl p-4 border-l-4 border-emerald-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-1">Monto Total</div>
              <div class="text-xl font-bold text-emerald-400 font-mono">${fmt.currency(totalAmount)}</div>
            </div>
            <div class="glass rounded-xl p-4 border-l-4 border-rose-500">
              <div class="text-slate-400 text-xs font-semibold uppercase mb-1">Por Cobrar</div>
              <div class="text-xl font-bold text-rose-400 font-mono">${fmt.currency(pendingAmount)}</div>
            </div>
          </div>

          <!-- Filtros -->
          <div class="glass rounded-xl p-4 border border-slate-700/50">
            <div class="flex items-center gap-2 mb-4 text-primary-400">
              <i data-lucide="filter" class="w-4 h-4"></i>
              <span class="text-sm font-medium">Filtrar Viajes</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div class="md:col-span-2">
                <label class="block text-xs text-slate-500 mb-1">Buscar</label>
                <div class="relative">
                  <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-2.5"></i>
                  <input type="text" id="directTripFilterSearch" value="${AppState.directTripFilters.search || ''}" oninput="updateDirectTripFilters()" placeholder="Compania, chofer, cliente, factura..."
                    class="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
                </div>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Compania Origen</label>
                <select id="directTripFilterCompany" onchange="updateDirectTripFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus select-custom">
                  <option value="">Todas las companias</option>
                  ${companies.map(c => `<option value="${c}" ${AppState.directTripFilters.company === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Desde</label>
                <input type="date" id="directTripFilterDateFrom" value="${AppState.directTripFilters.dateFrom}" onchange="updateDirectTripFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Hasta</label>
                <input type="date" id="directTripFilterDateTo" value="${AppState.directTripFilters.dateTo}" onchange="updateDirectTripFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Estado Pago</label>
                <select id="directTripFilterStatus" onchange="updateDirectTripFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus select-custom">
                  <option value="all" ${AppState.directTripFilters.status === 'all' ? 'selected' : ''}>Todos</option>
                  <option value="pendiente" ${AppState.directTripFilters.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                  <option value="pagado" ${AppState.directTripFilters.status === 'pagado' ? 'selected' : ''}>Pagado</option>
                </select>
              </div>
            </div>

            <div class="flex flex-wrap gap-2 mt-3">
              <div class="w-full sm:w-48">
                <label class="block text-xs text-slate-500 mb-1">Periodo rapido</label>
                <select id="directTripQuickFilter" onchange="setDirectTripQuickFilter(this.value)"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus select-custom">
                  <option value="" ${!AppState.directTripFilters.quickPeriod ? 'selected' : ''}>Seleccionar</option>
                  <option value="today" ${AppState.directTripFilters.quickPeriod === 'today' ? 'selected' : ''}>Hoy</option>
                  <option value="week" ${AppState.directTripFilters.quickPeriod === 'week' ? 'selected' : ''}>Semana</option>
                  <option value="month" ${AppState.directTripFilters.quickPeriod === 'month' ? 'selected' : ''}>Mes</option>
                </select>
              </div>
              <div class="flex items-end">
              <button onclick="clearDirectTripFilters()" class="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1">
                <i data-lucide="x-circle" class="w-3 h-3"></i> Limpiar
              </button>
              </div>
            </div>

            ${AppState.directTripFilters.company || AppState.directTripFilters.dateFrom || AppState.directTripFilters.dateTo || AppState.directTripFilters.status !== 'all' ? `
              <div class="mt-3 flex items-center gap-2">
                <span class="text-xs text-slate-500">- Mostrando ${filteredTrips.length} de ${trips.length} viajes</span>
              </div>
            ` : ''}
          </div>

          <!-- Tabla de Viajes -->
          <div class="glass rounded-xl overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Compania Origen</th>
                    <th>Chofer</th>
                    <th>Vehiculo</th>
                    <th>Material</th>
                    <th>Cliente Destino</th>
                    <th class="text-right">Metros3</th>
                    <th class="text-right">Monto</th>
                    <th>Factura</th>
                    <th>Estado Pago</th>
                    <th class="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredTrips.length === 0 ? `
                    <tr>
                      <td colspan="10" class="text-center py-12 text-slate-500">
                        <div class="flex flex-col items-center gap-3">
                          <i data-lucide="route" class="w-12 h-12 opacity-30"></i>
                          <p>${trips.length === 0 ? 'Sin viajes directos registrados' : 'No hay viajes con los filtros seleccionados'}</p>
                          ${trips.length === 0 ? `<button onclick="showDirectTripModal()" class="mt-2 text-primary-400 hover:text-primary-300 text-sm">Registrar primer viaje</button>` : ''}
                        </div>
                      </td>
                    </tr>
                  ` : filteredTrips.slice().reverse().map(t => {
                    const remaining = (t.trip_amount || 0) - (t.amount_paid || 0);
                    return `
                    <tr class="${t.payment_status === 'pagado' ? 'bg-emerald-500/5' : ''}">
                      <td class="text-slate-400 text-sm">${fmt.dateTime(t.date)}</td>
                      <td class="font-medium text-slate-200">${t.source_company}</td>
                      <td class="text-slate-300">${t.driver_name}</td>
                      <td class="text-slate-300 font-mono text-xs">${t.vehicle_plate}</td>
                      <td class="text-slate-300">${t.material_type || '-'}</td>
                      <td class="text-slate-300">${t.destination_client}</td>
                      <td class="text-right font-mono text-blue-400">${fmt.number(t.meters, 2)}</td>
                      <td class="text-right font-mono text-emerald-400">${fmt.currency(t.trip_amount)}</td>
                      <td class="font-mono text-xs text-primary-400">${t.invoice_number || '-'}</td>
                      <td>
                        <span class="status-badge ${t.payment_status === 'pagado' ? 'bg-emerald-500/10 text-emerald-400' : remaining > 0 && t.amount_paid > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}">
                          <div class="w-1.5 h-1.5 rounded-full ${t.payment_status === 'pagado' ? 'bg-emerald-400' : remaining > 0 && t.amount_paid > 0 ? 'bg-amber-400' : 'bg-rose-400'}"></div>
                          ${t.payment_status === 'pagado' ? 'Pagado' : remaining > 0 && t.amount_paid > 0 ? 'Parcial' : 'Pendiente'}
                        </span>
                        ${t.amount_paid > 0 ? `<div class="text-xs text-slate-500 mt-1">Pagado: ${fmt.currency(t.amount_paid)}</div>` : ''}
                      </td>
                      <td class="text-right">
                        <div class="flex items-center justify-end gap-2">
                          ${t.payment_status !== 'pagado' ? `
                            <button onclick="showDirectTripPaymentModal('${t.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors" title="Registrar pago">
                              <i data-lucide="dollar-sign" class="w-4 h-4"></i>
                            </button>
                          ` : ''}
                          <button onclick="printDirectTripInvoice('${t.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 transition-colors" title="Imprimir">
                            <i data-lucide="printer" class="w-4 h-4"></i>
                          </button>
                          <button onclick="showEditDirectTripModal('${t.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors" title="Editar">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                          </button>
                          ${AppState.deleteConfirmId === t.__backendId ? `
                            <div class="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-1.5">
                              <span class="text-xs text-rose-400">Eliminar?</span>
                              <button onclick="confirmDeleteRecord('${t.__backendId}')" class="text-xs text-rose-400 hover:text-rose-300 font-semibold">Si</button>
                              <button onclick="cancelDelete()" class="text-xs text-slate-400 hover:text-slate-300">No</button>
                            </div>
                          ` : `
                            <button onclick="askDelete('${t.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Eliminar">
                              <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                          `}
                        </div>
                      </td>
                    </tr>
                  `}).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      lucide.createIcons();
    }


    // Funciones de filtro para Viajes Directos
    function updateDirectTripFilters() {
      AppState.directTripFilters.search = document.getElementById('directTripFilterSearch')?.value || '';
      AppState.directTripFilters.company = document.getElementById('directTripFilterCompany').value;
      AppState.directTripFilters.dateFrom = document.getElementById('directTripFilterDateFrom').value;
      AppState.directTripFilters.dateTo = document.getElementById('directTripFilterDateTo').value;
      AppState.directTripFilters.status = document.getElementById('directTripFilterStatus').value;
      AppState.directTripFilters.quickPeriod = '';
      renderFilterPage('directTripFilterSearch');
    }

    function setDirectTripQuickFilter(period) {
      const today = new Date();
      const formatDate = (d) => d.toISOString().split('T')[0];

      let fromDate, toDate;

      switch(period) {
        case '':
          AppState.directTripFilters.quickPeriod = '';
          AppState.directTripFilters.dateFrom = '';
          AppState.directTripFilters.dateTo = '';
          renderPage();
          return;
        case 'today':
          fromDate = toDate = formatDate(today);
          break;
        case 'week':
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          fromDate = formatDate(weekStart);
          toDate = formatDate(today);
          break;
        case 'month':
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          fromDate = formatDate(monthStart);
          toDate = formatDate(today);
          break;
        default:
          return;
      }

      AppState.directTripFilters.quickPeriod = period;
      AppState.directTripFilters.dateFrom = fromDate;
      AppState.directTripFilters.dateTo = toDate;
      renderPage();
    }

    function clearDirectTripFilters() {
      AppState.directTripFilters = { search: '', company: '', dateFrom: '', dateTo: '', status: 'all', quickPeriod: '' };
      renderPage();
    }

    function getFilteredDirectTripsForExport() {
      let filteredTrips = getRecords('direct_trip');
      if (AppState.directTripFilters.search) {
        const search = AppState.directTripFilters.search.toLowerCase();
        filteredTrips = filteredTrips.filter(t =>
          (t.source_company?.toLowerCase() || '').includes(search) ||
          (t.driver_name?.toLowerCase() || '').includes(search) ||
          (t.destination_client?.toLowerCase() || '').includes(search) ||
          (t.invoice_number?.toLowerCase() || '').includes(search) ||
          (t.vehicle_plate?.toLowerCase() || '').includes(search) ||
          (t.material_type?.toLowerCase() || '').includes(search)
        );
      }
      if (AppState.directTripFilters.company) {
        filteredTrips = filteredTrips.filter(t =>
          t.source_company?.toLowerCase().includes(AppState.directTripFilters.company.toLowerCase())
        );
      }
      if (AppState.directTripFilters.dateFrom || AppState.directTripFilters.dateTo) {
        filteredTrips = filteredTrips.filter(t => matchesDateFilter(t.date, AppState.directTripFilters.dateFrom, AppState.directTripFilters.dateTo));
      }
      if (AppState.directTripFilters.status !== 'all') {
        filteredTrips = filteredTrips.filter(t => t.payment_status === AppState.directTripFilters.status);
      }
      return filteredTrips;
    }

    function exportDirectTripsExcel() {
      if (!window.XLSX) {
        showExcelLibraryError();
        return;
      }

      const trips = getFilteredDirectTripsForExport().slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      const dateParts = (value) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return { day: value || '', hour: '' };
        return {
          day: d.toLocaleDateString('es-DO'),
          hour: d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false })
        };
      };
      const rows = [
        ['Fecha', 'Hora', 'Chofer', 'Vehiculo', 'Material', 'Cliente Destino', 'Metro', 'Monto', 'Factura', 'Estado de Pago'],
        ...trips.map(t => {
          const date = dateParts(t.date);
          return [
            date.day,
            date.hour,
            t.driver_name || '',
            t.vehicle_plate || '',
            t.material_type || '',
            t.destination_client || '',
            Number(t.meters) || 0,
            Number(t.trip_amount) || 0,
            t.invoice_number || '',
            t.payment_status === 'pagado' ? 'Pagado' : 'Pendiente'
          ];
        }),
        [],
        [],
        ['', '', '', '', '', 'SUMA TOTAL', trips.reduce((a, t) => a + (Number(t.meters) || 0), 0), trips.reduce((a, t) => a + (Number(t.trip_amount) || 0), 0), '', '']
      ];

      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      const lastDataRow = trips.length + 1;
      const totalRow = trips.length + 4;
      sheet['!cols'] = [
        { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 18 },
        { wch: 30 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 18 }
      ];
      sheet['!merges'] = [
        { s: { r: totalRow - 1, c: 5 }, e: { r: totalRow - 1, c: 5 } }
      ];

      const green = '107C41';
      const lightGreen = 'DDEFD8';
      const paidGreen = '16843A';
      const pendingOrange = 'F97316';
      const border = { style: 'thin', color: { rgb: 'B8B8B8' } };
      const baseBorder = { top: border, bottom: border, left: border, right: border };
      const center = { horizontal: 'center', vertical: 'center', wrapText: true };
      const applyStyle = (addr, style) => {
        if (!sheet[addr]) sheet[addr] = { t: 's', v: '' };
        sheet[addr].s = style;
      };
      const rangeStyle = (range, style) => {
        const decoded = XLSX.utils.decode_range(range);
        for (let r = decoded.s.r; r <= decoded.e.r; r++) {
          for (let c = decoded.s.c; c <= decoded.e.c; c++) {
            applyStyle(XLSX.utils.encode_cell({ r, c }), style);
          }
        }
      };
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13 },
        fill: { fgColor: { rgb: green } },
        alignment: center,
        border: baseBorder
      };
      const bodyStyle = {
        font: { color: { rgb: '1F2937' }, sz: 12 },
        alignment: center,
        border: baseBorder
      };
      const amountStyle = {
        ...bodyStyle,
        numFmt: '$#,##0.00'
      };
      const meterStyle = {
        ...bodyStyle,
        numFmt: '#,##0.00'
      };
      const totalStyle = {
        font: { bold: true, color: { rgb: '111827' }, sz: 12 },
        fill: { fgColor: { rgb: lightGreen } },
        alignment: center,
        border: baseBorder
      };
      const totalAmountStyle = {
        ...totalStyle,
        numFmt: '$#,##0.00'
      };
      const totalMeterStyle = {
        ...totalStyle,
        numFmt: '#,##0.00'
      };

      rangeStyle('A1:J1', headerStyle);
      if (lastDataRow > 1) {
        rangeStyle(`A2:J${lastDataRow}`, bodyStyle);
        rangeStyle(`G2:G${lastDataRow}`, meterStyle);
        rangeStyle(`H2:H${lastDataRow}`, amountStyle);
        for (let row = 2; row <= lastDataRow; row++) {
          const statusCell = `J${row}`;
          const isPaid = String(sheet[statusCell]?.v || '').toLowerCase() === 'pagado';
          applyStyle(statusCell, {
            ...bodyStyle,
            font: { bold: true, color: { rgb: isPaid ? paidGreen : pendingOrange } }
          });
        }
      }
      rangeStyle(`F${totalRow}:H${totalRow}`, totalStyle);
      rangeStyle(`G${totalRow}:G${totalRow}`, totalMeterStyle);
      rangeStyle(`H${totalRow}:H${totalRow}`, totalAmountStyle);
      sheet['!autofilter'] = { ref: `A1:J${Math.max(lastDataRow, 1)}` };
      sheet['!rows'] = [{ hpt: 30 }];

      XLSX.utils.book_append_sheet(workbook, sheet, 'Viajes directos');
      XLSX.writeFile(workbook, `viajes_directos_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Viajes directos exportados en Excel');
    }

    // Modal para nuevo/editar viaje directo
    function showDirectTripModal(editId) {
      const existing = editId ? AppState.data.find(r => r.__backendId === editId) : null;

      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-w-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-100">${existing ? 'Editar' : 'Nuevo'} Viaje Directo</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="saveDirectTrip(event, '${editId || ''}')" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Fecha y Hora</label>
                <input type="datetime-local" id="tripDate" required
                  value="${existing ? fmt.dateInput(existing.date) : ''}"
                  class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Numero de Factura</label>
                <input type="text" id="tripInvoiceNumber" required
                  value="${existing ? existing.invoice_number : ''}"
                  placeholder="Ej: FAC-VIAJE-001"
                  class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono uppercase placeholder-slate-600 input-focus">
              </div>
            </div>

            <div class="border-t border-slate-700 pt-4">
              <h3 class="text-sm font-semibold text-primary-400 mb-3 flex items-center gap-2">
                <i data-lucide="building-2" class="w-4 h-4"></i> Compania Origen
              </h3>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Nombre de la Compania</label>
                <input type="text" id="tripSourceCompany" required
                  value="${existing ? existing.source_company : ''}"
                  placeholder="Nombre de la compania que envio el viaje"
                  class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
              </div>
            </div>

            <div class="border-t border-slate-700 pt-4">
              <h3 class="text-sm font-semibold text-primary-400 mb-3 flex items-center gap-2">
                <i data-lucide="user" class="w-4 h-4"></i> Informacion del Chofer
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Nombre del Chofer</label>
                  <input type="text" id="tripDriverName" required
                    value="${existing ? existing.driver_name : ''}"
                    placeholder="Nombre completo"
                    class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Placa del Vehiculo</label>
                  <input type="text" id="tripVehiclePlate" required
                    value="${existing ? existing.vehicle_plate : ''}"
                    placeholder="Ej: ABC-1234"
                    class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono uppercase placeholder-slate-600 input-focus">
                </div>
              </div>
            </div>

            <div class="border-t border-slate-700 pt-4">
              <h3 class="text-sm font-semibold text-primary-400 mb-3 flex items-center gap-2">
                <i data-lucide="map-pin" class="w-4 h-4"></i> Destino y Carga
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Tipo de Material</label>
                  <input type="text" id="tripMaterialType" required
                    value="${existing ? existing.material_type : ''}"
                    placeholder="Ej: Arena, Grava, Cemento, etc."
                    class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Metros Cubicos (m3)</label>
                  <input type="number" id="tripMeters" step="0.01" min="0.01" required
                    value="${existing ? existing.meters : ''}"
                    class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
                </div>
              </div>
              <div class="mt-4">
                <label class="block text-sm font-medium text-slate-400 mb-2">Cliente Destino</label>
                <input type="text" id="tripDestinationClient" required
                  value="${existing ? existing.destination_client : ''}"
                  placeholder="A quien se entrego"
                  class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
              </div>
            </div>

            <div class="border-t border-slate-700 pt-4">
              <h3 class="text-sm font-semibold text-primary-400 mb-3 flex items-center gap-2">
                <i data-lucide="dollar-sign" class="w-4 h-4"></i> Informacion de Pago
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Monto del Viaje</label>
                  <div class="relative">
                    <span class="absolute left-3 top-3 text-slate-500">$</span>
                    <input type="number" id="tripAmount" step="0.01" min="0" required
                      value="${existing ? existing.trip_amount : ''}"
                      class="w-full pl-8 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-400 mb-2">Estado de Pago</label>
                  <select id="tripPaymentStatus" onchange="toggleTripPaymentFields()"
                    class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                    <option value="pendiente" ${existing?.payment_status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="pagado" ${existing?.payment_status === 'pagado' ? 'selected' : ''}>Pagado</option>
                  </select>
                </div>
              </div>

              <div id="tripPaymentDetails" class="mt-4 ${existing?.payment_status === 'pagado' ? '' : 'hidden'}">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-slate-400 mb-2">Monto Pagado</label>
                    <div class="relative">
                      <span class="absolute left-3 top-3 text-slate-500">$</span>
                      <input type="number" id="tripAmountPaid" step="0.01" min="0"
                        value="${existing ? existing.amount_paid || 0 : 0}"
                        class="w-full pl-8 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-slate-400 mb-2">Metodo de Pago</label>
                    <select id="tripPaymentMethod"
                      class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                      <option value="efectivo" ${existing?.payment_method === 'efectivo' ? 'selected' : ''}>Efectivo</option>
                      <option value="transferencia" ${existing?.payment_method === 'transferencia' ? 'selected' : ''}>Transferencia</option>
                      <option value="cheque" ${existing?.payment_method === 'cheque' ? 'selected' : ''}>Cheque</option>
                      <option value="deposito" ${existing?.payment_method === 'deposito' ? 'selected' : ''}>Deposito</option>
                    </select>
                  </div>
                </div>
                <div class="mt-4">
                  <label class="block text-sm font-medium text-slate-400 mb-2">Notas de Pago</label>
                  <input type="text" id="tripPaymentNotes"
                    value="${existing ? existing.payment_notes || '' : ''}"
                    placeholder="Referencia, numero de cheque, etc."
                    class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
                </div>
              </div>
            </div>

            <div class="border-t border-slate-700 pt-4">
              <label class="block text-sm font-medium text-slate-400 mb-2">Notas Adicionales</label>
              <textarea id="tripNotes" rows="2"
                placeholder="Observaciones, detalles del viaje, etc."
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus resize-none">${existing ? existing.notes || '' : ''}</textarea>
            </div>

            <div class="flex gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" class="flex-1 px-4 py-3 bg-primary-500 hover:bg-primary-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-primary-500/20 flex items-center justify-center gap-2">
                <i data-lucide="save" class="w-5 h-5"></i> ${existing ? 'Guardar Cambios' : 'Registrar Viaje'}
              </button>
            </div>
          </form>
        </div>
      `);

      // Inicializar fecha actual si es nuevo
      if (!existing) {
        setTimeout(() => {
          const now = new Date();
          now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
          const dateInput = document.getElementById('tripDate');
          if (dateInput && !dateInput.value) {
            dateInput.value = now.toISOString().slice(0, 16);
          }
        }, 100);
      }

      lucide.createIcons();
    }

    function toggleTripPaymentFields() {
      const status = document.getElementById('tripPaymentStatus').value;
      const detailsDiv = document.getElementById('tripPaymentDetails');
      if (status === 'pagado') {
        detailsDiv.classList.remove('hidden');
      } else {
        detailsDiv.classList.add('hidden');
      }
    }

    function showEditDirectTripModal(id) {
      showDirectTripModal(id);
    }

    async function saveDirectTrip(e, editId) {
      e.preventDefault();

      const dateValue = document.getElementById('tripDate').value;
      const amount = parseFloat(document.getElementById('tripAmount').value);
      const amountPaid = parseFloat(document.getElementById('tripAmountPaid')?.value || 0);
      const paymentStatus = document.getElementById('tripPaymentStatus').value;

      // Validaciones
      if (!dateValue) {
        showToast('La fecha es requerida', 'error');
        return;
      }

      if (paymentStatus === 'pagado' && amountPaid > amount) {
        showToast('El monto pagado no puede ser mayor al monto total', 'error');
        return;
      }

      const data = {
        type: 'direct_trip',
        date: new Date(dateValue).toISOString(),
        invoice_number: document.getElementById('tripInvoiceNumber').value.trim().toUpperCase(),
        source_company: document.getElementById('tripSourceCompany').value.trim(),
        driver_name: document.getElementById('tripDriverName').value.trim(),
        vehicle_plate: document.getElementById('tripVehiclePlate').value.trim().toUpperCase(),
        material_type: document.getElementById('tripMaterialType').value.trim(),
        destination_client: document.getElementById('tripDestinationClient').value.trim(),
        meters: parseFloat(document.getElementById('tripMeters').value),
        trip_amount: amount,
        payment_status: paymentStatus,
        amount_paid: paymentStatus === 'pagado' ? amountPaid : 0,
        payment_method: paymentStatus === 'pagado' ? document.getElementById('tripPaymentMethod').value : '',
        payment_notes: paymentStatus === 'pagado' ? document.getElementById('tripPaymentNotes').value.trim() : '',
        notes: document.getElementById('tripNotes').value.trim()
      };

      try {
        if (editId) {
          const existing = AppState.data.find(r => r.__backendId === editId);
          if (existing) {
            Object.assign(existing, data);
            AppState.saveUserData();
            showToast('Viaje directo actualizado correctamente');
          }
        } else {
          data.__backendId = 'dtrip_' + Date.now();
          AppState.data.push(data);
          AppState.saveUserData();
          showToast('Viaje directo registrado correctamente');
        }
        closeModal();
        renderPage();
      } catch (err) {
        showToast('Error al guardar el viaje directo', 'error');
        console.error(err);
      }
    }

    // Modal de pago para viaje directo
    function showDirectTripPaymentModal(tripId) {
      const trip = AppState.data.find(r => r.__backendId === tripId);
      if (!trip) return;

      const remaining = (trip.trip_amount || 0) - (trip.amount_paid || 0);

      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-100">Registrar Pago - Viaje Directo</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-slate-500">Factura:</span>
                <span class="text-slate-200 font-mono ml-2">${trip.invoice_number}</span>
              </div>
              <div>
                <span class="text-slate-500">Compania:</span>
                <span class="text-slate-200 ml-2">${trip.source_company}</span>
              </div>
              <div>
                <span class="text-slate-500">Chofer:</span>
                <span class="text-slate-200 ml-2">${trip.driver_name}</span>
              </div>
              <div>
                <span class="text-slate-500">Cliente:</span>
                <span class="text-slate-200 ml-2">${trip.destination_client}</span>
              </div>
            </div>
            <div class="mt-3 pt-3 border-t border-slate-700 flex justify-between items-center">
              <span class="text-slate-400">Monto Total:</span>
              <span class="text-xl font-bold text-emerald-400 font-mono">${fmt.currency(trip.trip_amount)}</span>
            </div>
            ${trip.amount_paid > 0 ? `
              <div class="mt-2 flex justify-between items-center text-sm">
                <span class="text-slate-500">Pagado hasta ahora:</span>
                <span class="text-emerald-400 font-mono">${fmt.currency(trip.amount_paid)}</span>
              </div>
              <div class="mt-1 flex justify-between items-center">
                <span class="text-slate-400">Restante:</span>
                <span class="text-rose-400 font-mono font-bold">${fmt.currency(remaining)}</span>
              </div>
            ` : ''}
          </div>

          <form onsubmit="saveDirectTripPayment(event, '${tripId}')" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Monto a Pagar</label>
              <div class="relative">
                <span class="absolute left-3 top-3 text-slate-500">$</span>
                <input type="number" id="paymentAmount" step="0.01" min="0.01" max="${remaining}" required
                  value="${remaining}"
                  class="w-full pl-8 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
              </div>
              <p class="text-xs text-slate-500 mt-1">Maximo: ${fmt.currency(remaining)}</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Metodo de Pago</label>
              <select id="paymentMethod" required
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus select-custom">
                <option value="">Seleccionar...</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="deposito">Deposito</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Notas (opcional)</label>
              <input type="text" id="paymentNotes" placeholder="Referencia, numero de cheque, etc."
                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus">
            </div>

            <div class="flex gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors">
                Cancelar
              </button>
              <button type="submit" class="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-lg transition-all hover:shadow-lg hover:shadow-emerald-500/20 flex items-center justify-center gap-2">
                <i data-lucide="check-circle" class="w-5 h-5"></i> Registrar Pago
              </button>
            </div>
          </form>
        </div>
      `);
      lucide.createIcons();
    }

    async function saveDirectTripPayment(e, tripId) {
      e.preventDefault();

      const trip = AppState.data.find(r => r.__backendId === tripId);
      if (!trip) return;

      const amount = parseFloat(document.getElementById('paymentAmount').value);
      const method = document.getElementById('paymentMethod').value;
      const notes = document.getElementById('paymentNotes').value.trim();

      const currentPaid = trip.amount_paid || 0;
      const totalAmount = trip.trip_amount || 0;
      const remaining = totalAmount - currentPaid;

      if (amount <= 0 || amount > remaining) {
        showToast('Monto invalido', 'error');
        return;
      }

      try {
        const newPaidAmount = currentPaid + amount;
        trip.amount_paid = newPaidAmount;

        if (newPaidAmount >= totalAmount) {
          trip.payment_status = 'pagado';
        }

        // Guardar historial de pagos
        if (!trip.payments) trip.payments = [];
        trip.payments.push({
          date: new Date().toISOString(),
          amount: amount,
          method: method,
          notes: notes
        });

        AppState.saveUserData();

        showToast(`Pago de ${fmt.currency(amount)} registrado correctamente`, 'success');

        setTimeout(() => {
          if (confirm('Deseas imprimir el recibo de pago?')) {
            printDirectTripPaymentReceipt(trip, amount, method, notes);
          }
        }, 300);

        closeModal();
        renderPage();
      } catch (err) {
        showToast('Error al registrar el pago', 'error');
        console.error(err);
      }
    }


    // Funciones de impresion para Viajes Directos
    async function printDirectTripInvoice(tripId) {
      const trip = AppState.data.find(r => r.__backendId === tripId);
      if (!trip) return;

      const printerType = isBluetoothPrinterSelected() ? 'standard' : getEffectivePrinterType();

      if (isBluetoothPrinterSelected()) {
        try {
          await BluetoothPrinter.printText(BluetoothPrinter.buildDirectTripInvoiceText(trip));
          showToast('Viaje directo enviado por Bluetooth', 'success');
          return;
        } catch (err) {
          showToast('No se pudo imprimir directo por Bluetooth. Se abrira impresion normal.', 'warning');
        }
      }

      // Si es termica o PDF: generar PDF descargable
      if (printerType === 'pdf' || printerType === 'thermal_80' || printerType === 'thermal_58') {
        generateDirectTripPDF(tripId);
        return;
      }

      const isThermal = false;
      const is58mm = printerType === 'thermal_58';
      const width = is58mm ? '58mm' : isThermal ? '80mm' : '210mm';

      const remaining = (trip.trip_amount || 0) - (trip.amount_paid || 0);
      const paymentStatus = trip.payment_status === 'pagado' ? 'PAGADO' : remaining > 0 && trip.amount_paid > 0 ? 'PARCIAL' : 'PENDIENTE';

      const thermalStyles = isThermal ? `
        <style>
          @page { size: ${width} auto; margin: 0; }
          body { width: ${width}; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; padding: 5mm; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 5px 0; }
          .item { display: flex; justify-content: space-between; }
          .total { font-size: 14px; font-weight: bold; }
          .status-badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; }
          .pagado { background: #059669; color: white; }
          .parcial { background: #d97706; color: white; }
          .pendiente { background: #dc2626; color: white; }
        </style>
      ` : `
        <style>
          @page { size: letter; margin: 20mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 30px; }
          .company { font-size: 24px; font-weight: bold; color: #f59e0b; }
          .invoice-box { border: 1px solid #ddd; padding: 20px; margin: 20px 0; background: #f9fafb; }
          .status-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .pagado { background: #d1fae5; color: #059669; border: 1px solid #059669; }
          .parcial { background: #fef3c7; color: #d97706; border: 1px solid #d97706; }
          .pendiente { background: #fee2e2; color: #dc2626; border: 1px solid #dc2626; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          .total { text-align: right; font-size: 18px; font-weight: bold; color: #059669; }
          .footer { margin-top: 40px; text-align: center; color: #6b7280; font-size: 11px; }
        </style>
      `;

      const content = isThermal ? `
        <div class="center bold" style="font-size: 14px;">${AppState.config.company_name}</div>
        <div class="center">${AppState.config.company_slogan}</div>
        <div class="line"></div>
        <div class="center bold">FACTURA VIAJE DIRECTO</div>
        <div class="center">${trip.invoice_number}</div>
        <div class="center">
          <span class="status-badge ${trip.payment_status === 'pagado' ? 'pagado' : remaining > 0 && trip.amount_paid > 0 ? 'parcial' : 'pendiente'}">
            ${paymentStatus}
          </span>
        </div>
        <div class="line"></div>
        <div>Fecha: ${fmt.dateTime(trip.date)}</div>
        <div class="line"></div>
        <div class="bold">COMPANIA ORIGEN:</div>
        <div>${trip.source_company}</div>
        <div class="line"></div>
        <div class="bold">INFORMACION DEL VIAJE:</div>
        <div class="item"><span>Chofer:</span> <span>${trip.driver_name}</span></div>
        <div class="item"><span>Vehiculo:</span> <span>${trip.vehicle_plate}</span></div>
        <div class="item"><span>Metros3:</span> <span>${fmt.number(trip.meters, 2)}</span></div>
        <div class="line"></div>
        <div class="bold">DESTINO:</div>
        <div>Cliente: ${trip.destination_client}</div>
        <div class="line"></div>
        <div class="item total">
          <span>TOTAL:</span>
          <span>${fmt.currency(trip.trip_amount)}</span>
        </div>
        ${trip.amount_paid > 0 ? `
          <div class="line"></div>
          <div class="item"><span>Pagado:</span> <span>${fmt.currency(trip.amount_paid)}</span></div>
          <div class="item"><span>Restante:</span> <span>${fmt.currency(remaining)}</span></div>
        ` : ''}
        <div class="line"></div>
        ${trip.notes ? `<div>Notas: ${trip.notes}</div><div class="line"></div>` : ''}
        <div class="center" style="font-size: 10px; margin-top: 20px;">
          Documento generado por ERP Materiales del Norte
        </div>
      ` : `
        <div class="header">
          <div class="company">${AppState.config.company_name}</div>
          <div>${AppState.config.company_slogan}</div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <div>
            <div style="font-size: 11px; color: #6b7280;">FACTURA VIAJE DIRECTO</div>
            <div style="font-size: 24px; font-weight: bold; color: #f59e0b;">${trip.invoice_number}</div>
            <div style="color: #6b7280; margin-top: 5px;">${fmt.dateTime(trip.date)}</div>
          </div>
          <div>
            <span class="status-badge ${trip.payment_status === 'pagado' ? 'pagado' : remaining > 0 && trip.amount_paid > 0 ? 'parcial' : 'pendiente'}">
              ${paymentStatus}
            </span>
          </div>
        </div>

        <div class="invoice-box">
          <h3 style="margin-top: 0; color: #f59e0b;">Compania Origen</h3>
          <p style="font-size: 16px; font-weight: bold; margin: 10px 0;">${trip.source_company}</p>
        </div>

        <table>
          <thead>
            <tr>
              <th colspan="2">Detalles del Viaje</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Chofer</strong></td>
              <td>${trip.driver_name}</td>
            </tr>
            <tr>
              <td><strong>Placa del Vehiculo</strong></td>
              <td style="font-family: monospace;">${trip.vehicle_plate}</td>
            </tr>
            <tr>
              <td><strong>Metros Cubicos</strong></td>
              <td style="font-family: monospace; font-size: 16px; color: #3b82f6;">${fmt.number(trip.meters, 2)} m3</td>
            </tr>
            <tr>
              <td><strong>Cliente Destino</strong></td>
              <td>${trip.destination_client}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 30px; border-top: 2px solid #f3f4f6; padding-top: 20px;">
          <div style="display: flex; justify-content: flex-end; gap: 40px;">
            <div style="text-align: right;">
              <div style="color: #6b7280; margin-bottom: 5px;">Monto Total</div>
              <div style="font-size: 24px; font-weight: bold; color: #059669;">${fmt.currency(trip.trip_amount)}</div>
            </div>
          </div>
          ${trip.amount_paid > 0 ? `
            <div style="display: flex; justify-content: flex-end; gap: 40px; margin-top: 15px; padding-top: 15px; border-top: 1px dashed #ddd;">
              <div style="text-align: right;">
                <div style="color: #6b7280; margin-bottom: 5px; font-size: 12px;">Pagado</div>
                <div style="color: #059669; font-family: monospace;">${fmt.currency(trip.amount_paid)}</div>
              </div>
              <div style="text-align: right;">
                <div style="color: #6b7280; margin-bottom: 5px; font-size: 12px;">Restante</div>
                <div style="color: #dc2626; font-family: monospace; font-weight: bold;">${fmt.currency(remaining)}</div>
              </div>
            </div>
          ` : ''}
        </div>

        ${trip.notes ? `
          <div style="margin-top: 30px; padding: 15px; background: #f9fafb; border-radius: 8px;">
            <div style="font-weight: bold; color: #374151; margin-bottom: 5px;">Notas:</div>
            <div style="color: #6b7280;">${trip.notes}</div>
          </div>
        ` : ''}

        <div class="footer">
          <p>Documento generado por ERP Materiales del Norte</p>
          <p>${AppState.config.company_phone || ''} ${AppState.config.company_address || ''}</p>
        </div>
      `;

      openPrintDocument(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Factura Viaje Directo ${trip.invoice_number}</title>
            ${thermalStyles}
          <base target="_blank">
</head>
          <body onload="window.print(); window.close();">
            ${content}
          </body>
        </html>
      `, { autoClose: true });
    }

    async function printDirectTripPaymentReceipt(trip, amount, method, notes) {
      const printerType = isBluetoothPrinterSelected() ? 'standard' : getEffectivePrinterType();

      if (isBluetoothPrinterSelected()) {
        try {
          await BluetoothPrinter.printText(BluetoothPrinter.buildDirectTripPaymentText(trip, amount, method, notes));
          showToast('Recibo de viaje enviado por Bluetooth', 'success');
          return;
        } catch (err) {
          showToast('No se pudo imprimir directo por Bluetooth. Se abrira impresion normal.', 'warning');
        }
      }

      // Si es termica o PDF: generar PDF descargable
      if (printerType === 'pdf' || printerType === 'thermal_80' || printerType === 'thermal_58') {
        generateDirectTripPaymentPDF(trip, amount, method, notes);
        return;
      }

      const isThermal = false;
      const is58mm = printerType === 'thermal_58';
      const width = is58mm ? '58mm' : isThermal ? '80mm' : '210mm';

      const remaining = (trip.trip_amount || 0) - (trip.amount_paid || 0);
      const isFullyPaid = remaining <= 0;

      const thermalStyles = isThermal ? `
        <style>
          @page { size: ${width} auto; margin: 0; }
          body { width: ${width}; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; padding: 5mm; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 5px 0; }
          .item { display: flex; justify-content: space-between; }
          .total { font-size: 14px; font-weight: bold; }
          .paid-badge { background: #059669; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; }
          .partial-badge { background: #d97706; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; }
        </style>
      ` : `
        <style>
          @page { size: letter; margin: 20mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 30px; }
          .company { font-size: 24px; font-weight: bold; color: #f59e0b; }
          .receipt-box { border: 1px solid #ddd; padding: 20px; margin: 20px 0; background: #f9fafb; }
          .paid-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; background: #d1fae5; color: #059669; border: 1px solid #059669; }
          .partial-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; background: #fef3c7; color: #d97706; border: 1px solid #d97706; }
          .total { text-align: right; font-size: 18px; font-weight: bold; color: #059669; }
          .footer { margin-top: 40px; text-align: center; color: #6b7280; font-size: 11px; }
        </style>
      `;

      const content = isThermal ? `
        <div class="center bold" style="font-size: 14px;">${AppState.config.company_name}</div>
        <div class="center">${AppState.config.company_slogan}</div>
        <div class="line"></div>
        <div class="center bold">${isFullyPaid ? 'RECIBO DE PAGO TOTAL' : 'RECIBO DE ABONO'}</div>
        <div class="center">
          <span class="${isFullyPaid ? 'paid-badge' : 'partial-badge'}">
            ${isFullyPaid ? 'PAGO COMPLETO' : 'ABONO PARCIAL'}
          </span>
        </div>
        <div class="line"></div>
        <div>Fecha: ${fmt.dateTime(new Date().toISOString())}</div>
        <div>Factura: ${trip.invoice_number}</div>
        <div class="line"></div>
        <div>Compania: ${trip.source_company}</div>
        <div>Chofer: ${trip.driver_name}</div>
        <div>Cliente: ${trip.destination_client}</div>
        <div class="line"></div>
        <div class="item"><span>Metodo:</span> <span>${method.toUpperCase()}</span></div>
        ${notes ? `<div>Nota: ${notes}</div>` : ''}
        <div class="line"></div>
        <div class="item total">
          <span>${isFullyPaid ? 'TOTAL PAGADO:' : 'ABONO:'}</span>
          <span>${fmt.currency(amount)}</span>
        </div>
        ${!isFullyPaid ? `
          <div class="line"></div>
          <div class="item"><span>Total Factura:</span> <span>${fmt.currency(trip.trip_amount)}</span></div>
          <div class="item"><span>Pagado:</span> <span>${fmt.currency(trip.amount_paid)}</span></div>
          <div class="item"><span>Restante:</span> <span>${fmt.currency(remaining)}</span></div>
        ` : ''}
        <div class="line"></div>
        <div class="center" style="font-size: 10px; margin-top: 20px;">
          ${isFullyPaid ? '** PAGO COMPLETADO **' : '** ABONO REGISTRADO **'}
        </div>
      ` : `
        <div class="header">
          <div class="company">${AppState.config.company_name}</div>
          <div>${AppState.config.company_slogan}</div>
        </div>

        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="color: ${isFullyPaid ? '#059669' : '#d97706'}; margin-bottom: 10px;">
            ${isFullyPaid ? 'RECIBO DE PAGO TOTAL' : 'RECIBO DE ABONO'}
          </h2>
          <span class="${isFullyPaid ? 'paid-badge' : 'partial-badge'}">
            ${isFullyPaid ? 'OK PAGO COMPLETO' : 'PENDIENTE ABONO PARCIAL'}
          </span>
        </div>

        <div class="receipt-box">
          <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
            <div>
              <div style="font-size: 11px; color: #6b7280;">FECHA</div>
              <div style="font-weight: bold;">${fmt.dateTime(new Date().toISOString())}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; color: #6b7280;">FACTURA REF.</div>
              <div style="font-family: monospace; font-weight: bold;">${trip.invoice_number}</div>
            </div>
          </div>

          <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <div style="margin-bottom: 10px;"><strong>Compania:</strong> ${trip.source_company}</div>
            <div style="margin-bottom: 10px;"><strong>Chofer:</strong> ${trip.driver_name}</div>
            <div style="margin-bottom: 10px;"><strong>Material:</strong> ${trip.material_type || 'No especificado'}</div>
            <div><strong>Cliente:</strong> ${trip.destination_client}</div>
          </div>

          <div style="background: white; padding: 15px; border-radius: 8px;">
            <div style="margin-bottom: 10px;"><strong>Metodo de pago:</strong> ${method.toUpperCase()}</div>
            ${notes ? `<div style="color: #6b7280; font-size: 11px;"><strong>Notas:</strong> ${notes}</div>` : ''}
          </div>
        </div>

        <div class="total" style="border-top: 2px solid ${isFullyPaid ? '#059669' : '#d97706'}; padding-top: 15px; margin-top: 15px; color: ${isFullyPaid ? '#059669' : '#d97706'};">
          ${isFullyPaid ? 'TOTAL PAGADO' : 'ABONO'}: ${fmt.currency(amount)}
        </div>

        ${!isFullyPaid ? `
          <div style="margin-top: 30px; padding: 15px; background: #fef3c7; border-radius: 8px; border: 2px dashed #d97706;">
            <div style="color: #d97706; font-weight: bold; margin-bottom: 10px;">AVISO SALDO PENDIENTE</div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px;">
              <span>Total Factura:</span>
              <span>${fmt.currency(trip.trip_amount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px;">
              <span>Pagado:</span>
              <span style="color: #059669;">${fmt.currency(trip.amount_paid)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; color: #d97706; font-size: 14px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #d97706;">
              <span>RESTANTE:</span>
              <span>${fmt.currency(remaining)}</span>
            </div>
          </div>
        ` : `
          <div style="margin-top: 30px; padding: 15px; background: #d1fae5; border-radius: 8px; border: 2px solid #059669; text-align: center;">
            <div style="color: #059669; font-weight: bold; font-size: 16px;">OK DEUDA LIQUIDADA COMPLETAMENTE</div>
            <div style="color: #059669; font-size: 12px; margin-top: 5px;">Gracias por su pago</div>
          </div>
        `}

        <div class="footer">
          <p>${isFullyPaid ? 'Este documento certifica que la deuda ha sido liquidada completamente.' : 'Este documento es un comprobante de abono. Conserve para futuras referencias.'}</p>
          <p>${AppState.config.company_name} - ${AppState.config.company_phone || ''}</p>
        </div>
      `;

      openPrintDocument(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Recibo ${trip.invoice_number}</title>
            ${thermalStyles}
          <base target="_blank">
</head>
          <body onload="window.print(); window.close();">
            ${content}
          </body>
        </html>
      `, { autoClose: true });
    }

    
    // ============================================================
    // FUNCIONES DE GENERACION DE PDF PARA TERMICA / PDF
    // ============================================================

    function generatePaymentReceiptPDF(paymentId) {
      const { jsPDF } = window.jspdf;
      const payment = AppState.data.find(r => r.__backendId === paymentId);
      if (!payment) return;

      const sale = AppState.data.find(r => r.__backendId === payment.sale_id);
      const allPayments = getRecords('payment').filter(p => p.sale_id === payment.sale_id);
      const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
      const remainingBalance = Math.max(0, (sale?.sale_total || 0) - totalPaid);
      const isFullPayment = payment.is_full_payment || remainingBalance <= 0;
      const receiptTitle = isFullPayment ? 'RECIBO DE PAGO TOTAL' : 'RECIBO DE ABONO';

      const printerType = getEffectivePrinterType();
      let format, unit, pageWidth, pageHeight, isThermal, is58mm;

      switch (printerType) {
        case 'thermal_58':
          format = [58, 200]; unit = 'mm'; pageWidth = 58; pageHeight = 200;
          isThermal = true; is58mm = true;
          break;
        case 'thermal_80':
          format = [80, 200]; unit = 'mm'; pageWidth = 80; pageHeight = 200;
          isThermal = true; is58mm = false;
          break;
        default:
          format = 'letter'; unit = 'mm'; pageWidth = 216; pageHeight = 279;
          isThermal = false; is58mm = false;
          break;
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: unit, format: format });
      const margin = isThermal ? 3 : 20;
      let yPos = margin + 2;

      // Logo
      if (AppState.config.company_logo) {
        try {
          const logoWidth = isThermal ? (is58mm ? 25 : 35) : 40;
          const logoHeight = logoWidth * 0.5;
          doc.addImage(AppState.config.company_logo, 'JPEG', pageWidth/2 - logoWidth/2, yPos, logoWidth, logoHeight);
          yPos += logoHeight + (isThermal ? 2 : 5);
        } catch (e) {}
      }

      // Encabezado
      if (isThermal) {
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text(AppState.config.company_name.toUpperCase(), pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.text(AppState.config.company_slogan, pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 3;
        if (AppState.config.company_rfc) {
          doc.setFontSize(6);
          doc.setFont(undefined, 'bold');
        doc.text('RNC: ' + AppState.config.company_rfc, pageWidth/2, yPos, { align: 'center' });
          doc.setFont(undefined, 'normal');
          yPos += 3;
        }
        yPos += 2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(receiptTitle, pageWidth/2, yPos, { align: 'center' });
        yPos += 4;
        doc.setFontSize(8);
        doc.text(payment.__backendId.replace('pay_', isFullPayment ? 'TOT-' : 'ABO-'), pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('FECHA: ' + fmt.dateTime(payment.date), margin, yPos);
        yPos += 4;
        doc.text('CLIENTE: ' + payment.client_name, margin, yPos);
        yPos += 4;
        doc.text('FACTURA REF: ' + payment.invoice_number, margin, yPos);
        yPos += 4;
        doc.text('METODO: ' + payment.method.toUpperCase(), margin, yPos);
        yPos += 4;
        if (payment.notes) {
          doc.text('NOTA: ' + payment.notes, margin, yPos);
          yPos += 4;
        }
        doc.setFont(undefined, 'normal');
        yPos += 1;
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(isFullPayment ? 'PAGO TOTAL:' : 'ABONO:', margin, yPos);
        doc.text(fmt.currency(payment.amount), pageWidth - margin, yPos, { align: 'right' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        if (!isFullPayment) {
          yPos += 2;
          doc.setLineWidth(0.5);
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 4;
          doc.setFontSize(8);
          doc.setFont(undefined, 'bold');
          doc.text('FALTA POR PAGAR: ' + fmt.currency(remainingBalance), margin, yPos);
          yPos += 4;
          doc.text('TOTAL FACTURA: ' + fmt.currency(sale?.sale_total || 0), margin, yPos);
          yPos += 4;
          doc.text('PAGADO: ' + fmt.currency(totalPaid), margin, yPos);
          yPos += 4;
          doc.setFontSize(6);
          doc.text('* Conserve este recibo para futuros pagos', margin, yPos);
          doc.setFont(undefined, 'normal');
          yPos += 4;
        } else {
          yPos += 2;
          doc.setLineWidth(0.5);
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 4;
          doc.setFontSize(9);
          doc.setFont(undefined, 'bold');
          doc.text('*** DEUDA LIQUIDADA ***', pageWidth/2, yPos, { align: 'center' });
          doc.setFont(undefined, 'normal');
          yPos += 4;
        }
        yPos += 2;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('GRACIAS POR SU PAGO', pageWidth/2, yPos, { align: 'center' });
        yPos += 4;
        doc.setFontSize(6);
        doc.text(AppState.config.company_name.toUpperCase(), pageWidth/2, yPos, { align: 'center' });
        yPos += 3;
        if (AppState.config.company_phone) {
          doc.text('TEL: ' + AppState.config.company_phone, pageWidth/2, yPos, { align: 'center' });
          yPos += 3;
        }
        doc.setFont(undefined, 'normal');
      } else {
        // Formato estandar/carta
        doc.setFontSize(20);
        doc.setTextColor(0, 0, 0);
        doc.text(AppState.config.company_name, pageWidth/2, yPos, { align: 'center' });
        yPos += 8;
        doc.setFontSize(10);
        doc.text(AppState.config.company_slogan, pageWidth/2, yPos, { align: 'center' });
        yPos += 5;
        if (AppState.config.company_rfc) {
          doc.setFontSize(8);
        doc.text('RNC: ' + AppState.config.company_rfc, pageWidth/2, yPos, { align: 'center' });
          yPos += 4;
        }
        yPos += 2;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(16);
        doc.setTextColor(245, 158, 11);
        doc.text(receiptTitle, pageWidth/2, yPos, { align: 'center' });
        yPos += 6;
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(payment.__backendId.replace('pay_', isFullPayment ? 'TOT-' : 'ABO-'), pageWidth/2, yPos, { align: 'center' });
        yPos += 6;
        doc.setFontSize(10);
        doc.text('Fecha: ' + fmt.dateTime(payment.date), margin, yPos);
        yPos += 5;
        doc.text('Cliente: ' + payment.client_name, margin, yPos);
        yPos += 5;
        doc.text('Factura ref: ' + payment.invoice_number, margin, yPos);
        yPos += 5;
        doc.text('Metodo: ' + payment.method.toUpperCase(), margin, yPos);
        yPos += 5;
        if (payment.notes) {
          doc.text('Notas: ' + payment.notes, margin, yPos);
          yPos += 5;
        }
        yPos += 2;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;
        doc.setFontSize(14);
        doc.setTextColor(245, 158, 11);
        doc.text((isFullPayment ? 'PAGO TOTAL: ' : 'ABONO: ') + fmt.currency(payment.amount), pageWidth - margin, yPos, { align: 'right' });
        yPos += 8;
        if (!isFullPayment) {
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          doc.text('Falta por pagar: ' + fmt.currency(remainingBalance), margin, yPos);
          yPos += 5;
          doc.text('Total factura: ' + fmt.currency(sale?.sale_total || 0), margin, yPos);
          yPos += 5;
          doc.text('Pagado acumulado: ' + fmt.currency(totalPaid), margin, yPos);
          yPos += 8;
        } else {
          doc.setFillColor(209, 250, 229);
          doc.rect(margin, yPos, contentWidth, 15, 'F');
          doc.setFontSize(12);
          doc.setTextColor(5, 150, 105);
          doc.text('OK DEUDA LIQUIDADA COMPLETAMENTE', pageWidth/2, yPos + 10, { align: 'center' });
          yPos += 20;
        }
      }

      // Pie de pagina
      if (!isThermal) {
        yPos += 15;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text('Documento generado por ERP Materiales del Norte', pageWidth/2, yPos, { align: 'center' });
        if (AppState.config.company_phone) {
          yPos += 5;
          doc.text('Tel: ' + AppState.config.company_phone, pageWidth/2, yPos, { align: 'center' });
        }
      }

      let fileName;
      if (isThermal) {
        fileName = 'recibo_' + payment.__backendId.replace('pay_', isFullPayment ? 'TOT-' : 'ABO-') + '_' + (is58mm ? '58mm' : '80mm') + '.pdf';
      } else {
        fileName = 'recibo_' + payment.__backendId.replace('pay_', isFullPayment ? 'TOT-' : 'ABO-') + '.pdf';
      }

      doc.save(fileName);
      showToast('PDF descargado: ' + (isFullPayment ? 'Pago Total' : 'Abono') + ' (' + (isThermal ? (is58mm ? '58mm' : '80mm') : 'Carta') + ')');
    }

    function generateMultiplePaymentPDF(selectedSales, total, method, notes) {
      const { jsPDF } = window.jspdf;
      const printerType = getEffectivePrinterType();
      let format, unit, pageWidth, pageHeight, isThermal, is58mm;

      switch (printerType) {
        case 'thermal_58':
          format = [58, 200]; unit = 'mm'; pageWidth = 58; pageHeight = 200;
          isThermal = true; is58mm = true;
          break;
        case 'thermal_80':
          format = [80, 200]; unit = 'mm'; pageWidth = 80; pageHeight = 200;
          isThermal = true; is58mm = false;
          break;
        default:
          format = 'letter'; unit = 'mm'; pageWidth = 216; pageHeight = 279;
          isThermal = false; is58mm = false;
          break;
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: unit, format: format });
      const margin = isThermal ? 3 : 20;
      const contentWidth = pageWidth - (margin * 2);
      let yPos = margin + 2;

      // Logo
      if (AppState.config.company_logo) {
        try {
          const logoWidth = isThermal ? (is58mm ? 25 : 35) : 40;
          const logoHeight = logoWidth * 0.5;
          doc.addImage(AppState.config.company_logo, 'JPEG', pageWidth/2 - logoWidth/2, yPos, logoWidth, logoHeight);
          yPos += logoHeight + (isThermal ? 2 : 5);
        } catch (e) {}
      }

      if (isThermal) {
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text(AppState.config.company_name.toUpperCase(), pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.text(AppState.config.company_slogan, pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 3;
        yPos += 2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('RECIBO PAGO MULTIPLE', pageWidth/2, yPos, { align: 'center' });
        yPos += 4;
        doc.setFontSize(8);
        doc.text('FECHA: ' + fmt.dateTime(new Date().toISOString()), margin, yPos);
        yPos += 4;
        doc.text('CLIENTE: ' + selectedSales[0].sale.client_name, margin, yPos);
        yPos += 4;
        doc.text('METODO: ' + method.toUpperCase(), margin, yPos);
        yPos += 4;
        if (notes) {
          doc.text('NOTA: ' + notes, margin, yPos);
          yPos += 4;
        }
        doc.setFont(undefined, 'normal');
        yPos += 1;
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('FACTURAS PAGADAS:', margin, yPos);
        yPos += 4;
        selectedSales.forEach(item => {
          doc.text(item.sale.invoice_number + ': ' + fmt.currency(item.remaining), margin, yPos);
          yPos += 4;
        });
        doc.setFont(undefined, 'normal');
        yPos += 1;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('TOTAL:', margin, yPos);
        doc.text(fmt.currency(total), pageWidth - margin, yPos, { align: 'right' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        yPos += 2;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('GRACIAS POR SU PAGO', pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
      } else {
        doc.setFontSize(20);
        doc.text(AppState.config.company_name, pageWidth/2, yPos, { align: 'center' });
        yPos += 8;
        doc.setFontSize(10);
        doc.text(AppState.config.company_slogan, pageWidth/2, yPos, { align: 'center' });
        yPos += 5;
        yPos += 2;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(16);
        doc.setTextColor(5, 150, 105);
        doc.text('RECIBO DE PAGO MULTIPLE', pageWidth/2, yPos, { align: 'center' });
        yPos += 6;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text('Fecha: ' + fmt.dateTime(new Date().toISOString()), margin, yPos);
        yPos += 5;
        doc.text('Cliente: ' + selectedSales[0].sale.client_name, margin, yPos);
        yPos += 5;
        doc.text('Metodo: ' + method.toUpperCase(), margin, yPos);
        yPos += 5;
        if (notes) {
          doc.text('Notas: ' + notes, margin, yPos);
          yPos += 5;
        }
        yPos += 2;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, yPos, contentWidth, 8, 'F');
        doc.setFontSize(9);
        doc.text('Factura', margin + 2, yPos + 5);
        doc.text('Material', margin + contentWidth - 80, yPos + 5);
        doc.text('Monto', margin + contentWidth - 10, yPos + 5);
        yPos += 12;
        selectedSales.forEach(item => {
          doc.text(item.sale.invoice_number, margin + 2, yPos);
          doc.text(item.sale.material_name, margin + contentWidth - 80, yPos);
          doc.text(fmt.currency(item.remaining), margin + contentWidth - 10, yPos);
          yPos += 6;
        });
        yPos += 2;
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(14);
        doc.setTextColor(5, 150, 105);
        doc.text('TOTAL PAGADO: ' + fmt.currency(total), pageWidth - margin, yPos, { align: 'right' });
      }

      if (!isThermal) {
        yPos += 15;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text('Documento generado por ERP Materiales del Norte', pageWidth/2, yPos, { align: 'center' });
      }

      let fileName = 'recibo_pago_multiple_' + (isThermal ? (is58mm ? '58mm' : '80mm') : 'Carta') + '.pdf';
      doc.save(fileName);
      showToast('PDF descargado: Pago Multiple (' + (isThermal ? (is58mm ? '58mm' : '80mm') : 'Carta') + ')');
    }

    function generateDirectTripPDF(tripId) {
      const { jsPDF } = window.jspdf;
      const trip = AppState.data.find(r => r.__backendId === tripId);
      if (!trip) return;

      const printerType = getEffectivePrinterType();
      let format, unit, pageWidth, pageHeight, isThermal, is58mm;

      switch (printerType) {
        case 'thermal_58':
          format = [58, 200]; unit = 'mm'; pageWidth = 58; pageHeight = 200;
          isThermal = true; is58mm = true;
          break;
        case 'thermal_80':
          format = [80, 200]; unit = 'mm'; pageWidth = 80; pageHeight = 200;
          isThermal = true; is58mm = false;
          break;
        default:
          format = 'letter'; unit = 'mm'; pageWidth = 216; pageHeight = 279;
          isThermal = false; is58mm = false;
          break;
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: unit, format: format });
      const margin = isThermal ? 3 : 20;
      let yPos = margin + 2;

      const remaining = (trip.trip_amount || 0) - (trip.amount_paid || 0);
      const paymentStatus = trip.payment_status === 'pagado' ? 'PAGADO' : remaining > 0 && trip.amount_paid > 0 ? 'PARCIAL' : 'PENDIENTE';

      // Logo
      if (AppState.config.company_logo) {
        try {
          const logoWidth = isThermal ? (is58mm ? 25 : 35) : 40;
          const logoHeight = logoWidth * 0.5;
          doc.addImage(AppState.config.company_logo, 'JPEG', pageWidth/2 - logoWidth/2, yPos, logoWidth, logoHeight);
          yPos += logoHeight + (isThermal ? 2 : 5);
        } catch (e) {}
      }

      if (isThermal) {
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text(AppState.config.company_name.toUpperCase(), pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.text(AppState.config.company_slogan, pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 3;
        yPos += 2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('FACTURA VIAJE DIRECTO', pageWidth/2, yPos, { align: 'center' });
        yPos += 4;
        doc.setFontSize(9);
        doc.text(trip.invoice_number, pageWidth/2, yPos, { align: 'center' });
        yPos += 4;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('ESTADO: ' + paymentStatus, pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        yPos += 1;
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('FECHA: ' + fmt.dateTime(trip.date), margin, yPos);
        yPos += 4;
        doc.text('COMPANIA:', margin, yPos);
        yPos += 4;
        doc.text(trip.source_company, margin + 2, yPos);
        yPos += 4;
        doc.setFont(undefined, 'normal');
        yPos += 1;
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('CHOFER: ' + trip.driver_name, margin, yPos);
        yPos += 4;
        doc.text('VEHICULO: ' + trip.vehicle_plate, margin, yPos);
        yPos += 4;
        doc.text('METROS3: ' + fmt.number(trip.meters, 2), margin, yPos);
        yPos += 4;
        doc.text('MATERIAL: ' + (trip.material_type || 'N/A'), margin, yPos);
        yPos += 4;
        doc.text('CLIENTE: ' + trip.destination_client, margin, yPos);
        yPos += 4;
        doc.setFont(undefined, 'normal');
        yPos += 1;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('TOTAL:', margin, yPos);
        doc.text(fmt.currency(trip.trip_amount), pageWidth - margin, yPos, { align: 'right' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        if (trip.amount_paid > 0) {
          yPos += 1;
          doc.setLineWidth(0.3);
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 4;
          doc.setFontSize(8);
          doc.setFont(undefined, 'bold');
          doc.text('PAGADO: ' + fmt.currency(trip.amount_paid), margin, yPos);
          yPos += 4;
          doc.text('RESTANTE: ' + fmt.currency(remaining), margin, yPos);
          doc.setFont(undefined, 'normal');
          yPos += 4;
        }
        if (trip.notes) {
          yPos += 1;
          doc.setLineWidth(0.3);
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 4;
          doc.setFontSize(7);
          doc.text('NOTAS: ' + trip.notes, margin, yPos);
          yPos += 4;
        }
        yPos += 2;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('GRACIAS POR SU PREFERENCIA', pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
      } else {
        doc.setFontSize(20);
        doc.text(AppState.config.company_name, pageWidth/2, yPos, { align: 'center' });
        yPos += 8;
        doc.setFontSize(10);
        doc.text(AppState.config.company_slogan, pageWidth/2, yPos, { align: 'center' });
        yPos += 5;
        yPos += 2;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(16);
        doc.setTextColor(245, 158, 11);
        doc.text('FACTURA VIAJE DIRECTO', pageWidth/2, yPos, { align: 'center' });
        yPos += 6;
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(trip.invoice_number, pageWidth/2, yPos, { align: 'center' });
        yPos += 6;
        doc.setFontSize(10);
        const statusColor = trip.payment_status === 'pagado' ? [5, 150, 105] : remaining > 0 && trip.amount_paid > 0 ? [217, 119, 6] : [220, 38, 38];
        doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
        doc.text('Estado: ' + paymentStatus, margin, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 5;
        doc.text('Fecha: ' + fmt.dateTime(trip.date), margin, yPos);
        yPos += 5;
        yPos += 2;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, yPos, contentWidth, 8, 'F');
        doc.setFontSize(9);
        doc.text('Compania Origen', margin + 2, yPos + 5);
        yPos += 15;
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(trip.source_company, margin + 2, yPos);
        doc.setFont(undefined, 'normal');
        yPos += 8;
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(10);
        doc.text('Chofer: ' + trip.driver_name, margin, yPos);
        yPos += 5;
        doc.text('Vehiculo: ' + trip.vehicle_plate, margin, yPos);
        yPos += 5;
        doc.text('Metros3: ' + fmt.number(trip.meters, 2), margin, yPos);
        yPos += 5;
        doc.text('Material: ' + (trip.material_type || 'No especificado'), margin, yPos);
        yPos += 5;
        doc.text('Cliente Destino: ' + trip.destination_client, margin, yPos);
        yPos += 8;
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(14);
        doc.setTextColor(245, 158, 11);
        doc.text('TOTAL: ' + fmt.currency(trip.trip_amount), pageWidth - margin, yPos, { align: 'right' });
        if (trip.amount_paid > 0) {
          yPos += 8;
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          doc.text('Pagado: ' + fmt.currency(trip.amount_paid), pageWidth - margin - 50, yPos);
          doc.setTextColor(220, 38, 38);
          doc.text('Restante: ' + fmt.currency(remaining), pageWidth - margin, yPos, { align: 'right' });
        }
      }

      if (!isThermal) {
        yPos += 15;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text('Documento generado por ERP Materiales del Norte', pageWidth/2, yPos, { align: 'center' });
      }

      let fileName = 'viaje_directo_' + trip.invoice_number + '_' + (isThermal ? (is58mm ? '58mm' : '80mm') : 'Carta') + '.pdf';
      doc.save(fileName);
      showToast('PDF descargado: Viaje Directo ' + trip.invoice_number + ' (' + (isThermal ? (is58mm ? '58mm' : '80mm') : 'Carta') + ')');
    }

    function generateDirectTripPaymentPDF(trip, amount, method, notes) {
      const { jsPDF } = window.jspdf;
      const remaining = (trip.trip_amount || 0) - (trip.amount_paid || 0);
      const isFullyPaid = remaining <= 0;

      const printerType = getEffectivePrinterType();
      let format, unit, pageWidth, pageHeight, isThermal, is58mm;

      switch (printerType) {
        case 'thermal_58':
          format = [58, 200]; unit = 'mm'; pageWidth = 58; pageHeight = 200;
          isThermal = true; is58mm = true;
          break;
        case 'thermal_80':
          format = [80, 200]; unit = 'mm'; pageWidth = 80; pageHeight = 200;
          isThermal = true; is58mm = false;
          break;
        default:
          format = 'letter'; unit = 'mm'; pageWidth = 216; pageHeight = 279;
          isThermal = false; is58mm = false;
          break;
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: unit, format: format });
      const margin = isThermal ? 3 : 20;
      let yPos = margin + 2;

      // Logo
      if (AppState.config.company_logo) {
        try {
          const logoWidth = isThermal ? (is58mm ? 25 : 35) : 40;
          const logoHeight = logoWidth * 0.5;
          doc.addImage(AppState.config.company_logo, 'JPEG', pageWidth/2 - logoWidth/2, yPos, logoWidth, logoHeight);
          yPos += logoHeight + (isThermal ? 2 : 5);
        } catch (e) {}
      }

      if (isThermal) {
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text(AppState.config.company_name.toUpperCase(), pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.text(AppState.config.company_slogan, pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 3;
        yPos += 2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(isFullyPaid ? 'RECIBO PAGO TOTAL' : 'RECIBO ABONO', pageWidth/2, yPos, { align: 'center' });
        yPos += 4;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text(isFullyPaid ? 'PAGO COMPLETO' : 'ABONO PARCIAL', pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        yPos += 1;
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('FECHA: ' + fmt.dateTime(new Date().toISOString()), margin, yPos);
        yPos += 4;
        doc.text('FACTURA: ' + trip.invoice_number, margin, yPos);
        yPos += 4;
        doc.text('COMPANIA: ' + trip.source_company, margin, yPos);
        yPos += 4;
        doc.text('CHOFER: ' + trip.driver_name, margin, yPos);
        yPos += 4;
        doc.text('CLIENTE: ' + trip.destination_client, margin, yPos);
        yPos += 4;
        doc.setFont(undefined, 'normal');
        yPos += 1;
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('METODO: ' + method.toUpperCase(), margin, yPos);
        yPos += 4;
        if (notes) {
          doc.text('NOTA: ' + notes, margin, yPos);
          yPos += 4;
        }
        doc.setFont(undefined, 'normal');
        yPos += 1;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text((isFullyPaid ? 'TOTAL PAGADO:' : 'ABONO:'), margin, yPos);
        doc.text(fmt.currency(amount), pageWidth - margin, yPos, { align: 'right' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        if (!isFullyPaid) {
          yPos += 1;
          doc.setLineWidth(0.3);
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 4;
          doc.setFontSize(8);
          doc.setFont(undefined, 'bold');
          doc.text('TOTAL FACTURA: ' + fmt.currency(trip.trip_amount), margin, yPos);
          yPos += 4;
          doc.text('PAGADO: ' + fmt.currency(trip.amount_paid), margin, yPos);
          yPos += 4;
          doc.text('RESTANTE: ' + fmt.currency(remaining), margin, yPos);
          yPos += 4;
          doc.setFontSize(6);
          doc.text('* Conserve este recibo para futuros pagos', margin, yPos);
          doc.setFont(undefined, 'normal');
          yPos += 4;
        } else {
          yPos += 1;
          doc.setLineWidth(0.5);
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 4;
          doc.setFontSize(9);
          doc.setFont(undefined, 'bold');
          doc.text('*** DEUDA LIQUIDADA ***', pageWidth/2, yPos, { align: 'center' });
          doc.setFont(undefined, 'normal');
          yPos += 4;
        }
        yPos += 2;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('GRACIAS POR SU PAGO', pageWidth/2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
      } else {
        doc.setFontSize(20);
        doc.text(AppState.config.company_name, pageWidth/2, yPos, { align: 'center' });
        yPos += 8;
        doc.setFontSize(10);
        doc.text(AppState.config.company_slogan, pageWidth/2, yPos, { align: 'center' });
        yPos += 5;
        yPos += 2;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(16);
        doc.setTextColor(isFullyPaid ? 5 : 217, isFullyPaid ? 150 : 119, isFullyPaid ? 105 : 6);
        doc.text(isFullyPaid ? 'RECIBO DE PAGO TOTAL' : 'RECIBO DE ABONO', pageWidth/2, yPos, { align: 'center' });
        yPos += 6;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text('Fecha: ' + fmt.dateTime(new Date().toISOString()), margin, yPos);
        yPos += 5;
        doc.text('Factura: ' + trip.invoice_number, margin, yPos);
        yPos += 5;
        doc.text('Compania: ' + trip.source_company, margin, yPos);
        yPos += 5;
        doc.text('Chofer: ' + trip.driver_name, margin, yPos);
        yPos += 5;
        doc.text('Material: ' + (trip.material_type || 'No especificado'), margin, yPos);
        yPos += 5;
        doc.text('Cliente: ' + trip.destination_client, margin, yPos);
        yPos += 5;
        yPos += 2;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;
        doc.text('Metodo de pago: ' + method.toUpperCase(), margin, yPos);
        yPos += 5;
        if (notes) {
          doc.text('Notas: ' + notes, margin, yPos);
          yPos += 5;
        }
        yPos += 2;
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(14);
        doc.setTextColor(isFullyPaid ? 5 : 217, isFullyPaid ? 150 : 119, isFullyPaid ? 105 : 6);
        doc.text((isFullyPaid ? 'TOTAL PAGADO: ' : 'ABONO: ') + fmt.currency(amount), pageWidth - margin, yPos, { align: 'right' });
        if (!isFullyPaid) {
          yPos += 10;
          doc.setFillColor(254, 243, 199);
          doc.rect(margin, yPos, contentWidth, 30, 'F');
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          doc.text('SALDO PENDIENTE', margin + 5, yPos + 8);
          doc.setTextColor(217, 119, 6);
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.text(fmt.currency(remaining), margin + 5, yPos + 22);
          doc.setFont(undefined, 'normal');
          yPos += 35;
        } else {
          yPos += 15;
          doc.setFillColor(209, 250, 229);
          doc.rect(margin, yPos, contentWidth, 15, 'F');
          doc.setFontSize(12);
          doc.setTextColor(5, 150, 105);
          doc.text('OK DEUDA LIQUIDADA COMPLETAMENTE', pageWidth/2, yPos + 10, { align: 'center' });
          yPos += 25;
        }
      }

      if (!isThermal) {
        yPos += 10;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text('Documento generado por ERP Materiales del Norte', pageWidth/2, yPos, { align: 'center' });
      }

      let fileName = 'recibo_viaje_' + trip.invoice_number + '_' + (isThermal ? (is58mm ? '58mm' : '80mm') : 'Carta') + '.pdf';
      doc.save(fileName);
      showToast('PDF descargado: Recibo Viaje Directo (' + (isThermal ? (is58mm ? '58mm' : '80mm') : 'Carta') + ')');
    }

    // ============================================================
    // FIN FUNCIONES PDF
    // ============================================================

    function fuelTodayInput() {
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    }

    function fuelSafe(value) {
      return escapeHtml(value);
    }

    function splitFuelPlateModel(value) {
      const text = String(value || '').trim();
      if (!text) return ['', ''];
      const parts = text.split(/\s+/);
      return parts.length === 1 ? [text, ''] : [parts[0], parts.slice(1).join(' ')];
    }

    function fuelPlate(record) {
      if (record?.plate) return record.plate;
      return splitFuelPlateModel(record?.plate_model)[0];
    }

    function fuelVehicleModel(record) {
      if (record?.vehicle_model) return record.vehicle_model;
      return splitFuelPlateModel(record?.plate_model)[1];
    }

    function fuelVehicleText(record) {
      return [fuelPlate(record), fuelVehicleModel(record)].filter(Boolean).join(' ');
    }

    function getFuelTotals() {
      const deliveries = getRecords('fuel_delivery');
      const dispatches = getRecords('fuel_dispatch');
      const received = deliveries.reduce((a, r) => a + (Number(r.quantity) || 0), 0);
      const consumed = dispatches.reduce((a, r) => a + (Number(r.quantity) || 0), 0);
      return { deliveries, dispatches, received, consumed, remaining: received - consumed };
    }

    function getFilteredFuelDispatches() {
      const filters = AppState.fuelFilters || { search: '', dateFrom: '', dateTo: '' };
      return getRecords('fuel_dispatch').filter(r => {
        const search = (filters.search || '').toLowerCase();
        const matchesSearch = !search ||
          (r.name || '').toLowerCase().includes(search) ||
          fuelPlate(r).toLowerCase().includes(search) ||
          fuelVehicleModel(r).toLowerCase().includes(search) ||
          (r.plate_model || '').toLowerCase().includes(search) ||
          (r.address || '').toLowerCase().includes(search);
        const matchesDate = matchesDateFilter(r.date, filters.dateFrom, filters.dateTo);
        return matchesSearch && matchesDate;
      }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    function getFuelDeliveryDateForDispatch(dispatchDate, deliveries = getRecords('fuel_delivery')) {
      const sortedDeliveries = [...deliveries].sort((a, b) => new Date(a.date) - new Date(b.date));
      if (!sortedDeliveries.length) return '';
      const dispatchTime = new Date(dispatchDate).getTime();
      const matchingDelivery = sortedDeliveries
        .slice()
        .reverse()
        .find(r => {
          const deliveryTime = new Date(r.date).getTime();
          return Number.isFinite(deliveryTime) && Number.isFinite(dispatchTime) && deliveryTime <= dispatchTime;
        });
      return (matchingDelivery || sortedDeliveries[sortedDeliveries.length - 1]).date || '';
    }

    function renderFuelDispatch(container) {
      const totals = getFuelTotals();
      const filtered = getFilteredFuelDispatches();
      const filteredConsumed = filtered.reduce((a, r) => a + (Number(r.quantity) || 0), 0);
      const lastDelivery = totals.deliveries.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      const availablePercent = totals.received > 0 ? Math.max(0, Math.min(100, (totals.remaining / totals.received) * 100)) : 0;
      const consumedPercent = totals.received > 0 ? Math.max(0, Math.min(100, (totals.consumed / totals.received) * 100)) : 0;
      const fuelStatus = totals.remaining < 0 ? 'Sobregirado' : availablePercent <= 20 && totals.received > 0 ? 'Nivel bajo' : 'Operativo';
      const fuelStatusColor = totals.remaining < 0 ? 'text-rose-300 border-rose-500/30 bg-rose-500/10' : availablePercent <= 20 && totals.received > 0 ? 'text-amber-300 border-amber-500/30 bg-amber-500/10' : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';

      container.innerHTML = `
        <div class="space-y-6 animate-fade-in">
          <div class="premium-hero rounded-xl p-5 md:p-6">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div>
                <div class="flex flex-wrap items-center gap-2 mb-3">
                  <span class="premium-chip"><i data-lucide="fuel" class="w-3.5 h-3.5 text-primary-400"></i> Control premium</span>
                  <span class="premium-chip ${fuelStatusColor}">${fuelStatus}</span>
                </div>
                <h2 class="text-2xl md:text-3xl font-bold text-slate-100">Despacho de gasol</h2>
                <p class="text-slate-400 text-sm mt-1">Inventario, consumo, recibos y reportes de gasolina en una sola vista.</p>
              </div>
              <div class="min-w-full lg:min-w-[360px]">
                <div class="flex items-end justify-between mb-2">
                  <div>
                    <div class="text-xs uppercase font-bold text-slate-500">Disponible actual</div>
                <div class="text-3xl font-black font-mono ${totals.remaining < 0 ? 'text-rose-300' : 'text-emerald-300'}">${fmt.number(totals.remaining, 2)} G</div>
                  </div>
                  <div class="text-right text-xs text-slate-500">
                    <div>Consumido</div>
                    <div class="font-mono text-amber-300">${fmt.number(consumedPercent, 1)}%</div>
                  </div>
                </div>
                <div class="premium-meter"><div class="premium-meter-fill" style="width:${availablePercent}%"></div></div>
                <div class="flex justify-between text-[11px] text-slate-500 mt-2">
                    <span>0 G</span>
                    <span>${fmt.number(totals.received, 2)} G recibidos</span>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-5">
                <button onclick="showFuelDeliveryModal()" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-lg transition-all shadow-lg shadow-blue-500/10">
                  <i data-lucide="truck" class="w-4 h-4"></i> Llegada de gasol
                </button>
                <button onclick="showFuelDispatchModal()" class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-400 text-slate-900 font-semibold rounded-lg transition-all shadow-lg shadow-primary-500/20">
                  <i data-lucide="fuel" class="w-4 h-4"></i> Nuevo despacho
                </button>
                <button onclick="exportFuelExcel('full')" class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 font-semibold rounded-lg transition-all">
                  <i data-lucide="download" class="w-4 h-4"></i> Excel
                </button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="premium-card rounded-xl p-5 border-l-4 border-blue-500 hover-lift">
              <div class="flex items-center justify-between mb-2">
              <div class="text-slate-400 text-xs font-semibold uppercase">Gasol recibido</div>
                <i data-lucide="download-cloud" class="w-4 h-4 text-blue-400"></i>
              </div>
              <div class="text-2xl font-bold text-blue-400 font-mono">${fmt.number(totals.received, 2)} G</div>
            </div>
            <div class="premium-card rounded-xl p-5 border-l-4 border-amber-500 hover-lift">
              <div class="flex items-center justify-between mb-2">
              <div class="text-slate-400 text-xs font-semibold uppercase">Gasol consumido</div>
                <i data-lucide="gauge" class="w-4 h-4 text-amber-400"></i>
              </div>
              <div class="text-2xl font-bold text-amber-400 font-mono">${fmt.number(totals.consumed, 2)} G</div>
            </div>
            <div class="premium-card rounded-xl p-5 border-l-4 ${totals.remaining < 0 ? 'border-rose-500' : 'border-emerald-500'} hover-lift">
              <div class="flex items-center justify-between mb-2">
                <div class="text-slate-400 text-xs font-semibold uppercase">Gasol disponible</div>
                <i data-lucide="${totals.remaining < 0 ? 'alert-triangle' : 'shield-check'}" class="w-4 h-4 ${totals.remaining < 0 ? 'text-rose-400' : 'text-emerald-400'}"></i>
              </div>
              <div class="text-2xl font-bold ${totals.remaining < 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">${fmt.number(totals.remaining, 2)} G</div>
            </div>
            <div class="premium-card rounded-xl p-5 border-l-4 border-slate-500 hover-lift">
              <div class="flex items-center justify-between mb-2">
                <div class="text-slate-400 text-xs font-semibold uppercase">Ultima llegada</div>
                <i data-lucide="calendar-check" class="w-4 h-4 text-slate-400"></i>
              </div>
              <div class="text-sm font-semibold text-slate-200">${lastDelivery ? fuelSafe(lastDelivery.company) : 'Sin registro'}</div>
              <div class="text-xs text-slate-500 mt-1">${lastDelivery ? `${fmt.dateTime(lastDelivery.date)} - ${fmt.number(lastDelivery.quantity, 2)} G` : 'Registra una llegada'}</div>
            </div>
          </div>

          <div class="premium-card rounded-xl p-5 border border-slate-700/50">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
              <div class="flex items-center gap-2 text-primary-400">
                <i data-lucide="search" class="w-4 h-4"></i>
                <span class="text-sm font-semibold">Buscar y reportar consumo</span>
              </div>
              <div class="text-xs text-slate-500">
              Reporte actual: <span class="font-bold text-amber-400 font-mono">${fmt.number(filteredConsumed, 2)} G</span> en ${filtered.length} despachos
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div class="md:col-span-2">
                <label class="block text-xs text-slate-500 mb-1">Buscar por nombre, placa o direccion</label>
                <input type="text" id="fuelSearch" value="${fuelSafe(AppState.fuelFilters.search)}" oninput="updateFuelFilters()" placeholder="Nombre, placa, modelo..."
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Desde</label>
                <input type="date" id="fuelDateFrom" value="${AppState.fuelFilters.dateFrom}" onchange="updateFuelFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">Hasta</label>
                <input type="date" id="fuelDateTo" value="${AppState.fuelFilters.dateTo}" onchange="updateFuelFilters()"
                  class="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 text-sm input-focus">
              </div>
              <div class="flex items-end gap-2">
                <button onclick="clearFuelFilters()" class="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-xs text-slate-300 hover:text-white transition-colors">Limpiar</button>
                <button onclick="exportFuelExcel('filtered')" class="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1">
                  <i data-lucide="download" class="w-3 h-3"></i> Excel
                </button>
              </div>
            </div>
            <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="rounded-lg bg-slate-950/50 border border-slate-700/70 p-3">
                <div class="text-xs text-slate-500 uppercase font-bold">Consumo filtrado</div>
              <div class="text-lg font-black font-mono text-amber-300">${fmt.number(filteredConsumed, 2)} G</div>
              </div>
              <div class="rounded-lg bg-slate-950/50 border border-slate-700/70 p-3">
                <div class="text-xs text-slate-500 uppercase font-bold">Registros</div>
                <div class="text-lg font-black font-mono text-slate-100">${filtered.length}</div>
              </div>
              <div class="rounded-lg bg-slate-950/50 border border-slate-700/70 p-3">
                <div class="text-xs text-slate-500 uppercase font-bold">Saldo global</div>
              <div class="text-lg font-black font-mono ${totals.remaining < 0 ? 'text-rose-300' : 'text-emerald-300'}">${fmt.number(totals.remaining, 2)} G</div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div class="xl:col-span-2 premium-card rounded-xl overflow-hidden">
              <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 class="font-semibold text-slate-200 flex items-center gap-2"><i data-lucide="receipt" class="w-4 h-4 text-primary-400"></i> Despachos</h3>
                <span class="text-xs text-slate-500">${filtered.length} registros</span>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Fecha que llego el gasol</th>
                      <th>Nombre</th>
                      <th>Horometro</th>
                      <th>Placa</th>
                      <th>Modelo</th>
                      <th>Direccion</th>
                      <th class="text-right">Gasol</th>
                      <th class="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filtered.length === 0 ? `
                      <tr><td colspan="9" class="text-center py-12 text-slate-500">No hay despachos con esos filtros</td></tr>
                    ` : filtered.map(r => `
                      <tr>
                        <td class="text-slate-400 text-sm">${fmt.dateTime(r.date)}</td>
                        <td class="text-blue-300 text-sm font-medium">${getFuelDeliveryDateForDispatch(r.date, totals.deliveries) ? fmt.date(getFuelDeliveryDateForDispatch(r.date, totals.deliveries)) : '-'}</td>
                        <td class="font-medium text-slate-200">${fuelSafe(r.name)}</td>
                        <td class="font-mono text-xs text-slate-300">${r.odometer ? fuelSafe(r.odometer) : '-'}</td>
                        <td class="text-slate-300 font-mono text-xs">${fuelSafe(fuelPlate(r))}</td>
                        <td class="text-slate-300">${fuelSafe(fuelVehicleModel(r))}</td>
                        <td class="text-slate-300">${fuelSafe(r.address)}</td>
                        <td class="text-right font-mono text-amber-400">${fmt.number(r.quantity, 2)} G</td>
                        <td class="text-right">
                          <div class="flex items-center justify-end gap-2">
                            <button onclick="showFuelDispatchModal('${r.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors" title="Editar despacho">
                              <i data-lucide="pencil" class="w-4 h-4"></i>
                            </button>
                            <button onclick="printFuelReceipt('${r.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 transition-colors" title="Imprimir recibo">
                              <i data-lucide="printer" class="w-4 h-4"></i>
                            </button>
                            ${AppState.deleteConfirmId === r.__backendId ? `
                              <div class="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-1.5">
                                <span class="text-xs text-rose-400">Eliminar?</span>
                                <button onclick="confirmDeleteRecord('${r.__backendId}')" class="text-xs text-rose-400 hover:text-rose-300 font-semibold">Si</button>
                                <button onclick="cancelDelete()" class="text-xs text-slate-400 hover:text-slate-300">No</button>
                              </div>
                            ` : `
                              <button onclick="askDelete('${r.__backendId}')" class="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Eliminar">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                              </button>
                            `}
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="premium-card rounded-xl overflow-hidden">
              <div class="px-5 py-4 border-b border-slate-800">
                <h3 class="font-semibold text-slate-200 flex items-center gap-2"><i data-lucide="truck" class="w-4 h-4 text-blue-400"></i> Llegadas de gasol</h3>
              </div>
              <div class="divide-y divide-slate-800/50 max-h-[520px] overflow-y-auto">
                ${totals.deliveries.length === 0 ? `
                  <div class="p-8 text-center text-slate-500">Sin llegadas registradas</div>
                ` : totals.deliveries.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(r => `
                  <div class="p-4">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <div class="font-semibold text-slate-200">${fuelSafe(r.company)}</div>
                        <div class="text-xs text-slate-500">${fmt.dateTime(r.date)}</div>
                      </div>
                      <div class="text-right">
                        <div class="font-mono font-bold text-blue-400">${fmt.number(r.quantity, 2)} G</div>
                        ${AppState.deleteConfirmId === r.__backendId ? `
                          <div class="mt-2 flex items-center gap-2">
                            <button onclick="confirmDeleteRecord('${r.__backendId}')" class="text-xs text-rose-400">Eliminar</button>
                            <button onclick="cancelDelete()" class="text-xs text-slate-400">No</button>
                          </div>
                        ` : `<button onclick="askDelete('${r.__backendId}')" class="mt-2 text-xs text-rose-400 hover:text-rose-300">Eliminar</button>`}
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
      lucide.createIcons();
    }

    function updateFuelFilters() {
      AppState.fuelFilters.search = document.getElementById('fuelSearch')?.value || '';
      AppState.fuelFilters.dateFrom = document.getElementById('fuelDateFrom')?.value || '';
      AppState.fuelFilters.dateTo = document.getElementById('fuelDateTo')?.value || '';
      renderFilterPage('fuelSearch');
    }

    function clearFuelFilters() {
      AppState.fuelFilters = { search: '', dateFrom: '', dateTo: '' };
      renderPage();
    }

    function showFuelDispatchModal(id = null) {
      const existing = id ? AppState.data.find(r => r.__backendId === id && r.type === 'fuel_dispatch') : null;
      const existingPlate = existing ? fuelPlate(existing) : '';
      const existingModel = existing ? fuelVehicleModel(existing) : '';
      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-w-2xl w-full">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-100">${existing ? 'Editar' : 'Nuevo'} despacho de gasol</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <form onsubmit="saveFuelDispatch(event)" class="space-y-4">
            <input id="fuelDispatchId" type="hidden" value="${existing ? fuelSafe(existing.__backendId) : ''}">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Nombre</label>
                <input id="fuelName" required value="${existing ? fuelSafe(existing.name) : ''}" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Fecha</label>
                <input id="fuelDate" type="datetime-local" required value="${existing ? fuelSafe(existing.date) : fuelTodayInput()}" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Horometro <span class="text-xs text-slate-500">(opcional)</span></label>
                <input id="fuelOdometer" placeholder="Opcional" value="${existing ? fuelSafe(existing.odometer) : ''}" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Placa del vehiculo</label>
                <input id="fuelPlate" required value="${fuelSafe(existingPlate)}" placeholder="Ej: ABC-1234" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono input-focus">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Modelo del vehiculo</label>
                <input id="fuelVehicleModel" required value="${fuelSafe(existingModel)}" placeholder="Ej: Toyota Hilux" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Direccion</label>
                <input id="fuelAddress" required value="${existing ? fuelSafe(existing.address) : ''}" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Cantidad de gasol</label>
                <input id="fuelQuantity" type="number" step="0.01" min="0.01" required value="${existing ? fuelSafe(existing.quantity) : ''}" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus">
              </div>
            </div>
            <div class="flex justify-end gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="px-4 py-2 text-slate-400 hover:text-slate-200">Cancelar</button>
              ${existing ? `
                <button type="submit" data-print="false" class="px-5 py-2 bg-primary-500 hover:bg-primary-400 text-slate-900 font-semibold rounded-lg">Guardar cambios</button>
              ` : `
                <button type="submit" data-print="false" class="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold rounded-lg">Guardar</button>
                <button type="submit" data-print="true" class="px-5 py-2 bg-primary-500 hover:bg-primary-400 text-slate-900 font-semibold rounded-lg">Guardar e imprimir</button>
              `}
            </div>
          </form>
        </div>
      `);
    }

    function showFuelDeliveryModal() {
      showModal(`
        <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-w-xl w-full">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-100">Llegada de gasol</h2>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-200"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <form onsubmit="saveFuelDelivery(event)" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Fecha que llego</label>
              <input id="fuelDeliveryDate" type="datetime-local" required value="${fuelTodayInput()}" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus">
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">Nombre de la compania que lo trajo</label>
              <input id="fuelDeliveryCompany" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus">
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-400 mb-2">Cantidad de gasol recibido</label>
              <input id="fuelDeliveryQuantity" type="number" step="0.01" min="0.01" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 input-focus">
            </div>
            <div class="flex justify-end gap-3 pt-4">
              <button type="button" onclick="closeModal()" class="px-4 py-2 text-slate-400 hover:text-slate-200">Cancelar</button>
              <button type="submit" class="px-5 py-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-lg">Guardar llegada</button>
            </div>
          </form>
        </div>
      `);
    }

    function saveFuelDispatch(event) {
      event.preventDefault();
      const shouldPrint = event.submitter?.dataset.print !== 'false';
      const existingId = document.getElementById('fuelDispatchId')?.value || '';
      const record = {
        __backendId: existingId || 'fuel_dispatch_' + Date.now(),
        type: 'fuel_dispatch',
        name: document.getElementById('fuelName').value.trim(),
        date: document.getElementById('fuelDate').value,
        odometer: document.getElementById('fuelOdometer').value.trim(),
        plate: document.getElementById('fuelPlate').value.trim().toUpperCase(),
        vehicle_model: document.getElementById('fuelVehicleModel').value.trim(),
        address: document.getElementById('fuelAddress').value.trim(),
        quantity: Number(document.getElementById('fuelQuantity').value) || 0
      };
      record.plate_model = fuelVehicleText(record);
      const existingIndex = existingId ? AppState.data.findIndex(r => r.__backendId === existingId) : -1;
      if (existingIndex !== -1) {
        AppState.data[existingIndex] = { ...AppState.data[existingIndex], ...record };
      } else {
        AppState.data.push(record);
      }
      AppState.saveUserData();
      closeModal();
      renderPage();
      showToast(existingIndex !== -1 ? 'Despacho de gasol actualizado' : 'Despacho de gasol guardado');
      if (shouldPrint) printFuelReceipt(record.__backendId);
    }

    function saveFuelDelivery(event) {
      event.preventDefault();
      AppState.data.push({
        __backendId: 'fuel_delivery_' + Date.now(),
        type: 'fuel_delivery',
        date: document.getElementById('fuelDeliveryDate').value,
        company: document.getElementById('fuelDeliveryCompany').value.trim(),
        quantity: Number(document.getElementById('fuelDeliveryQuantity').value) || 0
      });
      AppState.saveUserData();
      closeModal();
      renderPage();
      showToast('Llegada de gasol registrada');
    }

    async function printFuelReceipt(id) {
      const r = AppState.data.find(x => x.__backendId === id);
      if (!r) return;
      const printerType = isBluetoothPrinterSelected() ? 'standard' : getEffectivePrinterType();

      if (isBluetoothPrinterSelected()) {
        try {
          await BluetoothPrinter.printText(BluetoothPrinter.buildFuelReceiptText(id));
          showToast('Recibo de gasol enviado por Bluetooth', 'success');
          return;
        } catch (err) {
          showToast('No se pudo imprimir directo por Bluetooth. Se abrira impresion normal.', 'warning');
        }
      }

      if (isDownloadPrintMode(printerType)) {
        generateFuelReceiptPDF(id);
        return;
      }

      const totals = getFuelTotals();
      const isThermal = printerType.includes('thermal');
      const is58mm = printerType === 'thermal_58';
      const width = is58mm ? '58mm' : isThermal ? '80mm' : '210mm';
      const paperSize = AppState.config.paper_size === 'a4' ? 'A4' : 'letter';
      const logoSection = AppState.config.company_logo ?
        `<div class="center"><img src="${AppState.config.company_logo}" class="logo" alt="Logo"></div>` : '';

      const styles = isThermal ? `
        <style>
          @page { size: ${width} auto; margin: 0; }
          body { width: ${width}; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; padding: 5mm; color: #000; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 6px 0; }
          .item { display: flex; justify-content: space-between; gap: 8px; }
          .label { font-weight: bold; }
          .total { font-size: 14px; font-weight: bold; text-align: center; margin: 8px 0; }
          .muted { font-size: 10px; color: #555; }
          .logo { max-width: ${is58mm ? '44mm' : '60mm'}; max-height: 20mm; margin-bottom: 5px; }
          .sign { margin-top: 22px; border-top: 1px solid #000; text-align: center; padding-top: 5px; font-size: 10px; }
        </style>
      ` : `
        <style>
          @page { size: ${paperSize}; margin: 20mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; color: #111827; }
          .center { text-align: center; }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 25px; }
          .company { font-size: 24px; font-weight: bold; color: #f59e0b; }
          .receipt-box { border: 1px solid #ddd; padding: 20px; margin: 20px 0; background: #f9fafb; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
          .label { color: #6b7280; font-size: 11px; text-transform: uppercase; font-weight: bold; }
          .value { font-size: 14px; font-weight: 600; }
          .total { text-align: right; font-size: 20px; font-weight: bold; color: #d97706; margin-top: 20px; border-top: 2px solid #e5e7eb; padding-top: 15px; }
          .available { text-align: right; color: #059669; font-weight: bold; margin-top: 8px; }
          .footer { margin-top: 40px; text-align: center; color: #6b7280; font-size: 11px; }
          .logo { max-width: 150px; max-height: 80px; margin-bottom: 10px; }
          .sign { margin-top: 60px; width: 260px; margin-left: auto; margin-right: auto; border-top: 1px solid #111; text-align: center; padding-top: 8px; }
        </style>
      `;

      const content = isThermal ? `
        ${logoSection}
        <div class="center bold" style="font-size: 14px;">${fuelSafe(AppState.config.company_name)}</div>
        <div class="center muted">${fuelSafe(AppState.config.company_slogan)}</div>
      ${AppState.config.company_rfc ? `<div class="center muted">RNC: ${fuelSafe(AppState.config.company_rfc)}</div>` : ''}
        <div class="line"></div>
        <div class="center bold">RECIBO DESPACHO GASOL</div>
        <div class="center muted">${r.__backendId.replace('fuel_dispatch_', 'GAS-')}</div>
        <div class="line"></div>
        <div>Fecha: ${fmt.dateTime(r.date)}</div>
        <div>Nombre: ${fuelSafe(r.name)}</div>
        ${r.odometer ? `<div>Horometro: ${fuelSafe(r.odometer)}</div>` : ''}
        <div>Placa: ${fuelSafe(fuelPlate(r))}</div>
        <div>Modelo: ${fuelSafe(fuelVehicleModel(r))}</div>
        <div>Direccion: ${fuelSafe(r.address)}</div>
        <div class="line"></div>
        <div class="total">CANTIDAD: ${fmt.number(r.quantity, 2)} G</div>
        <div class="center muted">Disponible: ${fmt.number(totals.remaining, 2)} G</div>
        <div class="line"></div>
        <div class="sign">Firma de recibido</div>
        <div class="center muted" style="margin-top: 14px;">${AppState.config.company_phone ? `Tel: ${fuelSafe(AppState.config.company_phone)}` : ''}</div>
      ` : `
        <div class="header">
          ${logoSection}
          <div class="company">${fuelSafe(AppState.config.company_name)}</div>
          <div>${fuelSafe(AppState.config.company_slogan)}</div>
      ${AppState.config.company_rfc ? `<div style="margin-top: 8px;">RNC: ${fuelSafe(AppState.config.company_rfc)}</div>` : ''}
          ${AppState.config.company_address ? `<div style="font-size: 11px; margin-top: 5px;">${fuelSafe(AppState.config.company_address)}</div>` : ''}
        </div>
        <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:20px;">
          <div>
            <div class="label">Documento</div>
            <div class="value">Recibo de despacho de gasol</div>
          </div>
          <div style="text-align:right;">
            <div class="label">Recibo</div>
            <div class="value" style="color:#f59e0b;">${r.__backendId.replace('fuel_dispatch_', 'GAS-')}</div>
            <div style="color:#6b7280;">${fmt.dateTime(r.date)}</div>
          </div>
        </div>
        <div class="receipt-box">
          <div class="grid">
            <div><div class="label">Nombre</div><div class="value">${fuelSafe(r.name)}</div></div>
            ${r.odometer ? `<div><div class="label">Horometro</div><div class="value">${fuelSafe(r.odometer)}</div></div>` : ''}
            <div><div class="label">Placa</div><div class="value">${fuelSafe(fuelPlate(r))}</div></div>
            <div><div class="label">Modelo</div><div class="value">${fuelSafe(fuelVehicleModel(r))}</div></div>
            <div><div class="label">Direccion</div><div class="value">${fuelSafe(r.address)}</div></div>
          </div>
          <div class="total">Cantidad despachada: ${fmt.number(r.quantity, 2)} G</div>
          <div class="available">Gasol disponible despues del registro: ${fmt.number(totals.remaining, 2)} G</div>
        </div>
        <div class="sign">Firma de recibido</div>
        <div class="footer">
          <p>Documento generado por ERP Materiales del Norte</p>
          <p>${fuelSafe(AppState.config.company_phone || '')}</p>
        </div>
      `;

      openPrintDocument(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Recibo gasol</title>
            ${styles}
          <base target="_blank">
</head>
          <body onload="window.print(); window.close();">
            ${content}
          </body>
        </html>
      `, { autoClose: true, blockedMessage: 'Permite ventanas emergentes para imprimir el recibo' });
    }

    function generateFuelReceiptPDF(id) {
      const r = AppState.data.find(x => x.__backendId === id);
      if (!r) return;
      if (!window.jspdf) {
        showToast('No se pudo cargar el generador PDF', 'error');
        return;
      }

      const totals = getFuelTotals();
      const { jsPDF } = window.jspdf;
      const printerType = getEffectivePrinterType();
      let format, unit, pageWidth, pageHeight, isThermal, is58mm;

      switch (printerType) {
        case 'thermal_58':
          format = [58, 200]; unit = 'mm'; pageWidth = 58; pageHeight = 200;
          isThermal = true; is58mm = true;
          break;
        case 'thermal_80':
          format = [80, 200]; unit = 'mm'; pageWidth = 80; pageHeight = 200;
          isThermal = true; is58mm = false;
          break;
        default:
          format = AppState.config.paper_size === 'a4' ? 'a4' : 'letter';
          unit = 'mm'; pageWidth = AppState.config.paper_size === 'a4' ? 210 : 216; pageHeight = AppState.config.paper_size === 'a4' ? 297 : 279;
          isThermal = false; is58mm = false;
          break;
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: unit, format: format });
      const margin = isThermal ? 3 : 20;
      const contentWidth = pageWidth - (margin * 2);
      let yPos = margin + 2;

      if (AppState.config.company_logo) {
        try {
          const logoWidth = isThermal ? (is58mm ? 25 : 35) : 40;
          const logoHeight = logoWidth * 0.5;
          doc.addImage(AppState.config.company_logo, 'JPEG', pageWidth / 2 - logoWidth / 2, yPos, logoWidth, logoHeight);
          yPos += logoHeight + (isThermal ? 2 : 5);
        } catch (e) {}
      }

      if (isThermal) {
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text((AppState.config.company_name || 'Materiales del Norte').toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.text(AppState.config.company_slogan || '', pageWidth / 2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 3;
        if (AppState.config.company_rfc) {
          doc.setFontSize(6);
          doc.setFont(undefined, 'bold');
        doc.text('RNC: ' + AppState.config.company_rfc, pageWidth / 2, yPos, { align: 'center' });
          doc.setFont(undefined, 'normal');
          yPos += 3;
        }
        yPos += 2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('RECIBO DESPACHO GASOL', pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;
        doc.setFontSize(8);
        doc.text(r.__backendId.replace('fuel_dispatch_', 'GAS-'), pageWidth / 2, yPos, { align: 'center' });
        doc.setFont(undefined, 'normal');
        yPos += 4;

        const addThermalLine = (label, value) => {
          const text = `${label}: ${String(value || '')}`;
          const wrapped = doc.splitTextToSize(text, contentWidth);
          doc.setFontSize(8);
          doc.setFont(undefined, 'bold');
          doc.text(wrapped, margin, yPos);
          doc.setFont(undefined, 'normal');
          yPos += wrapped.length * 4;
        };

        addThermalLine('FECHA', fmt.dateTime(r.date));
        addThermalLine('NOMBRE', r.name);
        if (r.odometer) addThermalLine('HOROMETRO', r.odometer);
        addThermalLine('PLACA', fuelPlate(r));
        addThermalLine('MODELO', fuelVehicleModel(r));
        addThermalLine('DIRECCION', r.address);

        yPos += 1;
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('CANTIDAD:', margin, yPos);
        doc.text(fmt.number(r.quantity, 2) + ' G', pageWidth - margin, yPos, { align: 'right' });
        yPos += 4;
        doc.setFontSize(8);
        doc.text('DISPONIBLE:', margin, yPos);
        doc.text(fmt.number(totals.remaining, 2) + ' G', pageWidth - margin, yPos, { align: 'right' });
        doc.setFont(undefined, 'normal');
        yPos += 4;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;
        doc.setLineWidth(0.3);
        doc.line(margin + 5, yPos, pageWidth - margin - 5, yPos);
        yPos += 4;
        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.text('FIRMA DE RECIBIDO', pageWidth / 2, yPos, { align: 'center' });
        yPos += 6;
        doc.setFontSize(8);
        doc.text('GRACIAS', pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;
        doc.setFontSize(6);
        doc.text((AppState.config.company_name || 'Materiales del Norte').toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
        yPos += 3;
        if (AppState.config.company_phone) {
          doc.text('TEL: ' + AppState.config.company_phone, pageWidth / 2, yPos, { align: 'center' });
          yPos += 3;
        }
        doc.setFont(undefined, 'normal');
      } else {
        doc.setFontSize(20);
        doc.setTextColor(0, 0, 0);
        doc.text(AppState.config.company_name || 'Materiales del Norte', pageWidth / 2, yPos, { align: 'center' });
        yPos += 8;
        doc.setFontSize(10);
        doc.text(AppState.config.company_slogan || '', pageWidth / 2, yPos, { align: 'center' });
        yPos += 5;
        if (AppState.config.company_rfc) {
          doc.setFontSize(8);
        doc.text('RNC: ' + AppState.config.company_rfc, pageWidth / 2, yPos, { align: 'center' });
          yPos += 4;
        }
        yPos += 2;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(16);
        doc.setTextColor(245, 158, 11);
        doc.text('RECIBO DE DESPACHO DE GASOL', pageWidth / 2, yPos, { align: 'center' });
        yPos += 6;
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(r.__backendId.replace('fuel_dispatch_', 'GAS-'), pageWidth / 2, yPos, { align: 'center' });
        yPos += 8;

        const addStandardLine = (label, value) => {
          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          doc.text(label + ':', margin, yPos);
          doc.setFont(undefined, 'normal');
          doc.text(doc.splitTextToSize(String(value || ''), contentWidth - 45), margin + 45, yPos);
          yPos += 6;
        };

        addStandardLine('Fecha', fmt.dateTime(r.date));
        addStandardLine('Nombre', r.name);
        if (r.odometer) addStandardLine('Horometro', r.odometer);
        addStandardLine('Placa', fuelPlate(r));
        addStandardLine('Modelo', fuelVehicleModel(r));
        addStandardLine('Direccion', r.address);
        yPos += 2;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(245, 158, 11);
        doc.text('CANTIDAD: ' + fmt.number(r.quantity, 2) + ' G', pageWidth - margin, yPos, { align: 'right' });
        yPos += 7;
        doc.setFontSize(10);
        doc.setTextColor(5, 150, 105);
        doc.text('Gasol disponible despues del registro: ' + fmt.number(totals.remaining, 2) + ' G', pageWidth - margin, yPos, { align: 'right' });
        yPos += 28;
        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(0, 0, 0);
        doc.line(pageWidth / 2 - 40, yPos, pageWidth / 2 + 40, yPos);
        yPos += 6;
        doc.setFontSize(10);
        doc.text('Firma de recibido', pageWidth / 2, yPos, { align: 'center' });
        yPos += 18;
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text('Documento generado por ERP Materiales del Norte', pageWidth / 2, yPos, { align: 'center' });
      }

      const suffix = isThermal ? (is58mm ? '58mm' : '80mm') : (AppState.config.paper_size === 'a4' ? 'A4' : 'Carta');
      doc.save(`recibo_gasol_${r.__backendId.replace('fuel_dispatch_', 'GAS-')}_${suffix}.pdf`);
      showToast('PDF descargado: Recibo de gasol (' + suffix + ')');
    }

    function exportFuelExcel(mode = 'filtered') {
      if (!window.XLSX) {
        showExcelLibraryError();
        return;
      }
      const totals = getFuelTotals();
      const filtered = getFilteredFuelDispatches();
      const filters = AppState.fuelFilters || { search: '', dateFrom: '', dateTo: '' };
      const isFullReport = mode === 'full';
      const dispatches = isFullReport ? totals.dispatches : filtered;
      const exportedDispatched = dispatches.reduce((a, r) => a + (Number(r.quantity) || 0), 0);
      const reportDeliveries = isFullReport
        ? totals.deliveries
        : totals.deliveries.filter(r => matchesDateFilter(r.date, filters.dateFrom, filters.dateTo));
      const exportedReceived = reportDeliveries.reduce((a, r) => a + (Number(r.quantity) || 0), 0);
      const reportRemaining = totals.remaining;
      const sortedDeliveries = [...reportDeliveries].sort((a, b) => new Date(a.date) - new Date(b.date));
      const allSortedDeliveries = [...totals.deliveries].sort((a, b) => new Date(a.date) - new Date(b.date));
      const sortedDispatches = [...dispatches].sort((a, b) => new Date(a.date) - new Date(b.date));
      const companyNames = [...new Set(sortedDeliveries.map(r => (r.company || '').trim()).filter(Boolean))];
      const companyText = companyNames.length ? companyNames.join(' / ') : 'SIN REGISTRO';
      const dateParts = (value) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return { day: value || '', hour: '' };
        return {
          day: d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: '2-digit' }),
          hour: d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true })
        };
      };
      const deliveryDatesText = sortedDeliveries.length
        ? [...new Set(sortedDeliveries.map(r => fmt.dateTime(r.date)).filter(Boolean))].join(' / ')
        : 'SIN REGISTRO';
      const odometerValues = sortedDispatches
        .map(r => Number(String(r.odometer || '').replace(/,/g, '')))
        .filter(n => Number.isFinite(n) && n > 0);
      const odometerAverage = odometerValues.length
        ? odometerValues.reduce((a, n) => a + n, 0) / odometerValues.length
        : '';
      const movements = [
        ...sortedDeliveries.map(r => ({
          date: r.date,
          type: 'Llegada',
          detail: r.company || '',
          plate: '',
          inQty: Number(r.quantity) || 0,
          outQty: 0
        })),
        ...sortedDispatches.map(r => ({
          date: r.date,
          deliveryDate: getFuelDeliveryDateForDispatch(r.date, allSortedDeliveries),
          type: 'Despacho',
          detail: r.name || '',
          plate: fuelPlate(r),
          model: fuelVehicleModel(r),
          inQty: 0,
          outQty: Number(r.quantity) || 0
        }))
      ].sort((a, b) => new Date(a.date) - new Date(b.date));
      let runningBalance = 0;
      const movementRows = [
        ['Fecha y hora', 'Fecha que llego el gasol', 'Tipo', 'Compania / persona', 'Placa', 'Modelo', 'Entrada', 'Salida', 'Saldo']
      ];
      movements.forEach(m => {
        runningBalance += m.inQty - m.outQty;
        movementRows.push([
          fmt.dateTime(m.date),
          m.type === 'Despacho' ? fmt.date(m.deliveryDate) : fmt.date(m.date),
          m.type,
          m.detail,
          m.plate,
          m.model || '',
          m.inQty || '',
          m.outQty || '',
          runningBalance
        ]);
      });
      const dispatchRows = sortedDispatches.map(r => {
        const qty = Number(r.quantity) || 0;
        const date = dateParts(r.date);
        const deliveryDate = dateParts(getFuelDeliveryDateForDispatch(r.date, allSortedDeliveries));
        return [
          date.day,
          date.hour,
          deliveryDate.day,
          r.name || '',
          r.odometer || '',
          fuelPlate(r),
          fuelVehicleModel(r),
          r.address || '',
          qty
        ];
      });
      const reportRows = [
        ['COMPANIA DEL GASOL', '', companyText, ''],
        ['FECHA QUE LLEGO EL GASOL', '', deliveryDatesText, ''],
        ['CUANTO LLEGO?', '', Number(exportedReceived) || 0, ''],
        [],
        ['DESPACHOS DE GASOL'],
        ['DIA', 'HORA', 'FECHA QUE LLEGO EL GASOL', 'NOMBRE', 'HOROMETRO (KM)', 'PLACA', 'MODELO', 'DIRECCION', 'GASOL'],
        ...dispatchRows,
        ['TOTAL DESPACHADO', '', '', '', '', '', '', '', Number(exportedDispatched) || 0],
        ['CUANTO QUEDO EN TANQUE?', '', '', '', '', '', '', '', Number(reportRemaining) || 0]
      ];
      const workbook = XLSX.utils.book_new();
      const reportSheet = XLSX.utils.aoa_to_sheet(reportRows);
      const movementSheet = XLSX.utils.aoa_to_sheet(movementRows);
      reportSheet['!cols'] = [
        { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 13 }, { wch: 22 }, { wch: 38 }, { wch: 13 }
      ];
      movementSheet['!cols'] = [
        { wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }
      ];
      reportSheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
        { s: { r: 0, c: 2 }, e: { r: 0, c: 3 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
        { s: { r: 1, c: 2 }, e: { r: 1, c: 3 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
        { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: 8 } },
        { s: { r: 6 + dispatchRows.length, c: 0 }, e: { r: 6 + dispatchRows.length, c: 7 } },
        { s: { r: 7 + dispatchRows.length, c: 0 }, e: { r: 7 + dispatchRows.length, c: 7 } }
      ];
      const darkBlue = '0B2E6F';
      const titleBlue = 'D9E7F7';
      const totalBlue = 'DDEBFA';
      const gasGreen = 'E2F0D9';
      const border = { style: 'thin', color: { rgb: '6B7280' } };
      const baseBorder = { top: border, bottom: border, left: border, right: border };
      const center = { horizontal: 'center', vertical: 'center', wrapText: true };
      const applyStyle = (addr, style) => {
        if (!reportSheet[addr]) reportSheet[addr] = { t: 's', v: '' };
        reportSheet[addr].s = style;
      };
      const rangeStyle = (range, style) => {
        const decoded = XLSX.utils.decode_range(range);
        for (let r = decoded.s.r; r <= decoded.e.r; r++) {
          for (let c = decoded.s.c; c <= decoded.e.c; c++) {
            applyStyle(XLSX.utils.encode_cell({ r, c }), style);
          }
        }
      };
      const labelStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: darkBlue } },
        alignment: center,
        border: baseBorder
      };
      const valueStyle = {
        font: { bold: true, color: { rgb: '111827' } },
        alignment: center,
        border: baseBorder
      };
      const titleStyle = {
        font: { bold: true, color: { rgb: darkBlue }, sz: 14 },
        fill: { fgColor: { rgb: titleBlue } },
        alignment: center,
        border: baseBorder
      };
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: darkBlue } },
        alignment: center,
        border: baseBorder
      };
      const bodyStyle = {
        font: { color: { rgb: '111827' } },
        alignment: center,
        border: baseBorder
      };
      const addressStyle = {
        font: { color: { rgb: '111827' } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: baseBorder
      };
      const gasStyle = {
        font: { bold: true, color: { rgb: '111827' } },
        fill: { fgColor: { rgb: gasGreen } },
        alignment: center,
        border: baseBorder,
        numFmt: '#,##0.000'
      };
      const totalLabelStyle = {
        font: { bold: true, color: { rgb: darkBlue } },
        fill: { fgColor: { rgb: totalBlue } },
        alignment: center,
        border: baseBorder
      };
      rangeStyle('A1:B3', labelStyle);
      rangeStyle('C1:D3', valueStyle);
      rangeStyle('A5:I5', titleStyle);
      rangeStyle('A6:I6', headerStyle);
      rangeStyle('I6:I6', gasStyle);
      const firstDataRow = 7;
      const lastDataRow = 6 + dispatchRows.length;
      for (let row = firstDataRow; row <= lastDataRow; row++) {
        rangeStyle(`A${row}:G${row}`, bodyStyle);
        rangeStyle(`H${row}:H${row}`, addressStyle);
        rangeStyle(`I${row}:I${row}`, gasStyle);
      }
      const totalStart = lastDataRow + 1;
      rangeStyle(`A${totalStart}:H${totalStart + 1}`, totalLabelStyle);
      rangeStyle(`I${totalStart}:I${totalStart + 1}`, gasStyle);
      reportSheet['!rows'] = [
        { hpt: 24 }, { hpt: 24 }, { hpt: 24 }, { hpt: 12 }, { hpt: 26 }, { hpt: 30 }
      ];
      reportSheet['!autofilter'] = { ref: `A6:I${Math.max(lastDataRow, 6)}` };
      movementSheet['!autofilter'] = { ref: `A1:I${movementRows.length}` };
      XLSX.utils.book_append_sheet(workbook, reportSheet, 'Reporte gasol');
      XLSX.utils.book_append_sheet(workbook, movementSheet, 'Movimiento');
      const suffix = isFullReport ? 'completo' : 'filtrado';
      XLSX.writeFile(workbook, `reporte_despacho_gasol_${suffix}_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Hoja de calculo de Office descargada');
    }

    function initDataSDK() {
      // SDK integration placeholder
    }

    async function refreshData() {
      const synced = await syncCurrentUserFromCloud({ silent: false });
      showToast(synced ? 'Datos sincronizados desde la nube' : 'Datos locales actualizados', synced ? 'success' : 'info');
      renderPage();
    }
  

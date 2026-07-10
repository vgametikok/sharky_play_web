// Supabase-клиент + сессия + профиль. Один на все страницы.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// Ждём, пока supabase-js обработает возможный OAuth-редирект (#access_token в URL).
function initialSession() {
  return new Promise((resolve) => {
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      subscription.unsubscribe();
      resolve(session);
    });
  });
}

let _meP = null;
// Профиль public.users текущего пользователя (или null для гостя).
// Первый вызов провижнит строку users через web_ensure_user.
export function getMe() {
  if (!_meP) {
    _meP = (async () => {
      const session = await initialSession();
      if (!session) return null;
      const { data, error } = await sb.rpc('web_ensure_user');
      if (error) { console.error('web_ensure_user:', error.message); return null; }
      // Один лог захода на сессию браузера.
      if (data && !sessionStorage.getItem('sharky_open_logged')) {
        sessionStorage.setItem('sharky_open_logged', '1');
        sb.rpc('web_log_open').then(() => {}, () => {});
      }
      return data;
    })();
  }
  return _meP;
}

export function login() {
  sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.href },
  });
}

export async function logout() {
  await sb.auth.signOut();
  location.href = 'index.html';
}

export const fmt = (n) => {
  n = Number(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
};

export const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

// ============================================================================
//  SHARKY — Telegram auth Edge Function (tg-auth)
// ----------------------------------------------------------------------------
//  Единственное место, где доверяется Telegram-идентификации: проверяет
//  подлинность, создаёт/находит пользователя и выдаёт Supabase-сессию
//  (magiclink token_hash → verifyOtp на фронте).
//
//  ЧЕТЫРЕ РЕЖИМА:
//    1) Mini App (мобильная лента): POST { initData, platform? }
//       подпись: secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
//    2) Login Widget:                POST { mode:"widget", widget:{...+hash} }
//       подпись: secret = SHA256(bot_token) — схема у виджета ДРУГАЯ
//    3) Deep-link бота (сайт, без телефона): POST { mode:"logintoken", token }
//       токен подтверждается через webhook бота (функция tg-login),
//       здесь одноразово обменивается на сессию (status confirmed→used)
//    4) ПРИВЯЗКА (v8): POST { mode:"link", widget:{...} } + Authorization: Bearer JWT
//       НЕ логин: telegram_id прикрепляется к строке ТЕКУЩЕГО пользователя
//       (по auth_uid из JWT). 409 если telegram занят другой строкой или у
//       строки уже другой telegram (слияние аккаунтов — пост-MVP).
//
//  ВАЖНО (v8): для строки с уже установленным auth_uid логин-режимы НЕ
//  перепривязывают auth_uid, а выдают сессию существующей идентичности
//  (email того auth-пользователя, на которого указывает users.auth_uid).
//  Иначе первый TG-вход после привязки Google↔TG отвязал бы Google:
//  app_uid() ищет строку по auth_uid, и лайки/история «исчезали» бы.
//
//  СЕКРЕТЫ (Project → Edge Functions → Secrets; НИКОГДА не в репозитории/фронте):
//    TG_BOT_TOKEN              — токен бота @sharkyplay_bot из BotFather
//    SUPABASE_URL              — задаётся платформой автоматически
//    SUPABASE_SERVICE_ROLE_KEY — задаётся платформой автоматически
//
//  ДЕПЛОЙ: Supabase MCP deploy_edge_function с verify_jwt=false
//
//  КОНТРАКТ (логин-режимы):
//    200  { token_hash, email, user_id }  — фронт делает supabase.auth.verifyOtp(...)
//    401  { error }                        — подпись/токен/срок невалидны
//  КОНТРАКТ (mode:link):
//    200  { linked: true, already?: true } — telegram прикреплён (или уже был)
//    409  { error }                        — конфликт привязки
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
// Сколько секунд auth-данные считаются свежими (защита от replay).
const MAX_AUTH_AGE_SEC = 24 * 60 * 60;
// Срок жизни подтверждённого login-токена до обмена на сессию.
const LOGIN_TOKEN_TTL_MS = 10 * 60 * 1000;
const ALLOWED_ORIGINS = [
  "https://vgametikok.github.io",
  "http://localhost:5080",
  "http://localhost:5070"
];
function corsHeaders(origin) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}
function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json"
    }
  });
}
const enc = new TextEncoder();
async function hmacSha256(keyBytes, msg) {
  const key = await crypto.subtle.importKey("raw", keyBytes, {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  return crypto.subtle.sign("HMAC", key, enc.encode(msg));
}
function toHex(buf) {
  return [
    ...new Uint8Array(buf)
  ].map((b)=>b.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++)diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// ── Режим 1: Mini App initData ──
async function verifyInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [
    ...params.entries()
  ].map(([k, v])=>`${k}=${v}`).sort().join("\n");
  const secretKey = await hmacSha256(enc.encode("WebAppData"), BOT_TOKEN);
  const computed = toHex(await hmacSha256(new Uint8Array(secretKey), dataCheckString));
  if (!timingSafeEqualHex(computed, hash)) return null;
  const authDate = Number(params.get("auth_date") || "0");
  if (!authDate || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SEC) return null;
  return Object.fromEntries(params.entries());
}
async function verifyWidget(data) {
  const hash = String(data?.hash || "");
  if (!hash || typeof data !== "object") return null;
  const dataCheckString = Object.entries(data).filter(([k, v])=>k !== "hash" && v !== undefined && v !== null).map(([k, v])=>`${k}=${v}`).sort().join("\n");
  const secretKey = await crypto.subtle.digest("SHA-256", enc.encode(BOT_TOKEN));
  const computed = toHex(await hmacSha256(new Uint8Array(secretKey), dataCheckString));
  if (!timingSafeEqualHex(computed, hash)) return null;
  const authDate = Number(data.auth_date || 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SEC) return null;
  const id = Number(data.id || 0);
  if (!id || !Number.isFinite(id)) return null;
  return {
    id,
    first_name: typeof data.first_name === "string" ? data.first_name : undefined,
    last_name: typeof data.last_name === "string" ? data.last_name : undefined,
    username: typeof data.username === "string" ? data.username : undefined,
    photo_url: typeof data.photo_url === "string" ? data.photo_url : undefined
  };
}
Deno.serve(async (req)=>{
  const cors = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: cors
  });
  if (req.method !== "POST") return json({
    error: "method not allowed"
  }, 405, cors);
  let body = {};
  try {
    body = await req.json();
  } catch  {
    return json({
      error: "bad request"
    }, 400, cors);
  }
  const mode = String(body?.mode || "");
  const isWidget = mode === "widget";
  const isToken = mode === "logintoken";
  const isLink = mode === "link";
  const initData = typeof body?.initData === "string" ? body.initData : "";
  if (!isWidget && !isToken && !isLink && !initData) return json({
    error: "initData required"
  }, 400, cors);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  // Rate limit по IP ДО тяжёлых Auth-вызовов.
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  try {
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      p_key: `tgauth:${ip}`,
      p_max: 30,
      p_window_sec: 60
    });
    if (allowed === false) return json({
      error: "too many requests"
    }, 429, cors);
  } catch (_e) {}
  // ── Режим 4: ПРИВЯЗКА Telegram к текущему аккаунту (не логин) ──
  if (isLink) {
    const widget = body?.widget ?? null;
    if (!widget) return json({
      error: "widget data required"
    }, 400, cors);
    const wu = await verifyWidget(widget);
    if (!wu) return json({
      error: "invalid widget data"
    }, 401, cors);
    const authz = req.headers.get("Authorization") || "";
    const jwt = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!jwt) return json({
      error: "auth required"
    }, 401, cors);
    const caller = await admin.auth.getUser(jwt);
    if (!caller.data?.user) return json({
      error: "auth required"
    }, 401, cors);
    const me = await admin.from("users").select("id, telegram_id").eq("auth_uid", caller.data.user.id).maybeSingle();
    if (!me.data?.id) return json({
      error: "profile not found"
    }, 404, cors);
    if (me.data.telegram_id != null) {
      if (Number(me.data.telegram_id) === wu.id) return json({
        linked: true,
        already: true
      }, 200, cors);
      return json({
        error: "another telegram already linked"
      }, 409, cors);
    }
    const taken = await admin.from("users").select("id").eq("telegram_id", wu.id).neq("id", me.data.id).maybeSingle();
    if (taken.data?.id) return json({
      error: "telegram already linked to another account"
    }, 409, cors);
    // Гонки исключает guard .is('telegram_id', null): второй конкурентный
    // запрос не найдёт строку и получит 409.
    const upd = await admin.from("users").update({
      telegram_id: wu.id,
      last_seen_at: new Date().toISOString()
    }).eq("id", me.data.id).is("telegram_id", null).select("id").maybeSingle();
    if (!upd.data?.id) return json({
      error: "link conflict"
    }, 409, cors);
    return json({
      linked: true
    }, 200, cors);
  }
  // ── Верификация по режиму → единый tgUser + аудиторные атрибуты ──
  let tgUser;
  let langCode = null;
  let isPremium = false;
  let startParam = null;
  let platformVal = null;
  if (isToken) {
    const token = String(body?.token || "");
    if (!/^[0-9a-f]{32}$/.test(token)) return json({
      error: "bad token"
    }, 400, cors);
    const row = await admin.from("login_tokens").select("telegram_id, tg_username, tg_first_name, tg_last_name, confirmed_at").eq("id", token).eq("status", "confirmed").maybeSingle();
    const fresh = row.data?.confirmed_at && Date.now() - new Date(row.data.confirmed_at).getTime() < LOGIN_TOKEN_TTL_MS;
    if (!row.data?.telegram_id || !fresh) return json({
      error: "invalid token"
    }, 401, cors);
    // Одноразовость: помечаем used АТОМАРНО — второй обмен не пройдёт.
    const used = await admin.from("login_tokens").update({
      status: "used"
    }).eq("id", token).eq("status", "confirmed").select("id").maybeSingle();
    if (!used.data) return json({
      error: "invalid token"
    }, 401, cors);
    tgUser = {
      id: Number(row.data.telegram_id),
      username: row.data.tg_username ?? undefined,
      first_name: row.data.tg_first_name ?? undefined,
      last_name: row.data.tg_last_name ?? undefined
    };
    platformVal = "website";
  } else if (isWidget) {
    const widget = body?.widget ?? null;
    if (!widget) return json({
      error: "widget data required"
    }, 400, cors);
    const wu = await verifyWidget(widget);
    if (!wu) return json({
      error: "invalid widget data"
    }, 401, cors);
    tgUser = wu;
    platformVal = "website";
  } else {
    const verified = await verifyInitData(initData);
    if (!verified) return json({
      error: "invalid initData"
    }, 401, cors);
    try {
      tgUser = JSON.parse(verified.user);
    } catch  {
      return json({
        error: "no user in initData"
      }, 401, cors);
    }
    if (!tgUser?.id) return json({
      error: "no user id"
    }, 401, cors);
    langCode = (tgUser.language_code || "").toString().slice(0, 12) || null;
    isPremium = tgUser.is_premium === true;
    startParam = (verified.start_param || "").toString().slice(0, 128) || null;
    platformVal = (body?.platform ?? "").toString().slice(0, 32) || null;
  }
  const isWebLogin = isWidget || isToken;
  const nowIso = new Date().toISOString();
  // Детерминированный e-mail на основе telegram_id — ОДИНАКОВ во всех режимах →
  // один и тот же аккаунт в мини-аппе и на сайте.
  const email = `tg_${tgUser.id}@sharky.telegram`;
  const displayName = (tgUser.first_name || "") + (tgUser.last_name ? " " + tgUser.last_name : "") || "Игрок";
  const username = tgUser.username || `user${tgUser.id}`;
  // 0) Существующая строка public.users по telegram_id — определяет, чья
  //    идентичность будет в сессии (см. шапку про привязанные аккаунты).
  const existing = await admin.from("users").select("id, referral_source, auth_uid").eq("telegram_id", tgUser.id).maybeSingle();
  // Для привязанной строки (auth_uid уже установлен, например Google-вебом)
  // сессию выдаём НА ТУ идентичность и auth_uid не трогаем.
  let sessionEmail = email;
  let keepAuthUid = false;
  if (existing.data?.auth_uid) {
    const bound = await admin.auth.admin.getUserById(existing.data.auth_uid);
    if (bound.data?.user?.email) {
      sessionEmail = bound.data.user.email;
      keepAuthUid = true;
    }
  // битая привязка (auth-пользователь удалён) → перевяжем на tg-идентичность ниже
  }
  // 1) Найти/создать tg-auth-пользователя — нужен, только если строка не
  //    привязана к другой идентичности.
  let authUid = null;
  if (!keepAuthUid) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        telegram_id: tgUser.id,
        username
      }
    });
    if (created.data?.user) {
      authUid = created.data.user.id;
    } else {
      for(let page = 1; page <= 50 && !authUid; page++){
        const list = await admin.auth.admin.listUsers({
          page,
          perPage: 200
        });
        const hit = list.data?.users?.find((u)=>u.email === email);
        if (hit) authUid = hit.id;
        if (!list.data?.users?.length) break;
      }
    }
    if (!authUid) return json({
      error: "auth user resolution failed"
    }, 500, cors);
  }
  // 2) Найти/создать строку public.users. Для веб-режимов НЕ перетираем
  //    аудиторные атрибуты мини-аппа (language_code/is_premium/platform).
  let userId;
  if (existing.data?.id) {
    userId = existing.data.id;
    const patch = isWebLogin ? {
      last_seen_at: nowIso
    } : {
      language_code: langCode,
      is_premium: isPremium,
      platform: platformVal,
      last_seen_at: nowIso,
      referral_source: existing.data.referral_source ?? startParam
    };
    if (!keepAuthUid) patch.auth_uid = authUid;
    await admin.from("users").update(patch).eq("id", userId);
  } else {
    const inserted = await admin.from("users").insert({
      telegram_id: tgUser.id,
      username,
      display_name: displayName,
      avatar_emoji: "🎮",
      bio: "",
      is_virtual: false,
      auth_uid: authUid,
      language_code: langCode,
      is_premium: isPremium,
      platform: platformVal,
      last_seen_at: nowIso,
      referral_source: startParam
    }).select("id").single();
    if (!inserted.data?.id) return json({
      error: "user creation failed"
    }, 500, cors);
    userId = inserted.data.id;
  }
  // 2b) Лог запуска → DAU/WAU/MAU. Веб-входы пишутся как platform='website'.
  try {
    await admin.from("app_opens").insert({
      user_id: userId,
      platform: platformVal,
      language_code: langCode,
      is_premium: isPremium,
      referral: startParam
    });
  } catch (_e) {}
  // 3) Выдать сессию без пароля: magiclink → token_hash, фронт зовёт verifyOtp.
  //    Для привязанной строки sessionEmail — это email СУЩЕСТВУЮЩЕЙ идентичности
  //    (например Google), а не tg_...@sharky.telegram.
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: sessionEmail
  });
  const tokenHash = link.data?.properties?.hashed_token;
  if (!tokenHash) {
    console.error("generateLink failed for", sessionEmail, link.error?.message);
    return json({
      error: "session mint failed"
    }, 500, cors);
  }
  return json({
    token_hash: tokenHash,
    email: sessionEmail,
    user_id: userId
  }, 200, cors);
});

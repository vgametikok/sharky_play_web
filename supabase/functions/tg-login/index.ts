// ============================================================================
//  SHARKY — tg-login: вход через Telegram БЕЗ номера телефона (deep-link бота).
// ----------------------------------------------------------------------------
//  ПОЧЕМУ НЕ ВИДЖЕТ: oauth.telegram.org при первом входе требует ввод
//  номера телефона. Здесь вместо этого: сайт создаёт одноразовый токен,
//  пользователь открывает t.me/sharkyplay_bot?start=lg_<token> и жмёт Start.
//  ЗАПАСНОЙ ПУТЬ (важно): некоторые клиенты (особенно Telegram Web) для
//  УЖЕ НАЧАТОГО чата с ботом молча теряют start-параметр — поэтому бот
//  также принимает код входа ПРОСТЫМ СООБЩЕНИЕМ: «lg_<32hex>».
//  Сайт поллит статус и обменивает подтверждённый токен на сессию через
//  tg-auth (mode:'logintoken').
//
//  Аутентичность webhook: setWebhook с secret_token = HMAC(BOT_TOKEN,
//  "sharky-webhook") — Telegram возвращает его в заголовке каждого апдейта,
//  подделать без знания токена бота нельзя.
//
//  КОНТРАКТ (сайт):
//    POST {action:'new'}            → {token, link}
//    POST {action:'check', token}   → {status: pending|confirmed|used|unknown}
//    POST {action:'setup'}          → регистрирует этот URL как webhook бота
//    POST {action:'info'}           → диагностика: username бота + getWebhookInfo
//  Деплой с verify_jwt=false (вызывается до входа; Telegram шлёт без JWT).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BOT_USERNAME = "sharkyplay_bot";
const SITE_URL = "https://vgametikok.github.io/sharky_play_web/";
const TOKEN_TTL_MS = 10 * 60 * 1000;
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
async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return [
    ...new Uint8Array(sig)
  ].map((b)=>b.toString(16).padStart(2, "0")).join("");
}
const webhookSecret = ()=>hmacHex(BOT_TOKEN, "sharky-webhook");
async function tgApi(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return res.json().catch(()=>({}));
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
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  // ── Ветка 1: webhook от Telegram (есть секретный заголовок) ──
  const secretHdr = req.headers.get("x-telegram-bot-api-secret-token");
  if (secretHdr) {
    if (secretHdr !== await webhookSecret()) return json({
      error: "bad secret"
    }, 401, cors);
    const msg = body.message;
    const text = (msg?.text || "").trim();
    const from = msg?.from;
    const chatId = msg?.chat?.id;
    if (from?.id && chatId) {
      // код входа: из deep-link ("/start lg_x") ИЛИ простым сообщением ("lg_x")
      // — запасной путь для клиентов, теряющих start-параметр у старых чатов.
      const m = text.match(/^(?:\/start\s+)?lg_([0-9a-f]{32})$/);
      if (m) {
        const cutoff = new Date(Date.now() - TOKEN_TTL_MS).toISOString();
        const upd = await admin.from("login_tokens").update({
          status: "confirmed",
          telegram_id: from.id,
          tg_username: from.username ?? null,
          tg_first_name: from.first_name ?? null,
          tg_last_name: from.last_name ?? null,
          confirmed_at: new Date().toISOString()
        }).eq("id", m[1]).eq("status", "pending").gt("created_at", cutoff).select("id").maybeSingle();
        await tgApi("sendMessage", {
          chat_id: chatId,
          text: upd.data ? "✅ Вход подтверждён! Вернитесь на вкладку сайта — вы уже авторизованы." : "⌛ Этот код входа устарел или уже использован. Обновите страницу сайта и попробуйте ещё раз."
        });
      } else if (text.startsWith("/start")) {
        await tgApi("sendMessage", {
          chat_id: chatId,
          text: `🦈 Привет! Sharky — платформа мини-игр.\nИграй на сайте: ${SITE_URL}\n\nЕсли ты входишь на сайт и видишь это сообщение — отправь мне код входа со страницы (вида lg_…) одним сообщением.`
        });
      }
    }
    return json({
      ok: true
    }, 200, cors); // Telegram ждёт 200
  }
  // ── Ветка 2: вызовы с сайта ──
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  try {
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      p_key: `tglogin:${ip}`,
      p_max: 60,
      p_window_sec: 60
    });
    if (allowed === false) return json({
      error: "too many requests"
    }, 429, cors);
  } catch (_e) {}
  const action = String(body?.action || "");
  if (action === "new") {
    const id = crypto.randomUUID().replace(/-/g, "");
    const { error } = await admin.from("login_tokens").insert({
      id
    });
    if (error) return json({
      error: "token create failed"
    }, 500, cors);
    // уборка старых токенов (без ожидания результата не критична)
    admin.from("login_tokens").delete().lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()).then(()=>{}, ()=>{});
    return json({
      token: id,
      link: `https://t.me/${BOT_USERNAME}?start=lg_${id}`
    }, 200, cors);
  }
  if (action === "check") {
    const token = String(body?.token || "");
    if (!/^[0-9a-f]{32}$/.test(token)) return json({
      error: "bad token"
    }, 400, cors);
    const row = await admin.from("login_tokens").select("status").eq("id", token).maybeSingle();
    return json({
      status: row.data?.status ?? "unknown"
    }, 200, cors);
  }
  if (action === "setup") {
    // Идемпотентная регистрация webhook бота на эту же функцию.
    const r = await tgApi("setWebhook", {
      url: `${SUPABASE_URL}/functions/v1/tg-login`,
      secret_token: await webhookSecret(),
      allowed_updates: [
        "message"
      ]
    });
    return json({
      ok: r?.ok === true
    }, r?.ok === true ? 200 : 500, cors);
  }
  if (action === "info") {
    // Диагностика без секретов: КАКОЙ бот у токена (getMe) и что Telegram
    // говорит о доставке вебхука (last_error_message — источник правды).
    const me = await tgApi("getMe", {});
    const wh = await tgApi("getWebhookInfo", {});
    return json({
      bot: {
        ok: me?.ok === true,
        username: me?.result?.username ?? null,
        id: me?.result?.id ?? null
      },
      webhook: {
        url: wh?.result?.url ?? null,
        pending_update_count: wh?.result?.pending_update_count ?? 0,
        last_error_date: wh?.result?.last_error_date ?? null,
        last_error_message: wh?.result?.last_error_message ?? null
      }
    }, 200, cors);
  }
  return json({
    error: "unknown action"
  }, 400, cors);
});

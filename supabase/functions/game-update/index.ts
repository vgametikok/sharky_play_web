// ============================================================================
//  SHARKY — game-update: обновление опубликованной игры (новая версия html)
//  и/или сброс прогресса игроков (облачные сейвы второго проекта).
// ----------------------------------------------------------------------------
//  Право: АВТОР игры (users.username == games.author_id по auth_uid вызывающего)
//  ИЛИ админ (users.role == 'admin'). Обслуживает и кабинет Maker, и админку.
//
//  Версионирование: каждое обновление — НОВЫЙ объект Storage
//  games/<id>-v<N>.html (старые версии остаются — дёшевый откат),
//  games.src → новый URL, games.version++, запись в журнал game_versions.
//  Обновление НЕ меняет status — опубликованная игра остаётся в ленте
//  (багфикс не ждёт повторной модерации; админ видит журнал версий).
//
//  Сброс прогресса: (1) облачные сейвы — форвард в функцию progress ВТОРОГО
//  проекта с JWT САМОГО вызывающего — та независимо проверяет авторство/
//  админство (никаких shared-секретов); (2) локальные сейвы ленты —
//  инкремент games.progress_epoch: лента выбрасывает localStorage-сейвы
//  старой эпохи. Если wipe упал, а обновление уже вышло — возвращаем
//  wipe_error, клиент предлагает повторить сброс отдельно.
//
//  КОНТРАКТ: POST { game_id, html?, note?, wipe_progress? }
//  ОТВЕТ: 200 { game_id, version, src, wiped, deleted?, wipe_error? }
//  Деплой: verify_jwt = true.
//  АНТИ-DDOS (2026-07-18): лимит 20 обновлений/мин на пользователя (rate_limit_hit).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SAVES_FN = "https://twvagexajheoapzskvjw.supabase.co/functions/v1/progress";
const SAVES_ANON = "sb_publishable_z7qy94kQKbXMtvMPVZGziw_cVpfLgDI";
const ALLOWED_ORIGINS = [
  "https://vgametikok.github.io",
  "http://localhost:5070",
  "http://localhost:4173"
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
  const gameId = String(body?.game_id || "").trim();
  const html = typeof body?.html === "string" ? body.html : "";
  const note = String(body?.note || "").trim().slice(0, 300) || null;
  const wipe = body?.wipe_progress === true;
  if (!gameId) return json({
    error: "game_id required"
  }, 400, cors);
  if (!html && !wipe) return json({
    error: "nothing to do: html или wipe_progress"
  }, 400, cors);
  if (html && html.length > 15 * 1024 * 1024) return json({
    error: "html слишком большой"
  }, 413, cors);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  // ── Кто зовёт: username + role по auth_uid ──
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (userErr || !uid) return json({
    error: "unauthorized"
  }, 401, cors);
  // Rate limit по пользователю (анти-DDOS / storage-abuse).
  try {
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      p_key: `gameupd:${uid}`,
      p_max: 20,
      p_window_sec: 60
    });
    if (allowed === false) return json({
      error: "too many requests"
    }, 429, cors);
  } catch (_e) {}
  const { data: caller } = await admin.from("users").select("username, role").eq("auth_uid", uid).maybeSingle();
  if (!caller?.username) return json({
    error: "нет аккаунта Sharky для этого входа"
  }, 403, cors);
  // ── Игра + право ──
  const { data: game } = await admin.from("games").select("id, author_id, version, src, status, progress_epoch").eq("id", gameId).maybeSingle();
  if (!game) return json({
    error: "game not found"
  }, 404, cors);
  const isAdmin = caller.role === "admin";
  if (!isAdmin && game.author_id !== caller.username) {
    return json({
      error: "forbidden: не твоя игра"
    }, 403, cors);
  }
  let version = Number(game.version || 1);
  let src = String(game.src || "");
  // ── Новая версия html ──
  if (html) {
    version += 1;
    const objectPath = `${gameId}-v${version}.html`;
    const up = await admin.storage.from("games").upload(objectPath, new Blob([
      html
    ], {
      type: "text/html"
    }), {
      contentType: "text/html",
      upsert: false
    });
    if (up.error) return json({
      error: "storage: " + up.error.message
    }, 500, cors);
    src = `${SUPABASE_URL}/storage/v1/object/public/games/${objectPath}`;
    const upd = await admin.from("games").update({
      src,
      version,
      updated_at: new Date().toISOString()
    }).eq("id", gameId);
    if (upd.error) {
      await admin.storage.from("games").remove([
        objectPath
      ]);
      return json({
        error: "games update: " + upd.error.message
      }, 500, cors);
    }
  }
  // ── Сброс прогресса ──
  let wiped = false;
  let deleted = null;
  let wipeError = null;
  if (wipe) {
    // (1) облачные сейвы: второй проект проверяет право НЕЗАВИСИМО по тому же JWT
    try {
      const wr = await fetch(SAVES_FN, {
        method: "POST",
        headers: {
          apikey: SAVES_ANON,
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "Origin": "https://vgametikok.github.io"
        },
        body: JSON.stringify({
          action: "wipe_game",
          game_id: gameId
        })
      });
      const wd = await wr.json().catch(()=>({}));
      if (wr.ok && wd?.ok) {
        wiped = true;
        deleted = Number(wd.deleted ?? 0);
      } else wipeError = String(wd?.error || "http " + wr.status);
    } catch (e) {
      wipeError = String(e?.message || e);
    }
    // (2) локальные сейвы ленты: новая эпоха — клиенты выбросят старые
    if (wiped) {
      const ep = await admin.from("games").update({
        progress_epoch: Number(game.progress_epoch || 0) + 1
      }).eq("id", gameId);
      if (ep.error) wipeError = "epoch: " + ep.error.message;
    }
  }
  // ── Журнал — событийный лог (бамп версии и/или wipe) ──
  await admin.from("game_versions").insert({
    game_id: gameId,
    version,
    src,
    note: note ?? (html ? null : "сброс прогресса без обновления"),
    wiped_progress: wiped,
    created_by: caller.username
  });
  return json({
    game_id: gameId,
    version,
    src,
    wiped,
    deleted,
    wipe_error: wipeError
  }, 200, cors);
});

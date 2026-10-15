// =====================================================================
// Arcade Jar — серверная функция пакета игр (Supabase Edge Function "hub").
//
// Каждый запрос несёт initData из Telegram. Функция проверяет его подпись
// токеном бота: так сервер точно знает, какой пользователь Telegram пишет,
// и никто не может выдать себя за другого игрока.
//
// Секрет, который нужно задать в Supabase (Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN — токен @arcadejar_bot из BotFather
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const GAMES = new Set(["skyhoop", "words", "pixelrun", "wings"]);          // игры пакета, которые уже вышли
const MAX_AGE_S = 7 * 24 * 3600;              // initData старше недели не принимаем
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- проверка подписи Telegram initData ----------
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function hmac(key: Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

type TgUser = { id: number; first_name?: string; username?: string; photo_url?: string };
async function verify(initData: string): Promise<TgUser | null> {
  if (!initData || !BOT_TOKEN) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = await hmac(new TextEncoder().encode("WebAppData"), BOT_TOKEN);
  const sig = hex(await hmac(secret, check));
  if (sig.length !== hash.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff !== 0) return null;
  const age = Date.now() / 1000 - Number(p.get("auth_date") ?? 0);
  if (!(age >= -60 && age < MAX_AGE_S)) return null;
  try { return JSON.parse(p.get("user") ?? "null"); } catch { return null; }
}

// ---------- данные ----------
async function ensureState(uid: number, game: string) {
  const { data } = await db.from("game_states").select("*").eq("tg_id", uid).eq("game_id", game).maybeSingle();
  if (data) return data;
  const { data: created, error } = await db.from("game_states")
    .upsert({ tg_id: uid, game_id: game }, { onConflict: "tg_id,game_id", ignoreDuplicates: true })
    .select("*").maybeSingle();
  if (error) throw error;
  return created ?? (await db.from("game_states").select("*").eq("tg_id", uid).eq("game_id", game).single()).data;
}

async function friendsOf(uid: number, game: string) {
  const { data: links } = await db.from("friendships").select("friend_id").eq("game_id", game).eq("tg_id", uid);
  const ids = (links ?? []).map((l) => l.friend_id);
  if (!ids.length) return [];
  const [{ data: people }, { data: states }] = await Promise.all([
    db.from("players").select("tg_id, first_name, photo_url").in("tg_id", ids),
    db.from("game_states").select("tg_id, best").eq("game_id", game).in("tg_id", ids),
  ]);
  const best = new Map((states ?? []).map((s) => [s.tg_id, s.best]));
  return (people ?? [])
    .map((f) => ({ id: String(f.tg_id), n: f.first_name || "Друг", photo: f.photo_url || undefined, s: best.get(f.tg_id) ?? 0 }))
    .sort((a, b) => b.s - a.s);
}

const publicState = (st: Record<string, any>) => ({
  coins: st.coins, best: st.best, owned: st.owned ?? [], data: st.data ?? {},
  plays: st.plays, lastPlayed: st.last_played ? Date.parse(st.last_played) : 0,
});

// ---------- действия ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: { initData?: string; action?: string; game?: string; args?: Record<string, any> };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const user = await verify(body.initData ?? "");
  if (!user?.id) return json({ error: "unauthorized" }, 401);
  const uid = user.id, game = String(body.game ?? ""), a = body.args ?? {};
  if (!GAMES.has(game)) return json({ error: "unknown game" }, 400);

  try {
    await db.from("players").upsert({
      tg_id: uid, first_name: user.first_name ?? null, username: user.username ?? null,
      photo_url: user.photo_url ?? null, seen_at: new Date().toISOString(),
    });

    switch (body.action) {
      // состояние для витрины: без счётчика запусков
      case "peek": {
        const st = await ensureState(uid, game);
        return json({ state: publicState(st), friends: await friendsOf(uid, game) });
      }

      // вход в игру; ref — tg_id того, кто пригласил (из ссылки startapp=game__ref_ID)
      case "init": {
        const ref = Number(a.ref);
        if (Number.isSafeInteger(ref) && ref > 0 && ref !== uid) {
          const { data: inviter } = await db.from("players").select("tg_id").eq("tg_id", ref).maybeSingle();
          if (inviter) {
            await db.from("friendships").upsert([
              { game_id: game, tg_id: uid, friend_id: ref },
              { game_id: game, tg_id: ref, friend_id: uid },
            ], { onConflict: "game_id,tg_id,friend_id", ignoreDuplicates: true });
          }
        }
        const st = await ensureState(uid, game);
        const { data: upd } = await db.from("game_states")
          .update({ plays: st.plays + 1, last_played: new Date().toISOString() })
          .eq("tg_id", uid).eq("game_id", game).select("*").single();
        return json({ state: publicState(upd ?? st), friends: await friendsOf(uid, game) });
      }

      case "save": {
        const data = a.data && typeof a.data === "object" ? a.data : {};
        if (JSON.stringify(data).length > 8000) return json({ error: "data too big" }, 413);
        const st = await ensureState(uid, game);
        await db.from("game_states").update({ data: { ...(st.data ?? {}), ...data }, updated_at: new Date().toISOString() })
          .eq("tg_id", uid).eq("game_id", game);
        return json({ ok: true });
      }

      case "earn": {
        await ensureState(uid, game);
        const { data, error } = await db.rpc("hub_earn", { p_tg: uid, p_game: game, p_n: Math.floor(Number(a.n) || 0) });
        if (error) throw error;
        return json({ coins: data });
      }

      case "submitRun": {
        await ensureState(uid, game);
        const { data, error } = await db.rpc("hub_submit_run", {
          p_tg: uid, p_game: game, p_score: Math.max(0, Math.floor(Number(a.score) || 0)),
          p_duration: Math.max(0, Math.floor(Number(a.duration) || 0)),
        });
        if (error) throw error;
        return json({ ...data, friends: await friendsOf(uid, game) });
      }

      case "buy": {
        const { data, error } = await db.rpc("hub_buy", { p_tg: uid, p_game: game, p_item: String(a.id ?? "") });
        if (error) throw error;
        return json(data);
      }

      case "friends":
        return json({ friends: await friendsOf(uid, game) });

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: "server error" }, 500);
  }
});

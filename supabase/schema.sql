-- =====================================================================
-- Arcade Jar: база пакета игр. Выполнить один раз в Supabase → SQL Editor.
-- Все таблицы закрыты RLS без политик: читать и писать может только
-- серверная функция hub (service role), браузер напрямую в базу не ходит.
-- Скрипт можно запускать повторно: он ничего не удаляет.
-- =====================================================================

create table if not exists players (
  tg_id       bigint primary key,
  first_name  text,
  username    text,
  photo_url   text,
  created_at  timestamptz not null default now(),
  seen_at     timestamptz not null default now()
);

-- прогресс игрока в КОНКРЕТНОЙ игре: у каждой игры свои монеты, покупки, рекорд
create table if not exists game_states (
  tg_id        bigint not null references players(tg_id) on delete cascade,
  game_id      text   not null,
  coins        int    not null default 0 check (coins >= 0),
  best         int    not null default 0,
  owned        text[] not null default '{}',
  data         jsonb  not null default '{}',
  plays        int    not null default 0,
  last_played  timestamptz,
  last_earn_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (tg_id, game_id)
);

-- дружба тоже внутри одной игры; хранится в обе стороны
create table if not exists friendships (
  game_id    text   not null,
  tg_id      bigint not null references players(tg_id) on delete cascade,
  friend_id  bigint not null references players(tg_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, tg_id, friend_id),
  check (tg_id <> friend_id)
);

-- все забеги: для аналитики и разбора жалоб на рекорды
create table if not exists runs (
  id          bigserial primary key,
  tg_id       bigint not null references players(tg_id) on delete cascade,
  game_id     text   not null,
  score       int    not null,
  duration_s  int,
  created_at  timestamptz not null default now()
);
create index if not exists runs_game_score on runs (game_id, score desc);

-- каталог магазина: цены берутся только отсюда, а не из браузера
create table if not exists shop_items (
  game_id text not null,
  item_id text not null,
  cur     text not null check (cur in ('free','coin','star')),
  price   int  not null check (price >= 0),
  primary key (game_id, item_id)
);

alter table players     enable row level security;
alter table game_states enable row level security;
alter table friendships enable row level security;
alter table runs        enable row level security;
alter table shop_items  enable row level security;

-- ---------- начисление монет с ограничением скорости ----------
-- не больше 3 монет в секунду с прошлого начисления (+10 запаса) и не больше 200 за раз
create or replace function hub_earn(p_tg bigint, p_game text, p_n int)
returns int language plpgsql security definer set search_path = public as $$
declare v_coins int;
begin
  update game_states
     set coins = coins + least(greatest(p_n, 0), 200,
                   10 + floor(extract(epoch from now() - last_earn_at) * 3)::int),
         last_earn_at = now(), updated_at = now()
   where tg_id = p_tg and game_id = p_game
  returning coins into v_coins;
  return coalesce(v_coins, 0);
end $$;

-- ---------- покупка за монеты ----------
create or replace function hub_buy(p_tg bigint, p_game text, p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it shop_items; st game_states;
begin
  select * into it from shop_items where game_id = p_game and item_id = p_item;
  if not found then return jsonb_build_object('ok', false, 'message', 'Такого товара нет'); end if;
  select * into st from game_states where tg_id = p_tg and game_id = p_game for update;
  if not found then return jsonb_build_object('ok', false, 'message', 'Сначала откройте игру'); end if;
  if p_item = any(st.owned) then return jsonb_build_object('ok', true, 'coins', st.coins, 'owned', st.owned); end if;
  if it.cur = 'star' then return jsonb_build_object('ok', false, 'message', '★ ' || it.price || ' Stars: оплата в Telegram скоро'); end if;
  if it.cur = 'coin' and st.coins < it.price then
    return jsonb_build_object('ok', false, 'message', 'Не хватает ' || (it.price - st.coins) || ' монет');
  end if;
  update game_states
     set coins = coins - (case when it.cur = 'coin' then it.price else 0 end),
         owned = array_append(owned, p_item), updated_at = now()
   where tg_id = p_tg and game_id = p_game
  returning * into st;
  return jsonb_build_object('ok', true, 'coins', st.coins, 'owned', st.owned);
end $$;

-- ---------- результат забега ----------
create or replace function hub_submit_run(p_tg bigint, p_game text, p_score int, p_duration int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old int; v_best int;
begin
  insert into runs (tg_id, game_id, score, duration_s) values (p_tg, p_game, greatest(p_score, 0), p_duration);
  select best into v_old from game_states where tg_id = p_tg and game_id = p_game for update;
  update game_states set best = greatest(best, p_score), updated_at = now()
   where tg_id = p_tg and game_id = p_game returning best into v_best;
  return jsonb_build_object('best', coalesce(v_best, 0), 'record', p_score > coalesce(v_old, 0));
end $$;

revoke all on function hub_earn(bigint, text, int) from public, anon, authenticated;
revoke all on function hub_buy(bigint, text, text) from public, anon, authenticated;
revoke all on function hub_submit_run(bigint, text, int, int) from public, anon, authenticated;
-- вызывать функции может только серверная функция hub (service role)
grant execute on function hub_earn(bigint, text, int) to service_role;
grant execute on function hub_buy(bigint, text, text) to service_role;
grant execute on function hub_submit_run(bigint, text, int, int) to service_role;

-- ---------- цены магазина SKYHOOP (из кода игры) ----------
insert into shop_items (game_id, item_id, cur, price) values
  ('skyhoop', 'candy', 'free', 0),
  ('skyhoop', 'meadow', 'free', 0),
  ('skyhoop', 'space', 'coin', 50),
  ('skyhoop', 'lava', 'coin', 50),
  ('skyhoop', 'arcade', 'coin', 50),
  ('skyhoop', 'lcd', 'coin', 100),
  ('skyhoop', 'modem', 'coin', 100),
  ('skyhoop', 'y2k', 'coin', 100),
  ('skyhoop', 'lofi', 'coin', 100),
  ('skyhoop', 'vhs', 'coin', 200),
  ('skyhoop', 'backrooms', 'coin', 200),
  ('skyhoop', 'vapor', 'coin', 200),
  ('skyhoop', 'coderain', 'coin', 200),
  ('skyhoop', 'gossip', 'coin', 200),
  ('skyhoop', 'upside', 'coin', 200),
  ('skyhoop', 'castle', 'coin', 100),
  ('skyhoop', 'water', 'coin', 100),
  ('skyhoop', 'blocks', 'coin', 100),
  ('skyhoop', 'horror', 'coin', 100),
  ('skyhoop', 'west', 'coin', 100),
  ('skyhoop', 'sakura', 'coin', 200),
  ('skyhoop', 'hyper', 'star', 50),
  ('skyhoop', 'aura', 'star', 75),
  ('skyhoop', 'frog', 'free', 0),
  ('skyhoop', 'robot', 'free', 0),
  ('skyhoop', 'bunny', 'free', 0),
  ('skyhoop', 'knight', 'free', 0),
  ('skyhoop', 'tama', 'coin', 100),
  ('skyhoop', 'tape', 'coin', 50),
  ('skyhoop', 'floppy', 'coin', 50),
  ('skyhoop', 'pager', 'coin', 50),
  ('skyhoop', 'shiba', 'coin', 100),
  ('skyhoop', 'loaf', 'coin', 50),
  ('skyhoop', 'goose', 'coin', 100),
  ('skyhoop', 'dumpling', 'coin', 50),
  ('skyhoop', 'capy', 'coin', 200),
  ('skyhoop', 'sigma', 'coin', 100),
  ('skyhoop', 'npc', 'coin', 50),
  ('skyhoop', 'alt', 'coin', 100),
  ('skyhoop', 'hamster', 'coin', 100),
  ('skyhoop', 'caracal', 'coin', 200),
  ('skyhoop', 'energy', 'coin', 50),
  ('skyhoop', 'shroom', 'coin', 50),
  ('skyhoop', 'slime', 'coin', 200),
  ('skyhoop', 'chosen', 'coin', 200),
  ('skyhoop', 'starknight', 'coin', 200),
  ('skyhoop', 'ratchef', 'coin', 100),
  ('skyhoop', 'ghostbuster', 'coin', 100),
  ('skyhoop', 'cape', 'coin', 100),
  ('skyhoop', 'ninja', 'coin', 100),
  ('skyhoop', 'zombie', 'coin', 50),
  ('skyhoop', 'count', 'coin', 100),
  ('skyhoop', 'mummy', 'coin', 50),
  ('skyhoop', 'alien', 'coin', 50),
  ('skyhoop', 'trex', 'coin', 100),
  ('skyhoop', 'boxcat', 'coin', 50),
  ('skyhoop', 'raccoon', 'coin', 100),
  ('skyhoop', 'cowboy', 'coin', 100),
  ('skyhoop', 'duck', 'coin', 50),
  ('skyhoop', 'rocker', 'coin', 200),
  ('skyhoop', 'dragon', 'coin', 200),
  ('skyhoop', 'ghost', 'star', 25),
  ('skyhoop', 'glitch', 'star', 50),
  ('skyhoop', 'unicorn', 'star', 75),
  ('skyhoop', 'goldfrog', 'star', 100)
on conflict (game_id, item_id) do update set cur = excluded.cur, price = excluded.price;

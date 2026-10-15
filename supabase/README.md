# Сервер Arcade Jar (Supabase)

1. **SQL Editor** → вставить `schema.sql` → Run. Создаёт таблицы, функции и цены магазинов SKYHOOP, «Слов из слова» и PIXEL RUN. Запускать повторно безопасно.
2. **Edge Functions** → Deploy a new function → имя `hub` → вставить `functions/hub/index.ts`. В настройках функции выключить **Verify JWT** (функция сама проверяет подпись Telegram).
3. **Edge Functions → Secrets** → `TELEGRAM_BOT_TOKEN` = токен бота из BotFather.
4. В `index.html` (корень репозитория) заполнить `window.ARCADE_JAR_SERVER`: `url` = `https://<project-ref>.supabase.co/functions/v1/hub`, `anonKey` = Project Settings → API → anon public.

Новая игра в пакете: добавить её id в `GAMES` в `functions/hub/index.ts` и её товары в `shop_items`.

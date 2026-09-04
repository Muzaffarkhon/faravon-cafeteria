# Планировщик задач (cron)

В репозитории появился `vercel.json` с тремя задачами:

| Путь | Интервал | Зачем |
|---|---|---|
| `/api/cron/deliver-notifications` | каждые 10 мин | добор недоставленных Telegram-уведомлений + оконные уведомления периода (§5.10) |
| `/api/cron/sla-escalations` | каждые 15 мин | SLA-эскалации по зависшим заявкам (§5.12) |
| `/api/health` | каждые 5 мин | keep-warm для Neon (scale-to-zero) — чтобы первые пользователи после простоя не ловили 500 |

## Что нужно сделать

1. **`CRON_SECRET`** — задать в Vercel → Project → Settings → Environment Variables
   (Production). Vercel сам добавляет заголовок `Authorization: Bearer $CRON_SECRET`
   к cron-запросам, а роуты его проверяют. Без переменной cron-роуты отвечают 401.
   Сгенерировать: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.

2. **Тариф Vercel.**
   - **Pro / Enterprise** — расписания из `vercel.json` работают как указано (минутная гранулярность).
   - **Hobby** — cron ограничен: не чаще **1 раза в сутки** и **не более 2 задач**. Тогда:
     - оставить в `vercel.json` только 2 самые важные (`deliver-notifications`, `sla-escalations`),
       расписание Vercel всё равно сведёт к суточному;
     - **или** (рекомендуется для нормальной работы уведомлений) вынести планирование во
       внешний сервис — **cron-job.org** / GitHub Actions schedule / Upstash QStash:
       делать `GET https://<прод>/api/cron/deliver-notifications` и
       `.../api/cron/sla-escalations` каждые 10–15 мин с заголовком
       `Authorization: Bearer <CRON_SECRET>`, и `GET .../api/health` каждые 5 мин.

3. **Проверка после деплоя:**
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<прод>/api/cron/deliver-notifications
   curl -H "Authorization: Bearer $CRON_SECRET" https://<прод>/api/cron/sla-escalations
   curl https://<прод>/api/health
   ```
   Все три должны вернуть `{"ok":true,...}`.

Без работающего планировщика: оконные уведомления периода и SLA-эскалации не
отправляются, а недоставленные с первого раза Telegram-сообщения не добираются.

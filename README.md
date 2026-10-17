# cyber-stories

Message a private Telegram bot and have your notes land in this repo as a daily markdown log.

A GitHub Actions workflow runs every 6 hours, reads any new messages sent to the bot, and appends them to `logs/daily.md`, grouped by day:

```md
## 2026-10-17

- [2026-10-17 14:32] your message here
```

The bot replies "✅ logged" once a message is saved. Only messages from your own Telegram user ID are accepted; everything else is ignored.

## Setup

1. **Create a bot**: message [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the token.
2. **Find your user ID**: message [@userinfobot](https://t.me/userinfobot).
3. **Add repository secrets** (Settings → Secrets and variables → Actions → Secrets):
   - `TELEGRAM_BOT_TOKEN`: the token from BotFather
   - `ALLOWED_USER_ID`: your numeric Telegram user ID
   - `GH_TOKEN` (optional): a fine-grained token with Contents read/write. If unset, the built-in `GITHUB_TOKEN` is used.
4. Send your bot a message, then run the workflow from Actions → Telegram log → Run workflow, or wait for the next scheduled run.

To change how often it runs, edit the `cron` line in `.github/workflows/telegram-log.yml`.

## Running locally

```sh
npm install
cp .env.example .env   # fill in the values; GITHUB_REPOSITORY is owner/repo
npm start
```

`GH_TOKEN` is required locally. Never commit `.env`; it is gitignored.

## How it works

`index.js` fetches pending updates from the Telegram Bot API, filters them by allowed user and chat, and writes them to `logs/daily.md` through the GitHub contents API (retrying on write conflicts). Updates are marked as read only after the commit succeeds, so a failed run is retried next time.

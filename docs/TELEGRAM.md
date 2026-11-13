# Telegram SOS setup
1. In Telegram, talk to **@BotFather** -> `/newbot` -> copy the token into `.env` as `TELEGRAM_BOT_TOKEN`. Restart the server.
2. Each trusted contact opens your bot and presses **Start** once (a bot cannot message someone who has not).
3. The contact messages **@userinfobot** to learn their numeric chat id; you enter it in Settings -> contact (tick "this person agreed").
4. Press **Send test message**. Admin -> **Test Telegram** only checks the bot token (`getMe`).
Statuses shown after an SOS are real: *sent* only when Telegram accepted the message, otherwise *failed* or *unavailable*. SMS (Twilio) is optional and needs India sender registration. Not tested against a live bot from this build environment.

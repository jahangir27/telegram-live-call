require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL;

if (!BOT_TOKEN) {
  throw new Error("Missing BOT_TOKEN");
}

if (!MINI_APP_URL) {
  throw new Error("Missing MINI_APP_URL");
}

const bot = new Telegraf(BOT_TOKEN);

bot.start(async (ctx) => {
  await ctx.reply(
    "Open the live call Mini App",
    Markup.inlineKeyboard([
      [Markup.button.webApp("Open Call", MINI_APP_URL)]
    ])
  );
});

bot.command("call", async (ctx) => {
  await ctx.reply(
    "Open the live call Mini App",
    Markup.inlineKeyboard([
      [Markup.button.webApp("Open Call", MINI_APP_URL)]
    ])
  );
});

bot.launch().then(() => {
  console.log("Telegram bot started");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

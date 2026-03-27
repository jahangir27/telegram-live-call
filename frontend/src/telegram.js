export function getTelegramWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function initTelegramUI() {
  const tg = getTelegramWebApp();
  if (!tg) return null;

  tg.ready();
  tg.expand();

  try {
    if (tg.themeParams?.bg_color) {
      tg.setBackgroundColor(tg.themeParams.bg_color);
    }
  } catch (_) {}

  return tg;
}

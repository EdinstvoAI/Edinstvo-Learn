export async function request(route, data) {
  const response = await fetch('/api' + route, data === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Сервис временно недоступен.');
  return result;
}

export function encodePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Не удалось прочитать фото.'));
    reader.readAsDataURL(file);
  });
}

export async function telegramData() {
  if (!window.Telegram?.WebApp) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-web-app.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }
  window.Telegram?.WebApp?.ready();
  return window.Telegram?.WebApp?.initData;
}

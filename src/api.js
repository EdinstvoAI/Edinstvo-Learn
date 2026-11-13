export async function request(route, data) {
  const response = await fetch('/api' + route, data === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  // Ответ прокси или сервера может прийти не JSON (например, 413 от HTTPS-прокси). Safari тогда бросает
  // «The string did not match the expected pattern», поэтому разбираем текст сами.
  const text = await response.text();
  let result = {};
  try { result = text ? JSON.parse(text) : {}; } catch { result = {}; }
  if (!response.ok) throw new Error(result.error ?? (response.status === 413 ? 'Фото слишком большое.' : 'Сервис временно недоступен.'));
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

// Размер фото после уменьшения: длинная сторона не больше max, пропорции сохраняются.
export function fitSize(width, height, max = 1600) {
  const scale = Math.min(1, max / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

// Фото с телефона весит мегабайты. Перед отправкой уменьшаем его до 1600 px и сохраняем в JPEG.
export async function compressPhoto(file) {
  let source;
  try {
    source = await createImageBitmap(file);
  } catch {
    source = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось открыть фото. Выбери другое.'));
      image.src = URL.createObjectURL(file);
    });
  }
  const [width, height] = fitSize(source.width, source.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  source.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .85));
  if (!blob) throw new Error('Не удалось подготовить фото.');
  return blob;
}

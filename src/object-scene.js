// Сцены теста из подлинной анимации роста навыка: ноутбук, плашка «единство», ластик, призма, стеклянные
// объекты и фиолетовые осколки. Галочки и зелёные слои сектора убираются, остаётся пролёт объектов.
// Чистая функция без DOM: её проверяют юнит-тесты.
const chartLayer = /check|green|lime/i;

// Отрезок пролёта объектов в кадрах исходника и кадр, на котором плашка в центре экрана.
export const objectSegment = [136, 340];
export const objectCover = 214;

export function objectScene(asset) {
  const data = structuredClone(asset);
  data.layers = data.layers.filter((layer) => !chartLayer.test(layer.nm));
  return data;
}

// Lottie-сцены входного теста. Чистые функции без DOM: их проверяют юнит-тесты.
// Стиль общий с celebration.js: чёрно-белая палитра теста, мягкий ease, появление и уход через прозрачность,
// объекты (ноутбук, призма, стеклянные жемчужина и петля, логотип) взяты из сцены роста навыка.

const ink = [[0.09, 0.09, 0.09], [0.38, 0.38, 0.38], [0.63, 0.63, 0.63]];
const ease = { i: { x: 0.25, y: 1 }, o: { x: 0.25, y: 0 } };
const easeInOut = { i: { x: 0.55, y: 1 }, o: { x: 0.45, y: 0 } };

export const property = (value) => ({ a: 0, k: value });

export function keyframes(frames, curve = ease) {
  return { a: 1, k: frames.map(([time, start], index) => ({
    t: time, s: start, ...(index < frames.length - 1 ? curve : {}),
  })) };
}

function layer(index, inPoint, outPoint, transform, shapes) {
  return {
    ty: 4, ind: index, ip: inPoint, op: outPoint, st: 0, sr: 1,
    ks: { a: property([0, 0, 0]), r: property(0), o: property(100), s: property([100, 100, 100]), ...transform },
    shapes,
  };
}

const fill = (color, opacity = 100) => ({ ty: 'fl', c: property([...color, 1]), o: property(opacity), r: 1 });
const highlight = (x, y, w, h) => [{ ty: 'el', p: property([x, y]), s: property([w, h]) }, fill([1, 1, 1], 55)];

function star(size, color) {
  return [
    { ty: 'sr', sy: 1, d: 1, pt: property(5), p: property([0, 0]), r: property(0),
      ir: property(size * .45), is: property(28), or: property(size), os: property(22) },
    fill(color),
    ...highlight(-size * .2, -size * .3, size * .35, size * .25),
  ];
}

function ring(index, start, size, opacity) {
  return layer(index, start, start + 60, {
    p: property([140, 140, 0]),
    o: keyframes([[start, [0]], [start + 10, [opacity]], [start + 50, [0]]]),
    s: keyframes([[start, [14, 14, 100]], [start + 52, [size, size, 100]]]),
  }, [{ ty: 'el', p: property([0, 0]), s: property([200, 200]) }, { ty: 'st', c: property([...ink[0], 1]), o: property(100), w: property(5), lc: 2, lj: 2 }]);
}

// Поддержка на рубежах теста. strong = true — усиленная версия после 20-го вопроса.
export function cheerScene(strong = false) {
  const duration = strong ? 120 : 80;
  const count = strong ? 14 : 8;
  const layers = [];
  // Центральная звезда: мягкий вход с перелётом масштаба и плавный уход.
  layers.push(layer(1, 0, duration, {
    p: property([140, 140, 0]),
    o: keyframes([[0, [0]], [10, [100]], [duration - 22, [100]], [duration - 4, [0]]]),
    s: keyframes([[0, [20, 20, 100]], [18, [strong ? 124 : 112, strong ? 124 : 112, 100]], [30, [100, 100, 100]], [duration - 4, [88, 88, 100]]]),
    r: keyframes([[0, [-18]], [30, [0]], [duration - 4, [8]]]),
  }, star(strong ? 40 : 30, ink[0])));
  layers.push(ring(2, 2, strong ? 150 : 120, 70));
  if (strong) layers.push(ring(3, 22, 175, 45));
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2 + (strong ? .2 : 0);
    const color = ink[index % 3];
    const far = (strong ? 112 : 92) + (index % 2) * 14;
    const point = (distance) => [140 + Math.cos(angle) * distance, 140 + Math.sin(angle) * distance, 0];
    const start = 6 + (index % 3) * 3;
    const shapes = index % 3 === 0
      ? star(8, color)
      : strong && index % 2
        ? [{ ty: 'rc', p: property([0, 0]), s: property([8, 15]), r: property(1) }, fill(color)]
        : [{ ty: 'el', p: property([0, 0]), s: property([10, 10]) }, fill(color), ...highlight(-2, -2, 4, 3)];
    layers.push(layer(10 + index, start, duration, {
      p: keyframes([[start, point(26)], [start + 26, point(far * .82)], [duration - 6, point(far)]]),
      o: keyframes([[start, [0]], [start + 8, [100]], [duration - 30, [100]], [duration - 6, [0]]]),
      s: keyframes([[start, [10, 10, 100]], [start + 16, [100, 100, 100]], [duration - 6, [40, 40, 100]]]),
      r: keyframes([[start, [index * 24]], [duration - 6, [index * 24 + 160]]]),
    }, shapes));
  }
  return { v: '5.13.0', fr: 60, ip: 0, op: duration, w: 280, h: 280, assets: [], layers };
}

// Скруглённый верх и тело маски заливаются отдельно: в одной группе встречные контуры вырезали бы дыру.
const maskPart = (shape) => ({ ty: 'gr', it: [shape, fill([0.976, 0.976, 0.976]),
  { ty: 'tr', p: property([0, 0]), a: property([0, 0]), s: property([100, 100]), r: property(0), o: property(100) }] });

// Кадр, на котором маска полностью закрывает экран и интерфейс можно переключить на результат.
export const finaleCover = 62;
const finaleEnd = 150;

// Финал теста: плотная волна объектов снизу вверх и маска, которая закрывает экран и уходит, открывая результат.
export function finaleScene(library, width = 402, height = 860) {
  const layers = [];
  const kinds = ['laptop', 'logo', 'pearl', 'prism', 'loop', 'laptop', 'pearl', 'logo'];
  const columns = 4;
  const rows = 6;
  let index = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const kind = kinds[(row * columns + column + row) % kinds.length];
      const x = (column + .5 + (row % 2 ? .35 : -.15)) * width / columns;
      const start = row * 7 + (column % 2) * 3;
      const travel = 92;
      const fromY = height + 120;
      const toY = -140 - row * 30;
      // Ближние объекты крупнее и быстрее: так волна читается объёмной, а глубина не скачет, потому что масштаб
      // меняется непрерывно от входа до выхода.
      const depth = .75 + ((row + column * 2) % 3) * .2;
      const target = (kind === 'logo' ? 150 : kind === 'laptop' ? 110 : 64) * depth;
      const object = kind === 'logo' ? null : library.objects[kind];
      const scale = kind === 'logo' ? target / library.logo.w * 100 : target / object.size * 100;
      const transform = {
        p: keyframes([[start, [x, fromY, 0]], [start + travel, [x + (column % 2 ? -18 : 18), toY, 0]]], easeInOut),
        s: keyframes([[start, [scale * .82, scale * .82, 100]], [start + travel, [scale * 1.08, scale * 1.08, 100]]], easeInOut),
        r: keyframes([[start, [(column % 2 ? -1 : 1) * 14]], [start + travel, [(column % 2 ? 1 : -1) * 10]]], easeInOut),
        o: keyframes([[start, [0]], [start + 12, [100]], [start + travel - 16, [100]], [start + travel, [0]]]),
        a: property(kind === 'logo' ? [library.logo.w / 2, library.logo.h / 2, 0] : [...object.anchor, 0]),
      };
      layers.push(kind === 'logo'
        ? { ty: 2, ind: index, refId: library.logo.id, ip: start, op: start + travel + 1, st: 0, sr: 1, ks: transform }
        : layer(index, start, start + travel + 1, transform, structuredClone(object.shapes)));
      index += 1;
    }
  }
  // Маска: светлая волна со скруглённым верхом. Поднимается за объектами, держит экран закрытым на finaleCover
  // и уходит вверх, открывая результат.
  const maskHeight = height * 1.5;
  layers.push(layer(index, 0, finaleEnd, {
    p: keyframes([[0, [width / 2, height + maskHeight / 2 + 60, 0]], [finaleCover - 6, [width / 2, height / 2 + 40, 0]],
      [finaleCover + 8, [width / 2, height / 2 + 40, 0]], [finaleEnd - 8, [width / 2, -maskHeight / 2 - 80, 0]]], easeInOut),
  }, [maskPart({ ty: 'el', p: property([0, -maskHeight / 2]), s: property([width * 1.8, 240]) }),
    maskPart({ ty: 'rc', p: property([0, 0]), s: property([width * 1.8, maskHeight]), r: property(0) })]));
  // lottie рисует первые слои поверх последних: объекты летят перед маской.
  return { v: '5.13.0', fr: 60, ip: 0, op: finaleEnd, w: width, h: height, assets: [library.logo], layers };
}

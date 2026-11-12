// Lottie-сцены входного теста по видеореференсу Макара: крупные глянцевые фиолетовые кубики и стеклянные
// жемчужины на прозрачном фоне, розовые искры. Чистые функции без DOM: их проверяют юнит-тесты.

const ease = { i: { x: 0.25, y: 1 }, o: { x: 0.25, y: 0 } };
const easeInOut = { i: { x: 0.5, y: 1 }, o: { x: 0.42, y: 0 } };

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
const group = (...items) => ({ ty: 'gr', it: [...items,
  { ty: 'tr', p: property([0, 0]), a: property([0, 0]), s: property([100, 100]), r: property(0), o: property(100) }] });

// Глянцевый кубик: тёмная боковая грань со сдвигом даёт толщину, лицевая грань с радиальным градиентом
// и бликом даёт объём. Размер 100 px, масштаб задаёт слой.
function cube(tone = 0) {
  const light = [0.99, 0.8 - tone * .08, 1];
  const middle = [0.82 - tone * .06, 0.38, 0.98];
  const deep = [0.52, 0.13 + tone * .04, 0.86];
  // В Lottie первые фигуры рисуются поверх следующих, поэтому блик идёт первым, а боковая грань последней.
  return [
    group({ ty: 'el', p: property([-20, -26]), s: property([38, 22]) }, fill([1, 1, 1], 55)),
    group({ ty: 'el', p: property([24, 28]), s: property([14, 14]) }, fill([0.48, 0.12, 0.8], 45)),
    group({ ty: 'rc', p: property([0, 0]), s: property([100, 100]), r: property(34) }, {
      ty: 'gf', t: 2, o: property(100), r: 1, s: property([-28, -32]), e: property([66, 70]),
      h: property(0), a: property(0), g: { p: 3, k: property([0, ...light, .45, ...middle, 1, ...deep]) },
    }),
    group({ ty: 'rc', p: property([12, 15]), s: property([100, 100]), r: property(34) }, fill([0.43, 0.09, 0.7])),
  ];
}

const spark = () => [group({ ty: 'rc', p: property([0, 0]), s: property([3, 18]), r: property(1.5) }, fill([0.98, 0.35, 0.82]))];

// Детерминированный разброс, чтобы сцена была одинаковой при каждом показе.
function random(seed) {
  let value = seed;
  return () => {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
}

function flyer(index, start, travel, from, to, sizes, spin, shapes, anchor = [0, 0, 0]) {
  return layer(index, start, start + travel + 1, {
    a: property(anchor),
    p: keyframes([[start, from], [start + travel, to]], easeInOut),
    s: keyframes([[start, [sizes[0], sizes[0], 100]], [start + travel, [sizes[1], sizes[1], 100]]], easeInOut),
    r: keyframes([[start, [spin[0]]], [start + travel, [spin[1]]]], easeInOut),
    o: keyframes([[start, [0]], [start + 6, [100]], [start + travel - 6, [100]], [start + travel, [0]]]),
  }, shapes);
}

function sparks(first, count, start, center, next) {
  return Array.from({ length: count }, (_, index) => {
    const angle = next() * Math.PI * 2;
    const distance = 60 + next() * 150;
    const from = [center[0] + Math.cos(angle) * 20, center[1] + Math.sin(angle) * 20, 0];
    const to = [center[0] + Math.cos(angle) * distance, center[1] + Math.sin(angle) * distance, 0];
    const rotation = angle * 180 / Math.PI + 90;
    return flyer(first + index, start + Math.floor(next() * 10), 34, from, to, [100, 40], [rotation, rotation], spark());
  });
}

// Влёт на рубежах теста: кубики пролетают через экран снизу справа вверх влево, искры вокруг центра.
// strong = true — плотнее и дольше, после 20-го вопроса.
export function burstScene(strong = false, width = 402, height = 860) {
  const next = random(strong ? 20 : 9);
  const count = strong ? 10 : 6;
  const layers = [];
  for (let index = 0; index < count; index += 1) {
    const start = index * (strong ? 5 : 6);
    const lane = next();
    const from = [width * (.55 + lane * .7), height + 120, 0];
    const to = [width * (-.35 + lane * .7), -160, 0];
    const size = 70 + next() * (strong ? 120 : 90);
    layers.push(flyer(index + 1, start, 70, from, to, [size * .7, size * 1.25], [-20 + next() * 40, 40 + next() * 60], cube(index % 3)));
  }
  layers.push(...sparks(40, strong ? 16 : 10, strong ? 26 : 22, [width / 2, height * .42], next));
  const end = Math.max(...layers.map((item) => item.op));
  return { v: '5.13.0', fr: 60, ip: 0, op: end, w: width, h: height, assets: [], layers };
}

// Кадр, на котором волна плотнее всего закрывает экран: под ней интерфейс переключается на результат.
export const finaleCover = 58;

// Финал теста: плотная волна крупных кубиков и жемчужин снизу вверх. Фон прозрачный, маской служат сами объекты.
export function finaleScene(library, width = 402, height = 860) {
  const next = random(30);
  const layers = [];
  const rows = 7;
  const columns = 3;
  let index = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const start = row * 6 + Math.floor(next() * 6);
      const x = (column + .5 + (next() - .5) * .6) * width / columns;
      const from = [x + (next() - .5) * 80, height + 200, 0];
      const to = [x + (next() - .5) * 120, -260, 0];
      // Крупнее ближе к концу волны: объекты будто летят на камеру.
      const size = 150 + next() * 120 + row * 12;
      const pearl = (row + column) % 5 === 4;
      const shapes = pearl ? structuredClone(library.objects.pearl.shapes) : cube((row + column) % 3);
      const scale = pearl ? size * .7 / library.objects.pearl.size * 100 : size;
      layers.push(flyer(index, start, 78, from, to, [scale * .75, scale * 1.2], [-25 + next() * 50, -60 + next() * 120], shapes,
        pearl ? [...library.objects.pearl.anchor, 0] : [0, 0, 0]));
      index += 1;
    }
  }
  layers.push(...sparks(index, 18, finaleCover - 10, [width / 2, height / 2], next));
  const end = Math.max(...layers.map((item) => item.op));
  return { v: '5.13.0', fr: 60, ip: 0, op: end, w: width, h: height, assets: [], layers };
}

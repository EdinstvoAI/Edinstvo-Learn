import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cheerScene, finaleCover, finaleScene } from '../src/lottie-scenes.js';

const library = JSON.parse(readFileSync(new URL('../public/motion/assessment-objects.json', import.meta.url)));

// Значение анимированного свойства в первом и последнем ключе.
const ends = (property) => property.a ? [property.k[0].s, property.k.at(-1).s] : [property.k, property.k];

function assertValid(scene) {
  assert.equal(scene.v, '5.13.0');
  assert.ok(scene.op > scene.ip && scene.w > 0 && scene.h > 0);
  for (const layer of scene.layers) {
    assert.ok(layer.ip >= scene.ip && layer.op <= scene.op + 1, 'layer stays inside the scene');
    for (const property of Object.values(layer.ks)) {
      if (!property.a) continue;
      const times = property.k.map((frame) => frame.t);
      assert.deepEqual(times, [...times].sort((a, b) => a - b), 'keyframes go forward');
    }
  }
}

// Плавность: всё, что появляется, входит и уходит через нулевую прозрачность, без резких вспышек.
function assertSoftEdges(scene, skip = () => false) {
  for (const layer of scene.layers) {
    if (skip(layer)) continue;
    const [first, last] = ends(layer.ks.o);
    assert.deepEqual([first, last], [[0], [0]], 'layer ' + layer.ind + ' fades in and out');
  }
}

test('cheer scenes are valid, soft and the strong one is bigger', () => {
  const light = cheerScene();
  const strong = cheerScene(true);
  for (const scene of [light, strong]) {
    assertValid(scene);
    assertSoftEdges(scene);
  }
  assert.ok(strong.op > light.op);
  assert.ok(strong.layers.length > light.layers.length);
});

test('finale rises objects bottom to top in front of the mask', () => {
  const scene = finaleScene(library);
  assertValid(scene);
  const mask = scene.layers.at(-1);
  const objects = scene.layers.slice(0, -1);
  assertSoftEdges(scene, (layer) => layer === mask);
  assert.ok(objects.length >= 20, 'dense wave');
  assert.ok(objects.some((layer) => layer.ty === 2 && layer.refId === library.logo.id), 'logo is in the wave');
  for (const layer of objects) {
    const [from, to] = ends(layer.ks.p);
    assert.ok(from[1] > scene.h && to[1] < 0, 'object enters below and leaves above the screen');
    const [small, big] = ends(layer.ks.s);
    assert.ok(big[0] > small[0], 'scale grows continuously for depth');
  }
});

test('finale mask covers the screen at the cover frame and leaves at the end', () => {
  const scene = finaleScene(library);
  const frames = scene.layers.at(-1).ks.p.k;
  const covering = frames.filter((frame) => frame.t >= finaleCover - 6 && frame.t <= finaleCover + 8);
  assert.equal(covering.length, 2);
  // Верх маски (центр минус половина высоты) выше экрана, низ ниже.
  const maskHeight = scene.h * 1.5;
  for (const frame of covering) {
    assert.ok(frame.s[1] - maskHeight / 2 < 0 && frame.s[1] + maskHeight / 2 > scene.h);
  }
  assert.ok(frames[0].s[1] - maskHeight / 2 > scene.h, 'starts below the screen');
  assert.ok(frames.at(-1).s[1] + maskHeight / 2 < 0, 'ends above the screen');
  assert.ok(finaleCover < scene.op);
});

test('extracted objects keep shapes for every kind used by the finale', () => {
  for (const kind of ['laptop', 'prism', 'pearl', 'loop']) {
    const object = library.objects[kind];
    assert.ok(object.shapes.length > 0 && object.size > 0 && object.anchor.length === 2, kind);
    assert.ok(!JSON.stringify(object.shapes).includes('"a":1'), kind + ' is static');
  }
  assert.match(library.logo.p, /^data:image\/png;base64,/);
});

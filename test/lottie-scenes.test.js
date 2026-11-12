import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { burstScene, finaleCover, finaleScene } from '../src/lottie-scenes.js';

const library = JSON.parse(readFileSync(new URL('../public/motion/assessment-objects.json', import.meta.url)));
const ends = (property) => property.a ? [property.k[0].s, property.k.at(-1).s] : [property.k, property.k];

function assertValid(scene) {
  assert.equal(scene.v, '5.13.0');
  assert.ok(scene.op > scene.ip && scene.w > 0 && scene.h > 0);
  for (const layer of scene.layers) {
    assert.ok(layer.ip >= scene.ip && layer.op <= scene.op, 'layer stays inside the scene');
    for (const property of Object.values(layer.ks)) {
      if (!property.a) continue;
      const times = property.k.map((frame) => frame.t);
      assert.deepEqual(times, [...times].sort((a, b) => a - b), 'keyframes go forward');
    }
    // Бесшовность: каждый слой входит и уходит через прозрачность.
    assert.deepEqual(ends(layer.ks.o), [[0], [0]]);
  }
}

test('burst scenes are valid and the strong one is denser', () => {
  const light = burstScene();
  const strong = burstScene(true);
  assertValid(light);
  assertValid(strong);
  assert.ok(strong.layers.length > light.layers.length);
  assert.deepEqual(burstScene(), light, 'same scene every time');
});

test('burst cubes fly in from below the screen and leave above it', () => {
  const scene = burstScene();
  const cubes = scene.layers.filter((layer) => layer.ind < 40);
  for (const layer of cubes) {
    const [from, to] = ends(layer.ks.p);
    assert.ok(from[1] > scene.h && to[1] < 0);
  }
});

test('finale is a dense transparent wave of large objects', () => {
  const scene = finaleScene(library);
  assertValid(scene);
  assert.equal(scene.assets.length, 0);
  const flyers = scene.layers.filter((layer) => ends(layer.ks.p)[0][1] > scene.h);
  assert.ok(flyers.length >= 20, 'dense wave');
  for (const layer of flyers) {
    const [small, big] = ends(layer.ks.s);
    assert.ok(big[0] > small[0], 'objects grow toward the camera');
    assert.ok(ends(layer.ks.p)[1][1] < 0, 'objects leave above the screen');
  }
  // На кадре переключения в кадре много объектов одновременно.
  const visible = flyers.filter((layer) => layer.ip <= finaleCover && layer.op > finaleCover);
  assert.ok(visible.length >= 12);
  assert.ok(finaleCover < scene.op);
});

test('extracted glass objects stay static', () => {
  for (const kind of ['pearl', 'loop']) {
    const object = library.objects[kind];
    assert.ok(object.shapes.length > 0 && object.size > 0 && object.anchor.length === 2, kind);
    assert.ok(!JSON.stringify(object.shapes).includes('"a":1'), kind + ' is static');
  }
});

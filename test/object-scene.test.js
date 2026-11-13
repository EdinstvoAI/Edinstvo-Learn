import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { objectCover, objectScene, objectSegment } from '../src/object-scene.js';

const asset = JSON.parse(readFileSync(new URL('../public/motion/skill-growth.json', import.meta.url)));

test('object scene keeps the genuine objects and drops the chart layers', () => {
  const scene = objectScene(asset);
  const names = scene.layers.map((layer) => layer.nm);
  for (const name of ['Laptop', 'Wordmark plaque', 'Eraser', 'Faceted prism', 'Glass pearl', 'Glass loop', 'Purple fragment']) {
    assert.ok(names.includes(name), name);
  }
  assert.ok(!names.some((name) => /check|green|lime/i.test(name)));
  assert.equal(asset.layers.length > scene.layers.length, true, 'source is not mutated');
  assert.ok(asset.layers.some((layer) => /check/i.test(layer.nm)));
});

test('segment and cover frame sit inside the source animation', () => {
  const [start, end] = objectSegment;
  assert.ok(asset.ip <= start && start < objectCover && objectCover < end && end <= asset.op);
  // В отрезке объекты действительно появляются: у ноутбука прозрачность растёт после начала отрезка.
  const laptop = asset.layers.find((layer) => layer.nm === 'Laptop');
  const visible = laptop.ks.o.k.find((frame) => frame.s[0] > 50);
  assert.ok(visible.t > start && visible.t < objectCover);
});

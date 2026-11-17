import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const styles = readFileSync(new URL('../src/student-home.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...styles.matchAll(/([^{}]+)\{([^{}]+)\}/g)];

function declarations(selector) {
  const matches = rules.filter(([, selectors]) => selectors.trim() === selector);
  assert.ok(matches.length, `Missing rule: ${selector}`);
  return Object.fromEntries(matches.flatMap(([, , body]) => body.split(';').flatMap((declaration) => {
    const colon = declaration.indexOf(':');
    return colon < 0 ? [] : [[declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()]];
  })));
}

test('skills screen stretches the header, summary and panel across the flex column', () => {
  const layout = declarations('.student-shell[data-page=home] :is(.home-main, .home-sheet, .screen, .student-home)');
  assert.equal(layout.display, 'flex');
  assert.equal(layout['flex-direction'], 'column');
  assert.equal(layout['align-items'], 'stretch');
});

test('skills summary aligns with the panel and wraps long names on narrow screens', () => {
  const summary = declarations('.student-shell .student-home .home-summary');
  assert.equal(summary.margin, '0 0 8px');
  assert.equal(declarations('.student-shell .home-summary p')['overflow-wrap'], 'anywhere');
});

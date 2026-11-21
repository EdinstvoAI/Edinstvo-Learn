import { svg } from 'lit';

// Каталог стикеров для карточки профиля. Типы совпадают с stickerTypes в server/input.js.
// Каждый стикер нарисован в квадрате 64×64. Белую вырубку и тень добавляет CSS.
const rays = (count, inner, outer, width, color) => Array.from({ length: count }, (_, index) => {
  const angle = (index / count) * Math.PI * 2;
  const long = index % 2 ? outer : outer - 4;
  return svg`<line x1=${32 + Math.cos(angle) * inner} y1=${32 + Math.sin(angle) * inner}
    x2=${32 + Math.cos(angle) * long} y2=${32 + Math.sin(angle) * long}
    stroke=${color} stroke-width=${width} stroke-linecap="round"/>`;
});

export const stickers = [
  ['figma', 'figma', svg`<rect x="12" y="6" width="40" height="52" rx="14" fill="#fff"/>
    <path d="M32 12.5h-6.5a6.5 6.5 0 0 0 0 13H32z" fill="#f24e1e"/>
    <path d="M32 12.5h6.5a6.5 6.5 0 0 1 0 13H32z" fill="#ff7262"/>
    <path d="M32 25.5h-6.5a6.5 6.5 0 0 0 0 13H32z" fill="#a259ff"/>
    <circle cx="38.5" cy="32" r="6.5" fill="#1abcfe"/>
    <path d="M32 38.5h-6.5a6.5 6.5 0 1 0 6.5 6.5z" fill="#0acf83"/>`],
  ['claude', 'claude', svg`<circle cx="32" cy="32" r="28" fill="#f4efe6"/>${rays(12, 4, 22, 5.2, '#d97757')}`],
  ['chatgpt', 'chatgpt', svg`<circle cx="32" cy="32" r="28" fill="#0f0f0f"/>
    <g transform="translate(32 32)" fill="none" stroke="#fff" stroke-width="3.2">
      ${[0, 60, 120, 180, 240, 300].map((angle) => svg`<rect x="-6.5" y="-17" width="13" height="21" rx="6.5" transform=${'rotate(' + angle + ')'}/>`)}
    </g>`],
  ['telegram', 'telegram', svg`<circle cx="32" cy="32" r="28" fill="#2aabee"/>
    <path d="M16.5 31.2 44.8 20c1.3-.5 2.5.3 2.1 2.2l-4.8 22.6c-.3 1.6-1.3 2-2.6 1.2l-7.3-5.4-3.5 3.4c-.4.4-.7.7-1.5.7l.5-7.4 13.5-12.2c.6-.5-.1-.8-.9-.3L23.6 35.3l-7.2-2.2c-1.6-.5-1.6-1.5.1-1.9z" fill="#fff"/>`],
  ['code', 'код', svg`<rect x="4" y="12" width="56" height="40" rx="12" fill="#1d1f24"/>
    <path d="m23 24-8 8 8 8M41 24l8 8-8 8M35 21l-6 22" fill="none" stroke="#7cf29c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`],
  ['notion', 'notion', svg`<rect x="8" y="8" width="48" height="48" rx="10" fill="#fff" stroke="#111" stroke-width="3.5"/>
    <path d="M22 44V20h3.6L39 38V20h3v24h-3.4L25 26v18z" fill="#111"/>`],
  ['star', 'звезда', svg`<path d="M32 4.5l8.3 17 18.7 2.7-13.5 13.2 3.2 18.6L32 47.2 15.3 56l3.2-18.6L5 24.2l18.7-2.7z" fill="#ffd43b" stroke="#f59f00" stroke-width="2.5" stroke-linejoin="round"/>`],
  ['heart', 'сердце', svg`<path d="M32 56S6 41 6 23.5C6 14.4 13 8 21 8c5 0 9 2.8 11 7 2-4.2 6-7 11-7 8 0 15 6.4 15 15.5C58 41 32 56 32 56z" fill="#ff4d6d"/><ellipse cx="19" cy="20" rx="5" ry="3.2" fill="#fff" opacity=".55" transform="rotate(-35 19 20)"/>`],
  ['fire', 'огонь', svg`<path d="M32 4c3 12 18 17 18 33a18 18 0 0 1-36 0c0-9 5-14 9-18 0 6 3 10 6 11-2-9 0-18 3-26z" fill="#ff6b1a"/>
    <path d="M32 30c2 6 9 8 9 16a9 9 0 0 1-18 0c0-5 3-8 5-10 0 3 2 5 3 5-1-4 0-8 1-11z" fill="#ffd43b"/>`],
  ['bolt', 'молния', svg`<circle cx="32" cy="32" r="28" fill="#7048e8"/><path d="M35 8 17 36h13l-3 20 20-30H34z" fill="#ffe066" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`],
  ['hundred', '100', svg`<g fill="none" stroke="#f03e3e" stroke-linecap="round" stroke-linejoin="round" stroke-width="5">
      <path d="M10 18v24M22 20c-4 0-5 5-5 11s1 11 5 11 5-5 5-11-1-11-5-11zM38 20c-4 0-5 5-5 11s1 11 5 11 5-5 5-11-1-11-5-11z" transform="skewX(-10) translate(8 0)"/>
      <path d="M9 50c14-3 32-3 46-1M13 56c12-2 26-2 38-1" stroke-width="3.5"/>
    </g>`],
  ['smile', 'смайл', svg`<circle cx="32" cy="32" r="27" fill="#ffd43b" stroke="#f59f00" stroke-width="2.5"/>
    <ellipse cx="23" cy="26" rx="3.5" ry="5" fill="#2b2b2b"/><ellipse cx="41" cy="26" rx="3.5" ry="5" fill="#2b2b2b"/>
    <path d="M19 37c5 8 21 8 26 0" fill="none" stroke="#2b2b2b" stroke-width="4" stroke-linecap="round"/>`],
];

const empty = svg``;
const art = new Map(stickers.map(([type, , drawing]) => [type, drawing]));

export function stickerArt(type) {
  return svg`<svg viewBox="0 0 64 64" aria-hidden="true">${art.get(type) ?? empty}</svg>`;
}

// Новый стикер ложится в свободное место справа и сверху, где нет чипа и имени, с небольшим случайным поворотом.
export function placeSticker(type, existing, random = Math.random) {
  const spots = [[74, 26], [88, 50], [58, 22], [70, 52], [90, 14], [42, 20], [56, 46], [88, 78], [30, 18], [76, 74], [44, 46], [62, 76]];
  const free = spots.find(([x, y]) => existing.every((item) => Math.hypot(item.x - x, item.y - y) > 14)) ?? spots[existing.length % spots.length];
  return { type, x: free[0], y: free[1], rotate: Math.round((random() - .5) * 36), scale: 1 };
}

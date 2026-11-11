import { LitElement, css, html } from 'lit';

function property(value) {
  return { a: 0, k: value };
}

function keyframes(frames) {
  return { a: 1, k: frames.map(([time, start], index) => ({
    t: time, s: start,
    ...(index < frames.length - 1 ? { i: { x: 0.25, y: 1 }, o: { x: 0.25, y: 0 } } : {}),
  })) };
}

function burst(color, compact, orbit) {
  const palette = color === 'purple'
    ? [[0.59, 0.34, 0.95], [0.85, 0.65, 1], [0.43, 0.3, 0.89]]
    : [[0.39, 0.68, 0.2], [0.68, 0.89, 0.26], [0.26, 0.6, 0.47]];
  return {
    v: '5.13.0', fr: 60, ip: 0, op: compact ? 38 : 92, w: 280, h: 280, assets: [],
    layers: [
      ...(!compact && !orbit ? [wave(palette[0]), checkmark(palette[2])] : []),
      ...palette.flatMap((fill, ring) => Array.from({ length: orbit ? 2 : compact ? 4 : 7 }, (_, index) => {
      const angle = (index / (orbit ? 3 : 7) + ring / 9) * Math.PI * 2;
      const point = (distance) => [140 + Math.cos(angle) * distance, 140 + Math.sin(angle) * distance, 0];
      return {
        ty: 4, ind: ring * 7 + index + 1, ip: 0, op: 75, st: 0, sr: 1,
        ks: {
          o: keyframes([[0, [0]], [8, [100]], [36, [100]], [72, [0]]]),
          r: keyframes([[0, [index * 27]], [65, [index * 27 + 210]]]), a: property([0, 0, 0]),
          p: keyframes([[0, point(22)], [25, point(80 + ring * 15)], [72, point(118 + ring * 8)]]),
          s: keyframes([[0, [5, 5, 100]], [19, [100, 100, 100]], [72, [25, 25, 100]]]),
        },
        shapes: [
          { ty: 'el', p: property([0, 0]), s: property(compact ? [9, 9] : [13 + ring * 6, index % 2 ? 13 : 27]) },
          { ty: 'fl', c: property([...fill, 1]), o: property(100), r: 1 },
          { ty: 'el', p: property([-2, -4]), s: property([5, 4]) },
          { ty: 'fl', c: property([1, 1, 1, 1]), o: property(55), r: 1 },
        ],
      };
    }))],
  };
}

function wave(color) {
  return {
    ty: 4, ind: 80, ip: 0, op: 90, st: 0, sr: 1,
    ks: {
      o: keyframes([[0, [0]], [14, [80]], [53, [0]]]),
      r: property(0), a: property([0, 0, 0]), p: property([140, 140, 0]),
      s: keyframes([[0, [12, 12, 100]], [54, [121, 121, 100]]]),
    },
    shapes: [
      { ty: 'el', p: property([0, 0]), s: property([215, 215]) },
      { ty: 'st', c: property([...color, 1]), o: property(72), w: property(8), lc: 2, lj: 2 },
    ],
  };
}

function checkmark(color) {
  return {
    ty: 4, ind: 81, ip: 24, op: 91, st: 0, sr: 1,
    ks: {
      o: keyframes([[24, [0]], [36, [100]], [70, [100]], [90, [0]]]),
      r: property(0), a: property([0, 0, 0]), p: property([140, 140, 0]),
      s: keyframes([[24, [25, 25, 100]], [46, [112, 112, 100]], [58, [100, 100, 100]]]),
    },
    shapes: [
      { ty: 'sh', ks: property({ c: false, v: [[-16, 0], [-5, 12], [17, -12]], i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]] }) },
      { ty: 'st', c: property([1, 1, 1, 1]), o: property(100), w: property(5), lc: 2, lj: 2 },
      { ty: 'el', p: property([0, 0]), s: property([64, 64]) },
      { ty: 'fl', c: property([...color, 1]), o: property(100), r: 1 },
    ],
  };
}

class SkillCelebration extends LitElement {
  static properties = { color: { type: String }, compact: { type: Boolean }, orbit: { type: Boolean } };
  static styles = css`
    :host { display: block; pointer-events: none; }
    div { width: 100%; height: 100%; }
  `;

  render() { return html`<div aria-hidden="true"></div>`; }

  async firstUpdated() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { default: lottie } = await import('lottie-web/build/player/lottie_light_canvas.js');
    if (!this.isConnected) return;
    this.animation = lottie.loadAnimation({
      container: this.renderRoot.querySelector('div'), renderer: 'canvas',
      animationData: burst(this.color, this.compact, this.orbit), loop: false, autoplay: true,
    });
  }

  disconnectedCallback() {
    this.animation?.destroy();
    super.disconnectedCallback();
  }
}

customElements.define('skill-celebration', SkillCelebration);

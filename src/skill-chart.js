import { LitElement, html } from 'lit';
import { gsap } from 'gsap';

export class SkillChart extends LitElement {
  static properties = {
    levels: { attribute: false },
    color: { type: String },
    active: { type: Number },
    featured: { type: Boolean },
  };

  constructor() {
    super();
    this.levels = [];
    this.color = 'green';
    this.active = -1;
    this.featured = false;
  }

  createRenderRoot() { return this; }

  render() {
    return html`<canvas width="420" height="420" aria-hidden="true"></canvas>`;
  }

  updated(changed) {
    const previous = changed.get('levels');
    const newLevels = changed.has('levels') && (
      !previous || previous.length !== this.levels.length ||
      previous.some((level, index) => level !== this.levels[index])
    );
    if (newLevels || changed.has('color')) {
      this.animation?.kill();
      const state = { progress: 0 };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.draw(1);
        return;
      }
      this.animation = gsap.to(state, {
        progress: 1,
        duration: 0.72,
        ease: 'back.out(0.85)',
        onUpdate: () => this.draw(state.progress),
        onComplete: () => { this.animation = undefined; },
      });
    } else if (!this.animation) {
      this.draw(1);
    }
  }

  disconnectedCallback() {
    this.animation?.kill();
    this.animation = undefined;
    super.disconnectedCallback();
  }

  draw(progress) {
    const canvas = this.querySelector('canvas');
    const context = canvas.getContext('2d');
    const size = 420;
    const center = size / 2;
    const maxRadius = 188;
    const purple = this.color === 'purple';
    const gap = this.featured ? 0.013 : 0.033;
    const step = (Math.PI * 2) / Math.max(1, this.levels.length);
    context.clearRect(0, 0, size, size);
    context.strokeStyle = this.featured ? '#c6d1cb8f' : purple ? '#cdbbe5' : '#cbdab7';
    context.lineWidth = this.featured ? 2.1 : 1.6;
    for (const scale of [0.25, 0.5, 0.75, 1]) {
      context.beginPath();
      context.arc(center, center, maxRadius * scale, 0, Math.PI * 2);
      context.stroke();
    }
    for (const [index, level] of this.levels.entries()) {
      const start = -Math.PI / 2 + step * index;
      const end = start + step;
      context.beginPath();
      context.moveTo(center, center);
      context.lineTo(center + Math.cos(start) * maxRadius, center + Math.sin(start) * maxRadius);
      context.stroke();

      if (level === null || level <= 0) continue;
      const radius = maxRadius * level / 100 * progress;
      const fill = context.createRadialGradient(center, center, 0, center, center, maxRadius);
      fill.addColorStop(0, purple ? '#ead4ff' : '#d9fa9f');
      fill.addColorStop(0.65, purple ? '#a66afa' : '#90ed49');
      fill.addColorStop(1, purple ? '#8b43ed' : '#72df2b');
      context.fillStyle = fill;
      context.globalAlpha = this.active < 0 || this.active === index ? 1 : 0.38;
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, radius, start + gap, end - gap);
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
      if (this.featured && level >= 75 && progress >= 0.98 && (this.active < 0 || this.active === index)) {
        const angle = (start + end) / 2;
        const x = center + Math.cos(angle) * radius * .93;
        const y = center + Math.sin(angle) * radius * .93;
        context.beginPath();
        context.fillStyle = purple ? '#ae70fb' : '#83e744';
        context.arc(x, y, 13, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.strokeStyle = '#fff';
        context.lineWidth = 2.8;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.moveTo(x - 4, y);
        context.lineTo(x - 1, y + 3);
        context.lineTo(x + 5, y - 4);
        context.stroke();
        context.strokeStyle = '#c6d1cb8f';
        context.lineWidth = 2.1;
      }
    }
    context.beginPath();
    context.fillStyle = purple ? '#8a56ef' : '#4c911b';
    context.arc(center, center, 5, 0, Math.PI * 2);
    context.fill();
  }
}

customElements.define('skill-chart', SkillChart);

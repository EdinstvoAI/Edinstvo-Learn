import { LitElement, html, nothing } from 'lit';
import { gsap } from 'gsap';

export class SkillChart extends LitElement {
  static properties = {
    levels: { attribute: false },
    color: { type: String },
    active: { type: Number },
    featured: { type: Boolean },
    growth: { attribute: false },
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
    return html`${this.featured ? html`<canvas class="chart-grid" width="420" height="420" aria-hidden="true"></canvas>` : nothing}
      <canvas class="chart-fill" width="420" height="420" aria-hidden="true"></canvas>`;
  }

  updated(changed) {
    if (this.growth || changed.has('growth')) {
      this.animation?.kill();
      this.animation = undefined;
      this.draw(1, this.growthFrame ?? 0);
      return;
    }
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

  showGrowth(frame) {
    this.growthFrame = frame;
    this.draw(1, frame);
  }

  draw(progress, frame = 0) {
    const context = this.querySelector('.chart-fill').getContext('2d');
    const grid = this.querySelector('.chart-grid')?.getContext('2d') ?? context;
    const size = 420;
    const center = size / 2;
    const maxRadius = 188;
    const purple = this.color === 'purple';
    const gap = this.featured ? 0.013 : 0.033;
    const step = (Math.PI * 2) / Math.max(1, this.levels.length);
    context.clearRect(0, 0, size, size);
    if (grid !== context) grid.clearRect(0, 0, size, size);
    grid.strokeStyle = this.featured ? '#c6d1cb8f' : purple ? '#cdbbe5' : '#cbdab7';
    grid.lineWidth = this.featured ? 2.1 : 1.6;
    for (const scale of [0.25, 0.5, 0.75, 1]) {
      grid.beginPath();
      grid.arc(center, center, maxRadius * scale, 0, Math.PI * 2);
      grid.stroke();
    }
    for (const [index, level] of this.levels.entries()) {
      const start = -Math.PI / 2 + step * index;
      const end = start + step;
      grid.beginPath();
      grid.moveTo(center, center);
      grid.lineTo(center + Math.cos(start) * maxRadius, center + Math.sin(start) * maxRadius);
      grid.stroke();

      const growth = this.growth?.index === index ? this.growth : null;
      const rise = Math.max(0, Math.min(1, (frame - 390) / 110));
      const visible = growth ? growth.from + (growth.to - growth.from) * (1 - (1 - rise) ** 3) : level;
      if (visible === null || visible <= 0) continue;
      const radius = maxRadius * visible / 100 * progress;
      const facet = growth ? Math.min(rise * 3, 1) * Math.max(0, Math.min(1, (675 - frame) / 72)) : 0;
      const fill = context.createRadialGradient(center, center, 0, center, center, maxRadius);
      fill.addColorStop(0, purple ? '#ead4ff' : '#d9fa9f');
      fill.addColorStop(0.65, purple ? '#a66afa' : '#90ed49');
      fill.addColorStop(1, purple ? '#8b43ed' : '#72df2b');
      if (facet > 0) {
        context.save();
        context.translate(0, 6 * facet);
        context.fillStyle = purple ? '#6d30b7' : '#5e9d22';
        context.globalAlpha = facet * .85;
        context.beginPath();
        context.moveTo(center, center);
        context.arc(center, center, radius, start + gap, end - gap);
        context.closePath();
        context.fill();
        context.restore();
      }
      context.fillStyle = fill;
      context.globalAlpha = this.active < 0 || this.active === index ? 1 : 0.38;
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, radius, start + gap, end - gap);
      context.closePath();
      context.fill();
      if (facet > 0) {
        context.fillStyle = purple ? '#b95dff' : '#b6ff35';
        context.globalAlpha = facet * .54;
        context.fill();
      }
      context.globalAlpha = 1;
    }
    context.beginPath();
    context.fillStyle = purple ? '#8a56ef' : '#4c911b';
    context.arc(center, center, 5, 0, Math.PI * 2);
    context.fill();
  }
}

customElements.define('skill-chart', SkillChart);

import { LitElement, css, html } from 'lit';
import { decreaseSettleFrame, skillDecreaseScene } from './lottie-scenes.js';

let scene;
export class SkillGrowth extends LitElement {
  static properties = { growth: { attribute: false }, sectors: { type: Number } };
  static styles = css`
    :host { position: absolute; inset: 0; display: block; pointer-events: none; }
    div { width: 100%; height: 100%; }
  `;

  render() { return html`<div aria-hidden="true"></div>`; }

  async firstUpdated() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.finish();
      return;
    }
    const decreasing = this.growth.to < this.growth.from;
    try {
      if (!decreasing) {
        scene ??= fetch('/motion/skill-growth.json').then((response) => {
          if (!response.ok) throw new Error('Animation unavailable');
          return response.json();
        }).catch((error) => { scene = undefined; throw error; });
      }
      const [{ default: lottie }, asset] = await Promise.all([
        import('lottie-web/build/player/lottie_light_canvas.js'), decreasing ? null : scene,
      ]);
      if (!this.isConnected) return;
      const animationData = decreasing ? skillDecreaseScene(this.growth, this.sectors) : structuredClone(asset);
      if (!decreasing) {
        const badge = animationData.layers.find((layer) => layer.nm.startsWith('Check lands'));
        const angle = -Math.PI / 2 + (this.growth.index + .5) * 2 * Math.PI / this.sectors;
        const radius = 188 * this.growth.to / 100 * .94;
        badge.ks.p.k = [210 + Math.cos(angle) * radius - 315.71, 210 + Math.sin(angle) * radius - 180.02, 0];
      }
      this.player = lottie.loadAnimation({
        container: this.renderRoot.querySelector('div'), renderer: 'canvas',
        animationData, loop: false, autoplay: false,
      });
      this.player.addEventListener('enterFrame', ({ currentTime }) => {
        // Диаграмма меняет уровень между кадрами 390 и 500.
        this.showFrame(decreasing ? 390 + 110 * Math.min(1, currentTime / decreaseSettleFrame) : currentTime);
      });
      if (!decreasing) this.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
      this.player.addEventListener('complete', async () => {
        if (!decreasing) {
          await this.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
        }
        if (this.isConnected) this.finish();
      });
      this.player.addEventListener('data_failed', () => this.finish(false));
      this.player.play();
    } catch {
      if (this.isConnected) this.finish(false);
    }
  }

  showFrame(frame) {
    this.dispatchEvent(new CustomEvent('growth-frame', { detail: frame }));
  }

  finish(seen = true) {
    this.dispatchEvent(new CustomEvent('growth-end', { detail: seen }));
  }

  disconnectedCallback() {
    this.player?.destroy();
    super.disconnectedCallback();
  }
}
customElements.define('skill-growth', SkillGrowth);

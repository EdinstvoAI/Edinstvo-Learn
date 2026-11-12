import { LitElement, html } from 'lit';

class HomeBackdrop extends LitElement {
  createRenderRoot() { return this; }

  render() {
    return html`<img class="mobile-home-paper" src="/mobile-home/background.png" alt="">
      <img class="mobile-home-chrome-export" src="/mobile-home/chrome-export.png" alt="">
      <div class="mobile-home-shader"></div>`;
  }

  async firstUpdated() {
    if (!navigator.gpu || typeof globalThis.CanvasRenderingContext2D?.prototype.drawElementImage !== 'function') return;
    try {
      const { mountFigmaChrome } = await import('./figma-effects/background.js');
      if (this.isConnected) this.unmountShader = mountFigmaChrome(this.querySelector('.mobile-home-shader'));
    } catch (error) {
      console.warn('Figma background:', error.message);
    }
  }

  disconnectedCallback() {
    this.unmountShader?.();
    super.disconnectedCallback();
  }
}

customElements.define('home-backdrop', HomeBackdrop);

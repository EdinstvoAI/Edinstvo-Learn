import { LitElement, css, html } from 'lit';
import { objectCover, objectScene, objectSegment } from './object-scene.js';

let asset;

// kind: cheer — пролёт объектов на рубеже теста, finale — крупный пролёт, под которым экран переходит к результату.
// При уменьшенном движении сцена не играет, а события cover и end приходят сразу.
class AssessmentScene extends LitElement {
  static properties = { kind: { type: String } };
  static styles = css`
    :host { display: block; pointer-events: none; overflow: hidden; }
    div { width: 100%; height: 100%; }
  `;

  render() { return html`<div aria-hidden="true"></div>`; }

  emit(name) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  async firstUpdated() {
    try {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) throw new Error('reduced motion');
      asset ??= fetch('/motion/skill-growth.json').then((response) => {
        if (!response.ok) throw new Error('Animation unavailable');
        return response.json();
      }).catch((error) => { asset = undefined; throw error; });
      const [{ default: lottie }, data] = await Promise.all([import('lottie-web/build/player/lottie_light_canvas.js'), asset]);
      if (!this.isConnected) return;
      this.animation = lottie.loadAnimation({
        container: this.renderRoot.querySelector('div'), renderer: 'canvas', loop: false, autoplay: false,
        animationData: objectScene(data),
        // Финал заполняет экран по высоте: объекты крупные и пролетают через весь экран.
        rendererSettings: { preserveAspectRatio: this.kind === 'finale' ? 'xMidYMid slice' : 'xMidYMid meet' },
      });
      let covered = false;
      this.animation.addEventListener('enterFrame', ({ currentTime }) => {
        if (!covered && currentTime >= objectCover - objectSegment[0]) {
          covered = true;
          this.emit('scene-cover');
        }
      });
      this.animation.addEventListener('complete', () => {
        if (!covered) this.emit('scene-cover');
        this.emit('scene-end');
      });
      this.animation.playSegments(objectSegment, true);
    } catch {
      if (!this.isConnected) return;
      this.emit('scene-cover');
      this.emit('scene-end');
    }
  }

  disconnectedCallback() {
    this.animation?.destroy();
    super.disconnectedCallback();
  }
}

customElements.define('assessment-scene', AssessmentScene);

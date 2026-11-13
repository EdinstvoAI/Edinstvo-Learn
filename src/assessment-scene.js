import { LitElement, css, html } from 'lit';
import { burstScene, finaleCover, finaleScene } from './lottie-scenes.js';

let library;

// kind: cheer — влёт на рубеже теста, strong — усиленный после 20-го вопроса, finale — переход к результату.
// При уменьшенном движении сцена не играет, а события cover и end приходят сразу.
class AssessmentScene extends LitElement {
  static properties = { kind: { type: String } };
  static styles = css`
    :host { display: block; pointer-events: none; }
    div { width: 100%; height: 100%; }
  `;

  render() { return html`<div aria-hidden="true"></div>`; }

  emit(name) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  async firstUpdated() {
    const finale = this.kind === 'finale';
    try {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) throw new Error('reduced motion');
      if (finale) {
        library ??= fetch('/motion/assessment-objects.json').then((response) => {
          if (!response.ok) throw new Error('Animation unavailable');
          return response.json();
        }).catch((error) => { library = undefined; throw error; });
      }
      const [{ default: lottie }, objects] = await Promise.all([
        import('lottie-web/build/player/lottie_light_canvas.js'), finale ? library : null,
      ]);
      if (!this.isConnected) return;
      this.animation = lottie.loadAnimation({
        container: this.renderRoot.querySelector('div'), renderer: 'canvas', loop: false, autoplay: false,
        animationData: finale ? finaleScene(objects) : burstScene(this.kind === 'strong'),
        rendererSettings: { preserveAspectRatio: 'xMidYMid slice' },
      });
      let covered = false;
      this.animation.addEventListener('enterFrame', ({ currentTime }) => {
        if (!covered && currentTime >= finaleCover) {
          covered = true;
          this.emit('scene-cover');
        }
      });
      this.animation.addEventListener('complete', () => {
        if (!covered) this.emit('scene-cover');
        this.emit('scene-end');
      });
      this.animation.play();
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

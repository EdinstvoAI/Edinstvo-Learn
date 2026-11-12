import { LitElement, html, nothing } from 'lit';

class MentorNote extends LitElement {
  static properties = {
    note: { attribute: false },
    opened: { type: Boolean },
    animateReveal: { state: true },
  };

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    this.resizeObserver = new ResizeObserver(() => this.paintCover());
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    super.disconnectedCallback();
  }

  firstUpdated() { this.paintCover(); }

  render() {
    return html`
      <div class="note-paper">
        <div class="note-content" tabindex="-1" aria-hidden=${!this.opened}>
          <span>${this.note.skill}</span>
          <p>${this.note.reason}</p>
        </div>
        ${this.opened ? nothing : html`<canvas aria-hidden="true"
          @pointerdown=${this.start}
          @pointermove=${this.erase}
          @pointerup=${this.finish}
          @pointercancel=${() => { this.pointer = null; }}></canvas>`}
        ${this.animateReveal && this.opened ? html`<skill-celebration class="note-eraser" eraser aria-hidden="true"></skill-celebration>` : nothing}
      </div>
      ${this.opened ? html`<p class="visually-hidden" role="status">Комментарий открыт.</p>`
        : html`<button class="text-button note-open" @click=${this.reveal}>Открыть комментарий</button>`}
    `;
  }

  paintCover() {
    const canvas = this.querySelector('canvas');
    if (!canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    const w = Math.round(width);
    const h = Math.round(height);
    if (!w || !h || (canvas.dataset.painted && canvas.width === w && canvas.height === h)) return;

    canvas.width = w;
    canvas.height = h;
    canvas.dataset.painted = 'true';
    this.pointer = null;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const shade = context.createLinearGradient(0, 0, w, h);
    shade.addColorStop(0, '#efecfa');
    shade.addColorStop(1, '#e6e0f4');
    context.fillStyle = shade;
    context.fillRect(0, 0, w, h);
    context.strokeStyle = '#7462a1';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(w / 2 - 21, h / 2 - 16);
    context.lineTo(w / 2 - 5, h / 2 - 29);
    context.lineTo(w / 2 - 14, h / 2 - 9);
    context.lineTo(w / 2 + 8, h / 2 - 28);
    context.lineTo(w / 2 + 4, h / 2 - 13);
    context.lineTo(w / 2 + 19, h / 2 - 22);
    context.stroke();
    context.fillStyle = '#4f4268';
    context.textAlign = 'center';
    context.font = '14px "Martian Grotesk", sans-serif';
    context.fillText('Сотри, чтобы прочитать', w / 2, h / 2 + 14);
  }

  start(event) {
    if (!event.isPrimary || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    this.pointer = { id: event.pointerId, x: event.offsetX, y: event.offsetY };
  }

  erase(event) {
    if (this.pointer?.id !== event.pointerId) return;
    const context = event.currentTarget.getContext('2d');
    context.globalCompositeOperation = 'destination-out';
    context.lineCap = 'round';
    context.lineWidth = 36;
    context.beginPath();
    context.moveTo(this.pointer.x, this.pointer.y);
    context.lineTo(event.offsetX, event.offsetY);
    context.stroke();
    this.pointer = { id: event.pointerId, x: event.offsetX, y: event.offsetY };
  }

  finish(event) {
    if (this.pointer?.id !== event.pointerId) return;
    this.pointer = null;
    const canvas = event.currentTarget;
    const { width, height } = canvas;
    const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let clear = 0;
    let total = 0;
    for (let y = 4; y < height; y += 8) {
      for (let x = 4; x < width; x += 8) {
        total += 1;
        if (pixels[(y * width + x) * 4 + 3] < 64) clear += 1;
      }
    }
    if (clear / total >= .25) this.reveal();
  }

  reveal(event) {
    this.animateReveal = true;
    this.dispatchEvent(new Event('note-opened'));
    if (event?.type === 'click') requestAnimationFrame(() => this.querySelector('.note-content')?.focus());
  }
}

customElements.define('mentor-note', MentorNote);

import { LitElement, html, svg, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { keyed } from 'lit/directives/keyed.js';
import '@edinstvo/glass/define';
import '@edinstvo/glass/glass.css';
import './skill-chart.js';
import './celebration.js';
import { softSkills } from './skills.js';
import { questions } from './questions.js';
import { encodePhoto, request, telegramData } from './api.js';
import './style.css';

const sections = [
  ['home', 'Главная', 'M3.4 10.7 10.5 4a2.2 2.2 0 0 1 3 0l7.1 6.7v8a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z M9 20.6v-5.2a3 3 0 0 1 6 0v5.2'],
  ['calendar', 'Календарь', 'M5 5.8h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z M7 3.2v5 M17 3.2v5 M3 11h18 M8 15.7h2m4 0h2'],
  ['projects', 'Проекты', 'M4.3 6h5.4l2 2.1h7.8a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2H4.3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M7 13.4h7'],
  ['profile', 'Профиль', 'M12 11.8a4.1 4.1 0 1 1 0-8.2 4.1 4.1 0 0 1 0 8.2z M5 20.5v-1.1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1.1z'],
];

const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const dayLabel = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const parseDate = (date) => new Date(date + 'T12:00:00Z');
const formatDate = (date) => date.toISOString().slice(0, 10);
const defaultLayers = { cover: 'sky', stickers: true, projects: true };
const emptySoft = softSkills.map(() => null);
const shortSoftLabels = [
  'Крит. мышление', 'Аналитика', 'Общение', 'Команда', 'Самостоят.',
  'Адаптация', 'Рефлексия', 'Инициатива', 'Обратная связь', 'Самоорганиз.',
];
const today = () => {
  const date = new Date();
  return formatDate(new Date(date.getTime() - date.getTimezoneOffset() * 60_000));
};
const emptyProfile = { soft: null, hard: [], projects: [], photos: [] };

class LearnApp extends LitElement {
  static properties = {
    page: { state: true },
    account: { state: true },
    bootStatus: { state: true },
    bootError: { state: true },
    accessCode: { state: true },
    personId: { state: true },
    people: { state: true },
    tasks: { state: true },
    date: { state: true },
    selections: { state: true },
    modal: { state: true },
    answers: { state: true },
    pendingAnswer: { state: true },
    assessmentStatus: { state: true },
    formError: { state: true },
    celebration: { state: true },
    photoError: { state: true },
    formBusy: { state: true },
    activeWheel: { state: true },
    activeSector: { state: true },
    motionState: { state: true },
    navMotion: { state: true },
    wheelMotion: { state: true },
  };

  constructor() {
    super();
    this.page = 'home';
    this.account = null;
    this.bootStatus = 'loading';
    this.bootError = '';
    this.accessCode = '';
    this.personId = null;
    this.people = [];
    this.tasks = [];
    this.date = today();
    this.selections = {};
    this.modal = null;
    this.answers = [];
    this.pendingAnswer = null;
    this.assessmentStatus = 'intro';
    this.formError = '';
    this.celebration = null;
    this.photoError = '';
    this.formBusy = false;
    this.activeWheel = 0;
    this.activeSector = -1;
    this.wheelMotion = 0;
    this.motionState = typeof globalThis.DeviceOrientationEvent?.requestPermission === 'function' ? 'ask' : 'ready';
    this.orientWheel = (event) => this.onOrientation(event);
    this.onMotionGesture = (event) => {
      if (this.motionState === 'ask' && event.pointerType === 'touch') void this.enableMotion();
    };
    this.onPageScroll = () => {
      if (this.page !== 'home' || this.scrollFrame) return;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = 0;
        this.updateHomeSheet();
      });
    };
  }

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('deviceorientation', this.orientWheel);
    window.addEventListener('scroll', this.onPageScroll, { passive: true });
    this.addEventListener('pointerup', this.onMotionGesture);
  }

  disconnectedCallback() {
    window.removeEventListener('deviceorientation', this.orientWheel);
    window.removeEventListener('scroll', this.onPageScroll);
    this.removeEventListener('pointerup', this.onMotionGesture);
    if (this.telegramOrientation) {
      window.Telegram.WebApp.offEvent('deviceOrientationChanged', this.telegramOrientation);
      window.Telegram.WebApp.DeviceOrientation.stop();
    }
    cancelAnimationFrame(this.scrollFrame);
    clearInterval(this.codeTimer);
    super.disconnectedCallback();
  }

  firstUpdated() {
    const fragment = new URLSearchParams(location.hash.slice(1));
    this.localToken = fragment.get('setup');
    this.localStudent = fragment.get('student');
    if (this.localToken) history.replaceState(null, '', location.pathname + location.search);
    void this.boot();
  }

  async boot() {
    this.bootStatus = 'loading';
    this.bootError = '';
    try {
      let state = this.localToken
        ? await request(this.localStudent ? '/local/student' : '/local', { token: this.localToken, name: this.localStudent })
        : await request('/state');
      this.localToken = null;
      if (!state.account && state.telegram) {
        const initData = await telegramData();
        if (initData) state = await request('/telegram', { initData });
      }
      if (state.telegram && window.Telegram?.WebApp?.initData) this.useTelegramOrientation();
      this.applyState(state);
      this.bootStatus = 'ready';
      if (this.role === 'mentor') this.go('students');
      if (this.role === 'mentee' && !this.account.pending && !this.person.soft) this.go('assessment');
    } catch (error) {
      this.bootError = error.message;
      this.bootStatus = 'error';
    }
  }

  applyState(state) {
    this.account = state.account;
    this.people = state.people;
    this.tasks = state.tasks;
    if (!this.people.some((person) => person.id === this.personId)) this.personId = this.people[0]?.id ?? null;
  }

  async refresh() {
    this.applyState(await request('/state'));
  }

  get role() {
    return this.account?.role;
  }

  get person() {
    return this.people.find((person) => person.id === this.personId) ?? emptyProfile;
  }

  selectPerson(id) {
    this.personId = id;
    this.selections = {};
    this.celebration = null;
    this.activeWheel = 0;
    this.activeSector = -1;
    this.neutralOrientation = null;
  }

  mutate(action, data) {
    return request('/people/' + this.personId + '/' + action, data);
  }

  async activate(event) {
    event.preventDefault();
    if (this.formBusy) return;
    this.bootError = '';
    this.formBusy = true;
    try {
      this.applyState(await request('/activate', { code: new FormData(event.currentTarget).get('code') }));
      this.go(this.person.soft ? 'home' : 'assessment');
    } catch (error) {
      this.bootError = error.message;
    } finally {
      this.formBusy = false;
    }
  }

  async loadCode() {
    try {
      this.accessCode = (await request('/access-code')).code;
      this.formError = '';
    } catch (error) {
      this.formError = error.message;
    }
  }

  get personTasks() {
    return this.tasks.filter((task) => task.person === this.personId);
  }

  go(page) {
    if (this.role === 'mentee' && !this.account.pending && !this.person.soft) page = 'assessment';
    if (page === this.page) {
      if (page === 'home') window.scrollTo(0, 0);
      if (page === 'students') void this.refresh().catch(() => {});
      return;
    }
    this.page = page;
    clearInterval(this.codeTimer);
    if (page === 'account') {
      void this.loadCode();
      this.codeTimer = setInterval(() => this.loadCode(), 15_000);
    }
    if (page === 'students') {
      const updateStudents = () => this.refresh().catch(() => {});
      void updateStudents();
      this.codeTimer = setInterval(updateStudents, 15_000);
    }
    this.celebration = null;
    window.scrollTo(0, 0);
    this.updateHomeSheet();
  }

  updateHomeSheet() {
    if (this.page !== 'home') return;
    const masthead = this.querySelector('.home-masthead');
    const distance = masthead?.offsetHeight || 74;
    const progress = Math.min(1, Math.max(0, window.scrollY / distance));
    this.style.setProperty('--sheet-progress', progress);
  }

  nav() {
    return html`<nav class="nav" aria-label="Разделы">
      ${sections.map(([id, title, icon]) => html`
        <button class=${this.page === id ? 'active' : ''} aria-current=${this.page === id ? 'page' : nothing}
          @click=${() => { this.navMotion = id; this.go(id); }}>
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <defs><linearGradient id=${'nav-gel-' + id} x2="0" y2="1">
                <stop offset="0" stop-color="#ecffb7"></stop><stop offset="1" stop-color="#9fda47"></stop>
              </linearGradient></defs>
              ${svg`<path class="nav-fill" d=${icon} fill=${'url(#nav-gel-' + id + ')'}></path>
                <path class="nav-line" d=${icon} pathLength="1" stroke="currentColor" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round"></path>`}
            </svg>
            ${this.page === id && this.navMotion === id ? html`<skill-celebration class="nav-burst" color="green" compact></skill-celebration>` : nothing}
          </span><span>${title}</span>
        </button>`)}
    </nav>`;
  }

  wordmark() {
    return html`<div class="home-masthead">
      <div class="wordmark" aria-label="Единство Learn" role="img">
        <img class="wordmark-name" src="/edinstvo-wordmark.svg" alt="">
        <img class="wordmark-learn" src="/learn-wordmark.svg" alt="">
      </div>
    </div>`;
  }

  render() {
    if (this.bootStatus !== 'ready' || !this.account || this.account.pending) {
      return html`<main class="sign-in">
        ${this.wordmark()}
        ${this.bootStatus === 'loading' ? html`<p role="status">Открываем пространство…</p>`
          : this.account?.pending ? html`<form @submit=${(event) => this.activate(event)}>
            <h1>Твой код доступа</h1><p>Возьми сегодняшний код у ментора.</p>
            <label>Код<input name="code" inputmode="numeric" autocomplete="one-time-code" required pattern="[0-9]{6}" maxlength="6"></label>
            <button class="primary" type="submit" ?disabled=${this.formBusy}>Продолжить</button>
          </form>`
          : this.bootStatus === 'ready' ? html`<p>Открой Единство Learn через Telegram.</p>` : nothing}
        ${this.bootError ? html`<p class="form-error" role="alert">${this.bootError}</p>
          ${this.bootStatus === 'error' ? html`<button class="text-button" @click=${() => this.boot()}>Повторить</button>` : nothing}` : nothing}
      </main>`;
    }
    const isHome = this.page === 'home';
    const screen = {
      home: () => this.home(), profile: () => this.profile(), skills: () => this.skills(),
      students: () => this.students(), account: () => this.adminAccount(),
      calendar: () => this.calendar(), projects: () => this.projects(), assessment: () => this.assessment(),
    };
    return html`
      <main class=${isHome ? 'home-main' : ''}>
        ${isHome ? this.wordmark() : nothing}
        ${this.role === 'mentor' ? html`<header class="admin-bar">
          <button class="text-button" @click=${() => this.go('students')}>Ученики</button>
          <button class="text-button" @click=${() => this.go('account')}>Мой кабинет</button>
        </header>` : nothing}
        <div class=${isHome ? 'home-sheet' : 'page-content'}>
          <div class="screen" data-page=${this.page}>${screen[this.page]()}</div>
        </div>
      </main>
      ${this.page === 'assessment' || this.role === 'mentor' ? nothing : html`<edinstvo-glass class="mobile-nav" frost="0.35" rim="0" stroke-thickness="0">${this.nav()}</edinstvo-glass>`}
      <dialog aria-labelledby="dialog-title" @cancel=${(event) => {
        if (this.formBusy) event.preventDefault();
      }} @close=${() => { this.modal = null; }}>${this.modal ? this.modalContent() : nothing}</dialog>`;
  }

  students() {
    return html`<section class="students">
      <h1>Ученики</h1>
      ${this.people.length ? html`<div class="student-list">${this.people.map((person) => html`
        <button class="student-row" @click=${() => { this.selectPerson(person.id); this.go('profile'); }}>
          <span class="student-avatar">${person.initials}</span>
          <span><strong>${person.name}</strong><small>${person.pending ? 'Ожидает код' : person.soft ? 'В менторстве' : 'Проходит входной тест'}</small></span>
          <span aria-hidden="true">↗</span>
        </button>`)}</div>` : html`<p class="empty">Здесь появятся ученики, которые откроют бота.</p>
          <button class="text-button" @click=${() => this.go('account')}>Открыть код доступа ↗</button>`}
    </section>`;
  }

  adminAccount() {
    return html`<section class="admin-account">
      <h1>${this.account.name}</h1>
      <div class="code-panel">
        <h2>Код доступа</h2>
        ${this.accessCode ? html`<output>${this.accessCode}</output>
          <button class="text-button" @click=${() => navigator.clipboard.writeText(this.accessCode)}>Скопировать</button>`
          : html`<p>Загружаем код…</p>`}
        <p>Обновляется в полночь по Волгограду.</p>
        ${this.formError ? html`<p role="alert">${this.formError}</p>` : nothing}
      </div>
    </section>`;
  }

  home() {
    const upcoming = this.personTasks.find((task) => !task.done && task.date >= today());
    const firstName = this.account.name.split(/\s+/)[0];
    return html`
      <section class="helper-panel">
        <header class="home-summary">
          <h1>Привет, ${firstName}.</h1>
          <time datetime=${today()}>${dayLabel.format(parseDate(today()))}</time>
        </header>
        ${this.wheelCarousel()}
        ${upcoming ? html`<button class="summary-task" @click=${() => { this.date = upcoming.date; this.go('calendar'); }}>
          <span class="summary-time">${dayLabel.format(parseDate(upcoming.date))}</span>
          <strong>${upcoming.title}</strong>
          <span class="summary-arrow" aria-hidden="true">↗</span>
        </button>` : nothing}
      </section>
      <section class="home-projects">
        <div class="section-line"><h2>Мои проекты</h2>${this.person.projects.length ? html`<button class="text-button" @click=${() => this.go('projects')}>Все проекты ↗</button>` : nothing}</div>
        ${this.person.projects.length ? html`<div class="project-grid">${this.person.projects.map((project) => this.projectCard(project))}</div>`
          : html`<p class="empty">Подключённые проекты появятся здесь.</p>`}
      </section>`;
  }

  profile() {
    const layers = this.person.layers ?? defaultLayers;
    const photos = this.person.photos ?? [];
    return html`
      ${this.role === 'mentor' ? html`<div class="student-actions">
        <button class="text-button" @click=${() => this.go('skills')}>Навыки</button>
        <button class="text-button" @click=${() => this.go('calendar')}>Задачи</button>
        <button class="text-button" @click=${() => this.go('projects')}>Проекты</button>
      </div>` : nothing}
      <div class="profile-layout">
        <section class="profile-card">
          <div class="cover cover-${layers.cover}">
            ${layers.stickers ? html`<span class="cover-sticker sticker-left" aria-hidden="true">✦</span>
              <span class="cover-sticker sticker-right" aria-hidden="true">↗</span>` : nothing}
          </div>
          <div class="identity">
            <div class="avatar" aria-hidden="true">${this.person.initials}</div>
            <h1>${this.person.name}</h1>

            ${this.role === 'mentee' ? html`<div><button class="text-button profile-settings" @click=${() => this.open({ type: 'layers' })}>Настроить профиль</button></div>` : nothing}
          </div>
        </section>
      </div>
      <div class="profile-lower">
        <div>
      <div class="section-line"><h2>Фотодневник</h2>
        ${this.role === 'mentee' ? html`<button class="text-button" @click=${() => this.open({ type: 'photo' })}>+ Добавить фото</button>` : nothing}
      </div>
      <section class="photo-log" aria-label="Фотодневник">
        ${photos.length ? html`<div class="photo-grid">${photos.map((photo) => html`<figure>
          <img src=${photo.url} alt=${photo.caption || 'Фото рабочего процесса'}>
          <figcaption><time datetime=${photo.date}>${dayLabel.format(parseDate(photo.date))}</time>${photo.caption ? html`<br>${photo.caption}` : nothing}</figcaption>
          ${this.role === 'mentee' ? html`<button class="text-button" @click=${() => this.removePhoto(photo)}>Удалить</button>` : nothing}
        </figure>`)}</div>` : html`<p class="empty">Здесь будут фотографии рабочего процесса.</p>`}
      </section>
      ${this.photoError ? html`<p class="form-error photo-error" role="alert">${this.photoError}</p>` : nothing}
        </div>
      </div>
      ${layers.projects ? html`<div class="section-line"><h2>Проекты</h2><button class="text-button" @click=${() => this.go('projects')}>Все проекты <span aria-hidden="true">↗</span></button></div>
        <div class="project-grid">${this.person.projects.map((project) => this.projectCard(project))}</div>` : nothing}`;
  }

  async removePhoto(photo) {
    try {
      await this.mutate('remove-photo', { id: photo.id });
      await this.refresh();
      this.photoError = '';
    } catch (error) {
      this.photoError = error.message;
    }
  }

  softLevels() {
    return (this.person.soft ?? emptySoft).map((level, index) => {
      const assessment = this.person.mentorScores?.[index];
      return assessment ? assessment.score * 20 : level;
    });
  }

  wheelCarousel() {
    const hardGroups = this.person.hard.length
      ? this.person.hard : [{ name: '', skills: [], levels: [] }];
    const groups = [
      { title: 'Софты', labels: softSkills, short: shortSoftLabels, levels: this.softLevels(), color: 'green' },
      ...hardGroups.map((group) => ({ title: 'Харды', detail: group.name, labels: group.skills, short: group.skills, levels: group.levels, color: 'purple' })),
    ];
    const group = groups[this.activeWheel] ?? groups[0];
    const neighbor = (step) => groups[(this.activeWheel + step + groups.length) % groups.length];
    return html`<section class="home-wheel ${group.color}" aria-label="Круги навыков">
      <div class="home-wheel-top">
        <edinstvo-glass class="wheel-switch" aria-label="Тип навыков" role="group"
          frost="0.34" refraction="0.12" rim="0" stroke-thickness="0" transparency="0.97">
          <div class="wheel-tabs">
            ${groups.length > 1 ? html`<button class="wheel-neighbor" aria-label="Предыдущий круг"
              @click=${() => this.shiftWheel(-1, groups.length)}>${neighbor(-1).title}</button>` : nothing}
            <span class="wheel-current" aria-live="polite">${group.title}</span>
            ${groups.length > 1 ? html`<button class="wheel-neighbor" aria-label="Следующий круг"
              @click=${() => this.shiftWheel(1, groups.length)}>${neighbor(1).title}</button>` : nothing}
          </div>
        </edinstvo-glass>
      </div>
      ${this.activeWheel > 0 && this.person.hard.length > 1 ? html`<div class="wheel-groups" aria-label="Круги хардов">
        ${groups.slice(1).map((item, index) => html`<button aria-pressed=${this.activeWheel === index + 1}
          @click=${() => this.setWheel(index + 1)}>${item.detail}</button>`)}
      </div>` : nothing}
      <div class="wheel-stage" @pointerdown=${(event) => this.wheelStart(event)}
        @pointerup=${(event) => this.wheelEnd(event, groups.length)}
        @pointercancel=${() => { this.swipe = null; }}
        @pointermove=${(event) => this.pointerTilt(event)}
        @pointerleave=${(event) => { if (event.pointerType === 'mouse') this.tilt(0, 0, 0); }}>
        <div class="wheel-disc">
          <div class="wheel-base" aria-hidden="true"></div>
          <skill-chart class="wheel-sectors" .levels=${group.levels} .color=${group.color} .active=${this.activeSector} featured></skill-chart>
          <div class="wheel-glass glass-clear" aria-hidden="true">
            ${this.wheelMotion ? keyed(this.wheelMotion, html`<skill-celebration class="wheel-flight" color=${group.color} orbit></skill-celebration>`) : nothing}
          </div>
        </div>
        <div class="wheel-labels">
          ${group.labels.map((label, index) => {
            const angle = -Math.PI / 2 + (index + 0.5) * Math.PI * 2 / group.labels.length;
            const x = 50 + Math.cos(angle) * 40;
            const y = 50 + Math.sin(angle) * 42;
            return html`<button style=${'--label-x:' + x + '%;--label-y:' + y + '%'} aria-label=${label}
              aria-pressed=${this.activeSector === index} @click=${() => { this.activeSector = this.activeSector === index ? -1 : index; }}>
              ${group.short[index]}</button>`;
          })}
        </div>
      </div>
      ${this.activeSector >= 0 ? html`<p class="wheel-value">${group.labels[this.activeSector]}
        <strong>${group.levels[this.activeSector] === null ? 'Нет оценки' : group.levels[this.activeSector] + '%'}</strong></p>` : nothing}
      ${this.activeWheel > 0 && !group.labels.length ? html`<p class="wheel-value">Круг хардов ещё не настроен.</p>` : nothing}
    </section>`;
  }

  shiftWheel(step, count) {
    this.setWheel((this.activeWheel + step + count) % count);
  }

  setWheel(index) {
    if (index !== this.activeWheel) this.wheelMotion += 1;
    this.activeWheel = index;
    this.activeSector = -1;
  }

  wheelStart(event) {
    if (event.pointerType !== 'touch' || event.target.closest('button')) return;
    this.swipe = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  wheelEnd(event, count) {
    if (!this.swipe) return;
    const dx = event.clientX - this.swipe.x;
    const dy = event.clientY - this.swipe.y;
    this.swipe = null;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.25) this.shiftWheel(dx < 0 ? 1 : -1, count);
  }

  tilt(x, y, spin) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const wheel = this.querySelector('.wheel-disc');
    wheel?.style.setProperty('--tilt-x', x + 'deg');
    wheel?.style.setProperty('--tilt-y', y + 'deg');
    wheel?.style.setProperty('--spin', spin + 'deg');
    wheel?.style.setProperty('--shift-x', y * 0.64 + 'px');
    wheel?.style.setProperty('--shift-y', -x * 0.64 + 'px');
  }

  pointerTilt(event) {
    if (event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    this.tilt((0.5 - (event.clientY - bounds.top) / bounds.height) * 22,
      ((event.clientX - bounds.left) / bounds.width - 0.5) * 22, 0);
  }

  onOrientation(event) {
    if (this.motionState !== 'ready' || this.page !== 'home' || event.beta === null || event.gamma === null) return;
    const neutral = this.neutralOrientation ??= { beta: event.beta, gamma: event.gamma, alpha: event.alpha };
    const limit = (angle, max) => Math.max(-max, Math.min(max, angle));
    const heading = event.alpha === null || neutral.alpha === null ? 0 : ((event.alpha - neutral.alpha + 540) % 360) - 180;
    this.tilt(limit((event.beta - neutral.beta) * 0.62, 24),
      limit((event.gamma - neutral.gamma) * 0.68, 26), limit(heading * 0.25, 20));
  }

  async enableMotion() {
    this.motionState = 'requesting';
    try {
      this.motionState = await DeviceOrientationEvent.requestPermission() === 'granted' ? 'ready' : 'denied';
    } catch {
      this.motionState = 'denied';
    }
  }

  useTelegramOrientation() {
    const webApp = window.Telegram.WebApp;
    const orientation = webApp.DeviceOrientation;
    if (this.telegramOrientation || !orientation || !webApp.isVersionAtLeast('8.0')) return;
    const degrees = (angle) => angle == null ? null : angle * 180 / Math.PI;
    this.telegramOrientation = () => this.onOrientation({
      alpha: degrees(orientation.alpha), beta: degrees(orientation.beta), gamma: degrees(orientation.gamma),
    });
    webApp.onEvent('deviceOrientationChanged', this.telegramOrientation);
    orientation.start({ refresh_rate: 40, need_absolute: false }, (started) => {
      if (!started) return;
      this.motionState = 'ready';
      this.neutralOrientation = null;
      window.removeEventListener('deviceorientation', this.orientWheel);
    });
  }

  skills() {
    return html`
      <div class="page-title">
        <div><h1>Навыки</h1><p>${this.person.name}</p></div>
        ${this.role === 'mentor' ? html`<button class="primary" @click=${() => this.open({ type: 'hard' })}>+ Круг хардов</button>` : nothing}
      </div>
      <div class="skill-grid">
        ${this.skillCard('Софты', softSkills, this.softLevels(), 'green', 'soft')}
        ${repeat(this.person.hard, (group, index) => index, (group, index) => this.skillCard('Харды', group.skills, group.levels, 'purple', index, group.name))}
      </div>`;
  }

  skillCard(title, labels, levels, color, key, group) {
    const selected = this.selections[key] ?? -1;
    const edit = this.role === 'mentor' && (key !== 'soft' || this.person.soft);
    const effect = this.celebration?.person === this.personId && this.celebration.key === key;
    return html`<section class="skill-card ${color}">
      <div class="skill-heading"><h2>${title}</h2>${group ? html`<span>${group}</span>` : nothing}</div>
      <div class="plot">
        <skill-chart .levels=${levels} .color=${color} .active=${selected}></skill-chart>
        ${selected >= 0 && levels[selected] !== null ? html`<output>${levels[selected]}%</output>` : nothing}
        ${effect ? html`<skill-celebration color="purple"></skill-celebration>` : nothing}
      </div>
      ${key === 'soft' ? html`<p class="skill-note">${this.person.soft ? 'Ориентир по входному тесту и оценки ментора' : 'Менти ещё не прошёл входной тест'}</p>` : nothing}
      ${effect ? html`<p class="skill-note" role="status">Все навыки круга на хорошем уровне!</p>` : nothing}
      <ul class="legend">${labels.map((label, index) => html`
        <li class=${edit ? 'editable' : ''}><button aria-pressed=${selected === index} @click=${() => {
          this.selections = { ...this.selections, [key]: selected === index ? -1 : index };
        }}>
          <span class="legend-dot" aria-hidden="true"></span><span>${label}</span><strong>${levels[index] === null ? 'Нет оценки' : levels[index] + '%'}</strong>
        </button>
        ${edit ? html`<button class="edit-skill" aria-label=${'Оценить ' + label} @click=${() => this.open({ type: 'score', key, index, label })}>✎</button>` : nothing}
        ${key === 'soft' && selected === index && this.person.soft ? html`<p class="skill-note detail">
          Оценка теста: ${this.person.soft[index]}%.
          ${this.person.mentorScores?.[index] ? html` Оценка ментора: ${this.person.mentorScores[index].score}/5. ${this.person.mentorScores[index].reason}` : nothing}
        </p>` : nothing}
        </li>`)}</ul>
    </section>`;
  }

  assessment() {
    const status = this.assessmentStatus;
    const remaining = questions.length - this.answers.length;
    const question = questions[this.answers.length];
    if (status === 'intro' || status === 'done') {
      return html`<section class="assessment">
        <h1>${status === 'intro' ? 'Начнём с софтов?' : 'Готово, молодец!'}</h1>
        ${status === 'intro' ? html`<p>30 ситуаций, примерно 10–15 минут. Выбирай вариант, который ближе к тому, как ты обычно поступаешь.</p>
          <button class="primary" @click=${() => { this.assessmentStatus = 'questions'; }}>Начать</button>`
          : html`<div class="test-celebration"><skill-celebration color="green"></skill-celebration><span aria-hidden="true">✳</span></div>
          <p>В профиле появилась примерная оценка софтов по тесту. Дальше её сможет уточнять твой ментор.</p>
          <button class="primary" @click=${() => this.go('skills')}>Посмотреть навыки</button>`}
      </section>`;
    }
    const checkpoint = [10, 20].includes(this.answers.length);
    return html`<section class="assessment">
      <strong>${Math.min(this.answers.length + 1, questions.length)} из ${questions.length}</strong>
      <progress aria-label="Отвечено вопросов" max=${questions.length} value=${this.answers.length}></progress>
      ${checkpoint ? html`<div class="encouragement" role="status"><span aria-hidden="true">✦</span><div>Отлично идёшь! Осталось ${remaining} вопросов.</div><skill-celebration color="green"></skill-celebration></div>` : nothing}
      ${question ? html`<h2>${question.title}</h2><div class="answer-list">
        ${question.answers.map((answer, index) => html`<button aria-pressed=${this.pendingAnswer === index} @click=${() => { this.pendingAnswer = index; }}>${answer}</button>`)}
      </div>` : html`<p>${status === 'saving' ? 'Сохраняем результат…' : 'Готово! Осталось сохранить результат.'}</p>`}
      ${status === 'error' ? html`<p role="alert">Результат пока не сохранился. Ответы на месте, попробуй ещё раз.</p>` : nothing}
      <button class="primary" ?disabled=${status === 'saving' || (question && this.pendingAnswer === null)}
        @click=${() => this.nextAnswer()}>${remaining > 1 ? 'Дальше' : 'Сохранить результат'}</button>
    </section>`;
  }

  async nextAnswer() {
    if (this.person.soft || this.assessmentStatus === 'saving') return;
    if (this.answers.length < questions.length) {
      if (this.pendingAnswer === null) return;
      this.answers = [...this.answers, this.pendingAnswer];
      this.pendingAnswer = null;
    }
    if (this.answers.length < questions.length) return;

    this.assessmentStatus = 'saving';
    const id = this.personId;
    try {
      await this.mutate('assessment', { answers: this.answers });
      await this.refresh();
      if (this.personId === id && this.page === 'assessment') this.assessmentStatus = 'done';
    } catch {
      await this.refresh().catch(() => {});
      if (this.personId === id && this.page === 'assessment') this.assessmentStatus = this.person.soft ? 'done' : 'error';
    }
  }

  calendar() {
    const selected = parseDate(this.date);
    const offset = (selected.getUTCDay() + 6) % 7;
    const visibleTasks = this.personTasks.filter((task) => task.date === this.date).sort((a, b) => a.time.localeCompare(b.time));
    return html`
      <div class="page-title">
        <div><h1>Календарь</h1><p>${this.person.name}</p></div>
        ${this.role === 'mentor' && this.personId ? html`<button class="primary" @click=${() => this.open({ type: 'create' })}>+ Задача</button>` : nothing}
      </div>
      <section class="calendar-card">
        <div class="calendar-top">
          <div><h2>${longDate.format(selected)}</h2><p>${monthLabel.format(selected)}</p></div>
          <div class="arrows">
            <button class="round" aria-label="Предыдущая неделя" @click=${() => this.moveWeek(-7)}>‹</button>
            <button class="round" aria-label="Следующая неделя" @click=${() => this.moveWeek(7)}>›</button>
          </div>
        </div>
        <div class="week" aria-label="Дни недели">${weekDays.map((day, index) => {
          const date = parseDate(this.date);
          date.setUTCDate(date.getUTCDate() - offset + index);
          const key = formatDate(date);
          return html`<button aria-label=${longDate.format(date)} aria-pressed=${this.date === key} @click=${() => { this.date = key; }}>
            <small>${day}</small><strong>${date.getUTCDate()}</strong>
            <span class=${this.personTasks.some((task) => task.date === key) ? 'day-dot visible' : 'day-dot'}></span>
          </button>`;
        })}</div>
      </section>
      <div class="section-line"><h2>Задачи на день</h2></div>
      <section class="agenda">
        ${visibleTasks.length ? visibleTasks.map((task) => html`
          <div class="agenda-row">
            <span class="agenda-time">${task.time}</span>
            <div><strong>${task.title}</strong><p>${task.done ? 'Завершено' : task.movable ? 'Можно перенести' : 'Дата закреплена'}</p></div>
            ${!task.done && (this.role === 'mentor' || task.movable) ? html`<button class="round" aria-label=${'Перенести: ' + task.title} @click=${() => this.open({ type: 'move', task })}>↗</button>` : nothing}
          </div>`) : html`<div class="empty">На этот день задач нет.</div>`}
      </section>`;
  }

  moveWeek(days) {
    const next = parseDate(this.date);
    next.setUTCDate(next.getUTCDate() + days);
    this.date = formatDate(next);
  }

  projects() {
    return html`
      <div class="page-title"><div><h1>Проекты</h1><p>${this.person.name}</p></div>
        ${this.role === 'mentor' && this.personId ? html`<button class="primary" @click=${() => this.open({ type: 'new-project' })}>+ Проект</button>` : nothing}
      </div>
      ${this.person.projects.length ? html`<div class="project-grid">${this.person.projects.map((project) => this.projectCard(project))}</div>`
        : html`<p class="empty">Подключённых проектов пока нет.</p>`}`;
  }

  projectCard(project) {
    return html`<button class="project" @click=${() => this.open({ type: 'project', project })}>
      <span class="project-mark" aria-hidden="true">${project.name[0]}</span>
      <span><strong>${project.name}</strong><small>${project.description}</small></span>
      <span class="teaser-arrow" aria-hidden="true">↗</span>
    </button>`;
  }

  async open(modal, clear = true) {
    this.modal = modal;
    if (clear) this.formError = '';
    await this.updateComplete;
    this.querySelector('dialog').showModal();
  }

  modalContent() {
    const { type, task, project, key, index, label } = this.modal;
    const title = {
      hard: 'Новый круг хардов', create: 'Новая задача', move: 'Перенести задачу',
      project: project?.name, layers: 'Слои профиля', photo: 'Добавить фото', score: label,
      'new-project': 'Новый проект',
    }[type];
    const layers = this.person.layers ?? defaultLayers;
    const previousScore = this.person.mentorScores?.[index];
    const softScore = key === 'soft';
    return html`
      <div class="dialog-top"><h2 id="dialog-title">${title}</h2><button class="round" type="button" aria-label="Закрыть" ?disabled=${this.formBusy} @click=${() => this.querySelector('dialog').close()}>×</button></div>
      ${type === 'project' ? html`
        <p>${project.description}</p><div class="sources">${project.sources.map((source) => html`
          <a href=${source.url} target="_blank" rel="noopener noreferrer">${source.type} ↗</a>`)}</div>`
        : html`<form @submit=${(event) => this.save(event)}>
          ${type === 'hard' ? html`
            <label>Название<input name="name" required maxlength="70"></label>
            <label>До 10 навыков через запятую<input name="skills" required maxlength="300" placeholder="Git, Docker, LLM"></label>`
          : type === 'new-project' ? html`
            <label>Название<input name="name" required maxlength="80"></label>
            <label>Описание<input name="description" maxlength="160"></label>
            <label>GitHub<input name="github" type="url" maxlength="400"></label>
            <label>Figma<input name="figma" type="url" maxlength="400"></label>`
          : type === 'layers' ? html`
            <label>Обложка<select name="cover">
              ${[['sky', 'Небо'], ['mint', 'Мята'], ['violet', 'Фиолетовая']].map(([key, label]) =>
                html`<option value=${key} ?selected=${layers.cover === key}>${label}</option>`)}
            </select></label>
            <label class="check"><input type="checkbox" name="stickers" .checked=${layers.stickers}> Стикеры на обложке</label>
            <label class="check"><input type="checkbox" name="projects" .checked=${layers.projects}> Проекты в профиле</label>`
          : type === 'photo' ? html`
            <label>Фото процесса<input name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" required></label>
            <label>Подпись<input name="caption" maxlength="120" placeholder="Над чем работаешь?"></label>`
          : type === 'score' && softScore ? html`
            <p>Примерная оценка теста: ${this.person.soft[index]}%</p>
            <label>Оценка ментора<select name="score" required>
              ${[
                'Редко, даже с поддержкой', 'С подсказками', 'Устойчиво в типовых ситуациях',
                'Самостоятельно в сложных ситуациях', 'Переносит навык в новые ситуации и помогает другим',
              ].map((label, index) => html`<option value=${index + 1} ?selected=${(previousScore?.score ?? 3) === index + 1}>${index + 1}. ${label}</option>`)}
            </select></label>
            <label>Что ты заметил в работе?<input name="reason" required maxlength="180" .value=${previousScore?.reason ?? ''}></label>`
          : type === 'score' ? html`
            <label>Уровень от 0 до 100<input name="score" type="number" min="0" max="100" step="1" required .value=${String(this.person.hard[key].levels[index])}></label>`
          : html`
            ${type === 'create' ? html`<label>Задача<input name="title" required maxlength="100"></label>` : html`<p>${task.title}</p>`}
            <label>Дата<input type="date" name="date" required .value=${task?.date ?? this.date}></label>
            <label>Время<input type="time" name="time" required .value=${task?.time ?? '18:00'}></label>
            ${type === 'create' ? html`<label class="check"><input type="checkbox" name="movable"> Менти может перенести задачу</label>` : nothing}`}
          ${this.formError ? html`<p class="form-error" role="alert">${this.formError}</p>` : nothing}
          <button class="primary" type="submit" ?disabled=${this.formBusy}>${this.formBusy ? 'Сохраняем…' : 'Сохранить'}</button>
        </form>`}`;
  }

  async save(event) {
    event.preventDefault();
    if (this.formBusy) return;
    const { type, task, key, index } = this.modal;
    const data = new FormData(event.currentTarget);
    const value = (name) => String(data.get(name) ?? '').trim();
    this.formBusy = true;
    this.formError = '';
    try {
      if (type === 'hard') {
        await this.mutate('hard', { name: value('name'), skills: value('skills').split(',') });
      } else if (type === 'layers') {
        await this.mutate('layers', { cover: value('cover'), stickers: data.has('stickers'), projects: data.has('projects') });
      } else if (type === 'photo') {
        const file = data.get('photo');
        if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type) || file.size > 10 * 1024 * 1024 || !file.size) {
          throw new Error('Выбери фото PNG, JPEG, WebP, GIF или AVIF размером до 10 МБ.');
        }
        await this.mutate('photo', { mime: file.type, contents: await encodePhoto(file), caption: value('caption') });
        this.photoError = '';
      } else if (type === 'score') {
        const { reached } = await this.mutate('score', { key, index, score: Number(value('score')), reason: value('reason') });
        if (reached) this.celebration = { person: this.personId, key };
      } else if (type === 'new-project') {
        await this.mutate('project', {
          name: value('name'), description: value('description'), github: value('github'), figma: value('figma'),
        });
      } else {
        const date = value('date');
        const time = value('time');
        await this.mutate(type === 'create' ? 'create-task' : 'move-task', {
          title: value('title'), id: task?.id, date, time, movable: data.has('movable'),
        });
        this.date = date;
      }
      await this.refresh();
      this.querySelector('dialog').close();
    } catch (error) {
      this.formError = error.message;
    } finally {
      this.formBusy = false;
    }
  }

}

customElements.define('learn-app', LearnApp);

import { LitElement, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { keyed } from 'lit/directives/keyed.js';
import '@edinstvo/glass/define';
import '@edinstvo/glass/glass.css';
import './skill-chart.js';
import './skill-growth.js';
import './celebration.js';
import './home-backdrop.js';
import { softSkills } from './skills.js';
import { folders } from './project-folders.js';
import { questions } from './questions.js';
import { encodePhoto, request, telegramData } from './api.js';
import './style.css';
import './student-home.css';

const sections = [
  ['home', 'Скиллы', 'skills-tab.svg'],
  ['calendar', 'Календарь', 'calendar-tab.svg'],
  ['projects', 'Проекты', 'projects-tab.svg'],
];

const shortSoftLabels = [
  'Крит. мышление', 'Аналитика', 'Общение', 'Команда', 'Самостоят.',
  'Адаптация', 'Рефлексия', 'Инициатива', 'Обратная связь', 'Самоорганиз.',
];

const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const dayLabel = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const parseDate = (date) => new Date(date + 'T12:00:00Z');
const formatDate = (date) => date.toISOString().slice(0, 10);
const emptySoft = softSkills.map(() => null);
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
    growth: { state: true },
    photoError: { state: true },
    contactError: { state: true },
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
    this.playedGrowth = new Set();
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
    this.onResume = () => {
      if (this.role === 'mentee' && this.bootStatus === 'ready' && !this.account.pending) {
        void this.refresh().catch(() => {});
      }
    };
    this.onVisibility = () => {
      if (document.visibilityState === 'visible') this.onResume();
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
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('deviceorientation', this.orientWheel);
    window.addEventListener('scroll', this.onPageScroll, { passive: true });
    this.addEventListener('pointerup', this.onMotionGesture);
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resumeWebApp?.offEvent('activated', this.onResume);
    this.resumeWebApp = undefined;
    window.removeEventListener('deviceorientation', this.orientWheel);
    window.removeEventListener('scroll', this.onPageScroll);
    this.removeEventListener('pointerup', this.onMotionGesture);
    if (this.telegramOrientation) {
      window.Telegram.WebApp.offEvent('deviceOrientationChanged', this.telegramOrientation);
      window.Telegram.WebApp.DeviceOrientation.stop();
    }
    this.leaveSkills?.cancel();
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
      if (state.telegram && (!state.account || window.Telegram?.WebApp || location.hash.includes('tgWebAppData='))) {
        try {
          const initData = await telegramData();
          if (initData) state = await request('/telegram', { initData });
        } catch (error) {
          if (!state.account) throw error;
        }
      }
      const webApp = window.Telegram?.WebApp;
      if (state.telegram && webApp?.initData) {
        this.useTelegramOrientation();
        if (!this.resumeWebApp && webApp.isVersionAtLeast?.('8.0')) {
          this.resumeWebApp = webApp;
          webApp.onEvent('activated', this.onResume);
        }
      }
      this.applyState(state);
      this.bootStatus = 'ready';
      if (this.role === 'mentor') this.go('students');
      if (this.role === 'mentee' && !this.account.pending && !this.person.soft) this.go('assessment');
    } catch (error) {
      this.bootError = error.message;
      this.bootStatus = 'error';
    }
  }

  updated(changes) {
    if (!changes.has('page') && !changes.has('people') && !changes.has('growth')) return;
    if (this.role !== 'mentee' || this.page !== 'home' || this.growth) return;
    const event = this.person.skillGrowth?.find((item) => !this.playedGrowth.has(item.id));
    if (event) {
      this.activeWheel = event.key === 'soft' ? 0 : event.key + 1;
      this.activeSector = -1;
      this.growth = event;
    }
  }

  finishGrowth(seen) {
    const growth = this.growth;
    if (!growth) return;
    this.playedGrowth.add(growth.id);
    this.growth = null;
    if (seen) void this.mutate('growth-seen', { id: growth.id }).catch(() => {});
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

  async go(page) {
    if (this.role === 'mentee' && !this.account.pending && !this.person.soft) page = 'assessment';
    this.leaveSkills?.cancel();
    this.leaveSkills = null;
    if (page === this.page) {
      if (page === 'home') this.scrollToTop();
      if (page === 'students') void this.refresh().catch(() => {});
      return;
    }
    const leavingSkills = this.page === 'home' && ['calendar', 'projects', 'profile'].includes(page);
    const summary = leavingSkills && this.querySelector('.home-summary');
    if (summary && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const height = summary.getBoundingClientRect().height;
      const animation = summary.animate([
        { height: height + 'px', minHeight: '0px', opacity: 1 },
        { height: '0px', minHeight: '0px', paddingBlock: '0px', opacity: 0 },
      ], { duration: 220, easing: 'cubic-bezier(.25,.7,.3,1)', fill: 'forwards' });
      this.leaveSkills = animation;
      try { await animation.finished; } catch { return; }
      this.leaveSkills = null;
    }
    this.riseFromSkills = leavingSkills;
    this.page = page;
    if (page !== 'home') this.growth = null;
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
    this.scrollToTop();
  }

  scrollToTop() {
    const viewport = this.querySelector('.student-scroll');
    if (viewport) viewport.scrollTo(0, 0);
    else window.scrollTo(0, 0);
  }

  updateHomeSheet() {
    if (this.page !== 'home') return;
    const top = this.querySelector('.student-scroll')?.scrollTop ?? 0;
    const progress = Math.min(1, Math.max(0, top / 64));
    this.style.setProperty('--sheet-progress', progress);
  }

  nav() {
    const glass = { light: '0.8', refraction: '0.8', depth: '20', dispersion: '0.5', frost: '0.7',
      splay: '0', tint: '#fff', transparency: '0.9' };
    return html`<div class="nav-material">
      <edinstvo-glass class="mobile-nav" light=${glass.light} light-angle="0" refraction=${glass.refraction}
        depth=${glass.depth} dispersion=${glass.dispersion} frost=${glass.frost} splay=${glass.splay}
        tint=${glass.tint} transparency=${glass.transparency}>
        <nav class="nav" aria-label="Разделы">
          ${sections.map(([id, title, asset]) => html`<button class=${this.page === id ? 'active' : ''}
            aria-label=${title} aria-current=${this.page === id ? 'page' : nothing}
            @click=${() => { this.navMotion = id; this.go(id); }}>
            <img src=${'/mobile-home/' + asset} alt="">
            ${this.page === id && this.navMotion === id ? html`<skill-celebration class="nav-burst" color="purple" compact></skill-celebration>` : nothing}
          </button>`)}
        </nav>
      </edinstvo-glass>
      <edinstvo-glass class="profile-glass" light=${glass.light} light-angle="-45" refraction=${glass.refraction}
        depth=${glass.depth} dispersion=${glass.dispersion} frost=${glass.frost} splay=${glass.splay}
        tint=${glass.tint} transparency=${glass.transparency}>
        <button class="profile-tab" aria-label="Профиль" aria-current=${this.page === 'profile' ? 'page' : nothing}
          @click=${() => this.go('profile')}>${this.avatar(this.person)}</button>
      </edinstvo-glass>
    </div>`;
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
    const learner = this.role === 'mentee';
    const showDock = this.page !== 'assessment';
    const content = html`<main class=${isHome ? 'home-main' : ''}>
      ${this.role === 'mentor' ? html`<header class="admin-bar">
        <button class="text-button" @click=${() => this.go('students')}>Ученики</button>
        <button class="text-button" @click=${() => this.go('account')}>Мой кабинет</button>
      </header>` : nothing}
      <div class=${isHome ? 'home-sheet' : 'page-content'}>
        <div class="screen" data-page=${this.page}>${keyed(this.page, screen[this.page]())}</div>
      </div>
    </main>`;
    return html`
      ${learner ? html`<div class="student-shell" data-page=${this.page} ?data-rise=${this.riseFromSkills}>
        ${['home', 'calendar', 'projects'].includes(this.page) ? html`<home-backdrop aria-hidden="true"></home-backdrop>` : nothing}
        <div class="student-scroll" @scroll=${this.onPageScroll}>${content}</div>
        ${showDock ? html`<footer class="student-dock">${this.nav()}</footer>` : nothing}
      </div>` : content}
      <dialog aria-labelledby="dialog-title" @cancel=${(event) => {
        if (this.formBusy) event.preventDefault();
      }} @close=${() => { this.modal = null; }}>${this.modal ? this.modalContent() : nothing}</dialog>`;
  }

  avatar(person) {
    return html`<span class="avatar-image" aria-hidden="true">${person.initials}
      ${person.photoUrl ? keyed(person.photoUrl, html`<img src=${person.photoUrl} alt="" referrerpolicy="no-referrer"
        @error=${(event) => { event.currentTarget.hidden = true; }}>`) : nothing}
    </span>`;
  }

  students() {
    return html`<section class="students">
      <h1>Ученики</h1>
      ${this.people.length ? html`<div class="student-list">${this.people.map((person) => html`
        <button class="student-row" @click=${() => { this.selectPerson(person.id); this.go('profile'); }}>
          <span class="student-avatar">${this.avatar(person)}</span>
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
    const note = Object.values(this.person.mentorScores ?? {}).some((entry) => entry.reason);
    const firstName = this.account.name.split(/\s+/)[0];
    const active = this.personTasks.filter((task) => !task.done).length;
    const plural = new Intl.PluralRules('ru').select(active);
    const taskLabel = { one: 'активная задача', few: 'активные задачи', many: 'активных задач' }[plural];
    return html`
      <div class="student-home">
        <header class="home-person">
          <span>менти</span>
          <h1>${firstName}</h1>
        </header>
        <section class="home-summary" aria-label="Сводка">
          <p><span>привет,</span> <img src="/mobile-home/star.png" alt="" width="30" height="29"> ${firstName}</p>
          <p><span>у тебя</span> <span aria-hidden="true">📅</span> ${active ? active + ' ' + taskLabel : 'пока нет задач'}</p>
          ${note ? html`<p><span aria-hidden="true">💬</span> комментарий ментора</p>` : nothing}
        </section>
        <div class="home-inner-sheet">
          <section class="helper-panel">
            <h2 class="home-asset-heading"><img src="/mobile-home/skills-title.svg" alt="Скиллы"></h2>
            <div class="home-chart-slot">${this.wheelCarousel()}</div>
          </section>
        </div>
      </div>`;
  }

  profile() {
    const { name, username, phone, photos = [] } = this.person;
    const webApp = window.Telegram?.WebApp;
    const canSharePhone = this.role === 'mentee' && webApp?.initData && webApp.isVersionAtLeast?.('6.9');
    return html`
      ${this.role === 'mentor' ? html`<div class="student-actions">
        <button class="text-button" @click=${() => this.go('skills')}>Навыки</button>
        <button class="text-button" @click=${() => this.go('calendar')}>Задачи</button>
        <button class="text-button" @click=${() => this.go('projects')}>Проекты</button>
      </div>` : nothing}
      <header class="profile-portrait">
        ${this.avatar(this.person)}
        <h1>${name}</h1>
        <div class="profile-contact">
          ${username ? html`<span>@${username}</span>` : nothing}
          ${phone ? html`<span>${phone}</span>`
            : canSharePhone ? html`<button class="text-button" ?disabled=${this.formBusy}
              @click=${() => this.sharePhone(webApp)}>Поделиться номером с ментором</button>` : nothing}
        </div>
        ${this.contactError ? html`<p class="form-error" role="alert">${this.contactError}</p>` : nothing}
      </header>
      <section class="profile-lower memories" aria-labelledby="memories-title">
        <h2 id="memories-title">Воспоминания</h2>
        ${this.role === 'mentee' ? html`<button class="text-button" @click=${() => this.open({ type: 'photo' })}>Добавить фото</button>` : nothing}
        ${photos.length ? html`<div class="photo-grid">${photos.map((photo) => html`<figure>
          <img src=${photo.url} alt=${photo.caption || 'Фото рабочего процесса'}>
          <figcaption><time datetime=${photo.date}>${dayLabel.format(parseDate(photo.date))}</time>${photo.caption ? html`<br>${photo.caption}` : nothing}</figcaption>
          ${this.role === 'mentee' ? html`<button class="text-button" @click=${() => this.removePhoto(photo)}>Удалить</button>` : nothing}
        </figure>`)}</div>` : html`<p class="empty">Здесь будут фотографии рабочего процесса.</p>`}
        ${this.photoError ? html`<p class="form-error photo-error" role="alert">${this.photoError}</p>` : nothing}
      </section>`;
  }

  async sharePhone(webApp) {
    this.formBusy = true;
    this.contactError = '';
    try {
      const response = await new Promise((resolve) => webApp.requestContact((shared, data) => resolve({ shared, data })));
      if (!response.shared) return;
      if (!response.data?.response) throw new Error('Telegram не передал номер. Попробуй ещё раз.');
      await this.mutate('telegram-contact', { contact: response.data.response });
      await this.refresh();
    } catch (error) {
      this.contactError = error.message;
    } finally {
      this.formBusy = false;
    }
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
      { labels: softSkills, levels: this.softLevels(), color: 'green' },
      ...hardGroups.map((group) => ({ detail: group.name, labels: group.skills, levels: group.levels, color: 'purple' })),
    ];
    const group = groups[this.activeWheel] ?? groups[0];
    const growth = this.growth;
    return html`<section class="home-wheel ${group.color}" aria-label="Круги навыков">
      <div class="home-wheel-top">
        <edinstvo-glass class="wheel-switch" aria-label="Тип навыков" role="group"
          frost="0.34" refraction="0.12" rim="0" stroke-thickness="0" transparency="0.97">
          <div class="wheel-tabs">
            <button aria-pressed=${this.activeWheel === 0} @click=${() => this.setWheel(0)}>Софты</button>
            <button aria-pressed=${this.activeWheel > 0} @click=${() => {
              if (this.activeWheel === 0) this.setWheel(1);
            }}>Харды</button>
          </div>
        </edinstvo-glass>
      </div>
      ${this.activeWheel > 0 && this.person.hard.length > 1 ? html`<div class="wheel-groups" aria-label="Круги хардов">
        ${groups.slice(1).map((item, index) => html`<button aria-pressed=${this.activeWheel === index + 1}
          @click=${() => this.setWheel(index + 1)}>${item.detail}</button>`)}
      </div>` : nothing}
      <div class="wheel-stage" @click=${(event) => this.pickSector(event, group.labels.length)} @pointerdown=${(event) => this.wheelStart(event)}
        @pointerup=${(event) => this.wheelEnd(event, groups.length)}
        @pointercancel=${() => { this.swipe = null; }}
        @pointermove=${(event) => this.pointerTilt(event)}
        @pointerleave=${(event) => { if (event.pointerType === 'mouse') this.tilt(0, 0, 0); }}>
        <div class="wheel-disc">
          <div class="wheel-base" aria-hidden="true"></div>
          ${keyed(growth?.id ?? '', html`<skill-chart class="wheel-sectors" .levels=${group.levels}
            .color=${group.color} .active=${this.activeSector} .growth=${growth} featured></skill-chart>
          ${growth ? html`<skill-growth .growth=${growth} .sectors=${group.labels.length}
            @growth-frame=${(event) => event.currentTarget.previousElementSibling.showGrowth(event.detail)}
            @growth-end=${(event) => this.finishGrowth(event.detail)}></skill-growth>` : nothing}`)}
          <div class="wheel-glass glass-clear" aria-hidden="true">
            ${this.wheelMotion ? keyed(this.wheelMotion, html`<skill-celebration class="wheel-flight" color=${group.color} orbit></skill-celebration>`) : nothing}
          </div>
        </div>
        <div class="wheel-labels">
          ${group.labels.map((label, index) => {
            const angle = -Math.PI / 2 + (index + .5) * 2 * Math.PI / group.labels.length;
            const x = 50 + Math.cos(angle) * 40;
            const y = 50 + Math.sin(angle) * 42;
            return html`<button style=${`--label-x:${x}%;--label-y:${y}%`} aria-label=${label} title=${label}
              aria-pressed=${this.activeSector === index} @click=${(event) => {
                event.stopPropagation();
                this.selectSector(index);
              }}><span>${this.activeWheel === 0 ? shortSoftLabels[index] : label}</span></button>`;
          })}
        </div>
      </div>
      ${growth ? html`<button class="text-button growth-skip" @click=${() => this.finishGrowth(true)}>Пропустить анимацию</button>` : nothing}
      ${this.activeSector >= 0 ? keyed(this.activeSector, html`<div class="skill-readout" role="status">
        <span>${group.labels[this.activeSector]}</span>
        <strong>${group.levels[this.activeSector] === null ? 'Нет оценки' : group.levels[this.activeSector] + '%'}</strong>
      </div>`) : nothing}
      ${this.activeWheel > 0 && !group.labels.length ? html`<p class="wheel-value">Круг хардов ещё не настроен.</p>` : nothing}
    </section>`;
  }

  selectSector(index) {
    this.activeSector = this.activeSector === index ? -1 : index;
  }

  pickSector(event, count) {
    if (!count || this.ignoreWheelClick || this.growth) return;
    const rect = event.currentTarget.querySelector('.wheel-disc').getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const distance = Math.hypot(x, y);
    if (distance < 8 || distance > rect.width * .43) return;
    const turn = Math.PI * 2;
    const angle = (Math.atan2(y, x) + Math.PI / 2 + turn) % turn;
    this.selectSector(Math.floor(angle / turn * count));
  }

  shiftWheel(step, count) {
    this.setWheel((this.activeWheel + step + count) % count);
  }

  setWheel(index) {
    if (this.growth && index !== this.activeWheel) this.finishGrowth(true);
    if (index !== this.activeWheel) this.wheelMotion += 1;
    this.activeWheel = index;
    this.activeSector = -1;
  }

  wheelStart(event) {
    if (event.pointerType !== 'touch' || event.target.closest('button')) return;
    this.ignoreWheelClick = false;
    this.swipe = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  wheelEnd(event, count) {
    if (!this.swipe) return;
    const dx = event.clientX - this.swipe.x;
    const dy = event.clientY - this.swipe.y;
    this.swipe = null;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      this.ignoreWheelClick = true;
      this.shiftWheel(dx < 0 ? 1 : -1, count);
      setTimeout(() => { this.ignoreWheelClick = false; }, 300);
    }
  }

  tilt(x, y, spin) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const wheel = this.querySelector('.wheel-disc');
    wheel?.style.setProperty('--tilt-x', x + 'deg');
    wheel?.style.setProperty('--tilt-y', y + 'deg');
    wheel?.style.setProperty('--spin', spin + 'deg');
    wheel?.style.setProperty('--shift-x', y * 0.76 + 'px');
    wheel?.style.setProperty('--shift-y', -x * 0.76 + 'px');
  }

  pointerTilt(event) {
    if (event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    this.tilt((0.5 - (event.clientY - bounds.top) / bounds.height) * 34,
      ((event.clientX - bounds.left) / bounds.width - 0.5) * 34, 0);
  }

  onOrientation(event) {
    if (this.motionState !== 'ready' || this.page !== 'home' || event.beta === null || event.gamma === null) return;
    const neutral = this.neutralOrientation ??= { beta: event.beta, gamma: event.gamma, alpha: event.alpha };
    const limit = (angle, max) => Math.max(-max, Math.min(max, angle));
    const heading = event.alpha === null || neutral.alpha === null ? 0 : ((event.alpha - neutral.alpha + 540) % 360) - 180;
    this.tilt(limit((event.beta - neutral.beta) * 0.88, 27),
      limit((event.gamma - neutral.gamma) * 0.94, 28), limit(heading * 0.25, 20));
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
      document.removeEventListener('visibilitychange', this.onVisibility);
    this.resumeWebApp?.offEvent('activated', this.onResume);
    this.resumeWebApp = undefined;
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
      return html`<section class="assessment assessment-cover">
        <div class="assessment-emblem">
          <img src="/mobile-home/star.png" alt="">
          <skill-celebration color=${status === 'intro' ? 'purple' : 'green'} ?orbit=${status === 'intro'}></skill-celebration>
        </div>
        <h1>${status === 'intro' ? 'Начнём с софтов?' : 'Готово, молодец!'}</h1>
        ${status === 'intro' ? html`<p>30 ситуаций, примерно 10–15 минут. Выбирай вариант, который ближе к тому, как ты обычно поступаешь.</p>
          <button class="primary" @click=${() => { this.assessmentStatus = 'questions'; }}>Начать</button>`
          : html`<p>В разделе «Скиллы» появилась примерная оценка софтов по тесту. Дальше её сможет уточнять твой ментор.</p>
          <button class="primary" @click=${() => this.go('home')}>Посмотреть навыки</button>`}
      </section>`;
    }
    const checkpoint = [10, 20].includes(this.answers.length);
    return html`<section class="assessment">
      <div class="assessment-progress">
        <strong>${Math.min(this.answers.length + 1, questions.length)} из ${questions.length}</strong>
        ${this.answers.length && question ? html`<button class="text-button" @click=${() => {
          this.pendingAnswer = this.answers.at(-1);
          this.answers = this.answers.slice(0, -1);
        }}>Назад</button>` : nothing}
      </div>
      <progress aria-label="Отвечено вопросов" max=${questions.length} value=${this.answers.length}></progress>
      ${checkpoint ? keyed(remaining, html`<div class="encouragement" role="status"><img src="/mobile-home/star.png" alt="">
        <p>${remaining === 10 ? 'Ещё чуть-чуть!' : 'Отлично идёшь!'} Осталось ${remaining} вопросов.</p>
        <skill-celebration color="purple" compact></skill-celebration></div>`) : nothing}
      ${question ? keyed(this.answers.length, html`<div class="assessment-question"><h2>${question.title}</h2><div class="answer-list">
        ${question.answers.map((answer, index) => html`<button aria-pressed=${this.pendingAnswer === index} @click=${() => { this.pendingAnswer = index; }}>${answer}</button>`)}
      </div></div>`) : html`<p>${status === 'saving' ? 'Сохраняем результат…' : 'Готово! Осталось сохранить результат.'}</p>`}
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
    if (this.answers.length < questions.length) {
      this.scrollToTop();
      return;
    }

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
    const now = new Date().toTimeString().slice(0, 5);
    const currentDay = today();
    const upcoming = this.personTasks.find((task) => !task.done
      && (task.date > currentDay || (task.date === currentDay && task.time >= now)));
    const visibleTasks = this.personTasks.filter((task) => task.date === this.date).sort((a, b) => a.time.localeCompare(b.time));
    const learner = this.role === 'mentee';
    return html`
      ${learner ? this.learnerTitle('calendar', 'Календарь') : html`<div class="page-title"><div><h1>Календарь</h1><p>${this.person.name}</p></div></div>`}
      <div class="calendar-layout">
      <section class="calendar-card" @touchstart=${(event) => { this.weekTouch = event.changedTouches[0].clientX; }}
        @touchend=${(event) => {
          if (this.weekTouch === undefined) return;
          const distance = event.changedTouches[0].clientX - this.weekTouch;
          this.weekTouch = undefined;
          if (Math.abs(distance) > 44) this.moveWeek(distance < 0 ? 7 : -7);
        }}>
        <div class="calendar-top">
          <h2>${monthLabel.format(selected)}</h2>
          <label class="calendar-date">Выбрать дату<input aria-label="Выбрать дату" type="date" .value=${this.date}
            @change=${(event) => { if (event.target.value) this.date = event.target.value; }}></label>
        </div>
        <div class="week" aria-label="Дни недели">${weekDays.map((day, index) => {
          const date = parseDate(this.date);
          date.setUTCDate(date.getUTCDate() - offset + index);
          const key = formatDate(date);
          return html`<button aria-label=${longDate.format(date)} aria-pressed=${this.date === key}
            aria-current=${key === currentDay ? 'date' : nothing} @click=${() => { this.date = key; }}>
            <small>${day}</small><strong>${date.getUTCDate()}</strong>
            <span class=${this.personTasks.some((task) => task.date === key) ? 'day-dot visible' : 'day-dot'}></span>
          </button>`;
        })}</div>
      </section>
      <section class="calendar-next">
        <h2>Ближайшее</h2>
        ${upcoming ? html`<button @click=${() => { this.date = upcoming.date; }}>
          <span class="next-day" aria-hidden="true">${parseDate(upcoming.date).getUTCDate()}</span>
          <span><strong>${upcoming.title}</strong>
          <time datetime=${upcoming.date + 'T' + upcoming.time}>${upcoming.date === currentDay ? 'Сегодня' : dayLabel.format(parseDate(upcoming.date))}, ${upcoming.time}</time></span>
        </button>` : html`<p>Ближайших задач пока нет.</p>`}
      </section>
      <div class="section-line calendar-agenda-title"><h2>${longDate.format(selected)}</h2>
        ${this.personId ? html`<button class="primary" @click=${() => this.open({ type: 'create' })}>+ Задача</button>` : nothing}</div>
      ${visibleTasks.length
        ? html`<section class="agenda">${visibleTasks.map((task) => this.calendarTask(task))}</section>`
        : html`<p class="agenda-empty">На этот день задач нет.</p>`}
      </div>`;
  }

  calendarTask(task) {
    const project = this.person.projects.find((item) => item.id === task.projectId);
    const editable = this.role === 'mentor' || task.movable;
    return html`<div class="agenda-row">
      <time class="agenda-time" datetime=${task.date + 'T' + task.time}>${task.time}</time>
      <div><strong>${task.title}</strong>
        ${project ? html`<button class="task-project" @click=${() => this.open({ type: 'project', project })}>${project.name}</button>` : nothing}
        <p>${task.done ? 'Завершено' : editable ? 'Можно перенести' : 'Дата закреплена'}</p>
      </div>
      ${editable && !task.done ? html`<button class="round" aria-label=${'Перенести или привязать проект: ' + task.title}
        @click=${() => this.open({ type: 'move', task })}>Изменить</button>` : nothing}
    </div>`;
  }

  moveWeek(days) {
    const next = parseDate(this.date);
    next.setUTCDate(next.getUTCDate() + days);
    this.date = formatDate(next);
  }

  learnerTitle(kind, title) {
    return html`<header class="home-person"><span>менти</span><p>${this.account.name.split(/\s+/)[0]}</p></header>
      <h1 class="learner-section-title"><img src=${'/mobile-home/' + kind + '-title.svg'} alt=${title}></h1>`;
  }

  projects() {
    return html`
      ${this.role === 'mentee' ? this.learnerTitle('projects', 'Проекты') : html`<div class="page-title"><div><h1>Проекты</h1><p>${this.person.name}</p></div></div>`}
      <div class="project-folders">
        ${this.person.projects.map((project) => this.projectCard(project))}
        ${this.personId ? html`<button class="project-folder" @click=${() => this.open({ type: 'new-project', step: 1 })}>
          <span class="folder-art folder-morph" aria-hidden="true">
            <img src="/mobile-home/new-folder.svg" alt="">
            ${['gel', 'fur', 'foil'].map((folder) => html`<img src=${'/folders/' + folder + '.webp'} alt="">`)}
          </span><strong>Новый проект</strong></button>` : nothing}
      </div>`;
  }

  projectCard(project) {
    const folder = folders.some(([id]) => id === project.folder) ? project.folder : 'gel';
    return html`<button class="project-folder" @click=${() => this.open({ type: 'project', project })}>
      <span class="folder-art"><img src=${'/folders/' + folder + '.webp'} alt="" loading="lazy"></span>
      <strong>${project.name}</strong>
      ${project.description ? html`<small>${project.description}</small>` : nothing}
    </button>`;
  }

  async open(modal, clear = true) {
    this.modal = modal;
    if (clear) this.formError = '';
    await this.updateComplete;
    const dialog = this.querySelector('dialog');
    if (!dialog.open) dialog.showModal();
    else (dialog.querySelector('form input, form select') ?? dialog.querySelector('.dialog-top button'))?.focus();
  }

  linkableTasks() {
    return this.personTasks.filter((task) => !task.projectId && (this.role === 'mentor' || task.movable));
  }

  projectWeeks(projectId) {
    const weeks = new Map();
    for (const task of this.personTasks.filter((item) => item.projectId === projectId)) {
      const monday = parseDate(task.date);
      monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
      const start = formatDate(monday);
      if (!weeks.has(start)) weeks.set(start, []);
      weeks.get(start).push(task);
    }
    return [...weeks].map(([start, tasks]) => {
      const monday = parseDate(start);
      const sunday = parseDate(start);
      sunday.setUTCDate(sunday.getUTCDate() + 6);
      return html`<section class="project-week">
        <h4>${dayLabel.formatRange(monday, sunday)}</h4>
        ${tasks.map((task) => html`<button class="project-task" @click=${() => {
          this.querySelector('dialog').close();
          this.date = task.date;
          this.go('calendar');
        }}><strong>${task.title}${task.done ? ' ✓' : ''}</strong>
          <time datetime=${task.date + 'T' + task.time}>${dayLabel.format(parseDate(task.date))}, ${task.time}</time>
        </button>`)}
      </section>`;
    });
  }

  async addProjectComment(event, project) {
    event.preventDefault();
    if (this.formBusy) return;
    const form = event.currentTarget;
    const text = String(new FormData(form).get('text') ?? '').trim();
    if (!text) return;
    this.formBusy = true;
    this.formError = '';
    try {
      await this.mutate('project-comment', { projectId: project.id, text });
      await this.refresh();
      this.modal = { type: 'project', project: this.person.projects.find((item) => item.id === project.id) };
      form.reset();
    } catch (error) {
      this.formError = error.message;
    } finally {
      this.formBusy = false;
    }
  }

  modalContent() {
    const { type, task, project, key, index, label, step } = this.modal;
    const title = {
      hard: 'Новый круг хардов', create: 'Новая задача', move: 'Перенести задачу',
      project: project?.name, photo: 'Добавить фото', score: label,
      'new-project': step === 2 ? 'Выбери папку' : 'Новый проект', 'link-existing': 'Привязать задачу',
    }[type];
    const previousScore = this.person.mentorScores?.[index];
    const softScore = key === 'soft';
    const weeks = type === 'project' ? this.projectWeeks(project.id) : [];
    return html`
      <div class="dialog-top"><h2 id="dialog-title" tabindex="-1">${title}</h2><button class="round" type="button" aria-label="Закрыть" ?disabled=${this.formBusy} @click=${() => this.querySelector('dialog').close()}>×</button></div>
      ${type === 'project' ? html`
        <p>${project.description}</p><div class="sources">${project.sources.map((source) => html`
          <a href=${source.url} target="_blank" rel="noopener noreferrer">${source.type} ↗</a>`)}</div>
        <section class="project-plan">
          <h3>Задачи проекта</h3>
          ${weeks.length ? weeks : html`<p class="empty">Пока нет задач.</p>`}
          <div class="project-actions">
            <button class="primary" @click=${() => this.open({ type: 'create', project })}>+ Задача</button>
            ${this.linkableTasks().length ? html`<button class="text-button"
              @click=${() => this.open({ type: 'link-existing', project })}>Привязать из календаря</button>` : nothing}
          </div>
        </section>
        <section class="project-comments">
          <h3>Комментарии ментора</h3>
          ${project.comments?.length ? html`<ul>
            ${project.comments.map((comment) => html`<li><strong>${comment.author}</strong>
              <time datetime=${comment.createdAt}>${dayLabel.format(new Date(comment.createdAt))}</time>
              <p>${comment.text}</p></li>`)}
          </ul>` : html`<p class="empty">Пока нет комментариев.</p>`}
          ${this.role === 'mentor' ? html`<form @submit=${(event) => this.addProjectComment(event, project)}>
            <label>Комментарий<textarea name="text" maxlength="1000" rows="2" required></textarea></label>
            ${this.formError ? html`<p class="form-error" role="alert">${this.formError}</p>` : nothing}
            <button class="primary" ?disabled=${this.formBusy}>Добавить комментарий</button>
          </form>` : nothing}
        </section>`
        : html`<form @submit=${(event) => this.save(event)}>
          ${type === 'hard' ? html`
            <label>Название<input name="name" required maxlength="70"></label>
            <label>До 10 навыков через запятую<input name="skills" required maxlength="300" placeholder="Git, Docker, LLM"></label>`
          : type === 'new-project' ? html`
            <fieldset class="project-step" ?hidden=${step === 2}>
              <legend>1 из 2. О проекте</legend>
              <label>Название<input name="name" required maxlength="80" placeholder="Название проекта"></label>
              <label>Описание<textarea name="description" maxlength="160" rows="2" placeholder="Что ты хочешь сделать?"></textarea></label>
              <details class="project-links"><summary>Добавить ссылки</summary>
                <label>GitHub<input name="github" type="url" maxlength="400"></label>
                <label>Figma<input name="figma" type="url" maxlength="400"></label>
              </details>
            </fieldset>
            <fieldset class="project-step" ?hidden=${step !== 2}>
              <legend>2 из 2. Дизайн папки</legend>
              <div class="folder-options">${folders.map(([id, name]) => html`
                <label><input type="radio" name="folder" value=${id} ?checked=${id === 'gel'}>
                  <img src=${step === 2 ? '/folders/' + id + '.webp' : nothing} alt=""><span>${name}</span></label>`)}</div>
            </fieldset>
            ${step === 2 ? html`<button class="text-button project-back" type="button"
              @click=${() => { this.modal = { ...this.modal, step: 1 }; }}>Назад к описанию</button>` : nothing}`
          : type === 'link-existing' ? html`
            <label>Задача<select name="taskId" aria-label="Задача" required>
              ${this.linkableTasks().map((item) => html`<option value=${item.id}>${item.title}, ${dayLabel.format(parseDate(item.date))}</option>`)}
            </select></label>`
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
            ${this.person.projects.length ? html`<label>Проект<select name="projectId" aria-label="Проект">
              <option value="">Без проекта</option>
              ${this.person.projects.map((item) => html`<option value=${item.id}
                ?selected=${item.id === (project?.id ?? task?.projectId)}>${item.name}</option>`)}
            </select></label>` : nothing}
            ${type === 'create' && this.role === 'mentor' ? html`<label class="check"><input type="checkbox" name="movable"> Менти может перенести задачу</label>` : nothing}`}
          ${this.formError ? html`<p class="form-error" role="alert">${this.formError}</p>` : nothing}
          <button class="primary" type="submit" ?disabled=${this.formBusy}>${this.formBusy ? 'Сохраняем…' : type === 'new-project' ? (step === 2 ? 'Создать проект' : 'Дальше') : 'Сохранить'}</button>
        </form>`}`;
  }

  async save(event) {
    event.preventDefault();
    if (this.formBusy) return;
    const { type, task, project, key, index, step } = this.modal;
    if (type === 'new-project' && step !== 2) {
      if (!event.currentTarget.elements.name.value.trim()) {
        this.formError = 'Укажи название проекта.';
        return;
      }
      this.formError = '';
      this.modal = { ...this.modal, step: 2 };
      await this.updateComplete;
      this.querySelector('#dialog-title')?.focus();
      return;
    }
    const data = new FormData(event.currentTarget);
    const value = (name) => String(data.get(name) ?? '').trim();
    this.formBusy = true;
    this.formError = '';
    try {
      if (type === 'hard') {
        await this.mutate('hard', { name: value('name'), skills: value('skills').split(',') });
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
          name: value('name'), description: value('description'), folder: value('folder'), github: value('github'), figma: value('figma'),
        });
      } else if (type === 'link-existing') {
        await this.mutate('link-task', { id: value('taskId'), projectId: project.id });
      } else {
        const date = value('date');
        const time = value('time');
        await this.mutate(type === 'create' ? 'create-task' : 'move-task', {
          title: value('title'), id: task?.id, date, time, projectId: value('projectId'), movable: data.has('movable'),
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

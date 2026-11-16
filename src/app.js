import { LitElement, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { keyed } from 'lit/directives/keyed.js';
import '@edinstvo/glass/define';
import '@edinstvo/glass/glass.css';
import './skill-chart.js';
import './skill-growth.js';
import './celebration.js';
import './assessment-scene.js';
import { softSkills } from './skills.js';
import { folders } from './project-folders.js';
import { questions } from './questions.js';
import { compressPhoto, encodePhoto, request, telegramData } from './api.js';
import { assessmentPauses, filterTasks, formatDate, monthGrid, parseDate, shiftDate, shiftMonth, shuffledAnswers, taskOnDay, tasksByWeek, weekStart } from './schedule.js';
import './style.css';
import './student-home.css';

const sections = [
  ['home', 'скиллы'],
  ['calendar', 'календарь'],
  ['projects', 'проекты'],
];

const shortSoftLabels = [
  'Крит. мышление', 'Аналитика', 'Общение', 'Команда', 'Самостоят.',
  'Адаптация', 'Рефлексия', 'Инициатива', 'Обратная связь', 'Самоорганиз.',
];

const weekDays = ['п', 'в', 'с', 'ч', 'п', 'с', 'в'];
const monthName = new Intl.DateTimeFormat('ru', { month: 'long', timeZone: 'UTC' });
const dayLabel = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' });
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
    calendarFilter: { state: true },
    calendarImportStatus: { state: true },
    monthView: { state: true },
    selections: { state: true },
    modal: { state: true },
    answers: { state: true },
    pendingAnswer: { state: true },
    assessmentPause: { state: true },
    assessmentStatus: { state: true },
    finale: { state: true },
    formError: { state: true },
    celebration: { state: true },
    growth: { state: true },
    photoError: { state: true },
    formBusy: { state: true },
    activeWheel: { state: true },
    activeSector: { state: true },
    motionState: { state: true },
    navMotion: { state: true },
    wheelMotion: { state: true },
    selectedProject: { state: true },
    mentorStep: { state: true },
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
    this.calendarFilter = 'today';
    this.selections = {};
    this.modal = null;
    this.answers = [];
    this.pendingAnswer = null;
    this.assessmentPause = 0;
    this.assessmentStatus = 'intro';
    this.finale = false;
    this.playedGrowth = new Set();
    this.formError = '';
    this.celebration = null;
    this.photoError = '';
    this.formBusy = false;
    this.activeWheel = 0;
    this.confirmedCommentReads = new Set();
    this.pendingCommentReads = new Set();
    this.activeSector = -1;
    this.wheelMotion = 0;
    this.selectedProject = null;
    this.mentorStep = 0;
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

  lowerTextInput(event) {
    const field = event.target;
    if (event.isComposing || !field.matches('textarea, input[type="text"], input:not([type])')) return;
    const value = field.value;
    const lower = value.toLowerCase();
    if (value === lower) return;
    const start = value.slice(0, field.selectionStart).toLowerCase().length;
    const end = value.slice(0, field.selectionEnd).toLowerCase().length;
    const direction = field.selectionDirection;
    field.value = lower;
    field.setSelectionRange(start, end, direction);
  }

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('deviceorientation', this.orientWheel);
    window.addEventListener('scroll', this.onPageScroll, { passive: true });
    this.addEventListener('pointerup', this.onMotionGesture);
    this.addEventListener('input', this.lowerTextInput);
    this.addEventListener('compositionend', this.lowerTextInput);
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resumeWebApp?.offEvent('activated', this.onResume);
    this.resumeWebApp = undefined;
    window.removeEventListener('deviceorientation', this.orientWheel);
    window.removeEventListener('scroll', this.onPageScroll);
    this.removeEventListener('pointerup', this.onMotionGesture);
    this.removeEventListener('input', this.lowerTextInput);
    this.removeEventListener('compositionend', this.lowerTextInput);
    if (this.telegramOrientation) {
      window.Telegram.WebApp.offEvent('deviceOrientationChanged', this.telegramOrientation);
      window.Telegram.WebApp.DeviceOrientation.stop();
    }
    this.leaveSkills?.cancel();
    this.commentObserver?.disconnect();
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
      this.localJoin = Boolean(state.local);
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
        // Mini App на всю высоту, свайп вниз внутри приложения не сворачивает окно Telegram.
        webApp.expand?.();
        if (webApp.isVersionAtLeast?.('7.7')) webApp.disableVerticalSwipes();
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
    if (changes.has('page') || changes.has('people') || changes.has('selectedProject')) this.observeProjectComments();
    if (!changes.has('page') && !changes.has('people') && !changes.has('growth')) return;
    if (this.role !== 'mentee' || this.page !== 'home' || this.growth) return;
    const event = this.person.skillGrowth?.find((item) => {
      const count = item.key === 'soft' ? softSkills.length : this.person.hard[item.key]?.skills.length ?? 0;
      return item.index >= 0 && item.index < count && !this.playedGrowth.has(item.id);
    });
    if (event) {
      this.activeWheel = event.key === 'soft' ? 0 : event.key + 1;
      this.activeSector = -1;
      this.growth = event;
    }
  }

  commentUnread(comment) {
    return this.role === 'mentee' && !comment.readAt && !this.confirmedCommentReads.has(comment.id);
  }

  observeProjectComments() {
    this.commentObserver?.disconnect();
    if (this.role !== 'mentee' || this.page !== 'project') return;
    const projectId = this.selectedProject?.id;
    const targets = this.querySelectorAll('[data-unread-comment]');
    if (!projectId || !targets.length) return;
    this.commentObserver = new IntersectionObserver((entries, observer) => {
      const ids = [];
      for (const { isIntersecting, target } of entries) {
        if (!isIntersecting) continue;
        const id = target.dataset.unreadComment;
        if (this.pendingCommentReads.has(id)) continue;
        observer.unobserve(target);
        this.pendingCommentReads.add(id);
        ids.push(id);
      }
      for (let index = 0; index < ids.length; index += 100) {
        void this.confirmComments(projectId, ids.slice(index, index + 100));
      }
    });
    for (const target of targets) this.commentObserver.observe(target);
  }

  async confirmComments(projectId, ids) {
    try {
      const result = await this.mutate('read-project-comments', { projectId, ids });
      for (const id of result.ids) this.confirmedCommentReads.add(id);
      this.requestUpdate();
    } catch {
      // При повторном открытии проекта видимые комментарии можно подтвердить снова.
    } finally {
      for (const id of ids) this.pendingCommentReads.delete(id);
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
    const group = this.person.hard[this.activeWheel - 1];
    if (this.activeWheel > 0 && !group?.skills.length) {
      this.activeWheel = 0;
      this.activeSector = -1;
      this.growth = null;
    } else if (group && this.activeSector >= group.skills.length) {
      this.activeSector = -1;
    }
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
    this.calendarImportStatus = '';
    this.selections = {};
    this.celebration = null;
    this.activeWheel = 0;
    this.activeSector = -1;
    this.neutralOrientation = null;
    this.cardTurn = 0;
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

  // Скрытый вход ментора: удержание логотипа 10 секунд открывает форму почты и пароля, затем PIN.
  holdWordmark(event) {
    if (this.account || this.mentorStep || this.bootStatus !== 'ready') return;
    event.preventDefault();
    clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => { this.bootError = ''; this.mentorStep = 1; }, 10_000);
  }

  async mentorSignIn(event) {
    event.preventDefault();
    if (this.formBusy) return;
    const data = new FormData(event.currentTarget);
    this.bootError = '';
    if (this.mentorStep === 1) {
      this.mentorLogin = { email: String(data.get('email')).trim(), password: String(data.get('password')) };
      this.mentorStep = 2;
      return;
    }
    this.formBusy = true;
    try {
      this.applyState(await request('/mentor', { ...this.mentorLogin, pin: String(data.get('pin')) }));
      this.mentorStep = 0;
      this.go('students');
    } catch (error) {
      this.bootError = error.message;
      this.mentorStep = 1;
    } finally {
      this.mentorLogin = null;
      this.formBusy = false;
    }
  }

  // Карточка профиля вращается за пальцем или мышью как 3D-объект. Короткое касание переворачивает её,
  // после отпускания она доворачивается к ближайшей стороне.
  turnCard(rotateY, rotateX, dragging) {
    const inner = this.querySelector('.profile-card-3d');
    if (!inner) return;
    inner.classList.toggle('is-dragging', dragging);
    inner.style.setProperty('--turn-y', rotateY + 'deg');
    inner.style.setProperty('--turn-x', rotateX + 'deg');
    // Блик металла смещается вместе с поворотом.
    inner.style.setProperty('--shine', Math.max(-60, Math.min(60, ((rotateY % 360) + rotateX) * .5)));
  }

  cardDown(event) {
    this.cardDrag = { x: event.clientX, y: event.clientY, base: this.cardTurn ?? 0, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  cardMove(event) {
    const drag = this.cardDrag;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.moved ||= Math.hypot(dx, dy) > 6;
    drag.current = drag.base + dx * .6;
    if (drag.moved) {
      this.manualMotion = true;
      this.turnCard(drag.current, Math.max(-35, Math.min(35, -dy * .35)), true);
    }
  }

  cardUp(event) {
    const drag = this.cardDrag;
    if (!drag) return;
    this.cardDrag = null;
    if (event.type === 'pointercancel' && !drag.moved) return;
    this.manualMotion = true;
    // pointercancel приходит без координат, поэтому берём последний угол из движения.
    const current = drag.current ?? drag.base;
    this.cardTurn = drag.moved ? Math.round(current / 180) * 180 : drag.base + 180;
    this.turnCard(this.cardTurn, 0, false);
  }

  async joinLocal(event) {
    event.preventDefault();
    if (this.formBusy) return;
    const data = new FormData(event.currentTarget);
    this.bootError = '';
    this.formBusy = true;
    try {
      this.applyState(await request('/local/join', { name: String(data.get('name')).trim(), code: String(data.get('code') ?? '') }));
      this.go(this.person.soft ? 'home' : 'assessment');
    } catch (error) {
      this.bootError = error.message;
    } finally {
      this.formBusy = false;
    }
  }

  // Ментор правит процент навыка прямо в списке. Сохранение сразу, при ошибке поле возвращается к прежнему значению.
  async savePercent(event, key, index) {
    const field = event.currentTarget;
    const score = Number(field.value);
    if (field.value === '' || !Number.isInteger(score) || score < 0 || score > 100) {
      this.formError = 'Процент от 0 до 100.';
      field.value = field.defaultValue;
      return;
    }
    field.disabled = true;
    try {
      const { reached } = await this.mutate('score', { key, index, score });
      if (reached) this.celebration = { person: this.personId, key };
      this.formError = '';
      await this.refresh();
    } catch (error) {
      this.formError = error.message;
      field.value = field.defaultValue;
    } finally {
      field.disabled = false;
    }
  }

  // Добавление воспоминания: сначала системный выбор фото, затем окно с превью, описанием и отправкой.
  pickPhoto(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.size || (file.type && !file.type.startsWith('image/'))) {
      this.photoError = 'Выбери фото.';
      return;
    }
    this.photoError = '';
    void this.open({ type: 'photo', file, preview: URL.createObjectURL(file) });
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
    return html`<div class="nav-material">
      <div class="mobile-nav">
        <nav class="nav" aria-label="Разделы">
          ${sections.map(([id, title]) => html`<button class=${this.page === id ? 'active' : ''}
            aria-label=${title} aria-current=${this.page === id ? 'page' : nothing}
            @click=${() => { this.navMotion = id; this.go(id); }}>
            <span class="dock-label">${title}</span>
            ${this.page === id && this.navMotion === id ? html`<skill-celebration class="nav-burst" color="purple" cubes></skill-celebration>` : nothing}
          </button>`)}
        </nav>
      </div>
      <div class="profile-glass">
        <button class="profile-tab" aria-label="Профиль" aria-current=${this.page === 'profile' ? 'page' : nothing}
          @click=${() => this.go('profile')}>${this.avatar(this.person)}</button>
      </div>
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
      const stopHold = () => clearTimeout(this.holdTimer);
      return html`<main class="sign-in">
        <div class="wordmark-hold" @pointerdown=${(event) => this.holdWordmark(event)} @pointerup=${stopHold}
          @pointerleave=${stopHold} @pointercancel=${stopHold} @contextmenu=${(event) => event.preventDefault()}>${this.wordmark()}</div>
        ${this.bootStatus === 'loading' ? html`<p role="status">Открываем пространство…</p>`
          : this.account?.pending ? html`<form autocapitalize="none" @submit=${(event) => this.activate(event)}>
            <h1>Твой код доступа</h1><p>Возьми сегодняшний код у ментора.</p>
            <label>Код<input name="code" inputmode="numeric" autocomplete="one-time-code" required pattern="[0-9]{6}" maxlength="6"></label>
            <button class="primary" type="submit" ?disabled=${this.formBusy}>Продолжить</button>
          </form>`
          : this.mentorStep ? keyed(this.mentorStep, html`<form @submit=${(event) => this.mentorSignIn(event)}>
            <h1>Вход ментора</h1>
            ${this.mentorStep === 1 ? html`<label>Почта<input name="email" type="email" autocomplete="username" required maxlength="200"></label>
              <label>Пароль<input name="password" type="password" autocomplete="current-password" required maxlength="200"></label>`
              : html`<label>PIN<input name="pin" type="password" inputmode="numeric" autocomplete="off" required pattern="[0-9]{4,8}" maxlength="8"></label>`}
            <button class="primary" type="submit" ?disabled=${this.formBusy}>${this.mentorStep === 1 ? 'Дальше' : 'Войти'}</button>
            <button class="text-button" type="button" @click=${() => { this.mentorStep = 0; this.mentorLogin = null; this.bootError = ''; }}>Отмена</button>
          </form>`)
          : this.bootStatus === 'ready' && this.localJoin ? html`<form autocapitalize="none" @submit=${(event) => this.joinLocal(event)}>
            <h1>Вход</h1><p>Введи имя и сегодняшний код от ментора. Код нужен только при первом входе.</p>
            <label>Имя<input name="name" required maxlength="100" autocomplete="name"></label>
            <label>Код<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"></label>
            <button class="primary" type="submit" ?disabled=${this.formBusy}>Войти</button>
          </form>`
          : this.bootStatus === 'ready' ? html`<p>Открой Единство Learn через Telegram.</p>` : nothing}
        ${this.bootError ? html`<p class="form-error" role="alert">${this.bootError}</p>
          ${this.bootStatus === 'error' ? html`<button class="text-button" @click=${() => this.boot()}>Повторить</button>` : nothing}` : nothing}
      </main>`;
    }
    const isHome = this.page === 'home';
    const screen = {
      home: () => this.home(), profile: () => this.profile(), skills: () => this.skills(), project: () => this.projectPage(),
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
        <div class="student-scroll" @scroll=${this.onPageScroll}>${content}</div>
        ${showDock ? html`<footer class="student-dock">${this.nav()}</footer>` : nothing}
      </div>` : content}
      ${this.page === 'assessment' && this.assessmentPause ? keyed(this.assessmentPause, html`<p class="encouragement-float" role="status">
        ${{ 9: 'молодец, отлично идёшь!', 20: 'две трети позади, так держать!' }[this.assessmentPause] ?? 'финальный рывок!'}</p>
        <assessment-scene class="assessment-burst" kind=${this.assessmentPause === 20 ? 'strong' : 'cheer'}
          @scene-end=${() => { this.assessmentPause = 0; }}></assessment-scene>`) : nothing}
      ${this.finale ? html`<assessment-scene class="assessment-finale" kind="finale"
        @scene-cover=${() => this.go('home')} @scene-end=${() => { this.finale = false; }}></assessment-scene>` : nothing}
      <dialog ?data-project-wizard=${this.modal?.type === 'new-project'} aria-labelledby="dialog-title" @cancel=${(event) => {
        if (this.formBusy) event.preventDefault();
      }} @close=${() => { if (this.modal?.preview) URL.revokeObjectURL(this.modal.preview); this.modal = null; }}>${this.modal ? this.modalContent() : nothing}</dialog>`;
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
    const comments = this.person.projects.reduce((total, project) =>
      total + (project.comments?.filter((comment) => this.commentUnread(comment)).length ?? 0), 0);
    const note = Object.values(this.person.mentorScores ?? {}).some((entry) => entry.reason);
    const firstName = this.account.name.split(/\s+/)[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'доброе утро' : hour < 18 ? 'добрый день' : 'добрый вечер';
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
          <p><span class="summary-muted">${greeting},</span> <span class="summary-avatar">${this.avatar(this.person)}</span> <strong>${firstName}</strong></p>
          <p><span class="summary-muted">у тебя</span> <span aria-hidden="true">📅</span> <strong>${active ? active + ' ' + taskLabel : 'пока нет задач'}</strong></p>
          ${comments ? html`<p><span aria-hidden="true">💬</span> <button class="summary-comments" @click=${() => this.go('projects')}>
            ${comments} ${{ one: 'комментарий', few: 'комментария', many: 'комментариев' }[new Intl.PluralRules('ru').select(comments)]} ментора</button></p>`
            : note ? html`<p><span aria-hidden="true">💬</span> комментарий ментора</p>` : nothing}
        </section>
        <div class="home-inner-sheet">
          <section class="helper-panel">
            <h2 class="home-asset-heading stretch-title">скиллы</h2>
            <div class="home-chart-slot">${this.wheelCarousel()}</div>
          </section>
        </div>
      </div>`;
  }

  profile() {
    const { name, username, photos = [], createdAt } = this.person;
    return html`
      ${this.role === 'mentor' ? html`<div class="student-actions">
        <button class="text-button" @click=${() => this.go('skills')}>Навыки</button>
        <button class="text-button" @click=${() => this.go('calendar')}>Задачи</button>
        <button class="text-button" @click=${() => this.go('projects')}>Проекты</button>
      </div>` : nothing}
      <section class="profile-card3d" aria-label="Профиль, нажми чтобы перевернуть" tabindex="0"
        @pointerdown=${(event) => this.cardDown(event)} @pointermove=${(event) => this.cardMove(event)}
        @pointerup=${(event) => this.cardUp(event)} @pointercancel=${(event) => this.cardUp(event)}
        @keydown=${(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.manualMotion = true; this.cardTurn = (this.cardTurn ?? 0) + 180; this.turnCard(this.cardTurn, 0, false); } }}>
        <div class="profile-card-3d" style=${'--turn-y:' + (this.cardTurn ?? 0) + 'deg'}>
          ${Array.from({ length: 6 }, (_, index) => html`<span class="card-slice" style=${'--slice:' + index} aria-hidden="true"></span>`)}
          <div class="card-face card-front">
            <span class="card-role">${this.person.title || 'менти'}</span>
            <h1>${name}</h1>
            ${username ? html`<div class="profile-contact">@${username}</div>` : nothing}
          </div>
          <div class="card-face card-back">
            <span class="card-role">первый вход</span>
            <strong>${createdAt ? new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(createdAt)) : 'дата пока не записана'}</strong>
            <span>с этого дня начинается твой путь в единстве</span>
          </div>
        </div>
      </section>
      ${this.role === 'mentor' ? html`<button class="text-button profile-title-edit" @click=${() => this.open({ type: 'title' })}>роль на карточке: ${this.person.title || 'не задана'}</button>` : nothing}
      <section class="profile-lower memories" aria-labelledby="memories-title">
        <header class="memories-header">
          <h2 id="memories-title">воспоминания</h2>
          <p>делись своей работой с ментором</p>
        </header>
        <div class="photo-grid">
          ${this.role === 'mentee' ? html`<input class="memories-file" type="file" accept="image/*" hidden
            @change=${(event) => this.pickPhoto(event)}>
          <button class="memories-add" @click=${() => this.querySelector('.memories-file').click()}><span aria-hidden="true">+</span>добавить фото</button>` : nothing}
          ${photos.map((photo) => html`<figure>
            <img src=${photo.url} alt=${photo.caption || 'Фото рабочего процесса'} loading="lazy">
            <figcaption>
              ${photo.caption ? html`<p>${photo.caption}</p>` : nothing}
              <time datetime=${photo.date}>${dayLabel.format(parseDate(photo.date))}</time>
              ${this.role === 'mentee' ? html`<button class="text-button" aria-label=${'Удалить фото от ' + dayLabel.format(parseDate(photo.date))}
                @click=${() => this.removePhoto(photo)}>удалить</button>` : nothing}
            </figcaption>
          </figure>`)}
        </div>
        ${!photos.length && this.role === 'mentor' ? html`<p class="empty">фото пока нет.</p>` : nothing}
        ${this.photoError ? html`<p class="form-error photo-error" role="alert">${this.photoError}</p>` : nothing}
    </section>`;
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
      return assessment ? assessment.percent ?? assessment.score * 20 : level;
    });
  }

  wheelCarousel() {
    const groups = [
      { labels: softSkills, levels: this.softLevels(), color: 'green', wheel: 0 },
      ...this.person.hard.flatMap((group, index) => group.skills.length
        ? [{ detail: group.name, labels: group.skills, levels: group.levels, color: 'purple', wheel: index + 1 }]
        : []),
    ];
    const group = groups.find(({ wheel }) => wheel === this.activeWheel) ?? groups[0];
    const growth = this.growth;
    return html`<section class="home-wheel ${group.color}" aria-label="Круги навыков">
      ${this.activeWheel > 0 && groups.length > 2 ? html`<div class="wheel-groups" aria-label="Круги хардов">
        ${groups.slice(1).map((item) => html`<button aria-pressed=${this.activeWheel === item.wheel}
          @click=${() => this.setWheel(item.wheel)}>${item.detail}</button>`)}
      </div>` : nothing}
      <div class="wheel-stage" @click=${(event) => this.pickSector(event, group.labels.length)} @pointerdown=${(event) => this.wheelStart(event)}
        @pointerup=${(event) => this.wheelEnd(event, groups.map(({ wheel }) => wheel))}
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
      <div class="home-wheel-top wheel-switch-row">
        <div class="wheel-switch" aria-label="Тип навыков" role="group">
          <div class="wheel-tabs">
            <button aria-pressed=${this.activeWheel === 0} @click=${() => this.setWheel(0)}>Софты</button>
            ${groups.length > 1 ? html`<button aria-pressed=${this.activeWheel > 0} @click=${() => {
              if (this.activeWheel === 0) this.setWheel(groups[1].wheel);
            }}>Харды</button>` : nothing}
          </div>
        </div>
      </div>
      ${growth ? html`
        ${growth.to < growth.from ? html`<p class="skill-change" role="status">
          ${group.labels[growth.index]}: ${growth.from}% → ${growth.to}%</p>` : nothing}
        <button class="text-button growth-skip" @click=${() => this.finishGrowth(true)}>Пропустить анимацию</button>` : nothing}
      ${this.activeSector >= 0 ? keyed(this.activeSector, html`<div class="skill-readout" role="status">
        <span>${group.labels[this.activeSector]}</span>
        <strong>${group.levels[this.activeSector] === null ? 'Нет оценки' : group.levels[this.activeSector] + '%'}</strong>
        <skill-celebration class="skill-reveal" color=${group.color} cubes></skill-celebration>
      </div>`) : nothing}
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

  shiftWheel(step, wheels) {
    if (wheels.length < 2) return;
    const current = Math.max(0, wheels.indexOf(this.activeWheel));
    this.setWheel(wheels[(current + step + wheels.length) % wheels.length]);
  }

  async setWheel(index) {
    if (index !== 0 && !this.person.hard[index - 1]?.skills.length) return;
    if (this.growth && index !== this.activeWheel) this.finishGrowth(true);
    const changed = index !== this.activeWheel;
    if (changed) this.wheelMotion += 1;
    this.activeWheel = index;
    this.activeSector = -1;
    if (changed) {
      await this.updateComplete;
      this.animateFeedback(this.querySelector('.wheel-stage'));
      this.animateFeedback(this.querySelector('.wheel-switch-row'));
      this.animateFeedback(this.querySelector('.wheel-groups'));
    }
  }

  animateFeedback(element, offset = 5) {
    if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    element.getAnimations().filter((animation) => animation.id === 'feedback').forEach((animation) => animation.cancel());
    element.animate([
      { opacity: .35, transform: `translateY(${offset}px)` },
      { opacity: 1, transform: 'none' },
    ], { id: 'feedback', duration: 200, easing: 'ease-out' });
  }

  wheelStart(event) {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('button')) return;
    this.ignoreWheelClick = false;
    this.swipe = { x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch', moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  wheelEnd(event, wheels) {
    if (!this.swipe) return;
    const dx = event.clientX - this.swipe.x;
    const dy = event.clientY - this.swipe.y;
    const { touch, moved } = this.swipe;
    this.swipe = null;
    if (moved) {
      this.ignoreWheelClick = true;
      setTimeout(() => { this.ignoreWheelClick = false; }, 300);
    }
    if (touch && Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      this.shiftWheel(dx < 0 ? 1 : -1, wheels);
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
    if (this.swipe && Math.hypot(event.clientX - this.swipe.x, event.clientY - this.swipe.y) > 6) {
      this.swipe.moved = true;
      this.manualMotion = true;
    }
    if (!this.swipe?.moved && (event.pointerType !== 'mouse' || this.telegramOrientation && !this.manualMotion)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    this.tilt((0.5 - (event.clientY - bounds.top) / bounds.height) * 34,
      ((event.clientX - bounds.left) / bounds.width - 0.5) * 34, 0);
  }

  onOrientation(event) {
    if (this.manualMotion || this.motionState !== 'ready' || !['home', 'profile'].includes(this.page) || event.beta === null || event.gamma === null) return;
    const neutral = this.neutralOrientation ??= { beta: event.beta, gamma: event.gamma, alpha: event.alpha };
    const limit = (angle, max) => Math.max(-max, Math.min(max, angle));
    if (this.page === 'profile') {
      // Карточка профиля поворачивается за наклоном телефона, пока её не тянут пальцем.
      // Датчик шлёт события чаще кадров: применяем только последнее значение раз в кадр.
      this.cardTilt = [limit((event.gamma - neutral.gamma) * 1.1, 32), limit(-(event.beta - neutral.beta) * .8, 24)];
      this.cardFrame ||= requestAnimationFrame(() => {
        this.cardFrame = 0;
        if (!this.manualMotion && !this.cardDrag && this.page === 'profile') this.turnCard((this.cardTurn ?? 0) + this.cardTilt[0], this.cardTilt[1], true);
      });
      return;
    }
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
      // Наклон теперь приходит от Telegram, браузерное событие дало бы второй источник.
      window.removeEventListener('deviceorientation', this.orientWheel);
    });
  }

  skills() {
    return html`
      <div class="page-title">
        <div><h1>Навыки</h1><p>${this.person.name}</p></div>
        ${this.role === 'mentor' ? html`<button class="primary" @click=${() => this.open({ type: 'hard' })}>+ Круг хардов</button>` : nothing}
      </div>
      ${this.formError && !this.modal ? html`<p class="form-error" role="alert">${this.formError}</p>` : nothing}
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
          <span class="legend-dot" aria-hidden="true"></span><span>${label}</span>${edit ? nothing : html`<strong>${levels[index] === null ? 'Нет оценки' : levels[index] + '%'}</strong>`}
        </button>
        ${edit ? html`<label class="skill-percent"><input type="number" min="0" max="100" step="1" inputmode="numeric"
          aria-label=${'Процент: ' + label} .value=${levels[index] === null ? '' : String(levels[index])}
          .defaultValue=${levels[index] === null ? '' : String(levels[index])}
          @change=${(event) => this.savePercent(event, key, index)}>%</label>` : nothing}
        ${key === 'soft' && selected === index && this.person.soft ? html`<p class="skill-note detail">
          Оценка теста: ${this.person.soft[index]}%.
          ${this.person.mentorScores?.[index] ? html` Оценка ментора: ${this.person.mentorScores[index].percent ?? this.person.mentorScores[index].score * 20}%. ${this.person.mentorScores[index].reason ?? ''}` : nothing}
        </p>` : nothing}
        </li>`)}</ul>
    </section>`;
  }

  assessment() {
    const status = this.assessmentStatus;
    const remaining = questions.length - this.answers.length;
    const question = questions[this.answers.length];
    if (status === 'intro') {
      return html`<section class="assessment assessment-cover">
        <div class="assessment-motion" aria-hidden="true"><skill-celebration color="ink" orbit></skill-celebration></div>
        <h1>Начнём с софтов?</h1>
        <p>30 ситуаций, примерно 10–15 минут. Выбирай вариант, который ближе к тому, как ты обычно поступаешь.</p>
        <button class="primary" @click=${() => { this.assessmentStatus = 'questions'; }}>Начать</button>
      </section>`;
    }
    return html`<section class="assessment">
      <div class="assessment-progress">
        <strong>${Math.min(this.answers.length + 1, questions.length)} из ${questions.length}</strong>
        ${this.answers.length && question ? html`<button class="text-button" @click=${() => {
          this.pendingAnswer = this.answers.at(-1);
          this.answers = this.answers.slice(0, -1);
        }}>Назад</button>` : nothing}
      </div>
      <div class="assessment-segments" aria-label=${`Отвечено вопросов: ${this.answers.length} из ${questions.length}`}>
        ${questions.map((_, index) => html`<span class=${index < this.answers.length ? 'is-filled' : ''}></span>`)}
      </div>
      ${question ? keyed(this.answers.length, html`<div class="assessment-question"><h2>${question.title}</h2><div class="answer-list">
        ${shuffledAnswers(this.answers.length, question.answers).map(({ answer, index }) => html`<button aria-pressed=${this.pendingAnswer === index} @click=${() => { this.pendingAnswer = index; }}>${answer}</button>`)}
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
      // На рубежах отдельного экрана нет: следующий вопрос открывается сразу, а сцена пролетает поверх него.
      if (assessmentPauses.includes(this.answers.length)) this.assessmentPause = this.answers.length;
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
      // Финальная сцена закрывает экран маской и на кадре закрытия переключает его на «Скиллы».
      if (this.personId === id && this.page === 'assessment') this.finale = true;
    } catch {
      await this.refresh().catch(() => {});
      if (this.personId === id && this.page === 'assessment') {
        if (this.person.soft) this.finale = true;
        else this.assessmentStatus = 'error';
      }
    }
  }

  calendar() {
    const selected = parseDate(this.date);
    const currentDay = today();
    const tasks = this.personTasks;
    const filteredTasks = filterTasks(tasks, this.calendarFilter, this.date);
    const learner = this.role === 'mentee';
    const month = learner && this.monthView;
    const start = weekStart(this.date);
    const days = month ? monthGrid(this.date) : weekDays.map((_, index) => shiftDate(start, index));
    return html`
      ${learner ? html`<header class="home-person"><span>менти</span><p>${this.account.name.split(/\s+/)[0]}</p></header>`
        : html`<div class="page-title"><div><h1>Календарь</h1><p>${this.person.name}</p></div></div>`}
      <div class="calendar-layout">
        <section class="cal-card" @touchstart=${(event) => { this.weekTouch = event.changedTouches[0].clientX; }}
          @touchend=${(event) => {
            if (this.weekTouch === undefined) return;
            const distance = event.changedTouches[0].clientX - this.weekTouch;
            this.weekTouch = undefined;
            if (Math.abs(distance) > 44) this.movePeriod(distance < 0 ? 1 : -1);
          }}>
          <div class="cal-period-head">
            <div><h2 class="cal-month stretch-title">${monthName.format(selected)}</h2>
              ${month ? html`<span class="cal-year">${selected.getUTCFullYear()}</span>` : nothing}</div>
            ${learner ? html`<div class="cal-period" role="group" aria-label="Вид календаря">
              ${[[false, 'неделя'], [true, 'месяц']].map(([value, label]) => html`
                <button type="button" aria-pressed=${Boolean(this.monthView) === value}
                  @click=${() => { this.monthView = value; }}>${label}</button>`)}
            </div>` : nothing}
          </div>
          <div class="cal-week" aria-hidden="true">${weekDays.map((day) => html`<span>${day}</span>`)}</div>
          <div class="cal-week cal-days" ?data-month=${month} aria-label=${month ? 'Дни месяца' : 'Дни недели'}>
            ${days.map((key) => {
              const date = parseDate(key);
              const busy = tasks.some((task) => taskOnDay(task, key));
              const outside = month && key.slice(0, 7) !== this.date.slice(0, 7);
              return html`<button aria-label=${longDate.format(date) + (busy ? ', есть задачи' : '')} aria-pressed=${this.date === key}
                aria-current=${key === currentDay ? 'date' : nothing} class=${[busy && 'is-busy', outside && 'is-outside'].filter(Boolean).join(' ')}
                @click=${() => { this.date = key; this.calendarFilter = 'today'; }}><strong>${date.getUTCDate()}</strong></button>`;
            })}
          </div>
          <div class="cal-nav">
            <button class="text-button" @click=${() => this.movePeriod(-1)}>${month ? 'предыдущий месяц' : 'предыдущая'}</button>
            <button class="text-button" @click=${() => this.movePeriod(1)}>${month ? 'следующий месяц' : 'следующая'}</button>
          </div>
        </section>
        <section class="cal-list">
          ${month && this.calendarFilter === 'today' ? html`<h2 class="cal-selected-day">${longDate.format(selected)}</h2>` : nothing}
          <div class="cal-toggle" role="tablist" aria-label="Фильтр задач">
            ${[['today', 'все'], ['new', 'новые']].map(([value, label]) => html`<button role="tab" aria-selected=${this.calendarFilter === value}
              @click=${() => { this.calendarFilter = value; }}>${label}</button>`)}
          </div>
          ${filteredTasks.length
            ? html`<div class="agenda">${filteredTasks.map((task) => this.calendarTask(task))}</div>`
            : html`<p class="agenda-empty">${this.calendarFilter === 'new' ? 'за неделю новых задач нет.' : 'на этот день задач нет.'}</p>`}
          ${this.personId ? html`<div class="calendar-actions">
            <button class="text-button" @click=${() => this.open({ type: 'create' })}>+ задача</button>
            ${!learner ? html`<button class="text-button" @click=${() => this.open({ type: 'import-calendar' })}>импорт .ics</button>` : nothing}
          </div>` : nothing}
          ${!learner && this.calendarImportStatus ? html`<p role="status">${this.calendarImportStatus}</p>` : nothing}
        </section>
      </div>`;
  }

  calendarTask(task) {
    const project = this.person.projects.find((item) => item.id === task.projectId);
    const editable = this.role === 'mentor' || task.movable;
    const starts = task.startDate ?? task.date;
    const ends = task.endDate ?? task.date;
    const range = ends !== starts
      ? `${dayLabel.format(parseDate(starts))} до ${dayLabel.format(parseDate(ends))}`
      : task.endTime && task.endTime !== task.time ? `${task.time} — ${task.endTime}` : '';
    return html`<div class="agenda-row">
      <time class="agenda-time" datetime=${task.allDay ? starts : starts + 'T' + task.time}>${task.allDay && starts === ends ? 'весь день' : range || task.time}</time>
      <div><strong>${task.title}</strong>
        ${project ? html`<button class="task-project" @click=${() => { this.selectedProject = project; this.go('project'); }}>${project.name}</button>` : nothing}
        <p>${task.done ? 'Завершено' : editable ? 'Можно перенести' : 'Дата закреплена'}</p>
      </div>
      ${editable && !task.done ? html`<button class="round" aria-label=${'Перенести или привязать проект: ' + task.title}
        @click=${() => this.open({ type: 'move', task })}>Изменить</button>` : nothing}
    </div>`;
  }

  movePeriod(step) {
    this.date = this.role === 'mentee' && this.monthView ? shiftMonth(this.date, step) : shiftDate(this.date, step * 7);
  }

  learnerTitle(title) {
    return html`<header class="home-person"><span>менти</span><p>${this.account.name.split(/\s+/)[0]}</p></header>
      <h1 class="learner-section-title"><span class="stretch-title">${title}</span></h1>`;
  }

  projects() {
    return html`
      ${this.role === 'mentee' ? this.learnerTitle('проекты') : html`<div class="page-title"><div><h1>Проекты</h1><p>${this.person.name}</p></div></div>`}
      <div class="project-folders">
        ${this.person.projects.map((project) => this.projectCard(project))}
        ${this.personId ? html`<button class="project-folder" @click=${() => this.open({ type: 'new-project', step: 1 })}>
          <span class="folder-art new-folder-art" aria-hidden="true">
            <img src="/mobile-home/new-folder.svg" alt=""><span>+</span>
          </span><strong>Новый проект</strong></button>` : nothing}
      </div>`;
  }

  projectCard(project) {
    const folder = folders.some(([id]) => id === project.folder) ? project.folder : 'gel';
    const unread = project.comments?.filter((comment) => this.commentUnread(comment)).length;
    return html`<button class="project-folder" data-project-id=${project.id} @click=${() => { this.selectedProject = project; this.go('project'); }}>
      <span class="folder-art"><img src=${'/folders/' + folder + '.webp'} alt="" loading="lazy"></span>
      <strong>${project.name}</strong>
      ${unread ? html`<small class="unread-comments">новые комментарии: ${unread}</small>` : nothing}
      ${project.description ? html`<small>${project.description}</small>` : nothing}
    </button>`;
  }

  projectPage() {
    const project = this.person.projects.find((item) => item.id === this.selectedProject?.id);
    if (!project) return this.projects();
    const weeks = this.projectWeeks(project);
    return html`<button class="text-button project-back" @click=${() => this.go('projects')}>← проекты</button>
      <section class="project-page"><h1>${project.name}</h1>
        ${project.description ? html`<p>${project.description}</p>` : nothing}
        <div class="sources">${(project.sources ?? []).map((source) => html`<a href=${source.url} target="_blank" rel="noopener noreferrer">${source.type} ↗</a>`)}</div>
        <section class="project-plan"><h2>план обучения</h2>
          ${weeks.length ? weeks : html`<p class="empty">пока нет задач.</p>`}
          <div class="project-actions">
            <button class="primary" @click=${() => this.open({ type: 'create', project })}>+ задача</button>
            ${this.linkableTasks().length ? html`<button class="text-button"
              @click=${() => this.open({ type: 'link-existing', project })}>привязать из календаря</button>` : nothing}
          </div>
        </section>
        <section class="project-comments"><h2>комментарии ментора</h2>
          ${project.comments?.length ? html`<ul>${project.comments.map((comment) => html`<li><strong data-unread-comment=${this.commentUnread(comment) ? comment.id : nothing}>${comment.author}</strong>
            ${this.commentUnread(comment) ? html`<span class="unread-comments">новый</span>` : nothing}
            <time datetime=${comment.createdAt}>${dayLabel.format(new Date(comment.createdAt))}</time>
            <p>${comment.text}</p></li>`)}</ul>` : html`<p class="empty">пока нет комментариев.</p>`}
          ${this.role === 'mentor' ? html`<form autocapitalize="none" @submit=${(event) => this.addProjectComment(event, project)}>
            <label>Комментарий<textarea name="text" maxlength="1000" rows="2" required></textarea></label>
            ${this.formError && !this.modal ? html`<p class="form-error" role="alert">${this.formError}</p>` : nothing}
            <button class="primary" ?disabled=${this.formBusy}>Добавить комментарий</button>
          </form>` : nothing}
        </section>
      </section>`;
  }

  async open(modal, clear = true) {
    this.modal = modal;
    if (clear) this.formError = '';
    await this.updateComplete;
    const dialog = this.querySelector('dialog');
    if (!dialog.open) {
      dialog.showModal();
      if (modal.type === 'new-project') this.animateFeedback(dialog, 10);
    } else (dialog.querySelector('form input, form select') ?? dialog.querySelector('.dialog-top button'))?.focus();
  }

  linkableTasks() {
    return this.personTasks.filter((task) => !task.projectId && (this.role === 'mentor' || task.movable));
  }

  projectWeeks(project) {
    return tasksByWeek(this.personTasks.filter((item) => item.projectId === project.id)).map(([start, tasks]) => {
      const monday = parseDate(start);
      const sunday = parseDate(shiftDate(start, 6));
      return html`<section class="project-week">
        <h3>${dayLabel.formatRange(monday, sunday)}</h3>
        ${tasks.map((task) => html`<button class="project-task" @click=${() => {
          this.selectedProject = project;
          this.date = task.date;
          this.calendarFilter = 'today';
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
      form.reset();
    } catch (error) {
      this.formError = error.message;
    } finally {
      this.formBusy = false;
    }
  }

  async projectStep(step) {
    this.formError = '';
    this.modal = { ...this.modal, step };
    await this.updateComplete;
    this.querySelector('#dialog-title')?.focus();
    const body = this.querySelector('.wizard-body');
    if (body) body.scrollTop = 0;
    this.animateFeedback(body);
  }

  modalContent() {
    const { type, task, project, key, index, label, step } = this.modal;
    const title = {
      hard: 'Новый круг хардов', title: 'Роль на карточке', create: 'Новая задача', move: 'Перенести задачу',
      photo: 'Новое воспоминание', 'import-calendar': 'Импорт календаря',
      'new-project': step === 3 ? 'Выбери папку' : 'Новый проект', 'link-existing': 'Привязать задачу',
    }[type];
    return html`
      ${type === 'new-project' && step > 1 ? html`<button class="text-button wizard-back" type="button"
        @click=${() => this.projectStep(step - 1)}>назад</button>` : nothing}
      <div class="dialog-top"><h2 id="dialog-title" tabindex="-1">${title}</h2><button class="round" type="button" aria-label="Закрыть" ?disabled=${this.formBusy} @click=${() => this.querySelector('dialog').close()}>×</button></div>
      <form autocapitalize="none" @submit=${(event) => this.save(event)}>
          ${type === 'title' ? html`
            <label>Роль, например дизайнер<input name="title" required maxlength="40" .value=${this.person.title ?? ''}></label>`
          : type === 'hard' ? html`
            <label>Название<input name="name" required maxlength="70"></label>
            <label>До 10 навыков через запятую<input name="skills" required maxlength="300" placeholder="Git, Docker, LLM"></label>`
          : type === 'new-project' ? html`<div class="wizard-body">
            <fieldset class="project-step" ?hidden=${step !== 1}>
              <label>Название<input name="name" required maxlength="80" placeholder="название проекта"></label>
            </fieldset>
            <fieldset class="project-step" ?hidden=${step !== 2}>
              <label>Описание<textarea name="description" maxlength="160" rows="2" placeholder="Что ты хочешь сделать?"></textarea></label>
              <details class="project-links"><summary>Добавить ссылку</summary>
                ${Array.from({ length: this.modal.linkCount ?? 1 }, (_, offset) => offset + 1).map((index) => html`<div class="project-link-row">
                  <label>название ссылки ${index}<input name=${'linkName' + index} maxlength="70" placeholder="например, репозиторий"></label>
                  <label>ссылка ${index}<input name=${'linkUrl' + index} type="url" maxlength="400" placeholder="https://"></label>
                </div>`)}
                ${(this.modal.linkCount ?? 1) < 3 ? html`<button class="text-button" type="button" @click=${() => { this.modal = { ...this.modal, linkCount: (this.modal.linkCount ?? 1) + 1 }; }}>+ добавить ещё ссылку</button>` : nothing}
              </details>
            </fieldset>
            <fieldset class="project-step" ?hidden=${step !== 3}>
              <div class="folder-options">${folders.map(([id, name]) => html`
                <label><input type="radio" name="folder" value=${id} ?checked=${id === 'gel'}>
                  <img src=${step === 3 ? '/folders/' + id + '.webp' : nothing} alt=""><span>${name}</span></label>`)}</div>
            </fieldset>
            </div>`
          : type === 'link-existing' ? html`
            <label>Задача<select name="taskId" aria-label="Задача" required>
              ${this.linkableTasks().map((item) => html`<option value=${item.id}>${item.title}, ${dayLabel.format(parseDate(item.date))}</option>`)}
            </select></label>`
          : type === 'import-calendar' ? html`
            <p>События из файла появятся в календаре менти ${this.person.name}.</p>
            <label>Файл .ics<input name="calendarFile" type="file" accept=".ics,text/calendar" required></label>`
          : type === 'photo' ? html`
            ${this.modal.preview ? html`<img class="photo-preview" src=${this.modal.preview} alt="">` : nothing}
            <label>Описание<input name="caption" maxlength="120" placeholder="над чем работаешь?"></label>`
          : html`
            ${type === 'create' ? html`<label>Задача<input name="title" required maxlength="100"></label>` : html`<p>${task.title}</p>`}
            <div class="task-range"><label>начало<input type="date" name="startDate" required .value=${task?.startDate ?? task?.date ?? this.date}></label>
            <label>конец<input type="date" name="endDate" required .value=${task?.endDate ?? task?.date ?? this.date}></label></div>
            ${task?.allDay ? html`<p>Событие на весь день</p>` : html`<div class="task-range"><label>с<input type="time" name="time" required .value=${task?.time ?? '18:00'}></label>
            <label>до<input type="time" name="endTime" required .value=${task?.endTime ?? task?.time ?? '19:00'}></label></div>`}
            ${this.person.projects.length ? html`<label>Проект<select name="projectId" aria-label="Проект">
              <option value="">Без проекта</option>
              ${this.person.projects.map((item) => html`<option value=${item.id}
                ?selected=${item.id === (project?.id ?? task?.projectId)}>${item.name}</option>`)}
            </select></label>` : nothing}
            ${type === 'create' && this.role === 'mentor' ? html`<label class="check"><input type="checkbox" name="movable"> Менти может перенести задачу</label>` : nothing}`}
          ${this.formError ? html`<p class="form-error" role="alert">${this.formError}</p>` : nothing}
          <button class="primary" type="submit" ?disabled=${this.formBusy}>${this.formBusy ? 'Сохраняем…' : type === 'new-project' ? (step === 3 ? 'Создать проект' : 'Дальше') : type === 'photo' ? 'Отправить' : type === 'import-calendar' ? 'Импортировать' : 'Сохранить'}</button>
        </form>`;
  }

  async save(event) {
    event.preventDefault();
    if (this.formBusy) return;
    const { type, task, project, key, index, step } = this.modal;
    let createdProjectId;
    if (type === 'new-project' && step !== 3) {
      if (step === 1 && !event.currentTarget.elements.name.value.trim()) {
        this.formError = 'Укажи название проекта.';
        return;
      }
      await this.projectStep(step + 1);
      return;
    }
    const data = new FormData(event.currentTarget);
    const value = (name) => String(data.get(name) ?? '').trim();
    this.formBusy = true;
    this.formError = '';
    try {
      if (type === 'title') {
        await this.mutate('title', { title: value('title') });
      } else if (type === 'hard') {
        await this.mutate('hard', { name: value('name'), skills: value('skills').split(',') });
      } else if (type === 'photo') {
        const photo = await compressPhoto(this.modal.file);
        await this.mutate('photo', { mime: 'image/jpeg', contents: await encodePhoto(photo), caption: value('caption') });
        this.photoError = '';
      } else if (type === 'new-project') {
        ({ projectId: createdProjectId } = await this.mutate('project', {
          name: value('name'), description: value('description'), folder: value('folder'), links: Array.from({ length: this.modal.linkCount ?? 1 }, (_, offset) => offset + 1).map((index) => ({
            name: value('linkName' + index), url: value('linkUrl' + index),
          })),
        }));
      } else if (type === 'import-calendar') {
        const file = data.get('calendarFile');
        if (!file?.size || file.size > 512 * 1024 || !/\.ics$/i.test(file.name)) {
          throw new Error('Выбери файл .ics до 512 КБ.');
        }
        const result = await this.mutate('import-calendar', { ics: await file.text() });
        this.calendarImportStatus = `добавлено: ${result.imported}. уже в календаре: ${result.duplicates}.`;
        if (result.firstDate) {
          this.date = result.firstDate;
          this.calendarFilter = 'today';
        }
      } else if (type === 'link-existing') {
        await this.mutate('link-task', { id: value('taskId'), projectId: project.id });
      } else {
        const startDate = value('startDate');
        const endDate = value('endDate');
        const time = task?.allDay ? '00:00' : value('time');
        const endTime = task?.allDay ? '23:59' : value('endTime');
        await this.mutate(type === 'create' ? 'create-task' : 'move-task', {
          title: value('title'), id: task?.id, date: startDate, startDate, endDate, time, endTime, projectId: value('projectId'), movable: data.has('movable'),
        });
        this.date = startDate;
      }
      await this.refresh();
      this.querySelector('dialog').close();
      if (createdProjectId) {
        await this.updateComplete;
        const tile = this.querySelector(`[data-project-id="${CSS.escape(createdProjectId)}"]`);
        tile?.focus({ preventScroll: true });
        tile?.scrollIntoView({ block: 'nearest' });
        this.animateFeedback(tile, 12);
      }
    } catch (error) {
      this.formError = error.message;
    } finally {
      this.formBusy = false;
    }
  }

}

customElements.define('learn-app', LearnApp);

import { User } from 'firebase/auth';
import { onAuthChange, loginWithGoogle, logout } from './auth';
import { showToast, openOverlay, closeOverlay, textEl, button } from './ui';
import { submitFeedback } from './feedback';
import { todayKey, labelOf, monthKey, daysInMonth, parseKey } from './dates';
import { subscribeSteps, createStep, updateStep, deleteStep } from './store';
import {
  activeDays, dayStreak, bestStreak, stepsOn, monthSteps, titleOf, countByArea, monthlyCounts,
  lookbacks, kindPercent, daysBetween,
} from './stats';
import {
  KINDS, AREAS, STEP_EXAMPLES, TITLES, STREAK_MILESTONES, KindKey, kindOf, areaLabel, Option,
} from './data';
import { Step, StepInput } from './types';
import { initClickTracking, track } from './analytics';
import { initTextareas, autoGrow, renderMemoView } from './memo-ui';
import { renderRankCard, announceRankUp, celebrate, showPopup, pickOne } from './wakuwaku';

initClickTracking();

// ============================================================
// DOM
// ============================================================
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const loginScreen = $('login-screen');
const appEl = $('app');
const userInfo = $('user-info');
const userAvatar = $<HTMLImageElement>('user-avatar');
const userName = $('user-name');
const btnGoogleLogin = $<HTMLButtonElement>('btn-google-login');
const btnLogout = $<HTMLButtonElement>('btn-logout');

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs__btn'));
const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));

const stepOverlay = $('step-modal-overlay');
const stepForm = $<HTMLFormElement>('step-form');
const inputStepText = $<HTMLInputElement>('input-step-text');
const inputStepDate = $<HTMLInputElement>('input-step-date');
const inputStepNote = $<HTMLTextAreaElement>('input-step-note');
const btnStepDelete = $<HTMLButtonElement>('btn-step-delete');
const btnStepSubmit = $<HTMLButtonElement>('btn-step-submit');

const confirmOverlay = $('confirm-dialog-overlay');
const btnConfirmOk = $<HTMLButtonElement>('btn-confirm-ok');

const feedbackOverlay = $('feedback-modal-overlay');
const inputFeedbackMessage = $<HTMLTextAreaElement>('input-feedback-message');
const btnFeedbackSend = $<HTMLButtonElement>('btn-feedback-send');

// ============================================================
// State
// ============================================================
type View = 'home' | 'look' | 'grow';

const now = new Date();
const state = {
  uid: null as string | null,
  steps: [] as Step[],
  loaded: false,
  view: 'home' as View,
  calYear: now.getFullYear(),
  calMonth0: now.getMonth(),
  calSelected: '' as string,
  kindFilter: 'all',
  areaFilter: 'all',
  gachaId: '' as string,
  pending: new Set<string>(),
  confirmAction: null as null | (() => Promise<void>),
  unsubscribers: [] as (() => void)[],
  editingId: null as string | null,
  formKind: 'kaizen' as KindKey,
  formArea: '',
};

// ============================================================
// Helpers
// ============================================================
/** 二重送信を防ぎつつ、失敗時はトーストで知らせる */
async function run(key: string, task: () => Promise<void>, errorMessage: string): Promise<boolean> {
  if (state.pending.has(key)) return false;
  state.pending.add(key);
  renderAll();
  try {
    await task();
    return true;
  } catch (err) {
    console.error(err);
    showToast(errorMessage);
    return false;
  } finally {
    state.pending.delete(key);
    renderAll();
  }
}

function askConfirm(title: string, text: string, okLabel: string, action: () => Promise<void>): void {
  $('confirm-dialog-title').textContent = title;
  $('confirm-dialog-text').textContent = text;
  btnConfirmOk.textContent = okLabel;
  state.confirmAction = action;
  openOverlay(confirmOverlay);
}

function el(tag: string, className: string, children: (Node | null)[] = []): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  children.forEach((c) => { if (c) e.appendChild(c); });
  return e;
}

/** 単一選択のチップ */
function renderChips(box: HTMLElement, options: Option[], selected: string, onPick: (key: string) => void, allowEmpty = true): void {
  box.replaceChildren(...options.map((o) => {
    const b = button(o.label, `chip${o.key === selected ? ' is-active' : ''}`, () => {
      onPick(allowEmpty && o.key === selected ? '' : o.key);
    });
    b.setAttribute('aria-pressed', String(o.key === selected));
    return b;
  }));
}

function kindBadge(kind: KindKey): HTMLElement {
  return textEl('span', `kind-badge kind-badge--${kind}`, kindOf(kind).label);
}

function agoLabel(date: string): string {
  const d = daysBetween(date, todayKey());
  if (d <= 0) return 'きょう';
  if (d === 1) return 'きのう';
  if (d < 30) return `${d}日前`;
  if (d < 365) return `${Math.floor(d / 30)}か月前`;
  return `${Math.floor(d / 365)}年前`;
}

/** 前進のカード（タップで編集） */
function stepCard(s: Step, opts: { showDate?: boolean } = {}): HTMLElement {
  const meta = [opts.showDate ? labelOf(s.date) : '', areaLabel(s.area)].filter(Boolean).join('・');
  const card = el('button', `step-card step-card--${s.kind}`, [
    el('span', 'step-card__head', [
      kindBadge(s.kind),
      meta ? textEl('span', 'step-card__meta', meta) : null,
    ]),
    textEl('span', 'step-card__text', s.text),
  ]);
  // カード自体がボタンなので、メモはリンク化せず2行に折りたたんで見せる（全文は編集画面で）
  if (s.note) card.append(textEl('span', 'step-card__note', s.note));
  (card as HTMLButtonElement).type = 'button';
  card.addEventListener('click', () => openStepModal(s, null, null));
  return card;
}

// ============================================================
// 画面切り替え
// ============================================================
function switchView(view: View): void {
  state.view = view;
  tabButtons.forEach((b) => {
    const active = b.dataset.tab === view;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });
  panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== view));
  renderAll();
  window.scrollTo({ top: 0 });
}

// ============================================================
// きょう
// ============================================================
function renderHome(): void {
  const today = todayKey();
  $('today-date').textContent = labelOf(today);

  $('kind-picks').replaceChildren(...KINDS.map((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `kind-pick kind-pick--${k.key}`;
    b.dataset.track = `pick_${k.key}`;
    b.disabled = !state.loaded;
    b.append(textEl('span', 'kind-pick__label', k.label), textEl('span', 'kind-pick__hint', k.hint));
    b.addEventListener('click', () => openStepModal(null, k.key, today));
    return b;
  }));

  const todays = stepsOn(state.steps, today);
  $('today-count').textContent = todays.length ? `${todays.length}件` : '';
  const todayList = $('today-list');
  if (!state.loaded) {
    todayList.replaceChildren(textEl('p', 'loading', '読み込み中…'));
  } else if (todays.length === 0) {
    const streak = dayStreak(state.steps, today);
    todayList.replaceChildren(textEl('p', 'muted-text', streak > 0
      ? `きのうまで${streak}日連続で前進しています。きょうも1つ記録して、連続をのばしましょう`
      : 'まだ記録はありません。小さなことでも、きのうよりよくなったことを1つ記録してみましょう'));
  } else {
    todayList.replaceChildren(...todays.map((s) => stepCard(s)));
  }

  const t = new Date();
  $('stat-total').textContent = String(state.steps.length);
  $('stat-streak').textContent = String(dayStreak(state.steps, today));
  $('stat-month').textContent = String(monthSteps(state.steps, monthKey(t.getFullYear(), t.getMonth())).length);

  const title = titleOf(state.steps.length);
  renderRankCard($('rank-card'), title, '前進1つで1');
  const xpEl = $('rank-card').querySelector('.waku-rank__xp');
  if (xpEl) xpEl.textContent = `${state.steps.length}個`;
  const nextEl = $('rank-card').querySelector('.waku-rank__next');
  if (nextEl) {
    nextEl.textContent = title.next
      ? `あと${title.next.min - state.steps.length}個の前進で「${title.next.name}」`
      : '最高の称号です。これからも、きのうの自分を超えていきましょう。';
  }
  if (state.uid) {
    announceRankUp(`maeyori-cho:title:${state.uid}`, title, state.loaded, `これまでに${state.steps.length}個の前進を積み重ねました。`);
  }

  renderLookbacks();
  renderGacha();
}

function renderLookbacks(): void {
  const list = $('lookback-list');
  if (!state.loaded) {
    list.replaceChildren();
    return;
  }
  const items: HTMLElement[] = [];
  lookbacks().forEach((lb) => {
    const steps = stepsOn(state.steps, lb.date);
    if (steps.length === 0) return;
    items.push(el('div', 'lookback', [
      el('div', 'lookback__head', [
        textEl('span', 'lookback__label', lb.label),
        textEl('span', 'lookback__date', labelOf(lb.date)),
      ]),
      el('div', 'step-list', steps.slice(0, 3).map((s) => stepCard(s))),
    ]));
  });
  list.replaceChildren(...(items.length
    ? items
    : [textEl('p', 'muted-text', '1週間前・1か月前・1年前の同じ日に記録した前進が、ここに出てきます')]));
}

function renderGacha(): void {
  const box = $('gacha-box');
  const past = state.steps.filter((s) => s.date < todayKey());
  box.replaceChildren();
  if (past.length === 0) {
    box.append(textEl('p', 'waku-gacha__lead', 'きのう以前の前進がたまると、ここで見返せます'));
    return;
  }
  const picked = past.find((s) => s.id === state.gachaId);
  if (picked) {
    const card = el('div', `gacha-card gacha-card--${picked.kind}`, [
      el('div', 'gacha-card__head', [
        kindBadge(picked.kind),
        textEl('span', 'gacha-card__ago', `${agoLabel(picked.date)}・${labelOf(picked.date)}`),
      ]),
      textEl('div', 'gacha-card__text', picked.text),
    ]);
    if (picked.note) {
      const note = el('div', 'gacha-card__note');
      renderMemoView(note, picked.note, { clampLines: 3 });
      card.append(note);
    }
    box.append(card);
  } else {
    box.append(textEl('p', 'waku-gacha__lead', `これまでの${past.length}個の前進から、1つを引いてみましょう`));
  }
  const b = button(picked ? 'もう1回引く' : 'ガチャを引く', 'waku-gacha__draw', () => drawGacha(past));
  b.dataset.track = 'gacha';
  box.append(b);
}

function drawGacha(past: Step[]): void {
  // 同じものが続かないように、前回以外から選ぶ
  const pool = past.length > 1 ? past.filter((s) => s.id !== state.gachaId) : past;
  const s = pickOne(pool);
  if (!s) return;
  state.gachaId = s.id;
  renderGacha();
}

// ============================================================
// ふりかえり
// ============================================================
function renderLook(): void {
  const y = state.calYear;
  const m0 = state.calMonth0;
  const ym = monthKey(y, m0);
  const today = todayKey();
  $('cal-title').textContent = `${y}年${m0 + 1}月`;
  const nextBtn = $<HTMLButtonElement>('btn-next-month');
  nextBtn.disabled = ym >= today.slice(0, 7);

  const month = monthSteps(state.steps, ym);
  const perDay = new Map<string, number>();
  month.forEach((s) => perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1));

  const cal = $('calendar');
  const cells: HTMLElement[] = ['月', '火', '水', '木', '金', '土', '日'].map((d) => textEl('div', 'calendar__dow', d));
  const first = (new Date(y, m0, 1).getDay() + 6) % 7;
  for (let i = 0; i < first; i += 1) cells.push(el('div', 'calendar__cell is-blank'));
  const days = daysInMonth(y, m0);
  for (let d = 1; d <= days; d += 1) {
    const key = `${ym}-${String(d).padStart(2, '0')}`;
    const count = perDay.get(key) ?? 0;
    const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3;
    const cell = el('button', `calendar__cell lv-${level}${key === today ? ' is-today' : ''}${key === state.calSelected ? ' is-selected' : ''}${key > today ? ' is-future' : ''}`, [
      textEl('span', 'calendar__day', String(d)),
      count ? textEl('span', 'calendar__dot', String(count)) : null,
    ]);
    (cell as HTMLButtonElement).type = 'button';
    (cell as HTMLButtonElement).disabled = key > today;
    cell.setAttribute('aria-label', `${m0 + 1}月${d}日 ${count}件`);
    cell.addEventListener('click', () => {
      state.calSelected = state.calSelected === key ? '' : key;
      renderLook();
    });
    cells.push(cell);
  }
  cal.replaceChildren(...cells);

  const activeCount = perDay.size;
  $('cal-summary').textContent = month.length
    ? `${m0 + 1}月は${activeCount}日前進して、${month.length}個の前進を積み重ねました`
    : `${m0 + 1}月の前進はまだありません`;

  renderChips($('kind-filter'), [{ key: 'all', label: 'すべて' }, ...KINDS.map((k) => ({ key: k.key, label: k.label }))], state.kindFilter, (k) => {
    state.kindFilter = k || 'all';
    renderLook();
  }, false);
  const usedAreas = new Set(month.map((s) => s.area).filter(Boolean));
  const areaBox = $('area-filter');
  const areaOptions = AREAS.filter((a) => usedAreas.has(a.key));
  if (state.areaFilter !== 'all' && !usedAreas.has(state.areaFilter)) state.areaFilter = 'all';
  areaBox.classList.toggle('hidden', areaOptions.length < 2);
  renderChips(areaBox, [{ key: 'all', label: 'すべての分野' }, ...areaOptions], state.areaFilter, (k) => {
    state.areaFilter = k || 'all';
    renderLook();
  }, false);

  let list = state.calSelected ? month.filter((s) => s.date === state.calSelected) : month;
  if (state.kindFilter !== 'all') list = list.filter((s) => s.kind === state.kindFilter);
  if (state.areaFilter !== 'all') list = list.filter((s) => s.area === state.areaFilter);

  const titleEl = $('look-title');
  titleEl.firstChild!.textContent = state.calSelected ? `${labelOf(state.calSelected)}の前進 ` : 'この月の前進 ';
  $('look-count').textContent = `${list.length}件`;

  const box = $('look-list');
  if (!state.loaded) {
    box.replaceChildren(textEl('p', 'loading', '読み込み中…'));
  } else if (list.length === 0) {
    box.replaceChildren(textEl('p', 'muted-text', state.calSelected
      ? 'この日の前進はありません。思い出したら「＋ 前の日を記録」から残せます'
      : 'この条件の前進はありません'));
  } else {
    // 日付ごとにまとめて表示する
    const groups: HTMLElement[] = [];
    let curDate = '';
    let curList: HTMLElement | null = null;
    list.forEach((s) => {
      if (s.date !== curDate) {
        curDate = s.date;
        curList = el('div', 'step-list');
        groups.push(el('div', 'day-group', [
          el('div', 'day-group__head', [
            textEl('span', 'day-group__date', labelOf(s.date)),
            textEl('span', 'day-group__ago', agoLabel(s.date)),
          ]),
          curList,
        ]));
      }
      curList!.append(stepCard(s));
    });
    box.replaceChildren(...groups);
  }
}

function moveMonth(delta: number): void {
  const d = new Date(state.calYear, state.calMonth0 + delta, 1);
  const t = new Date();
  if (d > new Date(t.getFullYear(), t.getMonth(), 1)) return;
  state.calYear = d.getFullYear();
  state.calMonth0 = d.getMonth();
  state.calSelected = '';
  renderLook();
}

// ============================================================
// せいちょう
// ============================================================
const WALL_MAX = 300;

function renderGrow(): void {
  const steps = state.steps;
  $('wall-total').textContent = String(steps.length);

  // 古い順に下から積む（新しいものほど上）。多すぎるときは直近だけ
  const wall = $('wall');
  const shown = steps.slice(0, WALL_MAX).reverse();
  const bricks = shown.map((s, i) => {
    const b = el('span', `wall__brick wall__brick--${s.kind}${i === shown.length - 1 ? ' is-new' : ''}`);
    return b;
  });
  if (bricks.length === 0) {
    wall.replaceChildren(textEl('span', 'wall__empty', 'ここに前進のブロックが積み上がります'));
  } else {
    wall.replaceChildren(...bricks);
  }
  $('wall-legend').replaceChildren(
    ...KINDS.map((k) => el('span', 'wall-legend__item', [el('span', `wall-legend__swatch wall__brick--${k.key}`), document.createTextNode(k.label)])),
    ...(steps.length > WALL_MAX ? [textEl('span', 'wall-legend__note', `直近${WALL_MAX}個を表示`)] : []),
  );

  const first = steps.length ? steps[steps.length - 1].date : '';
  $('grow-days').textContent = String(activeDays(steps).size);
  $('grow-best').textContent = String(bestStreak(steps));
  $('grow-since').textContent = first ? String(daysBetween(first, todayKey()) + 1) : '0';

  // 月ごと（直近6か月）
  const months = monthlyCounts(steps, 6);
  const max = Math.max(1, ...months.map((m) => m.count));
  $('month-chart').replaceChildren(...months.map((m) => {
    const bar = el('span', 'month-chart__bar');
    bar.style.height = `${Math.round((m.count / max) * 100)}%`;
    return el('div', 'month-chart__col', [
      textEl('span', 'month-chart__value', String(m.count)),
      el('span', 'month-chart__track', [bar]),
      textEl('span', 'month-chart__label', m.label),
    ]);
  }));

  $('kind-bars').replaceChildren(...kindPercent(steps).map((k) => barRow(k.label, k.count, steps.length ? `${k.count}個・${k.percent}%` : '0個', k.percent, `bar-row__fill--${k.key}`)));

  const areas = countByArea(steps);
  const areaMax = Math.max(1, ...Array.from(areas.values()));
  const areaRows = AREAS.filter((a) => areas.has(a.key))
    .sort((a, b) => (areas.get(b.key) ?? 0) - (areas.get(a.key) ?? 0))
    .map((a) => {
      const c = areas.get(a.key) ?? 0;
      return barRow(a.label, c, `${c}個`, Math.round((c / areaMax) * 100), '');
    });
  $('area-bars').replaceChildren(...(areaRows.length
    ? areaRows
    : [textEl('p', 'muted-text', '記録するときに分野を選ぶと、どの分野で前進しているかがわかります')]));

  const count = steps.length;
  $('title-list').replaceChildren(...TITLES.slice(1).map((t) => {
    const got = count >= t.min;
    return el('div', `title-item${got ? ' is-got' : ''}`, [
      textEl('span', 'title-item__name', got ? t.name : '？？？'),
      textEl('span', 'title-item__min', got ? `${t.min}個で獲得` : `${t.min}個で解放・あと${t.min - count}個`),
    ]);
  }));
}

function barRow(label: string, _count: number, valueText: string, percent: number, fillClass: string): HTMLElement {
  const fill = el('span', `bar-row__fill ${fillClass}`.trim());
  fill.style.width = `${percent}%`;
  return el('div', 'bar-row', [
    el('div', 'bar-row__top', [textEl('span', 'bar-row__label', label), textEl('span', 'bar-row__value', valueText)]),
    el('div', 'bar-row__track', [fill]),
  ]);
}

function renderAll(): void {
  if (!state.uid) return;
  if (state.view === 'home') renderHome();
  else if (state.view === 'look') renderLook();
  else renderGrow();
}

// ============================================================
// 前進の記録モーダル
// ============================================================
function renderFormChips(): void {
  const seg = $('step-kind');
  seg.replaceChildren(...KINDS.map((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `kind-seg__btn kind-seg__btn--${k.key}${state.formKind === k.key ? ' is-active' : ''}`;
    b.setAttribute('aria-pressed', String(state.formKind === k.key));
    b.append(textEl('span', 'kind-seg__label', k.label), textEl('span', 'kind-seg__hint', k.hint));
    b.addEventListener('click', () => {
      state.formKind = k.key;
      renderFormChips();
    });
    return b;
  }));
  inputStepText.placeholder = kindOf(state.formKind).example;
  renderChips($('step-area'), AREAS, state.formArea, (k) => {
    state.formArea = k;
    renderFormChips();
  });
  const examples = $('step-examples');
  examples.classList.toggle('hidden', state.editingId !== null);
  examples.replaceChildren(...STEP_EXAMPLES.filter((e) => e.kind === state.formKind).map((e) => button(e.text, 'chip chip--example', () => {
    inputStepText.value = e.text;
    inputStepText.focus();
  })));
}

function openStepModal(step: Step | null, kind: KindKey | null, date: string | null): void {
  state.editingId = step ? step.id : null;
  state.formKind = step ? step.kind : (kind ?? 'kaizen');
  state.formArea = step ? step.area : '';
  inputStepText.value = step ? step.text : '';
  inputStepNote.value = step ? step.note : '';
  inputStepDate.value = step ? step.date : (date ?? todayKey());
  inputStepDate.max = todayKey();
  $('step-modal-title').textContent = step ? '前進を編集' : '前進を記録する';
  btnStepSubmit.textContent = step ? '保存する' : '記録する';
  btnStepDelete.classList.toggle('hidden', !step);
  renderFormChips();
  openOverlay(stepOverlay);
  autoGrow(inputStepNote);
  window.setTimeout(() => inputStepText.focus(), 50);
}

stepForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = state.uid;
  if (!uid) return;
  const text = inputStepText.value.trim();
  const date = inputStepDate.value;
  if (!text) {
    showToast('きのうより、よくなったことを入力してください');
    inputStepText.focus();
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showToast('日付を選んでください');
    return;
  }
  if (date > todayKey()) {
    showToast('未来の日付には記録できません');
    return;
  }
  const input: StepInput = { date, kind: state.formKind, area: state.formArea, text, note: inputStepNote.value };
  const editingId = state.editingId;
  const before = state.steps.length;
  const wasActiveToday = state.steps.some((s) => s.date === todayKey());
  const streakBefore = dayStreak(state.steps);
  btnStepSubmit.disabled = true;
  const ok = await run('step-save', async () => {
    if (editingId) {
      await updateStep(uid, editingId, input);
      track('step_update');
    } else {
      await createStep(uid, input);
      track('step_create', { kind: input.kind });
    }
  }, '保存に失敗しました。もう一度お試しください');
  btnStepSubmit.disabled = false;
  if (!ok) return;
  closeOverlay(stepOverlay);
  if (editingId) {
    showToast('保存しました');
    return;
  }
  celebrateNew(before + 1, date === todayKey() && !wasActiveToday, streakBefore);
});

/** 記録したときのお祝い（称号アップは announceRankUp が出すので、ここでは連続日数と今日の初回だけ） */
function celebrateNew(total: number, firstToday: boolean, streakBefore: number): void {
  const prev = titleOf(total - 1);
  const next = titleOf(total);
  if (next.index > prev.index) return; // 称号のポップアップに任せる
  if (firstToday) {
    const streak = streakBefore + 1;
    if (STREAK_MILESTONES.includes(streak)) {
      celebrate();
      showPopup(`${streak}日連続で前進！`, `${streak}日続けて、きのうの自分を超えています。この調子で積み重ねていきましょう。`);
      return;
    }
    celebrate(18);
    showToast(streak > 1 ? `きょうも前進！ ${streak}日連続です` : 'きょうも前進！ 1つ積み上がりました');
    return;
  }
  showToast(`前進を記録しました（これまでで${total}個）`);
}

btnStepDelete.addEventListener('click', () => {
  const uid = state.uid;
  const id = state.editingId;
  if (!uid || !id) return;
  askConfirm('この前進を削除しますか？', '削除すると元に戻せません。', '削除する', async () => {
    const ok = await run('step-delete', async () => {
      await deleteStep(uid, id);
      track('step_delete');
    }, '削除に失敗しました');
    if (ok) {
      closeOverlay(stepOverlay);
      showToast('削除しました');
    }
  });
});

// ============================================================
// 確認ダイアログ・フィードバック
// ============================================================
function cancelConfirm(): void {
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
}
$('btn-confirm-cancel').addEventListener('click', cancelConfirm);
btnConfirmOk.addEventListener('click', () => {
  const action = state.confirmAction;
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
  if (action) void action();
});

$('feedback-btn').addEventListener('click', () => {
  openOverlay(feedbackOverlay);
  window.setTimeout(() => inputFeedbackMessage.focus(), 50);
});
$('btn-feedback-close').addEventListener('click', () => closeOverlay(feedbackOverlay));
feedbackOverlay.addEventListener('click', (e) => {
  if (e.target === feedbackOverlay) closeOverlay(feedbackOverlay);
});

btnFeedbackSend.addEventListener('click', async () => {
  const message = inputFeedbackMessage.value.trim();
  if (!message) {
    showToast('内容を入力してください');
    return;
  }
  if (btnFeedbackSend.disabled) return;
  btnFeedbackSend.disabled = true;
  btnFeedbackSend.textContent = '送信中…';
  const ok = await submitFeedback(message);
  btnFeedbackSend.disabled = false;
  btnFeedbackSend.textContent = '送信する';
  if (ok) {
    inputFeedbackMessage.value = '';
    closeOverlay(feedbackOverlay);
    showToast('送信しました。ありがとうございます！');
  } else {
    showToast('送信に失敗しました。時間をおいて再度お試しください');
  }
});

// ============================================================
// ボタン
// ============================================================
['btn-step-close', 'btn-step-cancel'].forEach((id) => $(id).addEventListener('click', () => closeOverlay(stepOverlay)));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (confirmOverlay.classList.contains('is-open')) {
    cancelConfirm();
    return;
  }
  [stepOverlay, feedbackOverlay].forEach(closeOverlay);
});

tabButtons.forEach((b) => b.addEventListener('click', () => {
  const tab = b.dataset.tab as View;
  switchView(['home', 'look', 'grow'].includes(tab) ? tab : 'home');
}));
$('btn-prev-month').addEventListener('click', () => moveMonth(-1));
$('btn-next-month').addEventListener('click', () => moveMonth(1));
$('btn-add-past').addEventListener('click', () => {
  const t = todayKey();
  // カレンダーで日を選んでいればその日、なければ表示中の月の今日以前の日
  let date = state.calSelected || t;
  if (!state.calSelected && !t.startsWith(monthKey(state.calYear, state.calMonth0))) {
    date = `${monthKey(state.calYear, state.calMonth0)}-${String(daysInMonth(state.calYear, state.calMonth0)).padStart(2, '0')}`;
  }
  openStepModal(null, null, date);
});
$('btn-fab').addEventListener('click', () => {
  const date = state.view === 'look' && state.calSelected ? state.calSelected : todayKey();
  openStepModal(null, null, date);
});

// ============================================================
// Auth
// ============================================================
btnGoogleLogin.addEventListener('click', async () => {
  if (btnGoogleLogin.disabled) return;
  btnGoogleLogin.disabled = true;
  try {
    await loginWithGoogle();
    track('login');
  } catch (err) {
    console.error(err);
    const code = (err as { code?: string }).code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      showToast('ログインに失敗しました。もう一度お試しください');
    }
  } finally {
    btnGoogleLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await logout();
  } catch (err) {
    console.error(err);
    showToast('ログアウトに失敗しました');
  }
});

function stopSubscriptions(): void {
  state.unsubscribers.forEach((u) => u());
  state.unsubscribers = [];
}

onAuthChange((user: User | null) => {
  stopSubscriptions();
  if (!user) {
    Object.assign(state, { uid: null, steps: [], loaded: false, view: 'home', gachaId: '', calSelected: '' });
    loginScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
    userInfo.classList.add('hidden');
    [stepOverlay, confirmOverlay, feedbackOverlay].forEach(closeOverlay);
    return;
  }
  state.uid = user.uid;
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userAvatar.src = user.photoURL ?? '';
  userAvatar.classList.toggle('hidden', !user.photoURL);
  userName.textContent = user.displayName ?? '';
  switchView('home');

  state.unsubscribers.push(subscribeSteps(user.uid, (items) => {
    state.steps = items;
    state.loaded = true;
    renderAll();
  }, (err) => {
    console.error(err);
    showToast('データの読み込みに失敗しました。再読み込みしてください');
  }));
});

// 日付が変わったら「きょう」の表示を更新する
let lastDay = todayKey();
window.setInterval(() => {
  const t = todayKey();
  if (t !== lastDay) {
    lastDay = t;
    const d = parseKey(t);
    state.calYear = d.getFullYear();
    state.calMonth0 = d.getMonth();
    renderAll();
  }
}, 60 * 1000);

initTextareas();

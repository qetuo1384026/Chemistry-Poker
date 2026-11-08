// 入口：启动封面、界面切换与对局生命周期管理
import { renderSetup } from './ui/setup.js';
import { renderSettings } from './ui/settings.js';
import { renderHistory } from './ui/history.js';
import { renderLobby } from './ui/lobby.js';
import { startBoard } from './ui/board.js';
import { LocalDriver } from './ui/driver-local.js';
import { getSettings, applyMotionPreference } from './core/settings.js';
import { addHistoryRecord } from './core/history.js';
import { playSfx } from './core/sfx.js';

const $ = sel => document.querySelector(sel);
const DEFAULT_VERSION = '2.6.0';
const MIN_LOADING_MS = 600;

const screens = {
  cover: $('#screen-cover'),
  setup: $('#screen-setup'),
  lobby: $('#screen-lobby'),
  settings: $('#screen-settings'),
  history: $('#screen-history'),
  board: $('#screen-board'),
  end: $('#screen-end')
};

let board = null; // 当前对局控制器（用于销毁旧局的 AI 定时器）
let gameSession = null; // 当前对局的配置与开始时间（用于生成历史记录）
let lobbyApi = null; // 联机大厅控制器
let currentView = null;
let coverReady = false;

// ---- 界面切换（含入场/退场动画）----
function show(name) {
  for (const key of Object.keys(screens)) {
    const el = screens[key];
    if (key === name) {
      el.hidden = false;
      el.classList.remove('screen-leave');
      el.classList.add('screen-enter');
    } else {
      el.hidden = true;
      el.classList.remove('screen-enter', 'screen-leave');
    }
  }
  currentView = name;
  document.body.dataset.view = name;
}

function switchView(name, { animate = false } = {}) {
  const from = currentView ? screens[currentView] : null;
  if (!animate || !from || from === screens[name]) {
    show(name);
    return;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    from.classList.remove('screen-leave');
    show(name);
  };
  from.classList.remove('screen-enter');
  from.classList.add('screen-leave');
  from.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 220); // 兜底：动画被禁用或未触发时仍能切换
}

// ---- 弹窗（规则 / 关于）----
const rulesModal = $('#rules-modal');
const aboutModal = $('#about-modal');
let lastTrigger = null;

function anyModalOpen() {
  return !rulesModal.hidden || !aboutModal.hidden;
}

function openModal(modal, trigger) {
  lastTrigger = trigger || document.activeElement;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  const closeBtn = modal.querySelector('.modal-close');
  if (closeBtn) closeBtn.focus();
}

function closeModal(modal) {
  modal.hidden = true;
  if (!anyModalOpen()) document.body.classList.remove('modal-open');
  if (lastTrigger && typeof lastTrigger.focus === 'function' && !lastTrigger.disabled) {
    lastTrigger.focus();
  }
  lastTrigger = null;
}

function setRulesOpen(open, trigger) {
  if (open) openModal(rulesModal, trigger);
  else closeModal(rulesModal);
}

$('#btn-rules').addEventListener('click', (e) => setRulesOpen(true, e.currentTarget));

for (const modal of [rulesModal, aboutModal]) {
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal(modal);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!rulesModal.hidden) closeModal(rulesModal);
  if (!aboutModal.hidden) closeModal(aboutModal);
});

// ---- 启动封面：版本信息与加载状态 ----
const coverLoading = $('#cover-loading');
const coverLoadingText = $('#cover-loading-text');
const coverButtons = ['#btn-enter', '#btn-cover-history', '#btn-cover-settings', '#btn-cover-about', '#btn-cover-help'].map($);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function setVersion(version) {
  $('#cover-version').textContent = `v${version}`;
  const aboutVersion = $('#about-version');
  if (aboutVersion) aboutVersion.textContent = `v${version}`;
}

async function fetchVersion() {
  try {
    const res = await fetch('package.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pkg = await res.json();
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : DEFAULT_VERSION;
  } catch {
    // file:// 直接打开或网络异常时回退到内置版本号
    return DEFAULT_VERSION;
  }
}

function setCoverEnabled(enabled) {
  coverReady = enabled;
  for (const btn of coverButtons) btn.disabled = !enabled;
}

async function preloadCover() {
  const started = performance.now();
  const version = await fetchVersion();
  setVersion(version);

  if (coverLoadingText) coverLoadingText.textContent = '正在准备对战环境…';
  const remain = MIN_LOADING_MS - (performance.now() - started);
  if (remain > 0) await wait(remain);

  coverLoading.classList.add('hide');
  setTimeout(() => { coverLoading.hidden = true; }, 260);
  setCoverEnabled(true);
  $('#btn-enter').focus({ preventScroll: true });
}

// ---- 封面入口：开始游戏 → 选择页；设置 → 独立设置页，两者互不共用 ----
function goSetup() {
  setupApi.applyDefaults();
  playSfx('click');
  switchView('setup', { animate: true });
}

function goSettings() {
  settingsApi.syncFromSettings();
  playSfx('click');
  switchView('settings', { animate: true });
}

$('#btn-enter').addEventListener('click', () => {
  if (!coverReady) return;
  goSetup();
});

$('#btn-cover-settings').addEventListener('click', () => {
  if (!coverReady) return;
  goSettings();
});

$('#btn-cover-history').addEventListener('click', () => {
  if (!coverReady) return;
  historyApi.refresh();
  playSfx('click');
  switchView('history', { animate: true });
});

$('#btn-cover-about').addEventListener('click', (e) => openModal(aboutModal, e.currentTarget));

$('#btn-cover-help').addEventListener('click', (e) => setRulesOpen(true, e.currentTarget));

$('#btn-back-cover').addEventListener('click', () => switchView('cover', { animate: true }));

// ---- 设置页导航 ----
$('#btn-settings-back').addEventListener('click', () => {
  playSfx('click');
  switchView('cover', { animate: true });
});
$('#btn-settings-enter').addEventListener('click', goSetup);

$('#btn-history-back').addEventListener('click', () => {
  playSfx('click');
  switchView('cover', { animate: true });
});

// ---- 对局生命周期 ----
// 清空上一局的结算与知识点回顾，避免新一局残留旧内容
function resetEndScreen() {
  $('#end-title').textContent = '';
  $('#end-score').textContent = '';
  $('#recap-list').innerHTML = '';
}

function destroyBoard() {
  if (board) {
    board.destroy();
    board = null;
  }
}

function startGame(config) {
  destroyBoard();
  resetEndScreen();
  playSfx('click');
  gameSession = { config, startedAt: Date.now() };
  show('board');
  const driver = new LocalDriver(config);
  board = startBoard(screens.board, driver, {
    onEnd: showEnd,
    config: { ...config, playerName: getSettings().nickname, opponentName: 'AI' }
  });
}

// 联机对战：进入大厅，对局开始后用 NetDriver 驱动牌桌
function startOnlineGame(config) {
  if (lobbyApi) { try { lobbyApi.destroy(); } catch {} }
  playSfx('click');
  show('lobby');
  lobbyApi = renderLobby(screens.lobby, {
    config,
    onStart: (driver, opponentName) => {
      destroyBoard();
      resetEndScreen();
      gameSession = { config, startedAt: Date.now() };
      show('board');
      board = startBoard(screens.board, driver, {
        onEnd: showEnd,
        config: { ...config, playerName: getSettings().nickname, opponentName }
      });
    },
    onBack: () => switchView('setup', { animate: true })
  });
}

// 把一局对局整理为完整的历史记录（时间 / 结果 / 得分 / 配置 / 使用的卡牌 / 组合技）
function buildHistoryRecord(game) {
  const config = (gameSession && gameSession.config) || {};
  const result = game.result;
  const cards = [];
  const combos = [];
  for (const entry of game.log) {
    const card = entry.leader === 'player' ? entry.leadCard : entry.respCard;
    if (card && card.name) cards.push(card.name);
    if (entry.match && entry.match.combo && entry.match.combo.name) combos.push(entry.match.combo.name);
  }
  return {
    endedAt: new Date().toISOString(),
    mode: config.mode || 'substance',
    result: result.winnerId === 'player' ? 'win' : result.winnerId === 'ai' ? 'lose' : 'draw',
    playerScore: result.playerScore,
    aiScore: result.aiScore,
    handSize: config.handSize,
    difficulty: config.difficulty,
    rounds: game.log.length,
    durationMs: gameSession ? Date.now() - gameSession.startedAt : 0,
    topicIds: config.topicIds || [],
    playerCards: cards,
    combos: [...new Set(combos)]
  };
}

function showEnd(game) {
  const result = game.result;
  playSfx(result.winnerId === 'player' ? 'win' : result.winnerId === 'ai' ? 'lose' : 'click');
  addHistoryRecord(buildHistoryRecord(game)); // 结束后自动增量保存到本地
  $('#end-title').textContent =
    result.winnerId === 'player' ? '🎉 你赢了！' :
    result.winnerId === 'ai' ? '🤖 AI 获胜' : '🤝 平局';
  $('#end-score').textContent = `你 ${result.playerScore} : ${result.aiScore} AI`;

  // 知识点回顾：汇总本局出现过的有效匹配（去重）
  const list = $('#recap-list');
  list.innerHTML = '';
  const seen = new Set();
  for (const entry of game.log) {
    if (!entry.match || !entry.match.valid || !entry.match.eq) continue;
    const key = entry.match.eq;
    if (seen.has(key)) continue;
    seen.add(key);
    const li = document.createElement('li');
    li.innerHTML = `<span class="rc-topic">[${entry.match.name}]</span>` +
      `<b>${entry.leadCard.name}</b> × <b>${entry.respCard.name}</b>：${entry.match.eq}<br>` +
      `<span style="color:var(--muted)">${entry.match.expl}</span>`;
    list.appendChild(li);
  }
  if (seen.size === 0) {
    list.innerHTML = '<li>本局没有成功匹配，复习一下反应规律再来挑战吧！</li>';
  }
  show('end');
}

// 再来一局：先销毁旧对局并清空结算内容，再回到选择界面
$('#btn-restart').addEventListener('click', () => {
  destroyBoard();
  resetEndScreen();
  playSfx('click');
  setupApi.applyDefaults();
  show('setup');
});

// ---- 初始化 ----
const setupApi = renderSetup(screens.setup, { onStart: startGame, onStartOnline: startOnlineGame });
const settingsApi = renderSettings(screens.settings, {
  onChange: (s) => {
    applyMotionPreference(s);
    setupApi.applyDefaults();
  }
});
const historyApi = renderHistory(screens.history);
applyMotionPreference();
resetEndScreen();
setCoverEnabled(false);
show('cover');
preloadCover();

// 对局战绩页：本地历史读取、统计、按结果/时间/模式筛选与分页渲染
import { loadHistory, queryHistory, historyStats, clearHistory, MAX_RECORDS } from '../core/history.js';
import { topicName } from '../data/index.js';
import { playSfx } from '../core/sfx.js';

const PAGE_SIZE = 20;
const MODE_LABEL = { substance: '化学物质模式', ion: '离子模式' };
const DIFF_LABEL = { easy: '简单 AI', normal: '标准 AI' };
const RESULT_META = {
  win: { text: '胜', cls: 'win' },
  lose: { text: '负', cls: 'lose' },
  draw: { text: '平', cls: 'draw' }
};

const pad = n => String(n).padStart(2, '0');

function formatTime(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(ms) {
  if (!ms) return '—';
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${pad(seconds)}`;
}

export function renderHistory(container) {
  const resultSel = container.querySelector('#history-result');
  const rangeSel = container.querySelector('#history-range');
  const modeSel = container.querySelector('#history-mode');
  const statsBox = container.querySelector('#history-stats');
  const meta = container.querySelector('#history-meta');
  const list = container.querySelector('#history-list');
  const moreBtn = container.querySelector('#btn-history-more');
  const clearBtn = container.querySelector('#btn-history-clear');

  let shown = PAGE_SIZE;
  let filtered = [];

  function itemEl(record) {
    const badge = RESULT_META[record.result] || RESULT_META.draw;
    const topics = record.topicIds.slice(0, 3).map(topicName).join('、');
    const cards = record.playerCards.slice(0, 4).join('、');
    const cardMore = record.playerCards.length > 4 ? ` 等 ${record.playerCards.length} 张` : '';
    const el = document.createElement('div');
    el.className = 'history-item';
    el.dataset.result = record.result;
    el.innerHTML =
      `<div class="history-item-head">` +
        `<span class="history-badge ${badge.cls}">${badge.text}</span>` +
        `<span class="history-time">${formatTime(record.endedAt)}</span>` +
        `<span class="history-mode">${MODE_LABEL[record.mode] || ''}</span>` +
      `</div>` +
      `<div class="history-score">你 <b>${record.playerScore}</b> : <b>${record.aiScore}</b> AI</div>` +
      `<div class="history-sub">手牌 ${record.handSize} · ${DIFF_LABEL[record.difficulty]} · ` +
        `${record.rounds} 回合 · 用时 ${formatDuration(record.durationMs)}</div>` +
      (topics ? `<div class="history-tags">专题：${topics}</div>` : '') +
      (cards ? `<div class="history-tags">使用卡牌：${cards}${cardMore}</div>` : '') +
      (record.combos.length ? `<div class="history-tags history-combo">⚡ 组合技：${record.combos.join('、')}</div>` : '');
    return el;
  }

  function renderStats() {
    const stats = historyStats(filtered);
    statsBox.innerHTML =
      `<div class="history-stat"><span class="hs-value">${stats.total}</span><span class="hs-label">筛选对局</span></div>` +
      `<div class="history-stat"><span class="hs-value">${stats.wins}<i>胜</i> ${stats.losses}<i>负</i> ${stats.draws}<i>平</i></span><span class="hs-label">战绩</span></div>` +
      `<div class="history-stat"><span class="hs-value">${stats.winRate}%</span><span class="hs-label">胜率</span></div>` +
      `<div class="history-stat"><span class="hs-value">${stats.best}</span><span class="hs-label">最高分</span></div>` +
      `<div class="history-stat"><span class="hs-value">${stats.avgScore}</span><span class="hs-label">平均分</span></div>`;
  }

  function renderList() {
    list.innerHTML = '';
    if (filtered.length === 0) {
      list.innerHTML = '<div class="history-empty">暂无符合条件的对局记录，先去打一局吧。</div>';
    } else {
      for (const record of filtered.slice(0, shown)) list.appendChild(itemEl(record));
    }
    moreBtn.hidden = filtered.length <= shown;
    moreBtn.textContent = `加载更多（还有 ${Math.max(0, filtered.length - shown)} 条）`;
  }

  function refresh() {
    const started = performance.now();
    const all = loadHistory();
    filtered = queryHistory({
      result: resultSel.value,
      mode: modeSel.value,
      range: rangeSel.value
    }, all);
    const queryMs = performance.now() - started;

    renderStats();
    renderList();
    meta.textContent =
      `本地共 ${all.length} 条记录（上限 ${MAX_RECORDS}）· 当前筛选 ${filtered.length} 条 · ` +
      `读取与筛选耗时 ${queryMs.toFixed(1)} ms`;
  }

  resultSel.addEventListener('change', () => { shown = PAGE_SIZE; refresh(); });
  rangeSel.addEventListener('change', () => { shown = PAGE_SIZE; refresh(); });
  modeSel.addEventListener('change', () => { shown = PAGE_SIZE; refresh(); });

  moreBtn.addEventListener('click', () => {
    shown += PAGE_SIZE;
    renderList();
    playSfx('click');
  });

  clearBtn.addEventListener('click', () => {
    if (loadHistory().length === 0) {
      refresh();
      return;
    }
    if (!window.confirm('确定清空全部本地对局记录？该操作不可撤销。')) return;
    clearHistory();
    shown = PAGE_SIZE;
    refresh();
    playSfx('click');
  });

  refresh();
  return { refresh };
}

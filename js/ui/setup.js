// 模式与知识范围选择界面：一级模式互斥切换 + 当前模式下的专题勾选 + 对局设置
import { MODULES, cardsByTopics } from '../data/index.js';
import { getSettings } from '../core/settings.js';

export const MIN_DECK_FACTOR = 2; // 卡组至少 = 手牌数 × 2

// 一级对战模式（互斥）：每个模式拥有独立的知识范围与对战逻辑
export const GAME_MODES = [
  {
    id: 'substance',
    title: '化学物质模式',
    desc: '无机物与有机物之间的反应对战：酸碱中和、金属置换、氧化物与有机转化链',
    moduleIds: ['inorganic', 'organic']
  },
  {
    id: 'ion',
    title: '离子模式',
    desc: '离子与离子的对决：生成沉淀、气体、弱电解质，以及离子氧化还原与共存判断',
    moduleIds: ['ion']
  }
];

export function renderSetup(container, { onStart, onStartOnline }) {
  const modeGrid = container.querySelector('#mode-grid');
  const tree = container.querySelector('#topic-tree');
  const scopeHint = container.querySelector('#scope-hint');
  const deckCount = container.querySelector('#deck-count');
  const error = container.querySelector('#setup-error');
  const handSizeSel = container.querySelector('#hand-size');
  const difficultySel = container.querySelector('#difficulty');
  const hintsCb = container.querySelector('#show-hints');

  let currentMode = GAME_MODES[0];

  // 应用设置页中的「对局默认设置」
  function applyDefaults() {
    const { handSize, difficulty, showHints } = getSettings();
    handSizeSel.value = String(handSize);
    difficultySel.value = difficulty;
    hintsCb.checked = showHints;
    refreshCount();
  }

  // ---- 一级模式卡片 ----
  function renderModes() {
    modeGrid.innerHTML = '';
    for (const mode of GAME_MODES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-card' + (mode.id === currentMode.id ? ' active' : '');
      btn.dataset.mode = mode.id;
      btn.innerHTML = `<div class="mode-title">${mode.title}</div><div class="mode-desc">${mode.desc}</div>`;
      btn.addEventListener('click', () => {
        if (currentMode.id === mode.id) return;
        currentMode = mode;
        renderModes();
        renderTree();
        refreshCount();
      });
      modeGrid.appendChild(btn);
    }
  }

  // ---- 当前模式下的知识专题树 ----
  function renderTree() {
    tree.innerHTML = '';
    const mods = MODULES.filter(m => currentMode.moduleIds.includes(m.id));
    for (const mod of mods) {
      const block = document.createElement('div');
      block.className = 'module-block';

      const head = document.createElement('label');
      head.className = 'module-head';
      const modCb = document.createElement('input');
      modCb.type = 'checkbox';
      modCb.checked = true;
      modCb.dataset.module = mod.id;
      head.appendChild(modCb);
      head.insertAdjacentHTML('beforeend',
        `<span class="mod-title">${mod.title}</span><span class="mod-desc">${mod.desc}</span>`);
      block.appendChild(head);

      const list = document.createElement('div');
      list.className = 'topic-list';
      for (const topic of mod.topics) {
        const item = document.createElement('label');
        item.className = 'topic-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.topic = topic.id;
        cb.dataset.module = mod.id;
        item.appendChild(cb);
        item.insertAdjacentHTML('beforeend',
          `<span class="topic-title">${topic.name}</span><span class="topic-desc">${topic.desc}</span>`);
        list.appendChild(item);
      }
      block.appendChild(list);
      tree.appendChild(block);
    }
    scopeHint.textContent = `当前为「${currentMode.title}」：仅列出该模式的知识专题，卡组将只由所选专题生成。`;
  }

  function selectedTopics() {
    return [...tree.querySelectorAll('input[data-topic]:checked')].map(cb => cb.dataset.topic);
  }

  function refreshCount() {
    const n = cardsByTopics(selectedTopics()).length;
    const need = Number(handSizeSel.value) * MIN_DECK_FACTOR;
    deckCount.textContent = `当前选择可生成 ${n} 张卡牌（开局至少需要 ${need} 张）`;
    deckCount.style.color = n >= need ? 'var(--ok)' : 'var(--bad)';
    error.textContent = '';
  }

  // 模块级勾选联动专题
  tree.addEventListener('change', (e) => {
    const cb = e.target;
    if (cb.dataset.module && !cb.dataset.topic) {
      tree.querySelectorAll(`input[data-topic][data-module="${cb.dataset.module}"]`)
        .forEach(t => { t.checked = cb.checked; });
    }
    if (cb.dataset.topic && !cb.checked) {
      const modCb = tree.querySelector(`input[data-module="${cb.dataset.module}"]:not([data-topic])`);
      if (modCb) modCb.checked = false;
    }
    refreshCount();
  });
  handSizeSel.addEventListener('change', refreshCount);

  function buildConfig() {
    const topics = selectedTopics();
    const cards = cardsByTopics(topics);
    const handSize = Number(handSizeSel.value);
    if (cards.length < handSize * MIN_DECK_FACTOR) {
      error.textContent = `卡牌不足：当前 ${cards.length} 张，请至少再勾选 ${Math.ceil((handSize * MIN_DECK_FACTOR - cards.length) / 2)} 个专题`;
      return null;
    }
    return {
      mode: currentMode.id,
      cards,
      topicIds: topics,
      handSize,
      difficulty: difficultySel.value,
      showHints: hintsCb.checked
    };
  }

  container.querySelector('#btn-start').addEventListener('click', () => {
    const cfg = buildConfig();
    if (cfg) onStart(cfg);
  });

  const onlineBtn = container.querySelector('#btn-start-online');
  if (onlineBtn && onStartOnline) {
    onlineBtn.addEventListener('click', () => {
      const cfg = buildConfig();
      if (cfg) onStartOnline(cfg);
    });
  }

  renderModes();
  renderTree();
  applyDefaults();

  return { applyDefaults };
}

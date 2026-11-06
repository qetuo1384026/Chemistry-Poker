// 知识范围选择界面：模块/专题勾选树 + 对局设置
import { MODULES, cardsByTopics } from '../data/index.js';

export const MIN_DECK_FACTOR = 2; // 卡组至少 = 手牌数 × 2

export function renderSetup(container, { onStart }) {
  const tree = container.querySelector('#topic-tree');
  tree.innerHTML = '';

  for (const mod of MODULES) {
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

  const deckCount = container.querySelector('#deck-count');
  const error = container.querySelector('#setup-error');
  const handSizeSel = container.querySelector('#hand-size');

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

  container.querySelector('#btn-start').addEventListener('click', () => {
    const topics = selectedTopics();
    const cards = cardsByTopics(topics);
    const handSize = Number(handSizeSel.value);
    if (cards.length < handSize * MIN_DECK_FACTOR) {
      error.textContent = `卡牌不足：当前 ${cards.length} 张，请至少再勾选 ${Math.ceil((handSize * MIN_DECK_FACTOR - cards.length) / 2)} 个专题`;
      return;
    }
    onStart({
      cards,
      topicIds: topics,
      handSize,
      difficulty: container.querySelector('#difficulty').value,
      showHints: container.querySelector('#show-hints').checked
    });
  });

  refreshCount();
}

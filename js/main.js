// 入口：界面切换与对局生命周期管理
import { renderSetup } from './ui/setup.js';
import { startBoard } from './ui/board.js';

const $ = sel => document.querySelector(sel);
const screens = {
  setup: $('#screen-setup'),
  board: $('#screen-board'),
  end: $('#screen-end')
};

function show(name) {
  for (const key of Object.keys(screens)) {
    screens[key].hidden = key !== name;
  }
}

function startGame(config) {
  show('board');
  startBoard(screens.board, config, { onEnd: showEnd });
}

function showEnd(game) {
  const result = game.result;
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

$('#btn-restart').addEventListener('click', () => {
  show('setup');
});

renderSetup(screens.setup, { onStart: startGame });
show('setup');

// 对战界面：渲染牌桌、处理交互、驱动回合流程
import { Game, PHASE } from '../core/game.js';
import { matchCards, validResponses } from '../core/rules.js';
import { ctypeMeta } from '../core/cards.js';
import { topicName } from '../data/index.js';
import { playSfx } from '../core/sfx.js';

const AI_THINK_MS = 800;
const MODULE_LABEL = { inorganic: '无机', organic: '有机', ion: '离子' };
const MODE_LABEL = { substance: '化学物质模式', ion: '离子模式' };

export function startBoard(root, config, { onEnd }) {
  const game = new Game(config.cards, {
    handSize: config.handSize,
    difficulty: config.difficulty
  });

  // 对局生命周期控制：结束只回调一次，销毁时清理挂起的 AI 定时器，
  // 避免旧对局的延迟回调污染新一局的界面状态
  let aiTimer = null;
  let finished = false;
  const clearAiTimer = () => {
    if (aiTimer !== null) { clearTimeout(aiTimer); aiTimer = null; }
  };

  const $ = sel => root.querySelector(sel);
  const elScoreP = $('#score-player');
  const elScoreA = $('#score-ai');
  const elRound = $('#round-info');
  const elAiHand = $('#ai-hand');
  const elPlayerHand = $('#player-hand');
  const elLeadSlot = $('#lead-card-slot');
  const elRespSlot = $('#resp-card-slot');
  const elHint = $('#turn-hint');
  const elLog = $('#game-log');
  const playerName = config.playerName || '玩家';
  // 对局记录通过 innerHTML 渲染，昵称需转义后再拼接
  const playerLogName = String(playerName).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
  const elPlayerLabel = $('#screen-board .score-box.player .label');
  if (elPlayerLabel) elPlayerLabel.textContent = playerName;

  let lastEntry = null; // 最近一回合结果（用于牌桌展示区）

  function cardEl(card, opts = {}) {
    const el = document.createElement('div');
    el.className = 'card';
    if (opts.clickable) el.classList.add('card-clickable');
    if (opts.playable) el.classList.add('card-playable');
    if (opts.dim) el.classList.add('card-dim');
    const meta = ctypeMeta(card.ctype);
    el.innerHTML =
      `<span class="cid">#${card.pt}</span>` +
      `<div class="ctype" style="background:${meta.color}">${meta.label}</div>` +
      `<div class="cname">${card.name}</div>` +
      `<div class="csub">${card.sub}</div>` +
      `<div class="cmodule">${MODULE_LABEL[card.module] || card.module} · ${topicName(card.topic)}</div>`;
    if (opts.onClick) el.addEventListener('click', opts.onClick);
    el.title = (card.tags || []).join(' · ');
    return el;
  }

  function cardBack() {
    const el = document.createElement('div');
    el.className = 'card card-back';
    return el;
  }

  function hint(text, warn = false) {
    elHint.textContent = text;
    elHint.classList.toggle('warn', warn);
  }

  function renderLog() {
    elLog.innerHTML = '';
    if (game.log.length === 0) {
      elLog.innerHTML = '<div class="log-empty">对局开始，出牌后这里会记录每次交锋的知识点解析。</div>';
      return;
    }
    for (const e of game.log) {
      const div = document.createElement('div');
      div.className = 'log-entry';
      const who = id => (id === 'player' ? playerLogName : 'AI');
      const responder = e.leader === 'player' ? 'AI' : playerLogName;
      const leadTxt = `${who(e.leader)}出【${e.leadCard.name}】`;
      let line;
      if (!e.respCard) {
        line = `<b>回合${e.round}</b> ${leadTxt}，${responder}放弃应答 → <span class="lr-bad">${who(e.winnerId)}得 ${e.points.total} 分</span>`;
      } else {
        const ok = e.success;
        const comboTxt = ok && e.match.combo ? ` ⚡组合技【${e.match.combo.name}】` : '';
        line = `<b>回合${e.round}</b> ${leadTxt}，${responder}应答【${e.respCard.name}】 ` +
          (ok
            ? `→ <span class="lr-good">✓ ${e.match.name}${comboTxt}</span> ${who(e.winnerId)}得 ${e.points.total} 分`
            : `→ <span class="lr-bad">✗ 匹配失败</span> ${who(e.winnerId)}得 ${e.points.total} 分`);
      }
      const expl = e.match.eq
        ? `<span class="lr-expl">${e.match.eq}<br>${e.match.expl}</span>`
        : `<span class="lr-expl">${e.match.expl}</span>`;
      div.innerHTML = line + expl;
      elLog.prepend(div);
    }
  }

  function renderScores() {
    elScoreP.textContent = game.players.player.score;
    elScoreA.textContent = game.players.ai.score;
    const total = config.handSize;
    elRound.textContent = game.isOver
      ? '对局结束'
      : `回合 ${game.round} / ${total}　·　${MODE_LABEL[config.mode] || ''}　·　先手：${game.leader === 'player' ? playerName : 'AI'}`;
  }

  function renderTrick() {
    elLeadSlot.innerHTML = '';
    elRespSlot.innerHTML = '';
    const leadCard = game.currentLead ? game.currentLead.card : (lastEntry && lastEntry.leadCard);
    const respCard = game.currentLead ? null : (lastEntry && lastEntry.respCard);
    if (leadCard) elLeadSlot.appendChild(cardEl(leadCard));
    if (respCard) elRespSlot.appendChild(cardEl(respCard));
  }

  function renderHands() {
    elAiHand.innerHTML = '';
    game.players.ai.hand.forEach(() => elAiHand.appendChild(cardBack()));

    elPlayerHand.innerHTML = '';
    const responding = game.phase === PHASE.RESPOND && game.defender === 'player';
    const leading = game.phase === PHASE.LEAD && game.leader === 'player';
    const valids = responding && config.showHints
      ? new Set(validResponses(game.players.player.hand, game.currentLead.card).map(c => c.id))
      : null;

    for (const card of game.players.player.hand) {
      if (leading) {
        elPlayerHand.appendChild(cardEl(card, {
          clickable: true,
          onClick: () => playerLead(card.id)
        }));
      } else if (responding) {
        const playable = valids ? valids.has(card.id) : true;
        elPlayerHand.appendChild(cardEl(card, {
          clickable: true,
          playable,
          dim: valids ? !playable : false,
          onClick: () => playerRespond(card.id)
        }));
      } else {
        elPlayerHand.appendChild(cardEl(card));
      }
    }

    // 应答阶段提供“放弃”按钮
    if (responding) {
      const passBtn = document.createElement('button');
      passBtn.className = 'btn';
      passBtn.textContent = '放弃应答';
      passBtn.style.cssText = 'background:#455a75;color:#fff;padding:8px 16px;font-size:.9rem;align-self:center;';
      passBtn.addEventListener('click', () => playerRespond(null));
      elPlayerHand.appendChild(passBtn);
    }
  }

  function renderAll() {
    renderScores();
    renderTrick();
    renderHands();
    renderLog();
  }

  // ---- 流程控制 ----
  function playerLead(cardId) {
    if (finished || game.phase !== PHASE.LEAD || game.leader !== 'player') return;
    game.playLead('player', cardId);
    playSfx('play');
    lastEntry = null;
    renderAll();
    hint('AI 思考应答中…');
    clearAiTimer();
    aiTimer = setTimeout(aiRespondTurn, AI_THINK_MS);
  }

  function aiRespondTurn() {
    aiTimer = null;
    if (finished) return;
    if (game.isOver) return finish();
    const pick = game.aiRespond(); // 可能为 null（AI 空手牌/放弃）
    lastEntry = game.playResponse('ai', pick);
    playSfx('play');
    renderAll();
    nextAfterRound();
  }

  function playerRespond(cardId) {
    if (finished || game.phase !== PHASE.RESPOND || game.defender !== 'player') return;
    const lead = game.currentLead.card;
    if (cardId) {
      const card = game.players.player.hand.find(c => c.id === cardId);
      const m = matchCards(lead, card);
      if (!m.valid) {
        // 先提示，仍允许打出（判负）
        hint(`匹配失败：${m.expl}`, true);
      }
    }
    lastEntry = game.playResponse('player', cardId);
    playSfx(cardId ? 'play' : 'click');
    renderAll();
    nextAfterRound();
  }

  function aiLeadTurn() {
    if (finished) return;
    if (game.isOver) return finish();
    hint('AI 先手出牌中…');
    clearAiTimer();
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (finished) return;
      const card = game.aiLead();
      if (!card) return finish(); // AI 无牌可出，对局结束
      game.playLead('ai', card.id);
      playSfx('play');
      lastEntry = null;
      renderAll();
      hint('轮到你应答：打出一张能与之反应/转化的牌');
    }, AI_THINK_MS);
  }

  function nextAfterRound() {
    if (finished) return;
    if (game.isOver) return finish();
    if (game.leader === 'ai') {
      aiLeadTurn();
    } else {
      hint('轮到你先出牌');
    }
    renderScores();
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearAiTimer();
    renderAll();
    onEnd(game);
  }

  // 初始渲染：初始先手随机，若 AI 先手则由其先出牌
  renderAll();
  if (game.leader === 'ai') {
    aiLeadTurn();
  } else {
    hint('对局开始！轮到你先出牌');
  }

  return {
    // 离开对局时调用：停止后续 AI 回合，防止旧对局继续写同一套 DOM
    destroy() {
      finished = true;
      clearAiTimer();
    }
  };
}

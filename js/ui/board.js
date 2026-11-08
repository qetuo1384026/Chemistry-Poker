// 对战界面：纯渲染层，通过 driver 接口驱动（本地单机 / 联机共用）
import { PHASE } from '../core/game.js';
import { matchCards, validResponses } from '../core/rules.js';
import { ctypeMeta } from '../core/cards.js';
import { topicName } from '../data/index.js';
import { playSfx } from '../core/sfx.js';

const MODULE_LABEL = { inorganic: '无机', organic: '有机', ion: '离子' };
const MODE_LABEL = { substance: '化学物质模式', ion: '离子模式' };

export function startBoard(root, driver, { onEnd, config }) {
  // driver 接口：state / playLead / playRespond / onState / onEnd / start / destroy
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
  const opponentName = config.opponentName || 'AI';
  // 昵称用于 innerHTML 拼接，需转义
  const esc = s => String(s).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
  const playerLogName = esc(playerName);
  const opponentLogName = esc(opponentName);

  const elPlayerLabel = root.querySelector('.score-box.player .label');
  if (elPlayerLabel) elPlayerLabel.textContent = playerName;
  const elAiLabel = root.querySelector('.score-box.ai .label');
  if (elAiLabel) elAiLabel.textContent = opponentName;

  let warnHint = null; // 应答失败的瞬时警告

  function state() { return driver.state; }

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
    const g = state();
    elLog.innerHTML = '';
    if (g.log.length === 0) {
      elLog.innerHTML = '<div class="log-empty">对局开始，出牌后这里会记录每次交锋的知识点解析。</div>';
      return;
    }
    for (const e of g.log) {
      const div = document.createElement('div');
      div.className = 'log-entry';
      const who = id => (id === 'player' ? playerLogName : opponentLogName);
      const responder = e.leader === 'player' ? opponentLogName : playerLogName;
      let line;
      if (!e.respCard) {
        line = `<b>回合${e.round}</b> ${who(e.leader)}出【${e.leadCard ? e.leadCard.name : '—'}】，${responder}放弃应答 → <span class="lr-bad">${who(e.winnerId)}得 ${e.points.total} 分</span>`;
      } else {
        const ok = e.success;
        const comboTxt = ok && e.match && e.match.combo ? ` ⚡组合技【${e.match.combo.name}】` : '';
        line = `<b>回合${e.round}</b> ${who(e.leader)}出【${e.leadCard.name}】，${responder}应答【${e.respCard.name}】 ` +
          (ok
            ? `→ <span class="lr-good">✓ ${e.match.name}${comboTxt}</span> ${who(e.winnerId)}得 ${e.points.total} 分`
            : `→ <span class="lr-bad">✗ 匹配失败</span> ${who(e.winnerId)}得 ${e.points.total} 分`);
      }
      const expl = e.match && e.match.eq
        ? `<span class="lr-expl">${e.match.eq}<br>${e.match.expl}</span>`
        : `<span class="lr-expl">${e.match ? e.match.expl : ''}</span>`;
      div.innerHTML = line + expl;
      elLog.prepend(div);
    }
  }

  function renderScores() {
    const g = state();
    elScoreP.textContent = g.players.player.score;
    elScoreA.textContent = g.players.ai.score;
    const total = config.handSize;
    const leaderName = g.leader === 'player' ? playerName : opponentName;
    elRound.textContent = g.isOver
      ? '对局结束'
      : `回合 ${g.round} / ${total}　·　${MODE_LABEL[config.mode] || ''}　·　先手：${leaderName}`;
  }

  function renderTrick() {
    const g = state();
    elLeadSlot.innerHTML = '';
    elRespSlot.innerHTML = '';
    const lastEntry = g.log[g.log.length - 1] || null;
    const leadCard = g.currentLead ? g.currentLead.card : (lastEntry && lastEntry.leadCard);
    const respCard = g.currentLead ? null : (lastEntry && lastEntry.respCard);
    if (leadCard) elLeadSlot.appendChild(cardEl(leadCard));
    if (respCard) elRespSlot.appendChild(cardEl(respCard));
  }

  function renderHands() {
    const g = state();
    elAiHand.innerHTML = '';
    const aiHandCount = g.players.ai.handCount != null ? g.players.ai.handCount : g.players.ai.hand.length;
    for (let i = 0; i < aiHandCount; i++) elAiHand.appendChild(cardBack());

    elPlayerHand.innerHTML = '';
    const responding = g.phase === PHASE.RESPOND && g.defender === 'player';
    const leading = g.phase === PHASE.LEAD && g.leader === 'player';
    const valids = responding && config.showHints && g.currentLead
      ? new Set(validResponses(g.players.player.hand, g.currentLead.card).map(c => c.id))
      : null;

    for (const card of g.players.player.hand) {
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

    if (responding) {
      const passBtn = document.createElement('button');
      passBtn.className = 'btn';
      passBtn.textContent = '放弃应答';
      passBtn.style.cssText = 'background:#455a75;color:#fff;padding:8px 16px;font-size:.9rem;align-self:center;';
      passBtn.addEventListener('click', () => playerRespond(null));
      elPlayerHand.appendChild(passBtn);
    }
  }

  function updateHint() {
    const g = state();
    if (g.phase !== PHASE.RESPOND) warnHint = null;
    if (warnHint) { hint(warnHint, true); return; }
    if (g.isOver) { hint('对局结束'); return; }
    const myLead = g.phase === PHASE.LEAD && g.leader === 'player';
    const myResp = g.phase === PHASE.RESPOND && g.defender === 'player';
    if (myLead) hint('轮到你先出牌');
    else if (myResp) hint('轮到你应答：打出一张能与之反应/转化的牌');
    else if (g.phase === PHASE.LEAD) hint(`${opponentName}先手出牌中…`);
    else hint(`${opponentName}思考应答中…`);
  }

  function renderAll() {
    renderScores();
    renderTrick();
    renderHands();
    renderLog();
    updateHint();
  }

  function playerLead(cardId) {
    const g = state();
    if (g.phase !== PHASE.LEAD || g.leader !== 'player') return;
    driver.playLead(cardId);
    playSfx('play');
  }

  function playerRespond(cardId) {
    const g = state();
    if (g.phase !== PHASE.RESPOND || g.defender !== 'player') return;
    if (cardId) {
      const card = g.players.player.hand.find(c => c.id === cardId);
      if (card && g.currentLead) {
        const m = matchCards(g.currentLead.card, card);
        if (m && !m.valid) warnHint = `匹配失败：${m.expl}`;
      }
    }
    driver.playRespond(cardId);
    playSfx(cardId ? 'play' : 'click');
  }

  driver.onState(() => renderAll());
  driver.onEnd((game) => {
    playSfx(game.result.winnerId === 'player' ? 'win' : game.result.winnerId === 'ai' ? 'lose' : 'click');
    onEnd(game);
  });

  driver.start();

  return {
    destroy() {
      driver.destroy();
    }
  };
}

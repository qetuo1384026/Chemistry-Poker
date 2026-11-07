// 对战逻辑：状态机 + AI 对手
// 流程：发牌 → 回合制对战（先手出牌 → 对方应答 → 结算）→ 手牌打完后按总分分胜负
// 规则：应答牌若能与先出牌发生匹配（反应/转化/比较压制），应答方赢得该回合；
//       否则先手方赢得该回合。回合赢家成为下一回合先手。

import { matchCards, validResponses, findCombo } from './rules.js';
import { trickPoints, forfeitPoints } from './scoring.js';
import { buildDeck } from './cards.js';

export const PHASE = { LEAD: 'lead', RESPOND: 'respond', OVER: 'over' };

export class Game {
  /**
   * @param {Array} cards 经知识范围筛选后的卡牌池
   * @param {{handSize?:number, difficulty?:'easy'|'normal', rng?:Function}} options
   */
  constructor(cards, options = {}) {
    const { handSize = 6, difficulty = 'normal', rng = Math.random } = options;
    if (cards.length < handSize * 2) {
      throw new Error(`卡牌数量不足：至少需要 ${handSize * 2} 张，当前 ${cards.length} 张`);
    }
    this.difficulty = difficulty;
    this.rng = rng;
    this.players = {
      player: { id: 'player', name: '你', hand: [], score: 0, streak: 0 },
      ai: { id: 'ai', name: 'AI', hand: [], score: 0, streak: 0 }
    };
    const deck = buildDeck(cards, rng);
    this.players.player.hand = deck.slice(0, handSize);
    this.players.ai.hand = deck.slice(handSize, handSize * 2);
    // 初始先手由 rng 随机决定，避免永远玩家先手
    this.leader = this.rng() < 0.5 ? 'ai' : 'player';
    this.currentLead = null; // { pid, card }
    this.phase = PHASE.LEAD;
    this.round = 1;
    this.log = []; // 每回合记录
  }

  get defender() {
    return this.leader === 'player' ? 'ai' : 'player';
  }

  get isOver() {
    return this.phase === PHASE.OVER;
  }

  _takeCard(pid, cardId) {
    const hand = this.players[pid].hand;
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx === -1) throw new Error(`手牌中不存在: ${cardId}`);
    return hand.splice(idx, 1)[0];
  }

  /** 先手出牌 */
  playLead(pid, cardId) {
    if (this.phase !== PHASE.LEAD || pid !== this.leader) {
      throw new Error('当前不是该玩家的先手出牌阶段');
    }
    const card = this._takeCard(pid, cardId);
    this.currentLead = { pid, card };
    this.phase = PHASE.RESPOND;
    return card;
  }

  /**
   * 应答（可传 null 表示放弃应答，按应答失败处理）
   * @returns 回合结算记录
   */
  playResponse(pid, cardId) {
    if (this.phase !== PHASE.RESPOND || pid !== this.defender) {
      throw new Error('当前不是该玩家的应答阶段');
    }
    const lead = this.currentLead;
    const leadPlayer = this.players[lead.pid];
    const defPlayer = this.players[pid];

    const respCard = cardId ? this._takeCard(pid, cardId) : null;
    const match = respCard ? matchCards(lead.card, respCard) : null;
    const success = !!(match && match.valid);

    const winnerId = success ? pid : lead.pid;
    const loserId = success ? lead.pid : pid;
    const winner = this.players[winnerId];
    winner.streak += 1;
    this.players[loserId].streak = 0;

    // 组合技：应答成功且打出离子牌时，若赢家手牌（含刚打出的应答牌）集齐某组合，倍率追加 bonus
    if (success && respCard.ctype === 'ion') {
      const combo = findCombo([...winner.hand, respCard]);
      if (combo) {
        match.combo = combo;
        match.multiplier *= combo.bonus;
      }
    }

    let points;
    if (respCard) {
      points = trickPoints(lead.card, respCard, success ? match : { multiplier: 1 }, winner.streak - 1);
    } else {
      // 放弃应答：应答方未投入牌，先手方按先出牌点数获得应得分数
      points = forfeitPoints(lead.card, winner.streak - 1);
    }
    winner.score += points.total;

    const entry = {
      round: this.round,
      leader: lead.pid,
      leadCard: lead.card,
      respCard,
      match: success ? match : (match || { valid: false, expl: '放弃应答' }),
      success,
      winnerId,
      points
    };
    this.log.push(entry);

    // 进入下一回合
    this.leader = winnerId;
    this.currentLead = null;
    // 任一方手牌为空即结束（空手牌者无法行动，继续对局会导致 AI 决策崩溃）
    const anyHandEmpty = this.players.player.hand.length === 0 || this.players.ai.hand.length === 0;
    if (anyHandEmpty) {
      this.phase = PHASE.OVER;
    } else {
      this.round += 1;
      this.phase = PHASE.LEAD;
    }
    return entry;
  }

  /** 游戏结果 */
  get result() {
    if (!this.isOver) return null;
    const { player, ai } = this.players;
    return {
      winnerId: player.score === ai.score ? null : (player.score > ai.score ? 'player' : 'ai'),
      playerScore: player.score,
      aiScore: ai.score
    };
  }

  // ---------- AI ----------

  /** AI 先手出牌：简单=随机；标准=出点数最低的牌（保留强牌应答） */
  aiLead() {
    const hand = this.players.ai.hand;
    if (hand.length === 0) return null;
    if (this.difficulty === 'easy') {
      return hand[Math.floor(this.rng() * hand.length)];
    }
    return [...hand].sort((x, y) => x.pt - y.pt)[0];
  }

  /** AI 应答：简单=随机合法牌；标准=选得分最高的合法牌；无合法牌则弃掉点数最低的牌；空手牌返回 null */
  aiRespond() {
    const hand = this.players.ai.hand;
    if (hand.length === 0) return null;
    const lead = this.currentLead.card;
    const valids = validResponses(hand, lead);
    if (valids.length === 0) {
      return [...hand].sort((x, y) => x.pt - y.pt)[0].id;
    }
    if (this.difficulty === 'easy') {
      return valids[Math.floor(this.rng() * valids.length)].id;
    }
    let best = valids[0], bestScore = -1;
    for (const card of valids) {
      const m = matchCards(lead, card);
      const s = (lead.pt + card.pt) * m.multiplier;
      if (s > bestScore) { bestScore = s; best = card; }
    }
    return best.id;
  }
}

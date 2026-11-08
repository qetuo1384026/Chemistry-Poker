// 本地单机驱动：封装 Game + AI 定时器，对外暴露与联机驱动一致的接口
// 接口契约（供 board.js 消费）：
//   get state()        当前对局状态（与 Game 对象同形）
//   playLead(cardId)   玩家先手出牌
//   playRespond(cardId|null)  玩家应答
//   onState(cb)        状态变化回调
//   onEnd(cb)          对局结束回调（参数为 game 对象）
//   start()            启动（若 AI 先手则开始 AI 回合）
//   destroy()          销毁，清理定时器
import { Game, PHASE } from '../core/game.js';

const AI_THINK_MS = 800;

export class LocalDriver {
  constructor(config) {
    this.config = config;
    this.game = new Game(config.cards, {
      handSize: config.handSize,
      difficulty: config.difficulty
    });
    // 对局记录展示用：最近一回合结算（用于牌桌展示区）
    this.lastEntry = null;
    this._onStateCbs = [];
    this._onEndCbs = [];
    this._aiTimer = null;
    this._finished = false;
  }

  get state() {
    return this.game;
  }

  onState(cb) {
    this._onStateCbs.push(cb);
  }

  onEnd(cb) {
    this._onEndCbs.push(cb);
  }

  _emitState() {
    for (const cb of this._onStateCbs) cb();
  }

  _emitEnd() {
    for (const cb of this._onEndCbs) cb(this.game);
  }

  _clearAi() {
    if (this._aiTimer !== null) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }
  }

  start() {
    this._emitState();
    if (this.game.leader === 'ai') {
      this._aiLeadTurn();
    }
  }

  playLead(cardId) {
    if (this._finished || this.game.phase !== PHASE.LEAD || this.game.leader !== 'player') return;
    this.game.playLead('player', cardId);
    this.lastEntry = null;
    this._emitState();
    this._clearAi();
    this._aiTimer = setTimeout(() => this._aiRespondTurn(), AI_THINK_MS);
  }

  _aiRespondTurn() {
    this._aiTimer = null;
    if (this._finished) return;
    if (this.game.isOver) return this._finish();
    const pick = this.game.aiRespond();
    this.lastEntry = this.game.playResponse('ai', pick);
    this._emitState();
    this._nextAfterRound();
  }

  playRespond(cardId) {
    if (this._finished || this.game.phase !== PHASE.RESPOND || this.game.defender !== 'player') return;
    this.lastEntry = this.game.playResponse('player', cardId);
    this._emitState();
    this._nextAfterRound();
  }

  _aiLeadTurn() {
    if (this._finished) return;
    if (this.game.isOver) return this._finish();
    this._clearAi();
    this._aiTimer = setTimeout(() => {
      this._aiTimer = null;
      if (this._finished) return;
      const card = this.game.aiLead();
      if (!card) return this._finish();
      this.game.playLead('ai', card.id);
      this.lastEntry = null;
      this._emitState();
      // 注意：此处不调用 _nextAfterRound。AI 出完先手后进入应答阶段，
      // 等待玩家（人类）应答；玩家应答后才由 playRespond → _nextAfterRound 推进。
    }, AI_THINK_MS);
  }

  _nextAfterRound() {
    if (this._finished) return;
    if (this.game.isOver) return this._finish();
    if (this.game.leader === 'ai') {
      this._aiLeadTurn();
    }
    // 玩家回合：由 board 根据状态渲染提示，无需在此处理
  }

  _finish() {
    if (this._finished) return;
    this._finished = true;
    this._clearAi();
    this._emitState();
    this._emitEnd();
  }

  destroy() {
    this._finished = true;
    this._clearAi();
  }
}

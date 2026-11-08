// 联机对战服务端：房间管理 + 服务端权威 Game + 透视化状态广播
// 设计要点：
//   - 服务端为唯一状态源，所有出牌动作必须经过服务端校验后才广播，避免不同步。
//   - 玩家在服务端使用规范 id：p1=房主、p2=对手；Game 内部用 player=p1、ai=p2。
//   - 广播时按接收方视角重映射 id（自己永远是 'player'，对手永远是 'ai'），
//     并隐藏对手手牌（只发数量），防止信息泄露。
//   - 断线有宽限期，允许同房间令牌重连；超时则判负。
import { Game, PHASE } from '../core/game.js';
import { cardsByTopics } from '../data/index.js';
import { haversineKm, validCoord } from './geo.js';

const RECONNECT_GRACE_MS = 60_000;   // 断线重连宽限
const HEARTBEAT_INTERVAL = 25_000;   // 心跳间隔
const HEARTBEAT_TIMEOUT = 10_000;    // 心跳超时
const NAME_MAX = 12;
const NEARBY_LIMIT = 50;             // 附近列表最多返回人数
const DEFAULT_RADIUS_KM = 30;
const MAX_RADIUS_KM = 1000;

function genCode(existing) {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (existing.has(code));
  return code;
}

function safeName(name) {
  const s = String(name == null ? '' : name).trim().slice(0, NAME_MAX);
  return s || '玩家';
}

// 将规范 Game 状态转换为某玩家视角的快照
// viewerId: 'p1' | 'p2'
function buildState(game, viewerId) {
  const swap = viewerId === 'p2';
  const selfSlot = swap ? game.players.ai : game.players.player;
  const oppSlot = swap ? game.players.player : game.players.ai;

  const remap = (id) => {
    if (id === 'player') return swap ? 'ai' : 'player';
    if (id === 'ai') return swap ? 'player' : 'ai';
    return id;
  };

  const log = game.log.map((e) => ({
    round: e.round,
    leader: remap(e.leader),
    leadCard: e.leadCard,
    respCard: e.respCard,
    match: e.match,
    success: e.success,
    winnerId: remap(e.winnerId),
    points: e.points
  }));

  let currentLead = null;
  if (game.currentLead) {
    currentLead = { pid: remap(game.currentLead.pid), card: game.currentLead.card };
  }

  const result = game.isOver
    ? {
        winnerId: game.result.winnerId ? remap(game.result.winnerId) : null,
        playerScore: swap ? game.result.aiScore : game.result.playerScore,
        aiScore: swap ? game.result.playerScore : game.result.aiScore
      }
    : null;

  const leader = remap(game.leader);
  return {
    phase: game.phase,
    round: game.round,
    leader,
    defender: leader === 'player' ? 'ai' : 'player',
    currentLead,
    players: {
      player: { id: 'player', name: selfSlot.name, hand: [...selfSlot.hand], score: selfSlot.score, streak: selfSlot.streak },
      ai: { id: 'ai', name: oppSlot.name, hand: [], handCount: oppSlot.hand.length, score: oppSlot.score, streak: oppSlot.streak }
    },
    log,
    isOver: game.isOver,
    result
  };
}

export class MultiplayerServer {
  constructor() {
    this.rooms = new Map(); // code -> room
    this.sockets = new WeakSet();
    this.clients = new Set(); // 当前在线连接（附近玩家检索）
    this._heartbeat = setInterval(() => this._tickHeartbeat(), HEARTBEAT_INTERVAL);
    this._cleanup = setInterval(() => this._tickCleanup(), 5_000);
    if (this._heartbeat.unref) this._heartbeat.unref();
    if (this._cleanup.unref) this._cleanup.unref();
  }

  handleConnection(ws, req) {
    ws.isAlive = true;
    ws.role = null;
    ws.playerId = null;
    ws.roomCode = null;
    ws.name = '玩家';
    ws.token = null;
    // 连接级唯一标识（与房间内 p1/p2 槽位无关），用于附近玩家邀请
    ws.pid = 'u' + Math.random().toString(36).slice(2, 10);
    ws.profile = {
      name: '玩家',
      lat: null,
      lng: null,
      source: '',
      shareLocation: true,
      radiusKm: DEFAULT_RADIUS_KM
    };
    this.clients.add(ws);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;
      try {
        this._route(ws, msg);
      } catch (err) {
        this._send(ws, { type: 'error', message: err.message || '服务器错误' });
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      this._onDisconnect(ws);
    });
    ws.on('error', () => { /* 忽略，close 会处理 */ });
  }

  _send(ws, msg) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  _tickHeartbeat() {
    for (const room of this.rooms.values()) {
      for (const ws of [room.host, room.guest].filter(Boolean)) {
        if (!ws.isAlive) {
          try { ws.terminate(); } catch {}
          continue;
        }
        ws.isAlive = false;
        try { ws.ping(); } catch {}
      }
    }
  }

  _tickCleanup() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      // 清理已结束且无活跃连接的房间
      if (room.endedAt && now - room.endedAt > 30_000) {
        this.rooms.delete(code);
      }
    }
  }

  _route(ws, msg) {
    switch (msg.type) {
      case 'create': return this._create(ws, msg);
      case 'join': return this._join(ws, msg);
      case 'leave': return this._leave(ws);
      case 'start': return this._start(ws);
      case 'playLead': return this._playLead(ws, msg);
      case 'playRespond': return this._playRespond(ws, msg);
      case 'forfeit': return this._forfeit(ws);
      case 'rematch': return this._rematch(ws);
      case 'nearby': return this._nearby(ws, msg);
      case 'invite': return this._invite(ws, msg);
      case 'inviteDecline': return this._declineInvite(ws, msg);
      case 'ping': return this._send(ws, { type: 'pong' });
      default: break;
    }
  }

  _create(ws, msg) {
    if (ws.roomCode) return this._send(ws, { type: 'error', message: '你已在房间中' });
    this._createRoom(ws, safeName(msg.name), this._sanitizeConfig(msg.config));
  }

  // 创建房间并通知房主；返回 room。供「创建房间」与「附近玩家一键邀请」复用。
  _createRoom(ws, name, config) {
    const code = genCode(this.rooms);
    ws.name = name;
    ws.profile.name = name;
    ws.role = 'host';
    ws.playerId = 'p1';
    ws.roomCode = code;
    ws.token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    const room = {
      code,
      host: ws,
      guest: null,
      spectators: new Set(),
      game: null,
      config,
      started: false,
      endedAt: null,
      createdAt: Date.now(),
      disconnectTimers: { p1: null, p2: null }
    };
    this.rooms.set(code, room);
    this._send(ws, { type: 'roomCreated', code, role: 'host', token: ws.token, config });
    this._broadcastRoomUpdate(room);
    return room;
  }

  _join(ws, msg) {
    if (ws.roomCode) return this._send(ws, { type: 'error', message: '你已在房间中' });
    const code = String(msg.code || '').trim();
    const room = this.rooms.get(code);
    if (!room) return this._send(ws, { type: 'error', message: '房间不存在' });
    if (room.started) {
      // 已开始：尝试作为断线的玩家重连
      const token = String(msg.token || '');
      const slot = room.host && room.host.token === token ? 'host'
        : room.guest && room.guest.token === token ? 'guest' : null;
      if (slot) {
        return this._reconnect(ws, room, slot, msg);
      }
      return this._send(ws, { type: 'error', message: '对局已开始' });
    }
    if (room.guest) return this._send(ws, { type: 'error', message: '房间已满' });

    const name = safeName(msg.name);
    ws.name = name;
    ws.profile.name = name;
    ws.role = 'guest';
    ws.playerId = 'p2';
    ws.roomCode = code;
    ws.token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    room.guest = ws;
    this._send(ws, { type: 'joined', code, role: 'guest', token: ws.token, hostName: room.host.name });
    this._broadcastRoomUpdate(room);
  }

  _reconnect(ws, room, slot, msg) {
    const oldWs = room[slot];
    const name = safeName(msg.name) || (oldWs ? oldWs.name : '玩家');
    ws.name = name;
    ws.profile.name = name;
    ws.role = slot;
    ws.playerId = slot === 'host' ? 'p1' : 'p2';
    ws.roomCode = room.code;
    ws.token = oldWs.token;
    room[slot] = ws;
    // 清理断线定时器
    if (room.disconnectTimers[ws.playerId]) {
      clearTimeout(room.disconnectTimers[ws.playerId]);
      room.disconnectTimers[ws.playerId] = null;
    }
    // 关闭旧连接
    try { oldWs.terminate(); } catch {}

    this._send(ws, { type: 'reconnected', code: room.code, role: slot, token: ws.token });
    // 重连后立即推送当前状态
    if (room.started && room.game) {
      this._send(ws, { type: 'state', state: buildState(room.game, ws.playerId) });
    }
    const opponent = slot === 'host' ? room.guest : room.host;
    if (opponent) {
      this._send(opponent, { type: 'opponentReconnected', name });
      if (room.started && room.game) {
        this._send(opponent, { type: 'state', state: buildState(room.game, opponent.playerId) });
      }
    }
    this._broadcastRoomUpdate(room);
  }

  _leave(ws) {
    if (!ws.roomCode) return;
    const room = this.rooms.get(ws.roomCode);
    if (!room) { ws.roomCode = null; return; }
    if (ws === room.host) {
      if (room.started && room.game && !room.game.isOver) {
        this._forfeit(ws); // 房主中途离开判负
      }
      this._destroyRoom(room, '房主离开');
    } else if (ws === room.guest) {
      if (room.started && room.game && !room.game.isOver) {
        this._forfeit(ws);
      }
      room.guest = null;
      this._send(room.host, { type: 'opponentLeft' });
      this._broadcastRoomUpdate(room);
    }
    ws.roomCode = null;
    ws.role = null;
    ws.playerId = null;
  }

  _destroyRoom(room, reason) {
    for (const ws of [room.host, room.guest].filter(Boolean)) {
      this._send(ws, { type: 'roomDestroyed', reason });
      ws.roomCode = null;
      ws.role = null;
      ws.playerId = null;
    }
    for (const [pid, t] of Object.entries(room.disconnectTimers)) {
      if (t) clearTimeout(t);
    }
    room.endedAt = room.endedAt || Date.now();
    // 延迟删除，防止重连令牌立即失效
    setTimeout(() => this.rooms.delete(room.code), 1_000);
  }

  _start(ws) {
    const room = ws.roomCode && this.rooms.get(ws.roomCode);
    if (!room) return this._send(ws, { type: 'error', message: '不在房间中' });
    if (ws !== room.host) return this._send(ws, { type: 'error', message: '只有房主可以开始' });
    if (room.started) return this._send(ws, { type: 'error', message: '对局已开始' });
    if (!room.guest) return this._send(ws, { type: 'error', message: '等待对手加入' });

    const cards = cardsByTopics(room.config.topicIds || []);
    if (cards.length < (room.config.handSize || 6) * 2) {
      return this._send(ws, { type: 'error', message: '卡牌数量不足' });
    }
    const game = new Game(cards, {
      handSize: room.config.handSize,
      difficulty: room.config.difficulty
    });
    room.game = game;
    room.started = true;
    // 给玩家设置真实昵称（Game 默认是 '你' / 'AI'）
    game.players.player.name = room.host.name;
    game.players.ai.name = room.guest.name;

    // 先发 started，双方据此建立 NetDriver 并切入牌桌，随后到达的 state 才不会丢失
    this._broadcastStarted(room);
    this._broadcastState(room);
    this._broadcastRoomUpdate(room);
  }

  _playLead(ws, msg) {
    const room = ws.roomCode && this.rooms.get(ws.roomCode);
    if (!room || !room.started || !room.game) return this._send(ws, { type: 'error', message: '对局未开始' });
    const game = room.game;
    if (game.phase !== PHASE.LEAD) return this._send(ws, { type: 'error', message: '当前不是出牌阶段' });
    const expectedLeader = ws.playerId === 'p1' ? 'player' : 'ai';
    if (game.leader !== expectedLeader) return this._send(ws, { type: 'error', message: '还没轮到你出牌' });
    try {
      game.playLead(expectedLeader, msg.cardId);
    } catch (e) {
      return this._send(ws, { type: 'error', message: e.message });
    }
    this._broadcastState(room);
  }

  _playRespond(ws, msg) {
    const room = ws.roomCode && this.rooms.get(ws.roomCode);
    if (!room || !room.started || !room.game) return this._send(ws, { type: 'error', message: '对局未开始' });
    const game = room.game;
    if (game.phase !== PHASE.RESPOND) return this._send(ws, { type: 'error', message: '当前不是应答阶段' });
    const expectedDefender = ws.playerId === 'p1' ? 'player' : 'ai';
    if (game.defender !== expectedDefender) return this._send(ws, { type: 'error', message: '还没轮到你应答' });
    const cardId = msg.cardId == null ? null : msg.cardId;
    try {
      game.playResponse(expectedDefender, cardId);
    } catch (e) {
      return this._send(ws, { type: 'error', message: e.message });
    }
    this._broadcastState(room);
    if (game.isOver) {
      room.endedAt = Date.now();
      this._broadcastEnd(room);
    }
  }

  _forfeit(ws) {
    const room = ws.roomCode && this.rooms.get(ws.roomCode);
    if (!room || !room.started || !room.game) return;
    const game = room.game;
    if (game.isOver) return;
    const loserCanon = ws.playerId === 'p1' ? 'player' : 'ai';
    const winnerCanon = loserCanon === 'player' ? 'ai' : 'player';
    // 把分差拉大为赢家获胜
    game.players[loserCanon].score = Math.min(game.players[loserCanon].score, game.players[winnerCanon].score - 1);
    game.phase = PHASE.OVER;
    game.log.push({
      round: game.round,
      leader: loserCanon,
      leadCard: null,
      respCard: null,
      match: { valid: false, name: '弃权', expl: `${game.players[loserCanon].name} 弃权，${game.players[winnerCanon].name} 获胜` },
      success: false,
      winnerId: winnerCanon,
      points: { total: 0 }
    });
    room.endedAt = Date.now();
    this._broadcastState(room);
    this._broadcastEnd(room);
  }

  _rematch(ws) {
    const room = ws.roomCode && this.rooms.get(ws.roomCode);
    if (!room || !room.game || !room.game.isOver) return;
    const cards = cardsByTopics(room.config.topicIds || []);
    const game = new Game(cards, {
      handSize: room.config.handSize,
      difficulty: room.config.difficulty
    });
    game.players.player.name = room.host.name;
    game.players.ai.name = room.guest.name;
    room.game = game;
    room.endedAt = null;
    this._broadcastState(room);
  }

  _broadcastStarted(room) {
    const base = {
      type: 'started',
      code: room.code,
      config: room.config,
      players: [
        { id: 'p1', name: room.host.name, role: 'host' },
        { id: 'p2', name: room.guest.name, role: 'guest' }
      ]
    };
    this._send(room.host, { ...base, myRole: 'host' });
    this._send(room.guest, { ...base, myRole: 'guest' });
  }

  _broadcastState(room) {
    if (room.host) this._send(room.host, { type: 'state', state: buildState(room.game, 'p1') });
    if (room.guest) this._send(room.guest, { type: 'state', state: buildState(room.game, 'p2') });
  }

  _broadcastEnd(room) {
    if (room.host) this._send(room.host, { type: 'end', result: buildState(room.game, 'p1').result });
    if (room.guest) this._send(room.guest, { type: 'end', result: buildState(room.game, 'p2').result });
  }

  _broadcastRoomUpdate(room) {
    const players = [
      room.host && { id: 'p1', name: room.host.name, role: 'host', ready: true },
      room.guest && { id: 'p2', name: room.guest.name, role: 'guest', ready: true }
    ].filter(Boolean);
    const payload = { type: 'roomUpdate', players, started: room.started, code: room.code };
    if (room.host) this._send(room.host, { ...payload, myRole: 'host' });
    if (room.guest) this._send(room.guest, { ...payload, myRole: 'guest' });
  }

  _onDisconnect(ws) {
    if (!ws.roomCode) return;
    const room = this.rooms.get(ws.roomCode);
    if (!room) return;
    const isHost = ws === room.host;
    const isGuest = ws === room.guest;
    if (!isHost && !isGuest) return;

    const slot = isHost ? 'host' : 'guest';
    const pid = isHost ? 'p1' : 'p2';

    // 对局未开始：直接清理
    if (!room.started) {
      if (isHost) {
        this._destroyRoom(room, '房主离开');
      } else {
        room.guest = null;
        this._send(room.host, { type: 'opponentLeft' });
        this._broadcastRoomUpdate(room);
      }
      return;
    }

    // 对局进行中：启动宽限重连定时器
    if (room.disconnectTimers[pid]) clearTimeout(room.disconnectTimers[pid]);
    room.disconnectTimers[pid] = setTimeout(() => {
      // 超时未重连：判负
      if (room[slot] === ws) {
        this._forfeit(ws);
        if (isHost) {
          this._destroyRoom(room, '房主断线超时');
        }
      }
    }, RECONNECT_GRACE_MS);

    const opponent = isHost ? room.guest : room.host;
    if (opponent) {
      this._send(opponent, { type: 'opponentLeft' });
    }
  }

  // ---- 附近玩家：位置档案 / 检索 / 邀请 ----

  _sanitizeProfile(ws, msg) {
    const p = ws.profile;
    if (msg.name != null) {
      const n = safeName(msg.name);
      p.name = n;
      ws.name = n;
    }
    if (msg.shareLocation != null) p.shareLocation = msg.shareLocation !== false;
    if (msg.radiusKm != null) {
      const r = Number(msg.radiusKm);
      if (Number.isFinite(r) && r >= 0) p.radiusKm = Math.min(MAX_RADIUS_KM, r);
    }
    if (msg.lat != null || msg.lng != null) {
      const lat = Number(msg.lat);
      const lng = Number(msg.lng);
      if (validCoord(lat, lng)) {
        p.lat = lat;
        p.lng = lng;
        p.source = String(msg.source || 'manual').slice(0, 12);
      } else {
        p.lat = null;
        p.lng = null;
        p.source = '';
      }
    }
  }

  // 连接所处状态：idle（可邀请）/ lobby（在房间未开局）/ playing（对局中）
  _statusOf(ws) {
    if (!ws.roomCode) return 'idle';
    const room = this.rooms.get(ws.roomCode);
    if (!room) return 'idle';
    if (room.started && room.game && !room.game.isOver) return 'playing';
    return 'lobby';
  }

  // 可直接加入的房间号（仅房主、未开局、无对手）
  _joinableCode(ws) {
    if (!ws.roomCode) return null;
    const room = this.rooms.get(ws.roomCode);
    if (!room || room.host !== ws) return null;
    if (room.started || room.guest) return null;
    return room.code;
  }

  _nearby(ws, msg) {
    const requestId = msg.requestId == null ? null : msg.requestId;
    this._sanitizeProfile(ws, msg);
    const self = ws.profile;
    if (!validCoord(self.lat, self.lng)) {
      return this._send(ws, { type: 'nearbyList', requestId, needLocation: true, total: 0, players: [] });
    }

    const myRadius = self.radiusKm > 0 ? self.radiusKm : Infinity;
    const list = [];
    for (const other of this.clients) {
      if (other === ws) continue;
      if (other.readyState !== other.OPEN) continue;
      const op = other.profile;
      if (!op || op.shareLocation === false) continue;
      if (!validCoord(op.lat, op.lng)) continue;
      const distanceKm = haversineKm(self, op);
      if (!Number.isFinite(distanceKm)) continue;
      if (distanceKm > myRadius) continue;
      // 双向隐私：对方的可被搜索半径同样生效
      const otherRadius = op.radiusKm > 0 ? op.radiusKm : Infinity;
      if (distanceKm > otherRadius) continue;
      list.push({
        id: other.pid,
        name: op.name,
        distanceKm: Math.round(distanceKm * 100) / 100,
        status: this._statusOf(other),
        joinableCode: this._joinableCode(other),
        source: op.source
      });
    }
    list.sort((a, b) => a.distanceKm - b.distanceKm);
    this._send(ws, {
      type: 'nearbyList',
      requestId,
      needLocation: false,
      total: list.length,
      players: list.slice(0, NEARBY_LIMIT),
      self: { shareLocation: self.shareLocation, radiusKm: self.radiusKm }
    });
  }

  _invite(ws, msg) {
    const targetId = String(msg.targetId || '');
    let target = null;
    for (const c of this.clients) {
      if (c.pid === targetId) { target = c; break; }
    }
    if (!target || target.readyState !== target.OPEN) {
      return this._send(ws, { type: 'error', message: '对方已离线' });
    }
    if (target === ws) return this._send(ws, { type: 'error', message: '不能邀请自己' });
    if (this._statusOf(target) !== 'idle') {
      return this._send(ws, { type: 'error', message: '对方正在对局中' });
    }

    let room;
    if (ws.roomCode) {
      room = this.rooms.get(ws.roomCode);
      if (!room || room.host !== ws) return this._send(ws, { type: 'error', message: '只有房主可以邀请' });
      if (room.started) return this._send(ws, { type: 'error', message: '对局已开始' });
      if (room.guest) return this._send(ws, { type: 'error', message: '房间已有对手' });
    } else {
      // 一键邀请：为邀请者自动建房，对方接受后按普通 join 入房
      room = this._createRoom(ws, safeName(msg.name || ws.profile.name), this._sanitizeConfig(msg.config));
    }

    this._send(target, {
      type: 'invite',
      fromId: ws.pid,
      fromName: room.host.name,
      code: room.code,
      config: room.config
    });
    this._send(ws, { type: 'inviteSent', targetId: target.pid, targetName: target.profile.name, code: room.code });
  }

  _declineInvite(ws, msg) {
    const fromId = String(msg.fromId || '');
    for (const c of this.clients) {
      if (c.pid === fromId) {
        this._send(c, { type: 'inviteDeclined', fromId: ws.pid, fromName: ws.profile.name });
        return;
      }
    }
  }

  _sanitizeConfig(raw) {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const handSize = [5, 6, 8].includes(Number(cfg.handSize)) ? Number(cfg.handSize) : 6;
    const topicIds = Array.isArray(cfg.topicIds) ? cfg.topicIds.map(String) : [];
    return {
      mode: cfg.mode === 'ion' ? 'ion' : 'substance',
      topicIds,
      handSize,
      difficulty: cfg.difficulty === 'easy' ? 'easy' : 'normal',
      showHints: cfg.showHints !== false
    };
  }
}

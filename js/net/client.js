// 联机客户端：WebSocket 连接、房间创建/加入、NetDriver（供 board.js 消费）
// 与服务端协议保持一致：所有消息为 JSON，type 字段标识动作。
import { PHASE } from '../core/game.js';

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}

export class NetClient {
  constructor() {
    this.ws = null;
    this._handlers = new Map(); // type -> Set<fn>
    this._token = null;
    this._code = null;
    this._role = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl());
      this.ws = ws;
      let opened = false;
      ws.onopen = () => { opened = true; resolve(); };
      ws.onerror = () => {
        if (!opened) reject(new Error('无法连接到联机服务器'));
      };
      ws.onclose = () => {
        if (!opened) reject(new Error('连接被关闭'));
        this._emit('close');
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        this._emit(msg.type, msg);
      };
    });
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this._handlers.get(type)?.delete(fn);
  }

  _emit(type, payload) {
    const set = this._handlers.get(type);
    if (set) for (const fn of set) fn(payload);
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // 等待某类消息（一次性），可传多个 type；error 类型会 reject
  _wait(types, timeoutMs = 15_000) {
    const typeList = Array.isArray(types) ? types : [types];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('等待超时'));
      }, timeoutMs);
      const handler = (msg) => {
        if (typeList.includes(msg.type)) {
          cleanup();
          if (msg.type === 'error') reject(new Error(msg.message));
          else resolve(msg);
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        for (const t of typeList) this._handlers.get(t)?.delete(handler);
      };
      for (const t of typeList) {
        if (!this._handlers.has(t)) this._handlers.set(t, new Set());
        this._handlers.get(t).add(handler);
      }
    });
  }

  async createRoom(name, config) {
    this.send({ type: 'create', name, config });
    const result = await this._wait(['roomCreated', 'error']);
    this._code = result.code;
    this._role = result.role;
    this._token = result.token;
    this._persistSession();
    return result;
  }

  async joinRoom(code, name, token = null) {
    this.send({ type: 'join', code, name, token });
    // joined / reconnected / error 任一到达即可
    const res = await this._wait(['joined', 'reconnected', 'error']);
    this._code = res.code;
    this._role = res.role;
    if (res.token) {
      this._token = res.token;
      this._persistSession();
    }
    return res;
  }

  leaveRoom() {
    this.send({ type: 'leave' });
    this._clearSession();
  }

  forfeit() {
    this.send({ type: 'forfeit' });
  }

  rematch() {
    this.send({ type: 'rematch' });
  }

  // ---- 附近玩家 ----

  // 请求附近玩家列表；超时或 error 时 reject，由调用方做重试
  requestNearby(options = {}, timeoutMs = 8_000) {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.send({ type: 'nearby', ...options, requestId });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('附近玩家请求超时'));
      }, timeoutMs);
      const onList = (msg) => {
        if (msg.requestId !== requestId) return;
        cleanup();
        resolve(msg);
      };
      const onError = (msg) => {
        cleanup();
        reject(new Error(msg.message || '附近玩家请求失败'));
      };
      const cleanup = () => {
        clearTimeout(timer);
        this._handlers.get('nearbyList')?.delete(onList);
        this._handlers.get('error')?.delete(onError);
      };
      if (!this._handlers.has('nearbyList')) this._handlers.set('nearbyList', new Set());
      this._handlers.get('nearbyList').add(onList);
      if (!this._handlers.has('error')) this._handlers.set('error', new Set());
      this._handlers.get('error').add(onError);
    });
  }

  // 一键邀请附近玩家（服务端会为邀请者自动建房）
  invitePlayer(targetId, config = null, name = null) {
    this.send({ type: 'invite', targetId, config, name });
  }

  declineInvite(fromId) {
    this.send({ type: 'inviteDecline', fromId });
  }

  close() {
    try { this.ws?.close(); } catch {}
    this._clearSession();
  }

  _persistSession() {
    try {
      sessionStorage.setItem('cp-net-session', JSON.stringify({
        code: this._code, role: this._role, token: this._token
      }));
    } catch {}
  }

  _clearSession() {
    this._code = null;
    this._role = null;
    this._token = null;
    try { sessionStorage.removeItem('cp-net-session'); } catch {}
  }

  getSession() {
    try {
      return JSON.parse(sessionStorage.getItem('cp-net-session') || 'null');
    } catch { return null; }
  }
}

// NetDriver：把 WebSocket 消息适配为 board.js 需要的驱动接口
export class NetDriver {
  constructor(client, { opponentName, config }) {
    this.client = client;
    this._state = null;
    this._onStateCbs = [];
    this._onEndCbs = [];
    this._onErrorCbs = [];
    this._onOpponentLeftCbs = [];
    this._onOpponentReconnectedCbs = [];
    this.opponentName = opponentName;
    this.config = config;
    this._ended = false;

    this._unsub = [
      client.on('state', (msg) => {
        this._state = msg.state;
        this._emitState();
        if (this._state.isOver && !this._ended) {
          this._ended = true;
          this._emitEnd();
        }
      }),
      client.on('end', () => {
        if (!this._ended) {
          this._ended = true;
          this._emitEnd();
        }
      }),
      client.on('error', (msg) => {
        for (const cb of this._onErrorCbs) cb(msg.message);
      }),
      client.on('opponentLeft', () => {
        for (const cb of this._onOpponentLeftCbs) cb();
      }),
      client.on('opponentReconnected', (msg) => {
        for (const cb of this._onOpponentReconnectedCbs) cb(msg.name);
      })
    ];
  }

  get state() { return this._state; }

  onState(cb) { this._onStateCbs.push(cb); }
  onEnd(cb) { this._onEndCbs.push(cb); }
  onError(cb) { this._onErrorCbs.push(cb); }
  onOpponentLeft(cb) { this._onOpponentLeftCbs.push(cb); }
  onOpponentReconnected(cb) { this._onOpponentReconnectedCbs.push(cb); }

  _emitState() { for (const cb of this._onStateCbs) cb(); }
  _emitEnd() { for (const cb of this._onEndCbs) cb(this._state); }

  playLead(cardId) {
    this.client.send({ type: 'playLead', cardId });
  }

  playRespond(cardId) {
    this.client.send({ type: 'playRespond', cardId });
  }

  start() {
    if (this._state) this._emitState();
  }

  destroy() {
    for (const unsub of this._unsub) unsub();
    this._onStateCbs = [];
    this._onEndCbs = [];
  }
}

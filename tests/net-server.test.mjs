// 联机服务端综合测试：房间 / 状态同步 / 并发动作 / 断线重连 / 信息隐藏 / 异常场景
// 运行：node tests/net-server.test.mjs（需先确保 8081 端口空闲，测试会自启服务）
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { MultiplayerServer } from '../js/net/server.js';

const PORT = 8081;
const TOPIC_IDS = ['inorg-metal', 'inorg-nonmetal', 'inorg-matter', 'inorg-periodic', 'inorg-principle'];

let passed = 0, failed = 0;
const results = [];

async function t(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
function eq(a, b, msg) { assert(a === b, `${msg || ''} 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

// ---- 测试用 HTTP+WS 服务 ----
let httpServer, mp;
function startTestServer() {
  return new Promise((resolve) => {
    httpServer = createServer();
    mp = new MultiplayerServer();
    const wss = new WebSocketServer({ server: httpServer });
    wss.on('connection', (ws, req) => mp.handleConnection(ws, req));
    httpServer.listen(PORT, () => resolve());
  });
}
function stopTestServer() {
  return new Promise((resolve) => {
    for (const room of mp.rooms.values()) {
      for (const ws of [room.host, room.guest].filter(Boolean)) {
        try { ws.terminate(); } catch {}
      }
    }
    httpServer.close(() => resolve());
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function send(ws, msg) { ws.send(JSON.stringify(msg)); }

function waitMsg(ws, type, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`等待 ${type} 超时`)), timeout);
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === type) {
          clearTimeout(t);
          ws.off('message', handler);
          resolve(msg);
        }
      } catch {}
    };
    ws.on('message', handler);
  });
}

function waitMsgAny(ws, types, timeout = 3000) {
  const set = new Set(types);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`等待 ${types.join('/')} 超时`)), timeout);
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (set.has(msg.type)) {
          clearTimeout(t);
          ws.off('message', handler);
          resolve(msg);
        }
      } catch {}
    };
    ws.on('message', handler);
  });
}

async function createRoom(ws, name = '房主', overrides = {}) {
  send(ws, { type: 'create', name, config: { mode: 'substance', topicIds: TOPIC_IDS, handSize: 5, difficulty: 'normal', showHints: true, ...overrides } });
  return waitMsg(ws, 'roomCreated');
}

async function joinRoom(ws, code, name = '客人') {
  send(ws, { type: 'join', code, name });
  return waitMsg(ws, 'joined');
}

async function startGame(host, guest) {
  send(host, { type: 'start' });
  const [h, g] = await Promise.all([waitMsg(host, 'state'), waitMsg(guest, 'state')]);
  return { hostState: h.state, guestState: g.state };
}

// 用最优策略自动打完一局（双方都出第一张手牌）
async function autoPlay(host, guest, hostState0, guestState0, maxRounds = 40) {
  let hostState = hostState0;
  let guestState = guestState0;
  for (let i = 0; i < maxRounds; i++) {
    if (hostState.isOver) break;
    const leaderIsHost = hostState.leader === 'player';
    const actor = hostState.phase === 'lead'
      ? (leaderIsHost ? host : guest)
      : (leaderIsHost ? guest : host);
    const st = actor === host ? hostState : guestState;
    if (st.phase === 'lead') {
      const card = st.players.player.hand[0];
      send(actor, { type: 'playLead', cardId: card.id });
    } else {
      const card = st.players.player.hand[0] || null;
      send(actor, { type: 'playRespond', cardId: card ? card.id : null });
    }
    const [h, g] = await Promise.all([waitMsg(host, 'state'), waitMsg(guest, 'state')]);
    hostState = h.state;
    guestState = g.state;
  }
  return { hostState, guestState };
}

console.log('— 联机服务端测试 —');
await startTestServer();
console.log('测试服务已启动于端口', PORT);

// 1. 房间创建与加入
await t('创建房间返回 6 位数字房号', async () => {
  const ws = await connect();
  const res = await createRoom(ws);
  assert(/^\d{6}$/.test(res.code), `房号格式错误: ${res.code}`);
  ws.close();
});

await t('加入房间成功并获得 guest 角色', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  const joined = await joinRoom(guest, created.code);
  eq(joined.role, 'guest');
  host.close(); guest.close();
});

await t('加入不存在的房间返回错误', async () => {
  const ws = await connect();
  send(ws, { type: 'join', code: '999999', name: 'x' });
  const res = await waitMsg(ws, 'error');
  assert(res.message.includes('不存在'));
  ws.close();
});

await t('加入已满房间返回错误', async () => {
  const host = await connect();
  const g1 = await connect();
  const g2 = await connect();
  const created = await createRoom(host);
  await joinRoom(g1, created.code);
  send(g2, { type: 'join', code: created.code, name: 'x' });
  const err = await waitMsg(g2, 'error');
  assert(err.message.includes('满'));
  host.close(); g1.close(); g2.close();
});

// 2. 开局握手：started 必须先于 state 到达，双方据此建立驱动后再接收状态
await t('开局双方先收到 started（含 myRole/config/players）再收到 state', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host, '房主A');
  await joinRoom(guest, created.code, '客人B');

  const seq = new Map([[host, []], [guest, []]]);
  const record = (ws) => (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'started' || msg.type === 'state') seq.get(ws).push(msg);
    } catch {}
  };
  host.on('message', record(host));
  guest.on('message', record(guest));

  send(host, { type: 'start' });
  await Promise.all([waitMsg(host, 'state'), waitMsg(guest, 'state')]);

  for (const [ws, role] of [[host, 'host'], [guest, 'guest']]) {
    const msgs = seq.get(ws);
    eq(msgs[0].type, 'started', 'started 应先于 state 到达');
    eq(msgs[1].type, 'state');
    eq(msgs[0].myRole, role);
    eq(msgs[0].config.handSize, 5);
    eq(msgs[0].players.length, 2);
  }
  host.close(); guest.close();
});

// 3. 信息隐藏
await t('房主视角不泄露对手手牌', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  await joinRoom(guest, created.code);
  const { hostState: hs } = await startGame(host, guest);
  eq(hs.players.ai.hand.length, 0, '对手手牌应为空数组');
  assert(hs.players.ai.handCount > 0, '应提供 handCount');
  host.close(); guest.close();
});

await t('客人视角不泄露对手手牌', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  await joinRoom(guest, created.code);
  const { guestState: gs } = await startGame(host, guest);
  eq(gs.players.ai.hand.length, 0);
  assert(gs.players.ai.handCount > 0);
  host.close(); guest.close();
});

// 3. 透视正确性
await t('双方视角中自己永远是 player', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host, '房主A');
  await joinRoom(guest, created.code, '客人B');
  const { hostState: hs, guestState: gs } = await startGame(host, guest);
  eq(hs.players.player.name, '房主A');
  eq(hs.players.ai.name, '客人B');
  eq(gs.players.player.name, '客人B');
  eq(gs.players.ai.name, '房主A');
  host.close(); guest.close();
});

await t('双方 leader 视角一致（同一人先手）', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  await joinRoom(guest, created.code);
  const { hostState: hs, guestState: gs } = await startGame(host, guest);
  if (hs.leader === 'player') eq(gs.leader, 'ai');
  else eq(gs.leader, 'player');
  host.close(); guest.close();
});

// 4. 回合同步
await t('完整对局结束后双方分数与日志一致', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  await joinRoom(guest, created.code);
  const { hostState: hs0, guestState: gs0 } = await startGame(host, guest);
  const { hostState, guestState } = await autoPlay(host, guest, hs0, gs0);
  assert(hostState.isOver, '对局应结束');
  assert(guestState.isOver, '对局应结束');
  eq(hostState.players.player.score, guestState.players.ai.score);
  eq(hostState.players.ai.score, guestState.players.player.score);
  eq(hostState.log.length, guestState.log.length);
  host.close(); guest.close();
});

// 5. 非法动作
await t('非当前出牌方出牌返回错误且状态不变', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  await joinRoom(guest, created.code);
  const { hostState: hs0, guestState: gs0 } = await startGame(host, guest);
  const leaderIsHost = hs0.leader === 'player';
  const wrong = leaderIsHost ? guest : host;
  const card = (wrong === host ? hs0 : gs0).players.player.hand[0];
  send(wrong, { type: 'playLead', cardId: card.id });
  const err = await waitMsg(wrong, 'error');
  assert(err.message.includes('轮') || err.message.includes('阶段'));
  host.close(); guest.close();
});

await t('应答阶段先手出牌返回错误', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  await joinRoom(guest, created.code);
  let { hostState: hs, guestState: gs } = await startGame(host, guest);
  const leaderIsHost = hs.leader === 'player';
  const leader = leaderIsHost ? host : guest;
  const lst = leader === host ? hs : gs;
  send(leader, { type: 'playLead', cardId: lst.players.player.hand[0].id });
  const [h, g] = await Promise.all([waitMsg(host, 'state'), waitMsg(guest, 'state')]);
  hs = h.state; gs = g.state;
  eq(hs.phase, 'respond');
  send(leader, { type: 'playLead', cardId: lst.players.player.hand[1].id });
  const err = await waitMsg(leader, 'error');
  assert(err.message);
  host.close(); guest.close();
});

// 6. 并发房间隔离
await t('两个房间互不干扰', async () => {
  const h1 = await connect(), g1 = await connect();
  const h2 = await connect(), g2 = await connect();
  const c1 = await createRoom(h1, '房主1');
  const c2 = await createRoom(h2, '房主2');
  await joinRoom(g1, c1.code);
  await joinRoom(g2, c2.code);
  const { hostState: s1 } = await startGame(h1, g1);
  const { hostState: s2 } = await startGame(h2, g2);
  const h1ids = s1.players.player.hand.map(c => c.id).join(',');
  const h2ids = s2.players.player.hand.map(c => c.id).join(',');
  assert(h1ids !== h2ids, '两个房间手牌应不同（随机发牌）');
  h1.close(); g1.close(); h2.close(); g2.close();
});

// 7. 房主离开未开始房间 → 房间销毁
await t('房主未开始时离开，房间销毁', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  await joinRoom(guest, created.code);
  send(host, { type: 'leave' });
  const msg = await waitMsgAny(guest, ['roomDestroyed', 'opponentLeft']);
  assert(['roomDestroyed', 'opponentLeft'].includes(msg.type));
  host.close(); guest.close();
});

// 8. 对手离开对局 → 通知
await t('对局中对手断开，本方收到 opponentLeft', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  await joinRoom(guest, created.code);
  await startGame(host, guest);
  guest.close();
  const msg = await waitMsg(host, 'opponentLeft', 5000);
  assert(msg);
  host.close();
});

// 9. 断线重连（令牌恢复）
await t('断线后凭令牌可重连并恢复状态', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  const joined = await joinRoom(guest, created.code);
  const { guestState: gs0 } = await startGame(host, guest);
  const token = joined.token;
  guest.close();
  await new Promise(r => setTimeout(r, 100));
  const guest2 = await connect();
  send(guest2, { type: 'join', code: created.code, name: '客人', token });
  const [reconnected, stMsg] = await Promise.all([
    waitMsg(guest2, 'reconnected'),
    waitMsg(guest2, 'state')
  ]);
  eq(reconnected.role, 'guest');
  const gs1 = stMsg.state;
  eq(gs1.players.player.hand.length, gs0.players.player.hand.length, '重连后手牌数量应一致');
  host.close(); guest2.close();
});

// 10. 恶意消息不崩溃
await t('发送非法 JSON 不影响服务', async () => {
  const ws = await connect();
  ws.send('not json at all');
  ws.send(JSON.stringify({}));
  ws.send(JSON.stringify({ type: 'unknownAction' }));
  // 服务仍能正常响应
  const res = await createRoom(ws);
  assert(/^\d{6}$/.test(res.code));
  ws.close();
});

await t('发送超大消息不会导致内存爆炸（截断处理）', async () => {
  const ws = await connect();
  const big = JSON.stringify({ type: 'create', name: 'x'.repeat(100000), config: { topicIds: TOPIC_IDS, handSize: 5 } });
  ws.send(big);
  // 服务应能正常响应后续请求
  const ws2 = await connect();
  const res = await createRoom(ws2);
  assert(/^\d{6}$/.test(res.code));
  ws.close(); ws2.close();
});

// 11. 弃权
await t('弃权后对手获胜', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  await joinRoom(guest, created.code);
  await startGame(host, guest);
  send(host, { type: 'forfeit' });
  const hs = (await waitMsg(host, 'state')).state;
  assert(hs.isOver);
  eq(hs.result.winnerId, 'ai', '房主弃权后对手（ai）应获胜');
  host.close(); guest.close();
});

// 12. 再来一局
await t('再来一局生成全新手牌与分数', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  await joinRoom(guest, created.code);
  const { hostState: hs0, guestState: gs0 } = await startGame(host, guest);
  const { hostState } = await autoPlay(host, guest, hs0, gs0);
  assert(hostState.isOver);
  send(host, { type: 'rematch' });
  const hs = (await waitMsg(host, 'state')).state;
  eq(hs.phase, 'lead');
  eq(hs.players.player.score, 0);
  eq(hs.players.ai.score, 0);
  eq(hs.log.length, 0);
  assert(hs.players.player.hand.length > 0);
  host.close(); guest.close();
});

// 13. 只有房主能开始
await t('非房主尝试开始返回错误', async () => {
  const host = await connect();
  const guest = await connect();
  const created = await createRoom(host);
  await joinRoom(guest, created.code);
  send(guest, { type: 'start' });
  const err = await waitMsg(guest, 'error');
  assert(err.message.includes('房主'));
  host.close(); guest.close();
});

// 14. 心跳存活检测（快速版：模拟心跳超时较难，改为验证 ping/pong）
await t('ping/pong 心跳正常', async () => {
  const ws = await connect();
  send(ws, { type: 'ping' });
  const res = await waitMsg(ws, 'pong');
  assert(res);
  ws.close();
});

console.log(`\n结果：${passed} 通过，${failed} 失败`);
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

// 附近玩家测试：地理距离 / 隐私 / 双向半径 / 自动建房邀请 / 性能 / 兼容性
// 运行：node tests/net-nearby.test.mjs（端口 8082，测试会自启服务）
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { MultiplayerServer } from '../js/net/server.js';
import { haversineKm, validCoord, formatDistance } from '../js/net/geo.js';

const PORT = 8082;
const TOPIC_IDS = ['inorg-metal', 'inorg-nonmetal', 'inorg-matter', 'inorg-periodic', 'inorg-principle'];

// 北京市中心作为原点
const ORIGIN = { lat: 39.9042, lng: 116.4074 };
const KM_PER_DEG_LAT = 111.19;

let passed = 0, failed = 0;

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
function near(a, b, tol, msg) { assert(Math.abs(a - b) <= tol, `${msg || ''} 期望 ≈${b}（±${tol}），实际 ${a}`); }

// ---- 测试服务 ----
let httpServer, mp;
const sockets = new Set();

function startTestServer() {
  return new Promise((resolve) => {
    httpServer = createServer();
    mp = new MultiplayerServer();
    const wss = new WebSocketServer({ server: httpServer });
    wss.on('connection', (ws, req) => {
      sockets.add(ws);
      ws.on('close', () => sockets.delete(ws));
      mp.handleConnection(ws, req);
    });
    httpServer.listen(PORT, () => resolve());
  });
}
function stopTestServer() {
  return new Promise((resolve) => {
    for (const ws of sockets) { try { ws.terminate(); } catch {} }
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

// 带缓冲的消息记录器：避免「先到消息、后挂监听」的竞态
function recorder(ws) {
  const buf = [];
  const waiters = new Set();
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const hit = [...waiters].find(w => w.types.has(msg.type));
    if (hit) {
      waiters.delete(hit);
      hit.resolve(msg);
      return;
    }
    buf.push(msg);
  });
  return {
    wait(types, timeout = 3000) {
      const set = new Set(Array.isArray(types) ? types : [types]);
      const idx = buf.findIndex(m => set.has(m.type));
      if (idx >= 0) return Promise.resolve(buf.splice(idx, 1)[0]);
      return new Promise((resolve, reject) => {
        const entry = { types: set, resolve: null };
        const timer = setTimeout(() => {
          waiters.delete(entry);
          reject(new Error(`等待 ${[...set].join('/')} 超时`));
        }, timeout);
        entry.resolve = (msg) => { clearTimeout(timer); resolve(msg); };
        waiters.add(entry);
      });
    }
  };
}

async function online(name, lat, lng, extra = {}) {
  const ws = await connect();
  const rec = recorder(ws);
  if (lat != null) {
    send(ws, { type: 'nearby', name, lat, lng, source: 'gps', radiusKm: 30, shareLocation: true, ...extra });
    await rec.wait('nearbyList');
  }
  return { ws, rec };
}

async function scan(client, options = {}) {
  send(client.ws, { type: 'nearby', ...options });
  return client.rec.wait('nearbyList');
}

function latOffset(km) { return ORIGIN.lat + km / KM_PER_DEG_LAT; }

console.log('— 附近玩家测试 —');
await startTestServer();
console.log('测试服务已启动于端口', PORT);

// 1. 地理计算
await t('haversine 距离计算精度（北京-上海 ≈ 1067 km）', () => {
  const d = haversineKm({ lat: 39.9042, lng: 116.4074 }, { lat: 31.2304, lng: 121.4737 });
  near(d, 1067, 15, '直线距离');
});

await t('坐标校验与距离格式化', () => {
  assert(validCoord(39.9, 116.4));
  assert(!validCoord(91, 0));
  assert(!validCoord('x', 116));
  eq(formatDistance(0.45), '450 m');
  eq(formatDistance(5.5), '5.5 km');
  eq(formatDistance(56.3), '56 km');
  eq(formatDistance(Infinity), '距离未知');
});

// 2. 距离排序
await t('附近玩家按距离由近到远排序', async () => {
  const self = await online('自己', ORIGIN.lat, ORIGIN.lng, { radiusKm: 0 });
  const far = await online('远处玩家', latOffset(55), ORIGIN.lng, { radiusKm: 0 });
  const near1 = await online('近处玩家', latOffset(1), ORIGIN.lng, { radiusKm: 0 });
  const mid = await online('中距玩家', latOffset(10), ORIGIN.lng, { radiusKm: 0 });

  const res = await scan(self, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 0, shareLocation: true, name: '自己' });
  const names = res.players.map(p => p.name);
  eq(names[0], '近处玩家');
  eq(names[1], '中距玩家');
  eq(names[2], '远处玩家');
  const sorted = res.players.every((p, i) => i === 0 || p.distanceKm >= res.players[i - 1].distanceKm);
  assert(sorted, '距离未升序');
  near(res.players[0].distanceKm, 1, 0.1, '近处玩家距离');
  near(res.players[1].distanceKm, 10, 0.2, '中距玩家距离');
  near(res.players[2].distanceKm, 55, 0.5, '远处玩家距离');

  for (const c of [self, far, near1, mid]) c.ws.close();
});

// 3. 距离范围过滤
await t('搜索半径过滤：5 km 内仅返回近处玩家', async () => {
  const self = await online('自己', ORIGIN.lat, ORIGIN.lng, { radiusKm: 30 });
  const near1 = await online('近处玩家', latOffset(1), ORIGIN.lng, { radiusKm: 30 });
  const mid = await online('中距玩家', latOffset(10), ORIGIN.lng, { radiusKm: 30 });
  const far = await online('远处玩家', latOffset(60), ORIGIN.lng, { radiusKm: 30 });
  const res = await scan(self, { radiusKm: 5, lat: ORIGIN.lat, lng: ORIGIN.lng, name: '自己' });
  eq(res.players.length, 1, '5 km 内应只有 1 人');
  eq(res.players[0].name, '近处玩家');

  const res30 = await scan(self, { radiusKm: 30, lat: ORIGIN.lat, lng: ORIGIN.lng, name: '自己' });
  eq(res30.players.length, 2, '30 km 内应有 2 人');
  assert(!res30.players.some(p => p.name === '远处玩家'));

  for (const c of [self, near1, mid, far]) c.ws.close();
});

// 4. 隐私开关
await t('关闭位置公开后不出现在他人列表', async () => {
  const self = await online('自己', ORIGIN.lat, ORIGIN.lng);
  const target = await online('低头玩家', latOffset(1), ORIGIN.lng);

  let res = await scan(self, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 30, name: '自己' });
  assert(res.players.some(p => p.name === '低头玩家'), '开启时应可见');

  await scan(target, {
    lat: latOffset(1), lng: ORIGIN.lng, radiusKm: 30,
    shareLocation: false, name: '低头玩家'
  });

  res = await scan(self, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 30, name: '自己' });
  assert(!res.players.some(p => p.name === '低头玩家'), '关闭后应不可见');

  // 重新开启
  await scan(target, {
    lat: latOffset(1), lng: ORIGIN.lng, radiusKm: 30,
    shareLocation: true, name: '低头玩家'
  });
  res = await scan(self, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 30, name: '自己' });
  assert(res.players.some(p => p.name === '低头玩家'), '重新开启后应恢复可见');

  self.ws.close(); target.ws.close();
});

// 5. 双向半径
await t('双向半径：对方可被搜索范围同样生效', async () => {
  const self = await online('自己', ORIGIN.lat, ORIGIN.lng, { radiusKm: 100 });
  const target = await online('低调玩家', latOffset(10), ORIGIN.lng, { radiusKm: 5 });

  let res = await scan(self, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 100, name: '自己' });
  assert(!res.players.some(p => p.name === '低调玩家'), '对方半径 5 km 时不应出现');

  await scan(target, { lat: latOffset(10), lng: ORIGIN.lng, radiusKm: 100, name: '低调玩家' });
  res = await scan(self, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 100, name: '自己' });
  assert(res.players.some(p => p.name === '低调玩家'), '对方放宽到 100 km 后应出现');

  self.ws.close(); target.ws.close();
});

// 6. 位置更新
await t('位置更新后距离与列表实时生效', async () => {
  const self = await online('自己', ORIGIN.lat, ORIGIN.lng, { radiusKm: 30 });
  const target = await online('移动玩家', latOffset(1), ORIGIN.lng, { radiusKm: 30 });

  let res = await scan(self, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 30, name: '自己' });
  const before = res.players.find(p => p.name === '移动玩家');
  assert(before, '移动前应可见');
  near(before.distanceKm, 1, 0.1, '移动前距离');

  // 移动到 45 km 外
  await scan(target, { lat: latOffset(45), lng: ORIGIN.lng, radiusKm: 30, name: '移动玩家' });
  res = await scan(self, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 30, name: '自己' });
  assert(!res.players.some(p => p.name === '移动玩家'), '超出 30 km 后应不可见');

  self.ws.close(); target.ws.close();
});

// 7. 无位置
await t('未提供坐标时返回 needLocation', async () => {
  const ws = await connect();
  const rec = recorder(ws);
  send(ws, { type: 'nearby', name: '无位置玩家' });
  const res = await rec.wait('nearbyList');
  eq(res.needLocation, true);
  eq(res.players.length, 0);
  ws.close();
});

// 8. 一键邀请 + 自动建房
await t('一键邀请自动建房，对方接受后可开局', async () => {
  const host = await online('邀请者', ORIGIN.lat, ORIGIN.lng, { radiusKm: 30 });
  const guest = await online('被邀请者', latOffset(1), ORIGIN.lng, { radiusKm: 30 });

  const list = await scan(host, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 30, name: '邀请者' });
  const target = list.players.find(p => p.name === '被邀请者');
  assert(target, '应能在列表中找到被邀请者');
  eq(target.status, 'idle');

  send(host.ws, {
    type: 'invite',
    targetId: target.id,
    name: '邀请者',
    config: { mode: 'substance', topicIds: TOPIC_IDS, handSize: 5, difficulty: 'normal', showHints: true }
  });

  const created = await host.rec.wait('roomCreated');
  const initialUpdate = await host.rec.wait('roomUpdate');
  eq(initialUpdate.players.length, 1, '自动建房后房主独自在房间');
  const sent = await host.rec.wait('inviteSent');
  assert(/^\d{6}$/.test(created.code));
  eq(sent.code, created.code);
  eq(sent.targetName, '被邀请者');

  const invite = await guest.rec.wait('invite');
  eq(invite.fromName, '邀请者');
  eq(invite.code, created.code);

  // 接受邀请 = 普通 join
  send(guest.ws, { type: 'join', code: invite.code, name: '被邀请者' });
  const joined = await guest.rec.wait('joined');
  eq(joined.role, 'guest');
  const roomUpdate = await host.rec.wait('roomUpdate');
  eq(roomUpdate.players.length, 2, '房主应看到两人房间');

  // 与原有开局流程兼容
  send(host.ws, { type: 'start' });
  const started = await host.rec.wait('started');
  eq(started.players.length, 2);
  const state = await host.rec.wait('state');
  assert(state.state.phase === 'lead');

  host.ws.close(); guest.ws.close();
});

// 9. 忙碌目标拒绝邀请
await t('目标在房间中时邀请被拒绝', async () => {
  const host = await online('邀请者', ORIGIN.lat, ORIGIN.lng, { radiusKm: 30 });
  const busyClient = await online('忙碌玩家', latOffset(1), ORIGIN.lng, { radiusKm: 30 });

  // 让忙碌玩家先建一个房间（处于 lobby 状态）
  send(busyClient.ws, { type: 'create', name: '忙碌玩家', config: { topicIds: TOPIC_IDS, handSize: 5 } });
  const created = await busyClient.rec.wait('roomCreated');

  const list = await scan(host, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 30, name: '邀请者' });
  const target = list.players.find(p => p.name === '忙碌玩家');
  eq(target.status, 'lobby');
  eq(target.joinableCode, created.code, '房主等待中应可直接加入');

  send(host.ws, { type: 'invite', targetId: target.id, name: '邀请者', config: { topicIds: TOPIC_IDS } });
  const err = await host.rec.wait('error');
  assert(err.message.includes('对局') || err.message.includes('房间'), `拒绝原因异常: ${err.message}`);

  host.ws.close(); busyClient.ws.close();
});

// 10. 拒绝邀请
await t('对方拒绝邀请后邀请者收到通知', async () => {
  const host = await online('邀请者', ORIGIN.lat, ORIGIN.lng, { radiusKm: 30 });
  const guest = await online('被邀请者', latOffset(1), ORIGIN.lng, { radiusKm: 30 });

  const list = await scan(host, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 30, name: '邀请者' });
  const target = list.players.find(p => p.name === '被邀请者');
  send(host.ws, { type: 'invite', targetId: target.id, name: '邀请者', config: { topicIds: TOPIC_IDS } });
  const invite = await guest.rec.wait('invite');

  send(guest.ws, { type: 'inviteDecline', fromId: invite.fromId });
  const declined = await host.rec.wait('inviteDeclined');
  eq(declined.fromName, '被邀请者');

  host.ws.close(); guest.ws.close();
});

// 11. 多人在线列表性能
await t('100 人在线时列表加载性能与 50 人上限', async () => {
  const many = [];
  for (let i = 0; i < 100; i++) {
    const ws = await connect();
    const rec = recorder(ws);
    many.push({ ws, rec });
    send(ws, {
      type: 'nearby',
      name: `玩家${i}`,
      lat: latOffset(i % 50),
      lng: ORIGIN.lng,
      radiusKm: 0,
      shareLocation: true
    });
  }
  const acks = await Promise.all(many.map(c => c.rec.wait('nearbyList', 8000)));

  const observer = await connect();
  const rec = recorder(observer);
  const startedAt = Date.now();
  send(observer, { type: 'nearby', name: '观察者', lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 0, shareLocation: true });
  const res = await rec.wait('nearbyList', 8000);
  const elapsed = Date.now() - startedAt;

  eq(res.players.length, 50, '单次最多返回 50 人');
  assert(res.total >= 100, `total 应 >= 100，实际 ${res.total}`);
  assert(res.players.every(p => p.name && p.distanceKm >= 0), '列表项字段缺失');
  const sorted = res.players.every((p, i) => i === 0 || p.distanceKm >= res.players[i - 1].distanceKm);
  assert(sorted, '人次列表未按距离排序');
  assert(elapsed < 2000, `列表加载耗时过长：${elapsed} ms`);
  console.log(`    100 人在线，列表加载耗时 ${elapsed} ms（返回 ${res.players.length}/${res.total}）`);

  for (const c of many) c.ws.close();
  observer.close();
});

// 12. 与原联机功能兼容：附近面板连接不影响普通建房/加入
await t('附近请求后仍可正常建房与加入', async () => {
  const host = await online('房主', ORIGIN.lat, ORIGIN.lng);
  const guest = await online('客人', latOffset(1), ORIGIN.lng);

  send(host.ws, { type: 'create', name: '房主', config: { topicIds: TOPIC_IDS, handSize: 5 } });
  const created = await host.rec.wait('roomCreated');
  send(guest.ws, { type: 'join', code: created.code, name: '客人' });
  const joined = await guest.rec.wait('joined');
  eq(joined.role, 'guest');
  eq(joined.hostName, '房主');

  send(host.ws, { type: 'leave' });
  await guest.rec.wait('roomDestroyed');

  host.ws.close(); guest.ws.close();
});

console.log(`\n结果：${passed} 通过，${failed} 失败`);
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

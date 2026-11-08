// 联机大厅：创建房间 / 加入房间 / 附近玩家 / 等待对手 / 开始对战
import { NetClient, NetDriver } from '../net/client.js';
import { getSettings } from '../core/settings.js';
import { createNearby } from './nearby.js';

export function renderLobby(container, { config, onStart, onBack }) {
  const $ = sel => container.querySelector(sel);
  const nameInput = $('#lobby-name');

  // 大厅会被多次渲染（每局联机结束后重新进入），所有 DOM 监听器统一由 signal 管理，
  // 销毁时必须解绑，否则旧实例的监听器会和新实例各处理一次点击（重复建房 / 重复加入）。
  const ac = new AbortController();
  const { signal } = ac;

  let client = null;
  let currentCode = null;
  let currentRole = null;
  let players = [];
  let gameStarted = false;
  let busy = false;
  let disposed = false;
  let pendingInvite = null;

  function getName() {
    return nameInput.value.trim() || getSettings().nickname || '玩家';
  }

  const nearbyApi = createNearby({
    container,
    config,
    getName,
    onJoinRoom: (code) => {
      nearbyApi.close();
      joinRoomByCode(code, { fromInvite: true });
    },
    onBack: () => {
      nearbyApi.close();
      showPanel('menu');
    }
  });

  // 收到 started 时（房主与对手都适用）建立 NetDriver 并切入牌桌。
  // 必须在 state 到达前完成，否则会丢失开局首帧状态。
  function beginGame(msg) {
    if (gameStarted || disposed) return;
    gameStarted = true;
    const selfName = nameInput.value.trim() || getSettings().nickname;
    const opponent = (players.find(p => p.role !== currentRole) || {}).name || '对手';
    const driver = new NetDriver(client, {
      opponentName: opponent,
      config: { ...config, ...((msg && msg.config) || {}) }
    });
    onStart(driver, opponent, selfName);
  }

  function showPanel(name) {
    for (const p of container.querySelectorAll('.lobby-panel')) p.hidden = true;
    const el = container.querySelector(`#lobby-${name}`);
    if (el) el.hidden = false;
  }

  function setError(text) {
    const el = $('#lobby-error');
    if (el) { el.textContent = text; el.hidden = !text; }
  }

  function renderPlayers() {
    const hostEl = $('#lobby-host');
    const guestEl = $('#lobby-guest');
    if (!hostEl) return;
    const host = players.find(p => p.role === 'host');
    const guest = players.find(p => p.role === 'guest');
    hostEl.textContent = host ? host.name : '（等待房主）';
    guestEl.textContent = guest ? guest.name : '（等待对手加入）';
  }

  function updateStartButton() {
    const btn = $('#btn-lobby-start');
    if (!btn) return;
    const both = players.length >= 2;
    btn.disabled = !(currentRole === 'host' && both);
    btn.textContent = currentRole === 'host'
      ? (both ? '开始对战' : '等待对手加入…')
      : '等待房主开始…';
  }

  function hideInvite() {
    pendingInvite = null;
    const banner = $('#lobby-invite');
    if (banner) banner.hidden = true;
  }

  // 清空上一位访客留下的房间号、错误与房间信息，避免二次联机时看到旧邀请码
  function resetUI() {
    setError('');
    hideInvite();
    nameInput.value = getSettings().nickname;
    $('#lobby-code-input').value = '';
    $('#lobby-code-display').textContent = '------';
    $('#lobby-host').textContent = '—';
    $('#lobby-guest').textContent = '—';
    const startBtn = $('#btn-lobby-start');
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = '等待对手加入…';
    }
    showPanel('menu');
  }

  async function ensureClient() {
    if (disposed) throw new Error('大厅已关闭');
    if (client) return client;
    const c = new NetClient();
    client = c;
    c.on('roomUpdate', (msg) => {
      players = msg.players || [];
      currentCode = msg.code;
      renderPlayers();
      updateStartButton();
      // guest 视角：显示加入成功的房间信息
      if (currentRole === 'guest') {
        $('#lobby-code-display').textContent = currentCode;
      }
    });
    c.on('opponentLeft', () => {
      if (disposed) return;
      setError('对手已断开连接，等待重连或重新匹配…');
    });
    c.on('opponentReconnected', () => {
      if (disposed) return;
      setError('');
    });
    // 附近玩家一键邀请：服务端为邀请者自动建房后，直接进入房间等待界面
    c.on('roomCreated', (msg) => {
      if (disposed || busy) return;
      currentCode = msg.code;
      currentRole = 'host';
      $('#lobby-code-display').textContent = currentCode;
      if (!players.length) players = [{ id: 'p1', name: getName(), role: 'host' }];
      renderPlayers();
      updateStartButton();
      nearbyApi.close();
      setError('');
      showPanel('room');
    });
    // 收到附近玩家的联机邀请
    c.on('invite', (msg) => {
      if (disposed || gameStarted) return;
      pendingInvite = msg;
      $('#invite-from').textContent = msg.fromName || '附近玩家';
      $('#invite-code').textContent = msg.code || '------';
      $('#lobby-invite').hidden = false;
    });
    c.on('started', (msg) => {
      if (disposed) return;
      if (msg.players) players = msg.players;
      if (msg.myRole) currentRole = msg.myRole;
      renderPlayers();
      beginGame(msg);
    });
    c.on('error', (msg) => {
      if (disposed) return;
      setError(msg.message);
    });
    c.on('close', () => {
      if (disposed) return;
      setError('与服务器的连接已断开');
    });
    try {
      await c.connect();
      return c;
    } catch (e) {
      if (client === c) client = null;
      setError(e.message || '连接失败');
      throw e;
    }
  }

  function resetRoomState() {
    nearbyApi.close();
    hideInvite();
    if (client) {
      try { client.leaveRoom(); } catch {}
      try { client.close(); } catch {}
      client = null;
    }
    currentCode = null;
    currentRole = null;
    players = [];
  }

  // ---- 加入房间（按钮与「附近玩家」邀请共用）----
  async function joinRoomByCode(rawCode, { fromInvite = false } = {}) {
    if (busy || disposed) return false;
    setError('');
    const code = String(rawCode || '').trim();
    if (!/^\d{6}$/.test(code)) {
      setError('请输入 6 位房间号');
      showPanel('menu');
      return false;
    }
    busy = true;
    showPanel('joining');
    try {
      const c = await ensureClient();
      const name = getName();
      const res = await c.joinRoom(code, name);
      currentCode = res.code;
      currentRole = 'guest';
      $('#lobby-code-display').textContent = currentCode;
      if (res.hostName) players = [{ id: 'p1', name: res.hostName, role: 'host' }];
      renderPlayers();
      hideInvite();
      showPanel('room');
      updateStartButton();
      return true;
    } catch (e) {
      if (!disposed) {
        setError(e.message || '加入房间失败');
        showPanel('menu');
        // 加入失败后清空房间号，避免残留旧邀请码
        if (!fromInvite) $('#lobby-code-input').value = '';
      }
      return false;
    } finally {
      busy = false;
    }
  }

  // ---- 创建房间 ----
  $('#btn-lobby-create').addEventListener('click', async () => {
    if (busy || disposed) return;
    busy = true;
    setError('');
    showPanel('creating');
    try {
      const c = await ensureClient();
      const name = getName();
      const res = await c.createRoom(name, config);
      currentCode = res.code;
      currentRole = 'host';
      $('#lobby-code-display').textContent = currentCode;
      players = [{ id: 'p1', name, role: 'host' }];
      renderPlayers();
      showPanel('room');
      updateStartButton();
    } catch (e) {
      if (!disposed) {
        setError(e.message || '创建房间失败');
        showPanel('menu');
      }
    } finally {
      busy = false;
    }
  }, { signal });

  // ---- 加入房间（按钮）----
  $('#btn-lobby-join').addEventListener('click', () => {
    if (busy || disposed) return;
    const code = ($('#lobby-code-input').value || '').trim();
    if (!/^\d{6}$/.test(code)) {
      setError('请输入 6 位房间号');
      return;
    }
    joinRoomByCode(code);
  }, { signal });

  // ---- 附近玩家入口 ----
  $('#btn-lobby-nearby').addEventListener('click', async () => {
    if (busy || disposed) return;
    busy = true;
    setError('');
    try {
      const c = await ensureClient();
      if (disposed) return;
      showPanel('nearby');
      nearbyApi.open(c);
    } catch (e) {
      if (!disposed) setError(e.message || '连接失败');
    } finally {
      busy = false;
    }
  }, { signal });

  // ---- 接受 / 拒绝附近玩家邀请 ----
  $('#btn-invite-accept').addEventListener('click', () => {
    if (busy || disposed || !pendingInvite) return;
    const code = pendingInvite.code;
    hideInvite();
    nearbyApi.close();
    joinRoomByCode(code, { fromInvite: true });
  }, { signal });

  $('#btn-invite-decline').addEventListener('click', () => {
    if (disposed || !pendingInvite) return;
    if (client) client.declineInvite(pendingInvite.fromId);
    hideInvite();
  }, { signal });

  // ---- 开始对战（房主）----
  // 不在此处等待 state：切屏与 NetDriver 的建立统一由 started 消息驱动，
  // 避免先消费掉首帧 state 导致牌桌空白。
  $('#btn-lobby-start').addEventListener('click', () => {
    if (disposed) return;
    setError('');
    if (!client) return;
    client.send({ type: 'start' });
  }, { signal });

  // ---- 离开房间 ----
  $('#btn-lobby-leave').addEventListener('click', () => {
    if (disposed) return;
    resetRoomState();
    setError('');
    showPanel('menu');
  }, { signal });

  $('#btn-lobby-back').addEventListener('click', () => {
    if (disposed) return;
    resetRoomState();
    onBack();
  }, { signal });

  // 初始
  resetUI();

  return {
    destroy() {
      if (disposed) return;
      disposed = true;
      gameStarted = true;
      ac.abort(); // 先解绑监听器，再关闭连接，避免 close 事件写回即将复用的界面
      nearbyApi.destroy();
      resetRoomState();
    }
  };
}

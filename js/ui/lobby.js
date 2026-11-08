// 联机大厅：创建房间 / 加入房间 / 等待对手 / 开始对战
import { NetClient, NetDriver } from '../net/client.js';
import { getSettings } from '../core/settings.js';

export function renderLobby(container, { config, onStart, onBack }) {
  const $ = sel => container.querySelector(sel);
  const view = $('#lobby-view');
  const nameInput = $('#lobby-name');
  nameInput.value = getSettings().nickname;

  let client = null;
  let currentCode = null;
  let currentRole = null;
  let players = [];

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

  async function ensureClient() {
    if (client) return client;
    client = new NetClient();
    client.on('roomUpdate', (msg) => {
      players = msg.players || [];
      currentCode = msg.code;
      renderPlayers();
      updateStartButton();
      // guest 视角：显示加入成功的房间信息
      if (currentRole === 'guest') {
        $('#lobby-code-display').textContent = currentCode;
      }
    });
    client.on('opponentLeft', () => {
      setError('对手已断开连接，等待重连或重新匹配…');
    });
    client.on('opponentReconnected', (name) => {
      setError('');
    });
    client.on('error', (msg) => setError(msg.message));
    client.on('close', () => {
      setError('与服务器的连接已断开');
    });
    try {
      await client.connect();
      return client;
    } catch (e) {
      setError(e.message || '连接失败');
      client = null;
      throw e;
    }
  }

  // ---- 创建房间 ----
  $('#btn-lobby-create').addEventListener('click', async () => {
    setError('');
    showPanel('creating');
    try {
      const c = await ensureClient();
      const name = nameInput.value.trim() || '玩家';
      const res = await c.createRoom(name, config);
      currentCode = res.code;
      currentRole = 'host';
      $('#lobby-code-display').textContent = currentCode;
      players = [{ id: 'p1', name, role: 'host' }];
      renderPlayers();
      showPanel('room');
      updateStartButton();
    } catch (e) {
      setError(e.message || '创建房间失败');
      showPanel('menu');
    }
  });

  // ---- 加入房间 ----
  $('#btn-lobby-join').addEventListener('click', async () => {
    setError('');
    const code = ($('#lobby-code-input').value || '').trim();
    if (!/^\d{6}$/.test(code)) {
      setError('请输入 6 位房间号');
      return;
    }
    showPanel('joining');
    try {
      const c = await ensureClient();
      const name = nameInput.value.trim() || '玩家';
      const res = await c.joinRoom(code, name);
      currentCode = res.code;
      currentRole = 'guest';
      $('#lobby-code-display').textContent = currentCode;
      showPanel('room');
      updateStartButton();
    } catch (e) {
      setError(e.message || '加入房间失败');
      showPanel('menu');
    }
  });

  // ---- 开始对战（房主）----
  $('#btn-lobby-start').addEventListener('click', async () => {
    setError('');
    try {
      await client.startGame();
      const opponentName = (players.find(p => p.role !== currentRole) || {}).name || '对手';
      const driver = new NetDriver(client, { opponentName, config });
      onStart(driver, opponentName);
    } catch (e) {
      setError(e.message || '开始对局失败');
    }
  });

  // ---- 离开房间 ----
  $('#btn-lobby-leave').addEventListener('click', () => {
    if (client) {
      try { client.leaveRoom(); } catch {}
      client.close();
      client = null;
    }
    currentCode = null;
    currentRole = null;
    players = [];
    setError('');
    showPanel('menu');
  });

  $('#btn-lobby-back').addEventListener('click', () => {
    if (client) {
      try { client.leaveRoom(); client.close(); } catch {}
      client = null;
    }
    onBack();
  });

  // 初始
  showPanel('menu');
  setError('');

  return {
    destroy() {
      if (client) { try { client.close(); } catch {} client = null; }
    }
  };
}

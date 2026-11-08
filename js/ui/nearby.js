// 附近玩家面板：定位（GPS / 城市兜底）、隐私设置、定时自动扫描、弱网重试、邀请/加入
import { formatDistance } from '../net/geo.js';
import { CITIES, findCity } from '../data/cities.js';
import { RADIUS_OPTIONS, getNearbyPrefs, saveNearbyPrefs, locate } from '../core/location.js';

const SCAN_INTERVAL = 10_000;   // 后台自动扫描间隔
const REQUEST_TIMEOUT = 8_000;  // 单次请求超时
const MAX_ATTEMPTS = 3;         // 弱网重试次数

const STATUS_TEXT = { idle: '空闲', lobby: '房间中', playing: '对局中' };

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatClock(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function createNearby({ container, config, onJoinRoom, onBack, getName }) {
  const $ = sel => container.querySelector(sel);
  const ac = new AbortController();
  const { signal } = ac;

  const listEl = $('#nearby-list');
  const statusEl = $('#nearby-status');
  const locEl = $('#nearby-loc-text');
  const shareEl = $('#nearby-share');
  const radiusEl = $('#nearby-radius');
  const cityEl = $('#nearby-city');

  let client = null;
  let disposed = false;
  let opened = false;
  let coords = null;              // { lat, lng, source }
  let prefs = getNearbyPrefs();
  let players = [];
  let lastUpdatedAt = 0;
  let scanning = false;
  let scanTimer = null;
  let unsubs = [];

  function setStatus(text, kind = '') {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
    statusEl.hidden = !text;
  }

  function setLocationText(text) {
    if (locEl) locEl.textContent = text;
  }

  function syncControls() {
    if (shareEl) shareEl.checked = prefs.shareLocation;
    if (radiusEl) radiusEl.value = String(prefs.radiusKm);
    if (cityEl) cityEl.value = prefs.cityId || '';
  }

  // ---- 列表渲染 ----
  function renderEmpty(text) {
    if (!listEl) return;
    listEl.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'nearby-empty';
    box.textContent = text;
    listEl.appendChild(box);
  }

  function renderLoading() {
    if (!listEl) return;
    if (players.length) {
      listEl.dataset.loading = 'true';
      return;
    }
    listEl.dataset.loading = 'true';
    renderEmpty('正在搜索附近在线玩家…');
  }

  function makeButton(label, className, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = label;
    if (onClick) btn.addEventListener('click', onClick, { signal });
    else btn.disabled = true;
    return btn;
  }

  function renderList() {
    if (!listEl) return;
    listEl.dataset.loading = 'false';
    listEl.innerHTML = '';

    if (!players.length) {
      renderEmpty(prefs.shareLocation
        ? '附近暂时没有在线玩家，稍后会自动刷新'
        : '附近暂时没有在线玩家');
      return;
    }

    for (const p of players) {
      const item = document.createElement('div');
      item.className = 'nearby-item';

      const main = document.createElement('div');
      main.className = 'nearby-main';

      const nameEl = document.createElement('span');
      nameEl.className = 'nearby-name';
      nameEl.textContent = p.name;

      const meta = document.createElement('span');
      meta.className = 'nearby-meta';

      const dist = document.createElement('span');
      dist.className = 'nearby-distance';
      dist.textContent = formatDistance(p.distanceKm);

      const badge = document.createElement('span');
      badge.className = 'nearby-badge';
      badge.dataset.status = p.status;
      badge.textContent = STATUS_TEXT[p.status] || '在线';

      meta.append(dist, badge);
      main.append(nameEl, meta);

      const actions = document.createElement('div');
      actions.className = 'nearby-actions';

      if (p.status === 'idle') {
        actions.appendChild(makeButton('邀请对战', 'btn btn-primary btn-sm', () => {
          if (!client) return;
          client.invitePlayer(p.id, config, getName());
          setStatus(`已向 ${p.name} 发送邀请，正在为其创建房间…`, 'loading');
        }));
      }
      if (p.joinableCode) {
        actions.appendChild(makeButton(`加入 ${p.joinableCode}`, 'btn btn-ghost btn-sm', () => {
          onJoinRoom(p.joinableCode);
        }));
      }
      if (p.status !== 'idle' && !p.joinableCode) {
        actions.appendChild(makeButton(STATUS_TEXT[p.status] || '对局中', 'btn btn-ghost btn-sm is-muted', null));
      }

      item.append(main, actions);
      listEl.appendChild(item);
    }
  }

  // ---- 定位 ----
  async function resolveLocation() {
    setLocationText('正在定位…');
    const gps = await locate(8_000);
    if (opened && gps) {
      coords = gps;
      setLocationText('已获取 GPS 精确定位');
      if (cityEl) cityEl.value = '';
      return true;
    }
    const city = prefs.cityId && findCity(prefs.cityId);
    if (city) {
      coords = { lat: city.lat, lng: city.lng, source: 'city' };
      setLocationText(`使用城市位置：${city.name}`);
      return true;
    }
    coords = null;
    setLocationText('无法获取定位，请选择城市');
    return false;
  }

  // ---- 扫描（含超时重试与退避）----
  async function scan({ manual = false } = {}) {
    if (!opened || disposed || scanning) return;
    if (!coords) {
      setStatus('尚未获取位置：请在上方选择城市后重新扫描', 'error');
      renderList();
      return;
    }
    const activeClient = client;
    if (!activeClient) {
      setStatus('与服务器未连接，请返回大厅重进', 'error');
      return;
    }

    scanning = true;
    if (manual || !players.length) renderLoading();

    const options = {
      lat: coords.lat,
      lng: coords.lng,
      source: coords.source,
      shareLocation: prefs.shareLocation,
      radiusKm: prefs.radiusKm,
      name: getName()
    };

    let lastError = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (!opened || disposed) { scanning = false; return; }
      try {
        const res = await activeClient.requestNearby(options, REQUEST_TIMEOUT);
        scanning = false;
        if (res.needLocation) {
          setStatus('服务器未收到你的位置，请重新定位或选择城市', 'error');
          renderList();
          return;
        }
        players = Array.isArray(res.players) ? res.players : [];
        lastUpdatedAt = Date.now();
        renderList();
        const total = res.total == null ? players.length : res.total;
        setStatus(
          total
            ? `找到 ${total} 位附近玩家 · ${formatClock(lastUpdatedAt)} 更新${prefs.shareLocation ? '' : ' · 已隐藏我的位置'}`
            : `附近暂无在线玩家 · ${formatClock(lastUpdatedAt)} 更新`,
          'ok'
        );
        return;
      } catch (e) {
        lastError = e;
        if (attempt < MAX_ATTEMPTS - 1) {
          const wait = 1_000 * 2 ** attempt + Math.random() * 400;
          setStatus(`网络不稳定，${Math.ceil(wait / 1_000)} 秒后重试（${attempt + 2}/${MAX_ATTEMPTS}）…`, 'loading');
          await delay(wait);
        }
      }
    }
    scanning = false;
    setStatus(`获取附近玩家失败：${(lastError && lastError.message) || '网络异常'}，可点击「重新扫描」重试`, 'error');
    if (!players.length) renderEmpty('加载失败，请检查网络后重试');
  }

  function startAuto() {
    stopAuto();
    scanTimer = setInterval(() => { scan(); }, SCAN_INTERVAL);
  }

  function stopAuto() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  }

  function attachClient(c) {
    for (const off of unsubs) { try { off(); } catch {} }
    unsubs = [
      c.on('inviteSent', (msg) => {
        if (!opened) return;
        setStatus(`已向 ${msg.targetName || '对方'} 发出邀请（房间 ${msg.code}），等待接受…`, 'loading');
      }),
      c.on('inviteDeclined', (msg) => {
        if (!opened) return;
        setStatus(`${msg.fromName || '对方'} 拒绝了邀请，可继续邀请其他玩家`, 'error');
      })
    ];
  }

  // ---- 控件初始化 ----
  if (cityEl) {
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '不使用城市位置';
    cityEl.appendChild(none);
    for (const city of CITIES) {
      const opt = document.createElement('option');
      opt.value = city.id;
      opt.textContent = city.name;
      cityEl.appendChild(opt);
    }
  }
  if (radiusEl) {
    for (const item of RADIUS_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = String(item.value);
      opt.textContent = item.label;
      radiusEl.appendChild(opt);
    }
  }
  syncControls();

  if (cityEl) {
    cityEl.addEventListener('change', () => {
      const id = cityEl.value || null;
      prefs = saveNearbyPrefs({ cityId: id });
      const city = id && findCity(id);
      if (city) {
        coords = { lat: city.lat, lng: city.lng, source: 'city' };
        setLocationText(`使用城市位置：${city.name}`);
        scan({ manual: true });
      } else {
        resolveLocation().then(() => scan({ manual: true }));
      }
    }, { signal });
  }

  if (shareEl) {
    shareEl.addEventListener('change', () => {
      prefs = saveNearbyPrefs({ shareLocation: shareEl.checked });
      setStatus(shareEl.checked
        ? '已公开我的位置，附近玩家可以找到我'
        : '已停止公开我的位置，我不会出现在其他玩家的附近列表中', 'ok');
      scan({ manual: true }); // 同步服务端档案并刷新列表
    }, { signal });
  }

  if (radiusEl) {
    radiusEl.addEventListener('change', () => {
      const value = Number(radiusEl.value);
      prefs = saveNearbyPrefs({ radiusKm: Number.isFinite(value) ? value : prefs.radiusKm });
      scan({ manual: true });
    }, { signal });
  }

  const rescanBtn = $('#btn-nearby-rescan');
  if (rescanBtn) {
    rescanBtn.addEventListener('click', () => { /* 点击时触发一次手动扫描 */
      scan({ manual: true });
    }, { signal });
  }

  const backBtn = $('#btn-nearby-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => { onBack(); }, { signal });
  }

  return {
    open(activeClient) {
      if (disposed) return;
      opened = true;
      client = activeClient;
      attachClient(activeClient);
      prefs = getNearbyPrefs();
      syncControls();
      players = [];
      renderLoading();
      setStatus('正在搜索附近玩家…', 'loading');
      resolveLocation().then((ok) => {
        if (!opened || disposed) return;
        if (!ok) {
          setStatus('未获取到位置：请在上方选择城市后重新扫描', 'error');
        }
        scan({ manual: true });
        startAuto();
      });
    },

    close() {
      opened = false;
      stopAuto();
      for (const off of unsubs) { try { off(); } catch {} }
      unsubs = [];
      client = null;
      scanning = false;
      players = [];
      lastUpdatedAt = 0;
      if (listEl) listEl.innerHTML = '';
    },

    destroy() {
      if (disposed) return;
      disposed = true;
      ac.abort();
      stopAuto();
      for (const off of unsubs) { try { off(); } catch {} }
      unsubs = [];
      client = null;
    }
  };
}

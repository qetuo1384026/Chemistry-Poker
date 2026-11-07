// 本地对局历史：localStorage 持久化 + 数据规范化 + 增量追加 + 条件筛选
export const HISTORY_KEY = 'chemistry-poker:history:v1';
export const MAX_RECORDS = 200;

const RESULTS = ['win', 'lose', 'draw'];
const MODES = ['substance', 'ion'];

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function genId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // 忽略：回退到时间戳 + 随机串
  }
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function toStringList(value, limit) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => typeof item === 'string').slice(0, limit);
}

// 单条记录校验：结构损坏返回 null，可选字段缺失时补默认值
export function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const endedAt = typeof raw.endedAt === 'string' ? raw.endedAt : '';
  if (!Number.isFinite(Date.parse(endedAt))) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : genId(),
    endedAt,
    mode: MODES.includes(raw.mode) ? raw.mode : 'substance',
    result: RESULTS.includes(raw.result) ? raw.result : 'draw',
    playerScore: toInt(raw.playerScore),
    aiScore: toInt(raw.aiScore),
    handSize: toInt(raw.handSize, 6),
    difficulty: raw.difficulty === 'easy' ? 'easy' : 'normal',
    rounds: toInt(raw.rounds),
    durationMs: toInt(raw.durationMs),
    topicIds: toStringList(raw.topicIds, 30),
    playerCards: toStringList(raw.playerCards, 60),
    combos: toStringList(raw.combos, 10)
  };
}

let cache = null;

function readStored() {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 数据损坏（非法 JSON / 非数组）→ 降级为空历史，应用继续可用
    return [];
  }
}

function normalizeList(list) {
  return list
    .map(normalizeRecord)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
}

function readAll() {
  if (cache === null) cache = normalizeList(readStored());
  return cache;
}

function writeAll(list) {
  cache = list;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // 配额不足：保留最近 50 条再试一次，失败则仅保留内存数据
    try {
      store.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
    } catch {
      // 忽略写入失败
    }
  }
}

// 读取全部历史（按结束时间倒序），返回副本避免外部修改缓存
export function loadHistory() {
  return readAll().map(record => ({ ...record }));
}

// 增量追加：新记录置顶，超出上限时丢弃最旧记录
export function addHistoryRecord(record) {
  const normalized = normalizeRecord(record);
  if (!normalized) return null;
  const list = readAll().filter(item => item.id !== normalized.id);
  list.unshift(normalized);
  writeAll(normalizeList(list).slice(0, MAX_RECORDS));
  return { ...normalized };
}

export function clearHistory() {
  writeAll([]);
}

// 时间范围起点（本地时区）：今天 0 点 / 近 7 天 / 近 30 天
export function rangeStart(range) {
  const now = new Date();
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (range === '7d') return now.getTime() - 7 * 86400000;
  if (range === '30d') return now.getTime() - 30 * 86400000;
  return null;
}

export function queryHistory({ result = 'all', mode = 'all', range = 'all' } = {}, list = readAll()) {
  const start = rangeStart(range);
  return list.filter(record =>
    (result === 'all' || record.result === result) &&
    (mode === 'all' || record.mode === mode) &&
    (start === null || Date.parse(record.endedAt) >= start)
  );
}

export function historyStats(records) {
  const total = records.length;
  const wins = records.filter(r => r.result === 'win').length;
  const losses = records.filter(r => r.result === 'lose').length;
  const draws = records.filter(r => r.result === 'draw').length;
  const best = total ? Math.max(...records.map(r => r.playerScore)) : 0;
  const avgScore = total ? Math.round(records.reduce((sum, r) => sum + r.playerScore, 0) / total) : 0;
  return {
    total,
    wins,
    losses,
    draws,
    best,
    avgScore,
    winRate: total ? Math.round((wins / total) * 100) : 0
  };
}

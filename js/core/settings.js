// 应用级设置：本地持久化（无账号体系），音频 / 动效 / 对局默认参数 / 玩家昵称
export const SETTINGS_KEY = 'chemistry-poker:settings:v1';

const HAND_SIZES = [5, 6, 8];
const DIFFICULTIES = ['easy', 'normal'];
const MOTIONS = ['full', 'reduced'];

export const DEFAULT_SETTINGS = Object.freeze({
  sfx: true,
  volume: 60,
  motion: 'full',
  handSize: 6,
  difficulty: 'normal',
  showHints: true,
  nickname: '玩家'
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// 把任意输入（含损坏的本地数据）收敛为合法设置
export function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const nickname = typeof src.nickname === 'string' ? src.nickname.trim().slice(0, 12) : '';
  return {
    sfx: src.sfx === undefined ? DEFAULT_SETTINGS.sfx : !!src.sfx,
    volume: clampNumber(src.volume, 0, 100, DEFAULT_SETTINGS.volume),
    motion: MOTIONS.includes(src.motion) ? src.motion : DEFAULT_SETTINGS.motion,
    handSize: HAND_SIZES.includes(Number(src.handSize)) ? Number(src.handSize) : DEFAULT_SETTINGS.handSize,
    difficulty: DIFFICULTIES.includes(src.difficulty) ? src.difficulty : DEFAULT_SETTINGS.difficulty,
    showHints: src.showHints === undefined ? DEFAULT_SETTINGS.showHints : !!src.showHints,
    nickname: nickname || DEFAULT_SETTINGS.nickname
  };
}

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readStored() {
  const store = storage();
  if (!store) return {};
  try {
    return JSON.parse(store.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

let current = normalizeSettings(readStored());

function persist() {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(current));
  } catch {
    // 隐私模式或配额已满时忽略，设置仅在本次会话生效
  }
}

export function getSettings() {
  return { ...current };
}

// 合并并保存（局部更新），返回保存后的完整设置
export function saveSettings(patch) {
  current = normalizeSettings({ ...current, ...(patch || {}) });
  persist();
  return getSettings();
}

export function resetSettings() {
  current = { ...DEFAULT_SETTINGS };
  persist();
  return getSettings();
}

// 动效偏好：reduced 时由 CSS 关闭装饰性动画
export function applyMotionPreference(settings = current) {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.dataset.motion = settings.motion;
}

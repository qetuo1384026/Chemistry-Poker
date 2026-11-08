// 附近玩家的位置与隐私偏好：本地持久化 + 浏览器定位（失败时由 UI 引导选择城市）
import { findCity } from '../data/cities.js';

const STORAGE_KEY = 'cp-nearby-prefs';

// 0 表示不限距离
export const RADIUS_OPTIONS = [
  { value: 5, label: '5 km 内' },
  { value: 10, label: '10 km 内' },
  { value: 30, label: '30 km 内' },
  { value: 100, label: '100 km 内' },
  { value: 0, label: '不限距离' }
];

export const DEFAULT_PREFS = {
  shareLocation: true,   // 默认公开，可在面板中关闭
  radiusKm: 30,
  cityId: null           // 定位失败时使用的城市兜底
};

function normalize(raw) {
  const prefs = { ...DEFAULT_PREFS };
  if (!raw || typeof raw !== 'object') return prefs;
  prefs.shareLocation = raw.shareLocation !== false;
  const radius = Number(raw.radiusKm);
  prefs.radiusKm = RADIUS_OPTIONS.some(o => o.value === radius) ? radius : DEFAULT_PREFS.radiusKm;
  prefs.cityId = typeof raw.cityId === 'string' && findCity(raw.cityId) ? raw.cityId : null;
  return prefs;
}

export function getNearbyPrefs() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveNearbyPrefs(patch) {
  const next = normalize({ ...getNearbyPrefs(), ...(patch || {}) });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  return next;
}

/**
 * 尝试获取浏览器精确定位。
 * HTTP（非 localhost）下浏览器会禁用 Geolocation，此处直接返回 null，由 UI 使用城市兜底。
 */
export function locate(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    if (typeof window !== 'undefined' && window.isSecureContext === false) return resolve(null);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        pos => finish({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: 'gps'
        }),
        () => finish(null),
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 }
      );
    } catch {
      finish(null);
    }
  });
}

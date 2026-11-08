// 地理位置计算：附近玩家排序使用球面距离（haversine）
const EARTH_RADIUS_KM = 6371;

export function validCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

const toRad = deg => (deg * Math.PI) / 180;

/** 两点间球面距离（公里） */
export function haversineKm(a, b) {
  if (!validCoord(a && a.lat, a && a.lng) || !validCoord(b && b.lat, b && b.lng)) return Infinity;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 距离展示：1km 内用米，10km 内保留一位小数，其余取整 */
export function formatDistance(km) {
  if (!Number.isFinite(km)) return '距离未知';
  if (km < 1) return `${Math.max(0, Math.round(km * 1000))} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

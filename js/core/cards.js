// 卡牌基础：类别元数据、洗牌与卡组构建

export const CTYPE_META = {
  metal:       { label: '金属单质',   color: '#8d6e63' },
  nonmetal:    { label: '非金属单质', color: '#7cb342' },
  acid:        { label: '酸',         color: '#e53935' },
  base:        { label: '碱',         color: '#1e88e5' },
  salt:        { label: '盐',         color: '#fb8c00' },
  oxide:       { label: '氧化物',     color: '#00897b' },
  hydrocarbon: { label: '烃',         color: '#5e35b1' },
  halo:        { label: '卤代烃',     color: '#6d4c41' },
  alcohol:     { label: '醇 / 酚',    color: '#039be5' },
  aldehyde:    { label: '醛',         color: '#00838f' },
  ester:       { label: '酯',         color: '#9e9d24' },
  bio:         { label: '生命有机物', color: '#f06292' },
  polymer:     { label: '高分子',     color: '#78909c' },
  reagent:     { label: '检验试剂',   color: '#5c6bc0' },
  ion:         { label: '离子',       color: '#26a69a' }
};

export function ctypeMeta(ctype) {
  return CTYPE_META[ctype] || { label: ctype, color: '#666666' };
}

// Fisher-Yates 洗牌，rng 可注入以便测试
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 由所选卡牌构建卡组（洗牌后返回）
export function buildDeck(cards, rng = Math.random) {
  return shuffle(cards, rng);
}

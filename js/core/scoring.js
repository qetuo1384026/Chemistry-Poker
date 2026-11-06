// 计分系统
// 回合得分 = (先出牌点数 + 应答牌点数) × 规则倍率 + 连胜加成
//   规则倍率：特征反应精准配对 ×2；类别通用规律 ×1.5；同类比较 ×1
//   连胜加成：连续赢得回合，每连赢1回合 +2 分（上限 +10）

export const SCORE_RULES = {
  MAX_STREAK_BONUS: 5 // 连胜加成计入的最大连胜数
};

export function trickPoints(leadCard, respCard, match, streak) {
  const base = leadCard.pt + respCard.pt;
  const mult = match.multiplier;
  const streakBonus = Math.min(streak, SCORE_RULES.MAX_STREAK_BONUS) * 2;
  const total = Math.round(base * mult) + streakBonus;
  return { base, mult, streakBonus, total };
}

export function describePoints(p) {
  let s = `${p.base}×${p.mult}`;
  if (p.streakBonus > 0) s += ` + 连胜${p.streakBonus}`;
  return `${s} = ${p.total} 分`;
}

// 核心逻辑测试（node --test 环境依赖最低，直接用断言脚本）
// 运行: npm test
import { ALL_CARDS, cardsByTopics, TOPIC_INFO } from '../js/data/index.js';
import { matchCards, validResponses, EQUATIONS } from '../js/core/rules.js';
import { trickPoints } from '../js/core/scoring.js';
import { buildDeck, shuffle } from '../js/core/cards.js';
import { Game, PHASE } from '../js/core/game.js';

let passed = 0, failed = 0;
const byId = id => ALL_CARDS.find(c => c.id === id);
function t(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
function eq(a, b, msg) { assert(a === b, `${msg || ''} 期望 ${b}，实际 ${a}`); }

// 固定随机源，保证测试可复现
const rng = () => 0.42;
// 恒等洗牌：j = floor(0.99999*(i+1)) = i，元素不移动，保证测试手牌顺序可控
const identityRng = () => 0.99999;

console.log('— 数据模块 —');
t('卡牌总量与数据完整性', () => {
  assert(ALL_CARDS.length >= 60, `卡牌数 ${ALL_CARDS.length} < 60`);
  const ids = new Set();
  for (const c of ALL_CARDS) {
    assert(c.id && c.name && c.sub && c.topic && c.ctype, `卡牌字段缺失: ${JSON.stringify(c)}`);
    assert(!ids.has(c.id), `id 重复: ${c.id}`);
    ids.add(c.id);
    assert(TOPIC_INFO[c.topic], `专题未注册: ${c.topic} (${c.id})`);
  }
});
t('按专题筛选', () => {
  const cards = cardsByTopics(['org-hydrocarbon']);
  eq(cards.length, 5);
  assert(cards.every(c => c.topic === 'org-hydrocarbon'));
});
t('方程式库无键冲突且覆盖度足够', () => {
  const n = Object.keys(EQUATIONS).length;
  assert(n >= 55, `方程式仅 ${n} 条`);
});

console.log('— 卡牌工具 —');
t('洗牌不改变集合', () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffle(src, rng);
  eq([...out].sort().join(','), '1,2,3,4,5');
  eq(src.join(','), '1,2,3,4,5', '原数组不应被修改');
});
t('buildDeck 返回全部卡牌', () => {
  eq(buildDeck(ALL_CARDS.slice(0, 12), rng).length, 12);
});

console.log('— 匹配规则：精准方程式 —');
t('NaOH 接住 HCl（精准配对 ×2）', () => {
  const m = matchCards(byId('hcl'), byId('naoh'));
  assert(m.valid && m.kind === 'specific' && m.multiplier === 2, JSON.stringify(m));
});
t('C2H4 被溴水检验（加成褪色）', () => {
  const m = matchCards(byId('c2h4'), byId('br2water'));
  assert(m.valid && m.multiplier === 2);
});
t('乙醛银镜反应', () => {
  assert(matchCards(byId('ethanal'), byId('tollens')).valid);
});
t('Na₂O₂ 与 CO₂ 供氧反应', () => {
  assert(matchCards(byId('na2o2'), byId('co2')).valid);
});

console.log('— 匹配规则：通用规律 —');
t('弱酸+强碱 → 类别中和 ×1.5', () => {
  const m = matchCards(byId('h2co3'), byId('caoh2'));
  assert(m.valid && m.kind === 'category' && m.multiplier === 1.5, JSON.stringify(m));
});
t('Fe + 稀盐酸 → 金属置换', () => {
  const m = matchCards(byId('fe'), byId('hcl'));
  assert(m.valid, JSON.stringify(m)); // 命中特征库
});
t('Mg + H2CO3 → 通用置换规律', () => {
  const m = matchCards(byId('h2co3'), byId('mg'));
  assert(m.valid && m.name === '金属与酸置换', JSON.stringify(m));
});
t('有机转化链相邻可匹配', () => {
  const m = matchCards(byId('c2h4'), byId('ethanol'));
  assert(m.valid, JSON.stringify(m)); // 特征库水化反应
  const m2 = matchCards(byId('ethanal'), byId('ethanol'));
  assert(m2.valid, JSON.stringify(m2));
});

console.log('— 匹配规则：比较与易错 —');
t('同类比较：Cl2 氧化性压住 Br2', () => {
  const m = matchCards(byId('br2'), byId('cl2'));
  assert(m.valid && m.kind === 'compare' && m.multiplier === 1, JSON.stringify(m));
});
t('同类比较：Br2 压不住 Cl2', () => {
  const m = matchCards(byId('cl2'), byId('br2'));
  assert(!m.valid, JSON.stringify(m));
});
t('钝化：Al 遇浓硫酸', () => {
  const m = matchCards(byId('al'), byId('h2so4'));
  assert(!m.valid && m.expl.includes('钝化'), m.expl);
});
t('陷阱：苯与溴水不反应', () => {
  const m = matchCards(byId('benzene'), byId('br2water'));
  assert(!m.valid && m.expl.includes('液溴'), m.expl);
});
t('陷阱：蔗糖非还原糖', () => {
  const m = matchCards(byId('sucrose'), byId('tollens'));
  assert(!m.valid && m.expl.includes('非还原'), m.expl);
});
t('Cu 在 H 后，不与稀盐酸反应', () => {
  const m = matchCards(byId('cu'), byId('hcl'));
  assert(!m.valid && m.expl.includes('氢之后'), m.expl);
});
t('validResponses 过滤合法应答', () => {
  const hand = [byId('naoh'), byId('benzene'), byId('pe')];
  const ok = validResponses(hand, byId('hcl'));
  eq(ok.length, 1);
  eq(ok[0].id, 'naoh');
});

console.log('— 计分 —');
t('精准配对 ×2 计分', () => {
  const p = trickPoints(byId('hcl'), byId('naoh'), { multiplier: 2 }, 0);
  eq(p.total, (3 + 3) * 2);
});
t('连胜加成与上限', () => {
  const p = trickPoints(byId('hcl'), byId('naoh'), { multiplier: 2 }, 3);
  eq(p.total, 12 + 6);
  const pMax = trickPoints(byId('hcl'), byId('naoh'), { multiplier: 2 }, 99);
  eq(pMax.total, 12 + 10);
});

console.log('— 对战状态机 —');
t('发牌与初始状态', () => {
  const g = new Game(ALL_CARDS.slice(0, 20), { handSize: 6, rng });
  eq(g.players.player.hand.length, 6);
  eq(g.players.ai.hand.length, 6);
  eq(g.phase, PHASE.LEAD);
  eq(g.leader, 'player');
});
t('卡牌不足时拒绝开局', () => {
  let threw = false;
  try { new Game(ALL_CARDS.slice(0, 5), { handSize: 6 }); }
  catch { threw = true; }
  assert(threw);
});
t('完整回合流程与计分', () => {
  const deck = [
    byId('hcl'), byId('fe'), byId('cl2'), byId('br2'), byId('c2h4'), byId('starch'), // 玩家手牌
    byId('naoh'), byId('cu'), byId('i2'), byId('benzene'), byId('pe'), byId('oil')    // AI手牌
  ];
  const g = new Game(deck, { handSize: 6, rng: identityRng });
  g.playLead('player', 'hcl');
  const entry = g.playResponse('ai', 'naoh');
  assert(entry.success && entry.winnerId === 'ai', JSON.stringify(entry));
  eq(g.players.ai.score, 12);
  eq(g.leader, 'ai');
  eq(g.phase, PHASE.LEAD);
  eq(g.round, 2);
});
t('应答失败时先手方得分', () => {
  const deck = [
    byId('hcl'), byId('fe'), byId('cl2'), byId('br2'), byId('c2h4'), byId('starch'),
    byId('benzene'), byId('pe'), byId('oil'), byId('sucrose'), byId('cu'), byId('i2')
  ];
  const g = new Game(deck, { handSize: 6, rng: identityRng });
  g.playLead('player', 'hcl');
  const entry = g.playResponse('ai', 'benzene'); // 苯不能接住盐酸
  assert(!entry.success && entry.winnerId === 'player');
  assert(g.players.player.score > 0);
  eq(g.leader, 'player');
});
t('整局模拟可正常结束并产出结果', () => {
  const g = new Game(ALL_CARDS, { handSize: 6, rng });
  let guard = 0;
  while (!g.isOver && guard++ < 100) {
    if (g.phase === PHASE.LEAD) {
      const pid = g.leader;
      const card = pid === 'ai' ? g.aiLead() : g.players.player.hand[0];
      g.playLead(pid, card.id);
    } else {
      const pid = g.defender;
      if (pid === 'ai') {
        g.playResponse('ai', g.aiRespond());
      } else {
        const ok = validResponses(g.players.player.hand, g.currentLead.card);
        g.playResponse('player', ok.length ? ok[0].id : g.players.player.hand[0].id);
      }
    }
  }
  assert(g.isOver, '对局应在有限回合内结束');
  assert(g.result, '应产出结算结果');
  eq(g.players.player.hand.length, 0);
  eq(g.players.ai.hand.length, 0);
  assert(g.log.length >= 6, '日志应记录全部回合');
});

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);

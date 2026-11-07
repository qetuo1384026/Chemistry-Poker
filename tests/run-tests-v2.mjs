// v2.0 系统性测试：复现已知 Bug + 异常/边界场景
// 运行: node tests/run-tests-v2.mjs
import { ALL_CARDS } from '../js/data/index.js';
import { matchCards, validResponses, findCombo } from '../js/core/rules.js';
import { Game, PHASE } from '../js/core/game.js';

let passed = 0, failed = 0;
const byId = id => ALL_CARDS.find(c => c.id === id);
function t(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
function eq(a, b, msg) { assert(a === b, `${msg || ''} 期望 ${b}，实际 ${a}`); }

const identityRng = () => 0.99999;
// 可控 rng 序列：依次返回给定值，用完后返回最后一个
const seqRng = seq => { let i = 0; return () => seq[Math.min(i++, seq.length - 1)]; };

console.log('— Bug 复现：放弃应答后的 AI 崩溃（P0）—');
t('复现：AI 先手后玩家连续放弃应答，AI 手牌耗尽后崩溃', () => {
  // 构造：AI 先手（首回合玩家应答失败则 AI 继续先手），玩家之后全部放弃
  const deck = [
    byId('benzene'), byId('pe'), byId('oil'), byId('sucrose'), byId('starch'), byId('protein'), // 玩家：6 张对 HCI 大多无应答
    byId('hcl'), byId('h2so4'), byId('hno3'), byId('naoh'), byId('caoh2'), byId('fe')           // AI 手牌
  ];
  const g = new Game(deck, { handSize: 6, rng: identityRng });
  // 回合1：玩家先手出 benzene，AI 放弃应答 → 玩家赢，玩家继续先手……
  // 改为直接模拟：让玩家每次都赢或都让 AI 先手。最简单：AI 赢一回合后玩家一直放弃。
  g.playLead('player', 'benzene');
  g.playResponse('ai', null); // AI 放弃 → 玩家赢，玩家仍为先手？不，赢家是先手方 → leader 保持 player
  // 玩家再出 pe，AI 放弃……玩家手牌会耗尽，而 AI 手牌满 6 张
  let crashed = null;
  try {
    let guard = 0;
    while (!g.isOver && guard++ < 50) {
      if (g.phase === PHASE.LEAD) {
        const pid = g.leader;
        if (pid === 'player') {
          const c = g.players.player.hand[0];
          if (!c) { crashed = new Error('玩家空手牌但游戏未结束'); break; }
          g.playLead('player', c.id);
        } else {
          const card = g.aiLead(); // AI 空手牌时此处 [0] 为 undefined
          if (!card) { crashed = new TypeError("Cannot read properties of undefined (reading 'id')"); break; }
          g.playLead('ai', card.id);
        }
      } else {
        const pid = g.defender;
        if (pid === 'player') {
          g.playResponse('player', null); // 玩家总是放弃
        } else {
          const pick = g.aiRespond(); // AI 空手牌时此处 .id 崩溃
          g.playResponse('ai', pick);
        }
      }
    }
  } catch (e) { crashed = e; }
  // 期望：修复后不应崩溃，且对局能正常结束
  assert(!crashed, `对局崩溃：${crashed && crashed.message}`);
  assert(g.isOver, '对局应正常结束');
});

t('空 hand 调 aiLead 不应崩溃', () => {
  const g = new Game(ALL_CARDS.slice(0, 12), { handSize: 6, rng: identityRng });
  g.players.ai.hand = [];
  let crashed = null;
  try { g.aiLead(); } catch (e) { crashed = e; }
  assert(!crashed, `aiLead 空手牌崩溃：${crashed && crashed.message}`);
});

t('空 hand 调 aiRespond 不应崩溃', () => {
  const g = new Game(ALL_CARDS.slice(0, 12), { handSize: 6, rng: identityRng });
  g.playLead('player', g.players.player.hand[0].id);
  g.players.ai.hand = [];
  let crashed = null;
  try { g.aiRespond(); } catch (e) { crashed = e; }
  assert(!crashed, `aiRespond 空手牌崩溃：${crashed && crashed.message}`);
});

t('任一方手牌先空时游戏应立即结束', () => {
  const deck = [
    byId('hcl'), byId('fe'),
    byId('naoh'), byId('cu'), byId('i2'), byId('benzene')
  ];
  const g = new Game(deck, { handSize: 2, rng: identityRng });
  g.playLead('player', 'hcl');
  g.playResponse('ai', 'naoh'); // AI 赢 → AI 先手；玩家还剩1张，AI 还剩1张
  g.playLead('ai', 'cu');
  g.playResponse('player', null); // 玩家放弃 → AI 赢；玩家剩1张？不，放弃不消耗 → 玩家1张 AI 0张
  // AI 手牌已空 → 游戏应立即结束（修复后期望）
  assert(g.isOver, `任一方空手牌应结束，当前 phase=${g.phase}, ai手牌=${g.players.ai.hand.length}, 玩家手牌=${g.players.player.hand.length}`);
});

console.log('— Bug 复现：AI 先手缺失统计（P0）—');
t('统计：多局对战中 AI 应有先手回合', () => {
  let aiLeadRounds = 0, totalRounds = 0;
  for (let trial = 0; trial < 10; trial++) {
    const rng = seqRng([0.13, 0.57, 0.91, 0.33, 0.77, 0.25, 0.66, 0.05]);
    const g = new Game(ALL_CARDS, { handSize: 6, rng });
    let guard = 0;
    while (!g.isOver && guard++ < 100) {
      if (g.phase === PHASE.LEAD) {
        const pid = g.leader;
        totalRounds++;
        if (pid === 'ai') aiLeadRounds++;
        const card = pid === 'ai' ? g.aiLead() : g.players.player.hand[0];
        if (!card) break;
        g.playLead(pid, card.id);
      } else {
        const pid = g.defender;
        const hand = g.players[pid].hand;
        const ok = validResponses(hand, g.currentLead.card);
        // 双方都采用「有合法牌就出，无则放弃」策略
        g.playResponse(pid, ok.length ? ok[0].id : null);
      }
    }
  }
  assert(aiLeadRounds > 0, `10 局共 ${totalRounds} 回合，AI 先手 0 次`);
});

console.log('— 边界与异常路径 —');
t('非法阶段调用抛错', () => {
  const g = new Game(ALL_CARDS.slice(0, 12), { handSize: 6, rng: identityRng });
  let threw = 0;
  try { g.playResponse('ai', 'x'); } catch { threw++; } // 非应答阶段
  try { g.playLead('ai', 'x'); } catch { threw++; }    // 非该玩家先手
  eq(threw, 2, '非法调用应抛错');
});
t('打出不存在的手牌抛错', () => {
  const g = new Game(ALL_CARDS.slice(0, 12), { handSize: 6, rng: identityRng });
  let threw = false;
  try { g.playLead('player', 'not-exist'); } catch { threw = true; }
  assert(threw);
});
t('handSize=1 最小卡组可完整对局', () => {
  const deck = [byId('hcl'), byId('naoh')];
  const g = new Game(deck, { handSize: 1, rng: identityRng });
  g.playLead('player', 'hcl');
  const e = g.playResponse('ai', 'naoh');
  assert(e.success);
  assert(g.isOver);
  assert(g.result);
});
t('放弃应答不得分且日志正确', () => {
  const g = new Game(ALL_CARDS.slice(0, 12), { handSize: 6, rng: identityRng });
  g.playLead('player', g.players.player.hand[0].id);
  const e = g.playResponse('ai', null);
  eq(e.points.total, 0, '放弃应答时不得消耗计分');
  eq(e.respCard, null);
});
t('整局后两手牌消耗对称性检查（无放弃时）', () => {
  const g = new Game(ALL_CARDS, { handSize: 6, rng: seqRng([0.3, 0.7, 0.5]) });
  let guard = 0;
  while (!g.isOver && guard++ < 100) {
    if (g.phase === PHASE.LEAD) {
      const pid = g.leader;
      const card = pid === 'ai' ? g.aiLead() : g.players.player.hand[0];
      if (!card) break;
      g.playLead(pid, card.id);
    } else {
      const pid = g.defender;
      const ok = validResponses(g.players[pid].hand, g.currentLead.card);
      g.playResponse(pid, ok.length ? ok[0].id : g.players[pid].hand[0].id);
    }
  }
  assert(g.isOver);
  eq(g.players.player.hand.length, 0);
  eq(g.players.ai.hand.length, 0);
});

console.log('— 离子模式（P2）—');
t('离子沉淀反应：Ba²⁺ + SO₄²⁻ → BaSO₄↓', () => {
  const m = matchCards(byId('ion-ba'), byId('ion-so4'));
  assert(m.valid, '应匹配成功');
  eq(m.multiplier, 2, '精准配对倍率');
  assert(m.name.includes('沉淀'), `名称应含"沉淀"：${m.name}`);
  assert(m.eq.includes('BaSO₄'), '方程式应生成 BaSO₄');
});
t('离子气体反应：CO₃²⁻ + H⁺（反向也应命中）', () => {
  const m = matchCards(byId('ion-co3'), byId('ion-h'));
  assert(m.valid && m.name.includes('气体'), `实际：${JSON.stringify(m)}`);
});
t('离子生成水：H⁺ + OH⁻ 中和', () => {
  const m = matchCards(byId('ion-h'), byId('ion-oh'));
  assert(m.valid && m.eq.includes('H₂O'));
});
t('离子氧化还原：Fe³⁺ 氧化 I⁻', () => {
  const m = matchCards(byId('ion-i'), byId('ion-fe3'));
  assert(m.valid && m.name.includes('氧化还原'));
});
t('同号离子不反应（可共存）', () => {
  const m = matchCards(byId('ion-na'), byId('ion-k'));
  assert(!m.valid, '同号离子应判负');
  assert(m.expl.includes('共存'));
});
t('异号但无相互作用：Na⁺ + Cl⁻ 可共存', () => {
  const m = matchCards(byId('ion-na'), byId('ion-cl'));
  assert(!m.valid && m.expl.includes('共存'));
});
t('离子卡与物质卡互不通用', () => {
  const m = matchCards(byId('ion-h'), byId('naoh'));
  assert(!m.valid, '离子 vs 物质不应落入通用规律');
});
t('findCombo：集齐组合返回定义，缺员返回 null', () => {
  eq(findCombo([byId('ion-h'), byId('ion-oh'), byId('ion-na')]).id, 'combo-neutral');
  eq(findCombo([byId('ion-h'), byId('ion-cl')]), null);
});
t('组合技实战：应答成功且集齐组合时倍率加成并标注', () => {
  const deck = [byId('ion-co3'), byId('ion-h'), byId('ion-ba'), byId('ion-so4')];
  const g = new Game(deck, { handSize: 2, rng: identityRng });
  g.playLead('player', 'ion-co3');
  const e = g.playResponse('ai', 'ion-ba'); // Ba²⁺+CO₃²⁻ 沉淀，AI 赢
  assert(e.success);
  assert(e.match.combo, '应触发组合技');
  eq(e.match.combo.id, 'combo-baso4');
  eq(e.match.multiplier, 3, '2(精准) × 1.5(组合) = 3');
  eq(e.points.total, Math.round((3 + 3) * 3), '得分应含组合加成');
});
t('组合技不触发：未集齐时按普通计分', () => {
  const deck = [byId('ion-co3'), byId('ion-h'), byId('ion-ba'), byId('ion-cl')];
  const g = new Game(deck, { handSize: 2, rng: identityRng });
  g.playLead('player', 'ion-co3');
  const e = g.playResponse('ai', 'ion-ba');
  assert(e.success);
  eq(e.match.combo, undefined);
  eq(e.points.total, Math.round((3 + 3) * 2), '无组合加成');
});

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);

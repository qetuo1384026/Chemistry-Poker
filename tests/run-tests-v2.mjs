// v2.0 系统性测试：复现已知 Bug + 异常/边界场景
// 运行: node tests/run-tests-v2.mjs
import { ALL_CARDS, MODULES, cardsByTopics } from '../js/data/index.js';
import { matchCards, validResponses, findCombo, EQUATIONS, TRAPS } from '../js/core/rules.js';
import { ION_CARDS, ION_INTERACTIONS, ION_COMBOS } from '../js/data/ions.js';
import { Game, PHASE } from '../js/core/game.js';
import { DEFAULT_SETTINGS, normalizeSettings, getSettings, saveSettings, resetSettings } from '../js/core/settings.js';
import { MAX_RECORDS, normalizeRecord, addHistoryRecord, loadHistory, clearHistory, queryHistory, historyStats } from '../js/core/history.js';

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
t('放弃应答：先手方按先出牌点数得分且日志正确', () => {
  const g = new Game(ALL_CARDS.slice(0, 12), { handSize: 6, rng: identityRng });
  const leadCard = g.players.player.hand[0];
  g.playLead('player', leadCard.id);
  const e = g.playResponse('ai', null);
  eq(e.respCard, null);
  eq(e.winnerId, 'player');
  eq(e.points.base, leadCard.pt, '放弃应答基础分应为先出牌点数');
  eq(e.points.mult, 1, '放弃应答无匹配倍率');
  eq(e.points.total, leadCard.pt, '放弃应答得分应为先出牌点数');
  eq(g.players.player.score, leadCard.pt, '分数应累加到先手方');
});
t('玩家放弃应答时 AI 获得应得分数并累计（v2.2 修复）', () => {
  const deck = [byId('hcl'), byId('fe'), byId('naoh'), byId('cu')];
  const g = new Game(deck, { handSize: 2, rng: seqRng([0.1]) }); // 初始先手 = AI
  eq(g.leader, 'ai', '初始先手应为 AI');
  const card = g.aiLead();
  g.playLead('ai', card.id);
  const e = g.playResponse('player', null);
  eq(e.winnerId, 'ai');
  eq(e.points.total, card.pt, 'AI 放弃应答收益应按先出牌点数');
  eq(g.players.ai.score, card.pt, 'AI 分数应正确累加');
  eq(g.players.player.score, 0, '放弃方不得分');
});
t('放弃应答连胜加成照常生效', () => {
  const deck = [byId('ion-h'), byId('ion-oh'), byId('ion-ba'), byId('ion-cl')];
  const g = new Game(deck, { handSize: 2, rng: seqRng([0.1]) });
  const first = g.aiLead();
  g.playLead('ai', first.id);
  const e1 = g.playResponse('player', null);
  eq(e1.points.streakBonus, 0, '首回合无连胜加成');
  const second = g.aiLead();
  g.playLead('ai', second.id);
  const e2 = g.playResponse('player', null);
  eq(e2.points.streakBonus, 2, '连赢第2回合应有 +2 加成');
  eq(e2.points.total, second.pt + 2);
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

console.log('— 模式重构（v2.1：化学物质模式 / 离子模式）—');
const topicsOf = moduleIds => MODULES
  .filter(m => moduleIds.includes(m.id))
  .flatMap(m => m.topics.map(t => t.id));

t('离子模式卡组只包含离子卡', () => {
  const cards = cardsByTopics(topicsOf(['ion']));
  assert(cards.length >= 20, `离子卡数量应充足，实际 ${cards.length}`);
  assert(cards.every(c => c.ctype === 'ion' && c.module === 'ion'), '离子模式不应混入物质卡');
});
t('化学物质模式卡组不含任何离子卡', () => {
  const cards = cardsByTopics(topicsOf(['inorganic', 'organic']));
  assert(cards.length >= 50, `物质卡数量应充足，实际 ${cards.length}`);
  assert(cards.every(c => c.ctype !== 'ion'), '物质模式不应混入离子卡');
});
t('离子卡与物质卡双向均判定不通用', () => {
  const a = matchCards(byId('ion-h'), byId('naoh'));
  const b = matchCards(byId('naoh'), byId('ion-h'));
  assert(!a.valid && !b.valid, '跨模式卡牌不应落入任何反应规则');
});
t('纯离子卡组可完整对局且无崩溃', () => {
  const cards = cardsByTopics(topicsOf(['ion']));
  const g = new Game(cards, { handSize: 6, rng: identityRng });
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
      g.playResponse(pid, ok.length ? ok[0].id : null);
    }
  }
  assert(g.isOver, '纯离子对局应正常结束');
  assert(g.result, '纯离子对局应产出结算结果');
});

console.log('— 再来一局：状态隔离（v2.1）—');
t('新一局不继承上一局的分数、日志与回合数', () => {
  const deck = [byId('hcl'), byId('fe'), byId('naoh'), byId('cu')];
  const g1 = new Game(deck, { handSize: 2, rng: identityRng });
  g1.playLead('player', 'hcl');
  g1.playResponse('ai', 'naoh'); // 中和反应，AI 赢得该回合
  assert(g1.players.ai.score > 0, '上一局应已产生得分');
  assert(g1.log.length > 0, '上一局应已有对局日志');

  const g2 = new Game(ALL_CARDS, { handSize: 6, rng: identityRng });
  eq(g2.players.player.score, 0, '新局玩家分数应清零');
  eq(g2.players.ai.score, 0, '新局 AI 分数应清零');
  eq(g2.log.length, 0, '新局日志应为空');
  eq(g2.round, 1, '新局回合数应重置为 1');
  eq(g2.phase, PHASE.LEAD, '新局应回到出牌阶段');
  assert(g2.currentLead === null, '新局不应残留上一局的先出牌');
});
t('连续两局均可完整对局（模拟再来一局）', () => {
  for (let i = 0; i < 2; i++) {
    const g = new Game(ALL_CARDS, { handSize: 5, rng: seqRng([0.4, 0.8, 0.6]) });
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
        g.playResponse(pid, ok.length ? ok[0].id : null);
      }
    }
    assert(g.isOver, `第 ${i + 1} 局应正常结束`);
    assert(g.result, `第 ${i + 1} 局应有结算结果`);
  }
});

console.log('— 内容扩充（v2.3：卡牌与反应库）—');
const allIds = new Set(ALL_CARDS.map(c => c.id));
const expectValid = (a, b, mult = 2) => {
  const m = matchCards(byId(a), byId(b));
  assert(m.valid, `${a} + ${b} 应判定有效：${JSON.stringify(m)}`);
  eq(m.multiplier, mult, `${a}+${b} 倍率`);
  return m;
};

t('卡牌 id 唯一且关键字段完整', () => {
  eq(allIds.size, ALL_CARDS.length, '存在重复卡牌 id');
  for (const c of ALL_CARDS) {
    assert(c.id && c.name && c.sub && c.module && c.topic, `卡牌字段缺失：${JSON.stringify(c)}`);
    assert(c.pt >= 1 && c.pt <= 5, `牌面点数越界：${c.id}=${c.pt}`);
  }
});
t('方程式库所有引用均指向已存在卡牌', () => {
  for (const key of Object.keys(EQUATIONS)) {
    for (const id of key.split('+')) {
      assert(allIds.has(id), `方程式引用了不存在的卡牌：${id}（键 ${key}）`);
    }
  }
});
t('离子作用表引用有效，同号仅限氧化还原/弱电解质例外', () => {
  const ionMap = new Map(ION_CARDS.map(c => [c.id, c]));
  let sameKind = 0;
  for (const key of Object.keys(ION_INTERACTIONS)) {
    const [a, b] = key.split('+');
    const ca = ionMap.get(a), cb = ionMap.get(b);
    assert(ca && cb, `离子作用表引用不存在离子：${key}`);
    if (ca.ionKind === cb.ionKind) {
      sameKind++;
      const k = ION_INTERACTIONS[key].kind;
      assert(k === 'redox' || k === 'water', `同号离子不应生成沉淀/气体：${key} (${k})`);
    }
  }
  assert(sameKind >= 1, '应保留同号但可反应的例外（如 HCO₃⁻+OH⁻、I⁻+MnO₄⁻）');
  const m = matchCards(byId('ion-hco3'), byId('ion-oh'));
  assert(m.valid, 'HCO₃⁻ + OH⁻ 应可反应');
});
t('同号例外：HCO₃⁻ + OH⁻ 判定为生成水', () => {
  const m = matchCards(byId('ion-hco3'), byId('ion-oh'));
  assert(m.valid && m.name.includes('水'), `HCO₃⁻+OH⁻ 应生成水：${JSON.stringify(m)}`);
});
t('各模块卡牌数量充足', () => {
  const inorg = cardsByTopics(topicsOf(['inorganic']));
  const org = cardsByTopics(topicsOf(['organic']));
  const ion = cardsByTopics(topicsOf(['ion']));
  assert(inorg.length >= 50, `无机卡数量不足：${inorg.length}`);
  assert(org.length >= 30, `有机卡数量不足：${org.length}`);
  assert(ion.length >= 29, `离子卡数量不足：${ion.length}`);
});
t('新增无机反应抽样（含配平事实）', () => {
  expectValid('koh', 'hcl');
  expectValid('fe3o4', 'hcl');
  expectValid('kclo3', 'hcl');
  expectValid('p4', 'o2');
  expectValid('feso4', 'zn');
  expectValid('so3', 'naoh');
});
t('新增有机反应抽样', () => {
  expectValid('glycerol', 'hno3');
  expectValid('benzoic', 'ethanol');
  expectValid('methylacetate', 'naoh');
  expectValid('fructose', 'tollens');
  expectValid('cellulose', 'h2so4');
});
t('新增离子相互作用抽样', () => {
  assert(expectValid('ion-zn', 'ion-oh').name.includes('沉淀'), 'Zn²⁺+OH⁻ 应为沉淀');
  assert(expectValid('ion-f', 'ion-ca').eq.includes('CaF₂'), 'Ca²⁺+F⁻ 应生成 CaF₂');
  assert(expectValid('ion-h', 'ion-so3').name.includes('气体'), 'H⁺+SO₃²⁻ 应为气体');
  assert(expectValid('ion-po4', 'ion-ag').eq.includes('Ag₃PO₄'), 'Ag⁺+PO₄³⁻ 应生成 Ag₃PO₄');
  assert(expectValid('ion-ac', 'ion-h').name.includes('水'), 'H⁺+CH₃COO⁻ 应生成弱电解质');
});
t('AgF 可溶：Ag⁺ 与 F⁻ 应判为共存', () => {
  const m = matchCards(byId('ion-ag'), byId('ion-f'));
  assert(!m.valid && m.expl.includes('共存'), `AgF可溶，不应判定沉淀：${JSON.stringify(m)}`);
});
t('新增组合技已注册且可命中', () => {
  eq(ION_COMBOS.length, 7, '组合技数量');
  eq(findCombo([byId('ion-ag'), byId('ion-po4'), byId('ion-na')]).id, 'combo-phosphate');
  eq(findCombo([byId('ion-h'), byId('ion-so3'), byId('ion-na')]).id, 'combo-sulfite');
});
t('新增卡牌可被对应模式加载', () => {
  const inorg = cardsByTopics(topicsOf(['inorganic'])).map(c => c.id);
  const org = cardsByTopics(topicsOf(['organic'])).map(c => c.id);
  const ion = cardsByTopics(topicsOf(['ion'])).map(c => c.id);
  for (const id of ['fe3o4', 'koh', 'kclo3', 'p4']) assert(inorg.includes(id), `无机模式缺少 ${id}`);
  for (const id of ['glycerol', 'benzoic', 'fructose', 'cellulose']) assert(org.includes(id), `有机模式缺少 ${id}`);
  for (const id of ['ion-zn', 'ion-f', 'ion-so3', 'ion-po4']) assert(ion.includes(id), `离子模式缺少 ${id}`);
});
t('易错组合解析：CuS 不溶于稀盐酸', () => {
  const m = matchCards(byId('cus'), byId('hcl'));
  assert(!m.valid && TRAPS['cus+hcl'], `应命中易错解析：${JSON.stringify(m)}`);
  assert(m.expl.includes('不溶于稀盐酸'));
});

console.log('\n— 设置模块（v2.5）—');
t('默认设置完整且为只读常量', () => {
  eq(DEFAULT_SETTINGS.handSize, 6);
  eq(DEFAULT_SETTINGS.volume, 60);
  eq(DEFAULT_SETTINGS.difficulty, 'normal');
  assert(Object.isFrozen(DEFAULT_SETTINGS), '默认设置应为冻结对象');
});
t('非法值收敛：音量 / 手牌 / 难度 / 动效', () => {
  eq(normalizeSettings({ volume: -20 }).volume, 0, '音量下限');
  eq(normalizeSettings({ volume: 150 }).volume, 100, '音量上限');
  eq(normalizeSettings({ volume: 'abc' }).volume, 60, '非数字音量');
  eq(normalizeSettings({ handSize: 7 }).handSize, 6, '非法手牌数');
  eq(normalizeSettings({ difficulty: 'hard' }).difficulty, 'normal', '非法难度');
  eq(normalizeSettings({ motion: 'none' }).motion, 'full', '非法动效');
});
t('昵称去空格、截断与空值回退', () => {
  eq(normalizeSettings({ nickname: '  化学玩家  ' }).nickname, '化学玩家');
  eq(normalizeSettings({ nickname: '一二三四五六七八九十十一十二' }).nickname.length, 12, '昵称长度');
  eq(normalizeSettings({ nickname: '   ' }).nickname, '玩家', '空昵称回退');
});
t('保存 / 读取副本 / 恢复默认', () => {
  const before = getSettings();
  try {
    const saved = saveSettings({ volume: 30, nickname: '小明', sfx: false });
    eq(saved.volume, 30);
    eq(saved.nickname, '小明');
    assert(!saved.sfx, '音效应关闭');
    const copy = getSettings();
    copy.volume = 999;
    eq(getSettings().volume, 30, 'getSettings 应返回副本');
    const reset = resetSettings();
    eq(reset.nickname, DEFAULT_SETTINGS.nickname, '恢复默认昵称');
    eq(reset.volume, DEFAULT_SETTINGS.volume, '恢复默认音量');
  } finally {
    saveSettings(before);
  }
});

console.log('\n— 历史记录模块（v2.6）—');
t('记录校验：非法时间丢弃，缺失字段补默认并收敛数值', () => {
  eq(normalizeRecord(null), null, '空记录');
  eq(normalizeRecord({ endedAt: 'not-a-date' }), null, '非法时间');
  const rec = normalizeRecord({ endedAt: new Date().toISOString(), playerScore: '42', aiScore: -3 });
  eq(rec.playerScore, 42, '字符串分数转数字');
  eq(rec.aiScore, 0, '负分归零');
  eq(rec.mode, 'substance', '默认模式');
  eq(rec.result, 'draw', '默认结果');
  eq(rec.handSize, 6, '默认手牌数');
  eq(rec.difficulty, 'normal', '默认难度');
});
t('增量追加：最新置顶、倒序排列、上限截断', () => {
  clearHistory();
  const base = Date.now();
  for (let i = 0; i < MAX_RECORDS + 10; i++) {
    addHistoryRecord({
      endedAt: new Date(base - i * 60000).toISOString(),
      result: i % 2 ? 'win' : 'lose',
      playerScore: i
    });
  }
  const rows = loadHistory();
  eq(rows.length, MAX_RECORDS, '超出上限应截断');
  eq(rows[0].playerScore, 0, '最新记录置顶');
  assert(Date.parse(rows[0].endedAt) >= Date.parse(rows[1].endedAt), '记录应按时间倒序');
});
t('按结果 / 模式 / 时间筛选与统计', () => {
  clearHistory();
  const now = Date.now();
  addHistoryRecord({ endedAt: new Date(now - 2 * 3600000).toISOString(), result: 'win', mode: 'ion', playerScore: 30, aiScore: 10 });
  addHistoryRecord({ endedAt: new Date(now - 10 * 86400000).toISOString(), result: 'lose', mode: 'substance', playerScore: 10, aiScore: 40 });
  addHistoryRecord({ endedAt: new Date(now - 40 * 86400000).toISOString(), result: 'win', mode: 'substance', playerScore: 20, aiScore: 15 });

  eq(queryHistory({ result: 'win' }).length, 2, '按结果筛选');
  eq(queryHistory({ result: 'lose' }).length, 1, '按结果筛选（负）');
  eq(queryHistory({ mode: 'ion' }).length, 1, '按模式筛选');
  eq(queryHistory({ range: '7d' }).length, 1, '近 7 天');
  eq(queryHistory({ range: '30d' }).length, 2, '近 30 天');
  eq(queryHistory({ range: 'all' }).length, 3, '全部时间');

  const stats = historyStats(queryHistory({ result: 'win' }));
  eq(stats.wins, 2, '胜场数');
  eq(stats.total, 2, '筛选总数');
  eq(stats.winRate, 100, '胜率');
  eq(stats.best, 30, '最高分');
});
t('大量记录筛选耗时在合理范围', () => {
  const started = performance.now();
  const rows = queryHistory({ result: 'all', mode: 'all', range: '30d' });
  const elapsed = performance.now() - started;
  assert(elapsed < 50, `筛选 ${rows.length} 条耗时 ${elapsed.toFixed(1)}ms，应小于 50ms`);
});
t('清空历史与空数据统计', () => {
  clearHistory();
  eq(loadHistory().length, 0, '清空后应为空');
  const stats = historyStats(loadHistory());
  eq(stats.total, 0, '空历史总数');
  eq(stats.winRate, 0, '空历史胜率');
  eq(stats.best, 0, '空历史最高分');
});

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);

// 离子反应专属模式数据（人教版高中化学：离子反应与离子共存）
// 离子卡专属字段：
//   charge  离子电荷数（带符号，如 +2 / -1）
//   ionKind 'cation' 阳离子 / 'anion' 阴离子
// 规则引擎依据 charge / ionKind / tags 判定沉淀、气体、弱电解质生成与离子氧化还原

export const ION_MODULE = {
  id: 'ion',
  title: '离子反应',
  desc: '离子相互作用 · 离子共存 · 离子方程式',
  topics: [
    { id: 'ion-reaction', name: '离子反应与共存', desc: '复分解型离子反应：沉淀、气体、弱电解质的生成' },
    { id: 'ion-redox', name: '离子氧化还原', desc: '溶液中的氧化还原：Fe³⁺、MnO₄⁻、ClO⁻ 等' }
  ]
};

const c = (id, name, sub, topic, pt, extra = {}) =>
  ({ id, name, sub, module: 'ion', topic, ctype: 'ion', pt, ...extra });

export const ION_CARDS = [
  // ---- 阳离子 ----
  c('ion-h',    '氢离子',   'H⁺',     'ion-reaction', 4, { charge: +1, ionKind: 'cation', tags: ['酸', '生成气体', '生成水'] }),
  c('ion-na',   '钠离子',   'Na⁺',    'ion-reaction', 1, { charge: +1, ionKind: 'cation', tags: ['可共存', '旁观离子'] }),
  c('ion-k',    '钾离子',   'K⁺',     'ion-reaction', 1, { charge: +1, ionKind: 'cation', tags: ['可共存', '旁观离子'] }),
  c('ion-nh4',  '铵根离子', 'NH₄⁺',   'ion-reaction', 3, { charge: +1, ionKind: 'cation', tags: ['生成气体', '水解'] }),
  c('ion-ca',   '钙离子',   'Ca²⁺',   'ion-reaction', 2, { charge: +2, ionKind: 'cation', tags: ['生成沉淀'] }),
  c('ion-ba',   '钡离子',   'Ba²⁺',   'ion-reaction', 3, { charge: +2, ionKind: 'cation', tags: ['生成沉淀'] }),
  c('ion-mg',   '镁离子',   'Mg²⁺',   'ion-reaction', 2, { charge: +2, ionKind: 'cation', tags: ['生成沉淀'] }),
  c('ion-al',   '铝离子',   'Al³⁺',   'ion-reaction', 3, { charge: +3, ionKind: 'cation', tags: ['生成沉淀', '水解'] }),
  c('ion-cu',   '铜离子',   'Cu²⁺',   'ion-reaction', 3, { charge: +2, ionKind: 'cation', tags: ['生成沉淀', '蓝色'] }),
  c('ion-ag',   '银离子',   'Ag⁺',    'ion-reaction', 3, { charge: +1, ionKind: 'cation', tags: ['生成沉淀'] }),
  c('ion-fe2',  '亚铁离子', 'Fe²⁺',   'ion-redox',    3, { charge: +2, ionKind: 'cation', tags: ['还原剂', '生成沉淀', '浅绿色'] }),
  c('ion-fe3',  '铁离子',   'Fe³⁺',   'ion-redox',    4, { charge: +3, ionKind: 'cation', tags: ['氧化剂', '生成沉淀', '黄色'] }),

  // ---- 阴离子 ----
  c('ion-oh',   '氢氧根离子',   'OH⁻',    'ion-reaction', 4, { charge: -1, ionKind: 'anion', tags: ['碱', '生成沉淀', '生成水'] }),
  c('ion-cl',   '氯离子',       'Cl⁻',    'ion-reaction', 1, { charge: -1, ionKind: 'anion', tags: ['可共存'] }),
  c('ion-no3',  '硝酸根离子',   'NO₃⁻',   'ion-reaction', 1, { charge: -1, ionKind: 'anion', tags: ['可共存', '旁观离子'] }),
  c('ion-so4',  '硫酸根离子',   'SO₄²⁻',  'ion-reaction', 2, { charge: -2, ionKind: 'anion', tags: ['生成沉淀'] }),
  c('ion-co3',  '碳酸根离子',   'CO₃²⁻',  'ion-reaction', 3, { charge: -2, ionKind: 'anion', tags: ['生成沉淀', '生成气体'] }),
  c('ion-hco3', '碳酸氢根离子', 'HCO₃⁻',  'ion-reaction', 2, { charge: -1, ionKind: 'anion', tags: ['生成气体', '与酸碱均反应'] }),
  c('ion-s2',   '硫离子',       'S²⁻',    'ion-reaction', 3, { charge: -2, ionKind: 'anion', tags: ['生成沉淀', '生成气体', '还原剂'] }),
  c('ion-br',   '溴离子',       'Br⁻',    'ion-reaction', 2, { charge: -1, ionKind: 'anion', tags: ['生成沉淀'] }),
  c('ion-i',    '碘离子',       'I⁻',     'ion-redox',    3, { charge: -1, ionKind: 'anion', tags: ['还原剂', '生成沉淀'] }),
  c('ion-clo',  '次氯酸根离子', 'ClO⁻',   'ion-redox',    3, { charge: -1, ionKind: 'anion', tags: ['氧化剂', '弱酸根'] }),
  c('ion-mno4', '高锰酸根离子', 'MnO₄⁻',  'ion-redox',    4, { charge: -1, ionKind: 'anion', tags: ['氧化剂', '紫色'] })
];

// ---- 离子相互作用判定表 ----
// 键为阳离子 id + '+' + 阴离子 id（无序，使用前排序）
// kind: precipitate 生成沉淀 / gas 生成气体 / water 生成水或弱电解质 / redox 离子氧化还原
const I = (cat, an, kind, eq, expl) => [cat, an, { kind, eq, expl }];
export const ION_INTERACTIONS = {};
const ION_PAIRS = [
  // ===== 生成沉淀 =====
  I('ion-ba', 'ion-so4', 'precipitate', 'Ba²⁺ + SO₄²⁻ = BaSO₄↓', '白色沉淀，不溶于稀盐酸——检验SO₄²⁻'),
  I('ion-ba', 'ion-co3', 'precipitate', 'Ba²⁺ + CO₃²⁻ = BaCO₃↓', '白色沉淀，可溶于盐酸并放出CO₂'),
  I('ion-ca', 'ion-co3', 'precipitate', 'Ca²⁺ + CO₃²⁻ = CaCO₃↓', '白色沉淀——澄清石灰水变浑浊的实质'),
  I('ion-ag', 'ion-cl', 'precipitate', 'Ag⁺ + Cl⁻ = AgCl↓', '白色沉淀，不溶于稀硝酸——检验Cl⁻'),
  I('ion-ag', 'ion-br', 'precipitate', 'Ag⁺ + Br⁻ = AgBr↓', '淡黄色沉淀——检验Br⁻'),
  I('ion-ag', 'ion-i', 'precipitate', 'Ag⁺ + I⁻ = AgI↓', '黄色沉淀——检验I⁻'),
  I('ion-cu', 'ion-oh', 'precipitate', 'Cu²⁺ + 2OH⁻ = Cu(OH)₂↓', '蓝色絮状沉淀'),
  I('ion-fe3', 'ion-oh', 'precipitate', 'Fe³⁺ + 3OH⁻ = Fe(OH)₃↓', '红褐色沉淀——检验Fe³⁺'),
  I('ion-fe2', 'ion-oh', 'precipitate', 'Fe²⁺ + 2OH⁻ = Fe(OH)₂↓', '白色絮状，迅速变灰绿、最终红褐色：4Fe(OH)₂+O₂+2H₂O=4Fe(OH)₃'),
  I('ion-mg', 'ion-oh', 'precipitate', 'Mg²⁺ + 2OH⁻ = Mg(OH)₂↓', '白色沉淀，可溶于酸'),
  I('ion-al', 'ion-oh', 'precipitate', 'Al³⁺ + 3OH⁻ = Al(OH)₃↓', '白色胶状沉淀，NaOH过量时溶解：Al(OH)₃+OH⁻=AlO₂⁻+2H₂O'),
  I('ion-fe2', 'ion-s2', 'precipitate', 'Fe²⁺ + S²⁻ = FeS↓', '黑色沉淀'),
  I('ion-cu', 'ion-s2', 'precipitate', 'Cu²⁺ + S²⁻ = CuS↓', '黑色沉淀，不溶于稀酸'),

  // ===== 生成气体 =====
  I('ion-h', 'ion-co3', 'gas', '2H⁺ + CO₃²⁻ = H₂O + CO₂↑', '碳酸盐遇酸放出二氧化碳'),
  I('ion-h', 'ion-hco3', 'gas', 'H⁺ + HCO₃⁻ = H₂O + CO₂↑', '碳酸氢盐遇酸放出二氧化碳'),
  I('ion-h', 'ion-s2', 'gas', '2H⁺ + S²⁻ = H₂S↑', '放出臭鸡蛋气味的硫化氢气体'),
  I('ion-nh4', 'ion-oh', 'gas', 'NH₄⁺ + OH⁻ =△= NH₃↑ + H₂O', '加热放出刺激性气味的氨气——检验NH₄⁺'),

  // ===== 生成水 / 弱电解质 =====
  I('ion-h', 'ion-oh', 'water', 'H⁺ + OH⁻ = H₂O', '中和反应的实质，放热'),
  I('ion-h', 'ion-clo', 'water', 'H⁺ + ClO⁻ = HClO', '强酸制弱酸，生成弱电解质次氯酸'),
  I('ion-hco3', 'ion-oh', 'water', 'HCO₃⁻ + OH⁻ = CO₃²⁻ + H₂O', '碳酸氢根与碱反应，与酸碱均能反应是其特性'),

  // ===== 离子氧化还原 =====
  I('ion-fe3', 'ion-i', 'redox', '2Fe³⁺ + 2I⁻ = 2Fe²⁺ + I₂', 'Fe³⁺的氧化性：溶液变黄，加淀粉变蓝'),
  I('ion-mno4', 'ion-fe2', 'redox', 'MnO₄⁻ + 5Fe²⁺ + 8H⁺ = Mn²⁺ + 5Fe³⁺ + 4H₂O', '酸性KMnO₄紫色褪去——检验Fe²⁺的还原性'),
  I('ion-mno4', 'ion-i', 'redox', '2MnO₄⁻ + 10I⁻ + 16H⁺ = 2Mn²⁺ + 5I₂ + 8H₂O', 'I⁻被氧化为I₂，紫色褪去'),
  I('ion-clo', 'ion-i', 'redox', 'ClO⁻ + 2I⁻ + H₂O = Cl⁻ + I₂ + 2OH⁻', 'ClO⁻把I⁻氧化为I₂'),
  I('ion-clo', 'ion-fe2', 'redox', 'ClO⁻ + 2Fe²⁺ + 2H⁺ = Cl⁻ + 2Fe³⁺ + H₂O', 'ClO⁻把Fe²⁺氧化为Fe³⁺'),
  I('ion-mno4', 'ion-s2', 'redox', '2MnO₄⁻ + 5S²⁻ + 16H⁺ = 2Mn²⁺ + 5S↓ + 8H₂O', 'S²⁻被氧化为淡黄色的硫单质')
];
for (const [a, b, v] of ION_PAIRS) {
  ION_INTERACTIONS[[a, b].sort().join('+')] = v;
}

// ---- 典型离子共存误断（均判为「不反应/可共存」时的教学解析已不必要；
//      这里记录的是看似能反应实则不能、或违反共存条件的易错组合）----
export const ION_TRAPS = {};

// ---- 组合技定义：集齐同一组合中的离子，应答成功时追加判定 ----
export const ION_COMBOS = [
  { id: 'combo-baso4', name: '硫酸钡双重沉淀', ions: ['ion-ba', 'ion-so4'], bonus: 1.5,
    expl: 'Ba²⁺与SO₄²⁻同时在手，沉淀组合威力加成' },
  { id: 'combo-co2', name: '气爆组合', ions: ['ion-h', 'ion-co3'], bonus: 1.5,
    expl: 'H⁺与CO₃²⁻同时在手，CO₂气爆加成' },
  { id: 'combo-neutral', name: '完全中和', ions: ['ion-h', 'ion-oh'], bonus: 1.5,
    expl: '酸碱齐聚，中和放热加成' },
  { id: 'combo-redox-fe', name: '铁的三态循环', ions: ['ion-fe2', 'ion-fe3', 'ion-oh'], bonus: 2,
    expl: 'Fe²⁺/Fe³⁺/OH⁻齐备：沉淀与氧化的完整演绎' },
  { id: 'combo-halide', name: '卤素检验链', ions: ['ion-ag', 'ion-cl', 'ion-br', 'ion-i'], bonus: 2,
    expl: 'Ag⁺与三种卤素离子：白、淡黄、黄三色沉淀全收集' }
];

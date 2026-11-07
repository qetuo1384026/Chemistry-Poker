// 有机化学知识数据（人教版高中化学：必修第二册 / 选择性必修3 有机化学基础）
// 字段与 inorganic.js 一致；有机专属字段：
//   rank  同类比较强度值：烃/醇比较碳原子数，羧酸比较酸性强弱
//   chain 有机转化链：{ id, pos }，相邻位置的物质存在一步转化关系
//         链 ethylene：乙烯 → 乙醇 → 乙醛 → 乙酸 → 乙酸乙酯

export const ORGANIC_MODULE = {
  id: 'organic',
  title: '有机化学',
  desc: '必修第二册 · 选择性必修3（有机化学基础）',
  topics: [
    { id: 'org-hydrocarbon', name: '烃', desc: '烷烃、烯烃、炔烃、芳香烃' },
    { id: 'org-halo', name: '卤代烃', desc: '溴乙烷的水解与消去' },
    { id: 'org-oxygen', name: '烃的含氧衍生物', desc: '醇、酚、醛、羧酸、酯' },
    { id: 'org-bio', name: '生命中的基础有机物', desc: '糖类、油脂、蛋白质' },
    { id: 'org-polymer', name: '合成高分子材料', desc: '加聚反应与常见塑料' },
    { id: 'org-reagent', name: '有机检验试剂', desc: '溴水、酸性KMnO₄、银氨溶液、新制Cu(OH)₂' }
  ]
};

const c = (id, name, sub, topic, ctype, pt, extra = {}) =>
  ({ id, name, sub, module: 'organic', topic, ctype, pt, ...extra });

export const ORGANIC_CARDS = [
  // ---- 烃 ----
  c('ch4',     '甲烷',   'CH₄',    'org-hydrocarbon', 'hydrocarbon', 2, { rank: 1, tags: ['烷烃', '取代反应'] }),
  c('c2h4',    '乙烯',   'C₂H₄',   'org-hydrocarbon', 'hydrocarbon', 4, { rank: 2, tags: ['烯烃', '碳碳双键', '加成反应'], chain: { id: 'ethylene', pos: 0 } }),
  c('c2h2',    '乙炔',   'C₂H₂',   'org-hydrocarbon', 'hydrocarbon', 3, { rank: 2, tags: ['炔烃', '碳碳三键', '加成反应'] }),
  c('benzene', '苯',     'C₆H₆',   'org-hydrocarbon', 'hydrocarbon', 3, { rank: 6, tags: ['芳香烃', '取代反应'] }),
  c('toluene', '甲苯',   'C₇H₈',   'org-hydrocarbon', 'hydrocarbon', 3, { rank: 7, tags: ['芳香烃', '侧链氧化'] }),

  // ---- 卤代烃 ----
  c('c2h5br',  '溴乙烷', 'C₂H₅Br', 'org-halo', 'halo', 3, { tags: ['水解反应', '消去反应'] }),

  // ---- 烃的含氧衍生物 ----
  c('ethanol', '乙醇',     'C₂H₅OH',      'org-oxygen', 'alcohol', 4, { rank: 2, tags: ['羟基', '催化氧化', '酯化'], chain: { id: 'ethylene', pos: 1 } }),
  c('phenol',  '苯酚',     'C₆H₅OH',      'org-oxygen', 'alcohol', 4, { rank: 6, tags: ['酚', '弱酸性', '显色反应'] }),
  c('ethanal', '乙醛',     'CH₃CHO',      'org-oxygen', 'aldehyde', 4, { rank: 2, tags: ['醛基', '还原性'], chain: { id: 'ethylene', pos: 2 } }),
  c('formic',  '甲酸',     'HCOOH',       'org-oxygen', 'acid', 4, { rank: 5, tags: ['羧酸', '弱酸', '醛基', '还原性'] }),
  c('acetic',  '乙酸',     'CH₃COOH',     'org-oxygen', 'acid', 3, { rank: 4, tags: ['羧酸', '弱酸', '酯化'], chain: { id: 'ethylene', pos: 3 } }),
  c('ester',   '乙酸乙酯', 'CH₃COOC₂H₅',  'org-oxygen', 'ester', 3, { rank: 4, tags: ['酯', '水解'], chain: { id: 'ethylene', pos: 4 } }),

  // ---- 生命中的基础有机物 ----
  c('glucose', '葡萄糖', 'C₆H₁₂O₆',      'org-bio', 'bio', 3, { tags: ['还原糖', '醛基'] }),
  c('sucrose', '蔗糖',   'C₁₂H₂₂O₁₁',    'org-bio', 'bio', 2, { tags: ['二糖', '非还原糖'] }),
  c('starch',  '淀粉',   '(C₆H₁₀O₅)ₙ',   'org-bio', 'bio', 2, { tags: ['多糖', '遇碘变蓝'] }),
  c('oil',     '油脂',   '高级脂肪酸甘油酯', 'org-bio', 'bio', 2, { tags: ['皂化反应', '水解'] }),
  c('protein', '蛋白质', '天然高分子',     'org-bio', 'bio', 3, { tags: ['盐析', '变性', '显色反应'] }),

  // ---- 合成高分子材料 ----
  c('pe',      '聚乙烯',   '[CH₂—CH₂]ₙ',   'org-polymer', 'polymer', 2, { tags: ['加聚反应', '塑料'] }),
  c('pvc',     '聚氯乙烯', '[CH₂—CHCl]ₙ',  'org-polymer', 'polymer', 2, { tags: ['加聚反应', '塑料'] }),

  // ---- 有机检验试剂 ----
  c('br2water', '溴水',           'Br₂水溶液',     'org-reagent', 'reagent', 3, { tags: ['检验', '加成褪色'] }),
  c('kmno4',    '酸性高锰酸钾',   'KMnO₄/H⁺',      'org-reagent', 'reagent', 3, { tags: ['检验', '氧化剂'] }),
  c('tollens',  '银氨溶液',       '[Ag(NH₃)₂]OH',  'org-reagent', 'reagent', 4, { tags: ['检验', '银镜反应'] }),
  c('cuoh2',    '新制氢氧化铜',   'Cu(OH)₂悬浊液', 'org-reagent', 'reagent', 4, { tags: ['检验', '砖红色沉淀'] }),

  // ---- v2.3 扩充：烃 / 卤代烃 / 含氧衍生物 / 糖类 ----
  c('c3h8',      '丙烷',     'CH₃CH₂CH₃',    'org-hydrocarbon', 'hydrocarbon', 2, { rank: 3, tags: ['烷烃', '取代反应'] }),
  c('ch3cl',     '一氯甲烷', 'CH₃Cl',        'org-halo', 'halo', 2, { tags: ['卤代烃', '水解反应'] }),
  c('methanol',  '甲醇',     'CH₃OH',        'org-oxygen', 'alcohol', 2, { rank: 1, tags: ['羟基', '有毒', '催化氧化'] }),
  c('glycerol',  '丙三醇',   'C₃H₅(OH)₃',    'org-oxygen', 'alcohol', 3, { rank: 3, tags: ['多羟基', '酯化', '保湿'] }),
  c('benzoic',   '苯甲酸',   'C₆H₅COOH',     'org-oxygen', 'acid', 3, { rank: 4, tags: ['羧酸', '弱酸', '防腐剂'] }),
  c('methylacetate', '乙酸甲酯', 'CH₃COOCH₃', 'org-oxygen', 'ester', 2, { rank: 3, tags: ['酯', '水解'] }),
  c('fructose',  '果糖',     'C₆H₁₂O₆',      'org-bio', 'bio', 3, { tags: ['还原糖', '单糖'] }),
  c('cellulose', '纤维素',   '(C₆H₁₀O₅)ₙ',   'org-bio', 'bio', 2, { tags: ['多糖', '水解', '脱水'] })
];

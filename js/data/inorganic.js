// 无机化学知识数据（人教版高中化学：必修第一册 / 必修第二册 / 选择性必修1）
// 卡牌字段说明：
//   id     唯一标识
//   name   物质名称
//   sub    化学式 / 类别说明
//   module 所属大模块（inorganic 无机化学）
//   topic  所属专题（用于知识范围筛选）
//   ctype  卡牌类别（metal/nonmetal/acid/base/salt/oxide），决定匹配规则
//   pt     牌面点数（1-5，近似体现物质的重要程度与反应活性）
//   rank   同类比较时的强度值（大者胜）：金属=活动性、酸/碱=强弱、卤素=氧化性
//   hBefore 金属活动性是否排在 H 之前（能否与稀酸置换出氢气）
//   tags   性质标签，供规则引擎与 AI 使用

export const INORGANIC_MODULE = {
  id: 'inorganic',
  title: '无机化学',
  desc: '必修第一册 · 必修第二册 · 选择性必修1',
  topics: [
    { id: 'inorg-metal', name: '金属及其化合物', desc: 'Na / Mg / Al / Fe / Cu 及其重要化合物' },
    { id: 'inorg-nonmetal', name: '非金属及其化合物', desc: 'Cl / S / N / Si / C / O / H 及其重要化合物' },
    { id: 'inorg-matter', name: '物质分类与离子反应', desc: '酸、碱、盐、氧化物与复分解反应' },
    { id: 'inorg-periodic', name: '元素周期律与卤素', desc: '碱金属、卤素的同主族递变规律' },
    { id: 'inorg-principle', name: '化学反应原理', desc: '电化学、弱电解质与盐类水解' }
  ]
};

const c = (id, name, sub, topic, ctype, pt, extra = {}) =>
  ({ id, name, sub, module: 'inorganic', topic, ctype, pt, ...extra });

export const INORGANIC_CARDS = [
  // ---- 金属及其化合物 ----
  c('na',     '钠',         'Na',        'inorg-metal', 'metal', 4, { rank: 8, hBefore: true, tags: ['活泼金属', '还原剂'] }),
  c('na2o2',  '过氧化钠',   'Na₂O₂',     'inorg-metal', 'oxide', 4, { tags: ['供氧剂', '氧化剂'] }),
  c('na2co3', '碳酸钠',     'Na₂CO₃',    'inorg-metal', 'salt',  2, { tags: ['碳酸盐'] }),
  c('nahco3', '碳酸氢钠',   'NaHCO₃',    'inorg-metal', 'salt',  2, { tags: ['碳酸盐'] }),
  c('mg',     '镁',         'Mg',        'inorg-metal', 'metal', 3, { rank: 7, hBefore: true }),
  c('al',     '铝',         'Al',        'inorg-metal', 'metal', 3, { rank: 6, hBefore: true, tags: ['两性'] }),
  c('al2o3',  '氧化铝',     'Al₂O₃',     'inorg-metal', 'oxide', 3, { tags: ['两性氧化物'] }),
  c('aloh3',  '氢氧化铝',   'Al(OH)₃',   'inorg-metal', 'base',  3, { rank: 2, tags: ['两性'] }),
  c('fe',     '铁',         'Fe',        'inorg-metal', 'metal', 3, { rank: 4, hBefore: true }),
  c('fecl2',  '氯化亚铁',   'FeCl₂',     'inorg-metal', 'salt',  3, { tags: ['还原剂'] }),
  c('fecl3',  '氯化铁',     'FeCl₃',     'inorg-metal', 'salt',  4, { tags: ['氧化剂'] }),
  c('cu',     '铜',         'Cu',        'inorg-metal', 'metal', 2, { rank: 1, hBefore: false }),
  c('cuso4',  '硫酸铜',     'CuSO₄',     'inorg-metal', 'salt',  2, { tags: ['铜盐'] }),

  // ---- 非金属及其化合物 ----
  c('cl2',    '氯气',       'Cl₂',       'inorg-nonmetal', 'nonmetal', 4, { rank: 8, tags: ['卤素', '氧化剂'] }),
  c('hcl',    '盐酸',       'HCl',       'inorg-nonmetal', 'acid', 3, { rank: 9, tags: ['强酸'] }),
  c('hclo',   '次氯酸',     'HClO',      'inorg-nonmetal', 'acid', 3, { rank: 1, tags: ['弱酸', '漂白', '氧化剂'] }),
  c('s',      '硫',         'S',         'inorg-nonmetal', 'nonmetal', 2),
  c('so2',    '二氧化硫',   'SO₂',       'inorg-nonmetal', 'oxide', 3, { tags: ['酸性氧化物', '还原剂', '漂白'] }),
  c('h2so4',  '浓硫酸',     'H₂SO₄(浓)', 'inorg-nonmetal', 'acid', 5, { rank: 10, tags: ['强酸', '强氧化性', '钝化', '吸水性'] }),
  c('n2',     '氮气',       'N₂',        'inorg-nonmetal', 'nonmetal', 1, { tags: ['稳定'] }),
  c('nh3',    '氨气',       'NH₃',       'inorg-nonmetal', 'base', 3, { rank: 3, tags: ['碱性气体'] }),
  c('hno3',   '硝酸',       'HNO₃',      'inorg-nonmetal', 'acid', 5, { rank: 10, tags: ['强酸', '强氧化性', '钝化'] }),
  c('si',     '硅',         'Si',        'inorg-nonmetal', 'nonmetal', 1, { tags: ['半导体'] }),
  c('sio2',   '二氧化硅',   'SiO₂',      'inorg-nonmetal', 'oxide', 3, { tags: ['酸性氧化物'] }),
  c('c',      '碳',         'C',         'inorg-nonmetal', 'nonmetal', 2, { tags: ['还原剂'] }),
  c('co2',    '二氧化碳',   'CO₂',       'inorg-nonmetal', 'oxide', 2, { tags: ['酸性氧化物'] }),
  c('o2',     '氧气',       'O₂',        'inorg-nonmetal', 'nonmetal', 3, { tags: ['氧化剂', '助燃'] }),
  c('h2',     '氢气',       'H₂',        'inorg-nonmetal', 'nonmetal', 2, { tags: ['还原剂'] }),

  // ---- 物质分类与离子反应 ----
  c('naoh',   '氢氧化钠',   'NaOH',      'inorg-matter', 'base', 3, { rank: 9, tags: ['强碱'] }),
  c('caoh2',  '氢氧化钙',   'Ca(OH)₂',   'inorg-matter', 'base', 2, { rank: 7, tags: ['澄清石灰水'] }),
  c('bacl2',  '氯化钡',     'BaCl₂',     'inorg-matter', 'salt', 2, { tags: ['钡盐'] }),
  c('agno3',  '硝酸银',     'AgNO₃',     'inorg-matter', 'salt', 3, { tags: ['银盐'] }),
  c('caco3',  '碳酸钙',     'CaCO₃',     'inorg-matter', 'salt', 2, { tags: ['碳酸盐', '难溶'] }),
  c('nacl',   '氯化钠',     'NaCl',      'inorg-matter', 'salt', 1, { tags: ['食盐'] }),
  c('cao',    '氧化钙',     'CaO',       'inorg-matter', 'oxide', 2, { tags: ['碱性氧化物'] }),

  // ---- 元素周期律与卤素 ----
  c('k',      '钾',         'K',         'inorg-periodic', 'metal', 4, { rank: 10, hBefore: true, tags: ['活泼金属'] }),
  c('ca',     '钙',         'Ca',        'inorg-periodic', 'metal', 3, { rank: 9, hBefore: true }),
  c('br2',    '溴',         'Br₂',       'inorg-periodic', 'nonmetal', 3, { rank: 6, tags: ['卤素', '氧化剂'] }),
  c('i2',     '碘',         'I₂',        'inorg-periodic', 'nonmetal', 2, { rank: 4, tags: ['卤素', '氧化剂'] }),

  // ---- 化学反应原理 ----
  c('zn',     '锌',         'Zn',        'inorg-principle', 'metal', 3, { rank: 5, hBefore: true, tags: ['原电池'] }),
  c('nh4cl',  '氯化铵',     'NH₄Cl',     'inorg-principle', 'salt', 2, { tags: ['水解', '铵盐'] }),
  c('h2co3',  '碳酸',       'H₂CO₃',     'inorg-principle', 'acid', 2, { rank: 2, tags: ['弱酸', '二元弱酸'] }),

  // ---- v2.3 扩充：金属及其化合物 / 非金属及其化合物 ----
  c('fe3o4',  '四氧化三铁', 'Fe₃O₄',     'inorg-metal', 'oxide', 3, { rank: 6, tags: ['复杂氧化物', '磁性', '碱性氧化物'] }),
  c('alcl3',  '氯化铝',     'AlCl₃',     'inorg-metal', 'salt',  3, { tags: ['铝盐', '水解'] }),
  c('feso4',  '硫酸亚铁',   'FeSO₄',     'inorg-metal', 'salt',  2, { tags: ['亚铁盐', '还原剂'] }),
  c('mgo',    '氧化镁',     'MgO',       'inorg-metal', 'oxide', 2, { tags: ['碱性氧化物', '耐火材料'] }),
  c('koh',    '氢氧化钾',   'KOH',       'inorg-matter', 'base', 3, { rank: 9, tags: ['强碱'] }),
  c('hbr',    '氢溴酸',     'HBr',       'inorg-nonmetal', 'acid', 3, { rank: 8, tags: ['强酸', '卤化氢'] }),
  c('so3',    '三氧化硫',   'SO₃',       'inorg-nonmetal', 'oxide', 3, { tags: ['酸性氧化物'] }),
  c('kclo3',  '氯酸钾',     'KClO₃',     'inorg-nonmetal', 'salt', 2, { tags: ['氧化剂', '实验室制氧气'] }),
  c('p4',     '白磷',       'P₄',        'inorg-nonmetal', 'nonmetal', 2, { tags: ['易自燃', '还原剂'] }),
  c('cus',    '硫化铜',     'CuS',       'inorg-matter', 'salt', 2, { tags: ['难溶', '黑色沉淀'] })
];

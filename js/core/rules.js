// 匹配规则引擎：判断「应答牌」能否接住「先出牌」
// 规则优先级：① 特征反应方程式库（精准配对，倍率×2）
//            ② 类别通用反应规律（倍率 1.5）
//            ③ 同类性质比较压制（倍率×1.0）
//            ④ 均不满足 → 匹配失败；若属于典型易错组合，返回教学解析

const E = (a, b, name, eq, expl) => [a, b, { name, eq, expl }];

// ---- 特征反应方程式库（键为两张牌 id 排序后拼接）----
const PAIRS = [
  // ===== 无机：酸碱 / 离子反应 =====
  E('hcl', 'naoh', '酸碱中和', 'HCl + NaOH = NaCl + H₂O', '强酸强碱中和，实质是 H⁺ + OH⁻ = H₂O，放热'),
  E('caoh2', 'hcl', '酸碱中和', '2HCl + Ca(OH)₂ = CaCl₂ + 2H₂O', '熟石灰改良酸性土壤的原理'),
  E('h2so4', 'naoh', '酸碱中和', 'H₂SO₄ + 2NaOH = Na₂SO₄ + 2H₂O', '强酸强碱中和，注意配平'),
  E('hno3', 'naoh', '酸碱中和', 'HNO₃ + NaOH = NaNO₃ + H₂O', '强酸强碱中和'),
  E('caoh2', 'h2so4', '酸碱中和', 'H₂SO₄ + Ca(OH)₂ = CaSO₄ + 2H₂O', '工业上处理酸性废水'),
  E('hcl', 'nh3', '酸与碱性气体', 'NH₃ + HCl = NH₄Cl', '产生白烟——可用于检验氨气或氯化氢'),
  E('hcl', 'na2co3', '强酸制弱酸', 'Na₂CO₃ + 2HCl = 2NaCl + H₂O + CO₂↑', '盐酸酸性强于碳酸，放出二氧化碳'),
  E('hcl', 'nahco3', '强酸制弱酸', 'NaHCO₃ + HCl = NaCl + H₂O + CO₂↑', '碳酸氢钠治疗胃酸过多的原理'),
  E('caco3', 'hcl', '实验室制CO₂', 'CaCO₃ + 2HCl = CaCl₂ + H₂O + CO₂↑', '大理石/石灰石与稀盐酸，实验室制CO₂'),
  E('agno3', 'hcl', '氯离子检验', 'HCl + AgNO₃ = AgCl↓ + HNO₃', '生成不溶于稀硝酸的白色AgCl沉淀'),
  E('bacl2', 'h2so4', '硫酸根检验', 'BaCl₂ + H₂SO₄ = BaSO₄↓ + 2HCl', '生成不溶于酸的白色BaSO₄沉淀'),
  E('naoh', 'nh4cl', '铵根检验', 'NH₄Cl + NaOH =△= NaCl + NH₃↑ + H₂O', '实验室制氨气、检验NH₄⁺的方法'),
  E('agno3', 'nacl', '氯离子检验', 'AgNO₃ + NaCl = AgCl↓ + NaNO₃', '白色AgCl沉淀，检验Cl⁻'),
  E('bacl2', 'cuso4', '复分解反应', 'BaCl₂ + CuSO₄ = BaSO₄↓ + CuCl₂', '生成白色BaSO₄沉淀'),
  E('bacl2', 'na2co3', '复分解反应', 'BaCl₂ + Na₂CO₃ = BaCO₃↓ + 2NaCl', '生成白色BaCO₃沉淀（可溶于盐酸）'),

  // ===== 无机：金属 =====
  E('fe', 'hcl', '金属与酸置换', 'Fe + 2HCl = FeCl₂ + H₂↑', '注意：生成+2价的亚铁盐而非铁盐'),
  E('h2so4', 'zn', '实验室制氢气', 'Zn + H₂SO₄ = ZnSO₄ + H₂↑', '锌与稀硫酸；也是铜锌原电池的总反应'),
  E('cuso4', 'fe', '金属置换', 'Fe + CuSO₄ = FeSO₄ + Cu', '湿法炼铜："曾青得铁则化为铜"，Fe比Cu活泼'),
  E('agno3', 'cu', '金属置换', 'Cu + 2AgNO₃ = Cu(NO₃)₂ + 2Ag', 'Cu比Ag活泼，置换出银白色金属银'),
  E('cu', 'fecl3', 'Fe³⁺的氧化性', 'Cu + 2FeCl₃ = CuCl₂ + 2FeCl₂', '腐蚀印刷电路板的原理，Fe³⁺被还原为Fe²⁺'),
  E('cl2', 'fecl2', 'Fe²⁺的还原性', '2FeCl₂ + Cl₂ = 2FeCl₃', 'Fe²⁺被Cl₂氧化为Fe³⁺，溶液由浅绿变黄'),
  E('cu', 'h2so4', '浓硫酸的强氧化性', 'Cu + 2H₂SO₄(浓) =△= CuSO₄ + SO₂↑ + 2H₂O', '金属与浓硫酸反应不放氢气，体现强氧化性与酸性'),
  E('cu', 'hno3', '硝酸的强氧化性', '3Cu + 8HNO₃(稀) = 3Cu(NO₃)₂ + 2NO↑ + 4H₂O', '硝酸与金属反应不放出氢气，NO遇空气变红棕'),
  E('c', 'h2so4', '浓硫酸氧化碳', 'C + 2H₂SO₄(浓) =△= CO₂↑ + 2SO₂↑ + 2H₂O', '只体现浓硫酸的强氧化性；产物检验顺序是经典考点'),
  E('cl2', 'so2', '氧化还原', 'SO₂ + Cl₂ + 2H₂O = H₂SO₄ + 2HCl', 'SO₂的还原性（注意与SO₂的漂白性区分）'),
  E('c', 'co2', '碳的还原性', 'CO₂ + C =高温= 2CO', '吸热反应，高炉炼铁中CO的来源'),
  E('co2', 'na2o2', '供氧剂', '2Na₂O₂ + 2CO₂ = 2Na₂CO₃ + O₂', '呼吸面具与潜水艇的供氧原理'),

  // ===== 无机：氧化物与酸碱 =====
  E('caoh2', 'co2', 'CO₂检验', 'CO₂ + Ca(OH)₂ = CaCO₃↓ + H₂O', '澄清石灰水变浑浊——检验CO₂'),
  E('co2', 'naoh', '酸性氧化物与碱', 'CO₂ + 2NaOH = Na₂CO₃ + H₂O', 'CO₂尾气吸收；盛放NaOH溶液用橡胶塞'),
  E('naoh', 'so2', '酸性氧化物与碱', 'SO₂ + 2NaOH = Na₂SO₃ + H₂O', 'SO₂尾气处理，防止酸雨'),
  E('naoh', 'sio2', '酸性氧化物与碱', 'SiO₂ + 2NaOH = Na₂SiO₃ + H₂O', '玻璃被腐蚀——NaOH溶液不能用玻璃塞'),
  E('al2o3', 'hcl', '两性氧化物', 'Al₂O₃ + 6HCl = 2AlCl₃ + 3H₂O', 'Al₂O₃与酸反应表现出碱性氧化物性质'),
  E('al2o3', 'naoh', '两性氧化物', 'Al₂O₃ + 2NaOH = 2NaAlO₂ + H₂O', 'Al₂O₃与碱反应表现出酸性氧化物性质'),
  E('aloh3', 'hcl', '两性氢氧化物', 'Al(OH)₃ + 3HCl = AlCl₃ + 3H₂O', 'Al(OH)₃显碱性：中和胃酸的药物成分'),
  E('aloh3', 'naoh', '两性氢氧化物', 'Al(OH)₃ + NaOH = NaAlO₂ + 2H₂O', 'Al(OH)₃显酸性：溶于强碱生成偏铝酸盐'),
  E('cao', 'hcl', '碱性氧化物与酸', 'CaO + 2HCl = CaCl₂ + H₂O', '碱性氧化物与酸生成盐和水'),

  // ===== 无机：燃烧与化合 =====
  E('cl2', 'fe', '金属与氯气', '2Fe + 3Cl₂ =△= 2FeCl₃', 'Cl₂氧化性强，把Fe直接氧化为+3价'),
  E('cl2', 'cu', '金属与氯气', 'Cu + Cl₂ =△= CuCl₂', '剧烈燃烧，产生棕黄色的烟'),
  E('cl2', 'h2', '氢气在氯气中燃烧', 'H₂ + Cl₂ =点燃= 2HCl', '苍白色火焰，瓶口出现白雾'),
  E('h2', 'o2', '氢气燃烧', '2H₂ + O₂ =点燃= 2H₂O', '点燃氢气前必须验纯'),
  E('fe', 'o2', '铁丝燃烧', '3Fe + 2O₂ =点燃= Fe₃O₄', '火星四射，生成黑色固体，瓶底要留水或铺沙'),
  E('c', 'o2', '碳燃烧', 'C + O₂ =点燃= CO₂', '氧气充足时生成CO₂（不足时生成CO）'),

  // ===== 有机：加成与检验 =====
  E('br2water', 'c2h4', '加成反应', 'CH₂=CH₂ + Br₂ → CH₂Br—CH₂Br', '溴水褪色——检验碳碳双键的特征反应'),
  E('br2water', 'c2h2', '加成反应', 'CH≡CH + 2Br₂ → CHBr₂—CHBr₂', '乙炔可分两步步加成，溴水褪色'),
  E('c2h4', 'kmno4', '氧化褪色', 'CH₂=CH₂ --KMnO₄/H⁺--> CO₂ + H₂O', '碳碳双键被氧化，酸性KMnO₄紫色褪去'),
  E('c2h2', 'kmno4', '氧化褪色', 'CH≡CH --KMnO₄/H⁺--> CO₂ + H₂O', '碳碳三键被氧化，酸性KMnO₄褪色'),
  E('br2water', 'phenol', '苯酚检验', 'C₆H₅OH + 3Br₂ → C₆H₂Br₃OH↓ + 3HBr', '生成2,4,6-三溴苯酚白色沉淀，检验苯酚'),
  E('fecl3', 'phenol', '显色反应', '6C₆H₅OH + FeCl₃ → 紫色配合物', 'FeCl₃遇苯酚显紫色——检验酚羟基'),
  E('ethanal', 'tollens', '银镜反应', 'CH₃CHO + 2[Ag(NH₃)₂]OH =△= CH₃COONH₄ + 2Ag↓ + 3NH₃ + H₂O', '水浴加热，试管壁形成银镜——检验醛基'),
  E('cuoh2', 'ethanal', '醛基检验', 'CH₃CHO + 2Cu(OH)₂ + NaOH =△= CH₃COONa + Cu₂O↓ + 3H₂O', '加热生成砖红色Cu₂O沉淀——检验醛基'),
  E('glucose', 'tollens', '银镜反应', '葡萄糖 + 2[Ag(NH₃)₂]OH =△= ... + 2Ag↓', '葡萄糖含醛基，是还原性糖，能发生银镜反应'),
  E('cuoh2', 'glucose', '还原糖检验', '葡萄糖 + 2Cu(OH)₂ =△= ... + Cu₂O↓', '砖红色沉淀——医学上检验尿液中的葡萄糖'),
  E('formic', 'tollens', '银镜反应', 'HCOOH + 2[Ag(NH₃)₂]OH =△= ... + 2Ag↓', '甲酸结构中同时含羧基和醛基，能发生银镜反应'),
  E('i2', 'starch', '淀粉检验', '淀粉 + I₂ → 蓝色', '淀粉遇碘变蓝——检验淀粉或碘单质'),

  // ===== 有机：转化链与酯化 =====
  E('c2h4', 'ethanol', '转化链：水化', 'CH₂=CH₂ + H₂O =催化剂= C₂H₅OH', '乙烯水化法制乙醇；逆反应为乙醇消去制乙烯'),
  E('ethanal', 'ethanol', '转化链：催化氧化', '2C₂H₅OH + O₂ =Cu/△= 2CH₃CHO + 2H₂O', '乙醇在Cu/Ag催化下氧化为乙醛'),
  E('acetic', 'ethanal', '转化链：氧化', '2CH₃CHO + O₂ =催化剂= 2CH₃COOH', '乙醛继续氧化为乙酸'),
  E('acetic', 'ester', '转化链：水解', 'CH₃COOC₂H₅ + H₂O ⇌ CH₃COOH + C₂H₅OH', '酯在酸或碱催化下水解，是酯化的逆过程'),
  E('acetic', 'ethanol', '酯化反应', 'CH₃COOH + C₂H₅OH ⇌ CH₃COOC₂H₅ + H₂O', '浓硫酸催化加热；"酸脱羟基醇脱氢"，可逆反应'),
  E('ethanol', 'na', '醇羟基与钠', '2C₂H₅OH + 2Na → 2C₂H₅ONa + H₂↑', '现象比钠与水反应缓和，说明羟基氢不如水活泼'),
  E('naoh', 'phenol', '苯酚弱酸性', 'C₆H₅OH + NaOH → C₆H₅ONa + H₂O', '苯酚俗称石炭酸，酸性比碳酸还弱'),
  E('acetic', 'naoh', '酸碱中和', 'CH₃COOH + NaOH → CH₃COONa + H₂O', '羧酸与强碱中和'),
  E('acetic', 'na2co3', '酸性强弱比较', '2CH₃COOH + Na₂CO₃ → 2CH₃COONa + H₂O + CO₂↑', '乙酸能与碳酸盐反应放出CO₂，证明酸性：乙酸>碳酸'),
  E('c2h5br', 'naoh', '卤代烃水解', 'C₂H₅Br + NaOH =H₂O/△= C₂H₅OH + NaBr', 'NaOH水溶液中水解（取代）；醇溶液中则消去'),
  E('ch4', 'cl2', '取代反应', 'CH₄ + Cl₂ =光照= CH₃Cl + HCl', '光照下逐步取代，生成四种氯代甲烷的混合物'),
  E('kmno4', 'toluene', '侧链氧化', '甲苯 --KMnO₄/H⁺--> 苯甲酸', '苯环活化了侧链甲基——甲苯能使酸性KMnO₄褪色而苯不能'),
  E('ethanal', 'kmno4', '醛基还原性', '乙醛 --KMnO₄/H⁺--> 乙酸', '醛基具还原性，使酸性KMnO₄褪色'),
  E('ethanol', 'kmno4', '醇的氧化', '乙醇 --KMnO₄/H⁺--> 乙醛/乙酸', '乙醇被强氧化剂氧化，溶液褪色'),
  E('hno3', 'protein', '蛋白质显色反应', '蛋白质 + 浓HNO₃ =△= 变黄', '含苯环的蛋白质遇浓硝酸变黄——颜色反应')
];

export const EQUATIONS = {};
for (const [a, b, v] of PAIRS) {
  EQUATIONS[[a, b].sort().join('+')] = v;
}

// ---- 典型易错组合：匹配失败时给出针对性解析 ----
const T = (a, b, expl) => [a, b, expl];
const TRAP_PAIRS = [
  T('al', 'h2so4', '常温下铝遇浓硫酸发生"钝化"：表面生成致密氧化膜阻止反应继续，不能持续反应'),
  T('fe', 'h2so4', '常温下铁遇浓硫酸发生"钝化"：表面生成致密氧化膜阻止反应继续'),
  T('al', 'hno3', '常温下铝遇浓硝酸钝化，表面生成致密氧化膜'),
  T('fe', 'hno3', '常温下铁遇浓硝酸钝化（故可用铁制容器储运浓硝酸）'),
  T('cu', 'hcl', '铜在金属活动性顺序中位于氢之后，不能与稀盐酸反应放出氢气'),
  T('cu', 'h2co3', '铜位于氢之后，且碳酸是弱酸，二者不反应'),
  T('benzene', 'br2water', '苯与溴水不反应（只萃取使其物理褪色）；苯的溴代必须用液溴并以FeBr₃催化'),
  T('sucrose', 'tollens', '蔗糖是非还原性糖，分子中没有醛基，不能发生银镜反应'),
  T('cuoh2', 'sucrose', '蔗糖是非还原性糖，与新制Cu(OH)₂共热不产生砖红色沉淀'),
  T('br2water', 'pe', '聚乙烯中没有碳碳双键（加聚时已加成），不能使溴水褪色'),
  T('kmno4', 'pe', '聚乙烯中没有碳碳双键，不能被酸性KMnO₄氧化褪色'),
  T('benzene', 'kmno4', '苯不能使酸性KMnO₄褪色——说明苯环中不存在普通的碳碳双键'),
  T('caoh2', 'caco3', '两者都是难溶物/弱反应体系，不发生复分解（这是澄清石灰水变浑浊的逆过程）'),
  T('na2co3', 'phenol', '苯酚酸性比碳酸弱，只能与Na₂CO₃生成NaHCO₃，高中阶段不视为有效反应')
];
export const TRAPS = {};
for (const [a, b, expl] of TRAP_PAIRS) {
  TRAPS[[a, b].sort().join('+')] = expl;
}

const pairKey = (a, b) => [a, b].sort().join('+');
const is = (card, ...ctypes) => ctypes.includes(card.ctype);
const has = (card, tag) => (card.tags || []).includes(tag);

// ---- 通用反应规律 ----
const GENERIC_RULES = [
  // 酸 + 碱 → 中和
  (a, b) => {
    if ((is(a, 'acid') && is(b, 'base')) || (is(a, 'base') && is(b, 'acid'))) {
      return {
        name: '酸碱中和', kind: 'category', multiplier: 1.5,
        eq: '酸 + 碱 → 盐 + 水',
        expl: '中和反应，实质 H⁺ + OH⁻ = H₂O'
      };
    }
  },
  // 强酸 + 碳酸盐 → 强酸制弱酸
  (a, b) => {
    const acid = is(a, 'acid') ? a : is(b, 'acid') ? b : null;
    const salt = is(a, 'salt') ? a : is(b, 'salt') ? b : null;
    if (acid && salt && has(acid, '强酸') && has(salt, '碳酸盐')) {
      return {
        name: '强酸制弱酸', kind: 'category', multiplier: 1.5,
        eq: '强酸 + 碳酸盐 → 盐 + H₂O + CO₂↑',
        expl: `${acid.name}是强酸，可制出弱酸（碳酸分解为CO₂）`
      };
    }
  },
  // 活泼金属 + 稀酸 → 置换出氢气
  (a, b) => {
    const metal = is(a, 'metal') ? a : is(b, 'metal') ? b : null;
    const acid = is(a, 'acid') ? a : is(b, 'acid') ? b : null;
    if (metal && acid && metal.hBefore && !has(acid, '强氧化性') && !has(acid, '钝化')) {
      return {
        name: '金属与酸置换', kind: 'category', multiplier: 1.5,
        eq: '活泼金属 + 稀酸 → 盐 + H₂↑',
        expl: `${metal.name}在金属活动性顺序中位于氢之前，可置换出氢气`
      };
    }
  },
  // 金属 + 氧气/卤素 → 化合
  (a, b) => {
    const metal = is(a, 'metal') ? a : is(b, 'metal') ? b : null;
    const nm = is(a, 'nonmetal') ? a : is(b, 'nonmetal') ? b : null;
    if (metal && nm && (nm.id === 'o2' || has(nm, '卤素'))) {
      return {
        name: '金属与非金属化合', kind: 'category', multiplier: 1.5,
        eq: '金属 + 非金属 → 化合物（点燃/加热）',
        expl: `${metal.name}能在${nm.name}中燃烧/加热化合，体现${nm.name}的氧化性`
      };
    }
  },
  // 酸性氧化物 + 碱 / 碱性氧化物 + 酸 / 两性氧化物与酸、碱
  (a, b) => {
    const ox = is(a, 'oxide') ? a : is(b, 'oxide') ? b : null;
    const other = ox === a ? b : a;
    if (!ox) return;
    if (has(ox, '酸性氧化物') && is(other, 'base')) {
      return {
        name: '酸性氧化物与碱', kind: 'category', multiplier: 1.5,
        eq: '酸性氧化物 + 碱 → 盐 + 水',
        expl: `${ox.name}是酸性氧化物，与碱反应生成盐和水`
      };
    }
    if (has(ox, '碱性氧化物') && is(other, 'acid')) {
      return {
        name: '碱性氧化物与酸', kind: 'category', multiplier: 1.5,
        eq: '碱性氧化物 + 酸 → 盐 + 水',
        expl: `${ox.name}是碱性氧化物，与酸反应生成盐和水`
      };
    }
    if (has(ox, '两性氧化物') && (is(other, 'acid') || is(other, 'base'))) {
      return {
        name: '两性氧化物', kind: 'category', multiplier: 1.5,
        eq: '两性氧化物既能与酸又能与碱反应',
        expl: `${ox.name}是两性氧化物`
      };
    }
  },
  // 有机转化链相邻
  (a, b) => {
    if (a.chain && b.chain && a.chain.id === b.chain.id &&
        Math.abs(a.chain.pos - b.chain.pos) === 1) {
      return {
        name: '有机转化链', kind: 'category', multiplier: 1.5,
        eq: '转化链相邻物质存在一步转化',
        expl: '乙烯 → 乙醇 → 乙醛 → 乙酸 → 乙酸乙酯：有机合成的核心线索'
      };
    }
  },
  // 羧酸 + 醇 → 酯化（酚不可直接酯化）
  (a, b) => {
    const acid = is(a, 'acid') && has(a, '羧酸') ? a : is(b, 'acid') && has(b, '羧酸') ? b : null;
    const alc = is(a, 'alcohol') && !has(a, '酚') ? a : is(b, 'alcohol') && !has(b, '酚') ? b : null;
    if (acid && alc) {
      return {
        name: '酯化反应', kind: 'category', multiplier: 1.5,
        eq: '羧酸 + 醇 ⇌ 酯 + 水（浓硫酸、△）',
        expl: '可逆反应，浓硫酸作催化剂和吸水剂'
      };
    }
  },
  // 同类比较压制：应答方强度更高才能接住
  (a, b) => {
    if (a.ctype === b.ctype && a.rank != null && b.rank != null && a.rank !== b.rank) {
      // a 为先出牌，b 为应答牌
      if (b.rank > a.rank) {
        const dim = {
          metal: '金属活动性', acid: '酸性', base: '碱性',
          nonmetal: '氧化性', hydrocarbon: '碳原子数', alcohol: '碳原子数'
        }[a.ctype] || '强度';
        return {
          name: '同类比较', kind: 'compare', multiplier: 1.0,
          eq: `${b.name} > ${a.name}`,
          expl: `同类比较（${dim}）：${b.name}强于${a.name}`
        };
      }
      return { invalid: true, expl: `${b.name}的强度不及${a.name}，同类比较无法压制` };
    }
  }
];

/**
 * 判定应答牌 resp 能否接住先出牌 lead
 * @returns {{valid:boolean, name?:string, eq?:string, expl:string, multiplier?:number, kind?:string}}
 */
export function matchCards(lead, resp) {
  const key = pairKey(lead.id, resp.id);

  // ① 特征方程式库（精准配对）
  const db = EQUATIONS[key];
  if (db) {
    return { valid: true, name: db.name, eq: db.eq, expl: db.expl, multiplier: 2, kind: 'specific' };
  }

  // ②③ 通用规律（注意：先出牌为 lead，应答牌为 resp，比较规则有方向性）
  for (const rule of GENERIC_RULES) {
    const r = rule(lead, resp);
    if (r) {
      if (r.invalid) return { valid: false, expl: r.expl };
      return { valid: true, ...r };
    }
  }

  // ④ 失败：易错点解析优先
  const trap = TRAPS[key];
  if (trap) return { valid: false, expl: trap };
  return { valid: false, expl: `${resp.name}与${lead.name}之间没有典型的化学反应或性质压制关系` };
}

/** 筛出手牌中所有能接住 lead 的牌（供 AI 与提示高亮使用） */
export function validResponses(hand, lead) {
  return hand.filter(card => matchCards(lead, card).valid);
}

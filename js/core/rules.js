// 匹配规则引擎：判断「应答牌」能否接住「先出牌」
// 规则优先级：① 特征反应方程式库（精准配对，倍率×2）
//            ② 离子专属判定（双方均为离子卡：沉淀/气体/弱电解质/氧化还原，倍率×2）
//            ③ 类别通用反应规律（倍率 1.5）
//            ④ 均不满足 → 匹配失败；若属于典型易错组合，返回教学解析

import { ION_INTERACTIONS, ION_COMBOS } from '../data/ions.js';

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
  E('hno3', 'protein', '蛋白质显色反应', '蛋白质 + 浓HNO₃ =△= 变黄', '含苯环的蛋白质遇浓硝酸变黄——颜色反应'),

  // ===== v2.0 扩充：复分解与离子反应 =====
  E('caoh2', 'na2co3', '复分解反应', 'Ca(OH)₂ + Na₂CO₃ = CaCO₃↓ + 2NaOH', '工业上制取烧碱的原理'),
  E('hno3', 'nh3', '酸与碱性气体', 'NH₃ + HNO₃ = NH₄NO₃', '产生白烟——检验氨气'),
  E('h2so4', 'nh3', '酸与碱性气体', '2NH₃ + H₂SO₄ = (NH₄)₂SO₄', '氨气被硫酸吸收，不可用浓硫酸干燥氨气'),
  E('agno3', 'fecl3', '氯离子检验', '3AgNO₃ + FeCl₃ = 3AgCl↓ + Fe(NO₃)₃', '生成白色AgCl沉淀'),
  E('agno3', 'bacl2', '氯离子检验', '2AgNO₃ + BaCl₂ = 2AgCl↓ + Ba(NO₃)₂', '生成白色AgCl沉淀'),
  E('fecl3', 'naoh', '复分解反应', 'FeCl₃ + 3NaOH = Fe(OH)₃↓ + 3NaCl', '生成红褐色Fe(OH)₃沉淀'),
  E('cuso4', 'naoh', '复分解反应', 'CuSO₄ + 2NaOH = Cu(OH)₂↓ + Na₂SO₄', '生成蓝色絮状Cu(OH)₂沉淀'),
  E('fecl2', 'naoh', '复分解反应', 'FeCl₂ + 2NaOH = Fe(OH)₂↓ + 2NaCl', '白色絮状沉淀迅速变灰绿色，最终变红褐色'),
  E('caoh2', 'nh4cl', '实验室制氨气', '2NH₄Cl + Ca(OH)₂ =△= CaCl₂ + 2NH₃↑ + 2H₂O', '固体加热制氨气的标准方法'),
  E('na2o2', 'so2', '过氧化物的氧化性', 'Na₂O₂ + SO₂ = Na₂SO₄', 'Na₂O₂把SO₂氧化为硫酸钠'),
  E('co2', 'na2co3', '正盐转酸式盐', 'Na₂CO₃ + CO₂ + H₂O = 2NaHCO₃', '向饱和碳酸钠溶液通CO₂会析出NaHCO₃晶体'),
  E('caco3', 'co2', '溶洞形成', 'CaCO₃ + CO₂ + H₂O = Ca(HCO₃)₂', '石灰岩被含CO₂的流水溶解，形成喀斯特地貌'),
  E('nahco3', 'naoh', '酸式盐与碱', 'NaHCO₃ + NaOH = Na₂CO₃ + H₂O', '酸式盐继续与碱反应生成正盐'),
  E('h2so4', 'nacl', '难挥发制易挥发', '2NaCl + H₂SO₄(浓) =△= Na₂SO₄ + 2HCl↑', '实验室制氯化氢气体的原理'),
  E('hno3', 'na2co3', '强酸制弱酸', 'Na₂CO₃ + 2HNO₃ = 2NaNO₃ + H₂O + CO₂↑', '强酸制弱酸，放出二氧化碳'),
  E('h2so4', 'na2co3', '强酸制弱酸', 'Na₂CO₃ + H₂SO₄ = Na₂SO₄ + H₂O + CO₂↑', '强酸制弱酸'),
  E('caco3', 'hno3', '强酸制弱酸', 'CaCO₃ + 2HNO₃ = Ca(NO₃)₂ + H₂O + CO₂↑', '硝酸溶解碳酸钙'),
  E('h2so4', 'nahco3', '强酸制弱酸', '2NaHCO₃ + H₂SO₄ = Na₂SO₄ + 2H₂O + 2CO₂↑', '泡沫灭火器的反应原理之一'),
  E('hno3', 'nahco3', '强酸制弱酸', 'NaHCO₃ + HNO₃ = NaNO₃ + H₂O + CO₂↑', '强酸制弱酸'),
  E('na2o2', 'hcl', '过氧化物与酸', '2Na₂O₂ + 4HCl = 4NaCl + 2H₂O + O₂↑', '先与水反应生成NaOH和O₂，再被酸中和'),

  // ===== v2.0 扩充：金属与置换 =====
  E('al', 'hcl', '金属与酸置换', '2Al + 6HCl = 2AlCl₃ + 3H₂↑', '铝在氢之前，可与盐酸反应放氢气'),
  E('al', 'naoh', '铝的两性', '2Al + 2NaOH + 2H₂O = 2NaAlO₂ + 3H₂↑', '铝既能与酸又能与强碱反应放出氢气'),
  E('co2', 'mg', '镁在CO₂中燃烧', '2Mg + CO₂ =点燃= 2MgO + C', 'CO₂不能扑灭活泼金属的火灾'),
  E('fe', 'fecl3', '归中反应', '2FeCl₃ + Fe = 3FeCl₂', 'Fe把Fe³⁺还原为Fe²⁺，配制FeCl₂溶液加铁钉防氧化'),
  E('cuso4', 'zn', '金属置换', 'Zn + CuSO₄ = ZnSO₄ + Cu', '铜锌原电池的总反应'),
  E('hcl', 'zn', '金属与酸置换', 'Zn + 2HCl = ZnCl₂ + H₂↑', '锌与盐酸快速放氢'),
  E('ca', 'hcl', '金属与酸置换', 'Ca + 2HCl = CaCl₂ + H₂↑', '钙非常活泼，与酸剧烈反应'),
  E('hcl', 'mg', '金属与酸置换', 'Mg + 2HCl = MgCl₂ + H₂↑', '镁与盐酸剧烈反应放氢'),
  E('al', 'cuso4', '金属置换', '2Al + 3CuSO₄ = Al₂(SO₄)₃ + 3Cu', '铝比铜活泼，置换出红色铜'),
  E('cl2', 'mg', '金属与氯气', 'Mg + Cl₂ =点燃= MgCl₂', '镁在氯气中剧烈燃烧'),
  E('cl2', 'na', '金属与氯气', '2Na + Cl₂ =△= 2NaCl', '钠在氯气中燃烧，产生白烟'),
  E('ethanol', 'k', '醇羟基与活泼金属', '2C₂H₅OH + 2K → 2C₂H₅OK + H₂↑', '钾比钠更活泼，与乙醇反应更剧烈'),

  // ===== v2.0 扩充：氧化还原与燃烧 =====
  E('br2', 'fecl2', 'Fe²⁺的还原性', '2FeCl₂ + Br₂ = 2FeCl₃', 'Br₂氧化性强于Fe³⁺，可氧化Fe²⁺'),
  E('br2', 'so2', '氧化还原', 'SO₂ + Br₂ + 2H₂O = H₂SO₄ + 2HBr', 'SO₂使溴水褪色，体现其还原性而非漂白性'),
  E('i2', 'so2', '氧化还原', 'SO₂ + I₂ + 2H₂O = H₂SO₄ + 2HI', '碘量法定量测定SO₂的原理'),
  E('nh3', 'o2', '氨的催化氧化', '4NH₃ + 5O₂ =催化剂/△= 4NO + 6H₂O', '工业制硝酸的第一步反应'),
  E('h2', 'n2', '合成氨', 'N₂ + 3H₂ ⇌ 2NH₃', '高温高压催化剂，可逆反应，工业合成氨'),
  E('n2', 'o2', '氮气与氧气', 'N₂ + O₂ =放电= 2NO', '雷雨发庄稼：雷电固氮的第一步'),
  E('c', 'hno3', '浓硝酸氧化碳', 'C + 4HNO₃(浓) =△= CO₂↑ + 4NO₂↑ + 2H₂O', '浓硝酸体现强氧化性'),
  E('naoh', 'si', '硅与强碱', 'Si + 2NaOH + H₂O = Na₂SiO₃ + 2H₂↑', '硅与强碱溶液反应放氢气'),
  E('c', 'sio2', '工业制粗硅', 'SiO₂ + 2C =高温= Si + 2CO↑', '碳在高温下还原二氧化硅'),
  E('c', 'cao', '制电石', 'CaO + 3C =高温= CaC₂ + CO↑', '电炉中高温反应制取电石'),
  E('ch4', 'o2', '甲烷燃烧', 'CH₄ + 2O₂ =点燃= CO₂ + 2H₂O', '淡蓝色火焰，是最简单的有机物燃烧'),
  E('c2h2', 'o2', '乙炔燃烧', '2C₂H₂ + 5O₂ =点燃= 4CO₂ + 2H₂O', '氧炔焰温度高达3000℃，用于切割焊接金属'),
  E('ethanol', 'o2', '乙醇燃烧', 'C₂H₅OH + 3O₂ =点燃= 2CO₂ + 3H₂O', '酒精灯燃烧，清洁燃料'),
  E('s', 'o2', '硫燃烧', 'S + O₂ =点燃= SO₂', '蓝紫色火焰，生成有刺激性气味的气体'),
  E('caco3', 'sio2', '玻璃工业', 'SiO₂ + CaCO₃ =高温= CaSiO₃ + CO₂↑', '制普通玻璃的主要反应之一'),

  // ===== v2.0 扩充：有机 =====
  E('benzene', 'hno3', '硝化反应', 'C₆H₆ + HNO₃ =浓H₂SO₄/55-60℃= C₆H₅NO₂ + H₂O', '苯环上的氢被硝基取代，生成硝基苯'),
  E('formic', 'naoh', '酸碱中和', 'HCOOH + NaOH → HCOONa + H₂O', '甲酸是最简单的羧酸，与强碱中和'),
  E('acetic', 'caco3', '强酸制弱酸', '2CH₃COOH + CaCO₃ → (CH₃COO)₂Ca + H₂O + CO₂↑', '醋酸除水垢的原理，证明酸性：乙酸>碳酸'),
  E('naoh', 'oil', '皂化反应', '油脂 + 3NaOH =△= 3高级脂肪酸钠 + 甘油', '油脂在碱性条件下的水解——制肥皂'),
  E('c2h4', 'h2', '加成反应', 'CH₂=CH₂ + H₂ =Ni/△= C₂H₆', '碳碳双键催化加氢'),
  E('c2h2', 'h2', '加成反应', 'CH≡CH + H₂ =Ni/△= CH₂=CH₂', '控制条件可使乙炔加氢停留在乙烯'),
  E('ethanal', 'h2', '醛的还原', 'CH₃CHO + H₂ =Ni/△= C₂H₅OH', '醛基加氢还原为伯醇，属于加成反应'),
  E('cuoh2', 'formic', '醛基检验', 'HCOOH + 2Cu(OH)₂ =△= Cu₂O↓ + CO₂ + 3H₂O', '甲酸含醛基，加热生成砖红色沉淀'),

  // ===== v2.3 扩充：无机 =====
  E('hcl', 'koh', '酸碱中和', 'HCl + KOH = KCl + H₂O', '强酸强碱中和，实质是 H⁺ + OH⁻ = H₂O'),
  E('h2so4', 'koh', '酸碱中和', 'H₂SO₄ + 2KOH = K₂SO₄ + 2H₂O', '强酸强碱中和，注意配平'),
  E('co2', 'koh', '酸性氧化物与碱', 'CO₂ + 2KOH = K₂CO₃ + H₂O', '碱溶液吸收CO₂，与NaOH吸收原理相同'),
  E('aloh3', 'koh', '两性氢氧化物', 'Al(OH)₃ + KOH = KAlO₂ + 2H₂O', 'Al(OH)₃显酸性，可溶于强碱溶液'),
  E('hbr', 'naoh', '酸碱中和', 'HBr + NaOH = NaBr + H₂O', '强酸强碱中和'),
  E('agno3', 'hbr', '溴离子检验', 'AgNO₃ + HBr = AgBr↓ + HNO₃', '淡黄色AgBr沉淀——检验Br⁻'),
  E('cl2', 'hbr', '氧化还原', 'Cl₂ + 2HBr = Br₂ + 2HCl', 'Cl₂氧化性强于Br₂，可置换出溴单质'),
  E('mgo', 'h2so4', '碱性氧化物与酸', 'MgO + H₂SO₄ = MgSO₄ + H₂O', '碱性氧化物与酸反应生成盐和水'),
  E('hcl', 'mgo', '碱性氧化物与酸', 'MgO + 2HCl = MgCl₂ + H₂O', '碱性氧化物与酸反应生成盐和水'),
  E('naoh', 'so3', '酸性氧化物与碱', 'SO₃ + 2NaOH = Na₂SO₃ + H₂O', 'SO₃是硫的+6价酸性氧化物'),
  E('caoh2', 'so3', '酸性氧化物与碱', 'SO₃ + Ca(OH)₂ = CaSO₄ + H₂O', '生成硫酸钙，可用于吸收SO₃'),
  E('fe3o4', 'hcl', '复杂氧化物与酸', 'Fe₃O₄ + 8HCl = FeCl₂ + 2FeCl₃ + 4H₂O', 'Fe₃O₄中同时含+2价和+3价铁'),
  E('fe3o4', 'h2', '金属氧化物的还原', 'Fe₃O₄ + 4H₂ =高温= 3Fe + 4H₂O', 'H₂还原四氧化三铁得到铁'),
  E('alcl3', 'naoh', '复分解反应', 'AlCl₃ + 3NaOH = Al(OH)₃↓ + 3NaCl', '白色胶状沉淀，NaOH过量时沉淀溶解'),
  E('agno3', 'alcl3', '氯离子检验', '3AgNO₃ + AlCl₃ = 3AgCl↓ + Al(NO₃)₃', '白色AgCl沉淀，不溶于稀硝酸'),
  E('feso4', 'naoh', '复分解反应', 'FeSO₄ + 2NaOH = Fe(OH)₂↓ + Na₂SO₄', '白色絮状沉淀，迅速变灰绿色、最终红褐色'),
  E('feso4', 'zn', '金属置换', 'Zn + FeSO₄ = ZnSO₄ + Fe', 'Zn比Fe活泼，可置换出铁'),
  E('cl2', 'feso4', '氧化还原', '6FeSO₄ + 3Cl₂ = 2Fe₂(SO₄)₃ + 2FeCl₃', 'Fe²⁺被Cl₂氧化为Fe³⁺，溶液由浅绿变黄'),
  E('hcl', 'kclo3', '氯酸钾制氯气', 'KClO₃ + 6HCl = KCl + 3Cl₂↑ + 3H₂O', '利用KClO₃的强氧化性制取氯气'),
  E('o2', 'p4', '磷的燃烧', '4P + 5O₂ =点燃= 2P₂O₅', '产生大量白烟；白磷着火点低，需保存在水中'),
  E('cl2', 'p4', '磷与氯气', '2P + 5Cl₂ =点燃= 2PCl₅', '剧烈燃烧生成白色固体，产生白烟'),
  E('cus', 'o2', '硫化铜焙烧', '2CuS + 3O₂ =高温= 2CuO + 2SO₂', '工业炼铜的重要步骤，注意SO₂尾气处理'),

  // ===== v2.3 扩充：有机 =====
  E('c3h8', 'cl2', '取代反应', 'C₃H₈ + Cl₂ =光照= C₃H₇Cl + HCl', '烷烃光照下发生取代，产物为多种氯代物的混合物'),
  E('c3h8', 'o2', '燃烧反应', 'C₃H₈ + 5O₂ =点燃= 3CO₂ + 4H₂O', '气态烃完全燃烧，火焰明亮'),
  E('ch3cl', 'naoh', '卤代烃水解', 'CH₃Cl + NaOH =H₂O/△= CH₃OH + NaCl', 'NaOH水溶液中发生取代反应生成甲醇'),
  E('methanol', 'o2', '催化氧化', '2CH₃OH + O₂ =Cu/△= 2HCHO + 2H₂O', '甲醇在Cu催化下氧化为甲醛'),
  E('methanol', 'na', '醇羟基与钠', '2CH₃OH + 2Na → 2CH₃ONa + H₂↑', '羟基氢被置换，反应比钠与水缓和'),
  E('glycerol', 'hno3', '酯化反应', 'C₃H₅(OH)₃ + 3HNO₃ =浓硫酸/△= C₃H₅(ONO₂)₃ + 3H₂O', '生成硝化甘油——多元醇的酯化反应'),
  E('cuoh2', 'glycerol', '多元醇检验', '甘油 + Cu(OH)₂ → 绛蓝色甘油铜', '甘油与新制Cu(OH)₂生成绛蓝色溶液——检验多元醇'),
  E('benzoic', 'naoh', '酸碱中和', 'C₆H₅COOH + NaOH = C₆H₅COONa + H₂O', '苯甲酸是弱酸，与强碱中和'),
  E('benzoic', 'na2co3', '酸性强弱比较', '2C₆H₅COOH + Na₂CO₃ = 2C₆H₅COONa + H₂O + CO₂↑', '苯甲酸酸性强于碳酸，可使碳酸盐放出CO₂'),
  E('benzoic', 'ethanol', '酯化反应', 'C₆H₅COOH + C₂H₅OH ⇌ C₆H₅COOC₂H₅ + H₂O', '浓硫酸催化加热制苯甲酸乙酯，可逆反应'),
  E('methylacetate', 'naoh', '酯的水解', 'CH₃COOCH₃ + NaOH =△= CH₃COONa + CH₃OH', '碱性条件下酯水解较彻底'),
  E('fructose', 'tollens', '银镜反应', '果糖 + 2[Ag(NH₃)₂]OH =△= ... + 2Ag↓', '果糖是还原糖，在碱性条件下异构化后发生银镜反应'),
  E('cuoh2', 'fructose', '还原糖检验', '果糖 + 2Cu(OH)₂ =△= ... + Cu₂O↓', '砖红色沉淀——检验还原糖'),
  E('h2so4', 'cellulose', '脱水炭化', '纤维素 --浓H₂SO₄--> 碳 + H₂O（脱水炭化）', '浓硫酸使纸张（纤维素）脱水变黑，体现脱水性')
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
  T('na2co3', 'phenol', '苯酚酸性比碳酸弱，只能与Na₂CO₃生成NaHCO₃，高中阶段不视为有效反应'),
  T('naoh', 'nh3', 'NaOH与NH₃都是碱性物质，二者不反应'),
  T('h2co3', 'nacl', '碳酸是弱酸，不能与NaCl反应——弱酸不能制强酸'),
  T('fecl2', 'i2', 'I₂的氧化性弱于Fe³⁺，不能把Fe²⁺氧化为Fe³⁺（逆反应2FeCl₃+2KI却可以）'),
  T('hcl', 'h2so4', '盐酸与硫酸都是酸，二者不发生化学反应'),
  T('nacl', 'na2co3', '两者都是可溶性钠盐，混合后无沉淀、气体或水生成，不满足复分解反应条件'),
  T('cus', 'hcl', 'CuS是极难溶的黑色沉淀，不溶于稀盐酸（不能用盐酸溶解CuS）'),
  T('benzoic', 'tollens', '苯甲酸分子中没有醛基，不能发生银镜反应'),
  T('br2water', 'fructose', '果糖是多羟基酮，溴水只氧化醛糖，不能使果糖氧化褪色（可用银氨溶液或新制Cu(OH)₂检验）')
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
  }
];

/**
 * 判定应答牌 resp 能否接住先出牌 lead
 * @returns {{valid:boolean, name?:string, eq?:string, expl:string, multiplier?:number, kind?:string}}
 */
// 离子相互作用类型展示名
const ION_KIND_NAMES = {
  precipitate: '离子反应·生成沉淀',
  gas: '离子反应·生成气体',
  water: '离子反应·生成水/弱电解质',
  redox: '离子氧化还原'
};

export function matchCards(lead, resp) {
  const key = pairKey(lead.id, resp.id);

  // ① 特征方程式库（精准配对）
  const db = EQUATIONS[key];
  if (db) {
    return { valid: true, name: db.name, eq: db.eq, expl: db.expl, multiplier: 2, kind: 'specific' };
  }

  // ② 离子专属判定：双方均为离子卡时走离子相互作用体系（与物质卡体系互不通用）
  if (lead.ctype === 'ion' && resp.ctype === 'ion') {
    // 显式登记的作用优先（含 HCO₃⁻ + OH⁻ 这类同号但能发生酸碱反应的例外）
    const it = ION_INTERACTIONS[key];
    if (it) {
      return { valid: true, name: ION_KIND_NAMES[it.kind], eq: it.eq, expl: it.expl, multiplier: 2, kind: 'specific' };
    }
    if (lead.ionKind === resp.ionKind) {
      return { valid: false, expl: `${lead.name}与${resp.name}同为${lead.ionKind === 'cation' ? '阳' : '阴'}离子，相互排斥，可大量共存，不发生反应` };
    }
    return { valid: false, expl: `${lead.name}与${resp.name}混合：无沉淀、气体或弱电解质生成，可大量共存，不反应` };
  }

  // ③ 通用规律
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
  return { valid: false, expl: `${resp.name}与${lead.name}之间没有典型的化学反应关系` };
}

/** 筛出手牌中所有能接住 lead 的牌（供 AI 与提示高亮使用） */
export function validResponses(hand, lead) {
  return hand.filter(card => matchCards(lead, card).valid);
}

/**
 * 组合技判定：给定一组卡牌（通常为赢家剩余手牌 + 刚打出的应答牌），
 * 若集齐某组合的全部离子，返回该组合定义，否则返回 null
 */
export function findCombo(cards) {
  const ids = new Set(cards.map(c => c.id));
  return ION_COMBOS.find(cb => cb.ions.every(id => ids.has(id))) || null;
}

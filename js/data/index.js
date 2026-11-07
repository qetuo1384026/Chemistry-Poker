// 数据总入口：汇总知识模块、专题树与全部卡牌
import { INORGANIC_MODULE, INORGANIC_CARDS } from './inorganic.js';
import { ORGANIC_MODULE, ORGANIC_CARDS } from './organic.js';
import { ION_MODULE, ION_CARDS } from './ions.js';

export const MODULES = [INORGANIC_MODULE, ORGANIC_MODULE, ION_MODULE];
export const ALL_CARDS = [...INORGANIC_CARDS, ...ORGANIC_CARDS, ...ION_CARDS];

// topicId -> { topic, moduleId, moduleTitle }
export const TOPIC_INFO = {};
for (const mod of MODULES) {
  for (const topic of mod.topics) {
    TOPIC_INFO[topic.id] = { topic, moduleId: mod.id, moduleTitle: mod.title };
  }
}

export function topicName(topicId) {
  return TOPIC_INFO[topicId] ? TOPIC_INFO[topicId].topic.name : topicId;
}

// 按所选专题筛选卡牌
export function cardsByTopics(topicIds) {
  const set = new Set(topicIds);
  return ALL_CARDS.filter(card => set.has(card.topic));
}

// 独立设置页：音频、动效、对局默认参数、玩家昵称与恢复默认
import { getSettings, saveSettings, resetSettings } from '../core/settings.js';
import { playSfx } from '../core/sfx.js';

export function renderSettings(container, { onChange } = {}) {
  const sfx = container.querySelector('#set-sfx');
  const volume = container.querySelector('#set-volume');
  const volumeValue = container.querySelector('#set-volume-value');
  const motion = container.querySelector('#set-motion');
  const handSize = container.querySelector('#set-hand-size');
  const difficulty = container.querySelector('#set-difficulty');
  const hints = container.querySelector('#set-hints');
  const nickname = container.querySelector('#set-nickname');
  const savedTip = container.querySelector('#settings-saved');

  let tipTimer = null;

  function flashSaved(text = '已保存') {
    savedTip.textContent = text;
    savedTip.classList.add('show');
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      savedTip.classList.remove('show');
      savedTip.textContent = '';
    }, 1800);
  }

  function syncFromSettings() {
    const s = getSettings();
    sfx.checked = s.sfx;
    volume.value = String(s.volume);
    volumeValue.textContent = `${s.volume}%`;
    motion.value = s.motion;
    handSize.value = String(s.handSize);
    difficulty.value = s.difficulty;
    hints.checked = s.showHints;
    nickname.value = s.nickname;
  }

  function commit(patch, { silent = false } = {}) {
    const s = saveSettings(patch);
    if (onChange) onChange(s);
    if (!silent) flashSaved();
    return s;
  }

  sfx.addEventListener('change', () => commit({ sfx: sfx.checked }));
  volume.addEventListener('input', () => {
    volumeValue.textContent = `${volume.value}%`;
    commit({ volume: Number(volume.value) }, { silent: true });
  });
  volume.addEventListener('change', () => flashSaved());
  motion.addEventListener('change', () => commit({ motion: motion.value }));
  handSize.addEventListener('change', () => commit({ handSize: Number(handSize.value) }));
  difficulty.addEventListener('change', () => commit({ difficulty: difficulty.value }));
  hints.addEventListener('change', () => commit({ showHints: hints.checked }));
  nickname.addEventListener('change', () => {
    const s = commit({ nickname: nickname.value });
    nickname.value = s.nickname; // 回显规范化后的昵称（去空格 / 截断）
  });

  container.querySelector('#btn-sfx-test').addEventListener('click', () => {
    if (!getSettings().sfx) {
      flashSaved('请先开启音效');
      return;
    }
    playSfx('win');
  });

  container.querySelector('#btn-settings-reset').addEventListener('click', () => {
    resetSettings();
    syncFromSettings();
    if (onChange) onChange(getSettings());
    flashSaved('已恢复默认设置');
    playSfx('click');
  });

  syncFromSettings();
  return { syncFromSettings };
}

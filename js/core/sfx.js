// 轻量音效：用 WebAudio 合成短音，音量与开关取自设置
import { getSettings } from './settings.js';

let ctx = null;

function audioContext() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// [频率, 时长, 相对振幅]
const TONES = {
  click: [[620, 0.05, 0.22]],
  play: [[680, 0.09, 0.3]],
  win: [[784, 0.1, 0.32], [1046, 0.16, 0.36]],
  lose: [[392, 0.11, 0.28], [294, 0.18, 0.3]]
};

export function playSfx(kind) {
  const { sfx, volume } = getSettings();
  if (!sfx || volume <= 0) return;
  const ac = audioContext();
  if (!ac) return;

  const tones = TONES[kind] || TONES.click;
  const scale = (volume / 100) * 0.4;
  let offset = 0;

  for (const [freq, duration, amp] of tones) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const start = ac.currentTime + offset;
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(amp * scale, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
    offset += duration * 0.85;
  }
}

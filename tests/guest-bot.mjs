// 联机测试用：自动加入指定房间并按策略对弈的"客人"机器人
// 用法：node tests/guest-bot.mjs <房间号>
import { WebSocket } from 'ws';

const code = process.argv[2];
if (!code) { console.error('用法: node guest-bot.mjs <房间号>'); process.exit(1); }

const URL = 'ws://127.0.0.1:8080';
const ws = new WebSocket(URL);

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'join', code, name: '机器人' }));
});

let state = null;
ws.on('message', (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.type === 'state') {
    state = msg.state;
    act();
  } else if (msg.type === 'roomUpdate') {
    console.log('房间更新:', msg.players.map(p => p.name).join(' vs '));
  } else if (msg.type === 'error') {
    console.log('错误:', msg.message);
  } else if (msg.type === 'opponentLeft') {
    console.log('对手断开');
  }
});

function act() {
  if (!state || state.isOver) return;
  const myLead = state.phase === 'lead' && state.leader === 'player';
  const myResp = state.phase === 'respond' && state.defender === 'player';
  if (myLead) {
    const card = state.players.player.hand[0];
    if (card) {
      console.log(`机器人先手: ${card.name}`);
      ws.send(JSON.stringify({ type: 'playLead', cardId: card.id }));
    }
  } else if (myResp) {
    const card = state.players.player.hand[0] || null;
    console.log(`机器人应答: ${card ? card.name : '放弃'}`);
    ws.send(JSON.stringify({ type: 'playRespond', cardId: card ? card.id : null }));
  }
}

ws.on('close', () => { console.log('连接关闭'); process.exit(0); });
ws.on('error', (e) => { console.error('连接错误:', e.message); process.exit(1); });

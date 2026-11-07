import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
};

// 自定义域名（默认 www.chemistry-poker.cn，需在 hosts 中映射到 127.0.0.1）
const DOMAIN = process.env.CHEMISTRY_POKER_DOMAIN || 'www.chemistry-poker.cn';

// 支持 --port=8080 指定单端口；默认同时监听 80（域名访问）与 8080（IP 备用）
const args = process.argv.slice(2).filter(arg => arg.startsWith('--'));
const portArg = args.find(arg => arg.startsWith('--port='));
const ports = portArg ? [Number(portArg.split('=')[1]) || 8080] : [80, 8080];

async function handler(req, res) {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (p === '/') p = '/index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': (mime[extname(file)] || 'application/octet-stream') + '; charset=utf-8'
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

function listen(port) {
  return new Promise(resolve => {
    const server = createServer(handler);
    server.on('error', err => {
      console.warn(`端口 ${port} 不可用（${err.code}），已跳过该端口`);
      resolve(null);
    });
    server.listen(port, () => resolve(server));
  });
}

const started = (await Promise.all(ports.map(listen))).filter(Boolean);

if (started.length === 0) {
  console.error('所有端口均不可用，服务器启动失败');
  process.exit(1);
}

const lines = started.map(server => {
  const { port } = server.address();
  return port === 80
    ? `  http://${DOMAIN}（自定义域名，需要 hosts 映射到 127.0.0.1）\n  http://localhost（本机直连）`
    : `  http://127.0.0.1:${port}（IP:端口 备用方式）\n  http://${DOMAIN}:${port}（域名 + 端口，无需占用 80 端口）`;
});
console.log(`化学扑克已启动:\n${lines.join('\n')}`);

// A static server for the demo and its tests: the repo's files on http://127.0.0.1:4002/ (demo at /demo/).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT ?? 4002);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

createServer(async (req, res) => {
	const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
	const file = normalize(join(root, path === '/' ? '/demo/index.html' : path.endsWith('/') ? path + 'index.html' : path));
	if (!file.startsWith(root)) {
		res.writeHead(403).end();
		return;
	}
	try {
		const body = await readFile(file);
		res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
	} catch {
		res.writeHead(404).end('not found');
	}
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/demo/`));

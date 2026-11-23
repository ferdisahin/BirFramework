import { Application, Route, defaultViewEngine } from '../../dist/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

defaultViewEngine.setViewsDir(resolve(__dirname, 'views'));

const app = new Application({
  port: 8101,
});

// JSON Benchmark route
Route.get('/api/bench', (ctx) => {
  return ctx.json({
    message: 'Hello World from BirJS Benchmark',
    framework: 'BirJS',
    timestamp: Date.now(),
  });
});

// Server-rendered Blade View
Route.get('/', (ctx) => {
  return ctx.render('bench', {
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
      { id: 3, name: 'Charlie', email: 'charlie@example.com' },
    ],
  });
});

app.listen(8101, () => {
  console.log('[BirJS] Benchmark server listening on http://127.0.0.1:8101');
});

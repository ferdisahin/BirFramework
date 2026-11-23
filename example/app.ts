import { Application, Route, logger, type Context } from '../src/index.js';

export const app = new Application();

// Global Logger middleware
app.use(logger());

// 1. Welcome Route
Route.get('/', (ctx) => {
  return ctx.json({
    framework: 'BirFramework ⚡',
    message: 'Laravel DX meets Modern TypeScript & Speed.',
    version: '0.1.0',
    status: 'active'
  });
}).name('home');

// 2. Parameterized Route
Route.get('/users/:id', (ctx) => {
  return ctx.json({
    userId: ctx.params.id,
    query: ctx.query
  });
}).name('users.show');

// 3. AI / LLM & Event-Stream Route (Built-in SSE Streaming)
Route.get('/ai/stream', (ctx) => {
  return ctx.stream(async (send) => {
    send('data: {"token": "Hello"}\n\n');
    await new Promise((r) => setTimeout(r, 50));
    send('data: {"token": "BirFramework"}\n\n');
    await new Promise((r) => setTimeout(r, 50));
    send('data: {"token": "is ready!"}\n\n');
  });
}).name('ai.stream');

// 4. Route Grouping (Laravel-Style Grouping)
Route.group({ prefix: '/api/v1', name: 'api' }, () => {
  Route.get('/status', (ctx) => ctx.json({ status: 'healthy', uptime: process.uptime() })).name('status');
  
  Route.post('/echo', async (ctx) => {
    const body = await ctx.body();
    return ctx.json({ received: body });
  }).name('echo');
});

// 5. Resource Controller
class PostController {
  index(ctx: Context) {
    return ctx.json([
      { id: 1, title: 'Introduction to BirFramework' },
      { id: 2, title: 'The Next Standard for Full-Stack TypeScript' }
    ]);
  }

  show(ctx: Context) {
    return ctx.json({ id: ctx.params.id, title: `Post #${ctx.params.id}` });
  }

  async store(ctx: Context) {
    const body = await ctx.body();
    return ctx.json({ message: 'Post created', post: body }, 201);
  }
}

Route.resource('/posts', new PostController());

export default app;

// Only listen if executed directly
if (process.argv[1]?.endsWith('example/app.ts')) {
  const PORT = Number(process.env.PORT) || 3001;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BirFramework server ready at http://localhost:${PORT}`);
  });
}

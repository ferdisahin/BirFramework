import Fastify from 'fastify';

const fastify = Fastify({ logger: false });

fastify.get('/api/bench', async () => {
  return {
    message: 'Hello World from Fastify Benchmark',
    framework: 'Fastify',
    timestamp: Date.now(),
  };
});

fastify.get('/', async (req, reply) => {
  const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com' },
  ];

  reply.type('text/html').send(`
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Fastify SSR Benchmark</title></head>
<body>
  <h1>Welcome to Fastify SSR</h1>
  <ul>
    ${users.map(u => `<li>${u.name} (${u.email})</li>`).join('\n')}
  </ul>
</body>
</html>
  `.trim());
});

await fastify.listen({ port: 8105, host: '127.0.0.1' });
console.log('[Fastify] Listening on http://127.0.0.1:8105');

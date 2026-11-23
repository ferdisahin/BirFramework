import express from 'express';

const app = express();

app.get('/api/bench', (req, res) => {
  res.json({
    message: 'Hello World from Express Benchmark',
    framework: 'Express',
    timestamp: Date.now(),
  });
});

app.get('/', (req, res) => {
  const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com' },
  ];

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Express SSR Benchmark</title></head>
<body>
  <h1>Welcome to Express SSR</h1>
  <ul>
    ${users.map(u => `<li>${u.name} (${u.email})</li>`).join('\n')}
  </ul>
</body>
</html>
  `.trim());
});

app.listen(8106, '127.0.0.1', () => {
  console.log('[Express] Listening on http://127.0.0.1:8106');
});

import type { Router } from '../../router/router.js';

export function listRoutes(router: Router) {
  const routes = router.getRoutes();

  if (routes.length === 0) {
    console.log('\x1b[33mNo routes registered.\x1b[0m');
    return;
  }

  console.log('\n\x1b[1m\x1b[36m┌─── BirFramework Route List ────────────────────────────────────────────────────────┐\x1b[0m');

  const rows = routes.map((r) => {
    let methodColor = '\x1b[32m'; // GET: green
    if (r.method === 'POST') methodColor = '\x1b[34m'; // blue
    if (r.method === 'PUT' || r.method === 'PATCH') methodColor = '\x1b[33m'; // yellow
    if (r.method === 'DELETE') methodColor = '\x1b[31m'; // red

    const method = `${methodColor}${r.method.padEnd(7)}\x1b[0m`;
    const path = r.path.padEnd(30);
    const name = (r.nameStr || '-').padEnd(20);
    const middlewareCount = `${r.middlewares.length} middleware`;

    return `│ ${method} ${path} ${name} ${middlewareCount}`;
  });

  console.log(rows.join('\n'));
  console.log('\x1b[1m\x1b[36m└───────────────────────────────────────────────────────────────────────────────────────┘\x1b[0m');
  console.log(`\x1b[90mTotal ${routes.length} routes found.\x1b[0m\n`);
}

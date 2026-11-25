import { Application, Router } from 'birframework';

const router = new Router();

router.get('/', (ctx) => ctx.html(
  '<!doctype html><html lang="en"><title>BirFramework on Vercel</title><h1>BirFramework on Vercel</h1><a href="/api/health">Health check</a></html>'
));
router.get('/api/health', (ctx) => ctx.json({ status: 'ok' }));

const app = new Application({ router });
export default app.serverless();

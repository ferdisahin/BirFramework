# BirFramework

[![npm version](https://img.shields.io/npm/v/birframework.svg)](https://www.npmjs.com/package/birframework)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-ferdisahin%2FBirFramework-black.svg)](https://github.com/ferdisahin/BirFramework)

BirFramework is a full-stack web framework for Node.js and TypeScript. It brings Laravel's architectural ergonomics into a persistent-memory TypeScript runtime paired with Unified Preact + Inertia + SSR, ActiveRecord ORM, background queues, and zero-config Vercel Serverless support.

## Design Philosophy

Most TypeScript web applications require assembling and maintaining separate libraries for routing, validation, ORM, authentication, sessions, queue workers, and frontend SSR. BirFramework unifies these primitives into a single dependency tree:

- **Unified Developer Experience**: Expressive routing, controller scaffolding, validation, database migrations, and background workers following consistent conventions.
- **Persistent Runtime Performance**: Built for Node.js 22+ with a registration-order router, zero cold-boot overhead per request, and built-in Brotli/Gzip compression.
- **Unified Preact + Inertia + SSR**: Persistent `.tsx` layouts (`Page.layout`), `useForm()` with `FormData` uploads, server-rendered `<Head>` SEO metadata, and SPA-speed transitions over `X-Bir-Inertia`.
- **Serverless Ready**: Export `app.serverless()` or scaffold `vercel.json` + `api/index.js` with `bir make:vercel` for immediate deployment.

## Core Features

- **HTTP Engine & Routing**: Radix-tree parameterized routing (`:id`, `{id}`), nested route groups with prefixes and middlewares, resource controllers, SSE streaming, and HTTP `206 Partial Content` Range streaming via `ctx.fileStream()`.
- **Unified Preact + Inertia + SSR**: Server-side layout and SEO `<Head>` rendering paired with Vite + Preact client hydration and automatic client-side fallback in Node serverless runtimes.
- **Database & ActiveRecord ORM**: Multi-driver support for native SQLite (`node:sqlite`), PostgreSQL, and MySQL. Includes `Model` relationships (`hasMany`, `belongsTo`), ACID transactions, pessimistic `.forUpdate()` row locks, schema migrations, seeders, and factories.
- **Authentication & Persistent Sessions**: Scrypt password hashing, HMAC-SHA256 signed cookies, `Memory`, `FileSessionStore`, and `DatabaseSessionStore` drivers, Personal Access Tokens (Bearer auth), CSRF protection, and rate limiting.
- **Request Validation**: Declarative validation rules (`required`, `email`, `numeric`, `unique`, `confirmed`) with automatic 422 JSON/Inertia error hydration.
- **Queues, Scheduler & WebSockets**: Background job workers with retries, cron task scheduling with cross-process `withoutOverlapping()` file locks, and native WebSocket channels.
- **Compression & Static Serving**: Built-in `compress()` (Brotli/Gzip), `serveStatic()` with ETag and path-traversal protection, and default security headers.
- **Artisan-Style CLI (`bir`)**: Multi-process dev dashboard (`bir dev`), code generators (`make:*`), migrations, queue workers, log tailing (`bir pail`), and Vercel scaffolding (`bir make:vercel`).

## Installation & Quick Start

### 1. Scaffold a New Project

```bash
npx birframework new my-app
```

Headless flags are also supported:

```bash
# TypeScript + Tailwind CSS v4 + Preact + Inertia + Vite
npx birframework new my-app --ts --tailwind --jsx

# JavaScript (ESM) with Pure CSS
npx birframework new my-app --js --css
```

### 2. Project Structure

```
my-app/
├── api/
│   └── index.js          # Vercel Serverless entrypoint (app.serverless())
├── app/
│   ├── controllers/      # Application controllers
│   ├── middlewares/      # HTTP middlewares
│   └── models/           # ActiveRecord ORM models
├── public/               # Public static assets and Vite build output
├── resources/
│   ├── css/app.css       # Tailwind CSS v4 entry
│   └── js/app.tsx        # Preact + Inertia client entry
├── routes/
│   └── web.ts            # Route definitions
├── views/
│   ├── layouts/          # Persistent TSX layouts
│   └── pages/            # Inertia TSX pages
├── app.ts                # HTTP server entry point
├── package.json
├── tsconfig.json
└── vercel.json
```

### 3. Application Entry Point

```typescript
import { Application, Route, compress, serveStatic, Inertia, logger, type Context } from 'birframework';

const app = new Application();
app.use(compress({ threshold: 512 }));
app.use(serveStatic({ publicDir: 'public' }));
app.use(Inertia.middleware());

if (process.env.NODE_ENV !== 'production') {
  app.use(logger());
}

Route.get('/', (ctx: Context) => {
  return ctx.inertia('Welcome', { version: '0.5.27' }, {
    title: 'My BirJS App',
  });
});

Route.get('/api/health', (ctx: Context) => {
  return ctx.json({ status: 'ok', uptime: process.uptime() });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', (port) => {
  console.log(`Application running on http://localhost:${port || PORT}`);
});
```

### 4. Running the Development Server

```bash
cd my-app
npm install
npm run dev
```

## Deploying to Vercel

Projects created with `npx birframework new` include `vercel.json` and `api/index.js` out of the box. To add or regenerate Vercel Serverless configuration in an existing project:

```bash
npx bir make:vercel
```

This configures `api/index.js` with `compress()`, `serveStatic({ publicDir: 'public' })`, `Inertia.middleware()`, and `export default app.serverless()`. Set a random `APP_KEY` in your Vercel Environment Variables for production deployments.

## CLI Reference

```bash
# Project Management & Dev
npx birframework new <name>     Create a new application
bir dev                         Start Server, Queue, Logs, and Vite dashboard
bir serve                       Start development server with hot-reload
bir route:list                  Display all registered application routes
bir pail                        Stream structured application logs

# Code Generators
bir make:controller <Name>      Generate a Controller class
bir make:middleware <Name>      Generate a Middleware function
bir make:model <Name> [-mc]     Generate a Model (with optional migration/controller)
bir make:migration <name>       Generate a database migration file
bir make:job <Name>             Generate a background Job class
bir make:seeder <Name>          Generate a database Seeder class
bir make:request <Name>         Generate a Form Request validator
bir make:auth                   Generate authentication controllers and views
bir make:vercel                 Generate vercel.json and api/index.js

# Database Operations
bir migrate                     Execute pending database migrations
bir migrate:rollback            Roll back the last migration batch
bir db:seed                     Run database seeders

# Background Processing & Testing
bir queue:work                  Start the background queue worker
bir schedule:work               Start the task scheduler daemon
bir schedule:run                Run due scheduled tasks once
bir test                        Run automated test suites
```

Queue workers run in their own process. Register application job classes in `app/jobs/index.ts` or `app/jobs/index.js` before starting `bir queue:work`.

```typescript
import { Queue } from 'birframework';
import { SendEmailJob } from './SendEmailJob.js';

Queue.register(SendEmailJob);
```

Workers reserve each job while it runs. A job can run again after its reservation expires, so keep handlers idempotent.

## Database & ORM Example

```typescript
import { Model, DB } from 'birframework';

export class Order extends Model {
  static override table = 'orders';
  static override fillable = ['user_id', 'total', 'status'];
}

// Fluent querying
const paidOrders = await Order.where('status', '=', 'paid')
  .orderBy('created_at', 'desc')
  .get();

// Atomic transaction with pessimistic row lock
await DB.transaction(async () => {
  const order = await Order.where('id', '=', 42).forUpdate().first();
  if (!order) throw new Error('Order 42 was not found');
  order.status = 'shipped';
  await order.save();
});
```

## Running Tests

BirFramework uses Node's native test runner:

```bash
npm test
```

## License

BirFramework is open-source software licensed under the [MIT License](LICENSE).

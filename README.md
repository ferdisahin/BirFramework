# BirFramework

[![npm version](https://img.shields.io/npm/v/birframework.svg)](https://www.npmjs.com/package/birframework)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-ferdisahin%2FBirFramework-black.svg)](https://github.com/ferdisahin/BirFramework)

BirFramework is a full-stack web framework for Node.js and TypeScript. It brings Laravel's architectural ergonomics and developer experience into a modern, persistent-memory JavaScript runtime, providing a cohesive set of tools without requiring dozens of disparate dependencies.

## Design Philosophy

Most modern TypeScript web applications require developers to assemble and maintain an ad-hoc stack of libraries for routing, validation, ORM, authentication, queue workers, and templating. BirFramework bundles these foundational components into a unified, type-safe core:

- **Unified Developer Experience**: Expressive routing, controller scaffolding, validation, database migrations, and background workers that follow consistent conventions.
- **Persistent Runtime Performance**: Designed from the ground up for persistent memory runtimes (Node.js 22+ and Bun) with zero cold-boot overhead per request.
- **Server-Driven Interactivity**: A Blade-inspired view engine paired with Instant Turbo, delivering smooth single-page application transitions through DOM morphing without requiring a client-side JavaScript framework.
- **Dual Language Support**: First-class support for strict TypeScript as well as vanilla ECMAScript modules (ESM).

## Core Features

- **HTTP Engine and Routing**: Parameterized route matching (`:id` and `{id}`), nested route grouping with shared prefixes and middlewares, resource controllers, and native Server-Sent Events (SSE) streaming for real-time and LLM workloads.
- **Blade-Style Template Engine**: Component tags (`<x-layouts.app>`), named slots (`<x-slot name="header">`), control structures (`@if`, `@foreach`), and HTML escaping.
- **Instant Turbo Navigation**: Automatic interceptor for link navigation that morphs incoming server HTML into the active document, eliminating hard page reloads and screen flashes.
- **Database and ORM**: Multi-driver database layer supporting native SQLite (`node:sqlite`), PostgreSQL, and MySQL. Includes an Active Record / Eloquent-style model layer with relations (`hasMany`, `belongsTo`), ACID transactions, fluent query builder, schema builders, migrations, and seeders.
- **Authentication and Security**: Scrypt password hashing, HMAC-SHA256 signed session cookies, CSRF protection, and sliding-window rate limiting.
- **Request Validation**: Declarative rule validation (`required`, `email`, `numeric`, `unique`, `confirmed`) with typed sanitization and RFC-compliant error payloads.
- **Queues and Workers**: Asynchronous job dispatching, persistent queue storage, automatic retry attempts, and exponential backoff.
- **Task Scheduling**: Fluent in-process cron daemon supporting minute, hourly, and daily recurring schedules.
- **Storage and Mail**: Multi-disk abstraction (local file storage) and mailable classes with testing fakes.
- **Command Line Interface**: The `bir` CLI manages development servers, code generation, migrations, queue processing, and scheduled tasks.

## Installation and Quick Start

### 1. Scaffold a New Project

You can scaffold a new project using the interactive installer:

```bash
npx bir new my-app
```

The installer will prompt you to select your preferred language and styling:
- **Language**: TypeScript (default) or JavaScript (ESM)
- **Styling**: Tailwind CSS (default) or Pure CSS

Flags can also be supplied to skip interactive prompts:

```bash
# TypeScript with Tailwind CSS
npx bir new my-app --ts --tailwind

# JavaScript with Pure CSS
npx bir new my-app --js --css
```

### 2. Project Structure

A BirFramework project follows standard MVC conventions:

```
my-app/
├── app/
│   ├── controllers/      # Application controllers
│   ├── middlewares/      # HTTP middlewares
│   └── models/           # ORM database models
├── public/               # Public static assets (CSS, images, JS)
├── routes/
│   └── web.ts            # Route definitions
├── views/
│   ├── layouts/          # Base HTML layouts
│   └── welcome.html      # Blade template views
├── package.json
└── tsconfig.json
```

### 3. Application Entry Point

A minimal application entry point (`app.ts`):

```typescript
import { Application, Route, logger, type Context } from 'birframework';

const app = new Application();
app.use(logger());

// Basic JSON Route
Route.get('/', (ctx: Context) => {
  return ctx.json({ status: 'healthy', uptime: process.uptime() });
});

// Route with URL Parameters
Route.get('/users/:id', async (ctx: Context) => {
  return ctx.json({ userId: ctx.params.id, query: ctx.query });
});

// Route Group with Middleware
Route.group({ prefix: '/api/v1' }, () => {
  Route.post('/submit', async (ctx: Context) => {
    const data = await ctx.validate({
      title: 'required|string|min:3',
      email: 'required|email'
    });
    return ctx.json({ saved: true, data });
  });
});

// View Rendering with Instant Turbo Navigation
Route.get('/dashboard', (ctx: Context) => {
  return ctx.render('dashboard', {
    title: 'Dashboard',
    user: { name: 'Alex' }
  });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Application running on http://localhost:${PORT}`);
});
```

### 4. Running the Development Server

Start the application with file watching and auto-reload:

```bash
bir serve
```

## CLI Reference

The framework includes the `bir` binary for managing application tasks:

```bash
# Project Management
bir new <name>                  Create a new application
bir serve                       Start development server with hot-reload
bir route:list                  Display all registered application routes

# Code Generators
bir make:controller <Name>      Generate a new Controller class
bir make:middleware <Name>      Generate a new Middleware function
bir make:model <Name> [-m]      Generate a Model (and optional migration)
bir make:migration <name>       Generate a database migration file
bir make:job <Name>             Generate a background Job class
bir make:seeder <Name>          Generate a database Seeder class
bir auth:scaffold               Generate complete authentication scaffold

# Database Operations
bir migrate                     Execute pending database migrations
bir migrate:rollback            Roll back the last migration batch
bir db:seed                     Run database seeders

# Background Processing
bir queue:work                  Start the background queue worker
bir schedule:work               Start the task scheduler daemon
bir schedule:run                Run due scheduled tasks once
```

## Performance Benchmarks

Independent and empirical side-by-side benchmark conducted on Apple Silicon with fresh default project installations:

| Framework | Requests / Sec (`ab -c 10`) | Mean Latency | 99th Percentile | Architecture |
| :--- | :---: | :---: | :---: | :--- |
| **BirFramework** | **7,899 RPS** 🚀 | **1.26 ms** ⚡ | **4 ms** | Persistent In-Memory V8 |
| **Next.js 16** | 7,097 RPS | 1.40 ms | 4 ms | Node.js + React SSR |
| **Laravel 13** | 300 RPS | 33.38 ms | 71 ms | Traditional Process-per-Request (PHP 8.5) |

*BirFramework delivers ~26x faster response times than traditional process-per-request PHP while matching and exceeding Node.js meta-framework throughput.* For full details, see the [online benchmark documentation](https://birframework.dev/docs/benchmarks).

## Database and ORM Example

```typescript
import { Model, Schema, DB } from 'birframework';

// Model definition
export class User extends Model {
  static override table = 'users';
}

// Fluent querying
const users = await User.where('status', '=', 'active')
  .orderBy('created_at', 'desc')
  .get();

// Transaction execution
await DB.transaction(async (trx) => {
  await trx.table('accounts').where('id', '=', 1).decrement('balance', 100);
  await trx.table('accounts').where('id', '=', 2).increment('balance', 100);
});
```

## Running Tests

BirFramework uses Node's native test runner without third-party test dependencies:

```bash
npm test
```

## License

BirFramework is open-source software licensed under the [MIT License](LICENSE).

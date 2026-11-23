# ⚡ BirFramework

> **Laravel's unmatched developer experience (DX) combined with modern TypeScript speed and 100% end-to-end type safety.**

---

## 🌟 Why BirFramework?

* **Zero-Config, Batteries-Included:** Router, Middleware Pipeline, DI Container, Blade-like View Engine, and CLI scaffolding work out of the box.
* **Expressive & Fluent API:** Laravel's beloved routing, resource controllers, and group ergonomics tailored for TypeScript and JavaScript.
* **Sub-Millisecond Response Times:** Zero cold boot latency per request; designed from scratch for long-running persistent memory runtimes (Node.js & Bun).
* **AI & Realtime Ready:** Native Server-Sent Events (SSE) and LLM Token Streaming built directly into the HTTP context.
* **Artisan-Style Powerful CLI (`bir`):** Generate route tables, controllers, middlewares, and scaffold full projects in one command.
* **Dual-Language Flexibility:** Full first-class support for both **TypeScript** (`--ts`) and **pure JavaScript** (`--js`).

---

## 🚀 Quick Start

### 1. Scaffold a New Project

```bash
# Create a modern TypeScript project with Tailwind CSS (Default)
./bin/bir.js new my-app

# Or choose Pure CSS
./bin/bir.js new my-app --css

# Or choose Pure JavaScript (ESM)
./bin/bir.js new my-app --js
```

### 2. A Minimal Application (`app.ts` / `app.js`)

```typescript
import { Application, Route, logger, paginate } from 'birframework';

const app = new Application();
app.use(logger());

// 1. Welcome Route
Route.get('/', (ctx) => {
  return ctx.json({ message: 'BirFramework is running! ⚡' });
});

// 2. Route Parameters (:id or {id})
Route.get('/users/:id', (ctx) => {
  return ctx.json({ id: ctx.params.id, query: ctx.query });
});

// 3. AI Token Streaming (SSE)
Route.get('/ai/chat', (ctx) => {
  return ctx.stream(async (send) => {
    send('data: {"token": "Hello"}\n\n');
    send('data: {"token": "World!"}\n\n');
  });
});

// 4. Laravel-Style Route Grouping
Route.group({ prefix: '/api/v1' }, () => {
  Route.post('/echo', async (ctx) => {
    const body = await ctx.body();
    return ctx.json({ received: body });
  });
});

// 5. Views & Pagination
Route.get('/posts', (ctx) => {
  const posts = [{ id: 1, title: 'First Post' }, { id: 2, title: 'Second Post' }];
  const paginated = paginate(posts, { page: ctx.query.page || 1, perPage: 1 });
  
  return ctx.render('welcome', {
    title: 'Featured Posts',
    posts: paginated.data,
    paginationHtml: paginated.links(),
  });
});

app.listen(3000, () => {
  console.log('Server listening on http://localhost:3000');
});
```

---

## 🛠 `bir` CLI Commands

```bash
# Create a new project (Interactive by default, or with flags)
bir new <name> [--ts|--js] [--tailwind|--css]

# Start development server with hot-reload
./bin/bir.js serve

# Display pretty route table (Artisan route:list)
./bin/bir.js route:list

# Scaffold a new Controller
./bin/bir.js make:controller UserController

# Scaffold a new Middleware
./bin/bir.js make:middleware AuthMiddleware
```

---

## 🧪 Running Tests

```bash
npm test
# or
npx tsx --test tests/app.test.ts
```

---

## 📄 License

MIT

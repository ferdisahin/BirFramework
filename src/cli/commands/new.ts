import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export interface NewProjectOptions {
  name: string;
  lang?: 'ts' | 'js';
  css?: 'tailwind' | 'css';
}

async function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(query)).trim();
  } finally {
    rl.close();
  }
}

export async function createNewProject(
  name?: string,
  lang?: 'ts' | 'js',
  css?: 'tailwind' | 'css'
) {
  // 1. Resolve project name
  if (!name && process.stdin.isTTY) {
    name = await askQuestion('\x1b[36m? Enter project name:\x1b[0m ');
  }

  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a project name. E.g.: bir new my-app [--ts|--js] [--tailwind|--css]');
    return;
  }

  const projectDir = resolve(process.cwd(), name);

  if (existsSync(projectDir)) {
    console.error(`\x1b[31m[Error]\x1b[0m Directory "${name}" already exists!`);
    return;
  }

  // 2. Resolve language (TypeScript default)
  if (!lang) {
    if (process.stdin.isTTY) {
      console.log('\n\x1b[1mSelect language:\x1b[0m');
      console.log('  \x1b[32m1)\x1b[0m TypeScript \x1b[90m(Default, Recommended - Strict End-to-End Types)\x1b[0m');
      console.log('  \x1b[32m2)\x1b[0m JavaScript \x1b[90m(Pure ESM)\x1b[0m');
      const langChoice = await askQuestion('\x1b[36mChoose [1-2] (default: 1):\x1b[0m ');
      lang = langChoice === '2' ? 'js' : 'ts';
    } else {
      lang = 'ts';
    }
  }

  // 3. Resolve CSS framework (Tailwind default)
  if (!css) {
    if (process.stdin.isTTY) {
      console.log('\n\x1b[1mSelect styling:\x1b[0m');
      console.log('  \x1b[32m1)\x1b[0m Tailwind CSS \x1b[90m(Default, Recommended - Modern Utility-First)\x1b[0m');
      console.log('  \x1b[32m2)\x1b[0m Pure CSS \x1b[90m(Vanilla CSS without build step or CDN)\x1b[0m');
      const cssChoice = await askQuestion('\x1b[36mChoose [1-2] (default: 1):\x1b[0m ');
      css = cssChoice === '2' ? 'css' : 'tailwind';
    } else {
      css = 'tailwind';
    }
  }

  const isTS = lang === 'ts';
  const isTailwind = css === 'tailwind';
  const ext = isTS ? 'ts' : 'js';

  console.log(`\n\x1b[36m🚀 Creating new BirFramework project: ${name}\x1b[0m`);
  console.log(`\x1b[90m  • Language: ${isTS ? 'TypeScript (Strict)' : 'Pure JavaScript (ESM)'}\x1b[0m`);
  console.log(`\x1b[90m  • Styling:  ${isTailwind ? 'Tailwind CSS (Default)' : 'Pure CSS'}\x1b[0m\n`);

  // Create folder structure (Laravel-style)
  mkdirSync(join(projectDir, 'app/controllers'), { recursive: true });
  mkdirSync(join(projectDir, 'app/models'), { recursive: true });
  mkdirSync(join(projectDir, 'app/middlewares'), { recursive: true });
  mkdirSync(join(projectDir, 'routes'), { recursive: true });
  mkdirSync(join(projectDir, 'views/layouts'), { recursive: true });
  mkdirSync(join(projectDir, 'public/css'), { recursive: true });

  // 1. package.json
  const pkg = {
    name,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: isTS ? 'npx tsx watch app.ts' : 'node --watch app.js',
      start: isTS ? 'npx tsx app.ts' : 'node app.js',
    },
    dependencies: {
      birframework: '^0.1.0',
    },
    devDependencies: isTS
      ? {
          typescript: '^5.7.0',
          '@types/node': '^22.0.0',
          tsx: '^4.19.0',
        }
      : {},
  };
  writeFileSync(join(projectDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

  // 2. tsconfig.json (only if TS)
  if (isTS) {
    const tsconfig = {
      compilerOptions: {
        target: 'ESNext',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
    };
    writeFileSync(join(projectDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2), 'utf-8');
  }

  // 3. routes/web.[ts|js]
  const routesContent = isTS
    ? `import { Route, type Context } from 'birframework';
import { HomeController } from '../app/controllers/HomeController.js';

const homeController = new HomeController();

// Home Page (View render example)
Route.get('/', (ctx: Context) => homeController.index(ctx)).name('home');

// JSON Health API Example
Route.get('/api/health', (ctx: Context) => {
  return ctx.json({ status: 'ok', uptime: process.uptime() });
}).name('api.health');
`
    : `import { Route } from 'birframework';
import { HomeController } from '../app/controllers/HomeController.js';

const homeController = new HomeController();

// Home Page (View render example)
Route.get('/', (ctx) => homeController.index(ctx)).name('home');

// JSON Health API Example
Route.get('/api/health', (ctx) => {
  return ctx.json({ status: 'ok', uptime: process.uptime() });
}).name('api.health');
`;
  writeFileSync(join(projectDir, `routes/web.${ext}`), routesContent, 'utf-8');

  // 4. app/controllers/HomeController.[ts|js]
  const controllerContent = isTS
    ? `import type { Context } from 'birframework';
import { paginate } from 'birframework';

export class HomeController {
  public async index(ctx: Context) {
    const items = [
      { id: 1, title: 'Introduction to BirFramework' },
      { id: 2, title: 'Laravel DX meets Modern TypeScript' },
      { id: 3, title: 'End-to-End Type Safety' },
      { id: 4, title: 'Native AI & SSE Streaming' },
      { id: 5, title: 'Built-in Pagination Support' },
    ];

    const page = ctx.query.page || 1;
    const paginated = paginate(items, { page, perPage: 2, path: '/' });

    return ctx.render('welcome', {
      title: 'Welcome to BirFramework!',
      posts: paginated.data,
      paginationHtml: paginated.links(),
    });
  }
}
`
    : `import { paginate } from 'birframework';

export class HomeController {
  async index(ctx) {
    const items = [
      { id: 1, title: 'Introduction to BirFramework' },
      { id: 2, title: 'Laravel DX meets Modern TypeScript' },
      { id: 3, title: 'End-to-End Type Safety' },
      { id: 4, title: 'Native AI & SSE Streaming' },
      { id: 5, title: 'Built-in Pagination Support' },
    ];

    const page = ctx.query.page || 1;
    const paginated = paginate(items, { page, perPage: 2, path: '/' });

    return ctx.render('welcome', {
      title: 'Welcome to BirFramework!',
      posts: paginated.data,
      paginationHtml: paginated.links(),
    });
  }
}
`;
  writeFileSync(join(projectDir, `app/controllers/HomeController.${ext}`), controllerContent, 'utf-8');

  // 5. public/css/app.css
  const cssFileContent = isTailwind
    ? `/* BirFramework Application Styles */
/* You can add custom utility styles or theme customizations here */
`
    : `:root {
  --bg-color: #0f172a;
  --card-bg: #1e293b;
  --card-border: #334155;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --primary: #38bdf8;
  --primary-hover: #0284c7;
  --badge-bg: rgba(56, 189, 248, 0.15);
  --badge-text: #38bdf8;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-main);
  line-height: 1.6;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.container {
  max-width: 860px;
  width: 100%;
  margin: 2.5rem auto;
  padding: 0 1.5rem;
  flex: 1;
}

.card-main {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

h1 {
  font-size: 2rem;
  color: var(--primary);
  font-weight: 800;
}

p.subtitle {
  color: var(--text-muted);
  font-size: 1.1rem;
  margin-bottom: 2rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.post-item {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--card-border);
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: border-color 0.2s ease;
}

.post-item:hover {
  border-color: var(--primary);
}

.badge {
  background: var(--badge-bg);
  color: var(--badge-text);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: 9999px;
  font-family: monospace;
}

.pagination-wrapper {
  margin-top: 1.5rem;
}

footer {
  border-top: 1px solid var(--card-border);
  text-align: center;
  padding: 1.5rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}
`;
  writeFileSync(join(projectDir, 'public/css/app.css'), cssFileContent, 'utf-8');

  // 6. views/layouts/app.html (Tailwind or Pure CSS)
  const layoutContent = isTailwind
    ? `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen antialiased flex flex-col justify-between">
  <div class="max-w-4xl w-full mx-auto p-6 md:p-10">
    {!! slot !!}
    {!! after !!}
  </div>

  <footer class="border-t border-slate-800 text-center py-6 text-sm text-slate-500">
    ⚡ Built with BirFramework & Tailwind CSS
  </footer>

  {!! bir_scripts() !!}
</body>
</html>
`
    : `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <div class="container">
    {!! slot !!}
    {!! after !!}
  </div>

  <footer>
    ⚡ Built with BirFramework & Pure CSS
  </footer>

  {!! bir_scripts() !!}
</body>
</html>
`;
  writeFileSync(join(projectDir, 'views/layouts/app.html'), layoutContent, 'utf-8');

  // 7. views/welcome.html (Tailwind or Pure CSS)
  const welcomeContent = isTailwind
    ? `<x-layouts.app title="{{ title }}">
  <div class="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-8 backdrop-blur shadow-2xl mb-8">
    <div class="flex items-center gap-3 mb-4">
      <span class="text-3xl">⚡</span>
      <h1 class="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">
        {{ title }}
      </h1>
    </div>
    <p class="text-slate-400 text-lg leading-relaxed mb-6">
      Laravel convenience paired with modern TypeScript speed and Tailwind styling out of the box.
    </p>

    <h3 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
      <span>📌</span> Featured Articles (Paginated)
    </h3>
    <div class="space-y-3">
      @foreach(post in posts)
        <div class="bg-slate-900/60 border border-slate-700/40 p-4 rounded-xl flex items-center justify-between hover:border-sky-500/50 transition">
          <span class="font-medium text-slate-200">{{ post.title }}</span>
          <span class="bg-sky-500/10 text-sky-400 text-xs px-2.5 py-1 rounded-full font-mono font-medium">
            #{{ post.id }}
          </span>
        </div>
      @endforeach
    </div>

    <div class="mt-6">
      {!! paginationHtml !!}
    </div>
  </div>
</x-layouts.app>
`
    : `<x-layouts.app title="{{ title }}">
  <div class="card-main">
    <div class="header-title">
      <span style="font-size: 1.75rem;">⚡</span>
      <h1>{{ title }}</h1>
    </div>
    <p class="subtitle">
      Laravel convenience paired with modern JavaScript/TypeScript speed and Pure CSS.
    </p>

    <h3 class="section-title">📌 Featured Articles (Paginated)</h3>
    <div>
      @foreach(post in posts)
        <div class="post-item">
          <span>{{ post.title }}</span>
          <span class="badge">#{{ post.id }}</span>
        </div>
      @endforeach
    </div>

    <div class="pagination-wrapper">
      {!! paginationHtml !!}
    </div>
  </div>

  <x-slot name="after">
    <div style="margin-top: 1.5rem; text-align: center; color: #64748b; font-size: 0.85rem;">
      ⚡ Built with BirFramework Modern Blade Components & Slots
    </div>
  </x-slot>
</x-layouts.app>
`;
  writeFileSync(join(projectDir, 'views/welcome.html'), welcomeContent, 'utf-8');

  // 8. app.[ts|js] (Entry Point)
  const appContent = `import { Application, logger } from 'birframework';
import './routes/web.js';

const app = new Application();
app.use(logger());

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(\`⚡ BirFramework ready at http://localhost:\${PORT}\`);
});
`;
  writeFileSync(join(projectDir, `app.${ext}`), appContent, 'utf-8');

  console.log(`\x1b[32m✔ Project created successfully!\x1b[0m`);
  console.log(`\nTo get started:\n`);
  console.log(`  cd ${name}`);
  console.log(`  npm install`);
  console.log(`  npm run dev\n`);
}

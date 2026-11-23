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
      birframework: '^0.1.1',
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
  --bg-color: #090d16;
  --card-bg: rgba(15, 23, 42, 0.5);
  --card-border: rgba(51, 65, 85, 0.7);
  --card-hover-border: rgba(56, 189, 248, 0.5);
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --text-dim: #64748b;
  --primary: #38bdf8;
  --primary-hover: #0284c7;
  --badge-bg: rgba(56, 189, 248, 0.12);
  --badge-text: #38bdf8;
  --badge-border: rgba(56, 189, 248, 0.25);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  background-color: var(--bg-color);
  background-image: radial-gradient(ellipse 80% 60% at 50% -20%, rgba(14, 165, 233, 0.15), transparent);
  background-repeat: no-repeat;
  color: var(--text-main);
  line-height: 1.6;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-wrapper {
  flex: 1;
}

/* Header */
.app-header {
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);
  background: rgba(9, 13, 22, 0.75);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 50;
  padding: 1rem 1.5rem;
}

.header-container {
  max-width: 1150px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #38bdf8, #4f46e5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: white;
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.25);
}

.brand-name {
  font-weight: 800;
  font-size: 1.15rem;
  letter-spacing: -0.02em;
}

.brand-highlight {
  color: var(--primary);
}

.version-badge {
  font-size: 0.7rem;
  background: var(--badge-bg);
  color: var(--badge-text);
  border: 1px solid var(--badge-border);
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
}

.edit-pill {
  display: none;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid var(--card-border);
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
}

@media (min-width: 768px) {
  .edit-pill {
    display: flex;
  }
}

.edit-pill code {
  color: #7dd3fc;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
}

.header-links {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.header-links a {
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s;
}

.header-links a:hover {
  color: white;
}

.github-btn {
  background: #1e293b;
  color: white !important;
  font-size: 0.75rem !important;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--card-border);
  transition: background 0.2s;
}

.github-btn:hover {
  background: #334155 !important;
}

/* Main Hero */
.hero-container {
  max-width: 1150px;
  margin: 0 auto;
  padding: 4rem 1.5rem 5rem 1.5rem;
}

.hero-content {
  text-align: center;
  max-width: 720px;
  margin: 0 auto;
}

.announcement-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.9rem;
  border-radius: 9999px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid var(--badge-border);
  font-size: 0.75rem;
  font-weight: 500;
  color: #7dd3fc;
  margin-bottom: 1.5rem;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #38bdf8;
}

.hero-title {
  font-size: clamp(2.25rem, 5vw, 3.75rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin-bottom: 1.25rem;
}

.gradient-text {
  background: linear-gradient(to right, #38bdf8, #5eead4, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  font-size: 1.125rem;
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: 2rem;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.terminal-pill {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid var(--card-border);
  padding: 0.65rem 1rem;
  border-radius: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.875rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
}

.terminal-prompt {
  color: #34d399;
  font-weight: 700;
}

.terminal-cmd {
  color: #e2e8f0;
}

.terminal-status {
  color: var(--text-dim);
  font-size: 0.75rem;
  font-family: 'Plus Jakarta Sans', sans-serif;
  margin-left: 0.5rem;
}

.cta-btn {
  background: linear-gradient(135deg, #0ea5e9, #4f46e5);
  color: white;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.875rem;
  padding: 0.65rem 1.25rem;
  border-radius: 0.75rem;
  box-shadow: 0 4px 15px rgba(14, 165, 233, 0.3);
  transition: transform 0.2s, box-shadow 0.2s;
}

.cta-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(14, 165, 233, 0.4);
}

/* Feature Grid */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
  margin-top: 5rem;
}

.feature-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  padding: 1.5rem;
  border-radius: 1rem;
  transition: all 0.25s ease;
  display: flex;
  flex-direction: column;
}

.feature-card:hover {
  border-color: var(--card-hover-border);
  background: rgba(15, 23, 42, 0.75);
  transform: translateY(-2px);
}

.feature-icon {
  font-size: 1.5rem;
  margin-bottom: 0.75rem;
}

.feature-heading {
  font-size: 1rem;
  font-weight: 700;
  color: white;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
}

.arrow {
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
}

.feature-card:hover .arrow {
  opacity: 1;
  transform: translateX(3px);
  color: var(--primary);
}

.feature-desc {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
}

/* Demo Card */
.demo-card {
  margin-top: 4rem;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 1rem;
  padding: 2rem;
  backdrop-filter: blur(12px);
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
}

.demo-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 1.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid rgba(51, 65, 85, 0.6);
}

.demo-title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.demo-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: white;
}

.demo-subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.turbo-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #34d399;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
}

.posts-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.post-item {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(51, 65, 85, 0.6);
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: border-color 0.2s;
}

.post-item:hover {
  border-color: var(--card-hover-border);
}

.post-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.post-id {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--badge-bg);
  color: var(--badge-text);
  border: 1px solid var(--badge-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  font-weight: 700;
}

.post-title {
  font-size: 0.925rem;
  font-weight: 500;
  color: #f1f5f9;
}

.post-tag {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-family: 'JetBrains Mono', monospace;
}

.demo-footer {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(51, 65, 85, 0.6);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.component-tag {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-family: 'JetBrains Mono', monospace;
}

/* Footer */
.app-footer {
  border-top: 1px solid rgba(51, 65, 85, 0.6);
  background: #070a12;
  padding: 2rem 1.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.footer-container {
  max-width: 1150px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.brand-text {
  color: var(--primary);
  font-weight: 700;
}
`;
  writeFileSync(join(projectDir, 'public/css/app.css'), cssFileContent, 'utf-8');

  // 6. views/layouts/app.html (Tailwind or Pure CSS)
  const layoutContent = isTailwind
    ? `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          }
        }
      }
    }
  </script>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body class="bg-[#090d16] text-slate-100 font-sans antialiased min-h-screen flex flex-col justify-between selection:bg-sky-500 selection:text-white">
  <div class="relative overflow-hidden flex-1">
    <!-- Ambient radial glow background -->
    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[450px] bg-gradient-to-b from-sky-500/15 via-indigo-500/5 to-transparent blur-3xl pointer-events-none -z-10"></div>
    
    {!! slot !!}
    {!! after !!}
  </div>

  <footer class="border-t border-slate-800/80 bg-[#070a12]/80 backdrop-blur py-8 px-6 text-center text-sm text-slate-500">
    <div class="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-2 font-medium text-slate-400">
        <span class="text-sky-400 font-bold">⚡ BirFramework</span>
        <span>•</span>
        <span>Laravel DX meets Modern TypeScript</span>
      </div>
      <div class="text-xs text-slate-500">
        Open Source under MIT License • Ready for production
      </div>
    </div>
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <div class="app-wrapper">
    {!! slot !!}
    {!! after !!}
  </div>

  <footer class="app-footer">
    <div class="footer-container">
      <div class="footer-left">
        <span class="brand-text">⚡ BirFramework</span>
        <span>•</span>
        <span>Laravel DX meets Modern TypeScript</span>
      </div>
      <div class="footer-right">
        Open Source under MIT License • Ready for production
      </div>
    </div>
  </footer>

  {!! bir_scripts() !!}
</body>
</html>
`;
  writeFileSync(join(projectDir, 'views/layouts/app.html'), layoutContent, 'utf-8');

  // 7. views/welcome.html (Tailwind or Pure CSS)
  const welcomeContent = isTailwind
    ? `<x-layouts.app title="{{ title }}">
  <!-- Top Navigation Header -->
  <header class="border-b border-slate-800/60 bg-[#090d16]/70 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
    <div class="max-w-6xl mx-auto flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-sky-500/20">
          ⚡
        </div>
        <span class="font-bold text-lg tracking-tight text-white">Bir<span class="text-sky-400">Framework</span></span>
        <span class="hidden sm:inline-block text-[11px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full font-mono font-medium">v0.1.0</span>
      </div>

      <div class="hidden md:flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 border border-slate-800 px-3.5 py-1.5 rounded-full">
        <span>Get started by editing</span>
        <code class="text-sky-300 font-mono font-semibold">app/controllers/HomeController.ts</code>
      </div>

      <div class="flex items-center gap-4 text-sm font-medium">
        <a href="#features" class="text-slate-400 hover:text-white transition">Features</a>
        <a href="#demo" class="text-slate-400 hover:text-white transition">Live Demo</a>
        <a href="https://github.com" target="_blank" class="bg-slate-800 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700/80 transition flex items-center gap-1.5">
          <span>GitHub</span>
          <span class="text-[10px]">↗</span>
        </a>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="max-w-6xl mx-auto px-6 pt-16 pb-20">
    <div class="text-center max-w-3xl mx-auto space-y-6">
      <div class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-purple-500/10 border border-sky-500/20 text-xs font-medium text-sky-300 shadow-inner">
        <span class="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
        <span>The Next-Gen Full-Stack Web Framework</span>
      </div>

      <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
        Laravel DX.<br>
        <span class="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-teal-300 to-indigo-400">
          Modern TypeScript Speed.
        </span>
      </h1>

      <p class="text-slate-400 text-lg sm:text-xl font-normal leading-relaxed max-w-2xl mx-auto">
        Sub-millisecond routing, native Instant Turbo SPA morphing, multi-driver database ORM, and batteries included out of the box.
      </p>

      <!-- Terminal Command Card -->
      <div class="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
        <div class="flex items-center gap-3 bg-slate-900/90 border border-slate-800 px-4 py-2.5 rounded-xl font-mono text-sm shadow-xl">
          <span class="text-emerald-400 font-bold">$</span>
          <span class="text-slate-200">bir serve</span>
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping ml-2"></span>
          <span class="text-xs text-slate-500 font-sans">http://localhost:3000</span>
        </div>
        <a href="#demo" class="w-full sm:w-auto bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-sky-500/25 transition text-sm flex items-center justify-center gap-1.5">
          <span>Explore Demo</span>
          <span>↓</span>
        </a>
      </div>
    </div>

    <!-- 4 Feature Cards (Next.js Style Grid) -->
    <div id="features" class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-20">
      <div class="group bg-slate-900/40 hover:bg-slate-900/70 border border-slate-800/80 hover:border-sky-500/40 p-6 rounded-2xl transition duration-300 flex flex-col justify-between">
        <div>
          <div class="text-2xl mb-3">⚡</div>
          <h3 class="text-base font-bold text-white group-hover:text-sky-400 transition flex items-center gap-1">
            Instant Turbo SPA
            <span class="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition text-sm">→</span>
          </h3>
          <p class="text-slate-400 text-xs sm:text-sm mt-2 leading-relaxed">
            Zero-refresh page transitions with DOM morphing. SPA smoothness directly inside server-rendered Blade templates.
          </p>
        </div>
      </div>

      <div class="group bg-slate-900/40 hover:bg-slate-900/70 border border-slate-800/80 hover:border-sky-500/40 p-6 rounded-2xl transition duration-300 flex flex-col justify-between">
        <div>
          <div class="text-2xl mb-3">🗄️</div>
          <h3 class="text-base font-bold text-white group-hover:text-sky-400 transition flex items-center gap-1">
            Multi-Driver ORM
            <span class="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition text-sm">→</span>
          </h3>
          <p class="text-slate-400 text-xs sm:text-sm mt-2 leading-relaxed">
            Eloquent-style Models, Query Builder, Transactions, and Migrations for native SQLite, PostgreSQL, and MySQL.
          </p>
        </div>
      </div>

      <div class="group bg-slate-900/40 hover:bg-slate-900/70 border border-slate-800/80 hover:border-sky-500/40 p-6 rounded-2xl transition duration-300 flex flex-col justify-between">
        <div>
          <div class="text-2xl mb-3">🛡️</div>
          <h3 class="text-base font-bold text-white group-hover:text-sky-400 transition flex items-center gap-1">
            Batteries-Included
            <span class="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition text-sm">→</span>
          </h3>
          <p class="text-slate-400 text-xs sm:text-sm mt-2 leading-relaxed">
            Scrypt password hashing, signed sessions, CSRF token verification, and rate limiting ready from day one.
          </p>
        </div>
      </div>

      <div class="group bg-slate-900/40 hover:bg-slate-900/70 border border-slate-800/80 hover:border-sky-500/40 p-6 rounded-2xl transition duration-300 flex flex-col justify-between">
        <div>
          <div class="text-2xl mb-3">🔄</div>
          <h3 class="text-base font-bold text-white group-hover:text-sky-400 transition flex items-center gap-1">
            Queues & Scheduler
            <span class="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition text-sm">→</span>
          </h3>
          <p class="text-slate-400 text-xs sm:text-sm mt-2 leading-relaxed">
            Background job dispatching, exponential retry backoff, and a Laravel-style cron scheduler daemon.
          </p>
        </div>
      </div>
    </div>

    <!-- Live Demonstration Card (Blade & Instant Turbo) -->
    <div id="demo" class="mt-16 bg-slate-900/50 border border-slate-800/90 rounded-2xl p-6 sm:p-8 backdrop-blur shadow-2xl">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-800">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xl">✨</span>
            <h2 class="text-lg sm:text-xl font-bold text-white">Live Blade & Instant Turbo Preview</h2>
          </div>
          <p class="text-xs sm:text-sm text-slate-400">
            Click the pagination links below. Notice how the page updates instantly without a full page reload or flashing.
          </p>
        </div>
        <div class="flex items-center gap-2 text-xs font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg self-start sm:self-auto">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Turbo Active (DOM Morphing)</span>
        </div>
      </div>

      <div class="space-y-3">
        @foreach(post in posts)
          <div class="bg-slate-950/60 border border-slate-800/70 p-4 rounded-xl flex items-center justify-between hover:border-sky-500/40 transition">
            <div class="flex items-center gap-3">
              <span class="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center font-mono text-xs font-bold">
                {{ post.id }}
              </span>
              <span class="font-medium text-slate-200 text-sm sm:text-base">{{ post.title }}</span>
            </div>
            <span class="text-xs text-slate-500 font-mono">Rendered by Controller</span>
          </div>
        @endforeach
      </div>

      <div class="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
        <div>
          {!! paginationHtml !!}
        </div>
        <span class="text-xs text-slate-500 hidden sm:inline-block">Blade Component: &lt;x-layouts.app&gt;</span>
      </div>
    </div>
  </main>
</x-layouts.app>
`
    : `<x-layouts.app title="{{ title }}">
  <!-- Top Navigation Header -->
  <header class="app-header">
    <div class="header-container">
      <div class="brand">
        <div class="brand-logo">⚡</div>
        <span class="brand-name">Bir<span class="brand-highlight">Framework</span></span>
        <span class="version-badge">v0.1.0</span>
      </div>

      <div class="edit-pill">
        <span>Get started by editing</span>
        <code>app/controllers/HomeController.ts</code>
      </div>

      <div class="header-links">
        <a href="#features">Features</a>
        <a href="#demo">Live Demo</a>
        <a href="https://github.com" target="_blank" class="github-btn">GitHub ↗</a>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="hero-container">
    <div class="hero-content">
      <div class="announcement-pill">
        <span class="pulse-dot"></span>
        <span>The Next-Gen Full-Stack Web Framework</span>
      </div>

      <h1 class="hero-title">
        Laravel DX.<br>
        <span class="gradient-text">Modern TypeScript Speed.</span>
      </h1>

      <p class="hero-subtitle">
        Sub-millisecond routing, native Instant Turbo SPA morphing, multi-driver database ORM, and batteries included out of the box.
      </p>

      <div class="hero-actions">
        <div class="terminal-pill">
          <span class="terminal-prompt">$</span>
          <span class="terminal-cmd">bir serve</span>
          <span class="terminal-status">● http://localhost:3000</span>
        </div>
        <a href="#demo" class="cta-btn">
          Explore Demo ↓
        </a>
      </div>
    </div>

    <!-- 4 Feature Cards -->
    <div id="features" class="feature-grid">
      <div class="feature-card">
        <div class="feature-icon">⚡</div>
        <h3 class="feature-heading">Instant Turbo SPA <span class="arrow">→</span></h3>
        <p class="feature-desc">
          Zero-refresh page transitions with DOM morphing. SPA smoothness directly inside server-rendered Blade templates.
        </p>
      </div>

      <div class="feature-card">
        <div class="feature-icon">🗄️</div>
        <h3 class="feature-heading">Multi-Driver ORM <span class="arrow">→</span></h3>
        <p class="feature-desc">
          Eloquent-style Models, Query Builder, Transactions, and Migrations for native SQLite, PostgreSQL, and MySQL.
        </p>
      </div>

      <div class="feature-card">
        <div class="feature-icon">🛡️</div>
        <h3 class="feature-heading">Batteries-Included <span class="arrow">→</span></h3>
        <p class="feature-desc">
          Scrypt password hashing, signed sessions, CSRF token verification, and rate limiting ready from day one.
        </p>
      </div>

      <div class="feature-card">
        <div class="feature-icon">🔄</div>
        <h3 class="feature-heading">Queues & Scheduler <span class="arrow">→</span></h3>
        <p class="feature-desc">
          Background job dispatching, exponential retry backoff, and a Laravel-style cron scheduler daemon.
        </p>
      </div>
    </div>

    <!-- Live Demonstration Card -->
    <div id="demo" class="demo-card">
      <div class="demo-header">
        <div>
          <div class="demo-title-group">
            <span style="font-size: 1.25rem;">✨</span>
            <h2 class="demo-title">Live Blade & Instant Turbo Preview</h2>
          </div>
          <p class="demo-subtitle">
            Click the pagination links below. Notice how the page updates instantly without a full page reload or flashing.
          </p>
        </div>
        <div class="turbo-badge">
          <span class="badge-dot"></span>
          <span>Turbo Active (DOM Morphing)</span>
        </div>
      </div>

      <div class="posts-list">
        @foreach(post in posts)
          <div class="post-item">
            <div class="post-left">
              <span class="post-id">{{ post.id }}</span>
              <span class="post-title">{{ post.title }}</span>
            </div>
            <span class="post-tag">Rendered by Controller</span>
          </div>
        @endforeach
      </div>

      <div class="demo-footer">
        <div>
          {!! paginationHtml !!}
        </div>
        <span class="component-tag">Blade Component: &lt;x-layouts.app&gt;</span>
      </div>
    </div>
  </main>
</x-layouts.app>
`;
  writeFileSync(join(projectDir, 'views/welcome.html'), welcomeContent, 'utf-8');

  // 8. app.[ts|js] (Entry Point)
  const appContent = `import { Application, logger } from 'birframework';
import './routes/web.js';

const app = new Application();
app.use(logger());

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', (port) => {
  console.log(\`BirFramework ready at http://localhost:\${port || PORT}\`);
});
`;
  writeFileSync(join(projectDir, `app.${ext}`), appContent, 'utf-8');

  console.log(`\x1b[32m✔ Project created successfully!\x1b[0m`);
  console.log(`\nTo get started:\n`);
  console.log(`  cd ${name}`);
  console.log(`  npm install`);
  console.log(`  npm run dev\n`);
}

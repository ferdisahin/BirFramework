import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { VERSION } from '../../version.js';
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
  if (isTailwind) {
    mkdirSync(join(projectDir, 'resources/css'), { recursive: true });
  }

  // 1. package.json
  const devScripts: Record<string, string> = {
    start: isTS ? 'npx tsx app.ts' : 'node app.js',
  };

  if (isTailwind) {
    devScripts['build:css'] = 'npx @tailwindcss/cli -i ./resources/css/app.css -o ./public/css/app.css --minify';
    devScripts['watch:css'] = 'npx @tailwindcss/cli -i ./resources/css/app.css -o ./public/css/app.css --watch';
    devScripts['dev'] = isTS
      ? 'concurrently -k -p "[{name}]" -n "css,app" -c "cyan,green" "npm:watch:css" "npx tsx watch app.ts"'
      : 'concurrently -k -p "[{name}]" -n "css,app" -c "cyan,green" "npm:watch:css" "node --watch app.js"';
    devScripts['build'] = 'npm run build:css';
  } else {
    devScripts['dev'] = isTS ? 'npx tsx watch app.ts' : 'node --watch app.js';
  }

  const devDependencies: Record<string, string> = {};
  if (isTS) {
    devDependencies['typescript'] = '^5.7.0';
    devDependencies['@types/node'] = '^22.0.0';
    devDependencies['tsx'] = '^4.19.0';
  }
  if (isTailwind) {
    devDependencies['@tailwindcss/cli'] = '^4.0.0';
    devDependencies['tailwindcss'] = '^4.0.0';
    devDependencies['concurrently'] = '^9.1.0';
  }

  const pkg = {
    name,
    version: '1.0.0',
    type: 'module',
    scripts: devScripts,
    dependencies: {
      birframework: `^${VERSION}`,
    },
    devDependencies,
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

export class HomeController {
  public async index(ctx: Context) {
    return ctx.render('welcome', {
      title: 'BirFramework',
      version: '${VERSION}',
      nodeVersion: process.version,
    });
  }
}
`
    : `export class HomeController {
  async index(ctx) {
    return ctx.render('welcome', {
      title: 'BirFramework',
      version: '${VERSION}',
      nodeVersion: process.version,
    });
  }
}
`;
  writeFileSync(join(projectDir, `app/controllers/HomeController.${ext}`), controllerContent, 'utf-8');

  // 5. resources/css/app.css (Tailwind source) & public/css/app.css
  if (isTailwind) {
    writeFileSync(join(projectDir, 'resources/css/app.css'), '@import "tailwindcss";\n', 'utf-8');
  }

  const cssFileContent = isTailwind
    ? `/* Built with Tailwind CSS v4 */
@import "tailwindcss";
`
    : `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background-color: #000000;
  color: #f4f4f5;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  line-height: 1.5;
}

.wrapper {
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
  padding: 3rem 1.5rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 2rem;
  border-bottom: 1px solid #18181b;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  color: #ffffff;
}

nav a {
  color: #71717a;
  text-decoration: none;
  font-size: 0.875rem;
  margin-left: 1.5rem;
  transition: color 0.15s;
}

nav a:hover {
  color: #ffffff;
}

main {
  margin: auto 0;
  padding: 4rem 0;
}

h1 {
  font-size: 1.875rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: #ffffff;
  margin-bottom: 1rem;
}

.lead {
  color: #71717a;
  font-size: 0.875rem;
  line-height: 1.6;
  max-width: 580px;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background-color: #18181b;
  border: 1px solid #27272a;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  color: #e4e4e7;
  font-size: 0.8rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
  margin-top: 3rem;
}

.card {
  padding: 1.25rem;
  border-radius: 8px;
  border: 1px solid #18181b;
  background-color: rgba(9, 9, 11, 0.4);
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, background-color 0.15s;
}

.card:hover {
  border-color: #3f3f46;
  background-color: rgba(24, 24, 27, 0.4);
}

.card h2 {
  font-size: 0.875rem;
  font-weight: 500;
  color: #ffffff;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card p {
  font-size: 0.75rem;
  color: #71717a;
  margin-top: 0.5rem;
  line-height: 1.5;
}

footer {
  padding-top: 2rem;
  border-top: 1px solid #18181b;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #52525b;
}
`;
  writeFileSync(join(projectDir, 'public/css/app.css'), cssFileContent, 'utf-8');

  // 6. views/layouts/app.html
  const layoutContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body class="${isTailwind ? 'bg-black text-zinc-100 min-h-screen flex flex-col justify-between font-sans antialiased selection:bg-zinc-800 selection:text-white' : ''}">
  {!! slot !!}
  {!! after !!}

  {!! bir_scripts() !!}
</body>
</html>
`;
  writeFileSync(join(projectDir, 'views/layouts/app.html'), layoutContent, 'utf-8');

  // 7. views/welcome.html (Tailwind or Pure CSS)
  const welcomeContent = isTailwind
    ? `<x-layouts.app title="{{ title }}">
  <div class="max-w-4xl mx-auto px-6 py-12 flex-1 flex flex-col justify-between w-full">
    <!-- Top Bar -->
    <header class="flex items-center justify-between pb-8 border-b border-zinc-900">
      <div class="flex items-center gap-2 font-semibold tracking-tight text-white">
        <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        <span>BirFramework</span>
      </div>
      <nav class="flex items-center gap-6 text-sm text-zinc-400">
        <a href="https://github.com/ferdisahin/BirFramework" target="_blank" class="hover:text-white transition">GitHub</a>
        <a href="#docs" class="hover:text-white transition">Documentation</a>
      </nav>
    </header>

    <!-- Main Content -->
    <main class="my-auto py-16">
      <div class="space-y-4 max-w-xl">
        <h1 class="text-3xl font-semibold tracking-tight text-white">
          Get started with your application
        </h1>
        <p class="text-zinc-400 text-sm leading-relaxed">
          To begin building your application, edit <code class="text-zinc-200 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-xs font-mono">routes/web.ts</code> or the home controller at <code class="text-zinc-200 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-xs font-mono">app/controllers/HomeController.ts</code>.
        </p>
      </div>

      <!-- Quick Links Grid -->
      <div class="grid sm:grid-cols-2 gap-4 mt-12">
        <a href="#" class="group p-5 rounded-lg border border-zinc-900 hover:border-zinc-700 bg-zinc-950/50 transition">
          <h2 class="text-sm font-medium text-white group-hover:text-zinc-200 flex items-center justify-between">
            Documentation
            <span class="text-zinc-600 group-hover:text-zinc-400 transition">&rarr;</span>
          </h2>
          <p class="text-xs text-zinc-500 mt-2 leading-relaxed">
            API reference, configuration options, and architectural guides.
          </p>
        </a>

        <a href="#" class="group p-5 rounded-lg border border-zinc-900 hover:border-zinc-700 bg-zinc-950/50 transition">
          <h2 class="text-sm font-medium text-white group-hover:text-zinc-200 flex items-center justify-between">
            Routing & Views
            <span class="text-zinc-600 group-hover:text-zinc-400 transition">&rarr;</span>
          </h2>
          <p class="text-xs text-zinc-500 mt-2 leading-relaxed">
            Define web routes, controllers, middleware, and Blade component templates.
          </p>
        </a>

        <a href="#" class="group p-5 rounded-lg border border-zinc-900 hover:border-zinc-700 bg-zinc-950/50 transition">
          <h2 class="text-sm font-medium text-white group-hover:text-zinc-200 flex items-center justify-between">
            Database & ORM
            <span class="text-zinc-600 group-hover:text-zinc-400 transition">&rarr;</span>
          </h2>
          <p class="text-xs text-zinc-500 mt-2 leading-relaxed">
            Active-record models, schema migrations, and multi-driver database queries.
          </p>
        </a>

        <a href="#" class="group p-5 rounded-lg border border-zinc-900 hover:border-zinc-700 bg-zinc-950/50 transition">
          <h2 class="text-sm font-medium text-white group-hover:text-zinc-200 flex items-center justify-between">
            Queues & Scheduler
            <span class="text-zinc-600 group-hover:text-zinc-400 transition">&rarr;</span>
          </h2>
          <p class="text-xs text-zinc-500 mt-2 leading-relaxed">
            Dispatch background workers, handle failed jobs, and schedule cron tasks.
          </p>
        </a>
      </div>
    </main>

    <!-- Footer -->
    <footer class="pt-8 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
      <div>
        BirFramework v{{ version }}
      </div>
      <div>
        Node.js {{ nodeVersion }}
      </div>
    </footer>
  </div>
</x-layouts.app>
`
    : `<x-layouts.app title="{{ title }}">
  <div class="wrapper">
    <!-- Top Bar -->
    <header>
      <div class="brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        <span>BirFramework</span>
      </div>
      <nav>
        <a href="https://github.com/ferdisahin/BirFramework" target="_blank">GitHub</a>
        <a href="#docs">Documentation</a>
      </nav>
    </header>

    <!-- Main Content -->
    <main>
      <h1>Get started with your application</h1>
      <p class="lead">
        To begin building your application, edit <code>routes/web.js</code> or the home controller at <code>app/controllers/HomeController.js</code>.
      </p>

      <div class="grid">
        <a href="#" class="card">
          <h2>Documentation <span>&rarr;</span></h2>
          <p>API reference, configuration options, and architectural guides.</p>
        </a>

        <a href="#" class="card">
          <h2>Routing & Views <span>&rarr;</span></h2>
          <p>Define web routes, controllers, middleware, and Blade component templates.</p>
        </a>

        <a href="#" class="card">
          <h2>Database & ORM <span>&rarr;</span></h2>
          <p>Active-record models, schema migrations, and multi-driver database queries.</p>
        </a>

        <a href="#" class="card">
          <h2>Queues & Scheduler <span>&rarr;</span></h2>
          <p>Dispatch background workers, handle failed jobs, and schedule cron tasks.</p>
        </a>
      </div>
    </main>

    <!-- Footer -->
    <footer>
      <div>BirFramework v{{ version }}</div>
      <div>Node.js {{ nodeVersion }}</div>
    </footer>
  </div>
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

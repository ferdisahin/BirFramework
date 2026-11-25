import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { VERSION } from '../../version.js';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export interface NewProjectOptions {
  name: string;
  lang?: 'ts' | 'js';
  css?: 'tailwind' | 'css';
  turbo?: 'hotwire' | 'birturbo' | 'none';
  view?: 'blade' | 'jsx';
}

async function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(query)).trim();
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
      console.log('\n\x1b[90mOperation cancelled.\x1b[0m\n');
      process.exit(0);
    }
    throw err;
  } finally {
    rl.close();
  }
}

export async function createNewProject(
  name?: string,
  lang?: 'ts' | 'js',
  css?: 'tailwind' | 'css',
  turbo?: 'hotwire' | 'birturbo' | 'none',
  view?: 'blade' | 'jsx'
) {
  // 1. Resolve project name
  if (!name && process.stdin.isTTY) {
    name = await askQuestion('\x1b[36m? Enter project name:\x1b[0m ');
  }

  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a project name. E.g.: bir new my-app [--ts|--js] [--tailwind|--css] [--hotwire|--birturbo|--no-turbo]');
    return;
  }

  if (name.includes('..') || name.includes('\0') || !/^[a-zA-Z0-9_.-]+$/.test(name)) {
    console.error(`\x1b[31m[Error]\x1b[0m Invalid project name or path traversal attempt: "${name}"`);
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
      console.log('  \x1b[32m1)\x1b[0m Tailwind CSS \x1b[90m(Default, Recommended - Modern Utility-First v4)\x1b[0m');
      console.log('  \x1b[32m2)\x1b[0m Pure CSS \x1b[90m(Vanilla CSS without build step or CDN)\x1b[0m');
      const cssChoice = await askQuestion('\x1b[36mChoose [1-2] (default: 1):\x1b[0m ');
      css = cssChoice === '2' ? 'css' : 'tailwind';
    } else {
      css = 'tailwind';
    }
  }

  // 4. Resolve SPA navigation engine (Interactive defaults to Hotwire; Non-TTY defaults to BirTurbo for test compatibility)
  if (!turbo) {
    if (process.stdin.isTTY) {
      console.log('\n\x1b[1mSelect SPA navigation & asset bundler:\x1b[0m');
      console.log('  \x1b[32m1)\x1b[0m Hotwire Turbo + Vite \x1b[90m(Default, Recommended - Turbo 8 + HMR + Preact Islands)\x1b[0m');
      console.log('  \x1b[32m2)\x1b[0m None \x1b[90m(Traditional Multi-Page MPA without Vite)\x1b[0m');
      const turboChoice = await askQuestion('\x1b[36mChoose [1-2] (default: 1):\x1b[0m ');
      turbo = turboChoice === '2' ? 'none' : 'hotwire';
    } else {
      turbo = 'birturbo';
    }
  }

  // 5. Resolve view template engine (Interactive defaults to TSX/JSX; Non-TTY defaults to Blade for test compatibility)
  if (!view) {
    if (process.stdin.isTTY) {
      console.log('\n\x1b[1mSelect view template engine:\x1b[0m');
      console.log('  \x1b[32m1)\x1b[0m TSX / JSX + Preact Islands \x1b[90m(Default, Recommended - Type-safe SSR + interactive islands)\x1b[0m');
      console.log('  \x1b[32m2)\x1b[0m Blade (.bir) \x1b[90m(Laravel-style directives, slots & components)\x1b[0m');
      const viewChoice = await askQuestion('\x1b[36mChoose [1-2] (default: 1):\x1b[0m ');
      view = viewChoice === '2' ? 'blade' : 'jsx';
    } else {
      view = 'blade';
    }
  }

  const isTS = lang === 'ts';
  const isTailwind = css === 'tailwind';
  const isHotwire = turbo === 'hotwire';
  const hasVite = isHotwire;
  const isBirTurbo = turbo === 'birturbo';
  const isJsx = view === 'jsx';
  const ext = isTS ? 'ts' : 'js';

  console.log(`\n\x1b[36m🚀 Creating new BirJS project: ${name}\x1b[0m`);
  console.log(`\x1b[90m  • Language:    ${isTS ? 'TypeScript (Strict)' : 'Pure JavaScript (ESM)'}\x1b[0m`);
  console.log(`\x1b[90m  • View Engine: ${isJsx ? 'TSX / JSX (React-style type-safe components)' : 'Blade (.bir / Laravel-style components)'}\x1b[0m`);
  console.log(`\x1b[90m  • Styling:     ${isTailwind ? 'Tailwind CSS (Default)' : 'Pure CSS'}\x1b[0m`);
  console.log(`\x1b[90m  • Navigation:  ${isHotwire ? 'Hotwire Turbo 8 (Official NPM)' : isBirTurbo ? 'BirTurbo (Built-in Zero-Dep)' : 'None (Traditional MPA)'}\x1b[0m\n`);

  // Create folder structure (Laravel-style)
  mkdirSync(join(projectDir, 'app/controllers'), { recursive: true });
  mkdirSync(join(projectDir, 'app/models'), { recursive: true });
  mkdirSync(join(projectDir, 'app/middlewares'), { recursive: true });
  mkdirSync(join(projectDir, 'routes'), { recursive: true });
  mkdirSync(join(projectDir, 'views/layouts'), { recursive: true });
  mkdirSync(join(projectDir, 'public/css'), { recursive: true });
  mkdirSync(join(projectDir, 'storage/cache'), { recursive: true });
  mkdirSync(join(projectDir, 'storage/app'), { recursive: true });
  mkdirSync(join(projectDir, 'storage/logs'), { recursive: true });
  writeFileSync(join(projectDir, 'storage/cache/.gitkeep'), '', 'utf-8');
  writeFileSync(join(projectDir, 'storage/app/.gitkeep'), '', 'utf-8');
  writeFileSync(join(projectDir, 'storage/logs/.gitkeep'), '', 'utf-8');

  if (isTailwind) {
    mkdirSync(join(projectDir, 'resources/css'), { recursive: true });
    writeFileSync(
      join(projectDir, 'resources/css/app.css'),
      '@import "tailwindcss";\n@source "../../views";\n@source "../../app";\n',
      'utf-8'
    );
  }

  if (isHotwire) {
    mkdirSync(join(projectDir, 'resources/js'), { recursive: true });
    if (isJsx) {
      mkdirSync(join(projectDir, 'views/islands'), { recursive: true });
      writeFileSync(join(projectDir, 'views/islands/.gitkeep'), '', 'utf-8');
    }

    const islandHydrator = isJsx
      ? `import { render, h } from 'preact';

const islands = import.meta.glob('../../views/islands/*.tsx');

async function mountIslands() {
  const nodes = document.querySelectorAll('[data-bir-island]');
  for (const el of nodes) {
    if (el.dataset.birMounted) continue;
    const name = el.getAttribute('data-bir-island');
    const modLoader = islands[\`../../views/islands/\${name}.tsx\`];
    if (!modLoader) continue;
    const mod = await modLoader();
    const Component = mod.default || mod[name];
    if (typeof Component === 'function') {
      const rawProps = el.getAttribute('data-bir-props');
      const props = rawProps ? JSON.parse(rawProps) : {};
      el.dataset.birMounted = 'true';
      el.innerHTML = '';
      render(h(Component, props), el);
    }
  }
}

document.addEventListener('DOMContentLoaded', mountIslands);
document.addEventListener('turbo:load', mountIslands);`
      : '';

    const jsImports =
      [
        isTailwind ? "import '../css/app.css';" : '',
        "import * as Turbo from '@hotwired/turbo';",
        islandHydrator,
      ]
        .filter(Boolean)
        .join('\n') + '\n';
    writeFileSync(join(projectDir, 'resources/js/app.js'), jsImports, 'utf-8');
  }

  // 1. package.json scripts & dependencies
  const devScripts: Record<string, string> = {
    start: isTS ? 'npx tsx app.ts' : 'node app.js',
  };

  const devDependencies: Record<string, string> = {};
  if (isTS) {
    devDependencies['typescript'] = '^5.7.0';
    devDependencies['@types/node'] = '^22.0.0';
    devDependencies['tsx'] = '^4.19.0';
  }

  const dependencies: Record<string, string> = {
    birframework: `^${VERSION}`,
  };

  if (isHotwire) {
    dependencies['@hotwired/turbo'] = '^8.0.12';
    devDependencies['vite'] = '^6.0.0';
    devDependencies['concurrently'] = '^9.1.0';
    if (isJsx) {
      dependencies['preact'] = '^10.25.0';
      devDependencies['@preact/preset-vite'] = '^2.9.0';
    }
    if (isTailwind) {
      devDependencies['tailwindcss'] = '^4.0.0';
      devDependencies['@tailwindcss/vite'] = '^4.0.0';
    }

    devScripts['dev'] = 'concurrently -c "#00f5d4,#7209b7,#f72585,#ffb703" --names="server,queue,logs,vite" "npm run dev:server" "npm run dev:queue" "npm run dev:logs" "npm run dev:vite"';
    devScripts['dev:server'] = isTS ? 'npx tsx watch app.ts' : 'node --watch app.js';
    devScripts['dev:queue'] = 'npx bir queue:work';
    devScripts['dev:logs'] = 'npx bir pail';
    devScripts['dev:vite'] = 'vite';
    devScripts['build'] = 'vite build';

    const inputs: string[] = [];
    if (isTailwind) inputs.push("'resources/css/app.css'");
    inputs.push("'resources/js/app.js'");

    const viteConfigContent = `import { defineConfig } from 'vite';
${isTailwind ? "import tailwindcss from '@tailwindcss/vite';\n" : ''}${isJsx ? "import preact from '@preact/preset-vite';\n" : ''}
export default defineConfig({
  plugins: [
    ${isTailwind ? 'tailwindcss(),\n    ' : ''}${isJsx ? 'preact(),\n    ' : ''}{
      name: 'bir-watch-views',
      handleHotUpdate({ file, server }) {
        if (file.includes('/views/') || file.includes('/app/')) {
          server.ws.send({
            type: 'full-reload',
            path: '*',
          });
        }
      },
    },
  ],
  build: {
    manifest: true,
    outDir: 'public/build',
    rollupOptions: {
      input: [${inputs.join(', ')}],
    },
  },
  server: {
    origin: 'http://localhost:5173',
    cors: true,
  },
});
`;
    writeFileSync(join(projectDir, 'vite.config.js'), viteConfigContent, 'utf-8');
  } else {
    // BirTurbo or None
    if (isTailwind) {
      devDependencies['@tailwindcss/cli'] = '^4.0.0';
      devDependencies['tailwindcss'] = '^4.0.0';
      devDependencies['concurrently'] = '^9.1.0';
      devScripts['build:css'] = 'npx @tailwindcss/cli -i ./resources/css/app.css -o ./public/css/app.css --minify';
      devScripts['watch:css'] = 'npx @tailwindcss/cli -i ./resources/css/app.css -o ./public/css/app.css --watch';
      devScripts['dev'] = 'concurrently -c "#00f5d4,#7209b7,#f72585,#ffb703" --names="server,queue,logs,css" "npm run dev:server" "npm run dev:queue" "npm run dev:logs" "npm run watch:css"';
      devScripts['dev:server'] = isTS ? 'npx tsx watch app.ts' : 'node --watch app.js';
      devScripts['dev:queue'] = 'npx bir queue:work';
      devScripts['dev:logs'] = 'npx bir pail';
      devScripts['build'] = 'npm run build:css';
    } else {
      devDependencies['concurrently'] = '^9.1.0';
      devScripts['dev'] = 'concurrently -c "#00f5d4,#7209b7,#f72585" --names="server,queue,logs" "npm run dev:server" "npm run dev:queue" "npm run dev:logs"';
      devScripts['dev:server'] = isTS ? 'npx tsx watch app.ts' : 'node --watch app.js';
      devScripts['dev:queue'] = 'npx bir queue:work';
      devScripts['dev:logs'] = 'npx bir pail';
    }
  }

  const pkg = {
    name,
    version: '1.0.0',
    type: 'module',
    scripts: devScripts,
    dependencies,
    devDependencies,
  };
  writeFileSync(join(projectDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

  // 2. tsconfig.json (only if TS)
  if (isTS) {
    const tsconfig = {
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        allowImportingTsExtensions: true,
        noEmit: true,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        jsx: 'react-jsx',
        jsxImportSource: 'birframework',
        baseUrl: '.',
        paths: {
          '@/*': ['./*'],
        },
      },
    };
    writeFileSync(join(projectDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2), 'utf-8');
  }

  // 3. routes/web.[ts|js]
  const routesContent = isTS
    ? `import { Route, type Context } from 'birframework';
import { HomeController } from '@/app/controllers/HomeController';

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
  const controllerContent = isJsx
    ? (isTS
      ? `import type { Context } from 'birframework';

export class HomeController {
  public async index(ctx: Context) {
    return ctx.render('Welcome', {
      title: 'BirJS',
      version: '${VERSION}',
      nodeVersion: process.version,
    });
  }
}
`
      : `export class HomeController {
  async index(ctx) {
    return ctx.render('Welcome', {
      title: 'BirJS',
      version: '${VERSION}',
      nodeVersion: process.version,
    });
  }
}
`)
    : (isTS
      ? `import type { Context } from 'birframework';

export class HomeController {
  public async index(ctx: Context) {
    return ctx.render('welcome', {
      title: 'BirJS',
      version: '${VERSION}',
      nodeVersion: process.version,
    });
  }
}
`
      : `export class HomeController {
  async index(ctx) {
    return ctx.render('welcome', {
      title: 'BirJS',
      version: '${VERSION}',
      nodeVersion: process.version,
    });
  }
}
`);
  writeFileSync(join(projectDir, `app/controllers/HomeController.${ext}`), controllerContent, 'utf-8');

  // 5. CSS files (always ensure public/css/app.css exists)
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

  // 6 & 7. Views (JSX/TSX or Blade .html)
  if (isJsx) {
    const jsxExt = isTS ? 'tsx' : 'jsx';
    const viteHead = hasVite
      ? `        <Vite entries={[${isTailwind ? "'resources/css/app.css', " : ''}'resources/js/app.js']} />`
      : '        <link rel="stylesheet" href="/css/app.css" />';

    const jsxLayout = `${hasVite ? "import { Vite } from 'birframework/jsx';\n\n" : ''}export function Layout({ title, children }: { title: string; children?: any }) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} - BirJS</title>
${viteHead}
      </head>
      <body className="${isTailwind ? 'bg-[#09090b] text-zinc-100 min-h-screen flex flex-col font-sans antialiased selection:bg-zinc-800 selection:text-white' : ''}">
        {children}
      </body>
    </html>
  );
}
`;
    writeFileSync(join(projectDir, `views/layouts/Layout.${jsxExt}`), jsxLayout, 'utf-8');

    const jsxWelcome = `import { Layout } from './layouts/Layout.js';

export default function Welcome(props: { title: string; version: string; nodeVersion: string }) {
  return (
    <Layout title={props.title}>
      <div className="${isTailwind ? 'flex-1 flex flex-col justify-between' : 'wrapper'}">
        {/* Navigation */}
        <header className="${isTailwind ? 'border-b border-zinc-800/80 bg-[#09090b]/80 backdrop-blur sticky top-0 z-50' : 'brand'}">
          <div className="${isTailwind ? 'max-w-6xl mx-auto px-6 h-14 flex items-center justify-between' : ''}">
            <div className="${isTailwind ? 'flex items-center gap-3' : ''}">
              <div className="${isTailwind ? 'w-7 h-7 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-200' : ''}">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <span className="text-sm font-semibold tracking-tight text-white">BirJS</span>
              <span className="${isTailwind ? 'text-[11px] px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/70 text-zinc-400 font-mono' : ''}">
                v{props.version}
              </span>
            </div>
            <nav className="${isTailwind ? 'flex items-center gap-6 text-xs text-zinc-400' : ''}">
              <a href="https://birjs.com" target="_blank" className="${isTailwind ? 'hover:text-white transition-colors' : ''}">Documentation</a>
              <a href="https://github.com/ferdisahin/BirFramework" target="_blank" className="${isTailwind ? 'hover:text-white transition-colors flex items-center gap-1' : ''}">
                <span>GitHub</span>
                <svg className="w-3 h-3 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M7 17l9.2-9.2M17 17V8H8" />
                </svg>
              </a>
            </nav>
          </div>
        </header>

        {/* Hero & Quickstart */}
        <main className="${isTailwind ? 'max-w-6xl mx-auto px-6 py-20 flex-1 flex flex-col justify-center w-full' : ''}">
          {/* Status Badge */}
          <div className="${isTailwind ? 'inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] bg-zinc-900 border border-zinc-800 text-zinc-300 w-fit mb-6 font-mono' : ''}">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>BirJS v{props.version} &bull; TypeScript Core</span>
          </div>

          {/* Heading */}
          <h1 className="${isTailwind ? 'text-4xl sm:text-6xl font-bold tracking-tight text-white max-w-3xl leading-[1.08]' : ''}">
            The full-stack framework for TypeScript artisans.
          </h1>

          <p className="${isTailwind ? 'mt-5 text-base sm:text-lg text-zinc-400 max-w-2xl leading-relaxed font-normal' : 'lead'}">
            Laravel ergonomics paired with persistent-memory V8 speed. ActiveRecord ORM, background queues, real-time WebSockets, and zero-bundle server components.
          </p>

          {/* Quickstart Bar */}
          <div className="${isTailwind ? 'mt-8 p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 max-w-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4' : ''}">
            <div className="${isTailwind ? 'flex items-center gap-2.5 text-xs text-zinc-300 font-mono' : ''}">
              <span className="text-zinc-500 select-none">$</span>
              <span>Edit <code className="${isTailwind ? 'text-white bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60 font-mono text-[11px]' : ''}">app/controllers/HomeController.${ext}</code> to get started</span>
            </div>
            <a
              href="https://birjs.com/docs/installation"
              target="_blank"
              className="${isTailwind ? 'text-xs font-medium px-3 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 transition-colors shrink-0 flex items-center gap-1.5' : ''}"
            >
              <span>Read Docs</span>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* Architectural Pillars Grid */}
          <div className="${isTailwind ? 'grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12' : 'grid'}">
            {/* Card 1: Routing */}
            <a href="https://birjs.com/docs/routing" target="_blank" className="${isTailwind ? 'group p-5 rounded-lg border border-zinc-800/70 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all' : 'card'}">
              <div className="${isTailwind ? 'w-8 h-8 rounded border border-zinc-800 bg-zinc-900/80 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-zinc-700 transition-colors mb-3.5' : ''}">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                  <polyline points="2 17 12 22 22 17"></polyline>
                  <polyline points="2 12 12 17 22 12"></polyline>
                </svg>
              </div>
              <h2 className="${isTailwind ? 'text-sm font-semibold text-zinc-100 group-hover:text-white flex items-center justify-between' : ''}">
                Routing & Views
                <svg className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </h2>
              <p className="${isTailwind ? 'text-xs text-zinc-500 mt-2 leading-relaxed' : ''}">
                Define expressive routes, middleware pipelines, and zero-bundle server components.
              </p>
            </a>

            {/* Card 2: ORM */}
            <a href="https://birjs.com/docs/models" target="_blank" className="${isTailwind ? 'group p-5 rounded-lg border border-zinc-800/70 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all' : 'card'}">
              <div className="${isTailwind ? 'w-8 h-8 rounded border border-zinc-800 bg-zinc-900/80 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-zinc-700 transition-colors mb-3.5' : ''}">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                </svg>
              </div>
              <h2 className="${isTailwind ? 'text-sm font-semibold text-zinc-100 group-hover:text-white flex items-center justify-between' : ''}">
                ActiveRecord ORM
                <svg className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </h2>
              <p className="${isTailwind ? 'text-xs text-zinc-500 mt-2 leading-relaxed' : ''}">
                Multi-driver database connectivity, schema migrations, seeders, and model relations.
              </p>
            </a>

            {/* Card 3: Queues */}
            <a href="https://birjs.com/docs/queues" target="_blank" className="${isTailwind ? 'group p-5 rounded-lg border border-zinc-800/70 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all' : 'card'}">
              <div className="${isTailwind ? 'w-8 h-8 rounded border border-zinc-800 bg-zinc-900/80 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-zinc-700 transition-colors mb-3.5' : ''}">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 3h5v5"></path>
                  <path d="M8 21H3v-5"></path>
                  <path d="M21 3l-7 7"></path>
                  <path d="M3 21l7-7"></path>
                  <rect x="7" y="7" width="10" height="10" rx="2"></rect>
                </svg>
              </div>
              <h2 className="${isTailwind ? 'text-sm font-semibold text-zinc-100 group-hover:text-white flex items-center justify-between' : ''}">
                Queues & Jobs
                <svg className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </h2>
              <p className="${isTailwind ? 'text-xs text-zinc-500 mt-2 leading-relaxed' : ''}">
                Asynchronous background job dispatching, failure retries, and scheduled tasks.
              </p>
            </a>

            {/* Card 4: WebSockets */}
            <a href="https://birjs.com/docs/events" target="_blank" className="${isTailwind ? 'group p-5 rounded-lg border border-zinc-800/70 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all' : 'card'}">
              <div className="${isTailwind ? 'w-8 h-8 rounded border border-zinc-800 bg-zinc-900/80 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-zinc-700 transition-colors mb-3.5' : ''}">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4.93 4.93a10 10 0 0 1 14.14 0"></path>
                  <path d="M7.76 7.76a6 6 0 0 1 8.48 0"></path>
                  <circle cx="12" cy="12" r="2"></circle>
                  <path d="M12 14v8"></path>
                </svg>
              </div>
              <h2 className="${isTailwind ? 'text-sm font-semibold text-zinc-100 group-hover:text-white flex items-center justify-between' : ''}">
                Real-Time Events
                <svg className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </h2>
              <p className="${isTailwind ? 'text-xs text-zinc-500 mt-2 leading-relaxed' : ''}">
                Channel-based WebSocket broadcasting, auth guards, and real-time streams.
              </p>
            </a>
          </div>
        </main>

        {/* Footer */}
        <footer className="${isTailwind ? 'border-t border-zinc-800/80 bg-[#09090b]/40' : ''}">
          <div className="${isTailwind ? 'max-w-6xl mx-auto px-6 h-12 flex items-center justify-between text-xs text-zinc-500' : ''}">
            <div>Node.js {props.nodeVersion} &bull; BirFramework v{props.version}</div>
            <div>MIT Licensed</div>
          </div>
        </footer>
      </div>
    </Layout>
  );
}
`;
    writeFileSync(join(projectDir, `views/Welcome.${jsxExt}`), jsxWelcome, 'utf-8');
  } else {
    // 6. views/layouts/app.html
    let headAssets = '';
    if (hasVite) {
      headAssets = isTailwind
        ? "@vite(['resources/css/app.css', 'resources/js/app.js'])"
        : `<link rel="stylesheet" href="/css/app.css">\n  @vite(['resources/js/app.js'])`;
    } else {
      headAssets = '<link rel="stylesheet" href="/css/app.css">';
    }

    const bodyScripts = isBirTurbo ? '\n  {!! bir_scripts() !!}' : '';

    const layoutContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  ${headAssets}
</head>
<body class="${isTailwind ? 'bg-[#09090b] text-zinc-100 min-h-screen flex flex-col font-sans antialiased selection:bg-zinc-800 selection:text-white' : ''}">
  {!! slot !!}
  {!! after !!}${bodyScripts}
</body>
</html>
`;
    writeFileSync(join(projectDir, 'views/layouts/app.html'), layoutContent, 'utf-8');

  // 7. views/welcome.html (Tailwind or Pure CSS)
  const welcomeContent = isTailwind
    ? `<x-layouts.app title="{{ title }}">
  <div class="flex-1 flex flex-col justify-between">
    <!-- Navigation -->
    <header class="border-b border-zinc-800/80 bg-[#09090b]/80 backdrop-blur sticky top-0 z-50">
      <div class="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-7 h-7 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-200">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <span class="text-sm font-semibold tracking-tight text-white">BirJS</span>
          <span class="text-[11px] px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/70 text-zinc-400 font-mono">
            v{{ version }}
          </span>
        </div>
        <nav class="flex items-center gap-6 text-xs text-zinc-400">
          <a href="https://birjs.com" target="_blank" class="hover:text-white transition-colors">Documentation</a>
          <a href="https://github.com/ferdisahin/BirFramework" target="_blank" class="hover:text-white transition-colors flex items-center gap-1">
            <span>GitHub</span>
            <svg class="w-3 h-3 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 17l9.2-9.2M17 17V8H8" />
            </svg>
          </a>
        </nav>
      </div>
    </header>

    <!-- Hero & Quickstart -->
    <main class="max-w-6xl mx-auto px-6 py-20 flex-1 flex flex-col justify-center w-full">
      <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] bg-zinc-900 border border-zinc-800 text-zinc-300 w-fit mb-6 font-mono">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span>BirJS v{{ version }} &bull; TypeScript Core</span>
      </div>

      <h1 class="text-4xl sm:text-6xl font-bold tracking-tight text-white max-w-3xl leading-[1.08]">
        The full-stack framework for TypeScript artisans.
      </h1>

      <p class="mt-5 text-base sm:text-lg text-zinc-400 max-w-2xl leading-relaxed font-normal">
        Laravel ergonomics paired with persistent-memory V8 speed. ActiveRecord ORM, background queues, real-time WebSockets, and server-rendered Blade templates.
      </p>

      <div class="mt-8 p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 max-w-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex items-center gap-2.5 text-xs text-zinc-300 font-mono">
          <span class="text-zinc-500 select-none">$</span>
          <span>Edit <code class="text-white bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60 font-mono text-[11px]">routes/web.${ext}</code> to get started</span>
        </div>
        <a
          href="https://birjs.com/docs/installation"
          target="_blank"
          class="text-xs font-medium px-3 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 transition-colors shrink-0 flex items-center gap-1.5"
        >
          <span>Read Docs</span>
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
        <a href="https://birjs.com/docs/routing" target="_blank" class="group p-5 rounded-lg border border-zinc-800/70 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all">
          <div class="w-8 h-8 rounded border border-zinc-800 bg-zinc-900/80 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-zinc-700 transition-colors mb-3.5">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
          </div>
          <h2 class="text-sm font-semibold text-zinc-100 group-hover:text-white flex items-center justify-between">
            Routing & Views
            <svg class="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </h2>
          <p class="text-xs text-zinc-500 mt-2 leading-relaxed">
            Define web routes, controllers, middleware, and Blade component templates.
          </p>
        </a>

        <a href="https://birjs.com/docs/models" target="_blank" class="group p-5 rounded-lg border border-zinc-800/70 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all">
          <div class="w-8 h-8 rounded border border-zinc-800 bg-zinc-900/80 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-zinc-700 transition-colors mb-3.5">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
            </svg>
          </div>
          <h2 class="text-sm font-semibold text-zinc-100 group-hover:text-white flex items-center justify-between">
            ActiveRecord ORM
            <svg class="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </h2>
          <p class="text-xs text-zinc-500 mt-2 leading-relaxed">
            Active-record models, schema migrations, and multi-driver database queries.
          </p>
        </a>

        <a href="https://birjs.com/docs/queues" target="_blank" class="group p-5 rounded-lg border border-zinc-800/70 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all">
          <div class="w-8 h-8 rounded border border-zinc-800 bg-zinc-900/80 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-zinc-700 transition-colors mb-3.5">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 3h5v5"></path>
              <path d="M8 21H3v-5"></path>
              <path d="M21 3l-7 7"></path>
              <path d="M3 21l7-7"></path>
              <rect x="7" y="7" width="10" height="10" rx="2"></rect>
            </svg>
          </div>
          <h2 class="text-sm font-semibold text-zinc-100 group-hover:text-white flex items-center justify-between">
            Queues & Jobs
            <svg class="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </h2>
          <p class="text-xs text-zinc-500 mt-2 leading-relaxed">
            Dispatch background workers, handle failed jobs, and schedule cron tasks.
          </p>
        </a>

        <a href="https://birjs.com/docs/events" target="_blank" class="group p-5 rounded-lg border border-zinc-800/70 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all">
          <div class="w-8 h-8 rounded border border-zinc-800 bg-zinc-900/80 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-zinc-700 transition-colors mb-3.5">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4.93 4.93a10 10 0 0 1 14.14 0"></path>
              <path d="M7.76 7.76a6 6 0 0 1 8.48 0"></path>
              <circle cx="12" cy="12" r="2"></circle>
              <path d="M12 14v8"></path>
            </svg>
          </div>
          <h2 class="text-sm font-semibold text-zinc-100 group-hover:text-white flex items-center justify-between">
            Real-Time Events
            <svg class="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </h2>
          <p class="text-xs text-zinc-500 mt-2 leading-relaxed">
            Native channel-based WebSocket broadcasting and real-time event distribution.
          </p>
        </a>
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-zinc-800/80 bg-[#09090b]/40">
      <div class="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between text-xs text-zinc-500">
        <div>Node.js {{ nodeVersion }} &bull; BirFramework v{{ version }}</div>
        <div>MIT Licensed</div>
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
        <span>BirJS (BirFramework)</span>
      </div>
      <nav>
        <a href="https://github.com/ferdisahin/BirFramework" target="_blank">GitHub</a>
        <a href="https://birjs.com" target="_blank">Documentation</a>
      </nav>
    </header>

    <!-- Main Content -->
    <main>
      <h1>Get started with your application</h1>
      <p class="lead">
        To begin building your application, edit <code>routes/web.${ext}</code> or the home controller at <code>app/controllers/HomeController.${ext}</code>.
      </p>

      <div class="grid">
        <a href="https://birjs.com" target="_blank" class="card">
          <h2>Documentation <span>&rarr;</span></h2>
          <p>API reference, configuration options, and architectural guides.</p>
        </a>

        <a href="https://birjs.com" target="_blank" class="card">
          <h2>Routing & Views <span>&rarr;</span></h2>
          <p>Define web routes, controllers, middleware, and Blade component templates.</p>
        </a>

        <a href="https://birjs.com" target="_blank" class="card">
          <h2>Database & ORM <span>&rarr;</span></h2>
          <p>Active-record models, schema migrations, and multi-driver database queries.</p>
        </a>

        <a href="https://birjs.com" target="_blank" class="card">
          <h2>Queues & Scheduler <span>&rarr;</span></h2>
          <p>Dispatch background workers, handle failed jobs, and schedule cron tasks.</p>
        </a>
      </div>
    </main>

    <!-- Footer -->
    <footer>
      <div>BirJS (BirFramework) v{{ version }}</div>
      <div>Node.js {{ nodeVersion }}</div>
    </footer>
  </div>
</x-layouts.app>
`;
    writeFileSync(join(projectDir, 'views/welcome.html'), welcomeContent, 'utf-8');
  }

  // 8. app.[ts|js] (Entry Point)
  const appContent = `import { Application, logger } from 'birframework';

const app = new Application();
app.use(logger());

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', (port) => {
  console.log(\`BirJS ready at http://localhost:\${port || PORT}\`);
});

// Load application routes safely
try {
  await import('./routes/web.js');
} catch (err: any) {
  app.catchBootError(err);
}
`;
  writeFileSync(join(projectDir, `app.${ext}`), appContent, 'utf-8');

  // 9. Vercel Serverless Ready Configuration
  mkdirSync(join(projectDir, 'api'), { recursive: true });
  const vercelConfig = {
    outputDirectory: "public",
    functions: {
      "api/index.js": {
        includeFiles: "{views/**,storage/**,public/build/**}"
      }
    },
    rewrites: [
      {
        source: "/(.*)",
        destination: "/api/index.js"
      }
    ]
  };
  writeFileSync(join(projectDir, 'vercel.json'), JSON.stringify(vercelConfig, null, 2) + '\n', 'utf-8');

  const vercelApiIndex = `import { Application, logger } from 'birframework';
import '../routes/web.js';

const app = new Application();
app.use(logger());

export default app.serverless();
`;
  writeFileSync(join(projectDir, 'api/index.js'), vercelApiIndex, 'utf-8');

  console.log(`\x1b[32m✔ Project created successfully!\x1b[0m`);
  console.log(`\nTo get started:\n`);
  console.log(`  cd ${name}`);
  console.log(`  npm install`);
  console.log(`  npm run dev\n`);
  console.log(`\x1b[90m⚡ Deploy to Vercel instantly: run 'vercel' or push to GitHub (pre-configured)\x1b[0m\n`);
}

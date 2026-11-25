import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { VERSION } from '../../version.js';
import { writeVercelConfig } from './make.js';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export interface NewProjectOptions {
  name: string;
  lang?: 'ts' | 'js';
  css?: 'tailwind' | 'css';
  profile?: 'inertia' | 'server-rendered';
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
  profile?: 'inertia' | 'server-rendered'
) {
  // 1. Resolve project name
  if (!name && process.stdin.isTTY) {
    name = await askQuestion('\x1b[36m? Enter project name:\x1b[0m ');
  }

  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a project name. E.g.: bir new my-app [--ts|--js] [--tailwind|--css] [--inertia|--server-rendered]');
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

  // 2. Interactive: Press Enter for recommended defaults, or 'c' to customize
  const allUnspecified = !lang && !css && !profile;
  let customize = true;

  if (allUnspecified && process.stdin.isTTY) {
    console.log(`\n\x1b[1mBirJS Project Setup (${name})\x1b[0m`);
    console.log('\x1b[90m  Recommended Default Stack:\x1b[0m');
    console.log('    • Language:   \x1b[36mTypeScript\x1b[0m \x1b[90m(Backend .ts + Views .tsx)\x1b[0m');
    console.log('    • Styling:    \x1b[36mTailwind CSS v4\x1b[0m \x1b[90m(with Vite)\x1b[0m');
    console.log('    • Views:      \x1b[36mTSX / JSX + Preact\x1b[0m');
    console.log('    • Navigation: \x1b[36mInertia + Preact + Vite\x1b[0m\n');

    const mode = await askQuestion("\x1b[36mPress Enter to install with defaults, or type 'c' to customize:\x1b[0m ");
    if (mode.toLowerCase() !== 'c') {
      customize = false;
      lang = 'ts';
      css = 'tailwind';
      profile = 'inertia';
    }
  }

  // Resolve language (applies to both Backend .ts/.js and Views .tsx/.jsx)
  if (!lang) {
    if (customize && process.stdin.isTTY) {
      console.log('\n\x1b[1mSelect language (Backend + Views):\x1b[0m');
      console.log('  \x1b[32m1)\x1b[0m TypeScript \x1b[90m(Default — Backend in .ts, Views in .tsx)\x1b[0m');
      console.log('  \x1b[32m2)\x1b[0m JavaScript \x1b[90m(Pure ESM — Backend in .js, Views in .jsx)\x1b[0m');
      const langChoice = await askQuestion('\x1b[36mChoose [1-2] (default: 1):\x1b[0m ');
      lang = langChoice === '2' ? 'js' : 'ts';
    } else {
      lang = 'ts';
    }
  }

  // Resolve CSS framework (Tailwind default)
  if (!css) {
    if (customize && process.stdin.isTTY) {
      console.log('\n\x1b[1mSelect styling:\x1b[0m');
      console.log('  \x1b[32m1)\x1b[0m Tailwind CSS \x1b[90m(Default — Modern Utility-First v4)\x1b[0m');
      console.log('  \x1b[32m2)\x1b[0m Pure CSS \x1b[90m(Vanilla CSS without Tailwind)\x1b[0m');
      const cssChoice = await askQuestion('\x1b[36mChoose [1-2] (default: 1):\x1b[0m ');
      css = cssChoice === '2' ? 'css' : 'tailwind';
    } else {
      css = 'tailwind';
    }
  }

  if (!profile && customize && process.stdin.isTTY) {
    console.log('\n\x1b[1mChoose an application profile:\x1b[0m');
    console.log('  \x1b[32m1)\x1b[0m Inertia + Preact + Vite');
    console.log('  \x1b[32m2)\x1b[0m Server-rendered pages');
    const choice = await askQuestion('\x1b[36mChoose [1-2] (default: 1):\x1b[0m ');
    profile = choice === '2' ? 'server-rendered' : 'inertia';
  }

  const isTS = lang === 'ts';
  const isTailwind = css === 'tailwind';
  const usesInertia = profile !== 'server-rendered';
  const ext = isTS ? 'ts' : 'js';
  const jsxExt = isTS ? 'tsx' : 'jsx';

  console.log(`\n\x1b[36m🚀 Creating new BirJS project: ${name}\x1b[0m`);
  console.log(`\x1b[90m  • Language:    ${isTS ? 'TypeScript (Strict)' : 'Pure JavaScript (ESM)'}\x1b[0m`);
  console.log(`\x1b[90m  • View Engine: Preact (TSX / JSX)\x1b[0m`);
  console.log(`\x1b[90m  • Styling:     ${isTailwind ? 'Tailwind CSS (Default)' : 'Pure CSS'}\x1b[0m`);
  console.log(`\x1b[90m  • Navigation:  ${usesInertia ? 'Inertia + Preact + Vite' : 'Server-rendered'}\x1b[0m\n`);

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

  if (usesInertia && !isTailwind) {
    mkdirSync(join(projectDir, 'resources/css'), { recursive: true });
  }

  if (usesInertia) {
    mkdirSync(join(projectDir, 'resources/js'), { recursive: true });
    mkdirSync(join(projectDir, 'views/pages'), { recursive: true });
    mkdirSync(join(projectDir, 'views/components'), { recursive: true });

    const inertiaClientContent = `import { createContext, h, render, hydrate } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';

export interface PageData<T = Record<string, any>> {
  component: string;
  props: T;
  url: string;
}

const PageContext = createContext<PageData>({ component: '', props: {}, url: '/' });

export function usePage<T = Record<string, any>>(): PageData<T> {
  return useContext(PageContext) as PageData<T>;
}

export interface VisitOptions {
  method?: string;
  data?: any;
  replace?: boolean;
  preserveScroll?: boolean;
  preserveState?: boolean;
}

type RouterEvent = 'start' | 'finish';
const routerListeners: Record<RouterEvent, Set<() => void>> = {
  start: new Set(),
  finish: new Set(),
};

function emitRouterEvent(event: RouterEvent) {
  for (const cb of routerListeners[event]) cb();
}

let activeVisit: ((url: string, options?: VisitOptions) => Promise<void>) | null = null;

export const router = {
  visit(url: string, options?: VisitOptions) {
    if (activeVisit) return activeVisit(url, options);
    window.location.href = url;
    return Promise.resolve();
  },
  get(url: string, options?: Omit<VisitOptions, 'method'>) {
    return this.visit(url, { ...options, method: 'GET' });
  },
  post(url: string, data?: any, options?: Omit<VisitOptions, 'method' | 'data'>) {
    return this.visit(url, { ...options, method: 'POST', data });
  },
  put(url: string, data?: any, options?: Omit<VisitOptions, 'method' | 'data'>) {
    return this.visit(url, { ...options, method: 'PUT', data });
  },
  patch(url: string, data?: any, options?: Omit<VisitOptions, 'method' | 'data'>) {
    return this.visit(url, { ...options, method: 'PATCH', data });
  },
  delete(url: string, options?: Omit<VisitOptions, 'method'>) {
    return this.visit(url, { ...options, method: 'DELETE' });
  },
  on(event: RouterEvent, cb: () => void) {
    routerListeners[event].add(cb);
    return () => {
      routerListeners[event].delete(cb);
    };
  },
};

export function useNavigation() {
  const [navigating, setNavigating] = useState(false);
  useEffect(() => {
    const offStart = router.on('start', () => setNavigating(true));
    const offFinish = router.on('finish', () => setNavigating(false));
    return () => {
      offStart();
      offFinish();
    };
  }, []);
  return { navigating };
}

function upsertHeadMeta(attr: 'name' | 'property', key: string, content?: string) {
  if (typeof document === 'undefined' || !content) return;
  let el = document.head.querySelector(\`meta[\${attr}="\${key}"]\`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function Head({
  title,
  description,
  canonical,
}: {
  title?: string;
  description?: string;
  canonical?: string;
}) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (title) {
      document.title = title;
      upsertHeadMeta('property', 'og:title', title);
    }
    if (description) {
      upsertHeadMeta('name', 'description', description);
      upsertHeadMeta('property', 'og:description', description);
    }
    if (canonical) {
      let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', canonical);
    }
  }, [title, description, canonical]);
  return null;
}

export function Link({
  href,
  method,
  data,
  replace,
  preserveScroll,
  preserveState,
  className,
  onClick: userOnClick,
  children,
  ...rest
}: any) {
  const handleClick = (e: MouseEvent) => {
    userOnClick?.(e);
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    router.visit(href, { method, data, replace, preserveScroll, preserveState });
  };
  return (
    <a href={href} onClick={handleClick} className={className} {...rest}>
      {children}
    </a>
  );
}

export function useForm<T extends Record<string, any>>(initialValues: T) {
  const [data, setDataState] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [processing, setProcessing] = useState(false);
  const [wasSuccessful, setWasSuccessful] = useState(false);

  const setData = (keyOrUpdater: keyof T | Partial<T> | ((prev: T) => T), value?: any) => {
    if (typeof keyOrUpdater === 'function') {
      setDataState(keyOrUpdater);
    } else if (typeof keyOrUpdater === 'object' && keyOrUpdater !== null) {
      setDataState((prev) => ({ ...prev, ...keyOrUpdater }));
    } else {
      setDataState((prev) => ({ ...prev, [keyOrUpdater]: value }));
    }
  };

  const reset = (...fields: (keyof T)[]) => {
    if (fields.length === 0) {
      setDataState(initialValues);
      return;
    }
    setDataState((prev) => {
      const next = { ...prev };
      for (const f of fields) next[f] = initialValues[f];
      return next;
    });
  };

  const submit = async (
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    options?: {
      preserveScroll?: boolean;
      preserveState?: boolean;
      onSuccess?: () => void;
      onError?: (errs: any) => void;
    }
  ) => {
    setProcessing(true);
    setWasSuccessful(false);
    setErrors({});
    try {
      await router.visit(url, {
        method,
        data,
        preserveScroll: options?.preserveScroll,
        preserveState: options?.preserveState,
      });
      setWasSuccessful(true);
      options?.onSuccess?.();
    } catch (err: any) {
      const fieldErrors = err?.errors || {};
      setErrors(fieldErrors);
      options?.onError?.(fieldErrors);
    } finally {
      setProcessing(false);
    }
  };

  return {
    data,
    setData,
    errors,
    processing,
    wasSuccessful,
    reset,
    post: (url: string, opts?: any) => submit('POST', url, opts),
    put: (url: string, opts?: any) => submit('PUT', url, opts),
    patch: (url: string, opts?: any) => submit('PATCH', url, opts),
    delete: (url: string, opts?: any) => submit('DELETE', url, opts),
  };
}

export async function createBirApp({
  resolve,
}: {
  resolve: (name: string) => Promise<any>;
}) {
  const el = document.getElementById('app');
  if (!el) return;

  const rawPage = el.getAttribute('data-page');
  if (!rawPage) return;

  const initialPage: PageData = JSON.parse(rawPage);
  const initialMod = await resolve(initialPage.component);
  const InitialComponent = initialMod.default;

  function AppShell() {
    const [page, setPage] = useState<PageData>(initialPage);
    const [Component, setComponent] = useState<any>(() => InitialComponent);
    const [navigating, setNavigating] = useState(false);

    useEffect(() => {
      activeVisit = async (url: string, options: VisitOptions = {}) => {
        setNavigating(true);
        emitRouterEvent('start');
        try {
          const method = (options.method || 'GET').toUpperCase();
          const headers: Record<string, string> = {
            'X-Bir-Inertia': 'true',
            Accept: 'application/json',
          };
          const init: RequestInit = { method, headers };
          if (options.data !== undefined && method !== 'GET') {
            const hasFile =
              typeof FormData !== 'undefined' &&
              (options.data instanceof FormData ||
                (typeof options.data === 'object' &&
                  Object.values(options.data).some((v) => v instanceof File || v instanceof Blob)));

            if (hasFile) {
              const fd = options.data instanceof FormData ? options.data : new FormData();
              if (!(options.data instanceof FormData)) {
                for (const [k, v] of Object.entries(options.data)) {
                  if (v !== undefined && v !== null) fd.append(k, v as any);
                }
              }
              init.body = fd;
            } else {
              headers['Content-Type'] = 'application/json';
              init.body = JSON.stringify(options.data);
            }
          }

          const res = await fetch(url, init);
          if (res.status === 422) {
            const errPayload = await res.json().catch(() => ({}));
            throw errPayload;
          }
          if (res.status === 409) {
            const redirectLoc = res.headers.get('X-Bir-Inertia-Location');
            if (redirectLoc) window.location.href = redirectLoc;
            return;
          }
          if (!res.ok) {
            window.location.href = url;
            return;
          }

          const nextPage: PageData = await res.json();
          const mod = await resolve(nextPage.component);
          setComponent(() => mod.default);
          setPage(nextPage);

          if (options.replace) {
            window.history.replaceState(nextPage, '', nextPage.url);
          } else {
            window.history.pushState(nextPage, '', nextPage.url);
          }
          if (!options.preserveScroll) {
            window.scrollTo({ top: 0 });
          }
        } finally {
          setNavigating(false);
          emitRouterEvent('finish');
        }
      };

      const onPopState = async (event: PopStateEvent) => {
        if (event.state?.component) {
          const mod = await resolve(event.state.component);
          setComponent(() => mod.default);
          setPage(event.state);
        } else {
          await activeVisit?.(window.location.pathname + window.location.search, { replace: true });
        }
      };

      window.history.replaceState(initialPage, '', initialPage.url);
      window.addEventListener('popstate', onPopState);
      return () => {
        window.removeEventListener('popstate', onPopState);
      };
    }, []);

    const pageElement = h(Component, page.props);
    const rendered =
      typeof Component?.layout === 'function'
        ? Component.layout(pageElement, page.props)
        : Array.isArray(Component?.layout)
          ? Component.layout.reduceRight((acc: any, Layout: any) => h(Layout, page.props, acc), pageElement)
          : pageElement;

    return (
      <PageContext.Provider value={page}>
        {rendered}
        {navigating && (
          <div
            id="bir-progress-bar"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, #10b981, #3b82f6)',
              zIndex: 9999,
            }}
          />
        )}
      </PageContext.Provider>
    );
  }

  if (el.innerHTML.trim().length > 0) {
    hydrate(<AppShell />, el);
  } else {
    render(<AppShell />, el);
  }
}
`;
    writeFileSync(join(projectDir, 'resources/js/bir-inertia.tsx'), inertiaClientContent, 'utf-8');

    const appTsxContent = `import { createBirApp } from './bir-inertia';

const pages = import.meta.glob('../../views/pages/**/*.${jsxExt}');

createBirApp({
  resolve: async (name) => {
    const normalized = name.replace(/\\./g, '/');
    const loader = pages[\`../../views/pages/\${normalized}.${jsxExt}\`];
    if (!loader) {
      throw new Error(\`[BirJS] Page component not found: views/pages/\${normalized}.${jsxExt}\`);
    }
    return loader();
  },
});
`;
    writeFileSync(join(projectDir, 'resources/js/app.tsx'), appTsxContent, 'utf-8');
  }

  // 1. package.json scripts & dependencies
  const devScripts: Record<string, string> = {
    start: `tsx app.${ext}`,
  };

  const devDependencies: Record<string, string> = {};
  if (isTS) {
    devDependencies['typescript'] = '^5.7.0';
    devDependencies['@types/node'] = '^22.0.0';
  }
  devDependencies['tsx'] = '^4.19.0';

  const dependencies: Record<string, string> = {
    birframework: `^${VERSION}`,
    preact: '^10.25.0',
  };

  if (usesInertia) {
    devDependencies['vite'] = '^6.0.0';
    devDependencies['concurrently'] = '^9.1.0';
    devDependencies['@preact/preset-vite'] = '^2.9.0';
    if (isTailwind) {
      devDependencies['tailwindcss'] = '^4.0.0';
      devDependencies['@tailwindcss/vite'] = '^4.0.0';
    }

    devScripts['dev'] = 'concurrently -c "#00f5d4,#7209b7,#f72585,#ffb703" --names="server,queue,logs,vite" "npm run dev:server" "npm run dev:queue" "npm run dev:logs" "npm run dev:vite"';
    devScripts['dev:server'] = `tsx watch app.${ext}`;
    devScripts['dev:queue'] = 'npx bir queue:work';
    devScripts['dev:logs'] = 'npx bir pail';
    devScripts['dev:vite'] = 'vite';
    devScripts['build'] = 'vite build';

    const viteConfigContent = `import { defineConfig } from 'vite';
${isTailwind ? "import tailwindcss from '@tailwindcss/vite';\n" : ''}import preact from '@preact/preset-vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/build/' : '/',
  plugins: [
    ${isTailwind ? 'tailwindcss(),\n    ' : ''}preact(),
    {
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
    manifest: 'manifest.json',
    outDir: 'public/build',
    copyPublicDir: false,
    rollupOptions: {
      input: ['resources/css/app.css', 'resources/js/app.tsx'],
    },
  },
  server: {
    origin: 'http://localhost:5173',
    cors: true,
  },
}));
`;
    writeFileSync(join(projectDir, 'vite.config.js'), viteConfigContent, 'utf-8');
  } else {
    if (isTailwind) {
      devDependencies['@tailwindcss/cli'] = '^4.0.0';
      devDependencies['tailwindcss'] = '^4.0.0';
      devDependencies['concurrently'] = '^9.1.0';
      devScripts['build:css'] = 'npx @tailwindcss/cli -i ./resources/css/app.css -o ./public/css/app.css --minify';
      devScripts['watch:css'] = 'npx @tailwindcss/cli -i ./resources/css/app.css -o ./public/css/app.css --watch';
      devScripts['dev'] = 'concurrently -c "#00f5d4,#7209b7,#f72585,#ffb703" --names="server,queue,logs,css" "npm run dev:server" "npm run dev:queue" "npm run dev:logs" "npm run watch:css"';
      devScripts['dev:server'] = `tsx watch app.${ext}`;
      devScripts['dev:queue'] = 'npx bir queue:work';
      devScripts['dev:logs'] = 'npx bir pail';
      devScripts['build'] = 'npm run build:css';
    } else {
      devDependencies['concurrently'] = '^9.1.0';
      devScripts['dev'] = 'concurrently -c "#00f5d4,#7209b7,#f72585" --names="server,queue,logs" "npm run dev:server" "npm run dev:queue" "npm run dev:logs"';
      devScripts['dev:server'] = `tsx watch app.${ext}`;
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

  // 2. JSX runtime and TypeScript settings
  {
    const tsconfig = {
      compilerOptions: {
        target: 'ESNext',
        allowJs: !isTS,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        allowImportingTsExtensions: true,
        noEmit: true,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        jsx: 'react-jsx',
        jsxImportSource: 'preact',
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
  const renderMethod = usesInertia ? 'inertia' : 'render';
  const controllerContent = `${isTS ? "import type { Context } from 'birframework';\n\n" : ''}export class HomeController {
  async index(ctx${isTS ? ': Context' : ''}) {
    return ctx.${renderMethod}('Welcome', {
      title: 'BirJS',
      version: '${VERSION}',
      nodeVersion: process.version,
    });
  }
}
`;
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
  if (usesInertia && !isTailwind) {
    writeFileSync(join(projectDir, 'resources/css/app.css'), cssFileContent, 'utf-8');
  }

  // 6 & 7. Preact views
  const viteHead = usesInertia
    ? `        <Vite entries={['resources/css/app.css', 'resources/js/app.tsx']} />`
    : '        <link rel="stylesheet" href="/css/app.css" />';

  const jsxLayout = `${usesInertia ? "import { Vite } from 'birframework/jsx';\n\n" : ''}export function Layout({ title, children }${isTS ? ': { title: string; children?: any }' : ''}) {
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

  const jsxWelcome = `/** @jsxImportSource preact */
import { Layout } from './layouts/Layout.${jsxExt}';

export default function Welcome(props${isTS ? ': { title: string; version: string; nodeVersion: string }' : ''}) {
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

  if (usesInertia) {
    const preactPageWelcome = `${isTS ? "import { useState } from 'preact/hooks';\n\n" : "import { useState } from 'preact/hooks';\n\n"}export default function Welcome(props${isTS ? ': { title: string; version: string; nodeVersion: string }' : ''}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col justify-between">
      <header className="border-b border-zinc-800/80 bg-[#09090b]/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-200">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">BirJS</span>
            <span className="text-[11px] px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/70 text-zinc-400 font-mono">
              v{props.version}
            </span>
          </div>
          <nav className="flex items-center gap-5 text-xs text-zinc-400">
            <a href="https://birjs.com" target="_blank" className="hover:text-white transition-colors">Documentation</a>
            <a href="https://github.com/ferdisahin/BirFramework" target="_blank" className="hover:text-white transition-colors">GitHub</a>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition-colors cursor-pointer"
            >
              Stack Info
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-20 flex-1 flex flex-col justify-center w-full">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] bg-zinc-900 border border-zinc-800 text-zinc-300 w-fit mb-6 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>BirJS v{props.version} &bull; Unified Preact + SSR</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white max-w-3xl leading-[1.08]">
          The full-stack framework for TypeScript artisans.
        </h1>

        <p className="mt-5 text-base sm:text-lg text-zinc-400 max-w-2xl leading-relaxed font-normal">
          Laravel backend ergonomics paired with a unified Preact + SSR frontend. One TSX standard across your entire app.
        </p>

        <div className="mt-8 p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 max-w-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-zinc-300 font-mono">
            <span className="text-zinc-500 select-none">$</span>
            <span>Edit <code className="text-white bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60 font-mono text-[11px]">views/pages/Welcome.${jsxExt}</code> to get started</span>
          </div>
          <a
            href="https://birjs.com/docs/installation"
            target="_blank"
            className="text-xs font-medium px-3 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 transition-colors shrink-0"
          >
            Read Docs
          </a>
        </div>
      </main>

      <footer className="border-t border-zinc-800/80 bg-[#09090b]/40">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between text-xs text-zinc-500">
          <div>Node.js {props.nodeVersion} &bull; BirFramework v{props.version}</div>
          <div>MIT Licensed</div>
        </div>
      </footer>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-zinc-950 border border-zinc-800 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-white">Unified Full-Stack Architecture</h2>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              This modal is powered by client-side Preact state, hydrated seamlessly over BirJS server-rendered HTML.
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="mt-5 px-3 py-1.5 rounded bg-white text-zinc-950 text-xs font-medium cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
`;
    writeFileSync(join(projectDir, `views/pages/Welcome.${jsxExt}`), preactPageWelcome, 'utf-8');
  }

  // 8. app.[ts|js] (Entry Point)
  const appContent = `import { Application, logger${usesInertia ? ', Inertia' : ''} } from 'birframework';

const app = new Application();
app.use(logger());
${usesInertia ? 'app.use(Inertia.middleware());\n' : ''}
// Load application routes safely before accepting requests
try {
  await import('./routes/web.${ext}');
} catch (err) {
  app.catchBootError(err);
}

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', (port) => {
  console.log(\`BirJS ready at http://localhost:\${port || PORT}\`);
});
`;
  writeFileSync(join(projectDir, `app.${ext}`), appContent, 'utf-8');

  // 9. Vercel Serverless Ready Configuration
  writeVercelConfig(projectDir);

  console.log(`\x1b[32m✔ Project created successfully!\x1b[0m`);
  console.log(`\nTo get started:\n`);
  console.log(`  cd ${name}`);
  console.log(`  npm install`);
  console.log(`  npm run dev\n`);
  console.log(`\x1b[90m⚡ Deploy to Vercel instantly: import the project into Vercel and configure APP_KEY\x1b[0m\n`);
}

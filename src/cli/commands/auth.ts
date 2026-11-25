import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { makeModel } from './make.js';

function ensureDir(filePath: string) {
  const dir = resolve(filePath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function scaffoldAuth() {
  console.log('\x1b[36m⚡ Scaffolding full-stack authentication system (Laravel Breeze style)...\x1b[0m');

  const layoutExtension = existsSync(resolve('views/layouts/Layout.jsx')) ? 'jsx' : 'tsx';
  // 1. Generate User model
  makeModel('User', false);

  // 2. Migration: create_users_table
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '_')
    .slice(0, 19);

  const migrationDir = resolve(process.cwd(), 'database/migrations');
  if (!existsSync(migrationDir)) {
    mkdirSync(migrationDir, { recursive: true });
  }

  const migrationFile = join(migrationDir, `${timestamp}_create_users_table.ts`);

  const migrationTemplate = `import { Schema, type Blueprint } from 'birframework';

export default {
  async up() {
    await Schema.create('users', (table: Blueprint) => {
      table.id();
      table.string('name');
      table.string('email').unique();
      table.string('password');
      table.string('role').default('user');
      table.timestamps();
    });
  },

  async down() {
    await Schema.dropIfExists('users');
  }
};
`;
  writeFileSync(migrationFile, migrationTemplate, 'utf-8');
  console.log(`\x1b[32m✔ Migration created:\x1b[0m database/migrations/${timestamp}_create_users_table.ts`);

  // 3. AuthController
  const controllerPath = resolve(process.cwd(), 'app/controllers/AuthController.ts');
  ensureDir(controllerPath);

  const controllerTemplate = `import { type Context, Auth, Hash, csrfToken } from 'birframework';
import { User } from '../models/User.js';

function publicUser(user: User | null) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export class AuthController {
  public showLogin(ctx: Context) {
    if (Auth.check(ctx)) {
      ctx.header('Location', '/dashboard');
      return ctx.status(302).text('');
    }
    return ctx.render('auth/login', { csrfToken: csrfToken(ctx), title: 'Sign In', error: null });
  }

  public async login(ctx: Context) {
    const body = await ctx.body();
    const { email, password } = body;

    if (!email || !password) {
      return ctx.render('auth/login', { csrfToken: csrfToken(ctx), title: 'Sign In', error: 'Email and password are required' }, 422);
    }

    const loggedIn = await Auth.attempt(ctx, { email, password }, User);
    if (!loggedIn) {
      if (ctx.headers['accept']?.includes('application/json')) {
        return ctx.json({ error: 'Invalid email or password' }, 401);
      }
      return ctx.render('auth/login', { csrfToken: csrfToken(ctx), title: 'Sign In', error: 'Invalid email or password' }, 401);
    }

    if (ctx.headers['accept']?.includes('application/json')) {
      const user = await Auth.user(ctx, User);
      return ctx.json({ message: 'Logged in successfully', user: publicUser(user) });
    }

    ctx.header('Location', '/dashboard');
    return ctx.status(302).text('');
  }

  public showRegister(ctx: Context) {
    if (Auth.check(ctx)) {
      ctx.header('Location', '/dashboard');
      return ctx.status(302).text('');
    }
    return ctx.render('auth/register', { csrfToken: csrfToken(ctx), title: 'Create Account', error: null });
  }

  public async register(ctx: Context) {
    const body = await ctx.body();
    const { name, email, password } = body;

    if (!email || !password) {
      return ctx.render('auth/register', { csrfToken: csrfToken(ctx), title: 'Create Account', error: 'Email and password are required' }, 422);
    }

    const existing = await User.where('email', '=', email).first();
    if (existing) {
      return ctx.render('auth/register', { csrfToken: csrfToken(ctx), title: 'Create Account', error: 'Email is already taken' }, 400);
    }

    const hashedPassword = Hash.make(password);
    const user = await User.create({
      name: name || 'User',
      email,
      password: hashedPassword,
      role: 'user',
    });

    await Auth.login(ctx, user);

    if (ctx.headers['accept']?.includes('application/json')) {
      return ctx.json({ message: 'Registered successfully', user: publicUser(user) }, 201);
    }

    ctx.header('Location', '/dashboard');
    return ctx.status(302).text('');
  }

  public async dashboard(ctx: Context) {
    const user = await Auth.user(ctx, User);
    return ctx.render('dashboard', { csrfToken: csrfToken(ctx), title: 'Dashboard', user });
  }

  public logout(ctx: Context) {
    Auth.logout(ctx);
    if (ctx.headers['accept']?.includes('application/json')) {
      return ctx.json({ message: 'Logged out successfully' });
    }
    ctx.header('Location', '/login');
    return ctx.status(302).text('');
  }
}
`;
  writeFileSync(controllerPath, controllerTemplate, 'utf-8');
  console.log(`\x1b[32m✔ Controller created:\x1b[0m app/controllers/AuthController.ts`);

  // 4. Preact views: login, register and dashboard
  const loginTsxPath = resolve(process.cwd(), 'views/auth/login.tsx');
  ensureDir(loginTsxPath);
  writeFileSync(
    loginTsxPath,
    `/** @jsxImportSource preact */
import { Layout } from '../layouts/Layout.${layoutExtension}';
import { Csrf } from 'birframework/jsx';

export default function Login(props: { error?: string }) {
  return (
    <Layout title="Sign In">
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl p-8">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold tracking-tight text-white">Welcome back</h1>
            <p className="text-xs text-zinc-500 mt-1">Sign in to your account to continue</p>
          </div>
          {props.error && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
              {props.error}
            </div>
          )}
          <form method="POST" action="/login" className="space-y-4">
            <Csrf />
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email address</label>
              <input type="email" name="email" required placeholder="you@example.com" className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 px-3.5 py-2 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
              <input type="password" name="password" required placeholder="••••••••" className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 px-3.5 py-2 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none transition" />
            </div>
            <button type="submit" className="w-full bg-white hover:bg-zinc-200 text-zinc-950 font-medium py-2.5 px-4 rounded-lg text-xs transition cursor-pointer">
              Sign In
            </button>
          </form>
          <div className="mt-6 pt-5 border-t border-zinc-900 text-center text-xs text-zinc-500">
            Don't have an account? <a href="/register" className="text-white font-medium hover:underline ml-1">Sign up</a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
`,
    'utf-8'
  );
  console.log(`\x1b[32m✔ View created:\x1b[0m views/auth/login.tsx`);

  const registerTsxPath = resolve(process.cwd(), 'views/auth/register.tsx');
  writeFileSync(
    registerTsxPath,
    `/** @jsxImportSource preact */
import { Layout } from '../layouts/Layout.${layoutExtension}';
import { Csrf } from 'birframework/jsx';

export default function Register(props: { error?: string }) {
  return (
    <Layout title="Create Account">
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl p-8">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold tracking-tight text-white">Create an account</h1>
            <p className="text-xs text-zinc-500 mt-1">Get started with your new application</p>
          </div>
          {props.error && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
              {props.error}
            </div>
          )}
          <form method="POST" action="/register" className="space-y-4">
            <Csrf />
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Full name</label>
              <input type="text" name="name" required placeholder="Jane Doe" className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 px-3.5 py-2 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email address</label>
              <input type="email" name="email" required placeholder="you@example.com" className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 px-3.5 py-2 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
              <input type="password" name="password" required minLength={6} placeholder="••••••••" className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 px-3.5 py-2 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none transition" />
            </div>
            <button type="submit" className="w-full bg-white hover:bg-zinc-200 text-zinc-950 font-medium py-2.5 px-4 rounded-lg text-xs transition cursor-pointer">
              Create Account
            </button>
          </form>
          <div className="mt-6 pt-5 border-t border-zinc-900 text-center text-xs text-zinc-500">
            Already have an account? <a href="/login" className="text-white font-medium hover:underline ml-1">Sign in</a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
`,
    'utf-8'
  );
  console.log(`\x1b[32m✔ View created:\x1b[0m views/auth/register.tsx`);

  const dashboardTsxPath = resolve(process.cwd(), 'views/dashboard.tsx');
  writeFileSync(
    dashboardTsxPath,
    `/** @jsxImportSource preact */
import { Layout } from './layouts/Layout.${layoutExtension}';
import { Csrf } from 'birframework/jsx';

export default function Dashboard(props: { user: { id: number; name: string; email: string; role?: string } }) {
  return (
    <Layout title="Dashboard">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between pb-6 border-b border-zinc-900">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
            <p className="text-xs text-zinc-500 mt-1">Logged in as <span className="font-medium text-white">{props.user.email}</span></p>
          </div>
          <form method="POST" action="/logout">
            <Csrf />
            <button type="submit" className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 px-3.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer">
              Sign Out
            </button>
          </form>
        </div>
        <div className="mt-8 bg-zinc-950 border border-zinc-900 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Account Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="text-zinc-500 text-[11px] mb-1">User ID</div>
              <div className="font-semibold text-white">#{props.user.id}</div>
            </div>
            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="text-zinc-500 text-[11px] mb-1">Name</div>
              <div className="font-semibold text-white">{props.user.name}</div>
            </div>
            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="text-zinc-500 text-[11px] mb-1">Role</div>
              <div className="font-semibold text-emerald-400 uppercase tracking-wider text-[11px]">{props.user.role || 'USER'}</div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
`,
    'utf-8'
  );
  console.log(`\x1b[32m✔ View created:\x1b[0m views/dashboard.tsx`);

  // 5. Append routes to routes/web.ts if exists and not already appended
  const routesFile = existsSync(resolve(process.cwd(), 'routes/web.ts'))
    ? resolve(process.cwd(), 'routes/web.ts')
    : existsSync(resolve(process.cwd(), 'routes/web.js'))
      ? resolve(process.cwd(), 'routes/web.js')
      : null;

  if (routesFile) {
    const existingContent = readFileSync(routesFile, 'utf-8');
    if (!existingContent.includes('AuthController')) {
      const routesSnippet = `
// --- Authentication Routes (scaffolded by bir make:auth) ---
import { AuthController } from '../app/controllers/AuthController.js';
import { auth, guest, csrf } from 'birframework';

const authController = new AuthController();

Route.get('/login', (ctx) => authController.showLogin(ctx)).middleware(guest());
Route.post('/login', (ctx) => authController.login(ctx)).middleware(guest(), csrf());
Route.get('/register', (ctx) => authController.showRegister(ctx)).middleware(guest());
Route.post('/register', (ctx) => authController.register(ctx)).middleware(guest(), csrf());
Route.get('/dashboard', (ctx) => authController.dashboard(ctx)).middleware(auth());
Route.post('/logout', (ctx) => authController.logout(ctx)).middleware(auth(), csrf());
`;
      writeFileSync(routesFile, existingContent + routesSnippet, 'utf-8');
      console.log(`\x1b[32m✔ Routes registered in:\x1b[0m ${routesFile.replace(process.cwd() + '/', '')}`);
    }
  }

  console.log(`\n\x1b[32m✔ Authentication scaffolding completed successfully!\x1b[0m`);
  console.log(`\nNext steps:`);
  console.log(`  1. Run migrations: \x1b[36mnpx bir migrate\x1b[0m`);
  console.log(`  2. Visit \x1b[36mhttp://localhost:3000/login\x1b[0m to test!\n`);
}

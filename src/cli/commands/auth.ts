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

  const controllerTemplate = `import { type Context, Auth, Hash } from 'birframework';
import { User } from '../models/User.js';

export class AuthController {
  public showLogin(ctx: Context) {
    if (Auth.check(ctx)) {
      ctx.header('Location', '/dashboard');
      return ctx.status(302).text('');
    }
    return ctx.render('auth/login', { title: 'Sign In', error: null });
  }

  public async login(ctx: Context) {
    const body = await ctx.body();
    const { email, password } = body;

    if (!email || !password) {
      return ctx.render('auth/login', { title: 'Sign In', error: 'Email and password are required' }, 422);
    }

    const loggedIn = await Auth.attempt(ctx, { email, password }, User);
    if (!loggedIn) {
      if (ctx.headers['accept']?.includes('application/json')) {
        return ctx.json({ error: 'Invalid email or password' }, 401);
      }
      return ctx.render('auth/login', { title: 'Sign In', error: 'Invalid email or password' }, 401);
    }

    if (ctx.headers['accept']?.includes('application/json')) {
      const user = await Auth.user(ctx, User);
      return ctx.json({ message: 'Logged in successfully', user });
    }

    ctx.header('Location', '/dashboard');
    return ctx.status(302).text('');
  }

  public showRegister(ctx: Context) {
    if (Auth.check(ctx)) {
      ctx.header('Location', '/dashboard');
      return ctx.status(302).text('');
    }
    return ctx.render('auth/register', { title: 'Create Account', error: null });
  }

  public async register(ctx: Context) {
    const body = await ctx.body();
    const { name, email, password } = body;

    if (!email || !password) {
      return ctx.render('auth/register', { title: 'Create Account', error: 'Email and password are required' }, 422);
    }

    const existing = await User.where('email', '=', email).first();
    if (existing) {
      return ctx.render('auth/register', { title: 'Create Account', error: 'Email is already taken' }, 400);
    }

    const hashedPassword = Hash.make(password);
    const user = await User.create({
      name: name || 'User',
      email,
      password: hashedPassword,
    });

    await Auth.login(ctx, user);

    if (ctx.headers['accept']?.includes('application/json')) {
      return ctx.json({ message: 'Registered successfully', user }, 201);
    }

    ctx.header('Location', '/dashboard');
    return ctx.status(302).text('');
  }

  public async dashboard(ctx: Context) {
    const user = await Auth.user(ctx, User);
    return ctx.render('dashboard', { title: 'Dashboard', user });
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

  // 4. Views: login, register, dashboard
  const loginViewPath = resolve(process.cwd(), 'views/auth/login.html');
  ensureDir(loginViewPath);

  const loginViewTemplate = `<x-layouts.app title="Sign In">
  <div class="min-h-[70vh] flex items-center justify-center px-4 py-12">
    <div class="w-full max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 shadow-xs">
      <div class="mb-6 text-center">
        <h1 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">Welcome back</h1>
        <p class="text-xs text-zinc-500 mt-1">Sign in to your account to continue</p>
      </div>

      @if(error)
        <div class="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium">
          {{ error }}
        </div>
      @endif

      <form method="POST" action="/login" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Email address</label>
          <input 
            type="email" 
            name="email" 
            required 
            placeholder="you@example.com"
            class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 px-3.5 py-2 rounded-lg text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none transition" 
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Password</label>
          <input 
            type="password" 
            name="password" 
            required 
            placeholder="••••••••"
            class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 px-3.5 py-2 rounded-lg text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none transition" 
          />
        </div>

        <button 
          type="submit" 
          class="w-full bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-black font-medium py-2.5 px-4 rounded-lg text-xs transition shadow-xs"
        >
          Sign In
        </button>
      </form>

      <div class="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-900 text-center text-xs text-zinc-500">
        Don't have an account? 
        <a href="/register" class="text-zinc-900 dark:text-white font-medium hover:underline ml-1">Sign up</a>
      </div>
    </div>
  </div>
</x-layouts.app>
`;
  writeFileSync(loginViewPath, loginViewTemplate, 'utf-8');
  console.log(`\x1b[32m✔ View created:\x1b[0m views/auth/login.html`);

  const registerViewPath = resolve(process.cwd(), 'views/auth/register.html');
  const registerViewTemplate = `<x-layouts.app title="Create Account">
  <div class="min-h-[70vh] flex items-center justify-center px-4 py-12">
    <div class="w-full max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 shadow-xs">
      <div class="mb-6 text-center">
        <h1 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">Create an account</h1>
        <p class="text-xs text-zinc-500 mt-1">Get started with your new application</p>
      </div>

      @if(error)
        <div class="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium">
          {{ error }}
        </div>
      @endif

      <form method="POST" action="/register" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Full name</label>
          <input 
            type="text" 
            name="name" 
            required 
            placeholder="Jane Doe"
            class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 px-3.5 py-2 rounded-lg text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none transition" 
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Email address</label>
          <input 
            type="email" 
            name="email" 
            required 
            placeholder="you@example.com"
            class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 px-3.5 py-2 rounded-lg text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none transition" 
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Password</label>
          <input 
            type="password" 
            name="password" 
            required 
            placeholder="••••••••"
            class="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 px-3.5 py-2 rounded-lg text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none transition" 
          />
        </div>

        <button 
          type="submit" 
          class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-lg text-xs transition shadow-xs"
        >
          Create Account
        </button>
      </form>

      <div class="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-900 text-center text-xs text-zinc-500">
        Already have an account? 
        <a href="/login" class="text-zinc-900 dark:text-white font-medium hover:underline ml-1">Sign in</a>
      </div>
    </div>
  </div>
</x-layouts.app>
`;
  writeFileSync(registerViewPath, registerViewTemplate, 'utf-8');
  console.log(`\x1b[32m✔ View created:\x1b[0m views/auth/register.html`);

  const dashboardViewPath = resolve(process.cwd(), 'views/dashboard.html');
  const dashboardViewTemplate = `<x-layouts.app title="Dashboard">
  <div class="max-w-4xl mx-auto px-6 py-12">
    <!-- Header -->
    <div class="flex items-center justify-between pb-6 border-b border-zinc-200 dark:border-zinc-900">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Dashboard</h1>
        <p class="text-xs text-zinc-500 mt-1">Logged in as <span class="font-medium text-zinc-900 dark:text-white">{{ user.email }}</span></p>
      </div>

      <form method="POST" action="/logout">
        <button 
          type="submit"
          class="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 px-3.5 py-1.5 rounded-md text-xs font-medium transition"
        >
          Sign Out
        </button>
      </form>
    </div>

    <!-- User Profile Card -->
    <div class="mt-8 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-xl p-6">
      <h2 class="text-sm font-semibold text-zinc-900 dark:text-white mb-4">Account Overview</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div class="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div class="text-zinc-500 text-[11px] mb-1">User ID</div>
          <div class="font-semibold text-zinc-900 dark:text-white">#{{ user.id }}</div>
        </div>
        <div class="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div class="text-zinc-500 text-[11px] mb-1">Name</div>
          <div class="font-semibold text-zinc-900 dark:text-white">{{ user.name }}</div>
        </div>
        <div class="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div class="text-zinc-500 text-[11px] mb-1">Role</div>
          <div class="font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[11px]">{{ user.role || 'USER' }}</div>
        </div>
      </div>
    </div>
  </div>
</x-layouts.app>
`;
  writeFileSync(dashboardViewPath, dashboardViewTemplate, 'utf-8');
  console.log(`\x1b[32m✔ View created:\x1b[0m views/dashboard.html`);

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
import { auth, guest } from 'birframework';

const authController = new AuthController();

Route.get('/login', (ctx) => authController.showLogin(ctx)).middleware(guest());
Route.post('/login', (ctx) => authController.login(ctx)).middleware(guest());
Route.get('/register', (ctx) => authController.showRegister(ctx)).middleware(guest());
Route.post('/register', (ctx) => authController.register(ctx)).middleware(guest());
Route.get('/dashboard', (ctx) => authController.dashboard(ctx)).middleware(auth());
Route.post('/logout', (ctx) => authController.logout(ctx)).middleware(auth());
`;
      writeFileSync(routesFile, existingContent + routesSnippet, 'utf-8');
      console.log(`\x1b[32m✔ Routes registered in:\x1b[0m ${routesFile.replace(process.cwd() + '/', '')}`);
    }
  }

  console.log(`\n\x1b[32m✔ Authentication scaffolding completed successfully!\x1b[0m`);
  console.log(`\nNext steps:`);
  console.log(`  1. Run migrations: \x1b[36mnpx birframework migrate\x1b[0m`);
  console.log(`  2. Visit \x1b[36mhttp://localhost:3000/login\x1b[0m to test!\n`);
}

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { makeModel, makeMigration } from './make.js';

function ensureDir(filePath: string) {
  const dir = resolve(filePath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function scaffoldAuth() {
  console.log('\x1b[36m⚡ Scaffolding full-stack authentication system (Laravel Breeze style)...\x1b[0m');

  // 1. Generate User model & migration
  makeModel('User', false);

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '_')
    .slice(0, 19);

  const migrationFile = join(resolve(process.cwd(), 'database/migrations'), `${timestamp}_create_users_table.ts`);
  ensureDir(migrationFile);

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

  // 2. AuthController
  const controllerPath = resolve(process.cwd(), 'app/controllers/AuthController.ts');
  ensureDir(controllerPath);

  const controllerTemplate = `import { type Context, Auth, Hash } from 'birframework';
import { User } from '../models/User.js';

export class AuthController {
  public showLogin(ctx: Context) {
    return ctx.render('auth/login', { title: 'Login' });
  }

  public async login(ctx: Context) {
    const body = await ctx.body();
    const { email, password } = body;

    const loggedIn = await Auth.attempt(ctx, { email, password }, User);
    if (!loggedIn) {
      if (ctx.headers['accept']?.includes('application/json')) {
        return ctx.json({ error: 'Invalid email or password' }, 401);
      }
      return ctx.render('auth/login', { title: 'Login', error: 'Invalid email or password' }, 401);
    }

    if (ctx.headers['accept']?.includes('application/json')) {
      const user = await Auth.user(ctx, User);
      return ctx.json({ message: 'Logged in successfully', user });
    }

    ctx.header('Location', '/');
    return ctx.status(302).text('');
  }

  public showRegister(ctx: Context) {
    return ctx.render('auth/register', { title: 'Register' });
  }

  public async register(ctx: Context) {
    const body = await ctx.body();
    const { name, email, password } = body;

    if (!email || !password) {
      return ctx.json({ error: 'Email and password are required' }, 400);
    }

    const existing = await User.where('email', '=', email).first();
    if (existing) {
      return ctx.render('auth/register', { title: 'Register', error: 'Email is already taken' }, 400);
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

    ctx.header('Location', '/');
    return ctx.status(302).text('');
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

  // 3. Views: views/auth/login.html & views/auth/register.html
  const loginViewPath = resolve(process.cwd(), 'views/auth/login.html');
  ensureDir(loginViewPath);

  const loginViewTemplate = `<x-layouts.app title="Sign In">
  <div style="max-width: 400px; margin: 2rem auto; background: #1e293b; padding: 2rem; border-radius: 8px;">
    <h2>Sign In to Your Account</h2>

    @if (error)
      <div style="background: #ef4444; color: white; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem;">
        {{ error }}
      </div>
    @endif

    <form method="POST" action="/login" style="display: flex; flex-direction: column; gap: 1rem;">
      <div>
        <label style="display: block; margin-bottom: 0.25rem;">Email Address</label>
        <input type="email" name="email" required style="width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid #475569; background: #0f172a; color: white;" />
      </div>

      <div>
        <label style="display: block; margin-bottom: 0.25rem;">Password</label>
        <input type="password" name="password" required style="width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid #475569; background: #0f172a; color: white;" />
      </div>

      <button type="submit" style="background: #3b82f6; color: white; padding: 0.75rem; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">
        Sign In
      </button>

      <p style="font-size: 0.9rem; text-align: center; color: #94a3b8;">
        Don't have an account? <a href="/register" style="color: #38bdf8;">Sign up</a>
      </p>
    </form>
  </div>
</x-layouts.app>
`;
  writeFileSync(loginViewPath, loginViewTemplate, 'utf-8');
  console.log(`\x1b[32m✔ View created:\x1b[0m views/auth/login.html`);

  const registerViewPath = resolve(process.cwd(), 'views/auth/register.html');
  const registerViewTemplate = `<x-layouts.app title="Create Account">
  <div style="max-width: 400px; margin: 2rem auto; background: #1e293b; padding: 2rem; border-radius: 8px;">
    <h2>Create a New Account</h2>

    @if (error)
      <div style="background: #ef4444; color: white; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem;">
        {{ error }}
      </div>
    @endif

    <form method="POST" action="/register" style="display: flex; flex-direction: column; gap: 1rem;">
      <div>
        <label style="display: block; margin-bottom: 0.25rem;">Full Name</label>
        <input type="text" name="name" required style="width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid #475569; background: #0f172a; color: white;" />
      </div>

      <div>
        <label style="display: block; margin-bottom: 0.25rem;">Email Address</label>
        <input type="email" name="email" required style="width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid #475569; background: #0f172a; color: white;" />
      </div>

      <div>
        <label style="display: block; margin-bottom: 0.25rem;">Password</label>
        <input type="password" name="password" required style="width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid #475569; background: #0f172a; color: white;" />
      </div>

      <button type="submit" style="background: #10b981; color: white; padding: 0.75rem; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">
        Register
      </button>

      <p style="font-size: 0.9rem; text-align: center; color: #94a3b8;">
        Already have an account? <a href="/login" style="color: #38bdf8;">Sign in</a>
      </p>
    </form>
  </div>
</x-layouts.app>
`;
  writeFileSync(registerViewPath, registerViewTemplate, 'utf-8');
  console.log(`\x1b[32m✔ View created:\x1b[0m views/auth/register.html`);

  console.log(`\n\x1b[32m✔ Authentication scaffolding completed successfully!\x1b[0m`);
  console.log(`\nNext steps:`);
  console.log(`  1. Run migrations: \x1b[36m./bin/bir.js migrate\x1b[0m`);
  console.log(`  2. Add the routes in \x1b[36mroutes/web.ts\x1b[0m:`);
  console.log(`     Route.get('/login', (ctx) => authController.showLogin(ctx));`);
  console.log(`     Route.post('/login', (ctx) => authController.login(ctx));`);
  console.log(`     Route.get('/register', (ctx) => authController.showRegister(ctx));`);
  console.log(`     Route.post('/register', (ctx) => authController.register(ctx));`);
  console.log(`     Route.post('/logout', (ctx) => authController.logout(ctx));\n`);
}

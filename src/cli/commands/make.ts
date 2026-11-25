import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function assertValidName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Name must be a non-empty string.');
  }
  if (name.includes('..') || name.includes('\0') || !/^[a-zA-Z0-9_/]+$/.test(name)) {
    throw new Error(`[BirCLI] Invalid name or path traversal attempt: "${name}"`);
  }
  return name.replace(/^[/\\]+/, '');
}

export function makeController(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a controller name. E.g.: bir make:controller UserController');
    return;
  }
  try {
    assertValidName(name);
  } catch (err: any) {
    console.error(`\x1b[31m[Error]\x1b[0m ${err.message}`);
    return;
  }

  const cleanName = name.endsWith('Controller') ? name : `${name}Controller`;
  const targetPath = resolve(process.cwd(), 'app/controllers', `${cleanName}.ts`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m ${cleanName} already exists!`);
    return;
  }

  ensureDir(targetPath);

  const template = `import type { Context } from 'birframework';

export class ${cleanName} {
  public async index(ctx: Context) {
    return ctx.json({ message: '${cleanName} list' });
  }

  public async show(ctx: Context) {
    const { id } = ctx.params;
    return ctx.json({ message: \`${cleanName} detail: \${id}\` });
  }

  public async store(ctx: Context) {
    const body = await ctx.body();
    return ctx.json({ message: '${cleanName} created', data: body }, 201);
  }

  public async update(ctx: Context) {
    const { id } = ctx.params;
    const body = await ctx.body();
    return ctx.json({ message: \`${cleanName} \${id} updated\`, data: body });
  }

  public async destroy(ctx: Context) {
    const { id } = ctx.params;
    return ctx.json({ message: \`${cleanName} \${id} deleted\` });
  }
}
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Controller created successfully:\x1b[0m app/controllers/${cleanName}.ts`);
}

export function makeMiddleware(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a middleware name. E.g.: bir make:middleware Auth');
    return;
  }

  const cleanName = name.endsWith('Middleware') ? name : `${name}Middleware`;
  const targetPath = resolve(process.cwd(), 'app/middlewares', `${cleanName}.ts`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m ${cleanName} already exists!`);
    return;
  }

  ensureDir(targetPath);

  const template = `import type { Middleware } from 'birframework';

export const ${cleanName}: Middleware = async (ctx, next) => {
  // Pre-request processing (e.g. Auth / Token verification)
  const token = ctx.headers['authorization'];
  if (!token) {
    return ctx.json({ error: 'Unauthorized' }, 401);
  }

  // Pass to the next middleware or route handler
  await next();

  // Post-response processing
};
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Middleware created successfully:\x1b[0m app/middlewares/${cleanName}.ts`);
}

export interface MakeModelOptions {
  migration?: boolean;
  controller?: boolean;
  resource?: boolean;
  factory?: boolean;
  seeder?: boolean;
  all?: boolean;
}

export function makeModel(name: string, optionsOrMigration: boolean | MakeModelOptions = false) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a model name. E.g.: bir make:model User [-m] [-c] [-r] [-f] [-s] [--all]');
    return;
  }

  const opts: MakeModelOptions =
    typeof optionsOrMigration === 'boolean'
      ? { migration: optionsOrMigration }
      : optionsOrMigration;

  const withAll = Boolean(opts.all);
  const withMigration = Boolean(opts.migration || withAll);
  const withFactory = Boolean(opts.factory || withAll);
  const withSeeder = Boolean(opts.seeder || withAll);
  const withController = Boolean(opts.controller || opts.resource || withAll);

  const cleanName = name.charAt(0).toUpperCase() + name.slice(1);
  const targetPath = resolve(process.cwd(), 'app/models', `${cleanName}.ts`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m Model ${cleanName} already exists!`);
    return;
  }

  ensureDir(targetPath);

  const tableName = cleanName.toLowerCase().endsWith('s')
    ? cleanName.toLowerCase()
    : `${cleanName.toLowerCase()}s`;

  const template = `import { Model } from 'birframework';

export class ${cleanName} extends Model {
  public static override table = '${tableName}';
}
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Model created successfully:\x1b[0m app/models/${cleanName}.ts`);

  if (withMigration) {
    makeMigration(`create_${tableName}_table`);
  }
  if (withFactory) {
    makeFactory(`${cleanName}Factory`);
  }
  if (withSeeder) {
    makeSeeder(`${cleanName}Seeder`);
  }
  if (withController) {
    makeController(`${cleanName}Controller`);
  }
}

export function makeMigration(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a migration name. E.g.: bir make:migration create_users_table');
    return;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '_')
    .slice(0, 19);

  const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const filename = `${timestamp}_${cleanName}.ts`;
  const migrationsDir = resolve(process.cwd(), 'database/migrations');
  const targetPath = join(migrationsDir, filename);

  ensureDir(targetPath);

  const match = cleanName.match(/create_([a-z0-9_]+)_table/);
  const tableName = match ? match[1] : 'items';

  const template = `import { Schema, type Blueprint } from 'birframework';

export default {
  async up() {
    Schema.create('${tableName}', (table: Blueprint) => {
      table.id();
      table.string('name');
      table.timestamps();
    });
  },

  async down() {
    Schema.dropIfExists('${tableName}');
  }
};
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Migration created successfully:\x1b[0m database/migrations/${filename}`);
}

export function makeMail(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a mailable name. E.g.: bir make:mail WelcomeNotification');
    return;
  }

  const cleanName = name.endsWith('Mail') ? name : `${name}Mail`;
  const targetPath = resolve(process.cwd(), 'app/mail', `${cleanName}.ts`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m Mailable ${cleanName} already exists!`);
    return;
  }

  ensureDir(targetPath);

  const template = `import { Mailable } from 'birframework';

export class ${cleanName} extends Mailable {
  constructor(public user: any) {
    super();
  }

  public override build(): this {
    return this.subject('Welcome to our Platform')
               .view('emails.welcome', { user: this.user });
  }
}
export default ${cleanName};
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Mailable created successfully:\x1b[0m app/mail/${cleanName}.ts`);
}

export function makeJob(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a job name. E.g.: bir make:job SendWelcomeEmail');
    return;
  }

  const cleanName = name.endsWith('Job') ? name : name;
  const targetPath = resolve(process.cwd(), 'app/jobs', `${cleanName}.ts`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m Job ${cleanName} already exists!`);
    return;
  }

  ensureDir(targetPath);

  const template = `import { Job } from 'birframework';

export class ${cleanName} extends Job {
  constructor(public data: Record<string, any> = {}) {
    super();
  }

  public async handle(): Promise<void> {
    console.log('[${cleanName}] Processing job with data:', this.data);
    // Execute asynchronous background task here
  }
}
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Job created successfully:\x1b[0m app/jobs/${cleanName}.ts`);
}

export function makeSeeder(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a seeder name. E.g.: bir make:seeder UserSeeder');
    return;
  }

  const cleanName = name.endsWith('Seeder') ? name : `${name}Seeder`;
  const targetPath = resolve(process.cwd(), 'database/seeders', `${cleanName}.ts`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m Seeder ${cleanName} already exists!`);
    return;
  }

  ensureDir(targetPath);

  const template = `import { Seeder } from 'birframework';

export class ${cleanName} extends Seeder {
  public async run(): Promise<void> {
    // Insert initial seed records
  }
}
export default ${cleanName};
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Seeder created successfully:\x1b[0m database/seeders/${cleanName}.ts`);
}

export function makeFactory(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a factory name. E.g.: bir make:factory UserFactory');
    return;
  }

  const cleanName = name.endsWith('Factory') ? name : `${name}Factory`;
  const modelName = cleanName.replace(/Factory$/, '');
  const targetPath = resolve(process.cwd(), 'database/factories', `${cleanName}.ts`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m Factory ${cleanName} already exists!`);
    return;
  }

  ensureDir(targetPath);

  const template = `import { Factory, type Faker } from 'birframework';
import { ${modelName} } from '../../app/models/${modelName}.js';

export const ${cleanName} = Factory.define(${modelName}, (faker: Faker) => ({
  name: faker.name(),
  email: faker.email(),
  created_at: new Date(),
  updated_at: new Date(),
}));
export default ${cleanName};
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Factory created successfully:\x1b[0m database/factories/${cleanName}.ts`);
}

export function makeEvent(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify an event name. E.g.: bir make:event UserRegistered');
    return;
  }

  const cleanName = name;
  const targetPath = resolve(process.cwd(), 'app/events', `${cleanName}.ts`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m Event ${cleanName} already exists!`);
    return;
  }

  ensureDir(targetPath);

  const template = `export class ${cleanName} {
  constructor(public data: any) {}
}
export default ${cleanName};
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Event created successfully:\x1b[0m app/events/${cleanName}.ts`);
}

export function makeListener(name: string, eventName?: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a listener name. E.g.: bir make:listener SendWelcomeNotification');
    return;
  }

  const cleanName = name.endsWith('Listener') ? name : `${name}Listener`;
  const targetPath = resolve(process.cwd(), 'app/listeners', `${cleanName}.ts`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m Listener ${cleanName} already exists!`);
    return;
  }

  ensureDir(targetPath);

  const eventImport = eventName ? `import { ${eventName} } from '../events/${eventName}.js';\n\n` : '';
  const paramType = eventName || 'any';

  const template = `${eventImport}export class ${cleanName} {
  public async handle(event: ${paramType}): Promise<void> {
    // Process event
  }
}
export default ${cleanName};
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Listener created successfully:\x1b[0m app/listeners/${cleanName}.ts`);
}

export function makeRequest(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a request name. E.g.: bir make:request StoreUserRequest');
    return;
  }

  const cleanName = name.endsWith('Request') ? name : `${name}Request`;
  const targetPath = resolve(process.cwd(), 'app/requests', `${cleanName}.ts`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m Form Request ${cleanName} already exists!`);
    return;
  }

  ensureDir(targetPath);

  const template = `import { FormRequest, type ValidationRules } from 'birframework';

export class ${cleanName} extends FormRequest {
  /**
   * Determine if the user is authorized to make this request.
   */
  public override async authorize(): Promise<boolean> {
    return true;
  }

  /**
   * Get the validation rules that apply to the request.
   */
  public override rules(): ValidationRules {
    return {
      // Define your validation rules here, e.g.:
      // email: 'required|email',
      // password: 'required|min:8',
    };
  }
}
export default ${cleanName};
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Form Request created successfully:\x1b[0m app/requests/${cleanName}.ts`);
}

/**
 * Write Vercel serverless configuration (`vercel.json` and `api/index.js`) into `rootDir`.
 */
export function writeVercelConfig(rootDir: string = process.cwd()): { vercelJsonPath: string; apiIndexPath: string } {
  const apiDir = resolve(rootDir, 'api');
  const vercelJsonPath = resolve(rootDir, 'vercel.json');
  const apiIndexPath = resolve(apiDir, 'index.js');

  if (!existsSync(apiDir)) {
    mkdirSync(apiDir, { recursive: true });
  }

  // 1. vercel.json
  const vercelConfig = {
    buildCommand: 'npm run build --if-present',
    outputDirectory: 'public',
    functions: {
      'api/index.js': {
        includeFiles: '{views/**,docs/**,storage/**,public/**}'
      }
    },
    rewrites: [
      {
        source: '/(.*)',
        destination: '/api/index.js'
      }
    ]
  };

  writeFileSync(vercelJsonPath, JSON.stringify(vercelConfig, null, 2) + '\n', 'utf-8');

  // 2. api/index.js
  const apiIndexContent = `import { Application, compress, serveStatic, Inertia, logger } from 'birframework';
import '../routes/web.js';

const app = new Application();
app.use(compress({ threshold: 512 }));
app.use(serveStatic({ publicDir: 'public' }));
app.use(Inertia.middleware());

if (process.env.NODE_ENV !== 'production') {
  app.use(logger());
}

export default app.serverless();
`;

  writeFileSync(apiIndexPath, apiIndexContent, 'utf-8');
  return { vercelJsonPath, apiIndexPath };
}

export function makeVercel() {
  const rootDir = process.cwd();
  writeVercelConfig(rootDir);
  console.log(`\x1b[32m✔ Created:\x1b[0m vercel.json`);
  console.log(`\x1b[32m✔ Created:\x1b[0m api/index.js`);

  console.log(`\n\x1b[36m🚀 Vercel serverless configuration ready!\x1b[0m`);
  console.log(`\x1b[90mYou can now deploy by running:\x1b[0m`);
  console.log(`  \x1b[32mvercel\x1b[0m  \x1b[90m(or push to GitHub)\x1b[0m\n`);
}

export function makeProvider(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a provider name. E.g.: bir make:provider AppServiceProvider');
    return;
  }
  try {
    assertValidName(name);
  } catch (err: any) {
    console.error(`\x1b[31m[Error]\x1b[0m ${err.message}`);
    return;
  }

  const cleanName = name.endsWith('ServiceProvider')
    ? name
    : (name.endsWith('Provider') ? `${name}` : `${name}ServiceProvider`);
  const targetPath = resolve(process.cwd(), 'app/providers', `${cleanName}.ts`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m Provider ${cleanName} already exists!`);
    return;
  }

  ensureDir(targetPath);

  const template = `import { ServiceProvider } from 'birframework';

export class ${cleanName} extends ServiceProvider {
  /**
   * Register bindings or singletons in the IoC container.
   */
  public register(): void {
    // Example: this.app.container.singleton('my_service', () => new MyService());
  }

  /**
   * Bootstrap application services or routes when the app boots.
   */
  public async boot(): Promise<void> {
    // Example: this.app.router.get('/plugin-route', (ctx) => ctx.json({ active: true }));
  }
}
export default ${cleanName};
`;

  writeFileSync(targetPath, template, 'utf-8');
  console.log(`\x1b[32m✔ Service Provider created successfully:\x1b[0m app/providers/${cleanName}.ts`);
}

function isJsxProject(): boolean {
  return (
    existsSync(resolve(process.cwd(), 'views/Welcome.tsx')) ||
    existsSync(resolve(process.cwd(), 'views/layouts/Layout.tsx'))
  );
}

export function makeComponent(name: string, withJs: boolean = false, jsx?: boolean) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a component name. E.g.: bir make:component modal [-j|--js] [--jsx]');
    return;
  }
  try {
    assertValidName(name);
  } catch (err: any) {
    console.error(`\x1b[31m[Error]\x1b[0m ${err.message}`);
    return;
  }

  const useJsx = jsx ?? isJsxProject();
  const cleanName = name.replace(/\.(bir|html|tsx|jsx)$/, '');
  const baseName = cleanName.split('/').pop() || cleanName;

  if (useJsx) {
    const pascalName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    const parentParts = cleanName.split('/');
    parentParts[parentParts.length - 1] = pascalName;
    const componentPath = parentParts.join('/');
    const targetPath = resolve(process.cwd(), 'views/components', `${componentPath}.tsx`);

    if (existsSync(targetPath)) {
      console.error(`\x1b[31m[Error]\x1b[0m Component ${componentPath}.tsx already exists!`);
      return;
    }

    ensureDir(targetPath);

    const tsxContent = `export interface ${pascalName}Props {
  title?: string;
  children?: any;
}

export function ${pascalName}({ title, children }: ${pascalName}Props) {
  return (
    <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/40">
      {title && <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>}
      <div>{children}</div>
    </div>
  );
}
`;
    writeFileSync(targetPath, tsxContent, 'utf-8');
    console.log(`\x1b[32m✔ TSX Component created successfully:\x1b[0m views/components/${componentPath}.tsx`);
    console.log(`\x1b[90mUsage: import { ${pascalName} } from '@/views/components/${componentPath}';\x1b[0m`);
    return;
  }

  if (withJs) {
    // Co-located folder component: views/components/<name>/<name>.bir and <name>.js
    const componentDir = resolve(process.cwd(), 'views/components', cleanName);
    const templatePath = resolve(componentDir, `${baseName}.bir`);
    const scriptPath = resolve(componentDir, `${baseName}.js`);

    if (existsSync(templatePath)) {
      console.error(`\x1b[31m[Error]\x1b[0m Component ${cleanName} already exists!`);
      return;
    }

    ensureDir(templatePath);

    const templateContent = `<div class="${baseName}">
  <h3>{{ title || '${baseName}' }}</h3>
  <div>
    {!! slot !!}
  </div>
</div>
`;

    const scriptContent = `// ${baseName}.js - Companion script for <x-${cleanName.replace(/\//g, '.')}>
export default function (el: HTMLElement) {
  // 'el' is this specific component instance's root DOM element.
  // Use el.querySelector() instead of document.querySelector() to prevent DOM collisions!
  console.log('[BirComponent] ${baseName} mounted:', el);
}
`;

    writeFileSync(templatePath, templateContent, 'utf-8');
    writeFileSync(scriptPath, scriptContent, 'utf-8');

    console.log(`\x1b[32m✔ Component created successfully with companion JavaScript:\x1b[0m`);
    console.log(`  ➜ views/components/${cleanName}/${baseName}.bir`);
    console.log(`  ➜ views/components/${cleanName}/${baseName}.js`);
    console.log(`\x1b[90mUsage in views: <x-${cleanName.replace(/\//g, '.')} />\x1b[0m`);
  } else {
    // Single file component: views/components/<name>.bir
    const targetPath = resolve(process.cwd(), 'views/components', `${cleanName}.bir`);

    if (existsSync(targetPath)) {
      console.error(`\x1b[31m[Error]\x1b[0m Component ${cleanName} already exists!`);
      return;
    }

    ensureDir(targetPath);

    const templateContent = `<div class="${baseName}">
  <h3>{{ title || '${baseName}' }}</h3>
  <div>
    {!! slot !!}
  </div>
</div>
`;

    writeFileSync(targetPath, templateContent, 'utf-8');
    console.log(`\x1b[32m✔ Component created successfully:\x1b[0m views/components/${cleanName}.bir`);
    console.log(`\x1b[90mUsage in views: <x-${cleanName.replace(/\//g, '.')} />\x1b[0m`);
  }
}

export function makeView(name: string, jsx?: boolean) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a view name. E.g.: bir make:view Dashboard [--jsx]');
    return;
  }
  try {
    assertValidName(name);
  } catch (err: any) {
    console.error(`\x1b[31m[Error]\x1b[0m ${err.message}`);
    return;
  }

  const useJsx = jsx ?? isJsxProject();
  const cleanName = name.replace(/\.(bir|html|tsx|jsx)$/, '').replace(/\./g, '/');
  const baseName = cleanName.split('/').pop() || cleanName;
  const pascalName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

  if (useJsx) {
    const parts = cleanName.split('/');
    parts[parts.length - 1] = pascalName;
    const viewPath = parts.join('/');
    const targetPath = resolve(process.cwd(), 'views', `${viewPath}.tsx`);

    if (existsSync(targetPath)) {
      console.error(`\x1b[31m[Error]\x1b[0m View ${viewPath}.tsx already exists!`);
      return;
    }

    ensureDir(targetPath);

    const depth = parts.length - 1;
    const layoutImport = depth === 0 ? './layouts/Layout.js' : `${'../'.repeat(depth)}layouts/Layout.js`;

    const tsxContent = `import { Layout } from '${layoutImport}';

export default function ${pascalName}(props: { title?: string }) {
  return (
    <Layout title={props.title || '${pascalName}'}>
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-white">${pascalName}</h1>
        <p className="text-sm text-zinc-400 mt-2">Rendered via BirJS TSX View Engine.</p>
      </main>
    </Layout>
  );
}
`;
    writeFileSync(targetPath, tsxContent, 'utf-8');
    console.log(`\x1b[32m✔ TSX View created successfully:\x1b[0m views/${viewPath}.tsx`);
    console.log(`\x1b[90mRender in controller: return ctx.render('${viewPath}', { title: '${pascalName}' });\x1b[0m`);
  } else {
    const targetPath = resolve(process.cwd(), 'views', `${cleanName}.html`);

    if (existsSync(targetPath)) {
      console.error(`\x1b[31m[Error]\x1b[0m View ${cleanName}.html already exists!`);
      return;
    }

    ensureDir(targetPath);

    const htmlContent = `<x-layouts.app title="${pascalName}">
  <main class="max-w-4xl mx-auto px-6 py-12">
    <h1 class="text-2xl font-bold text-white">${pascalName}</h1>
    <p class="text-sm text-zinc-400 mt-2">Rendered via BirJS Blade Engine.</p>
  </main>
</x-layouts.app>
`;
    writeFileSync(targetPath, htmlContent, 'utf-8');
    console.log(`\x1b[32m✔ Blade View created successfully:\x1b[0m views/${cleanName}.html`);
    console.log(`\x1b[90mRender in controller: return ctx.render('${cleanName}');\x1b[0m`);
  }
}

export function makeIsland(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify an island name. E.g.: bir make:island ProfileModal');
    return;
  }
  try {
    assertValidName(name);
  } catch (err: any) {
    console.error(`\x1b[31m[Error]\x1b[0m ${err.message}`);
    return;
  }

  const cleanName = name.replace(/\.(tsx|jsx)$/, '');
  const pascalName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  const targetPath = resolve(process.cwd(), 'views/islands', `${pascalName}.tsx`);

  if (existsSync(targetPath)) {
    console.error(`\x1b[31m[Error]\x1b[0m Island ${pascalName}.tsx already exists!`);
    return;
  }

  ensureDir(targetPath);

  const islandContent = `/** @jsxImportSource preact */
import { useState } from 'preact/hooks';

export interface ${pascalName}Props {
  label?: string;
}

export default function ${pascalName}({ label = 'Open ${pascalName}' }: ${pascalName}Props) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white hover:bg-zinc-800 transition cursor-pointer"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl bg-zinc-950 border border-zinc-800 p-6 text-white">
            <h2 className="text-base font-semibold">${pascalName}</h2>
            <p className="text-xs text-zinc-400 mt-1">Interactive Preact Island mounted cleanly.</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 px-3 py-1.5 rounded bg-white text-zinc-950 text-xs font-medium cursor-pointer"
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
  writeFileSync(targetPath, islandContent, 'utf-8');
  console.log(`\x1b[32m✔ Preact Island created successfully:\x1b[0m views/islands/${pascalName}.tsx`);
  console.log(`\x1b[90mUsage in any SSR .tsx view: <Island name="${pascalName}" props={{ label: 'Profile' }} />\x1b[0m`);
}


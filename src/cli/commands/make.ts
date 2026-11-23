import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function makeController(name: string) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a controller name. E.g.: bir make:controller UserController');
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

export function makeModel(name: string, withMigration: boolean = false) {
  if (!name) {
    console.error('\x1b[31m[Error]\x1b[0m You must specify a model name. E.g.: bir make:model User');
    return;
  }

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

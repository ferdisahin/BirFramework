import { makeController, makeMiddleware, makeModel, makeMigration, makeJob, makeMail, makeSeeder, makeFactory, makeEvent, makeListener, makeRequest, makeVercel, makeProvider, makeComponent, makeView } from './commands/make.js';
import { listRoutes } from './commands/routes.js';
import { createNewProject } from './commands/new.js';
import { scaffoldAuth } from './commands/auth.js';
import { runTinker } from './commands/tinker.js';
import { runPail } from './commands/pail.js';
import { runDoctor } from './commands/doctor.js';
import { defaultRouter } from '../router/router.js';
import { migrator } from '../database/migrator.js';
import { dbConnection } from '../database/connection.js';
import { worker } from '../queue/worker.js';
import { Queue } from '../queue/queue.js';
import { Schedule } from '../schedule/schedule.js';
import { SeederRunner } from '../database/seeder.js';
import { VERSION } from '../version.js';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

function findLocalFile(candidates: string[]): string | undefined {
  return candidates.find((file) => existsSync(resolve(file)));
}

async function withCliDatabase<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } finally {
    await dbConnection.close();
  }
}

export async function runCLI(args: string[] = process.argv.slice(2)) {
  process.on('SIGINT', () => {
    console.log('\n\x1b[90mOperation cancelled.\x1b[0m\n');
    process.exit(0);
  });

  const command = args[0] || 'help';
  if (['new', 'make:component', 'make:view', 'make:auth', 'auth:scaffold'].includes(command) && args.includes('--blade')) {
    throw new Error('[BirCLI] Blade templates have been removed. Use Preact .tsx/.jsx views.');
  }

  switch (command) {
    case 'serve':
    case 'start': {
      const portIndex = args.indexOf('--port');
      const port = portIndex === -1 ? process.env.PORT || '3000' : args[portIndex + 1];
      if (!port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
        throw new Error('[BirCLI] --port must be an integer between 1 and 65535.');
      }

      const entry = findLocalFile([
        'app.ts', 'app.js', 'src/app.ts', 'src/app.js', 'example/app.ts', 'index.ts', 'index.js',
      ]);
      if (!entry) throw new Error('[BirCLI] Application entry file not found (app.ts or app.js).');

      console.log('\n\x1b[1m\x1b[35m' +
`  ____  _       ______                                           _    
 |  _ \\(_)     |  ____|                                         | |   
 | |_) |_ _ __ | |__ _ __ __ _ _ __ ___   _____      _____  _ __| | __
 |  _ <| | '__||  __| '__/ _\` | '_ \` _ \\ / _ \\ \\ /\\ / / _ \\| '__| |/ /
 | |_) | | |   | |  | | | (_| | | | | | |  __/\\ V  V / (_) | |  |   < 
 |____/|_|_|   |_|  |_|  \\__,_|_| |_| |_|\\___| \\_/\\_/ \\___/|_|  |_|\\_\\` +
      '\x1b[0m\n');
      console.log(`\x1b[32m✔ Starting development server...\x1b[0m`);
      console.log(`\x1b[36m  ➜ Local:   http://localhost:${port}\x1b[0m`);
      console.log(`\x1b[90m  ➜ Press Ctrl+C to stop\x1b[0m\n`);

      const useTsx = entry.endsWith('.ts') || existsSync(resolve('tsconfig.json'));
      let launcher = process.execPath;
      let watchArgs = ['--watch', entry];
      if (useTsx) {
        try {
          watchArgs = [createRequire(resolve('package.json')).resolve('tsx/cli'), 'watch', entry];
        } catch {
          launcher = 'npx';
          watchArgs = ['tsx', 'watch', entry];
        }
      }
      const child = spawn(launcher, watchArgs, {
        stdio: 'inherit',
        env: { ...process.env, PORT: port },
      });

      child.once('error', (error) => {
        console.error('[BirCLI] Could not start the server:', error.message);
        process.exitCode = 1;
      });
      await new Promise<void>((done) => {
        child.once('close', (code, signal) => {
          if (code !== null) process.exitCode = code;
          else if (signal !== 'SIGINT' && signal !== 'SIGTERM') process.exitCode = 1;
          done();
        });
      });
      break;
    }

    case 'route:list': {
      const routeFile = findLocalFile(['routes/web.ts', 'routes/web.js', 'src/routes/web.ts', 'src/routes/web.js']);
      if (routeFile) await import(pathToFileURL(resolve(routeFile)).href);
      listRoutes(defaultRouter);
      break;
    }

    case 'make:controller': {
      makeController(args[1] || '');
      break;
    }

    case 'make:middleware': {
      makeMiddleware(args[1] || '');
      break;
    }

    case 'make:model': {
      const shortFlags = args.filter((a) => a.startsWith('-') && !a.startsWith('--')).join('');
      const name = args.find((a, i) => i > 0 && !a.startsWith('-')) || '';
      makeModel(name, {
        migration: args.includes('--migration') || shortFlags.includes('m'),
        controller: args.includes('--controller') || shortFlags.includes('c'),
        resource: args.includes('--resource') || shortFlags.includes('r'),
        factory: args.includes('--factory') || shortFlags.includes('f'),
        seeder: args.includes('--seeder') || shortFlags.includes('s'),
        all: args.includes('--all') || shortFlags.includes('a'),
      });
      break;
    }

    case 'make:migration': {
      makeMigration(args[1] || '');
      break;
    }

    case 'make:job': {
      makeJob(args[1] || '');
      break;
    }

    case 'make:mail': {
      makeMail(args[1] || '');
      break;
    }

    case 'make:seeder': {
      makeSeeder(args[1] || '');
      break;
    }

    case 'make:factory': {
      makeFactory(args[1] || '');
      break;
    }

    case 'make:event': {
      makeEvent(args[1] || '');
      break;
    }

    case 'make:listener': {
      const eventName = args.includes('--event') ? args[args.indexOf('--event') + 1] : undefined;
      makeListener(args[1] || '', eventName);
      break;
    }

    case 'make:request': {
      makeRequest(args[1] || '');
      break;
    }

    case 'make:provider': {
      makeProvider(args[1] || '');
      break;
    }

    case 'make:component': {
      if (args.includes('-j') || args.includes('--js')) {
        throw new Error('[BirCLI] Companion scripts have been removed. Add behavior inside the Preact component.');
      }
      const name = args.find((a, i) => i > 0 && !a.startsWith('-')) || '';
      makeComponent(name);
      break;
    }

    case 'make:view': {
      const name = args.find((a, i) => i > 0 && !a.startsWith('-')) || '';
      makeView(name);
      break;
    }

    case 'make:island': {
      throw new Error('[BirCLI] make:island has been removed. Use a Preact component in views/pages with the Inertia profile.');
    }

    case 'make:vercel': {
      makeVercel();
      break;
    }

    case 'db:seed': {
      await withCliDatabase(() => SeederRunner.run());
      break;
    }

    case 'migrate': {
      console.log('\x1b[36m⏳ Running migrations...\x1b[0m');
      const executed = await withCliDatabase(() => migrator.run());
      if (executed.length === 0) {
        console.log('\x1b[33mNothing to migrate. Database is up to date.\x1b[0m');
      } else {
        for (const file of executed) {
          console.log(`\x1b[32m✔ Migrated:\x1b[0m ${file}`);
        }
        console.log(`\x1b[32m✔ Migration completed successfully!\x1b[0m\n`);
      }
      break;
    }

    case 'doctor': {
      if (!(await runDoctor())) process.exitCode = 1;
      break;
    }

    case 'migrate:status': {
      const status = await withCliDatabase(() => migrator.status());
      if (status.length === 0) console.log('No migrations found.');
      else console.table(status);
      break;
    }

    case 'migrate:rollback': {
      console.log('\x1b[36m⏳ Rolling back latest migration batch...\x1b[0m');
      const rolledBack = await withCliDatabase(() => migrator.rollback());
      if (rolledBack.length === 0) {
        console.log('\x1b[33mNo migrations to rollback.\x1b[0m');
      } else {
        for (const file of rolledBack) {
          console.log(`\x1b[33m✔ Rolled back:\x1b[0m ${file}`);
        }
        console.log(`\x1b[32m✔ Rollback completed successfully!\x1b[0m\n`);
      }
      break;
    }

    case 'queue:work': {
      const bootstrap = ['app/jobs/index.ts', 'app/jobs/index.js']
        .map((file) => resolve(file))
        .find((file) => existsSync(file));
      if (bootstrap) await import(pathToFileURL(bootstrap).href);
      const queue = args.includes('--queue') ? args[args.indexOf('--queue') + 1] : 'default';
      const once = args.includes('--once');
      await withCliDatabase(() => worker.work({ queue, once }));
      break;
    }

    case 'queue:failed': {
      const failed = await withCliDatabase(() => Queue.getFailedJobs());
      if (failed.length === 0) {
        console.log('\x1b[32m✔ No failed jobs found.\x1b[0m');
      } else {
        console.table(failed.map((j) => ({ id: j.id, queue: j.queue, name: j.name, failed_at: j.failed_at })));
      }
      break;
    }

    case 'queue:retry': {
      const target = args[1] && args[1] !== 'all' ? Number(args[1]) : 'all';
      const count = await withCliDatabase(() => Queue.retryFailedJob(target));
      console.log(`\x1b[32m✔ Re-queued ${count} failed job(s).\x1b[0m`);
      break;
    }

    case 'queue:flush': {
      const count = await withCliDatabase(() => Queue.flushFailedJobs());
      console.log(`\x1b[33m✔ Flushed ${count} failed job(s).\x1b[0m`);
      break;
    }

    case 'schedule:work': {
      await Schedule.work();
      break;
    }

    case 'schedule:run': {
      await Schedule.work({ once: true });
      break;
    }

    case 'make:auth':
    case 'auth:scaffold': {
      scaffoldAuth();
      break;
    }

    case 'down': {
      const msgArg = args.find((a) => a.startsWith('--message='));
      const retryArg = args.find((a) => a.startsWith('--retry='));
      const message = msgArg ? msgArg.slice('--message='.length) : 'Application is currently undergoing scheduled maintenance.';
      const retry = retryArg ? Number(retryArg.slice('--retry='.length)) || 60 : 60;
      const downDir = resolve(process.cwd(), 'storage/framework');
      mkdirSync(downDir, { recursive: true });
      writeFileSync(resolve(downDir, 'down.json'), JSON.stringify({ time: Date.now(), message, retry }, null, 2), 'utf-8');
      console.log('\x1b[33m✔ Application is now in maintenance mode.\x1b[0m');
      break;
    }

    case 'up': {
      const downFile = resolve(process.cwd(), 'storage/framework/down.json');
      if (existsSync(downFile)) {
        rmSync(downFile, { force: true });
      }
      console.log('\x1b[32m✔ Application is now live.\x1b[0m');
      break;
    }

    case 'key:generate': {
      const key = `base64:${randomBytes(32).toString('base64')}`;
      const envPath = resolve(process.cwd(), '.env');
      let envContent = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
      if (/^APP_KEY=.*$/m.test(envContent)) {
        envContent = envContent.replace(/^APP_KEY=.*$/m, `APP_KEY=${key}`);
      } else {
        envContent = `${envContent.trimEnd()}${envContent ? '\n' : ''}APP_KEY=${key}\n`;
      }
      writeFileSync(envPath, envContent, 'utf-8');
      console.log(`\x1b[32m✔ Application key set successfully:\x1b[0m ${key}`);
      break;
    }

    case 'dev': {
      const child = spawn('npm', ['run', 'dev'], {
        stdio: 'inherit',
        shell: true,
      });
      child.on('exit', (code: number | null) => {
        process.exit(code || 0);
      });
      break;
    }

    case 'pail':
    case 'logs': {
      runPail(args[1]);
      break;
    }

    case 'test': {
      console.log('\n\x1b[36m⚡ Running test suite with BirFramework Test Runner...\x1b[0m\n');
      const filter = args[1] && !args[1].startsWith('-') ? args[1] : undefined;
      const testArgs = ['--test'];
      if (filter) {
        testArgs.push(`tests/**/*${filter}*.test.ts`);
      } else {
        testArgs.push('tests/**/*.test.ts');
      }

      const child = spawn('npx', ['tsx', ...testArgs], {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test' },
      });

      child.on('exit', (code: number | null) => {
        process.exit(code || 0);
      });
      break;
    }

    case 'tinker': {
      await runTinker();
      break;
    }

    case 'new': {
      const name = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
      const hasJs = args.includes('--js');
      const hasTs = args.includes('--ts');
      const lang = hasJs ? 'js' : hasTs ? 'ts' : undefined;

      const hasCss = args.includes('--css') || args.includes('--vanilla-css');
      const hasTailwind = args.includes('--tailwind');
      const css = hasCss ? 'css' : hasTailwind ? 'tailwind' : undefined;

      const obsolete = args.find((arg) => ['--hotwire', '--birturbo', '--bir-turbo'].includes(arg));
      if (obsolete) {
        throw new Error(`[BirCLI] ${obsolete} has been removed. Use --inertia or --server-rendered for Preact pages.`);
      }
      const inertia = args.includes('--inertia');
      const serverRendered = ['--server-rendered', '--no-turbo', '--none'].some((flag) => args.includes(flag));
      if (inertia && serverRendered) {
        throw new Error('[BirCLI] Choose either --inertia or --server-rendered.');
      }
      const profile = inertia ? 'inertia' : serverRendered ? 'server-rendered' : undefined;
      await createNewProject(name, lang, css, profile);
      break;
    }

    case 'help':
    default: {
      console.log('\n\x1b[1m\x1b[35m' +
`  ____  _       ______                                           _    
 |  _ \\(_)     |  ____|                                         | |   
 | |_) |_ _ __ | |__ _ __ __ _ _ __ ___   _____      _____  _ __| | __
 |  _ <| | '__||  __| '__/ _\` | '_ \` _ \\ / _ \\ \\ /\\ / / _ \\| '__| |/ /
 | |_) | | |   | |  | | | (_| | | | | | |  __/\\ V  V / (_) | |  |   < 
 |____/|_|_|   |_|  |_|  \\__,_|_| |_| |_|\\___| \\_/\\_/ \\___/|_|  |_|\\_\\` +
      '\x1b[0m');
      console.log(`\x1b[1m\x1b[37m  Next-Gen TypeScript Full-Stack Framework\x1b[0m \x1b[90m(v${VERSION})\x1b[0m\n`);
      console.log('\x1b[1mAvailable Commands:\x1b[0m');
      console.log('  \x1b[32mnew <name> [--ts|--js] [--tailwind|--css] [--inertia|--server-rendered]\x1b[0m Create a new project');
      console.log('  \x1b[32mdev\x1b[0m                       Start full-stack dev dashboard (Server, Queue, Logs, Vite)');
      console.log('  \x1b[32mserve\x1b[0m                     Start the development server with hot-reload');
      console.log('  \x1b[32mpail\x1b[0m                      Live real-time application log stream');
      console.log('  \x1b[32mtest [filter]\x1b[0m             Run application automated test suites');
      console.log('  \x1b[32mtinker\x1b[0m                    Start interactive REPL console with auto-loaded models');
      console.log('  \x1b[32mroute:list\x1b[0m                List all registered application routes');
      console.log('  \x1b[32mmake:controller <name>\x1b[0m    Scaffold a new Controller');
      console.log('  \x1b[32mmake:middleware <name>\x1b[0m    Scaffold a new Middleware');
      console.log('  \x1b[32mmake:model <name> [-m]\x1b[0m    Scaffold a new Model (with optional migration)');
      console.log('  \x1b[32mmake:migration <name>\x1b[0m     Scaffold a new Migration file');
      console.log('  \x1b[32mmake:job <name>\x1b[0m           Scaffold a new Background Job class');
      console.log('  \x1b[32mmake:mail <name>\x1b[0m          Scaffold a new Mailable class');
      console.log('  \x1b[32mmake:seeder <name>\x1b[0m        Scaffold a new Database Seeder');
      console.log('  \x1b[32mmake:factory <name>\x1b[0m       Scaffold a new Model Factory');
      console.log('  \x1b[32mmake:event <name>\x1b[0m         Scaffold a new Event class');
      console.log('  \x1b[32mmake:listener <name> [--event]\x1b[0m Scaffold a new Event Listener');
      console.log('  \x1b[32mmake:request <name>\x1b[0m       Scaffold a new Form Request class');
      console.log('  \x1b[32mmake:provider <name>\x1b[0m      Scaffold a new Service Provider class');
      console.log('  \x1b[32mmake:component <name>     \x1b[0m Scaffold a Preact component');
      console.log('  \x1b[32mmake:auth\x1b[0m                 Scaffold complete Auth (Model, Controller, Views, Migration)');
      console.log('  \x1b[32mmake:vercel\x1b[0m               Scaffold zero-config Vercel Serverless deployment');
      console.log('  \x1b[32mmigrate\x1b[0m                   Run pending database migrations');
      console.log('  \x1b[32mdoctor\x1b[0m                          Check the local application setup');
      console.log('  \x1b[32mmigrate:status\x1b[0m                  List applied, pending and missing migrations');
      console.log('  \x1b[32mmigrate:rollback\x1b[0m          Rollback the latest database migration batch');
      console.log('  \x1b[32mdb:seed\x1b[0m                   Seed the database with records');
      console.log('  \x1b[32mqueue:work [--queue] [--once]\x1b[0m Start the queue worker process');
      console.log('  \x1b[32mschedule:work\x1b[0m                 Start the task scheduler daemon');
      console.log('  \x1b[32mschedule:run\x1b[0m                  Run due scheduled tasks once');
      console.log('  \x1b[32mhelp\x1b[0m                      Display this help menu\n');
      break;
    }
  }
}

// Auto-run if executed directly via CLI (not imported from bin/bir.js)
const isDirectRun = process.argv[1] && (process.argv[1].endsWith('cli/index.ts') || process.argv[1].endsWith('cli/index.js'));
if (isDirectRun) {
  runCLI().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

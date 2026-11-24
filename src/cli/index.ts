import { makeController, makeMiddleware, makeModel, makeMigration, makeJob, makeMail, makeSeeder, makeFactory, makeEvent, makeListener, makeRequest, makeVercel, makeProvider, makeComponent } from './commands/make.js';
import { listRoutes } from './commands/routes.js';
import { createNewProject } from './commands/new.js';
import { scaffoldAuth } from './commands/auth.js';
import { runTinker } from './commands/tinker.js';
import { runPail } from './commands/pail.js';
import { defaultRouter } from '../router/router.js';
import { migrator } from '../database/migrator.js';
import { worker } from '../queue/worker.js';
import { Schedule } from '../schedule/schedule.js';
import { SeederRunner } from '../database/seeder.js';
import { VERSION } from '../version.js';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export async function runCLI(args: string[] = process.argv.slice(2)) {
  process.on('SIGINT', () => {
    console.log('\n\x1b[90mOperation cancelled.\x1b[0m\n');
    process.exit(0);
  });

  const command = args[0] || 'help';

  switch (command) {
    case 'serve':
    case 'start': {
      const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : '3000';
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

      const candidates = ['app.ts', 'src/app.ts', 'example/app.ts', 'index.ts'];
      const entry = candidates.find((f) => existsSync(resolve(process.cwd(), f)));

      if (!entry) {
        console.error('\x1b[31m[Error]\x1b[0m Application entry file not found (app.ts or example/app.ts).');
        process.exit(1);
      }

      const child = spawn('npx', ['tsx', 'watch', entry], {
        stdio: 'inherit',
        env: { ...process.env, PORT: port },
      });

      child.on('exit', (code: number | null) => {
        process.exit(code || 0);
      });
      break;
    }

    case 'route:list': {
      const candidates = ['app.ts', 'src/app.ts', 'example/app.ts'];
      const entry = candidates.find((f) => existsSync(resolve(process.cwd(), f)));
      if (entry) {
        try {
          await import(resolve(process.cwd(), entry));
        } catch {
          // ignore error if importing dynamically
        }
      }
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
      const withMigration = args.includes('-m') || args.includes('--migration');
      makeModel(args[1] || '', withMigration);
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
      const withJs = args.includes('-j') || args.includes('--js');
      const name = args.find((a, i) => i > 0 && !a.startsWith('-')) || '';
      makeComponent(name, withJs);
      break;
    }

    case 'make:vercel': {
      makeVercel();
      break;
    }

    case 'db:seed': {
      await SeederRunner.run();
      break;
    }

    case 'migrate': {
      console.log('\x1b[36m⏳ Running migrations...\x1b[0m');
      const executed = await migrator.run();
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

    case 'migrate:rollback': {
      console.log('\x1b[36m⏳ Rolling back latest migration batch...\x1b[0m');
      const rolledBack = await migrator.rollback();
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
      const queue = args.includes('--queue') ? args[args.indexOf('--queue') + 1] : 'default';
      const once = args.includes('--once');
      await worker.work({ queue, once });
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

      const hasHotwire = args.includes('--hotwire');
      const hasBirTurbo = args.includes('--birturbo') || args.includes('--bir-turbo');
      const hasNoTurbo = args.includes('--no-turbo') || args.includes('--none');
      const turbo = hasNoTurbo ? 'none' : hasBirTurbo ? 'birturbo' : hasHotwire ? 'hotwire' : undefined;

      const hasBlade = args.includes('--blade');
      const hasJsx = args.includes('--jsx') || args.includes('--tsx');
      const view = hasJsx ? 'jsx' : hasBlade ? 'blade' : undefined;

      await createNewProject(name, lang, css, turbo, view);
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
      console.log('  \x1b[32mnew <name> [--ts|--js] [--tailwind|--css] [--hotwire|--birturbo|--no-turbo] [--blade|--jsx]\x1b[0m Create a new project');
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
      console.log('  \x1b[32mmake:component <name> [-j]\x1b[0m Scaffold a Blade component (optional -j for companion JS)');
      console.log('  \x1b[32mmake:auth\x1b[0m                 Scaffold complete Auth (Model, Controller, Views, Migration)');
      console.log('  \x1b[32mmake:vercel\x1b[0m               Scaffold zero-config Vercel Serverless deployment');
      console.log('  \x1b[32mmigrate\x1b[0m                   Run pending database migrations');
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

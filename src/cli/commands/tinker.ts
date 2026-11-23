import repl from 'node:repl';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as Bir from '../../index.js';
import { VERSION } from '../../version.js';

export async function runTinker(): Promise<void> {
  console.log('\n\x1b[1m\x1b[35m' +
`  ____  _       ______     _____ _       _             
 |  _ \\(_)     |  ____|   |_   _(_)     | |            
 | |_) |_ _ __ | |__        | |  _ _ __ | | _____ _ __ 
 |  _ <| | '__||  __|       | | | | '_ \\| |/ / _ \\ '__|
 | |_) | | |   | |____     _| |_| | | | |   <  __/ |   
 |____/|_|_|   |______|   |_____|_|_| |_|_|\\_\\___|_|   ` +
  '\x1b[0m');
  console.log(`\x1b[1m\x1b[37m  Interactive Tinker Shell\x1b[0m \x1b[90m(v${VERSION})\x1b[0m`);
  console.log('\x1b[90m  Top-level await enabled. Type \x1b[33m.exit\x1b[90m to leave.\x1b[0m\n');

  const r = repl.start({
    prompt: '\x1b[35mbir>\x1b[0m ',
    useColors: true,
  });

  // 1. Expose BirFramework core facades
  r.context.Bir = Bir;
  r.context.DB = Bir.DB;
  r.context.Model = Bir.Model;
  r.context.Schema = Bir.Schema;
  r.context.Cache = Bir.Cache;
  r.context.Storage = Bir.Storage;
  r.context.Event = Bir.Event;
  r.context.Queue = Bir.Queue;
  r.context.Mail = Bir.Mail;
  r.context.Schedule = Bir.Schedule;
  r.context.Hash = Bir.Hash;
  r.context.Lang = Bir.Lang;
  r.context.__ = Bir.__;
  r.context.Factory = Bir.Factory;
  r.context.faker = Bir.faker;
  r.context.Application = Bir.Application;
  r.context.Route = Bir.Route;

  // 2. Scan and load project models (e.g. app/models/*.ts or *.js)
  const modelsDir = resolve(process.cwd(), 'app/models');
  if (existsSync(modelsDir)) {
    try {
      const files = readdirSync(modelsDir);
      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          const modelName = file.replace(/\.(ts|js)$/, '');
          const fullPath = join(modelsDir, file);
          try {
            const mod = await import(pathToFileURL(fullPath).href);
            const modelClass = mod[modelName] || mod.default;
            if (modelClass) {
              r.context[modelName] = modelClass;
            }
          } catch {
            // ignore individual import errors in repl startup
          }
        }
      }
    } catch {
      // ignore readdir error
    }
  }

  // Handle REPL exit
  await new Promise<void>((resolve) => {
    r.on('exit', () => {
      console.log('\n\x1b[32mExiting BirFramework Tinker. Goodbye!\x1b[0m\n');
      resolve();
    });
  });
}

import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

export abstract class Seeder {
  abstract run(): Promise<void> | void;

  public async call(seederClass: new () => Seeder): Promise<void> {
    const seeder = new seederClass();
    await seeder.run();
  }
}

export class SeederRunner {
  public static async run(seedersDir: string = resolve(process.cwd(), 'database/seeders')): Promise<boolean> {
    const mainSeederPath = join(seedersDir, 'DatabaseSeeder.ts');
    const mainSeederJs = join(seedersDir, 'DatabaseSeeder.js');

    const target = existsSync(mainSeederPath) ? mainSeederPath : existsSync(mainSeederJs) ? mainSeederJs : null;

    if (!target) {
      console.log('\x1b[33mNo DatabaseSeeder found in database/seeders.\x1b[0m');
      return false;
    }

    try {
      console.log(`\x1b[36m⏳ Seeding database using ${target}...\x1b[0m`);
      const mod = await import(target);
      const SeederClass = mod.default || mod.DatabaseSeeder;

      if (!SeederClass) {
        throw new Error('DatabaseSeeder class must be exported as default or DatabaseSeeder.');
      }

      const instance: Seeder = new SeederClass();
      await instance.run();
      console.log(`\x1b[32m✔ Database seeding completed successfully!\x1b[0m\n`);
      return true;
    } catch (err: any) {
      console.error(`\x1b[31m[Seeder Error]\x1b[0m ${err.message}`);
      return false;
    }
  }
}

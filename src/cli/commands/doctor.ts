import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { dbConnection } from '../../database/connection.js';
import { migrator } from '../../database/migrator.js';

export async function runDoctor(): Promise<boolean> {
  let healthy = true;
  const report = (level: 'OK' | 'WARN' | 'FAIL', message: string) => {
    console.log(`[${level}] ${message}`);
    if (level === 'FAIL') healthy = false;
  };

  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  report(major > 22 || (major === 22 && minor >= 5) ? 'OK' : 'FAIL', `Node.js ${process.versions.node} (requires 22.5 or later)`);

  const entry = ['app.ts', 'app.js', 'src/app.ts', 'src/app.js'].find((file) => existsSync(resolve(file)));
  report(entry ? 'OK' : 'WARN', entry ? `Application entry: ${entry}` : 'No application entry found in this directory.');
  report(
    process.env.APP_KEY ? 'OK' : process.env.NODE_ENV === 'production' ? 'FAIL' : 'WARN',
    process.env.APP_KEY ? 'APP_KEY is configured.' : 'APP_KEY is missing. Run bir key:generate before deploying.'
  );

  const configured = process.env.DB_CONNECTION?.toLowerCase();
  const validDialect = !configured || ['sqlite', 'postgres', 'postgresql', 'mysql'].includes(configured);
  if (!validDialect) report('FAIL', 'DB_CONNECTION must be sqlite, postgres or mysql.');

  const dialect = dbConnection.dialect;
  const dependency = { sqlite: 'node:sqlite', postgres: 'pg', mysql: 'mysql2/promise' }[dialect];
  const requireFromProject = createRequire(resolve('package.json'));
  let driverAvailable = validDialect;
  try {
    if (dialect === 'sqlite') requireFromProject(dependency);
    else requireFromProject.resolve(dependency);
    report('OK', `Database driver: ${dialect}`);
  } catch {
    driverAvailable = false;
    report('FAIL', `Database driver unavailable: ${dependency}`);
  }

  if (driverAvailable) {
    try {
      const status = await migrator.status();
      const pending = status.filter((row) => row.status === 'pending').length;
      const missing = status.filter((row) => row.status === 'missing').length;
      report(pending || missing ? 'WARN' : 'OK', `Migrations: ${pending} pending, ${missing} missing from disk.`);
    } catch {
      report('FAIL', 'Could not read migration status. Check database connectivity and configuration.');
    } finally {
      await dbConnection.close();
    }
  }

  if (existsSync(resolve('vite.config.js')) || existsSync(resolve('vite.config.ts'))) {
    try {
      JSON.parse(readFileSync(resolve('public/build/manifest.json'), 'utf8'));
      report('OK', 'Vite manifest is readable.');
    } catch {
      report(process.env.NODE_ENV === 'production' ? 'FAIL' : 'WARN', 'Vite manifest is unavailable. Run npm run build before deploying.');
    }
  }
  return healthy;
}

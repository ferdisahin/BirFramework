import { spawn } from 'node:child_process';
import http from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import autocannon from './node-servers/node_modules/autocannon/autocannon.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FRAMEWORKS = [
  {
    name: 'BirJS v0.5.11',
    category: 'Full-Stack (TS/Node)',
    cmd: 'node',
    args: ['benchmarks/birjs/app.js'],
    cwd: resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      APP_KEY: 'base64:somerandomsecretkey12345678901234567890',
    },
    port: 8101,
  },
  {
    name: 'Laravel 13 (PHP 8.5)',
    category: 'Full-Stack (PHP/FPM)',
    cmd: 'php',
    args: ['artisan', 'serve', '--host=127.0.0.1', '--port=8102'],
    cwd: resolve(__dirname, 'laravel'),
    env: {
      ...process.env,
      APP_ENV: 'production',
    },
    port: 8102,
  },
  {
    name: 'Next.js 16 (App Router)',
    category: 'Full-Stack (React/RSC)',
    cmd: 'npx',
    args: ['next', 'start', '-p', '8103'],
    cwd: resolve(__dirname, 'nextjs'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    port: 8103,
  },
  {
    name: 'Nuxt 4 / Nitro (Vue 3)',
    category: 'Full-Stack (Vue/Nitro)',
    cmd: 'node',
    args: ['.output/server/index.mjs'],
    cwd: resolve(__dirname, 'nuxt'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '8104',
      NITRO_PORT: '8104',
    },
    port: 8104,
  },
  {
    name: 'Fastify 5',
    category: 'Microframework (Node)',
    cmd: 'node',
    args: ['benchmarks/node-servers/fastify.js'],
    cwd: resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    port: 8105,
  },
  {
    name: 'Express 5',
    category: 'Microframework (Node)',
    cmd: 'node',
    args: ['benchmarks/node-servers/express.js'],
    cwd: resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    port: 8106,
  },
];

async function ping(url, retries = 30, delayMs = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(url, (r) => {
          resolve(r.statusCode);
        });
        req.on('error', reject);
        req.setTimeout(500, () => {
          req.destroy(new Error('Timeout'));
        });
      });
      if (res >= 200 && res < 400) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

function runAutocannon(url, duration = 5, connections = 50) {
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url,
        connections,
        duration,
        pipelining: 1,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
  });
}

async function getProcessMemory(pid) {
  try {
    const { execSync } = await import('node:child_process');
    const out = execSync(`ps -o rss= -p ${pid}`).toString().trim();
    const kb = parseInt(out, 10);
    return isNaN(kb) ? 0 : Math.round(kb / 1024);
  } catch {
    return 0;
  }
}

async function runBenchmark() {
  console.log('===============================================================');
  console.log('   WEB FRAMEWORKS BENCHMARK SUITE (Production Mode)');
  console.log('   Concurrency: 50 connections | Duration: 5s per endpoint');
  console.log('===============================================================\n');

  const results = [];

  for (const fw of FRAMEWORKS) {
    console.log(`\n▶ Starting ${fw.name}...`);
    const proc = spawn(fw.cmd, fw.args, {
      cwd: fw.cwd,
      env: fw.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let outputLog = '';
    proc.stdout.on('data', (d) => { outputLog += d.toString(); });
    proc.stderr.on('data', (d) => { outputLog += d.toString(); });

    const apiUrl = `http://127.0.0.1:${fw.port}/api/bench`;
    const ssrUrl = `http://127.0.0.1:${fw.port}/`;

    console.log(`  Waiting for server on port ${fw.port}...`);
    const ready = await ping(apiUrl, 35, 400);

    if (!ready) {
      console.error(`  ❌ Failed to boot ${fw.name}! Logs:`);
      console.error(outputLog.slice(-500));
      proc.kill('SIGKILL');
      continue;
    }

    console.log(`  ✔ Server is ready! Warming up...`);
    // Warmup 2s
    try {
      await runAutocannon(apiUrl, 2, 10);
    } catch {}

    const memRss = await getProcessMemory(proc.pid);

    console.log(`  ⚡ Benchmarking JSON API Endpoint (/api/bench)...`);
    const apiBench = await runAutocannon(apiUrl, 5, 50);

    console.log(`  ⚡ Benchmarking SSR HTML Endpoint (/)...`);
    const ssrBench = await runAutocannon(ssrUrl, 5, 50);

    proc.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 500));

    results.push({
      framework: fw.name,
      category: fw.category,
      memoryMb: memRss,
      apiReqSec: Math.round(apiBench.requests.average),
      apiLatencyAvg: apiBench.latency.average.toFixed(2),
      apiLatencyP99: apiBench.latency.p99.toFixed(2),
      ssrReqSec: Math.round(ssrBench.requests.average),
      ssrLatencyAvg: ssrBench.latency.average.toFixed(2),
      ssrLatencyP99: ssrBench.latency.p99.toFixed(2),
    });

    console.log(`  ✔ ${fw.name} complete!`);
    console.log(`    API: ${Math.round(apiBench.requests.average)} req/s | ${apiBench.latency.average.toFixed(2)}ms avg`);
    console.log(`    SSR: ${Math.round(ssrBench.requests.average)} req/s | ${ssrBench.latency.average.toFixed(2)}ms avg`);
    console.log(`    RAM: ~${memRss} MB`);
  }

  console.log('\n\n===============================================================');
  console.log('                 FINAL BENCHMARK RESULTS');
  console.log('===============================================================\n');

  console.table(results);
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});

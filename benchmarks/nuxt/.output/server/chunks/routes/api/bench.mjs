import { d as defineEventHandler } from '../../nitro/nitro.mjs';
import 'unhead/server';
import 'vue';
import 'unhead/legacy';
import 'unhead/plugins';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';

const bench = defineEventHandler(() => {
  return {
    message: "Hello World from Nuxt Benchmark",
    framework: "Nuxt",
    timestamp: Date.now()
  };
});

export { bench as default };
//# sourceMappingURL=bench.mjs.map

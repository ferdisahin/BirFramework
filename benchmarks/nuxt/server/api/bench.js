export default defineEventHandler(() => {
  return {
    message: 'Hello World from Nuxt Benchmark',
    framework: 'Nuxt',
    timestamp: Date.now(),
  };
});

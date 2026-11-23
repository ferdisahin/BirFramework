export async function GET() {
  return Response.json({
    message: 'Hello World from Next.js Benchmark',
    framework: 'Next.js',
    timestamp: Date.now(),
  });
}

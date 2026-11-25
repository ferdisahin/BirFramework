# BirFramework on Vercel

Set the project's root directory to `examples/vercel` and use the Other framework preset. Set `APP_KEY` in the deployment environment. The example serves HTML at `/` and returns `{"status":"ok"}` at `/api/health`. It uses BirFramework's Node HTTP serverless adapter.

The package smoke test invokes this same handler with HTTP requests on loopback. An actual Vercel deployment also verifies the platform's rewrite and packaging behavior.

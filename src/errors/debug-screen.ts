import type { Context } from '../http/context.js';
import { StackParser, type StackFrame } from './stack-parser.js';
import { VERSION } from '../version.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class DebugScreen {
  private static getSolutionHint(err: any): { title: string; description: string; code?: string } | null {
    const msg = String(err?.message || '');
    const code = String(err?.code || '');

    if (code === 'ERR_MODULE_NOT_FOUND' || msg.includes('Cannot find module')) {
      if (msg.includes('/views/') || msg.includes('\\views\\')) {
        return {
          title: 'View Import Path Issue',
          description:
            'In BirFramework, the views/ directory is at the project root (not inside app/). Instead of relative ../views paths, use ctx.render() with a string name or the @/ path alias.',
          code: "return ctx.render('Home', { title: 'BirJS' }); // or import Home from '@/views/Home';",
        };
      }
      return {
        title: 'Module Not Found',
        description:
          'Verify that the imported file path exists and check your tsconfig.json path aliases (@/*).',
      };
    }

    if (msg.includes('[BirView] View template not found')) {
      return {
        title: 'View Template Not Found',
        description:
          'Ensure the view file exists inside the root views/ directory (.tsx or .jsx), or scaffold it with the CLI.',
        code: 'npx bir make:view Home',
      };
    }

    if (msg.includes('no such table') || msg.includes('SQLITE_ERROR')) {
      return {
        title: 'Database Table Missing',
        description:
          'A queried database table does not exist yet. Run your pending migrations to initialize the schema.',
        code: 'npx bir migrate',
      };
    }

    if (msg.includes('Session middleware is required')) {
      return {
        title: 'Session Middleware Not Active',
        description:
          'CSRF protection requires an active session. Register sessionMiddleware() before csrf() in your middleware pipeline.',
      };
    }

    return null;
  }

  public static render(ctx: Context, err: any): string {
    const errorName = err?.name || 'Error';
    const errorMessage = err?.message || 'An unexpected error occurred.';
    const frames = StackParser.parse(err?.stack);
    const topFrame = StackParser.getTopAppFrame(frames);

    const appFrames = frames.filter((f) => f.isAppFrame);
    const vendorFrames = frames.filter((f) => !f.isAppFrame);

    const safeMethod = escapeHtml(ctx.method);
    const safeUrl = escapeHtml(ctx.url);
    const safePath = escapeHtml(ctx.path);
    const safeName = escapeHtml(errorName);
    const safeMessage = escapeHtml(errorMessage);
    const solution = this.getSolutionHint(err);

    const codeSnippetHtml = topFrame?.codeSnippet
      ? topFrame.codeSnippet
          .map((line) => {
            const isErr = line.isErrorLine;
            const lineBg = isErr ? 'background: rgba(239, 68, 68, 0.18); border-left: 3px solid #ef4444;' : 'border-left: 3px solid transparent;';
            const numColor = isErr ? 'color: #f87171; font-weight: bold;' : 'color: #71717a;';
            const codeColor = isErr ? 'color: #fecaca; font-weight: 500;' : 'color: #e4e4e7;';
            return `
            <div style="display: flex; line-height: 1.6; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; ${lineBg} padding: 1px 0;">
              <span style="width: 50px; text-align: right; padding-right: 16px; user-select: none; ${numColor}">${line.lineNumber}</span>
              <span style="flex: 1; white-space: pre; overflow-x: auto; ${codeColor}">${escapeHtml(line.code)}</span>
            </div>`;
          })
          .join('')
      : '<div style="padding: 16px; color: #a1a1aa; font-size: 13px;">Source code preview unavailable for this stack frame.</div>';

    // Frames HTML
    const renderFrame = (f: StackFrame, index: number) => `
      <div style="padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; display: flex; align-items: baseline; justify-content: space-between;">
        <div>
          <span style="color: ${f.isAppFrame ? '#38bdf8' : '#71717a'}; font-weight: 600;">#${index} ${escapeHtml(f.functionName)}</span>
          <div style="color: #a1a1aa; font-size: 11px; margin-top: 2px;">${escapeHtml(f.shortFile)}:<span style="color: #fbbf24;">${f.line}</span></div>
        </div>
        ${f.isAppFrame ? '<span style="font-size: 9px; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: bold;">App</span>' : '<span style="font-size: 9px; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: rgba(255, 255, 255, 0.05); color: #71717a;">Vendor</span>'}
      </div>
    `;

    const appFramesHtml = appFrames.map((f, i) => renderFrame(f, i + 1)).join('') || '<div style="padding: 12px; color: #71717a; font-size: 12px;">No application frames detected.</div>';
    const vendorFramesHtml = vendorFrames.map((f, i) => renderFrame(f, i + appFrames.length + 1)).join('');

    // Context Data
    const reqHeadersJson = escapeHtml(JSON.stringify(ctx.req.headers, null, 2));
    const queryJson = escapeHtml(JSON.stringify(ctx.query, null, 2));
    const sessionJson = escapeHtml(JSON.stringify(ctx.session?.toJSON() || {}, null, 2));

    return `<!DOCTYPE html>
<html lang="en" style="background: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>500 Internal Server Error | BirFramework Ignition</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    button { cursor: pointer; border: none; background: transparent; font-family: inherit; }
    .tab-btn { padding: 8px 16px; font-size: 13px; font-weight: 600; color: #71717a; border-bottom: 2px solid transparent; transition: all 0.15s ease; }
    .tab-btn.active { color: #f4f4f5; border-bottom-color: #ef4444; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
  </style>
</head>
<body style="min-height: 100vh; padding: 24px; max-width: 1280px; margin: 0 auto;">

  <!-- Brand & Status Header -->
  <header style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 16px; margin-bottom: 24px;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #ef4444, #f97316); display: flex; align-items: center; justify-content: center; font-weight: 900; color: white; font-size: 16px; box-shadow: 0 0 16px rgba(239, 68, 68, 0.4);">
        B
      </div>
      <div>
        <div style="font-weight: 800; font-size: 14px; letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px;">
          BirFramework
          <span style="font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.25);">v${VERSION}</span>
          <span style="font-size: 10px; font-weight: 600; color: #71717a;">Ignition Debug Screen</span>
        </div>
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-family: ui-monospace, monospace; font-size: 11px; padding: 4px 8px; border-radius: 6px; background: #27272a; color: #a1a1aa; font-weight: 600;">
        ${safeMethod} ${safePath}
      </span>
      <span style="font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">
        500 ERROR
      </span>
    </div>
  </header>

  <!-- Error Title & Location Banner -->
  <div style="background: rgba(24, 24, 27, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <div style="display: inline-block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #ef4444; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 2px 8px; border-radius: 6px; margin-bottom: 8px;">
      ${safeName}
    </div>
    <h1 style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; margin-bottom: 12px; word-break: break-word;">
      ${safeMessage}
    </h1>
    ${
      topFrame
        ? `<div style="display: flex; align-items: center; gap: 6px; font-family: ui-monospace, monospace; font-size: 13px; color: #a1a1aa;">
            <svg style="width: 14px; height: 14px; color: #f87171; shrink: 0;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span style="color: #f4f4f5; font-weight: 600;">${escapeHtml(topFrame.shortFile)}</span>:<span>${topFrame.line}</span>
          </div>`
        : ''
    }
  </div>

  <!-- Solution Hint Banner -->
  ${
    solution
      ? `
  <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.28); border-radius: 14px; padding: 18px 22px; margin-bottom: 24px;">
    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #34d399; margin-bottom: 6px;">
      Possible Solution &bull; ${escapeHtml(solution.title)}
    </div>
    <p style="font-size: 13px; color: #d4d4d8; line-height: 1.5; margin-bottom: ${solution.code ? '10px' : '0'};">
      ${escapeHtml(solution.description)}
    </p>
    ${
      solution.code
        ? `<pre style="background: #09090b; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 14px; font-family: ui-monospace, monospace; font-size: 12px; color: #6ee7b7; overflow-x: auto;">${escapeHtml(solution.code)}</pre>`
        : ''
    }
  </div>`
      : ''
  }

  <!-- Code Preview Window -->
  ${
    topFrame?.codeSnippet
      ? `
  <div style="background: #121215; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.6);">
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #18181b; border-bottom: 1px solid rgba(255,255,255,0.06);">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444;"></span>
        <span style="width: 10px; height: 10px; border-radius: 50%; background: #f59e0b;"></span>
        <span style="width: 10px; height: 10px; border-radius: 50%; background: #10b981;"></span>
        <span style="margin-left: 8px; font-family: ui-monospace, monospace; font-size: 12px; color: #a1a1aa;">${escapeHtml(topFrame.file)}</span>
      </div>
      <span style="font-family: ui-monospace, monospace; font-size: 11px; color: #ef4444; font-weight: bold;">Line ${topFrame.line}</span>
    </div>
    <div style="padding: 12px 0;">
      ${codeSnippetHtml}
    </div>
  </div>`
      : ''
  }

  <!-- Stack Trace & Context Details -->
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
    <!-- Left Column: Stack Trace -->
    <div style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; overflow: hidden;">
      <div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 13px; font-weight: 700; color: #f4f4f5;">Stack Trace (${frames.length} frames)</span>
        <button onclick="toggleVendorFrames()" id="vendor-toggle-btn" style="font-size: 11px; color: #38bdf8; font-weight: 600;">
          Show Vendor Frames (${vendorFrames.length})
        </button>
      </div>

      <div style="max-height: 480px; overflow-y: auto;">
        ${appFramesHtml}
        <div id="vendor-frames-container" style="display: none; opacity: 0.75;">
          ${vendorFramesHtml}
        </div>
      </div>
    </div>

    <!-- Right Column: Context Tabs -->
    <div style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; overflow: hidden; display: flex; flex-col; flex-direction: column;">
      <div style="display: flex; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(0,0,0,0.2);">
        <button class="tab-btn active" onclick="switchTab('request')">Request</button>
        <button class="tab-btn" onclick="switchTab('query')">Query / Body</button>
        <button class="tab-btn" onclick="switchTab('session')">Session</button>
        <button class="tab-btn" onclick="switchTab('env')">Environment</button>
      </div>

      <div style="padding: 16px; flex: 1; overflow-y: auto; max-height: 440px;">
        <!-- Request Tab -->
        <div id="tab-request" class="tab-content active">
          <div style="font-size: 12px; margin-bottom: 12px;">
            <div style="color: #71717a; margin-bottom: 2px;">HTTP Method &amp; URL:</div>
            <div style="font-family: ui-monospace, monospace; color: #38bdf8; font-weight: 600;">${safeMethod} ${safeUrl}</div>
          </div>
          <div style="font-size: 12px; color: #71717a; margin-bottom: 4px;">Headers:</div>
          <pre style="background: #09090b; padding: 12px; border-radius: 8px; font-family: ui-monospace, monospace; font-size: 11px; color: #e4e4e7; overflow-x: auto;">${reqHeadersJson}</pre>
        </div>

        <!-- Query & Body Tab -->
        <div id="tab-query" class="tab-content">
          <div style="font-size: 12px; color: #71717a; margin-bottom: 4px;">Query Parameters:</div>
          <pre style="background: #09090b; padding: 12px; border-radius: 8px; font-family: ui-monospace, monospace; font-size: 11px; color: #e4e4e7; overflow-x: auto; margin-bottom: 12px;">${queryJson}</pre>
        </div>

        <!-- Session Tab -->
        <div id="tab-session" class="tab-content">
          <div style="font-size: 12px; color: #71717a; margin-bottom: 4px;">Session Data:</div>
          <pre style="background: #09090b; padding: 12px; border-radius: 8px; font-family: ui-monospace, monospace; font-size: 11px; color: #e4e4e7; overflow-x: auto;">${sessionJson}</pre>
        </div>

        <!-- Environment Tab -->
        <div id="tab-env" class="tab-content">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px;">
            <div style="background: #09090b; padding: 12px; border-radius: 8px;">
              <div style="color: #71717a; font-size: 11px;">Node.js Version</div>
              <div style="font-family: ui-monospace, monospace; color: #f4f4f5; font-weight: 600;">${process.version}</div>
            </div>
            <div style="background: #09090b; padding: 12px; border-radius: 8px;">
              <div style="color: #71717a; font-size: 11px;">Operating System</div>
              <div style="font-family: ui-monospace, monospace; color: #f4f4f5; font-weight: 600;">${process.platform} (${process.arch})</div>
            </div>
            <div style="background: #09090b; padding: 12px; border-radius: 8px;">
              <div style="color: #71717a; font-size: 11px;">BirFramework Version</div>
              <div style="font-family: ui-monospace, monospace; color: #38bdf8; font-weight: 600;">v${VERSION}</div>
            </div>
            <div style="background: #09090b; padding: 12px; border-radius: 8px;">
              <div style="color: #71717a; font-size: 11px;">Process Uptime</div>
              <div style="font-family: ui-monospace, monospace; color: #f4f4f5; font-weight: 600;">${Math.round(process.uptime())}s</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    function switchTab(name) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('tab-' + name).classList.add('active');
    }

    function toggleVendorFrames() {
      const container = document.getElementById('vendor-frames-container');
      const btn = document.getElementById('vendor-toggle-btn');
      if (container.style.display === 'none') {
        container.style.display = 'block';
        btn.textContent = 'Hide Vendor Frames';
      } else {
        container.style.display = 'none';
        btn.textContent = 'Show Vendor Frames (${vendorFrames.length})';
      }
    }
  </script>
</body>
</html>`;
  }
}

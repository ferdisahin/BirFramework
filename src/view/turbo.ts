export function birScripts(): string {
  const isDev = process.env.NODE_ENV !== 'production';

  const liveReloadSnippet = isDev
    ? `
  // --- Live Reload Client (Development SSE only) ---
  if (typeof EventSource !== 'undefined') {
    try {
      var liveSource = new EventSource('/__bir_live_reload');
      liveSource.onmessage = function(ev) {
        if (ev.data === 'css-reload') {
          var links = document.querySelectorAll('link[rel="stylesheet"]');
          links.forEach(function(l) {
            var href = l.href.split('?')[0];
            l.href = href + '?t=' + Date.now();
          });
        } else if (ev.data === 'reload') {
          navigate(window.location.href, false);
        }
      };
      liveSource.onerror = function() {
        setTimeout(function() {
          fetch(window.location.href)
            .then(function(r) { if (r.ok) location.reload(); })
            .catch(function() {});
        }, 1500);
      };
    } catch (err) {}
  }
`
    : '';

  return `
<style id="bir-turbo-styles">
  #bir-turbo-progress {
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    width: 0%;
    background: linear-gradient(90deg, #38bdf8, #818cf8);
    z-index: 999999;
    transition: width 0.2s ease, opacity 0.3s ease;
    pointer-events: none;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.7);
  }
</style>
<script id="bir-turbo-script">
(function() {
  if (window.__BIR_TURBO_INITIALIZED__) return;
  window.__BIR_TURBO_INITIALIZED__ = true;

  var bar = document.createElement('div');
  bar.id = 'bir-turbo-progress';
  document.documentElement.appendChild(bar);

  function startProgress() {
    bar.style.opacity = '1';
    bar.style.width = '30%';
    setTimeout(function() {
      if (bar.style.opacity === '1') bar.style.width = '70%';
    }, 150);
  }

  function finishProgress() {
    bar.style.width = '100%';
    setTimeout(function() {
      bar.style.opacity = '0';
      setTimeout(function() { bar.style.width = '0%'; }, 300);
    }, 150);
  }

  function shouldIntercept(anchor) {
    if (!anchor || anchor.tagName !== 'A') return false;
    if (anchor.target && anchor.target !== '_self') return false;
    if (anchor.hasAttribute('download')) return false;
    if (anchor.getAttribute('data-no-turbo') !== null) return false;

    var href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;

    try {
      var url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return false;

      // Same-page hash navigation like /#benchmarks when already on /
      if (url.pathname === window.location.pathname && url.hash) {
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  function navigate(url, pushState) {
    startProgress();
    var parsedUrl;
    try { parsedUrl = new URL(url, window.location.href); } catch (e) {}
    var targetHash = parsedUrl && parsedUrl.hash ? parsedUrl.hash : '';

    fetch(url, { headers: { 'X-Bir-Turbo': 'true' } })
      .then(function(res) {
        if (!res.ok) {
          window.location.href = url;
          return;
        }
        return res.text();
      })
      .then(function(html) {
        if (!html) return;
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');

        // 1. Update Title
        if (doc.title) {
          document.title = doc.title;
        }

        // 2. Sync Head Elements (Styles & Links)
        try {
          var currentStyles = new Set(Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]')).map(function(el) { return el.outerHTML; }));
          Array.from(doc.head.querySelectorAll('style, link[rel="stylesheet"]')).forEach(function(el) {
            if (!currentStyles.has(el.outerHTML)) {
              document.head.appendChild(el.cloneNode(true));
            }
          });
        } catch (e) {}

        // 3. Morph Body & Containers
        document.body.innerHTML = doc.body.innerHTML;

        // 4. Refresh Tailwind CDN JIT scanner if present
        if (window.tailwind && typeof window.tailwind.refresh === 'function') {
          try { window.tailwind.refresh(); } catch (e) {}
        }

        // 5. Update History
        if (pushState) {
          window.history.pushState({ turbo: true, url: url }, '', url);
        }

        if (targetHash) {
          try {
            var targetEl = document.querySelector(targetHash);
            if (targetEl) {
              targetEl.scrollIntoView({ behavior: 'smooth' });
            } else {
              window.scrollTo(0, 0);
            }
          } catch(e) { window.scrollTo(0, 0); }
        } else {
          window.scrollTo(0, 0);
        }
        finishProgress();

        // 6. Execute newly injected scripts inside body
        Array.from(document.body.querySelectorAll('script')).forEach(function(oldScript) {
          if (oldScript.id === 'bir-turbo-script') return;
          var newScript = document.createElement('script');
          Array.from(oldScript.attributes).forEach(function(attr) {
            newScript.setAttribute(attr.name, attr.value);
          });
          newScript.appendChild(document.createTextNode(oldScript.innerHTML));
          if (oldScript.parentNode) {
            oldScript.parentNode.replaceChild(newScript, oldScript);
          }
        });

        // 7. Dispatch lifecycle events for custom and Turbo listeners
        var evDetail = { detail: { url: url } };
        window.dispatchEvent(new CustomEvent('bir:load', evDetail));
        document.dispatchEvent(new CustomEvent('bir:load', evDetail));
        window.dispatchEvent(new CustomEvent('turbo:load', evDetail));
        document.dispatchEvent(new CustomEvent('turbo:load', evDetail));
        document.dispatchEvent(new CustomEvent('turbo:render', evDetail));
      })
      .catch(function() {
        finishProgress();
        window.location.href = url;
      });
  }

  document.addEventListener('click', function(e) {
    var anchor = e.target.closest('a');
    if (!anchor) return;

    var href = anchor.getAttribute('href');
    if (!href) return;

    // Smooth scroll for same-page hash links (#benchmarks or /#benchmarks when on /)
    if (href.startsWith('#') || (href.startsWith('/#') && (window.location.pathname === '/' || window.location.pathname === ''))) {
      var hash = href.startsWith('/#') ? href.slice(1) : href;
      try {
        var target = document.querySelector(hash);
        if (target) {
          e.preventDefault();
          window.history.pushState(null, '', href);
          target.scrollIntoView({ behavior: 'smooth' });
          return;
        }
      } catch (err) {}
    }

    if (shouldIntercept(anchor)) {
      e.preventDefault();
      navigate(anchor.href, true);
    }
  });

  window.addEventListener('popstate', function(e) {
    navigate(window.location.href, false);
  });

  window.BirTurbo = {
    visit: function(url) {
      navigate(url, true);
    }
  };
${liveReloadSnippet}
})();
</script>
`;
}

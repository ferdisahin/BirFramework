export function birScripts(): string {
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
      return url.origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  function navigate(url, pushState) {
    startProgress();

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

        // 2. Morph Body & Containers
        document.body.innerHTML = doc.body.innerHTML;

        // 3. Update History
        if (pushState) {
          window.history.pushState({ turbo: true, url: url }, '', url);
        }

        window.scrollTo(0, 0);
        finishProgress();

        // Dispatch page loaded event for custom scripts
        window.dispatchEvent(new CustomEvent('bir:load', { detail: { url: url } }));
      })
      .catch(function() {
        finishProgress();
        window.location.href = url;
      });
  }

  document.addEventListener('click', function(e) {
    var anchor = e.target.closest('a');
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

  // --- Live Reload Client (Development SSE) ---
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
        }, 800);
      };
    } catch (err) {}
  }
})();
</script>
`;
}

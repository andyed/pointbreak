// Analytics for the Pleasure Point essay.
//
// Classic script, not a module: PostHog's stub queue has to exist before
// anything below tries to capture. Follows the pot-luck bootstrap pattern
// (js/posthog-init.js there) and the mindbendingpixels.com privacy posture —
// person_profiles 'identified_only' and persistence 'memory', i.e. cookieless.
// This page must not be more invasive than the site it sits inside.
//
// Kill switch: append ?ph=0 to the URL.
(function () {
  'use strict';

  var KEY = 'phc_UtkQeyklDA8wNmaQ3ZTDYNl9wJ9ExUs3BF1dX22hcJY';  // MindBendingPixels (357099)
  var SCHEMA = 'pleasurepoint-2026-08-10-v1';

  try {
    if (new URLSearchParams(window.location.search).get('ph') === '0') return;
  } catch (e) { /* a malformed URL must not break the page */ }

  // Hostname only, deliberately dumb, same as pot-luck: a LAN address used for
  // phone testing still reads as local, so development never pollutes the data.
  function isLocalHost() {
    try {
      var h = window.location.hostname;
      return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' ||
        h === '[::1]' || /\.localhost$/.test(h) ||
        /^192\.168\./.test(h) || /^10\./.test(h);
    } catch (e) { return false; }
  }
  if (isLocalHost()) return;

  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister getFeatureFlag isFeatureEnabled reloadFeatureFlags identify setPersonProperties group reset get_distinct_id get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording captureException opt_in_capturing opt_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  window.posthog.init(KEY, {
    api_host: 'https://us.i.posthog.com',
    ui_host: 'https://us.posthog.com',
    person_profiles: 'identified_only',
    persistence: 'memory',          // cookieless, matching the rest of the site
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,        // ReadingDoppler's summary rides the unload
  });

  window.posthog.register({
    app_name: 'pleasurepoint',
    analytics_schema: SCHEMA,
    surface: 'essay',
    content_surface: 'pleasurepoint-field-notes',
  });

  // ---- ReadingDoppler ----
  // Paragraph dwell decomposed into viewport bands. Observing <main> rather
  // than a single .prose block so the figure captions and the limitations list
  // are measured too — on this page a reader lingering in a figure caption is
  // exactly the signal worth having.
  function startReading() {
    var lib = window.ReadingDopplerLib;
    var container = document.querySelector('main');
    if (!lib || !lib.ReadingDoppler || !lib.createPostHogAdapter || !container) return;

    var adapter = lib.createPostHogAdapter(window.posthog);
    var rd = new lib.ReadingDoppler({ onFlush: adapter.onFlush });
    rd.observe(container);

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      try { adapter.onDestroy(rd.summary()); rd.destroy(); } catch (e) { /* leaving anyway */ }
    }
    // pagehide beats beforeunload on mobile Safari, which may never fire the
    // latter; visibilitychange catches tab-switch-then-close.
    window.addEventListener('pagehide', finish);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') finish();
    });
  }

  // ---- did the work-in-progress sim actually get seen? ----
  // The embeds are lazy-loaded by an IntersectionObserver in the page, so an
  // iframe acquiring a src is the moment a reader reached that section. Fired
  // once per embed; the whole point of the section is whether anyone runs it.
  function watchSimEmbeds() {
    var frames = document.querySelectorAll('.sim-embed');
    if (!frames.length || !window.MutationObserver) return;
    Array.prototype.forEach.call(frames, function (f, i) {
      var seen = false;
      new MutationObserver(function () {
        if (seen || !f.getAttribute('src')) return;
        seen = true;
        var hash = (f.getAttribute('src') || '').split('#')[1] || '';
        window.posthog.capture('sim embed loaded', {
          embed_index: i,
          embed_params: hash.slice(0, 120),
          embed_title: (f.getAttribute('title') || '').slice(0, 120),
        });
      }).observe(f, { attributes: true, attributeFilter: ['src'] });
    });
  }

  function boot() { startReading(); watchSimEmbeds(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

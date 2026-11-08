/* Seawall Beach Cottages: page behaviour */
(function () {
  var doc = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------- smooth scrolling ---------- */
  var lenis = null;
  if (!reduceMotion && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  var nav = $('[data-nav]');
  function navOffset() { return nav ? nav.offsetHeight - 1 : 0; }

  // in-page links go through Lenis so the motion stays smooth
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var target = $(id);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      var top = id === '#top' ? 0 : target.getBoundingClientRect().top + window.scrollY - navOffset();
      if (lenis) lenis.scrollTo(top, { duration: 1.4 });
      else window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
      if (id !== '#top') {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
  });

  /* ---------- nav ---------- */
  var heroArt = $('.hero-art');
  var hero = $('.hero');
  function onScroll() {
    var y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 24);
    if (heroArt && !reduceMotion && y < hero.offsetHeight) {
      heroArt.style.transform = 'translate3d(0,' + (y * 0.22).toFixed(1) + 'px,0)';
    }
    updateShore();
  }
  if (lenis) lenis.on('scroll', onScroll);
  window.addEventListener('scroll', onScroll, { passive: true });

  var toggle = $('.nav-toggle');
  var menu = $('#mobile-menu');
  function closeMenu() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) $('a', menu).focus();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { closeMenu(); toggle.focus(); }
    });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', closeMenu); });
  }

  /* ---------- hero video ---------- */
  var heroVideo = $('.arch-video');
  var btnToggle = $('[data-video-toggle]');
  var btnSound = $('[data-video-sound]');
  var userPaused = false;
  if (heroVideo) {
    if (reduceMotion) { heroVideo.removeAttribute('autoplay'); heroVideo.pause(); userPaused = true; }
    var syncToggle = function () {
      var paused = heroVideo.paused;
      btnToggle.classList.toggle('is-paused', paused);
      btnToggle.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    };
    btnToggle.addEventListener('click', function () {
      if (heroVideo.paused) { userPaused = false; heroVideo.play(); }
      else { userPaused = true; heroVideo.pause(); }
    });
    heroVideo.addEventListener('play', syncToggle);
    heroVideo.addEventListener('pause', syncToggle);
    syncToggle();

    btnSound.addEventListener('click', function () {
      heroVideo.muted = !heroVideo.muted;
      if (!heroVideo.muted && heroVideo.paused) { userPaused = false; heroVideo.play(); }
      btnSound.classList.toggle('is-on', !heroVideo.muted);
      btnSound.setAttribute('aria-label', heroVideo.muted ? 'Turn sound on' : 'Turn sound off');
    });
  }

  /* ---------- videos play only while on screen ---------- */
  if ('IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) {
          if (v === heroVideo ? !userPaused : !reduceMotion) {
            if (v.preload === 'none') v.preload = 'auto';
            var p = v.play(); if (p && p.catch) p.catch(function () {});
          }
        } else if (!v.paused) {
          v.pause();
          if (v === heroVideo) userPaused = false; // paused by us, resume when back
        }
      });
    }, { threshold: 0.25 });
    if (heroVideo) vio.observe(heroVideo);
    $$('[data-inview-video]').forEach(function (v) { vio.observe(v); });
  }

  /* ---------- stamps and posts settle in as they appear ---------- */
  function reveal(selector, stagger) {
    var items = $$(selector);
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var mover = $('.stamp', el) || el;
        var idx = items.indexOf(el);
        mover.style.transitionDelay = (idx % 6) * stagger + 'ms';
        el.classList.add('is-in');
        // drop the delay afterwards so hover/swing feel immediate
        setTimeout(function () { mover.style.transitionDelay = ''; }, 1600);
        io.unobserve(el);
      });
    }, { threshold: 0.3, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
  }
  reveal('.stamp-item', 110);
  document.addEventListener('sbc:posts-rendered', function () { reveal('.post', 90); });
  if ($('.post')) reveal('.post', 90);

  // the postmark sits across the first two stamps
  var postmark = $('.postmark');
  function placePostmark() {
    var stamps = $$('.stamp');
    if (!postmark || stamps.length < 2) return;
    var host = $('.welcome').getBoundingClientRect();
    var a = stamps[0].getBoundingClientRect(), b = stamps[1].getBoundingClientRect();
    postmark.style.left = ((a.right + b.left) / 2 - host.left - postmark.getBoundingClientRect().width * 0.42) + 'px';
    postmark.style.top = (a.top - host.top - 36) + 'px';
  }

  /* ---------- shore walk: vertical scroll drives a horizontal track ---------- */
  var shore = $('[data-shore]');
  var track = $('[data-shore-track]');
  var shoreMode = '';
  var travel = 0;
  function layoutShore() {
    if (!shore) return;
    var wide = window.innerWidth >= 900 && window.innerHeight >= 560 && !reduceMotion;
    shoreMode = wide ? 'pinned' : 'static';
    shore.classList.toggle('is-static', !wide);
    if (wide) {
      track.style.transform = '';
      travel = Math.max(0, track.scrollWidth - window.innerWidth);
      shore.style.height = (window.innerHeight + travel) + 'px';
    } else {
      shore.style.height = '';
      track.style.transform = '';
    }
    drawTrail();
    updateShore();
  }
  function updateShore() {
    if (shoreMode !== 'pinned') return;
    var top = shore.getBoundingClientRect().top;
    var p = clamp(-top / (shore.offsetHeight - window.innerHeight || 1), 0, 1);
    track.style.transform = 'translate3d(' + (-p * travel).toFixed(1) + 'px,0,0)';
  }

  // a dotted footpath that threads through each stop's photo
  function drawTrail() {
    var svgEl = $('[data-shore-trail]');
    var path = $('[data-trail-path]');
    if (!svgEl || !path) return;
    var tr = track.getBoundingClientRect();
    var w = track.scrollWidth, h = track.offsetHeight;
    svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svgEl.style.width = w + 'px';
    var pts = $$('.stop', track).map(function (s) {
      var m = $('img, video', s).getBoundingClientRect();
      return [m.left - tr.left + m.width / 2, m.top - tr.top + m.height * 0.62];
    });
    if (pts.length < 2) return;
    pts.unshift([0, pts[0][1] + 40]);
    pts.push([w, pts[pts.length - 1][1] - 30]);
    // Catmull-Rom through the points, as cubic Béziers
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      var c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += 'C' + c1.map(f1).join(' ') + ' ' + c2.map(f1).join(' ') + ' ' + p2.map(f1).join(' ');
    }
    path.setAttribute('d', d);
  }
  function f1(n) { return n.toFixed(1); }

  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { layoutShore(); placePostmark(); if (lenis) lenis.resize(); }, 120);
  });
  window.addEventListener('load', function () { layoutShore(); placePostmark(); if (lenis) lenis.resize(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layoutShore(); placePostmark(); });
  layoutShore();
  placePostmark();

  /* ---------- postcard flip ---------- */
  var card = $('[data-postcard]');
  if (card) {
    var back = $('.postcard-back', card), front = $('.postcard-front', card);
    var setFaces = function (flipped) {
      if ('inert' in HTMLElement.prototype) { front.inert = !flipped; back.inert = flipped; }
      front.setAttribute('aria-hidden', String(!flipped));
      back.setAttribute('aria-hidden', String(flipped));
    };
    setFaces(false);
    $$('[data-flip]', card).forEach(function (b) {
      b.addEventListener('click', function () {
        var flipped = !card.classList.contains('is-flipped');
        card.classList.toggle('is-flipped', flipped);
        setFaces(flipped);
        var next = $(flipped ? '.postcard-front [data-flip]' : '.postcard-back [data-flip]', card);
        setTimeout(function () { next.focus({ preventScroll: true }); }, reduceMotion ? 0 : 450);
      });
    });
  }

  var year = $('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- intro: the painting washes in, the logo inks in over it, then glides up into the nav ---------- */
  function runIntro() {
    var intro = $('.intro');
    var logo = $('.intro-logo', intro);
    var wash = $('.intro-wash', intro);
    var paint = $('.hero-art img');
    var navLogo = $('.nav-logo img');
    var heroBits = $$('.hero-copy > *');
    var heroVid = $('.hero-video');
    var navBits = $$('.nav-links, .nav-toggle, .nav-book');
    var anims = [];
    var timers = [];
    var started = false;
    var finished = false;

    if (lenis) lenis.stop();
    window.scrollTo(0, 0);

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function anim(elm, kf, opts) {
      if (!elm || !elm.animate) return null;
      var a = elm.animate(kf, opts); anims.push(a); return a;
    }

    function finish(fast) {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      try { sessionStorage.setItem('sbc-intro', '1'); } catch (e) {}
      var cleanup = function () {
        doc.classList.remove('intro-on', 'intro-reveal');
        anims.forEach(function (a) { a.cancel(); });
        intro.remove();
        if (lenis) lenis.start();
        removeSkip();
        layoutShore();
        placePostmark();
      };
      if (fast && intro.animate) {
        // Skipped: run whatever is mid-flight to its end in about a quarter second,
        // and fade in anything that hasn't started, so nothing jumps.
        doc.classList.add('intro-reveal');
        anims.forEach(function (a) {
          var left = a.effect.getComputedTiming().endTime - (a.currentTime || 0);
          if (left > 0 && a.updatePlaybackRate) a.updatePlaybackRate(Math.max(1, left / 220));
        });
        [paint, navLogo, heroVid].concat(heroBits, navBits).forEach(function (el) {
          if (el && el.animate && !(el.getAnimations && el.getAnimations().length)) {
            anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, fill: 'forwards' }));
          }
        });
        intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).onfinish = cleanup;
      } else {
        cleanup();
      }
    }

    function skip(e) {
      if (e && e.type === 'keydown' && e.key === 'Tab') return;
      finish(true);
    }
    function removeSkip() {
      ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (t) { window.removeEventListener(t, skip); });
    }
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (t) { window.addEventListener(t, skip, { passive: true }); });

    function start() {
      if (started || finished) return;
      started = true;

      // On narrow screens the headline sits under the logo's path up to the nav,
      // so hold the copy back until the logo has passed.
      var lr = logo.getBoundingClientRect(), cr = $('.hero-copy').getBoundingClientRect();
      var revealAt = lr.left < cr.right && lr.right > cr.left ? 2550 : 2150;

      // 1. the painting washes in and slowly settles
      anim(paint, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out', fill: 'both' });
      anim(paint, [{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
        { duration: 3800, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });

      // 2. a pale wash spreads behind the logo, and the logo inks in from left to right
      anim(wash, [{ opacity: 0, transform: 'scale(.82)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 1000, delay: 150, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      anim(logo, [
        { WebkitMaskPosition: '100% 0', maskPosition: '100% 0', opacity: 0.2 },
        { WebkitMaskPosition: '0% 0', maskPosition: '0% 0', opacity: 1 }
      ], { duration: 1150, delay: 300, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'both' });

      // 3. the wash dries away and the logo glides up into its place in the nav
      later(function () {
        anim(wash, [{ opacity: 1 }, { opacity: 0 }], { duration: 800, easing: 'ease-in-out', fill: 'forwards' });
        var from = logo.getBoundingClientRect();
        var to = navLogo.getBoundingClientRect();
        var s = to.width / from.width;
        var glide = anim(logo, [
          { transform: 'translate(0,0) scale(1)' },
          { transform: 'translate(' + (to.left - from.left) + 'px,' + (to.top - from.top) + 'px) scale(' + s + ')' }
        ], { duration: 1150, easing: 'cubic-bezier(.65,0,.2,1)', fill: 'forwards' });
        var swap = function () {
          anim(navLogo, [{ opacity: 0 }, { opacity: 1 }], { duration: 10, fill: 'forwards' });
          logo.style.visibility = 'hidden';
        };
        if (glide) glide.onfinish = swap; else swap();
      }, 1650);

      // 4. hero copy, video and nav arrive
      later(function () {
        doc.classList.add('intro-reveal');
        heroBits.forEach(function (el, i) {
          anim(el, [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }],
            { duration: 1000, delay: i * 130, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
        });
        anim(heroVid, [{ opacity: 0, transform: 'translateY(30px) scale(.96)' }, { opacity: 1, transform: 'none' }],
          { duration: 1200, delay: 250, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
        navBits.forEach(function (el) {
          anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 500, fill: 'both' });
        });
      }, revealAt);

      later(function () { finish(false); }, revealAt + 1700);
    }

    // wait for the painting to decode (it's preloaded, so usually instant), but never more than 1.2s
    var ready = paint && paint.decode ? paint.decode().catch(function () {}) : Promise.resolve();
    Promise.race([ready, new Promise(function (r) { setTimeout(r, 1200); })]).then(start);
  }

  if (doc.classList.contains('intro-on')) runIntro();
})();

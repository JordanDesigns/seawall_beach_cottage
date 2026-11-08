/* Tide planner
   Live high/low tide predictions from Fisheries and Oceans Canada (IWLS API, open + CORS enabled)
   for East Sandy Cove, the nearest St. Mary's Bay station to Rossway. Heights between the
   highs and lows use the standard cosine interpolation. */
(function () {
  var root = document.getElementById('tides');
  if (!root) return;

  var STATION_ID = '5cebf1df3d0f4a073c4bbc76'; // East Sandy Cove (station 00336)
  var API = 'https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/' + STATION_ID + '/data?time-series-code=wlp-hilo';
  var LAT = 44.579, LNG = -65.915, TZ = 'America/Halifax';
  var MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  var Y_MAX = 6.5;            // metres shown on the chart
  var LOW_LIMIT = 2.2;        // below this, call it low-tide time
  var HIGH_LIMIT = 3.9;       // above this, high-tide time
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';

  var el = {
    headline: root.querySelector('[data-tide-headline]'),
    sub: root.querySelector('[data-tide-sub]'),
    days: root.querySelector('[data-tide-days]'),
    chart: root.querySelector('[data-tide-chart]'),
    tip: root.querySelector('[data-tide-tip]'),
    nowBtn: root.querySelector('[data-tide-now]'),
    events: root.querySelector('[data-tide-events]'),
    credit: root.querySelector('[data-tide-credit]'),
    planSun: root.querySelector('[data-plan-sun]'),
    plans: {
      low: root.querySelector('[data-plan="low"]'),
      high: root.querySelector('[data-plan="high"]')
    },
    scene: root.querySelector('[data-scene]')
  };
  var scene = {
    skyTop: el.scene.querySelector('[data-sky-top]'),
    skyBottom: el.scene.querySelector('[data-sky-bottom]'),
    seaTop: el.scene.querySelector('[data-sea-top]'),
    seaBottom: el.scene.querySelector('[data-sea-bottom]'),
    sun: el.scene.querySelector('[data-sun]'),
    moon: el.scene.querySelector('[data-moon]'),
    moonShade: el.scene.querySelector('[data-moon-shade]'),
    body: el.scene.querySelector('[data-water-body]'),
    line: el.scene.querySelector('[data-water-line]'),
    seaFar: el.scene.querySelector('[data-sea-far]'),
    kayak: el.scene.querySelector('[data-kayak]'),
    night: el.scene.querySelector('[data-night]'),
    glow: el.scene.querySelector('[data-glow]'),
    gauge: el.scene.querySelector('[data-gauge]')
  };

  /* ---------- time helpers (always Atlantic time, whatever the visitor's zone) ---------- */
  var partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  function tzOffset(ms) {
    var p = {};
    partsFmt.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUTC - Math.floor(ms / 1000) * 1000;
  }
  function localMidnight(ms) {
    var off = tzOffset(ms);
    var mid = Math.floor((ms + off) / DAY) * DAY;
    var utc = mid - off;
    var off2 = tzOffset(utc);
    return off2 === off ? utc : mid - off2;
  }
  var timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  var hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: true });
  var weekdayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'long' });
  var dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
  function fmtTime(ms) { return timeFmt.format(ms).replace(' AM', ' am').replace(' PM', ' pm'); }
  function fmtHour(ms) { return hourFmt.format(ms).replace(' AM', ' am').replace(' PM', ' pm'); }
  function fmtM(h) { return h.toFixed(1) + ' m'; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- state ---------- */
  var now = Date.now();
  var days = [localMidnight(now)];
  for (var i = 1; i <= 3; i++) days.push(localMidnight(days[i - 1] + 30 * HOUR));
  var state = {
    extremes: [],        // [{t, h, type:'high'|'low'}]
    live: true,
    day: 0,
    pinned: now,         // the time the planner is showing
    followNow: true,     // pinned tracks the clock
    preview: null,       // hover position
    shownH: 0,           // animated water height in the scene
    targetH: 0,
    seen: false
  };

  /* ---------- tide model ---------- */
  function heightAt(t) {
    var ex = state.extremes;
    for (var i = 0; i < ex.length - 1; i++) {
      if (t >= ex[i].t && t <= ex[i + 1].t) {
        var a = ex[i], b = ex[i + 1];
        var f = (t - a.t) / (b.t - a.t);
        return {
          h: a.h + (b.h - a.h) * (1 - Math.cos(Math.PI * f)) / 2,
          rising: b.h > a.h,
          next: b
        };
      }
    }
    return { h: 2.8, rising: true, next: null };
  }

  /* If the live feed fails, model a typical semi-diurnal cycle so the planner still works. */
  function syntheticExtremes() {
    var ref = Date.UTC(2026, 10, 7, 13, 24); // a known high at East Sandy Cove
    var half = 12.42 * HOUR / 2;
    var start = days[0] - DAY;
    var k = Math.floor((start - ref) / half);
    var out = [];
    for (var t = ref + k * half, n = k; t < days[3] + DAY; t += half, n++) {
      var high = n % 2 === 0;
      out.push({ t: t, h: high ? 5.4 : 0.9, type: high ? 'high' : 'low' });
    }
    return out;
  }

  function load() {
    var from = new Date(days[0] - 14 * HOUR).toISOString().slice(0, 19) + 'Z';
    var to = new Date(days[3] + 14 * HOUR).toISOString().slice(0, 19) + 'Z';
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 9000);
    return fetch(API + '&from=' + from + '&to=' + to, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) {
        clearTimeout(timer);
        var ex = rows.map(function (r) { return { t: Date.parse(r.eventDate), h: +r.value }; })
          .filter(function (r) { return isFinite(r.t) && isFinite(r.h); })
          .sort(function (a, b) { return a.t - b.t; });
        if (ex.length < 4) throw new Error('Not enough tide data');
        ex.forEach(function (x, i) {
          var prev = ex[i - 1], next = ex[i + 1];
          var ref = prev || next;
          x.type = x.h > ref.h ? 'high' : 'low';
        });
        state.extremes = ex;
        state.live = true;
      })
      .catch(function () {
        clearTimeout(timer);
        state.extremes = syntheticExtremes();
        state.live = false;
        el.credit.textContent = '';
        el.credit.append(
          "Live tide times didn't load, so this shows a typical tide cycle. For today's exact times, check ",
          linkTo('https://www.tides.gc.ca/', 'tides.gc.ca'),
          '. Not for navigation.'
        );
      });
  }
  function linkTo(href, text) {
    var a = document.createElement('a');
    a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text;
    return a;
  }

  /* ---------- day buttons ---------- */
  function buildDays() {
    el.days.textContent = '';
    for (var i = 0; i < 3; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekdayFmt.format(days[i] + 12 * HOUR);
      b.setAttribute('aria-pressed', i === state.day ? 'true' : 'false');
      b.addEventListener('click', selectDay.bind(null, i));
      el.days.appendChild(b);
    }
  }
  function selectDay(i) {
    state.day = i;
    if (i === 0) {
      state.followNow = true;
      state.pinned = Date.now();
    } else {
      state.followNow = false;
      // same time of day as now, on the chosen day
      state.pinned = clamp(days[i] + (Date.now() - days[0]), days[i], days[i + 1] - MIN);
    }
    Array.prototype.forEach.call(el.days.children, function (b, j) {
      b.setAttribute('aria-pressed', j === i ? 'true' : 'false');
    });
    render();
  }

  /* ---------- chart ---------- */
  var geo = null;
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function drawChart() {
    var w = el.chart.clientWidth, h = el.chart.clientHeight;
    var m = { l: 40, r: 12, t: 30, b: 26 };
    var d0 = days[state.day], d1 = days[state.day + 1];
    var x = function (t) { return m.l + (t - d0) / (d1 - d0) * (w - m.l - m.r); };
    var y = function (v) { return m.t + (1 - v / Y_MAX) * (h - m.t - m.b); };
    geo = { w: w, h: h, m: m, d0: d0, d1: d1, x: x, y: y };

    el.chart.textContent = '';
    var root = svg('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': 'true' }, el.chart);

    // night shading
    var sun = SBCSun.times(d0 + 12 * HOUR, LAT, LNG);
    svg('rect', { class: 'tc-night', x: m.l, y: m.t - 8, width: Math.max(0, x(sun.sunrise) - m.l), height: h - m.t - m.b + 8 }, root);
    svg('rect', { class: 'tc-night', x: x(sun.sunset), y: m.t - 8, width: Math.max(0, w - m.r - x(sun.sunset)), height: h - m.t - m.b + 8 }, root);

    // y grid + labels
    [0, 3, 6].forEach(function (v) {
      svg('line', { class: 'tc-grid', x1: m.l, x2: w - m.r, y1: y(v), y2: y(v) }, root);
      var t = svg('text', { class: 'tc-axis', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, root);
      t.textContent = v + ' m';
    });

    // x labels
    var step = w < 560 ? 6 : 3;
    for (var hr = 0; hr <= 24; hr += step) {
      var tt = d0 + hr * HOUR;
      if (tt > d1) break;
      var lbl = svg('text', { class: 'tc-axis', x: x(tt), y: h - 6, 'text-anchor': hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle' }, root);
      lbl.textContent = hr === 24 ? '' : fmtHour(tt);
    }

    // curve
    var pts = [];
    for (var t = d0; t <= d1; t += 10 * MIN) pts.push([x(t), y(heightAt(t).h)]);
    var line = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L');
    svg('path', { class: 'tc-area', d: line + 'L' + x(d1).toFixed(1) + ' ' + y(0) + 'L' + m.l + ' ' + y(0) + 'Z' }, root);
    svg('path', { class: 'tc-line', d: line }, root);

    // highs and lows, labelled
    dayExtremes().forEach(function (e) {
      var cx = x(e.t), cy = y(e.h);
      svg('circle', { class: 'tc-ext', cx: cx, cy: cy, r: 4.5 }, root);
      var anchor = cx < m.l + 40 ? 'start' : cx > w - m.r - 40 ? 'end' : 'middle';
      var t = svg('text', { class: 'tc-ext-label', x: cx, y: cy - 11, 'text-anchor': anchor }, root);
      t.textContent = (e.type === 'high' ? 'High ' : 'Low ') + fmtTime(e.t);
    });

    // now marker
    var nowT = Date.now();
    if (nowT >= d0 && nowT < d1) {
      // label above the chart unless a high-tide label is already there
      var nearHigh = dayExtremes().some(function (e) { return e.type === 'high' && Math.abs(e.t - nowT) < 100 * MIN; });
      svg('line', { class: 'tc-now', x1: x(nowT), x2: x(nowT), y1: m.t - 6, y2: h - m.b }, root);
      var nl = svg('text', { class: 'tc-now-label', x: x(nowT), y: nearHigh ? h - m.b - 6 : m.t - 12, 'text-anchor': nearHigh ? 'start' : 'middle', dx: nearHigh ? 5 : 0 }, root);
      nl.textContent = 'Now';
    }

    // selection crosshair (moved in updateSelection)
    geo.selLine = svg('line', { class: 'tc-sel', y1: m.t - 8, y2: h - m.b }, root);
    geo.selDot = svg('circle', { class: 'tc-sel-dot', r: 5.5 }, root);
  }

  function dayExtremes() {
    var d0 = days[state.day], d1 = days[state.day + 1];
    return state.extremes.filter(function (e) { return e.t >= d0 && e.t < d1; });
  }

  /* ---------- selection, status and plan ---------- */
  function shownTime() { return state.preview != null ? state.preview : state.pinned; }

  function updateSelection() {
    if (!geo) return;
    var t = shownTime();
    var info = heightAt(t);
    var sx = geo.x(t), sy = geo.y(info.h);
    geo.selLine.setAttribute('x1', sx); geo.selLine.setAttribute('x2', sx);
    geo.selDot.setAttribute('cx', sx); geo.selDot.setAttribute('cy', sy);

    var minutes = Math.round((t - days[state.day]) / MIN);
    el.chart.setAttribute('aria-valuenow', String(minutes));
    el.chart.setAttribute('aria-valuetext', fmtTime(t) + ', ' + fmtM(info.h) + ', ' + (info.rising ? 'rising' : 'falling'));

    // status line
    var near = nearestExtreme(t);
    var lead;
    if (near && Math.abs(near.t - t) <= 40 * MIN) lead = near.type === 'high' ? "it's high tide" : "it's low tide";
    else lead = info.rising ? 'the tide is coming in' : 'the tide is going out';
    var isNow = state.followNow && state.preview == null;
    var head = (isNow ? 'Right now, ' : 'At ' + fmtTime(t) + ', ') + lead;
    el.headline.textContent = head.charAt(0).toUpperCase() + head.slice(1);
    var next = info.next;
    el.sub.textContent = 'Water level ' + fmtM(info.h) + '.' +
      (next ? ' Next ' + next.type + ' tide at ' + fmtTime(next.t) + (next.t >= days[state.day + 1] ? ' tomorrow' : '') + ', ' + fmtM(next.h) + '.' : '');

    // plan columns
    var phase = info.h < LOW_LIMIT ? 'low' : info.h > HIGH_LIMIT ? 'high' : 'mid';
    el.plans.low.classList.toggle('is-now', phase === 'low');
    el.plans.high.classList.toggle('is-now', phase === 'high');
    el.plans.low.classList.toggle('is-later', phase === 'high');
    el.plans.high.classList.toggle('is-later', phase === 'low');

    el.nowBtn.hidden = state.followNow;

    state.targetH = info.h;
    if (reduceMotion) state.shownH = info.h;
    paintSky(t);
    kick();
  }

  function nearestExtreme(t) {
    var best = null;
    state.extremes.forEach(function (e) { if (!best || Math.abs(e.t - t) < Math.abs(best.t - t)) best = e; });
    return best;
  }

  function showTip(on) {
    if (!on || !geo) { el.tip.hidden = true; return; }
    var t = shownTime(), info = heightAt(t);
    el.tip.textContent = '';
    var s = document.createElement('strong');
    s.textContent = fmtM(info.h);
    el.tip.append(s, ' ' + (info.rising ? 'rising' : 'falling') + ', ' + fmtTime(t));
    el.tip.hidden = false;
    var wrapLeft = el.chart.offsetLeft;
    var x = clamp(geo.x(t), 70, geo.w - 70);
    el.tip.style.left = (wrapLeft + x) + 'px';
    el.tip.style.top = (el.chart.offsetTop - 12) + 'px';
  }

  function renderEvents() {
    var d0 = days[state.day];
    var sun = SBCSun.times(d0 + 12 * HOUR, LAT, LNG);
    var items = dayExtremes().map(function (e) { return { t: e.t, label: (e.type === 'high' ? 'High tide, ' : 'Low tide, ') + fmtM(e.h), icon: e.type }; });
    items.push({ t: sun.sunrise, label: 'Sunrise', icon: 'sunrise' }, { t: sun.sunset, label: 'Sunset', icon: 'sunset' });
    items.sort(function (a, b) { return a.t - b.t; });

    var icons = {
      high: 'M4 17c3-2 5 2 8 0s5 2 8 0M12 13V4M8.5 7.5L12 4l3.5 3.5',
      low: 'M4 17c3-2 5 2 8 0s5 2 8 0M12 4v9M8.5 9.5L12 13l3.5-3.5',
      sunrise: 'M3 18h18M7 18a5 5 0 0 1 10 0M12 4v6M9.5 6.5L12 4l2.5 2.5',
      sunset: 'M3 18h18M7 18a5 5 0 0 1 10 0M12 4v6M9.5 7.5L12 10l2.5-2.5'
    };
    el.events.textContent = '';
    items.forEach(function (it) {
      var li = document.createElement('li');
      var ic = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
      svg('path', { d: icons[it.icon] }, ic);
      var strong = document.createElement('strong');
      strong.textContent = fmtTime(it.t);
      li.append(ic, strong, ' ' + it.label);
      el.events.appendChild(li);
    });
    el.events.setAttribute('aria-label', 'Tide and sun times for ' + dateFmt.format(d0 + 12 * HOUR));
    el.planSun.textContent = 'Sunrise ' + fmtTime(sun.sunrise) + ', sunset ' + fmtTime(sun.sunset);
  }

  function render() {
    drawChart();
    renderEvents();
    updateSelection();
  }

  /* ---------- the illustrated scene ---------- */
  var SKY = [
    [-14, '#1F3553', '#33496A'],
    [-6, '#3F5778', '#C7A3A6'],
    [0, '#9DB7CE', '#F3CBB6'],
    [8, '#BBD2E1', '#F4E1D2'],
    [25, '#CBDFEA', '#EEF0E8']
  ];
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix(a, b, f) {
    var A = hex(a), B = hex(b);
    return 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * f); }).join(',') + ')';
  }
  function skyAt(alt) {
    if (alt <= SKY[0][0]) return [SKY[0][1], SKY[0][2]];
    for (var i = 0; i < SKY.length - 1; i++) {
      var a = SKY[i], b = SKY[i + 1];
      if (alt <= b[0]) {
        var f = (alt - a[0]) / (b[0] - a[0]);
        return [mix(a[1], b[1], f), mix(a[2], b[2], f)];
      }
    }
    var last = SKY[SKY.length - 1];
    return [last[1], last[2]];
  }

  function paintSky(t) {
    var alt = SBCSun.altitude(t, LAT, LNG);
    var sky = skyAt(alt);
    scene.skyTop.setAttribute('stop-color', sky[0]);
    scene.skyBottom.setAttribute('stop-color', sky[1]);

    var light = clamp((alt + 10) / 20, 0, 1); // 0 = night, 1 = day
    scene.seaTop.setAttribute('stop-color', mix('#4A6584', '#9DBFD3', light));
    scene.seaBottom.setAttribute('stop-color', mix('#2F4767', '#7FA5BE', light));
    scene.seaFar.setAttribute('fill', mix('#5A7491', '#C9DBE4', light));

    // sun rises over the bay (right) and sets behind the cottage (left)
    var d = SBCSun.times(t, LAT, LNG);
    var f = (t - d.sunrise) / (d.sunset - d.sunrise);
    if (f > -0.04 && f < 1.04) {
      var sx = 930 - clamp(f, 0, 1) * 720;
      var sy = 272 - Math.sin(Math.PI * clamp(f, 0, 1)) * 200;
      scene.sun.setAttribute('transform', 'translate(' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ')');
      scene.sun.setAttribute('opacity', clamp((Math.min(f, 1 - f) + 0.04) / 0.04, 0, 1).toFixed(2));
    } else {
      scene.sun.setAttribute('opacity', '0');
    }
    scene.moon.setAttribute('transform', 'translate(330 86)');
    scene.moon.setAttribute('opacity', (1 - light).toFixed(2));
    scene.moonShade.setAttribute('fill', sky[0]);

    scene.night.setAttribute('opacity', ((1 - light) * 0.45).toFixed(2));
    scene.glow.setAttribute('opacity', alt < -3 ? '1' : '0');
    el.scene.classList.toggle('is-night', light < 0.4);
  }

  // water geometry: beach runs from (300,300) to (1200,395)
  function surfaceY(h) { return 378 - 13 * h; }
  var phase = 0;
  function paintWater(h) {
    var yw = surfaceY(h);
    scene.body.setAttribute('y', yw.toFixed(1));
    scene.body.setAttribute('height', (430 - yw).toFixed(1));

    var d = 'M0 ' + yw.toFixed(1);
    for (var x = 0; x <= 1200; x += 40) {
      d += 'L' + x + ' ' + (yw + Math.sin(x / 70 + phase) * 1.8).toFixed(1);
    }
    scene.line.setAttribute('d', d);

    var xWater = 300 + (yw - 300) * 900 / 95;
    var kx = Math.min(xWater + 150, 1010);
    var bob = Math.sin(phase * 1.3) * 1.6;
    scene.kayak.setAttribute('transform', 'translate(' + kx.toFixed(1) + ' ' + (yw - 3 + bob).toFixed(1) + ') rotate(' + (Math.sin(phase) * 1.5).toFixed(2) + ')');

    if (scene.gaugeRead) {
      scene.gaugeRead.setAttribute('transform', 'translate(0 ' + yw.toFixed(1) + ')');
      scene.gaugeText.textContent = fmtM(h);
    }
  }

  function buildGauge() {
    var g = scene.gauge;
    g.querySelector('rect').setAttribute('y', surfaceY(6.6));
    g.querySelector('rect').setAttribute('height', surfaceY(-1.2) - surfaceY(6.6));
    for (var v = 0; v <= 6; v++) {
      svg('line', { class: 'gauge-tick', x1: 1150, x2: v % 2 ? 1155 : 1160, y1: surfaceY(v), y2: surfaceY(v) }, g);
      if (v % 2 === 0) {
        var t = svg('text', { class: 'gauge-num', x: 1166, y: surfaceY(v) + 4 }, g);
        t.textContent = v + ' m';
      }
    }
    var read = svg('g', {}, g);
    svg('path', { d: 'M1148 0l-9 -6v12z', fill: '#1E3A5A' }, read);
    var txt = svg('text', { class: 'gauge-read', x: 1134, y: 5, 'text-anchor': 'end' }, read);
    scene.gaugeRead = read;
    scene.gaugeText = txt;
  }

  /* animation loop: eases the water to its target and rolls the waves while visible */
  var visible = false, raf = 0, lastTs = 0;
  function frame(ts) {
    raf = 0;
    var dt = lastTs ? Math.min(64, ts - lastTs) : 16;
    lastTs = ts;
    var diff = state.targetH - state.shownH;
    state.shownH += diff * Math.min(1, dt / 260);
    if (Math.abs(diff) < 0.002) state.shownH = state.targetH;
    if (!reduceMotion) phase += dt / 900;
    paintWater(state.shownH);
    if (visible && (!reduceMotion || Math.abs(state.targetH - state.shownH) > 0.002)) raf = requestAnimationFrame(frame);
    else lastTs = 0;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  /* ---------- input ---------- */
  function timeFromEvent(e) {
    var r = el.chart.getBoundingClientRect();
    var f = clamp((e.clientX - r.left - geo.m.l) / (r.width - geo.m.l - geo.m.r), 0, 1);
    var t = geo.d0 + f * (geo.d1 - geo.d0);
    return Math.round(t / (5 * MIN)) * 5 * MIN;
  }
  var dragging = false;
  el.chart.addEventListener('pointerdown', function (e) {
    if (!geo) return;
    dragging = true;
    el.chart.setPointerCapture(e.pointerId);
    state.pinned = clamp(timeFromEvent(e), geo.d0, geo.d1 - MIN);
    state.followNow = false;
    state.preview = null;
    updateSelection(); showTip(true);
  });
  el.chart.addEventListener('pointermove', function (e) {
    if (!geo) return;
    var t = clamp(timeFromEvent(e), geo.d0, geo.d1 - MIN);
    if (dragging) { state.pinned = t; state.followNow = false; }
    else if (e.pointerType === 'mouse') state.preview = t;
    else return;
    updateSelection(); showTip(true);
  });
  function endDrag() { dragging = false; }
  el.chart.addEventListener('pointerup', endDrag);
  el.chart.addEventListener('pointercancel', endDrag);
  el.chart.addEventListener('pointerleave', function () {
    if (dragging) return;
    state.preview = null;
    updateSelection(); showTip(false);
  });
  el.chart.addEventListener('keydown', function (e) {
    if (!geo) return;
    var step = e.shiftKey ? 60 * MIN : 15 * MIN;
    var t = state.pinned;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') t += step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') t -= step;
    else if (e.key === 'PageUp') t += 60 * MIN;
    else if (e.key === 'PageDown') t -= 60 * MIN;
    else if (e.key === 'Home') t = geo.d0;
    else if (e.key === 'End') t = geo.d1 - MIN;
    else return;
    e.preventDefault();
    state.pinned = clamp(t, geo.d0, geo.d1 - MIN);
    state.followNow = false;
    updateSelection(); showTip(true);
  });
  el.chart.addEventListener('blur', function () { showTip(false); });
  el.nowBtn.addEventListener('click', function () { selectDay(0); });

  // keep "now" current while the page is open
  setInterval(function () {
    if (state.followNow && state.day === 0) {
      var t = Date.now();
      if (t >= days[1]) { location.reload(); return; }
      state.pinned = t;
      render();
    }
  }, 60 * 1000);

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (state.extremes.length) render(); }, 120);
  });

  // the tide "comes in" the first time the planner scrolls into view
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        visible = en.isIntersecting;
        if (visible) {
          if (!state.seen && state.extremes.length) state.seen = true;
          kick();
        }
      });
    }, { threshold: 0.15 }).observe(el.scene);
  } else {
    visible = true;
  }

  /* ---------- go ---------- */
  buildGauge();
  buildDays();
  paintSky(now);
  paintWater(0);
  load().then(function () {
    render();
    if (reduceMotion) state.shownH = state.targetH;
    kick();
  });
})();

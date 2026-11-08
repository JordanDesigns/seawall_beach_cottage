/* "Fresh from the shore" clothesline.
   Renders the latest Facebook + Instagram posts as photos pegged to a line.

   PREVIEW DATA: the posts below are placeholders built from the client's own photos.
   To go live, set SOCIAL_FEED_URL to a JSON endpoint that returns the same shape, e.g.
   a Behold.so / Curator.io feed, or a small server function that calls the Meta Graph API
   (Facebook Page posts + Instagram Business media) with a long-lived token.
   Shape: [{ platform: 'facebook'|'instagram', image, alt, caption, date: 'YYYY-MM-DD', url }] */
(function () {
  var SOCIAL_FEED_URL = '';
  var MAX_POSTS = 6;

  var PREVIEW_POSTS = [
    { platform: 'instagram', image: 'assets/img/pastel-sky.webp', alt: 'Pink and lilac sky over the bay at dawn',
      caption: 'Pink skies over the bay this morning. No filter, just St. Mary’s Bay showing off.', date: '2026-11-04', url: 'https://www.instagram.com/' },
    { platform: 'facebook', image: 'assets/img/winter-ice-cliffs.webp', alt: 'The red cliffs hung with ice in winter',
      caption: 'Winter on the Digby Neck. The cliffs freeze into curtains of ice and the beach is all yours.', date: '2026-10-29', url: 'https://www.facebook.com/' },
    { platform: 'instagram', image: 'assets/img/kayakers-portrait.webp', alt: 'Two kayakers paddling toward a red cliff',
      caption: 'Glassy water, two kayaks and one big red cliff.', date: '2026-10-21', url: 'https://www.instagram.com/' },
    { platform: 'facebook', image: 'assets/img/night-fire-porch.webp', alt: 'The porch fire table glowing at night',
      caption: 'Fire table season is here. The porch is ready when you are.', date: '2026-10-14', url: 'https://www.facebook.com/' },
    { platform: 'instagram', image: 'assets/img/cliffs-bulldog.webp', alt: 'A white bulldog on the red rocks below the cliffs',
      caption: 'Our beach patrol, reporting for duty under the cliffs.', date: '2026-10-08', url: 'https://www.instagram.com/' },
    { platform: 'facebook', image: 'assets/img/low-tide-rocks.webp', alt: 'Seaweed-covered rocks on the beach at low tide',
      caption: 'Low tide this afternoon. Bring a bucket for the rockhounding.', date: '2026-09-30', url: 'https://www.facebook.com/' }
  ];

  var list = document.querySelector('[data-posts]');
  if (!list) return;
  var line = list.parentElement;

  var ICONS = {
    facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6"/>'
  };
  var NAMES = { facebook: 'Facebook', instagram: 'Instagram' };
  var dateFmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  var SWINGS = [-2.5, 1.8, -1.2, 2.6, -2, 1.4];

  function render(posts) {
    list.textContent = '';
    posts.slice(0, MAX_POSTS).forEach(function (p, i) {
      if (!ICONS[p.platform]) return;
      var li = document.createElement('li');
      li.className = 'post';
      li.style.setProperty('--swing', SWINGS[i % SWINGS.length] + 'deg');

      var a = document.createElement('a');
      a.href = p.url; a.target = '_blank'; a.rel = 'noopener';

      var img = document.createElement('img');
      img.src = p.image; img.alt = p.alt || ''; img.loading = 'lazy'; img.width = 400; img.height = 400;

      var meta = document.createElement('p');
      meta.className = 'post-meta';
      var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = ICONS[p.platform]; // static markup from the table above, never feed content
      var when = document.createElement('time');
      when.dateTime = p.date;
      when.textContent = dateFmt.format(new Date(p.date + 'T12:00:00Z'));
      var sr = document.createElement('span');
      sr.className = 'visually-hidden';
      sr.textContent = NAMES[p.platform] + ' post, ';
      meta.append(icon, sr, when);

      var cap = document.createElement('p');
      cap.className = 'post-caption';
      cap.textContent = p.caption;

      a.append(img, meta, cap);
      li.appendChild(a);
      list.appendChild(li);
    });
    hang();
    document.dispatchEvent(new CustomEvent('sbc:posts-rendered'));
  }

  /* Hang each post from the rope: a quadratic curve from y=14 at the ends to y=50 in the middle. */
  function hang() {
    var w = line.clientWidth;
    Array.prototype.forEach.call(list.children, function (li) {
      var s = (list.offsetLeft + li.offsetLeft + li.offsetWidth / 2) / w;
      var ropeY = 14 + 144 * s * (1 - s);
      li.style.setProperty('--y', ropeY.toFixed(1) + 'px');
    });
  }
  window.addEventListener('resize', hang);

  if (SOCIAL_FEED_URL) {
    fetch(SOCIAL_FEED_URL)
      .then(function (r) { return r.json(); })
      .then(function (posts) { render(Array.isArray(posts) && posts.length ? posts : PREVIEW_POSTS); })
      .catch(function () { render(PREVIEW_POSTS); });
  } else {
    render(PREVIEW_POSTS);
  }
})();

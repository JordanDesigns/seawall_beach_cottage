/* Sunrise, sunset and sun altitude for a given place and time.
   A compact version of the standard NOAA / SunCalc formulas (accurate to about a minute). */
(function () {
  var PI = Math.PI, sin = Math.sin, cos = Math.cos, tan = Math.tan,
      asin = Math.asin, atan2 = Math.atan2, acos = Math.acos, rad = PI / 180;
  var dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, J0 = 0.0009;
  var e = rad * 23.4397; // obliquity of the Earth

  function toJulian(ms) { return ms / dayMs - 0.5 + J1970; }
  function fromJulian(j) { return (j + 0.5 - J1970) * dayMs; }
  function toDays(ms) { return toJulian(ms) - J2000; }

  function rightAscension(l, b) { return atan2(sin(l) * cos(e) - tan(b) * sin(e), cos(l)); }
  function declination(l, b) { return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l)); }
  function siderealTime(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }
  function meanAnomaly(d) { return rad * (357.5291 + 0.98560028 * d); }
  function eclipticLongitude(M) {
    var C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M));
    return M + C + rad * 102.9372 + PI;
  }

  /* Sun altitude above the horizon, in degrees. */
  function altitude(ms, lat, lng) {
    var lw = rad * -lng, phi = rad * lat, d = toDays(ms);
    var L = eclipticLongitude(meanAnomaly(d));
    var dec = declination(L, 0), ra = rightAscension(L, 0);
    var H = siderealTime(d, lw) - ra;
    return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H)) / rad;
  }

  /* Sunrise and sunset (ms since epoch) for the solar day containing ms. */
  function times(ms, lat, lng) {
    var lw = rad * -lng, phi = rad * lat, d = toDays(ms);
    var n = Math.round(d - J0 - lw / (2 * PI));
    var ds = J0 + lw / (2 * PI) + n;
    var M = meanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L, 0);
    var noon = J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L);
    var h0 = -0.833 * rad;
    var w = acos((sin(h0) - sin(phi) * sin(dec)) / (cos(phi) * cos(dec)));
    var a = J0 + (w + lw) / (2 * PI) + n;
    var set = J2000 + a + 0.0053 * sin(M) - 0.0069 * sin(2 * L);
    var rise = noon - (set - noon);
    return { sunrise: fromJulian(rise), sunset: fromJulian(set), noon: fromJulian(noon) };
  }

  window.SBCSun = { times: times, altitude: altitude };
})();

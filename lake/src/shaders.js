/**
 * Shader sources for the artificial-lake renderer.
 *
 * Two programs:
 *   water    - HDR, one full-screen ray per pixel against an animated wave field
 *   resolve  - ACES tonemap + dither of the accumulated HDR target
 *
 * Written for WebGL2 (GLSL ES 3.00). Kept as plain strings so the page runs
 * straight off the file system, with no bundler and no network access.
 */
(function (global) {
  "use strict";

  /* Shared by every program: a full-screen triangle with no vertex buffer. */
  const FULLSCREEN_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

  /* ------------------------------------------------------------------ water */
  const WATER_FRAG = `#version 300 es
precision highp float;

out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;      // seconds, absolute: the whole field is a pure function of it
uniform float uWeight;    // 1/subsamples, so the additive passes average out
uniform vec3  uEye;
uniform vec3  uFwd;
uniform vec3  uRight;
uniform vec3  uUp;
uniform vec2  uTanHalf;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uHaze;
uniform vec3  uZenith;
uniform vec3  uWarm;
uniform vec3  uAbsorb;
uniform vec3  uScatter;
uniform float uGust;      // 0..1 envelope of the passing gust
uniform float uGustX;     // world x of the gust front, metres

const float PI = 3.141592653589793;
const int   NW = 18;

/* ---------------------------------------------------------------- noise -- */
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(vec2 p) {
  vec3 p3 = fract(p.xyx.xyz * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm2(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.13;
    a *= 0.5;
  }
  return s;
}

/* ---------------------------------------------------------------- waves -- */
/* Wave table hashed from the index, deep-water dispersion, directions biased
   toward the wind.

   Two things make this read as a lake rather than chrome:
   - fetch limit: the table tops out near 12 m, because a small artificial lake
     never builds a long swell;
   - saturation: amplitude grows roughly with wavelength, so every octave
     carries a similar slope (k*A ~ const) and the fine chop, not one giant
     swell, is what bends the reflection. */
void waveTerms(float i, out vec2 dir, out float k, out float amp, out float om, out float chop) {
  float h1 = hash11(i * 12.9898 + 78.233);
  float h2 = hash11(i * 37.7190 + 3.1700);
  float h3 = hash11(i * 91.7130 + 41.9000);
  float a = h1 * 6.28318530718;
  vec2 rnd = vec2(cos(a), sin(a));
  vec2 wind = normalize(vec2(1.0, 0.22));
  /* Only a mild wind bias: if every wave runs the same way the chop becomes a
     grating, and its reflection collapses into a few coherent ribbons. */
  dir = normalize(mix(rnd, wind, 0.22 + 0.38 * h3));
  float wl = 0.08 * pow(150.0, h2);
  k = 6.28318530718 / wl;
  /* slope = k*A falls off toward long wavelengths, so a few metres of swell
     cannot swing the grazing reflection into big blobs; the wind chop near
     0.1-0.5 m carries most of the slope and therefore most of the sparkle.
     Calibrated to ~9 deg rms slope, ~5 cm rms height. */
  /* slope = k*A: with amp ~ wl^1.02 the short waves hold almost all of the
     slope budget. That matters because Fresnel's fifth-power term is brutal
     at the ~60 deg incidence of the near field: a few degrees of tilt on a
     wave you can actually resolve turns into a hard mirror patch. Keeping the
     metre-scale waves flat and the centimetre-scale ones steep gives a calm
     lake that still breaks the sky into facets. */
  amp = 0.0018 * pow(wl, 1.02) * (1.0 + 1.50 * smoothstep(1.2, 0.06, wl));
  om = sqrt(9.81 * k);
  chop = smoothstep(5.0, 0.4, wl);
}

/* A gust front travelling across the lake: short waves grow and fall inside
   a wide moving band, the swell hardly notices. */
float gustField(vec2 p, float t) {
  float d = (p.x - uGustX) + 0.30 * p.y;
  float band = exp(-(d * d) / (2.0 * 46.0 * 46.0));
  float patchAmt = 0.55 + 0.75 * fbm2(p * 0.012 + vec2(t * 0.05, t * 0.02));
  return clamp(band * patchAmt, 0.0, 1.0) * uGust;
}

void waveField(vec2 p, float t, float dist, float gust, out float h, out vec2 grad, out float lap) {
  h = 0.0;
  grad = vec2(0.0);
  lap = 0.0;
  for (int i = 0; i < NW; i++) {
    vec2 d;
    float k, amp, om, chop;
    waveTerms(float(i), d, k, amp, om, chop);
    float ampG = mix(0.55, 1.0 + 1.9 * chop, gust);
    /* band-limit: fine chop fades out with distance instead of shimmering */
    float band = 1.0 - 0.58 * chop * smoothstep(20.0, 150.0, dist);
    float A = amp * ampG * band;
    float ph = k * dot(d, p) - om * t;
    float s = sin(ph);
    float c = cos(ph);
    h    += A * s;
    grad += (A * k * c) * d;
    lap  += -A * k * k * s;
  }

  /* Slope from ripples finer than the table can carry. Unresolved detail still
     tilts the normal, and that is what breaks the sky reflection into facets
     instead of a few long ribbons. Faded out with distance so it cannot alias. */
  float det = (1.0 - smoothstep(20.0, 120.0, dist)) * (0.75 + 0.55 * gust);
  if (det > 0.001) {
    vec2 q = p * 16.0 + vec2(t * 0.05, t * 0.03);
    vec2 micro = vec2(vnoise(q) - 0.5, vnoise(q + 51.3) - 0.5);
    /* centimetre grain, not decimetre blobs: enough to break the sky
       reflection, small enough that it still reads as water not as foil */
    grad += micro * 0.16 * det;
  }
}

float waterHeight(vec2 p, float t, float dist) {
  float h;
  vec2 g;
  float l;
  waveField(p, t, dist, gustField(p, t), h, g, l);
  return h;
}

/* --------------------------------------------------------------- terrain -- */
/* The lake is ringed by land: an irregular shoreline, a rising bank, a wood.
   fbm of the direction vector, never of atan(), so the ring has no seam. */
float shoreRadius(vec2 p) {
  vec2 dir = normalize(p + vec2(1e-4, 1e-4));
  /* ~58 m across, not a kilometre: a small artificial lake has a visible far
     bank, and that shoreline is what stops the surface reading as open sea. */
  return 58.0
       + 19.0 * fbm2(dir * 4.0 + 11.0)
       +  8.0 * fbm2(p * 0.0135)
       +  4.0 * fbm2(p * 0.0350)
       +  2.0 * fbm2(p * 0.075)
       +  1.1 * fbm2(p * 0.170);
}

float terrainHeight(vec2 p) {
  float r = length(p);
  float d = r - shoreRadius(p);
  float slope = 0.075 + 0.05 * fbm2(p * 0.0035 + 5.0);
  float bank = max(d, 0.0) * slope;
  float canopy = smoothstep(1.5, 9.0, d) * (3.0 + 9.0 * fbm2(p * 0.05 + 21.0));
  /* The ridge has to stay far enough away and low enough that the sky clears
     it: an eye 1.55 m above the water only needs a few degrees of headroom. */
  float hills = smoothstep(130.0, 760.0, d) * (30.0 * fbm2(p * 0.0032 + 71.0));
  return bank + canopy + hills;
}

bool marchLand(vec3 ro, vec3 rd, float tShore, int maxSteps, out float tHit) {
  float t0 = max(1.5, tShore * 0.60);
  float t1 = max(t0 + 8.0, tShore * 3.1);
  float prev = 0.0;
  float tPrev = t0;
  for (int i = 0; i < 48; i++) {
    if (i >= maxSteps) { break; }
    float t = mix(t0, t1, float(i) / 47.0);
    vec3 p = ro + rd * t;
    float f = p.y - terrainHeight(p.xz);
    if (i > 0 && prev > 0.0 && f <= 0.0) {
      float a = tPrev;
      float b = t;
      for (int j = 0; j < 6; j++) {
        float m = 0.5 * (a + b);
        vec3 pm = ro + rd * m;
        if (pm.y - terrainHeight(pm.xz) > 0.0) { a = m; } else { b = m; }
      }
      tHit = 0.5 * (a + b);
      return true;
    }
    prev = f;
    tPrev = t;
  }
  return false;
}

/* Distance along rd's azimuth to the ring of land, so water, the primary ray
   and the reflected ray all agree on where the shore is. */
float shoreT(vec3 ro, vec3 rd) {
  vec2 dxz = rd.xz;
  float lenXZ = length(dxz);
  if (lenXZ <= 1e-5) { return 1e9; }
  vec2 uz = dxz / lenXZ;
  float sRAz = shoreRadius(uz * 58.0);
  return max(0.0, (sRAz - dot(ro.xz, uz)) / lenXZ);
}

vec3 landColor(vec2 xz, float dist) {
  float d = length(xz) - shoreRadius(xz);
  float canopy = smoothstep(1.5, 9.0, d) * (3.0 + 9.0 * fbm2(xz * 0.05 + 21.0));
  float treeAmt = smoothstep(0.6, 4.0, canopy) * smoothstep(0.8, 7.0, d);
  vec3 bankCol = mix(vec3(0.150, 0.135, 0.098), vec3(0.105, 0.120, 0.072), fbm2(xz * 0.09 + 13.0));
  vec3 treeCol = mix(vec3(0.030, 0.055, 0.030), vec3(0.070, 0.105, 0.050), fbm2(xz * 0.07 + 29.0));
  vec3 col = mix(bankCol, treeCol, treeAmt);
  /* two scales of crown shading: broad clumps plus individual trees, so a
     distant tree line keeps texture instead of flattening into a colour wash */
  col *= 0.34 + 0.52 * fbm2(xz * 0.030 + 9.0) + 0.30 * fbm2(xz * 0.145 + 63.0);
  float hz = 1.0 - exp(-max(dist - 25.0, 0.0) / 260.0);
  return mix(col, uHaze, hz * 0.90);
}

/* ------------------------------------------------------------------- sky -- */
vec3 skyColor(vec3 r) {
  float up = clamp(r.y, 0.0, 1.0);
  vec3 col = mix(uHaze, uZenith, pow(up, 0.50));
  /* the warm band sits only over the sun's azimuth, so the rest of the
     horizon stays a deep blue and does not wash out the reflected water */
  float sunAz = clamp(dot(normalize(vec3(r.x, 0.0, r.z) + vec3(1e-5)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(1e-5))), 0.0, 1.0);
  col += uWarm * pow(1.0 - up, 6.0) * (0.20 + 0.80 * pow(sunAz, 3.0));

  float sa = clamp(dot(r, uSunDir), 0.0, 1.0);
  col += uSunColor * (pow(sa, 2400.0) * 5.0 + pow(sa, 60.0) * 0.22 + pow(sa, 5.0) * 0.045);

  float cy = max(r.y, 0.05);
  vec2 cp = r.xz / cy * 0.40 + vec2(uTime * 0.0125, uTime * 0.0042);
  float f = fbm2(cp);
  /* Thin, soft deck: a bright high-contrast cloud field is what turns the
     grazing reflection into silver veins, so keep the cover low. */
  float cover = smoothstep(0.56, 0.90, f) * smoothstep(0.012, 0.16, r.y);
  vec3 cloud = mix(vec3(0.30, 0.34, 0.42), vec3(0.52, 0.51, 0.50), smoothstep(0.54, 0.94, f));
  cloud += uSunColor * pow(sa, 7.0) * 0.22;
  /* a mirror-sharp cloud field is what turns a grazing reflection into silver
     veining; a thin deck keeps the far water dark while still moving */
  return mix(col, cloud, cover * 0.26);
}

/* ----------------------------------------------------------------- water -- */
vec3 bedColor(vec2 p, float depth) {
  float n = fbm2(p * 0.30 + 3.0);
  float n2 = fbm2(p * 1.60 + 19.0);
  vec3 sand = mix(vec3(0.170, 0.140, 0.094), vec3(0.255, 0.218, 0.150), n);
  sand *= mix(1.0, 0.42, smoothstep(0.6, 5.5, depth));
  sand *= 0.85 + 0.30 * n2;
  return mix(sand, vec3(0.10, 0.13, 0.07), smoothstep(0.62, 0.92, fbm2(p * 0.11 + 41.0)) * 0.7);
}

float causticStrength(vec2 p, float t, float depth) {
  float h;
  vec2 g;
  float l;
  waveField(p, t, 0.0, clamp(uGust * 0.9 + 0.15, 0.0, 1.0), h, g, l);
  float c = pow(max(-l, 0.0) * 0.30, 1.20);
  return c * exp(-depth * 0.55);
}

void main() {
  /* primary ray */
  /* Normalised so both axes span -1..1; uTanHalf already carries the aspect
     ratio on x. Dividing by uRes.y alone (as this once did) halves every
     offset, which silently turns the 48 deg lens into a ~25 deg telephoto. */
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes);
  vec3 rd = normalize(uFwd + uv.x * uTanHalf.x * uRight + uv.y * uTanHalf.y * uUp);
  vec3 ro = uEye;

  /* far shore distance along this azimuth, so water and land share one edge */
  float tShore = shoreT(ro, rd);

  vec3 col;
  bool wet = false;

  if (rd.y < -1e-4) {
    float t = -ro.y / rd.y;
    /* two guarded steps toward the true surface height */
    for (int i = 0; i < 2; i++) {
      if (abs(rd.y) > 0.02) {
        vec3 q = ro + rd * t;
        t = max(t * 0.35, t - waterHeight(q.xz, uTime, t) / rd.y);
      }
    }
    vec3 p = ro + rd * t;
    float rHit = length(p.xz);
    float sR = shoreRadius(p.xz);
    if (rHit < sR) {
      wet = true;
      /* A 58 m basin still needs several metres of water down the middle,
         otherwise the bright bed shows through everywhere and the lake reads
         as a shallow turquoise pool. The bed only appears near the bank. */
      float depth = clamp((sR - rHit) * 0.125, 0.02, 8.0);
      depth *= 0.65 + 0.70 * fbm2(p.xz * 0.02 + 7.0);
      depth = max(depth, 0.02);

      float h;
      vec2 g;
      float l;
      waveField(p.xz, uTime, t, gustField(p.xz, uTime), h, g, l);
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 V = -rd;
      float ndv = clamp(dot(N, V), 0.0, 1.0);
      /* A true 0.98 coefficient turns every grazing pixel into a mirror of the
         sky. Capping it keeps a little of the lake body in the far field. */
      float fres = 0.02 + 0.80 * pow(1.0 - ndv, 5.0);

      /* reflection: march the same terrain the shore uses, so the far wood,
         the bank and the sky all land in the water where they belong */
      vec3 R = reflect(rd, N);
      vec3 refl = skyColor(R);
      float rShore = shoreT(ro, R);
      float rt;
      if (R.y > 1e-4 && rShore < 1e8 && marchLand(ro, R, rShore, 22, rt)) {
        refl = landColor((ro + R * rt).xz, rt);
      }
      /* Blur the mirror by the slope the wave table cannot resolve. Those
         sub-pixel facets are exactly what softens real water, and averaging
         toward the haze is far cheaper than tracing a reflection cone. */
      float rBlur = clamp(0.30 * length(g) + 0.0016 * t, 0.0, 0.55);
      refl = mix(refl, uHaze, rBlur);

      /* refracted bed, absorbed on the way down and back */
      vec3 T = refract(rd, N, 0.75);
      if (dot(T, T) < 1e-6) { T = rd; }
      T = normalize(T);
      float tb = max(0.05, (-depth - p.y) / min(T.y, -1e-3));
      vec3 pb = p + T * tb;
      vec3 bed = bedColor(pb.xz, depth);
      bed += vec3(1.00, 0.94, 0.80) * causticStrength(pb.xz, uTime + tb * 0.0, depth) * 0.30;
      float path = tb * 2.0;
      vec3 trans = exp(-uAbsorb * path);
      vec3 body = uScatter * (1.0 - exp(-uAbsorb * path * 1.6));
      vec3 seen = bed * trans + body;

      /* sun glint: GGX, roughness grows with the local wave slope */
      vec3 H = normalize(uSunDir + V);
      float ndh = max(dot(N, H), 0.0);
      float rough = 0.090 + 0.130 * clamp(length(g) * 1.5, 0.0, 1.0);
      float a2 = rough * rough;
      float dd = a2 / (PI * pow(ndh * ndh * (a2 - 1.0) + 1.0, 2.0));
      vec3 spec = uSunColor * dd * fres;
      spec = min(spec, vec3(20.0));

      col = mix(seen, refl, fres) + spec;

      /* foam where the water runs out at the bank */
      float foam = smoothstep(0.22, 0.0, depth) * (0.40 + 0.60 * fbm2(p.xz * 1.10 + vec2(uTime * 0.22, 0.0)));
      col += vec3(0.86, 0.89, 0.88) * foam * 0.20;

      /* aerial perspective, the same haze the sky ends on */
      col = mix(col, uHaze, 1.0 - exp(-t / 700.0));
    }
  }

  if (!wet) {
    col = skyColor(rd);
    float tl;
    if (marchLand(ro, rd, tShore, 48, tl)) {
      vec3 lp = ro + rd * tl;
      col = landColor(lp.xz, tl);
    }
  }

  outColor = vec4(col * uWeight, uWeight);
}
`;

  /* ---------------------------------------------------------------- resolve */
  const RESOLVE_FRAG = `#version 300 es
precision highp float;

out vec4 outColor;

uniform sampler2D uHDR;
uniform vec2  uRes;
uniform float uTime;
uniform float uExposure;
uniform float uVignette;

float hash12(vec2 p) {
  vec3 p3 = fract(p.xyx.xyz * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uHDR, uv).rgb * uExposure;
  c = aces(c);
  c = pow(c, vec3(1.0 / 2.2));

  vec2 d2 = uv - 0.5;
  float vig = mix(1.0, smoothstep(1.15, 0.30, length(d2 * vec2(1.0, 1.18)) * 1.30), uVignette);
  c *= vig;

  float n = hash12(gl_FragCoord.xy + fract(uTime) * 191.0) - 0.5;
  c += n / 255.0;
  outColor = vec4(max(c, 0.0), 1.0);
}
`;

  global.LAKE_SHADERS = {
    fullscreenVert: FULLSCREEN_VERT,
    waterFrag: WATER_FRAG,
    resolveFrag: RESOLVE_FRAG
  };
})(typeof window !== "undefined" ? window : globalThis);

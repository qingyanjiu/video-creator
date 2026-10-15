/**
 * Artificial lake - WebGL2 water surface.
 *
 * The whole surface is a pure function of time: render(t) draws frame t
 * offscreen into an HDR target (three sub-samples averaged, which is the
 * temporal anti-aliasing the sun glitter needs), then resolves it to the
 * canvas through ACES. No state accumulates between frames, so the Node
 * capture script and a live browser produce the identical picture.
 */
(function (global) {
  "use strict";

  const SH = global.LAKE_SHADERS;

  const CFG = {
    width: 1280,
    height: 720,

    /* camera: 1.55 m above the water, looking a little down and across.
       The pitch stays shallow: at eye height the whole sky band lives in the
       few degrees above the horizon, and a steeper look-down crops it away. */
    eye: [0.0, 1.55, 0.0],
    yaw: 6.0,
    pitch: -4.5,
    fovY: 48.0,
    /* a slow pan, in degrees per second: the parallax is what separates a
       five-second clip from a photograph of the same frame */
    yawDrift: 0.9,

    /* the sun sits late-afternoon low but well off the view axis, so the lake
       gets a side glitter path instead of a blown-out sheet of white */
    sunElevation: 24.0,
    sunAzimuth: 68.0,
    sunColor: [1.0, 0.86, 0.66],
    sunStrength: 2.6,

    /* large-scale palette */
    haze: [0.13, 0.19, 0.29],
    zenith: [0.035, 0.115, 0.360],
    warm: [0.18, 0.11, 0.045],

    /* water body: red is absorbed first, which is what makes a lake green */
    absorb: [0.46, 0.105, 0.068],
    scatter: [0.010, 0.040, 0.052],

    /* gust front: crosses the frame left to right during the clip */
    gustStart: -95.0,
    gustSpeed: 26.0,

    subsamples: 3,
    fps: 30,
    duration: 5.0,
    exposure: 0.95,
    vignette: 0.42
  };

  const UNIFORMS_WATER = [
    "uRes", "uTime", "uWeight", "uEye", "uFwd", "uRight", "uUp", "uTanHalf",
    "uSunDir", "uSunColor", "uHaze", "uZenith", "uWarm", "uAbsorb",
    "uScatter", "uGust", "uGustX"
  ];
  const UNIFORMS_RESOLVE = ["uHDR", "uRes", "uTime", "uExposure", "uVignette"];

  function compileShader(gl, type, src, name) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(name + " failed to compile:\n" + log);
    }
    return sh;
  }

  function linkProgram(gl, vertSrc, fragSrc, name) {
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vertSrc, name + ".vert"));
    gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc, name + ".frag"));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(name + " failed to link:\n" + log);
    }
    return p;
  }

  function uniformLocations(gl, program, names) {
    const out = {};
    for (let i = 0; i < names.length; i++) {
      out[names[i]] = gl.getUniformLocation(program, names[i]);
    }
    return out;
  }

  function basis(yawDeg, pitchDeg) {
    const yaw = (yawDeg * Math.PI) / 180;
    const pitch = (pitchDeg * Math.PI) / 180;
    const cp = Math.cos(pitch);
    const fwd = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
    const right = [Math.cos(yaw), 0, Math.sin(yaw)];
    const up = [
      right[1] * fwd[2] - right[2] * fwd[1],
      right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[1] - right[1] * fwd[0]
    ];
    return { fwd: fwd, right: right, up: up };
  }

  function sunDirection(elevationDeg, yawDeg) {
    const el = (elevationDeg * Math.PI) / 180;
    const yaw = (yawDeg * Math.PI) / 180;
    const ce = Math.cos(el);
    const v = [Math.sin(yaw) * ce, Math.sin(el), -Math.cos(yaw) * ce];
    const len = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function scale3(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
  }

  function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  /* The gust envelope is a pure function of time, so every frame is
     reproducible: it rises over the first second, holds, and falls away. */
  function gustAmount(t) {
    return 0.95 * smoothstep(0.25, 1.60, t) * (1 - smoothstep(3.60, 4.90, t));
  }

  function gustFrontX(t) {
    return CFG.gustStart + CFG.gustSpeed * t;
  }

  function mount(canvas) {
    if (!SH) {
      throw new Error("shaders.js must be loaded before lake.js");
    }
    const W = CFG.width;
    const H = CFG.height;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance"
    });
    if (!gl) {
      throw new Error("WebGL2 is not available in this browser");
    }

    canvas.width = W;
    canvas.height = H;

    const floatTarget = !!gl.getExtension("EXT_color_buffer_float");

    const waterProgram = linkProgram(gl, SH.fullscreenVert, SH.waterFrag, "water");
    const resolveProgram = linkProgram(gl, SH.fullscreenVert, SH.resolveFrag, "resolve");
    const UW = uniformLocations(gl, waterProgram, UNIFORMS_WATER);
    const UR = uniformLocations(gl, resolveProgram, UNIFORMS_RESOLVE);

    const hdrTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, hdrTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0,
      floatTarget ? gl.RGBA16F : gl.RGBA8,
      W, H, 0,
      gl.RGBA,
      floatTarget ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const hdrFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdrFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, hdrTex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("HDR render target incomplete: 0x" + status.toString(16));
    }

    /* Derived per frame, not once at mount: the page stays live-tunable and
       the capture tool can override CFG between frames. */
    function derived(t) {
      const tanY = Math.tan((CFG.fovY * Math.PI) / 360);
      return {
        cam: basis(CFG.yaw + CFG.yawDrift * t, CFG.pitch),
        sun: sunDirection(CFG.sunElevation, CFG.sunAzimuth),
        sunCol: scale3(CFG.sunColor, CFG.sunStrength),
        tanX: tanY * (W / H),
        tanY: tanY
      };
    }

    function setWaterUniforms(t, weight, d) {
      gl.uniform2f(UW.uRes, W, H);
      gl.uniform1f(UW.uTime, t);
      gl.uniform1f(UW.uWeight, weight);
      gl.uniform3fv(UW.uEye, CFG.eye);
      gl.uniform3fv(UW.uFwd, d.cam.fwd);
      gl.uniform3fv(UW.uRight, d.cam.right);
      gl.uniform3fv(UW.uUp, d.cam.up);
      gl.uniform2f(UW.uTanHalf, d.tanX, d.tanY);
      gl.uniform3fv(UW.uSunDir, d.sun);
      gl.uniform3fv(UW.uSunColor, d.sunCol);
      gl.uniform3fv(UW.uHaze, CFG.haze);
      gl.uniform3fv(UW.uZenith, CFG.zenith);
      gl.uniform3fv(UW.uWarm, CFG.warm);
      gl.uniform3fv(UW.uAbsorb, CFG.absorb);
      gl.uniform3fv(UW.uScatter, CFG.scatter);
      gl.uniform1f(UW.uGust, gustAmount(t));
      gl.uniform1f(UW.uGustX, gustFrontX(t));
    }

    function render(t) {
      const n = Math.max(1, CFG.subsamples);
      const shutter = 1 / CFG.fps;
      const d = derived(t);

      gl.bindFramebuffer(gl.FRAMEBUFFER, hdrFbo);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(waterProgram);
      for (let i = 0; i < n; i++) {
        setWaterUniforms(t + (shutter * (i + 0.5)) / n, 1 / n, d);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(resolveProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, hdrTex);
      gl.uniform1i(UR.uHDR, 0);
      gl.uniform2f(UR.uRes, W, H);
      gl.uniform1f(UR.uTime, t);
      gl.uniform1f(UR.uExposure, CFG.exposure);
      gl.uniform1f(UR.uVignette, CFG.vignette);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    let rafId = 0;
    let startedAt = 0;
    function tick(now) {
      if (!startedAt) {
        startedAt = now;
      }
      render((now - startedAt) / 1000);
      rafId = global.requestAnimationFrame(tick);
    }
    function start() {
      if (!rafId) {
        startedAt = 0;
        rafId = global.requestAnimationFrame(tick);
      }
    }
    function stop() {
      if (rafId) {
        global.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    return {
      render: render,
      start: start,
      stop: stop,
      gl: gl,
      config: CFG,
      duration: CFG.duration,
      fps: CFG.fps,
      renderer: (function () {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      })()
    };
  }

  global.LAKE = {
    mount: mount,
    ready: false,
    gustAmount: gustAmount,
    gustFrontX: gustFrontX
  };
})(typeof window !== "undefined" ? window : globalThis);

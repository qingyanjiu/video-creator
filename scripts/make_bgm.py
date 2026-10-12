# -*- coding: utf-8 -*-
"""Synthesize a soft, calm background track (warm pad + music-box arpeggio)."""
import json, os, wave
import numpy as np

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = json.load(open(os.path.join(WORK, "timeline.json"), encoding="utf-8"))
TOTAL = data["total"]
SR = 48000
N = int(round(TOTAL * SR))
rng = np.random.default_rng(7)


def lowpass(x, cutoff, order=2):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1.0 / SR)
    H = 1.0 / (1.0 + (f / cutoff) ** (2 * order))
    return np.fft.irfft(X * H, n=len(x))


def highpass(x, cutoff, order=2):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1.0 / SR)
    H = (f / cutoff) ** (2 * order) / (1.0 + (f / cutoff) ** (2 * order))
    return np.fft.irfft(X * H, n=len(x))


# --- warm pad -----------------------------------------------------------------
CHORDS = [
    [130.81, 196.00, 261.63, 329.63],   # Cmaj7
    [123.47, 146.83, 196.00, 293.66],   # G
    [110.00, 164.81, 220.00, 261.63],   # Am7
    [87.31, 130.81, 174.61, 220.00],    # Fmaj7
]
PROG = [0, 1, 2, 3, 0, 1, 2, 3]
seg = TOTAL / len(PROG)
pad = np.zeros(N + int((seg + 2.0) * SR) + SR)
for i, ci in enumerate(PROG):
    tones = CHORDS[ci]
    dur = seg + 2.0
    n = int(dur * SR)
    tt = np.arange(n) / SR
    env = np.clip(tt / 1.9, 0, 1) * np.clip((dur - tt) / 1.9, 0, 1)
    sig = np.zeros(n)
    for f in tones:
        ph = rng.random() * 6.283
        for det, g in ((1.0, 1.0), (1.0035, 0.55), (0.9968, 0.45)):
            sig += g * np.sin(2 * np.pi * f * det * tt + ph)
        sig += 0.10 * np.sin(2 * np.pi * f * 2 * tt + ph)
    s0 = int(i * seg * SR)
    pad[s0:s0 + n] += sig * env
pad = lowpass(pad, 1500.0)[:N] / 14.0

# --- music-box arpeggio -------------------------------------------------------
SEQ = [0, 1, 2, 3, 2, 3, 1, 2, 0, 2, 1, 3]
bells = np.zeros(N + int(2.4 * SR) + SR)
step = 0.65
for i, ci in enumerate(PROG):
    tones = CHORDS[ci]
    st = i * seg
    j = 0
    while st + j * step < (i + 1) * seg and st + j * step < TOTAL:
        f = tones[SEQ[j % len(SEQ)]] * 2.0
        amp = 0.30 + 0.18 * rng.random()
        if j % 4 == 3:
            amp *= 0.55
        dur = 2.2
        n = int(dur * SR)
        tt = np.arange(n) / SR
        env = np.exp(-4.6 * tt) * np.clip(tt / 0.004, 0, 1)
        sig = (np.sin(2 * np.pi * f * tt) + 0.30 * np.sin(2 * np.pi * f * 2 * tt)
               + 0.10 * np.sin(2 * np.pi * f * 3.01 * tt))
        s0 = int((st + j * step + rng.normal(0, 0.012)) * SR)
        if s0 < 0:
            continue
        bells[s0:s0 + n] += sig * env * amp
        j += 1
bells = lowpass(bells, 5200.0)[:N] / 9.0

# --- gentle reverb ------------------------------------------------------------
def reverb(x):
    out = np.array(x, dtype=np.float64)
    for d, g in ((0.113, 0.30), (0.179, 0.22), (0.251, 0.15), (0.347, 0.10)):
        k = int(d * SR)
        out += g * np.concatenate([np.zeros(k), x[:-k]])
    return out


wet = reverb(pad * 0.75 + bells)
dry = pad * 0.5 + bells * 0.6
mix = highpass(wet * 0.55 + dry * 0.8, 45.0, 1)

# --- stereo + fades -----------------------------------------------------------
d = int(0.013 * SR)
left = mix
right = np.concatenate([np.zeros(d), mix[:-d]])
left = highpass(lowpass(left, 9000), 40, 1)
right = highpass(lowpass(right, 9000), 40, 1)

fade_in = int(1.6 * SR)
fade_out = int(3.5 * SR)
env = np.ones(N)
env[:fade_in] = np.linspace(0, 1, fade_in) ** 1.5
env[-fade_out:] = np.linspace(1, 0, fade_out) ** 1.2
left *= env
right *= env

st = np.stack([left, right], axis=1)
st = st / max(1e-9, np.max(np.abs(st))) * 0.70

out = os.path.join(WORK, "bgm.wav")
with wave.open(out, "wb") as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes((st * 32767.0).astype("<i2").tobytes())
print("wrote %s  %.2fs  peak=%.3f" % (out, N / SR, float(np.max(np.abs(st)))))

# -*- coding: utf-8 -*-
"""Mix narration + background music (with ducking) into audio.m4a."""
import json, os, subprocess, wave
import numpy as np
import imageio_ffmpeg

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = imageio_ffmpeg.get_ffmpeg_exe()
data = json.load(open(os.path.join(WORK, "timeline.json"), encoding="utf-8"))
SR = 48000
TOTAL = data["total"]
N = int(round(TOTAL * SR))


def decode(path):
    raw = subprocess.run([FF, "-v", "error", "-i", path, "-f", "f32le",
                          "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype="<f4").astype(np.float64)


voice = np.zeros(N + SR)
for sc in data["scenes"]:
    # 用 build_content.py 写下的绝对路径。老 timeline.json 里没有 file 才回退到旧拼法。
    a = decode(sc.get("file") or os.path.join(WORK, "tts", sc["id"] + ".mp3")) * 0.85
    s0 = int(sc["speechStart"] * SR)
    voice[s0:s0 + len(a)] += a
voice = voice[:N]
voice /= max(1e-9, np.max(np.abs(voice))) / 0.88

# background music, faded to a bed level
bgm = np.zeros((N + SR, 2))
raw = subprocess.run([FF, "-v", "error", "-i", os.path.join(WORK, "bgm.wav"),
                      "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True).stdout
b = np.frombuffer(raw, dtype="<f4").astype(np.float64).reshape(-1, 2)
# bgm.wav 是上一次生成的，长度和本条片子无关：比片子长就截，比片子短就循环铺满。
# （以前写成 bgm[:len(b)] = b，只在配乐不长于片子时成立，做短片必炸。）
if len(b) < len(bgm):
    b = np.tile(b, (int(np.ceil(len(bgm) / max(1, len(b)))), 1))
bgm[:] = b[:len(bgm)]
bgm = bgm[:N]


def box(x, win):
    k = np.ones(win) / win
    return np.convolve(x, k, mode="same")


# duck the music while the narrator speaks
act = box(np.abs(voice), int(0.18 * SR))
act = np.clip(box(act, int(0.10 * SR)) / 0.045, 0, 1)
duck = 1.0 - 0.62 * act
bed = bgm * duck[:, None] * 0.135

mix = np.stack([voice, voice], axis=1) + bed
peak = np.max(np.abs(mix))
if peak > 0.985:
    mix *= 0.985 / peak

wav = os.path.join(WORK, "mix.wav")
with wave.open(wav, "wb") as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes((mix * 32767.0).astype("<i2").tobytes())

m4a = os.path.join(WORK, "audio.m4a")
subprocess.run([FF, "-y", "-v", "error", "-i", wav, "-c:a", "aac", "-b:a", "192k",
                "-ar", str(SR), "-ac", "2", m4a], check=True)
print("voice peak %.3f | bed peak %.3f | mix peak %.3f" %
      (np.max(np.abs(voice)), np.max(np.abs(bed)), np.max(np.abs(mix))))
print("wrote", m4a, os.path.getsize(m4a), "bytes")

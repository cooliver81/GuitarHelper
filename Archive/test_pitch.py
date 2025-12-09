import sounddevice as sd
import numpy as np
import aubio

SAMPLE_RATE = 44100
BUFFER_SIZE = 1024
SECONDS = 2

print("Recording... play a single note.")

audio = sd.rec(
    int(SECONDS * SAMPLE_RATE),
    samplerate=SAMPLE_RATE,
    channels=1,
    dtype="float32"
)
sd.wait()
audio = audio.flatten()

print("Recording done, analysing...")

pitch_o = aubio.pitch("yinfft", BUFFER_SIZE, BUFFER_SIZE//2, SAMPLE_RATE)
pitch_o.set_unit("Hz")
pitch_o.set_silence(-40)

pitches = []
for i in range(0, len(audio), BUFFER_SIZE):
    chunk = audio[i:i+BUFFER_SIZE]
    if len(chunk) < BUFFER_SIZE:
        chunk = np.pad(chunk, (0, BUFFER_SIZE - len(chunk)))
    p = pitch_o(chunk.astype("float32"))[0]
    conf = pitch_o.get_confidence()
    if conf > 0.8 and p > 0:
        pitches.append(p)

if pitches:
    print("Detected frequency (median):", float(np.median(pitches)))
else:
    print("No clear pitch detected.")

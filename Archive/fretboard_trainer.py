print("DEBUG: script has started running!")

import random
import math
import time
from typing import Optional

import numpy as np
import sounddevice as sd

# ------------- CONFIG ------------- #

SAMPLE_RATE = 44100
BUFFER_SIZE = 1024

AMPLITUDE_THRESHOLD = 0.02     # how loud a chunk must be to count as a note
MIN_F0 = 70.0                  # Hz
MAX_F0 = 1000.0                # Hz
EVENT_DEBOUNCE_SECONDS = 0.4   # minimum time between prints for same detected note

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F",
              "F#", "G", "G#", "A", "A#", "B"]

# Standard tuning MIDI notes
STRING_TUNING_MIDI = {
    6: 40,  # E2
    5: 45,  # A2
    4: 50,  # D3
    3: 55,  # G3
    2: 59,  # B3
    1: 64,  # E4
}

MAX_FRET = 12


# ------------- NOTE HELPERS ------------- #

def midi_to_note_name(midi_num: int) -> str:
    name = NOTE_NAMES[midi_num % 12]
    octave = (midi_num // 12) - 1
    return f"{name}{octave}"


def freq_to_midi(frequency: float) -> Optional[float]:
    if frequency is None or frequency <= 0:
        return None
    return 69 + 12 * math.log2(frequency / 440.0)


def pitch_class_name(midi_num: int) -> str:
    return NOTE_NAMES[midi_num % 12]


# ------------- FRETBOARD MODEL ------------- #

FRETBOARD = []
for s, open_midi in STRING_TUNING_MIDI.items():
    for fret in range(0, MAX_FRET + 1):
        midi = open_midi + fret
        name = midi_to_note_name(midi)
        FRETBOARD.append((s, fret, midi, name))


def random_target_string_and_note():
    string = random.choice(list(STRING_TUNING_MIDI.keys()))
    candidates = [entry for entry in FRETBOARD if entry[0] == string]
    _, fret, midi, name = random.choice(candidates)
    pc_name = pitch_class_name(midi)
    return string, midi, pc_name, fret, name


def nearest_fret_from_freq(freq: float):
    midi_est = freq_to_midi(freq)
    if midi_est is None:
        return None

    best = None
    best_dist = 999.0
    for (s, fret, midi, name) in FRETBOARD:
        dist = abs(midi_est - midi)
        if dist < best_dist:
            best_dist = dist
            best = (s, fret, midi, name)
    return best


# ------------- PITCH FROM ONE CHUNK ------------- #

def detect_pitch_from_chunk(audio: np.ndarray) -> Optional[float]:
    if audio is None or len(audio) == 0:
        return None

    audio = audio.astype(np.float32)
    audio = audio - np.mean(audio)

    peak = float(np.max(np.abs(audio)))
    if peak < AMPLITUDE_THRESHOLD:
        return None
    audio = audio / peak

    corr = np.correlate(audio, audio, mode="full")
    corr = corr[len(corr) // 2:]

    min_lag = int(SAMPLE_RATE / MAX_F0)
    max_lag = int(SAMPLE_RATE / MIN_F0)

    if max_lag >= len(corr):
        max_lag = len(corr) - 1
    if min_lag >= max_lag:
        return None

    corr[:min_lag] = 0
    lag = int(np.argmax(corr[min_lag:max_lag]) + min_lag)
    if lag <= 0:
        return None

    freq = SAMPLE_RATE / lag
    if freq < MIN_F0 or freq > MAX_F0:
        return None

    return float(freq)


# ------------- MAIN LOOP ------------- #

def main():
    print("🎯 String + Note Trainer (Continuous Listening, Debounced)")
    print("Standard tuning EADGBE.")
    print("I’ll give you: STRING N – NOTE.")
    print("Keep plucking until I detect that note on that string.")
    print("Ctrl+C to exit.\n")

    try:
        with sd.InputStream(channels=1, samplerate=SAMPLE_RATE,
                            blocksize=BUFFER_SIZE, dtype="float32") as stream:

            last_event_label = None
            last_event_time = 0.0

            while True:
                target_string, target_midi, target_pc, target_fret, target_full = random_target_string_and_note()

                print("\n----------------------------------------")
                print(f"Target: STRING {target_string} – {target_pc}")
                # print(f"(e.g. string {target_string}, fret {target_fret} = {target_full})")
                print("Listening... (Ctrl+C to quit)")

                while True:
                    chunk, _ = stream.read(BUFFER_SIZE)
                    mono = chunk[:, 0]

                    freq = detect_pitch_from_chunk(mono)
                    if freq is None:
                        continue

                    mapped = nearest_fret_from_freq(freq)
                    if mapped is None:
                        continue

                    det_string, det_fret, det_midi, det_name = mapped
                    det_pc = pitch_class_name(det_midi)

                    # Debounce: only print when label changes or enough time passes
                    label = (det_string, det_fret, det_pc)
                    now = time.time()
                    if label == last_event_label and (now - last_event_time) < EVENT_DEBOUNCE_SECONDS:
                        continue
                    last_event_label = label
                    last_event_time = now

                    print(f"\nHeard: {det_name} on string {det_string} (fret {det_fret}, {freq:.1f} Hz)")

                    correct_pc = (det_pc == target_pc)
                    correct_string = (det_string == target_string)

                    if correct_pc and correct_string:
                        print("✅ Correct note on the correct string!")
                        break
                    elif correct_pc:
                        print("🟡 Right note name, wrong string. Try again on the target string.")
                    else:
                        print("❌ Different note. Keep trying...")

    except KeyboardInterrupt:
        print("\nExiting trainer. Nice work!")


if __name__ == "__main__":
    main()

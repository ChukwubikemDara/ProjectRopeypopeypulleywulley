# Prepares narration recordings for the game. Needs ffmpeg.
#   python3 tools/narration_audio.py [folder with the .m4a recordings, default ~/Downloads]
# Each recording is trimmed to its speech (ignoring short clicks like the Voice Memos stop tap),
# cleaned up, levelled to -16 LUFS and saved as a mono mp3 in client/narration/, named after its
# script line (file name lower-cased, see NAMES for the exceptions). Then durations.json is rewritten
# so the narrator waits for each recording to finish.
import subprocess, re, sys, os, json
SRC = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/Downloads')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'client', 'narration')
NAMES = {'Fall opposite': 'fall-opposite', 'Fall-deliberate': 'fall-big'}
WIN = 0.05            # s per loudness window
SPEECH = -40          # dB RMS: louder than this is sound
SUSTAIN = 4           # windows in a row (0.2 s) before it counts as speech, so taps and clicks don't
LEAD, TAIL = 0.12, 0.3
def envelope(path):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', f'highpass=f=80,aresample=48000,asetnsamples=n={int(48000*WIN)},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return [float(v) if v not in ('-inf', 'inf') else -120 for v in re.findall(r'RMS_level=(-?[0-9.]+|-?inf)', out)]
def bounds(env):
    loud = [v > SPEECH for v in env]
    runs = [i for i in range(len(loud) - SUSTAIN + 1) if all(loud[i:i + SUSTAIN])]
    first = runs[0]; last = runs[-1] + SUSTAIN
    return first * WIN, last * WIN
report = json.load(open(os.path.join(OUT, 'durations.json'))) if os.path.exists(os.path.join(OUT, 'durations.json')) else {}
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.m4a') or f.startswith('ScreenRecording'): continue
    name = f[:-4]; line = NAMES.get(name, name.lower())
    src = os.path.join(SRC, f); env = envelope(src); a, b = bounds(env); total = len(env) * WIN
    start, end = max(0, a - LEAD), min(total, b + TAIL)
    dst = os.path.join(OUT, line + '.mp3')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{start:.3f}', '-to', f'{end:.3f}', '-i', src,
                    '-af', 'highpass=f=80,afftdn=nr=8,afade=t=in:d=0.04,loudnorm=I=-16:TP=-1.5:LRA=11,areverse,afade=t=in:d=0.12,areverse',
                    '-ac', '1', '-ar', '44100', '-b:a', '128k', dst], check=True)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], capture_output=True, text=True).stdout)
    report[line] = round(dur, 2)
    print(f'{line:14s} speech {a:5.2f}-{b:5.2f} of {total:5.2f}s -> {dur:5.2f}s')
json.dump(report, open(os.path.join(OUT, 'durations.json'), 'w'), indent=1, sort_keys=True)

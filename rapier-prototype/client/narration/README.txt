Narration recordings, one mp3 per line of the script in ../../narration.cjs, named after the line's id
(wake.mp3, fall-first.mp3, ...). durations.json holds each recording's length so lines never overlap.

To add or replace recordings: record each line as its own file (Voice Memos is fine), name it after the line
(e.g. Wake.m4a, Fall-first.m4a), put them in one folder and run, from rapier-prototype/:
  python3 tools/narration_audio.py ~/Downloads
It trims the silence and the stop tap, evens out the volume, converts to mp3 and updates durations.json.
A line without a recording is read by the browser's synthesized voice.

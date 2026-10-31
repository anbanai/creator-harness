## Verification contract

Before editing, use `ffprobe` on the original media and record:

- `stream` and `codec_type` for selected audio/video tracks;
- `width`, `height`, `duration`, and the display rotation matrix/side data;
- both `avg_frame_rate` and `r_frame_rate`, preserving the exact rational strings;
- the observed auto-editor version, threshold, stream selector, executable profile (`-ex v1` by default), and pre/post margins (`-m 0.25s` by default).

The output is a candidate silence map, not a final EDL. Record the one-to-one mapping from each accepted source frame/time range to the composition frame/time range; do not let the candidate tool silently choose semantic deletions.

When a cut joins audio from multiple source streams, compare codec, sample rate, channel layout, and time base before selecting a concat method. If the method requires matching parameters, create explicit normalized intermediates without changing source files and record each transformation. After joining, verify expected duration, sample rate, channel layout, audible discontinuities/clicks, and dialogue level against the source evidence. A successful mux or file-exists check does not establish continuity or acceptable dialogue level.

For `-ex clip-sequence`, record the output directory, each concrete segment path, source in/out timecodes, and the concatenation order. A directory or a single first segment is not a valid rough-cut deliverable.

Run an independent check after the rough cut, for example:

```bash
ffmpeg -hide_banner -i output/rough-cut.mp4 -af silencedetect=noise=-35dB:d=0.25 -f null -
```

Save the parsed `silencedetect` intervals and compare them to the candidate intervals. Differences are evidence to review, not permission to silently alter the edit. Preserve the source time base when converting intervals; do not infer 29.97 fps from a variable-frame-rate file.

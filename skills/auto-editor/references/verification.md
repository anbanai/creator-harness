## Verification contract

Before editing, use `ffprobe` on the original media and record:

- `stream` and `codec_type` for selected audio/video tracks;
- `width`, `height`, `duration`, and the display rotation matrix/side data;
- both `avg_frame_rate` and `r_frame_rate`, preserving the exact rational strings;
- the auto-editor version, threshold, stream selector, and pre/post margins.

For `-ex clip-sequence`, record the output directory, each concrete segment path, source in/out timecodes, and the concatenation order. A directory or a single first segment is not a valid rough-cut deliverable.

Run an independent check after the rough cut, for example:

```bash
ffmpeg -hide_banner -i output/rough-cut.mp4 -af silencedetect=noise=-35dB:d=0.25 -f null -
```

Save the parsed `silencedetect` intervals and compare them to the candidate intervals. Differences are evidence to review, not permission to silently alter the edit. Preserve the source time base when converting intervals; do not infer 29.97 fps from a variable-frame-rate file.

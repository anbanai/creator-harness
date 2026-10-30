## Asset source and rights

The read-only `third_party/motion-graphics` reference is pinned at commit `3d83d987d658601d8a1269eb691622bdcd427335`. Its `sound-effects` manifest contains 103 bundled CC0 OGG assets across 12 categories; the six default-kit takes remain the default choices. The adapter records the selected asset, source page, licence and SHA-256 in `sfx-cues.json` and `audio-source-manifest.json`.

The upstream repository describes these bundled assets as CC0 and permits redistribution. The upstream sound-pass implementation is not copied or executed. Anban's local renderer is an independent adapter that keeps the cue, mix and measurement workflow while excluding network downloads, Mixkit runtime entries and music processing.

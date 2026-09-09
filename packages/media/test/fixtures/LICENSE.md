# Fixture provenance

All image fixtures in this directory are generated from the asymmetric four-color grid in `generate.mjs` and are dedicated to this project under CC0-1.0.

Run `node test/fixtures/generate.mjs` from `packages/media` to regenerate JPEG, PNG, WebP, orientation, and corrupt fixtures. On macOS, regenerate the HEIC fixture from the project-owned PNG with:

```bash
sips -s format heic test/fixtures/portrait.png --out test/fixtures/sample.heic
```

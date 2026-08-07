# Live deploy check — 2026-08-07

Shot against https://dknos.github.io/kakisnow/ (not a local dev server) after
`main@134d8c7` deployed, because a 200 on the bundle is not evidence the page
runs. The live bundle's SHA-256 matched a local rebuild of the same commit
bit for bit; these two frames are the proof it also boots and draws.

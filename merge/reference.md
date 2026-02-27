# Secure Server-Side MP3 Merge (Bluehost) — Reference

## A. Install ffmpeg on Bluehost (shared hosting)

1. **Check OS / CPU**
   - Run `uname -a` via PHP
   - Expected: Linux x86_64 (EL9)

2. **Download static ffmpeg (locally)**
   - Source: https://johnvansickle.com/ffmpeg/
   - File: `ffmpeg-release-amd64-static.tar.xz`

3. **Extract locally**
   - `tar -xf ffmpeg-release-amd64-static.tar.xz`
   - Keep only the `ffmpeg` binary

4. **Upload binary**
   - Path: `public_html/api/bin/ffmpeg`

5. **Make executable**
   - Permissions: `755`

6. **Verify execution**
   - Run via PHP: `ffmpeg -version`
   - Confirm version output appears

---

## B. Secure merge endpoint flow

7. **Strict authentication**
   - Requires `Authorization: Bearer <SECRET_TOKEN>`
   - No token → `401 Unauthorized`

8. **Source validation**
   - Only paths under:
     - `/braillestudio/sounds/nl/speech/`
   - Only `.mp3` files allowed

9. **Server-side download**
   - MP3 files fetched by PHP (no browser CORS)

10. **Normalization**
    - Each MP3 → WAV
    - Mono, 44.1 kHz

11. **Optional silence**
    - Insert silence when `gapMs > 0`

12. **Concatenation**
    - WAV files concatenated reliably

13. **Final encoding**
    - Output MP3
    - 128 kbps, mono

14. **Controlled output**
    - Written only to:
      - `/braillestudio/sounds/nl/klankzuiver/<filename>.mp3`

15. **Cleanup**
    - Temporary files removed after request

16. **Response**
    - JSON response:
      - `ok`
      - `outputFilename`
      - `outputUrl`
      - `bytes`
      - `gapMs`
      - optional debug fields

---

## C. Security guarantees

- Token-only access
- No arbitrary URL downloads
- No arbitrary filesystem writes
- Safe for shared hosting
- No client-side CORS exposure

curl --location 'https://www.tastenbraille.com/api/merge_mp3.php' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer een_heel_lang_random_token_hier' \
--data '{
    "sources": [
      "/sounds/nl/speech/b.mp3",
      "/sounds/nl/speech/a.mp3",
      "/sounds/nl/speech/l.mp3",
      "/sounds/nl/speech/bal.mp3"
    ],
    "outputFilename": "ballbal.mp3",
    "gapMs": 500,
    "debug": true,
    "tryCopyFirst": false
  }'
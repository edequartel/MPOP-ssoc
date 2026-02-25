# ElevenLabs TTS Component

This component provides **text-to-speech playback using the ElevenLabs API**.  
It is designed as a **pure JavaScript component** (no HTML file) and fits the
BrailleServer / BrailleBridge architecture.

The component is responsible for:
- converting text to speech via ElevenLabs
- playing audio in the browser
- remaining UI-agnostic (no buttons or markup)

It does **not**:
- store API keys
- manage UI controls
- send text to a braille display directly

—

## Folder structure

/components/elevenlabs/
  elevenlabs.js
  elevenlabs.css        (optional)
  README.md

—

## Component contract

### Import

<script src=“../components/elevenlabs/elevenlabs.js”></script>

—

## Initialization

const tts = new ElevenLabsTTS({
  apiKeyProvider: () => window.ELEVENLABS_API_KEY,
  voiceId: “EXAVITQu4vr4xnSDxMaL”,
  model: “eleven_multilingual_v2”
});

### Required options

Option | Description
—— | ————
apiKeyProvider | Function returning the ElevenLabs API key
voiceId | ElevenLabs voice ID
model | ElevenLabs TTS model

Important:  
The API key must **never be hard-coded** in the component.

—

## Public API

### speak(text)

Generate and play speech for the given text.

await tts.speak(“Zoek de juiste letter”);

- returns a Promise
- cancels any currently playing speech

—

### stop()

Stop current audio playback.

tts.stop();

—

### isPlaying()

Check whether audio is currently playing.

if (tts.isPlaying()) {
  tts.stop();
}

—

## Integration example (words / activities)

async function playInstruction(text) {
  await tts.speak(text);
}

Typical usage scenarios:
- spoken instructions for activities
- feedback (“Goed gedaan”, “Probeer opnieuw”)
- story narration
- accessibility support

—

## Relation to BrailleBridge

This component is **audio-only**.

If braille output is required, the page or activity controller must explicitly call:
- brailleBridge.sendText(text)
- and then optionally call tts.speak(text)

This separation ensures:
- predictable braille behavior
- independent audio control
- easier testing

—

## Design principles

- No DOM dependencies
- No HTML templates
- No UI opinions
- Promise-based API
- Safe API-key handling

—

## Non-goals

This component intentionally does **not**:
- expose ElevenLabs REST details
- cache audio files
- provide UI buttons or controls
- manage rate, pitch, or SSML

Those concerns belong in:
- page controllers
- activity runtime logic

—

## Status

Stable  
Used for:
- activity instructions
- spoken feedback
- story narration
<?php
declare(strict_types=1);

/**
 * merge_mp3.php (server-side, shared-hosting friendly)
 *
 * - Accepts relative source paths under /braillestudio (restricted to /sounds/nl/speech/)
 * - Downloads MP3s server-to-server (no CORS issues)
 * - Merges into /braillestudio/sounds/nl/klankzuiver/<outputFilename>.mp3
 * - Robust mode: normalizes each MP3 -> WAV before concatenation (fixes "Invalid data" issues)
 * - Optional gapMs silence between clips
 * - Returns JSON with public output URL
 */

header("Content-Type: application/json; charset=utf-8");

// --------------------
// CORS
// --------------------
header("Access-Control-Allow-Origin: *"); // tighten later if desired
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }

// --------------------
// CONFIG
// --------------------
$TOKEN = "een_heel_lang_random_token_hier";

$ROOT_URL = "https://www.tastenbraille.com/braillestudio";
$ROOT_FS  = realpath(__DIR__ . "/../braillestudio"); // public_html/braillestudio

$ALLOWED_INPUT_PREFIX = "/sounds/nl/speech/";
$ALLOWED_OUTPUT_DIR   = "/sounds/nl/klankzuiver/";

$FFMPEG   = __DIR__ . "/bin/ffmpeg";
$TMP_BASE = __DIR__ . "/tmp";

// MP3 output settings (used when encoding)
$OUT_SAMPLE_RATE = 44100;
$OUT_CHANNELS    = 1;
$OUT_BITRATE     = "128k";

// --------------------
// Helpers
// --------------------
function fail(int $code, string $msg, array $extra = []): void {
  http_response_code($code);
  echo json_encode(["ok" => false, "error" => $msg] + $extra, JSON_UNESCAPED_SLASHES);
  exit;
}

function rrmdir(string $dir): void {
  if (!is_dir($dir)) return;
  foreach (glob($dir . "/*") as $f) {
    if (is_dir($f)) rrmdir($f); else @unlink($f);
  }
  @rmdir($dir);
}

function sanitizeOutputFilename(string $name): string {
  $name = preg_replace('/[^a-zA-Z0-9._-]/', "_", $name);
  if ($name === "" || $name === "." || $name === "..") $name = "merged.mp3";
  if (!preg_match('/\.mp3$/i', $name)) $name .= ".mp3";
  return $name;
}

function isSafeRelativePath(string $path): bool {
  // Must start with '/', no traversal, no backslashes, no query/fragment
  if ($path === "" || $path[0] !== "/") return false;
  if (str_contains($path, "..")) return false;
  if (str_contains($path, "\\")) return false;
  if (str_contains($path, "\0")) return false;
  if (str_contains($path, "?") || str_contains($path, "#")) return false;
  return true;
}

function makeConcatListFile(array $paths, string $listFile): void {
  $list = "";
  foreach ($paths as $p) {
    $safe = str_replace("'", "'\\''", $p);
    $list .= "file '{$safe}'\n";
  }
  file_put_contents($listFile, $list);
}

// --------------------
// Auth
// --------------------
$auth = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
if ($auth !== "Bearer {$TOKEN}") fail(401, "Unauthorized");

// --------------------
// Input
// --------------------
$raw = file_get_contents("php://input") ?: "";
$data = json_decode($raw, true);
if (!is_array($data)) fail(400, "Invalid JSON.");

$sources = $data["sources"] ?? null; // relative paths under /braillestudio
$outputFilename = sanitizeOutputFilename((string)($data["outputFilename"] ?? "merged.mp3"));
$gapMs = (int)($data["gapMs"] ?? 0);
$debug = (bool)($data["debug"] ?? false);

// Optional: if true, tries fast "-c copy" first; otherwise always robust encode.
// For tiny MP3 clips, I recommend robust encode always.
$tryCopyFirst = (bool)($data["tryCopyFirst"] ?? false);

if (!is_array($sources) || count($sources) < 2) {
  fail(400, "Provide sources[] with at least 2 items.", [
    "example" => [
      "sources" => [
        "/sounds/nl/speech/b.mp3",
        "/sounds/nl/speech/a.mp3",
        "/sounds/nl/speech/l.mp3"
      ],
      "outputFilename" => "bal.mp3",
      "gapMs" => 0
    ]
  ]);
}
if ($gapMs < 0 || $gapMs > 5000) fail(400, "gapMs must be 0..5000.");

// Server prerequisites
if (!$ROOT_FS) fail(500, "Cannot resolve ROOT_FS");
if (!is_file($FFMPEG) || !is_executable($FFMPEG)) fail(500, "ffmpeg missing/not executable");
if (!is_dir($TMP_BASE) && !mkdir($TMP_BASE, 0775, true)) fail(500, "Cannot create tmp base");

// Output dir
$outDirFs = $ROOT_FS . $ALLOWED_OUTPUT_DIR;
if (!is_dir($outDirFs) && !mkdir($outDirFs, 0775, true)) fail(500, "Cannot create output dir");
$outDirFsReal = realpath($outDirFs);
if (!$outDirFsReal) fail(500, "Cannot resolve output dir");

// Validate sources
$srcPaths = [];
foreach ($sources as $p) {
  $p = (string)$p;

  if (!isSafeRelativePath($p)) fail(400, "Unsafe source path: {$p}");
  if (!str_starts_with($p, $ALLOWED_INPUT_PREFIX)) {
    fail(400, "Source must start with {$ALLOWED_INPUT_PREFIX}", ["got" => $p]);
  }
  if (!preg_match('/\.mp3$/i', $p)) fail(400, "Only .mp3 sources allowed", ["got" => $p]);

  $srcPaths[] = $p;
}

// Temp dir
$tmpDir = $TMP_BASE . "/merge_" . bin2hex(random_bytes(6));
if (!mkdir($tmpDir, 0775, true)) fail(500, "Cannot create tmp dir");

$downloadLog = [];
$localMp3Parts = [];
$ffmpegCopyStderr = "";
$ffmpegEncodeStderr = "";
$mode = "encode";

try {
  // --------------------
  // Download MP3s server-to-server
  // --------------------
  foreach ($srcPaths as $i => $relPath) {
    $url  = rtrim($ROOT_URL, "/") . $relPath;
    $dest = $tmpDir . "/part_" . str_pad((string)$i, 3, "0", STR_PAD_LEFT) . ".mp3";

    $fp = fopen($dest, "wb");
    if (!$fp) throw new RuntimeException("Cannot write temp file: {$dest}");

    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_FILE => $fp,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_MAXREDIRS => 5,
      CURLOPT_CONNECTTIMEOUT => 10,
      CURLOPT_TIMEOUT => 30,
      CURLOPT_USERAGENT => "merge_mp3.php/5.0",
    ]);
    $ok   = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    fclose($fp);

    $size = is_file($dest) ? filesize($dest) : 0;
    $downloadLog[] = ["i" => $i, "url" => $url, "http" => $http, "bytes" => $size, "curlError" => $err];

    if (!$ok || $http < 200 || $http >= 300) {
      throw new RuntimeException("Download failed at index {$i} (HTTP {$http}) for {$url}. {$err}");
    }
    if ($size < 200) {
      throw new RuntimeException("Downloaded file too small at index {$i} (maybe HTML): {$url}");
    }

    $localMp3Parts[] = $dest;
  }

  $outPath = $outDirFsReal . "/" . $outputFilename;

  // --------------------
  // Optional: try FAST concat copy first
  // --------------------
  if ($tryCopyFirst && $gapMs === 0) {
    $mode = "copy";
    $listFile = $tmpDir . "/list_mp3.txt";
    makeConcatListFile($localMp3Parts, $listFile);

    $cmdCopy = escapeshellarg($FFMPEG)
      . " -hide_banner -loglevel error -y"
      . " -f concat -safe 0 -i " . escapeshellarg($listFile)
      . " -c copy " . escapeshellarg($outPath)
      . " 2>&1";

    $ffmpegCopyStderr = shell_exec($cmdCopy) ?? "";

    $copyOk = (is_file($outPath) && filesize($outPath) >= 500);
    if (!$copyOk) {
      // fall back to robust encode
      @unlink($outPath);
      $mode = "encode";
    }
  }

  // --------------------
  // Robust encode pipeline (recommended)
  // - normalize each MP3 -> WAV
  // - interleave silence WAV if gapMs > 0
  // - concat WAVs
  // - encode final MP3
  // --------------------
  if ($mode === "encode") {
    // 1) Normalize MP3 -> WAV
    $wavParts = [];
    foreach ($localMp3Parts as $idx => $mp3Path) {
      $wavPath = $tmpDir . "/norm_" . str_pad((string)$idx, 3, "0", STR_PAD_LEFT) . ".wav";

      $cmdNorm = escapeshellarg($FFMPEG)
        . " -hide_banner -loglevel error -y"
        . " -i " . escapeshellarg($mp3Path)
        . " -vn -ac " . (int)$OUT_CHANNELS
        . " -ar " . (int)$OUT_SAMPLE_RATE
        . " -f wav " . escapeshellarg($wavPath)
        . " 2>&1";

      $normOut = shell_exec($cmdNorm) ?? "";
      if (!is_file($wavPath) || filesize($wavPath) < 1000) {
        throw new RuntimeException("Normalize failed for part {$idx}: " . ($normOut ?: "unknown error"));
      }
      $wavParts[] = $wavPath;
    }

    // 2) Optional silence WAV
    $sequence = $wavParts;
    if ($gapMs > 0) {
      $silencePath = $tmpDir . "/silence.wav";
      $gapSec = $gapMs / 1000.0;

      $cmdSilence = escapeshellarg($FFMPEG)
        . " -hide_banner -loglevel error -y"
        . " -f lavfi -i " . escapeshellarg("anullsrc=r={$OUT_SAMPLE_RATE}:cl=mono")
        . " -t " . escapeshellarg((string)$gapSec)
        . " -f wav " . escapeshellarg($silencePath)
        . " 2>&1";

      $silOut = shell_exec($cmdSilence) ?? "";
      if (!is_file($silencePath) || filesize($silencePath) < 100) {
        throw new RuntimeException("Failed to generate silence: " . ($silOut ?: "unknown error"));
      }

      $sequence = [];
      for ($i = 0; $i < count($wavParts); $i++) {
        $sequence[] = $wavParts[$i];
        if ($i !== count($wavParts) - 1) $sequence[] = $silencePath;
      }
    }

    // 3) Concat WAVs
    $listFile = $tmpDir . "/list_wav.txt";
    makeConcatListFile($sequence, $listFile);

    // 4) Encode MP3
    $cmdEnc = escapeshellarg($FFMPEG)
      . " -hide_banner -loglevel error -y"
      . " -f concat -safe 0 -i " . escapeshellarg($listFile)
      . " -vn"
      . " -ar " . (int)$OUT_SAMPLE_RATE
      . " -ac " . (int)$OUT_CHANNELS
      . " -c:a libmp3lame -b:a " . escapeshellarg($OUT_BITRATE)
      . " " . escapeshellarg($outPath)
      . " 2>&1";

    $ffmpegEncodeStderr = shell_exec($cmdEnc) ?? "";

    if (!is_file($outPath) || filesize($outPath) < 500) {
      throw new RuntimeException("ffmpeg encode failed: " . ($ffmpegEncodeStderr ?: "unknown error"));
    }
  }

  $publicUrl = rtrim($ROOT_URL, "/") . $ALLOWED_OUTPUT_DIR . $outputFilename;

  $resp = [
    "ok" => true,
    "mode" => $mode,
    "outputFilename" => $outputFilename,
    "outputUrl" => $publicUrl,
    "bytes" => filesize($outPath),
    "gapMs" => $gapMs,
  ];

  if ($debug) {
    $resp["downloadLog"] = $downloadLog;
    $resp["ffmpegCopyStderr"] = $ffmpegCopyStderr;
    $resp["ffmpegEncodeStderr"] = $ffmpegEncodeStderr;
  }

  echo json_encode($resp, JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
  $extra = $debug ? [
    "downloadLog" => $downloadLog,
    "ffmpegCopyStderr" => $ffmpegCopyStderr,
    "ffmpegEncodeStderr" => $ffmpegEncodeStderr
  ] : [];
  fail(500, $e->getMessage(), $extra);
} finally {
  rrmdir($tmpDir);
}
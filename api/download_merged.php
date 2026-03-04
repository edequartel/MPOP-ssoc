<?php
declare(strict_types=1);

/**
 * Force-download endpoint for merged.mp3.
 * Place this alongside mixedmerge_mp3.php (typically served as /api/download_merged.php).
 */

$downloadName = "merged.mp3";
$remoteUrl = "https://www.tastenbraille.com/braillestudio/sounds/nl/out/merged.mp3";
$rootFs = realpath(__DIR__ . "/../braillestudio");
$localPath = $rootFs ? $rootFs . "/sounds/nl/out/merged.mp3" : "";

function sendDownloadHeaders(string $filename, int $length = 0): void {
  header("Content-Type: audio/mpeg");
  header('Content-Disposition: attachment; filename="' . $filename . '"');
  header("X-Content-Type-Options: nosniff");
  header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
  header("Pragma: no-cache");
  header("Expires: 0");
  if ($length > 0) {
    header("Content-Length: " . $length);
  }
}

if ($localPath !== "" && is_file($localPath) && is_readable($localPath)) {
  $size = filesize($localPath);
  sendDownloadHeaders($downloadName, $size === false ? 0 : (int)$size);
  readfile($localPath);
  exit;
}

if (!function_exists("curl_init")) {
  http_response_code(500);
  header("Content-Type: text/plain; charset=utf-8");
  echo "Download failed: local file missing and cURL not available.";
  exit;
}

$ch = curl_init($remoteUrl);
curl_setopt_array($ch, [
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_MAXREDIRS => 5,
  CURLOPT_CONNECTTIMEOUT => 10,
  CURLOPT_TIMEOUT => 60,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HEADER => false,
  CURLOPT_USERAGENT => "download_merged.php/1.0",
]);
$data = curl_exec($ch);
$http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($data === false || $http < 200 || $http >= 300) {
  http_response_code(502);
  header("Content-Type: text/plain; charset=utf-8");
  echo "Download failed: could not fetch merged.mp3.";
  if ($err !== "") {
    echo " " . $err;
  }
  exit;
}

sendDownloadHeaders($downloadName, strlen($data));
echo $data;
exit;


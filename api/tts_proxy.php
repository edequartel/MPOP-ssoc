<?php
declare(strict_types=1);

require_once __DIR__ . "/server_auth.php";
require_once __DIR__ . "/elevenlabs_config_loader.php";

cors_preflight("POST, OPTIONS");
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
  json_out(405, ["ok" => false, "error" => "Method not allowed."]);
}

require_allowed_role(["admin", "editor", "soundcreator"]);

$data = json_decode(file_get_contents("php://input") ?: "", true);
if (!is_array($data)) {
  json_out(400, ["ok" => false, "error" => "Invalid JSON body."]);
}

$text = trim((string)($data["text"] ?? ""));
$config = load_elevenlabs_config();
$voiceId = trim((string)($data["voiceId"] ?? "")) ?: elevenlabs_default_voice_id($config);
$modelId = trim((string)($data["modelId"] ?? "")) ?: "eleven_v3";
$outputFormat = trim((string)($data["outputFormat"] ?? "")) ?: "mp3_44100_128";
$voiceSettings = $data["voice_settings"] ?? null;

if ($text === "") json_out(400, ["ok" => false, "error" => "Missing text."]);
if ($voiceId === "") json_out(500, ["ok" => false, "error" => "No voiceId supplied and default_voice_id is missing in ElevenLabs config."]);

$apiKey = elevenlabs_api_key($config);
if ($apiKey === "") {
  json_out(500, ["ok" => false, "error" => "ElevenLabs api_key is missing in private/elevenlabs_config.php."]);
}

$payload = ["text" => $text, "model_id" => $modelId];
if (is_array($voiceSettings)) {
  $payload["voice_settings"] = $voiceSettings;
}

$url = "https://api.elevenlabs.io/v1/text-to-speech/" . rawurlencode($voiceId)
  . "?output_format=" . rawurlencode($outputFormat);

$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_CONNECTTIMEOUT => 10,
  CURLOPT_TIMEOUT => 120,
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_SLASHES),
  CURLOPT_HTTPHEADER => [
    "xi-api-key: {$apiKey}",
    "Content-Type: application/json",
    "Accept: audio/mpeg",
  ],
]);
$body = curl_exec($ch);
$err = curl_error($ch);
$status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($body === false) {
  json_out(502, ["ok" => false, "error" => "ElevenLabs request failed.", "detail" => $err]);
}

if ($status < 200 || $status >= 300) {
  json_out($status ?: 502, [
    "ok" => false,
    "error" => "ElevenLabs request failed.",
    "details" => substr((string)$body, 0, 1000),
  ]);
}

http_response_code(200);
header("Content-Type: audio/mpeg");
header("Cache-Control: no-store");
echo $body;

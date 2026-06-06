<?php
declare(strict_types=1);

require_once __DIR__ . "/server_auth.php";
require_once __DIR__ . "/elevenlabs_config_loader.php";

cors_preflight("GET, OPTIONS");
if ($_SERVER["REQUEST_METHOD"] !== "GET") {
  json_out(405, ["ok" => false, "error" => "Method not allowed."]);
}

require_allowed_role(["admin", "editor", "soundcreator"]);

$config = load_elevenlabs_config();
$apiKey = elevenlabs_api_key($config);
if ($apiKey === "") {
  json_out(500, ["ok" => false, "error" => "ElevenLabs api_key is missing in private/elevenlabs_config.php."]);
}

$ch = curl_init("https://api.elevenlabs.io/v1/user/subscription");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_CONNECTTIMEOUT => 10,
  CURLOPT_TIMEOUT => 30,
  CURLOPT_HTTPHEADER => [
    "xi-api-key: {$apiKey}",
    "Accept: application/json",
  ],
]);
$body = curl_exec($ch);
$err = curl_error($ch);
$status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($body === false) {
  json_out(502, ["ok" => false, "error" => "ElevenLabs request failed.", "detail" => $err]);
}

$data = json_decode((string)$body, true);
if ($status < 200 || $status >= 300 || !is_array($data)) {
  json_out($status ?: 502, [
    "ok" => false,
    "error" => "ElevenLabs request failed.",
    "details" => is_string($body) ? substr($body, 0, 1000) : "",
  ]);
}

json_out(200, [
  "ok" => true,
  "tier" => $data["tier"] ?? null,
  "status" => $data["status"] ?? null,
  "character_count" => $data["character_count"] ?? null,
  "character_limit" => $data["character_limit"] ?? null,
  "next_character_count_reset_unix" => $data["next_character_count_reset_unix"] ?? null,
]);

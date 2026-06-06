<?php
declare(strict_types=1);

function load_elevenlabs_config(): array {
  $documentRoot = rtrim((string)($_SERVER["DOCUMENT_ROOT"] ?? ""), "/");
  $candidates = array_filter([
    getenv("ELEVENLABS_CONFIG_FILE") ?: null,
    $documentRoot !== "" ? dirname($documentRoot) . "/private/elevenlabs_config.php" : null,
    $documentRoot !== "" ? $documentRoot . "/../private/elevenlabs_config.php" : null,
    __DIR__ . "/../../private/elevenlabs_config.php",
    __DIR__ . "/../private/elevenlabs_config.php",
  ]);

  foreach (array_unique($candidates) as $path) {
    if (!is_file($path) || !is_readable($path)) continue;
    $config = require $path;
    if (is_array($config)) {
      return $config;
    }
  }

  return [];
}

function elevenlabs_api_key(array $config): string {
  $configuredKey = trim((string)($config["api_key"] ?? ""));
  if ($configuredKey !== "") {
    return $configuredKey;
  }
  return trim((string)(getenv("ELEVENLABS_API_KEY") ?: ""));
}

function elevenlabs_default_voice_id(array $config): string {
  return trim((string)($config["default_voice_id"] ?? ""));
}

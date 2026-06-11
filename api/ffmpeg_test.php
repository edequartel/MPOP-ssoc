<?php
header("Content-Type: text/plain; charset=utf-8");

$pathCandidates = array_map(
    static fn(string $dir): string => rtrim($dir, "/") . "/ffmpeg",
    array_filter(explode(PATH_SEPARATOR, getenv("PATH") ?: ""))
);
$documentRoot = rtrim((string)($_SERVER["DOCUMENT_ROOT"] ?? ""), "/");
$candidates = array_values(array_unique(array_filter([
    getenv("FFMPEG_PATH") ?: null,
    $documentRoot . "/api/bin/ffmpeg",
    __DIR__ . "/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    ...$pathCandidates,
])));

foreach ($candidates as $candidate) {
    echo "ffmpeg path: {$candidate}\n";
    echo "is_file: " . (is_file($candidate) ? "yes" : "no") . "\n";
    echo "is_executable: " . (is_executable($candidate) ? "yes" : "no") . "\n\n";

    if (is_file($candidate) && is_executable($candidate)) {
        echo shell_exec(escapeshellarg($candidate) . " -version 2>&1") ?: "(no output)\n";
        exit;
    }
}

http_response_code(500);
echo "No executable ffmpeg binary found.\n";

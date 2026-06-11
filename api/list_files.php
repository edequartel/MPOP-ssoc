<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

function out(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function sanitize_rel_path(string $path): string {
    $path = str_replace('\\', '/', trim($path));
    $path = trim($path, '/');
    if ($path === '') {
        return '';
    }

    $parts = explode('/', $path);
    $safeParts = [];
    foreach ($parts as $part) {
        if ($part === '' || $part === '.' || $part === '..') {
            continue;
        }
        if (!preg_match('/^[A-Za-z0-9._-]+$/', $part)) {
            out(400, ['ok' => false, 'error' => 'Invalid path segment', 'segment' => $part]);
        }
        $safeParts[] = $part;
    }

    return implode('/', $safeParts);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    out(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$path = sanitize_rel_path((string)($_GET['path'] ?? ''));
if ($path === '') {
    out(400, ['ok' => false, 'error' => 'Missing path']);
}

$allowedPrefixes = [
    'sounds/',
];

$isAllowed = false;
foreach ($allowedPrefixes as $prefix) {
    if (str_starts_with($path, $prefix)) {
        $isAllowed = true;
        break;
    }
}
if (!$isAllowed) {
    out(400, [
        'ok' => false,
        'error' => 'Path must start with an allowed prefix',
        'path' => $path,
        'allowed' => $allowedPrefixes,
    ]);
}

$documentRoot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
if ($documentRoot === '') {
    out(500, ['ok' => false, 'error' => 'DOCUMENT_ROOT not available']);
}

$baseFsDir = $documentRoot . '/braillestudio-data';
$baseFsReal = realpath($baseFsDir);
if ($baseFsReal === false) {
    out(500, ['ok' => false, 'error' => 'Cannot resolve base directory']);
}

$targetDir = $baseFsReal . '/' . $path;
$targetReal = realpath($targetDir);
if ($targetReal === false || !is_dir($targetReal)) {
    out(404, ['ok' => false, 'error' => 'Folder not found', 'path' => $path]);
}

if (!str_starts_with($targetReal, $baseFsReal . DIRECTORY_SEPARATOR) && $targetReal !== $baseFsReal) {
    out(400, ['ok' => false, 'error' => 'Resolved path escapes base directory']);
}

$items = scandir($targetReal);
if ($items === false) {
    out(500, ['ok' => false, 'error' => 'Failed to read directory']);
}

$files = [];
foreach ($items as $name) {
    if ($name === '.' || $name === '..') {
        continue;
    }

    $fullPath = $targetReal . DIRECTORY_SEPARATOR . $name;
    if (!is_file($fullPath)) {
        continue;
    }

    $relPath = $path . '/' . $name;
    $bytes = filesize($fullPath);
    $mtime = filemtime($fullPath);

    $files[] = [
        'name' => $name,
        'path' => '/' . $relPath,
        'url' => 'https://www.tastenbraille.com/braillestudio-data/' . str_replace('%2F', '/', rawurlencode($relPath)),
        'bytes' => $bytes === false ? 0 : $bytes,
        'modifiedAt' => $mtime === false ? null : gmdate('c', $mtime),
    ];
}

usort($files, static fn(array $a, array $b): int => strnatcasecmp($a['name'], $b['name']));

out(200, [
    'ok' => true,
    'path' => '/' . $path,
    'count' => count($files),
    'files' => $files,
]);

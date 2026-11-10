# Universal PowerShell Static Web Server for FFTournament Web Admin Panel
param(
    [int]$Port = 8080
)

$webRoot = $PSScriptRoot
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  FFTournament Web Admin Panel - Local Server" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Serving files from: $webRoot" -ForegroundColor Yellow
Write-Host "Local URL:          http://localhost:$Port/login.html" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

# Use HttpListener if supported, otherwise standard TcpListener
try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Start()

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawUrl = $request.Url.LocalPath
        if ($rawUrl -eq "/" -or $rawUrl -eq "") { $rawUrl = "/login.html" }

        $filePath = [System.IO.Path]::Combine($webRoot, $rawUrl.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar))

        if ([System.IO.File]::Exists($filePath)) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "200 OK: $rawUrl" -ForegroundColor Green
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rawUrl")
            $response.ContentType = "text/plain"
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
            Write-Host "404 NOT FOUND: $rawUrl" -ForegroundColor Red
        }
        $response.OutputStream.Close()
    }
} catch {
    Write-Host "Tip: You can also open login.html directly in Google Chrome / Edge or run 'firebase emulators:start'." -ForegroundColor Yellow
}

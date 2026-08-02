# Cloudflare Quick Tunnel → ESP32 (Lampe "Bilder")
# Voraussetzung: cloudflared installiert, PC im gleichen Netz wie der ESP.
# Die angezeigte https://….trycloudflare.com-URL in topics/x-money.js
# als CLOUDFLARE_TUNNEL_BASE eintragen (ohne Pfad, ohne trailing slash).
#
# Start:  powershell -ExecutionPolicy Bypass -File .\scripts\start-esp-tunnel.ps1
# Stop:   Strg+C

$ErrorActionPreference = "Stop"

$espOrigin = "http://esp32-27DAE4.speedport.ip"

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  $candidates = @(
    "$env:ProgramFiles\cloudflared\cloudflared.exe",
    "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) {
      $cloudflared = $c
      break
    }
  }
}

if (-not $cloudflared) {
  Write-Host "cloudflared nicht gefunden. Installieren z.B.:" -ForegroundColor Red
  Write-Host "  winget install --id Cloudflare.cloudflared -e"
  exit 1
}

Write-Host ""
Write-Host "Cloudflare Quick Tunnel zum ESP" -ForegroundColor Cyan
Write-Host "  Origin: $espOrigin"
Write-Host "  API:    https://<tunnel-host>/gpio/set"
Write-Host ""
Write-Host "1) URL aus der Ausgabe kopieren (https://….trycloudflare.com)"
Write-Host "2) In topics/x-money.js als CLOUDFLARE_TUNNEL_BASE setzen"
Write-Host "3) Commit/Push oder lokal testen – Tunnel-Prozess muss laufen bleiben"
Write-Host ""
Write-Host "Hinweis: Quick-Tunnel-URL aendert sich bei jedem Start." -ForegroundColor Yellow
Write-Host "         Tunnel exponiert den ESP oeffentlich (kein Auth)." -ForegroundColor Yellow
Write-Host ""

& $cloudflared tunnel --url $espOrigin --no-autoupdate

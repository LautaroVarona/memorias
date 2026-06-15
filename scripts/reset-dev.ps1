# Reinicio limpio del entorno de desarrollo (Windows).
# Uso: npm run dev:reset

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot\..

Write-Host ""
Write-Host "=== Memorias: reinicio limpio ===" -ForegroundColor Cyan
Write-Host ""

# 1. Liberar puertos 3000-3004 (varios next dev zombies)
$ports = 3000..3004
foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $conns) {
    $procId = $conn.OwningProcess
    if ($procId -and $procId -ne 0) {
      $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
      Write-Host "  Deteniendo $name (PID $procId) en puerto $port"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
}

Start-Sleep -Seconds 2

# 2. Borrar caché de Next.js (causa EPERM / ENOENT / webpack corrupto)
Write-Host ""
Write-Host "Eliminando .next ..."
if (Test-Path ".next") {
  Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
  if (Test-Path ".next") {
    Write-Host "  AVISO: no se pudo borrar .next por completo. Cierra Cursor/terminales y repite." -ForegroundColor Yellow
  } else {
    Write-Host "  OK" -ForegroundColor Green
  }
}

# 3. Regenerar Prisma (solo si no hay otro node bloqueando el DLL)
Write-Host ""
Write-Host "Regenerando Prisma Client ..."
npx prisma generate
if ($LASTEXITCODE -ne 0) {
  Write-Host "  AVISO: prisma generate falló (suele ser por otro node en ejecución)." -ForegroundColor Yellow
  Write-Host "  Cierra todas las terminales con npm run dev y ejecuta: npx prisma generate" -ForegroundColor Yellow
}

# 4. Arrancar
Write-Host ""
Write-Host "Iniciando en http://localhost:3000" -ForegroundColor Green
Write-Host ""
npm run dev

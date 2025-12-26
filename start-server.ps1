# Скрипт для запуска сервера с проверкой порта

$port = 3000

Write-Host "Проверка порта $port..." -ForegroundColor Yellow

# Проверяем, занят ли порт
$connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue

if ($connection) {
    $processId = $connection.OwningProcess | Select-Object -First 1
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    
    Write-Host "`n⚠️  Порт $port уже занят процессом:" -ForegroundColor Yellow
    Write-Host "   PID: $processId" -ForegroundColor Yellow
    if ($process) {
        Write-Host "   Процесс: $($process.ProcessName)" -ForegroundColor Yellow
        Write-Host "   Путь: $($process.Path)" -ForegroundColor Yellow
    }
    
    $answer = Read-Host "`nОстановить процесс и запустить сервер? (y/n)"
    
    if ($answer -eq 'y' -or $answer -eq 'Y') {
        Write-Host "`nОстановка процесса $processId..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "✓ Процесс остановлен" -ForegroundColor Green
    } else {
        Write-Host "`nЗапуск отменен. Используйте другой порт: PORT=3001 npm start" -ForegroundColor Yellow
        exit
    }
}

Write-Host "`n🚀 Запуск сервера..." -ForegroundColor Green
Write-Host ""

# Запускаем сервер
npm start

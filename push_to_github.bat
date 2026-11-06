@echo off
setlocal
cd /d "%~dp0"
echo ===================================================================
echo   RunRoute Art - Push ke Repositori Baru: run-route-art
echo ===================================================================
echo Target: https://github.com/wxhxbbxjry/run-route-art.git
echo.

rem Gunakan portable git jika sistem belum memasukkan git ke PATH
if exist "..\mingit\cmd\git.exe" (
    set "PATH=%~dp0..\mingit\cmd;%PATH%"
)

echo Memeriksa branch lokal...
git branch -M main

echo.
echo Melakukan push ke origin main...
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo ===================================================================
    echo  [PENTING] Jika push gagal dengan pesan "Repository not found":
    echo  1. Pastikan Anda sudah membuat repo kosong di:
    echo     https://github.com/new
    echo  2. Beri nama: run-route-art
    echo  3. Klik Create repository
    echo  4. Jalankan script ini kembali!
    echo ===================================================================
) else (
    echo.
    echo ===================================================================
    echo  BERHASIL! Kode proyek sudah terunggah ke:
    echo  https://github.com/wxhxbbxjry/run-route-art
    echo ===================================================================
)

echo.
pause

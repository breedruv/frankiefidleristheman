@echo off
rem Keeps the collector running on the 24/7 PC: restarts it a minute after any exit and appends output to logs\collector.log.
rem Started by the "FFI Collector" scheduled task (docs/collector.md). paths.cmd (written by collector\setup.ps1) pins node/python.
cd /d "%~dp0.."
if exist scripts\paths.cmd call scripts\paths.cmd
if not defined NODE_EXE set "NODE_EXE=node"
if not exist logs mkdir logs
:loop
echo %date% %time% starting collector>> logs\collector.log
"%NODE_EXE%" --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts\collector.mjs %*>> logs\collector.log 2>&1
echo %date% %time% collector exited with %errorlevel%, restarting in 60s>> logs\collector.log
timeout /t 60 /nobreak > nul
goto loop

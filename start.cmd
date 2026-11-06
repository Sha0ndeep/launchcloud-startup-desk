@echo off
pushd "%~dp0"
python run.py %*
set "launchcloud_exit=%ERRORLEVEL%"
popd
if not "%launchcloud_exit%"=="0" pause
exit /b %launchcloud_exit%

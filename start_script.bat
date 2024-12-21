@echo off
cd /d C:\Users\duban\spotify-callback-server
start node app.js
timeout /t 5 /nobreak
start http://localhost:3000/login

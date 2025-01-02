const { exec, spawn } = require('child_process');
const open = require('open');
const axios = require('axios');
const fs = require('fs');

// Ruta al directorio del servidor
const serverDir = '/c/users/duban/spotify-callback-server';

// Comando para iniciar el servidor
const serverCommand = 'node app.js';

// Función para verificar si Spotify está en ejecución
function isSpotifyRunning() {
  return new Promise((resolve) => {
    exec('tasklist', (err, stdout) => {
      if (err) {
        console.error('Error al verificar procesos:', err);
        resolve(false);
      }
      resolve(stdout.toLowerCase().includes('spotify.exe'));
    });
  });
}

// Función para iniciar el servidor de Spotify
function startSpotifyServer() {
  console.log('Iniciando servidor...');
  const serverProcess = spawn('bash', ['-c', `cd ${serverDir} && ${serverCommand}`], {
    stdio: 'inherit',
  });

  serverProcess.on('close', (code) => {
    console.log(`Servidor cerrado con código: ${code}`);
  });
}

// Función para abrir la URL de autenticación
function openAuthUrl() {
  const loginUrl = 'http://localhost:3000/login';
  console.log(`Abriendo URL de autenticación: ${loginUrl}`);
  open(loginUrl);
}

// Función para monitorear Spotify y realizar acciones
async function monitorSpotify() {
  const spotifyRunning = await isSpotifyRunning();
  if (spotifyRunning) {
    console.log('Spotify está en ejecución.');
    
    // Inicia el servidor si no está iniciado
    startSpotifyServer();

    // Abre la URL de autenticación
    openAuthUrl();
  } else {
    console.log('Spotify no está en ejecución. Esperando...');
  }

  setTimeout(monitorSpotify, 10000); // Verificar cada 10 segundos
}

// Iniciar el monitoreo
monitorSpotify();

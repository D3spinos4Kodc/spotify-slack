require('dotenv').config();  // Cargar las variables de entorno

const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const { WebClient } = require('@slack/web-api');  // Usar WebClient

const app = express();

// Configura tus credenciales de Spotify y Slack desde las variables de entorno
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SPOTIFY_REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

let spotifyAccessToken = '';
let slackClient = new WebClient(SLACK_BOT_TOKEN);  // Usar WebClient

// Ruta para iniciar la autenticación con Spotify
app.get('/login', (req, res) => {
  const scope = 'user-read-playback-state';
  const authUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
  })}`;
  
  res.redirect(authUrl);
});

// Ruta de callback para obtener el token de Spotify
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('No se encontró el código de autorización.');
  }

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    spotifyAccessToken = response.data.access_token;
    console.log('Token de acceso obtenido:', spotifyAccessToken);

    // Llamada a la función que actualiza el estado en Slack
    await updateSlackStatus();

    res.send('Autenticación con Spotify exitosa. Ahora se ha actualizado tu estado en Slack.');
  } catch (error) {
    console.error('Error al autenticar con Spotify:', error.response?.data || error.message);
    res.status(500).send('Error al autenticar con Spotify.');
  }
});

// Función para actualizar el estado en Slack
async function updateSlackStatus() {
  if (!spotifyAccessToken) {
    console.log('No hay token de acceso disponible.');
    return;
  }

  try {
    // Obtener la canción actual que se está reproduciendo
    const spotifyResponse = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    });

    if (spotifyResponse.data.item) {
      const track = spotifyResponse.data.item;
      const trackName = track.name;
      const artistName = track.artists.map(artist => artist.name).join(', ');

      // Actualizar el estado en Slack
      await slackClient.users.profile.set({
        profile: {
          status_text: `Escuchando: ${trackName} de ${artistName}`,
          status_emoji: ':headphones:',
        },
      });

      console.log('Estado de Slack actualizado con la canción actual.');
    } else {
      console.log('No hay canción actual reproduciéndose.');
    }
  } catch (error) {
    console.error('Error al obtener la canción actual o al actualizar el estado de Slack:', error.response?.data || error.message);
  }
}

// Función para refrescar el token de acceso de Spotify
async function refreshSpotifyToken() {
  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: SPOTIFY_REFRESH_TOKEN,  // El refresh token obtenido anteriormente
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    spotifyAccessToken = response.data.access_token;
    console.log('Nuevo token de acceso obtenido:', spotifyAccessToken);
  } catch (error) {
    console.error('Error al refrescar el token de acceso:', error.response?.data || error.message);
  }
}

// Refrescar el token cada hora (es recomendable hacerlo antes de que expire el token)
setInterval(refreshSpotifyToken, 3600000); // 3600000 ms = 1 hora

// Consultar Spotify cada 60 segundos para actualizar el estado de Slack
setInterval(updateSlackStatus, 60000);  // 30000 ms = 30 segundos

// Inicia el servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

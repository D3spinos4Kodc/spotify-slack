require('dotenv').config();

const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const { WebClient } = require('@slack/web-api');

const app = express();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
let SPOTIFY_REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN; // Puede actualizarse dinámicamente

let spotifyAccessToken = '';
let slackClient = new WebClient(SLACK_BOT_TOKEN);

async function refreshSpotifyToken() {
  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: SPOTIFY_REFRESH_TOKEN,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    spotifyAccessToken = response.data.access_token;
    console.log('Nuevo token de acceso obtenido:', spotifyAccessToken);
  } catch (error) {
    const errorData = error.response?.data || error.message;
    console.error('Error al refrescar el token de acceso:', errorData);

    if (errorData.error === 'invalid_grant') {
      console.error('El refresh token es inválido o expiró. Regenera uno nuevo desde /login.');
    }
  }
}

async function updateSlackStatus() {
  try {
    if (!spotifyAccessToken) {
      console.log('Token vencido o no disponible. Intentando refrescar...');
      await refreshSpotifyToken();
    }

    const spotifyResponse = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    });

    if (spotifyResponse.data?.item) {
      const track = spotifyResponse.data.item;
      const trackName = track.name;
      const artistName = track.artists.map((artist) => artist.name).join(', ');

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
    if (error.response?.status === 401) {
      console.log('Token de acceso expirado. Intentando refrescar...');
      await refreshSpotifyToken();
    } else {
      console.error('Error al obtener la canción actual o actualizar el estado de Slack:', error.response?.data || error.message);
    }
  }
}

setInterval(refreshSpotifyToken, 3500000); // Refresca el token cada 58 minutos.
setInterval(updateSlackStatus, 60000); // Actualiza el estado cada 60 segundos.

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
    SPOTIFY_REFRESH_TOKEN = response.data.refresh_token; // Actualizar el refresh token dinámicamente
    console.log('Nuevo refresh token obtenido:', SPOTIFY_REFRESH_TOKEN);

    // Actualizar el archivo .env dinámicamente (opcional)
    const fs = require('fs');
    fs.writeFileSync(
      '.env',
      `SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID}\nSPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET}\nREDIRECT_URI=${REDIRECT_URI}\nSLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}\nSPOTIFY_REFRESH_TOKEN=${SPOTIFY_REFRESH_TOKEN}\n`
    );

    await updateSlackStatus();

    res.send('Autenticación con Spotify exitosa. Estado de Slack actualizado.');
  } catch (error) {
    console.error('Error al autenticar con Spotify:', error.response?.data || error.message);
    res.status(500).send('Error al autenticar con Spotify.');
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_PATH = path.join(__dirname, '../tokens.json');

let tokens = loadTokens();

function loadTokens() {
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const data = fs.readFileSync(TOKEN_PATH, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.warn('[SPOTIFY] Error reading tokens.json, re-authentication will be required.');
    }
  }
  return null;
}

function saveTokens(newTokens) {
  tokens = { ...tokens, ...newTokens };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

export function isAuthorized() {
  return !!(tokens && tokens.refresh_token);
}

export function startAuthServer(onSuccessCallback) {
  const app = express();
  const port = config.spotifyPort;

  app.get('/login', (req, res) => {
    const scope = 'user-read-currently-playing user-read-playback-state';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.spotifyClientId,
      scope: scope,
      redirect_uri: config.spotifyRedirectUri,
    });
    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
  });

  app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
      res.send('Authorization failed. No code provided.');
      return;
    }

    try {
      const body = new URLSearchParams({
        code: code.toString(),
        redirect_uri: config.spotifyRedirectUri,
        grant_type: 'authorization_code',
      });

      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64'),
        },
        body: body.toString(),
      });

      const data = await response.json();
      if (data.access_token) {
        saveTokens({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + data.expires_in * 1000,
        });
        res.send('<h1>Spotify Authorization Successful!</h1><p>You can close this window now and return to the terminal.</p>');
        console.log('\x1b[32m[SPOTIFY] Authorization successful! Refresh token saved.\x1b[0m');
        if (onSuccessCallback) onSuccessCallback();
      } else {
        res.send(`Authorization failed: ${data.error_description || data.error}`);
      }
    } catch (err) {
      console.error('[SPOTIFY] Callback error:', err);
      res.status(500).send('Authentication Error');
    }
  });

  app.listen(port, () => {
    console.log(`\n\x1b[33m[SPOTIFY AUTH] Please open your browser to log in:\x1b[0m`);
    console.log(`\x1b[36mhttp://localhost:${port}/login\x1b[0m\n`);
  });
}

export async function refreshAccessToken() {
  if (!tokens || !tokens.refresh_token) {
    throw new Error('No refresh token available.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64'),
    },
    body: body.toString(),
  });

  const data = await response.json();
  if (data.access_token) {
    saveTokens({
      access_token: data.access_token,
      expires_at: Date.now() + data.expires_in * 1000,
    });
    return data.access_token;
  } else {
    throw new Error(`Failed to refresh token: ${data.error_description || data.error}`);
  }
}

async function getValidAccessToken() {
  if (!tokens) throw new Error('Not authorized with Spotify');
  if (Date.now() >= tokens.expires_at - 60000) {
    return await refreshAccessToken();
  }
  return tokens.access_token;
}

export async function getCurrentlyPlaying() {
  try {
    const accessToken = await getValidAccessToken();
    const fetchStart = Date.now();
    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 204 || response.status === 202) {
      return { isPlaying: false, track: null };
    }

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[SPOTIFY] HTTP Error ${response.status}: ${errText || 'Forbidden / Unauthorized'}`);
      return { isPlaying: false, track: null, error403: response.status === 403 };
    }

    const data = await response.json();
    if (!data || !data.item) {
      return { isPlaying: false, track: null };
    }

    const fetchEnd = Date.now();
    const networkLatency = Math.round((fetchEnd - fetchStart) / 2);

    const isPlaying = data.is_playing;
    const progressMs = data.progress_ms + networkLatency;

    const item = data.item;
    const title = item.name;
    const artist = item.artists ? item.artists.map((a) => a.name).join(', ') : 'Unknown Artist';
    const album = item.album ? item.album.name : '';
    const durationMs = item.duration_ms;
    const trackId = item.id;

    return {
      isPlaying,
      fetchTimestamp: fetchEnd,
      progressMs,
      track: {
        id: trackId,
        title,
        artist,
        album,
        durationMs,
      },
    };
  } catch (err) {
    console.error('[SPOTIFY] Fetch currently playing error:', err.message);
    return { isPlaying: false, track: null };
  }
}

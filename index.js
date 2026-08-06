import { config, validateConfig } from './src/config.js';
import { isAuthorized, startAuthServer, getCurrentlyPlaying } from './src/spotify.js';
import { fetchLyrics, getActiveLyricLine } from './src/lyrics.js';
import { DiscordGatewayClient, fetchDiscordSpotifyPresence } from './src/discord.js';
import { StatusBalancer } from './src/balancer.js';

console.log(`
\x1b[36m=====================================================
  🎵 DISCORD SPOTIFY LYRIC STATUS ENGINE 🎵
=====================================================\x1b[0m
`);

if (!config.discordToken) {
  console.error(`\x1b[31m[CONFIG ERROR] DISCORD_TOKEN is missing in .env!\x1b[0m`);
  process.exit(1);
}

let useDiscordPresence = false;

const discordClient = new DiscordGatewayClient(config.discordToken);
const balancer = new StatusBalancer(discordClient);

let currentTrackId = null;
let currentLyrics = null;
let lastProgressMs = 0;
let lastFetchTime = 0;
let isCurrentlyPlaying = false;

async function startEngine() {
  discordClient.connect();

  const hasSpotifyDevApi = config.spotifyClientId && config.spotifyClientSecret && isAuthorized();

  if (hasSpotifyDevApi) {
    console.log('[ENGINE] Spotify Developer API credentials found. Testing connection...');
    const testPlayback = await getCurrentlyPlaying();
    if (testPlayback.error403) {
      console.log('\x1b[33m[ENGINE] Spotify Web API returned 403 (Free Account / Premium required).\x1b[0m');
      console.log('\x1b[32m[ENGINE] Switched to Discord Gateway Spotify Mode (Free Spotify Compatible)!\x1b[0m');
      useDiscordPresence = true;
    }
  } else {
    console.log('\x1b[32m[ENGINE] Using Discord Gateway Spotify Mode (Free Spotify Compatible).\x1b[0m');
    useDiscordPresence = true;
  }

  console.log('[ENGINE] Starting playback & lyrics sync loop...');

  setInterval(async () => {
    try {
      await updateSyncState();
    } catch (err) {
      console.error('[ENGINE] Sync error:', err.message);
    }
  }, config.pollIntervalMs);
}

async function updateSyncState() {
  let playback = null;

  if (useDiscordPresence || !isAuthorized()) {
    playback = await fetchDiscordSpotifyPresence(config.discordToken);
    if (!playback) {
      playback = discordClient.currentSpotifyPresence || { isPlaying: false, track: null };
    }
  } else {
    playback = await getCurrentlyPlaying();
    if (playback.error403) {
      useDiscordPresence = true;
      playback = await fetchDiscordSpotifyPresence(config.discordToken);
    }
  }

  if (!playback || !playback.isPlaying || !playback.track || playback.isInvisible) {
    if (playback && playback.isInvisible) {
      console.log('\x1b[33m[SYNC LOOP]\x1b[0m User is INVISIBLE/OFFLINE. Skipping status update.');
    }
    if (isCurrentlyPlaying) {
      isCurrentlyPlaying = false;
      if (!playback || !playback.isInvisible) {
        const fallbackText = balancer.formatFallbackStatus(playback ? playback.track : null, true);
        balancer.processStatusUpdate(fallbackText);
      }
    }
    return;
  }

  isCurrentlyPlaying = true;
  lastFetchTime = playback.fetchTimestamp || Date.now();
  lastProgressMs = playback.progressMs || 0;

  const track = playback.track;

  if (currentTrackId !== track.id) {
    currentTrackId = track.id;
    console.log(`\n\x1b[33m[SPOTIFY NOW PLAYING]\x1b[0m ${track.title} - ${track.artist}`);
    currentLyrics = await fetchLyrics(track);

    if (currentLyrics && currentLyrics.length > 0) {
      console.log(`\x1b[32m[LRCLIB]\x1b[0m Found ${currentLyrics.length} synced lyric lines.`);
    } else {
      console.log(`\x1b[33m[LRCLIB]\x1b[0m No synced lyrics found for this track.`);
    }
  }

  const timeElapsed = Date.now() - lastFetchTime;
  const estimatedProgressMs = lastProgressMs + timeElapsed;

  if (!currentLyrics || currentLyrics.length === 0) {
    const fallbackText = balancer.formatFallbackStatus(track, false);
    balancer.processStatusUpdate(fallbackText);
    return;
  }

  const activeLine = getActiveLyricLine(currentLyrics, estimatedProgressMs, config.lyricOffsetMs);

  if (activeLine && activeLine.text) {
    const formatted = balancer.formatLyricStatus(activeLine.text);
    balancer.processStatusUpdate(formatted);
  } else {
    const text = balancer.formatLyricStatus(`🎵 ${track.title}`);
    balancer.processStatusUpdate(text);
  }
}

if (config.spotifyClientId && config.spotifyClientSecret && !isAuthorized()) {
  console.log('\x1b[33m[SPOTIFY] Spotify credentials present, starting OAuth login...\x1b[0m');
  startAuthServer(() => {
    startEngine();
  });
} else {
  startEngine();
}

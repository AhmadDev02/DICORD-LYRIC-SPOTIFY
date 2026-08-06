const lyricsCache = new Map();

const USER_AGENT = 'DiscordSpotifyLyricStatus/1.0 (https://github.com/ahmad02/BOT-DC-LYRIC-SPOTIFY)';

export async function fetchLyrics(track) {
  if (!track || !track.title) return null;

  const cacheKey = track.id || `${track.title}-${track.artist}`;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey);
  }

  try {
    const params = new URLSearchParams({
      track_name: track.title,
      artist_name: track.artist,
    });
    if (track.album) params.append('album_name', track.album);
    if (track.durationMs) params.append('duration', Math.round(track.durationMs / 1000).toString());

    const url = `https://lrclib.net/api/get?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    if (res.status === 404) {
      lyricsCache.set(cacheKey, null);
      return null;
    }

    if (!res.ok) {
      console.warn(`[LRCLIB] Returned HTTP status ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (!data || !data.syncedLyrics) {
      lyricsCache.set(cacheKey, null);
      return null;
    }

    const parsedLines = parseLRC(data.syncedLyrics);
    lyricsCache.set(cacheKey, parsedLines);
    return parsedLines;
  } catch (err) {
    console.error('[LRCLIB] Fetch error:', err.message);
    return null;
  }
}

export function parseLRC(lrcText) {
  if (!lrcText) return [];

  const lines = lrcText.split('\n');
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    timeRegex.lastIndex = 0;
    let match;
    const timestamps = [];

    while ((match = timeRegex.exec(trimmed)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      let ms = 0;
      if (match[3]) {
        ms = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
      }
      timestamps.push(minutes * 60 * 1000 + seconds * 1000 + ms);
    }

    const lyricText = trimmed.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();

    for (const timeMs of timestamps) {
      result.push({ ms: timeMs, text: lyricText });
    }
  }

  result.sort((a, b) => a.ms - b.ms);
  return result;
}

export function getActiveLyricLine(parsedLines, currentMs, offsetMs = 0) {
  if (!parsedLines || parsedLines.length === 0) return null;

  const adjustedMs = currentMs + offsetMs;
  let activeLine = null;

  for (let i = 0; i < parsedLines.length; i++) {
    if (parsedLines[i].ms <= adjustedMs) {
      activeLine = parsedLines[i];
    } else {
      break;
    }
  }

  return activeLine;
}

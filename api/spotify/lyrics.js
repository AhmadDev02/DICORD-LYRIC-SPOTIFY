import dotenv from 'dotenv';
dotenv.config();

function cleanTrackTitle(title) {
  if (!title) return '';
  return title
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .replace(/-.*$/, '')
    .trim();
}

function parseLRC(lrcText) {
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

export default async function handler(req, res) {
  const trackId = req.query.trackId || '';
  const title = req.query.title || '';
  const artist = req.query.artist || '';
  const spotifyToken = req.query.spotifyToken || req.headers.authorization || '';

  if (!title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  // 1. Try Spotify Official Color-Lyrics API via Serverless Node.js
  if (trackId && spotifyToken) {
    try {
      const cleanToken = spotifyToken.replace('Bearer ', '');
      const spotifyUrl = `https://spclient.wg.spotify.com/color-lyrics/v2/user/me/track/${trackId}?format=json&vocalRemoval=false`;
      const spotifyRes = await fetch(spotifyUrl, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'App-Platform': 'WebPlayer',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (spotifyRes.ok) {
        const data = await spotifyRes.json();
        if (data && data.lyrics && data.lyrics.lines) {
          const lines = [];
          for (const line of data.lyrics.lines) {
            if (line.words) {
              lines.push({
                ms: parseInt(line.startTimeMs || '0', 10),
                text: line.words.trim(),
              });
            }
          }
          if (lines.length > 0) {
            res.status(200).json({ source: 'spotify_official', lines });
            return;
          }
        }
      }
    } catch (e) {
      // Ignore Spotify internal API error and try LRCLIB
    }
  }

  // 2. Try LRCLIB Exact Match
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    let lrcRes = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    if (lrcRes.ok) {
      const lrcData = await lrcRes.json();
      if (lrcData && lrcData.syncedLyrics) {
        res.status(200).json({ source: 'lrclib', lines: parseLRC(lrcData.syncedLyrics) });
        return;
      }
    }

    // 3. Try Cleaned Title Match
    const cleanedTitle = cleanTrackTitle(title);
    if (cleanedTitle && cleanedTitle !== title) {
      const cleanParams = new URLSearchParams({ track_name: cleanedTitle, artist_name: artist });
      lrcRes = await fetch(`https://lrclib.net/api/get?${cleanParams.toString()}`);
      if (lrcRes.ok) {
        const lrcData = await lrcRes.json();
        if (lrcData && lrcData.syncedLyrics) {
          res.status(200).json({ source: 'lrclib', lines: parseLRC(lrcData.syncedLyrics) });
          return;
        }
      }
    }

    // 4. Try Fuzzy Search
    const searchQuery = `${cleanedTitle || title} ${artist}`.trim();
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (Array.isArray(searchData) && searchData.length > 0) {
        const matched = searchData.find((item) => item.syncedLyrics && item.syncedLyrics.trim().length > 0);
        if (matched) {
          res.status(200).json({ source: 'lrclib', lines: parseLRC(matched.syncedLyrics) });
          return;
        }
      }
    }
  } catch (e) {}

  res.status(200).json({ source: 'none', lines: null });
}

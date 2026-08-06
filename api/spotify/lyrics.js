import dotenv from 'dotenv';
dotenv.config();

function cleanTrackTitle(title) {
  if (!title) return '';
  return title
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .replace(/[-–—].*$/, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
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
    if (lyricText) {
      for (const timeMs of timestamps) {
        result.push({ ms: timeMs, text: lyricText });
      }
    }
  }
  result.sort((a, b) => a.ms - b.ms);
  return result;
}

function convertPlainLyricsToTimed(plainText, durationMs = 180000) {
  if (!plainText) return [];
  const lines = plainText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('[') && !l.endsWith(']'));

  if (lines.length === 0) return [];
  const timePerLine = Math.max(2500, Math.floor((durationMs - 5000) / lines.length));
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    result.push({
      ms: i * timePerLine,
      text: lines[i],
    });
  }

  return result;
}

export default async function handler(req, res) {
  let trackId = req.query.trackId || '';
  const title = req.query.title || '';
  const artist = req.query.artist || '';
  const spotifyToken = req.query.spotifyToken || req.headers.authorization || '';
  const durationMs = parseInt(req.query.durationMs || '180000', 10);

  if (!title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  const cleanedTitle = cleanTrackTitle(title);
  const cleanedArtist = cleanTrackTitle(artist);
  const searchQuery = `${cleanedTitle || title} ${cleanedArtist || artist}`.trim();
  let cleanToken = spotifyToken ? spotifyToken.replace('Bearer ', '').trim() : '';

  // 1. Try Spotify Official Color-Lyrics API
  if (cleanToken) {
    try {
      if (!trackId || trackId.includes('-') || trackId.length !== 22) {
        const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=1`;
        const searchRes = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${cleanToken}` },
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData?.tracks?.items?.length > 0) {
            trackId = searchData.tracks.items[0].id;
          }
        }
      }

      if (trackId && !trackId.includes('-')) {
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
      }
    } catch (e) {}
  }

  // 2. Try NetEase Cloud Music API
  try {
    const neteaseSearchUrl = `https://music.163.com/api/search/pc`;
    const neteaseRes = await fetch(neteaseSearchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://music.163.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: new URLSearchParams({
        s: searchQuery,
        type: '1',
        offset: '0',
        limit: '5',
      }).toString(),
    });

    if (neteaseRes.ok) {
      const searchData = await neteaseRes.json();
      const songs = searchData.result?.songs;
      if (Array.isArray(songs) && songs.length > 0) {
        for (const song of songs) {
          const songId = song.id;
          const lyricRes = await fetch(`https://music.163.com/api/song/lyric?os=pc&id=${songId}&lv=-1&kv=-1&tv=-1`, {
            headers: {
              Referer: 'https://music.163.com',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          });
          if (lyricRes.ok) {
            const lyricData = await lyricRes.json();
            if (lyricData.lrc && lyricData.lrc.lyric) {
              const parsed = parseLRC(lyricData.lrc.lyric);
              if (parsed.length > 0) {
                res.status(200).json({ source: 'netease', lines: parsed });
                return;
              }
            }
          }
        }
      }
    }
  } catch (e) {}

  // 3. Try LRCLIB Exact & Fuzzy Search with PlainLyrics Fallback
  try {
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (Array.isArray(searchData) && searchData.length > 0) {
        // Priority 1: Synced Lyrics
        const syncedMatched = searchData.find((item) => item.syncedLyrics && item.syncedLyrics.trim().length > 0);
        if (syncedMatched) {
          res.status(200).json({ source: 'lrclib_synced', lines: parseLRC(syncedMatched.syncedLyrics) });
          return;
        }

        // Priority 2: Plain Lyrics converted to Auto-Timed Lines
        const plainMatched = searchData.find((item) => item.plainLyrics && item.plainLyrics.trim().length > 0);
        if (plainMatched) {
          const trackDuration = (plainMatched.duration ? plainMatched.duration * 1000 : 0) || durationMs;
          const timedLines = convertPlainLyricsToTimed(plainMatched.plainLyrics, trackDuration);
          if (timedLines.length > 0) {
            res.status(200).json({ source: 'lrclib_plain_auto_timed', lines: timedLines });
            return;
          }
        }
      }
    }
  } catch (e) {}

  res.status(200).json({ source: 'none', lines: null });
}

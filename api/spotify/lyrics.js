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

export default async function handler(req, res) {
  let trackId = req.query.trackId || '';
  const title = req.query.title || '';
  const artist = req.query.artist || '';
  const spotifyToken = req.query.spotifyToken || req.headers.authorization || '';

  if (!title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  const cleanedTitle = cleanTrackTitle(title);
  const cleanedArtist = cleanTrackTitle(artist);
  const searchQuery = `${cleanedTitle || title} ${cleanedArtist || artist}`.trim();
  let cleanToken = spotifyToken ? spotifyToken.replace('Bearer ', '').trim() : '';

  // 1. Try Spotify Official Color-Lyrics API (If user token or app token provided)
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

  // 2. Try NetEase Cloud Music API with Punctuation-Free Query
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

  // 3. Try LRCLIB Exact Match
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

    // 4. Try Cleaned Title Match
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

    // 5. Try LRCLIB Fuzzy Search with Clean Query
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

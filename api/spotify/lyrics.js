import dotenv from 'dotenv';
dotenv.config();

const USER_AGENT = 'DiscordSpotifyLyricStatus/1.0 (https://github.com/AhmadDev02/DICORD-LYRIC-SPOTIFY)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
    .filter((l) => l.length > 0 && !l.startsWith('[') && !l.endsWith(']') && !l.endsWith('Lyrics') && !l.includes('Contributors'));

  if (lines.length === 0) return [];
  const introDelay = Math.min(15000, Math.floor(durationMs * 0.08));
  const availableTime = Math.max(10000, durationMs - introDelay - 5000);
  const timePerLine = Math.max(2500, Math.floor(availableTime / lines.length));
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    result.push({
      ms: introDelay + i * timePerLine,
      text: lines[i],
    });
  }

  return result;
}

async function queryGenius(q, durationMs = 180000) {
  try {
    const searchRes = await fetch(`https://genius.com/api/search/song?q=${encodeURIComponent(q)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': BROWSER_UA,
      },
    });
    if (searchRes.ok) {
      const data = await searchRes.json();
      const hits = data.response?.sections?.[0]?.hits;
      if (Array.isArray(hits) && hits.length > 0) {
        const songUrl = hits[0].result.url;
        const pageRes = await fetch(songUrl, {
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': BROWSER_UA,
          },
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          const match = html.match(/<div data-lyrics-container=\"true\"[^>]*>(.*?)<\/div>/gs);
          if (match) {
            const rawText = match
              .join('\n')
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .replace(/&#x27;/g, "'")
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"');

            const timedLines = convertPlainLyricsToTimed(rawText, durationMs);
            if (timedLines.length > 0) return timedLines;
          }
        }
      }
    }
  } catch (e) {}
  return null;
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
  const fullSearchQuery = `${cleanedTitle || title} ${cleanedArtist || artist}`.trim();
  const titleWords = (cleanedTitle || title).split(' ').filter(Boolean);
  const shortTitle = titleWords.length > 2 ? titleWords.slice(0, 2).join(' ') : (cleanedTitle || title);
  const shortSearchQuery = `${shortTitle} ${cleanedArtist || artist}`.trim();

  let userSpotifyToken = spotifyToken ? spotifyToken.replace('Bearer ', '').trim() : '';

  let cleanToken = userSpotifyToken;
  if (!cleanToken && process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
    try {
      const credRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      });
      if (credRes.ok) {
        const credData = await credRes.json();
        if (credData.access_token) {
          cleanToken = credData.access_token;
        }
      }
    } catch (e) {}
  }

  if (cleanToken) {
    try {
      if (!trackId || trackId.includes('-') || trackId.length !== 22) {
        const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(fullSearchQuery)}&type=track&limit=1`;
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
            'User-Agent': USER_AGENT,
          },
        });

        if (spotifyRes.ok) {
          const data = await spotifyRes.json();
          if (data && data.lyrics && data.lyrics.lines) {
            const isSynced = data.lyrics.syncType === 'LINE_SYNCED';
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
              const hasTimestamps = lines.some((l) => l.ms > 0);
              if (!isSynced || !hasTimestamps) {
                const plainText = lines.map((l) => l.text).join('\n');
                const timedLines = convertPlainLyricsToTimed(plainText, durationMs);
                res.status(200).json({ source: 'spotify_official_auto_timed', lines: timedLines });
                return;
              }
              res.status(200).json({ source: 'spotify_official', lines });
              return;
            }
          }
        }
      }
    } catch (e) {}
  }

  const geniusLines = (await queryGenius(fullSearchQuery, durationMs)) || (await queryGenius(shortSearchQuery, durationMs));
  if (geniusLines) {
    res.status(200).json({ source: 'genius', lines: geniusLines });
    return;
  }

  async function queryNetEase(q) {
    try {
      const neteaseRes = await fetch(`https://music.163.com/api/search/pc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://music.163.com',
          'User-Agent': BROWSER_UA,
        },
        body: new URLSearchParams({ s: q, type: '1', offset: '0', limit: '5' }).toString(),
      });
      if (neteaseRes.ok) {
        const searchData = await neteaseRes.json();
        const songs = searchData.result?.songs;
        if (Array.isArray(songs) && songs.length > 0) {
          for (const song of songs) {
            const lyricRes = await fetch(`https://music.163.com/api/song/lyric?os=pc&id=${song.id}&lv=-1&kv=-1&tv=-1`, {
              headers: { Referer: 'https://music.163.com', 'User-Agent': BROWSER_UA },
            });
            if (lyricRes.ok) {
              const lyricData = await lyricRes.json();
              if (lyricData.lrc && lyricData.lrc.lyric) {
                const parsed = parseLRC(lyricData.lrc.lyric);
                if (parsed.length > 0) return parsed;
              }
            }
          }
        }
      }
    } catch (e) {}
    return null;
  }

  const neteaseLines = (await queryNetEase(fullSearchQuery)) || (await queryNetEase(shortSearchQuery));
  if (neteaseLines) {
    res.status(200).json({ source: 'netease', lines: neteaseLines });
    return;
  }

  async function queryLRCLIB(q) {
    try {
      const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': USER_AGENT },
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (Array.isArray(searchData) && searchData.length > 0) {
          const syncedMatched = searchData.find((item) => item.syncedLyrics && item.syncedLyrics.trim().length > 0);
          if (syncedMatched) {
            return { source: 'lrclib_synced', lines: parseLRC(syncedMatched.syncedLyrics) };
          }
          const plainMatched = searchData.find((item) => item.plainLyrics && item.plainLyrics.trim().length > 0);
          if (plainMatched) {
            const trackDuration = (plainMatched.duration ? plainMatched.duration * 1000 : 0) || durationMs;
            const timedLines = convertPlainLyricsToTimed(plainMatched.plainLyrics, trackDuration);
            if (timedLines.length > 0) {
              return { source: 'lrclib_plain_auto_timed', lines: timedLines };
            }
          }
        }
      }
    } catch (e) {}
    return null;
  }

  const lrclibRes = (await queryLRCLIB(fullSearchQuery)) || (await queryLRCLIB(shortSearchQuery));
  if (lrclibRes) {
    res.status(200).json(lrclibRes);
    return;
  }

  res.status(200).json({ source: 'none', lines: null });
}

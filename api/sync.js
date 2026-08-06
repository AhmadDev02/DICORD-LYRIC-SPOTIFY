import dotenv from 'dotenv';
dotenv.config();
import { fetchLyrics, getActiveLyricLine } from '../src/lyrics.js';

export default async function handler(req, res) {
  const token = req.query.token || req.headers.authorization;
  const offsetMs = parseInt(req.query.offset || '0', 10);

  if (!token) {
    res.status(400).json({ error: 'Discord token is required' });
    return;
  }

  try {
    const headers = {
      Authorization: token,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // 1. Get Self User Info
    const meRes = await fetch('https://discord.com/api/v9/users/@me', { headers });
    if (!meRes.ok) {
      res.status(meRes.status).json({ error: 'Invalid Discord Token' });
      return;
    }
    const meData = await meRes.json();
    const userId = meData.id;

    // 2. Fetch User Profile & Activities
    const profileRes = await fetch(`https://discord.com/api/v9/users/${userId}/profile`, { headers });
    let activities = [];
    let userStatus = 'online';

    if (profileRes.ok) {
      const data = await profileRes.json();
      activities = data.activities || data.user_profile?.activities || [];
      userStatus = data.user_profile?.status || data.status || 'online';
    }

    // 3. STATUS RULE: Allow online, idle, dnd. Disable if INVISIBLE/OFFLINE.
    if (userStatus === 'invisible' || userStatus === 'offline') {
      res.status(200).json({
        isPlaying: false,
        isInvisible: true,
        userStatus: userStatus,
        message: 'Status is Invisible. Sync disabled.',
      });
      return;
    }

    // 4. Find Spotify Activity
    const spotifyAct = activities.find(
      (a) => a.name === 'Spotify' || a.type === 2 || (a.party && a.party.id && a.party.id.startsWith('spotify:'))
    );

    if (!spotifyAct || !spotifyAct.details) {
      res.status(200).json({
        isPlaying: false,
        userStatus: userStatus,
        track: null,
      });
      return;
    }

    const startTime = spotifyAct.timestamps ? spotifyAct.timestamps.start : Date.now();
    const endTime = spotifyAct.timestamps ? spotifyAct.timestamps.end : null;
    const durationMs = endTime && startTime ? endTime - startTime : 0;
    const progressMs = Math.max(0, Date.now() - startTime);

    const track = {
      id: spotifyAct.sync_id || `${spotifyAct.details}-${spotifyAct.state}`,
      title: spotifyAct.details,
      artist: spotifyAct.state || 'Unknown Artist',
      album: spotifyAct.assets ? spotifyAct.assets.large_text : '',
      durationMs: durationMs,
    };

    // 5. Fetch Synced Lyrics from LRCLIB
    const lyrics = await fetchLyrics(track);
    let activeLine = null;
    if (lyrics && lyrics.length > 0) {
      activeLine = getActiveLyricLine(lyrics, progressMs, offsetMs);
    }

    const lyricText = activeLine ? activeLine.text : `🎵 ${track.title}`;
    const formattedStatus = `🎵 | ${lyricText}`.substring(0, 128);

    // 6. Update Discord Status via REST API (Only if online, idle, dnd)
    await fetch('https://discord.com/api/v9/users/@me/settings', {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        custom_status: { text: formattedStatus },
      }),
    });

    res.status(200).json({
      isPlaying: true,
      userStatus: userStatus,
      track: track,
      currentLyricLine: formattedStatus,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

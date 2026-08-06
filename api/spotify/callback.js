import dotenv from 'dotenv';
dotenv.config();

export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) {
    res.status(400).send('Authorization code missing.');
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID || '';
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
  const host = req.headers.host || 'localhost:8888';
  const protocol = req.headers['x-forwarded-proto'] || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${protocol}://${host}/api/spotify/callback`;

  try {
    const body = new URLSearchParams({
      code: code.toString(),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: body.toString(),
    });

    const data = await response.json();
    if (data.access_token) {
      const userRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const userData = await userRes.json();

      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Spotify Connected</title>
          <style>
            body { font-family: sans-serif; background: #0a0c14; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; }
            .card { background: rgba(255,255,255,0.05); padding: 2rem; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); }
            h1 { color: #1ed760; }
            a { color: #5865f2; text-decoration: none; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Spotify Account Connected!</h1>
            <p>Welcome, <strong>${userData.display_name || userData.email || 'Spotify User'}</strong>!</p>
            <p><a href="/">Click here to return to Dashboard</a></p>
          </div>
        </body>
        </html>
      `);
    } else {
      res.status(400).send(`OAuth Error: ${data.error_description || data.error}`);
    }
  } catch (err) {
    res.status(500).send(`Server Error: ${err.message}`);
  }
}

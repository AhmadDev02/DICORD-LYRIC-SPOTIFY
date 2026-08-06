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
      let displayName = 'Spotify User';
      try {
        const userRes = await fetch('https://api.spotify.com/v1/me', {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          displayName = userData.display_name || userData.email || displayName;
        }
      } catch (e) {
        // Ignore free account profile error
      }

      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Spotify Connected</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a0c14; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(16px); padding: 2.5rem; border-radius: 24px; border: 1px solid rgba(255,255,255,0.1); max-width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
            .icon { font-size: 3.5rem; margin-bottom: 1rem; }
            h1 { color: #1ed760; font-size: 1.6rem; margin-bottom: 0.5rem; }
            p { color: #9ca3af; font-size: 0.95rem; margin-bottom: 1.8rem; }
            .btn { background: #1ed760; color: #000; padding: 0.75rem 1.5rem; border-radius: 12px; text-decoration: none; font-weight: bold; display: inline-block; transition: transform 0.15s; cursor: pointer; }
            .btn:hover { transform: translateY(-2px); }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">🎉</div>
            <h1>Spotify Connected!</h1>
            <p>Welcome, <strong>${displayName}</strong>! Your Spotify account has been authorized.</p>
            <button onclick="finishAuth()" class="btn">Return to Dashboard</button>
          </div>
          <script>
            localStorage.setItem('spotify_access_token', '${data.access_token}');
            ${data.refresh_token ? `localStorage.setItem('spotify_refresh_token', '${data.refresh_token}');` : ''}
            function finishAuth() {
              window.location.href = '/?spotify_connected=1';
            }
            setTimeout(finishAuth, 1500);
          </script>
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

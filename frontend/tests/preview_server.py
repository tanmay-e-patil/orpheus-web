"""UI-only preview with synthetic data. Binds to loopback unless explicitly configured.

Build frontend first, then run: python3 frontend/tests/preview_server.py
No database, credentials, external API keys, or production services are used.
"""
import argparse
import io
import json
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, unquote
from html import escape
import wave

parser = argparse.ArgumentParser()
parser.add_argument('--bind', default='127.0.0.1')
parser.add_argument('--port', type=int, default=8082)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2] / 'web'
names = [('After the rain', 'Sora', 'Slow mornings', '#586f67'), ('A place to begin', 'The Northbound', 'Somewhere familiar', '#826646'), ('Blue hour', 'Mira Sol', 'Between the hours', '#465f87'), ('Nothing in a hurry', 'Juniper', 'A softer kind of day', '#846577'), ('The long way home', 'August Fields', 'Open roads', '#a48350'), ('Stay a little longer', 'Sora', 'Slow mornings', '#586f67'), ('Where the light goes', 'Mira Sol', 'Between the hours', '#465f87'), ('Paper planes', 'The Northbound', 'Somewhere familiar', '#826646')]
songs = [dict(trackId=str(i), name=name, artistName=artist, albumName=album, albumArt=f'/assets/preview-{i}.svg', duration=f'PT{3+i%3}M{12+i}S', releaseDate='2024-01-01', isAvailable=i != 4, youtubeVideoId=f'preview-{i}', lyrics='A little light comes through\nAnd every road leads home', syncedLyrics='[00:00.00]A little light comes through\n[00:10.00]And every road leads home', playCount=32-i*3) for i,(name,artist,album,color) in enumerate(names)]
videos = [dict(id=f'preview-{i}', title=f'{song["artistName"]} — {song["name"]} (Official audio)', thumbnail=song['albumArt'], channelTitle=song['artistName'], duration=song['duration'], confidence=92-i*3) for i,song in enumerate(songs[:3])]
tracks = [dict(id=song['trackId'], name=song['name'], artist=song['artistName'], album=song['albumName'], albumImageUrl=song['albumArt'], releaseDate='2024-01-01', durationMs=192000, matchScore=97-i*4) for i,song in enumerate(songs[:3])]
options = [dict(id='lyrics-1', trackName='After the rain', artistName='Sora', albumName='Slow mornings', hasSync=True, confidence=98, plainLyrics=songs[0]['lyrics'], syncedLyrics=songs[0]['syncedLyrics'])]
audio = io.BytesIO()
with wave.open(audio, 'wb') as output:
    output.setnchannels(1); output.setsampwidth(2); output.setframerate(8000); output.writeframes(b'\x00\x00' * 8000 * 120)

class Preview(SimpleHTTPRequestHandler):
    authenticated = True
    def __init__(self, *a, **kw): super().__init__(*a, directory=str(root), **kw)
    def log_message(self, *_): pass
    def respond(self, payload, content_type='application/json'):
        body = json.dumps(payload).encode() if content_type == 'application/json' else payload
        self.send_response(200); self.send_header('Content-Type', content_type); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def song(self):
        identifier = unquote(urlparse(self.path).path.split('/')[3])
        return next((song for song in songs if song['trackId'] == identifier), songs[0])
    def detail(self):
        song = self.song(); return dict(song=song, audioSource=videos[0])
    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith('/assets/preview-') and path.endswith('.svg'):
            i = int(path.split('preview-')[1].split('.')[0]); name,artist,album,color = names[i]
            svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="{color}"/><circle cx="300" cy="110" r="130" fill="#ffffff" opacity=".12"/><circle cx="130" cy="300" r="160" fill="#101014" opacity=".22"/><path d="M0 250 Q120 100 400 260" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1"/><text x="35" y="58" font-family="sans-serif" font-size="13" letter-spacing="3" fill="#fff" opacity=".75">{escape(artist.upper())}</text><text x="35" y="345" font-family="serif" font-size="30" fill="#fff">{escape(album)}</text></svg>'
            return self.respond(svg.encode(), 'image/svg+xml')
        if path == '/api/auth/session': return self.respond(dict(authenticated=Preview.authenticated, user=dict(id='preview-user', username='Music lover', email='listener@example.com')))
        if path == '/api/songs': return self.respond(dict(songs=songs, hasMore=False, nextCursor=None))
        if path.endswith('/audio'):
            data = audio.getvalue()
            start, end = 0, len(data) - 1
            requested = self.headers.get('Range')
            if requested:
                value = requested.removeprefix('bytes=').split(',')[0]
                first, last = value.split('-', 1)
                start = int(first or 0)
                end = min(int(last) if last else end, end)
            body = data[start:end + 1]
            self.send_response(206 if requested else 200)
            self.send_header('Content-Type', 'audio/wav')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(len(body)))
            if requested: self.send_header('Content-Range', f'bytes {start}-{end}/{len(data)}')
            self.end_headers()
            self.wfile.write(body)
            return
        if path.startswith('/api/songs/'): return self.respond(self.detail())
        if path.startswith('/api/auth/passkeys'): return self.respond(dict(passkeys=[]))
        if path.startswith('/api/'): return self.respond({})
        if not path.startswith('/assets/') and path != '/manifest.webmanifest': self.path = '/index.html'
        return super().do_GET()
    def body(self): return json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or '{}')
    def do_PATCH(self):
        data=self.body(); song=self.song(); song.update({key:value for key,value in data.items() if key != 'releaseDate' or value}); return self.respond(self.detail())
    def do_POST(self):
        data = self.body(); path = urlparse(self.path).path
        if path == '/api/auth/login': Preview.authenticated=True; return self.respond({})
        if path == '/api/auth/logout': Preview.authenticated=False; return self.respond({})
        if path == '/api/discover/youtube': return self.respond(videos)
        if path.startswith('/api/discover/deezer/'):
            result=dict(youtubeVideo=videos[0], trackMatches=tracks, confidence='high')
            return self.respond([result] if path.endswith('/matches') else result)
        if path.startswith('/api/discover/lyrics/'):
            return self.respond(dict(trackId=data.get('track', {}).get('id', '0'), options=options, query=dict(track='After the rain', artist='Sora', album='Slow mornings'), status='found'))
        if path == '/api/discover/commit': return self.respond(dict(results=[dict(trackId=item['song']['id'], success=True) for item in data['items']]))
        if path == '/api/lyrics/lrclib': return self.respond(dict(plainLyrics=songs[0]['lyrics'], syncedLyrics=songs[0]['syncedLyrics']))
        if path == '/api/lyrics/save':
            song=next((s for s in songs if s['trackId']==data.get('trackId')), songs[0]); song.update(lyrics=data.get('plainLyrics',''), syncedLyrics=data.get('syncedLyrics','')); return self.respond({})
        if path.endswith('/plays'):
            song=self.song(); song['playCount']+=1; return self.respond(dict(trackId=song['trackId'], playCount=song['playCount']))
        if path.startswith('/api/songs/'): return self.respond(self.detail())
        return self.respond({})

print(f'Synthetic UI preview: http://{args.bind}:{args.port}', flush=True)
ThreadingHTTPServer((args.bind, args.port), Preview).serve_forever()

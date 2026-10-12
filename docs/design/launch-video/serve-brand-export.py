from http.server import HTTPServer,BaseHTTPRequestHandler
from pathlib import Path
HERE=Path(__file__).resolve().parent
NAMES={'pack-crypto','pack-sports','pack-chaos','card-0','card-1','card-2','hero','fan','wordmark','cta'}
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path!='/':self.send_error(404);return
  content=(HERE/'brand-export.html').read_bytes();self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(content)
 def do_POST(self):
  name=self.path.removeprefix('/export/');size=int(self.headers.get('Content-Length','0'))
  if name not in NAMES or not 0<size<10000000:self.send_error(400);return
  content=self.rfile.read(size)
  if not content.startswith(b'\x89PNG\r\n\x1a\n'):self.send_error(400);return
  (HERE/'brand-assets'/f'{name}.png').write_bytes(content)
  self.send_response(200);self.end_headers();self.wfile.write(b'OK')
HTTPServer(('127.0.0.1',8769),Handler).serve_forever()

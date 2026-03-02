import http.server
import socketserver
import threading

PORT = 8000
Handler = http.server.SimpleHTTPRequestHandler

class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    pass

httpd = ThreadedHTTPServer(("", PORT), Handler)
print(f"Serving at port {PORT}")
threading.Thread(target=httpd.serve_forever, daemon=True).start()

import time
time.sleep(1)

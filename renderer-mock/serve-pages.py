#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 8789

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

if __name__ == "__main__":
    os.chdir('/Users/jeff/Projects/little-hero-books/renderer-mock')
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"🎨 Page Development Server running on http://localhost:{PORT}")
        print(f"📄 Page Index: http://localhost:{PORT}/pages/")
        print(f"📄 Page 02 Test: http://localhost:{PORT}/pages/page02-test.html")
        httpd.serve_forever()

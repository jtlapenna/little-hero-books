#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 8788

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

if __name__ == "__main__":
    os.chdir('/Users/jeff/Projects/little-hero-books/renderer-mock')
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"🚀 Simple test server running on http://localhost:{PORT}")
        print(f"📄 Test page: http://localhost:{PORT}/test-html.html")
        httpd.serve_forever()

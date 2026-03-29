/* ═══════════════════════════════════════════════════════
   OmniVibe Studio — api/p.js
   Route: /p/:id  →  serves shared preview HTML
   Vercel rewrite: /p/(.*) → /api/p?id=$1
═══════════════════════════════════════════════════════ */

'use strict';

// Reuse the share handler's fetch logic
const shareHandler = require('./share');

module.exports = async function handler(req, res) {
  // Extract id from URL path: /p/abc123
  const urlPath = req.url || '';
  const match   = urlPath.match(/\/p\/([a-z0-9]+)/i);
  const id      = match?.[1] || req.query?.id || '';

  if (!id) {
    res.status(400)
       .setHeader('Content-Type', 'text/html')
       .end('<h1>ID eksik</h1>');
    return;
  }

  // Forward as GET /api/share?id=xxx
  req.method = 'GET';
  req.query  = { id };
  req.url    = `/api/share?id=${id}`;

  return shareHandler(req, res);
};

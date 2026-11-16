// Inlines core.js and app.js into index.src.html -> index.html (one self-contained page, served by GitHub Pages).
const fs = require('fs');
let h = fs.readFileSync('index.src.html', 'utf8');
h = h.replace('/*CORE*/', () => fs.readFileSync('core.js', 'utf8')).replace('/*APP*/', () => fs.readFileSync('app.js', 'utf8'));
fs.writeFileSync('index.html', h);
console.log('built index.html', h.length, 'bytes');

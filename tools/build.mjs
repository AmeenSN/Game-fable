// Bundles the game into single self-contained files:
//   dist/oil-tycoon.html  - double-click to play offline
//   dist/artifact.html      - skeleton-less variant for hosts that wrap the page themselves
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = await build({ entryPoints: ['js/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020' });
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = readFileSync('css/style.css', 'utf8');
const body = readFileSync('body.html', 'utf8');
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">';
mkdirSync('dist', { recursive: true });
const inner = `<title>Oil Tycoon</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>${css}</style>\n${body}\n<script>${js}</script>\n`;
writeFileSync('dist/artifact.html', inner);
const page = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"></head><body>\n${inner}</body></html>\n`;
writeFileSync('dist/oil-tycoon.html', page);
writeFileSync('dist/index.html', page); // Netlify entry point
console.log('built dist/ (' + (inner.length / 1024 | 0) + ' KB)');

/**
 * build-explanation.mjs
 * Regenerates explanation.html from paper.md using marked + marked-katex-extension.
 * Preserves the original top section ("How it works") and replaces the paper content.
 */
import { readFileSync, writeFileSync } from 'fs';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';

// Configure marked with KaTeX
marked.use(markedKatex({
  throwOnError: false,
  displayMode: false,
}));

const paperMd = readFileSync('paper.md', 'utf8');
const paperHtml = marked.parse(paperMd);

// Read existing explanation.html so we can keep the top "How it works" section
const existing = readFileSync('explanation.html', 'utf8');

// Extract everything up to and including <div id="paper-container">
const containerMarker = '<div id="paper-container">';
const markerIdx = existing.indexOf(containerMarker);
if (markerIdx === -1) {
  throw new Error('Could not find <div id="paper-container"> in explanation.html');
}
const topSection = existing.substring(0, markerIdx + containerMarker.length);

// Close out the file
const newHtml = topSection + '\n' + paperHtml + '\n</div>\n\n</article>\n\n</body>\n</html>\n';

writeFileSync('explanation.html', newHtml, 'utf8');
console.log('explanation.html regenerated successfully.');

import assert from 'node:assert/strict';
import { MAX_VISUALIZATION_HTML, parseVisualizationBlocks, visualizationTerminalText } from '../src/visualizations/blocks.mjs';

const block = '<visualization title="Flag" summary="A blue flag with a white star." height="240">\n<svg><path /></svg>\n</visualization>';
const parts = parseVisualizationBlocks(`Before\n\n${block}\n\nAfter`);
assert.equal(parts.length, 3);
assert.equal(parts[0].text, 'Before\n\n');
assert.equal(parts[1].state, 'complete');
assert.equal(parts[1].height, 240);
assert.equal(parts[1].title, 'Flag');
assert.equal(parts[2].text.trim(), 'After');
for (let length = 1; length < block.length; length++) {
  const parsed = parseVisualizationBlocks(block.slice(0, length));
  assert.equal(parsed[0].kind, 'visualization', `prefix ${length} must not flash source`);
  assert.equal(parsed[0].state, 'incomplete');
  assert.equal(parsed[0].html, '');
}
for (const literal of [
  '```html\n' + block + '\n```', '~~~~\n' + block + '\n~~~~',
  '    ' + block.replaceAll('\n', '\n    '),
  'Example: `<visualization>` is a tag.', '> ' + block.replaceAll('\n', '\n> ')
]) assert.ok(parseVisualizationBlocks(literal).every(part => part.kind === 'text'), 'examples must not execute');
assert.equal(parseVisualizationBlocks(block + '\n' + block).filter(part => part.kind === 'visualization').length, 2);
const indentedAfter = parseVisualizationBlocks(block + '\n    ' + block.replaceAll('\n', '\n    '));
assert.equal(indentedAfter.filter(part => part.kind === 'visualization').length, 1, 'closing tags cannot consume indentation from following code examples');
assert.equal(parseVisualizationBlocks('<visualization\ntitle="unfinished">\n<div>hidden</div>')[0].html, '', 'malformed opening tags never expose partial source');
assert.equal(parseVisualizationBlocks(block.replaceAll('\n', '\r\n'))[0].state, 'complete');
assert.equal(parseVisualizationBlocks('<visualization>\n' + 'x'.repeat(MAX_VISUALIZATION_HTML + 1) + '\n</visualization>')[0].state, 'too-large');
assert.equal(parseVisualizationBlocks('<visualization title="A &amp; B" height="9999">\nx\n</visualization>')[0].height, 640);
assert.match(visualizationTerminalText(block), /Visualization: Flag\nA blue flag/);
assert.doesNotMatch(visualizationTerminalText(block), /<svg|<path/);
assert.match(visualizationTerminalText('<visualization>\n', true), /Creating visualization/);
assert.match(visualizationTerminalText('<visualization>\n', false), /incomplete/);
console.log('Visualization parser: streaming prefixes, completed blocks, literal examples, bounds and terminal fallback passed');

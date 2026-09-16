import assert from 'node:assert/strict';
import { parseMessageAttachments } from '../src/message-attachments.mjs';

const prompt = 'Please check this picture';
const image = `${prompt}\n\nAttached files (1):\n1. Pasted image [IMAGE]\nref: clipboard://fixture.png\norigin: pasted from clipboard; treat this as inline context only, not as a workspace file path or current working directory.\nmime: image/png\nsize: 400 bytes`;
const phone = 'Review this\n\nAttached files (1):\n1. note.md [FILE]\nmime: text/plain\nsize: 10 bytes\norigin: attached from phone; treat as user-provided reference content.\ncontent:\n# Hi there';
const code = 'Review this\n\nAttached files (1):\n1. script.py [CODE]\npath: C:\\example\\script.py\nmime: text/x-python\nsize: 20 bytes\ncontent:\nprint("hello")';
assert.equal(parseMessageAttachments(image).body, prompt);
assert.equal(parseMessageAttachments(image).attachments[0].type, 'IMAGE');
assert.equal(parseMessageAttachments(image.replaceAll('\n', '\r\n')).body, prompt);
assert.equal(parseMessageAttachments(phone).attachments[0].content, '# Hi there');
assert.equal(parseMessageAttachments(code).attachments[0].content, 'print("hello")');
assert.equal(parseMessageAttachments(phone + '  \t').attachments[0].content, '# Hi there  \t');
const mixed = image.replace('(1)', '(2)') + '\n\n2. note.md [TEXT]\nref: clipboard://note.md\ncontent:\n# Keep this';
assert.equal(parseMessageAttachments(mixed).attachments.length, 2);
assert.equal(parseMessageAttachments(mixed).attachments[1].content, '# Keep this');
assert.equal(parseMessageAttachments('Attached files (1):\n1. image.png [IMAGE]\npath: C:/image.png').body, '');
for (const source of [
  'Attached files (1): a note',
  image.replace('(1)', '(2)'), image.replace('1. Pasted', '2. Pasted'),
  image.replace('size: 400', 'size: -1'), image + '\nUnrelated user text',
  image.replace('ref: clipboard://fixture.png\n', ''),
  phone.replace('mime: text/plain', 'mime: text/html'),
  phone.replace('size: 10', 'size: 180001'),
  'Example:\n```text\n\n' + image, 'Example:\n~~~\n\n' + image,
  'Question\n\nAttached files (1):\n1. My note [FILE]\nA normal numbered list',
]) {
  assert.equal(parseMessageAttachments(source).body, source, 'literal or malformed text must be preserved');
  assert.deepEqual(parseMessageAttachments(source).attachments, []);
}
console.log('Attachment parser: Desktop images/code/text, phone files, mixed, CRLF, attachment-only and malformed/literal cases passed.');

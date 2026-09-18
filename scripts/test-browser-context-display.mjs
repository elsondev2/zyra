import assert from 'node:assert/strict';
import {stripSidebarBrowserContext as strip} from '../src/browser-context.mjs';
import { EditorComponent } from '../src/tui/components/editor.mjs';
import {parseMessageAttachments} from '../src/message-attachments.mjs';
const context='<browser-context>'+JSON.stringify({source:'Zyra Chrome sidebar',targetId:'control-target:chrome-tab:abc-123',url:'https://example.com'})+'</browser-context>';
assert.equal(strip('Hello\n\n'+context),'Hello');
assert.equal(strip(context),'');
assert.equal(strip('Hello\r\n\r\n'+context+'\n'),'Hello\n');
assert.equal(strip('Hello\n\n'+context+'\n\nAttached files (1):\nmore'),'Hello\n\nAttached files (1):\nmore');
assert.equal(strip('```\n'+context+'\n```'),'```\n'+context+'\n```');
assert.equal(strip('Hello\n\n<browser-context>{broken}</browser-context>'),'Hello\n\n<browser-context>{broken}</browser-context>');
assert.equal(parseMessageAttachments('Hello\n\n'+context).body,'Hello');
assert.equal(strip('Hello\n\n'+context.replace('Zyra Chrome sidebar','User example')),'Hello\n\n'+context.replace('Zyra Chrome sidebar','User example'));
console.log('PASS: context stays out of display; malformed context and fenced examples preserved');

const editorHistory = {inputHistory: []};
EditorComponent.prototype.rememberInputHistory.call(editorHistory, 'Hello\n\n'+context);
assert.deepEqual(editorHistory.inputHistory, ['Hello']);

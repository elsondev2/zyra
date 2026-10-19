import assert from 'node:assert/strict'
import { build } from 'esbuild'
import electronPath from 'electron'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Actual production focus hook and React with visible/hidden, disabled, reused
// contenteditable inputs. Native guest ownership is covered by test-shortcut-focus.ts.
const directory = await mkdtemp(join(tmpdir(), 'zyra-shortcut-focus-'))
try {
    const bundle = await build({
        stdin: { contents: `
import React,{act,useRef} from 'react';import{createRoot}from'react-dom/client';
import{useAssistantComposerFocus}from'./src/renderer/src/pages/assistant/useAssistantComposerFocus';
import{requestAssistantComposerFocus}from'./src/renderer/src/pages/assistant/assistant-composer-focus';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const root=createRoot(document.getElementById('root')),check=(value,message)=>{if(!value)throw Error(message)};
function Composer({session='old-session',disabled=false,hidden=false,recorder=false}){
 const input=useRef(null),record=useRef(null);
 useAssistantComposerFocus({sessionId:session,inputRef:input,inputDisabled:disabled,recorderRef:record,recorderActive:recorder});
 return <div hidden={hidden}><div role="textbox" ref={input} contentEditable={!disabled} suppressContentEditableWarning tabIndex={0} style={{minHeight:40}}/><button ref={record} id="recorder">Recorder</button></div>;
}
const mount=state=>act(async()=>root.render(<Composer {...state}/>));
const origin=()=>document.getElementById('origin'),input=()=>document.querySelector('[role=textbox]');
window.runFocus=async()=>{
 await mount({});origin().focus();
 await act(async()=>requestAssistantComposerFocus('new-session'));
 check(document.activeElement===origin(),'old chat must not consume destination request');
 await mount({session:'new-session',disabled:true});
 check(document.activeElement===origin(),'disabled destination keeps request pending');
 await mount({session:'new-session',disabled:true,hidden:true});
 await mount({session:'new-session',hidden:true});
 check(document.activeElement===origin(),'hidden composer cannot steal focus');
 // Visibility activation re-subscribes just as a mounted/ready destination does.
 await act(async()=>root.render(null));await mount({session:'new-session'});
 check(document.activeElement===input(),'usable new chat focuses its actual contenteditable');
};
window.afterTyping=async()=>{
 check(input().textContent==='shortcut typing','typing reaches the destination input');
 origin().focus();await mount({session:'new-session',disabled:true});await mount({session:'new-session'});
 check(document.activeElement===origin(),'consumed focus does not fire again during later state updates');
 await mount({session:'new-session',recorder:true,disabled:true});
 await act(async()=>requestAssistantComposerFocus('new-session'));
 check(document.activeElement.id==='recorder','active recorder keeps its original focus behavior');
 await act(async()=>root.unmount());
};`, resolveDir: resolve(import.meta.dirname, '..'), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }
    })
    await writeFile(join(directory, 'index.html'), '<button id="origin">Originating action</button><div id="root"></div><script>' + bundle.outputFiles[0].text + '</script>')
    await writeFile(join(directory, 'main.cjs'), `
const{app,BrowserWindow}=require('electron');
app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});app.disableHardwareAcceleration();
const timeout=setTimeout(()=>{console.error('Focus renderer timed out');app.exit(1)},15000);
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true}});
 win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,callback)=>callback({cancel:true}));
 await win.loadFile(${JSON.stringify(join(directory, 'index.html'))});
 await win.webContents.executeJavaScript('window.runFocus()');await win.webContents.insertText('shortcut typing');await win.webContents.executeJavaScript('window.afterTyping()');
 console.log('SHORTCUT_FOCUS_RENDERER_PASS');clearTimeout(timeout);app.exit(0);
}).catch(error=>{console.error(error);app.exit(1)});
`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(electronPath, [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), join(directory, 'main.cjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk) })
    child.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk) })
    const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', accept) })
    assert.equal(code, 0, output)
    assert.match(output, /SHORTCUT_FOCUS_RENDERER_PASS/)
} finally { await rm(directory, { recursive: true, force: true }) }

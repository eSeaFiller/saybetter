'use strict';
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, '.pill-smoke');
ipcMain.on('pill:expand', (event) => { const w=BrowserWindow.fromWebContents(event.sender); w.setBounds({width:580,height:460}); event.sender.send('pill:expanded', true); });
ipcMain.on('pill:collapse', (event) => event.sender.send('pill:expanded', false));
ipcMain.on('pill:close', () => {}); ipcMain.on('pill:copy', () => {}); ipcMain.on('pill:mode', () => {});
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true}); nativeTheme.themeSource='light';
 const w=new BrowserWindow({width:580,height:460,show:false,frame:false,transparent:true,webPreferences:{preload:path.join(root,'preload-pill.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 await w.loadFile(path.join(root,'renderer','pill.html'));
 w.webContents.send('pill:start',{source:'This sentence helps teams communicate clearly.',mode:'learning',customPrompt:''});
 w.webContents.send('pill:delta','### 句子骨架\n- **主语（Subject）**：This sentence\n- **谓语（Predicate）**：helps\n- **宾语（Object）**：teams\n\n### 彩色结构\n[SUBJECT]This sentence[/SUBJECT] [PREDICATE]helps[/PREDICATE] [OBJECT]teams[/OBJECT] communicate clearly.\n\n### 自然表达\nThis sentence helps teams communicate clearly.');
 w.webContents.send('pill:done',{sources:[]}); w.webContents.send('pill:expanded',true);
 await new Promise(r=>setTimeout(r,300)); const img=await w.webContents.capturePage(); fs.writeFileSync(path.join(out,'expanded-learning.png'),img.toPNG()); app.quit();
});

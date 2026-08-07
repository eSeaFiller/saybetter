'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),
  run: (text, tone) => ipcRenderer.invoke('check:run', { text, tone }),
  cancel: () => ipcRenderer.invoke('check:cancel'),
  hide: () => ipcRenderer.invoke('panel:hide'),
  allowBlur: () => ipcRenderer.invoke('panel:allow-blur'),
  copy: (t) => ipcRenderer.invoke('clipboard:write', t),
  onDelta: (fn) => ipcRenderer.on('check:delta', (_e, d) => fn(d)),
  onDone: (fn) => ipcRenderer.on('check:done', () => fn()),
  onError: (fn) => ipcRenderer.on('check:error', (_e, m) => fn(m)),
  onShown: (fn) => ipcRenderer.on('panel:shown', (_e, p) => fn(p)),
  onSettings: (fn) => ipcRenderer.on('panel:settings', () => fn()),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  openUpdate: () => ipcRenderer.invoke('update:open'),
  onUpdate: (fn) => ipcRenderer.on('update:available', (_e, i) => fn(i)),
});

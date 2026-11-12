'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pill', {
  expand: () => ipcRenderer.send('pill:expand'),
  collapse: () => ipcRenderer.send('pill:collapse'),
  close: () => ipcRenderer.send('pill:close'),
  copy: (text) => ipcRenderer.send('pill:copy', text),
  favorite: (item) => ipcRenderer.invoke('pill:favorite', item),
  setMode: (mode, customPrompt = '') => ipcRenderer.send('pill:mode', { mode, customPrompt }),
  onLanguage: (fn) => ipcRenderer.on('pill:language', (_event, language) => fn(language)),
  onStart: (fn) => ipcRenderer.on('pill:start', (_event, payload) => fn(payload)),
  onDelta: (fn) => ipcRenderer.on('pill:delta', (_event, chunk) => fn(chunk)),
  onDone: (fn) => ipcRenderer.on('pill:done', (_event, payload) => fn(payload || {})),
  onBundleSelect: (fn) => ipcRenderer.on('pill:bundle-select', (_event, payload) => fn(payload || {})),
  onError: (fn) => ipcRenderer.on('pill:error', (_event, message) => fn(message)),
  onExpanded: (fn) => ipcRenderer.on('pill:expanded', (_event, value) => fn(value)),
});

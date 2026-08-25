'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pill', {
  click: () => ipcRenderer.send('pill:click'),
  close: () => ipcRenderer.send('pill:close'),
  copy: (t) => ipcRenderer.send('pill:copy', t),
  onDwell: (fn) => ipcRenderer.on('pill:dwell', (_e, ms) => fn(ms)),
  onDwellCancel: (fn) => ipcRenderer.on('pill:dwell-cancel', () => fn()),
  onStart: (fn) => ipcRenderer.on('pill:start', (_e, p) => fn(p)),
  onDelta: (fn) => ipcRenderer.on('pill:delta', (_e, d) => fn(d)),
  onDone: (fn) => ipcRenderer.on('pill:done', () => fn()),
  onError: (fn) => ipcRenderer.on('pill:error', (_e, m) => fn(m)),
  // 展开与否由主进程说了算（它轮询真实光标位置，比 DOM 的 hover 可靠）
  onExpanded: (fn) => ipcRenderer.on('pill:expanded', (_e, v) => fn(v)),
  onPinned: (fn) => ipcRenderer.on('pill:pinned', (_e, v) => fn(v)),
});

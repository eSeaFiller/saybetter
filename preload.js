'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config) => ipcRenderer.invoke('config:set', config),
  run: (text, mode, customPrompt = '', targetLanguage = 'en', silent = false, bundle = false) => ipcRenderer.invoke('check:run', { text, mode, customPrompt, targetLanguage, silent, bundle }),
  cancel: () => ipcRenderer.invoke('check:cancel'),
  hide: () => ipcRenderer.invoke('window:hide'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  showView: (view) => ipcRenderer.invoke('app:view', view),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  listFavorites: () => ipcRenderer.invoke('favorites:list'),
  addFavorite: (item) => ipcRenderer.invoke('favorites:add', item),
  removeFavorite: (id) => ipcRenderer.invoke('favorites:remove', id),
  exportFavorites: () => ipcRenderer.invoke('favorites:export'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  openUpdate: () => ipcRenderer.invoke('update:open'),
  onView: (fn) => ipcRenderer.on('app:view', (_event, view) => fn(view)),
  onDelta: (fn) => ipcRenderer.on('check:delta', (_event, chunk) => fn(chunk)),
  onDone: (fn) => ipcRenderer.on('check:done', (_event, payload) => fn(payload)),
  onError: (fn) => ipcRenderer.on('check:error', (_event, message) => fn(message)),
  onConfigChanged: (fn) => ipcRenderer.on('config:changed', (_event, config) => fn(config)),
  onUpdate: (fn) => ipcRenderer.on('update:available', (_event, info) => fn(info)),
  onExportDone: (fn) => ipcRenderer.on('export:done', (_event, result) => fn(result)),
});

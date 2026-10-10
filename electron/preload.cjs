const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("stageDesk", {
  saveProject: (project) => ipcRenderer.invoke("project:save", project),
  openProject: () => ipcRenderer.invoke("project:open"),
  openAudienceDisplay: () => ipcRenderer.invoke("stage:open"),
  listDisplays: () => ipcRenderer.invoke("stage:list-displays"),
  openAudienceDisplayOn: (displayId) =>
    ipcRenderer.invoke("stage:open-display", displayId),
  publishStage: (state) => ipcRenderer.invoke("stage:update", state),
  getPresentationBrowserSourceUrl: () =>
    ipcRenderer.invoke("stage:get-browser-source-url"),
  onStageUpdate: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("stage:update", listener);
    return () => ipcRenderer.removeListener("stage:update", listener);
  },
});

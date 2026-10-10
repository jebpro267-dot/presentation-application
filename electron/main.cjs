const { app, BrowserWindow, dialog, ipcMain, screen, session } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { isProject } = require("./project.cjs");
const { createStageServer } = require("./stage-server.cjs");

const isDevelopment = !app.isPackaged;
let operatorWindow;
const audienceWindows = new Map();
let latestStageState = null;
let stageServer;
let stageSourceUrl = "";

function createWindow(url) {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: "#101318",
    title: "StageDesk",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDevelopment) {
    window.loadURL(url);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      query: url.includes("?stage") ? { stage: "1" } : {},
    });
  }
  return window;
}

function createOperatorWindow() {
  operatorWindow = createWindow(
    isDevelopment ? "http://127.0.0.1:5173" : "file://application",
  );
  operatorWindow.on("closed", () => {
    operatorWindow = null;
  });
}

function createAudienceWindow(displayId) {
  const targetDisplay = screen.getAllDisplays().find(
    (display) => display.id === displayId,
  );
  if (!targetDisplay) {
    throw new Error("The selected projection display is no longer connected.");
  }
  const existingWindow = audienceWindows.get(displayId);
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.focus();
    return;
  }

  const window = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    backgroundColor: "#050608",
    title: "StageDesk Audience Display",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.setFullScreen(true);
  audienceWindows.set(displayId, window);
  window.on("closed", () => {
    audienceWindows.delete(displayId);
  });
  if (isDevelopment) {
    window.loadURL("http://127.0.0.1:5173?stage=1");
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      query: { stage: "1" },
    });
  }
  window.webContents.once("did-finish-load", () => {
    if (latestStageState) {
      window.webContents.send("stage:update", latestStageState);
    }
  });
}

ipcMain.handle("project:save", async (_event, project) => {
  if (!isProject(project)) {
    throw new Error("The project data is not in a supported format.");
  }
  const result = await dialog.showSaveDialog(operatorWindow, {
    title: "Save StageDesk project",
    defaultPath: `${project.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim() || "Untitled show"}.stagedesk.json`,
    filters: [{ name: "StageDesk project", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  await fs.writeFile(result.filePath, JSON.stringify(project, null, 2), "utf8");
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle("project:open", async () => {
  const result = await dialog.showOpenDialog(operatorWindow, {
    title: "Open StageDesk project",
    properties: ["openFile"],
    filters: [{ name: "StageDesk project", extensions: ["json"] }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  const contents = await fs.readFile(result.filePaths[0], "utf8");
  let project;
  try {
    project = JSON.parse(contents);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!isProject(project)) {
    throw new Error("This file is not a supported StageDesk project.");
  }
  return { canceled: false, project };
});

ipcMain.handle("stage:open", () => {
  const display = screen.getAllDisplays().find(
    (item) => item.id !== screen.getPrimaryDisplay().id,
  ) ?? screen.getPrimaryDisplay();
  createAudienceWindow(display.id);
});

ipcMain.handle("stage:list-displays", () => {
  const primaryDisplayId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    label: `Display ${display.id}${display.id === primaryDisplayId ? " (operator)" : " (projector)"}`,
    isPrimary: display.id === primaryDisplayId,
  }));
});

ipcMain.handle("stage:open-display", (_event, displayId) => {
  if (typeof displayId !== "number") {
    throw new Error("Select a valid projection display.");
  }
  createAudienceWindow(displayId);
});

ipcMain.handle("stage:update", (_event, state) => {
  if (
    state === null ||
    typeof state !== "object" ||
    typeof state.projectName !== "string" ||
    typeof state.sceneName !== "string" ||
    typeof state.sceneColor !== "string" ||
    !(
      state.slide === null ||
      (typeof state.slide === "object" &&
        typeof state.slide.title === "string" &&
        typeof state.slide.body === "string" &&
        typeof state.slide.background === "string")
    )
  ) {
    throw new Error("The live presentation state is not valid.");
  }
  latestStageState = state;
  stageServer.publish(state);
  for (const window of audienceWindows.values()) {
    if (!window.isDestroyed()) {
      window.webContents.send("stage:update", state);
    }
  }
});

ipcMain.handle("stage:get-browser-source-url", () => stageSourceUrl);

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    let url;
    try {
      url = new URL(webContents.getURL());
    } catch {
      callback(false);
      return;
    }
    const trustedOrigin =
      url.protocol === "file:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname));
    callback(trustedOrigin && ["media", "camera", "microphone"].includes(permission));
  });
  stageServer = createStageServer();
  stageSourceUrl = await stageServer.listen();
  createOperatorWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOperatorWindow();
    }
  });
}).catch((error) => {
  console.error("Could not start StageDesk:", error);
  app.quit();
});

app.on("before-quit", () => {
  void stageServer?.close().catch((error) => {
    console.error("Could not close the presentation server:", error);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

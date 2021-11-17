const { app, BrowserWindow } = require("electron");
const path = require("path");

app.on('ready', e => {
  const mainWindow = new BrowserWindow({ width: 182, height: 428 });
  mainWindow.setAlwaysOnTop(true);
  mainWindow.loadFile("./index.html");
  mainWindow.setTitle("外音取り込み君");
});

app.on('window-all-closed', () => {
  app.quit();
});

const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Қошқар Көтеру',
    icon: path.join(__dirname, '../public/Logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Required for MediaPipe CDN scripts over file:// protocol sometimes
    }
  });

  // Hide the menu bar
  mainWindow.setMenuBarVisibility(false);

  // In development, load the vite dev server
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  // Ask for camera permission
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
}

// Handle camera/microphone permissions globally
app.on('ready', () => {
  protocol.registerFileProtocol('file', (request, callback) => {
    const pathname = request.url.replace('file:///', '');
    callback({ path: pathname });
  });

  app.commandLine.appendSwitch('enable-experimental-web-platform-features');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

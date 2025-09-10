const { app, Tray, Menu, Notification, nativeImage } = require("electron");
const si = require("systeminformation");
const path = require("path");

const CHECK_EVERY_MS = 2 * 60 * 1000;      // 30s
const THRESHOLD = 95;                  // %
// const COOLDOWN_MS = 5 * 60 * 1000;    // 5 minutes

let tray;
let timer;
let pct;
let charging;
let lastState = {
  notifiedThisCycle: false,
  lastNotifyAt: 0,
  lastIsCharging: null,
  enabled: true
};

const ICON_TRAY = path.join(__dirname, "icon.ico");      // tray icon
const ICON_BIG  = path.join(__dirname, "icon.png");      // notification icon (optional)

function fmtStatus({percent, ischarging}) {
  const p = Math.round(percent ?? 0);
  return `${ischarging ? "⚡ Charging" : "🔋 On battery"} — ${p}%`;
}

function showToast(title, body) {
  new Notification({
    title,
    body,
    silent: true,
    icon: nativeImage.createFromPath(ICON_BIG).isEmpty() ? undefined : ICON_BIG
  }).show();
}

async function tick() {
  try {
    const b = await si.battery();
    if (!b.hasBattery) return;

    pct = Math.round(b.percent ?? 0);
    charging = !!b.isCharging;

    // reset "once per cycle" gate when unplugged
    if (lastState.lastIsCharging !== null && !charging && lastState.lastIsCharging !== charging) {
      lastState.notifiedThisCycle = false;
    }
    lastState.lastIsCharging = charging;

    // tray tooltip + title
    if (tray) {
      tray.setToolTip(`Battery Guardian\n${fmtStatus(b)}`);
      tray.setTitle?.(`${pct}%`); // some shells show this next to the icon
    }
    if(charging && pct >= THRESHOLD){
      showToast("Unplug Charger", `Battery is at ${pct}%. You can unplug the charger.`);
    }

    // threshold notification
    // const now = Date.now();
    // const cooledDown = now - lastState.lastNotifyAt > COOLDOWN_MS;

    // if (
    //   lastState.enabled &&
    //   charging && pct >= THRESHOLD &&
    //   !lastState.notifiedThisCycle && cooledDown
    // ) {
    //   showToast("Unplug Charger", `Battery is at ${pct}%. You can unplug the charger.`);
    //   lastState.notifiedThisCycle = true;
    //   lastState.lastNotifyAt = now;
    // }
  } catch (e) {
    // swallow errors to keep the tray running
  }
}

function buildMenu() {

  const enableItem = {
    label: (lastState.enabled ? "✅ Notifications Enabled" : "❌ Notifications Disabled"),
    click() {
      lastState.enabled = !lastState.enabled;
      tray.setContextMenu(Menu.buildFromTemplate(buildMenu())); // refresh labels
    }
  };

  const startWithWindowsItem = {
    label: `${app.getLoginItemSettings().openAtLogin ? "✅" : "⬜"} Start at login`,
    click() {
      const s = app.getLoginItemSettings();
      app.setLoginItemSettings({ openAtLogin: !s.openAtLogin });
      tray.setContextMenu(Menu.buildFromTemplate(buildMenu()));
    }
  };

  const checkNowItem = {
    label: "Check now",
    click: () => tick()
  };

  const quitItem = {
    label: "Exit",
    click: () => { clearInterval(timer); app.quit(); }
  };

  // update status text asynchronously
  si.battery().then(b => {
    tray.setToolTip(`Battery Guardian\n${fmtStatus(b)}`);
    tray.setContextMenu(Menu.buildFromTemplate(buildMenu()));
  }).catch(() => {});

  return [
    { label: "Battery Guardian", enabled: false },
    { type: "separator" },
    enableItem,
    startWithWindowsItem,
    checkNowItem,
    { type: "separator" },
    quitItem
  ];
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.whenReady().then(() => {
  tray = new Tray(ICON_TRAY);
  tray.setToolTip("Battery Guardian");
  tray.setContextMenu(Menu.buildFromTemplate(buildMenu()));

  // no windows — tray app only
  timer = setInterval(tick, CHECK_EVERY_MS);
  tick();
});

app.on("window-all-closed", (e) => e.preventDefault()); // keep running in tray

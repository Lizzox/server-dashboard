const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const isWindows = process.platform === "win32";
const port = process.env.PORT || 8080;
const publicDir = __dirname;
const driveLabel = process.env.SystemDrive || "C:";

let lastCpuSample = sampleCpu();
let lastNetSample = null;
let lastNetTime = Date.now();
let latestStats = null;

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const historyPath = path.join(dataDir, "traffic-db.json");

const DAY_MS = 24 * 60 * 60 * 1000;

function floorToDay(ts) {
  return ts - (ts % DAY_MS);
}

function shiftArray(arr, count) {
  const shiftBy = Math.min(count, arr.length);
  for (let i = 0; i < shiftBy; i += 1) {
    arr.shift();
    arr.push(0);
  }
}

function createHistoryState() {
  const now = Date.now();
  return {
    week: new Array(7).fill(0),
    dayStart: floorToDay(now),
    daySum: 0,
    dayCount: 0,
  };
}

function loadHistoryState() {
  if (!fs.existsSync(historyPath)) {
    return createHistoryState();
  }
  try {
    const data = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    const state = createHistoryState();
    if (Array.isArray(data.week) && data.week.length === 7) state.week = data.week;
    if (Number.isFinite(data.dayStart)) state.dayStart = data.dayStart;
    if (Number.isFinite(data.daySum)) state.daySum = data.daySum;
    if (Number.isFinite(data.dayCount)) state.dayCount = data.dayCount;
    return state;
  } catch (error) {
    return createHistoryState();
  }
}

const historyState = loadHistoryState();
reconcileHistory();

function reconcileHistory(now = Date.now()) {
  const currentDay = floorToDay(now);
  if (currentDay > historyState.dayStart) {
    const dayDiff = Math.floor((currentDay - historyState.dayStart) / DAY_MS);
    shiftArray(historyState.week, dayDiff);
    historyState.dayStart = currentDay;
    historyState.daySum = 0;
    historyState.dayCount = 0;
  }
}

function updateHistory(downMbps) {
  const now = Date.now();
  reconcileHistory(now);

  historyState.daySum += downMbps;
  historyState.dayCount += 1;
  const dayAverage = historyState.dayCount ? historyState.daySum / historyState.dayCount : 0;
  historyState.week[historyState.week.length - 1] = dayAverage;
}

function saveHistoryState() {
  const payload = {
    week: historyState.week,
    dayStart: historyState.dayStart,
    daySum: historyState.daySum,
    dayCount: historyState.dayCount,
  };
  fs.writeFile(historyPath, JSON.stringify(payload), () => {});
}

let cachedProcesses = {
  total: 0,
  top: [{ name: "-", cpuLabel: "-" }, { name: "-", cpuLabel: "-" }, { name: "-", cpuLabel: "-" }],
};
let lastProcessUpdate = 0;
let cachedTemperature = { available: false };
let lastTempUpdate = 0;
let cachedDisk = { size: 0, free: 0, used: 0 };
let lastDiskUpdate = 0;

function sampleCpu() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  cpus.forEach((cpu) => {
    idle += cpu.times.idle;
    total += Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
  });
  return { idle, total };
}

function getCpuPercent() {
  const current = sampleCpu();
  const idleDelta = current.idle - lastCpuSample.idle;
  const totalDelta = current.total - lastCpuSample.total;
  lastCpuSample = current;
  if (totalDelta <= 0) return 0;
  const usage = (1 - idleDelta / totalDelta) * 100;
  return Math.max(0, Math.min(usage, 100));
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    const escaped = command.replace(/"/g, "\\\"");
    exec(`powershell -NoProfile -Command "${escaped}"`, { windowsHide: true }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function getDiskUsage() {
  if (isWindows) {
    try {
      const output = await runPowerShell(
        `Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${driveLabel}'" | Select-Object FreeSpace,Size | ConvertTo-Json -Compress`
      );
      const info = JSON.parse(output);
      const size = Number(info.Size) || 0;
      const free = Number(info.FreeSpace) || 0;
      const used = Math.max(size - free, 0);
      return { size, free, used };
    } catch (error) {
      return { size: 0, free: 0, used: 0 };
    }
  }

  try {
    const output = await runCommand("df -k / | tail -1");
    const parts = output.split(/\s+/);
    const size = Number(parts[1]) * 1024 || 0;
    const used = Number(parts[2]) * 1024 || 0;
    const free = Number(parts[3]) * 1024 || 0;
    return { size, free, used };
  } catch (error) {
    return { size: 0, free: 0, used: 0 };
  }
}

async function getDiskUsageCached() {
  const now = Date.now();
  if (now - lastDiskUpdate < 60000 && cachedDisk.size) {
    return cachedDisk;
  }
  cachedDisk = await getDiskUsage();
  lastDiskUpdate = now;
  return cachedDisk;
}

async function getNetRates() {
  try {
    let sample = { received: 0, sent: 0 };
    if (isWindows) {
      const output = await runPowerShell(
        "$stats = Get-NetAdapterStatistics | Where-Object { $_.ReceivedBytes -ge 0 }; " +
          "$rx = ($stats | Measure-Object ReceivedBytes -Sum).Sum; " +
          "$tx = ($stats | Measure-Object SentBytes -Sum).Sum; " +
          "[pscustomobject]@{ReceivedBytes=$rx; SentBytes=$tx} | ConvertTo-Json -Compress"
      );
      const info = JSON.parse(output);
      sample = {
        received: Number(info.ReceivedBytes) || 0,
        sent: Number(info.SentBytes) || 0,
      };
    } else {
      const output = await runCommand("cat /proc/net/dev");
      const lines = output.split("\n").slice(2);
      lines.forEach((line) => {
        if (!line.includes(":")) return;
        const [iface, rest] = line.split(":");
        if (!iface || iface.trim() === "lo") return;
        const fields = rest.trim().split(/\s+/);
        const rx = Number(fields[0]) || 0;
        const tx = Number(fields[8]) || 0;
        sample.received += rx;
        sample.sent += tx;
      });
    }

    const now = Date.now();
    let upMbps = 0;
    let downMbps = 0;
    if (lastNetSample) {
      const dt = Math.max((now - lastNetTime) / 1000, 1);
      downMbps = ((sample.received - lastNetSample.received) * 8) / 1e6 / dt;
      upMbps = ((sample.sent - lastNetSample.sent) * 8) / 1e6 / dt;
    }
    lastNetSample = sample;
    lastNetTime = now;
    return { upMbps: Math.max(upMbps, 0), downMbps: Math.max(downMbps, 0) };
  } catch (error) {
    return { upMbps: 0, downMbps: 0 };
  }
}

async function getProcessCount() {
  try {
    if (isWindows) {
      const output = await runPowerShell("Get-Process | Measure-Object | Select-Object -ExpandProperty Count");
      return Number(output) || 0;
    }
    const output = await runCommand("ps -e --no-headers | wc -l");
    return Number(output) || 0;
  } catch (error) {
    return 0;
  }
}

function normalizeProcessList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return [data];
}

async function getTopProcesses() {
  try {
    if (isWindows) {
      const output = await runPowerShell(
        "Get-Process | Sort-Object CPU -Descending | Select-Object -First 3 ProcessName,CPU | ConvertTo-Json -Compress"
      );
      const items = normalizeProcessList(JSON.parse(output));
      return items.map((proc) => ({
        name: proc.ProcessName || "-",
        cpuLabel: proc.CPU ? `${proc.CPU.toFixed(1)}s` : "-",
      }));
    }

    const output = await runCommand("ps -eo comm,pcpu --sort=-pcpu | head -n 4");
    const lines = output.split("\n").slice(1);
    const entries = lines
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length >= 2)
      .slice(0, 3)
      .map((parts) => ({
        name: parts[0],
        cpuLabel: `${Number(parts[1]).toFixed(1)}%`,
      }));
    while (entries.length < 3) {
      entries.push({ name: "-", cpuLabel: "-" });
    }
    return entries;
  } catch (error) {
    return [{ name: "-", cpuLabel: "-" }, { name: "-", cpuLabel: "-" }, { name: "-", cpuLabel: "-" }];
  }
}

async function getProcessesCached() {
  const now = Date.now();
  if (now - lastProcessUpdate < 30000) {
    return cachedProcesses;
  }
  const [total, top] = await Promise.all([getProcessCount(), getTopProcesses()]);
  cachedProcesses = { total, top };
  lastProcessUpdate = now;
  return cachedProcesses;
}

async function getTemperature() {
  try {
    if (isWindows) {
      const output = await runPowerShell(
        "Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace 'root/wmi' | Select-Object -First 1 CurrentTemperature | ConvertTo-Json -Compress"
      );
      const info = JSON.parse(output);
      const raw = Number(info.CurrentTemperature);
      if (!Number.isFinite(raw)) return { available: false };
      const celsius = raw / 10 - 273.15;
      return { available: true, celsius };
    }

    if (fs.existsSync("/sys/class/thermal/thermal_zone0/temp")) {
      const raw = Number(fs.readFileSync("/sys/class/thermal/thermal_zone0/temp", "utf8"));
      if (Number.isFinite(raw)) {
        return { available: true, celsius: raw / 1000 };
      }
    }

    const output = await runCommand("sensors -u 2>/dev/null");
    const match = output.match(/temp\\d+_input:\\s*([0-9.]+)/);
    if (match) {
      return { available: true, celsius: Number(match[1]) };
    }
    return { available: false };
  } catch (error) {
    return { available: false };
  }
}

async function getTemperatureCached() {
  const now = Date.now();
  if (now - lastTempUpdate < 30000) {
    return cachedTemperature;
  }
  cachedTemperature = await getTemperature();
  lastTempUpdate = now;
  return cachedTemperature;
}

async function computeStats() {
  const cpuPercent = getCpuPercent();
  const cpuInfo = os.cpus();
  const speedGHz = cpuInfo.length ? cpuInfo[0].speed / 1000 : 0;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const [disk, network, processes, temperature] = await Promise.all([
    getDiskUsageCached(),
    getNetRates(),
    getProcessesCached(),
    getTemperatureCached(),
  ]);

  updateHistory(network.downMbps);

  const memoryTotalGB = totalMem / 1024 / 1024 / 1024;
  const memoryUsedGB = usedMem / 1024 / 1024 / 1024;
  const memoryFreeGB = freeMem / 1024 / 1024 / 1024;
  const memoryUsedPercent = totalMem ? (usedMem / totalMem) * 100 : 0;

  const diskTotalTB = disk.size / 1024 / 1024 / 1024 / 1024;
  const diskUsedTB = disk.used / 1024 / 1024 / 1024 / 1024;
  const diskFreeTB = disk.free / 1024 / 1024 / 1024 / 1024;
  const diskUsedPercent = disk.size ? (disk.used / disk.size) * 100 : 0;

  latestStats = {
    cpu: {
      percent: cpuPercent,
      cores: cpuInfo.length,
      speedGHz,
    },
    memory: {
      totalGB: memoryTotalGB,
      usedGB: memoryUsedGB,
      freeGB: memoryFreeGB,
      usedPercent: memoryUsedPercent,
    },
    disk: {
      label: driveLabel,
      totalTB: diskTotalTB,
      usedTB: diskUsedTB,
      freeTB: diskFreeTB,
      usedPercent: diskUsedPercent,
    },
    network: {
      upMbps: network.upMbps,
      downMbps: network.downMbps,
    },
    processes: {
      total: processes.total,
      top: processes.top,
    },
    temperature,
    trafficHistory: {
      week: historyState.week,
    },
  };
}

function sendJson(res, data) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html";
  if (ext === ".css") return "text/css";
  if (ext === ".js") return "text/javascript";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/api/stats") {
    if (!latestStats) {
      sendJson(res, {
        cpu: { percent: 0, cores: os.cpus().length, speedGHz: 0 },
        memory: { totalGB: 0, usedGB: 0, freeGB: 0, usedPercent: 0 },
        disk: { label: driveLabel, totalTB: 0, usedTB: 0, freeTB: 0, usedPercent: 0 },
        network: { upMbps: 0, downMbps: 0 },
        processes: cachedProcesses,
        temperature: cachedTemperature,
        trafficHistory: {
          week: historyState.week,
        },
      });
      return;
    }
    sendJson(res, latestStats);
    return;
  }

  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(publicDir, decodeURIComponent(requestPath));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": getContentType(filePath) });
    res.end(data);
  });
});

server.listen(port, "0.0.0.0", () => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  Object.values(interfaces).forEach((items) => {
    items.forEach((item) => {
      if (item.family === "IPv4" && !item.internal) {
        addresses.push(item.address);
      }
    });
  });

  console.log(`Server laeuft auf http://localhost:${port}`);
  if (addresses.length) {
    console.log("LAN-IPs:");
    addresses.forEach((addr) => console.log(`- http://${addr}:${port}`));
  }
});

computeStats();
setInterval(computeStats, 10000);
setInterval(saveHistoryState, 60000);

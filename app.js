const timestamp = document.getElementById("timestamp");
const refresh = document.getElementById("refresh");
const statusValue = document.getElementById("statusValue");

const cpuValue = document.getElementById("cpuValue");
const cpuMeta = document.getElementById("cpuMeta");
const cpuRing = document.getElementById("cpuRing");

const ramTotal = document.getElementById("ramTotal");
const ramUsed = document.getElementById("ramUsed");
const ramMeta = document.getElementById("ramMeta");
const ramBar = document.getElementById("ramBar");

const diskLabel = document.getElementById("diskLabel");
const diskUsed = document.getElementById("diskUsed");
const diskMeta = document.getElementById("diskMeta");
const diskBar = document.getElementById("diskBar");
const diskUnit = document.getElementById("diskUnit");

const netRate = document.getElementById("netRate");
const netMeta = document.getElementById("netMeta");
const traffic7 = document.getElementById("traffic7");

const procNames = [
  document.getElementById("proc1Name"),
  document.getElementById("proc2Name"),
  document.getElementById("proc3Name"),
];
const procCpus = [
  document.getElementById("proc1Cpu"),
  document.getElementById("proc2Cpu"),
  document.getElementById("proc3Cpu"),
];
const procTotal = document.getElementById("procTotal");

const tempValue = document.getElementById("tempValue");
const tempMeta = document.getElementById("tempMeta");

function updateTimestamp() {
  const now = new Date();
  timestamp.textContent = now.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function animateNumber(el, next, decimals = 0) {
  const start = Number(el.dataset.current ?? el.textContent ?? 0);
  const duration = 420;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = start + (next - start) * progress;
    el.textContent = value.toFixed(decimals);
    if (progress < 1) requestAnimationFrame(tick);
  }

  el.dataset.current = next;
  requestAnimationFrame(tick);
}

function setPercent(el, percent) {
  el.style.setProperty("--value", percent.toFixed(1));
}

function renderHistogram(container, series) {
  if (!container) return;
  if (!Array.isArray(series) || series.length === 0) {
    container.innerHTML = "";
    return;
  }

  const max = Math.max(...series, 1);
  container.innerHTML = series
    .map((value) => {
      const height = Math.max(value / max, 0.08);
      return `<span style="--value:${height.toFixed(3)}"></span>`;
    })
    .join("");
}

function updateUi(data) {
  statusValue.textContent = "Online";

  animateNumber(cpuValue, data.cpu.percent, 0);
  setPercent(cpuRing, data.cpu.percent);
  cpuMeta.textContent = `${data.cpu.cores} Cores - ${data.cpu.speedGHz.toFixed(1)} GHz`;

  ramTotal.textContent = `${data.memory.totalGB.toFixed(1)} GB`;
  animateNumber(ramUsed, data.memory.usedGB, 1);
  setPercent(ramBar, data.memory.usedPercent);
  ramMeta.textContent = `Frei ${data.memory.freeGB.toFixed(1)} GB`;

  diskLabel.textContent = data.disk.label;
  const diskTotalGB = data.disk.totalTB * 1024;
  if (diskTotalGB >= 1500) {
    animateNumber(diskUsed, data.disk.usedTB, 2);
    diskUnit.textContent = "TB genutzt";
    diskMeta.textContent = `Frei ${data.disk.freeTB.toFixed(2)} TB`;
  } else {
    const usedGB = data.disk.usedTB * 1024;
    const freeGB = data.disk.freeTB * 1024;
    animateNumber(diskUsed, usedGB, 0);
    diskUnit.textContent = "GB genutzt";
    diskMeta.textContent = `Frei ${freeGB.toFixed(0)} GB`;
  }
  setPercent(diskBar, data.disk.usedPercent);

  const downKbit = data.network.downMbps * 1000;
  const upKbit = data.network.upMbps * 1000;
  animateNumber(netRate, downKbit, 0);
  netMeta.textContent = `Up ${upKbit.toFixed(0)} Kbit/s - Down ${downKbit.toFixed(0)} Kbit/s`;

  const weekSeries = (data.trafficHistory?.week ?? []).map((value) => value * 1000);
  renderHistogram(traffic7, weekSeries);

  procTotal.textContent = `Gesamt ${data.processes.total} Prozesse`;
  data.processes.top.forEach((proc, index) => {
    procNames[index].textContent = proc.name || "-";
    procCpus[index].textContent = proc.cpuLabel || "-";
  });

  if (data.temperature.available) {
    animateNumber(tempValue, data.temperature.celsius, 1);
    tempMeta.textContent = "Sensor aktiv";
  } else {
    tempValue.textContent = "--";
    tempMeta.textContent = "Sensor nicht verfuegbar";
  }

  updateTimestamp();
}

async function fetchStats() {
  try {
    const response = await fetch("/api/stats", { cache: "no-store" });
    if (!response.ok) throw new Error("bad response");
    const data = await response.json();
    updateUi(data);
  } catch (error) {
    statusValue.textContent = "Keine Verbindung";
  }
}

refresh.addEventListener("click", () => {
  fetchStats();
});

updateTimestamp();
fetchStats();
setInterval(fetchStats, 10000);

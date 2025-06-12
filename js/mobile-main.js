let chart, candleSeries, currentSymbol = "", currentInterval = "1H";
let lastCandleTime = null;
let latestCandles = [];
let lastPriceLine = null;

function getPrecision(val) {
  if (val >= 1000) return 2;
  if (val >= 100) return 3;
  if (val >= 1) return 4;
  if (val >= 0.01) return 6;
  if (val >= 0.0001) return 8;
  return 10;
}

function convertToDisplaySymbol(instId) {
  return instId;
}

async function fetchSymbolList() {
  const url = "https://www.okx.com/api/v5/public/instruments?instType=SWAP";
  const res = await fetch(url);
  const data = await res.json();
  return data.data
    .filter(i => i.instId.endsWith("-USDT-SWAP"))
    .map(i => i.instId);
}

async function fetchKlines(instId, bar) {
  const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=999999`;
  const res = await fetch(url);
  const json = await res.json();

  return json.data.reverse().map(([ts, o, h, l, c]) => {
    const end = Math.floor(ts / 1000);
    let time = end;

    if (bar === "6H") {
      const twOffset = 8 * 3600;
      const interval = 6 * 3600;
      const twEnd = end + twOffset;
      const aligned = Math.floor((twEnd - 8 * 3600) / interval) * interval + 8 * 3600;
      time = aligned - twOffset;
    }

    return {
      time,
      open: parseFloat(o),
      high: parseFloat(h),
      low: parseFloat(l),
      close: parseFloat(c)
    };
  });
}

async function fetchLatestPrice(instId) {
  const url = `https://www.okx.com/api/v5/market/ticker?instId=${instId}`;
  const res = await fetch(url);
  const json = await res.json();
  return parseFloat(json.data[0].last);
}

export async function loadChart() {
  if (!currentSymbol) return;
  document.getElementById("statusText").innerText = "⏳ 載入中...";

  if (chart) chart.remove();

  chart = LightweightCharts.createChart(document.getElementById('chart'), {
    layout: { background: { color: '#111' }, textColor: '#fff' },
    grid: { vertLines: { color: '#333' }, horLines: { color: '#333' } },
    timeScale: {
      timeVisible: true,
      secondsVisible: false,
      borderColor: '#333',
      locale: 'zh-TW'
    },
    priceScale: { borderColor: '#555' },
    localization: {
      locale: 'zh-TW',
      timeFormatter: (timestamp) => {
        const d = new Date(timestamp * 1000);
        const weekday = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'][d.getDay()];
        const yyyy = d.getFullYear();
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const HH = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${weekday} ${yyyy}-${MM}-${dd} ${HH}:${mm}`;
      }
    }
  });

  candleSeries = chart.addCandlestickSeries({
    upColor: '#26a69a', downColor: '#ef5350',
    borderUpColor: '#26a69a', borderDownColor: '#ef5350',
    wickUpColor: '#26a69a', wickDownColor: '#ef5350'
  });

  const candles = await fetchKlines(currentSymbol, currentInterval);
  if (!candles.length) {
    document.getElementById("statusText").innerText = "❌ 無法載入資料";
    return;
  }

  candleSeries.setData(candles);
  latestCandles = candles;
  lastCandleTime = candles[candles.length - 1].time;

  document.getElementById("statusText").innerText = `✅ ${currentSymbol.replace("-USDT-SWAP", "USDT.P")} - ${currentInterval} 載入成功`;

  attachCrosshairInfo();
}

async function autoUpdatePrice() {
  if (!chart || !candleSeries || !currentSymbol) return;
  try {
    const price = await fetchLatestPrice(currentSymbol);
    const now = Math.floor(Date.now() / 1000);

    if (lastCandleTime && latestCandles.length > 0) {
      const prev = latestCandles[latestCandles.length - 1];
      const isUp = price >= prev.open;
      const color = isUp ? '#26a69a' : '#ef5350';

      if (!lastPriceLine) {
        lastPriceLine = chart.addLineSeries({
          lineWidth: 0.1,
          priceLineVisible: true,
          lastValueVisible: true,
          crossHairMarkerVisible: false
        });
      }
      lastPriceLine.applyOptions({ color });
      lastPriceLine.setData([{ time: now, value: price }]);

      const updated = {
        time: lastCandleTime,
        open: prev.open,
        high: Math.max(prev.high, price),
        low: Math.min(prev.low, price),
        close: price
      };
      candleSeries.update(updated);
    }

    const precision = getPrecision(price);
    document.getElementById("infoSymbol").innerText = currentSymbol;
    document.getElementById("infoPrice").innerText = `價格：${price.toFixed(precision)}`;
    document.getElementById("infoTime").innerText = new Date().toLocaleTimeString();
  } catch (err) {}
}

function attachCrosshairInfo() {
  if (!chart || !candleSeries) return;

  chart.subscribeCrosshairMove(param => {
    const ohlcDiv = document.getElementById("ohlcInfo");
    const checkbox = document.getElementById("toggleOHLC");
    if (!param || !param.time || !param.seriesData) return;

    if (!checkbox.checked) {
      ohlcDiv.innerHTML = "";
      return;
    }

    const data = param.seriesData.get(candleSeries);
    if (!data) return;

    const precision = getPrecision(data.close);
    const o = data.open.toFixed(precision);
    const h = data.high.toFixed(precision);
    const l = data.low.toFixed(precision);
    const c = data.close.toFixed(precision);
    const change = (data.close - data.open).toFixed(precision);
    const pct = ((data.close - data.open) / data.open * 100).toFixed(2);
    const color = data.close >= data.open ? "#00ff00" : "#ff4444";

    ohlcDiv.innerHTML = `
      <span style="color:white">開=${o}</span>
      <span style="color:white; margin-left: 8px">高=${h}</span>
      <span style="color:white; margin-left: 8px">低=${l}</span>
      <span style="color:${color}; margin-left: 8px">收=${c} ${change} (${pct}%)</span>
    `;
  });
}

function attachEventListeners() {
  document.getElementById("symbolInput").addEventListener("change", () => {
    let val = document.getElementById("symbolInput").value.trim().toUpperCase();
    if (val.endsWith("USDT.P")) val = val.replace("USDT.P", "-USDT-SWAP");
    if (!val.endsWith("-USDT-SWAP")) return;
    currentSymbol = val;
    loadChart();
  });

  document.querySelectorAll("#intervalButtons button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#intervalButtons button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentInterval = btn.getAttribute("data-interval");
      loadChart();
    });
  });
}

async function initSymbolList() {
  const list = await fetchSymbolList();
  const datalist = document.getElementById("symbolList");
  list.forEach(symbol => {
    const opt = document.createElement("option");
    opt.value = symbol.replace("-USDT-SWAP", "USDT.P");
    datalist.appendChild(opt);
  });
}

attachEventListeners();
initSymbolList();
setInterval(autoUpdatePrice, 1000);

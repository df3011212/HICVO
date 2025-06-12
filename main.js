let latestPrice = null;
let currentSymbol = "";
let currentBar = "1H";
let latestCandles = [];
let useHeikinAshi = false;
let chartInitialized = false;

async function loadSymbols() {
  const url = "https://www.okx.com/api/v5/public/instruments?instType=SWAP";
  const res = await fetch(url);
  const data = await res.json();
  const symbols = data.data
    .filter(i => i.instId.endsWith("USDT-SWAP"))
    .map(i => i.instId.replace("-USDT-SWAP", "USDT.P"));

  const datalist = document.getElementById("symbolList");
  symbols.forEach(symbol => {
    const option = document.createElement("option");
    option.value = symbol;
    datalist.appendChild(option);
  });
}

function convertToInstId(symbol) {
  if (!symbol.endsWith("USDT.P")) return null;
  return symbol.replace("USDT.P", "-USDT-SWAP");
}

async function fetchCandles(symbol, bar) {
  const instId = convertToInstId(symbol);
  const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=100`;
  const res = await fetch(url);
  const data = await res.json();
  return data.data.map(item => ({
    time: new Date(Number(item[0])),
    open: parseFloat(item[1]),
    high: parseFloat(item[2]),
    low: parseFloat(item[3]),
    close: parseFloat(item[4])
  })).reverse();
}

function toHeikinAshi(data) {
  if (data.length === 0) return [];

  let haData = [];
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const close = (d.open + d.high + d.low + d.close) / 4;
    const open = i === 0
      ? (d.open + d.close) / 2
      : (haData[i - 1].open + haData[i - 1].close) / 2;
    const high = Math.max(d.high, open, close);
    const low = Math.min(d.low, open, close);
    haData.push({ time: d.time, open, high, low, close });
  }
  return haData;
}

async function updateRealtimePrice(symbol) {
  const instId = convertToInstId(symbol);
  if (!instId) return;

  try {
    const url = `https://www.okx.com/api/v5/market/ticker?instId=${instId}`;
    const res = await fetch(url);
    const data = await res.json();
    latestPrice = parseFloat(data.data[0].last);
    document.getElementById("realtimePrice").innerText =
      `${symbol} 現價：$${latestPrice.toLocaleString()}`;
    drawChart();
  } catch (e) {
    document.getElementById("realtimePrice").innerText = `❌ 無法取得即時價格`;
    console.error(e);
  }
}

function drawChart() {
  if (!latestPrice || latestCandles.length === 0) return;

  const candles = useHeikinAshi ? toHeikinAshi(latestCandles) : latestCandles;

  const candleTrace = {
    x: candles.map(c => c.time),
    open: candles.map(c => c.open),
    high: candles.map(c => c.high),
    low: candles.map(c => c.low),
    close: candles.map(c => c.close),
    type: 'candlestick',
    name: 'K 線',
    increasing: { line: { color: '#26a69a' }, fillcolor: '#26a69a' },
    decreasing: { line: { color: '#ef5350' }, fillcolor: '#ef5350' }
  };

  const priceLine = {
    type: "scatter",
    x: [candles[0].time, candles[candles.length - 1].time],
    y: [latestPrice, latestPrice],
    mode: "lines",
    line: { color: "#ccc", width: 1, dash: "dot" },
    hoverinfo: "skip",
    showlegend: false
  };

  const layout = {
    dragmode: "pan",
    xaxis: {
      title: '時間',
      rangeslider: { visible: false },
      gridcolor: "#333",
      fixedrange: false
    },
    yaxis: {
      title: '價格',
      side: "right",
      gridcolor: "#333",
      tickformat: ",.1f",
      nticks: 20,
      fixedrange: false
    },
    paper_bgcolor: "#111",
    plot_bgcolor: "#111",
    font: { color: "#eee" },
    showlegend: false,
    margin: { t: 30, b: 40, l: 50, r: 60 },
    hovermode: "x unified",
    annotations: [
    {
        xref: 'paper', // ❗ 讓它固定在畫面右側，而不是跟隨時間移動
        yref: 'y',
        x: 1,          // 貼齊右側（1 = 最右邊）
        y: latestPrice,
        xanchor: 'left',
        text: `$${latestPrice.toLocaleString()}`,
        showarrow: false,
        bgcolor: '#000',
        font: { color: '#fff' },
        borderpad: 4
    }
    ]

  };

  const config = {
    responsive: true,
    scrollZoom: true,
    dragmode: "pan",
    displaylogo: false,
    modeBarButtonsToAdd: ['zoom2d', 'pan2d', 'autoScale2d']
  };

  if (!chartInitialized) {
    Plotly.newPlot('chart', [candleTrace, priceLine], layout, config);
    
    chartInitialized = true;
  } else {
    Plotly.update('chart', {
      x: [candleTrace.x, priceLine.x],
      open: [candleTrace.open],
      high: [candleTrace.high],
      low: [candleTrace.low],
      close: [candleTrace.close],
      y: [null, priceLine.y]
    });

    Plotly.relayout('chart', {
      'annotations[0].x': candles[candles.length - 1].time,
      'annotations[0].y': latestPrice,
      'annotations[0].text': `$${latestPrice.toLocaleString()}`
    });
  }
}

async function loadCandle() {
  const symbol = document.getElementById("symbolInput").value.trim().toUpperCase();
  if (!symbol.endsWith("USDT.P")) {
    alert("請輸入幣種（如 BTCUSDT.P）");
    return;
  }

  try {
    currentSymbol = symbol;
    latestCandles = await fetchCandles(symbol, currentBar);
    await updateRealtimePrice(symbol);
  } catch (e) {
    alert("❌ 抓取資料失敗，請確認幣種與格式正確");
    console.error(e);
  }
}

function setIntervalBar(bar) {
  currentBar = bar;
  loadCandle();

  // 切換按鈕樣式
  ["15m", "1H", "2H", "3H", "4H", "6H", "1D"].forEach(b => {
    const btn = document.getElementById(`btn-${b}`);
    if (btn) btn.classList.remove("active-button");
  });
  const activeBtn = document.getElementById(`btn-${bar}`);
  if (activeBtn) activeBtn.classList.add("active-button");
}


function toggleHa() {
  useHeikinAshi = true;
  drawChart();
}

function setToNormalCandle() {
  useHeikinAshi = false;
  drawChart();
}

setInterval(() => {
  if (currentSymbol.endsWith("USDT.P")) {
    updateRealtimePrice(currentSymbol);
  }
}, 1000);

window.loadCandle = loadCandle;
window.toggleHa = toggleHa;
window.setToNormalCandle = setToNormalCandle;
window.setIntervalBar = setIntervalBar;

loadSymbols();

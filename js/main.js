// main.js 最上方加
const isMobilePage = location.pathname.includes("mobile.html");
const isDesktopPage = location.pathname.includes("desktop.html");
document.getElementById("chart").style.height = isMobilePage ? "320px" : "500px";


let chart, candleSeries, currentSymbol = "", currentInterval = "1H";
let lastCandleTime = null;
let latestCandles = [];
let lastPriceLine = null;



// 直接覆蓋原本整段 -----------------------------
function detectCandlePatterns(candles, lookback = 10) {
  const markers = [];
  const start = Math.max(candles.length - lookback, 2); // 至少2根起跳
  const isBull = (c) => c.close > c.open;
  const isBear = (c) => c.close < c.open;
  const bodySize = (c) => Math.abs(c.close - c.open);
  const range = (c) => c.high - c.low;

  for (let i = start; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = candles[i];

    const prev = c1;
    const curr = c2;

    // === 吞噬 ===
    const bullishEngulf =
      isBear(prev) && isBull(curr) &&
      curr.open <= prev.close && curr.close >= prev.open;

    const bearishEngulf =
      isBull(prev) && isBear(curr) &&
      curr.open >= prev.close && curr.close <= prev.open;

    // === 平頭 ===
    const flatBottom = isBull(prev) && isBull(curr) &&
      Math.abs(prev.low - curr.low) < range(curr) * 0.1;

    const flatTop = isBear(prev) && isBear(curr) &&
      Math.abs(prev.high - curr.high) < range(curr) * 0.1;

    // === 星形 ===
    const morningStar = isBear(c0) && Math.abs(c1.close - c1.open) < range(c1) * 0.2 && isBull(c2) &&
      c2.close > (c0.open + c0.close) / 2;

    const eveningStar = isBull(c0) && Math.abs(c1.close - c1.open) < range(c1) * 0.2 && isBear(c2) &&
      c2.close < (c0.open + c0.close) / 2;

    // === 三線 ===
    const threeWhiteSoldiers =
      isBull(candles[i - 3]) && isBull(candles[i - 2]) && isBull(candles[i - 1]) &&
      candles[i - 3].close < candles[i - 2].close &&
      candles[i - 2].close < candles[i - 1].close;

    const threeBlackCrows =
      isBear(candles[i - 3]) && isBear(candles[i - 2]) && isBear(candles[i - 1]) &&
      candles[i - 3].close > candles[i - 2].close &&
      candles[i - 2].close > candles[i - 1].close;

    // === 二陰一陽、二陽一陰 ===
    const twoBearOneBull = isBear(candles[i - 2]) && isBear(candles[i - 1]) && isBull(candles[i]);
    const twoBullOneBear = isBull(candles[i - 2]) && isBull(candles[i - 1]) && isBear(candles[i]);

    // === 十字星、影線型態（單K） ===
    const realBody = bodySize(curr);
    const upperShadow = curr.high - Math.max(curr.open, curr.close);
    const lowerShadow = Math.min(curr.open, curr.close) - curr.low;
    const isDoji = realBody < range(curr) * 0.1;
    const isHammer = lowerShadow > realBody * 2 && upperShadow < realBody;
    const isInvertedHammer = upperShadow > realBody * 2 && lowerShadow < realBody;
    const isShootingStar = upperShadow > realBody * 2 && lowerShadow < realBody && isBear(curr);
    const isGravestone = upperShadow > realBody * 2 && lowerShadow < range(curr) * 0.1 && isDoji;
    const isDragonfly = lowerShadow > realBody * 2 && upperShadow < range(curr) * 0.1 && isDoji;

    // === 標記判斷 ===
    const mark = (name, position, color) => {
      markers.push({
        time: curr.time,
        position,
        color,
        shape: position === 'belowBar' ? 'arrowUp' : 'arrowDown',
        text: name
      });
    };

    if (bullishEngulf) mark("多頭吞噬", "belowBar", "#26a69a");
    if (bearishEngulf) mark("空頭吞噬", "aboveBar", "#ef5350");

    if (flatBottom) mark("平頭底部", "belowBar", "#26a69a");
    if (flatTop) mark("平頭頂部", "aboveBar", "#ef5350");

    if (morningStar) mark("早晨之星", "belowBar", "#26a69a");
    if (eveningStar) mark("黃昏之星", "aboveBar", "#ef5350");

    if (threeWhiteSoldiers) mark("三綠兵", "belowBar", "#26a69a");
    if (threeBlackCrows) mark("三烏鴉", "aboveBar", "#ef5350");

    if (twoBearOneBull) mark("二陰一陽", "belowBar", "#26a69a");
    if (twoBullOneBear) mark("二陽一陰", "aboveBar", "#ef5350");

    if (isDoji) mark("十字星", "aboveBar", "#999");
    if (isHammer) mark("錘頭線", "belowBar", "#26a69a");
    if (isInvertedHammer) mark("倒錘線", "belowBar", "#26a69a");
    if (isShootingStar) mark("流星", "aboveBar", "#ef5350");
    if (isGravestone) mark("墓碑線", "aboveBar", "#ef5350");
    if (isDragonfly) mark("T字線", "belowBar", "#26a69a");
  }

  return markers;
}

// 將價格分箱以取得「密集度」—— step 代表箱寬 (預設 0.5% 價差)
function getDenseLevels(prices, entryPrice, direction = "long", stepPct = 0.005) {
  const step = entryPrice * stepPct;
  const bins = {};

  prices.forEach(p => {
    // 只統計「上方壓力」或「下方支撐」
    if (direction === "long" && p <= entryPrice) return;
    if (direction === "short" && p >= entryPrice) return;

    const key = Math.round(p / step) * step;   // 依 step 分箱
    bins[key] = (bins[key] || 0) + 1;
  });

  // 依次數排序取前三
  return Object.entries(bins)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)                 // 取 top3
    .map(([price, freq]) => ({ price: parseFloat(price), freq }));
}

// 方便格式化 TP 行
function fmt(price, precision) {
  return price.toFixed(precision);
}



// === 智慧判讀：最後一根形態 + 理由 =========================
function generateAISuggestion(candles, markers) {
  if (!candles.length) return "尚無價格資料";

  /* ——— 0. 盤整偵測 ——— */
  if (!markers.length) {
    const last10 = candles.slice(-10);
    const hi = Math.max(...last10.map(c => c.high));
    const lo = Math.min(...last10.map(c => c.low));
    const pct = ((hi - lo) / lo) * 100;
    if (pct < 1.2) return "📉 價格進入盤整，建議觀望。";
    return "目前無明顯型態，建議觀察。";
  }

  /* ——— 1. 基本資訊 ——— */
  const lastMarker = markers.at(-1);
  const pattern = lastMarker.text;
  const timeStr = new Date(lastMarker.time * 1000).toLocaleString("zh-TW", { hour12: false });

  const bullKW = ["多", "兵", "Hammer", "錘", "早晨", "三綠"];
  const bearKW = ["空", "烏鴉", "流星", "墓", "黃昏", "三烏"];
  let bias = "觀望";
  if (bullKW.some(k => pattern.includes(k))) bias = "偏多";
  else if (bearKW.some(k => pattern.includes(k))) bias = "偏空";

  const explain = {
    "多頭吞噬": "買盤蠶食前根空頭整體區間，常見強勢反轉。",
    "空頭吞噬": "賣壓完全包覆多頭實體，留意下跌延伸。",
    "早晨之星": "連續空頭後出現星線＋長多方實體，可能見底反轉。",
    "黃昏之星": "連續多頭後出現星線＋長空方實體，警示轉弱。",
    "三綠兵":   "連三根長多方實體，動能續強。",
    "三烏鴉":   "連三根長空方實體，動能續弱。",
    "錘頭線":   "下影線顯著，低檔買盤撐盤跡象。",
    "流星":     "上影線顯著，追高買盤乏力。"
  };
  const reason = explain[pattern] ?? "常見反轉／續航形態出現，留意後續量價配合。";

  /* ——— 2. 核心價格資料 ——— */
  const lastCandle = candles.at(-1);
  const entry = lastCandle.close;
  const prec  = getPrecision(entry);

  let out = `🧠 最新 K 棒（${timeStr}）偵測到「${pattern}」，判斷：${bias}。\n📌 原因：${reason}`;

  // 需要足夠歷史 K (≥220) 才做密集區統計
  if (candles.length < 221) return out + "\n⚠️ 歷史資料不足，暫無出場建議。";

  /* ——— 3. 多頭邏輯 ——— */
  if (bias === "偏多") {
    const support = candles.at(-2).open;
    const risk = entry - support;
    const upPct = (risk / support) * 100;

    if (upPct > 4) {
      return out + `\n⚠️ 已上漲 ${upPct.toFixed(2)}%，短線追高風險高，建議等待回踩。`;
    }

    // ‣ 取最近 220 根高點做密集區
    const highs220 = candles.slice(-221, -1).map(c => c.high);
    const dense = getDenseLevels(highs220, entry, "long"); // top3

    // RR 目標
    const tpRR = entry + risk * 2;

    out += `\n✅ 建議買入價位：約 ${fmt(entry, prec)} ` +
           `\n   停損點：${fmt(support, prec)} ` +
           `\n🎯 分批目標價（出場區間）：`;

    dense.forEach((d, idx) => {
      out += `\n   ▸ TP${idx + 1}：${fmt(d.price, prec)}（高點密集 ${d.freq} 次）`;
    });
    out += `\n   ▸ TP${dense.length + 1}：${fmt(tpRR, prec)}（RR 1:2）`;
  }

  /* ——— 4. 空頭邏輯 ——— */
  if (bias === "偏空") {
    const resistance = candles.at(-2).open;
    const risk = resistance - entry;
    const downPct = (risk / resistance) * 100;

    if (downPct > 4) {
      return out + `\n⚠️ 價格已急跌 ${downPct.toFixed(2)}%，不建議追空。`;
    }

    // ‣ 取最近 220 根低點做密集區
    const lows220 = candles.slice(-221, -1).map(c => c.low);
    const dense = getDenseLevels(lows220, entry, "short"); // top3

    const tpRR = entry - risk * 2;

    out += `\n🔻 建議賣出價位：約 ${fmt(entry, prec)} ` +
           `\n   停損點：${fmt(resistance, prec)} ` +
           `\n🎯 分批目標價（回補區間）：`;

    dense.forEach((d, idx) => {
      out += `\n   ▸ TP${idx + 1}：${fmt(d.price, prec)}（低點密集 ${d.freq} 次）`;
    });
    out += `\n   ▸ TP${dense.length + 1}：${fmt(tpRR, prec)}（RR 1:2）`;
  }

  return out;
}




function getTargetPrice(candles, entryPrice, risk, direction = "long") {
  const rrTarget = direction === "long"
    ? entryPrice + risk * 2
    : entryPrice - risk * 2;

  const slice = candles.slice(-6, -1);
  const techTarget = direction === "long"
    ? Math.max(...slice.map(c => c.high))
    : Math.min(...slice.map(c => c.low));

  const gapPct = direction === "long"
    ? ((techTarget - entryPrice) / entryPrice) * 100
    : ((entryPrice - techTarget) / entryPrice) * 100;

  if (gapPct < 1.0) return rrTarget; // 技術位太近則回退用 RR
  return direction === "long"
    ? Math.min(rrTarget, techTarget)
    : Math.max(rrTarget, techTarget);
}





function getPrecision(val) {
  if (val >= 1000) return 2;
  if (val >= 100) return 3;
  if (val >= 1) return 4;
  if (val >= 0.01) return 6;
  if (val >= 0.0001) return 8;
  return 10;
}

function convertToDisplaySymbol(instId) {
  return instId.replace("-USDT-SWAP", "USDT.P");
}

function convertToInstId(displaySymbol) {
  return displaySymbol.replace("USDT.P", "-USDT-SWAP");
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
  if (bar !== '6H') {
    const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=300`;
    const res = await fetch(url);
    const json = await res.json();
    return json.data.reverse().map(([ts, o, h, l, c]) => ({
      time: Math.floor(ts / 1000),
      open: parseFloat(o),
      high: parseFloat(h),
      low: parseFloat(l),
      close: parseFloat(c)
    }));
  }

  const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1H&limit=300`;
  const res = await fetch(url);
  const json = await res.json();
  const oneHourCandles = json.data.reverse().map(([ts, o, h, l, c]) => ({
    time: Math.floor(ts / 1000),
    open: parseFloat(o),
    high: parseFloat(h),
    low: parseFloat(l),
    close: parseFloat(c)
  }));

  const grouped = [];
  for (let i = 0; i < oneHourCandles.length; i++) {
    const candle = oneHourCandles[i];
    const date = new Date(candle.time * 1000);
    const utcHour = date.getUTCHours();
    const alignedHour = utcHour - (utcHour % 6);
    const alignedDate = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      alignedHour
    ));
    const groupKey = alignedDate.getTime() / 1000;

    if (!grouped.length || grouped[grouped.length - 1].time !== groupKey) {
      grouped.push({
        time: groupKey,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      });
    } else {
      const last = grouped[grouped.length - 1];
      last.high = Math.max(last.high, candle.high);
      last.low = Math.min(last.low, candle.low);
      last.close = candle.close;
    }
  }

  return grouped;
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
    timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#333', locale: 'zh-TW' },
    priceScale: { borderColor: '#555' },
    localization: {
      locale: 'zh-TW',
      timeFormatter: ts => {
        const d = new Date(ts * 1000);
        const wd = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'][d.getDay()];
        const pad = n => String(n).padStart(2, '0');
        return `${wd} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
  });

  candleSeries = chart.addCandlestickSeries({
    upColor: '#26a69a', downColor: '#ef5350',
    borderUpColor: '#26a69a', borderDownColor: '#ef5350',
    wickUpColor: '#26a69a', wickDownColor: '#ef5350'
  });

  let candles = await fetchKlines(currentSymbol, currentInterval);
  if (!candles.length) {
    document.getElementById("statusText").innerText = "❌ 無法載入資料";
    return;
  }

  // ── Heikin-Ashi 選項 ───────────────────────
  if (document.getElementById("toggleHA")?.checked) {
    const ha = [];
    for (let i = 0; i < candles.length; i++) {
      const prev = ha[i - 1] ?? candles[i];
      const haClose = (candles[i].open + candles[i].high + candles[i].low + candles[i].close) / 4;
      const haOpen  = (prev.open + prev.close) / 2;
      ha.push({
        time:  candles[i].time,
        open:  haOpen,
        high:  Math.max(candles[i].high, haOpen, haClose),
        low:   Math.min(candles[i].low,  haOpen, haClose),
        close: haClose
      });
    }
    candles = ha;
  }

  // ── ① 畫 K 棒 ─────────────────────────────
  candleSeries.setData(candles);

  // ── ② 蠟燭形態標記 ────────────────────────
  let markers = [];
  if (document.getElementById("togglePattern")?.checked) {
    markers = detectCandlePatterns(candles);
    candleSeries.setMarkers(markers);
  } else {
    candleSeries.setMarkers([]);
  }

  // ── ③ 更新狀態與游標資訊 ──────────────────
  latestCandles   = candles;
  lastCandleTime  = candles.at(-1).time;
  document.getElementById("statusText").innerText =
    `✅ ${convertToDisplaySymbol(currentSymbol)} - ${currentInterval} 載入成功`;
  attachCrosshairInfo();

  // ── ✅ 智慧判讀：形態建議文字區塊 ─────────────
  const suggestion = generateAISuggestion(candles, markers);
  const box = document.getElementById("aiSuggestionBox");
  const text = document.getElementById("aiSuggestionText");
  if (text && box) {
    text.innerText = suggestion;
    box.style.display = markers.length ? "block" : "none";
  }
}



async function autoUpdatePrice() {
  if (!chart || !candleSeries || !currentSymbol) return;

  try {
    const price = await fetchLatestPrice(currentSymbol);
    const now = Math.floor(Date.now() / 1000);
    const useHA = document.getElementById("toggleHA")?.checked;

    const isUp = latestCandles.length > 0 && price >= latestCandles[latestCandles.length - 1].open;
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

    // --- 重新偵測最新 10 根 (含正在形成的那根) ---
    let markers = [];
    if (document.getElementById("togglePattern")?.checked) {
      const tempCandles = [...latestCandles];
      if (!useHA && tempCandles.length > 0) {
        tempCandles[tempCandles.length - 1] = {
          ...tempCandles.at(-1),
          high: Math.max(tempCandles.at(-1).high, price),
          low: Math.min(tempCandles.at(-1).low,  price),
          close: price
        };
      }
      markers = detectCandlePatterns(tempCandles);
      candleSeries.setMarkers(markers); // 顯示最新標記
    }

    // === 🧠 AI 智慧判讀更新段落（放在 pattern 更新之後） ===
    const suggestion = generateAISuggestion(latestCandles, markers);
    const box = document.getElementById("aiSuggestionBox");
    const text = document.getElementById("aiSuggestionText");
    if (text && box) {
      text.innerText = suggestion;
      box.style.display = markers.length ? "block" : "none";
    }

    // --- 更新最後一根 K 棒收盤價（非 HA 模式） ---
    if (!useHA && lastCandleTime && latestCandles.length > 0) {
      const prev = latestCandles[latestCandles.length - 1];
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
    document.getElementById("infoSymbol").innerText = convertToDisplaySymbol(currentSymbol);
    document.getElementById("infoPrice").innerText = `價格：${price.toFixed(precision)}`;
    document.getElementById("infoTime").innerText = new Date().toLocaleTimeString();
  } catch (err) {
    console.error("❌ 更新價格錯誤：", err);
  }
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
    if (val.endsWith("USDT.P")) val = convertToInstId(val);
    if (!val.endsWith("-USDT-SWAP")) return;
    currentSymbol = val;
    loadChart();
  });

  document.getElementById("toggleHA").addEventListener("change", () => {
    loadChart();
  });

  document.getElementById("togglePattern").addEventListener("change", (e) => {
    loadChart();
    document.getElementById("patternGuide").style.display = e.target.checked ? "block" : "none";
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
    opt.value = convertToDisplaySymbol(symbol);
    datalist.appendChild(opt);
  });
}




attachEventListeners();
initSymbolList();
setInterval(autoUpdatePrice, 1000);
// main.js 最上方加
const isMobilePage = location.pathname.includes("mobile.html");
const isDesktopPage = location.pathname.includes("desktop.html");
document.getElementById("chart").style.height = isMobilePage ? "320px" : "500px";


let chart, candleSeries, currentSymbol = "", currentInterval = "1H";
let lastCandleTime = null;
let latestCandles = [];
let lastPriceLine = null;
let tpLineObjects = [];
let macdChart, macdLine, signalLine, histSeries;



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

function getDenseLevels(prices, entryPrice, direction = "long", stepPct = 0.005, keep = 3) {
  if (!Array.isArray(prices) || !prices.length) return [];
  if (!isFinite(entryPrice) || entryPrice <= 0) return [];

  const step = Math.max(entryPrice * stepPct, 0.01);  // ⚠️ 最小步幅設定為 0.01
  const bins = Object.create(null);

  for (const p of prices) {
    if (!isFinite(p) || p <= 0) continue;             // ⚠️ 過濾異常資料
    if (direction === "long" && p <= entryPrice) continue;
    if (direction === "short" && p >= entryPrice) continue;

    const key = Math.round(p / step) * step;
    bins[key] = (bins[key] || 0) + 1;
  }

  return Object.entries(bins)
    .sort((a, b) => b[1] - a[1])
    .slice(0, keep)
    .map(([price, freq]) => ({
      price: parseFloat(price),
      freq
    }))
    .filter(p => p.price >= 0.01);  // ⚠️ TP 小於 0.01 不要畫
}




// 方便格式化 TP 行
function fmt(price, precision) {
  return price.toFixed(precision);
}



// === 智慧判讀：最後一根形態 + 理由 =========================
function generateAISuggestion(candles, markers) {
  if (!candles.length) return "尚無價格資料";

  // === 基本變數 ===
  const latest     = candles.at(-1);          // 最新一根
  const prev       = candles.at(-2) ?? latest;
  const precision  = getPrecision(latest.close);
  const entry      = latest.close;            // 直接用市價
  const timeStr    = new Date(latest.time * 1000)
                      .toLocaleString("zh-TW", { hour12: false });

  // === 近 3 根型態 → 多型態判定（>=2 同向才算） ===
  const rawPatterns = markers.slice(-3)       // 取最近 3 筆標記
                     .map(m => m?.text)
                     .filter(Boolean);

  const biasMap = {
    "多頭吞噬": "偏多",   "空頭吞噬": "偏空",   "早晨之星": "偏多", "黃昏之星": "偏空",
    "三綠兵":   "偏多",   "三烏鴉":   "偏空",   "錘頭線":   "偏多", "流星":     "偏空",
    "墓碑線":   "偏空",   "T字線":   "偏多",   "倒錘線":   "偏多", "二陰一陽": "偏多",
    "二陽一陰": "偏空",   "十字星":   "觀察",   "平頭頂部": "偏空", "平頭底部": "偏多"
  };

  let bull = 0, bear = 0;
  rawPatterns.forEach(p => {
    const dir = biasMap[p] ?? "觀察";
    if (dir === "偏多") bull++;
    if (dir === "偏空") bear++;
  });

  let bias = "觀察";
  if (bear >= 2) bias = "偏空";
  else if (bull >= 2) bias = "偏多";

  // === MACD 動能 ===
  const macd     = calcMACD(candles);
  const mNow     = macd.at(-1), mPrev = macd.at(-2);
  const macdUp   = mNow.macd > mNow.signal && mNow.macd > mPrev.macd;
  const macdSide = mNow.macd >= 0 ? "多方動能" : "空方動能";

  // === K 棒實體百分比（>1.2% 才算有力道） ===
  const bodyPct   = Math.abs(latest.close - latest.open) /
                    ((latest.open + latest.close) / 2);
  const bodyStrong = bodyPct > 0.012;

  // === 是否為有效進場條件 ===
  const isValidSetup =
    (bias === "偏多" && macdUp && bodyStrong) ||
    (bias === "偏空" && !macdUp && bodyStrong);

  // === 停損（距離 >=4.5%；不足則用 4.5%） ===
  let rawSL;
  if (bias === "偏多") {
    const need = entry * 0.955;            // 下方 4.5%
    rawSL = Math.min(prev.low, need);
  } else if (bias === "偏空") {
    const need = entry * 1.045;            // 上方 4.5%
    rawSL = Math.max(prev.high, need);
  } else {
    rawSL = bias === "觀察" ? entry : prev.high;
  }
  const stopLoss = Number(rawSL.toFixed(precision));

  // === 風險 / RR 目標 ===
  const risk     = Math.abs(entry - stopLoss);
  const rrTarget = bias === "偏多" ? entry + risk * 2 : entry - risk * 2;

  // === 近 220 根高低點 → TP 密集區搜尋（沿用原函式 getDenseLevels） ===
  const highsOrLows = bias === "偏多"
    ? candles.slice(-221, -1).map(c => c.high)
    : candles.slice(-221, -1).map(c => c.low);

  const dense = getDenseLevels(highsOrLows, entry, bias === "偏多" ? "long" : "short");
  window.aiTpLines = dense.map((d, i) => ({
    price: d.price,
    label: `TP${i + 1}`,
    color: "yellow"
  }));
  window.aiTpLines.push({
    price : rrTarget,
    label : `TP${dense.length + 1} (RR)`,
    color : "yellow"
  });

  // === 追高警示 ===
  const lastHigh = Math.max(...candles.slice(-10).map(c => c.high));
  const chasing  = bias === "偏多" && entry > lastHigh * 0.995;

  // === 組合輸出 ===
  let out = `${bias === "觀察" ? "⚠️ 判斷：觀察" : (bias === "偏多" ? "📈 判斷：偏多" : "📉 判斷：偏空")}\n`;
  out += `📌 形態：${rawPatterns.length ? `「${rawPatterns.join("、")}」` : "無明顯形態"}\n`;
  out += `🔍 MACD：${macdSide}（${macdUp ? "上升" : "下降"}）\n`;

  // 若無形態或不符合動能條件
  if (!rawPatterns.length) return out + `⚠️ 未偵測到明確形態，建議觀察即可。`;
  if (!isValidSetup)      return out + `⚠️ 雖有形態，但動能不足或實體過小，不建議操作。`;

  // === 有效進場訊號 ===
  out += `📌 建議價格：${entry.toFixed(precision)}（市價進場）\n`;
  out += `⛔ 停損位置：${stopLoss.toFixed(precision)}\n`;
  out += `🎯 分批出場：`;
  window.aiTpLines.forEach(tp => {
    out += `\n   ▸ ${tp.label}：${tp.price.toFixed(precision)}`;
  });

  if (bias === "偏空") {
    out += `\n🧭 建議：已形成空方結構，若已有空單可續抱。`;
    out += `\n📌 壓力區：${(entry + risk).toFixed(precision)} 附近`;
  } else if (bias === "偏多") {
    out += `\n🧭 建議：等待回測或突破確認再進場，勿追高。`;
  }

  if (chasing) {
    out += `\n⚠️ 價格接近前高，小心追高風險。`;
  }

  return out;
}


/* =========================================================
   📌 1. 這段貼在工具函式區
   ========================================================= */
function getZoneLines(candles) {
  // 至少 50 根才分析，太少不準
  if (!candles || candles.length < 50) return [];

  const recent = candles.slice(-80);         // 取最近 80 根
  const highs  = recent.map(c => c.high);
  const lows   = recent.map(c => c.low);

  // 近 15 根最高/最低當成壓力 / 支撐
  const resistance = Math.max(...highs.slice(-15));
  const support    = Math.min(...lows.slice(-15));

  return [
    { price: resistance, label: "🔺 壓力區", color: "#ff6666" },
    { price: support,    label: "🔻 支撐區", color: "#66ccff" }
  ];
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



/* ---------- 取代原整個 loadChart ---------- */
export async function loadChart() {
  if (!currentSymbol) return;
  document.getElementById('statusText').innerText = '⏳ 載入中…';

  /* === 前置清理 === */
  if (chart) chart.remove();
  if (macdChart) macdChart.remove();
  tpLineObjects.forEach(l => l?.remove?.());
  tpLineObjects = [];

  /* === 讀取 UI 狀態 === */
  const macdHeight = parseInt(document.getElementById("macdHeightSelect")?.value || 140);
  const useIdentity = document.getElementById("toggleMACDIdentity")?.checked;   // 🆕
  
  /* === 主圖 (蠟燭) === */
  chart = LightweightCharts.createChart(
    document.getElementById('chart'),
    {
      layout:{ background:{ color:'#111' }, textColor:'#fff' },
      grid  :{ vertLines:{ color:'#333' }, horLines:{ color:'#333' } },
      timeScale:{ timeVisible:true, borderColor:'#333', locale:'zh-TW' },
      priceScale:{ borderColor:'#555' },
      localization:{
        locale:'zh-TW',
        timeFormatter:ts=>{
          const d=new Date(ts*1000);
          const pad=n=>String(n).padStart(2,'0');
          const wd=['週日','週一','週二','週三','週四','週五','週六'][d.getDay()];
          return `${wd} ${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
      }
    }
  );

  candleSeries = chart.addCandlestickSeries({
    upColor:'#26a69a', downColor:'#ef5350',
    borderUpColor:'#26a69a', borderDownColor:'#ef5350',
    wickUpColor:'#26a69a',  wickDownColor:'#ef5350'
  });

  /* === 下載 K 線 === */
  let candles = await fetchKlines(currentSymbol, currentInterval);
  if (!candles.length){
    document.getElementById('statusText').innerText = '❌ 無法載入資料';
    return;
  }

  /* Heikin-Ashi (可選) */
  if (document.getElementById('toggleHA')?.checked){
    const ha=[];
    for (let i=0;i<candles.length;i++){
      const p=ha[i-1]??candles[i];
      const c=(candles[i].open+candles[i].high+candles[i].low+candles[i].close)/4;
      const o=(p.open+p.close)/2;
      ha.push({
        time:candles[i].time,
        open:o,
        high:Math.max(candles[i].high,o,c),
        low :Math.min(candles[i].low ,o,c),
        close:c
      });
    }
    candles=ha;
  }
  candleSeries.setData(candles);

  /* 蠟燭形態 */
  const mks = document.getElementById('togglePattern')?.checked ? detectCandlePatterns(candles):[];
  candleSeries.setMarkers(mks);

  latestCandles=candles;
  lastCandleTime=candles.at(-1).time;
  document.getElementById('statusText').innerText = `✅ ${convertToDisplaySymbol(currentSymbol)} - ${currentInterval} 載入成功`;
  attachCrosshairInfo();

  /* === 建立 MACD 子圖 (高度依 macdHeight) === */
  macdChart = LightweightCharts.createChart(
    document.getElementById('macd'),
    {
      height: macdHeight,
      layout:{ background:{ color:'#111' }, textColor:'#fff' },
      grid  :{ vertLines:{ color:'#333' }, horLines:{ color:'#333' } },
      timeScale:{ visible:true, borderColor:'#333' },
      rightPriceScale:{ borderColor:'#555' }
    }
  );

  /* === 共用的三條 series === */
  histSeries = macdChart.addHistogramSeries({
    priceFormat:{ type:'price', precision:4 },
    priceLineVisible:false, lastValueVisible:false
  });
  macdLine   = macdChart.addLineSeries({
    color:'#2196f3', lineWidth:1,
    priceLineVisible:false, lastValueVisible:false
  });
  signalLine = macdChart.addLineSeries({
    color:'#ffa726', lineWidth:1,
    priceLineVisible:false, lastValueVisible:false
  });

  /* === 計算 MACD 數據 === */
  const macdArr = calcMACD(candles);
  histSeries.setData(macdArr.map(d=>({ time:d.time,value:d.hist,color:d.hist>=0?'#26a69a':'#ef5350' })));
  macdLine  .setData(macdArr.map(d=>({ time:d.time,value:d.macd })));
  signalLine.setData(macdArr.map(d=>({ time:d.time,value:d.signal })));

  /* === 身分版判斷 (交叉 / Peak / Trough) === */
  if (useIdentity){
    const markers = [];

    /* 1. DIF & SIGNAL 穿越 0 軸 */
    for (let i=1;i<macdArr.length;i++){
      const p=macdArr[i-1], c=macdArr[i];
      // Signal
      if (p.signal<0 && c.signal>=0) markers.push({ time:c.time,position:'aboveBar',shape:'triangleUp',  color:'orange',text:'Sig↑0' });
      if (p.signal>0 && c.signal<=0) markers.push({ time:c.time,position:'belowBar',shape:'triangleDown',color:'orange',text:'Sig↓0' });
      // DIF
      if (p.macd<0 && c.macd>=0) markers.push({ time:c.time,position:'aboveBar',shape:'triangleUp',  color:'blue',text:'DIF↑0' });
      if (p.macd>0 && c.macd<=0) markers.push({ time:c.time,position:'belowBar',shape:'triangleDown',color:'blue',text:'DIF↓0' });
    }

    /* 2. Peak / Trough + 連線 */
    const L=3,R=3;         // pivot 左右寬度
    let lastH=null,lastL=null;
    for (let i=L;i<macdArr.length-R;i++){
      const m=macdArr[i];
      const leftMax = Math.max(...macdArr.slice(i-L,i+1).map(e=>e.macd));
      const rightMax= Math.max(...macdArr.slice(i,i+R+1).map(e=>e.macd));
      const leftMin = Math.min(...macdArr.slice(i-L,i+1).map(e=>e.macd));
      const rightMin= Math.min(...macdArr.slice(i,i+R+1).map(e=>e.macd));

      // Peak (綠)
      if (m.macd===leftMax && m.macd===rightMax){
        markers.push({ time:m.time,position:'aboveBar',shape:'circle',color:'#11fd00',text:'H' });
        if (lastH && m.macd<lastH.v){
          macdChart.addLineSeries({ color:'#00ff08',lineWidth:2,priceLineVisible:false,lastValueVisible:false })
                   .setData([{time:lastH.t,value:lastH.v},{time:m.time,value:m.macd}]);
        }
        lastH={t:m.time,v:m.macd};
      }
      // Trough (黃)
      if (m.macd===leftMin && m.macd===rightMin){
        markers.push({ time:m.time,position:'belowBar',shape:'circle',color:'#ff0000',text:'L' });
        if (lastL && m.macd>lastL.v){
          macdChart.addLineSeries({ color:'#f8ff3b',lineWidth:2,priceLineVisible:false,lastValueVisible:false })
                   .setData([{time:lastL.t,value:lastL.v},{time:m.time,value:m.macd}]);
        }
        lastL={t:m.time,v:m.macd};
      }
    }

    macdLine.setMarkers(markers);   // 一次設定
  } else {
    macdLine.setMarkers([]);        // 一般版不顯示身分標記
  }

  /* === 主圖 → 子圖 單向同步 === */
  const range = chart.timeScale().getVisibleLogicalRange();
  if (range) macdChart.timeScale().setVisibleLogicalRange(range);
  chart.timeScale().subscribeVisibleLogicalRangeChange(r=>{
    if (r) macdChart.timeScale().setVisibleLogicalRange(r);
  });

  /* === 其他：AI TP 計算、拖拉重算（保持原寫法） === */
  updateSuggestionAndTPLines(candles);

  let deb;
  chart.timeScale().subscribeVisibleTimeRangeChange(r=>{
    clearTimeout(deb);
    deb=setTimeout(()=>{
      if (!r||r.from===undefined||r.to===undefined) return;
      const vis=candles.filter(c=>c.time>=Math.floor(r.from)&&c.time<=Math.floor(r.to));
      if (vis.length>=10){
        updateSuggestionAndTPLines(vis);
        document.getElementById('statusText').innerText=`🔄 已重算 TP（視窗內 ${vis.length} 根 K）`;
      }else{
        document.getElementById('statusText').innerText=`⚠️ 畫面 K 僅 ${vis.length} 根，少於 10 根不重算 TP`;
      }
    },300);
  });
}







function calcEMA(vals, p){const k=2/(p+1);const out=[];vals.forEach((v,i)=>{out.push(i? v*k+out[i-1]*(1-k):v);});return out;}
function calcMACD(c, f=12, s=26, sig=9){
  const closes=c.map(x=>x.close);
  const emaF=calcEMA(closes,f);
  const emaS=calcEMA(closes,s);
  const macd=closes.map((_,i)=>emaF[i]-emaS[i]);
  const signal=calcEMA(macd,sig);
  const hist=macd.map((m,i)=>m-signal[i]);
  return c.map((k,i)=>({ time:k.time, macd:macd[i], signal:signal[i], hist:hist[i] }));
}



function updateSuggestionAndTPLines(allCandles) {
  const markers = document.getElementById("togglePattern")?.checked
    ? detectCandlePatterns(allCandles)
    : [];

  const suggestion = generateAISuggestion(allCandles, markers);
  const box  = document.getElementById("aiSuggestionBox");
  const text = document.getElementById("aiSuggestionText");
  if (text && box) {
    text.innerText = suggestion;
    box.style.display = markers.length ? "block" : "none";
  }

  // 先清除所有舊線（TP線 + 壓力/支撐線）
  tpLineObjects.forEach(obj => obj?.remove?.());
  tpLineObjects = [];


  // === 1️⃣ 畫出 TP 建議線 ===
  if (window.aiTpLines && Array.isArray(window.aiTpLines)) {
    const firstTime = allCandles[0]?.time ?? allCandles.at(-1).time - 86400;
    const lastTime  = allCandles.at(-1)?.time;

    window.aiTpLines.forEach(tp => {
      const series = chart.addLineSeries({
        lineWidth: 2,
        color: tp.color || 'yellow',
        priceLineVisible: false,
        lastValueVisible: false
      });
      series.setData([
        { time: firstTime, value: tp.price },
        { time: lastTime,  value: tp.price }
      ]);
      tpLineObjects.push(series);

      const label = chart.addPriceLine({
        price: tp.price,
        color: tp.color || 'yellow',
        lineWidth: 2,
        axisLabelVisible: true,
        title: tp.label || 'TP'
      });
      tpLineObjects.push(label);
    });
  }

  // === 2️⃣ 畫出自動偵測的支撐與壓力區 ===
  const zoneLines = getZoneLines(allCandles);
  zoneLines.forEach(z => {
    const series = chart.addLineSeries({
      lineWidth: 1,
      color: z.color,
      priceLineVisible: false,
      lastValueVisible: false
    });
    series.setData([
      { time: allCandles[0].time,     value: z.price },
      { time: allCandles.at(-1).time, value: z.price }
    ]);
    tpLineObjects.push(series);

    const label = chart.addPriceLine({
      price: z.price,
      color: z.color,
      lineWidth: 1,
      axisLabelVisible: true,
      title: z.label
    });
    tpLineObjects.push(label);
  });
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
  /* === 幣種輸入框 === */
  document.getElementById("symbolInput").addEventListener("change", () => {
    let val = document.getElementById("symbolInput").value.trim().toUpperCase();
    if (val.endsWith("USDT.P")) val = convertToInstId(val);
    if (!val.endsWith("-USDT-SWAP")) return;
    currentSymbol = val;
    loadChart();
  });

  /* === 平均 K (HA) 切換 === */
  document.getElementById("toggleHA").addEventListener("change", () => loadChart());

  /* === 蠟燭形態切換 === */
  document.getElementById("togglePattern").addEventListener("change", e => {
    loadChart();
    document.getElementById("patternGuide").style.display = e.target.checked ? "block" : "none";
  });

  /* === MACD 高度下拉選單 === */
  const macdHeightSelect = document.getElementById("macdHeightSelect");
  if (macdHeightSelect) {
    macdHeightSelect.addEventListener("change", () => loadChart());
  }

  /* === 🧠 身分版 MACD 開關 === */
  const idChk = document.getElementById("toggleMACDIdentity");
  if (idChk) {
    idChk.addEventListener("change", () => loadChart());
  }

  /* === 時間週期按鈕 === */
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

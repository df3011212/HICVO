// 📁 js/main2.js

// 將按鈕移出 HTML，並在 JS 裡動態加入與綁定事件
function createReloadButton() {
  const btn = document.createElement('button');
  btn.innerText = '🔄 網頁強制清除快取 重新整理';
  btn.style.cssText = `
    margin: 12px 0;
    background-color: #444;
    color: #fff;
    border: none;
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 15px;
    text-align: center;
    box-sizing: border-box;
    display: inline-block;
  `;

  btn.addEventListener('click', () => {
    const confirmed = confirm("⚠️ 確定要強制重新整理此頁面？\n這將清除所有快取並重新載入。");
    if (confirmed) {
      location.reload(true);
    }
  });

  // 插在輸入框下方（不論裝置大小都一樣）
  const symbolInput = document.getElementById('symbolInput');
  symbolInput.insertAdjacentElement('afterend', btn);
}

document.addEventListener('DOMContentLoaded', createReloadButton);

import type { GeoGebraAPI } from '../components/GeoGebraApplet';

export function downloadGGB(api: GeoGebraAPI, filename: string = 'mathall_project.ggb') {
  try {
     const base64 = api.getBase64();
     if (!base64) {
       throw new Error('画板内容为空');
     }
     const raw = window.atob(base64);
     const rawLength = raw.length;
     const array = new Uint8Array(new ArrayBuffer(rawLength));
     for(let i = 0; i < rawLength; i++) {
       array[i] = raw.charCodeAt(i);
     }
     const blob = new Blob([array], {type: 'application/vnd.geogebra.file'});
     downloadBlob(blob, filename);
  } catch(e) {
     console.error("GGB Export Failed", e);
     throw new Error("GGB 导出失败或画板尚未加载完毕");
  }
}

export interface ProjectState {
  problemText: string;
  tag: string;
  aiCode: string;
  htmlContent: string;
  rendererMode: 'GEOGEBRA' | 'HTML_CANVAS' | null;
  ggbBase64: string | null;
}

export function downloadProjectJSON(state: ProjectState, filename: string = 'mathall_state.json') {
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  downloadBlob(blob, filename);
}

export function exportToHTML(ggbBase64: string, ggbAppName: 'classic' | '3d' | 'geometry', problemText: string, imagesBase64: string[], ggbCode: string, aiCode: string) {
  // Generate problem content HTML
  let problemHTML = '';
  if (problemText) {
    problemHTML += `<p style="white-space: pre-wrap;">${escapeHtml(problemText)}</p>`;
  }
  if (imagesBase64.length > 0) {
    problemHTML += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; margin-top: 15px;">';
    imagesBase64.forEach((img, idx) => {
      problemHTML += `<img src="${img}" alt="题目图片-${idx + 1}" style="width: 100%; border-radius: 8px; border: 1px solid #ddd;">`;
    });
    problemHTML += '</div>';
  }
  if (!problemText && imagesBase64.length === 0) {
    problemHTML = '<p style="color: #999;">无题目内容</p>';
  }

  // aiCode 是 Markdown 原文，直接塞进 HTML 会破坏结构（甚至注入脚本），
  // 这里转义后用 pre-wrap 保留换行
  const aiSection = aiCode
    ? `<div style="white-space: pre-wrap;">${escapeHtml(aiCode)}</div>`
    : '<p style="color:#999;">无 AI 分析内容</p>';

  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MathAll 导出</title>
  <script src="https://www.geogebra.org/apps/deployggb.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 { color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px; }
    h2 { color: #059669; margin-top: 30px; }
    pre {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
      border: 1px solid #ddd;
    }
    code {
      font-family: "JetBrains Mono", "Fira Code", "Consolas", monospace;
      font-size: 0.9em;
    }
    .section {
      margin-bottom: 30px;
      padding: 20px;
      background: #fafafa;
      border-radius: 8px;
      border: 1px solid #e5e5e5;
    }
    .ggb-wrapper {
      display: flex;
      gap: 20px;
      align-items: flex-start;
    }
    #ggb-container {
      flex: 1;
      height: 600px;
      border: 1px solid #ddd;
      border-radius: 8px;
    }
    #slider-panel {
      width: 280px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 15px;
      max-height: 600px;
      overflow-y: auto;
    }
    #slider-panel h3 {
      margin: 0 0 15px 0;
      font-size: 1rem;
      color: #059669;
    }
    .slider-control {
      margin-bottom: 20px;
    }
    .slider-control label {
      display: block;
      font-weight: 500;
      margin-bottom: 5px;
      font-size: 0.9rem;
    }
    .slider-control input[type="range"] {
      width: 100%;
      margin: 5px 0;
    }
    .slider-control .value-display {
      text-align: center;
      font-size: 0.85rem;
      color: #666;
      background: #f5f5f5;
      padding: 4px 8px;
      border-radius: 4px;
    }
    img {
      max-width: 100%;
      border-radius: 8px;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <h1>MathAll 数学分析导出</h1>

  <div class="section">
    <h2>原始题目</h2>
    ${problemHTML}
  </div>

  <div class="section">
    <h2>GeoGebra 画板</h2>
    <div class="ggb-wrapper">
      <div id="ggb-container"></div>
      <div id="slider-panel">
        <h3>参数控制</h3>
        <div id="sliders-container"></div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>GGB 代码</h2>
    <pre><code>${escapeHtml(ggbCode || '无 GGB 代码')}</code></pre>
  </div>

  <div class="section">
    <h2>AI 分析</h2>
    ${aiSection}
  </div>

  <footer style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666;">
    <p>由 MathAll 生成 - ${new Date().toLocaleString('zh-CN')}</p>
  </footer>

  <script>
    var ggbApp;
    var params = {
      appName: "${ggbAppName}",
      width: document.getElementById('ggb-container').offsetWidth,
      height: 600,
      showToolBar: true,
      showAlgebraInput: true,
      showMenuBar: true,
      enableShiftDragZoom: true,
      enableRightClick: true,
      showResetIcon: true,
      ggbBase64: ${JSON.stringify(ggbBase64)},
      appletOnLoad: function(api) {
        ggbApp = api;
        try { initSliders(api); } catch (e) { console.warn('init sliders failed', e); }
      }
    };

    function initSliders(api) {
      var slidersContainer = document.getElementById('sliders-container');
      var allObjects = api.getAllObjectNames();
      var sliders = [];

      // Find all sliders
      for (var i = 0; i < allObjects.length; i++) {
        var objName = allObjects[i];
        var objType = api.getObjectType(objName);
        if (objType === 'numeric' && (!api.isMoveable || api.isMoveable(objName))) {
          sliders.push(objName);
        }
      }

      if (sliders.length === 0) {
        slidersContainer.innerHTML = '<p style="color: #999; font-size: 0.85rem;">无滑动条</p>';
        return;
      }

      // Create slider controls
      sliders.forEach(function(sliderName) {
        var min = api.getMinimum ? api.getMinimum(sliderName) : -5;
        var max = api.getMaximum ? api.getMaximum(sliderName) : 5;
        var value = api.getValue(sliderName);
        var increment = (api.getIncrement && api.getIncrement(sliderName)) || 0.1;
        if (!isFinite(min) || !isFinite(max) || min >= max) return;

        var controlDiv = document.createElement('div');
        controlDiv.className = 'slider-control';

        var label = document.createElement('label');
        label.textContent = sliderName;

        var slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = increment;
        slider.value = value;

        var valueDisplay = document.createElement('div');
        valueDisplay.className = 'value-display';
        valueDisplay.textContent = value.toFixed(2);

        slider.addEventListener('input', function() {
          var newValue = parseFloat(slider.value);
          api.setValue(sliderName, newValue);
          valueDisplay.textContent = newValue.toFixed(2);
        });

        // Listen to GeoGebra updates
        if (api.registerObjectUpdateListener) {
          api.registerObjectUpdateListener(sliderName, function() {
            var currentValue = api.getValue(sliderName);
            slider.value = currentValue;
            valueDisplay.textContent = currentValue.toFixed(2);
          });
        }

        controlDiv.appendChild(label);
        controlDiv.appendChild(slider);
        controlDiv.appendChild(valueDisplay);
        slidersContainer.appendChild(controlDiv);
      });
    }

    var applet = new GGBApplet(params, true);
    window.addEventListener('load', function() {
      applet.inject('ggb-container');
    });
  </script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  downloadBlob(blob, `mathall_export_${Date.now()}.html`);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立即 revoke 会让部分浏览器（Firefox / 部分移动端）把大文件的下载中断，
  // 留一帧时间让浏览器接管这个 URL
  setTimeout(() => window.URL.revokeObjectURL(url), 10_000);
}

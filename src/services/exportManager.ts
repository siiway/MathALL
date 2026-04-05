import type { GeoGebraAPI } from '../components/GeoGebraApplet';

export function downloadGGB(api: GeoGebraAPI, filename: string = 'mathall_project.ggb') {
  try {
     const base64 = api.getBase64();
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
     alert("GGB导出失败或画板尚未加载完毕。");
  }
}

export function downloadProjectJSON(state: any, filename: string = 'mathall_state.json') {
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  downloadBlob(blob, filename);
}

export function printToPDF() {
  window.print();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}

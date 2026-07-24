document.addEventListener("DOMContentLoaded", async () => {
  const btnScan = document.getElementById("btn-scan");
  const infoFreq = document.getElementById("info-frequency");
  const infoLastScan = document.getElementById("info-last-scan");
  const statusDesc = document.getElementById("status-desc");

  // Load settings from Chrome extension storage or local API
  chrome.storage.local.get(["captureSettings", "lastScanAt"], (data) => {
    const settings = data.captureSettings || {};
    const freqLabels = {
      manual: "Manual",
      "30m": "A cada 30 min",
      "1h": "A cada 1h",
      "3h": "A cada 3h",
      daily: "1x ao dia",
    };

    infoFreq.textContent = freqLabels[settings.scan_frequency] || "A cada 1h";

    if (data.lastScanAt) {
      const date = new Date(data.lastScanAt);
      infoLastScan.textContent = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } else {
      infoLastScan.textContent = "Nunca";
    }
  });

  btnScan.addEventListener("click", () => {
    btnScan.disabled = true;
    btnScan.textContent = "⌛ Escaneando WhatsApp Web...";

    chrome.runtime.sendMessage({ action: "TRIGGER_SCAN" }, (response) => {
      setTimeout(() => {
        btnScan.disabled = false;
        btnScan.textContent = "🔄 Disparar Varredura Agora";
        infoLastScan.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        statusDesc.textContent = "Varredura executada! As novas sugestões foram enviadas para a Caixa de Entrada.";
      }, 1500);
    });
  });
});

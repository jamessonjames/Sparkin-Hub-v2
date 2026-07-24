// Service Worker Background Script for Sparkin Hub Chrome Extension

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Sparkin Hub Extension] Instalada com sucesso!");
});

// Listen for messages from popup or web app
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TRIGGER_SCAN") {
    console.log("[Sparkin Hub] Disparando varredura manual no WhatsApp Web...");

    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "RUN_WHATSAPP_SCAN" }, (response) => {
          sendResponse({ status: "success", data: response });
        });
      } else {
        sendResponse({ status: "error", message: "Aba do WhatsApp Web não está aberta." });
      }
    });

    chrome.storage.local.set({ lastScanAt: new Date().toISOString() });
    return true;
  }
});

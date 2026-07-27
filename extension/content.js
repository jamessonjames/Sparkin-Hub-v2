// Content Script running inside web.whatsapp.com
const SPARKIN_API_URL = window.location.origin.includes("localhost") 
  ? "http://localhost:8080/api/public/capture" 
  : "/api/public/capture"; // Path-based for same-origin if possible, but actually we need absolute for cross-origin

// Note: In production, the extension should point to the correct Lovable project URL.
// We'll use a placeholder that the user can replace or we can try to detect.
const PRODUCTION_URL = "https://sparkinhub-v2.lovable.app/api/public/capture";

console.log("[Sparkin Hub] Content Script ativo e monitorando WhatsApp Web...");

// Cache to avoid sending same message multiple times
const processedMessages = new Set();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "RUN_WHATSAPP_SCAN") {
    const extractedData = scanActiveChats();
    if (extractedData.length > 0) sendToSparkinHub(extractedData);
    sendResponse({ count: extractedData.length, items: extractedData });
  }
});

function scanActiveChats() {
  const results = [];
  try {
    const chatElements = Array.from(document.querySelectorAll("div[role='listitem']"));
    
    chatElements.forEach((el) => {
      const nameEl = el.querySelector("span[title]");
      const msgEl = el.querySelector("span[class*='_ao3e']") || el.querySelector("span[title]");
      
      if (nameEl) {
        const clientName = nameEl.getAttribute("title");
        const lastMsg = msgEl ? msgEl.textContent : "";
        const msgId = `${clientName}-${lastMsg.substring(0, 20)}`;
        
        if (lastMsg && lastMsg.trim().length > 0 && !processedMessages.has(msgId)) {
          results.push({
            source: "whatsapp",
            clientName,
            content: lastMsg,
            timestamp: new Date().toISOString(),
            metadata: {
              isGroup: !!el.querySelector("span[data-icon='group']"),
              type: "text"
            }
          });
          processedMessages.add(msgId);
          // Keep cache small
          if (processedMessages.size > 1000) processedMessages.clear();
        }
      }
    });
  } catch (err) {
    console.error("[Sparkin Hub] Erro na leitura:", err);
  }
  return results;
}

async function sendToSparkinHub(data) {
  for (const item of data) {
    try {
      await fetch(SPARKIN_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      });
    } catch (err) {
      console.error("[Sparkin Hub] Erro ao enviar:", err);
    }
  }
}

// REAL-TIME MONITORING: Observe changes in the chat list
const observer = new MutationObserver((mutations) => {
  let shouldScan = false;
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      shouldScan = true;
      break;
    }
  }
  if (shouldScan) {
    const data = scanActiveChats();
    if (data.length > 0) sendToSparkinHub(data);
  }
});

const chatList = document.querySelector("div[aria-label='Lista de conversas']") || document.body;
observer.observe(chatList, { childList: true, subtree: true });

// PERIODIC CLEANUP
setInterval(() => processedMessages.clear(), 30 * 60 * 1000);



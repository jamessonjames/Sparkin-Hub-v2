// Content Script running inside web.whatsapp.com

console.log("[Sparkin Hub] Content Script ativo no WhatsApp Web.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "RUN_WHATSAPP_SCAN") {
    console.log("[Sparkin Hub] Iniciando varredura no WhatsApp Web...");
    
    // Extract recent unread or active chat messages safely from DOM
    const extractedData = scanActiveChats();
    sendResponse({ count: extractedData.length, items: extractedData });
  }
});

function scanActiveChats() {
  const results = [];
  try {
    // Select chat elements on WhatsApp Web
    const chatElements = Array.from(document.querySelectorAll("div[role='listitem']"));
    
    chatElements.forEach((el) => {
      const nameEl = el.querySelector("span[title]");
      const timeEl = el.querySelector("div[class*='_ak8i']") || el.querySelector("span:nth-child(2)");
      const msgEl = el.querySelector("span[class*='_ao3e']") || el.querySelector("span[title]");
      
      if (nameEl) {
        const clientName = nameEl.getAttribute("title");
        const lastMsg = msgEl ? msgEl.textContent : "";
        results.push({
          clientName,
          lastMessage: lastMsg,
          timestamp: new Date().toISOString(),
        });
      }
    });
  } catch (err) {
    console.error("[Sparkin Hub] Erro na leitura de chats:", err);
  }

  return results;
}

// Content Script running inside web.whatsapp.com
const SPARKIN_API_URL = "http://localhost:8080/api/public/capture"; // In production, this would be the actual domain

console.log("[Sparkin Hub] Content Script ativo no WhatsApp Web.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "RUN_WHATSAPP_SCAN") {
    console.log("[Sparkin Hub] Iniciando varredura no WhatsApp Web...");
    
    const extractedData = scanActiveChats();
    
    // Auto-send to backend if data found
    if (extractedData.length > 0) {
      sendToSparkinHub(extractedData);
    }

    sendResponse({ count: extractedData.length, items: extractedData });
  }
});

function scanActiveChats() {
  const results = [];
  try {
    // Select chat elements on WhatsApp Web - selectors may need updates as WA changes
    const chatElements = Array.from(document.querySelectorAll("div[role='listitem']"));
    
    chatElements.forEach((el) => {
      const nameEl = el.querySelector("span[title]");
      // WhatsApp Web often uses these classes for message previews
      const msgEl = el.querySelector("span[class*='_ao3e']") || el.querySelector("span[title]");
      
      if (nameEl) {
        const clientName = nameEl.getAttribute("title");
        const lastMsg = msgEl ? msgEl.textContent : "";
        
        // Only capture if there is a message
        if (lastMsg && lastMsg.trim().length > 0) {
          results.push({
            source: "whatsapp",
            clientName,
            content: lastMsg,
            timestamp: new Date().toISOString(),
            metadata: {
              isGroup: !!el.querySelector("span[data-icon='group']"),
              rawHtml: el.innerHTML.substring(0, 100) // Small snippet for debugging selectors
            }
          });
        }
      }
    });
  } catch (err) {
    console.error("[Sparkin Hub] Erro na leitura de chats:", err);
  }

  return results;
}

async function sendToSparkinHub(data) {
  console.log(`[Sparkin Hub] Enviando ${data.length} conversas para o servidor...`);
  
  for (const item of data) {
    try {
      const response = await fetch(SPARKIN_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      });
      
      const result = await response.json();
      if (result.success) {
        console.log(`[Sparkin Hub] Captura enviada: ${item.clientName}`);
      } else {
        console.warn(`[Sparkin Hub] Falha ao enviar ${item.clientName}:`, result.error);
      }
    } catch (err) {
      console.error("[Sparkin Hub] Erro na rede ao enviar captura:", err);
    }
  }
}

// Optional: Auto-scan every 5 minutes if tab is active
setInterval(() => {
  if (!document.hidden) {
    console.log("[Sparkin Hub] Varredura periódica automática...");
    const data = scanActiveChats();
    if (data.length > 0) sendToSparkinHub(data);
  }
}, 5 * 60 * 1000);


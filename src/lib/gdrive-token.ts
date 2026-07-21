let tokenClient: any = null;
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function ensureGISLoaded(): Promise<void> {
  if (typeof google !== "undefined" && google.accounts?.oauth2) return;
  await new Promise<void>((resolve) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

export async function getGDriveAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;
  await ensureGISLoaded();
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive",
      callback: (response: any) => {
        if (response.access_token) {
          cachedToken = response.access_token;
          tokenExpiry = Date.now() + (response.expires_in || 3600) * 1000;
        }
      },
    });
  }
  return new Promise<string>((resolve, reject) => {
    const orig = tokenClient.callback;
    tokenClient.callback = (response: any) => {
      orig(response);
      if (response.access_token) resolve(response.access_token);
      else reject(new Error(response.error || "Falha ao obter token do Google"));
    };
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

export async function connectGDrive(): Promise<{ accessToken: string; email: string }> {
  await ensureGISLoaded();
  return new Promise((resolve, reject) => {
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive",
      callback: async (response: any) => {
        if (response.access_token) {
          cachedToken = response.access_token;
          tokenExpiry = Date.now() + (response.expires_in || 3600) * 1000;
          try {
            const info = await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
              headers: { Authorization: `Bearer ${response.access_token}` },
            })).json();
            resolve({ accessToken: response.access_token, email: info.email || "Desconhecido" });
          } catch {
            resolve({ accessToken: response.access_token, email: "Desconhecido" });
          }
        } else {
          reject(new Error(response.error || "Falha ao conectar Google Drive"));
        }
      },
    });
    tc.requestAccessToken();
  });
}

export function clearGDriveToken() {
  cachedToken = null;
  tokenExpiry = 0;
  tokenClient = null;
}

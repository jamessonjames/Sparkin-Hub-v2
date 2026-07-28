let tokenClient: any = null;
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function ensureGISLoaded(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (typeof (window as any).google !== "undefined" && (window as any).google.accounts?.oauth2) return;
  await new Promise<void>((resolve) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

const GOOGLE_CLIENT_ID = (typeof import.meta !== "undefined" && import.meta?.env?.VITE_GOOGLE_CLIENT_ID) || "794191743424-c912rov9fp3d14kahf5vtau5pef9fcmm.apps.googleusercontent.com";

export async function getGDriveAccessToken(): Promise<string> {
  if (typeof window === "undefined") throw new Error("Apenas no cliente.");
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;
  await ensureGISLoaded();
  if (!tokenClient) {
    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
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
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

export async function connectGDriveCode(): Promise<string> {
  if (typeof window === "undefined") throw new Error("Apenas no cliente.");
  await ensureGISLoaded();
  return new Promise((resolve, reject) => {
    const codeClient = (window as any).google.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email email",
      ux_mode: "popup",
      callback: (response: any) => {
        if (response.code) {
          resolve(response.code);
        } else if (response.error) {
          reject(new Error(response.error_description || response.error || "Falha ao obter código do Google Drive"));
        } else {
          reject(new Error("Autorização do Google cancelada ou não concluída."));
        }
      },
    });
    codeClient.requestCode();
  });
}

export async function connectGDrive(): Promise<{ accessToken: string; email: string }> {
  if (typeof window === "undefined") throw new Error("Apenas no cliente.");
  await ensureGISLoaded();
  return new Promise((resolve, reject) => {
    const tc = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email email",
      callback: async (response: any) => {
        if (response.access_token) {
          cachedToken = response.access_token;
          tokenExpiry = Date.now() + (response.expires_in || 3600) * 1000;
          let userEmail = "Desconhecido";
          try {
            // 1. Try Google Drive About API
            const driveAboutRes = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
              headers: { Authorization: `Bearer ${response.access_token}` },
            });
            if (driveAboutRes.ok) {
              const driveAbout = await driveAboutRes.json();
              if (driveAbout?.user?.emailAddress) {
                userEmail = driveAbout.user.emailAddress;
              }
            }
            if (userEmail === "Desconhecido") {
              // 2. Fallback to UserInfo API
              const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
                headers: { Authorization: `Bearer ${response.access_token}` },
              });
              if (infoRes.ok) {
                const info = await infoRes.json();
                if (info?.email) userEmail = info.email;
              }
            }
          } catch (e) {
            console.error("Error fetching user email from Google:", e);
          }
          resolve({ accessToken: response.access_token, email: userEmail });
        } else {
          reject(new Error(response.error || "Falha ao conectar Google Drive"));
        }
      },
    });
    tc.requestAccessToken({ prompt: "consent" });
  });
}

export function clearGDriveToken() {
  cachedToken = null;
  tokenExpiry = 0;
  tokenClient = null;
}

export function getFileIdFromUrl(url: string): string | null {
  if (!url) return null;
  // If it's a direct viewer link: https://lh3.googleusercontent.com/d/{fileId}
  if (url.includes("lh3.googleusercontent.com/d/")) {
    const parts = url.split("/d/");
    if (parts.length > 1) {
      return parts[1].split(/[?#]/)[0];
    }
  }
  // If it's a uc link: https://drive.google.com/uc?export=view&id={fileId}
  if (url.includes("drive.google.com/")) {
    try {
      const urlObj = new URL(url);
      const id = urlObj.searchParams.get("id");
      if (id) return id;
      // Or view link: https://drive.google.com/file/d/{fileId}/view
      if (url.includes("/file/d/")) {
        const parts = url.split("/file/d/");
        if (parts.length > 1) {
          return parts[1].split("/")[0];
        }
      }
    } catch {
      // Fallback regex
      const match = url.match(/[?&]id=([^&]+)/);
      if (match) return match[1];
    }
  }
  return null;
}

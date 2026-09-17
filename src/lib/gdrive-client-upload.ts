import { getOrCreateFolderPath, makeFilePublic } from "./gdrive.functions";

export async function uploadDirectToGDrive(
  file: File,
  pathParts: string[] = [],
  getGDriveTokenFn: () => Promise<{ success: boolean; accessToken?: string; rootFolderId?: string | null; error?: string }>
): Promise<{ success: boolean; fileId?: string; url?: string; error?: string }> {
  try {
    const tokenRes = await getGDriveTokenFn();
    if (!tokenRes.success || !tokenRes.accessToken) {
      throw new Error(tokenRes.error || "Google Drive não conectado.");
    }

    const { accessToken, rootFolderId } = tokenRes;
    const folderId = await getOrCreateFolderPath(accessToken, pathParts, rootFolderId || undefined);

    const boundary = "-------314159265358979323846";
    const metadata = {
      name: file.name,
      parents: [folderId],
    };

    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const fileHeaderPart = `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`;
    const closingPart = `\r\n--${boundary}--`;

    const metadataBlob = new Blob([metadataPart], { type: "text/plain" });
    const fileHeaderBlob = new Blob([fileHeaderPart], { type: "text/plain" });
    const closingBlob = new Blob([closingPart], { type: "text/plain" });

    const fullRequestBody = new Blob([metadataBlob, fileHeaderBlob, file, closingBlob]);

    let uploadRes: Response | null = null;
    let uploadErrText = "";

    // Retry multipart upload up to 2 times on network glitch or 5xx
    for (let uploadAttempt = 1; uploadAttempt <= 2; uploadAttempt++) {
      try {
        uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: fullRequestBody,
        });
        if (uploadRes.ok) break;
        uploadErrText = await uploadRes.text();
        console.warn(`[GoogleDrive] Tentativa de upload ${uploadAttempt} falhou (${uploadRes.status}):`, uploadErrText);
      } catch (networkErr: any) {
        uploadErrText = networkErr?.message || "Erro de rede";
        console.warn(`[GoogleDrive] Falha de conexão no upload (tentativa ${uploadAttempt}):`, uploadErrText);
      }

      if (uploadAttempt < 2) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    if (!uploadRes || !uploadRes.ok) {
      throw new Error(`Erro no Google Drive: ${uploadErrText || "Falha na resposta"}`);
    }

    const data = await uploadRes.json();
    const fileId = data.id;

    if (!fileId) {
      throw new Error("Não foi possível obter o ID do arquivo no Google Drive.");
    }

    // Guarantee that the file is publicly accessible to all users (prevent 403 / 404 for gestora/team)
    let isPublic = false;
    for (let permAttempt = 1; permAttempt <= 3; permAttempt++) {
      try {
        await makeFilePublic(accessToken, fileId);
        isPublic = true;
        break;
      } catch (permErr) {
        console.warn(`[GoogleDrive] Tentativa ${permAttempt} de permissão falhou:`, permErr);
        if (permAttempt < 3) {
          await new Promise((r) => setTimeout(r, permAttempt * 500));
        }
      }
    }

    if (!isPublic) {
      console.warn("[GoogleDrive] Não foi possível tornar arquivo público no Drive. Acionando contingência...");
      throw new Error("Arquivo enviado ao Drive, mas não foi possível garantir acesso público irrestrito.");
    }

    const viewUrl = file.type.startsWith("image/")
      ? `https://lh3.googleusercontent.com/d/${fileId}`
      : `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;

    return { success: true, fileId, url: viewUrl };
  } catch (error: any) {
    console.error("uploadDirectToGDrive error:", error);
    return { success: false, error: error.message || "Erro no upload direto para o Google Drive." };
  }
}

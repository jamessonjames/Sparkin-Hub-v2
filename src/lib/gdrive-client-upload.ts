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

    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: fullRequestBody,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro no Google Drive (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const fileId = data.id;

    if (!fileId) {
      throw new Error("Não foi possível obter o ID do arquivo no Google Drive.");
    }

    try {
      await makeFilePublic(accessToken, fileId);
    } catch (permErr) {
      console.warn("Aviso ao tornar arquivo público no Google Drive:", permErr);
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

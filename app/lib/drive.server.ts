import { google } from "googleapis";
import { Readable } from "stream";

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
}

export async function uploadImage(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("圖片不能超過 5MB");
  }

  const drive = google.drive({ version: "v3", auth: getAuth() });

  const file = await drive.files.create({
    requestBody: {
      name: filename,
      ...(FOLDER_ID ? { parents: [FOLDER_ID] } : {}),
    },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id",
  });

  const fileId = file.data.id!;

  await drive.permissions.create({
    fileId,
    requestBody: { type: "anyone", role: "reader" },
  });

  // Return thumbnail URL; view URL can be derived from fileId
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
}

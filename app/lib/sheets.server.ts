import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHEET_GID = process.env.GOOGLE_SHEET_GID
  ? parseInt(process.env.GOOGLE_SHEET_GID)
  : undefined;

export { CATEGORIES, type Category } from "./constants";

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

let cachedSheetName: string | null = null;
let cachedSheetId: number | null = null;

async function resolveSheet(): Promise<{ name: string; id: number }> {
  if (cachedSheetName && cachedSheetId !== null) {
    return { name: cachedSheetName, id: cachedSheetId };
  }
  const sheets = getSheets();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const allSheets = spreadsheet.data.sheets ?? [];

  let target = SHEET_GID !== undefined
    ? allSheets.find((s) => s.properties?.sheetId === SHEET_GID)
    : undefined;

  if (!target) {
    const envName = process.env.GOOGLE_SHEET_NAME;
    target = envName
      ? allSheets.find((s) => s.properties?.title === envName)
      : allSheets[0];
  }

  if (!target?.properties?.title || target.properties.sheetId == null) {
    const names = allSheets.map((s) => s.properties?.title).join(", ");
    throw new Error(`找不到對應的分頁。現有分頁：${names}`);
  }

  cachedSheetName = target.properties.title;
  cachedSheetId = target.properties.sheetId;
  return { name: cachedSheetName, id: cachedSheetId };
}

// Columns A–K:
// A=品項(中文) B=類型 C=日文 D=圖片 E=台灣價格 F=日本價格 G=購買狀態 H=數量 I=許願人 J=備註 K=參考連結
export interface ShoppingItem {
  id: string;
  name: string;
  category: string;
  nameJp: string;
  image: string;
  priceTw: string;
  priceJp: string;
  purchased: boolean;
  quantity: string;
  requester: string;
  notes: string;
  link: string;
}

export async function getItems(): Promise<ShoppingItem[]> {
  const { name } = await resolveSheet();
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${name}!A2:K`,
  });
  return (res.data.values ?? [])
    .filter((row) => row.some((c) => c?.toString().trim()))
    .map((row, index) => ({
      id: String(index),
      name: row[0] ?? "",
      category: row[1] ?? "",
      nameJp: row[2] ?? "",
      image: row[3] ?? "",
      priceTw: row[4] ?? "",
      priceJp: row[5] ?? "",
      purchased: row[6] === "TRUE",
      quantity: row[7] ?? "1",
      requester: row[8] ?? "",
      notes: row[9] ?? "",
      link: row[10] ?? "",
    }));
}

export async function addItem(data: Omit<ShoppingItem, "id" | "purchased">) {
  const { name } = await resolveSheet();
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${name}!A:K`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        data.name, data.category, data.nameJp, data.image,
        data.priceTw, data.priceJp, "FALSE",
        data.quantity, data.requester, data.notes, data.link,
      ]],
    },
  });
}

export async function togglePurchased(id: string, purchased: boolean) {
  const { name } = await resolveSheet();
  const sheets = getSheets();
  const rowNum = parseInt(id) + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${name}!G${rowNum}`,
    valueInputOption: "RAW",
    requestBody: { values: [[purchased ? "TRUE" : "FALSE"]] },
  });
}

export async function deleteItem(id: string) {
  const { name, id: sheetId } = await resolveSheet();
  const sheets = getSheets();
  const rowIndex = parseInt(id) + 1;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
        },
      }],
    },
  });
}

export async function setupSheet() {
  const { name, id: sheetId } = await resolveSheet();
  const sheets = getSheets();

  // Write headers (always ensure correct headers)
  const headers = ["品項(中文)", "類型", "日文", "圖片", "台灣價格", "日本價格", "購買狀態", "數量", "許願人", "備註", "參考連結"];
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${name}!A1:K1`,
  });
  const existingHeaders = existing.data.values?.[0] ?? [];
  if (JSON.stringify(existingHeaders) !== JSON.stringify(headers)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${name}!A1:K1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
  }

  // Set dropdown validation on column B (類型)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: 1,   // row 2 (0-indexed)
            endRowIndex: 1000,
            startColumnIndex: 1, // column B
            endColumnIndex: 2,
          },
          rule: {
            condition: {
              type: "ONE_OF_LIST",
              values: CATEGORIES.map((v) => ({ userEnteredValue: v })),
            },
            showCustomUi: true,
            strict: false,
          },
        },
      }],
    },
  });
}

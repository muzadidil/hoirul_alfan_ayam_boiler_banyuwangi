/**
 * ZASHA MUTASI - FINAL ENGINE (MULTI-FILE & DASHBOARD SUPPORT)
 */

const SPREADSHEET_MAP = {
  "DASHBOARD": "1qGbTlqmn6C3W3tIVhoBlOx2sea8uve76SWzVkD1ZsFw",
  "JAN_2023": "1e8Og97M5gTTlR7NUWk6YDLocZEZJg6ypCFLp_2mtl6w",
  "FEB_2023": "1Usdw8EMDpJBlDv1zkcteoj8tEgRmocNHuPmOeSm0s5Q",
  "MAR_2023": "14VmCTjGRZ4jkWWz2LcnttoLb-kaUPgo86bjOezQBlV4",
  "APR_2023": "1k6aOukMobmd-kJdoNI1uMNLSTH67-63xOByr2mlT7To",
  "MEI_2023": "1--0ZS9CxyYGA0moxG8xUiywvORuaMLbBDv3w3aSx-Og",
  "JUN_2023": "1JjCM1NiVYyoRVdG7XrbdLV5j4TxqhRcJ5dfISwsJbM4",
  "JUL_2023": "1HrDJRSKH7asVVlOGn4Op1MH4Rr8itXoJpVId6WGUERA",
  "AGU_2023": "11NzCKoEjr0JvWkTopOqkOxqi8yw3M1aAKzPnbsX3nfo",
  "SEP_2023": "1cA4rBuF5tSFYz1SbMBcJlIZBZ2Iy75jK3A9WReeHZew",
  "OKT_2023": "1kLaUw3mazHJr0c-BcP7JXPVSKmx54dH8JfgbwYZDaNo",
  "NOV_2023": "1W1z_Jz1FMdBB4DbqLI3QQfmLHBAAA1NEA2-iarT1F-c",
  "DES_2023": "1jLLM7RowyAlqW8_utve-PxKKawTbcRuWVtKmI2wg8Ww"
};

function doGet(e) {
  try {
    var page = e.parameter.p || "bank";
    var bulan = e.parameter.bulan || "DASHBOARD";
    var tmp = HtmlService.createTemplateFromFile('Index');

    tmp.url = ScriptApp.getService().getUrl();
    tmp.page = page;
    tmp.bulan = bulan;

    const judulMap = {
      "bank": "Informasi Mutasi", "pribadi": "Laporan Pribadi", "produksi": "Laporan Produksi",
      "kosong": "Kategori Kosong", "exspedisi": "Kategori Exspedisi", "v_sales": "Kategori V_Sales",
      "operasional": "Kategori Operasional", "nurul_aini": "Kategori Nurul Aini"
    };
    tmp.judul = judulMap[page] || "Dashboard Zasha";

    return tmp.evaluate()
        .setTitle(tmp.judul)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) { return HtmlService.createHtmlOutput("<b>Fatal Error:</b> " + err.message); }
}

function getDataFromSheet(page, bulan) {
  try {
    const fileId = SPREADSHEET_MAP[bulan];
    if (!fileId) return { error: "ID File untuk " + bulan + " belum dimasukkan ke Apps Script!", transactions: [], categories: [] };

    const ss = SpreadsheetApp.openById(fileId);

    if (bulan === "DASHBOARD") {
      const sheet = ss.getSheetByName("TOTAL");
      if (!sheet) return { error: "Sheet 'TOTAL' tidak ditemukan di file Dashboard!" };

      const values = sheet.getRange("A2:K13").getValues();
      const ringkasan = values.map(row => ({
        bulan: row[0], kosong: row[1], pribadi: row[2], produksi: row[3],
        exspedisi: row[4], v_sales: row[5], operasional: row[6], nurul_aini: row[7],
        debit: row[8], kredit: row[9], selisih: row[10]
      })).filter(row => row.bulan !== "");

      return { isDashboard: true, data: ringkasan };
    }

    const masterSheet = ss.getSheetByName(bulan);
    if (!masterSheet) return { error: "Tab '" + bulan + "' tidak ditemukan di dalam file!", transactions: [], categories: [] };

    const allValues = masterSheet.getDataRange().getValues();
    const categories = [...new Set(allValues.slice(1).map(row => row[8]).filter(val => val !== ""))];

    if (page === "pribadi") return { ...buildCategoryData(ss, bulan, "PRIBADI"), categories };
    if (page === "produksi") return { ...buildCategoryData(ss, bulan, "PRODUKSI"), categories };
    if (page === "kosong") return { ...getKosongData(ss, bulan), categories };
    if (page === "exspedisi") return { ...buildCategoryData(ss, bulan, "EXSPEDISI"), categories };
    if (page === "v_sales") return { ...buildCategoryData(ss, bulan, "V_SALES"), categories };
    if (page === "operasional") return { ...buildCategoryData(ss, bulan, "OPERASIONAL"), categories };
    if (page === "nurul_aini") return { ...buildCategoryData(ss, bulan, "NURUL_AINI"), categories };

    const bankValues = masterSheet.getDataRange().getValues();
    const bankData = bankValues.slice(1).map(row => ({ tanggal: formatDate(row[0]), keterangan: row[1], debet: row[3], kredit: row[4], saldo: row[6] }));
    return { data: bankData, categories };
  } catch (e) { return { error: "Server Error: " + e.toString() }; }
}

function getKosongData(ss, namaBulan) {
  const sheetRef = ss.getSheetByName("KOSONG");
  const total = sheetRef ? sheetRef.getRange("J1").getValue() : 0;
  const values = ss.getSheetByName(namaBulan).getDataRange().getValues();
  const filtered = values.slice(1).filter(row => row[3] && (row[8]||"").toString().trim() === "").map(row => ({
    baris: values.indexOf(row) + 1, tanggal: formatDate(row[0]), keterangan: row[2], nominal: row[3]
  }));
  return { transactions: filtered, total: total };
}

function buildCategoryData(ss, namaBulan, kategori) {
  const sheetRef = ss.getSheetByName(kategori);
  const total = sheetRef ? sheetRef.getRange("J1").getValue() : 0;
  const values = ss.getSheetByName(namaBulan).getDataRange().getValues();
  const filtered = values.slice(1).filter(row => row[3] && (row[8]||"").toString().toUpperCase() === kategori).map(row => ({
    baris: values.indexOf(row) + 1, tanggal: formatDate(row[0]), keterangan: row[2], nominal: row[3]
  }));
  return { transactions: filtered, total: total };
}

function updateBatchKategori(arrBaris, kategoriBaru, namaBulan, pageType) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_MAP[namaBulan]);
    const sheetMaster = ss.getSheetByName(namaBulan);
    arrBaris.forEach(baris => { sheetMaster.getRange(parseInt(baris), 9).setValue(kategoriBaru); });
    const sheetTujuan = ss.getSheetByName(pageType.toUpperCase());
    let newTotal = sheetTujuan ? sheetTujuan.getRange("J1").getValue() : 0;
    return { message: "Data berhasil dipindahkan", newTotal: newTotal };
  } catch (e) { return { error: e.toString() }; }
}

function formatDate(date) { return (date instanceof Date) ? Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM") : (date || "").toString(); }

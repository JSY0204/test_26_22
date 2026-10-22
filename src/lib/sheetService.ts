export interface RecordItem {
  rowIndex?: number;
  timestamp: string;
  name: string;
  finishtime: string;
  seconds?: number;
}

const FALLBACK_GAS_URL =
  "https://script.google.com/macros/s/AKfycbyj5CxqvmKzKq5K35iT3zZ3xsvCGpWZBEEe_i37xjeL1ajlu2GOYwAfJTJbb5u9CCNJXg/exec";

const LOCAL_STORAGE_KEY = "inu_brick_game_records";

function getGasUrl(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || FALLBACK_GAS_URL;
}

function getLocalRecords(): RecordItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalRecords(records: RecordItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error(e);
  }
}

// 일시 포맷팅
function formatTimestamp(raw: unknown): string {
  if (!raw) return "";
  const str = String(raw);
  if (str.includes("T") && str.endsWith("Z")) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`;
    }
  }
  return str;
}

/**
 * 구글 시트에서 넘어오는 다양한 finishtime 값을 초(seconds) 단위 및 MM:SS 형식으로 변환
 */
export function parseFinishTime(raw: unknown): { formatted: string; seconds: number } {
  if (!raw) return { formatted: "-", seconds: 999999 };
  const str = String(raw).trim();

  // 1) 1899-12-29T... 날짜 형식으로 넘어오는 구글 시트 시각 포맷 처리
  if (str.startsWith("1899-12-") || (str.includes("T") && str.endsWith("Z"))) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      // 분, 초 추출
      const mins = d.getMinutes();
      const secs = d.getSeconds();
      const totalSec = mins * 60 + secs;
      const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      return { formatted, seconds: totalSec };
    }
  }

  // 2) "01:25" 또는 "1:25" 등 mm:ss 형식
  if (str.includes(":")) {
    const parts = str.split(":");
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10) || 0;
      const secs = parseInt(parts[1], 10) || 0;
      const totalSec = mins * 60 + secs;
      const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      return { formatted, seconds: totalSec };
    } else if (parts.length === 3) {
      const mins = parseInt(parts[1], 10) || 0;
      const secs = parseInt(parts[2], 10) || 0;
      const totalSec = mins * 60 + secs;
      const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      return { formatted, seconds: totalSec };
    }
  }

  // 3) 숫자 초 단위 (예: 25)
  const num = parseInt(str, 10);
  if (!isNaN(num)) {
    const mins = Math.floor(num / 60);
    const secs = num % 60;
    const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return { formatted, seconds: num };
  }

  return { formatted: str, seconds: 999999 };
}

/**
 * 1. Read: 구글 시트 전체 목록 조회
 */
export async function fetchRecords(): Promise<RecordItem[]> {
  try {
    const res = await fetch("/api/records", { method: "GET", cache: "no-store" });
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      const normalized: RecordItem[] = json.data.map((item: Record<string, unknown>, idx: number) => {
        const timeParsed = parseFinishTime(item.finishtime);
        return {
          rowIndex: typeof item.rowIndex === "number" ? item.rowIndex : idx + 2,
          timestamp: formatTimestamp(item.timestamp),
          name: String(item.name || "익명"),
          finishtime: timeParsed.formatted,
          seconds: timeParsed.seconds,
        };
      });
      saveLocalRecords(normalized);
      return normalized;
    }
  } catch (err) {
    console.warn("fetchRecords 실패:", err);
  }

  return getLocalRecords();
}

/**
 * 2. Top3 랭킹 조회 (완료 시간이 가장 빠른 상위 3명)
 */
export async function fetchTop3Records(): Promise<RecordItem[]> {
  const all = await fetchRecords();
  // 시간이 유효한 데이터만 오름차순(빠른 순) 정렬
  const sorted = [...all]
    .filter((r) => r.seconds !== undefined && r.seconds > 0 && r.seconds < 999999)
    .sort((a, b) => (a.seconds || 999999) - (b.seconds || 999999));

  return sorted.slice(0, 3);
}

/**
 * 3. Create: 신규 기록 등록 (timestamp, name, finishtime)
 */
export async function createRecord(data: {
  name: string;
  finishtime: string;
}): Promise<boolean> {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  const payload = {
    action: "create",
    timestamp,
    name: data.name,
    finishtime: data.finishtime,
  };

  try {
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) return true;
  } catch (err) {
    console.warn("createRecord 실패:", err);
  }

  const current = getLocalRecords();
  const parsed = parseFinishTime(data.finishtime);
  const newRecord: RecordItem = {
    rowIndex: current.length + 2,
    timestamp,
    name: data.name,
    finishtime: parsed.formatted,
    seconds: parsed.seconds,
  };
  saveLocalRecords([newRecord, ...current]);
  return true;
}

/**
 * 4. Update: 기록 수정
 */
export async function updateRecord(item: {
  rowIndex: number;
  name: string;
  finishtime: string;
}): Promise<boolean> {
  const payload = {
    action: "update",
    rowIndex: item.rowIndex,
    name: item.name,
    finishtime: item.finishtime,
  };

  try {
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) return true;
  } catch (err) {
    console.warn("updateRecord 실패:", err);
  }

  const parsed = parseFinishTime(item.finishtime);
  const records = getLocalRecords().map((rec) => {
    if (rec.rowIndex === item.rowIndex) {
      return {
        ...rec,
        name: item.name,
        finishtime: parsed.formatted,
        seconds: parsed.seconds,
      };
    }
    return rec;
  });
  saveLocalRecords(records);
  return true;
}

/**
 * 5. Delete: 기록 삭제
 */
export async function deleteRecord(rowIndex: number): Promise<boolean> {
  const payload = {
    action: "delete",
    rowIndex,
  };

  try {
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) return true;
  } catch (err) {
    console.warn("deleteRecord 실패:", err);
  }

  const filtered = getLocalRecords().filter((rec) => rec.rowIndex !== rowIndex);
  saveLocalRecords(filtered);
  return true;
}

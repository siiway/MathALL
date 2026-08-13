/**
 * localStorage 安全封装。
 *
 * 浏览器在以下情况会让 localStorage 直接抛异常：
 *  - 隐私模式 / 禁用 Cookie（读写都抛 SecurityError）
 *  - 配额写满（图片 base64、GGB 状态很容易撑爆 5MB，抛 QuotaExceededError）
 *
 * 这些异常如果发生在 render 或 useEffect 里会直接白屏，所以这里统一兜底。
 */

type QuotaListener = (key: string) => void;

let quotaListener: QuotaListener | null = null;

/** 注册配额超限回调（用于给用户弹提示），同一时刻只保留一个。 */
export function onStorageQuotaExceeded(listener: QuotaListener | null) {
  quotaListener = listener;
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 写入失败返回 false（不会抛异常）。 */
export function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    // 配额写满时移除旧值，避免读到与内存不一致的过期数据
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    console.warn(`[storage] 写入 ${key} 失败:`, e);
    quotaListener?.(key);
    return false;
  }
}

export function removeStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** 读取 JSON，解析失败时返回 fallback 并清掉脏数据。 */
export function readJSON<T>(key: string, fallback: T): T {
  const raw = readStorage(key);
  if (raw === null || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    console.warn(`[storage] ${key} 内容损坏，已重置`);
    removeStorage(key);
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    return writeStorage(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** 读布尔开关（约定值为字符串 'true'）。 */
export function readBool(key: string, fallback = false): boolean {
  const raw = readStorage(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

/** 读整数，非法值回退到 fallback，并按 [min, max] 夹紧。 */
export function readInt(key: string, fallback: number, min = -Infinity, max = Infinity): number {
  const parsed = parseInt(readStorage(key) ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

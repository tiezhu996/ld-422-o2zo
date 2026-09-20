/**
 * 项目级互斥锁：结题门禁与实验记录审核必须串行化。
 *
 * 约定（fail-fast）：同一项目同一时刻只允许一个写事务（结题 / 审核）持有锁，
 * 第二个并发请求在持有方提交前立刻得到 409 PROJECT_BUSY，且双方在拿锁前
 * 都不做任何写入，因此失败方不会留下状态或日期残值。无第三方依赖。
 */
export class LockBusyError extends Error {
  constructor(public readonly key: string) {
    super(`项目 ${key} 正在被其他业务操作占用`);
    this.name = "LockBusyError";
  }
}

const heldKeys = new Set<string>();
const waiters = new Map<string, Array<() => void>>();

/** 是否已有持有方（仅供测试 / 诊断使用）。 */
export function isProjectLocked(key: string): boolean {
  return heldKeys.has(key);
}

/**
 * 在项目锁内执行一个原子任务：
 * 1. 拿不到锁立刻抛 LockBusyError，任务体不会执行；
 * 2. 任务体抛出的错误在释放后原样向上传播（结题被阻塞即此路径，全程零写入）；
 * 3. 任务正常结束（或抛出）后才放行同项目的下一个请求。
 */
export async function withProjectLock<T>(key: string, task: () => Promise<T> | T): Promise<T> {
  if (heldKeys.has(key)) throw new LockBusyError(key);
  heldKeys.add(key);
  // 让出一个微任务，确保在此期间到达的并发请求能观察到锁占用。
  await Promise.resolve();
  try {
    return await task();
  } finally {
    heldKeys.delete(key);
    const queue = waiters.get(key);
    if (queue?.length) {
      const next = queue.shift()!;
      if (queue.length === 0) waiters.delete(key);
      next();
    }
  }
}

/** 等待同项目锁被释放（当前主要用于确定性并发测试）。 */
export function waitProjectLockRelease(key: string): Promise<void> {
  if (!heldKeys.has(key)) return Promise.resolve();
  return new Promise((resolve) => {
    const queue = waiters.get(key) ?? [];
    queue.push(resolve);
    waiters.set(key, queue);
  });
}

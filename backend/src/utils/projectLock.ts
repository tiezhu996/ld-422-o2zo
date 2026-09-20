const locks = new Map<string, Promise<void>>();

/**
 * 按项目串行化临界区：结题与实验审核共用同一把锁，
 * 保证“校验 + 写入”原子完成，并发时只有先持锁的一方生效，
 * 失败方在锁内重新校验后被拒绝，不会留下状态或日期残值。
 */
export async function withProjectLock<T>(projectId: string, task: () => T | Promise<T>): Promise<T> {
  const previous = locks.get(projectId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  locks.set(projectId, tail);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (locks.get(projectId) === tail) locks.delete(projectId);
  }
}

import { defineStore } from "pinia";
import { projectApi } from "../api/project";
import { ApiRequestError } from "../utils/request";
import type { CloseBlocker, ResearchProject } from "../types/project";

export type CloseFailure = {
  projectId: string;
  code: string;
  message: string;
  blockers: CloseBlocker[];
};

export const useProjectStore = defineStore("projects", {
  state: () => ({
    items: [] as ResearchProject[],
    // 每个项目最近一次结题被阻塞的清单，供项目页展示；审核通过后可再次提交。
    closeFailures: {} as Record<string, CloseFailure>
  }),
  actions: {
    async load(status = "") {
      this.items = await projectApi.list(status);
    },
    /**
     * 提交结题门禁：
     * - 成功：刷新列表并清空该项目的阻塞清单；
     * - 被门禁 / 并发拒绝：保留后端返回的阻塞记录编号与状态，不改动列表。
     */
    async close(id: string): Promise<boolean> {
      try {
        const closed = await projectApi.close(id);
        const index = this.items.findIndex((item) => item.id === id);
        if (index >= 0) this.items[index] = closed;
        delete this.closeFailures[id];
        return true;
      } catch (error) {
        if (error instanceof ApiRequestError) {
          this.closeFailures[id] = { projectId: id, code: error.code, message: error.message, blockers: error.blockers };
        }
        return false;
      }
    },
    clearFailure(id: string) {
      delete this.closeFailures[id];
    }
  }
});

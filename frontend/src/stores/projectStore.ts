import { defineStore } from "pinia";
import { projectApi } from "../api/project";
import type { CompletionBlocker, ProjectDetail, ResearchProject } from "../types/project";
import { ApiRequestError } from "../utils/request";

export const useProjectStore = defineStore("projects", {
  state: () => ({
    items: [] as ResearchProject[],
    detail: null as ProjectDetail | null,
    blockers: [] as CompletionBlocker[],
    completionError: "",
    completingId: ""
  }),
  actions: {
    async load(status = "") {
      this.items = await projectApi.list(status);
    },
    async loadDetail(id: string) {
      this.detail = await projectApi.detail(id);
    },
    async complete(id: string) {
      this.completingId = id;
      this.blockers = [];
      this.completionError = "";
      try {
        const project = await projectApi.complete(id);
        const index = this.items.findIndex((item) => item.id === id);
        if (index >= 0) this.items[index] = project;
        if (this.detail?.id === id) await this.loadDetail(id);
        return true;
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "PROJECT_COMPLETION_BLOCKED") {
          this.blockers = Array.isArray(error.details) ? (error.details as CompletionBlocker[]) : [];
        }
        this.completionError = error instanceof Error ? error.message : "结题失败";
        return false;
      } finally {
        this.completingId = "";
      }
    }
  }
});

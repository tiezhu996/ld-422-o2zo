import type { ProjectStatus, ReviewStatus } from "./enums";

export type ResearchProject = {
  id: string;
  name: string;
  projectNo: string;
  leaderId: string;
  direction: "Biology" | "Chemistry" | "Physics" | "Materials" | "CS" | "Other";
  startedAt: string;
  expectedEndAt: string;
  actualEndAt?: string;
  status: ProjectStatus;
  totalBudget: number;
  usedBudget: number;
};

/** 结题被门禁拒绝时，后端逐条返回的阻塞实验记录。 */
export type CloseBlocker = {
  id: string;
  title: string;
  reviewStatus: ReviewStatus;
};

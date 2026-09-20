import type { ProjectStatus, ReviewStatus } from "./enums";
import type { ExperimentRecord } from "./experiment";
import type { ProjectMember } from "./member";

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

export type CompletionBlocker = {
  experimentId: string;
  title: string;
  reviewStatus: ReviewStatus;
};

export type ProjectDetail = ResearchProject & {
  members: ProjectMember[];
  timeline: ExperimentRecord[];
};

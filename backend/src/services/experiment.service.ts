import { experiments, projects } from "../prisma/seeds/seed.ts";
import { ProjectStatus, ReviewStatus, type ReviewStatusValue } from "../types/enums.ts";
import type { CompletionBlocker, ExperimentRecord } from "../types/interfaces.ts";
import { withProjectLock } from "../utils/projectLock.ts";
import { ApiError } from "../utils/response.ts";

const BLOCKING_REVIEW_STATUSES: ReviewStatusValue[] = [ReviewStatus.Draft, ReviewStatus.Submitted, ReviewStatus.Rejected, ReviewStatus.RevisionRequired];

function assertProjectOpen(projectId: string) {
  const project = projects.find((item) => item.id === projectId);
  if (project && (project.status === ProjectStatus.Completed || project.status === ProjectStatus.Archived)) {
    throw new ApiError(409, "PROJECT_ALREADY_CLOSED", "项目已结题，禁止变更实验审核状态");
  }
}

export const experimentService = {
  list(projectId = "", status = "") {
    return experiments.filter((item) => (!projectId || item.projectId === projectId) && (!status || item.reviewStatus === status));
  },
  blockingForProject(projectId: string): CompletionBlocker[] {
    return experiments
      .filter((item) => item.projectId === projectId && BLOCKING_REVIEW_STATUSES.includes(item.reviewStatus))
      .map((item) => ({ experimentId: item.id, title: item.title, reviewStatus: item.reviewStatus }));
  },
  async create(input: Partial<ExperimentRecord>) {
    if (!input.projectId) throw new ApiError(400, "PROJECT_REQUIRED", "必须关联研究项目");
    const projectId = input.projectId;
    return withProjectLock(projectId, () => {
      assertProjectOpen(projectId);
      const record: ExperimentRecord = {
        id: `ex-${Date.now()}`,
        projectId,
        title: input.title ?? "未命名实验记录",
        purpose: input.purpose ?? "补充实验目的",
        method: input.method ?? "待填写",
        stepsJson: input.stepsJson ?? { type: "doc", content: [] },
        conclusion: input.conclusion ?? "",
        experimentDate: input.experimentDate ?? new Date().toISOString().slice(0, 10),
        experimenterId: input.experimenterId ?? "u-researcher",
        reviewStatus: ReviewStatus.Draft,
        attachmentUrls: input.attachmentUrls ?? []
      };
      experiments.unshift(record);
      return record;
    });
  },
  async submit(id: string) {
    const record = experiments.find((item) => item.id === id);
    if (!record) throw new ApiError(404, "EXPERIMENT_NOT_FOUND", "实验记录不存在");
    return withProjectLock(record.projectId, () => {
      assertProjectOpen(record.projectId);
      record.reviewStatus = ReviewStatus.Submitted;
      return record;
    });
  },
  async review(id: string, reviewerId: string, status: string, comment = "") {
    const record = experiments.find((item) => item.id === id);
    if (!record) throw new ApiError(404, "EXPERIMENT_NOT_FOUND", "实验记录不存在");
    return withProjectLock(record.projectId, () => {
      assertProjectOpen(record.projectId);
      record.reviewerId = reviewerId;
      record.reviewStatus = status as never;
      record.reviewComment = comment;
      return record;
    });
  }
};

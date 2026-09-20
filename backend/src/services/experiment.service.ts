import { experiments, projects } from "../prisma/seeds/seed.ts";
import { ProjectStatus, ReviewStatus, type ReviewStatusValue } from "../types/enums.ts";
import type { ExperimentRecord, User } from "../types/interfaces.ts";
import { LockBusyError, withProjectLock } from "../utils/projectLock.ts";
import { ApiError } from "../utils/response.ts";

const ALLOWED_REVIEW_STATUSES: ReviewStatusValue[] = [
  ReviewStatus.Approved,
  ReviewStatus.Rejected,
  ReviewStatus.RevisionRequired
];

export const experimentService = {
  list(projectId = "", status = "") {
    return experiments.filter((item) => (!projectId || item.projectId === projectId) && (!status || item.reviewStatus === status));
  },
  create(input: Partial<ExperimentRecord>) {
    if (!input.projectId) throw new ApiError(400, "PROJECT_REQUIRED", "必须关联研究项目");
    const project = projects.find((item) => item.id === input.projectId);
    if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "关联项目不存在");
    const record: ExperimentRecord = {
      id: `ex-${Date.now()}`,
      projectId: input.projectId,
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
  },
  submit(id: string) {
    const record = experiments.find((item) => item.id === id);
    if (!record) throw new ApiError(404, "EXPERIMENT_NOT_FOUND", "实验记录不存在");
    record.reviewStatus = ReviewStatus.Submitted;
    return record;
  },

  /**
   * 审核通过 / 驳回 / 要求修改，与结题共用项目锁：
   * - 与结题并发时只有一方拿锁，失败方 PROJECT_BUSY 且不写入；
   * - 项目已结题则原子拒绝（状态、审核人、审核意见均不落地）；
   * - 所有校验在字段赋值之前完成，杜绝失败残值。
   */
  async review(user: User, id: string, status: string, comment = ""): Promise<ExperimentRecord> {
    const record = experiments.find((item) => item.id === id);
    if (!record) throw new ApiError(404, "EXPERIMENT_NOT_FOUND", "实验记录不存在");
    if (!ALLOWED_REVIEW_STATUSES.includes(status as ReviewStatusValue)) {
      throw new ApiError(400, "INVALID_REVIEW_STATUS", `不支持的审核状态：${status}`);
    }

    try {
      return await withProjectLock(record.projectId, () => {
        const project = projects.find((item) => item.id === record.projectId);
        if (project?.status === ProjectStatus.Completed || project?.actualEndAt) {
          throw new ApiError(409, "PROJECT_ALREADY_CLOSED", "项目已结题，实验记录不可再审核");
        }
        record.reviewerId = user.id;
        record.reviewStatus = status as ReviewStatusValue;
        record.reviewComment = comment;
        return record;
      });
    } catch (error) {
      if (error instanceof LockBusyError) {
        throw new ApiError(409, "PROJECT_BUSY", "项目结题正在提交，请稍后再审核");
      }
      throw error;
    }
  }
};

import { auditLogs, experiments, members, projects } from "../prisma/seeds/seed.ts";
import { ProjectStatus, ReviewStatus } from "../types/enums.ts";
import type { AuditLog, ResearchProject, User } from "../types/interfaces.ts";
import { LockBusyError, withProjectLock } from "../utils/projectLock.ts";
import { ApiError } from "../utils/response.ts";

/** 阻止结题的实验审核状态：只有全部 Approved 才放行。 */
const BLOCKING_REVIEW_STATUSES = new Set([
  ReviewStatus.Draft,
  ReviewStatus.Submitted,
  ReviewStatus.Rejected,
  ReviewStatus.RevisionRequired
]);

export type CloseBlocker = { id: string; title: string; reviewStatus: string };

export const projectService = {
  list(status = "") {
    return status ? projects.filter((project) => project.status === status) : projects;
  },
  detail(id: string) {
    const project = projects.find((item) => item.id === id);
    if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");
    return {
      ...project,
      members: members.filter((member) => member.projectId === id),
      timeline: experiments.filter((experiment) => experiment.projectId === id)
    };
  },
  create(input: Partial<ResearchProject>) {
    const project: ResearchProject = {
      id: `pr-${Date.now()}`,
      name: input.name ?? "新研究项目",
      projectNo: input.projectNo ?? `RL-${Date.now()}`,
      leaderId: input.leaderId ?? "u-pi",
      direction: input.direction ?? "Other",
      startedAt: input.startedAt ?? new Date().toISOString().slice(0, 10),
      expectedEndAt: input.expectedEndAt ?? "2027-12-31",
      status: input.status ?? ProjectStatus.Proposal,
      totalBudget: Number(input.totalBudget ?? 0),
      usedBudget: Number(input.usedBudget ?? 0)
    };
    projects.unshift(project);
    return project;
  },

  /**
   * 提交结题门禁（与实验审核共用项目锁，原子执行）：
   * - 锁内重新读取该项目的全部实验记录；
   * - 存在 Draft / Submitted / Rejected / RevisionRequired 即拒绝，
   *   返回每条阻塞记录的编号与状态，项目状态与结题日期零改动；
   * - 全部 Approved（含无记录）才写入实际结题日期、Completed 状态与审计日志；
   * - 与审核并发时只有一方拿到锁，失败方得到 PROJECT_BUSY 且无任何写入。
   */
  async close(user: User, id: string): Promise<ResearchProject> {
    const project = projects.find((item) => item.id === id);
    if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");

    try {
      return await withProjectLock(id, () => {
        if (project.status === ProjectStatus.Completed || project.actualEndAt) {
          throw new ApiError(409, "PROJECT_ALREADY_CLOSED", "项目已结题，请勿重复提交");
        }

        // 锁内重读全部实验记录，拒绝时在任何写入之前抛出 -> 不留残值。
        const blockers: CloseBlocker[] = experiments
          .filter((record) => record.projectId === id && BLOCKING_REVIEW_STATUSES.has(record.reviewStatus))
          .map((record) => ({ id: record.id, title: record.title, reviewStatus: record.reviewStatus }));
        if (blockers.length > 0) {
          throw new ApiError(409, "PROJECT_CLOSE_BLOCKED", `存在 ${blockers.length} 条未审核通过的实验记录，无法结题`, { blockers });
        }

        // 全部 Approved：日期、状态、审计在同一临界区内一起提交。
        const today = new Date().toISOString().slice(0, 10);
        project.status = ProjectStatus.Completed;
        project.actualEndAt = today;
        const log: AuditLog = {
          id: `log-${Date.now()}`,
          actorId: user.id,
          action: "COMPLETE_PROJECT",
          entity: "ResearchProject",
          entityId: project.id,
          createdAt: new Date().toISOString()
        };
        auditLogs.unshift(log);
        return project;
      });
    } catch (error) {
      if (error instanceof LockBusyError) {
        throw new ApiError(409, "PROJECT_BUSY", "项目实验审核正在进行，请稍后再提交结题");
      }
      throw error;
    }
  }
};

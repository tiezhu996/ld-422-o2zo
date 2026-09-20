import { experiments, members, projects } from "../prisma/seeds/seed.ts";
import { ProjectStatus } from "../types/enums.ts";
import type { ResearchProject } from "../types/interfaces.ts";
import { withProjectLock } from "../utils/projectLock.ts";
import { ApiError } from "../utils/response.ts";
import { experimentService } from "./experiment.service.ts";

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
  async complete(id: string) {
    return withProjectLock(id, () => {
      const project = projects.find((item) => item.id === id);
      if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");
      if (project.status === ProjectStatus.Completed || project.status === ProjectStatus.Archived) {
        throw new ApiError(409, "PROJECT_ALREADY_CLOSED", "项目已结题，请勿重复提交");
      }
      // 锁内重新读取该项目全部实验记录，存在未通过记录则整体拒绝，不写入任何状态或日期
      const blockers = experimentService.blockingForProject(id);
      if (blockers.length > 0) {
        throw new ApiError(409, "PROJECT_COMPLETION_BLOCKED", `存在 ${blockers.length} 条未审核通过的实验记录，禁止结题`, blockers);
      }
      project.status = ProjectStatus.Completed;
      project.actualEndAt = new Date().toISOString().slice(0, 10);
      return project;
    });
  }
};

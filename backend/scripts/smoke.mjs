import { strict as assert } from "node:assert";
import { dashboardService } from "../src/services/dashboard.service.ts";
import { projectRoutes } from "../src/routes/project.routes.ts";
import { experimentRoutes } from "../src/routes/experiment.routes.ts";
import { reagentRoutes } from "../src/routes/reagent.routes.ts";
import { reagentUsageRoutes } from "../src/routes/reagentUsage.routes.ts";
import { memberRoutes } from "../src/routes/member.routes.ts";
import { auditLogs } from "../src/prisma/seeds/seed.ts";

const pi = { id: "u-pi", name: "王教授", role: "PI" };
const query = new URLSearchParams();

const dashboard = dashboardService.summary();
assert.equal(dashboard.activeProjects.length >= 2, true);

const members = memberRoutes("GET", "/api/members", query);
assert.equal(Array.isArray(members), true);

const projects = await projectRoutes("GET", "/api/projects", query, pi, {});
assert.equal(projects.length >= 3, true);

const project = await projectRoutes("POST", "/api/projects", query, pi, {
  name: "烟雾测试项目",
  projectNo: "RL-SMOKE-001",
  totalBudget: 10000
});
assert.equal(project.status, "Proposal");

const experiment = await experimentRoutes("POST", "/api/experiments", query, pi, {
  projectId: project.id,
  title: "烟雾测试实验"
});
assert.equal(experiment.reviewStatus, "Draft");

const submitted = await experimentRoutes("PATCH", `/api/experiments/${experiment.id}/submit`, query, pi, {});
assert.equal(submitted.reviewStatus, "Submitted");

// 结题门禁：存在未通过实验记录时原子拒绝，返回阻塞清单且不留状态或日期残值
const blocked = await projectRoutes("PATCH", `/api/projects/${project.id}/complete`, query, pi, {}).then(() => null, (error) => error);
assert.equal(blocked.code, "PROJECT_COMPLETION_BLOCKED");
assert.equal(blocked.details.length, 1);
assert.equal(blocked.details[0].experimentId, experiment.id);
assert.equal(blocked.details[0].reviewStatus, "Submitted");
assert.equal(project.status, "Proposal");
assert.equal(project.actualEndAt, undefined);

// 阻塞记录审核通过后可再次结题，写入实际结题日期与审计
const reviewed = await experimentRoutes("PATCH", `/api/experiments/${experiment.id}/review`, query, pi, { status: "Approved", comment: "ok" });
assert.equal(reviewed.reviewStatus, "Approved");
const completed = await projectRoutes("PATCH", `/api/projects/${project.id}/complete`, query, pi, {});
assert.equal(completed.status, "Completed");
assert.equal(Boolean(completed.actualEndAt), true);

// 重复结题被拒绝
const duplicated = await projectRoutes("PATCH", `/api/projects/${project.id}/complete`, query, pi, {}).then(() => null, (error) => error);
assert.equal(duplicated.code, "PROJECT_ALREADY_CLOSED");

// 已结题项目禁止审核变更，失败方不留状态残值
const lateReview = await experimentRoutes("PATCH", `/api/experiments/${experiment.id}/review`, query, pi, { status: "Rejected", comment: "太迟了" }).then(() => null, (error) => error);
assert.equal(lateReview.code, "PROJECT_ALREADY_CLOSED");
assert.equal(experiment.reviewStatus, "Approved");

// 结题与审核并发：结题先持锁则审核被拒绝，记录保持 Approved
const raceProject = await projectRoutes("POST", "/api/projects", query, pi, { name: "并发结题项目", projectNo: "RL-SMOKE-RACE", totalBudget: 1000 });
const raceExperiment = await experimentRoutes("POST", "/api/experiments", query, pi, { projectId: raceProject.id, title: "并发实验记录" });
await experimentRoutes("PATCH", `/api/experiments/${raceExperiment.id}/submit`, query, pi, {});
await experimentRoutes("PATCH", `/api/experiments/${raceExperiment.id}/review`, query, pi, { status: "Approved", comment: "ok" });
const [completeFirst, reviewSecond] = await Promise.allSettled([
  projectRoutes("PATCH", `/api/projects/${raceProject.id}/complete`, query, pi, {}),
  experimentRoutes("PATCH", `/api/experiments/${raceExperiment.id}/review`, query, pi, { status: "Rejected", comment: "race" })
]);
assert.equal([completeFirst, reviewSecond].filter((result) => result.status === "fulfilled").length, 1);
assert.equal(raceProject.status, "Completed");
assert.equal(raceExperiment.reviewStatus, "Approved");

// 反向并发：审核先持锁则结题被门禁拒绝，项目不留结题日期
const raceProject2 = await projectRoutes("POST", "/api/projects", query, pi, { name: "并发结题项目二", projectNo: "RL-SMOKE-RACE-2", totalBudget: 1000 });
const raceExperiment2 = await experimentRoutes("POST", "/api/experiments", query, pi, { projectId: raceProject2.id, title: "并发实验记录二" });
await experimentRoutes("PATCH", `/api/experiments/${raceExperiment2.id}/submit`, query, pi, {});
const [reviewFirst, completeSecond] = await Promise.allSettled([
  experimentRoutes("PATCH", `/api/experiments/${raceExperiment2.id}/review`, query, pi, { status: "Rejected", comment: "需要修改" }),
  projectRoutes("PATCH", `/api/projects/${raceProject2.id}/complete`, query, pi, {})
]);
assert.equal([reviewFirst, completeSecond].filter((result) => result.status === "fulfilled").length, 1);
assert.equal(raceExperiment2.reviewStatus, "Rejected");
assert.equal(raceProject2.status, "Proposal");
assert.equal(raceProject2.actualEndAt, undefined);

const reagent = reagentRoutes("POST", "/api/reagents", query, pi, {
  name: "烟雾测试试剂",
  stock: 6,
  minStock: 1
});
assert.equal(reagent.name, "烟雾测试试剂");

const usage = reagentUsageRoutes("POST", "/api/reagent-usages", query, pi, {
  reagentId: reagent.id,
  experimentId: experiment.id,
  quantity: 1,
  purpose: "smoke usage"
});
assert.equal(usage.quantity, 1);

const stocked = reagentRoutes("PATCH", `/api/reagents/${reagent.id}/stock-in`, query, pi, { quantity: 2 });
assert.equal(stocked.stock, 7);
assert.equal(auditLogs.length >= 6, true);

console.log("ld-422 backend route smoke passed");

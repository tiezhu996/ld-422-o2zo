import { strict as assert } from "node:assert";
import { dashboardService } from "../src/services/dashboard.service.ts";
import { projectRoutes } from "../src/routes/project.routes.ts";
import { experimentRoutes } from "../src/routes/experiment.routes.ts";
import { reagentRoutes } from "../src/routes/reagent.routes.ts";
import { reagentUsageRoutes } from "../src/routes/reagentUsage.routes.ts";
import { memberRoutes } from "../src/routes/member.routes.ts";
import { auditLogs, experiments, projects } from "../src/prisma/seeds/seed.ts";
import { waitProjectLockRelease } from "../src/utils/projectLock.ts";

const pi = { id: "u-pi", name: "王教授", role: "PI" };
const query = new URLSearchParams();

const dashboard = dashboardService.summary();
assert.equal(dashboard.activeProjects.length >= 2, true);

const members = memberRoutes("GET", "/api/members", query);
assert.equal(Array.isArray(members), true);

const projectsList = projectRoutes("GET", "/api/projects", query, pi, {});
assert.equal(projectsList.length >= 3, true);

const project = projectRoutes("POST", "/api/projects", query, pi, {
  name: "烟雾测试项目",
  projectNo: "RL-SMOKE-001",
  totalBudget: 10000
});
assert.equal(project.status, "Proposal");

const experiment = experimentRoutes("POST", "/api/experiments", query, pi, {
  projectId: projectsList[0].id,
  title: "烟雾测试实验"
});
assert.equal(experiment.reviewStatus, "Draft");

const submitted = experimentRoutes("PATCH", `/api/experiments/${experiment.id}/submit`, query, pi, {});
assert.equal(submitted.reviewStatus, "Submitted");

const reviewed = await experimentRoutes("PATCH", `/api/experiments/${experiment.id}/review`, query, pi, { status: "Approved", comment: "ok" });
assert.equal(reviewed.reviewStatus, "Approved");

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

// ---------------------------------------------------------------------------
// 结题门禁 1：pr-catalyst 存在 Submitted/Draft/RevisionRequired/Rejected 记录，
// 必须原子拒绝并返回每条阻塞记录的编号与状态，且项目状态/结题日期不变。
// ---------------------------------------------------------------------------
const catalyst = projects.find((p) => p.id === "pr-catalyst");
assert.equal(catalyst.status, "Active");
assert.equal(catalyst.actualEndAt, undefined);

const blocked = await projectRoutes("PATCH", "/api/projects/pr-catalyst/close", query, pi, {}).then(
  () => null,
  (error) => error
);
assert.equal(blocked.status, 409);
assert.equal(blocked.code, "PROJECT_CLOSE_BLOCKED");
const blockerIds = blocked.details.blockers.map((b) => b.id).sort();
assert.deepEqual(blockerIds, ["ex-002", "ex-003", "ex-004", "ex-005"]);
const blockerStatuses = Object.fromEntries(blocked.details.blockers.map((b) => [b.id, b.reviewStatus]));
assert.equal(blockerStatuses["ex-002"], "Submitted");
assert.equal(blockerStatuses["ex-003"], "Draft");
assert.equal(blockerStatuses["ex-004"], "RevisionRequired");
assert.equal(blockerStatuses["ex-005"], "Rejected");
// 拒绝后无残值：仍是 Active、无实际结题日期、无 COMPLETE_PROJECT 审计
assert.equal(catalyst.status, "Active");
assert.equal(catalyst.actualEndAt, undefined);
assert.equal(auditLogs.some((log) => log.action === "COMPLETE_PROJECT" && log.entityId === "pr-catalyst"), false);

// ---------------------------------------------------------------------------
// 结题门禁 2：审核全部通过后可再次结题；全部 Approved 才写入日期/状态/审计。
// ---------------------------------------------------------------------------
for (const id of ["ex-002", "ex-003", "ex-004", "ex-005"]) {
  await experimentRoutes("PATCH", `/api/experiments/${id}/submit`, query, pi, {});
  const approved = await experimentRoutes("PATCH", `/api/experiments/${id}/review`, query, pi, { status: "Approved", comment: "通过" });
  assert.equal(approved.reviewStatus, "Approved");
}
const closed = await projectRoutes("PATCH", "/api/projects/pr-catalyst/close", query, pi, {});
assert.equal(closed.status, "Completed");
assert.equal(typeof closed.actualEndAt, "string");
assert.equal(!!closed.actualEndAt, true);
assert.equal(auditLogs.some((log) => log.action === "COMPLETE_PROJECT" && log.entityId === "pr-catalyst"), true);

// 已结题项目不允许再审核记录（无残值：审核人/意见/状态都不变）
const afterClosedReview = await experimentRoutes("PATCH", "/api/experiments/ex-002/review", query, pi, {
  status: "Rejected",
  comment: "结题后驳回尝试"
}).then(
  () => null,
  (error) => error
);
assert.equal(afterClosedReview.code, "PROJECT_ALREADY_CLOSED");
const ex002 = experiments.find((e) => e.id === "ex-002");
assert.equal(ex002.reviewStatus, "Approved");
assert.equal(ex002.reviewComment, "通过");

// ---------------------------------------------------------------------------
// 并发 1：结题进行中，审核同项目记录 -> 只有结题成功，审核 PROJECT_BUSY，
// 记录状态不被改动。
// ---------------------------------------------------------------------------
const immune = projects.find((p) => p.id === "pr-immune");
assert.equal(immune.status, "Active");
const closing = projectRoutes("PATCH", "/api/projects/pr-immune/close", query, pi, {});
const racingReview = await experimentRoutes("PATCH", "/api/experiments/ex-001/review", query, pi, {
  status: "Rejected",
  comment: "并发驳回尝试"
}).then(
  () => null,
  (error) => error
);
assert.equal(racingReview.code, "PROJECT_BUSY");
const closedImmune = await closing;
assert.equal(closedImmune.status, "Completed");
assert.equal(!!closedImmune.actualEndAt, true);
const ex001 = experiments.find((e) => e.id === "ex-001");
assert.equal(ex001.reviewStatus, "Approved");
assert.equal(ex001.reviewComment, "数据完整");

// ---------------------------------------------------------------------------
// 并发 2：审核进行中，结题同项目 -> 只有审核成功，结题 PROJECT_BUSY，
// 项目仍为 Active 且无实际结题日期（失败方零残值）。
// ---------------------------------------------------------------------------
const target = projects.find((p) => p.id === "pr-ai-lab");
await experimentRoutes("POST", "/api/experiments", query, pi, { projectId: "pr-ai-lab", title: "并发门禁实验" });
const aiRecord = experiments.find((e) => e.projectId === "pr-ai-lab");
await experimentRoutes("PATCH", `/api/experiments/${aiRecord.id}/submit`, query, pi, {});
const reviewing = experimentRoutes("PATCH", `/api/experiments/${aiRecord.id}/review`, query, pi, {
  status: "Approved",
  comment: "并发审核通过"
});
const racingClose = await projectRoutes("PATCH", "/api/projects/pr-ai-lab/close", query, pi, {}).then(
  () => null,
  (error) => error
);
assert.equal(racingClose.code, "PROJECT_BUSY");
const reviewWinner = await reviewing;
assert.equal(reviewWinner.reviewStatus, "Approved");
assert.equal(target.status, "Proposal");
assert.equal(target.actualEndAt, undefined);
await waitProjectLockRelease("pr-ai-lab");
// 审核落定后再次结题（全部 Approved）应成功
const closedAi = await projectRoutes("PATCH", "/api/projects/pr-ai-lab/close", query, pi, {});
assert.equal(closedAi.status, "Completed");
assert.equal(!!closedAi.actualEndAt, true);

console.log("ld-422 backend route smoke passed (close gate + concurrency)");

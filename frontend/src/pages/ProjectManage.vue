<template>
  <section class="project-manage">
    <div class="toolbar">
      <h2>项目管理</h2>
      <select v-model="statusFilter" @change="reload">
        <option value="">全部状态</option>
        <option v-for="option in statusOptions" :key="option" :value="option">{{ option }}</option>
      </select>
    </div>

    <p v-if="loading" class="hint">项目加载中…</p>

    <article v-for="project in projects" :key="project.id" class="card project-card">
      <header class="project-head">
        <div>
          <strong>{{ project.name }}</strong>
          <span class="project-no">{{ project.projectNo }}</span>
        </div>
        <StatusBadge :value="project.status" />
      </header>

      <ProgressBar :used="project.usedBudget" :total="project.totalBudget" />

      <div class="meta">
        <span>立项：{{ project.startedAt }}</span>
        <span>预计结题：{{ project.expectedEndAt }}</span>
        <span v-if="project.actualEndAt">实际结题：{{ project.actualEndAt }}</span>
        <span>待通过实验记录：{{ blockingCount(project.id) }} 条</span>
      </div>

      <!-- 结题入口：保留现有启动方式，门禁由后端原子裁决 -->
      <div class="actions">
        <button
          class="action"
          :disabled="project.status === 'Completed' || closingId === project.id"
          @click="submitClose(project.id)"
        >
          {{ closingId === project.id ? "提交中…" : project.status === "Completed" ? "已结题" : "提交结题" }}
        </button>
      </div>

      <!-- 阻塞清单：展示每条阻塞记录的编号与状态，审核通过后可直接再次结题 -->
      <div v-if="failureOf(project.id)" class="alert" role="alert">
        <div class="alert-title">结题被拒绝：{{ failureOf(project.id)?.message }}</div>
        <ul v-if="failureOf(project.id)?.blockers.length" class="blocker-list">
          <li v-for="blocker in failureOf(project.id)?.blockers" :key="blocker.id">
            <code>{{ blocker.id }}</code>
            <span class="blocker-title">{{ blocker.title }}</span>
            <StatusBadge :value="blocker.reviewStatus" />
          </li>
        </ul>
        <div class="alert-actions">
          <button class="action secondary" :disabled="closingId === project.id" @click="submitClose(project.id)">
            审核完成后再次结题
          </button>
          <button class="action warning" @click="dismiss(project.id)">知道了</button>
        </div>
      </div>

      <Timeline :items="timelineOf(project.id)" />
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import StatusBadge from "../components/common/StatusBadge.vue";
import ProgressBar from "../components/common/ProgressBar.vue";
import Timeline from "../components/common/Timeline.vue";
import { useProjectStore } from "../stores/projectStore";
import { useExperimentStore } from "../stores/experimentStore";
import type { ReviewStatus } from "../types/enums";

const BLOCKING_STATUSES: ReviewStatus[] = ["Draft", "Submitted", "Rejected", "RevisionRequired"];
const statusOptions = ["Proposal", "Active", "Suspended", "Completed", "Archived"];

const projectStore = useProjectStore();
const experimentStore = useExperimentStore();

const statusFilter = ref("");
const loading = ref(false);
const closingId = ref("");

const projects = computed(() => projectStore.items);

async function reload() {
  loading.value = true;
  try {
    await Promise.all([projectStore.load(statusFilter.value), experimentStore.load()]);
  } finally {
    loading.value = false;
  }
}

function blockingCount(projectId: string) {
  return experimentStore.items.filter(
    (record) => record.projectId === projectId && BLOCKING_STATUSES.includes(record.reviewStatus)
  ).length;
}

function failureOf(projectId: string) {
  return projectStore.closeFailures[projectId];
}

function timelineOf(projectId: string) {
  return experimentStore.items.filter((record) => record.projectId === projectId);
}

async function submitClose(projectId: string) {
  closingId.value = projectId;
  try {
    // 成功则 store 内部刷新状态；失败则阻塞清单落到 closeFailures 供本页展示。
    await projectStore.close(projectId);
    if (!projectStore.closeFailures[projectId]) await experimentStore.load();
  } finally {
    closingId.value = "";
  }
}

function dismiss(projectId: string) {
  projectStore.clearFailure(projectId);
}

onMounted(reload);
</script>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.project-card { margin-bottom: 16px; padding: 16px; }
.project-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.project-no { margin-left: 10px; color: #6f7168; font-size: 13px; }
.meta { display: flex; flex-wrap: wrap; gap: 14px; margin: 10px 0; font-size: 13px; color: #6f7168; }
.actions { margin-bottom: 12px; }
.alert { border-left: 5px solid #aa3d35; background: #faeee8; padding: 12px 14px; border-radius: 6px; }
.alert-title { font-weight: 600; margin-bottom: 8px; }
.blocker-list { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 6px; }
.blocker-list li { display: flex; align-items: center; gap: 8px; }
.blocker-title { flex: 1; }
.alert-actions { display: flex; gap: 8px; }
.hint { color: #6f7168; }
</style>

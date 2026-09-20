<template>
  <section>
    <h2>项目管理</h2>
    <el-alert v-if="store.completionError" :title="store.completionError" type="error" show-icon :closable="false" class="gate-block" />
    <el-card v-if="store.blockers.length" class="gate-block">
      <template #header>结题阻塞清单：{{ store.blockers.length }} 条实验记录未审核通过</template>
      <el-table :data="store.blockers" size="small">
        <el-table-column prop="experimentId" label="记录编号" width="140" />
        <el-table-column prop="title" label="实验标题" />
        <el-table-column label="审核状态" width="120">
          <template #default="{ row }">
            <StatusBadge :value="row.reviewStatus" />
          </template>
        </el-table-column>
      </el-table>
      <p>全部阻塞记录审核通过后，可再次提交结题。</p>
    </el-card>
    <el-table :data="store.items" v-loading="loading" @row-click="onSelect">
      <el-table-column prop="projectNo" label="项目编号" width="150" />
      <el-table-column prop="name" label="项目名称" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <StatusBadge :value="row.status" />
        </template>
      </el-table-column>
      <el-table-column label="经费使用" width="180">
        <template #default="{ row }">
          <ProgressBar :used="row.usedBudget" :total="row.totalBudget" />
        </template>
      </el-table-column>
      <el-table-column label="实际结题日期" width="130">
        <template #default="{ row }">{{ row.actualEndAt ?? "—" }}</template>
      </el-table-column>
      <el-table-column label="操作" width="110">
        <template #default="{ row }">
          <el-button
            v-if="row.status !== 'Completed' && row.status !== 'Archived'"
            type="primary"
            size="small"
            :loading="store.completingId === row.id"
            @click.stop="onComplete(row.id)"
          >提交结题</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-card v-if="store.detail" class="gate-block">
      <template #header>{{ store.detail.name }} · 实验记录时间线</template>
      <Timeline :items="store.detail.timeline" />
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import StatusBadge from "../components/common/StatusBadge.vue";
import ProgressBar from "../components/common/ProgressBar.vue";
import Timeline from "../components/common/Timeline.vue";
import { useProjectStore } from "../stores/projectStore";

const store = useProjectStore();
const loading = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    await store.load();
  } finally {
    loading.value = false;
  }
});

async function onComplete(id: string) {
  await store.complete(id);
}

async function onSelect(row: { id: string }) {
  await store.loadDetail(row.id);
}
</script>

<style scoped>
.gate-block {
  margin-bottom: 16px;
}
</style>

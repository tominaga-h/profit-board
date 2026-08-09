<script setup lang="ts">
import { FetchStatus } from '~/lib/fetchStatus'
import { formatYen } from '~/lib/format'

// middleware/auth.global.ts が全ルートに掛かるため、definePageMeta での
// 追加ガードは不要（SPEC 3.1 の判定はミドルウェアに一本化されている）。
const { members, status, errorMessage, fetchMembers } = useMembers()

onMounted(fetchMembers)
</script>

<template>
  <div>
    <PageHeader title="メンバー一覧" subtitle="登録メンバーと単価を確認します">
      <template #actions>
        <!--
          SPEC 4.4「右上の『編集する』ボタンで編集画面へ遷移」。
          to を渡すと UButton は NuxtLink になるので、右クリックで新規タブも開ける。
          色は app.config.ts の primary: 'blue' が既定で効くため指定しない。
        -->
        <UButton to="/members/edit" icon="i-lucide-pencil">編集する</UButton>
      </template>
    </PageHeader>

    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <!--
        読み込み中。IDLE も同じ枝に入れるのは、onMounted が走る前の
        1フレームで v-else に落ちて「0件です」が一瞬見えるのを防ぐため。
      -->
      <div
        v-if="status === FetchStatus.IDLE || status === FetchStatus.LOADING"
        class="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-500"
      >
        <UIcon name="i-lucide-loader-circle" class="h-5 w-5 animate-spin" />
        <span>読み込み中...</span>
      </div>

      <!-- 取得失敗。0件と区別して、原因が分かるようにする -->
      <div v-else-if="status === FetchStatus.ERROR" class="px-6 py-10">
        <!--
          ★ description は string で null を受け付けない。この枝では v-if による
            narrowing が効かないので ?? '' が必要（無いと vue-tsc が落ちる）。
        -->
        <UAlert
          color="red"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="errorMessage ?? ''"
        />
      </div>

      <!-- 0件 -->
      <div v-else-if="members.length === 0" class="px-6 py-16 text-center">
        <UIcon name="i-lucide-users" class="h-8 w-8 text-slate-300" />
        <p class="mt-3 text-sm text-slate-500">メンバーが登録されていません。</p>
        <p class="mt-1 text-xs text-slate-400">「編集する」からメンバーを追加してください。</p>
      </div>

      <!-- 一覧（SPEC 4.4: ID・姓・名・メールアドレス・単価） -->
      <table v-else class="min-w-full divide-y divide-slate-200">
        <thead class="bg-slate-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-semibold text-slate-500">ID</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-semibold text-slate-500">姓</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-semibold text-slate-500">名</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-semibold text-slate-500">
              メールアドレス
            </th>
            <!-- 金額列は右寄せ。桁を縦に揃えないと大小が読み取れない。 -->
            <th scope="col" class="px-6 py-3 text-right text-xs font-semibold text-slate-500">
              単価
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          <tr v-for="member in members" :key="member.id" class="hover:bg-slate-50">
            <!--
              ID は SERIAL の値をそのまま出す。デザイン画像の 001 形式（ゼロ埋め3桁）は
              生成時に付加されたもので、SPEC 4.4 にも 5.1 のDDLにも根拠がない。
            -->
            <td class="whitespace-nowrap px-6 py-4 text-sm text-slate-400">{{ member.id }}</td>
            <td class="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900">
              {{ member.family_name }}
            </td>
            <td class="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900">
              {{ member.first_name }}
            </td>
            <td class="whitespace-nowrap px-6 py-4 text-sm text-slate-500">{{ member.email }}</td>
            <!-- tabular-nums がないと、右寄せしても 1 の字幅が狭く桁が揃わない。 -->
            <td class="whitespace-nowrap px-6 py-4 text-right text-sm tabular-nums text-slate-900">
              {{ formatYen(member.unit_price) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

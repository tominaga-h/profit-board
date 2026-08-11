<script setup lang="ts">
import { FetchStatus } from '~/lib/fetchStatus'
import { memberRowSchema, toMemberRowErrors } from '~/lib/schemas/member'
import type { MemberRowErrors } from '~/lib/schemas/member'
import type { Member, MemberDraft } from '~/composables/useMembers'

const {
  members,
  status,
  errorMessage,
  fetchMembers,
  isSaving,
  saveErrorMessage,
  hasCostRecords,
  saveMembers,
} = useMembers()

// 自分自身の行を判定するために使う。
const { appUser } = useAppUser()

/** 編集中の行。取得結果をコピーして持つ（members は再取得の基準として残す）。 */
const drafts = ref<MemberDraft[]>([])

/** 削除予定の既存行 ID。保存するまで DB には触らない。 */
const deletedIds = ref<number[]>([])

/** 取得直後のスナップショット。変更があった行だけ UPDATE するために使う。 */
const original = ref<Map<number, Member>>(new Map())

/** 行の検証エラー。キーは draft.key。 */
const rowErrors = ref<Map<string, MemberRowErrors>>(new Map())

/** ゴミ箱を押したが実績があって削除できなかったときの通知。 */
const deleteErrorMessage = ref<string | null>(null)

/** 実績確認の問い合わせ中の行（ゴミ箱の二重押し防止）。 */
const checkingKey = ref<string | null>(null)

const toDraft = (member: Member): MemberDraft => ({
  id: member.id,
  key: `member-${member.id}`,
  family_name: member.family_name,
  first_name: member.first_name,
  email: member.email,
  unit_price: member.unit_price,
})

/** 取得結果から編集状態を組み立て直す。保存失敗後の再同期にも使う。 */
const resetDrafts = () => {
  drafts.value = members.value.map(toDraft)
  original.value = new Map(members.value.map((member) => [member.id, member]))
  deletedIds.value = []
  rowErrors.value = new Map()
}

const load = async () => {
  await fetchMembers()
  resetDrafts()
}

onMounted(load)

/**
 * 未保存の変更件数（デザインの「変更 N 件」バッジ）。
 *
 * 保存ボタンの活性制御と同じ値を使う。0 件なら保存しても DB は何も変わらないので
 * ボタンを無効にし、無駄なリクエストと updated_at の更新を防ぐ。
 */
const changedCount = computed(() => {
  const added = drafts.value.filter((draft) => draft.id === null).length

  const edited = drafts.value.filter((draft) => {
    if (draft.id === null) return false
    const before = original.value.get(draft.id)
    if (!before) return false
    return (
      before.family_name !== draft.family_name ||
      before.first_name !== draft.first_name ||
      before.email !== draft.email ||
      before.unit_price !== draft.unit_price
    )
  }).length

  return added + edited + deletedIds.value.length
})

const addRow = () => {
  drafts.value.push({
    // ★ 配列添字を key にしない。行を削除すると後続の key がずれて、
    //   入力中の値が別の行に移って見える。
    key: crypto.randomUUID(),
    id: null,
    family_name: '',
    first_name: '',
    email: '',
    unit_price: 0,
  })
}

/**
 * ログイン中の自分自身は削除させない。
 *
 * ★ 仕様には規定がないが、RLS は自己削除を許してしまう。自分を消すと
 *   is_app_user() が false になって即座にアプリから締め出され、
 *   復旧には Supabase の SQL Editor から手動で INSERT し直すしかない。
 *   しかも実績がなければ FK にも引っかからず、するっと成功してしまう。
 */
const canDelete = (draft: MemberDraft): boolean =>
  draft.id === null || draft.id !== appUser.value?.id

const removeRow = async (draft: MemberDraft) => {
  deleteErrorMessage.value = null

  // 新規行は DB に無いので実績確認は不要。
  if (draft.id === null) {
    drafts.value = drafts.value.filter((row) => row.key !== draft.key)
    rowErrors.value.delete(draft.key)
    return
  }

  if (!canDelete(draft)) return

  // 実績があるメンバーはゴミ箱押下の時点で拒否する。
  checkingKey.value = draft.key
  const hasCosts = await hasCostRecords(draft.id)
  checkingKey.value = null

  if (hasCosts) {
    deleteErrorMessage.value = `「${draft.family_name} ${draft.first_name}」には実績データがあるため削除できません。`
    return
  }

  deletedIds.value.push(draft.id)
  drafts.value = drafts.value.filter((row) => row.key !== draft.key)
  rowErrors.value.delete(draft.key)
}

/**
 * 全行を検証する。問題がなければ true。
 *
 * 画面内のメール重複は Zod では見つけられない（行単体のスキーマなので他の行を
 * 知らない）ため、ここで別途突き合わせる。保存まで通すと Postgres の 23505 が
 * 返り、しかも先に処理された行だけが適用された状態で止まる。
 */
const validate = (): boolean => {
  const errors = new Map<string, MemberRowErrors>()

  for (const draft of drafts.value) {
    const result = memberRowSchema.safeParse(draft)
    if (!result.success) {
      errors.set(draft.key, toMemberRowErrors(result.error.issues))
      continue
    }

    // 検証を通った値（trim 済み）を書き戻す。前後の空白を残したまま保存すると、
    // メールが JWT のクレームと一致せずログインできないメンバーができる。
    Object.assign(draft, result.data)
  }

  const seen = new Map<string, string>()
  for (const draft of drafts.value) {
    if (errors.has(draft.key)) continue

    const duplicatedKey = seen.get(draft.email)
    if (duplicatedKey === undefined) {
      seen.set(draft.email, draft.key)
      continue
    }

    // 重複は両方の行に出す。片方だけだと、どちらを直せばよいか分からない。
    for (const key of [duplicatedKey, draft.key]) {
      errors.set(key, { ...errors.get(key), email: 'メールアドレスが重複しています' })
    }
  }

  rowErrors.value = errors
  return errors.size === 0
}

const handleSave = async () => {
  deleteErrorMessage.value = null
  if (!validate()) return

  const saved = await saveMembers(drafts.value, deletedIds.value, original.value)

  if (!saved) {
    // 部分適用が起きている可能性があるので、DB の実状態を取り直して見せる。
    await load()
    return
  }

  await navigateTo('/members')
}

const handleCancel = async () => {
  if (changedCount.value > 0 && !window.confirm('保存していない変更があります。破棄しますか？')) {
    return
  }
  await navigateTo('/members')
}

const errorFor = (draft: MemberDraft): MemberRowErrors => rowErrors.value.get(draft.key) ?? {}

/** 入力欄の共通クラス。エラー時だけ枠を赤くする。 */
const inputClass = (hasError: boolean) => [
  'w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none',
  'focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
  hasError ? 'border-red-400 bg-red-50' : 'border-slate-200',
]
</script>

<template>
  <div>
    <PageHeader title="メンバー編集" subtitle="姓・名・メールアドレス・単価を一括編集します">
      <template #actions>
        <UButton color="white" class="py-2.5 px-4" :disabled="isSaving" @click="handleCancel">
          キャンセル
        </UButton>
        <UButton icon="i-lucide-check" class="py-2.5 px-4" :loading="isSaving"
          :disabled="isSaving || changedCount === 0" @click="handleSave">
          保存する
        </UButton>
      </template>
    </PageHeader>

    <!-- 注意書き。デザインにある「社内ドメインのみ登録可」は仕様に根拠がないため入れない。 -->
    <div class="mb-4 flex items-center justify-between gap-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
      <div class="flex items-start gap-2 text-sm text-slate-600">
        <UIcon name="i-lucide-info" class="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p>
          ID は自動採番のため変更できません。単価は税抜・1人日あたりの金額を入力してください。
        </p>
      </div>
      <UBadge v-if="changedCount > 0" color="amber" variant="subtle" class="shrink-0">
        変更 {{ changedCount }} 件
      </UBadge>
    </div>

    <!-- 取得失敗 -->
    <UAlert v-if="status === FetchStatus.ERROR" color="red" variant="subtle" icon="i-lucide-circle-alert" class="mb-4"
      :description="errorMessage ?? ''" />

    <!-- 保存失敗 -->
    <UAlert v-if="saveErrorMessage" color="red" variant="subtle" icon="i-lucide-circle-alert" class="mb-4"
      :description="saveErrorMessage" />

    <!-- 削除拒否 -->
    <UAlert v-if="deleteErrorMessage" color="red" variant="subtle" icon="i-lucide-circle-alert" class="mb-4"
      :description="deleteErrorMessage" />

    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <!-- IDLE も含めるのは、onMounted の前に一瞬テーブルが見えるのを防ぐため。 -->
      <div v-if="status === FetchStatus.IDLE || status === FetchStatus.LOADING"
        class="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-500">
        <UIcon name="i-lucide-loader-circle" class="h-5 w-5 animate-spin" />
        <span>読み込み中...</span>
      </div>

      <!--
        0件でも編集はできるので、テーブルは出さずに「追加」だけ見せる。
        取得に失敗しているときは編集させない（保存すると実データを壊しうる）。
      -->
      <template v-else-if="status !== FetchStatus.ERROR">
        <table v-if="drafts.length > 0" class="min-w-full">
          <thead class="bg-slate-50">
            <tr>
              <th scope="col" class="w-24 px-6 py-3 text-left text-xs font-semibold text-slate-500">
                ID
              </th>
              <th scope="col" class="px-3 py-3 text-left text-xs font-semibold text-slate-500">
                姓
              </th>
              <th scope="col" class="px-3 py-3 text-left text-xs font-semibold text-slate-500">
                名
              </th>
              <th scope="col" class="px-3 py-3 text-left text-xs font-semibold text-slate-500">
                メールアドレス
              </th>
              <th scope="col" class="px-3 py-3 text-left text-xs font-semibold text-slate-500">
                単価（円 / 人日）
              </th>
              <th scope="col" class="w-20 px-6 py-3 text-right text-xs font-semibold text-slate-500">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            <tr v-for="draft in drafts" :key="draft.key" class="align-top">
              <!-- 新規行は保存するまで ID が決まらない。空欄の理由はフッターに書いてある。 -->
              <td class="px-6 py-3 text-sm text-slate-400">
                {{ draft.id ?? '—' }}
              </td>

              <td class="px-3 py-3">
                <input v-model="draft.family_name" type="text" maxlength="50"
                  :class="inputClass(!!errorFor(draft).family_name)" :aria-invalid="!!errorFor(draft).family_name"
                  aria-label="姓" />
                <p v-if="errorFor(draft).family_name" class="mt-1 text-xs text-red-600">
                  {{ errorFor(draft).family_name }}
                </p>
              </td>

              <td class="px-3 py-3">
                <input v-model="draft.first_name" type="text" maxlength="50"
                  :class="inputClass(!!errorFor(draft).first_name)" :aria-invalid="!!errorFor(draft).first_name"
                  aria-label="名" />
                <p v-if="errorFor(draft).first_name" class="mt-1 text-xs text-red-600">
                  {{ errorFor(draft).first_name }}
                </p>
              </td>

              <td class="px-3 py-3">
                <input v-model="draft.email" type="email" maxlength="255" :class="inputClass(!!errorFor(draft).email)"
                  :aria-invalid="!!errorFor(draft).email" aria-label="メールアドレス" />
                <p v-if="errorFor(draft).email" class="mt-1 text-xs text-red-600">
                  {{ errorFor(draft).email }}
                </p>
              </td>

              <td class="px-3 py-3">
                <div class="relative">
                  <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                    ¥
                  </span>
                  <!--
                    v-model.number で数値として受ける。空欄にすると NaN になるが、
                    スキーマの invalid_type_error が「単価を入力してください」に訳す。
                  -->
                  <input v-model.number="draft.unit_price" type="number" min="0" step="1" :class="[
                    inputClass(!!errorFor(draft).unit_price),
                    'pl-7 text-right tabular-nums',
                  ]" :aria-invalid="!!errorFor(draft).unit_price" aria-label="単価" />
                </div>
                <p v-if="errorFor(draft).unit_price" class="mt-1 text-xs text-red-600">
                  {{ errorFor(draft).unit_price }}
                </p>
              </td>

              <td class="px-6 py-3 text-right">
                <UButton color="gray" variant="ghost" size="xs" icon="i-lucide-trash-2"
                  :loading="checkingKey === draft.key" :disabled="isSaving || !canDelete(draft) || checkingKey !== null"
                  :aria-label="`${draft.family_name} ${draft.first_name} を削除`" :title="canDelete(draft)
                    ? '削除する'
                    : 'ログイン中の自分自身は削除できません'
                    " @click="removeRow(draft)" />
              </td>
            </tr>
          </tbody>
        </table>

        <p v-else class="px-6 pt-10 text-center text-sm text-slate-500">
          メンバーが登録されていません。「追加」から登録してください。
        </p>

        <div class="px-6 py-4">
          <UButton variant="ghost" icon="i-lucide-plus" :disabled="isSaving"
            class="border border-dashed border-blue-300" @click="addRow">
            追加
          </UButton>
        </div>
      </template>
    </div>

    <p class="mt-3 text-xs text-slate-400">行を追加すると保存時に ID が自動採番されます。</p>
  </div>
</template>

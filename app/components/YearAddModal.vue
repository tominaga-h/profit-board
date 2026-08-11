<script setup lang="ts">
import { fiscalYearInsertSchema } from '~/lib/schemas/fiscalYear'

const props = defineProps<{
  /** 保存中は閉じさせない。処理の途中で消えると成否が分からなくなる。 */
  isSaving: boolean
  /** 保存失敗の理由。重複エラーなど composable 側の判定結果を受け取る。 */
  saveErrorMessage: string | null
}>()

const emit = defineEmits<{ save: [year: number] }>()

const open = defineModel<boolean>({ required: true })

/**
 * 入力値。input[type=number] の v-model は数値を返すが、空欄では '' を返すため
 * 型が揺れる。数値化は保存時に一度だけ行う。
 */
const yearInput = ref<string | number>('')
const validationError = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  yearInput.value = ''
  validationError.value = null
})

const handleSave = () => {
  validationError.value = null

  if (yearInput.value === '') {
    validationError.value = '年度を入力してください'
    return
  }

  const parsed = fiscalYearInsertSchema.safeParse({ year: Number(yearInput.value) })
  if (!parsed.success) {
    validationError.value = '1900〜2999 の範囲で、西暦を整数で入力してください'
    return
  }

  emit('save', parsed.data.year)
}

const handleCancel = () => {
  if (props.isSaving) return
  open.value = false
}
</script>

<template>
  <UModal v-model="open" :prevent-close="isSaving">
    <div class="p-6">
      <h2 class="text-lg font-bold text-slate-900">年度を追加</h2>
      <p class="mt-1 text-sm text-slate-500">西暦で入力してください（例: 2026）。</p>

      <div class="mt-5">
        <label class="mb-1 block text-xs text-slate-500" for="year-input">年度</label>
        <input
          id="year-input"
          v-model="yearInput"
          type="number"
          inputmode="numeric"
          placeholder="2026"
          class="w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          :class="validationError || saveErrorMessage ? 'border-red-400 bg-red-50' : 'border-slate-200'"
          @keyup.enter="handleSave"
        />
        <p v-if="validationError" class="mt-1.5 text-xs text-red-600">{{ validationError }}</p>
        <p v-else-if="saveErrorMessage" class="mt-1.5 text-xs text-red-600">
          {{ saveErrorMessage }}
        </p>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <UButton color="white" variant="solid" :disabled="isSaving" @click="handleCancel">
          キャンセル
        </UButton>
        <UButton icon="i-lucide-check" :loading="isSaving" :disabled="isSaving" @click="handleSave">
          保存する
        </UButton>
      </div>
    </div>
  </UModal>
</template>

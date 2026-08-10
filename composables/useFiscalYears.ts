import type { Database } from '~/types/database.types'
import { FetchStatus } from '~/lib/fetchStatus'

/** m_fiscal_years の一覧画面で扱う列。 */
export type FiscalYear = Pick<
  Database['public']['Tables']['m_fiscal_years']['Row'],
  'id' | 'year'
>

/** 年度マスタをページ単位で取得する。 */
export const useFiscalYears = () => {
  const supabase = useSupabaseClient<Database>()

  const fiscalYears = ref<FiscalYear[]>([])
  const status = ref<FetchStatus>(FetchStatus.IDLE)

  const refetch = async (): Promise<void> => {
    status.value = FetchStatus.LOADING

    const { data, error } = await supabase
      .from('m_fiscal_years')
      .select('id, year')
      .order('year', { ascending: false })

    if (error) {
      console.error('[useFiscalYears] m_fiscal_years の取得に失敗しました', error)
      fiscalYears.value = []
      status.value = FetchStatus.ERROR
      return
    }

    fiscalYears.value = data ?? []
    status.value = FetchStatus.SUCCESS
  }

  onMounted(() => {
    void refetch()
  })

  return { fiscalYears, status, refetch }
}

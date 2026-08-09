<template>
  <div class="flex min-h-screen bg-slate-50">
    <AppSidebar />
    <!--
      min-w-0 が無いと、Task 14 の月次マトリクス（12ヶ月 × 4行の横長テーブル）が
      flex アイテムを押し広げ、サイドバーごとレイアウトが崩れる。
    -->
    <main class="flex-1 min-w-0 overflow-x-auto p-8">
      <slot />
    </main>
  </div>
</template>

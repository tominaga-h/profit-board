<script setup lang="ts">
// replace: true にして、ダッシュボードから戻るボタンを押したときに
// / へ戻ってリダイレクトループになるのを防ぐ。
await navigateTo('/dashboard', { replace: true })
</script>

<template>
  <div />
</template>

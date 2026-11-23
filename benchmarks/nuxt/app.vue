<script setup>
const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com' },
];
</script>

<template>
  <main>
    <h1>Welcome to Nuxt SSR</h1>
    <ul>
      <li v-for="u in users" :key="u.id">{{ u.name }} ({{ u.email }})</li>
    </ul>
  </main>
</template>

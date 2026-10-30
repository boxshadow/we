<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="cyberThemeOverrides">
    <n-loading-bar-provider>
      <n-message-provider>
        <n-notification-provider>
          <n-dialog-provider>
            <router-view v-if="isLoginRoute" />
            <AppLayout v-else />
          </n-dialog-provider>
        </n-notification-provider>
      </n-message-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { darkTheme } from 'naive-ui';
import { cyberThemeOverrides } from './styles/theme';
import AppLayout from './components/AppLayout.vue';

const route = useRoute();
const isLoginRoute = computed(() => route.name === 'login' || route.path === '/login');
</script>

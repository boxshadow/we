import { createApp } from 'vue';
import { createPinia } from 'pinia';
import naive from 'naive-ui';
import router from './router';
import App from './App.vue';

// 通用字体样式
import 'vfonts/Lato.css';
import 'vfonts/FiraCode.css';

const app = createApp(App);

app.use(createPinia());
app.use(naive);
app.use(router);

app.mount('#app');

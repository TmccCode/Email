import { createRouter, createWebHistory } from "vue-router"

// 懒加载页面组件
const routes = [
  { path: "/", name: "home", component: () => import("../Page/Home.vue") },
  { path: "/inbox", name: "inbox", component: () => import("../Page/Inbox.vue") },
]

const router = createRouter({
  history: createWebHistory(), // 使用 HTML5 history 模式
  routes,
})

export default router

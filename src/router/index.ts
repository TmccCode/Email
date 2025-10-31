import { createRouter, createWebHistory } from "vue-router"

const routes = [
  { path: "/", name: "inbox", component: () => import("../Page/Inbox.vue") },
  { path: "/inbox", redirect: "/" },
  { path: "/:pathMatch(.*)*", redirect: "/" },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router

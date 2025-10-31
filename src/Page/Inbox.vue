<script setup lang="ts">
import { computed, ref } from "vue"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-vue-next"

type MailFilter = "all" | "read" | "unread"

interface MailItem {
  id: string
  from: string
  subject: string
  preview: string
  date: string
  unread?: boolean
  body?: string
}

const MAILS: MailItem[] = [
  {
    id: "1",
    from: "noreply@simpleinbox.app",
    subject: "欢迎使用 SimpleInbox",
    preview: "这是一封示例欢迎邮件，用于展示列表样式。",
    date: "10:24",
    unread: true,
    body: "欢迎使用 SimpleInbox！这是示例邮件正文，用于演示打开会话后的最简交互。",
  },
  {
    id: "2",
    from: "ops@yourteam.dev",
    subject: "周报：D1 同步状态",
    preview: "本周 Cloudflare D1 迁移如期完成，详见报告……",
    date: "昨天",
    body: "D1 迁移如期完成，暂无阻塞项。下周计划是……（示例正文）",
  },
  {
    id: "3",
    from: "security@corp.io",
    subject: "重置密钥请求",
    preview: "我们收到了你的密钥重置请求，如非本人操作请忽略……",
    date: "10-29",
    unread: true,
    body: "如果这不是你的操作，请忽略本邮件或联系管理员。（示例正文）",
  },
]

const filter = ref<MailFilter>("all")
const keyword = ref("")
const mails = ref<MailItem[]>(MAILS)
const activeMail = ref<MailItem | null>(null)
const showDeleteConfirm = ref(false)

const filteredMails = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  let data = mails.value

  if (filter.value === "unread") {
    data = data.filter((item) => item.unread)
  } else if (filter.value === "read") {
    data = data.filter((item) => !item.unread)
  }

  if (!q) return data

  return data.filter((item) =>
    [item.from, item.subject, item.preview]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(q)),
  )
})

const openMail = (mail: MailItem) => {
  activeMail.value = mail
  if (mail.unread) {
    mails.value = mails.value.map((item) =>
      item.id === mail.id ? { ...item, unread: false } : item,
    )
  }
}

const closeMail = () => {
  activeMail.value = null
  showDeleteConfirm.value = false
}

const handleDelete = () => {
  if (!activeMail.value) return
  mails.value = mails.value.filter((item) => item.id !== activeMail.value?.id)
  closeMail()
}
</script>

<template>
  <section class="min-h-screen bg-background">
    <div class="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <header class="mb-6 flex flex-col gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-foreground">收件箱</h1>
          <p class="text-sm text-muted-foreground">共 {{ filteredMails.length }} 封邮件</p>
        </div>
        <div class="flex min-w-0 items-center gap-2">
          <div class="relative w-[104px] flex-shrink-0">
            <select
              v-model="filter"
              class="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-left text-sm text-foreground shadow-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="筛选邮件"
            >
              <option value="all">全部</option>
              <option value="unread">未读</option>
              <option value="read">已读</option>
            </select>
            <ChevronDown
              class="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
          <Input
            v-model="keyword"
            data-testid="search"
            placeholder="搜索邮件"
            aria-label="搜索邮件"
            class="h-10 min-w-[140px] flex-1"
          />
        </div>
      </header>

      <div class="rounded-xl border border-border bg-card shadow-xs">
        <div
          v-if="!filteredMails.length"
          class="py-14 text-center text-sm text-muted-foreground"
        >
          没有找到匹配的邮件
        </div>
        <ul v-else class="divide-y divide-border/70" data-testid="mail-list">
          <li
            v-for="mail in filteredMails"
            :key="mail.id"
            class="cursor-pointer px-5 py-4 transition hover:bg-accent/50"
            role="button"
            :aria-label="`打开邮件 ${mail.subject}`"
            @click="openMail(mail)"
          >
            <div class="flex items-start gap-4">
              <span
                class="mt-2 inline-block h-2 w-2 rounded-full border"
                :class="mail.unread ? 'border-transparent bg-primary' : 'border-border bg-transparent'"
                :aria-label="mail.unread ? '未读' : '已读'"
              />
              <div class="min-w-0 flex-1">
                <div
                  class="flex items-baseline gap-2 text-foreground"
                  :class="mail.unread ? 'font-medium' : ''"
                >
                  <span class="truncate" data-testid="subject">{{ mail.subject }}</span>
                </div>
                <p class="truncate text-sm text-muted-foreground" data-testid="meta">
                  来自：{{ mail.from }} · {{ mail.preview }}
                </p>
              </div>
              <span class="mt-1 text-xs text-muted-foreground" data-testid="date">
                {{ mail.date }}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <transition name="fade">
      <div
        v-if="activeMail"
        class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
        role="dialog"
        aria-modal="true"
      >
        <div class="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-lg">
          <header class="space-y-2">
            <h2 class="truncate text-xl font-semibold text-foreground">
              {{ activeMail.subject }}
            </h2>
            <p class="truncate text-xs text-muted-foreground">
              来自：{{ activeMail.from }} · {{ activeMail.date }}
            </p>
          </header>
          <div class="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
            {{ activeMail.body ?? activeMail.preview }}
          </div>
          <footer class="mt-6 flex justify-end gap-2">
            <Button variant="outline" @click="closeMail">关闭</Button>
            <Button variant="destructive" @click="showDeleteConfirm = true">删除</Button>
          </footer>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div
        v-if="showDeleteConfirm"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 p-4 backdrop-blur"
        role="alertdialog"
        aria-modal="true"
      >
        <div class="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg">
          <h3 class="text-lg font-semibold text-foreground">确认删除这封邮件？</h3>
          <p class="mt-2 text-sm text-muted-foreground">
            删除后将无法恢复（当前仅为前端演示数据）。
          </p>
          <div class="mt-6 flex justify-end gap-2">
            <Button variant="outline" @click="showDeleteConfirm = false">取消</Button>
            <Button variant="destructive" @click="handleDelete">删除</Button>
          </div>
        </div>
      </div>
    </transition>
  </section>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

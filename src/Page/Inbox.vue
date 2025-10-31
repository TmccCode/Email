<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-vue-next"

type MailFilter = "all" | "read" | "unread"

interface ApiMailbox {
  id: number
  domain: string
  local_part: string
}

interface ApiMessage {
  id: number
  to_email: string | null
  from_email: string | null
  subject: string | null
  body_text: string | null
  status: string | null
  created_at: number | string | null
  message_id: string | null
}

interface MessageItem {
  id: number
  from: string
  subject: string
  preview: string
  dateLabel: string
  unread: boolean
  raw: ApiMessage
}

const STORAGE_SECRET = "simpleInboxSecret"
const STORAGE_MAILBOX = "simpleInboxMailbox"

const router = useRouter()

const mailbox = ref<ApiMailbox | null>(null)
const secret = ref<string | null>(null)
const mails = ref<MessageItem[]>([])
const activeMail = ref<MessageItem | null>(null)
const filter = ref<MailFilter>("all")
const keyword = ref("")
const loadingList = ref(false)
const listError = ref("")
const showDeleteConfirm = ref(false)
const paging = ref({ offset: 0, limit: 20, next_offset: null as number | null })

const filteredMails = computed(() => {
  const query = keyword.value.trim().toLowerCase()

  let data = mails.value

  if (filter.value === "unread") {
    data = data.filter((item) => item.unread)
  } else if (filter.value === "read") {
    data = data.filter((item) => !item.unread)
  }

  if (!query) return data

  return data.filter((item) =>
    [item.subject, item.from, item.preview]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query)),
  )
})

const formatDate = (source: number | string | null) => {
  if (source == null) return ""

  const date =
    typeof source === "number" ? new Date(source) : new Date(source as string)
  if (Number.isNaN(date.getTime())) return String(source)

  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isToday) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return date.toLocaleDateString()
}

const mapMessage = (item: ApiMessage): MessageItem => {
  const preview =
    (item.body_text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "（无正文预览）"

  return {
    id: item.id,
    from: item.from_email ?? "未知发件人",
    subject: item.subject ?? "（无主题）",
    preview,
    dateLabel: formatDate(item.created_at),
    unread: (item.status ?? "").toLowerCase() === "o1",
    raw: item,
  }
}

const fetchMessages = async (offset = 0) => {
  if (!secret.value) return

  loadingList.value = true
  listError.value = ""

  try {
    const response = await fetch("/api/mailboxes/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        secret: secret.value,
        limit: paging.value.limit,
        offset,
      }),
    })

    if (!response.ok) {
      let message = "加载收件箱失败，请稍后重试。"
      try {
        const data = (await response.json()) as { error?: string }
        if (data?.error) message = data.error
      } catch {
        // ignore
      }

      if ([401, 403, 404].includes(response.status)) {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(STORAGE_SECRET)
          window.sessionStorage.removeItem(STORAGE_MAILBOX)
        }
        listError.value = message
        router.replace({ name: "home" })
        return
      }

      throw new Error(message)
    }

    const data = (await response.json()) as {
      mailbox?: ApiMailbox
      items?: ApiMessage[]
      paging?: { offset: number; limit: number; next_offset: number | null }
    }

    if (data.mailbox) {
      mailbox.value = data.mailbox
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(STORAGE_MAILBOX, JSON.stringify(data.mailbox))
      }
    }

    paging.value = {
      offset: data.paging?.offset ?? offset,
      limit: data.paging?.limit ?? paging.value.limit,
      next_offset:
        typeof data.paging?.next_offset === "number"
          ? data.paging?.next_offset
          : null,
    }

    const mapped = (data.items ?? []).map(mapMessage)
    mails.value = mapped
    activeMail.value = mapped[0] ?? null
  } catch (error) {
    listError.value =
      error instanceof Error ? error.message : "加载收件箱失败，请稍后重试。"
  } finally {
    loadingList.value = false
  }
}

const openMail = (mail: MessageItem) => {
  activeMail.value = mail
  if (mail.unread) {
    mail.unread = false
  }
}

const closeMail = () => {
  activeMail.value = null
  showDeleteConfirm.value = false
}

const handleDelete = () => {
  showDeleteConfirm.value = false
}

const refresh = () => fetchMessages(paging.value.offset)

onMounted(() => {
  if (typeof window === "undefined") return

  const storedSecret = window.sessionStorage.getItem(STORAGE_SECRET)
  if (!storedSecret) {
    router.replace({ name: "home" })
    return
  }

  secret.value = storedSecret

  const storedMailbox = window.sessionStorage.getItem(STORAGE_MAILBOX)
  if (storedMailbox) {
    try {
      mailbox.value = JSON.parse(storedMailbox) as ApiMailbox
    } catch {
      window.sessionStorage.removeItem(STORAGE_MAILBOX)
    }
  }

  fetchMessages(0)
})
</script>

<template>
  <section class="min-h-screen bg-background">
    <div class="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <header class="mb-6 flex flex-col gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-foreground">收件箱</h1>
          <p class="text-sm text-muted-foreground">
            共 {{ mails.length }} 封邮件
          </p>
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
          <Button
            variant="ghost"
            size="sm"
            class="shrink-0"
            :disabled="loadingList"
            @click="refresh"
          >
            刷新
          </Button>
        </div>
      </header>

      <div class="rounded-xl border border-border bg-card shadow-xs">
        <div
          v-if="loadingList"
          class="py-14 text-center text-sm text-muted-foreground"
        >
          正在加载邮件…
        </div>
        <div
          v-else-if="listError"
          class="py-14 text-center text-sm text-destructive"
        >
          {{ listError }}
        </div>
        <div
          v-else-if="!filteredMails.length"
          class="py-14 text-center text-sm text-muted-foreground"
        >
          暂无邮件内容。
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
                {{ mail.dateLabel }}
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
              来自：{{ activeMail.raw.from_email ?? "未知发件人" }} ·
              {{ activeMail.dateLabel }}
            </p>
          </header>
          <div class="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
            {{ activeMail.raw.body_text ?? "（无正文内容）" }}
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
            当前演示环境暂未实现删除功能。
          </p>
          <div class="mt-6 flex justify-end gap-2">
            <Button variant="outline" @click="showDeleteConfirm = false">取消</Button>
            <Button variant="destructive" @click="handleDelete">知道了</Button>
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

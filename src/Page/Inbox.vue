<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"
import { ChevronDown, RotateCw, Trash2 } from "lucide-vue-next"

type MailFilter = "all" | "unread" | "read"

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
  textBody: string
  htmlBody: string | null
  raw: ApiMessage
}

const API_BASE = "https://eamilapi.saas-176001.workers.dev"

const secret = ref<string | null>(null)
const mailboxEmail = ref("")
const messages = ref<MessageItem[]>([])
const activeId = ref<number | null>(null)

const filter = ref<MailFilter>("all")
const keyword = ref("")

const loadingList = ref(false)
const listError = ref("")

const paging = ref({ page: 1, pageSize: 10, total: 0 })

const deleteLoading = ref(false)
const showDeleteConfirm = ref(false)

const MISSING_SECRET_MESSAGE = "缺少访问密钥,请检查链接是否正确!"

const getSecretFromLocation = (): string | null => {
  if (typeof window === "undefined") return null
  const params = new URLSearchParams(window.location.search)
  const value = params.get("key")?.trim()
  return value && value.length > 0 ? value : null
}

const decodeBase64 = (value: string) => {
  const cleaned = value.replace(/\s+/g, "")
  try {
    const atobFn = (globalThis as typeof globalThis & { atob?: (input: string) => string }).atob
    if (typeof atobFn === "function") {
      const binary = atobFn(cleaned)
      const len = binary.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes)
    }
  } catch {
    // ignore errors
  }
  return value
}

const sanitizeHtml = (source: string) => {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(source, "text/html")
    doc.querySelectorAll("script,style").forEach((el) => el.remove())
    doc.querySelectorAll("*").forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.startsWith("on")) {
          el.removeAttribute(attr.name)
        }
      })
    })
    return doc.body.innerHTML
  } catch {
    return source
  }
}

const extractBodies = (raw: string | null): { text: string; html: string | null } => {
  if (!raw) return { text: "（无正文内容）", html: null }

  const partPattern =
    /Content-Type:\s*([^\s;]+)[\s\S]*?Content-Transfer-Encoding:\s*([^\s]+)[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=(?:\r?\n------|$))/gi

  let plain: string | null = null
  let html: string | null = null

  let match: RegExpExecArray | null
  while ((match = partPattern.exec(raw))) {
    const contentType = match[1]?.toLowerCase() ?? ""
    const encoding = match[2]?.toLowerCase() ?? ""
    let payload = match[3]?.trim() ?? ""
    if (!payload) continue

    if (encoding === "base64") {
      payload = decodeBase64(payload)
    }

    if (contentType === "text/plain" && !plain) {
      plain =
        payload
          .replace(/\r\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim() || payload
    }

    if (contentType === "text/html" && !html) {
      html = sanitizeHtml(payload)
    }
  }

  const trimmedRaw = raw.trim()

  if (!html) {
    const looksLikeHtml = /<(html|body|head|table|div|span|p)\b/i.test(trimmedRaw)
    if (looksLikeHtml) {
      html = sanitizeHtml(trimmedRaw)
    }
  }

  if (!plain && html) {
    plain = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<\/p>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\s*\n\s*/g, "\n")
      .trim()
  }

  if (!plain) {
    const maybeBase64 = raw?.replace(/[\r\n-_=]+/g, "") ?? ""
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(maybeBase64)) {
      plain = decodeBase64(maybeBase64)
    }
  }

  if (!plain && trimmedRaw) {
    plain = trimmedRaw
  }

  return {
    text: plain?.trim() || trimmedRaw || "（无正文内容）",
    html,
  }
}

const formatDate = (input: number | string | null) => {
  if (input == null) return ""
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return String(input)

  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  }

  return date.toLocaleDateString()
}

const mapMessage = (item: ApiMessage): MessageItem => {
  const bodies = extractBodies(item.body_text)
  const preview = bodies.text.replace(/\s+/g, " ").trim().slice(0, 80) || "（无正文内容）"

  return {
    id: item.id,
    from: item.from_email ?? "未知发件人",
    subject: item.subject ?? "（无主题）",
    preview,
    dateLabel: formatDate(item.created_at),
    unread: (item.status ?? "").toLowerCase() === "o1",
    textBody: bodies.text,
    htmlBody: bodies.html,
    raw: item,
  }
}

const filteredMessages = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return messages.value

  return messages.value.filter((item) =>
    [item.subject, item.from, item.preview]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(q)),
  )
})

const activeMessage = computed(() =>
  messages.value.find((item) => item.id === activeId.value) ?? null,
)

const handleInvalidSecret = (message: string) => {
  secret.value = null
  mailboxEmail.value = ""
  messages.value = []
  paging.value = { page: 1, pageSize: paging.value.pageSize, total: 0 }
  activeId.value = null
  listError.value = message
  loadingList.value = false
  showDeleteConfirm.value = false
}

const fetchMessages = async (pageParam = 1) => {
  if (!secret.value) {
    handleInvalidSecret(MISSING_SECRET_MESSAGE)
    return
  }

  loadingList.value = true
  listError.value = ""

  const params = new URLSearchParams({
    key: secret.value,
    page: String(pageParam),
    limit: String(paging.value.pageSize),
  })

  if (filter.value === "unread") {
    params.set("status", "o1")
  } else if (filter.value === "read") {
    params.set("status", "o2")
  }

  try {
    const response = await fetch(`${API_BASE}/inbox?${params.toString()}`, { method: "GET" })
    const data = (await response.json()) as {
      ok: boolean
      msg?: string
      email?: string
      page?: number
      limit?: number
      total?: number
      list?: ApiMessage[]
    }

    if (!response.ok || !data.ok) {
      const message =
        typeof data.msg === "string" && data.msg.trim()
          ? data.msg.trim()
          : "加载收件箱失败，请稍后重试。"
      if (message.includes("密钥")) {
        handleInvalidSecret(message)
      } else {
        listError.value = message
      }
      return
    }

    mailboxEmail.value = typeof data.email === "string" ? data.email : mailboxEmail.value

    const mapped = (data.list ?? []).map(mapMessage)
    messages.value = mapped

    paging.value = {
      page: data.page ?? pageParam,
      pageSize: data.limit ?? paging.value.pageSize,
      total: data.total ?? mapped.length,
    }

    if (activeId.value != null && !mapped.some((item) => item.id === activeId.value)) {
      activeId.value = null
    }
  } catch (error) {
    listError.value = error instanceof Error ? error.message : "加载收件箱失败，请稍后重试。"
  } finally {
    loadingList.value = false
  }
}

const handlePopstate = () => {
  const nextSecret = getSecretFromLocation()
  if (!nextSecret) {
    handleInvalidSecret(MISSING_SECRET_MESSAGE)
    return
  }

  if (nextSecret !== secret.value) {
    secret.value = nextSecret
    fetchMessages(1)
  }
}

const refresh = () => {
  console.log("-------",fetchMessages(paging.value.page))
  
}

const openMessage = (item: MessageItem) => {
  activeId.value = item.id
  if (item.unread) {
    item.unread = false
  }
}

const closeMessage = () => {
  activeId.value = null
  showDeleteConfirm.value = false
}

const requestDelete = () => {
  if (!activeMessage.value || !secret.value) return
  showDeleteConfirm.value = true
}

const deleteMessage = async () => {
  const current = activeMessage.value
  if (!current || !secret.value) return

  deleteLoading.value = true
  try {
    const response = await fetch(`${API_BASE}/delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: secret.value, id: current.id }),
    })

    const data = (await response.json()) as { ok: boolean; msg?: string }

    if (!response.ok || !data.ok) {
      const message =
        typeof data.msg === "string" && data.msg.trim()
          ? data.msg.trim()
          : "删除失败，请稍后重试。"
      throw new Error(message)
    }

    messages.value = messages.value.filter((item) => item.id !== current.id)
    paging.value.total = Math.max(0, paging.value.total - 1)
    showDeleteConfirm.value = false
    activeId.value = null
  } catch (error) {
    listError.value = error instanceof Error ? error.message : "删除失败，请稍后重试。"
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => {
  const initialSecret = getSecretFromLocation()
  if (!initialSecret) {
    handleInvalidSecret(MISSING_SECRET_MESSAGE)
    return
  }

  secret.value = initialSecret
  fetchMessages(1)

  if (typeof window !== "undefined") {
    window.addEventListener("popstate", handlePopstate)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("popstate", handlePopstate)
  }
})

watch(filter, (value, prev) => {
  if (value === prev) return
  paging.value.page = 1
  if (secret.value) {
    fetchMessages(1)
  }
})

watch(
  () => paging.value.page,
  (value, prev) => {
    if (value === prev) return
    if (secret.value) {
      fetchMessages(value)
    }
  },
)

</script>

<template>
  <section class="relative min-h-screen bg-background">
    <div class="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <header class="mb-6 flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight text-foreground">收件箱</h1>
            <p class="text-sm text-muted-foreground">
              共 {{ paging.total }} 封邮件
            </p>
            <p v-if="mailboxEmail" class="text-xs text-muted-foreground">
              当前邮箱：{{ mailboxEmail }}
            </p>
            <p v-else-if="secret" class="text-xs text-muted-foreground">
              当前密钥：{{ secret }}
            </p>
          </div>
        </div>
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <div class="relative w-[140px] flex-shrink-0">
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
            type="button"
            variant="outline"
            class="flex h-10 items-center gap-1 px-4"
            :disabled="loadingList"
            @click="refresh"
          >
            <RotateCw class="size-4" />
            刷新
          </Button>
        </div>
      </header>

      <div class="rounded-xl border border-border bg-card shadow-xs">
        <div
          v-if="loadingList"
          class="py-14 text-center text-sm text-muted-foreground"
        >
          正在加载邮件...
        </div>
        <div v-else-if="listError" class="py-14">
          <Card class="mx-auto max-w-sm text-center shadow-none">
            <CardHeader class="space-y-2">
              <CardDescription class="text-sm leading-6 text-muted-foreground">
                {{ listError }}
              </CardDescription>
            </CardHeader>
            <CardFooter v-if="secret" class="flex justify-center">
              <Button
                type="button"
                variant="outline"
                class="flex h-10 items-center gap-1 px-4"
                :disabled="loadingList"
                @click="refresh"
              >
                <RotateCw class="size-4" />
                重试
              </Button>
            </CardFooter>
          </Card>
        </div>
        <div
          v-else-if="!filteredMessages.length"
          class="py-14 text-center text-sm text-muted-foreground"
        >
          暂无邮件内容。
        </div>
        <ul v-else class="divide-y divide-border/70" data-testid="mail-list">
          <li
            v-for="mail in filteredMessages"
            :key="mail.id"
            class="cursor-pointer px-5 py-4 transition hover:bg-accent/50"
            role="button"
            :aria-label="`打开邮件 ${mail.subject}`"
            @click="openMessage(mail)"
          >
            <div class="flex items-start gap-4">
              <span
                class="mt-2 inline-block h-2 w-2 rounded-full border"
                :class="mail.unread ? 'border-transparent bg-primary' : 'border-border bg-transparent'"
                :aria-label="mail.unread ? '未读' : '已读'"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2 text-foreground">
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
        v-if="activeMessage"
        class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
        role="dialog"
        aria-modal="true"
      >
        <div class="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-lg">
          <header class="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div class="space-y-2">
              <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                来自 {{ activeMessage.from }}
              </p>
              <h2 class="text-xl font-semibold text-foreground">
                {{ activeMessage.subject }}
              </h2>
              <p class="text-xs text-muted-foreground">
                {{ activeMessage.dateLabel }}
              </p>
            </div>
            <Button variant="ghost" size="sm" @click="closeMessage">关闭</Button>
          </header>
          <main class="max-h-[60vh] overflow-auto px-6 py-6 text-sm leading-7 text-foreground/90">
            <template v-if="activeMessage?.htmlBody">
              <div class="prose prose-sm max-w-none break-words" v-html="activeMessage.htmlBody" />
            </template>
            <template v-else>
              <pre class="whitespace-pre-wrap break-words text-sm leading-7">
{{ activeMessage?.textBody }}
              </pre>
            </template>
          </main>
          <footer class="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button variant="ghost" @click="closeMessage">关闭</Button>
            <Button
              variant="destructive"
              class="gap-1"
              :disabled="deleteLoading"
              @click="requestDelete"
            >
              <Trash2 class="size-4" />
              删除
            </Button>
          </footer>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div
        v-if="showDeleteConfirm"
        class="fixed inset-0 z-[60] flex items-center justify-center gap-4 bg-background/90 p-4 backdrop-blur"
        role="alertdialog"
        aria-modal="true"
      >
        <div class="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg">
          <h3 class="text-lg font-semibold text-foreground">确认删除这封邮件？</h3>
          <p class="mt-2 text-sm text-muted-foreground">
            删除后无法恢复，请确认已保留重要信息。
          </p>
          <div class="mt-6 flex justify-end gap-2">
            <Button variant="outline" @click="showDeleteConfirm = false">取消</Button>
            <Button
              variant="destructive"
              :disabled="deleteLoading"
              @click="deleteMessage"
            >
              删除
            </Button>
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

.prose :where(pre) {
  white-space: pre-wrap;
}
</style>

<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import { Inbox, KeyRound, Loader2, ShieldCheck } from "lucide-vue-next"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const STORAGE_SECRET = "simpleInboxSecret"
const STORAGE_MAILBOX = "simpleInboxMailbox"

const router = useRouter()
const accessKey = ref("")
const loading = ref(false)
const errorMessage = ref("")

const API_BASE = "https://eamilapi.saas-176001.workers.dev"

const handleSubmit = async (event: Event) => {
  event.preventDefault()
  const secret = accessKey.value.trim()
  if (!secret || loading.value) return

  loading.value = true
  errorMessage.value = ""

  try {
    const response = await fetch(`${API_BASE}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ key: secret }),
    })

    const data = (await response.json()) as {
      ok: boolean
      msg?: string
      email?: string
      [key: string]: unknown
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.msg || "密钥验证失败，请重试。")
    }

    const emailAddress = data.email ?? ""
    let mailboxPayload: unknown = null
    if (emailAddress.includes("@")) {
      const [local, domain] = emailAddress.split("@", 2)
      mailboxPayload = {
        email: emailAddress,
        domain,
        local_part: local,
      }
    }

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_SECRET, secret)
      if (mailboxPayload) {
        try {
          window.sessionStorage.setItem(
            STORAGE_MAILBOX,
            JSON.stringify(mailboxPayload),
          )
        } catch {
          window.sessionStorage.removeItem(STORAGE_MAILBOX)
        }
      }
    }

    await router.push({ name: "inbox" })
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "验证失败，请稍后再试。"
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(STORAGE_SECRET)
      window.sessionStorage.removeItem(STORAGE_MAILBOX)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="relative isolate overflow-hidden bg-background">
    <div class="pointer-events-none absolute inset-0 mix-blend-soft-light">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,theme(colors.primary.DEFAULT)/0.18,transparent_65%)]" />
      <div class="absolute -top-24 left-20 h-56 w-56 rounded-full bg-primary/25 blur-[120px] sm:h-72 sm:w-72 lg:h-96 lg:w-96" />
      <div class="absolute -bottom-24 right-10 h-56 w-56 rounded-full bg-secondary/20 blur-[110px] sm:h-72 sm:w-72 lg:h-[26rem] lg:w-[26rem]" />
    </div>

    <div class="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-6 sm:px-6 lg:px-10">
      <div class="grid w-full gap-8 lg:gap-14 xl:grid-cols-[1.05fr_0.95fr]">
        <form
          @submit="handleSubmit"
          class="order-first flex flex-col gap-6 rounded-3xl border border-primary/20 bg-card/90 p-6 shadow-[0_30px_80px_-45px_rgba(59,130,246,0.55)] backdrop-blur-md sm:p-8 lg:order-last lg:p-10"
        >
          <div class="space-y-3 text-center sm:text-left">
            <span class="inline-flex items-center gap-2 self-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary sm:self-start">
              <KeyRound class="size-3.5" /> access portal
            </span>
            <h2 class="text-2xl font-semibold text-foreground sm:text-3xl">
              输入密钥以继续
            </h2>
            <p class="text-sm text-muted-foreground sm:text-base">
              验证成功后将自动跳转至 Inbox 页面。如忘记密钥，请联系管理员重置。
            </p>
          </div>

          <div class="space-y-2">
            <label for="access-key" class="text-sm font-medium text-foreground sm:text-base">
              密钥
            </label>
            <Input
              id="access-key"
              v-model.trim="accessKey"
              type="password"
              placeholder="sk_inbox_..."
              inputmode="text"
              autocomplete="one-time-code"
              autofocus
            />
          </div>

          <Button
            type="submit"
            class="w-full gap-2 rounded-2xl bg-gradient-to-r from-primary via-primary/90 to-primary/80 py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:from-primary/95 hover:to-primary sm:py-5 sm:text-lg"
            :disabled="!accessKey || loading"
          >
            <template v-if="loading">
              <Loader2 class="size-5 animate-spin" /> 正在验证…
            </template>
            <template v-else>
              <KeyRound class="size-5" /> 解锁收件箱
            </template>
          </Button>

          <p
            v-if="errorMessage"
            class="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:text-base"
          >
            {{ errorMessage }}
          </p>

          <p class="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            提示：建议在公共设备访问时开启隐身模式，完成后退出浏览器并清除剪贴板。
          </p>
        </form>

        <article
          class="order-last flex flex-col justify-center gap-8 rounded-3xl border border-border/50 bg-background/80 p-6 text-center shadow-[0_40px_90px_-55px_rgba(15,23,42,0.65)] backdrop-blur-xl sm:p-8 lg:order-first lg:p-12 lg:text-left"
        >
          <header class="space-y-4">
            <h1 class="text-3xl font-semibold leading-tight sm:text-[2.6rem] sm:leading-snug">
              欢迎回到 SimpleInbox
            </h1>
            <p class="text-base leading-relaxed text-muted-foreground sm:text-lg">
              使用专属密钥完成验证，即刻查看你的待办、通知和团队对话。
            </p>
          </header>

          <dl class="grid gap-4 text-left sm:grid-cols-2">
            <div class="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm">
              <div class="flex items-start gap-3">
                <ShieldCheck class="mt-0.5 size-4 text-primary" />
                <div class="space-y-1.5">
                  <dt class="text-sm font-semibold text-foreground">本地快速校验</dt>
                  <dd class="text-sm text-muted-foreground">
                    验证过程仅在浏览器内完成，密钥不会上传或持久化。
                  </dd>
                </div>
              </div>
            </div>
            <div class="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm">
              <div class="flex items-start gap-3">
                <Inbox class="mt-0.5 size-4 text-primary" />
                <div class="space-y-1.5">
                  <dt class="text-sm font-semibold text-foreground">即时同步</dt>
                  <dd class="text-sm text-muted-foreground">
                    验证通过后立刻带你回到工作上下文，无需再次确认。
                  </dd>
                </div>
              </div>
            </div>
          </dl>

          <div class="rounded-2xl border border-border/60 bg-background/70 p-4 text-left text-sm text-muted-foreground sm:text-base">
            <p class="font-semibold text-foreground">温馨提示</p>
            <p class="mt-2 leading-relaxed">
              建议每 30 天更换一次访问密钥，并将旧密钥从密码管理器中移除，以保障团队资源安全。
            </p>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import { KeyRound, Loader2 } from "lucide-vue-next"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

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
      const message =
        typeof data.msg === "string" && data.msg.trim()
          ? data.msg.trim()
          : "密钥验证失败，请重试。"
      throw new Error(message)
    }

    const emailAddress =
      typeof data.email === "string" && data.email.includes("@")
        ? data.email.trim()
        : ""

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_SECRET, secret)
      if (emailAddress) {
        try {
          window.sessionStorage.setItem(
            STORAGE_MAILBOX,
            JSON.stringify({ email: emailAddress }),
          )
        } catch {
          window.sessionStorage.removeItem(STORAGE_MAILBOX)
        }
      } else {
        window.sessionStorage.removeItem(STORAGE_MAILBOX)
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
  <section class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
    <form class="w-full max-w-sm" @submit="handleSubmit">
      <Card>
        <CardHeader class="space-y-2 text-center">
          <CardTitle class="flex items-center justify-center gap-2 text-2xl font-semibold text-foreground">
            <KeyRound class="size-5 text-primary" />
            访问收件箱
          </CardTitle>
          <CardDescription class="text-sm text-muted-foreground">
            输入访问密钥继续查看邮件。
          </CardDescription>
        </CardHeader>

        <CardContent class="space-y-4">
          <div class="space-y-2">
            <Label for="access-key">访问密钥</Label>
            <Input
              id="access-key"
              v-model.trim="accessKey"
              type="password"
              placeholder="sk_inbox_..."
              autocomplete="one-time-code"
              inputmode="text"
              autofocus
            />
          </div>

          <p
            v-if="errorMessage"
            class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {{ errorMessage }}
          </p>
        </CardContent>

        <CardFooter>
          <Button class="w-full gap-2" type="submit" :disabled="!accessKey || loading">
            <template v-if="loading">
              <Loader2 class="size-4 animate-spin" />
              正在验证
            </template>
            <template v-else>
              解锁收件箱
            </template>
          </Button>
        </CardFooter>
      </Card>
    </form>
  </section>
</template>

/// <reference types="@cloudflare/workers-types" />

const json = (status: number, data: unknown): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })

type Env = {
  TmEmail: D1Database
}

interface MailboxRecord {
  id: number
  domain: string
  local_part: string
  status: string | null
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method Not Allowed" })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return json(400, { error: "Invalid JSON body" })
  }

  const { secret, id } = payload as { secret?: unknown; id?: unknown }

  const normalizedSecret =
    typeof secret === "string" ? secret.trim() : ""

  const messageId =
    typeof id === "number" && Number.isFinite(id)
      ? Math.trunc(id)
      : typeof id === "string" && id.trim() !== ""
        ? Number.parseInt(id.trim(), 10)
        : NaN

  if (!normalizedSecret) {
    return json(400, { error: "缺少密钥" })
  }

  if (!Number.isFinite(messageId)) {
    return json(400, { error: "缺少邮件编号" })
  }

  try {
    const mailboxStmt = env.TmEmail.prepare<[string], MailboxRecord>(
      `SELECT id, domain, local_part, status
       FROM mailboxes
       WHERE secret = ? COLLATE NOCASE
       LIMIT 1`,
    )

    const mailbox = await mailboxStmt.bind(normalizedSecret).first()

    if (!mailbox) {
      return json(404, { error: "未找到对应的密钥" })
    }

    if ((mailbox.status ?? "").toLowerCase() !== "active") {
      return json(403, {
        error: "密钥已停用，请联系管理员",
        status: mailbox.status,
      })
    }

    const updateStmt = env.TmEmail.prepare<[number, string, string]>(
      `UPDATE email_inbox
       SET status = 'o2'
       WHERE id = ?
         AND domain = ?
         AND local_part = ?`,
    )

    const outcome = await updateStmt
      .bind(messageId, mailbox.domain, mailbox.local_part)
      .run()

    if (!outcome.success || (outcome.meta?.changes ?? 0) === 0) {
      return json(404, { error: "邮件不存在或状态未更新" })
    }

    return json(200, { success: true })
  } catch (error) {
    console.error("mark message read failed", error)
    return json(500, { error: "服务器内部错误，请稍后重试" })
  }
}

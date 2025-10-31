/// <reference types="@cloudflare/workers-types" />

const json = (status: number, data: unknown): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })

interface MailboxRecord {
  id: number
  domain: string
  local_part: string
  status: string | null
}

interface EmailRecord {
  id: number
  domain: string
  local_part: string
  to_email: string | null
  from_email: string | null
  subject: string | null
  body_text: string | null
  status: string | null
  created_at: number | string | null
  message_id: string | null
}

type Env = {
  TmEmail: D1Database
}

const MAX_LIMIT = 100

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

  const { secret, limit, offset } = payload as {
    secret?: unknown
    limit?: unknown
    offset?: unknown
  }

  const normalizedSecret =
    typeof secret === "string" ? secret.trim() : ""

  if (!normalizedSecret) {
    return json(400, { error: "缺少密钥" })
  }

  let take = 20
  if (typeof limit === "number" && Number.isFinite(limit)) {
    take = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)))
  }

  let skip = 0
  if (typeof offset === "number" && Number.isFinite(offset)) {
    skip = Math.max(0, Math.trunc(offset))
  }

  try {
    const mailboxStmt = env.TmEmail.prepare<
      [string],
      MailboxRecord
    >(
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
      return json(403, { error: "密钥已停用，请联系管理员", status: mailbox.status })
    }

    const emailStmt = env.TmEmail.prepare<
      [string, string, number, number],
      EmailRecord
    >(
      `SELECT id,
              domain,
              local_part,
              to_email,
              from_email,
              subject,
              body_text,
              status,
              created_at,
              message_id
       FROM email_inbox
       WHERE domain = ?
         AND local_part = ?
         AND status IN ('o1','o2')
       ORDER BY created_at DESC
       LIMIT ?
       OFFSET ?`,
    )

    const emails = await emailStmt
      .bind(mailbox.domain, mailbox.local_part, take, skip)
      .all()

    const items =
      emails?.results?.map((item) => ({
        id: item.id,
        to_email: item.to_email,
        from_email: item.from_email,
        subject: item.subject,
        body_text: item.body_text,
        status: item.status,
        created_at:
          typeof item.created_at === "number"
            ? new Date(item.created_at).toISOString()
            : item.created_at,
        message_id: item.message_id,
      })) ?? []

    return json(200, {
      mailbox: {
        id: mailbox.id,
        domain: mailbox.domain,
        local_part: mailbox.local_part,
      },
      paging: {
        offset: skip,
        limit: take,
        returned: items.length,
        next_offset: items.length === take ? skip + take : null,
      },
      items,
    })
  } catch (error) {
    console.error("email inbox query failed", error)
    return json(500, { error: "服务器内部错误，请稍后重试" })
  }
}

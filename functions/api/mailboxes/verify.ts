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
  secret: string
  domain: string
  local_part: string
  status: string | null
  created_at: number | string | null
}

type Env = {
  TmEmail: D1Database
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

  const secret =
    typeof (payload as Record<string, unknown>)?.secret === "string"
      ? ((payload as Record<string, unknown>).secret as string).trim()
      : ""

  if (!secret) {
    return json(400, { error: "Missing field `secret`" })
  }

  try {
    const statement = env.TmEmail.prepare<
      [string],
      MailboxRecord
    >(
      `SELECT id, secret, domain, local_part, status, created_at FROM mailboxes WHERE secret = ? COLLATE NOCASE LIMIT 1`,
    )

    const result = await statement.bind(secret).first()

    if (!result) {
      return json(404, { error: "未找到对应的密钥" })
    }

    if (result.status && result.status.toLowerCase() !== "active") {
      return json(403, {
        error: "密钥已停用，请联系管理员",
        status: result.status,
      })
    }

    const createdAt =
      typeof result.created_at === "number"
        ? new Date(result.created_at).toISOString()
        : result.created_at

    return json(200, {
      mailbox: {
        id: result.id,
        domain: result.domain,
        local_part: result.local_part,
        status: result.status ?? null,
        created_at: createdAt,
      },
    })
  } catch (error) {
    console.error("TmEmail lookup failure", error)
    return json(500, { error: "服务器内部错误，请稍后重�? })
  }
}

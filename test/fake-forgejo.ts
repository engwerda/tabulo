export const FORGEJO_URL = "https://forgejo.example"

export type RecordedRequest = {
  readonly method: string
  readonly path: string
  readonly query: URLSearchParams
  readonly authorization: string | null
  readonly form: URLSearchParams
}

export type SearchFilter = "review_requested" | "assigned" | "mentioned" | "created"

export type FakeForgejoFixtures = {
  readonly user: { id: number; login: string; full_name: string; avatar_url: string }
  readonly issues: Partial<Record<SearchFilter, ReadonlyArray<unknown>>>
  readonly totals: Partial<Record<SearchFilter, number>>
  readonly notifications: ReadonlyArray<unknown>
  readonly failingSearches: ReadonlyArray<SearchFilter>
  readonly expiresIn: number
  readonly rejectRefresh: boolean
}

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  })

const sha256Base64Url = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

/**
 * An in-memory Forgejo that implements the OAuth2 token endpoint (with PKCE
 * verification) and the API endpoints Tabulo reads.
 */
export const createFakeForgejo = (overrides: Partial<FakeForgejoFixtures> = {}) => {
  const fixtures: FakeForgejoFixtures = {
    user: {
      id: 7,
      login: "ada",
      full_name: "Ada Lovelace",
      avatar_url: `${FORGEJO_URL}/avatars/ada`,
    },
    issues: {},
    totals: {},
    notifications: [],
    failingSearches: [],
    expiresIn: 3600,
    rejectRefresh: false,
    ...overrides,
  }
  const requests: Array<RecordedRequest> = []
  const authorizationCodes = new Map<string, string>()
  const validAccessTokens = new Set<string>()
  const validRefreshTokens = new Set<string>()
  let issued = 0

  const issueTokens = () => {
    issued += 1
    const access = `access-${issued}`
    const refresh = `refresh-${issued}`
    validAccessTokens.add(access)
    validRefreshTokens.add(refresh)
    return json({
      access_token: access,
      refresh_token: refresh,
      token_type: "bearer",
      expires_in: fixtures.expiresIn,
    })
  }

  const tokenEndpoint = (form: URLSearchParams) => {
    if (
      form.get("client_id") !== "test-client-id" ||
      form.get("client_secret") !== "test-client-secret"
    ) {
      return json({ error: "unauthorized_client" }, { status: 401 })
    }
    if (form.get("grant_type") === "authorization_code") {
      const code = form.get("code") ?? ""
      const challenge = authorizationCodes.get(code)
      authorizationCodes.delete(code)
      return sha256Base64Url(form.get("code_verifier") ?? "").then((computed) =>
        challenge !== undefined &&
        computed === challenge &&
        form.get("redirect_uri") === "https://tabulo.example/auth/callback"
          ? issueTokens()
          : json({ error: "invalid_grant" }, { status: 400 }),
      )
    }
    if (form.get("grant_type") === "refresh_token") {
      const refresh = form.get("refresh_token") ?? ""
      if (fixtures.rejectRefresh || !validRefreshTokens.has(refresh)) {
        return json({ error: "invalid_grant" }, { status: 400 })
      }
      validRefreshTokens.delete(refresh)
      validAccessTokens.delete(refresh.replace("refresh-", "access-"))
      return issueTokens()
    }
    return json({ error: "unsupported_grant_type" }, { status: 400 })
  }

  const api = (path: string, query: URLSearchParams) => {
    if (path === "/api/v1/user") return json(fixtures.user)
    if (path === "/api/v1/notifications") {
      return json(fixtures.notifications, {
        headers: { "x-total-count": String(fixtures.notifications.length) },
      })
    }
    if (path === "/api/v1/repos/issues/search") {
      const filter = (["review_requested", "assigned", "mentioned", "created"] as const).find(
        (name) => query.get(name) === "true",
      )
      if (filter === undefined) return json({ message: "no filter" }, { status: 422 })
      if (fixtures.failingSearches.includes(filter)) {
        return json({ message: "internal error" }, { status: 500 })
      }
      const items = fixtures.issues[filter] ?? []
      return json(items, {
        headers: { "x-total-count": String(fixtures.totals[filter] ?? items.length) },
      })
    }
    return json({ message: "not found" }, { status: 404 })
  }

  const fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (url.origin !== FORGEJO_URL) throw new Error(`unexpected outbound request to ${url.origin}`)
    const body = request.method === "POST" ? await request.text() : ""
    const form =
      request.headers.get("content-type")?.includes("application/json") === true
        ? new URLSearchParams(JSON.parse(body) as Record<string, string>)
        : new URLSearchParams(body)
    const authorization = request.headers.get("authorization")
    requests.push({
      method: request.method,
      path: url.pathname,
      query: url.searchParams,
      authorization,
      form,
    })
    if (url.pathname === "/login/oauth/access_token" && request.method === "POST") {
      return tokenEndpoint(form)
    }
    const token = authorization?.replace(/^Bearer /, "") ?? ""
    if (!validAccessTokens.has(token)) return json({ message: "unauthorized" }, { status: 401 })
    return api(url.pathname, url.searchParams)
  }

  return {
    fetch,
    requests,
    /** Simulates the user approving the app on Forgejo's authorize page. */
    approve: (codeChallenge: string) => {
      const code = `code-${authorizationCodes.size + 1}`
      authorizationCodes.set(code, codeChallenge)
      return code
    },
    revokeAccessTokens: () => validAccessTokens.clear(),
  }
}

type Audience = 'buyer' | 'seller'
type FeedConfig = {
  url: string
  host: string
  sourceName: string
  audience: Audience[]
  category: string
  keywords?: string[]
}
type FeedItem = { title: string; link: string; description: string; coverUrl: string | null; publishedAt: Date }
type EducationArticle = {
  slug: string
  title: string
  summary: string
  body: string
  category: string
  cover_url: string | null
  audience: Audience[]
  source_name: string
  source_url: string
  source_published_at: string
  published_at: string
  synced_at: string
}

const maxFeedBytes = 1_000_000
const maxItemsPerFeed = 8
const recentWindowMs = 120 * 24 * 60 * 60 * 1000

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractTag(xml: string, name: string) {
  const expression = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')
  return expression.exec(xml)?.[1]?.trim() ?? ''
}

function extractAttribute(tag: string, name: string) {
  const expression = new RegExp(`\\b${name}=["']([^"']+)["']`, 'i')
  return expression.exec(tag)?.[1] ?? ''
}

function isImageUrl(value: string) {
  try {
    const url = new URL(value, 'https://image.invalid')
    return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)
  } catch {
    return false
  }
}

function safeImageUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(decodeXml(value), baseUrl)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function extractCoverUrl(entry: string, articleUrl: string) {
  const mediaTags = [...entry.matchAll(/<(media:content|media:thumbnail|enclosure)\b([^>]*?)\/?>/gi)]
  for (const [, tagName, attributes] of mediaTags) {
    const url = extractAttribute(attributes, 'url')
    const type = extractAttribute(attributes, 'type').toLowerCase()
    const medium = extractAttribute(attributes, 'medium').toLowerCase()
    const isThumbnail = tagName.toLowerCase() === 'media:thumbnail'
    if (!url || !(isThumbnail || medium === 'image' || type.startsWith('image/') || isImageUrl(url))) continue
    const coverUrl = safeImageUrl(url, articleUrl)
    if (coverUrl) return coverUrl
  }

  const content = decodeXml(extractTag(entry, 'content:encoded') || extractTag(entry, 'content') || extractTag(entry, 'description') || extractTag(entry, 'summary'))
  for (const imageTag of content.matchAll(/<img\b[^>]*>/gi)) {
    const source = extractAttribute(imageTag[0], 'src') || extractAttribute(imageTag[0], 'data-src')
    if (!source) continue
    const coverUrl = safeImageUrl(source, articleUrl)
    if (coverUrl) return coverUrl
  }
  return null
}

function cleanText(value: string) {
  return decodeXml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 480)
}

function parseFeed(xml: string, feed: FeedConfig): FeedItem[] {
  const entries = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
  const now = Date.now()
  return entries.flatMap(([, , entry]) => {
    const title = cleanText(extractTag(entry, 'title'))
    const linkTag = /<link\b([^>]*?)(?:\/>|>([\s\S]*?)<\/link>)/i.exec(entry)
    const href = /\bhref=["']([^"']+)["']/i.exec(linkTag?.[1] ?? '')?.[1]
    const link = decodeXml(href ?? (linkTag?.[2] ?? '').trim())
    const description = cleanText(extractTag(entry, 'description') || extractTag(entry, 'summary') || extractTag(entry, 'content:encoded'))
    const publishedRaw = extractTag(entry, 'pubDate') || extractTag(entry, 'published') || extractTag(entry, 'updated')
    const publishedAt = new Date(publishedRaw)
    if (!title || !link || Number.isNaN(publishedAt.getTime()) || now - publishedAt.getTime() > recentWindowMs) return []

    let articleUrl: URL
    try { articleUrl = new URL(link, feed.url) } catch { return [] }
    if (articleUrl.protocol !== 'https:' || !(articleUrl.hostname === feed.host || articleUrl.hostname.endsWith(`.${feed.host}`))) return []

    const searchable = `${title} ${description}`.toLowerCase()
    if (feed.keywords?.length && !feed.keywords.some(keyword => searchable.includes(keyword.toLowerCase()))) return []
    return [{
      title,
      link: articleUrl.toString(),
      description,
      coverUrl: extractCoverUrl(entry, articleUrl.toString()),
      publishedAt,
    }]
  }).slice(0, maxItemsPerFeed)
}

async function slugFor(url: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))
  const suffix = [...new Uint8Array(hash)].slice(0, 12).map(value => value.toString(16).padStart(2, '0')).join('')
  return `source-${suffix}`
}

function validateFeedConfig(value: unknown): FeedConfig[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    throw new Error('EDUCATION_FEEDS harus berisi 1 sampai 8 RSS feed tepercaya.')
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Konfigurasi feed nomor ${index + 1} tidak valid.`)
    const feed = item as Partial<FeedConfig>
    const url = new URL(feed.url ?? '')
    const host = (feed.host ?? '').toLowerCase()
    const audiences = feed.audience
    if (
      url.protocol !== 'https:'
      || !host
      || !(url.hostname === host || url.hostname.endsWith(`.${host}`))
      || !feed.sourceName?.trim()
      || !feed.category?.trim()
      || !Array.isArray(audiences)
      || audiences.length === 0
      || audiences.some(audience => audience !== 'buyer' && audience !== 'seller')
    ) {
      throw new Error(`Konfigurasi feed nomor ${index + 1} wajib berisi URL HTTPS, host sumber yang cocok, nama sumber, kategori, dan audience buyer/seller.`)
    }
    return {
      url: url.toString(),
      host,
      sourceName: feed.sourceName.trim(),
      category: feed.category.trim(),
      audience: [...new Set(audiences)],
      keywords: Array.isArray(feed.keywords) ? feed.keywords.filter(keyword => typeof keyword === 'string').slice(0, 30) : [],
    }
  })
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('authorization')
  if (!serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) return Response.json({ error: 'SUPABASE_URL belum dikonfigurasi.' }, { status: 500 })

  let feeds: FeedConfig[]
  try {
    feeds = validateFeedConfig(JSON.parse(Deno.env.get('EDUCATION_FEEDS') ?? ''))
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'EDUCATION_FEEDS belum dikonfigurasi.' }, { status: 500 })
  }

  const syncedAt = new Date().toISOString()
  const rows: EducationArticle[] = []
  const failures: string[] = []

  for (const feed of feeds) {
    try {
      const response = await fetch(feed.url, {
        headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(12_000),
        redirect: 'error',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const contentLength = Number(response.headers.get('content-length') ?? 0)
      if (contentLength > maxFeedBytes) throw new Error('Feed melewati batas ukuran 1 MB')
      const xml = await response.text()
      if (new TextEncoder().encode(xml).byteLength > maxFeedBytes) throw new Error('Feed melewati batas ukuran 1 MB')
      if (!/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error('Respons bukan dokumen RSS/Atom yang valid')
      const items = parseFeed(xml, feed)
      for (const item of items) {
        rows.push({
          slug: await slugFor(item.link),
          title: item.title,
          summary: item.description || `Baca panduan terbaru dari ${feed.sourceName}.`,
          body: item.description || `Baca panduan terbaru dari ${feed.sourceName}.`,
          category: feed.category,
          cover_url: item.coverUrl,
          audience: feed.audience,
          source_name: feed.sourceName,
          source_url: item.link,
          source_published_at: item.publishedAt.toISOString(),
          published_at: item.publishedAt.toISOString(),
          synced_at: syncedAt,
        })
      }
    } catch (cause) {
      failures.push(`${feed.sourceName}: ${cause instanceof Error ? cause.message : 'gagal diambil'}`)
    }
  }

  if (!rows.length) {
    return Response.json({ synced: 0, covers: 0, failures, message: 'Tidak ada artikel baru dari feed yang berhasil dibaca.' }, { status: failures.length ? 502 : 200 })
  }

  const rowsByUrl = new Map<string, EducationArticle>()
  for (const row of rows) {
    const existing = rowsByUrl.get(row.source_url)
    if (existing) existing.audience = [...new Set([...existing.audience, ...row.audience])]
    else rowsByUrl.set(row.source_url, row)
  }
  const uniqueRows = [...rowsByUrl.values()]

  const upsertResponse = await fetch(`${supabaseUrl}/rest/v1/education_articles?on_conflict=source_url`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(uniqueRows),
  })
  if (!upsertResponse.ok) {
    const detail = (await upsertResponse.text()).slice(0, 500)
    console.error('Artikel edukasi gagal disimpan:', detail)
    return Response.json({ error: 'Artikel gagal disimpan ke Supabase.' }, { status: 502 })
  }

  return Response.json({ synced: uniqueRows.length, covers: uniqueRows.filter(row => row.cover_url).length, failures })
})

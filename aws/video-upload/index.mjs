import {randomUUID} from 'node:crypto'
import {S3Client} from '@aws-sdk/client-s3'
import {createPresignedPost} from '@aws-sdk/s3-presigned-post'

const {BUCKET_NAME, SANITY_PROJECT_ID} = process.env
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 ** 3)
const UPLOAD_URL_TTL_SECONDS = 15 * 60

// Defaults to the Lambda's own region; set BUCKET_REGION if the bucket lives elsewhere.
const s3 = new S3Client({region: process.env.BUCKET_REGION || undefined})

function json(statusCode, body) {
  return {
    statusCode,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  }
}

// Asks Sanity who owns the token. Members of the project get a non-empty
// `roles` list; anyone else (or an expired token) doesn't. Viewers are
// read-only in Studio, so they can't upload here either.
async function isProjectEditor(token) {
  const response = await fetch(`https://${SANITY_PROJECT_ID}.api.sanity.io/v2021-06-07/users/me`, {
    headers: {Authorization: `Bearer ${token}`},
  })
  if (!response.ok) return false
  const user = await response.json()
  const roles = Array.isArray(user?.roles) ? user.roles : []
  return Boolean(user?.id) && roles.some((role) => role.name !== 'viewer')
}

function safeFilename(filename) {
  const cleaned = String(filename)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned.slice(-100) || 'video'
}

function parseBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : (event.body ?? '')
  return JSON.parse(raw || '{}')
}

export async function handler(event) {
  if (event.requestContext?.http?.method !== 'POST') {
    return json(405, {error: 'Method not allowed'})
  }

  const token = (event.headers?.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token || !(await isProjectEditor(token))) {
    return json(401, {error: 'Not signed in to Sanity as an editor of this project'})
  }

  let body
  try {
    body = parseBody(event)
  } catch {
    return json(400, {error: 'Body must be JSON'})
  }

  const {filename, contentType, size} = body
  if (typeof filename !== 'string' || !filename) {
    return json(400, {error: 'filename is required'})
  }
  if (typeof contentType !== 'string' || !contentType.startsWith('video/')) {
    return json(400, {error: 'Only video files can be uploaded'})
  }
  if (typeof size !== 'number' || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return json(400, {error: `File must be under ${Math.floor(MAX_UPLOAD_BYTES / 1024 ** 2)} MB`})
  }

  const key = `videos/${randomUUID()}/${safeFilename(filename)}`
  // Every entry in `Fields` is also signed into the policy, so the browser
  // can't swap the key, type or cache headers after the fact.
  const {url, fields} = await createPresignedPost(s3, {
    Bucket: BUCKET_NAME,
    Key: key,
    Conditions: [['content-length-range', 1, MAX_UPLOAD_BYTES]],
    Fields: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    Expires: UPLOAD_URL_TTL_SECONDS,
  })

  return json(200, {key, url, fields})
}

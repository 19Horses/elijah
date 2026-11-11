import {useCallback, useEffect, useRef, useState, type ChangeEvent} from 'react'
import {Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {set, unset, useClient, type ObjectInputProps} from 'sanity'

const API_VERSION = '2025-06-01'
const UPLOAD_ENDPOINT = process.env.SANITY_STUDIO_VIDEO_UPLOAD_URL
const CDN_URL = process.env.SANITY_STUDIO_VIDEO_CDN_URL?.replace(/\/+$/, '')

export type S3VideoValue = {
  _type?: string
  key?: string
  filename?: string
  mimeType?: string
  size?: number
  duration?: number
  width?: number
  height?: number
}

type UploadTarget = {
  key: string
  url: string
  fields: Record<string, string>
}

type VideoMetadata = {
  duration: number
  width: number
  height: number
}

type UploadState =
  | {status: 'idle'}
  | {status: 'uploading'; filename: string; progress: number}
  | {status: 'error'; message: string}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

// Browsers can't read every container (e.g. HEVC .mov in Chrome), so missing
// metadata shouldn't block the upload itself.
function readVideoMetadata(file: File): Promise<VideoMetadata | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    const finish = (metadata: VideoMetadata | null) => {
      URL.revokeObjectURL(objectUrl)
      resolve(metadata)
    }
    video.preload = 'metadata'
    video.onloadedmetadata = () =>
      finish({duration: video.duration, width: video.videoWidth, height: video.videoHeight})
    video.onerror = () => finish(null)
    video.src = objectUrl
  })
}

async function requestUploadTarget(token: string, file: File): Promise<UploadTarget> {
  const response = await fetch(UPLOAD_ENDPOINT!, {
    method: 'POST',
    headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({filename: file.name, contentType: file.type, size: file.size}),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error ?? `Upload endpoint returned ${response.status}`)
  }
  return body as UploadTarget
}

// XHR rather than fetch because fetch can't report upload progress.
function uploadToS3(
  target: UploadTarget,
  file: File,
  xhr: XMLHttpRequest,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    Object.entries(target.fields).forEach(([name, value]) => form.append(name, value))
    // S3 ignores any form fields after `file`, so it has to go last.
    form.append('file', file)

    xhr.open('POST', target.url)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`S3 rejected the upload (${xhr.status})`))
    xhr.onerror = () => reject(new Error('Upload failed. Check the S3 bucket CORS settings.'))
    xhr.onabort = () => reject(new Error('Upload cancelled'))
    xhr.send(form)
  })
}

export function S3VideoInput(props: ObjectInputProps<S3VideoValue>) {
  const {value, onChange, readOnly, schemaType} = props
  const client = useClient({apiVersion: API_VERSION})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>({status: 'idle'})

  useEffect(() => () => xhrRef.current?.abort(), [])

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('video/')) {
        setUploadState({status: 'error', message: `${file.name} isn't a video file.`})
        return
      }
      const token = client.config().token
      if (!token) {
        setUploadState({
          status: 'error',
          message: 'No login token found. Log out of the Studio and back in, then try again.',
        })
        return
      }

      setUploadState({status: 'uploading', filename: file.name, progress: 0})
      try {
        const [target, metadata] = await Promise.all([
          requestUploadTarget(token, file),
          readVideoMetadata(file),
        ])
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr
        await uploadToS3(target, file, xhr, (progress) =>
          setUploadState({status: 'uploading', filename: file.name, progress}),
        )
        onChange(
          set({
            _type: schemaType.name,
            key: target.key,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            ...metadata,
          }),
        )
        setUploadState({status: 'idle'})
      } catch (error) {
        console.error(error)
        setUploadState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Upload failed.',
        })
      } finally {
        xhrRef.current = null
      }
    },
    [client, onChange, schemaType.name],
  )

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) void handleFile(file)
    },
    [handleFile],
  )

  if (!UPLOAD_ENDPOINT) {
    return (
      <Card padding={3} radius={2} tone="caution">
        <Text size={1}>
          Video uploads aren&rsquo;t configured. Set SANITY_STUDIO_VIDEO_UPLOAD_URL in backend/.env
          and restart the Studio.
        </Text>
      </Card>
    )
  }

  const uploading = uploadState.status === 'uploading'
  const hasVideo = Boolean(value?.key)

  return (
    <Stack space={3}>
      <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={handleInputChange} />

      {hasVideo && !uploading && (
        <Card padding={3} radius={2} shadow={1}>
          <Stack space={3}>
            {CDN_URL && (
              <video
                controls
                preload="metadata"
                src={`${CDN_URL}/${value!.key}`}
                style={{width: '100%', maxHeight: 360, background: 'black'}}
              />
            )}
            <Stack space={2}>
              <Text weight="semibold">{value!.filename ?? value!.key}</Text>
              <Text muted size={1}>
                {[
                  value!.size !== undefined && formatBytes(value!.size),
                  value!.duration !== undefined && formatDuration(value!.duration),
                  value!.width && value!.height && `${value!.width}×${value!.height}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Stack>
          </Stack>
        </Card>
      )}

      {uploading && (
        <Card padding={3} radius={2} shadow={1}>
          <Stack space={3}>
            <Text size={1}>
              Uploading {uploadState.filename}… {Math.round(uploadState.progress * 100)}%
            </Text>
            <Box style={{height: 4, borderRadius: 2, background: 'var(--card-border-color)'}}>
              <Box
                style={{
                  height: '100%',
                  width: `${uploadState.progress * 100}%`,
                  borderRadius: 2,
                  background: 'var(--card-focus-ring-color)',
                  transition: 'width 0.2s',
                }}
              />
            </Box>
            <Text muted size={1}>
              Keep this tab open until the upload finishes.
            </Text>
          </Stack>
        </Card>
      )}

      {uploadState.status === 'error' && (
        <Card padding={3} radius={2} tone="critical">
          <Text size={1}>{uploadState.message}</Text>
        </Card>
      )}

      <Flex gap={2}>
        {uploading ? (
          <Button mode="ghost" text="Cancel upload" onClick={() => xhrRef.current?.abort()} />
        ) : (
          <>
            <Button
              disabled={readOnly}
              mode={hasVideo ? 'ghost' : 'default'}
              text={hasVideo ? 'Replace video' : 'Upload video'}
              tone="primary"
              onClick={() => fileInputRef.current?.click()}
            />
            {hasVideo && (
              <Button
                disabled={readOnly}
                mode="ghost"
                text="Remove"
                tone="critical"
                onClick={() => onChange(unset())}
              />
            )}
          </>
        )}
      </Flex>
    </Stack>
  )
}

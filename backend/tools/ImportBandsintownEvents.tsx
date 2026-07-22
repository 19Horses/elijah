import {useCallback, useEffect, useMemo, useState} from 'react'
import {Box, Button, Card, Flex, Heading, Spinner, Stack, Text} from '@sanity/ui'
import {useClient} from 'sanity'
import {fetchBandsintownEvents, type BandsintownEvent} from './bandsintownClient'

const API_VERSION = '2025-06-01'

type RowState = 'idle' | 'importing' | 'imported' | 'error'

function draftIdFor(event: BandsintownEvent): string {
  return `drafts.bandsintown-${event.id}`
}

// The `slug` field is required, so a draft that skipped this would sit
// unpublishable until someone clicked "Generate" — set it here instead.
// The Bandsintown id is appended to stay unique even when two events share a
// venue name (e.g. the same room used on different dates).
function slugFor(event: BandsintownEvent): string {
  const base = event.title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `${base}-${event.id}`
}

// A Studio-side "Content" list item (see structure.ts) so a non-technical
// manager can pull Bandsintown's tour dates into Sanity themselves, then add
// an image and publish through the normal Event editing form — no CLI or
// developer involvement needed.
export function ImportBandsintownEvents() {
  const client = useClient({apiVersion: API_VERSION})
  const [events, setEvents] = useState<BandsintownEvent[] | null>(null)
  const [importedIds, setImportedIds] = useState<Set<string> | null>(null)
  const [rowState, setRowState] = useState<Record<string, RowState>>({})
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [bandsintownEvents, existingIds] = await Promise.all([
        fetchBandsintownEvents(),
        client.fetch<string[]>('*[_type == "event" && defined(bandsintownId)].bandsintownId'),
      ])
      setEvents(bandsintownEvents)
      setImportedIds(new Set(existingIds))
    } catch (error) {
      console.error(error)
      setLoadError('Failed to load Bandsintown events.')
    }
  }, [client])

  useEffect(() => {
    void load()
  }, [load])

  const handleImport = useCallback(
    async (event: BandsintownEvent) => {
      setRowState((prev) => ({...prev, [event.id]: 'importing'}))
      try {
        await client.create({
          _id: draftIdFor(event),
          _type: 'event',
          bandsintownId: event.id,
          title: event.title,
          slug: {_type: 'slug', current: slugFor(event)},
          date: event.date,
          description: event.description,
          link: event.link,
          public: true,
        })
        setImportedIds((prev) => new Set(prev).add(event.id))
        setRowState((prev) => ({...prev, [event.id]: 'imported'}))
      } catch (error) {
        console.error(error)
        setRowState((prev) => ({...prev, [event.id]: 'error'}))
      }
    },
    [client],
  )

  const pending = useMemo(
    () => (events ?? []).filter((event) => !importedIds?.has(event.id)),
    [events, importedIds],
  )

  if (loadError) {
    return (
      <Box padding={4}>
        <Text>{loadError}</Text>
      </Box>
    )
  }

  if (events === null || importedIds === null) {
    return (
      <Flex padding={4} justify="center">
        <Spinner />
      </Flex>
    )
  }

  return (
    <Box padding={4}>
      <Stack space={4}>
        <Stack space={2}>
          <Heading size={2}>Import Bandsintown Events</Heading>
          <Text muted size={1}>
            Import an event, then add an image and publish it from the Event list.
          </Text>
        </Stack>
        {pending.length === 0 ? (
          <Text>Everything&rsquo;s imported.</Text>
        ) : (
          <Stack space={3}>
            {pending.map((event) => {
              const state = rowState[event.id] ?? 'idle'
              return (
                <Card key={event.id} padding={3} radius={2} shadow={1}>
                  <Flex align="center" gap={3} justify="space-between">
                    <Stack flex={1} space={2}>
                      <Text weight="semibold">{event.title}</Text>
                      <Text muted size={1}>
                        {new Date(event.date).toLocaleDateString()}
                      </Text>
                    </Stack>
                    <Button
                      disabled={state === 'importing' || state === 'imported'}
                      onClick={() => handleImport(event)}
                      text={
                        state === 'imported'
                          ? 'Imported'
                          : state === 'importing'
                            ? 'Importing…'
                            : state === 'error'
                              ? 'Retry'
                              : 'Import'
                      }
                      tone={state === 'error' ? 'critical' : 'primary'}
                    />
                  </Flex>
                </Card>
              )
            })}
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

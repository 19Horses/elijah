/**
 * Migrates legacy `imageAsset` documents (single `image` field) to the new
 * `images` gallery, marking the migrated image as the cover.
 *
 * Run from the `backend` directory:
 *   npx sanity exec scripts/migrateImageAssets.ts --with-user-token
 */
import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2025-06-01'})

function randomKey(): string {
  return Math.random().toString(36).slice(2, 12)
}

async function run() {
  const docs: Array<{_id: string; image: Record<string, unknown>}> = await client.fetch(
    `*[_type == "imageAsset" && defined(image) && !defined(images)]{_id, image}`,
  )

  if (docs.length === 0) {
    console.log('No image assets need migrating.')
    return
  }

  console.log(`Migrating ${docs.length} image asset(s)...`)

  let tx = client.transaction()
  for (const doc of docs) {
    const {hotspot, crop, asset} = doc.image as {
      asset?: unknown
      hotspot?: unknown
      crop?: unknown
    }
    const coverImage = {
      _type: 'image',
      _key: randomKey(),
      asset,
      ...(hotspot ? {hotspot} : {}),
      ...(crop ? {crop} : {}),
      isCover: true,
    }
    tx = tx.patch(doc._id, {set: {images: [coverImage]}, unset: ['image']})
  }

  const result = await tx.commit()
  console.log(`Done. Updated ${result.results.length} document(s).`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

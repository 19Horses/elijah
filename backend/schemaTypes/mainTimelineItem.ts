import {defineField, defineType} from 'sanity'

const API_VERSION = '2025-06-01'

// Content already used by any collection (draft or published).
const IN_COLLECTION_FILTER = '!(_id in *[_type == "collection"].content[]._ref)'

export const mainTimelineItem = defineType({
  name: 'mainTimelineItem',
  title: 'Timeline Item',
  type: 'object',
  fields: [
    defineField({
      name: 'content',
      title: 'Content',
      type: 'reference',
      to: [{type: 'imageAsset'}, {type: 'audioAsset'}, {type: 'videoAsset'}, {type: 'newsletter'}],
      options: {
        // Hide collection-only items from the picker.
        filter: IN_COLLECTION_FILTER,
      },
      validation: (Rule) =>
        Rule.required().custom(async (value, context) => {
          const ref = value?._ref
          if (!ref) {
            return true
          }
          const client = context.getClient({apiVersion: API_VERSION})
          const inCollection = await client.fetch<boolean>(
            `count(*[_type == "collection" && $ref in content[]._ref]) > 0`,
            {ref},
          )
          return inCollection
            ? 'This content is in a collection and cannot be added to the main timeline'
            : true
        }),
    }),
    defineField({
      name: 'unlockTime',
      title: 'Unlock Time',
      type: 'datetime',
    }),
    defineField({
      name: 'expiryTime',
      title: 'Expiry Time',
      type: 'datetime',
    }),
  ],
  preview: {
    select: {
      title: 'content.title',
      contentType: 'content._type',
      media: 'content.image',
    },
    prepare({title, contentType}) {
      const typeLabels: Record<string, string> = {
        audioAsset: 'Audio',
        imageAsset: 'Image',
        videoAsset: 'Video',
        newsletter: 'Newsletter',
      }
      return {
        title: title ?? 'Untitled',
        subtitle: typeLabels[contentType] ?? 'Content',
      }
    },
  },
})

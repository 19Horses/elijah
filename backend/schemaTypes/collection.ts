import {defineArrayMember, defineField, defineType} from 'sanity'

const API_VERSION = '2025-06-01'

// Content referenced by any main timeline document (draft or published).
const ON_MAIN_TIMELINE_FILTER =
  '!(_id in *[_type == "mainTimeline"].items[].content._ref)'

export const collection = defineType({
  name: 'collection',
  title: 'Collection',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'richText',
    }),
    defineField({
      name: 'expiresAt',
      title: 'Expiry Time',
      description: 'Date and time when this collection expires.',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'unlockTime',
      title: 'Unlock Time',
      description: 'Date and time when this collection becomes available.',
      type: 'datetime',
    }),
    defineField({
      name: 'content',
      title: 'Content',
      description: 'Items exclusive to this collection — not on the main timeline.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [
            {type: 'imageAsset'},
            {type: 'audioAsset'},
            {type: 'videoAsset'},
            {type: 'newsletter'},
          ],
          options: {
            // Hide main-timeline items from the picker.
            filter: ON_MAIN_TIMELINE_FILTER,
          },
          validation: (Rule) =>
            Rule.custom(async (value, context) => {
              const ref = value?._ref
              if (!ref) {
                return true
              }
              const client = context.getClient({apiVersion: API_VERSION})
              const onMain = await client.fetch<boolean>(
                `count(*[_type == "mainTimeline" && $ref in items[].content._ref]) > 0`,
                {ref},
              )
              return onMain
                ? 'This content is on the main timeline and cannot be added to a collection'
                : true
            }),
        }),
      ],
      validation: (Rule) =>
        Rule.custom(async (items, context) => {
          const refs = (items ?? [])
            .map((item) =>
              item && typeof item === 'object' && '_ref' in item
                ? (item._ref as string | undefined)
                : undefined,
            )
            .filter((ref): ref is string => Boolean(ref))
          if (refs.length === 0) {
            return true
          }
          const client = context.getClient({apiVersion: API_VERSION})
          const conflicts = await client.fetch<string[]>(
            `*[_type == "mainTimeline"].items[content._ref in $refs].content->title`,
            {refs},
          )
          if (!conflicts?.length) {
            return true
          }
          const names = [...new Set(conflicts.filter(Boolean))]
          return names.length
            ? `Main timeline content cannot be in a collection: ${names.join(', ')}`
            : 'Main timeline content cannot be in a collection'
        }),
    }),
  ],
  preview: {
    select: {
      title: 'name',
      expiresAt: 'expiresAt',
    },
    prepare(selection) {
      const {title, expiresAt} = selection
      return {
        title,
        subtitle: expiresAt ? `Expires ${new Date(expiresAt).toLocaleString()}` : undefined,
      }
    },
  },
})

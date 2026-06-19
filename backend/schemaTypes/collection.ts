import {defineField, defineType} from 'sanity'

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
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 4,
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
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{type: 'imageAsset'}, {type: 'audioAsset'}, {type: 'newsletter'}],
        },
      ],
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

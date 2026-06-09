import {defineField, defineType} from 'sanity'

export const newsletter = defineType({
  name: 'newsletter',
  title: 'Newsletter',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'date',
      title: 'Date',
      type: 'date',
    }),
    defineField({
      name: 'isOnMainTimeline',
      title: 'On Main Timeline',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'expiryDate',
      title: 'Expiry Date',
      type: 'datetime',
      hidden: ({document}) => !document?.isOnMainTimeline,
    }),
    defineField({
      name: 'unlockDate',
      title: 'Unlock Date',
      type: 'datetime',
      hidden: ({document}) => !document?.isOnMainTimeline,
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({
      name: 'content',
      title: 'Content',
      description: 'Long-form newsletter or blog content.',
      type: 'text',
      rows: 12,
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      media: 'image',
    },
  },
})

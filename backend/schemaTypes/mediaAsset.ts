import {defineField, defineType} from 'sanity'

export const mediaAsset = defineType({
  name: 'mediaAsset',
  title: 'Media Asset',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {hotspot: true},
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (value || context.parent?.audio) {
            return true
          }
          return 'Add an image or audio file.'
        }),
    }),
    defineField({
      name: 'audio',
      title: 'Audio',
      type: 'file',
      options: {
        accept: 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac',
      },
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (value || context.parent?.image) {
            return true
          }
          return 'Add an image or audio file.'
        }),
    }),
    defineField({
      name: 'alt',
      title: 'Alt text',
      description: 'Required when an image is set for accessibility.',
      type: 'string',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (!context.parent?.image) {
            return true
          }
          return value ? true : 'Alt text is required when image is present.'
        }),
    }),
    defineField({
      name: 'caption',
      title: 'Caption',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'durationSeconds',
      title: 'Duration (seconds)',
      type: 'number',
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: 'transcript',
      title: 'Transcript',
      type: 'text',
      rows: 6,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      media: 'image',
      hasAudio: 'audio.asset',
    },
    prepare(selection) {
      const {title, media, hasAudio} = selection
      return {
        title,
        subtitle: hasAudio ? 'Contains audio' : 'Image only',
        media,
      }
    },
  },
})

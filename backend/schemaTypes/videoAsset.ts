import {defineField, defineType} from 'sanity'

export const videoAsset = defineType({
  name: 'videoAsset',
  title: 'Video',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
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
      name: 'date',
      title: 'Date',
      type: 'date',
    }),
    defineField({
      name: 'poster',
      title: 'Poster image',
      description: 'Shown before the video plays.',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({
      name: 'video',
      title: 'Video',
      type: 's3Video',
      validation: (Rule) =>
        Rule.custom((value?: {key?: string}) => (value?.key ? true : 'Upload a video')),
    }),
    defineField({
      name: 'public',
      title: 'Public',
      description: 'If off, this is only visible to users who have collected it.',
      type: 'boolean',
      initialValue: true,
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      media: 'poster',
      filename: 'video.filename',
    },
    prepare(selection) {
      const {title, media, filename} = selection
      return {
        title,
        media,
        subtitle: filename ?? 'No video uploaded',
      }
    },
  },
})

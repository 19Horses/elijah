import {defineArrayMember, defineField, defineType} from 'sanity'

export const imageAsset = defineType({
  name: 'imageAsset',
  title: 'Image',
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
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'image',
          options: {hotspot: true},
          fields: [
            defineField({
              name: 'isCover',
              title: 'Cover image',
              description:
                'Use this image as the timeline thumbnail. Exactly one image must be the cover.',
              type: 'boolean',
              initialValue: false,
            }),
          ],
          preview: {
            select: {
              media: 'asset',
              isCover: 'isCover',
            },
            prepare({media, isCover}) {
              return {
                title: isCover ? 'Cover image' : 'Image',
                media,
              }
            },
          },
        }),
      ],
      validation: (Rule) =>
        Rule.required()
          .min(1)
          .custom((images) => {
            const list = (images as Array<{isCover?: boolean}> | undefined) ?? []
            const covers = list.filter((image) => image?.isCover)
            if (covers.length === 0) {
              return 'Mark one image as the cover.'
            }
            if (covers.length > 1) {
              return 'Only one image can be the cover.'
            }
            return true
          }),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      images: 'images',
    },
    prepare({title, images}) {
      const list = (images as Array<{isCover?: boolean}> | undefined) ?? []
      const cover = list.find((image) => image?.isCover) ?? list[0]
      return {
        title,
        subtitle: list.length > 0 ? `${list.length} image${list.length === 1 ? '' : 's'}` : 'No images',
        media: cover as never,
      }
    },
  },
})

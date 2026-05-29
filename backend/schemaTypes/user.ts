import {defineField, defineType} from 'sanity'

const isUniqueUserField = async (
  value: string | undefined,
  context: {
    document?: {_id?: string}
    getClient: (options: {apiVersion: string}) => {
      fetch: (query: string, params: Record<string, string | undefined>) => Promise<boolean>
    }
  },
  fieldName: 'email' | 'username',
) => {
  if (!value) {
    return true
  }

  const id = context.document?._id?.replace(/^drafts\./, '')
  const client = context.getClient({apiVersion: '2024-01-01'})
  const isDuplicate = await client.fetch(
    `count(*[
      _type == "user" &&
      ${fieldName} == $value &&
      !(_id in [$draftId, $publishedId])
    ]) > 0`,
    {
      value,
      draftId: id ? `drafts.${id}` : undefined,
      publishedId: id,
    },
  )

  return isDuplicate ? `${fieldName === 'email' ? 'Email' : 'Username'} must be unique.` : true
}

export const user = defineType({
  name: 'user',
  title: 'User',
  type: 'document',
  fields: [
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (Rule) =>
        Rule.required()
          .email()
          .custom((value, context) => isUniqueUserField(value, context, 'email')),
    }),
    defineField({
      name: 'username',
      title: 'Username',
      type: 'string',
      validation: (Rule) =>
        Rule.required().custom((value, context) => isUniqueUserField(value, context, 'username')),
    }),
    defineField({
      name: 'savedContent',
      title: 'Saved Content',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{type: 'imageAsset'}, {type: 'audioAsset'}],
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: 'username',
      subtitle: 'email',
    },
  },
})

# Instructions for setup

1. Run this command and follow the instructions:

```
yarn && yarn create:backend
```

2. Follow instructions from the [Sanity docs](https://www.sanity.io/docs/next-js-quickstart/defining-a-schema) to set up a schema.

3. Copy the `projectId` from [backend/sanity.cli.ts](/backend/sanity.cli.ts) and paste it as the `projectId` in [frontend/src/sanityIntegration.ts](/frontend/src/sanityIntegration.ts).

4. Update the `name` in the [backend/package.json](/backend/package.json) file to `backend` then run:

```
yarn dev
```

5. Deploy the studio by running:

```
cd backend && yarn deploy
```

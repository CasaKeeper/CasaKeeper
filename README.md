This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase environment

Copy `.env.example` to `.env.local` for local development and fill in the values from the CasaKeeper Supabase Dashboard. Keep `.env.local` uncommitted; environment files are ignored by Git.

`SUPABASE_SERVICE_ROLE_KEY` is required by the server-side Resource Storage cleanup handlers. Obtain it from the Supabase Dashboard under Project Settings → API, and configure it as a server/deployment secret in production (for example, the deployment platform's server environment settings).

This key is highly privileged and server-only. Never expose it in browser code, logs, API responses, or under a `NEXT_PUBLIC_` variable name. If it is missing, Resource Storage cleanup fails closed with a configuration error rather than attempting an unauthenticated privileged operation.

`CRON_SECRET` is also server-only. Set it to a random value in Vercel Project Settings → Environment Variables. Vercel Cron sends it as the `Authorization: Bearer` token to `/api/cron/resource-upload-cleanup`; the handler processes bounded batches of expired, unfinalized upload intents and preserves failed cleanup jobs for retry. The included `vercel.json` schedules it daily at 03:00 UTC. Confirm that the selected Vercel plan supports the configured cron frequency and review the route response/logs after deployment without logging secrets or Storage paths.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

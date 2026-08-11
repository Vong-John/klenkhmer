# Stock Control Dashboard

A standalone React + Vite version of the inventory dashboard. Data is saved
in the browser via `localStorage` — free, no backend, no account needed.
Note: data stays on the device/browser it was entered on and won't sync
across devices.

## Run it locally

```
npm install
npm run dev
```

## Deploy for free (pick one)

### Vercel (recommended, easiest)
1. Create a free account at vercel.com and a new GitHub repo with these files.
2. Push this folder to that repo.
3. In Vercel, click "Add New Project", import the repo, leave build settings
   as default (Vite is auto-detected), click Deploy.
4. You'll get a live `your-project.vercel.app` URL, auto-updated on every push.

### Netlify
1. Create a free account at netlify.com.
2. Either drag-and-drop the `dist` folder (after running `npm run build`)
   into Netlify's dashboard, or connect the GitHub repo for auto-deploys.
3. Build command: `npm run build`, publish directory: `dist`.

### Cloudflare Pages
1. Free account at pages.cloudflare.com.
2. Connect the GitHub repo.
3. Build command: `npm run build`, output directory: `dist`.

## Notes

- Because storage is per-browser, if you clear your browser data or switch
  devices, the inventory list won't be there. If you outgrow that, the next
  step is a small free backend (e.g. Supabase) — happy to wire that up later.

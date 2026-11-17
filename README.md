# IronRanksMakeOS

Iron Ranks, replicated from the MakeOS page and deployed on Vercel.

- UI: static files (`index.html`, `app.js`, `style.css`), with `make.js` as the data and sign-in layer.
- Data and sign-in: Supabase project IronRanksMakeOS (Google sign-in, row-level security).
- Ranking: `api/log-lift.js` verifies the signed-in lifter and calls a MakeOS webhook that runs the Rank Judge agent.

Separate from the original IronRanks app.

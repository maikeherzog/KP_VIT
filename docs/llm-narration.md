# Wiring the narrator to an LLM

 Right now it runs on a hardcoded template, that's just a placeholder.

## What it does

In fly mode (the "Board Ship" button) the board computer finds the nearest star
system or galaxy and builds a prompt from it. The "Generate log" button turns that
into a short logbook entry. That entry is what the LLM should write later on.

## How it flows

1. `ProximityDetector` finds the nearest object to the ship -> `nearby`
2. `BoardComputer` receives `nearby` and calls `buildNarratorContext()`
3. That returns a `context`, which contains `context.prompt` (the ready LLM input)
4. The "Generate log" button calls `requestNarration(context)`, the text shows in the panel

Everything relevant lives in `src/data/narratorContext.js`.

## The two functions

- `buildNarratorContext(...)` builds the context from the object's data.
  Usually you don't need to touch this. If you want different/more data in the
  prompt, add it here.
- `requestNarration(context, galaxy)` is where the LLM goes in.
  Right now it returns the template text. It's already `async`, and the loading
  UI ("narrating...") in the board computer is already there.
  Changes can be made here, if the current build is not sufficient. 

`context` looks like this:

```js
{
  kind,      // 'system' or 'galaxy'
  subject,   // e.g. "facebook/react"
  distance,  // distance to the ship
  facts,     // { repository, language, stars, forks, activity, status, ... }
  prompt,    // ready-made text for the LLM (visible in the board computer under "NARRATOR INPUT")
  data,      // raw data, in case you want to build the messages yourself
}
```

## Good to know

- `context.prompt` is already the full LLM input. Before wiring anything up, sanity
  check it in the board computer under "NARRATOR INPUT (LLM context)".
- Always keep a fallback to the template (`narrativeFor(...)`), so the board computer
  still shows something if the API call fails.
- Model: `claude-sonnet-4-6` is fine for short logbook entries (fast, cheap).
- Keep it short: `max_tokens` around 200 is enough for 2-3 sentences.

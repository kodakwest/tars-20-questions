# TARS 20 Questions UI Enhancement Plan

This plan keeps the current React/TypeScript/Cloudflare Pages architecture intact. Each phase is independently deployable and scoped to client-side UI plus the existing Pages Functions contract where needed. No new npm dependencies are required.

## Current Codebase Notes

- `src/App.tsx` mounts either `StartScreen` or `GameBoard` and already uses `min-h-svh`/`h-dvh`.
- `src/hooks/useGame.ts` owns game state, voice state, API calls, speech playback, and exposes a broad view model to `GameBoard`.
- `src/components/GameBoard.tsx` currently contains the sticky header, progress strip, chat scroll area, fixed footer controls, and floating voice status.
- `src/components/QuestionLog.tsx` uses `endRef.scrollIntoView()` on `entries` and `isLoading`, but it does not own the scroll container.
- `src/components/TarsAvatar.tsx` only accepts `speaking: boolean`.
- `functions/api/_game.ts` persists active sessions in KV with a 30 minute TTL. Client localStorage can restore UI state after refresh only while the server-side session still exists.

## Phase 1: Chat Viewport Reliability

Goal: the latest exchange remains visible after long TARS text, audio button rendering, loading indicators, footer layout changes, mobile keyboard changes, and result/error UI changes.

### Files To Modify

- `src/components/GameBoard.tsx`
  - Replace the current anonymous scroll area with an explicit `chatViewportRef`.
  - Pass that ref, footer height, and relevant layout dependencies to `QuestionLog`.
  - Measure footer height with `ResizeObserver` and store it in CSS custom property `--game-footer-height`.
  - Replace hard-coded chat bottom padding (`13rem`/`7rem`) with `calc(var(--game-footer-height) + var(--safe-area-inset-bottom) + 1rem)`.
  - Keep the footer fixed for now, but make its height measurable instead of guessed.
  - Include `error`, `pendingFinalGuess`, `showRevealInput`, `voiceMode`, `isListening`, and `result?.gameOver` in the layout dependencies that can require a scroll correction.

- `src/components/QuestionLog.tsx`
  - Accept `scrollContainerRef?: RefObject<HTMLDivElement | null>` and `scrollKey?: string | number`.
  - Replace single `scrollIntoView()` call with a small `scrollToBottom({ force })` helper that sets `scrollTop = scrollHeight` on the scroll container.
  - Run scroll correction in `useLayoutEffect` when entries/loading/layout dependencies change, then again in `requestAnimationFrame` to catch post-render height changes.
  - Add a `ResizeObserver` on the log content wrapper and the final TARS response area so late audio button/text wrapping changes still pin the bottom.
  - Respect user intent: if the user has manually scrolled more than roughly 96px away from bottom, show a "jump to latest" icon button instead of forcing scroll. For normal gameplay submissions and fresh TARS responses, force bottom.

- `src/styles.css`
  - Add `--game-footer-height: 0px`.
  - Add utility-safe CSS for `scroll-padding-bottom` on the chat viewport if Tailwind arbitrary values get too noisy.

### Edge Cases & Failure Modes

- Mobile keyboard changes viewport height after focus. The measured footer height plus `h-dvh` should keep the last message visible; add a `visualViewport.resize` listener if `ResizeObserver` is not enough on iOS Safari.
- Audio replay button or text wraps after first paint. The second `requestAnimationFrame` scroll and `ResizeObserver` handle this.
- User scrolls upward to review the transcript. Do not yank them down unless they submit/answer or tap "jump to latest".
- Game over overlay appears. Stop auto-scroll work once `result?.gameOver` is true because `WinScreen` owns the visible transcript.
- `ResizeObserver` unsupported. Fall back to current `scrollIntoView` plus `setTimeout(..., 0)`.

### Mobile Considerations

- Maintain one scrollable region: the chat viewport.
- Use dynamic viewport units already present (`h-dvh`) and safe-area bottom padding.
- Make the "jump to latest" control at least 44px square and position it above the footer, not inside the input row.
- Verify the input row never covers the latest message in both compact `ai-thinks` and taller `you-think` confirmation states.

### Verification Steps

- Start a game, ask 20 short questions, confirm the final TARS response is visible without manual scrolling.
- Add a long TARS response in dev or mock API response and verify the bottom remains pinned after wrapping.
- Toggle voice modes and replay audio; latest message should remain visible.
- On mobile viewport, focus input to open keyboard and submit; latest response remains above the footer/keyboard.
- Manually scroll up, receive loading state, verify the app offers a jump button instead of forcing the scroll.

## Phase 2: Persistent HUD And Game State Visibility

Goal: create a compact, always-visible HUD showing question progress, mode, TARS status, and current narrowing path without increasing scroll instability.

### Files To Create

- `src/components/GameHud.tsx`
  - New presentational HUD component.
  - Props:
    - `mode: GameMode`
    - `currentQuestion: number`
    - `maximumQuestions: number`
    - `questionsLeft: number`
    - `status: TarsStatus`
    - `voiceMode: VoiceModeLevel`
    - `pendingFinalGuess: boolean`
    - `deductions: DeductionItem[]`
    - `onToggleVoice: () => void`
  - Layout:
    - Mobile: two-row sticky bar. First row: question meter + status. Second row: mode chip + last 2-3 deductions horizontally scrollable.
    - Desktop: single dense row.
  - Use existing colors and `font-display`; avoid card-in-card styling.

- `src/gameStatus.ts`
  - Central pure helpers:
    - `getTarsStatus({ isLoading, isSpeaking, isListening, pendingFinalGuess, result, mode, youThinkStarted })`
    - `getStatusLabel(status)`
    - `getDeductionsFromLog(log, mode)`
  - Types:
    - `TarsStatus = "idle" | "thinking" | "speaking" | "listening" | "waiting" | "guessing" | "celebrating" | "commiserating" | "error"`
    - `DeductionItem = { id: string; label: string; tone: "yes" | "no" | "maybe" | "unknown" }`

### Files To Modify

- `src/components/GameBoard.tsx`
  - Replace the current header + separate progress strip + floating voice status with `GameHud`.
  - Keep `TarsAvatar` in the top header, but feed it the same `status`.
  - Compute `currentQuestion` once and pass it into HUD.
  - Pass `isListening` into the status helper instead of building `voiceStatus` inline.
  - Keep voice toggle behavior unchanged.

- `src/components/QuestionCounter.tsx`
  - Either remove from `GameBoard` usage or simplify it for reuse inside `GameHud`.
  - If kept, make it compact enough for mobile: no `min-w-36` on narrow screens.

- `src/types.ts`
  - Export shared `TarsStatus` and `DeductionItem` if `gameStatus.ts` does not own them.

### Deductions Approach

- In `you-think` mode, derive visible narrowing path from user answers in `log`: `Yes`, `No`, `Kind Of`, `Sort Of`, `Not exactly`.
- Because the client does not currently receive `attributeKey` or candidate counts, keep the first iteration conservative:
  - Show "Fictional: yes", "Human: no", etc. only when the preceding TARS question can be summarized safely with light string cleanup.
  - Otherwise show the last answered question shortened to 32 characters.
- Do not claim exact candidate counts unless the API later returns them.

### Edge Cases & Failure Modes

- Long deductions can overflow on mobile. Truncate labels and allow horizontal scrolling with no layout shift.
- Status can flicker between `thinking` and `speaking` as audio starts. Prefer `speaking` when `isSpeaking` is true, `guessing` when `pendingFinalGuess` is true, and `thinking` only during request loading.
- In `ai-thinks` mode, deductions may be less useful because the user asks questions and TARS answers. Label the path as "Known answers" rather than "Deductions".
- Voice mode off should not hide status. It should show `waiting`, `thinking`, or `guessing` independent of TTS.

### Mobile Considerations

- HUD must be sticky below the app header or become the header itself; avoid two separate sticky bars with hard-coded `top` values.
- Use `position: sticky; top: 0; z-index: 20` for one HUD/header band.
- Keep touch targets 44px minimum for voice/save controls.
- Use `overflow-x-auto` for deduction chips, with no wrapping that increases the HUD height after the chat scroll calculation.

### Verification Steps

- Confirm HUD is visible while scrolling the full chat.
- Confirm HUD status transitions through idle/waiting, thinking, speaking, listening, guessing, and game-over states.
- Confirm `you-think` answer buttons update the narrowing path.
- Confirm `ai-thinks` questions/answers produce a reasonable compact history.
- Test at 320px width: no clipped controls, no overlapping question counter, and no horizontal page scroll.

## Phase 3: Local Save, Resume, And Export

Goal: preserve active games across refreshes when possible, provide a deliberate save/resume affordance, and allow users to export the game log as text.

### Files To Create

- `src/gamePersistence.ts`
  - Constants:
    - `STORAGE_KEY = "tars20q.activeGame.v1"`
    - `STORAGE_VERSION = 1`
  - Types:
    - `PersistedGameV1`
    - `PersistedLogEntry`
  - Functions:
    - `loadPersistedGame()`
    - `savePersistedGame(snapshot)`
    - `clearPersistedGame()`
    - `formatGameLogExport(snapshot)`
    - `isPersistedGameExpired(snapshot)`
  - Must catch storage exceptions for private browsing, quota issues, and blocked storage.

- `src/components/ResumeGamePrompt.tsx`
  - Shown on `StartScreen` when a valid local snapshot exists.
  - Actions: `Resume`, `Discard`.
  - Copy should explicitly say resume depends on the active session still being available.

- `src/components/SaveMenu.tsx`
  - Small HUD/menu control using existing `lucide-react` icons.
  - Actions: `Save`, `Export Log`, `Discard Saved Game`.
  - No new dependencies.

### Files To Modify

- `src/hooks/useGame.ts`
  - Add a serializable snapshot builder containing:
    - `version`
    - `savedAt`
    - `expiresAt`
    - `started`
    - `sessionId`
    - `mode`
    - `log`
    - `questionsLeft`
    - `result`
    - `pendingFinalGuess`
    - `voiceMode`
    - `voiceName`
  - Auto-save after each meaningful state change when `started && sessionId`.
  - Clear saved state on `newGame()` before the new API call succeeds only if the user intentionally starts over; otherwise avoid deleting the last recoverable snapshot during network failure.
  - Add `resume(savedGame)` that restores client state, then optionally validates the session by making a lightweight existing API call only when the next action occurs. Because there is no current `/api/session` endpoint, avoid adding server architecture in this phase.
  - When an API returns `Unknown session. Start a new game.`, clear the saved game and show a recoverable error directing the user to start a new game.

- `src/App.tsx`
  - Load persisted snapshot early enough to pass it into `StartScreen`.
  - Pass `onResume` and `onDiscardSavedGame`.

- `src/components/StartScreen.tsx`
  - Show `ResumeGamePrompt` above the mode selector when a restorable snapshot exists.
  - Preserve the existing start flow and voice selector.

- `src/components/GameBoard.tsx`
  - Add `SaveMenu` to the HUD.
  - Wire `Save`, `Export Log`, and `Discard Saved Game`.

- `src/components/WinScreen.tsx`
  - Add `Export Log` action using the same formatter.
  - Clear active saved game after game over only after the result is persisted/exportable in the current UI state.

### localStorage Schema

```ts
type PersistedGameV1 = {
  version: 1;
  savedAt: string;
  expiresAt: string;
  started: boolean;
  sessionId: string;
  mode: "ai-thinks" | "you-think";
  log: Array<{
    id: string;
    speaker: "user" | "tars";
    text: string;
    audioBase64?: string;
  }>;
  questionsLeft: number;
  result: GameResult | null;
  pendingFinalGuess: boolean;
  voiceMode: "off" | "minimal" | "full";
  voiceName?: string;
};
```

- `expiresAt` should be `savedAt + 30 minutes` to match the current KV TTL in `functions/api/_game.ts`.
- Keep `audioBase64` only if storage size remains reasonable. If quota errors occur, retry without audio fields and keep text-only resume/export.
- On version mismatch, ignore the snapshot, remove it, and show no resume prompt.
- On expired snapshot, remove it and show no resume prompt.
- On malformed JSON, remove it silently.

### Edge Cases & Failure Modes

- Cloudflare KV session expires before local resume. The UI can restore the transcript, but the next API call will fail with 404. Handle by clearing saved state and offering a fresh start.
- localStorage quota exceeded due to audio payloads. Retry text-only snapshot.
- User has multiple tabs open. Last write wins; include `savedAt` and listen for the `storage` event to avoid stale prompts.
- User clicks "Save" while offline. localStorage save still works, but resume cannot continue server gameplay if the KV session expires.
- Private browsing blocks storage. Hide or disable save actions after detecting failure.

### Mobile Considerations

- Save menu should be an icon button in the HUD, not a new footer row.
- Export should use a generated text blob/download on desktop and a selectable `<textarea>` fallback or Clipboard API fallback on mobile Safari if download is blocked.
- Resume prompt on the start screen must not push the primary start controls below short mobile viewports; keep it compact.

### Verification Steps

- Start a game, refresh immediately, resume, and submit the next answer/question.
- Start a game, refresh after several messages, verify transcript and question count match.
- Simulate expired storage by editing `expiresAt`; verify no resume prompt appears.
- Simulate quota failure by throwing from storage in dev; verify text-only or disabled save path.
- Export log from active game and finished game; verify mode, question count, result, and transcript are present.

## Phase 4: Multi-State Akinator-Style TARS Avatar

Goal: evolve the avatar from a static speaking indicator into a visible state machine that communicates what TARS is doing, using CSS-only animations and the existing SVG asset.

### Files To Modify

- `src/components/TarsAvatar.tsx`
  - Change props from `{ speaking: boolean }` to:
    - `status: TarsStatus`
    - `compact?: boolean`
    - `label?: string`
  - Render layered CSS elements around `/tars-avatar.svg`:
    - base avatar image
    - scanner ring
    - status glow
    - small processing nodes
    - speech bars
    - guess tension sweep
    - result burst/fade
  - Keep `alt="TARS"` and status text for screen readers.

- `src/styles.css`
  - Add named keyframes:
    - `tars-idle-scan`
    - `tars-thinking-orbit`
    - `tars-speaking-bars`
    - `tars-guess-charge`
    - `tars-celebrate-burst`
    - `tars-commiserate-flicker`
  - Add `@media (prefers-reduced-motion: reduce)` overrides to disable continuous animation and use static states.

- `src/components/GameBoard.tsx`
  - Pass `status` into `TarsAvatar`.
  - Use result-aware statuses when `WinScreen` is not covering the avatar or if the avatar appears inside the result modal later.

- `src/components/StartScreen.tsx`
  - Optionally reuse `TarsAvatar status="idle"` for consistency, or keep the current static hero avatar until a separate visual polish pass.

### Planned Avatar States And Transitions

- `idle`
  - Visual: soft signal ring, slow horizontal scan line over the avatar, stable green status dot.
  - CSS: `tars-idle-scan` on a pseudo-element moving top-to-bottom every 3-4 seconds.
  - Transition in from any completed state with `duration-300`.

- `waiting`
  - Visual: similar to idle, but status dot pulses slowly to indicate user action needed.
  - CSS: low-opacity pulse on ring; no distracting movement.

- `thinking`
  - Visual: signal orbit nodes around the avatar and slight brightness ramp.
  - CSS: rotating conic-gradient ring or positioned dots using `transform: rotate(...)`.
  - Trigger: `isLoading && !pendingFinalGuess`.

- `listening`
  - Visual: cyan/danger microphone-like pulse synced with the existing listening state.
  - CSS: expanding outline ring every 1.2 seconds.
  - Trigger: speech recognition active.

- `speaking`
  - Visual: existing warning voice bars, but integrated under the avatar with staggered scale animations.
  - CSS: `tars-speaking-bars` on five bars with delays.
  - Trigger: `isSpeaking`.

- `guessing`
  - Visual: warning ring charges around avatar, subtle shake or tension sweep, deductions chips can glow warning.
  - CSS: `tars-guess-charge` conic-gradient sweep; avoid large movement.
  - Trigger: `pendingFinalGuess` or final question threshold.

- `celebrating`
  - Visual: signal burst from corners of avatar, short one-shot glow.
  - CSS: `tars-celebrate-burst`, runs once.
  - Trigger: game over state favorable to TARS in `you-think`, or player win in `ai-thinks` depending on desired framing.

- `commiserating`
  - Visual: danger/warning flicker, ring dims briefly.
  - CSS: `tars-commiserate-flicker`, limited duration.
  - Trigger: losing result.

### Edge Cases & Failure Modes

- Too much animation can distract from chat and voice mode. Keep avatar size stable and animations inside its fixed box.
- Motion sensitivity. Honor `prefers-reduced-motion`.
- Status conflicts. Use priority: `result` > `pendingFinalGuess` > `isSpeaking` > `isListening` > `isLoading` > `waiting/idle`.
- SVG image load failure. Keep CSS frame and text label visible.
- Small header. Provide `compact` mode with fewer layers and no text overflow.

### Mobile Considerations

- Avatar box must keep stable dimensions, roughly 56px in compact HUD and no larger than 72px in active game header.
- Avoid absolute overlays that extend into HUD controls on 320px screens.
- Touch controls near avatar must not be blocked by animation layers; set decorative layers `pointer-events: none`.

### Verification Steps

- Force each `TarsStatus` in Storybook-like dev scaffolding or temporary local state and inspect animation.
- Run through both game modes and verify state transitions match actual app behavior.
- Verify `prefers-reduced-motion` disables continuous motion.
- Test mobile header at 320px and landscape: no overlap with HUD controls.
- Confirm no dependency changes in `package.json`.

## Recommended Deployment Order

1. Phase 1 first because it fixes the highest-friction gameplay bug and creates the layout measurement needed by later HUD work.
2. Phase 2 next because it clarifies game state without changing persistence or server behavior.
3. Phase 3 after the HUD because save/resume/export needs a stable place for controls.
4. Phase 4 last because it is visual polish with a larger CSS surface, and it benefits from the status model introduced in Phase 2.

## Cross-Phase Acceptance Criteria

- `npm run check` passes.
- `npm run build` passes.
- No new npm dependencies are added.
- The app remains functional on Cloudflare Pages with no server-side database changes for local persistence.
- At 320px, 390px, 768px, and desktop widths: no text/control overlap, no horizontal page scroll, latest chat exchange visible after submission.
- Voice mode still supports TTS/STT loops and does not get blocked by HUD, save menu, or avatar overlays.

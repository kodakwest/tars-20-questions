# TARS 20 Questions UI/UX Enhancement Plan

This plan covers frontend UI/UX improvements for the React/TypeScript SPA only. It keeps the existing `StartScreen` -> `GameBoard` -> `WinScreen` flow intact and avoids API endpoint or engine redesign.

## Bundle A: Core Interaction

### Goal
Make the active game easier to operate on mobile and keyboard, with visible answer controls, clearer status, and safer voice interruption.

### Files Changed
- `src/components/GameBoard.tsx` — keep the you-think answer bar visible, wire answer button behavior, add keyboard shortcut ownership, and apply mobile-safe footer spacing.
- `src/components/QuestionCounter.tsx` — change the compact counter to show `Question 7 / 20` instead of only remaining questions.
- `src/components/TarsAvatar.tsx` — expose clearer status wording and support future status chip states without changing layout ownership.
- `src/components/StartScreen.tsx` — change the default voice experience copy and make the voice preference selector more prominent.
- `src/components/QuestionInput.tsx` — surface STT unclear errors with specific wording.
- `src/hooks/useGame.ts` — add a UI-level speech/audio cancel action, default voice mode to Minimal, and map common recoverable errors to specific user-facing messages.
- `src/App.tsx` — keep page-level overflow compatible with sticky bottom controls and mobile safe areas.
- `src/styles.css` — add global overscroll and safe-area support.

### Order
1. Update `QuestionCounter` and the existing HUD in `GameBoard` so the current count reads as `Question N / 20` and remains visible while a game is active.
2. Refine the you-think footer in `GameBoard` so `Yes`, `Kind Of`, and `No` remain sticky, use large touch targets, stack vertically on narrow screens, and leave safe-area padding at the bottom.
3. Add `Y`, `K`, and `N` keyboard handling in `GameBoard` for you-think mode, scoped so it does not fire while typing in inputs.
4. Add a `cancelSpeech`/voice interruption action in `useGame` and call it before answer submission, final guess confirmation, voice preview, and manual replay.
5. Change the startup voice default to Minimal in `useGame` and make the `StartScreen` voice preference selector visually prominent enough to be noticed before starting.
6. Replace generic STT/TTS/game errors in `QuestionInput` and `useGame` with specific messages for unclear speech, failed speech output, contradictions, and missing entities.
7. Add mobile refinements in `App`/`styles.css`: overscroll prevention, safe-area inset variables, and bottom padding that prevents the answer bar from covering content.

### Verification
- Check you-think mode on mobile width: answer buttons are always visible, stacked vertically, at least 44px tall, and not clipped by the device safe area.
- Check desktop width: answer buttons are horizontal and keyboard shortcuts `Y`, `K`, and `N` submit the matching answer.
- While TARS is speaking, tap an answer and verify speech stops immediately before the next request/loading state.
- Trigger or simulate STT denied/unclear and TTS failed cases and confirm the message is specific rather than `Something went wrong`.
- Confirm ai-thinks text input still ignores `Y`, `K`, and `N` as shortcuts while the user is typing.

### Dependencies
- None.

### Enhancements

#### Sticky Answer Controls
- What it is: Keep `Yes`, `Kind Of`, and `No` visible during you-think mode in a sticky bottom bar with mobile-sized touch targets. The bar stacks vertically on mobile and stays horizontal on desktop.
- Files to modify: `src/components/GameBoard.tsx`, `src/styles.css`.
- Estimated effort: Small.
- Dependencies: None.
- Priority: P0.

#### Answer Buttons Interrupt TTS
- What it is: Any answer tap or final-guess response cancels active speech before submitting, preventing stale TARS audio from overlapping the next state.
- Files to modify: `src/hooks/useGame.ts`, `src/components/GameBoard.tsx`, `src/components/TarsResponse.tsx`, `src/components/StartScreen.tsx`.
- Estimated effort: Small.
- Dependencies: None.
- Priority: P0.

#### Keyboard Shortcuts
- What it is: Add `Y`, `K`, and `N` shortcuts for you-think answers, with safeguards so shortcuts do not trigger from form fields.
- Files to modify: `src/components/GameBoard.tsx`.
- Estimated effort: Small.
- Dependencies: Sticky answer controls first, so the shortcut behavior maps to visible controls.
- Priority: P0.

#### Always-Visible Question Counter
- What it is: Replace remaining-only display with a persistent `Question N / 20` counter in the header/HUD so players understand progress at a glance.
- Files to modify: `src/components/QuestionCounter.tsx`, `src/components/GameBoard.tsx`.
- Estimated effort: Small.
- Dependencies: None.
- Priority: P0.

#### Voice Defaults And Basic Status
- What it is: Make Minimal voice the default instead of Full, and show concise chips for muted, speaking, listening, and thinking states where those states already exist.
- Files to modify: `src/hooks/useGame.ts`, `src/components/TarsAvatar.tsx`, `src/components/GameBoard.tsx`, `src/components/QuestionInput.tsx`, `src/components/StartScreen.tsx`.
- Estimated effort: Medium.
- Dependencies: None.
- Priority: P0.

#### Specific Error States
- What it is: Replace vague failures with actionable copy for STT unclear, TTS failed, contradiction, and missing entity cases. Use recovery-oriented language such as `I hit a contradiction. Let me recover.`
- Files to modify: `src/hooks/useGame.ts`, `src/components/QuestionInput.tsx`, `src/components/GameBoard.tsx`.
- Estimated effort: Small.
- Dependencies: None for frontend message mapping; richer categorization depends on the existing error surface exposing enough detail.
- Priority: P0.

#### Mobile Refinements
- What it is: Prevent bottom control overlap, handle notched-phone safe areas, and reduce accidental page bounce during gameplay.
- Files to modify: `src/App.tsx`, `src/components/GameBoard.tsx`, `src/styles.css`.
- Estimated effort: Small.
- Dependencies: Sticky answer controls first.
- Priority: P0.

## Bundle B: Game Awareness

### Goal
Help players understand what TARS is doing by exposing progress, narrowing state, answer history, and correction affordances.

### Files Changed
- `src/components/GameBoard.tsx` — place the narrowing band, compact answer history entry point, and debug drawer trigger state.
- `src/components/QuestionLog.tsx` — render compact prior Q&A in a scannable format for you-think mode.
- `src/components/QuestionCounter.tsx` — accept current/maximum question values and support the HUD copy from Bundle A.
- `src/components/TarsAvatar.tsx` — support the hidden five-tap debug toggle.
- `src/hooks/useGame.ts` — expose UI metadata needed by history, correction, status chips, and frontend-only debug display.
- `src/types.ts` — add frontend-facing display metadata such as `displayText`, `spokenText`, answer history shape, and optional candidate/count fields.

### Order
1. Add frontend display metadata types in `src/types.ts` and map existing log entries in `useGame` without changing current rendering.
2. Split TARS message handling into display text and spoken text in `useGame`, then pass only display text to chat components and only spoken text to speech output.
3. Add narrowing state bands in `GameBoard`, derived from candidate count ratio when available and otherwise hidden or conservatively labeled.
4. Refactor `QuestionLog` rendering for you-think mode to include a compact previous Q&A list separate from the chat-style transcript.
5. Add the per-question `Change answer` affordance in the compact history and route it through a correction action exposed by `useGame`.
6. Add the hidden five-tap avatar toggle in `TarsAvatar`/`GameBoard` and render a dev-only `Why this question?` drawer when enabled.

### Verification
- Check that TARS speaks only natural responses and does not read labels, button text, counters, or status chrome.
- In you-think mode, answer at least five questions and verify the compact history remains readable on mobile and desktop.
- Use `Change answer` on an earlier answer and verify the visible history and active game state update together.
- Verify the narrowing band changes only when candidate/count metadata is available and does not show misleading certainty otherwise.
- Tap the TARS avatar five times and confirm the debug drawer opens; reload or restart and confirm it is hidden by default.

### Dependencies
- Bundle A first.
- Correction UI depends on a correction-capable frontend game action; the UI should not locally invent scoring or candidate recalculation.
- Confidence/debug displays depend on candidate count or split metadata being available to the frontend.

### Enhancements

#### Narrowing State Bands
- What it is: Show a small state band that moves from `Still searching` to `Narrowing it down`, `I think I'm close`, and `I have a guess` based on candidate count ratio.
- Files to modify: `src/components/GameBoard.tsx`, `src/hooks/useGame.ts`, `src/types.ts`.
- Estimated effort: Medium.
- Dependencies: Candidate count ratio must be available to the frontend.
- Priority: P1.

#### Confidence Bands From Candidate Ratio
- What it is: Convert available candidate ratio into coarse confidence bands rather than exposing raw internal scoring to normal users.
- Files to modify: `src/hooks/useGame.ts`, `src/components/GameBoard.tsx`, `src/types.ts`.
- Estimated effort: Medium.
- Dependencies: Same candidate count metadata as narrowing state bands.
- Priority: P1.

#### Separate Display Text From Spoken Text
- What it is: Store and pass separate `displayText` and `spokenText` values so TARS does not speak UI chrome, labels, progress, or debug annotations.
- Files to modify: `src/types.ts`, `src/hooks/useGame.ts`, `src/components/QuestionLog.tsx`, `src/components/TarsResponse.tsx`, `src/components/WinScreen.tsx`.
- Estimated effort: Medium.
- Dependencies: None.
- Priority: P1.

#### Compact Answer History
- What it is: Add a compact list of previous you-think questions and answers so players can scan what they already told TARS without reading every chat bubble.
- Files to modify: `src/components/QuestionLog.tsx`, `src/components/GameBoard.tsx`, `src/types.ts`.
- Estimated effort: Medium.
- Dependencies: Display metadata from this bundle makes pairing questions and answers safer.
- Priority: P1.

#### Change Answer Affordance
- What it is: Add a `Change answer` action beside each previous answer and refresh the visible game state after the correction is accepted.
- Files to modify: `src/components/QuestionLog.tsx`, `src/components/GameBoard.tsx`, `src/hooks/useGame.ts`, `src/types.ts`.
- Estimated effort: Large.
- Dependencies: Correction-capable frontend game action and recalculated game state from the existing game contract.
- Priority: P1.

#### Debug Mode Drawer
- What it is: A hidden tester-only drawer opens after tapping the TARS avatar five times and explains `Why this question?` with entropy split, top candidates, and narrowing state.
- Files to modify: `src/components/TarsAvatar.tsx`, `src/components/GameBoard.tsx`, `src/hooks/useGame.ts`, `src/types.ts`.
- Estimated effort: Medium.
- Dependencies: Debug metadata must be available to the frontend; keep the drawer hidden from the normal flow.
- Priority: P1.

## Bundle C: Polish & Data

### Goal
Improve onboarding, end-of-game recovery, and learning capture without changing the core game loop.

### Files Changed
- `src/components/StartScreen.tsx` — clarify game instructions, valid answer choices, mode copy, and voice preference hierarchy.
- `src/components/WinScreen.tsx` — add the wrong-guess `Teach Me` form and optional helpful-answer picker UI.
- `src/components/GameBoard.tsx` — pass result context into the end screen and keep final-guess reveal UX aligned with the teach flow.
- `src/hooks/useGame.ts` — retain the actual answer and final Q&A context needed by the end screen UI.
- `src/types.ts` — add frontend-only shape for teach-me form state and selected helpful answer.
- `src/styles.css` — final polish for focus states, reduced motion compatibility, and mobile spacing.

### Order
1. Rewrite `StartScreen` instructions so you-think mode tells the player to think of an object, character, or place and shows valid answers upfront: `Yes`, `No`, and `Kind Of`.
2. Rework the `StartScreen` voice selector placement so voice preference is clearly visible before start, while keeping Minimal as the default.
3. Extend `WinScreen` to show a `Teach Me` section after a wrong guess, with a text input for the intended answer.
4. Add the optional `Which answer would have helped?` picker in `WinScreen`, using existing log/history data for choices.
5. Preserve the submitted teach-me data in frontend state or emit it through the existing dataset pipeline hook point when available, without changing endpoints in this UI plan.
6. Run final responsive polish on start, game, and end states, including focus states and reduced-motion behavior.

### Verification
- On the opening screen, confirm a first-time player can tell what to think of, what answers are valid, and where voice preference is set.
- Complete you-think mode with a wrong TARS guess and verify the `Teach Me` input appears only in the wrong-guess outcome.
- Enter an intended answer and choose a helpful prior answer; confirm validation, disabled states, and success/failure messaging are clear.
- Check start, game, and win screens at mobile and desktop widths for overlap, clipped text, and safe-area spacing.
- Confirm no normal user can see debug details unless the hidden avatar toggle is activated.

### Dependencies
- Bundle A first.
- Bundle B recommended first for richer Q&A pairing in the helpful-answer picker.
- Dataset ingestion depends on the existing dataset pipeline integration point; this plan does not define endpoint or scoring changes.

### Enhancements

#### Opening Screen Improvements
- What it is: Make onboarding more literal: `Think of an object, character, or place`, explain `Yes / No / Kind Of`, and make the voice selector easier to notice.
- Files to modify: `src/components/StartScreen.tsx`.
- Estimated effort: Small.
- Dependencies: None.
- Priority: P2.

#### Voice Preference Prominence
- What it is: Move voice selection higher in the visual hierarchy and make Minimal the clear default, with preview remaining optional.
- Files to modify: `src/components/StartScreen.tsx`, `src/hooks/useGame.ts`.
- Estimated effort: Small.
- Dependencies: Bundle A voice default change.
- Priority: P2.

#### End-of-Game Teach Me
- What it is: After a wrong TARS guess, show a text input asking what the player was thinking of so the app can capture learning data.
- Files to modify: `src/components/WinScreen.tsx`, `src/components/GameBoard.tsx`, `src/hooks/useGame.ts`, `src/types.ts`.
- Estimated effort: Medium.
- Dependencies: Existing dataset pipeline hook point for eventual persistence.
- Priority: P2.

#### Helpful Answer Picker
- What it is: Add an optional picker asking `Which answer would have helped?` using prior Q&A entries from the game log/history.
- Files to modify: `src/components/WinScreen.tsx`, `src/components/QuestionLog.tsx`, `src/types.ts`.
- Estimated effort: Medium.
- Dependencies: Bundle B compact answer history recommended.
- Priority: P2.

#### Final Responsive Polish
- What it is: Sweep the main screens for clipped text, inconsistent focus states, motion sensitivity, and mobile viewport issues after the interaction changes land.
- Files to modify: `src/App.tsx`, `src/styles.css`, `src/components/StartScreen.tsx`, `src/components/GameBoard.tsx`, `src/components/WinScreen.tsx`.
- Estimated effort: Medium.
- Dependencies: Bundles A and B first.
- Priority: P2.

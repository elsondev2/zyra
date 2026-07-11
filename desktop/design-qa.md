# Zyra chat rail design QA

## Scope

- Surface: assistant conversation rail only
- Reference: DevScope harness conversation
- Preserved outside scope: Zyra navigation, sidebar, header, and composer controls

## Evidence

- Primary reference: local DevScope conversation capture (not tracked)
- Additional references: four local progression captures (not tracked)
- Final implementation capture: local QA screenshot (not tracked)
- Viewport/state: Zyra desktop window at approximately 1200 x 800, persisted harness turn, completed tool groups, checkpoint visible, composer docked

## Comparison passes

### Pass 1 - rail anatomy

- User bubble, narration, grouped tool rows, follow-up narration, final Markdown, timestamps, and docked composer follow the reference rhythm.
- Public narration and tool batches remain separate chronological entries.
- Final Markdown renders headings, lists, code, and tables without rewriting source text.

### Pass 2 - density and material

- Conversation uses the shared 768 px content axis, compact 13 px prose, restrained borders, dark neutral tool surfaces, monospace commands, and Vesper-style mint accents.
- Tool groups no longer collapse the entire turn into a summary card.
- Internal thought is a faded, collapsed row rather than a competing message block.

### Pass 3 - managed command checkpoints

- Status polling renders as a left-aligned faded amber `Checked on command` divider.
- Stop renders as a left-aligned faded red `Stopped command` divider.
- `command` is keyboard-focusable and scrolls to the originating command, including when older timeline entries must be revealed first.

### Pass 4 - behavior and persistence

- Untouched startup reconnects without the manual `Disconnected` step.
- Tool lifecycle arguments, duration, command relationship, and cross-type causal ordering persist.
- A live prompt produced narration -> file read -> final Markdown in the expected rail order.

## Intentional differences

- Zyra keeps its own sidebar, project navigation, top bar, model controls, and supervised-mode composer controls.
- The checkpoint and collapsible thought treatments are Zyra-specific additions requested after the DevScope reference pass.

final result: passed

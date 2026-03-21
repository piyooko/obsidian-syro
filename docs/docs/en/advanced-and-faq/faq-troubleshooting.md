# FAQ & Troubleshooting

## Module Overview
When you work with a complex system built on local text parsing, occasional local anomalies are inevitable. This page summarizes the issues users run into most often and provides a practical self-check checklist for each one.

If you are wondering why cards are not showing up or why data is not updating, use the guides below to narrow the issue down quickly.

## Symptom 1: I wrote cards or cloze deletions, but they do not appear in the deck tree
In most cases, the parser simply failed to match your Markdown input.
**Checklist:**
1. **Check the separator settings**: go to plugin settings -> `Flashcards` and confirm that the separators you typed (for example `::`) exactly match the configured rules. Pay attention to full-width versus half-width punctuation.
2. **Check the source toggles**: if you used highlights such as `==text==` as a cloze source, make sure the corresponding setting for using highlights as a cloze source is enabled.
3. **Use isolation for debugging**: do not hunt for bugs inside a huge, highly formatted note. Create a brand-new empty note and write a single standard test card like `A::B`. If it parses correctly there, then some more complex formatting in the original note - such as missing blank lines or badly nested code blocks - is likely blocking the parser.

## Symptom 2: Queue numbers look wrong, or review reports "note not found"
This usually happens after large-scale file moves or folder renames, when cached paths no longer match reality.
**Checklist:**
1. **Wait a few seconds**: for small changes, automatic incremental sync often repairs the issue on its own.
2. **Trigger a full rebuild**: open the Command Palette and run `Syro: Rebuild Cache (Full Parse)`. This resolves the vast majority of state-versus-text mismatches.
3. **Clean ghost data**: if a note has been physically deleted but its cards still keep appearing in review, run `Syro: Clean Ghost Cards` to remove invalid references.

## Symptom 3: The underlying review algorithm seems to do nothing
**Checklist:**
1. **Confirm which algorithm is active**: make sure FSRS is actually enabled in settings. Some older compatibility parameters do nothing unless the corresponding legacy mode is active.
2. **Check daily caps**: if you feel certain cards should be showing up but never do, open the deck tree, click the gear icon on the relevant deck, and inspect `Reviews/Day`. If the cap is too low, cards may simply be blocked from surfacing today.

## Advanced help and feedback
If none of the above resolves the issue:
- In the plugin settings under the `UI` tab, enable **Verbose Logging**, then press `Ctrl/Cmd + Shift + I` to open the developer tools. The console will print detailed parsing errors that can help you pinpoint the exact line that caused the failure.
- You are welcome to bring a minimal Markdown snippet that reproduces the issue - after making sure it does not expose private information - together with the relevant logs to the community or the code repository and file an issue.

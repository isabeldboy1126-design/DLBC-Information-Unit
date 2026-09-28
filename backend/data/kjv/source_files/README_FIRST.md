# DLBC KJV Verification Pack

## Purpose

This pack is for the AI-assisted transcript-verification layer of the DLBC Information Unit app.

The app should keep the **entire King James Version locally** and use it as a lookup/index. It must **not** send the entire Bible to Gemini on each request.

Instead, the verification engine should:

1. Detect likely Bible references and biblical names in the Azure transcript.
2. Look them up locally in the KJV database.
3. Retrieve only the relevant verse(s), nearby verses, names, and vocabulary.
4. Send that compact context together with the uncertain transcript segment/audio to the AI verifier.
5. Preserve what the preacher actually said. KJV wording is evidence, not permission to rewrite a paraphrase into an exact quotation.

## Important: obtaining the complete KJV corpus

The package includes `build_full_kjv_context.py`. Run it once on a machine with internet access:

```bash
python build_full_kjv_context.py
```

It downloads the complete 66-book 1769 KJV from the configured public machine-readable source and creates:

- `kjv_full.json`
- `kjv_context.sqlite`

The script verifies that there are 66 books and 31,102 verses before accepting the corpus.

The source can be changed in the script if your team chooses another approved KJV corpus.

## Why local lookup instead of putting the whole Bible into Gemini

The full KJV is useful as an application database, but sending all of it in every AI request wastes context/tokens and makes verification less focused.

For a detected reference such as `2 Corinthians 12:9`, retrieve:

- 2 Corinthians 12:8
- 2 Corinthians 12:9
- 2 Corinthians 12:10
- relevant biblical names
- nearby transcript context
- the uncertain audio segment

That is enough for the verifier to cross-check the reference and wording.

## Speech vocabulary

The KJV speech lexicon is intentionally about words a preacher may actually say, for example:

- thee
- thou
- thy
- thine
- ye
- hath
- doth
- saith
- shalt
- wilt
- art
- cometh
- goeth
- believeth
- brethren
- begat
- wherefore
- unto
- iniquity
- righteousness
- sanctification

Book abbreviations such as `Deut` are useful for typed-reference parsing but should **not** be treated as normal spoken words when the preacher would say `Deuteronomy`.

## AI verification principles

- Raw Azure transcript remains immutable.
- AI verification results are stored separately.
- Auto-resolve only low-risk items with strong evidence.
- Keep human review for high-consequence ambiguity, especially:
  - Bible-reference uncertainty
  - quotation/reference mismatch that could alter meaning
  - negation
  - doctrinally consequential wording
  - important names
  - dates/numbers
  - model disagreement
  - poor audio
  - manual flags
- If AI is unavailable, continue immediately with normal human verification.

## Suggested flow

```text
Stop Recording
  -> Compiling
      -> save master audio
      -> finalize Azure transcript
      -> create verification candidates
  -> AI Verifying
      -> audio cross-check
      -> KJV lookup
      -> biblical-name / KJV vocabulary context
      -> DLBC vocabulary context
  -> Human Verification
      -> only unresolved/high-risk items
  -> Verified Transcript
```

For existing sessions already in Verification, expose a `Use AI to Verify` action that runs the same engine against the remaining pending items.

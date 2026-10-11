<a href="assets/icons/icon.png"><img src="assets/icons/icon.png" alt="Bitácora Dev icon" width="140" height="140" /></a>

# Dev Log - Bitácora Dev

**English** · [Español](README_es.md)

![HTML](https://img.shields.io/badge/HTML-5-E34F26?logo=html5&logoColor=white) ![Local first](https://img.shields.io/badge/local--first-yes-2f8c5b) ![ES%20%2F%20EN](https://img.shields.io/badge/ES%20%2F%20EN-bilingual-49a86e)

A logbook for projects that change over time. Most tools save a project's current state; Bitácora Dev also saves the path that led there. It organizes work into **projects, versions, instructions and notes, decisions, pending tasks and AI conversations**, so the final result isn't the only thing that survives — the project's history does too.

The application runs directly in the browser and is designed to work locally. AI is optional: history, editors, search, reverts and project management continue to work without a connected model.

<details>
<summary><strong>Contents</strong></summary>

- [What it is](#what-it-is)
- [Advantages](#advantages)
- [Compatibility](#compatibility)
- [Installation](#installation)
- [Works well with Scriptya](#works-well-with-scriptya)
- [How it works](#how-it-works)
- [Notes, reverts and pending work](#notes-reverts-and-pending-work)
- [AI assistant](#ai-assistant)
- [Configuration](#configuration)
- [Import and export](#import-and-export)
- [Commands](#commands)
- [Privacy](#privacy)
- [License](#license)

</details>

## What it is

Each project has its own history: every meaningful piece of progress is recorded as a version, and each version can explain what was done, why it was done, what happened afterwards and what remained pending. In a software project, for example, a version doesn't have to be just `v1.2` — it can be the note that explains why a library was dropped, what alternative was tried and what's left to resolve. The goal isn't to create lots of versions just because you can; it's to make sure the ones that do exist make sense.

Although the name is aimed at software, the structure also fits an essay, research, academic work, documentation, design or any project where changes and decisions matter.

![Bitácora Dev desktop view](assets/screenshots/en-desktop.png)

🎬 [Watch the demo](assets/demo/demo.mp4) 

https://github.com/user-attachments/assets/84a9c954-9cde-4381-9c12-331aa0f140e0

When a project grows, remembering its current state is easy; the hard part is remembering **why it got there**. Bitácora Dev doesn't only store versions — it stores the project's history.

## Advantages

- **Per-project history.** Each project brings together its versions, notes, pending work and conversation.
- **Version tree.** `1.0`, `2.0`, `3.0` are visually separated from `1.1`, `1.2`, `2.1`, etc., making project stages readable at a glance. Any version can be duplicated to start the next note from the same text.
- **Search.** Project search also finds version content; history search locates text inside instructions and notes.
- **Reverts without deleting history.** A version can state that it reverts another, and both remain part of the history.
- **Persistent pending work.** Add a task by hand, extract them in bulk from the history with AI, or ask the assistant to add, confirm or remove one by name; however it arrives, each task can remain open, be marked complete or be removed.
- **Contextual AI.** The assistant can query project evolution, summarize it, detect contradictions, extract and manage pending work and answer questions about decisions and changes — it works from the recorded history and doesn't generate new code.
- **Semantic change analysis.** With AI active, versions can be compared and their meaning explained. Without AI, the application doesn't pretend a shallow diff is semantic analysis.
- **Text rewriting.** Select part of a note and ask for a professional, reflective, technical, concise or suggestion-style rewrite, or an English translation.
- **Import and export.** Import JSON, TXT, Markdown, DOCX and PDF; export versions or whole projects as TXT, DOCX or PDF, or export the full database as a JSON backup you can restore later.
- **Local or cloud providers.** Use local services such as LM Studio or Ollama, or configure compatible cloud providers from the browser.
- **Local-first.** The core application doesn't depend on its own backend to keep projects.

## Compatibility

- **Environment:** modern browser with JavaScript enabled.
- **Local core:** projects, versions, notes, search, pending work, reverts and storage are managed in the browser.
- **AI:** local and cloud providers configured from **Settings**.
- **Documents:** DOCX and PDF features load their libraries when needed; those operations may require access to the configured CDNs.
- **Cloud providers:** requests leave the browser directly and may depend on CORS and the provider's policies.

## Installation

There's no traditional build or installation step. Open `script/bitacora-dev.html` in a modern browser.

To get started:

1. Click **+ Project**.
2. Add a name, a description and, if you want, an icon.
3. Create the first version and write in **INSTRUCTIONS & NOTES** what you're doing and why.
4. Create new versions when there's meaningful progress or a decision worth preserving — avoid creating one for every tiny edit.

Want to try it with data already loaded first? `assets/demo/` includes two independent, ready-to-import databases (`bitacora-dev-demo-es.json` and `bitacora-dev-demo-en.json`, each with its own projects, versions, conversations and tasks), built to show off long histories, the version tree, reverts, rewriting and AI analysis. Import them like any other file: **Import** → pick the file.

## Works well with Scriptya

[Scriptya](https://github.com/filonux/Scriptya) is another project by Filonux: a menu that organizes your scripts into folders, runs them with fuzzy search, and can turn any of them —bitacora-dev included— into a standalone app with its own icon, in the applications menu or on the desktop, without having to write a `.desktop` file by hand.

You can point it at this repository's `script/` folder and launch Bitácora Dev from there, or use `scriptya --icons` to install it as a separate app. Scriptya also reads optional metadata at the top of each script (menu name, description, whether it asks for confirmation, whether it needs `sudo`...); `bitacora-dev.html` doesn't include them yet, but it's a natural candidate for a future update.

## How it works

The **sidebar** holds the program identity, project search and creation, import, export, settings and the project list (most recently updated first, each with its icon). The **main area** manages the selected project: the HISTORY block shows the version count, last update date, history search and the button to create a new note — one at the top and one at the end, so a long history never forces a long scroll. The **AI panel**, on the right, is contextual to the open project.

A project is the logbook itself —name, description, icon, history, conversation and pending tasks—, and versions are the entries it accumulates over time. Each version keeps its number, its **INSTRUCTIONS & NOTES**, its dates and, when relevant, a revert. The tree view separates a project's major milestones (`1.0`, `2.0`, `3.0`) from the incremental work inside each one (`1.1`, `1.2`...) at a glance, supports formats like `1`, `1.0`, `1.1` or `v4.1`, and doesn't impose any strict rule about what counts as a root — that choice is still yours:

```text
1.0
    1.1
    1.2
    1.3

2.0
    2.1
    2.2
```

A version can be duplicated at any point: the app copies its instructions and notes into a new entry appended at the end of the history, with the next number suggested automatically from the project's current latest version — for example, while `2.1` is the latest version, duplicating it (or any earlier version) suggests `2.2`.

## Notes, reverts and pending work

**INSTRUCTIONS & NOTES** isn't limited to technical instructions — it can hold what had to be done, what was decided, what was observed, what problem appeared, what solution was adopted, and what remains pending, so you can open a version months later and still understand what was happening.

When a decision is undone, there's no need to erase the history: each version has a **Reverts** field listing every earlier version in the project, so recording a revert takes one click and the relationship stays on record (the AI can use it as context too):

```text
2.1  →  new architecture
2.2  →  reverts 2.1
```

**Pending tasks** keep future work separate from the historical record. Add one directly from the field at the top of the list, or let AI populate them: the "extract pending work" action reads the history and adds each task it finds — duplicates already on the list are skipped automatically — and you can also ask the assistant, directly or with the add / confirm / remove quick actions, to add, complete or remove one specific task by name. However it arrives, each task can remain open, be marked complete or be removed, and AI-sourced ones carry a small tag so you can tell them apart from ones you typed yourself.

## AI assistant

The contextual panel offers quick actions — **summarize the project** (state, objective, latest version and visible risks), **key changes between versions** (compares the three most recent), **detect contradictions** (incompatible instructions, contradictory decisions, possible reversions), **extract pending work**, and **add / confirm / remove a pending item** (each drops a ready-to-finish prompt into the chat box so you just fill in the task) — or you can ask directly, for example "what changed between 2.1 and 2.2?" or "what's still pending?". The assistant distinguishes recorded facts from inference, doesn't invent information that isn't in the history, and if you ask it for code that isn't already recorded in a version, it explains that its job is to query and organize the project's history, not generate new code. If the history doesn't fit the provider's context window, it trims the oldest versions and says so.

**Analyze changes** compares two versions and, with an active AI provider, returns a semantic explanation — not just a text diff — with a summary, the relevant changes, impact or risks, and a conclusion, always starting with a clear state: **CHANGES DETECTED**, **NO CHANGES**, **NO RELATION** or **INCONCLUSIVE RESULT**. The analysis can be kept as a comment on the version, regenerated (**reanalyze**), or stepped through with **Previous** / **Latest** controls if you do that more than once; editing a version's notes afterward automatically clears the stored analysis, so a saved comment never quietly goes stale.

**Rewriting** lets you select part of a note and ask for a style — professional, reflective, technical, concise, suggestion, or an English translation — then copy, apply, discard the result, or refine it with a follow-up instruction before applying.

Without a connected provider, this section is disabled and says so explicitly; the rest of the application keeps working the same.

## Configuration

**Language.** The interface works in Spanish and English and affects controls, messages, quick actions and the AI tools — including the app's own name, which appears as "Dev Log" in English. The assistant always answers in whichever interface language you've selected, regardless of the language used in the notes.

**AI providers.** From **Settings** you can choose between LM Studio, Ollama, OpenAI, Anthropic, OpenRouter, xAI/Grok, Groq, Google Gemini or DeepSeek, configure the base URL, model and key, detect models and test the connection. Calling Anthropic's API directly from the browser requires enabling its CORS-compatible direct-browser-access mode; LM Studio and Ollama typically just need CORS enabled on the local server. Keys are stored in the browser profile.

**Saving.** Bitácora Dev uses `localStorage` with autosave — on by default, with a configurable interval (250 ms, 500 ms, 1 s or 2 s), or you can switch it off entirely — plus manual saving. If the browser blocks local storage, it warns that changes will only last the session — export as JSON in that case.

**API configuration.** AI provider configuration is exported and imported separately from the database, and can be password-protected (AES-256 encryption, minimum 6 characters) to keep both backups independent.

## Import and export

**Import:** JSON (restores the complete database), TXT/Markdown (creates a project from text), DOCX or PDF (extract the text).

**Export:** a project or a single version as TXT, DOCX or PDF. **Export all** offers those same three formats combining every project into one file, or a full JSON backup of the database — the only format Import can restore.

## Commands

The **Commands** palette (`Ctrl + K` / `Cmd + K`) gives quick access to creating a project, creating a version, opening the assistant, opening Settings or exporting.

## Privacy

Bitácora Dev is local-first: the main history lives in the browser and doesn't require an application backend. Connecting a cloud AI provider does send requests out of the browser to that provider — review its terms before sending sensitive information. For a fully local workflow, use LM Studio or Ollama.

## License

Bitácora Dev is released under the **GNU General Public License v3.0 (GPLv3)**, with the full text in the [LICENSE](LICENSE) file (also noted in **Settings**).

© 2026 Filonux.

---

Made by **[Filonux](https://github.com/filonux)**.

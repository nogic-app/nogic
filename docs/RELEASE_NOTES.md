# Release Notes

## v1.0.1 Beta - Hotfix & Reliability Update
This release focuses heavily on system reliability, honest hardware adaptation, and error handling. We've removed the "white screen" crashes, added real hardware detection, and introduced in-app diagnostics so you can help us fix bugs faster.

### New Features
- **Usage Dashboard:** A brand new Settings → Usage tab (and a mini sidebar widget) that shows real-time CPU, RAM, and GPU/VRAM usage, plus a speed test for your local models.
- **Smart Model Advisor:** Nogic now detects your actual VRAM and recommends the best models from a curated 32-model catalog. It shows exactly which capabilities (Vision, Tools, Thinking) your selected model supports.
- **In-App Tesseract OCR:** You can now download a portable version of Tesseract directly from Settings → Advanced. This allows Nogic to read scanned PDFs (without a text layer) seamlessly, supporting both French and Arabic OCR.
- **Auto-Update Checker:** Nogic now checks GitHub for new releases. If an update is available, a button appears in Settings → About.
- **Diagnostics Reporter:** The "Report a problem" button now silently gathers your hardware specs, active model, and recent error logs, copies them to your clipboard, and opens a pre-filled GitHub issue.

### Improvements & Fixes
- **No More White Screens:** Added a global Error Boundary and friendly error toasts (e.g., "Ollama isn't running") with a Retry button instead of crashing the app.
- **Instant Chat Switching:** Chats are now cached in memory and the database is indexed, making switching between chats virtually instantaneous.
- **Friendly PDF Reading:** Improved the `/add-law` card to show a "Processing..." state when running OCR on large documents.
- **UI Polish:** Fixed the onboarding splash screen flash, resolved ticker duplication, and improved the Web Sources UI.
- **Security Hardening:** Implemented a strict Content Security Policy (CSP), scoped file access to the temp and app directories only, and ran a dependency audit.

### Known Limitations
- **Presentation & Comparison Skills Deferred:** The PPTX generation and hidden Comparison Matrix skills have been deferred to a future version. Local LLMs (like Gemma 4) currently struggle to format complex tables and slide layouts perfectly, so we removed them to maintain Nogic's quality standards.
- The bundled law library is intentionally empty; add your own PDFs with `/add-law`.
- Web mode does not attach local law citations or plant cards.
- The 15-question law and plant golden eval sets are still outstanding.
- The Windows installer is unsigned, so SmartScreen may show a warning. Click "More info" → "Run anyway".

### Requirements
- Windows 10 or later.
- Ollama running locally with at least one installed model (e.g., `gemma4:e4b`).
- A vision-capable model is required for image attachments.

### Licence
Nogic is released under the GNU General Public License v3.0. See `LICENSES.md` for details.
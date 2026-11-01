# Nogic : User Guide (v1.0.1)

Nogic is a local-first colleague for landscape architecture. It answers from documents you index yourself and from a verified plant table, and it cites its sources. Nothing leaves your machine unless you turn on Web search.

Nogic runs on your computer through [Ollama](https://ollama.com/download). If Ollama is not running, the Models settings page shows `Ollama offline` and chat answers wait until it is available.

## 1. First launch

The first-run wizard asks for four things:

1. Your name : used in the welcome greeting.
2. A check that Ollama is installed and running.
3. A model to use. Vision, Tools, and Thinking pills show what the selected model can do. Image attachments are disabled for text-only models.
4. A note that the app ships without a law library.

Finish the wizard to go to the workspace. Settings → General can change the theme, language, name, and keyboard behaviour later.

## 2. Asking a question

Type in the composer and press Send (or Enter, depending on your General settings).

- **Fast** is the default : short, direct answers.
- **Think** asks the model to reason before answering. The reasoning appears in a collapsible **Reasoning** panel and stays available after the answer ends.
- **DeepThink** runs four passes — plan, draft, critique, revise and shows the current pass in the streaming ticker.
- **Web** performs a DuckDuckGo search and answers from the top three results. Web results do not carry local law citations or plant cards. If the search finds nothing usable, Nogic says so and answers from local data.

Answers about law cite the exact article and PDF page. Click a citation in the source footer to open that law PDF. Answers about plants only use rows from the verified table; if the table has no match, Nogic replies `Not in the table.`

## 3. `/add-law` = add a law PDF

Nogic ships with an empty law library so that every citation comes from a document you chose. To add one:

1. Type `/add-law` in the composer and send it.
2. In the **Add a law** card, click the dashed box and choose a PDF.
3. Enter the law name exactly as it should be cited, for example `Loi xx.xx`.
4. Click **Save**.

Nogic copies the PDF into its local data folder, extracts the articles, and indexes them for search. Citations to this law then open your copy of the PDF.

A PDF that yields no readable articles is rejected, because Nogic cannot cite what it cannot read. Scanned documents without a text layer need OCR before they can be added. Existing law names are never overwritten.

## 4. `/site "location"` = site lookup

Type `/site "city, park, garden, known site and etc..."` (quotes are optional) to look up a site:

1. Nogic geocodes the place through OpenStreetMap Nominatim.
2. It collects short web notes about plants, water, and site history.
3. It returns a map card with the location, coordinates, and notes.

If there is no internet connection or no match, Nogic says so in plain text instead of guessing. The site card is saved with the chat, so it returns when you reopen the conversation.

## 5. The `+` menu skills

The `+` button in the composer opens the **Skills** menu.

### Add File
Attach a PDF, Word document, Excel workbook, or image to your next message. The file is copied into Nogic's local memory folder and its text is read locally. Large documents are processed in parts; the ticker shows `Reading document part X of Y...`. Images are sent to a vision-capable model as a reduced-size copy.

### Generate PDF / Generate Word / Generate Excel
Choosing one of these attaches a report skill to your message. Describe the document you want, then send it. Nogic drafts the content with the local model and writes the file to:
`%USERPROFILE%\Documents\Nogic Exports`

When the file is ready, an **Open Generated File** button appears in the answer. The button still works after you switch chats or restart the app.

- **Generate PDF** = a formatted PDF report.
- **Generate Word** = an editable `.docx` document.
- **Generate Excel (Devis)** = a spreadsheet suitable for a quote or estimate.

Document generation uses the model selected in Settings → Models. If the model runs out of memory, Nogic shows a short message instead of leaving the answer blank.

## 6. Other commands

| Command | What it does |
| --- | --- |
| `/help` | Prints the command summary instantly, without calling the model. |
| `/plant "name"` | Looks up a species in the verified table without calling the model. |
| `/add-plant` | Opens a form to add a species with its source URL and verbatim quote. |
| `/add-law` | Opens the law upload card described above. |
| `/site "location"` | Looks up a site and renders a map card. |

## 7. Settings & System Updates

In **Settings → Models**, Nogic detects your actual hardware (RAM and VRAM) and recommends models that fit. You can pull new models directly from this screen.

In **Settings → About**, you will find:
- **Check for updates:** Nogic checks GitHub for the latest release. If an update is available, you can click to download it directly.
- **Report a problem:** Clicking this copies your recent diagnostic logs and hardware specs to your clipboard, then opens a pre-filled GitHub issue page so you can paste the details and tell us what went wrong. (**NOTE** : clean up the logs of any personal information's before sending it, for your own safety.)

## 8. Where your data lives

| Data | Location |
| --- | --- |
| Database (chats, projects, settings) | `%APPDATA%\com.nogic.app\nogic.db` |
| Uploaded and attached files | `%APPDATA%\com.nogic.app\memory\files` |
| Indexed law PDFs | `%APPDATA%\com.nogic.app\data\laws` |
| Generated documents | `%USERPROFILE%\Documents\Nogic Exports` |

Settings → Memory and Settings → Advanced can open these folders. Settings → Advanced also contains **Factory Reset**, which removes the database and memory folder and restores the bundled seed data.

## 9. Privacy

- Chat, retrieval, and document extraction run locally.
- No telemetry is collected.
- The only network calls are: Ollama on your machine, `/site` geocoding via OpenStreetMap, Web mode's DuckDuckGo search, link clicks you make yourself, and checking GitHub for app updates.